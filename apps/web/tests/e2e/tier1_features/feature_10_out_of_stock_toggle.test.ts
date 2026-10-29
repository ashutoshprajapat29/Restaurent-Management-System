import assert from "node:assert/strict";
import { test } from "node:test";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Feature 10: One-Click Out-of-Stock Toggle - toggling item to out-of-stock marks isActive as false", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-cake",
    name: "Chocolate Lava Cake",
    price: 150,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const updated = pos.toggleOutOfStock("item-cake", false);
  assert.equal(updated.isActive, false);
});

test("Feature 10: One-Click Out-of-Stock Toggle - prevents adding 86'd item to POS cart", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-truffle",
    name: "Truffle Risotto",
    price: 550,
    taxRatePercent: 5,
    isActive: false, // Out of stock
    modifierGroupIds: [],
  });

  assert.throws(
    () => pos.addItem({ menuItemId: "item-truffle", quantity: 1 }),
    /is OUT OF STOCK and cannot be ordered/,
  );
});

test("Feature 10: One-Click Out-of-Stock Toggle - flags existing cart lines if an item runs out during ordering", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-fish",
    name: "Fish & Chips",
    price: 340,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  pos.addItem({ menuItemId: "item-fish", quantity: 1 });
  assert.equal(pos.validateCartStock().valid, true);

  // Item goes out of stock while in cart
  pos.toggleOutOfStock("item-fish", false);
  const check = pos.validateCartStock();
  assert.equal(check.valid, false);
  assert.deepEqual(check.outOfStockItemNames, ["Fish & Chips"]);
});

test("Feature 10: One-Click Out-of-Stock Toggle - toggling item back in stock immediately re-enables ordering", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-juice",
    name: "Fresh Orange Juice",
    price: 110,
    taxRatePercent: 5,
    isActive: false,
    modifierGroupIds: [],
  });

  assert.throws(() => pos.addItem({ menuItemId: "item-juice" }), /OUT OF STOCK/);

  pos.toggleOutOfStock("item-juice", true);
  const line = pos.addItem({ menuItemId: "item-juice", quantity: 1 });
  assert.equal(line.quantity, 1);
  assert.equal(line.itemName, "Fresh Orange Juice");
});

test("Feature 10: One-Click Out-of-Stock Toggle - selectively disables only targeted item without affecting others", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-tea",
    name: "Masala Chai",
    price: 40,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.registerMenuItem({
    id: "item-coffee",
    name: "Filter Coffee",
    price: 50,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  pos.toggleOutOfStock("item-tea", false);

  assert.throws(() => pos.addItem({ menuItemId: "item-tea" }), /OUT OF STOCK/);
  const coffeeLine = pos.addItem({ menuItemId: "item-coffee" });
  assert.equal(coffeeLine.itemName, "Filter Coffee");
});
