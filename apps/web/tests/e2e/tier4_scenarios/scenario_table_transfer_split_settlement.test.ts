import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Scenario 2: Table Lifecycle with Mid-Order Transfer, Upsell & Split Tender Settlement", () => {
  const tables = new TableFloorManager();
  const floor = tables.createFloor("b1", "Bistro Lounge");
  const table4 = tables.createTable({ floorId: floor.id, number: "T4", capacity: 2 });
  const table8 = tables.createTable({ floorId: floor.id, number: "T8", capacity: 6 });

  const kds = new KotKdsEngine();
  const settlement = new SettlementDrawerEngine();
  settlement.openDrawer(1500);

  // 1. Guests seated at Table 4
  tables.assignOrder(table4.id, "ORD-401", "waiter-ravi");
  assert.equal(table4.status, "OCCUPIED");

  // 2. Initial Drinks & Starter Order
  const pos = new PosCartEngine();
  pos.orderType = "DINE_IN";
  pos.tableId = table4.id;

  pos.registerMenuItem({ id: "item-starter", name: "Loaded Nachos", price: 250, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos.registerMenuItem({ id: "item-drink", name: "Fresh Lime Soda", price: 80, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });

  const l1 = pos.addItem({ menuItemId: "item-starter", quantity: 1 });
  const l2 = pos.addItem({ menuItemId: "item-drink", quantity: 2 });

  // Initial KOT
  const kot1 = kds.createKot({
    orderNumber: "401-1",
    orderType: "DINE_IN",
    tableNumber: table4.number,
    waiterId: "waiter-ravi",
    waiterName: "Ravi",
    items: [
      { id: l1.lineId, name: l1.itemName, quantity: 1, stationName: "Kitchen" },
      { id: l2.lineId, name: l2.itemName, quantity: 2, stationName: "Bar" },
    ],
  });
  assert.equal(kot1.tableNumber, "T4");

  // 3. More guests arrive unexpectedly -> Guests request move to larger Table 8
  const transfer = tables.transferOrder(table4.id, table8.id);
  assert.equal(transfer.success, true);
  assert.equal(table4.status, "AVAILABLE");
  assert.equal(table8.status, "OCCUPIED");
  assert.equal(table8.activeOrderId, "ORD-401");

  // 4. Upsell: Main Courses & Dessert ordered on Table 8
  pos.tableId = table8.id;
  pos.registerMenuItem({ id: "item-mains", name: "Pasta Primavera", price: 340, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos.registerMenuItem({ id: "item-dessert", name: "Tiramisu", price: 210, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });

  pos.addItem({ menuItemId: "item-mains", quantity: 2 });
  pos.addItem({ menuItemId: "item-dessert", quantity: 2 });

  // Second KOT issued to Table 8
  const kot2 = kds.createKot({
    orderNumber: "401-2",
    orderType: "DINE_IN",
    tableNumber: table8.number,
    waiterId: "waiter-ravi",
    waiterName: "Ravi",
    items: [
      { id: "mains", name: "Pasta Primavera", quantity: 2, stationName: "Kitchen" },
      { id: "dessert", name: "Tiramisu", quantity: 2, stationName: "Pantry" },
    ],
  });
  assert.equal(kot2.tableNumber, "T8");

  // 5. Bill requested -> table marked BILLED
  tables.setStatus(table8.id, "BILLED");
  assert.equal(table8.status, "BILLED");

  // Total calculation:
  // Nachos (250) + 2x Lime (160) + 2x Pasta (680) + 2x Tiramisu (420) = 1510
  const totals = pos.calculateTotals();
  assert.equal(totals.total, 1510);

  // 6. Split Payment: Guest A pays 800 via Card, Guest B pays 710 via UPI
  const settle = settlement.settleOrder({
    orderId: "ORD-401",
    totalAmount: 1510,
    payments: [
      { method: "CARD", amount: 800, reference: "AUTH-SPLIT-A" },
      { method: "UPI", amount: 710, reference: "UPI-SPLIT-B" },
    ],
  });
  assert.equal(settle.fullyPaid, true);
  assert.equal(settle.balanceRemaining, 0);

  // 7. Table 8 cleaned and returned to AVAILABLE
  tables.setStatus(table8.id, "CLEANING");
  tables.releaseTable(table8.id);
  assert.equal(table8.status, "AVAILABLE");
  assert.equal(table4.status, "AVAILABLE");
});
