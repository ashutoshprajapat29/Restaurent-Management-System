import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Feature 15: Cash Tender & Change Calc - computes exact change when cash tendered exceeds total", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "ord-1",
    totalAmount: 180,
    payments: [{ method: "CASH", amount: 180, tendered: 200 }],
  });

  assert.equal(res.fullyPaid, true);
  assert.equal(res.totalPaid, 180);
  assert.equal(res.totalChange, 20);
  assert.equal(res.balanceRemaining, 0);
  assert.equal(res.recordedPayments[0].changeGiven, 20);
});

test("Feature 15: Cash Tender & Change Calc - gives 0 change for exact cash tender", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "ord-2",
    totalAmount: 350,
    payments: [{ method: "CASH", amount: 350, tendered: 350 }],
  });

  assert.equal(res.fullyPaid, true);
  assert.equal(res.totalChange, 0);
  assert.equal(res.balanceRemaining, 0);
});

test("Feature 15: Cash Tender & Change Calc - rejects cash settlement when tendered is less than amount", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () =>
      engine.settleOrder({
        orderId: "ord-3",
        totalAmount: 500,
        payments: [{ method: "CASH", amount: 500, tendered: 400 }],
      }),
    /cannot be less than applied amount/,
  );
});

test("Feature 15: Cash Tender & Change Calc - rejects tendered field on non-cash payment methods", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () =>
      engine.settleOrder({
        orderId: "ord-4",
        totalAmount: 300,
        payments: [{ method: "CARD", amount: 300, tendered: 350 }],
      }),
    /Tendered amount is only applicable to CASH/,
  );
});

test("Feature 15: Cash Tender & Change Calc - correctly computes decimal change without binary float errors", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "ord-5",
    totalAmount: 149.25,
    payments: [{ method: "CASH", amount: 149.25, tendered: 200.0 }],
  });

  assert.equal(res.totalChange, 50.75);
});
