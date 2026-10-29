import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Boundary 16: Split Tenders & Multi-Payment - split across 4 different payment methods", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "split-4-ways",
    totalAmount: 1000,
    payments: [
      { method: "CASH", amount: 250, tendered: 250 },
      { method: "UPI", amount: 250 },
      { method: "CARD", amount: 250 },
      { method: "WALLET", amount: 250 },
    ],
  });

  assert.equal(res.fullyPaid, true);
  assert.equal(res.totalPaid, 1000);
  assert.equal(res.recordedPayments.length, 4);
});

test("Boundary 16: Split Tenders & Multi-Payment - split where sum exceeds total due by non-cash tender is rejected", () => {
  const engine = new SettlementDrawerEngine();
  // Cash cannot absorb an overpayment on a card/UPI line
  assert.throws(
    () =>
      engine.settleOrder({
        orderId: "split-overpay",
        totalAmount: 500,
        payments: [
          { method: "CARD", amount: 600 }, // Card cannot be over-tendered
        ],
      }),
    /cannot be less than applied amount|do not cover|exceed/,
  );
});

test("Boundary 16: Split Tenders & Multi-Payment - micro-split amounts with decimal cents summing to total", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "split-cents",
    totalAmount: 10.0,
    payments: [
      { method: "CASH", amount: 3.33, tendered: 3.33 },
      { method: "UPI", amount: 3.33 },
      { method: "CARD", amount: 3.34 },
    ],
  });

  assert.equal(res.fullyPaid, true);
  assert.equal(res.totalPaid, 10.0);
  assert.equal(res.balanceRemaining, 0);
});

test("Boundary 16: Split Tenders & Multi-Payment - multiple partial payments accumulating until closed", () => {
  const engine = new SettlementDrawerEngine();

  // Step 1: 100 of 300
  const s1 = engine.settleOrder({ orderId: "p1", totalAmount: 300, payments: [{ method: "CASH", amount: 100 }], allowPartial: true });
  assert.equal(s1.balanceRemaining, 200);

  // Step 2: 100 of remaining 200
  const s2 = engine.settleOrder({ orderId: "p1", totalAmount: s1.balanceRemaining, payments: [{ method: "UPI", amount: 100 }], allowPartial: true });
  assert.equal(s2.balanceRemaining, 100);

  // Step 3: 100 of remaining 100 (final)
  const s3 = engine.settleOrder({ orderId: "p1", totalAmount: s2.balanceRemaining, payments: [{ method: "CARD", amount: 100 }] });
  assert.equal(s3.fullyPaid, true);
  assert.equal(s3.balanceRemaining, 0);
});

test("Boundary 16: Split Tenders & Multi-Payment - cash change on split payment where cash tendered is higher", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "split-change",
    totalAmount: 500,
    payments: [
      { method: "CARD", amount: 300 },
      { method: "CASH", amount: 200, tendered: 500 }, // Cash 200 of 500 bill, but customer hands 500 note
    ],
  });

  assert.equal(res.fullyPaid, true);
  assert.equal(res.totalChange, 300); // 500 tendered - 200 applied
});
