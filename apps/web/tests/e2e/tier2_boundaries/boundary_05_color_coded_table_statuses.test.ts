import assert from "node:assert/strict";
import { test } from "node:test";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Boundary 5: Color-Coded Table Statuses - assigning order to OUT_OF_SERVICE table is rejected", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T1" });

  manager.setStatus(table.id, "OUT_OF_SERVICE");
  assert.equal(manager.getStatusColor(table.status).colorName, "gray");

  assert.throws(
    () => manager.assignOrder(table.id, "ord-fail"),
    /Cannot assign order to table in state OUT_OF_SERVICE/,
  );
});

test("Boundary 5: Color-Coded Table Statuses - assigning order to CLEANING table is rejected", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T2" });

  manager.setStatus(table.id, "CLEANING");
  assert.throws(
    () => manager.assignOrder(table.id, "ord-fail"),
    /Cannot assign order to table in state CLEANING/,
  );
});

test("Boundary 5: Color-Coded Table Statuses - assigning order to BILLED table is rejected", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T3" });

  manager.assignOrder(table.id, "ord-1");
  manager.setStatus(table.id, "BILLED");

  assert.throws(
    () => manager.assignOrder(table.id, "ord-2"),
    /Cannot assign order to table in state BILLED/,
  );
});

test("Boundary 5: Color-Coded Table Statuses - re-releasing an already AVAILABLE table is idempotent", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T4" });

  assert.equal(table.status, "AVAILABLE");
  manager.releaseTable(table.id);
  assert.equal(table.status, "AVAILABLE");
  assert.equal(table.activeOrderId, undefined);
});

test("Boundary 5: Color-Coded Table Statuses - rapid status cycling through all valid states", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T5" });

  manager.setStatus(table.id, "OCCUPIED");
  assert.equal(manager.getStatusColor(table.status).hex, "#f59e0b");

  manager.setStatus(table.id, "BILLED");
  assert.equal(manager.getStatusColor(table.status).hex, "#3b82f6");

  manager.setStatus(table.id, "CLEANING");
  assert.equal(manager.getStatusColor(table.status).hex, "#a855f7");

  manager.setStatus(table.id, "AVAILABLE");
  assert.equal(manager.getStatusColor(table.status).hex, "#22c55e");
});
