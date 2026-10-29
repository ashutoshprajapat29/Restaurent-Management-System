import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TAX_MODES,
  TAX_REGIMES,
  branchTaxSettingsSchema,
  resolveTaxIdLabel,
  resolveTaxLabel,
} from "@nodedr-restaurant/types";

test("Boundary 20: Tax Regimes & Configurable Rates - country code must be exactly 2 characters (ISO 3166-1 alpha-2)", () => {
  const valid = branchTaxSettingsSchema.parse({ country: "IN" });
  assert.equal(valid.country, "IN");

  assert.throws(() => branchTaxSettingsSchema.parse({ country: "IND" }), /exactly 2 characters/);
  assert.throws(() => branchTaxSettingsSchema.parse({ country: "I" }), /exactly 2 characters/);
});

test("Boundary 20: Tax Regimes & Configurable Rates - taxLabel max length 30 characters", () => {
  const label30 = "T".repeat(30);
  assert.equal(branchTaxSettingsSchema.parse({ taxLabel: label30 }).taxLabel, label30);

  const label31 = "T".repeat(31);
  assert.throws(() => branchTaxSettingsSchema.parse({ taxLabel: label31 }), /Too big/);
});

test("Boundary 20: Tax Regimes & Configurable Rates - taxId max length 50 characters", () => {
  const id50 = "N".repeat(50);
  assert.equal(branchTaxSettingsSchema.parse({ taxId: id50 }).taxId, id50);

  const id51 = "N".repeat(51);
  assert.throws(() => branchTaxSettingsSchema.parse({ taxId: id51 }), /Too big/);
});

test("Boundary 20: Tax Regimes & Configurable Rates - supports all 5 TAX_REGIMES and both TAX_MODES", () => {
  assert.equal(TAX_REGIMES.length, 5);
  assert.ok(TAX_REGIMES.includes("INDIA_GST"));
  assert.ok(TAX_REGIMES.includes("US_SALES_TAX"));
  assert.ok(TAX_REGIMES.includes("EU_VAT"));
  assert.ok(TAX_REGIMES.includes("ES_IVA"));
  assert.ok(TAX_REGIMES.includes("CUSTOM"));

  assert.equal(TAX_MODES.length, 2);
  assert.ok(TAX_MODES.includes("INCLUSIVE"));
  assert.ok(TAX_MODES.includes("EXCLUSIVE"));
});

test("Boundary 20: Tax Regimes & Configurable Rates - resolves fallback correctly when taxLabel is whitespace only", () => {
  assert.equal(resolveTaxLabel("EU_VAT", "   "), "VAT");
  assert.equal(resolveTaxLabel("US_SALES_TAX", ""), "Sales Tax");
  assert.equal(resolveTaxLabel("CUSTOM", undefined), "Tax");
});
