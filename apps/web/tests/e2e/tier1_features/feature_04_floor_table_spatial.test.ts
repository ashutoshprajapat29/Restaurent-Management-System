import assert from "node:assert/strict";
import { test } from "node:test";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Feature 4: Floor & Table Spatial Management - creates floor and adds spatial tables", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Ground Floor", 1);
  const table = manager.createTable({
    floorId: floor.id,
    number: "G1",
    capacity: 4,
    posX: 10.5,
    posY: 20.0,
    width: 90,
    height: 90,
    shape: "square",
  });

  assert.equal(table.floorId, floor.id);
  assert.equal(table.number, "G1");
  assert.equal(table.posX, 10.5);
  assert.equal(table.posY, 20.0);
  assert.equal(table.shape, "square");
});

test("Feature 4: Floor & Table Spatial Management - updates table spatial positioning on canvas drag", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Rooftop");
  const table = manager.createTable({ floorId: floor.id, number: "R1", posX: 0, posY: 0 });

  const updated = manager.updateLayout(table.id, {
    posX: 55.4,
    posY: 82.1,
    rotation: 45,
  });

  assert.equal(updated.posX, 55.4);
  assert.equal(updated.posY, 82.1);
  assert.equal(updated.rotation, 45);
});

test("Feature 4: Floor & Table Spatial Management - supports round, square, and rectangular table shapes", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Main Hall");

  const t1 = manager.createTable({ floorId: floor.id, number: "T1", shape: "square" });
  const t2 = manager.createTable({ floorId: floor.id, number: "T2", shape: "round" });
  const t3 = manager.createTable({ floorId: floor.id, number: "T3", shape: "rect", width: 140, height: 80 });

  assert.equal(t1.shape, "square");
  assert.equal(t2.shape, "round");
  assert.equal(t3.shape, "rect");
  assert.equal(t3.width, 140);
});

test("Feature 4: Floor & Table Spatial Management - maintains distinct coordinates per table", () => {
  const manager = new TableFloorManager();
  const floor = manager.createFloor("branch-01", "Patio");

  const t1 = manager.createTable({ floorId: floor.id, number: "P1", posX: 10, posY: 10 });
  const t2 = manager.createTable({ floorId: floor.id, number: "P2", posX: 30, posY: 40 });

  assert.notEqual(t1.posX, t2.posX);
  assert.notEqual(t1.posY, t2.posY);
});

test("Feature 4: Floor & Table Spatial Management - throws error when retrieving invalid table ID", () => {
  const manager = new TableFloorManager();
  assert.throws(() => manager.getTable("unknown-table-id"), /not found/);
});
