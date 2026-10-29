import assert from "node:assert/strict";
import { test } from "node:test";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Feature 9: Rapid Cart Manipulation - increments and decrements quantity rapidly", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-shake",
    name: "Mango Shake",
    price: 120,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const line = pos.addItem({ menuItemId: "item-shake", quantity: 1 });
  assert.equal(line.quantity, 1);
  assert.equal(line.lineTotal, 120);

  pos.updateLineQuantity(line.lineId, 4);
  assert.equal(line.quantity, 4);
  assert.equal(line.lineTotal, 480);

  pos.updateLineQuantity(line.lineId, 2);
  assert.equal(line.quantity, 2);
  assert.equal(line.lineTotal, 240);
});

test("Feature 9: Rapid Cart Manipulation - removing line or reducing quantity to zero drops line", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-fries",
    name: "French Fries",
    price: 90,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const line = pos.addItem({ menuItemId: "item-fries", quantity: 1 });
  assert.equal(pos.getLines().length, 1);

  pos.updateLineQuantity(line.lineId, 0);
  assert.equal(pos.getLines().length, 0);
});

test("Feature 9: Rapid Cart Manipulation - explicit removeLine removes item immediately", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-soup",
    name: "Tomato Soup",
    price: 110,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const line = pos.addItem({ menuItemId: "item-soup", quantity: 1 });
  pos.removeLine(line.lineId);
  assert.equal(pos.getLines().length, 0);
});

test("Feature 9: Rapid Cart Manipulation - supports Half and Full portions", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-rice",
    name: "Fried Rice",
    price: 200, // Full price
    halfPrice: 120, // Half price
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const fullLine = pos.addItem({ menuItemId: "item-rice", portion: "FULL" });
  const halfLine = pos.addItem({ menuItemId: "item-rice", portion: "HALF" });

  assert.equal(fullLine.unitPrice, 200);
  assert.equal(halfLine.unitPrice, 120);
});

test("Feature 9: Rapid Cart Manipulation - attaches kitchen note to individual cart line", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-steak",
    name: "Paneer Steak",
    price: 280,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const line = pos.addItem({
    menuItemId: "item-steak",
    quantity: 1,
    kitchenNote: "Extra spicy, no onion",
  });

  assert.equal(line.kitchenNote, "Extra spicy, no onion");

  pos.updateLineNote(line.lineId, "Medium spicy please");
  assert.equal(line.kitchenNote, "Medium spicy please");
});
