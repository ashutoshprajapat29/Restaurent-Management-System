import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { KdsService } from '../kds/kds.service';
import { buildKotHtml } from './kot.html';
import { buildKotEscPosJob, resolveProfile } from './escpos-receipt';
import { readJob } from './escpos/read-job';

function createMockPrisma() {
  const prisma: any = {
    branch: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'branch-1',
        name: 'Main Downtown Branch',
        autoConfirmOrders: true,
        taxMode: 'INCLUSIVE',
        printerPaperWidthMm: 80,
        printerCodepage: 'CP858',
        printerColumns: 48,
      }),
    },
    menuItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    modifier: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    modifierGroup: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    table: {
      findFirst: jest.fn().mockResolvedValue({ id: 'table-1' }),
      update: jest.fn().mockResolvedValue({ id: 'table-1', status: 'OCCUPIED' }),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    },
    kitchenStation: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'station-grill', name: 'Grill' },
        { id: 'station-bar', name: 'Bar' },
      ]),
    },
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
    },
    orderItem: {
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kot: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'kot-new-1', ticketNumber: '1', items: [] }),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      findUniqueOrThrow: jest.fn(),
    },
    kotItem: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (cb) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return Promise.all(cb);
    }),
  };
  return prisma;
}

function createTestOrdersService(prisma = createMockPrisma()) {
  const realtime = { emitToBranch: jest.fn() };
  const giftCards = { getBalance: jest.fn(), debit: jest.fn() };
  const inventory = { deductForOrder: jest.fn(), checkAvailability: jest.fn() };
  const audit = { record: jest.fn() };
  const notifications = { notifyUser: jest.fn() };
  const marketing = { trackOrder: jest.fn() };
  const webhooks = { emitForBranch: jest.fn() };
  const verifactu = { registerInvoice: jest.fn() };

  const service = new OrdersService(
    prisma as any,
    realtime as any,
    giftCards as any,
    inventory as any,
    audit as any,
    notifications as any,
    marketing as any,
    webhooks as any,
    verifactu as any,
  );

  return { service, prisma, realtime, notifications, audit };
}

describe('Challenger M3 Backend: KDS Queue, Thermal Print & Waiter Attribution', () => {
  describe('1. KDS Station Filtering & Routing (Feature 11)', () => {
    it('KdsService.listActiveTickets filters by stationId with unassigned fallback and excludes terminal statuses', async () => {
      const prisma = createMockPrisma();
      const kotPrint = { printTicket: jest.fn() };
      const { service: ordersService } = createTestOrdersService(prisma);
      const kdsService = new KdsService(prisma as any, ordersService as any, kotPrint as any);

      await kdsService.listActiveTickets('branch-1', 'st-grill');

      expect(prisma.kot.findMany).toHaveBeenCalledWith({
        where: {
          order: { branchId: 'branch-1' },
          status: { notIn: ['SERVED', 'CANCELLED', 'REJECTED'] },
          OR: [{ stationId: 'st-grill' }, { stationId: null }],
        },
        include: {
          station: true,
          order: {
            select: {
              orderNumber: true,
              type: true,
              table: true,
              guestName: true,
              notes: true,
              channel: true,
              customer: { select: { name: true, phone: true } },
              createdBy: { select: { id: true, name: true } },
            },
          },
          items: { include: { orderItem: { include: { modifiers: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('KdsService.listActiveTickets without stationId fetches tickets for all stations', async () => {
      const prisma = createMockPrisma();
      const kotPrint = { printTicket: jest.fn() };
      const { service: ordersService } = createTestOrdersService(prisma);
      const kdsService = new KdsService(prisma as any, ordersService as any, kotPrint as any);

      await kdsService.listActiveTickets('branch-1');

      expect(prisma.kot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            order: { branchId: 'branch-1' },
            status: { notIn: ['SERVED', 'CANCELLED', 'REJECTED'] },
          },
        }),
      );
    });
  });

  describe('2. KDS Ticket Status Transitions & Rejection Controls (Feature 11)', () => {
    it('progresses ticket through forward lifecycle: NEW -> ACCEPTED -> PREPARING -> READY -> SERVED', async () => {
      const { service, prisma, notifications } = createTestOrdersService();

      // 1. NEW -> ACCEPTED
      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-100',
        status: 'NEW',
        ticketNumber: 'T-1',
        order: { id: 'order-1', orderNumber: '101', table: { assignedWaiterId: 'waiter-bob', number: '12' } },
      });
      prisma.kot.findUniqueOrThrow.mockResolvedValueOnce({ id: 'kot-100', status: 'ACCEPTED' });

      const step1 = await service.updateKotStatus('branch-1', 'kot-100', 'ACCEPTED', 'user-waiter-1');
      expect(step1.status).toBe('ACCEPTED');
      expect(prisma.kot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'kot-100', status: 'NEW' },
          data: expect.objectContaining({ status: 'ACCEPTED', acceptedById: 'user-waiter-1' }),
        }),
      );

      // 2. ACCEPTED -> PREPARING
      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-100',
        status: 'ACCEPTED',
        ticketNumber: 'T-1',
        order: { id: 'order-1', orderNumber: '101', table: { assignedWaiterId: 'waiter-bob', number: '12' } },
      });
      prisma.kot.findUniqueOrThrow.mockResolvedValueOnce({ id: 'kot-100', status: 'PREPARING' });

      const step2 = await service.updateKotStatus('branch-1', 'kot-100', 'PREPARING', 'user-kitchen-1');
      expect(step2.status).toBe('PREPARING');

      // 3. PREPARING -> READY (should notify assigned waiter)
      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-100',
        status: 'PREPARING',
        ticketNumber: 'T-1',
        order: { id: 'order-1', orderNumber: '101', table: { assignedWaiterId: 'waiter-bob', number: '12' } },
      });
      prisma.kot.findUniqueOrThrow.mockResolvedValueOnce({ id: 'kot-100', status: 'READY' });

      const step3 = await service.updateKotStatus('branch-1', 'kot-100', 'READY', 'user-kitchen-1');
      expect(step3.status).toBe('READY');
      expect(notifications.notifyUser).toHaveBeenCalledWith(
        'waiter-bob',
        'branch-1',
        expect.objectContaining({ type: 'order.ready', entityId: 'order-1' }),
      );

      // 4. READY -> SERVED
      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-100',
        status: 'READY',
        ticketNumber: 'T-1',
        order: { id: 'order-1', orderNumber: '101', table: { assignedWaiterId: 'waiter-bob', number: '12' } },
      });
      prisma.kot.findUniqueOrThrow.mockResolvedValueOnce({ id: 'kot-100', status: 'SERVED' });

      const step4 = await service.updateKotStatus('branch-1', 'kot-100', 'SERVED', 'user-waiter-1');
      expect(step4.status).toBe('SERVED');
    });

    it('rejects illegal status transitions (e.g. NEW -> READY, PREPARING -> ACCEPTED, SERVED -> PREPARING)', async () => {
      const { service, prisma } = createTestOrdersService();

      // NEW -> READY is illegal
      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-200',
        status: 'NEW',
        order: { id: 'order-2', orderNumber: '201', table: null },
      });
      await expect(service.updateKotStatus('branch-1', 'kot-200', 'READY')).rejects.toThrow(ConflictException);

      // PREPARING -> ACCEPTED is illegal
      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-201',
        status: 'PREPARING',
        order: { id: 'order-2', orderNumber: '201', table: null },
      });
      await expect(service.updateKotStatus('branch-1', 'kot-201', 'ACCEPTED')).rejects.toThrow(ConflictException);

      // SERVED -> PREPARING is illegal
      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-202',
        status: 'SERVED',
        order: { id: 'order-2', orderNumber: '201', table: null },
      });
      await expect(service.updateKotStatus('branch-1', 'kot-202', 'PREPARING')).rejects.toThrow(ConflictException);
    });

    it('updateKotStatus rejects REJECTED as forward status (must use rejectKot)', async () => {
      const { service } = createTestOrdersService();
      await expect(service.updateKotStatus('branch-1', 'kot-300', 'REJECTED')).rejects.toThrow(BadRequestException);
    });

    it('rejectKot enforces mandatory non-empty reason', async () => {
      const { service } = createTestOrdersService();

      await expect(
        service.rejectKot('branch-1', 'kot-1', 'user-1', {
          reason: '',
          mayRejectStarted: false,
        }),
      ).rejects.toThrow('A reason is required');

      await expect(
        service.rejectKot('branch-1', 'kot-1', 'user-1', {
          reason: '   \n  \t ',
          mayRejectStarted: false,
        }),
      ).rejects.toThrow('A reason is required');
    });

    it('rejectKot rejects tickets in PREPARING status only when confirmed by manager', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.kot.findFirst.mockResolvedValue({
        id: 'kot-prep-1',
        status: 'PREPARING',
        order: {
          id: 'ord-1',
          status: 'OPEN',
          payments: [],
          kots: [],
        },
        items: [{ orderItemId: 'oi-1', orderItem: { nameSnapshot: 'Fish', quantity: 1, lineTotal: 100 } }],
      });

      // 1. Kitchen staff without orders.cancel permission cannot reject cooking ticket
      await expect(
        service.rejectKot('branch-1', 'kot-prep-1', 'user-kitchen', {
          reason: 'Burnt food',
          mayRejectStarted: false,
        }),
      ).rejects.toThrow(ForbiddenException);

      // 2. Manager with permission but without explicit confirmStarted gets 409 confirmation prompt
      await expect(
        service.rejectKot('branch-1', 'kot-prep-1', 'user-manager', {
          reason: 'Burnt food',
          mayRejectStarted: true,
          confirmStarted: false,
        }),
      ).rejects.toThrow(ConflictException);

      // 3. Manager with permission and confirmStarted: true succeeds
      const result = await service.rejectKot('branch-1', 'kot-prep-1', 'user-manager', {
        reason: 'Burnt food',
        mayRejectStarted: true,
        confirmStarted: true,
      });

      expect(prisma.kot.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'kot-prep-1', status: 'PREPARING' },
          data: expect.objectContaining({ status: 'REJECTED', rejectReason: 'Burnt food' }),
        }),
      );
    });

    it('rejectKot blocks rejection of terminal READY or SERVED tickets', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-ready-1',
        status: 'READY',
        order: { id: 'ord-1', status: 'OPEN', payments: [], kots: [] },
        items: [],
      });

      await expect(
        service.rejectKot('branch-1', 'kot-ready-1', 'user-1', {
          reason: 'Too late',
          mayRejectStarted: true,
        }),
      ).rejects.toThrow(ConflictException);

      prisma.kot.findFirst.mockResolvedValueOnce({
        id: 'kot-served-1',
        status: 'SERVED',
        order: { id: 'ord-1', status: 'OPEN', payments: [], kots: [] },
        items: [],
      });

      await expect(
        service.rejectKot('branch-1', 'kot-served-1', 'user-1', {
          reason: 'Customer left',
          mayRejectStarted: true,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('3. Dual 80mm & 58mm Thermal Print Layouts (Feature 12)', () => {
    const sampleOrder = {
      orderNumber: '8801',
      type: 'DINE_IN',
      createdAt: new Date('2026-10-28T14:30:00Z'),
      table: { label: 'T-07' },
      customer: { name: 'Vikram' },
      waiterName: 'Suresh Kumar',
      waiterId: 'waiter-sk01',
      items: [
        {
          nameSnapshot: 'Paneer Butter Masala',
          quantity: 2,
          kitchenNote: 'Medium spicy please',
          modifiers: [{ nameSnapshot: 'Extra Butter' }],
        },
      ],
    };

    it('buildKotHtml accurately formats 80mm vs 58mm CSS dimensions, page sizes and fonts', () => {
      const html80 = buildKotHtml({
        branchName: 'Spice Court',
        order: sampleOrder,
        paperWidthMm: 80,
      });

      expect(html80).toContain('width: 80mm');
      expect(html80).toContain('@page { size: 80mm auto; margin: 0; }');
      expect(html80).toContain('font-size: 13px');
      expect(html80).toContain('font-size: 16px'); // table font
      expect(html80).toContain('Waiter: Suresh Kumar');
      expect(html80).toContain('Server: Suresh Kumar (ID: waiter-sk01)');

      const html58 = buildKotHtml({
        branchName: 'Spice Court',
        order: sampleOrder,
        paperWidthMm: 58,
      });

      expect(html58).toContain('width: 58mm');
      expect(html58).toContain('@page { size: 58mm auto; margin: 0; }');
      expect(html58).toContain('font-size: 11px'); // smaller body font for 58mm
      expect(html58).toContain('font-size: 13px'); // table font for 58mm
    });

    it('buildKotHtml escapes HTML entities in order and waiter attributes to prevent injection', () => {
      const injectionOrder = {
        ...sampleOrder,
        orderNumber: '<script>alert(1)</script>',
        waiterName: 'John & "Jane" <Admin>',
        waiterId: 'id-001',
      };

      const html = buildKotHtml({
        branchName: 'Bistro <1>',
        order: injectionOrder,
      });

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('Bistro &lt;1&gt;');
      expect(html).toContain('John &amp; &quot;Jane&quot; &lt;Admin&gt;');
    });

    it('buildKotEscPosJob enforces 48-column formatting on 80mm and 32-column formatting on 58mm', () => {
      const job80 = buildKotEscPosJob({
        branchName: 'Spice Court',
        order: sampleOrder,
        profile: resolveProfile({ paperWidthMm: 80 }),
      });
      const decoded80 = readJob(job80.buffer);
      for (const line of decoded80.lines) {
        expect(line.length).toBeLessThanOrEqual(48);
      }

      const job58 = buildKotEscPosJob({
        branchName: 'Spice Court',
        order: sampleOrder,
        profile: resolveProfile({ paperWidthMm: 58 }),
      });
      const decoded58 = readJob(job58.buffer);
      for (const line of decoded58.lines) {
        expect(line.length).toBeLessThanOrEqual(32);
      }
    });

    it('buildKotEscPosJob produces valid ESC/POS byte sequence with ESC @ init and GS V 0 cut', () => {
      const job = buildKotEscPosJob({
        branchName: 'Spice Court',
        order: sampleOrder,
        profile: resolveProfile({ paperWidthMm: 80 }),
      });

      const buffer = job.buffer;
      expect(buffer.length).toBeGreaterThan(50);

      // ESC @ init: [0x1B, 0x40]
      expect(buffer[0]).toBe(0x1b);
      expect(buffer[1]).toBe(0x40);

      // GS V 0 cut command: [0x1D, 0x56, 0x00]
      const len = buffer.length;
      expect(buffer[len - 3]).toBe(0x1d);
      expect(buffer[len - 2]).toBe(0x56);
      expect(buffer[len - 1]).toBe(0x00);
    });
  });

  describe('4. Waiter Identification Attribution (Feature 13)', () => {
    it('OrdersService.createOrder captures userId as createdById', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-1',
          name: 'Dal Makhani',
          price: 220,
          taxRatePercent: 5,
          isActive: true,
          branchId: 'branch-1',
        },
      ]);

      prisma.order.create.mockImplementation(async ({ data }: any) => ({
        id: 'ord-w1',
        ...data,
        items: data.items.create,
      }));
      prisma.order.findFirst.mockResolvedValue({
        id: 'ord-w1',
        orderNumber: '20261028-0001',
        createdById: 'waiter-user-42',
        items: [],
      });

      await service.createOrder('branch-1', 'waiter-user-42', {
        type: 'DINE_IN',
        items: [{ menuItemId: 'item-1', quantity: 1, modifierIds: [] }],
      });

      expect(prisma.order.create).toHaveBeenCalled();
      const createArgs = prisma.order.create.mock.calls[0][0];
      expect(createArgs.data.createdById).toBe('waiter-user-42');
    });

    it('buildKotEscPosJob prominently formats Waiter in header and Server with ID in footer', () => {
      const job = buildKotEscPosJob({
        branchName: 'Grand Cafe',
        order: {
          orderNumber: '5501',
          type: 'DINE_IN',
          createdAt: new Date('2026-10-28T12:00:00Z'),
          table: { label: 'T-10' },
          customer: { name: 'Arjun' },
          waiterName: 'Priya Patel',
          waiterId: 'staff-pp99',
          items: [{ nameSnapshot: 'Masala Chai', quantity: 2, kitchenNote: null, modifiers: [] }],
        },
      });

      const { text } = readJob(job.buffer);
      expect(text).toContain('Waiter: Priya Patel');
      expect(text).toContain('Server: Priya Patel (ID: staff-pp99)');
    });

    it('omits waiter attribution cleanly when order has no waiter information', () => {
      const job = buildKotEscPosJob({
        branchName: 'Online Cloud Kitchen',
        order: {
          orderNumber: 'ONLINE-01',
          type: 'TAKEAWAY',
          createdAt: new Date('2026-10-28T12:00:00Z'),
          table: null,
          customer: { name: 'Online Guest' },
          waiterName: null,
          waiterId: null,
          items: [{ nameSnapshot: 'Biryani', quantity: 1, kitchenNote: null, modifiers: [] }],
        },
      });

      const { text } = readJob(job.buffer);
      expect(text).not.toContain('Waiter:');
      expect(text).not.toContain('Server:');
    });
  });
});
