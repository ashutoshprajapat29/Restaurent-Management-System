import assert from "node:assert/strict";
import { test } from "node:test";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Feature 6: Table Order Transfer - successfully moves order from source to target table", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Indoor");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2" });

  manager.assignOrder(t1.id, "order-999", "waiter-alice");
  assert.equal(t1.status, "OCCUPIED");
  assert.equal(t2.status, "AVAILABLE");

  const result = manager.transferOrder(t1.id, t2.id);
  assert.equal(result.success, true);
  assert.equal(result.orderId, "order-999");
  assert.equal(result.sourceTable.status, "AVAILABLE");
  assert.equal(result.sourceTable.activeOrderId, undefined);
  assert.equal(result.targetTable.status, "OCCUPIED");
  assert.equal(result.targetTable.activeOrderId, "order-999");
  assert.equal(result.targetTable.assignedWaiterId, "waiter-alice");
});

test("Feature 6: Table Order Transfer - rejects transfer when source table has no active order", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Indoor");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2" });

  assert.throws(
    () => manager.transferOrder(t1.id, t2.id),
    /has no active order to transfer/,
  );
});

test("Feature 6: Table Order Transfer - rejects transfer when target table is already OCCUPIED", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Indoor");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2" });

  manager.assignOrder(t1.id, "order-1");
  manager.assignOrder(t2.id, "order-2");

  assert.throws(
    () => manager.transferOrder(t1.id, t2.id),
    /Target table T2 is not AVAILABLE \(current: OCCUPIED\)/,
  );
});

test("Feature 6: Table Order Transfer - rejects transfer when target table is in BILLED or CLEANING state", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Indoor");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2" });

  manager.assignOrder(t1.id, "order-1");
  manager.setStatus(t2.id, "CLEANING");

  assert.throws(
    () => manager.transferOrder(t1.id, t2.id),
    /Target table T2 is not AVAILABLE/,
  );
});

test("Feature 6: Table Order Transfer - releases source table so it can immediately seat new guests", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Indoor");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2" });

  manager.assignOrder(t1.id, "order-alpha");
  manager.transferOrder(t1.id, t2.id);

  // New order can immediately be placed on t1
  assert.equal(t1.status, "AVAILABLE");
  manager.assignOrder(t1.id, "order-beta");
  assert.equal(t1.activeOrderId, "order-beta");
  assert.equal(t1.status, "OCCUPIED");
});
