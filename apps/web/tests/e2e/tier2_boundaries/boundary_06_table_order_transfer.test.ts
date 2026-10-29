import assert from "node:assert/strict";
import { test } from "node:test";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Boundary 6: Table Order Transfer - transferring order to self (same table) is blocked", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T1" });
  manager.assignOrder(table.id, "ord-1");

  // Attempting to transfer to same table (which is OCCUPIED)
  assert.throws(
    () => manager.transferOrder(table.id, table.id),
    /Target table T1 is not AVAILABLE/,
  );
});

test("Boundary 6: Table Order Transfer - transferring order with non-existent target table throws error", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T1" });
  manager.assignOrder(table.id, "ord-1");

  assert.throws(
    () => manager.transferOrder(table.id, "ghost-target-id"),
    /Table ghost-target-id not found/,
  );
});

test("Boundary 6: Table Order Transfer - chained order transfers across multiple tables in sequence", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2" });
  const t3 = manager.createTable({ floorId: floor.id, number: "T3" });

  manager.assignOrder(t1.id, "chain-order");

  // Transfer T1 -> T2
  manager.transferOrder(t1.id, t2.id);
  assert.equal(t1.status, "AVAILABLE");
  assert.equal(t2.status, "OCCUPIED");

  // Transfer T2 -> T3
  manager.transferOrder(t2.id, t3.id);
  assert.equal(t2.status, "AVAILABLE");
  assert.equal(t3.status, "OCCUPIED");
  assert.equal(t3.activeOrderId, "chain-order");
});

test("Boundary 6: Table Order Transfer - transfer preserves waiter assignment from source table", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2" });

  manager.assignOrder(t1.id, "ord-preserve", "waiter-special-id");
  const res = manager.transferOrder(t1.id, t2.id);

  assert.equal(res.targetTable.assignedWaiterId, "waiter-special-id");
  assert.equal(res.sourceTable.assignedWaiterId, undefined);
});

test("Boundary 6: Table Order Transfer - transferring order with zero items or newly seated table", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2" });

  manager.assignOrder(t1.id, "empty-cart-order");
  const res = manager.transferOrder(t1.id, t2.id);
  assert.equal(res.success, true);
  assert.equal(res.orderId, "empty-cart-order");
});
