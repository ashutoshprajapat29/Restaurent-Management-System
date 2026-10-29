import assert from "node:assert/strict";
import { test } from "node:test";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Boundary 9: Rapid Cart Manipulation - high quantity orders (e.g. 500 items for catering)", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-box",
    name: "Lunch Box",
    price: 150,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const line = pos.addItem({ menuItemId: "item-box", quantity: 500 });
  assert.equal(line.quantity, 500);
  assert.equal(line.lineTotal, 75000);
});

test("Boundary 9: Rapid Cart Manipulation - rejecting negative quantity additions", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-soda",
    name: "Soda",
    price: 50,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  assert.throws(
    () => pos.addItem({ menuItemId: "item-soda", quantity: -2 }),
    /Quantity must be positive/,
  );
  assert.throws(
    () => pos.addItem({ menuItemId: "item-soda", quantity: 0 }),
    /Quantity must be positive/,
  );
});

test("Boundary 9: Rapid Cart Manipulation - custom portion with decimal price", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-buffet",
    name: "Buffet Plate",
    price: 300,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const line = pos.addItem({
    menuItemId: "item-buffet",
    portion: "CUSTOM",
    customPrice: 175.5,
    quantity: 2,
  });

  assert.equal(line.unitPrice, 175.5);
  assert.equal(line.lineTotal, 351);
});

test("Boundary 9: Rapid Cart Manipulation - custom portion with negative price is rejected", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-buffet",
    name: "Buffet Plate",
    price: 300,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  assert.throws(
    () => pos.addItem({ menuItemId: "item-buffet", portion: "CUSTOM", customPrice: -20 }),
    /Custom portion requires a valid non-negative custom price/,
  );
});

test("Boundary 9: Rapid Cart Manipulation - half portion requested on item without halfPrice throws error", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-coke",
    name: "Canned Drink",
    price: 40,
    // halfPrice omitted
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  assert.throws(
    () => pos.addItem({ menuItemId: "item-coke", portion: "HALF" }),
    /does not support half portion/,
  );
});
