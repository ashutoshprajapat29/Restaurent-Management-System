import assert from "node:assert/strict";
import { test } from "node:test";
import { TenancyManager } from "../helpers/tenancy-engine.ts";

test("Boundary 2: Subscription Tiering & Gating - exact boundary value 5 on FREE tier", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({
    tenantId: "t-b2-exact",
    restaurantName: "Exact Free",
    subscriptionTier: "FREE",
  });
  const bId = tenant.branches[0].branchId;

  for (let i = 0; i < 4; i++) manager.addTable("t-b2-exact", bId);
  // 5th table is allowed
  assert.equal(manager.canAddTable("t-b2-exact").allowed, true);
  manager.addTable("t-b2-exact", bId);

  // 6th table is rejected
  assert.equal(manager.canAddTable("t-b2-exact").allowed, false);
});

test("Boundary 2: Subscription Tiering & Gating - staff quota boundary (limit 2 on FREE, 5 on STARTER)", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({
    tenantId: "t-b2-staff",
    restaurantName: "Staff Free",
    subscriptionTier: "FREE",
  });
  const bId = tenant.branches[0].branchId;

  // Starts with 1 initial owner staff
  assert.equal(manager.canAddStaff("t-b2-staff").allowed, true);
  manager.addStaff("t-b2-staff", bId); // now 2

  // 3rd staff exceeds FREE limit of 2
  assert.equal(manager.canAddStaff("t-b2-staff").allowed, false);
  assert.throws(() => manager.addStaff("t-b2-staff", bId), /Quota exceeded.*2 staff/);
});

test("Boundary 2: Subscription Tiering & Gating - enterprise tier handles arbitrary large table/staff counts without quota exception", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({
    tenantId: "t-ent-stress",
    restaurantName: "Enterprise Chain",
    subscriptionTier: "ENTERPRISE",
  });
  const bId = tenant.branches[0].branchId;

  // Simulate 100 tables
  for (let i = 0; i < 100; i++) {
    manager.addTable("t-ent-stress", bId);
  }
  assert.equal(tenant.branches[0].tableCount, 100);
  assert.equal(manager.canAddTable("t-ent-stress").allowed, true);
});

test("Boundary 2: Subscription Tiering & Gating - downgrading tier preserves existing tables but blocks additional ones", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({
    tenantId: "t-downgrade",
    restaurantName: "Downgrade Bistro",
    subscriptionTier: "STARTER",
  });
  const bId = tenant.branches[0].branchId;

  // Add 10 tables on STARTER
  for (let i = 0; i < 10; i++) manager.addTable("t-downgrade", bId);
  assert.equal(tenant.branches[0].tableCount, 10);

  // Downgrade to FREE (ceiling 5)
  manager.updateTier("t-downgrade", "FREE");
  // Existing 10 tables remain
  assert.equal(tenant.branches[0].tableCount, 10);
  // Adding any further tables is blocked
  assert.equal(manager.canAddTable("t-downgrade").allowed, false);
});

test("Boundary 2: Subscription Tiering & Gating - feature flag check remains deterministic when switching tiers repeatedly", () => {
  const manager = new TenancyManager();
  manager.createTenant({ tenantId: "t-flip", restaurantName: "Flip Restro", subscriptionTier: "FREE" });

  assert.equal(manager.canAccessKds("t-flip"), false);
  manager.updateTier("t-flip", "STARTER");
  assert.equal(manager.canAccessKds("t-flip"), true);
  manager.updateTier("t-flip", "FREE");
  assert.equal(manager.canAccessKds("t-flip"), false);
});
