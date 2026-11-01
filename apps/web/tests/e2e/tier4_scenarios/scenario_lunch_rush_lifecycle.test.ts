import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";

test("Scenario 1: Complete High-Volume Lunch Rush Lifecycle", () => {
  // 1. Morning Setup: Cashier opens till with 2000 INR float
  const settlement = new SettlementDrawerEngine();
  settlement.openDrawer(2000);
  assert.equal(settlement.isTillOpen(), true);

  // 2. Staff Setup & Shared Terminal Login
  const auth = new AuthRbacEngine();
  const waiter1 = auth.createStaff({ id: "w-1", name: "Waiter Vikram", role: "WAITER", pin: "1001", branchIds: ["b1"] });
  const waiter2 = auth.createStaff({ id: "w-2", name: "Waiter Sneha", role: "WAITER", pin: "1002", branchIds: ["b1"] });
  const cashier = auth.createStaff({ id: "c-1", name: "Cashier Manoj", role: "CASHIER", pin: "2001", branchIds: ["b1"] });

  // 3. Tables Setup
  const tables = new TableFloorManager();
  const floor = tables.createFloor("b1", "Main Dining");
  const t1 = tables.createTable({ floorId: floor.id, number: "T1", capacity: 4 });
  const t2 = tables.createTable({ floorId: floor.id, number: "T2", capacity: 2 });

  // 4. Kitchen Setup
  const kds = new KotKdsEngine();

  // --- Order 1: Table 1 (Dine-in by Waiter Vikram) ---
  auth.switchStaffWithPin("1001");
  assert.equal(auth.getActiveStaff()?.name, "Waiter Vikram");

  tables.assignOrder(t1.id, "ORD-RUSH-1", waiter1.id);
  assert.equal(t1.status, "OCCUPIED");

  const pos1 = new PosCartEngine();
  pos1.registerMenuItem({ id: "m-biryani", name: "Hyderabadi Biryani", price: 350, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos1.registerMenuItem({ id: "m-raita", name: "Mint Raita", price: 60, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });

  pos1.addItem({ menuItemId: "m-biryani", quantity: 2 });
  pos1.addItem({ menuItemId: "m-raita", quantity: 2 });
  const total1 = pos1.calculateTotals().total; // 700 + 120 = 820

  const kot1 = kds.createKot({
    orderNumber: "RUSH-1",
    orderType: "DINE_IN",
    tableNumber: t1.number,
    waiterId: waiter1.id,
    waiterName: waiter1.name,
    items: [
      { id: "1", name: "Hyderabadi Biryani", quantity: 2, stationName: "Main Kitchen" },
      { id: "2", name: "Mint Raita", quantity: 2, stationName: "Pantry" },
    ],
  });
  assert.equal(kot1.status, "NEW");
  assert.equal(kot1.waiterName, "Waiter Vikram");

  // Kitchen accepts and prepares
  kds.updateStatus(kot1.id, "ACCEPTED");
  kds.updateStatus(kot1.id, "PREPARING");
  kds.updateStatus(kot1.id, "READY");
  kds.updateStatus(kot1.id, "SERVED");

  // --- Order 2: Table 2 (Dine-in by Waiter Sneha) ---
  auth.switchStaffWithPin("1002");
  assert.equal(auth.getActiveStaff()?.name, "Waiter Sneha");

  tables.assignOrder(t2.id, "ORD-RUSH-2", waiter2.id);
  const pos2 = new PosCartEngine();
  pos2.registerMenuItem({ id: "m-paneer", name: "Kadai Paneer", price: 280, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos2.registerMenuItem({ id: "m-roti", name: "Butter Roti", price: 30, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });

  pos2.addItem({ menuItemId: "m-paneer", quantity: 1 });
  pos2.addItem({ menuItemId: "m-roti", quantity: 4 });
  const total2 = pos2.calculateTotals().total; // 280 + 120 = 400

  // --- Midday Emergency Petty Cash: Milk delivery ---
  settlement.recordExpense("Dairy Supply", 240, "Emergency Milk for Tea");

  // --- Settlement: Table 1 requests bill, Cashier steps up ---
  tables.setStatus(t1.id, "BILLED");
  assert.equal(t1.status, "BILLED");

  auth.switchStaffWithPin("2001"); // Cashier Manoj
  assert.equal(auth.getActiveStaff()?.name, "Cashier Manoj");

  // Settle Table 1 via Split: 500 Cash (tendered 500) + 320 UPI
  const settle1 = settlement.settleOrder({
    orderId: "ORD-RUSH-1",
    totalAmount: total1,
    payments: [
      { method: "CASH", amount: 500, tendered: 500 },
      { method: "UPI", amount: 320, reference: "UPI-TXN-RUSH-1" },
    ],
  });
  assert.equal(settle1.fullyPaid, true);
  tables.releaseTable(t1.id);
  assert.equal(t1.status, "AVAILABLE");

  // Settle Table 2 via Cash: 400 (tendered 500 note, change 100)
  const settle2 = settlement.settleOrder({
    orderId: "ORD-RUSH-2",
    totalAmount: total2,
    payments: [{ method: "CASH", amount: 400, tendered: 500 }],
  });
  assert.equal(settle2.fullyPaid, true);
  assert.equal(settle2.totalChange, 100);
  tables.releaseTable(t2.id);
  assert.equal(t2.status, "AVAILABLE");

  // --- End of Shift Z-Report Closing ---
  // Opening Float: 2000
  // Cash Sales: 500 (Table 1) + 400 (Table 2) = 900
  // Cash Expense: 240
  // Expected Cash = 2000 + 900 - 240 = 2660
  // Counted Cash: 2660
  const z = settlement.generateDailyZReport(2660, "2026-10-28");
  assert.equal(z.openingFloat, 2000);
  assert.equal(z.cashSales, 900);
  assert.equal(z.upiSales, 320);
  assert.equal(z.totalSales, 1220);
  assert.equal(z.cashExpenses, 240);
  assert.equal(z.expectedCash, 2660);
  assert.equal(z.countedCash, 2660);
  assert.equal(z.cashVariance, 0);
});
