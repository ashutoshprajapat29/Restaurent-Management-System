import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TAX_REGIME_PRESETS,
  resolveTaxIdLabel,
  resolveTaxLabel,
} from "@nodedr-restaurant/types";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Pairwise: India GST Tax Regime x 80mm Thermal Receipt Layout", () => {
  const regime = TAX_REGIME_PRESETS.INDIA_GST;
  assert.equal(regime.defaultMode, "INCLUSIVE");
  assert.equal(regime.splitCgstSgst, true);
  assert.equal(resolveTaxLabel("INDIA_GST"), "GST");
  assert.equal(resolveTaxIdLabel("INDIA_GST"), "GSTIN");

  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-thali",
    name: "Royal Thali",
    price: 315, // 300 base + 5% GST = 315 inclusive
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.addItem({ menuItemId: "item-thali", quantity: 1 });

  const totals = pos.calculateTotals({ taxMode: "INCLUSIVE", defaultTaxRate: 5 });
  assert.equal(totals.total, 315);
  assert.equal(totals.taxAmount, 15);

  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "GST-01",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Rakesh",
    items: [{ id: "1", name: "Royal Thali", quantity: 1, stationName: "Kitchen" }],
  });

  const thermal = kds.renderThermalLayout(kot.id, 80);
  assert.equal(thermal.columns, 48);
  assert.ok(thermal.text.includes("Royal Thali"));
  assert.ok(thermal.text.includes("Waiter: Rakesh"));
});

test("Pairwise: US Sales Tax Regime (EXCLUSIVE Mode) x 58mm Thermal Print Layout", () => {
  const regime = TAX_REGIME_PRESETS.US_SALES_TAX;
  assert.equal(regime.defaultMode, "EXCLUSIVE");
  assert.equal(resolveTaxLabel("US_SALES_TAX"), "Sales Tax");

  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-burger",
    name: "Smash Burger",
    price: 15.0,
    taxRatePercent: 8,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.addItem({ menuItemId: "item-burger", quantity: 2 }); // 30.00 subtotal

  const totals = pos.calculateTotals({ taxMode: "EXCLUSIVE", defaultTaxRate: 8 });
  assert.equal(totals.subtotal, 30.0);
  assert.equal(totals.taxAmount, 2.4);
  assert.equal(totals.total, 32.4);

  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "US-88",
    orderType: "TAKEAWAY",
    waiterId: "w-us",
    waiterName: "Johnny",
    items: [{ id: "1", name: "Smash Burger", quantity: 2, stationName: "Grill" }],
  });

  const thermal = kds.renderThermalLayout(kot.id, 58);
  assert.equal(thermal.columns, 32);
  assert.ok(thermal.text.includes("2x Smash Burger"));
  assert.ok(thermal.text.includes("Waiter: Johnny"));
});

test("Pairwise: EU VAT Regime x INCLUSIVE Menu Pricing with Waiter ID Attribution", () => {
  const regime = TAX_REGIME_PRESETS.EU_VAT;
  assert.equal(regime.defaultMode, "INCLUSIVE");
  assert.equal(resolveTaxLabel("EU_VAT"), "VAT");

  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-pizza-eu",
    name: "Quattro Formaggi",
    price: 12.0,
    taxRatePercent: 10,
    isActive: true,
    modifierGroupIds: [],
  });
  pos.addItem({ menuItemId: "item-pizza-eu", quantity: 1 });

  const totals = pos.calculateTotals({ taxMode: "INCLUSIVE", defaultTaxRate: 10 });
  assert.equal(totals.total, 12.0);
  assert.ok(totals.taxAmount > 0);
});

test("Pairwise: Spain IVA Regime with Custom taxId / NIF-CIF Label Resolution", () => {
  const es = TAX_REGIME_PRESETS.ES_IVA;
  assert.equal(es.taxIdLabel, "NIF/CIF");
  assert.equal(es.taxLabel, "IVA");
  assert.equal(resolveTaxIdLabel("ES_IVA"), "NIF/CIF");
  assert.equal(resolveTaxLabel("ES_IVA"), "IVA");
});

test("Pairwise: Custom Tax Regime with Explicit Override and Thermal Output", () => {
  assert.equal(resolveTaxLabel("CUSTOM", "Tourist Tax 3%"), "Tourist Tax 3%");
  assert.equal(resolveTaxIdLabel("CUSTOM"), "Tax ID");
});
