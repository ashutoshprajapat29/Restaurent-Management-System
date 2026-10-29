import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Boundary 18: Daily Z-Report Closing - zero cash sales during entire business day", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1500);

  // Only digital sales (UPI & Card)
  engine.settleOrder({ orderId: "d1", totalAmount: 400, payments: [{ method: "UPI", amount: 400 }] });
  engine.settleOrder({ orderId: "d2", totalAmount: 600, payments: [{ method: "CARD", amount: 600 }] });

  const z = engine.generateDailyZReport(1500);
  assert.equal(z.cashSales, 0);
  assert.equal(z.upiSales, 400);
  assert.equal(z.cardSales, 600);
  assert.equal(z.totalSales, 1000);
  assert.equal(z.expectedCash, 1500); // exactly opening float
  assert.equal(z.cashVariance, 0);
});

test("Boundary 18: Daily Z-Report Closing - generating Z-report with closed till throws error", () => {
  const engine = new SettlementDrawerEngine();
  // Drawer not opened
  assert.throws(() => engine.generateDailyZReport(1000), /Cash drawer is not open/);
});

test("Boundary 18: Daily Z-Report Closing - counted cash of zero when expected cash is non-zero (empty till theft)", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);
  engine.settleOrder({ orderId: "o1", totalAmount: 500, payments: [{ method: "CASH", amount: 500 }] });

  // Expected 1500, but counted 0
  const z = engine.generateDailyZReport(0);
  assert.equal(z.expectedCash, 1500);
  assert.equal(z.countedCash, 0);
  assert.equal(z.cashVariance, -1500);
});

test("Boundary 18: Daily Z-Report Closing - negative counted cash input throws validation error", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(500);
  assert.throws(() => engine.generateDailyZReport(-20), /Counted cash cannot be negative/);
});

test("Boundary 18: Daily Z-Report Closing - multi-date and refund variance arithmetic", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);

  engine.settleOrder({ orderId: "o1", totalAmount: 800, payments: [{ method: "CASH", amount: 800 }] });
  engine.recordRefund(300, "CASH");
  engine.recordExpense("Cleaners", 100);

  // Expected: 1000 + 800 - 300 - 100 = 1400
  const z = engine.generateDailyZReport(1400, "2026-10-31");
  assert.equal(z.businessDate, "2026-10-31");
  assert.equal(z.expectedCash, 1400);
  assert.equal(z.cashVariance, 0);
});
