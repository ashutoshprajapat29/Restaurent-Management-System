import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { PosCartEngine } from "./helpers/pos-cart-engine.ts";
import { cartLineKey } from "../../components/pos/cart-line.ts";

describe("Challenger M3: POS Ordering, Cart & Stock Controls Empirical Stress Tests", () => {
  describe("1. One-Click Out-of-Stock Toggle (86ing, rapid toggles, cart validation)", () => {
    test("Rapid toggles: 50 successive flips maintain consistent state and correct odd/even parity", () => {
      const pos = new PosCartEngine();
      pos.registerMenuItem({
        id: "item-stress-1",
        name: "Chef Special Curry",
        price: 320,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: [],
      });

      for (let i = 1; i <= 50; i++) {
        const targetState = i % 2 === 1 ? false : true;
        const updated = pos.toggleOutOfStock("item-stress-1", targetState);
        assert.equal(updated.isActive, targetState);
      }

      // After 50 toggles (even number), it should be back to true (in stock)
      const line = pos.addItem({ menuItemId: "item-stress-1", quantity: 1 });
      assert.equal(line.quantity, 1);
      assert.equal(line.itemName, "Chef Special Curry");

      // 51st toggle -> out of stock
      pos.toggleOutOfStock("item-stress-1", false);
      assert.throws(
        () => pos.addItem({ menuItemId: "item-stress-1", quantity: 1 }),
        /is OUT OF STOCK and cannot be ordered/,
      );
    });

    test("Cart stock validation detects out-of-stock items in active cart and allows resolution on restock", () => {
      const pos = new PosCartEngine();
      pos.registerMenuItem({
        id: "item-biryani",
        name: "Mutton Dum Biryani",
        price: 380,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: [],
      });
      pos.registerMenuItem({
        id: "item-raita",
        name: "Boondi Raita",
        price: 60,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: [],
      });

      // Add both items while available
      pos.addItem({ menuItemId: "item-biryani", quantity: 2 });
      pos.addItem({ menuItemId: "item-raita", quantity: 1 });

      // Initially cart is valid
      assert.equal(pos.validateCartStock().valid, true);
      assert.deepEqual(pos.validateCartStock().outOfStockItemNames, []);

      // Chef 86es Mutton Biryani
      pos.toggleOutOfStock("item-biryani", false);

      const check1 = pos.validateCartStock();
      assert.equal(check1.valid, false);
      assert.deepEqual(check1.outOfStockItemNames, ["Mutton Dum Biryani"]);

      // Chef also 86es Raita
      pos.toggleOutOfStock("item-raita", false);
      const check2 = pos.validateCartStock();
      assert.equal(check2.valid, false);
      assert.equal(check2.outOfStockItemNames.length, 2);
      assert.ok(check2.outOfStockItemNames.includes("Mutton Dum Biryani"));
      assert.ok(check2.outOfStockItemNames.includes("Boondi Raita"));

      // Restock Biryani
      pos.toggleOutOfStock("item-biryani", true);
      const check3 = pos.validateCartStock();
      assert.equal(check3.valid, false);
      assert.deepEqual(check3.outOfStockItemNames, ["Boondi Raita"]);

      // Restock Raita -> cart fully valid again
      pos.toggleOutOfStock("item-raita", true);
      const check4 = pos.validateCartStock();
      assert.equal(check4.valid, true);
      assert.deepEqual(check4.outOfStockItemNames, []);
    });
  });

  describe("2. Kitchen Notes Attachment & Cart Separation", () => {
    test("cartLineKey generates distinct keys for identical item with different kitchen notes", () => {
      const keyNoNote = cartLineKey("item-1", []);
      const keyEmptyNote = cartLineKey("item-1", [], undefined, "");
      const keyNoteA = cartLineKey("item-1", [], undefined, "No onion");
      const keyNoteB = cartLineKey("item-1", [], undefined, "Extra spicy");

      // No note and empty note normalize to same key
      assert.equal(keyNoNote, keyEmptyNote);

      // Different notes produce unique distinct keys
      assert.notEqual(keyNoNote, keyNoteA);
      assert.notEqual(keyNoteA, keyNoteB);
      assert.ok(keyNoteA.includes("::note:No onion"));
      assert.ok(keyNoteB.includes("::note:Extra spicy"));
    });

    test("cartLineKey is order-agnostic for modifiers", () => {
      const key1 = cartLineKey("item-1", ["mod-cheese", "mod-sauce"], undefined, "Hot");
      const key2 = cartLineKey("item-1", ["mod-sauce", "mod-cheese"], undefined, "Hot");
      assert.equal(key1, key2);
    });

    test("Cart keeps distinct lines for identical item with different kitchen notes", () => {
      const pos = new PosCartEngine();
      pos.registerMenuItem({
        id: "item-dosa",
        name: "Masala Dosa",
        price: 120,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: [],
      });

      const line1 = pos.addItem({
        menuItemId: "item-dosa",
        quantity: 1,
        kitchenNote: "Crispy ghee roast, no potato filling",
      });

      const line2 = pos.addItem({
        menuItemId: "item-dosa",
        quantity: 1,
        kitchenNote: "Extra spicy chutney on side",
      });

      const lines = pos.getLines();
      assert.equal(lines.length, 2);
      assert.equal(lines[0].lineId, line1.lineId);
      assert.equal(lines[0].kitchenNote, "Crispy ghee roast, no potato filling");
      assert.equal(lines[1].lineId, line2.lineId);
      assert.equal(lines[1].kitchenNote, "Extra spicy chutney on side");

      // Updating note on line 1 does not affect line 2
      pos.updateLineNote(line1.lineId, "Super crispy please");
      assert.equal(pos.getLines()[0].kitchenNote, "Super crispy please");
      assert.equal(pos.getLines()[1].kitchenNote, "Extra spicy chutney on side");
    });
  });

  describe("3. Modifier Bounds & Price Adjustments", () => {
    test("Enforces minSelect and isRequired bounds on modifier groups", () => {
      const pos = new PosCartEngine();
      pos.registerModifierGroup({
        id: "grp-crust",
        name: "Pizza Crust",
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        options: [
          { id: "opt-pan", name: "Pan Crust", priceAdjustment: 0 },
          { id: "opt-thin", name: "Thin Crust", priceAdjustment: 20 },
        ],
      });

      pos.registerMenuItem({
        id: "item-pizza-1",
        name: "Veggie Supreme Pizza",
        price: 350,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: ["grp-crust"],
      });

      // Omitting required modifier throws
      assert.throws(
        () => pos.addItem({ menuItemId: "item-pizza-1", quantity: 1, modifierIds: [] }),
        /requires at least 1 selection/,
      );

      // Providing required modifier succeeds
      const line = pos.addItem({
        menuItemId: "item-pizza-1",
        quantity: 1,
        modifierIds: ["opt-thin"],
      });
      assert.equal(line.unitPrice, 370); // 350 + 20
    });

    test("Enforces maxSelect bounds on modifier groups", () => {
      const pos = new PosCartEngine();
      pos.registerModifierGroup({
        id: "grp-toppings",
        name: "Extra Toppings",
        minSelect: 0,
        maxSelect: 2,
        isRequired: false,
        options: [
          { id: "top-olives", name: "Black Olives", priceAdjustment: 30 },
          { id: "top-jalapeno", name: "Jalapenos", priceAdjustment: 30 },
          { id: "top-corn", name: "Sweet Corn", priceAdjustment: 25 },
        ],
      });

      pos.registerMenuItem({
        id: "item-pizza-2",
        name: "Cheese Pizza",
        price: 250,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: ["grp-toppings"],
      });

      // Selecting 3 toppings when max is 2 throws
      assert.throws(
        () =>
          pos.addItem({
            menuItemId: "item-pizza-2",
            quantity: 1,
            modifierIds: ["top-olives", "top-jalapeno", "top-corn"],
          }),
        /permits at most 2 selection/,
      );

      // Selecting 2 toppings succeeds
      const line = pos.addItem({
        menuItemId: "item-pizza-2",
        quantity: 1,
        modifierIds: ["top-olives", "top-jalapeno"],
      });
      assert.equal(line.unitPrice, 310); // 250 + 30 + 30
      assert.equal(line.selectedModifiers.length, 2);
    });

    test("Correctly calculates positive and negative modifier price adjustments", () => {
      const pos = new PosCartEngine();
      pos.registerModifierGroup({
        id: "grp-combo",
        name: "Combo Options",
        minSelect: 0,
        maxSelect: 3,
        isRequired: false,
        options: [
          { id: "opt-upgrade-drink", name: "Large Drink Upgrade", priceAdjustment: 40 },
          { id: "opt-no-fries", name: "Skip Fries Discount", priceAdjustment: -25 },
        ],
      });

      pos.registerMenuItem({
        id: "item-burger-meal",
        name: "Crispy Chicken Meal",
        price: 220,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: ["grp-combo"],
      });

      // Positive adjustment: 220 + 40 = 260
      const lineAdd = pos.addItem({
        menuItemId: "item-burger-meal",
        quantity: 1,
        modifierIds: ["opt-upgrade-drink"],
      });
      assert.equal(lineAdd.unitPrice, 260);

      // Negative adjustment: 220 - 25 = 195
      const lineSub = pos.addItem({
        menuItemId: "item-burger-meal",
        quantity: 1,
        modifierIds: ["opt-no-fries"],
      });
      assert.equal(lineSub.unitPrice, 195);

      // Both combined: 220 + 40 - 25 = 235
      const lineCombined = pos.addItem({
        menuItemId: "item-burger-meal",
        quantity: 2,
        modifierIds: ["opt-upgrade-drink", "opt-no-fries"],
      });
      assert.equal(lineCombined.unitPrice, 235);
      assert.equal(lineCombined.lineTotal, 470);
    });
  });

  describe("4. Touch Usability Verification on POS CartPanel", () => {
    test("CartPanel quantity and removal buttons enforce minimum 44x44px touch targets", () => {
      const candidates = [
        path.resolve(process.cwd(), "apps/web/components/pos/cart-panel.tsx"),
        path.resolve(process.cwd(), "components/pos/cart-panel.tsx"),
      ];
      const cartPanelPath = candidates.find((p) => fs.existsSync(p));
      assert.ok(cartPanelPath && fs.existsSync(cartPanelPath), "cart-panel.tsx must exist");
      const content = fs.readFileSync(cartPanelPath, "utf-8");

      // Verify Minus (decrement) button has 44x44px touch target classes
      const decBtnPattern =
        /min-h-\[44px\]\s+min-w-\[44px\]\s+h-11\s+w-11[\s\S]*?cart-line-dec/;
      assert.ok(
        decBtnPattern.test(content) ||
          content.includes('data-testid={`cart-line-dec-${line.key}`}') &&
          content.includes("min-h-[44px] min-w-[44px]"),
        "cart-line-dec button must have min-h-[44px] min-w-[44px]",
      );

      // Verify Plus (increment) button has 44x44px touch target classes
      assert.ok(
        content.includes('data-testid={`cart-line-inc-${line.key}`}') &&
        content.includes("min-h-[44px] min-w-[44px]"),
        "cart-line-inc button must have min-h-[44px] min-w-[44px]",
      );

      // Verify Trash2 (remove line) button has 44x44px touch target classes
      assert.ok(
        content.includes('data-testid={`cart-line-remove-${line.key}`}') &&
        content.includes("min-h-[44px] min-w-[44px]"),
        "cart-line-remove button must have min-h-[44px] min-w-[44px]",
      );
    });

    test("ProductGrid 86/Restock toggle button is clearly present with dedicated testid and accessible title", () => {
      const candidates = [
        path.resolve(process.cwd(), "apps/web/components/pos/product-grid.tsx"),
        path.resolve(process.cwd(), "components/pos/product-grid.tsx"),
      ];
      const productGridPath = candidates.find((p) => fs.existsSync(p));
      assert.ok(productGridPath && fs.existsSync(productGridPath), "product-grid.tsx must exist");
      const content = fs.readFileSync(productGridPath, "utf-8");

      assert.ok(
        content.includes('data-testid={`pos-stock-toggle-${item.id}`}'),
        "product-grid must render pos-stock-toggle-[itemId]",
      );
      assert.ok(
        content.includes('data-testid={`pos-item-badge-oos-${item.id}`}'),
        "product-grid must render OUT OF STOCK badge",
      );
    });
  });
});
