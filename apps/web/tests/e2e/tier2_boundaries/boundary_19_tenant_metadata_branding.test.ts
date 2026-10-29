import assert from "node:assert/strict";
import { test } from "node:test";
import { restaurantSettingsSchema } from "@nodedr-restaurant/types";

test("Boundary 19: Tenant Metadata & Branding - logoUrl with long URL up to 2048 characters", () => {
  const longUrl = `https://cdn.example.com/${"a".repeat(2000)}.png`;
  const parsed = restaurantSettingsSchema.parse({ logoUrl: longUrl });
  assert.equal(parsed.logoUrl, longUrl);

  const overflowUrl = `https://cdn.example.com/${"a".repeat(2040)}.png`;
  assert.throws(() => restaurantSettingsSchema.parse({ logoUrl: overflowUrl }), /Too big/);
});

test("Boundary 19: Tenant Metadata & Branding - loyalty point value of 0 is accepted", () => {
  const parsed = restaurantSettingsSchema.parse({ loyaltyPointValue: 0 });
  assert.equal(parsed.loyaltyPointValue, 0);

  assert.throws(() => restaurantSettingsSchema.parse({ loyaltyPointValue: -1 }), /Too small/);
});

test("Boundary 19: Tenant Metadata & Branding - loyalty earn per currency must be strictly positive", () => {
  assert.throws(() => restaurantSettingsSchema.parse({ loyaltyEarnPerCurrency: 0 }), /Too small/);
  assert.throws(() => restaurantSettingsSchema.parse({ loyaltyEarnPerCurrency: -5 }), /Too small/);

  const parsed = restaurantSettingsSchema.parse({ loyaltyEarnPerCurrency: 1 });
  assert.equal(parsed.loyaltyEarnPerCurrency, 1);
});

test("Boundary 19: Tenant Metadata & Branding - upiPayeeName up to 60 characters", () => {
  const name60 = "X".repeat(60);
  const parsed = restaurantSettingsSchema.parse({ upiPayeeName: name60 });
  assert.equal(parsed.upiPayeeName, name60);

  const name61 = "X".repeat(61);
  assert.throws(() => restaurantSettingsSchema.parse({ upiPayeeName: name61 }), /Too big/);
});

test("Boundary 19: Tenant Metadata & Branding - empty object parses with all fields optional", () => {
  const parsed = restaurantSettingsSchema.parse({});
  assert.deepEqual(parsed, {});
});
