import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SUBSCRIPTION_TIER_CONFIGS,
  type SessionUser,
} from '@nodedr-restaurant/types';
import { AuditService } from '../../audit/audit.service';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { KdsController } from '../kds/kds.controller';
import { KdsService } from '../kds/kds.service';
import { SettingsController } from '../settings/settings.controller';
import { SettingsService } from '../settings/settings.service';
import { TablesController } from '../tables/tables.controller';
import { TablesService } from '../tables/tables.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { SubscriptionService } from './subscription.service';

/**
 * Milestone 1 Empirical Stress Test Suite: Quota & Subscription Boundaries
 *
 * Targets:
 * 1. Bulk Table Creation boundary stress (FREE: 10 tables, STARTER: 25 tables)
 * 2. Staff limit boundary stress (FREE: 3 staff, STARTER: 10 staff)
 * 3. KDS Access feature gating (FREE: kdsEnabled=false -> HTTP 403)
 * 4. Custom Branding feature gating (FREE/STARTER: customBrandingEnabled=false -> HTTP 403)
 * 5. Descriptive HTTP 400 & 403 verification
 */
describe('Milestone 1 Quota Stress Challenger - Subscription Boundaries', () => {
  let subscriptionService: SubscriptionService;
  let tablesService: TablesService;
  let tablesController: TablesController;
  let usersService: UsersService;
  let usersController: UsersController;
  let kdsController: KdsController;
  let settingsController: SettingsController;
  let settingsService: SettingsService;

  const mockRestaurant = {
    id: 'rest-stress-1',
    name: 'Stress Test Bistro',
    subscriptionPlan: 'FREE',
    subscriptionStatus: 'ACTIVE',
    maxTables: 10,
    maxStaff: 3,
    maxBranches: 1,
    trialEndsAt: null,
    kdsEnabled: false,
    customBrandingEnabled: false,
  };

  const mockBranch = {
    id: 'branch-stress-1',
    restaurantId: 'rest-stress-1',
    name: 'Main Branch',
  };

  const mockFloor = {
    id: 'floor-stress-1',
    branchId: 'branch-stress-1',
    name: 'Main Floor',
  };

  const mockUser: SessionUser = {
    id: 'user-stress-1',
    restaurantId: 'rest-stress-1',
    name: 'Stress Tester',
    roleId: 'role-owner',
    roleName: 'OWNER',
    permissions: [
      'tables.manage',
      'tables.view',
      'users.manage',
      'kds.manage',
      'settings.manage',
    ],
  };

  const mockPrisma = {
    restaurant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    branch: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    floor: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    table: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    role: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((promises: Promise<unknown>[]) => Promise.all(promises)),
  };

  const mockAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const mockRealtime = {
    emitToBranch: jest.fn(),
  };

  const mockBranchAccess = {
    assertAccess: jest.fn().mockResolvedValue(undefined),
  };

  const mockKdsService = {
    listStations: jest.fn().mockResolvedValue([]),
    listActiveTickets: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.restaurant.findUnique.mockResolvedValue({ ...mockRestaurant });
    mockPrisma.branch.findUnique.mockResolvedValue({ ...mockBranch });
    mockPrisma.branch.findFirst.mockResolvedValue({ ...mockBranch });
    mockPrisma.floor.findFirst.mockResolvedValue({ ...mockFloor });
    mockPrisma.table.findMany.mockResolvedValue([]);
    mockPrisma.table.count.mockResolvedValue(0);
    mockPrisma.user.count.mockResolvedValue(1);
    mockPrisma.branch.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [
        TablesController,
        UsersController,
        KdsController,
        SettingsController,
      ],
      providers: [
        SubscriptionService,
        TablesService,
        UsersService,
        SettingsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: RealtimeGateway, useValue: mockRealtime },
        { provide: BranchAccessService, useValue: mockBranchAccess },
        { provide: KdsService, useValue: mockKdsService },
      ],
    }).compile();

    subscriptionService = module.get<SubscriptionService>(SubscriptionService);
    tablesService = module.get<TablesService>(TablesService);
    tablesController = module.get<TablesController>(TablesController);
    usersService = module.get<UsersService>(UsersService);
    usersController = module.get<UsersController>(UsersController);
    kdsController = module.get<KdsController>(KdsController);
    settingsController = module.get<SettingsController>(SettingsController);
    settingsService = module.get<SettingsService>(SettingsService);
  });

  // =========================================================================
  // 1. Bulk Table Creation & Table Quota Stress
  // =========================================================================
  describe('Boundary 1: Bulk Table Creation & maxTables Quota Enforcement', () => {
    it('accepts bulk creation that reaches the exact quota limit (boundary value)', async () => {
      // FREE plan maxTables = 10. Existing count = 6. Bulk creation of 4 -> 6 + 4 = 10 <= 10.
      mockPrisma.table.count.mockResolvedValue(6);
      mockPrisma.table.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: `tbl-${data.number}`, ...data }),
      );

      const bulkDto = {
        floorId: 'floor-stress-1',
        numbers: ['T-07', 'T-08', 'T-09', 'T-10'],
        capacity: 4,
        shape: 'square' as const,
      };

      const result = await tablesController.createTables(
        mockUser,
        'branch-stress-1',
        bulkDto,
      );

      expect(result).toHaveLength(4);
      expect(mockPrisma.table.create).toHaveBeenCalledTimes(4);
    });

    it('rejects bulk creation when exceeding maxTables by 1 with descriptive HTTP 400', async () => {
      // FREE plan maxTables = 10. Existing count = 6. Bulk creation of 5 -> 6 + 5 = 11 > 10.
      mockPrisma.table.count.mockResolvedValue(6);

      const bulkDto = {
        floorId: 'floor-stress-1',
        numbers: ['T-07', 'T-08', 'T-09', 'T-10', 'T-11'],
        capacity: 4,
        shape: 'square' as const,
      };

      let error: HttpException | null = null;
      try {
        await tablesController.createTables(
          mockUser,
          'branch-stress-1',
          bulkDto,
        );
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.getStatus()).toBe(400);

      const response = error?.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(400);
      expect(response.message).toContain('Table limit reached for your FREE plan (10 tables maximum)');
      expect(response.message).toContain('Current count: 6');
      expect(response.message).toContain('Upgrade your subscription to add more tables');

      // Atomic check: zero tables inserted when quota fails
      expect(mockPrisma.table.create).not.toHaveBeenCalled();
    });

    it('stress harness: parameterized bulk bursts across boundary increments [1..20]', async () => {
      // For a tenant starting at 8 tables (max 10), batch sizes 1..2 must pass, 3..20 must throw HTTP 400
      mockPrisma.table.count.mockResolvedValue(8);
      mockPrisma.table.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: `tbl-${data.number}`, ...data }),
      );

      for (let batchSize = 1; batchSize <= 15; batchSize++) {
        jest.clearAllMocks();
        mockPrisma.restaurant.findUnique.mockResolvedValue({ ...mockRestaurant });
        mockPrisma.branch.findUnique.mockResolvedValue({ ...mockBranch });
        mockPrisma.floor.findFirst.mockResolvedValue({ ...mockFloor });
        mockPrisma.table.findMany.mockResolvedValue([]);
        mockPrisma.table.count.mockResolvedValue(8);
        mockPrisma.table.create.mockImplementation(({ data }) =>
          Promise.resolve({ id: `tbl-${data.number}`, ...data }),
        );

        const numbers = Array.from({ length: batchSize }, (_, i) => `ST-${i + 1}`);
        const dto = {
          floorId: 'floor-stress-1',
          numbers,
          capacity: 2,
          shape: 'square' as const,
        };

        if (batchSize <= 2) {
          // 8 + 1 = 9 <= 10; 8 + 2 = 10 <= 10 -> MUST PASS
          const res = await tablesController.createTables(
            mockUser,
            'branch-stress-1',
            dto,
          );
          expect(res).toHaveLength(batchSize);
        } else {
          // 8 + batchSize > 10 -> MUST THROW HTTP 400
          await expect(
            tablesController.createTables(mockUser, 'branch-stress-1', dto),
          ).rejects.toThrow(BadRequestException);
        }
      }
    });

    it('rejects bulk creation when subscription is CANCELLED or PAST_DUE with HTTP 403', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionStatus: 'CANCELLED',
      });
      mockPrisma.table.count.mockResolvedValue(2);

      const bulkDto = {
        floorId: 'floor-stress-1',
        numbers: ['T-03'],
        capacity: 4,
        shape: 'square' as const,
      };

      let error: HttpException | null = null;
      try {
        await tablesController.createTables(
          mockUser,
          'branch-stress-1',
          bulkDto,
        );
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);

      const response = error?.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(403);
      expect(response.message).toContain('Subscription status is cancelled');
    });

    it('verifies STARTER plan quota boundary (maxTables = 25)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'STARTER',
        maxTables: 25,
      });
      mockPrisma.table.count.mockResolvedValue(24);

      // Adding 1 table -> 24 + 1 = 25 -> Allowed
      await expect(
        tablesService.createTable('branch-stress-1', {
          floorId: 'floor-stress-1',
          number: 'T-25',
          capacity: 4,
          posX: 0,
          posY: 0,
          width: 80,
          height: 80,
          rotation: 0,
          shape: 'square',
        }),
      ).resolves.toBeDefined();

      // Adding 2 tables bulk -> 24 + 2 = 26 > 25 -> Throws 400
      let error: HttpException | null = null;
      try {
        await tablesService.createTables('branch-stress-1', {
          floorId: 'floor-stress-1',
          numbers: ['T-25', 'T-26'],
          capacity: 4,
          shape: 'square',
        });
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.getStatus()).toBe(400);
      expect((error?.getResponse() as Record<string, unknown>).message).toContain(
        'Table limit reached for your STARTER plan (25 tables maximum)',
      );
    });
  });

  // =========================================================================
  // 2. Staff Limit Boundary Stress (FREE & STARTER Plans)
  // =========================================================================
  describe('Boundary 2: Staff Limit Enforcement on FREE & STARTER Plans', () => {
    it('accepts staff addition up to FREE limit (3 staff members)', async () => {
      // FREE plan maxStaff = 3. Existing = 2 (e.g. Owner + 1 Waiter).
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-waiter' });
      mockPrisma.branch.findMany.mockResolvedValue([{ id: 'branch-stress-1' }]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-waiter-2',
        name: 'Waiter 2',
        email: 'waiter2@stress.local',
        roleId: 'role-waiter',
        isActive: true,
      });

      const staffDto = {
        name: 'Waiter 2',
        email: 'waiter2@stress.local',
        password: 'Password123!',
        roleId: 'role-waiter',
        branchIds: ['branch-stress-1'],
      };

      const result = await usersController.create(mockUser, staffDto);
      expect(result.id).toBe('user-waiter-2');
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('rejects adding 4th staff member on FREE plan with descriptive HTTP 400', async () => {
      // FREE plan maxStaff = 3. Existing = 3.
      mockPrisma.user.count.mockResolvedValue(3);

      const staffDto = {
        name: 'Staff Over Limit',
        email: 'over@stress.local',
        password: 'Password123!',
        roleId: 'role-waiter',
        branchIds: ['branch-stress-1'],
      };

      let error: HttpException | null = null;
      try {
        await usersController.create(mockUser, staffDto);
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.getStatus()).toBe(400);

      const response = error?.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(400);
      expect(response.message).toContain(
        'Staff limit reached for your FREE plan (3 staff members maximum). Current count: 3. Upgrade your subscription to add more staff.',
      );

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('enforces STARTER staff limit boundary (10 staff members maximum)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'STARTER',
        maxStaff: 10,
      });

      // At 9 staff: adding 10th is allowed
      mockPrisma.user.count.mockResolvedValue(9);
      await expect(
        subscriptionService.checkStaffQuota('rest-stress-1', 1),
      ).resolves.toBeUndefined();

      // At 10 staff: adding 11th is rejected with HTTP 400
      mockPrisma.user.count.mockResolvedValue(10);
      let error: HttpException | null = null;
      try {
        await subscriptionService.checkStaffQuota('rest-stress-1', 1);
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error?.getStatus()).toBe(400);
      expect((error?.getResponse() as Record<string, unknown>).message).toContain(
        'Staff limit reached for your STARTER plan (10 staff members maximum). Current count: 10. Upgrade your subscription to add more staff.',
      );
    });

    it('rejects adding staff when subscription is PAST_DUE with HTTP 403', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionStatus: 'PAST_DUE',
      });
      mockPrisma.user.count.mockResolvedValue(1);

      let error: HttpException | null = null;
      try {
        await subscriptionService.checkStaffQuota('rest-stress-1', 1);
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);
      expect((error?.getResponse() as Record<string, unknown>).message).toContain(
        'Subscription status is past_due. Please activate or renew your subscription to add staff.',
      );
    });
  });

  // =========================================================================
  // 3. KDS Access Feature Gating (kdsEnabled = false)
  // =========================================================================
  describe('Boundary 3: KDS Feature Gating when kdsEnabled = false', () => {
    it('blocks GET /v1/kds/stations with HTTP 403 on FREE tier', async () => {
      // FREE plan has kdsEnabled: false by default
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        kdsEnabled: false,
      });

      let error: HttpException | null = null;
      try {
        await kdsController.listStations(mockUser, 'branch-stress-1');
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);

      const response = error?.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(403);
      expect(response.message).toBe(
        'Kitchen Display System (KDS) is not included in your FREE plan. Upgrade to Starter, Pro, or Enterprise to unlock KDS.',
      );
      expect(mockKdsService.listStations).not.toHaveBeenCalled();
    });

    it('blocks GET /v1/kds/tickets with HTTP 403 on FREE tier', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        kdsEnabled: false,
      });

      let error: HttpException | null = null;
      try {
        await kdsController.listTickets(mockUser, 'branch-stress-1');
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);

      const response = error?.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(403);
      expect(response.message).toContain('Kitchen Display System (KDS) is not included in your FREE plan');
      expect(mockKdsService.listActiveTickets).not.toHaveBeenCalled();
    });

    it('blocks KDS access when explicitly disabled on STARTER plan', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'STARTER',
        kdsEnabled: false,
      });

      let error: HttpException | null = null;
      try {
        await subscriptionService.checkKdsAccess('rest-stress-1');
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);
      expect((error?.getResponse() as Record<string, unknown>).message).toBe(
        'Kitchen Display System (KDS) is not included in your STARTER plan. Upgrade to Starter, Pro, or Enterprise to unlock KDS.',
      );
    });

    it('permits KDS access when kdsEnabled = true on STARTER or PRO', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'STARTER',
        kdsEnabled: true,
      });

      await expect(
        kdsController.listStations(mockUser, 'branch-stress-1'),
      ).resolves.toEqual([]);
      expect(mockKdsService.listStations).toHaveBeenCalledWith('branch-stress-1');

      await expect(
        kdsController.listTickets(mockUser, 'branch-stress-1'),
      ).resolves.toEqual([]);
      expect(mockKdsService.listActiveTickets).toHaveBeenCalledWith(
        'branch-stress-1',
        undefined,
      );
    });

    it('blocks KDS access when subscription trial is expired, even if kdsEnabled is true', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'PRO',
        subscriptionStatus: 'TRIALING',
        trialEndsAt: new Date(Date.now() - 3600_000), // expired 1 hr ago
        kdsEnabled: true,
      });

      let error: HttpException | null = null;
      try {
        await kdsController.listStations(mockUser, 'branch-stress-1');
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);
      expect((error?.getResponse() as Record<string, unknown>).message).toContain(
        'Subscription status is trialing. Please activate or renew your subscription to access KDS.',
      );
    });
  });

  // =========================================================================
  // 4. Custom Branding Upload Feature Gating (customBrandingEnabled = false)
  // =========================================================================
  describe('Boundary 4: Custom Branding Gating when customBrandingEnabled = false', () => {
    it('blocks POST /v1/settings/restaurant/logo with HTTP 403 on FREE plan', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        customBrandingEnabled: false,
      });

      let error: HttpException | null = null;
      try {
        await settingsController.uploadRestaurantLogo(mockUser, undefined);
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).not.toBeNull();
      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);

      const response = error?.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(403);
      expect(response.message).toBe(
        'Custom branding is not included in your FREE plan. Upgrade to Pro or Enterprise to customize logos and themes.',
      );
    });

    it('blocks POST /v1/settings/restaurant/logo with HTTP 403 on STARTER plan', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'STARTER',
        customBrandingEnabled: false,
      });

      let error: HttpException | null = null;
      try {
        await settingsController.uploadRestaurantLogo(mockUser, undefined);
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);

      const response = error?.getResponse() as Record<string, unknown>;
      expect(response.statusCode).toBe(403);
      expect(response.message).toBe(
        'Custom branding is not included in your STARTER plan. Upgrade to Pro or Enterprise to customize logos and themes.',
      );
    });

    it('blocks PATCH /v1/settings/restaurant with logoUrl when customBrandingEnabled = false', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        customBrandingEnabled: false,
      });

      let error: HttpException | null = null;
      try {
        await settingsService.updateRestaurant(
          'rest-stress-1',
          'user-stress-1',
          {
            name: 'Updated Name',
            logoUrl: 'https://cdn.restaurant.local/logo.png',
          },
        );
      } catch (err) {
        error = err as HttpException;
      }

      expect(error).toBeInstanceOf(ForbiddenException);
      expect(error?.getStatus()).toBe(403);
      expect((error?.getResponse() as Record<string, unknown>).message).toContain(
        'Custom branding is not included in your FREE plan',
      );
      expect(mockPrisma.restaurant.update).not.toHaveBeenCalled();
    });

    it('permits branding configuration when customBrandingEnabled = true on PRO plan', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'PRO',
        customBrandingEnabled: true,
      });
      mockPrisma.restaurant.update.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'PRO',
        customBrandingEnabled: true,
        logoUrl: 'https://cdn.restaurant.local/logo.png',
      });

      const updated = await settingsService.updateRestaurant(
        'rest-stress-1',
        'user-stress-1',
        {
          logoUrl: 'https://cdn.restaurant.local/logo.png',
        },
      );

      expect(updated.logoUrl).toBe('https://cdn.restaurant.local/logo.png');
      expect(mockPrisma.restaurant.update).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 5. Exception Structure & HTTP Contract Verification
  // =========================================================================
  describe('Boundary 5: HTTP Status Codes & Error Contract Consistency', () => {
    it('verifies all quota exhaustion exceptions strictly adhere to HTTP 400 contract', () => {
      const quotaExceptions = [
        new BadRequestException('Table limit reached for your FREE plan (10 tables maximum)'),
        new BadRequestException('Staff limit reached for your FREE plan (3 staff members maximum)'),
        new BadRequestException('Branch limit reached for your FREE plan (1 branches maximum)'),
      ];

      for (const ex of quotaExceptions) {
        expect(ex.getStatus()).toBe(400);
        const res = ex.getResponse() as Record<string, unknown>;
        expect(res.statusCode).toBe(400);
        expect(res.error).toBe('Bad Request');
        expect(typeof res.message).toBe('string');
        expect((res.message as string).length).toBeGreaterThan(15);
      }
    });

    it('verifies all access denial exceptions strictly adhere to HTTP 403 contract', () => {
      const accessExceptions = [
        new ForbiddenException('Kitchen Display System (KDS) is not included in your FREE plan'),
        new ForbiddenException('Custom branding is not included in your FREE plan'),
        new ForbiddenException('Subscription status is past_due'),
        new ForbiddenException('Subscription status is cancelled'),
      ];

      for (const ex of accessExceptions) {
        expect(ex.getStatus()).toBe(403);
        const res = ex.getResponse() as Record<string, unknown>;
        expect(res.statusCode).toBe(403);
        expect(res.error).toBe('Forbidden');
        expect(typeof res.message).toBe('string');
        expect((res.message as string).length).toBeGreaterThan(15);
      }
    });
  });
});
