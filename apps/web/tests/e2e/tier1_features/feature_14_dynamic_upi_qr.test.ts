import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Feature 14: Dynamic UPI QR Generation - builds valid NPCI deep link with pre-filled payable amount", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.generateUpiQr({
    vpa: "bistro@icici",
    payeeName: "The Bistro Inc",
    amount: 450.5,
    orderNumber: "1001",
  });

  assert.equal(res.isValid, true);
  assert.ok(res.uri.startsWith("upi://pay?"));
  assert.ok(res.uri.includes("pa=bistro%40icici") || res.uri.includes("pa=bistro@icici"));
  assert.ok(res.uri.includes("am=450.50"));
  assert.ok(res.uri.includes("cu=INR"));
  assert.ok(res.uri.includes("pn=The%20Bistro%20Inc"));
});

test("Feature 14: Dynamic UPI QR Generation - encodes order number and reference in UPI transaction note", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.generateUpiQr({
    vpa: "cafe@upi",
    payeeName: "Metro Cafe",
    amount: 120,
    orderNumber: "5544",
  });

  assert.ok(res.uri.includes("tn=Bill%20%235544"));
  assert.ok(res.uri.includes("tr=ORD-5544"));
});

test("Feature 14: Dynamic UPI QR Generation - rejects invalid VPA without @ symbol", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () =>
      engine.generateUpiQr({
        vpa: "invalidvpaformat",
        payeeName: "Cafe",
        amount: 250,
        orderNumber: "123",
      }),
    /Invalid UPI VPA/,
  );
});

test("Feature 14: Dynamic UPI QR Generation - rejects non-positive payment amounts", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () =>
      engine.generateUpiQr({
        vpa: "merchant@bank",
        payeeName: "Store",
        amount: 0,
        orderNumber: "124",
      }),
    /amount must be positive/,
  );

  assert.throws(
    () =>
      engine.generateUpiQr({
        vpa: "merchant@bank",
        payeeName: "Store",
        amount: -50,
        orderNumber: "125",
      }),
    /amount must be positive/,
  );
});

test("Feature 14: Dynamic UPI QR Generation - preserves exact 2-decimal formatting for paise values", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.generateUpiQr({
    vpa: "restro@sbi",
    payeeName: "Restro",
    amount: 99.9,
    orderNumber: "126",
  });

  assert.ok(res.uri.includes("am=99.90"));
});
