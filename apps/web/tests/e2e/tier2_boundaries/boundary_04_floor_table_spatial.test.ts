import assert from "node:assert/strict";
import { test } from "node:test";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Boundary 4: Floor & Table Spatial Management - table placed at extreme 0,0 coordinates", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T-0", posX: 0, posY: 0 });

  assert.equal(table.posX, 0);
  assert.equal(table.posY, 0);
});

test("Boundary 4: Floor & Table Spatial Management - negative rotation degrees normalization", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const table = manager.createTable({ floorId: floor.id, number: "T-neg", rotation: -90 });

  assert.equal(table.rotation, -90);
});

test("Boundary 4: Floor & Table Spatial Management - large dimension dimensions for banquet table", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Banquet Hall");
  const table = manager.createTable({
    floorId: floor.id,
    number: "BANQUET-1",
    capacity: 24,
    width: 600,
    height: 200,
    shape: "rect",
  });

  assert.equal(table.capacity, 24);
  assert.equal(table.width, 600);
  assert.equal(table.height, 200);
});

test("Boundary 4: Floor & Table Spatial Management - table number with symbols and spaces", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Balcony");
  const table = manager.createTable({ floorId: floor.id, number: "Balcony #4-A (VIP)" });

  assert.equal(table.number, "Balcony #4-A (VIP)");
});

test("Boundary 4: Floor & Table Spatial Management - multiple tables sharing same coordinate without collision crash", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("b1", "Main");
  const t1 = manager.createTable({ floorId: floor.id, number: "T1", posX: 100, posY: 100 });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2", posX: 100, posY: 100 });

  assert.equal(t1.posX, t2.posX);
  assert.equal(t1.posY, t2.posY);
  assert.notEqual(t1.id, t2.id);
});
