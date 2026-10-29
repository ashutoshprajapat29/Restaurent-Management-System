import assert from "node:assert/strict";
import { test } from "node:test";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Boundary 8: Modifier Groups & Popovers - modifier with zero price adjustment", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-ice",
    name: "Ice Preference",
    minSelect: 0,
    maxSelect: 1,
    isRequired: false,
    options: [{ id: "opt-no-ice", name: "No Ice", priceAdjustment: 0 }],
  });
  pos.registerMenuItem({
    id: "item-juice",
    name: "Apple Juice",
    price: 100,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-ice"],
  });

  const line = pos.addItem({
    menuItemId: "item-juice",
    quantity: 1,
    modifierIds: ["opt-no-ice"],
  });
  assert.equal(line.unitPrice, 100);
  assert.equal(line.selectedModifiers[0].name, "No Ice");
});

test("Boundary 8: Modifier Groups & Popovers - modifier with negative price adjustment (discount/subtraction)", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-side",
    name: "Side Option",
    minSelect: 0,
    maxSelect: 1,
    isRequired: false,
    options: [{ id: "opt-no-side", name: "No Side Salad (-$20)", priceAdjustment: -20 }],
  });
  pos.registerMenuItem({
    id: "item-platter",
    name: "Combo Platter",
    price: 250,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-side"],
  });

  const line = pos.addItem({
    menuItemId: "item-platter",
    quantity: 1,
    modifierIds: ["opt-no-side"],
  });
  assert.equal(line.unitPrice, 230); // 250 - 20
});

test("Boundary 8: Modifier Groups & Popovers - minSelect equals maxSelect (exact pick-N constraint)", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-thali",
    name: "Pick exactly 2 Breads",
    minSelect: 2,
    maxSelect: 2,
    isRequired: true,
    options: [
      { id: "b-roti", name: "Roti", priceAdjustment: 0 },
      { id: "b-naan", name: "Naan", priceAdjustment: 10 },
      { id: "b-paratha", name: "Paratha", priceAdjustment: 15 },
    ],
  });
  pos.registerMenuItem({
    id: "item-thali",
    name: "Special Thali",
    price: 350,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-thali"],
  });

  // Pick 1 -> fails
  assert.throws(
    () => pos.addItem({ menuItemId: "item-thali", modifierIds: ["b-roti"] }),
    /requires at least 2 selection/,
  );

  // Pick 3 -> fails
  assert.throws(
    () => pos.addItem({ menuItemId: "item-thali", modifierIds: ["b-roti", "b-naan", "b-paratha"] }),
    /permits at most 2 selection/,
  );

  // Pick exactly 2 -> succeeds
  const line = pos.addItem({ menuItemId: "item-thali", modifierIds: ["b-roti", "b-naan"] });
  assert.equal(line.unitPrice, 360); // 350 + 10
});

test("Boundary 8: Modifier Groups & Popovers - unselected optional modifier group passes cleanly", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-opt",
    name: "Optional Toppings",
    minSelect: 0,
    maxSelect: 5,
    isRequired: false,
    options: [{ id: "top-1", name: "Olives", priceAdjustment: 30 }],
  });
  pos.registerMenuItem({
    id: "item-pizza",
    name: "Pizza",
    price: 300,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-opt"],
  });

  const line = pos.addItem({ menuItemId: "item-pizza" });
  assert.equal(line.selectedModifiers.length, 0);
  assert.equal(line.unitPrice, 300);
});

test("Boundary 8: Modifier Groups & Popovers - ignores unknown modifier IDs not in group definition", () => {
  const pos = new PosCartEngine();
  pos.registerModifierGroup({
    id: "mod-g",
    name: "Group G",
    minSelect: 0,
    maxSelect: 2,
    isRequired: false,
    options: [{ id: "real-opt", name: "Real", priceAdjustment: 10 }],
  });
  pos.registerMenuItem({
    id: "item-food",
    name: "Food",
    price: 100,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: ["mod-g"],
  });

  const line = pos.addItem({
    menuItemId: "item-food",
    modifierIds: ["fake-opt-id", "real-opt"],
  });

  assert.equal(line.selectedModifiers.length, 1);
  assert.equal(line.selectedModifiers[0].id, "real-opt");
  assert.equal(line.unitPrice, 110);
});
