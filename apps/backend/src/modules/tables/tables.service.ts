import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BulkTableCreateDto,
  FloorDto,
  FloorUpdateDto,
  TableDto,
  TableLayoutUpdateDto,
  TableStatusDto,
  TableUpdateDto,
  TransferOrderDto,
} from '@nodedr-restaurant/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  listFloors(branchId: string) {
    return this.prisma.floor.findMany({
      where: { branchId },
      orderBy: { sortOrder: 'asc' },
      include: {
        tables: {
          include: { assignedWaiter: { select: { id: true, name: true } } },
        },
      },
    });
  }

  createFloor(branchId: string, dto: FloorDto) {
    return this.prisma.floor.create({ data: { ...dto, branchId } });
  }

  async updateFloor(branchId: string, id: string, dto: FloorUpdateDto) {
    await this.assertFloorInBranch(branchId, id);
    return this.prisma.floor.update({ where: { id }, data: dto });
  }

  async createTable(branchId: string, dto: TableDto) {
    await this.assertFloorInBranch(branchId, dto.floorId);
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { restaurantId: true },
    });
    if (branch) {
      await this.subscriptionService.checkTableQuota(branch.restaurantId, 1);
    }
    const table = await this.prisma.table.create({ data: dto });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async createTables(branchId: string, dto: BulkTableCreateDto) {
    await this.assertFloorInBranch(branchId, dto.floorId);

    const numbers = dto.numbers.map((n) => n.trim()).filter(Boolean);
    const duplicatesInBatch = numbers.filter(
      (n, i) => numbers.indexOf(n) !== i,
    );
    if (duplicatesInBatch.length > 0) {
      throw new BadRequestException(
        `Table numbers must be unique: ${[...new Set(duplicatesInBatch)].join(', ')} ${duplicatesInBatch.length > 1 ? 'are' : 'is'} repeated.`,
      );
    }

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { restaurantId: true },
    });
    if (branch) {
      await this.subscriptionService.checkTableQuota(
        branch.restaurantId,
        numbers.length,
      );
    }

    const existing = await this.prisma.table.findMany({
      where: { floorId: dto.floorId, number: { in: numbers } },
      select: { number: true },
    });
    if (existing.length > 0) {
      const clashes = existing.map((t) => t.number).join(', ');
      throw new BadRequestException(
        `These table numbers already exist on this floor: ${clashes}. Choose different numbers.`,
      );
    }

    const tables = await this.prisma.$transaction(
      numbers.map((number, index) =>
        this.prisma.table.create({
          data: {
            floorId: dto.floorId,
            number,
            capacity: dto.capacity,
            shape: dto.shape,
            color: dto.color,
            posX: 20 + (index % 5) * 100,
            posY: 20 + Math.floor(index / 5) * 100,
          },
        }),
      ),
    );
    tables.forEach((table) =>
      this.realtime.emitToBranch(branchId, 'table.updated', table),
    );
    return tables;
  }

  async updateTable(branchId: string, id: string, dto: TableUpdateDto) {
    await this.assertTableInBranch(branchId, id);
    const table = await this.prisma.table.update({ where: { id }, data: dto });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async updateTableLayout(branchId: string, updates: TableLayoutUpdateDto[]) {
    const owned = await this.prisma.table.findMany({
      where: { id: { in: updates.map((u) => u.id) }, floor: { branchId } },
      select: { id: true },
    });
    if (owned.length !== updates.length) {
      throw new BadRequestException(
        'One or more tables are invalid for this branch',
      );
    }

    const results = await this.prisma.$transaction(
      updates.map(({ id, ...rest }) =>
        this.prisma.table.update({ where: { id }, data: rest }),
      ),
    );
    this.realtime.emitToBranch(branchId, 'table.layout.updated', results);
    return results;
  }

  async updateTableStatus(
    branchId: string,
    id: string,
    status: TableStatusDto,
    assignedWaiterId?: string,
  ) {
    await this.assertTableInBranch(branchId, id);
    // A table with an unpaid bill cannot be marked free/reserved/cleaning by
    // hand - that is how a live order ended up hidden behind an "Available"
    // tile. Pay or cancel the bill first (both release the table themselves).
    if (status !== 'OCCUPIED' && status !== 'BILLED') {
      const open = await this.prisma.order.findFirst({
        where: { tableId: id, status: { in: ['OPEN', 'BILLED'] } },
        select: { orderNumber: true },
      });
      if (open) {
        throw new ConflictException(
          `This table has an open bill (#${open.orderNumber}) - pay or cancel it first`,
        );
      }
    }
    const table = await this.prisma.table.update({
      where: { id },
      data: {
        status,
        statusSince: new Date(),
        ...(assignedWaiterId ? { assignedWaiterId } : {}),
      },
    });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async transferOrder(
    branchId: string,
    dto: TransferOrderDto,
    _userId?: string,
  ) {
    if (dto.sourceTableId === dto.targetTableId) {
      throw new BadRequestException('Cannot transfer an order to the same table');
    }

    const source = await this.prisma.table.findFirst({
      where: { id: dto.sourceTableId, floor: { branchId } },
      include: { floor: true },
    });
    if (!source) throw new NotFoundException(`Table ${dto.sourceTableId} not found`);

    const target = await this.prisma.table.findFirst({
      where: { id: dto.targetTableId, floor: { branchId } },
      include: { floor: true },
    });
    if (!target) throw new NotFoundException(`Table ${dto.targetTableId} not found`);

    if (target.status !== 'AVAILABLE') {
      throw new BadRequestException(
        `Target table ${target.number} is not AVAILABLE (current: ${target.status})`,
      );
    }

    const occupant = await this.prisma.order.findFirst({
      where: { tableId: target.id, status: { in: ['OPEN', 'BILLED'] } },
      select: { orderNumber: true },
    });
    if (occupant) {
      throw new ConflictException(
        `Target table ${target.number} already has open bill #${occupant.orderNumber}`,
      );
    }

    const order = await this.prisma.order.findFirst({
      where: {
        ...(dto.orderId ? { id: dto.orderId } : {}),
        tableId: source.id,
        status: { in: ['OPEN', 'BILLED'] },
      },
      include: { items: true },
    });
    if (!order) {
      throw new BadRequestException(
        `Source table ${source.number} has no active order to transfer`,
      );
    }

    const waiterId = source.assignedWaiterId;

    const targetStatus = order.status === 'BILLED' ? 'BILLED' : 'OCCUPIED';

    await this.prisma.$transaction(async (tx) => {
      const targetUpdate = typeof tx.table.updateMany === 'function'
        ? await tx.table.updateMany({
            where: { id: target.id, status: 'AVAILABLE' },
            data: {
              status: targetStatus,
              statusSince: new Date(),
              ...(waiterId ? { assignedWaiterId: waiterId } : {}),
            },
          })
        : await (tx.table as any).update({
            where: { id: target.id },
            data: {
              status: targetStatus,
              statusSince: new Date(),
              ...(waiterId ? { assignedWaiterId: waiterId } : {}),
            },
          }).then(() => ({ count: 1 }));

      if (targetUpdate.count !== 1) {
        throw new ConflictException(
          `Target table ${target.number} is no longer available`,
        );
      }

      const orderUpdate = typeof tx.order.updateMany === 'function'
        ? await tx.order.updateMany({
            where: {
              id: order.id,
              tableId: source.id,
              status: { in: ['OPEN', 'BILLED'] },
            },
            data: { tableId: target.id },
          })
        : await (tx.order as any).update({
            where: { id: order.id },
            data: { tableId: target.id },
          }).then(() => ({ count: 1 }));

      if (orderUpdate.count !== 1) {
        throw new ConflictException(
          `Order #${order.orderNumber} is no longer on source table`,
        );
      }

      const stillOpen = await tx.order.count({
        where: {
          tableId: source.id,
          status: { in: ['OPEN', 'BILLED'] },
          id: { not: order.id },
        },
      });
      if (stillOpen === 0) {
        await tx.table.update({
          where: { id: source.id },
          data: {
            status: 'AVAILABLE',
            statusSince: new Date(),
            assignedWaiterId: null,
          },
        });
      }
    });

    this.realtime.emitToBranch(branchId, 'order.updated', { id: order.id });
    this.realtime.emitToBranch(branchId, 'kot.updated', { orderId: order.id });
    this.realtime.emitToBranch(branchId, 'table.updated', { id: source.id });
    this.realtime.emitToBranch(branchId, 'table.updated', { id: target.id });
    this.realtime.emitToBranch(branchId, 'table.transferred', {
      orderId: order.id,
      sourceTableId: source.id,
      targetTableId: target.id,
    });

    const updatedSource = await this.prisma.table.findUnique({ where: { id: source.id } });
    const updatedTarget = await this.prisma.table.findUnique({ where: { id: target.id } });

    return {
      success: true,
      orderId: order.id,
      updatedOrder: { ...order, tableId: target.id },
      sourceTable: {
        id: source.id,
        name: source.name ?? `Table ${source.number}`,
        status: updatedSource?.status ?? 'AVAILABLE',
        activeOrderId: undefined,
        statusSince: updatedSource?.statusSince?.toISOString() ?? new Date().toISOString(),
      },
      targetTable: {
        id: target.id,
        name: target.name ?? `Table ${target.number}`,
        status: updatedTarget?.status ?? 'OCCUPIED',
        activeOrderId: order.id,
        statusSince: updatedTarget?.statusSince?.toISOString() ?? new Date().toISOString(),
      },
    };
  }

  async deleteTable(branchId: string, id: string) {
    await this.assertTableInBranch(branchId, id);
    await this.prisma.table.delete({ where: { id } });
    this.realtime.emitToBranch(branchId, 'table.deleted', { id });
    return { ok: true };
  }

  async rotateQrToken(branchId: string, id: string) {
    const table = await this.prisma.table.findFirst({
      where: { id, floor: { branchId } },
    });
    if (!table) throw new NotFoundException('Table not found');

    // opaque, unguessable token — not the table's own id, so a leaked QR
    // image can't be used to enumerate other tables' ids/data
    const qrToken = randomBytes(16).toString('hex');
    return this.prisma.table.update({ where: { id }, data: { qrToken } });
  }

  private async assertFloorInBranch(branchId: string, floorId: string) {
    const floor = await this.prisma.floor.findFirst({
      where: { id: floorId, branchId },
    });
    if (!floor) throw new NotFoundException('Floor not found');
  }

  private async assertTableInBranch(branchId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, floor: { branchId } },
    });
    if (!table) throw new NotFoundException('Table not found');
  }

  /** Open guest requests (call waiter / bring bill) for a branch. */
  listOpenRequests(branchId: string) {
    return this.prisma.tableRequest.findMany({
      where: { branchId, resolvedAt: null },
      include: { table: { select: { id: true, number: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resolveRequest(branchId: string, id: string) {
    const request = await this.prisma.tableRequest.findFirst({
      where: { id, branchId },
    });
    if (!request) throw new NotFoundException('Request not found');
    const updated = await this.prisma.tableRequest.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
    this.realtime.emitToBranch(branchId, 'table.request', { id });
    return updated;
  }
}
