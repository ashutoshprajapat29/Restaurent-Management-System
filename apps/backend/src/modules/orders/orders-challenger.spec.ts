import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

function createMockPrisma() {
  const prisma: any = {
    branch: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'branch-1',
        autoConfirmOrders: true,
        taxMode: 'INCLUSIVE',
      }),
    },
    menuItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    modifier: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    modifierGroup: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    menuItemModifierGroup: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    table: {
      findFirst: jest.fn().mockResolvedValue({ id: 'table-1' }),
      update: jest.fn().mockResolvedValue({ id: 'table-1', status: 'OCCUPIED' }),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue({ id: 'cust-1' }),
    },
    order: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'order-mock-id',
        branchId: 'branch-1',
        orderNumber: 'ORD-1',
        status: 'OPEN',
        items: [],
        payments: [],
        table: null,
        customer: null,
        createdBy: { id: 'user-1', name: 'Server' },
      }),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({
        id: 'order-mock-id',
        status: 'OPEN',
        ...data,
      })),
      count: jest.fn().mockResolvedValue(0),
    },
    orderItem: {
      create: jest.fn(),
    },
    kot: {
      create: jest.fn().mockResolvedValue({ id: 'kot-1' }),
      count: jest.fn().mockResolvedValue(0),
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
  const audit = { log: jest.fn() };
  const notifications = { sendOrderNotification: jest.fn() };
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

  return { service, prisma, realtime };
}

describe('Challenger M3: POS Ordering, Cart & Stock Controls Empirical Tests', () => {
  describe('Backend Rejection of Inactive Items (Out-of-Stock / 86ed)', () => {
    it('ordersService.createOrder throws BadRequestException when single item is inactive', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-burger-86',
          name: 'Truffle Cheeseburger',
          price: 250,
          taxRatePercent: 5,
          isActive: false, // 86ed
          branchId: 'branch-1',
        },
      ]);

      await expect(
        service.createOrder('branch-1', 'user-1', {
          type: 'DINE_IN',
          items: [{ menuItemId: 'item-burger-86', quantity: 1, modifierIds: [] }],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.createOrder('branch-1', 'user-1', {
          type: 'DINE_IN',
          items: [{ menuItemId: 'item-burger-86', quantity: 1, modifierIds: [] }],
        }),
      ).rejects.toThrow('Item "Truffle Cheeseburger" is OUT OF STOCK and cannot be ordered');
    });

    it('ordersService.createOrder throws BadRequestException when 1 of 5 items is inactive', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-1', name: 'Item 1', price: 100, taxRatePercent: 5, isActive: true, branchId: 'branch-1' },
        { id: 'item-2', name: 'Item 2', price: 150, taxRatePercent: 5, isActive: true, branchId: 'branch-1' },
        { id: 'item-3', name: 'Sold Out Item', price: 200, taxRatePercent: 5, isActive: false, branchId: 'branch-1' },
        { id: 'item-4', name: 'Item 4', price: 250, taxRatePercent: 5, isActive: true, branchId: 'branch-1' },
        { id: 'item-5', name: 'Item 5', price: 300, taxRatePercent: 5, isActive: true, branchId: 'branch-1' },
      ]);

      await expect(
        service.createOrder('branch-1', 'user-1', {
          type: 'TAKEAWAY',
          items: [
            { menuItemId: 'item-1', quantity: 1, modifierIds: [] },
            { menuItemId: 'item-2', quantity: 2, modifierIds: [] },
            { menuItemId: 'item-3', quantity: 1, modifierIds: [] },
            { menuItemId: 'item-4', quantity: 1, modifierIds: [] },
            { menuItemId: 'item-5', quantity: 3, modifierIds: [] },
          ],
        }),
      ).rejects.toThrow('Item "Sold Out Item" is OUT OF STOCK and cannot be ordered');

      // Verify transaction was never opened
      expect(prisma.order.create).not.toHaveBeenCalled();
    });

    it('ordersService.addItems throws BadRequestException when adding inactive item to open order', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.order.findFirst.mockResolvedValue({
        id: 'order-123',
        branchId: 'branch-1',
        status: 'OPEN',
        items: [],
        payments: [],
      });

      prisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-salmon-86',
          name: 'Atlantic Salmon',
          price: 450,
          taxRatePercent: 5,
          isActive: false, // 86ed
          branchId: 'branch-1',
        },
      ]);

      await expect(
        service.addItems('branch-1', 'order-123', [
          { menuItemId: 'item-salmon-86', quantity: 1, modifierIds: [] },
        ]),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.addItems('branch-1', 'order-123', [
          { menuItemId: 'item-salmon-86', quantity: 1, modifierIds: [] },
        ]),
      ).rejects.toThrow('Item "Atlantic Salmon" is OUT OF STOCK and cannot be ordered');

      expect(prisma.orderItem.create).not.toHaveBeenCalled();
    });

    it('ordersService.addItems throws BadRequestException when second item of batch is inactive', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.order.findFirst.mockResolvedValue({
        id: 'order-456',
        branchId: 'branch-1',
        status: 'OPEN',
        items: [],
        payments: [],
      });

      prisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-active', name: 'Fresh Salad', price: 120, taxRatePercent: 5, isActive: true, branchId: 'branch-1' },
        { id: 'item-inactive', name: 'Daily Special Soup', price: 90, taxRatePercent: 5, isActive: false, branchId: 'branch-1' },
      ]);

      await expect(
        service.addItems('branch-1', 'order-456', [
          { menuItemId: 'item-active', quantity: 1, modifierIds: [] },
          { menuItemId: 'item-inactive', quantity: 1, modifierIds: [] },
        ]),
      ).rejects.toThrow('Item "Daily Special Soup" is OUT OF STOCK and cannot be ordered');

      expect(prisma.orderItem.create).not.toHaveBeenCalled();
    });
  });

  describe('Kitchen Notes Attachment & Persistence', () => {
    it('persists kitchenNote into created order lines in createOrder', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-curry',
          name: 'Paneer Butter Masala',
          price: 260,
          taxRatePercent: 5,
          isActive: true,
          branchId: 'branch-1',
        },
      ]);

      prisma.order.create.mockImplementation(async ({ data }: any) => {
        return {
          id: 'order-created-1',
          ...data,
          items: data.items.create.map((it: any, idx: number) => ({
            id: `order-item-${idx}`,
            ...it,
          })),
        };
      });

      await service.createOrder('branch-1', 'user-1', {
        type: 'DINE_IN',
        items: [
          {
            menuItemId: 'item-curry',
            quantity: 1,
            modifierIds: [],
            kitchenNote: 'Extra spicy, no coriander',
          },
          {
            menuItemId: 'item-curry',
            quantity: 1,
            modifierIds: [],
            kitchenNote: 'Mild spice for kids',
          },
        ],
      });

      expect(prisma.order.create).toHaveBeenCalled();
      const createArgs = prisma.order.create.mock.calls[0][0];
      const createdItems = createArgs.data.items.create;

      expect(createdItems).toHaveLength(2);
      expect(createdItems[0].kitchenNote).toBe('Extra spicy, no coriander');
      expect(createdItems[1].kitchenNote).toBe('Mild spice for kids');
    });

    it('persists kitchenNote into new order items in addItems', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.order.findFirst.mockResolvedValue({
        id: 'order-existing',
        branchId: 'branch-1',
        status: 'OPEN',
        items: [],
        payments: [],
      });

      prisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-naan',
          name: 'Butter Naan',
          price: 45,
          taxRatePercent: 5,
          isActive: true,
          branchId: 'branch-1',
        },
      ]);

      prisma.orderItem.create.mockImplementation(async ({ data }: any) => ({
        id: 'order-item-naan-1',
        ...data,
      }));

      await service.addItems('branch-1', 'order-existing', [
        {
          menuItemId: 'item-naan',
          quantity: 2,
          modifierIds: [],
          kitchenNote: 'Crispy well-done please',
        },
      ]);

      expect(prisma.orderItem.create).toHaveBeenCalled();
      const callData = prisma.orderItem.create.mock.calls[0][0].data;
      expect(callData.kitchenNote).toBe('Crispy well-done please');
      expect(callData.quantity).toBe(2);
    });
  });

  describe('Modifier Bounds & Price Adjustments', () => {
    it('accurately handles positive and negative modifier price adjustments in line calculation', async () => {
      const { service, prisma } = createTestOrdersService();

      prisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item-combo',
          name: 'Burger Meal Combo',
          price: 200,
          taxRatePercent: 5,
          isActive: true,
          branchId: 'branch-1',
        },
      ]);

      prisma.modifier.findMany.mockResolvedValue([
        {
          id: 'mod-extra-patty',
          name: 'Double Patty',
          priceAdjustment: 75,
          groupId: 'grp-1',
        },
        {
          id: 'mod-no-fries',
          name: 'Remove Fries Discount',
          priceAdjustment: -30,
          groupId: 'grp-2',
        },
      ]);

      prisma.menuItemModifierGroup.findMany.mockResolvedValue([
        {
          menuItemId: 'item-combo',
          modifierGroup: {
            id: 'grp-1',
            branchId: 'branch-1',
            minSelect: 0,
            maxSelect: 1,
            modifiers: [
              { id: 'mod-extra-patty', name: 'Double Patty', priceAdjustment: 75 },
            ],
          },
        },
        {
          menuItemId: 'item-combo',
          modifierGroup: {
            id: 'grp-2',
            branchId: 'branch-1',
            minSelect: 0,
            maxSelect: 1,
            modifiers: [
              { id: 'mod-no-fries', name: 'Remove Fries Discount', priceAdjustment: -30 },
            ],
          },
        },
      ]);

      prisma.order.create.mockImplementation(async ({ data }: any) => ({
        id: 'order-mod-1',
        ...data,
        items: data.items.create,
      }));

      await service.createOrder('branch-1', 'user-1', {
        type: 'TAKEAWAY',
        items: [
          {
            menuItemId: 'item-combo',
            quantity: 1,
            modifierIds: ['mod-extra-patty', 'mod-no-fries'],
          },
        ],
      });

      const createArgs = prisma.order.create.mock.calls[0][0];
      const createdItem = createArgs.data.items.create[0];

      // Base 200 + 75 - 30 = 245
      expect(Number(createdItem.lineTotal)).toBe(245);
      expect(createdItem.modifiers.create).toHaveLength(2);
      expect(Number(createdItem.modifiers.create[0].priceAdjSnapshot)).toBe(75);
      expect(Number(createdItem.modifiers.create[1].priceAdjSnapshot)).toBe(-30);
    });
  });
});
