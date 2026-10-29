import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Boundary 15: Cash Tender & Change Calc - large cash tender (e.g. 2000 INR note on 50 INR bill)", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "ord-large-note",
    totalAmount: 50,
    payments: [{ method: "CASH", amount: 50, tendered: 2000 }],
  });

  assert.equal(res.fullyPaid, true);
  assert.equal(res.totalChange, 1950);
});

test("Boundary 15: Cash Tender & Change Calc - zero cash tender or negative amount throws error", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () =>
      engine.settleOrder({
        orderId: "ord-bad",
        totalAmount: 100,
        payments: [{ method: "CASH", amount: 0, tendered: 100 }],
      }),
    /Payment amount must be positive/,
  );

  assert.throws(
    () =>
      engine.settleOrder({
        orderId: "ord-bad2",
        totalAmount: 100,
        payments: [{ method: "CASH", amount: -10, tendered: 100 }],
      }),
    /Payment amount must be positive/,
  );
});

test("Boundary 15: Cash Tender & Change Calc - change calculation with 1 cent / 1 paisa difference", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.settleOrder({
    orderId: "ord-paisa",
    totalAmount: 99.99,
    payments: [{ method: "CASH", amount: 99.99, tendered: 100.0 }],
  });

  assert.equal(res.totalChange, 0.01);
});

test("Boundary 15: Cash Tender & Change Calc - empty payments array throws error", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () => engine.settleOrder({ orderId: "ord-empty", totalAmount: 100, payments: [] }),
    /At least one payment entry is required/,
  );
});

test("Boundary 15: Cash Tender & Change Calc - order with zero or negative total amount throws error", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () => engine.settleOrder({ orderId: "ord-zero", totalAmount: 0, payments: [{ method: "CASH", amount: 0 }] }),
    /Order total must be greater than zero/,
  );
});
