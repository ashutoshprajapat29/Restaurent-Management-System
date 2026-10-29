import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { SubscriptionService } from '../src/modules/subscription/subscription.service';
import { TablesService } from '../src/modules/tables/tables.service';
import { UsersService } from '../src/modules/users/users.service';

describe('Milestone 1 Challenger: PostgreSQL Schema & Multi-Tenant Quota Isolation (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let subscriptionService: SubscriptionService;
  let tablesService: TablesService;
  let usersService: UsersService;

  const testRunId = randomUUID().slice(0, 8);
  const tenantAId = `test-tenant-alpha-${testRunId}`;
  const tenantBId = `test-tenant-beta-${testRunId}`;

  let branchAId: string;
  let branchBId: string;
  let floorAId: string;
  let floorBId: string;
  let roleAId: string;
  let roleBId: string;
  let adminAId: string;
  let adminBId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: () =>
          Promise.resolve({
            totalHits: 1,
            timeToExpire: 60,
            isBlocked: false,
            timeToBlockExpire: 0,
          }),
      })
      .overrideProvider(RealtimeGateway)
      .useValue({
        emitToBranch: jest.fn(),
        emitToUsers: jest.fn(),
        emitToUser: jest.fn(),
      })
      .compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    subscriptionService = moduleRef.get<SubscriptionService>(SubscriptionService);
    tablesService = moduleRef.get<TablesService>(TablesService);
    usersService = moduleRef.get<UsersService>(UsersService);
  }, 60000);

  afterAll(async () => {
    // Teardown test tenants
    try {
      await prisma.table.deleteMany({
        where: {
          floor: {
            branch: {
              restaurantId: { in: [tenantAId, tenantBId] },
            },
          },
        },
      });
      await prisma.floor.deleteMany({
        where: {
          branch: {
            restaurantId: { in: [tenantAId, tenantBId] },
          },
        },
      });
      await prisma.userBranch.deleteMany({
        where: {
          user: {
            restaurantId: { in: [tenantAId, tenantBId] },
          },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityId: { in: [tenantAId, tenantBId] } },
            { user: { restaurantId: { in: [tenantAId, tenantBId] } } },
          ],
        },
      });
      await prisma.user.deleteMany({
        where: {
          restaurantId: { in: [tenantAId, tenantBId] },
        },
      });
      await prisma.role.deleteMany({
        where: {
          restaurantId: { in: [tenantAId, tenantBId] },
        },
      });
      await prisma.branch.deleteMany({
        where: {
          restaurantId: { in: [tenantAId, tenantBId] },
        },
      });
      await prisma.restaurant.deleteMany({
        where: {
          id: { in: [tenantAId, tenantBId] },
        },
      });
    } catch (err) {
      console.warn('Cleanup warning:', err);
    }

    if (moduleRef) {
      await moduleRef.close();
    }
  }, 60000);

  describe('Part 1: PostgreSQL Schema Synchronization & Migration Integrity', () => {
    it('verifies that migration 20261028152228 is recorded as completed in _prisma_migrations', async () => {
      const migrations = await prisma.$queryRaw<
        Array<{
          migration_name: string;
          finished_at: Date | null;
          applied_steps_count: number;
          rolled_back_at: Date | null;
        }>
      >`
        SELECT migration_name, finished_at, applied_steps_count, rolled_back_at
        FROM _prisma_migrations
        WHERE migration_name LIKE '%add_subscription_tiering_and_quotas%'
      `;

      expect(migrations.length).toBe(1);
      const m = migrations[0];
      expect(m.migration_name).toContain('20261028152228_add_subscription_tiering_and_quotas');
      expect(m.finished_at).not.toBeNull();
      expect(m.applied_steps_count).toBeGreaterThanOrEqual(1);
      expect(m.rolled_back_at).toBeNull();
    });

    it('verifies that PostgreSQL enum types SubscriptionPlan and SubscriptionStatus exist with exact members', async () => {
      const enumValues = await prisma.$queryRaw<
        Array<{ enumtypid: number; typname: string; enumlabel: string }>
      >`
        SELECT t.typname, e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        WHERE t.typname IN ('SubscriptionPlan', 'SubscriptionStatus')
        ORDER BY t.typname, e.enumsortorder;
      `;

      const plans = enumValues
        .filter((r) => r.typname === 'SubscriptionPlan')
        .map((r) => r.enumlabel);
      const statuses = enumValues
        .filter((r) => r.typname === 'SubscriptionStatus')
        .map((r) => r.enumlabel);

      expect(plans).toEqual(['FREE', 'STARTER', 'PRO', 'ENTERPRISE']);
      expect(statuses).toEqual(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED']);
    });

    it('verifies all 8 subscription columns on restaurants table with types, nullability, and defaults', async () => {
      const columns = await prisma.$queryRaw<
        Array<{
          column_name: string;
          data_type: string;
          udt_name: string;
          is_nullable: string;
          column_default: string | null;
        }>
      >`
        SELECT column_name, data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'restaurants'
          AND column_name IN (
            'subscriptionPlan', 'subscriptionStatus', 'maxTables',
            'maxStaff', 'maxBranches', 'trialEndsAt', 'kdsEnabled', 'customBrandingEnabled'
          )
        ORDER BY column_name;
      `;

      expect(columns.length).toBe(8);
      const colMap = new Map(columns.map((c) => [c.column_name, c]));

      // subscriptionPlan
      const planCol = colMap.get('subscriptionPlan')!;
      expect(planCol.udt_name).toBe('SubscriptionPlan');
      expect(planCol.is_nullable).toBe('NO');
      expect(planCol.column_default).toContain('FREE');

      // subscriptionStatus
      const statusCol = colMap.get('subscriptionStatus')!;
      expect(statusCol.udt_name).toBe('SubscriptionStatus');
      expect(statusCol.is_nullable).toBe('NO');
      expect(statusCol.column_default).toContain('TRIALING');

      // maxTables
      const maxTablesCol = colMap.get('maxTables')!;
      expect(maxTablesCol.data_type).toBe('integer');
      expect(maxTablesCol.is_nullable).toBe('NO');
      expect(maxTablesCol.column_default).toBe('10');

      // maxStaff
      const maxStaffCol = colMap.get('maxStaff')!;
      expect(maxStaffCol.data_type).toBe('integer');
      expect(maxStaffCol.is_nullable).toBe('NO');
      expect(maxStaffCol.column_default).toBe('3');

      // maxBranches
      const maxBranchesCol = colMap.get('maxBranches')!;
      expect(maxBranchesCol.data_type).toBe('integer');
      expect(maxBranchesCol.is_nullable).toBe('NO');
      expect(maxBranchesCol.column_default).toBe('1');

      // trialEndsAt
      const trialEndsAtCol = colMap.get('trialEndsAt')!;
      expect(trialEndsAtCol.data_type).toContain('timestamp');
      expect(trialEndsAtCol.is_nullable).toBe('YES');

      // kdsEnabled
      const kdsCol = colMap.get('kdsEnabled')!;
      expect(kdsCol.data_type).toBe('boolean');
      expect(kdsCol.is_nullable).toBe('NO');
      expect(kdsCol.column_default).toBe('false');

      // customBrandingEnabled
      const brandingCol = colMap.get('customBrandingEnabled')!;
      expect(brandingCol.data_type).toBe('boolean');
      expect(brandingCol.is_nullable).toBe('NO');
      expect(brandingCol.column_default).toBe('false');
    });
  });

  describe('Part 2: Multi-Tenant Boundary & Quota Isolation Stress Tests', () => {
    beforeAll(async () => {
      // 1. Create Tenant A (FREE tier, strict limits: 10 tables, 3 staff, 1 branch, no KDS, no Branding)
      await prisma.restaurant.create({
        data: {
          id: tenantAId,
          name: 'Challenger Alpha Free Cafe',
          subscriptionPlan: 'FREE',
          subscriptionStatus: 'ACTIVE',
          maxTables: 10,
          maxStaff: 3,
          maxBranches: 1,
          kdsEnabled: false,
          customBrandingEnabled: false,
        },
      });

      const branchA = await prisma.branch.create({
        data: {
          restaurantId: tenantAId,
          name: 'Alpha Main Street',
        },
      });
      branchAId = branchA.id;

      const floorA = await prisma.floor.create({
        data: {
          branchId: branchAId,
          name: 'Alpha Ground Floor',
        },
      });
      floorAId = floorA.id;

      const roleA = await prisma.role.create({
        data: {
          restaurantId: tenantAId,
          name: 'OWNER',
          label: 'Owner',
        },
      });
      roleAId = roleA.id;

      // Seed 1 owner/admin user for Tenant A (usage starts at 1 staff)
      const adminA = await prisma.user.create({
        data: {
          restaurantId: tenantAId,
          roleId: roleAId,
          name: 'Alpha Owner',
          email: `alpha-owner-${testRunId}@test.local`,
          passwordHash: 'dummyhash',
        },
      });
      adminAId = adminA.id;

      // 2. Create Tenant B (PRO tier: 25 tables, 8 staff, 3 branches, KDS enabled, Branding enabled)
      await prisma.restaurant.create({
        data: {
          id: tenantBId,
          name: 'Challenger Beta Pro Bistro',
          subscriptionPlan: 'PRO',
          subscriptionStatus: 'ACTIVE',
          maxTables: 25,
          maxStaff: 8,
          maxBranches: 3,
          kdsEnabled: true,
          customBrandingEnabled: true,
        },
      });

      const branchB = await prisma.branch.create({
        data: {
          restaurantId: tenantBId,
          name: 'Beta Downtown Hub',
        },
      });
      branchBId = branchB.id;

      const floorB = await prisma.floor.create({
        data: {
          branchId: branchBId,
          name: 'Beta Dining Hall',
        },
      });
      floorBId = floorB.id;

      const roleB = await prisma.role.create({
        data: {
          restaurantId: tenantBId,
          name: 'OWNER',
          label: 'Owner',
        },
      });
      roleBId = roleB.id;

      // Seed 1 owner/admin user for Tenant B (usage starts at 1 staff)
      const adminB = await prisma.user.create({
        data: {
          restaurantId: tenantBId,
          roleId: roleBId,
          name: 'Beta Owner',
          email: `beta-owner-${testRunId}@test.local`,
          passwordHash: 'dummyhash',
        },
      });
      adminBId = adminB.id;
    });

    it('verifies that both tenants initialize with strict 0 table usage and 1 staff isolation', async () => {
      const subA = await subscriptionService.getTenantSubscription(tenantAId);
      const subB = await subscriptionService.getTenantSubscription(tenantBId);

      expect(subA.plan).toBe('FREE');
      expect(subA.maxTables).toBe(10);
      expect(subA.maxStaff).toBe(3);
      expect(subA.maxBranches).toBe(1);
      expect(subA.kdsEnabled).toBe(false);
      expect(subA.customBrandingEnabled).toBe(false);
      expect(subA.currentUsage).toEqual({
        tablesCount: 0,
        staffCount: 1,
        branchesCount: 1,
      });

      expect(subB.plan).toBe('PRO');
      expect(subB.maxTables).toBe(25);
      expect(subB.maxStaff).toBe(8);
      expect(subB.maxBranches).toBe(3);
      expect(subB.kdsEnabled).toBe(true);
      expect(subB.customBrandingEnabled).toBe(true);
      expect(subB.currentUsage).toEqual({
        tablesCount: 0,
        staffCount: 1,
        branchesCount: 1,
      });
    });

    it('enforces table quota on Tenant A, rejects overflow, and confirms Tenant B quota is unaffected', async () => {
      // Create 10 tables on Tenant A (filling to maxTables = 10)
      for (let i = 1; i <= 10; i++) {
        await tablesService.createTable(branchAId, {
          floorId: floorAId,
          number: `A-${i}`,
          capacity: 4,
          posX: 0,
          posY: 0,
          width: 80,
          height: 80,
          rotation: 0,
          shape: 'square',
        });
      }

      const subA = await subscriptionService.getTenantSubscription(tenantAId);
      expect(subA.currentUsage.tablesCount).toBe(10);

      // Attempt table #11 on Tenant A -> must throw BadRequestException
      await expect(
        tablesService.createTable(branchAId, {
          floorId: floorAId,
          number: 'A-11',
          capacity: 4,
          posX: 0,
          posY: 0,
          width: 80,
          height: 80,
          rotation: 0,
          shape: 'square',
        }),
      ).rejects.toThrow(BadRequestException);

      // Verify Tenant B usage is untouched by Tenant A's 10 tables
      const subBBefore = await subscriptionService.getTenantSubscription(tenantBId);
      expect(subBBefore.currentUsage.tablesCount).toBe(0);

      // Tenant B can create tables freely up to its limit (e.g. 15 tables)
      for (let i = 1; i <= 15; i++) {
        await tablesService.createTable(branchBId, {
          floorId: floorBId,
          number: `B-${i}`,
          capacity: 4,
          posX: 0,
          posY: 0,
          width: 80,
          height: 80,
          rotation: 0,
          shape: 'square',
        });
      }

      const subBAfter = await subscriptionService.getTenantSubscription(tenantBId);
      expect(subBAfter.currentUsage.tablesCount).toBe(15);

      // Verify Tenant A count did not change when Tenant B created tables
      const subAAfter = await subscriptionService.getTenantSubscription(tenantAId);
      expect(subAAfter.currentUsage.tablesCount).toBe(10);

      // Tenant A is still blocked
      await expect(
        tablesService.createTable(branchAId, {
          floorId: floorAId,
          number: 'A-11',
          capacity: 4,
          posX: 0,
          posY: 0,
          width: 80,
          height: 80,
          rotation: 0,
          shape: 'square',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces batch table creation (createTables) boundaries per tenant', async () => {
      // Tenant A has 10 tables (limit 10). Batch create of even 1 table must fail
      await expect(
        tablesService.createTables(branchAId, {
          floorId: floorAId,
          numbers: ['A-BATCH-1'],
          capacity: 4,
          shape: 'square',
        }),
      ).rejects.toThrow(BadRequestException);

      // Tenant B has 15 tables (limit 25).
      // Batch create 5 tables -> 15 + 5 = 20 <= 25 -> must succeed
      const batchRes = await tablesService.createTables(branchBId, {
        floorId: floorBId,
        numbers: ['B-BATCH-1', 'B-BATCH-2', 'B-BATCH-3', 'B-BATCH-4', 'B-BATCH-5'],
        capacity: 4,
        shape: 'square',
      });
      expect(batchRes.length).toBe(5);

      const subB = await subscriptionService.getTenantSubscription(tenantBId);
      expect(subB.currentUsage.tablesCount).toBe(20);

      // Tenant B now attempts to batch create 6 tables -> 20 + 6 = 26 > 25 -> must fail
      await expect(
        tablesService.createTables(branchBId, {
          floorId: floorBId,
          numbers: [
            'B-OVERFLOW-1',
            'B-OVERFLOW-2',
            'B-OVERFLOW-3',
            'B-OVERFLOW-4',
            'B-OVERFLOW-5',
            'B-OVERFLOW-6',
          ],
          capacity: 4,
          shape: 'square',
        }),
      ).rejects.toThrow(BadRequestException);

      // Verify Tenant B count remains 20 (transaction rollbacked/blocked before insertion)
      const subBFinal = await subscriptionService.getTenantSubscription(tenantBId);
      expect(subBFinal.currentUsage.tablesCount).toBe(20);
    });

    it('enforces spatial isolation: Tenant B cannot create tables on Tenant A floor', async () => {
      // Tenant B tries to create table on Floor A
      await expect(
        tablesService.createTable(branchBId, {
          floorId: floorAId,
          number: 'INTRUDER-1',
          capacity: 4,
          posX: 0,
          posY: 0,
          width: 80,
          height: 80,
          rotation: 0,
          shape: 'square',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('enforces staff quota isolation between Tenant A and Tenant B', async () => {
      // Tenant A currently has 1 admin (limit 3). Add 2 staff members to reach limit 3.
      for (let i = 1; i <= 2; i++) {
        await usersService.create(tenantAId, adminAId, {
          name: `Alpha Staff ${i}`,
          email: `alpha-staff-${i}-${testRunId}@test.local`,
          password: 'Password123!',
          roleId: roleAId,
          branchIds: [branchAId],
        });
      }

      const subA = await subscriptionService.getTenantSubscription(tenantAId);
      expect(subA.currentUsage.staffCount).toBe(3);

      // Attempt staff #4 on Tenant A (1 admin + 2 staff + 1 overflow) -> must throw BadRequestException
      await expect(
        usersService.create(tenantAId, adminAId, {
          name: 'Alpha Staff 3 (Overflow)',
          email: `alpha-staff-3-${testRunId}@test.local`,
          password: 'Password123!',
          roleId: roleAId,
          branchIds: [branchAId],
        }),
      ).rejects.toThrow(BadRequestException);

      // Tenant B staff limit is 8. Tenant B currently has 1 admin.
      const subBBefore = await subscriptionService.getTenantSubscription(tenantBId);
      expect(subBBefore.currentUsage.staffCount).toBe(1);

      // Create 5 staff members on Tenant B (1 + 5 = 6 <= 8) -> must succeed
      for (let i = 1; i <= 5; i++) {
        await usersService.create(tenantBId, adminBId, {
          name: `Beta Staff ${i}`,
          email: `beta-staff-${i}-${testRunId}@test.local`,
          password: 'Password123!',
          roleId: roleBId,
          branchIds: [branchBId],
        });
      }

      const subBAfter = await subscriptionService.getTenantSubscription(tenantBId);
      expect(subBAfter.currentUsage.staffCount).toBe(6);

      // Verify Tenant A still has exactly 3 staff members
      const subAAfter = await subscriptionService.getTenantSubscription(tenantAId);
      expect(subAAfter.currentUsage.staffCount).toBe(3);
    }, 30000);

    it('enforces branch quota isolation between Tenant A and Tenant B', async () => {
      // Tenant A has 1 branch (maxBranches = 1). checkBranchQuota for 1 more must throw.
      await expect(
        subscriptionService.checkBranchQuota(tenantAId, 1),
      ).rejects.toThrow(BadRequestException);

      // Tenant B has 1 branch (maxBranches = 3). checkBranchQuota for 2 more must succeed.
      await expect(
        subscriptionService.checkBranchQuota(tenantBId, 2),
      ).resolves.toBeUndefined();

      // Create branch 2 and branch 3 on Tenant B
      await prisma.branch.create({
        data: {
          restaurantId: tenantBId,
          name: 'Beta Uptown Branch',
        },
      });
      await prisma.branch.create({
        data: {
          restaurantId: tenantBId,
          name: 'Beta Airport Branch',
        },
      });

      const subB = await subscriptionService.getTenantSubscription(tenantBId);
      expect(subB.currentUsage.branchesCount).toBe(3);

      // Tenant B has reached maxBranches (3). checkBranchQuota for 1 more must throw BadRequestException.
      await expect(
        subscriptionService.checkBranchQuota(tenantBId, 1),
      ).rejects.toThrow(BadRequestException);

      // Verify Tenant A usage is still 1 branch and still blocked
      const subA = await subscriptionService.getTenantSubscription(tenantAId);
      expect(subA.currentUsage.branchesCount).toBe(1);
      await expect(
        subscriptionService.checkBranchQuota(tenantAId, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces feature gating isolation: KDS & custom branding access', async () => {
      // Tenant A (FREE): KDS and Custom Branding must be blocked (ForbiddenException)
      await expect(subscriptionService.checkKdsAccess(tenantAId)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        subscriptionService.checkCustomBrandingAccess(tenantAId),
      ).rejects.toThrow(ForbiddenException);

      // Tenant B (PRO): KDS and Custom Branding must be permitted
      await expect(
        subscriptionService.checkKdsAccess(tenantBId),
      ).resolves.toBeUndefined();
      await expect(
        subscriptionService.checkCustomBrandingAccess(tenantBId),
      ).resolves.toBeUndefined();
    });

    it('isolates subscription invalidation: setting Tenant A to PAST_DUE does not impact Tenant B', async () => {
      // Invalidate Tenant A
      await prisma.restaurant.update({
        where: { id: tenantAId },
        data: { subscriptionStatus: 'PAST_DUE' },
      });

      // Tenant A operations throw ForbiddenException
      await expect(
        subscriptionService.checkTableQuota(tenantAId, 1),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        subscriptionService.checkStaffQuota(tenantAId, 1),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        subscriptionService.checkBranchQuota(tenantAId, 1),
      ).rejects.toThrow(ForbiddenException);

      // Tenant B remains ACTIVE and operations continue without issue
      await expect(
        subscriptionService.checkTableQuota(tenantBId, 1),
      ).resolves.toBeUndefined();
      await expect(
        subscriptionService.checkStaffQuota(tenantBId, 1),
      ).resolves.toBeUndefined();
      await expect(
        subscriptionService.checkKdsAccess(tenantBId),
      ).resolves.toBeUndefined();

      // Restore Tenant A to ACTIVE for subsequent tests
      await prisma.restaurant.update({
        where: { id: tenantAId },
        data: { subscriptionStatus: 'ACTIVE' },
      });
    });

    it('verifies dynamic plan upgrade increases quotas and unlocks features without affecting Tenant B', async () => {
      // Upgrade Tenant A from FREE to STARTER (STARTER: 25 tables, 10 staff, 2 branches, KDS enabled, branding disabled)
      const upgradedA = await subscriptionService.updateSubscription(
        tenantAId,
        adminAId,
        { plan: 'STARTER' },
      );

      expect(upgradedA.plan).toBe('STARTER');
      expect(upgradedA.maxTables).toBe(25);
      expect(upgradedA.maxStaff).toBe(10);
      expect(upgradedA.maxBranches).toBe(2);
      expect(upgradedA.kdsEnabled).toBe(true);
      expect(upgradedA.customBrandingEnabled).toBe(false);

      // Tenant A can now add table #11 (was blocked at 10)
      const table11 = await tablesService.createTable(branchAId, {
        floorId: floorAId,
        number: 'A-11',
        capacity: 4,
        posX: 0,
        posY: 0,
        width: 80,
        height: 80,
        rotation: 0,
        shape: 'square',
      });
      expect(table11.number).toBe('A-11');

      // Tenant A can now access KDS (was blocked under FREE)
      await expect(
        subscriptionService.checkKdsAccess(tenantAId),
      ).resolves.toBeUndefined();

      // Tenant A custom branding remains blocked under STARTER
      await expect(
        subscriptionService.checkCustomBrandingAccess(tenantAId),
      ).rejects.toThrow(ForbiddenException);

      // Tenant B remains strictly PRO with untouched quotas
      const subB = await subscriptionService.getTenantSubscription(tenantBId);
      expect(subB.plan).toBe('PRO');
      expect(subB.maxTables).toBe(25);
      expect(subB.maxStaff).toBe(8);
      expect(subB.maxBranches).toBe(3);
      expect(subB.kdsEnabled).toBe(true);
      expect(subB.customBrandingEnabled).toBe(true);
    });

    it('verifies concurrent interleaved operations across tenants maintain quota integrity', async () => {
      // Concurrently query subscriptions and check quotas 10 times in parallel
      const operations = Array.from({ length: 10 }).map(async (_, idx) => {
        if (idx % 2 === 0) {
          const subA = await subscriptionService.getTenantSubscription(tenantAId);
          expect(subA.currentUsage.tablesCount).toBe(11);
          expect(subA.plan).toBe('STARTER');
        } else {
          const subB = await subscriptionService.getTenantSubscription(tenantBId);
          expect(subB.currentUsage.tablesCount).toBe(20);
          expect(subB.plan).toBe('PRO');
        }
      });

      await Promise.all(operations);
    });
  });
});
