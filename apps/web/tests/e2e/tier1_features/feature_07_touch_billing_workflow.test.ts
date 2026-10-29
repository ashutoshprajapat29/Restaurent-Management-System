import assert from "node:assert/strict";
import { test } from "node:test";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Feature 7: Touch Billing Workflow - creates cart for Dine-in with table assignment", () => {
  const pos = new PosCartEngine();
  pos.orderType = "DINE_IN";
  pos.tableId = "tbl-05";

  pos.registerMenuItem({
    id: "item-biryani",
    name: "Chicken Dum Biryani",
    price: 320,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const line = pos.addItem({ menuItemId: "item-biryani", quantity: 2 });
  assert.equal(line.quantity, 2);
  assert.equal(line.lineTotal, 640);
  assert.equal(pos.orderType, "DINE_IN");
  assert.equal(pos.tableId, "tbl-05");
});

test("Feature 7: Touch Billing Workflow - creates cart for Takeaway mode without table requirement", () => {
  const pos = new PosCartEngine();
  pos.orderType = "TAKEAWAY";

  pos.registerMenuItem({
    id: "item-wrap",
    name: "Paneer Tikka Wrap",
    price: 180,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  pos.addItem({ menuItemId: "item-wrap", quantity: 1 });
  const lines = pos.getLines();

  assert.equal(lines.length, 1);
  assert.equal(pos.orderType, "TAKEAWAY");
  assert.equal(pos.tableId, undefined);
});

test("Feature 7: Touch Billing Workflow - calculates order subtotal, tax, and total accurately", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-pizza",
    name: "Farmhouse Pizza",
    price: 450,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.registerMenuItem({
    id: "item-coke",
    name: "Diet Coke",
    price: 60,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  pos.addItem({ menuItemId: "item-pizza", quantity: 1 });
  pos.addItem({ menuItemId: "item-coke", quantity: 2 });

  const totals = pos.calculateTotals({ taxMode: "INCLUSIVE", defaultTaxRate: 5 });
  assert.equal(totals.subtotal, 570); // 450 + 120
  assert.equal(totals.total, 570);
  assert.ok(totals.taxAmount > 0);
});

test("Feature 7: Touch Billing Workflow - applies percent discount correctly to bill", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-pasta",
    name: "Penne Alfredo",
    price: 300,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  pos.addItem({ menuItemId: "item-pasta", quantity: 2 }); // 600
  const totals = pos.calculateTotals({ discountPercent: 10 });

  assert.equal(totals.subtotal, 600);
  assert.equal(totals.discountAmount, 60);
  assert.equal(totals.total, 540);
});

test("Feature 7: Touch Billing Workflow - handles tip addition outside taxable food subtotal", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-curry",
    name: "Butter Chicken",
    price: 350,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  pos.addItem({ menuItemId: "item-curry", quantity: 1 });
  const totals = pos.calculateTotals({ tip: 50 });

  assert.equal(totals.subtotal, 350);
  assert.equal(totals.tip, 50);
  assert.equal(totals.total, 400);
});
