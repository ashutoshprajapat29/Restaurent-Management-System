import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KotPrintService } from '../orders/kot-print.service';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class KdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly kotPrint: KotPrintService,
  ) {}

  /** Stations a KDS screen can be pinned to; needs only kds.manage (not menu.manage). */
  listStations(branchId: string) {
    return this.prisma.kitchenStation.findMany({
      where: { branchId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  // A screen pinned to a station also shows tickets with no station: menu
  // items nobody assigned to a station still have to be cooked somewhere, and
  // hiding them from every pinned screen made those orders vanish.
  async listActiveTickets(branchId: string, stationId?: string) {
    return this.prisma.kot.findMany({
      where: {
        order: { branchId },
        status: { notIn: ['SERVED', 'CANCELLED', 'REJECTED'] },
        ...(stationId ? { OR: [{ stationId }, { stationId: null }] } : {}),
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
  }

  // Incoming orders (website / QR) that nobody has accepted yet. They have no
  // kitchen ticket until accepted, so without this the kitchen screen could
  // not show them at all.
  listIncoming(branchId: string) {
    return this.prisma.order.findMany({
      where: { branchId, status: 'OPEN', acceptance: 'PENDING' },
      select: {
        id: true,
        orderNumber: true,
        type: true,
        channel: true,
        guestName: true,
        notes: true,
        createdAt: true,
        scheduledFor: true,
        table: { select: { number: true, name: true } },
        customer: { select: { name: true, phone: true } },
        items: {
          select: {
            id: true,
            nameSnapshot: true,
            quantity: true,
            kitchenNote: true,
            modifiers: { select: { nameSnapshot: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // What a waiter or cashier may see of the kitchen: where each live ticket
  // is, with no customer contact details. Open to anyone who can take orders.
  async progress(branchId: string) {
    const kots = await this.prisma.kot.findMany({
      where: {
        order: { branchId, status: 'OPEN' },
        status: { notIn: ['CANCELLED', 'REJECTED'] },
      },
      select: {
        id: true,
        orderId: true,
        status: true,
        createdAt: true,
        readyAt: true,
        order: {
          select: {
            orderNumber: true,
            type: true,
            table: { select: { id: true, number: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return kots;
  }

  updateStatus(
    branchId: string,
    kotId: string,
    status: string,
    userId?: string,
  ) {
    return this.ordersService.updateKotStatus(branchId, kotId, status, userId);
  }

  rejectTicket(
    branchId: string,
    kotId: string,
    userId: string,
    input: {
      reason: string;
      confirmStarted?: boolean;
      mayRejectStarted: boolean;
    },
  ) {
    return this.ordersService.rejectKot(branchId, kotId, userId, input);
  }

  acceptIncoming(branchId: string, orderId: string, userId: string) {
    return this.ordersService.acceptOrder(branchId, orderId, userId);
  }

  declineIncoming(
    branchId: string,
    orderId: string,
    userId: string,
    reason: string,
  ) {
    return this.ordersService.rejectOrder(branchId, orderId, userId, reason);
  }

  // Prints the ticket on the kitchen printer. `reprint` must be explicit for a
  // ticket that was already printed; the paper says REPRINT in that case.
  print(branchId: string, kotId: string, reprint: boolean) {
    return this.kotPrint.printTicket(branchId, kotId, reprint);
  }

  setPriority(branchId: string, kotId: string, isPriority: boolean) {
    return this.ordersService.setKotPriority(branchId, kotId, isPriority);
  }

  async getPerformanceReport(branchId: string, date?: string) {
    const start = date ? new Date(date) : new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const kots = await this.prisma.kot.findMany({
      where: {
        order: { branchId },
        createdAt: { gte: start, lt: end },
        readyAt: { not: null },
      },
      select: {
        stationId: true,
        createdAt: true,
        readyAt: true,
        station: { select: { name: true } },
      },
    });

    const byStation = new Map<
      string,
      { name: string; totalMinutes: number; count: number }
    >();
    for (const kot of kots) {
      const key = kot.stationId ?? 'unassigned';
      const name = kot.station?.name ?? 'Unassigned';
      const minutes =
        (kot.readyAt!.getTime() - kot.createdAt.getTime()) / 60_000;
      const bucket = byStation.get(key) ?? { name, totalMinutes: 0, count: 0 };
      bucket.totalMinutes += minutes;
      bucket.count += 1;
      byStation.set(key, bucket);
    }

    return Array.from(byStation.entries()).map(([stationId, bucket]) => ({
      stationId,
      stationName: bucket.name,
      ticketsReady: bucket.count,
      avgMinutesToReady:
        Math.round((bucket.totalMinutes / bucket.count) * 10) / 10,
    }));
  }
}
