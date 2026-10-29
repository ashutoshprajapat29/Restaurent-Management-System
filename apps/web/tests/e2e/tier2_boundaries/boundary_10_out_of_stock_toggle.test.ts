import assert from "node:assert/strict";
import { test } from "node:test";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Boundary 10: One-Click Out-of-Stock Toggle - repeated toggle on/off does not leak state", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-soup",
    name: "Hot & Sour Soup",
    price: 130,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  for (let i = 0; i < 5; i++) {
    pos.toggleOutOfStock("item-soup", false);
    assert.equal(pos.toggleOutOfStock("item-soup", true).isActive, true);
  }
});

test("Boundary 10: One-Click Out-of-Stock Toggle - toggling non-existent menu item throws error", () => {
  const pos = new PosCartEngine();
  assert.throws(
    () => pos.toggleOutOfStock("ghost-item-id", false),
    /Menu item ghost-item-id not found/,
  );
});

test("Boundary 10: One-Click Out-of-Stock Toggle - cart with all items out-of-stock fails validation completely", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({ id: "i1", name: "Dish 1", price: 100, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos.registerMenuItem({ id: "i2", name: "Dish 2", price: 150, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });

  pos.addItem({ menuItemId: "i1" });
  pos.addItem({ menuItemId: "i2" });

  pos.toggleOutOfStock("i1", false);
  pos.toggleOutOfStock("i2", false);

  const check = pos.validateCartStock();
  assert.equal(check.valid, false);
  assert.equal(check.outOfStockItemNames.length, 2);
  assert.ok(check.outOfStockItemNames.includes("Dish 1"));
  assert.ok(check.outOfStockItemNames.includes("Dish 2"));
});

test("Boundary 10: One-Click Out-of-Stock Toggle - clearing cart resets validation status", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({ id: "i3", name: "Dish 3", price: 200, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos.addItem({ menuItemId: "i3" });
  pos.toggleOutOfStock("i3", false);

  assert.equal(pos.validateCartStock().valid, false);
  pos.clear();
  assert.equal(pos.validateCartStock().valid, true);
});

test("Boundary 10: One-Click Out-of-Stock Toggle - out-of-stock check works identically in Takeaway mode", () => {
  const pos = new PosCartEngine();
  pos.orderType = "TAKEAWAY";
  pos.registerMenuItem({ id: "i4", name: "Takeaway Burger", price: 180, taxRatePercent: 5, isActive: false, modifierGroupIds: [] });

  assert.throws(
    () => pos.addItem({ menuItemId: "i4" }),
    /is OUT OF STOCK and cannot be ordered/,
  );
});
