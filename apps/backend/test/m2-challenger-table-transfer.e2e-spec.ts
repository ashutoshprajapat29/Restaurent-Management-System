process.env.DATABASE_URL =
  process.env.DATABASE_URL?.replace('localhost', '127.0.0.1') ||
  'postgresql://nodedr:nodedr_dev_pw@127.0.0.1:5432/nodedr_restaurant';

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerStorage } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RealtimeGateway } from '../src/realtime/realtime.gateway';
import { TablesService } from '../src/modules/tables/tables.service';

describe('Milestone 2 Challenger: Table Transfer Stress & Boundary Hardening (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let tablesService: TablesService;

  const testRunId = randomUUID().slice(0, 8);
  const tenantId = `m2-tenant-${testRunId}`;
  const tenant2Id = `m2-tenant2-${testRunId}`;

  let branchId: string;
  let branch2Id: string;
  let floorId: string;
  let floor2Id: string;
  let roleId: string;
  let waiterUserId: string;
  let menuItemId: string;

  const emittedEvents: Array<{ branchId: string; event: string; data: any }> =
    [];

  beforeAll(async () => {
    jest.setTimeout(60000);

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
        emitToBranch: (bId: string, evt: string, data: any) => {
          emittedEvents.push({ branchId: bId, event: evt, data });
        },
        emitToUsers: jest.fn(),
        emitToUser: jest.fn(),
      })
      .compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    tablesService = moduleRef.get<TablesService>(TablesService);

    // Seed test tenant & branches
    await prisma.restaurant.create({
      data: {
        id: tenantId,
        name: 'M2 Stress Restaurant',
        subscriptionPlan: 'PRO',
        subscriptionStatus: 'ACTIVE',
        maxTables: 50,
        maxStaff: 20,
        maxBranches: 5,
      },
    });

    await prisma.restaurant.create({
      data: {
        id: tenant2Id,
        name: 'M2 Second Restaurant',
        subscriptionPlan: 'PRO',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const branch = await prisma.branch.create({
      data: {
        restaurantId: tenantId,
        name: 'M2 Primary Branch',
      },
    });
    branchId = branch.id;

    const branch2 = await prisma.branch.create({
      data: {
        restaurantId: tenant2Id,
        name: 'M2 Foreign Branch',
      },
    });
    branch2Id = branch2.id;

    const floor = await prisma.floor.create({
      data: {
        branchId,
        name: 'Main Dining Floor',
      },
    });
    floorId = floor.id;

    const floor2 = await prisma.floor.create({
      data: {
        branchId: branch2Id,
        name: 'Foreign Floor',
      },
    });
    floor2Id = floor2.id;

    const role = await prisma.role.create({
      data: {
        restaurantId: tenantId,
        name: 'WAITER',
        label: 'Waiter',
      },
    });
    roleId = role.id;

    const user = await prisma.user.create({
      data: {
        restaurantId: tenantId,
        roleId,
        name: 'Server Alice',
        email: `alice-${testRunId}@m2stress.test`,
        passwordHash: 'dummyhash',
      },
    });
    waiterUserId = user.id;

    const category = await prisma.menuCategory.create({
      data: {
        branchId,
        name: 'Main Courses',
      },
    });

    const item = await prisma.menuItem.create({
      data: {
        branchId,
        categoryId: category.id,
        name: 'Paneer Butter Masala',
        price: 250,
      },
    });
    menuItemId = item.id;
  }, 60000);

  afterAll(async () => {
    try {
      if (branchId && branch2Id) {
        await prisma.orderItem.deleteMany({
          where: { order: { branchId: { in: [branchId, branch2Id] } } },
        });
        await prisma.order.deleteMany({
          where: { branchId: { in: [branchId, branch2Id] } },
        });
        await prisma.table.deleteMany({
          where: { floor: { branchId: { in: [branchId, branch2Id] } } },
        });
        await prisma.menuItem.deleteMany({
          where: { branchId: { in: [branchId, branch2Id] } },
        });
        await prisma.menuCategory.deleteMany({
          where: { branchId: { in: [branchId, branch2Id] } },
        });
        await prisma.floor.deleteMany({
          where: { branchId: { in: [branchId, branch2Id] } },
        });
        await prisma.branch.deleteMany({
          where: { id: { in: [branchId, branch2Id] } },
        });
      }
      await prisma.user.deleteMany({
        where: { restaurantId: { in: [tenantId, tenant2Id] } },
      });
      await prisma.role.deleteMany({
        where: { restaurantId: { in: [tenantId, tenant2Id] } },
      });
      await prisma.restaurant.deleteMany({
        where: { id: { in: [tenantId, tenant2Id] } },
      });
    } catch (e) {
      console.warn('Cleanup error:', e);
    }

    if (moduleRef) {
      await moduleRef.close();
    }
  });

  // Helper to create table
  async function makeTable(
    num: string,
    opts: {
      status?:
        | 'AVAILABLE'
        | 'OCCUPIED'
        | 'BILLED'
        | 'RESERVED'
        | 'CLEANING'
        | 'OUT_OF_SERVICE';
      fId?: string;
      waiterId?: string;
    } = {},
  ) {
    return prisma.table.create({
      data: {
        floorId: opts.fId || floorId,
        number: `${num}-${testRunId}`,
        name: `Table ${num}`,
        status: opts.status || 'AVAILABLE',
        assignedWaiterId: opts.waiterId,
      },
    });
  }

  // Helper to create order on table
  async function makeOrder(
    tableId: string,
    opts: {
      status?: 'OPEN' | 'BILLED' | 'PAID' | 'CANCELLED';
      bId?: string;
    } = {},
  ) {
    const orderNumber = `ORD-${randomUUID().slice(0, 8)}`;
    return prisma.order.create({
      data: {
        branchId: opts.bId || branchId,
        tableId,
        orderNumber,
        status: opts.status || 'OPEN',
        createdById: waiterUserId,
        subtotal: 250,
        totalAmount: 250,
        items: {
          create: [
            {
              menuItemId,
              nameSnapshot: 'Paneer Butter Masala',
              unitPriceSnapshot: 250,
              taxRateSnapshot: 5,
              quantity: 1,
              lineTotal: 250,
            },
          ],
        },
      },
    });
  }

  // =========================================================================
  // Part 1: Validation & Bad Request Boundaries (HTTP 400 / 404)
  // =========================================================================
  describe('Part 1: Validation & Bad Request Boundaries', () => {
    it('rejects transfer when source and target are the same table (HTTP 400)', async () => {
      const tbl = await makeTable('P1-SAME', { status: 'OCCUPIED' });
      await makeOrder(tbl.id);

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: tbl.id,
          targetTableId: tbl.id,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: tbl.id,
          targetTableId: tbl.id,
        }),
      ).rejects.toThrow(/Cannot transfer an order to the same table/i);
    });

    it('rejects transfer when source table does not exist (HTTP 404)', async () => {
      const tgt = await makeTable('P1-TGT1', { status: 'AVAILABLE' });

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: 'non-existent-table-id',
          targetTableId: tgt.id,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects transfer when target table does not exist (HTTP 404)', async () => {
      const src = await makeTable('P1-SRC1', { status: 'OCCUPIED' });
      await makeOrder(src.id);

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: src.id,
          targetTableId: 'non-existent-target-id',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects cross-branch transfer when target table belongs to another branch (HTTP 404)', async () => {
      const src = await makeTable('P1-SRC2', { status: 'OCCUPIED' });
      await makeOrder(src.id);
      const foreignTbl = await makeTable('P1-FOREIGN', {
        status: 'AVAILABLE',
        fId: floor2Id,
      });

      // Target table is in branch2, query is scoped to branchId
      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: src.id,
          targetTableId: foreignTbl.id,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects transfer from a table without any open bills (HTTP 400)', async () => {
      const srcEmpty = await makeTable('P1-EMPTY', { status: 'AVAILABLE' });
      const tgt = await makeTable('P1-TGT2', { status: 'AVAILABLE' });

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: srcEmpty.id,
          targetTableId: tgt.id,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: srcEmpty.id,
          targetTableId: tgt.id,
        }),
      ).rejects.toThrow(/has no active order to transfer/i);
    });

    it('rejects transfer from a table with only PAID or CANCELLED orders (HTTP 400)', async () => {
      const srcOld = await makeTable('P1-PAID', { status: 'AVAILABLE' });
      await makeOrder(srcOld.id, { status: 'PAID' });
      await makeOrder(srcOld.id, { status: 'CANCELLED' });
      const tgt = await makeTable('P1-TGT3', { status: 'AVAILABLE' });

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: srcOld.id,
          targetTableId: tgt.id,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: srcOld.id,
          targetTableId: tgt.id,
        }),
      ).rejects.toThrow(/has no active order to transfer/i);
    });

    it('rejects transfer when specified orderId is for a PAID order (HTTP 400)', async () => {
      const src = await makeTable('P1-SRC-MIX', { status: 'OCCUPIED' });
      const paidOrder = await makeOrder(src.id, { status: 'PAID' });
      await makeOrder(src.id, { status: 'OPEN' }); // open order exists, but we ask for paid
      const tgt = await makeTable('P1-TGT-MIX', { status: 'AVAILABLE' });

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: src.id,
          targetTableId: tgt.id,
          orderId: paidOrder.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transfer when specified orderId belongs to a different table (HTTP 400)', async () => {
      const src1 = await makeTable('P1-SRC-OTHER1', { status: 'OCCUPIED' });
      const src2 = await makeTable('P1-SRC-OTHER2', { status: 'OCCUPIED' });
      const orderOnSrc2 = await makeOrder(src2.id, { status: 'OPEN' });
      const tgt = await makeTable('P1-TGT-OTHER', { status: 'AVAILABLE' });

      await expect(
        tablesService.transferOrder(branchId, {
          sourceTableId: src1.id,
          targetTableId: tgt.id,
          orderId: orderOnSrc2.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // Part 2: Status Boundaries: Target Table Non-Available (HTTP 400 / 409)
  // =========================================================================
  describe('Part 2: Status Boundaries: Non-Available Target Tables', () => {
    let srcTable: any;
    let openOrder: any;

    beforeEach(async () => {
      srcTable = await makeTable(`P2-SRC-${randomUUID().slice(0, 4)}`, {
        status: 'OCCUPIED',
      });
      openOrder = await makeOrder(srcTable.id, { status: 'OPEN' });
    });

    it('rejects transfer to OUT_OF_SERVICE table with HTTP 400', async () => {
      const tgt = await makeTable('P2-OOS', { status: 'OUT_OF_SERVICE' });

      const err = await tablesService
        .transferOrder(branchId, {
          sourceTableId: srcTable.id,
          targetTableId: tgt.id,
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('OUT_OF_SERVICE');
      expect(err.message).toContain('is not AVAILABLE');
    });

    it('rejects transfer to CLEANING table with HTTP 400', async () => {
      const tgt = await makeTable('P2-CLN', { status: 'CLEANING' });

      const err = await tablesService
        .transferOrder(branchId, {
          sourceTableId: srcTable.id,
          targetTableId: tgt.id,
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('CLEANING');
      expect(err.message).toContain('is not AVAILABLE');
    });

    it('rejects transfer to RESERVED table with HTTP 400', async () => {
      const tgt = await makeTable('P2-RES', { status: 'RESERVED' });

      const err = await tablesService
        .transferOrder(branchId, {
          sourceTableId: srcTable.id,
          targetTableId: tgt.id,
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('RESERVED');
      expect(err.message).toContain('is not AVAILABLE');
    });

    it('rejects transfer to OCCUPIED table with HTTP 400', async () => {
      const tgt = await makeTable('P2-OCC', { status: 'OCCUPIED' });
      await makeOrder(tgt.id, { status: 'OPEN' });

      const err = await tablesService
        .transferOrder(branchId, {
          sourceTableId: srcTable.id,
          targetTableId: tgt.id,
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('OCCUPIED');
      expect(err.message).toContain('is not AVAILABLE');
    });

    it('accepts TableStatus.BILLED in PostgreSQL and rejects transfer to BILLED table with HTTP 400', async () => {
      // Empirical verification: BILLED is now a valid enum value in PostgreSQL.
      // Creating a table with status 'BILLED' must succeed without PostgreSQL 22P02 error.
      const billedTgt = await makeTable('P2-BLD', { status: 'BILLED' });
      expect(billedTgt.status).toBe('BILLED');

      const dbTable = await prisma.table.findUnique({
        where: { id: billedTgt.id },
      });
      expect(dbTable?.status).toBe('BILLED');

      // Attempting to transfer to a BILLED table must reject with BadRequestException
      const err = await tablesService
        .transferOrder(branchId, {
          sourceTableId: srcTable.id,
          targetTableId: billedTgt.id,
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toContain('BILLED');
      expect(err.message).toContain('is not AVAILABLE');
    });

    it('rejects transfer with HTTP 409 Conflict if target table is marked AVAILABLE but has an active bill', async () => {
      const tgt = await makeTable('P2-GHOST', { status: 'AVAILABLE' });
      const ghostBill = await makeOrder(tgt.id, { status: 'OPEN' });

      const err = await tablesService
        .transferOrder(branchId, {
          sourceTableId: srcTable.id,
          targetTableId: tgt.id,
        })
        .catch((e) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(err.message).toContain(
        `Target table ${tgt.number} already has open bill #${ghostBill.orderNumber}`,
      );
    });
  });

  // =========================================================================
  // Part 3: State Machine & Realtime Event Synchronization
  // =========================================================================
  describe('Part 3: State Machine & Realtime Synchronization', () => {
    it('executes atomic transfer and broadcasts realtime events', async () => {
      emittedEvents.length = 0;
      const src = await makeTable('P3-SRC1', {
        status: 'OCCUPIED',
        waiterId: waiterUserId,
      });
      const tgt = await makeTable('P3-TGT1', { status: 'AVAILABLE' });
      const order = await makeOrder(src.id, { status: 'OPEN' });

      const res = await tablesService.transferOrder(branchId, {
        sourceTableId: src.id,
        targetTableId: tgt.id,
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBe(order.id);
      expect(res.sourceTable.status).toBe('AVAILABLE');
      expect(res.targetTable.status).toBe('OCCUPIED');

      // Database verification
      const dbSrc = await prisma.table.findUnique({ where: { id: src.id } });
      const dbTgt = await prisma.table.findUnique({ where: { id: tgt.id } });
      const dbOrder = await prisma.order.findUnique({
        where: { id: order.id },
      });

      expect(dbSrc?.status).toBe('AVAILABLE');
      expect(dbSrc?.assignedWaiterId).toBeNull();
      expect(dbTgt?.status).toBe('OCCUPIED');
      expect(dbTgt?.assignedWaiterId).toBe(waiterUserId);
      expect(dbOrder?.tableId).toBe(tgt.id);

      // Realtime events
      const eventNames = emittedEvents.map((e) => e.event);
      expect(eventNames).toContain('order.updated');
      expect(eventNames).toContain('kot.updated');
      expect(eventNames).toContain('table.updated');
      expect(eventNames).toContain('table.transferred');

      const transferEvent = emittedEvents.find(
        (e) => e.event === 'table.transferred',
      );
      expect(transferEvent?.data).toEqual({
        orderId: order.id,
        sourceTableId: src.id,
        targetTableId: tgt.id,
      });
    });

    it('keeps source table OCCUPIED if another open order remains on source', async () => {
      const src = await makeTable('P3-SPLIT-SRC', { status: 'OCCUPIED' });
      const order1 = await makeOrder(src.id, { status: 'OPEN' });
      const order2 = await makeOrder(src.id, { status: 'BILLED' });
      const tgt = await makeTable('P3-SPLIT-TGT', { status: 'AVAILABLE' });

      const res = await tablesService.transferOrder(branchId, {
        sourceTableId: src.id,
        targetTableId: tgt.id,
        orderId: order1.id,
      });

      expect(res.success).toBe(true);
      const dbSrc = await prisma.table.findUnique({ where: { id: src.id } });
      expect(dbSrc?.status).toBe('OCCUPIED'); // still has order2!

      const dbOrder1 = await prisma.order.findUnique({
        where: { id: order1.id },
      });
      const dbOrder2 = await prisma.order.findUnique({
        where: { id: order2.id },
      });
      expect(dbOrder1?.tableId).toBe(tgt.id);
      expect(dbOrder2?.tableId).toBe(src.id);
    });

    it('allows chained sequential transfers across multiple tables', async () => {
      const t1 = await makeTable('P3-CH1', { status: 'OCCUPIED' });
      const t2 = await makeTable('P3-CH2', { status: 'AVAILABLE' });
      const t3 = await makeTable('P3-CH3', { status: 'AVAILABLE' });
      const t4 = await makeTable('P3-CH4', { status: 'AVAILABLE' });

      const ord = await makeOrder(t1.id, { status: 'OPEN' });

      // Step 1: T1 -> T2
      await tablesService.transferOrder(branchId, {
        sourceTableId: t1.id,
        targetTableId: t2.id,
      });
      expect((await prisma.table.findUnique({ where: { id: t1.id } }))?.status).toBe(
        'AVAILABLE',
      );
      expect((await prisma.table.findUnique({ where: { id: t2.id } }))?.status).toBe(
        'OCCUPIED',
      );

      // Step 2: T2 -> T3
      await tablesService.transferOrder(branchId, {
        sourceTableId: t2.id,
        targetTableId: t3.id,
      });
      expect((await prisma.table.findUnique({ where: { id: t2.id } }))?.status).toBe(
        'AVAILABLE',
      );
      expect((await prisma.table.findUnique({ where: { id: t3.id } }))?.status).toBe(
        'OCCUPIED',
      );

      // Step 3: T3 -> T4
      await tablesService.transferOrder(branchId, {
        sourceTableId: t3.id,
        targetTableId: t4.id,
      });
      expect((await prisma.table.findUnique({ where: { id: t3.id } }))?.status).toBe(
        'AVAILABLE',
      );
      expect((await prisma.table.findUnique({ where: { id: t4.id } }))?.status).toBe(
        'OCCUPIED',
      );

      const finalOrder = await prisma.order.findUnique({
        where: { id: ord.id },
      });
      expect(finalOrder?.tableId).toBe(t4.id);
    });
  });

  // =========================================================================
  // Part 4: High-Concurrency Rush-Hour Stress Testing
  // =========================================================================
  describe('Part 4: High-Concurrency Rush-Hour Stress Harness', () => {
    it('concurrently transferring TWO orders to the same target table must not permit both to occupy the table', async () => {
      const srcA = await makeTable('P4-SRC-A', { status: 'OCCUPIED' });
      const orderA = await makeOrder(srcA.id, { status: 'OPEN' });

      const srcB = await makeTable('P4-SRC-B', { status: 'OCCUPIED' });
      const orderB = await makeOrder(srcB.id, { status: 'OPEN' });

      const tgt = await makeTable('P4-TGT-CONC', { status: 'AVAILABLE' });

      // Fire both transfers concurrently in parallel
      const [resA, resB] = await Promise.allSettled([
        tablesService.transferOrder(branchId, {
          sourceTableId: srcA.id,
          targetTableId: tgt.id,
        }),
        tablesService.transferOrder(branchId, {
          sourceTableId: srcB.id,
          targetTableId: tgt.id,
        }),
      ]);

      // Check DB orders on tgt
      const activeOrdersOnTarget = await prisma.order.findMany({
        where: {
          tableId: tgt.id,
          status: { in: ['OPEN', 'BILLED'] },
        },
      });

      console.log('Concurrent 2-Transfer Results:', {
        resA: resA.status === 'fulfilled' ? 'SUCCESS' : (resA.reason as Error)?.message,
        resB: resB.status === 'fulfilled' ? 'SUCCESS' : (resB.reason as Error)?.message,
        activeOrdersOnTargetCount: activeOrdersOnTarget.length,
      });

      // Strict Invariant: Exactly ONE transfer must succeed, or at most 1 active order on target!
      // If both succeeded, then two orders were merged onto the target table without conflict error.
      expect(activeOrdersOnTarget.length).toBeLessThanOrEqual(1);

      const successCount = [resA, resB].filter(
        (r) => r.status === 'fulfilled',
      ).length;
      expect(successCount).toBe(1);

      // The rejected one must have failed with an HTTP 400 or 409 exception
      const rejected = [resA, resB].find((r) => r.status === 'rejected') as
        | PromiseRejectedResult
        | undefined;
      expect(rejected).toBeDefined();
      expect(
        rejected!.reason instanceof BadRequestException ||
          rejected!.reason instanceof ConflictException,
      ).toBe(true);
    });

    it('concurrently transferring 5 orders to the same target table allows at most ONE transfer', async () => {
      const target = await makeTable('P4-TGT-RUSH5', { status: 'AVAILABLE' });

      const sources = await Promise.all([
        makeTable('P4-RUSH-S1', { status: 'OCCUPIED' }),
        makeTable('P4-RUSH-S2', { status: 'OCCUPIED' }),
        makeTable('P4-RUSH-S3', { status: 'OCCUPIED' }),
        makeTable('P4-RUSH-S4', { status: 'OCCUPIED' }),
        makeTable('P4-RUSH-S5', { status: 'OCCUPIED' }),
      ]);

      await Promise.all(sources.map((s) => makeOrder(s.id, { status: 'OPEN' })));

      const results = await Promise.allSettled(
        sources.map((s) =>
          tablesService.transferOrder(branchId, {
            sourceTableId: s.id,
            targetTableId: target.id,
          }),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      const activeOrdersOnTarget = await prisma.order.findMany({
        where: {
          tableId: target.id,
          status: { in: ['OPEN', 'BILLED'] },
        },
      });

      console.log('Concurrent 5-Transfer Results:', {
        fulfilledCount: fulfilled.length,
        rejectedCount: rejected.length,
        activeOrdersOnTargetCount: activeOrdersOnTarget.length,
      });

      expect(activeOrdersOnTarget.length).toBeLessThanOrEqual(1);
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(4);

      for (const rej of rejected as PromiseRejectedResult[]) {
        expect(
          rej.reason instanceof BadRequestException ||
            rej.reason instanceof ConflictException,
        ).toBe(true);
      }
    });

    it('rejects concurrent reciprocal transfers between two occupied tables', async () => {
      const tA = await makeTable('P4-RECIP-A', { status: 'OCCUPIED' });
      const tB = await makeTable('P4-RECIP-B', { status: 'OCCUPIED' });
      await makeOrder(tA.id, { status: 'OPEN' });
      await makeOrder(tB.id, { status: 'OPEN' });

      const [resAtoB, resBtoA] = await Promise.allSettled([
        tablesService.transferOrder(branchId, {
          sourceTableId: tA.id,
          targetTableId: tB.id,
        }),
        tablesService.transferOrder(branchId, {
          sourceTableId: tB.id,
          targetTableId: tA.id,
        }),
      ]);

      expect(resAtoB.status).toBe('rejected');
      expect(resBtoA.status).toBe('rejected');

      const rej1 = resAtoB as PromiseRejectedResult;
      const rej2 = resBtoA as PromiseRejectedResult;
      expect(rej1.reason).toBeInstanceOf(BadRequestException);
      expect(rej2.reason).toBeInstanceOf(BadRequestException);
    });

    it('concurrently transferring the same order to two different target tables must not leave phantom occupied tables', async () => {
      const src = await makeTable('P4-SRC-SPLIT', { status: 'OCCUPIED' });
      const order = await makeOrder(src.id, { status: 'OPEN' });

      const tgt1 = await makeTable('P4-TGT-SPLIT1', { status: 'AVAILABLE' });
      const tgt2 = await makeTable('P4-TGT-SPLIT2', { status: 'AVAILABLE' });

      const [res1, res2] = await Promise.allSettled([
        tablesService.transferOrder(branchId, {
          sourceTableId: src.id,
          targetTableId: tgt1.id,
          orderId: order.id,
        }),
        tablesService.transferOrder(branchId, {
          sourceTableId: src.id,
          targetTableId: tgt2.id,
          orderId: order.id,
        }),
      ]);

      const dbTgt1 = await prisma.table.findUnique({ where: { id: tgt1.id } });
      const dbTgt2 = await prisma.table.findUnique({ where: { id: tgt2.id } });
      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });

      console.log('Concurrent Same-Order Transfer Results:', {
        res1: res1.status === 'fulfilled' ? 'SUCCESS' : (res1.reason as Error)?.message,
        res2: res2.status === 'fulfilled' ? 'SUCCESS' : (res2.reason as Error)?.message,
        tgt1Status: dbTgt1?.status,
        tgt2Status: dbTgt2?.status,
        finalOrderTableId: dbOrder?.tableId,
      });

      // Strict Invariant: Exactly one must succeed.
      // If both succeed, one table becomes OCCUPIED without any order (ghost table)!
      const successCount = [res1, res2].filter((r) => r.status === 'fulfilled').length;
      expect(successCount).toBe(1);
    });

    it('survives rapid interleaved transfers and table status queries without state corruption', async () => {
      const tables = await Promise.all([
        makeTable('P4-BURST-1', { status: 'OCCUPIED' }),
        makeTable('P4-BURST-2', { status: 'AVAILABLE' }),
        makeTable('P4-BURST-3', { status: 'AVAILABLE' }),
        makeTable('P4-BURST-4', { status: 'AVAILABLE' }),
      ]);

      const o = await makeOrder(tables[0].id, { status: 'OPEN' });

      // Run sequential fast transfers: 0 -> 1 -> 2 -> 3 -> 0
      await tablesService.transferOrder(branchId, {
        sourceTableId: tables[0].id,
        targetTableId: tables[1].id,
      });
      await tablesService.transferOrder(branchId, {
        sourceTableId: tables[1].id,
        targetTableId: tables[2].id,
      });
      await tablesService.transferOrder(branchId, {
        sourceTableId: tables[2].id,
        targetTableId: tables[3].id,
      });
      await tablesService.transferOrder(branchId, {
        sourceTableId: tables[3].id,
        targetTableId: tables[0].id,
      });

      const finalTbl0 = await prisma.table.findUnique({
        where: { id: tables[0].id },
      });
      const finalTbl1 = await prisma.table.findUnique({
        where: { id: tables[1].id },
      });
      const finalTbl2 = await prisma.table.findUnique({
        where: { id: tables[2].id },
      });
      const finalTbl3 = await prisma.table.findUnique({
        where: { id: tables[3].id },
      });

      expect(finalTbl0?.status).toBe('OCCUPIED');
      expect(finalTbl1?.status).toBe('AVAILABLE');
      expect(finalTbl2?.status).toBe('AVAILABLE');
      expect(finalTbl3?.status).toBe('AVAILABLE');

      const ord = await prisma.order.findUnique({ where: { id: o.id } });
      expect(ord?.tableId).toBe(tables[0].id);
    });
  });
});
