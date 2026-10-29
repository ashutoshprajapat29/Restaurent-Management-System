import assert from "node:assert/strict";
import { test } from "node:test";
import { TIER_LIMITS, TenancyManager } from "../helpers/tenancy-engine.ts";

test("Feature 2: Subscription Tiering & Gating - defines valid quota limits for all tiers", () => {
  assert.equal(TIER_LIMITS.FREE.maxTables, 5);
  assert.equal(TIER_LIMITS.STARTER.maxTables, 15);
  assert.equal(TIER_LIMITS.PRO.maxTables, 50);
  assert.equal(TIER_LIMITS.ENTERPRISE.maxTables, Number.POSITIVE_INFINITY);
});

test("Feature 2: Subscription Tiering & Gating - enforces table quota ceiling on FREE tier", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({
    tenantId: "org-free-cafe",
    restaurantName: "Free Cafe",
    subscriptionTier: "FREE",
  });
  const branchId = tenant.branches[0].branchId;

  for (let i = 0; i < 5; i++) {
    assert.equal(manager.canAddTable("org-free-cafe").allowed, true);
    manager.addTable("org-free-cafe", branchId);
  }

  // 6th table must be blocked
  const check = manager.canAddTable("org-free-cafe");
  assert.equal(check.allowed, false);
  assert.match(check.reason!, /Quota exceeded.*FREE.*5 tables/);
  assert.throws(() => manager.addTable("org-free-cafe", branchId), /Quota exceeded/);
});

test("Feature 2: Subscription Tiering & Gating - gates KDS access on FREE tier and allows on STARTER", () => {
  const manager = new TenancyManager();
  manager.createTenant({
    tenantId: "tenant-free",
    restaurantName: "Free Diner",
    subscriptionTier: "FREE",
  });
  manager.createTenant({
    tenantId: "tenant-starter",
    restaurantName: "Starter Diner",
    subscriptionTier: "STARTER",
  });

  assert.equal(manager.canAccessKds("tenant-free"), false);
  assert.equal(manager.canAccessKds("tenant-starter"), true);
});

test("Feature 2: Subscription Tiering & Gating - gates custom branding to PRO and ENTERPRISE tiers", () => {
  const manager = new TenancyManager();
  manager.createTenant({ tenantId: "t-starter", restaurantName: "T Starter", subscriptionTier: "STARTER" });
  manager.createTenant({ tenantId: "t-pro", restaurantName: "T Pro", subscriptionTier: "PRO" });
  manager.createTenant({ tenantId: "t-ent", restaurantName: "T Enterprise", subscriptionTier: "ENTERPRISE" });

  assert.equal(manager.canCustomizeBranding("t-starter"), false);
  assert.equal(manager.canCustomizeBranding("t-pro"), true);
  assert.equal(manager.canCustomizeBranding("t-ent"), true);
});

test("Feature 2: Subscription Tiering & Gating - upgrades tier dynamically and unlocks quota expansion", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({
    tenantId: "upgrade-test",
    restaurantName: "Upgrade Cafe",
    subscriptionTier: "FREE",
  });
  const branchId = tenant.branches[0].branchId;

  // Fill up FREE tier (5 tables)
  for (let i = 0; i < 5; i++) manager.addTable("upgrade-test", branchId);
  assert.equal(manager.canAddTable("upgrade-test").allowed, false);

  // Upgrade to PRO
  manager.updateTier("upgrade-test", "PRO");
  assert.equal(manager.canAddTable("upgrade-test").allowed, true);
  manager.addTable("upgrade-test", branchId);
  assert.equal(tenant.branches[0].tableCount, 6);
  assert.equal(manager.canCustomizeBranding("upgrade-test"), true);
});
