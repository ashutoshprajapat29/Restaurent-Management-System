import assert from "node:assert/strict";
import { test } from "node:test";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Feature 8: Modifier Groups & Popovers - applies modifier price adjustment to line item", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-cheese",
    name: "Cheese Options",
    minSelect: 0,
    maxSelect: 1,
    isRequired: false,
    options: [
      { id: "opt-extra-cheese", name: "Extra Mozzarella", priceAdjustment: 50 },
    ],
  });

  pos.registerMenuItem({
    id: "item-burger",
    name: "Classic Cheeseburger",
    price: 200,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-cheese"],
  });

  const line = pos.addItem({
    menuItemId: "item-burger",
    quantity: 1,
    modifierIds: ["opt-extra-cheese"],
  });

  assert.equal(line.unitPrice, 250); // 200 + 50
  assert.equal(line.lineTotal, 250);
  assert.equal(line.selectedModifiers.length, 1);
  assert.equal(line.selectedModifiers[0].name, "Extra Mozzarella");
});

test("Feature 8: Modifier Groups & Popovers - enforces isRequired and minSelect bounds", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-crust",
    name: "Pizza Crust",
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { id: "opt-thin", name: "Thin Crust", priceAdjustment: 0 },
      { id: "opt-cheese-burst", name: "Cheese Burst", priceAdjustment: 80 },
    ],
  });

  pos.registerMenuItem({
    id: "item-pizza",
    name: "Margherita",
    price: 300,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-crust"],
  });

  // Omitting required modifier must throw error
  assert.throws(
    () => pos.addItem({ menuItemId: "item-pizza", quantity: 1 }),
    /requires at least 1 selection/,
  );

  // Providing crust succeeds
  const line = pos.addItem({
    menuItemId: "item-pizza",
    quantity: 1,
    modifierIds: ["opt-cheese-burst"],
  });
  assert.equal(line.unitPrice, 380);
});

test("Feature 8: Modifier Groups & Popovers - enforces maxSelect bounds", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-dip",
    name: "Free Dips",
    minSelect: 0,
    maxSelect: 2,
    isRequired: false,
    options: [
      { id: "dip-1", name: "Garlic Mayo", priceAdjustment: 0 },
      { id: "dip-2", name: "Spicy Salsa", priceAdjustment: 0 },
      { id: "dip-3", name: "Mint Chutney", priceAdjustment: 0 },
    ],
  });

  pos.registerMenuItem({
    id: "item-nachos",
    name: "Loaded Nachos",
    price: 180,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-dip"],
  });

  // 3 dips when max is 2 must throw error
  assert.throws(
    () =>
      pos.addItem({
        menuItemId: "item-nachos",
        quantity: 1,
        modifierIds: ["dip-1", "dip-2", "dip-3"],
      }),
    /permits at most 2 selection/,
  );

  // 2 dips succeeds
  const line = pos.addItem({
    menuItemId: "item-nachos",
    quantity: 1,
    modifierIds: ["dip-1", "dip-2"],
  });
  assert.equal(line.selectedModifiers.length, 2);
});

test("Feature 8: Modifier Groups & Popovers - combines multiple modifier groups on single item", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-milk",
    name: "Milk Type",
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { id: "milk-oat", name: "Oat Milk", priceAdjustment: 40 },
    ],
  });
  pos.registerModifierGroup({
    id: "mod-syrup",
    name: "Flavor Syrup",
    minSelect: 0,
    maxSelect: 1,
    isRequired: false,
    options: [
      { id: "syr-vanilla", name: "Vanilla", priceAdjustment: 30 },
    ],
  });

  pos.registerMenuItem({
    id: "item-latte",
    name: "Caffe Latte",
    price: 150,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-milk", "mod-syrup"],
  });

  const line = pos.addItem({
    menuItemId: "item-latte",
    quantity: 1,
    modifierIds: ["milk-oat", "syr-vanilla"],
  });

  assert.equal(line.unitPrice, 220); // 150 + 40 + 30
});

test("Feature 8: Modifier Groups & Popovers - calculates line total with multiple quantity and modifiers", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-shot",
    name: "Extra Shot",
    minSelect: 0,
    maxSelect: 2,
    isRequired: false,
    options: [{ id: "shot-espresso", name: "Espresso Shot", priceAdjustment: 45 }],
  });

  pos.registerMenuItem({
    id: "item-capp",
    name: "Cappuccino",
    price: 160,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-shot"],
  });

  const line = pos.addItem({
    menuItemId: "item-capp",
    quantity: 3,
    modifierIds: ["shot-espresso"],
  });

  assert.equal(line.unitPrice, 205); // 160 + 45
  assert.equal(line.lineTotal, 615); // 205 * 3
});
