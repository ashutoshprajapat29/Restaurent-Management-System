import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Boundary 14: Dynamic UPI QR Generation - very small positive amount (e.g. 0.01 INR)", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.generateUpiQr({
    vpa: "test@upi",
    payeeName: "Penny Test",
    amount: 0.01,
    orderNumber: "P-01",
  });

  assert.equal(res.isValid, true);
  assert.ok(res.uri.includes("am=0.01"));
});

test("Boundary 14: Dynamic UPI QR Generation - high value amount formatting (e.g. 150000.75 INR)", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.generateUpiQr({
    vpa: "banquet@upi",
    payeeName: "Grand Banquet",
    amount: 150000.75,
    orderNumber: "B-99",
  });

  assert.ok(res.uri.includes("am=150000.75"));
});

test("Boundary 14: Dynamic UPI QR Generation - payee name containing special characters and spaces", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.generateUpiQr({
    vpa: "food_mart.retail@hdfc",
    payeeName: "Food & Feast (Branch #2)",
    amount: 500,
    orderNumber: "FF-2",
  });

  assert.ok(decodeURIComponent(res.uri).includes("pn=Food & Feast (Branch #2)"));
  assert.ok(res.uri.includes("pn=Food%20%26%20Feast"));
});

test("Boundary 14: Dynamic UPI QR Generation - URL space encoding (%20 instead of +)", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.generateUpiQr({
    vpa: "test@okaxis",
    payeeName: "Three Word Name",
    amount: 200,
    orderNumber: "99",
  });

  // NPCI spec mandates %20, rejecting +
  assert.equal(res.uri.includes("+"), false);
  assert.ok(res.uri.includes("Three%20Word%20Name"));
});

test("Boundary 14: Dynamic UPI QR Generation - VPA handles uppercase, dots, and hyphens", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.generateUpiQr({
    vpa: "MY-BUSINESS.123@YESBANK",
    payeeName: "Yes Bank Merchant",
    amount: 100,
    orderNumber: "Y-1",
  });

  assert.equal(res.isValid, true);
  assert.ok(res.uri.includes("MY-BUSINESS.123"));
});
