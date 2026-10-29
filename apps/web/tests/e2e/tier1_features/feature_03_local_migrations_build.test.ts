import assert from "node:assert/strict";
import { test } from "node:test";
import {
  branchSettingsSchema,
  restaurantSettingsSchema,
  tableSchema,
} from "@nodedr-restaurant/types";

test("Feature 3: Local Migrations & Build - validates Restaurant tenant configuration schema", () => {
  const valid = restaurantSettingsSchema.parse({
    name: "Golden Fork Bistro",
    currency: "INR",
    timezone: "Asia/Kolkata",
    upiVpa: "goldenfork@okhdfcbank",
    upiPayeeName: "Golden Fork Foods LLP",
  });

  assert.equal(valid.name, "Golden Fork Bistro");
  assert.equal(valid.currency, "INR");
  assert.equal(valid.upiVpa, "goldenfork@okhdfcbank");
});

test("Feature 3: Local Migrations & Build - rejects malformed restaurant branding data", () => {
  assert.throws(
    () =>
      restaurantSettingsSchema.parse({
        name: "A".repeat(50), // exceeds max length 40
      }),
    /Too big/,
  );
});

test("Feature 3: Local Migrations & Build - validates Branch settings schema with thermal printer setup", () => {
  const branch = branchSettingsSchema.parse({
    name: "Main Branch",
    country: "IN",
    taxRegime: "INDIA_GST",
    taxMode: "INCLUSIVE",
    printerPaperWidthMm: 80,
    printerConnection: "NETWORK",
    printerHost: "192.168.1.100",
    printerPort: 9100,
  });

  assert.equal(branch.taxRegime, "INDIA_GST");
  assert.equal(branch.printerPaperWidthMm, 80);
  assert.equal(branch.printerHost, "192.168.1.100");
});

test("Feature 3: Local Migrations & Build - rejects invalid printer port and connection parameters", () => {
  assert.throws(
    () =>
      branchSettingsSchema.parse({
        name: "Branch X",
        printerPort: 99999, // port out of bounds
      }),
    /Too big/,
  );
});

test("Feature 3: Local Migrations & Build - validates Table entity schema with spatial bounds", () => {
  const table = tableSchema.parse({
    floorId: "floor-ground-01",
    number: "T-12",
    capacity: 6,
    posX: 120,
    posY: 240,
    width: 100,
    height: 100,
    shape: "round",
  });

  assert.equal(table.number, "T-12");
  assert.equal(table.capacity, 6);
  assert.equal(table.shape, "round");
});
