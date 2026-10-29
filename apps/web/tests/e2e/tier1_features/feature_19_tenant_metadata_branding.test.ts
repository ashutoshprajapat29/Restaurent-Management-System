import assert from "node:assert/strict";
import { test } from "node:test";
import { restaurantSettingsSchema } from "@nodedr-restaurant/types";

test("Feature 19: Tenant Metadata & Branding - parses complete white-label branding payload", () => {
  const settings = restaurantSettingsSchema.parse({
    name: "Urban Tadka",
    legalName: "Urban Tadka Hospitality Private Limited",
    logoUrl: "https://cdn.example.com/restaurants/urban-tadka/logo.png",
    currency: "INR",
    timezone: "Asia/Kolkata",
    upiVpa: "urbantadka@kotak",
    upiPayeeName: "Urban Tadka Foods",
  });

  assert.equal(settings.name, "Urban Tadka");
  assert.equal(settings.logoUrl, "https://cdn.example.com/restaurants/urban-tadka/logo.png");
  assert.equal(settings.currency, "INR");
});

test("Feature 19: Tenant Metadata & Branding - allows null logoUrl for default branding", () => {
  const settings = restaurantSettingsSchema.parse({
    name: "Minimalist Cafe",
    logoUrl: null,
  });

  assert.equal(settings.logoUrl, null);
});

test("Feature 19: Tenant Metadata & Branding - validates maximum length of restaurant name", () => {
  assert.throws(
    () =>
      restaurantSettingsSchema.parse({
        name: "This Restaurant Name Is Deliberately Exceeding The Forty Characters Allowed",
      }),
    /Too big/,
  );
});

test("Feature 19: Tenant Metadata & Branding - enforces NPCI VPA format for brand UPI payee", () => {
  assert.throws(
    () =>
      restaurantSettingsSchema.parse({
        upiVpa: "plainstringwithnoat",
      }),
    /Enter a valid UPI id/,
  );

  const valid = restaurantSettingsSchema.parse({
    upiVpa: "support.pay@axisbank",
  });
  assert.equal(valid.upiVpa, "support.pay@axisbank");
});

test("Feature 19: Tenant Metadata & Branding - configures loyalty program currency parameters", () => {
  const settings = restaurantSettingsSchema.parse({
    loyaltyPointValue: 1.5,
    loyaltyEarnPerCurrency: 100,
  });

  assert.equal(settings.loyaltyPointValue, 1.5);
  assert.equal(settings.loyaltyEarnPerCurrency, 100);
});
