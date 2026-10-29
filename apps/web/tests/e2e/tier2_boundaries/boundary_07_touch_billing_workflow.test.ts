import assert from "node:assert/strict";
import { test } from "node:test";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Boundary 7: Touch Billing Workflow - empty cart total is 0 with 0 tax and 0 discount", () => {
  const pos = new PosCartEngine();
  const totals = pos.calculateTotals();

  assert.equal(totals.subtotal, 0);
  assert.equal(totals.discountAmount, 0);
  assert.equal(totals.taxAmount, 0);
  assert.equal(totals.total, 0);
});

test("Boundary 7: Touch Billing Workflow - 100% discount reduces total to exactly 0", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-treat",
    name: "Birthday Dessert",
    price: 250,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.addItem({ menuItemId: "item-treat", quantity: 1 });

  const totals = pos.calculateTotals({ discountPercent: 100 });
  assert.equal(totals.subtotal, 250);
  assert.equal(totals.discountAmount, 250);
  assert.equal(totals.total, 0);
});

test("Boundary 7: Touch Billing Workflow - flat discount exceeding subtotal caps discount at subtotal", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-snack",
    name: "Samosa",
    price: 40,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.addItem({ menuItemId: "item-snack", quantity: 1 }); // 40

  const totals = pos.calculateTotals({ discountFlat: 200 }); // flat 200 off 40
  assert.equal(totals.discountAmount, 40);
  assert.equal(totals.total, 0);
});

test("Boundary 7: Touch Billing Workflow - exclusive tax mode calculates tax on top of subtotal", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-us-burger",
    name: "Burger US",
    price: 100,
    taxRatePercent: 10,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.addItem({ menuItemId: "item-us-burger", quantity: 1 });

  const totals = pos.calculateTotals({ taxMode: "EXCLUSIVE", defaultTaxRate: 10 });
  assert.equal(totals.subtotal, 100);
  assert.equal(totals.taxAmount, 10);
  assert.equal(totals.total, 110);
});

test("Boundary 7: Touch Billing Workflow - fractional item pricing rounding to 2 decimal places", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-cents",
    name: "Special Coffee",
    price: 33.33,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.addItem({ menuItemId: "item-cents", quantity: 3 });

  const totals = pos.calculateTotals();
  assert.equal(totals.subtotal, 99.99);
});
