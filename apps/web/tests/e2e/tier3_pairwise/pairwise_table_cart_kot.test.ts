import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Pairwise: Table Status x Dine-In Cart x KOT Generation - seats table, orders with modifiers, and emits KOT", () => {
  const tableManager = new TableFloorManager();
  const floor = tableManager.createFloor("branch-01", "Main Hall");
  const table = tableManager.createTable({ floorId: floor.id, number: "T-01", capacity: 4 });

  const pos = new PosCartEngine();
  pos.orderType = "DINE_IN";
  pos.tableId = table.id;

  pos.registerModifierGroup({
    id: "g-spice",
    name: "Spice",
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [{ id: "s-med", name: "Medium Spice", priceAdjustment: 0 }],
  });
  pos.registerMenuItem({
    id: "m-curry",
    name: "Chicken Tikka Masala",
    price: 360,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["g-spice"],
    stationId: "st-kitchen",
  });

  const cartLine = pos.addItem({
    menuItemId: "m-curry",
    quantity: 2,
    modifierIds: ["s-med"],
    kitchenNote: "Extra gravy",
  });

  // Assign order to table -> becomes OCCUPIED
  tableManager.assignOrder(table.id, "ORD-7001", "waiter-dan");
  assert.equal(table.status, "OCCUPIED");

  // Create KOT
  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "7001",
    orderType: "DINE_IN",
    tableNumber: table.number,
    waiterId: "waiter-dan",
    waiterName: "Dan",
    items: [
      {
        id: cartLine.lineId,
        name: cartLine.itemName,
        quantity: cartLine.quantity,
        modifiers: ["Medium Spice"],
        kitchenNote: cartLine.kitchenNote,
        stationName: "Main Kitchen",
      },
    ],
  });

  assert.equal(kot.status, "NEW");
  assert.equal(kot.tableNumber, "T-01");
  assert.equal(kot.waiterName, "Dan");
  assert.equal(kot.items[0].quantity, 2);
  assert.equal(kot.items[0].modifiers?.[0], "Medium Spice");

  const thermal = kds.renderThermalLayout(kot.id, 80);
  assert.ok(thermal.text.includes("Table: T-01"));
  assert.ok(thermal.text.includes("Waiter: Dan"));
  assert.ok(thermal.text.includes("2x Chicken Tikka Masala"));
});

test("Pairwise: Table Transfer x Open Cart x Waiter Attribution - transfers table and carries open order and server", () => {
  const tableManager = new TableFloorManager();
  const floor = tableManager.createFloor("branch-01", "Terrace");
  const tableSmall = tableManager.createTable({ floorId: floor.id, number: "T-S2", capacity: 2 });
  const tableLarge = tableManager.createTable({ floorId: floor.id, number: "T-L6", capacity: 6 });

  tableManager.assignOrder(tableSmall.id, "ORD-TRANSFER-10", "waiter-elena");
  assert.equal(tableSmall.status, "OCCUPIED");
  assert.equal(tableLarge.status, "AVAILABLE");

  // Guest party grows -> transfer to large table
  const transfer = tableManager.transferOrder(tableSmall.id, tableLarge.id);
  assert.equal(transfer.success, true);
  assert.equal(transfer.sourceTable.status, "AVAILABLE");
  assert.equal(transfer.targetTable.status, "OCCUPIED");
  assert.equal(transfer.targetTable.assignedWaiterId, "waiter-elena");

  // Kitchen ticket updated for new table
  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "TRANSFER-10",
    orderType: "DINE_IN",
    tableNumber: tableLarge.number,
    waiterId: "waiter-elena",
    waiterName: "Elena",
    items: [{ id: "i1", name: "Dessert Platter", quantity: 1, stationName: "Dessert" }],
  });

  const thermal = kds.renderThermalLayout(kot.id, 80);
  assert.ok(thermal.text.includes("Table: T-L6"));
  assert.ok(thermal.text.includes("Waiter: Elena"));
});

test("Pairwise: Takeaway Cart x Instant Print - no table association, immediate KOT print with cashier attribution", () => {
  const pos = new PosCartEngine();
  pos.orderType = "TAKEAWAY";
  pos.registerMenuItem({
    id: "item-roll",
    name: "Kathi Roll",
    price: 140,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });
  const line = pos.addItem({ menuItemId: "item-roll", quantity: 3 });

  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "TK-902",
    orderType: "TAKEAWAY",
    waiterId: "cashier-01",
    waiterName: "Cashier Mohan",
    items: [{ id: line.lineId, name: line.itemName, quantity: line.quantity, stationName: "Snacks" }],
  });

  assert.equal(kot.tableNumber, undefined);
  const layout = kds.renderThermalLayout(kot.id, 58);
  assert.ok(layout.text.includes("Takeaway"));
  assert.ok(layout.text.includes("Waiter: Cashier Mohan"));
});

test("Pairwise: Cart Line Removal Before KOT vs After KOT Dispatch", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({ id: "m1", name: "Soup", price: 100, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos.registerMenuItem({ id: "m2", name: "Bread", price: 50, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });

  const l1 = pos.addItem({ menuItemId: "m1", quantity: 1 });
  const l2 = pos.addItem({ menuItemId: "m2", quantity: 2 });

  // Guest changes mind before kitchen receives order -> remove line
  pos.removeLine(l1.lineId);
  assert.equal(pos.getLines().length, 1);
  assert.equal(pos.getLines()[0].menuItemId, "m2");

  // Only remaining line sent to kitchen
  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "8008",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Waitperson",
    items: [{ id: l2.lineId, name: "Bread", quantity: 2, stationName: "Bakery" }],
  });
  assert.equal(kot.items.length, 1);
});

test("Pairwise: Billed Table Status Lock - bill printed table cannot accept new cart lines until settlement or reset", () => {
  const tableManager = new TableFloorManager();
  const floor = tableManager.createFloor("branch-01", "Dine");
  const table = tableManager.createTable({ floorId: floor.id, number: "T-Billed" });

  tableManager.assignOrder(table.id, "ord-finish");
  tableManager.setStatus(table.id, "BILLED");
  assert.equal(table.status, "BILLED");

  // Re-assigning or moving into BILLED table is rejected
  assert.throws(
    () => tableManager.assignOrder(table.id, "ord-new"),
    /Cannot assign order to table in state BILLED/,
  );

  // Settlement releases table back to AVAILABLE
  tableManager.releaseTable(table.id);
  assert.equal(table.status, "AVAILABLE");
});
