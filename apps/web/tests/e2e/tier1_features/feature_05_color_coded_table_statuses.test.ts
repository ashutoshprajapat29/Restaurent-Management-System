import assert from "node:assert/strict";
import { test } from "node:test";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Feature 5: Color-Coded Table Statuses - initializes newly created table as AVAILABLE (green)", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Dine In");
  const table = manager.createTable({ floorId: floor.id, number: "T1" });

  assert.equal(table.status, "AVAILABLE");
  const color = manager.getStatusColor(table.status);
  assert.equal(color.colorName, "green");
  assert.equal(color.hex, "#22c55e");
});

test("Feature 5: Color-Coded Table Statuses - transitions to OCCUPIED (amber) on order creation", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Dine In");
  const table = manager.createTable({ floorId: floor.id, number: "T2" });

  manager.assignOrder(table.id, "order-101", "waiter-01");
  assert.equal(table.status, "OCCUPIED");
  assert.equal(table.activeOrderId, "order-101");
  assert.equal(table.assignedWaiterId, "waiter-01");

  const color = manager.getStatusColor(table.status);
  assert.equal(color.colorName, "amber");
  assert.equal(color.hex, "#f59e0b");
});

test("Feature 5: Color-Coded Table Statuses - transitions to BILLED (blue) when bill is requested/printed", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Dine In");
  const table = manager.createTable({ floorId: floor.id, number: "T3" });

  manager.assignOrder(table.id, "order-102");
  manager.setStatus(table.id, "BILLED");

  assert.equal(table.status, "BILLED");
  const color = manager.getStatusColor(table.status);
  assert.equal(color.colorName, "blue");
  assert.equal(color.hex, "#3b82f6");
});

test("Feature 5: Color-Coded Table Statuses - transitions to CLEANING (purple) and returns to AVAILABLE", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Dine In");
  const table = manager.createTable({ floorId: floor.id, number: "T4" });

  manager.setStatus(table.id, "CLEANING");
  assert.equal(table.status, "CLEANING");
  assert.equal(manager.getStatusColor(table.status).colorName, "purple");

  manager.releaseTable(table.id);
  assert.equal(table.status, "AVAILABLE");
  assert.equal(manager.getStatusColor(table.status).colorName, "green");
});

test("Feature 5: Color-Coded Table Statuses - tracks status timestamp accurately across transitions", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Dine In");
  const table = manager.createTable({ floorId: floor.id, number: "T5" });

  const initialTime = table.statusSince.getTime();
  manager.setStatus(table.id, "OCCUPIED");
  const updatedTime = table.statusSince.getTime();

  assert.ok(updatedTime >= initialTime);
});
