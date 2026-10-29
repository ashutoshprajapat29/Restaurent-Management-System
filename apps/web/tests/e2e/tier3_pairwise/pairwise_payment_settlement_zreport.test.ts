import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Pairwise: Cash Tender With Change x Z-Report - change given does not inflate cash sales total", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(2000); // 2000 float

  // Customer bill is 350, tenders 500, change is 150
  const settle = engine.settleOrder({
    orderId: "ord-change-z",
    totalAmount: 350,
    payments: [{ method: "CASH", amount: 350, tendered: 500 }],
  });

  assert.equal(settle.totalChange, 150);
  assert.equal(settle.totalPaid, 350);

  // Z-report cashSales must be 350 (NOT 500)
  // Expected cash = 2000 + 350 = 2350
  const z = engine.generateDailyZReport(2350);
  assert.equal(z.cashSales, 350);
  assert.equal(z.expectedCash, 2350);
  assert.equal(z.cashVariance, 0);
});

test("Pairwise: Dynamic UPI QR Settlement x Multi-Tender Split x Drawer Expenses", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);

  // Generate UPI QR for 500 of a 1000 bill
  const upi = engine.generateUpiQr({
    vpa: "bistro@icici",
    payeeName: "Bistro",
    amount: 500,
    orderNumber: "ORD-99",
  });
  assert.equal(upi.isValid, true);

  // Settle 500 via UPI and 500 via Cash (tendered 500)
  engine.settleOrder({
    orderId: "ORD-99",
    totalAmount: 1000,
    payments: [
      { method: "UPI", amount: 500, reference: "UPI-99-REF" },
      { method: "CASH", amount: 500, tendered: 500 },
    ],
  });

  // Pay 200 petty cash for ice
  engine.recordExpense("Ice", 200);

  // Expected cash = 1000 (float) + 500 (cash sale) - 200 (expense) = 1300
  // UPI sale is tracked separately (500)
  const z = engine.generateDailyZReport(1300);
  assert.equal(z.cashSales, 500);
  assert.equal(z.upiSales, 500);
  assert.equal(z.totalSales, 1000);
  assert.equal(z.cashExpenses, 200);
  assert.equal(z.expectedCash, 1300);
  assert.equal(z.cashVariance, 0);
});

test("Pairwise: Partial Settlement Followed by Final Settlement Across Multiple Shifts", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(500);

  // Guest pays 300 deposit on 800 bill via Card
  const part = engine.settleOrder({
    orderId: "bill-800",
    totalAmount: 800,
    payments: [{ method: "CARD", amount: 300 }],
    allowPartial: true,
  });
  assert.equal(part.balanceRemaining, 500);

  // Later settles remaining 500 via Cash with 500 tendered
  const final = engine.settleOrder({
    orderId: "bill-800",
    totalAmount: part.balanceRemaining,
    payments: [{ method: "CASH", amount: 500, tendered: 500 }],
  });
  assert.equal(final.fullyPaid, true);

  const z = engine.generateDailyZReport(1000);
  assert.equal(z.cardSales, 300);
  assert.equal(z.cashSales, 500);
  assert.equal(z.totalSales, 800);
  assert.equal(z.expectedCash, 1000); // 500 float + 500 cash
});

test("Pairwise: Cash Drawer Deficit Discrepancy Tracking in Z-Report", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);

  engine.settleOrder({
    orderId: "c1",
    totalAmount: 400,
    payments: [{ method: "CASH", amount: 400, tendered: 400 }],
  });

  // Expected cash: 1400. Counted: 1350 (shortage of 50)
  const z = engine.generateDailyZReport(1350);
  assert.equal(z.cashVariance, -50);
  assert.equal(z.expectedCash, 1400);
  assert.equal(z.countedCash, 1350);
});

test("Pairwise: Multi-Order Multi-Method Busy Day Settlement Reconciliation", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(2500); // 2500 float

  // 3 Orders
  engine.settleOrder({ orderId: "1", totalAmount: 450, payments: [{ method: "CASH", amount: 450, tendered: 500 }] });
  engine.settleOrder({ orderId: "2", totalAmount: 650, payments: [{ method: "UPI", amount: 650 }] });
  engine.settleOrder({ orderId: "3", totalAmount: 1200, payments: [{ method: "CARD", amount: 1200 }] });

  // 1 Expense: 300
  engine.recordExpense("Vegetables", 300);

  // Expected cash: 2500 + 450 - 300 = 2650
  const z = engine.generateDailyZReport(2650);
  assert.equal(z.totalSales, 2300);
  assert.equal(z.expectedCash, 2650);
  assert.equal(z.cashVariance, 0);
});
