import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TAX_REGIME_PRESETS,
  resolveTaxIdLabel,
  resolveTaxLabel,
} from "@nodedr-restaurant/types";

test("Feature 20: Tax Regimes & Configurable Rates - presets match India GST with CGST/SGST split", () => {
  const gst = TAX_REGIME_PRESETS.INDIA_GST;
  assert.equal(gst.regime, "INDIA_GST");
  assert.equal(gst.defaultMode, "INCLUSIVE");
  assert.equal(gst.taxLabel, "GST");
  assert.equal(gst.taxIdLabel, "GSTIN");
  assert.equal(gst.splitCgstSgst, true);
});

test("Feature 20: Tax Regimes & Configurable Rates - presets match US Sales Tax with EXCLUSIVE mode", () => {
  const us = TAX_REGIME_PRESETS.US_SALES_TAX;
  assert.equal(us.regime, "US_SALES_TAX");
  assert.equal(us.defaultMode, "EXCLUSIVE");
  assert.equal(us.taxLabel, "Sales Tax");
  assert.equal(us.splitCgstSgst, false);
});

test("Feature 20: Tax Regimes & Configurable Rates - presets match EU VAT and Spain IVA with INCLUSIVE mode", () => {
  const eu = TAX_REGIME_PRESETS.EU_VAT;
  const es = TAX_REGIME_PRESETS.ES_IVA;

  assert.equal(eu.defaultMode, "INCLUSIVE");
  assert.equal(eu.taxLabel, "VAT");

  assert.equal(es.defaultMode, "INCLUSIVE");
  assert.equal(es.taxLabel, "IVA");
  assert.equal(es.taxIdLabel, "NIF/CIF");
});

test("Feature 20: Tax Regimes & Configurable Rates - resolves custom taxLabel override over regime preset", () => {
  assert.equal(resolveTaxLabel("INDIA_GST", null), "GST");
  assert.equal(resolveTaxLabel("INDIA_GST", "Goods & Services Tax"), "Goods & Services Tax");
  assert.equal(resolveTaxLabel("US_SALES_TAX", "State Tax"), "State Tax");
});

test("Feature 20: Tax Regimes & Configurable Rates - resolves tax ID label per selected regime", () => {
  assert.equal(resolveTaxIdLabel("INDIA_GST"), "GSTIN");
  assert.equal(resolveTaxIdLabel("US_SALES_TAX"), "Sales Tax / EIN");
  assert.equal(resolveTaxIdLabel("EU_VAT"), "VAT No.");
  assert.equal(resolveTaxIdLabel("ES_IVA"), "NIF/CIF");
  assert.equal(resolveTaxIdLabel("CUSTOM"), "Tax ID");
});
