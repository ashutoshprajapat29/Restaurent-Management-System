import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUpiUri } from "../../lib/upi.ts";
import { planPayment, parseMoney } from "../../lib/bill.ts";
import { SettlementDrawerEngine } from "./helpers/settlement-drawer-engine.ts";

// ============================================================================
// Milestone 4 Challenger Test Suite: Settlement, UPI QR, Cash Drawer & Z-Report
// ============================================================================

test("Feature 15 Challenger: buildUpiUri - strictly enforces '@' in VPA identifier", () => {
  // Empty strings, null-ish, and strings without '@' must throw
  assert.throws(() => buildUpiUri({ vpa: "", amount: 100 }), /Invalid UPI VPA/);
  assert.throws(() => buildUpiUri({ vpa: "invalidvpa", amount: 100 }), /Invalid UPI VPA/);
  assert.throws(() => buildUpiUri({ vpa: "merchant.domain.com", amount: 100 }), /Invalid UPI VPA/);
  assert.throws(() => buildUpiUri({ vpa: "1234567890", amount: 100 }), /Invalid UPI VPA/);
});

test("Feature 15 Challenger: buildUpiUri - URL encodes spaces strictly as %20 per NPCI spec (never +)", () => {
  const uri = buildUpiUri({
    vpa: "bistro@icici",
    name: "The Grand Royal Bistro & Fine Dining",
    amount: 1450.75,
    note: "Table 12 Dinner Bill #9901",
    ref: "REF-DINNER-123",
  });

  // Verify no raw plus signs used for space encoding
  assert.equal(uri.includes("+"), false, "NPCI spec forbids '+' encoding for spaces");
  assert.ok(uri.includes("pn=The%20Grand%20Royal%20Bistro%20%26%20Fine%20Dining"));
  assert.ok(uri.includes("tn=Table%2012%20Dinner%20Bill%20%239901"));
  assert.ok(uri.includes("cu=INR"));
  assert.ok(uri.includes("am=1450.75"));
  assert.ok(uri.startsWith("upi://pay?"));
});

test("Feature 15 Challenger: buildUpiUri - truncates payee name (60), note (60), and ref (35) per NPCI limits", () => {
  const longName = "A".repeat(100);
  const longNote = "B".repeat(100);
  const longRef = "C".repeat(100);

  const uri = buildUpiUri({
    vpa: "store@hdfc",
    name: longName,
    note: longNote,
    ref: longRef,
    amount: 50,
  });

  const parsedUrl = new URL(uri);
  assert.equal(parsedUrl.searchParams.get("pn")?.length, 60);
  assert.equal(parsedUrl.searchParams.get("tn")?.length, 60);
  assert.equal(parsedUrl.searchParams.get("tr")?.length, 35);
});

test("Feature 15 Challenger: buildUpiUri - omits 'am' parameter when zero and throws on negative", () => {
  const uriZero = buildUpiUri({ vpa: "test@upi", amount: 0 });
  assert.equal(uriZero.includes("am="), false);

  assert.throws(
    () => buildUpiUri({ vpa: "test@upi", amount: -50 }),
    /Invalid amount/,
  );
});

test("Feature 15 Challenger: buildUpiUri - preserves 2 decimal places for single-digit or exact paise", () => {
  const uri1 = buildUpiUri({ vpa: "store@icici", amount: 50 });
  assert.ok(uri1.includes("am=50.00"));

  const uri2 = buildUpiUri({ vpa: "store@icici", amount: 75.5 });
  assert.ok(uri2.includes("am=75.50"));

  const uri3 = buildUpiUri({ vpa: "store@icici", amount: 0.05 });
  assert.ok(uri3.includes("am=0.05"));
});

// ============================================================================
// Feature 14 & 16: planPayment & parseMoney Arithmetic
// ============================================================================

test("Feature 14 & 16 Challenger: planPayment - handles cash overpayment with exact change", () => {
  const plan = planPayment({
    remaining: 180,
    entered: 200,
    method: "CASH",
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.applied, 180);
  assert.equal(plan.tendered, 200);
  assert.equal(plan.change, 20);
  assert.equal(plan.balanceAfter, 0);
  assert.equal(plan.partial, false);
  assert.equal(plan.clamped, false);
});

test("Feature 14 & 16 Challenger: planPayment - clamps non-cash over-tender to balance without change", () => {
  const planCard = planPayment({
    remaining: 300,
    entered: 350,
    method: "CARD",
  });

  assert.equal(planCard.valid, true);
  assert.equal(planCard.applied, 300);
  assert.equal(planCard.tendered, undefined);
  assert.equal(planCard.change, 0);
  assert.equal(planCard.clamped, true);
  assert.equal(planCard.balanceAfter, 0);
});

test("Feature 14 & 16 Challenger: planPayment - blank input (null) defaults to paying full remaining balance", () => {
  const plan = planPayment({
    remaining: 520.5,
    entered: null,
    method: "UPI",
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.applied, 520.5);
  assert.equal(plan.change, 0);
  assert.equal(plan.balanceAfter, 0);
  assert.equal(plan.partial, false);
});

test("Feature 14 & 16 Challenger: planPayment - detects partial payments correctly", () => {
  const plan = planPayment({
    remaining: 1000,
    entered: 400,
    method: "CASH",
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.applied, 400);
  assert.equal(plan.change, 0);
  assert.equal(plan.balanceAfter, 600);
  assert.equal(plan.partial, true);
});

test("Feature 14 & 16 Challenger: planPayment - rejects invalid, negative, or non-finite inputs", () => {
  assert.equal(planPayment({ remaining: 100, entered: 0, method: "CASH" }).valid, false);
  assert.equal(planPayment({ remaining: 100, entered: -50, method: "CASH" }).valid, false);
  assert.equal(planPayment({ remaining: 100, entered: Number.NaN, method: "CASH" }).valid, false);
  assert.equal(planPayment({ remaining: 100, entered: Number.POSITIVE_INFINITY, method: "CASH" }).valid, false);
});

test("Feature 14 & 16 Challenger: parseMoney - safely parses text inputs", () => {
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("   "), null);
  assert.equal(parseMoney("120"), 120);
  assert.equal(parseMoney("45.50"), 45.5);
  assert.ok(Number.isNaN(parseMoney("abc")));
  assert.ok(Number.isNaN(parseMoney("₹500")));
});

// ============================================================================
// Feature 16, 17, 18: High-Volume Operational Stress Harness
// ============================================================================

test("Milestone 4 Stress Harness: High-Volume Multi-Tender Day Reconciliation", () => {
  const engine = new SettlementDrawerEngine();
  const openingFloat = 2500;
  engine.openDrawer(openingFloat);

  let expectedCashSales = 0;
  let expectedUpiSales = 0;
  let expectedCardSales = 0;
  let expectedWalletSales = 0;

  // 1. Process 50 CASH orders with varying over-tendered cash and change
  for (let i = 1; i <= 50; i++) {
    const amount = 100 + i;
    const tendered = amount + (i % 5 === 0 ? 50 : 0);
    const res = engine.settleOrder({
      orderId: `cash-ord-${i}`,
      totalAmount: amount,
      payments: [{ method: "CASH", amount, tendered }],
    });
    assert.equal(res.fullyPaid, true);
    assert.equal(res.balanceRemaining, 0);
    expectedCashSales += amount;
  }

  // 2. Process 40 UPI orders with dynamic QR simulation
  for (let i = 1; i <= 40; i++) {
    const amount = 200 + i * 2;
    const qr = engine.generateUpiQr({
      vpa: "testmerchant@icici",
      payeeName: "Fast Food Express",
      amount,
      orderNumber: `U-${i}`,
    });
    assert.equal(qr.isValid, true);

    const res = engine.settleOrder({
      orderId: `upi-ord-${i}`,
      totalAmount: amount,
      payments: [{ method: "UPI", amount, reference: `UPI-${i}` }],
    });
    assert.equal(res.fullyPaid, true);
    expectedUpiSales += amount;
  }

  // 3. Process 30 CARD orders
  for (let i = 1; i <= 30; i++) {
    const amount = 350 + i * 5;
    const res = engine.settleOrder({
      orderId: `card-ord-${i}`,
      totalAmount: amount,
      payments: [{ method: "CARD", amount, reference: `CARD-${i}` }],
    });
    assert.equal(res.fullyPaid, true);
    expectedCardSales += amount;
  }

  // 4. Process 20 WALLET orders
  for (let i = 1; i <= 20; i++) {
    const amount = 80 + i;
    const res = engine.settleOrder({
      orderId: `wallet-ord-${i}`,
      totalAmount: amount,
      payments: [{ method: "WALLET", amount }],
    });
    assert.equal(res.fullyPaid, true);
    expectedWalletSales += amount;
  }

  // 5. Record 5 petty cash expenses
  let expectedCashExpenses = 0;
  const expenseList = [120, 350, 85.5, 400, 215.25];
  for (const exp of expenseList) {
    engine.recordExpense("Supplies", exp);
    expectedCashExpenses += exp;
  }

  // 6. Record 3 cash refunds
  let expectedCashRefunds = 0;
  const refundList = [150, 75, 220];
  for (const ref of refundList) {
    engine.recordRefund(ref, "CASH");
    expectedCashRefunds += ref;
  }

  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  expectedCashSales = round2(expectedCashSales);
  expectedUpiSales = round2(expectedUpiSales);
  expectedCardSales = round2(expectedCardSales);
  expectedWalletSales = round2(expectedWalletSales);
  expectedCashExpenses = round2(expectedCashExpenses);
  expectedCashRefunds = round2(expectedCashRefunds);

  const totalSalesExpected = round2(expectedCashSales + expectedUpiSales + expectedCardSales + expectedWalletSales);
  const expectedTillCash = round2(openingFloat + expectedCashSales - expectedCashExpenses - expectedCashRefunds);

  // Generate Z-report with exact expected cash
  const zReport = engine.generateDailyZReport(expectedTillCash, "2026-10-29");

  assert.equal(zReport.openingFloat, openingFloat);
  assert.equal(zReport.cashSales, expectedCashSales);
  assert.equal(zReport.upiSales, expectedUpiSales);
  assert.equal(zReport.cardSales, expectedCardSales);
  assert.equal(zReport.walletSales, expectedWalletSales);
  assert.equal(zReport.totalSales, totalSalesExpected);
  assert.equal(zReport.cashExpenses, expectedCashExpenses);
  assert.equal(zReport.cashRefunds, expectedCashRefunds);
  assert.equal(zReport.expectedCash, expectedTillCash);
  assert.equal(zReport.countedCash, expectedTillCash);
  assert.equal(zReport.cashVariance, 0);

  // Verify shortage discrepancy
  const shortageReport = engine.generateDailyZReport(expectedTillCash - 150);
  assert.equal(shortageReport.cashVariance, -150);

  // Verify overage discrepancy
  const overageReport = engine.generateDailyZReport(expectedTillCash + 200);
  assert.equal(overageReport.cashVariance, 200);
});
