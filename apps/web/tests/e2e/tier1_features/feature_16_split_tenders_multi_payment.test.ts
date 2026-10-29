import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Feature 16: Split Tenders & Multi-Payment - splits bill evenly across Cash and Card", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "split-1",
    totalAmount: 1000,
    payments: [
      { method: "CASH", amount: 500, tendered: 500 },
      { method: "CARD", amount: 500, reference: "AUTH-8877" },
    ],
  });

  assert.equal(res.fullyPaid, true);
  assert.equal(res.totalPaid, 1000);
  assert.equal(res.balanceRemaining, 0);
  assert.equal(res.recordedPayments.length, 2);
});

test("Feature 16: Split Tenders & Multi-Payment - splits bill across Cash, UPI, and Card", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "split-2",
    totalAmount: 1500,
    payments: [
      { method: "CASH", amount: 500, tendered: 600 },
      { method: "UPI", amount: 600, reference: "UPI-TXN-01" },
      { method: "CARD", amount: 400, reference: "CARD-TXN-02" },
    ],
  });

  assert.equal(res.fullyPaid, true);
  assert.equal(res.totalPaid, 1500);
  assert.equal(res.totalChange, 100); // 600 tendered - 500 applied cash
  assert.equal(res.balanceRemaining, 0);
});

test("Feature 16: Split Tenders & Multi-Payment - allows partial payment when allowPartial is true", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "split-3",
    totalAmount: 800,
    payments: [{ method: "CARD", amount: 500 }],
    allowPartial: true,
  });

  assert.equal(res.fullyPaid, false);
  assert.equal(res.totalPaid, 500);
  assert.equal(res.balanceRemaining, 300);
});

test("Feature 16: Split Tenders & Multi-Payment - rejects partial payment when allowPartial is omitted or false", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () =>
      engine.settleOrder({
        orderId: "split-4",
        totalAmount: 800,
        payments: [{ method: "CASH", amount: 500 }],
      }),
    /Payments \(500\) do not cover total amount \(800\)/,
  );
});

test("Feature 16: Split Tenders & Multi-Payment - settles remaining balance in second installment", () => {
  const engine = new SettlementDrawerEngine();

  // Installment 1: Partial 400 of 700
  const inst1 = engine.settleOrder({
    orderId: "split-5",
    totalAmount: 700,
    payments: [{ method: "UPI", amount: 400 }],
    allowPartial: true,
  });
  assert.equal(inst1.balanceRemaining, 300);

  // Installment 2: Settle remaining 300
  const inst2 = engine.settleOrder({
    orderId: "split-5",
    totalAmount: inst1.balanceRemaining,
    payments: [{ method: "CASH", amount: 300, tendered: 300 }],
  });
  assert.equal(inst2.fullyPaid, true);
  assert.equal(inst2.balanceRemaining, 0);
});
