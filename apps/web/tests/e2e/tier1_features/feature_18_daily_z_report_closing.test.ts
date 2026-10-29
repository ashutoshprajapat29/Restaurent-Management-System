import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Feature 18: Daily Z-Report Closing - reconciles opening float, sales, expenses, and zero variance", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000); // Opening float: 1000

  // Cash sales: 500
  engine.settleOrder({
    orderId: "o1",
    totalAmount: 500,
    payments: [{ method: "CASH", amount: 500, tendered: 500 }],
  });

  // UPI sales: 300
  engine.settleOrder({
    orderId: "o2",
    totalAmount: 300,
    payments: [{ method: "UPI", amount: 300 }],
  });

  // Petty cash expense: 150
  engine.recordExpense("Gas cylinder", 150);

  // Expected cash = 1000 (opening) + 500 (cash sales) - 150 (expense) = 1350
  const zReport = engine.generateDailyZReport(1350, "2026-10-28");

  assert.equal(zReport.openingFloat, 1000);
  assert.equal(zReport.cashSales, 500);
  assert.equal(zReport.upiSales, 300);
  assert.equal(zReport.totalSales, 800);
  assert.equal(zReport.cashExpenses, 150);
  assert.equal(zReport.expectedCash, 1350);
  assert.equal(zReport.countedCash, 1350);
  assert.equal(zReport.cashVariance, 0);
});

test("Feature 18: Daily Z-Report Closing - calculates cash discrepancy shortage variance", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);
  engine.settleOrder({
    orderId: "o-cash",
    totalAmount: 400,
    payments: [{ method: "CASH", amount: 400 }],
  });

  // Expected = 1400. Counted = 1380 (20 cash shortage)
  const zReport = engine.generateDailyZReport(1380);
  assert.equal(zReport.expectedCash, 1400);
  assert.equal(zReport.countedCash, 1380);
  assert.equal(zReport.cashVariance, -20);
});

test("Feature 18: Daily Z-Report Closing - calculates cash discrepancy overage variance", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);
  engine.settleOrder({
    orderId: "o-cash",
    totalAmount: 600,
    payments: [{ method: "CASH", amount: 600 }],
  });

  // Expected = 1600. Counted = 1650 (50 cash overage)
  const zReport = engine.generateDailyZReport(1650);
  assert.equal(zReport.expectedCash, 1600);
  assert.equal(zReport.countedCash, 1650);
  assert.equal(zReport.cashVariance, 50);
});

test("Feature 18: Daily Z-Report Closing - factors cash refunds out of expected cash", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);
  engine.settleOrder({
    orderId: "o-ref",
    totalAmount: 500,
    payments: [{ method: "CASH", amount: 500 }],
  });
  engine.recordRefund(100, "CASH");

  // Expected = 1000 + 500 - 100 = 1400
  const zReport = engine.generateDailyZReport(1400);
  assert.equal(zReport.cashRefunds, 100);
  assert.equal(zReport.expectedCash, 1400);
});

test("Feature 18: Daily Z-Report Closing - breaks down sales totals by payment tender accurately", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(500);

  engine.settleOrder({ orderId: "1", totalAmount: 200, payments: [{ method: "CASH", amount: 200 }] });
  engine.settleOrder({ orderId: "2", totalAmount: 400, payments: [{ method: "UPI", amount: 400 }] });
  engine.settleOrder({ orderId: "3", totalAmount: 600, payments: [{ method: "CARD", amount: 600 }] });
  engine.settleOrder({ orderId: "4", totalAmount: 150, payments: [{ method: "WALLET", amount: 150 }] });

  const zReport = engine.generateDailyZReport(700);
  assert.equal(zReport.tenderBreakup.CASH, 200);
  assert.equal(zReport.tenderBreakup.UPI, 400);
  assert.equal(zReport.tenderBreakup.CARD, 600);
  assert.equal(zReport.tenderBreakup.WALLET, 150);
  assert.equal(zReport.totalSales, 1350);
});
