/**
 * KOT, KDS Queue & Thermal Receipt Engine (Opaque-Box Helper)
 * Implements digital kitchen display, live timers, station routing,
 * waiter identification attribution, and 80mm/58mm thermal ticket layout.
 */

export type KotStatus = "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "SERVED" | "REJECTED";

export interface KotItem {
  id: string;
  name: string;
  quantity: number;
  portion?: string;
  modifiers?: string[];
  kitchenNote?: string;
  stationName: string;
}

export interface KotTicket {
  id: string;
  orderNumber: string;
  orderType: "DINE_IN" | "TAKEAWAY";
  tableNumber?: string;
  waiterId: string;
  waiterName: string;
  status: KotStatus;
  items: KotItem[];
  createdAt: Date;
  stationId?: string;
  rejectionReason?: string;
}

export class KotKdsEngine {
  private tickets = new Map<string, KotTicket>();

  createKot(params: {
    orderNumber: string;
    orderType: "DINE_IN" | "TAKEAWAY";
    tableNumber?: string;
    waiterId: string;
    waiterName: string;
    items: KotItem[];
    stationId?: string;
    createdAt?: Date;
  }): KotTicket {
    const id = `kot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const ticket: KotTicket = {
      id,
      orderNumber: params.orderNumber,
      orderType: params.orderType,
      tableNumber: params.tableNumber,
      waiterId: params.waiterId,
      waiterName: params.waiterName,
      status: "NEW",
      items: params.items,
      createdAt: params.createdAt ?? new Date(),
      stationId: params.stationId,
    };
    this.tickets.set(id, ticket);
    return ticket;
  }

  getTicket(id: string): KotTicket {
    const ticket = this.tickets.get(id);
    if (!ticket) throw new Error(`KOT ticket ${id} not found`);
    return ticket;
  }

  updateStatus(id: string, newStatus: KotStatus, reason?: string): KotTicket {
    const ticket = this.getTicket(id);
    const validTransitions: Record<KotStatus, KotStatus[]> = {
      NEW: ["ACCEPTED", "PREPARING", "REJECTED"],
      ACCEPTED: ["PREPARING", "READY", "REJECTED"],
      PREPARING: ["READY", "REJECTED"],
      READY: ["SERVED"],
      SERVED: [],
      REJECTED: [],
    };

    if (!validTransitions[ticket.status].includes(newStatus)) {
      throw new Error(`Invalid KOT status transition from ${ticket.status} to ${newStatus}`);
    }

    ticket.status = newStatus;
    if (newStatus === "REJECTED" && reason) {
      ticket.rejectionReason = reason;
    }
    return ticket;
  }

  getElapsedMinutes(id: string, asOf = new Date()): number {
    const ticket = this.getTicket(id);
    const diffMs = asOf.getTime() - ticket.createdAt.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60)));
  }

  getTicketsForStation(stationName: string): KotTicket[] {
    return Array.from(this.tickets.values()).filter((t) =>
      t.items.some((item) => item.stationName === stationName),
    );
  }

  /**
   * Generates thermal receipt format formatted for 80mm (48 cols) or 58mm (32 cols).
   * Verifies inclusion of waiter identification, order number, table, and items.
   */
  renderThermalLayout(id: string, paperWidthMm: 58 | 80 = 80): {
    header: string;
    body: string;
    footer: string;
    columns: number;
    text: string;
  } {
    const ticket = this.getTicket(id);
    const cols = paperWidthMm === 80 ? 48 : 32;
    const divider = "-".repeat(cols);

    const pad = (left: string, right: string) => {
      const space = cols - left.length - right.length;
      return space > 0 ? left + " ".repeat(space) + right : `${left} ${right}`.slice(0, cols);
    };

    const header = [
      "=".repeat(cols),
      `*** KITCHEN ORDER TICKET (KOT) ***`.padStart((cols + 32) / 2),
      pad(`Order: #${ticket.orderNumber}`, `Type: ${ticket.orderType}`),
      ticket.tableNumber ? pad(`Table: ${ticket.tableNumber}`, `Waiter: ${ticket.waiterName}`) : pad(`Takeaway`, `Waiter: ${ticket.waiterName}`),
      `Time: ${ticket.createdAt.toISOString().slice(11, 19)}`,
      divider,
    ].join("\n");

    const bodyLines: string[] = [];
    for (const it of ticket.items) {
      const line = pad(`${it.quantity}x ${it.name}`, `[${it.stationName}]`);
      bodyLines.push(line);
      if (it.modifiers && it.modifiers.length > 0) {
        bodyLines.push(`   + ${it.modifiers.join(", ")}`);
      }
      if (it.kitchenNote) {
        bodyLines.push(`   Note: ${it.kitchenNote}`);
      }
    }
    const body = bodyLines.join("\n");

    const footer = [
      divider,
      `Server: ${ticket.waiterName} (ID: ${ticket.waiterId})`,
      "=".repeat(cols),
    ].join("\n");

    const text = `${header}\n${body}\n${footer}`;
    return { header, body, footer, columns: cols, text };
  }

  /**
   * Generates standard ESC/POS command byte sequence for thermal printing.
   */
  encodeEscPos(id: string, paperWidthMm: 58 | 80 = 80): Uint8Array {
    const layout = this.renderThermalLayout(id, paperWidthMm);
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(layout.text);

    // ESC @ (Initialize printer) = [0x1B, 0x40]
    // ESC a 1 (Center align) = [0x1B, 0x61, 0x01]
    // GS V 0 (Cut paper) = [0x1D, 0x56, 0x00]
    const initCmd = new Uint8Array([0x1b, 0x40]);
    const lineFeeds = new Uint8Array([0x0a, 0x0a, 0x0a]);
    const cutCmd = new Uint8Array([0x1d, 0x56, 0x00]);

    const totalLen = initCmd.length + textBytes.length + lineFeeds.length + cutCmd.length;
    const result = new Uint8Array(totalLen);

    let offset = 0;
    result.set(initCmd, offset);
    offset += initCmd.length;
    result.set(textBytes, offset);
    offset += textBytes.length;
    result.set(lineFeeds, offset);
    offset += lineFeeds.length;
    result.set(cutCmd, offset);

    return result;
  }
}
