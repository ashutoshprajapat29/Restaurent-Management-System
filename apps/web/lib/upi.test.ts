import assert from "node:assert/strict";
import { test } from "node:test";
import { buildUpiUri } from "./upi.ts";

test("buildUpiUri generates valid UPI URI with correct parameters", () => {
  const uri = buildUpiUri({
    vpa: "merchant@bank",
    name: "Pet Pooja Diner",
    amount: 150.5,
    note: "Table 4 Bill",
    ref: "ORDER-12345",
  });

  assert.ok(uri.startsWith("upi://pay?"));
  assert.ok(uri.includes("pa=merchant%40bank"));
  assert.ok(uri.includes("pn=Pet%20Pooja%20Diner"));
  assert.ok(uri.includes("am=150.50"));
  assert.ok(uri.includes("cu=INR"));
  assert.ok(uri.includes("tn=Table%204%20Bill"));
  assert.ok(uri.includes("tr=ORDER-12345"));
});

test("buildUpiUri throws when VPA is missing or lacks '@'", () => {
  assert.throws(
    () => buildUpiUri({ vpa: "", amount: 100 }),
    /Invalid UPI VPA/,
  );
  assert.throws(
    () => buildUpiUri({ vpa: "invalidvpa", amount: 100 }),
    /Invalid UPI VPA/,
  );
});

test("buildUpiUri omits amount when zero and throws on negative", () => {
  const uri = buildUpiUri({
    vpa: "store@okhdfcbank",
    amount: 0,
  });
  assert.ok(!uri.includes("am="));
  assert.ok(uri.includes("pa=store%40okhdfcbank"));
  assert.ok(uri.includes("cu=INR"));

  assert.throws(
    () => buildUpiUri({ vpa: "store@okhdfcbank", amount: -25 }),
    /Invalid amount/,
  );
});
