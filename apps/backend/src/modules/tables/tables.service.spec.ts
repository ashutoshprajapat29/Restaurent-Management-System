import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { SubscriptionService } from '../subscription/subscription.service';
import { TablesService } from './tables.service';

describe('TablesService - Quota Gating & Table Management', () => {
  let service: TablesService;

  const mockBranch = {
    id: 'branch-1',
    restaurantId: 'rest-1',
    name: 'Main Branch',
  };

  const mockFloor = {
    id: 'floor-1',
    branchId: 'branch-1',
    name: 'Ground Floor',
  };

  const mockPrisma = {
    floor: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    branch: {
      findUnique: jest.fn(),
    },
    table: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((arg) =>
      typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg),
    ),
  };

  const mockRealtime = {
    emitToBranch: jest.fn(),
  };

  const mockSubscription = {
    checkTableQuota: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSubscription.checkTableQuota.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeGateway, useValue: mockRealtime },
        { provide: SubscriptionService, useValue: mockSubscription },
      ],
    }).compile();

    service = module.get<TablesService>(TablesService);
  });

  describe('createTable', () => {
    it('checks quota on restaurant before creating single table', async () => {
      mockPrisma.floor.findFirst.mockResolvedValue(mockFloor);
      mockPrisma.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrisma.table.create.mockResolvedValue({
        id: 'table-1',
        floorId: 'floor-1',
        number: '1',
      });

      const result = await service.createTable('branch-1', {
        floorId: 'floor-1',
        number: '1',
        capacity: 4,
        posX: 0,
        posY: 0,
        width: 80,
        height: 80,
        rotation: 0,
        shape: 'square',
      });

      expect(mockSubscription.checkTableQuota).toHaveBeenCalledWith(
        'rest-1',
        1,
      );
      expect(mockPrisma.table.create).toHaveBeenCalled();
      expect(mockRealtime.emitToBranch).toHaveBeenCalledWith(
        'branch-1',
        'table.updated',
        result,
      );
    });

    it('propagates BadRequestException if quota is exceeded', async () => {
      mockPrisma.floor.findFirst.mockResolvedValue(mockFloor);
      mockPrisma.branch.findUnique.mockResolvedValue(mockBranch);
      mockSubscription.checkTableQuota.mockRejectedValue(
        new BadRequestException('Table limit reached'),
      );

      await expect(
        service.createTable('branch-1', {
          floorId: 'floor-1',
          number: '99',
          capacity: 4,
          posX: 0,
          posY: 0,
          width: 80,
          height: 80,
          rotation: 0,
          shape: 'square',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.table.create).not.toHaveBeenCalled();
    });
  });

  describe('createTables (bulk)', () => {
    it('checks quota for the total batch size before creating tables', async () => {
      mockPrisma.floor.findFirst.mockResolvedValue(mockFloor);
      mockPrisma.branch.findUnique.mockResolvedValue(mockBranch);
      mockPrisma.table.findMany.mockResolvedValue([]); // no clashes
      mockPrisma.table.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: `tbl-${data.number}`, ...data }),
      );

      const result = await service.createTables('branch-1', {
        floorId: 'floor-1',
        numbers: ['101', '102', '103'],
        capacity: 4,
        shape: 'square',
      });

      expect(mockSubscription.checkTableQuota).toHaveBeenCalledWith(
        'rest-1',
        3,
      );
      expect(result).toHaveLength(3);
      expect(mockRealtime.emitToBranch).toHaveBeenCalledTimes(3);
    });

    it('rejects batch if quota would be exceeded', async () => {
      mockPrisma.floor.findFirst.mockResolvedValue(mockFloor);
      mockPrisma.branch.findUnique.mockResolvedValue(mockBranch);
      mockSubscription.checkTableQuota.mockRejectedValue(
        new BadRequestException('Table limit reached'),
      );

      await expect(
        service.createTables('branch-1', {
          floorId: 'floor-1',
          numbers: ['101', '102', '103', '104', '105'],
          capacity: 4,
          shape: 'square',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.table.create).not.toHaveBeenCalled();
    });
  });

  describe('transferOrder', () => {
    const mockSourceTable = {
      id: 'table-src',
      number: 'T1',
      name: 'Table 1',
      status: 'OCCUPIED',
      statusSince: new Date(),
      assignedWaiterId: 'waiter-1',
    };

    const mockTargetTable = {
      id: 'table-tgt',
      number: 'T2',
      name: 'Table 2',
      status: 'AVAILABLE',
      statusSince: new Date(),
    };

    const mockOrder = {
      id: 'order-101',
      tableId: 'table-src',
      status: 'OPEN',
      items: [{ id: 'item-1', nameSnapshot: 'Curry' }],
    };

    it('successfully transfers order to an available target table', async () => {
      mockPrisma.table.findFirst
        .mockResolvedValueOnce(mockSourceTable)
        .mockResolvedValueOnce(mockTargetTable);
      mockPrisma.order.findFirst
        .mockResolvedValueOnce(null) // no occupant on target
        .mockResolvedValueOnce(mockOrder); // order on source
      mockPrisma.order.update.mockResolvedValue({
        ...mockOrder,
        tableId: 'table-tgt',
      });
      mockPrisma.table.update.mockResolvedValue({});
      mockPrisma.order.count.mockResolvedValue(0); // no other orders on source
      mockPrisma.table.findUnique
        .mockResolvedValueOnce({ ...mockSourceTable, status: 'AVAILABLE' })
        .mockResolvedValueOnce({ ...mockTargetTable, status: 'OCCUPIED' });

      const res = await service.transferOrder('branch-1', {
        sourceTableId: 'table-src',
        targetTableId: 'table-tgt',
      });

      expect(res.success).toBe(true);
      expect(res.orderId).toBe('order-101');
      expect(res.sourceTable.status).toBe('AVAILABLE');
      expect(res.targetTable.status).toBe('OCCUPIED');
      expect(mockRealtime.emitToBranch).toHaveBeenCalledWith(
        'branch-1',
        'table.transferred',
        expect.objectContaining({
          orderId: 'order-101',
          sourceTableId: 'table-src',
          targetTableId: 'table-tgt',
        }),
      );
    });

    it('rejects transfer to the same table', async () => {
      await expect(
        service.transferOrder('branch-1', {
          sourceTableId: 'table-src',
          targetTableId: 'table-src',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transfer when target table is not AVAILABLE', async () => {
      mockPrisma.table.findFirst
        .mockResolvedValueOnce(mockSourceTable)
        .mockResolvedValueOnce({ ...mockTargetTable, status: 'OCCUPIED' });

      await expect(
        service.transferOrder('branch-1', {
          sourceTableId: 'table-src',
          targetTableId: 'table-tgt',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects transfer when source table has no active order', async () => {
      mockPrisma.table.findFirst
        .mockResolvedValueOnce(mockSourceTable)
        .mockResolvedValueOnce(mockTargetTable);
      mockPrisma.order.findFirst
        .mockResolvedValueOnce(null) // no occupant on target
        .mockResolvedValueOnce(null); // no order on source

      await expect(
        service.transferOrder('branch-1', {
          sourceTableId: 'table-src',
          targetTableId: 'table-tgt',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

