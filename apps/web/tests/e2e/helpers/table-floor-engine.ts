/**
 * Floor & Table Spatial & Status Engine (Opaque-Box Helper)
 * Implements interactive floor spatial coordinates, color-coded statuses,
 * and table order transfers.
 */

export type TableStatus = "AVAILABLE" | "OCCUPIED" | "BILLED" | "CLEANING" | "OUT_OF_SERVICE";
export type TableShape = "square" | "round" | "rect";

export interface TableEntity {
  id: string;
  floorId: string;
  number: string;
  name?: string;
  capacity: number;
  status: TableStatus;
  statusSince: Date;
  posX: number;
  posY: number;
  width: number;
  height: number;
  rotation: number;
  shape: TableShape;
  color?: string;
  assignedWaiterId?: string;
  activeOrderId?: string;
}

export interface FloorEntity {
  id: string;
  branchId: string;
  name: string;
  sortOrder: number;
}

export class TableFloorManager {
  private floors = new Map<string, FloorEntity>();
  private tables = new Map<string, TableEntity>();

  createFloor(branchId: string, name: string, sortOrder = 0): FloorEntity {
    const id = `floor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const floor: FloorEntity = { id, branchId, name, sortOrder };
    this.floors.set(id, floor);
    return floor;
  }

  createTable(params: {
    floorId: string;
    number: string;
    name?: string;
    capacity?: number;
    posX?: number;
    posY?: number;
    width?: number;
    height?: number;
    rotation?: number;
    shape?: TableShape;
    color?: string;
  }): TableEntity {
    const id = `tbl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const table: TableEntity = {
      id,
      floorId: params.floorId,
      number: params.number,
      name: params.name ?? `Table ${params.number}`,
      capacity: params.capacity ?? 4,
      status: "AVAILABLE",
      statusSince: new Date(),
      posX: params.posX ?? 0,
      posY: params.posY ?? 0,
      width: params.width ?? 80,
      height: params.height ?? 80,
      rotation: params.rotation ?? 0,
      shape: params.shape ?? "square",
      color: params.color,
    };
    this.tables.set(id, table);
    return table;
  }

  getTable(id: string): TableEntity {
    const table = this.tables.get(id);
    if (!table) throw new Error(`Table ${id} not found`);
    return table;
  }

  updateLayout(id: string, coords: { posX: number; posY: number; width?: number; height?: number; rotation?: number }): TableEntity {
    const table = this.getTable(id);
    table.posX = coords.posX;
    table.posY = coords.posY;
    if (coords.width !== undefined) table.width = coords.width;
    if (coords.height !== undefined) table.height = coords.height;
    if (coords.rotation !== undefined) table.rotation = coords.rotation;
    return table;
  }

  setStatus(id: string, status: TableStatus): TableEntity {
    const table = this.getTable(id);
    table.status = status;
    table.statusSince = new Date();
    return table;
  }

  getStatusColor(status: TableStatus): { colorName: string; hex: string } {
    switch (status) {
      case "AVAILABLE":
        return { colorName: "green", hex: "#22c55e" };
      case "OCCUPIED":
        return { colorName: "amber", hex: "#f59e0b" };
      case "BILLED":
        return { colorName: "blue", hex: "#3b82f6" };
      case "CLEANING":
        return { colorName: "purple", hex: "#a855f7" };
      case "OUT_OF_SERVICE":
      default:
        return { colorName: "gray", hex: "#6b7280" };
    }
  }

  assignOrder(tableId: string, orderId: string, waiterId?: string): TableEntity {
    const table = this.getTable(tableId);
    if (table.status !== "AVAILABLE" && table.status !== "OCCUPIED") {
      throw new Error(`Cannot assign order to table in state ${table.status}`);
    }
    table.activeOrderId = orderId;
    table.status = "OCCUPIED";
    table.statusSince = new Date();
    if (waiterId) table.assignedWaiterId = waiterId;
    return table;
  }

  transferOrder(sourceTableId: string, targetTableId: string): {
    success: boolean;
    orderId: string;
    sourceTable: TableEntity;
    targetTable: TableEntity;
  } {
    const source = this.getTable(sourceTableId);
    const target = this.getTable(targetTableId);

    if (!source.activeOrderId) {
      throw new Error(`Source table ${source.number} has no active order to transfer`);
    }
    if (target.status !== "AVAILABLE") {
      throw new Error(`Target table ${target.number} is not AVAILABLE (current: ${target.status})`);
    }

    const orderId = source.activeOrderId;
    const waiterId = source.assignedWaiterId;

    // Release source table
    source.activeOrderId = undefined;
    source.assignedWaiterId = undefined;
    source.status = "AVAILABLE";
    source.statusSince = new Date();

    // Occupy target table
    target.activeOrderId = orderId;
    target.assignedWaiterId = waiterId;
    target.status = "OCCUPIED";
    target.statusSince = new Date();

    return {
      success: true,
      orderId,
      sourceTable: source,
      targetTable: target,
    };
  }

  releaseTable(tableId: string): TableEntity {
    const table = this.getTable(tableId);
    table.activeOrderId = undefined;
    table.status = "AVAILABLE";
    table.statusSince = new Date();
    return table;
  }
}
