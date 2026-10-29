import assert from "node:assert/strict";
import { test } from "node:test";
import { TenancyManager } from "../helpers/tenancy-engine.ts";

test("Boundary 1: Organization & Branch Scoping - empty strings or whitespace in tenant/branch IDs", () => {
  const manager = new TenancyManager();
  assert.throws(
    () => manager.createTenant({ tenantId: "", restaurantName: "Empty Corp" }),
    /already exists|not found|cannot be empty|Invalid/,
  );
});

test("Boundary 1: Organization & Branch Scoping - handles tenant with zero active branches gracefully", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({ tenantId: "t-bare", restaurantName: "Bare Tenant" });
  tenant.branches = [];

  assert.equal(tenant.branches.length, 0);
  assert.throws(() => manager.addTable("t-bare", "non-existent-b"), /does not belong/);
});

test("Boundary 1: Organization & Branch Scoping - blocks operations when subscription status is PAST_DUE or CANCELLED", () => {
  const manager = new TenancyManager();
  const tPastDue = manager.createTenant({
    tenantId: "t-pastdue",
    restaurantName: "Past Due Restro",
    status: "PAST_DUE",
  });
  const tCancelled = manager.createTenant({
    tenantId: "t-cancelled",
    restaurantName: "Cancelled Restro",
    status: "CANCELLED",
  });

  assert.equal(manager.canAddTable("t-pastdue").allowed, false);
  assert.match(manager.canAddTable("t-pastdue").reason!, /Subscription is PAST_DUE/);

  assert.equal(manager.canAddTable("t-cancelled").allowed, false);
  assert.match(manager.canAddTable("t-cancelled").reason!, /Subscription is CANCELLED/);
});

test("Boundary 1: Organization & Branch Scoping - permits operations while in TRIALING status", () => {
  const manager = new TenancyManager();
  const tTrial = manager.createTenant({
    tenantId: "t-trial",
    restaurantName: "Trial Cafe",
    status: "TRIALING",
    subscriptionTier: "PRO",
  });

  assert.equal(manager.canAddTable("t-trial").allowed, true);
  manager.addTable("t-trial", tTrial.branches[0].branchId);
  assert.equal(tTrial.branches[0].tableCount, 1);
});

test("Boundary 1: Organization & Branch Scoping - unicode and special characters in restaurant name", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({
    tenantId: "t-unicode",
    restaurantName: "Café Délices & Sushi 寿司 🍣 #1!",
  });

  assert.equal(tenant.restaurantName, "Café Délices & Sushi 寿司 🍣 #1!");
});
