import assert from "node:assert/strict";
import { test } from "node:test";
import { TenancyManager } from "../helpers/tenancy-engine.ts";

test("Feature 1: Organization & Branch Scoping - creates tenant with initial branch", () => {
  const manager = new TenancyManager();
  const tenant = manager.createTenant({
    tenantId: "org-spice-route",
    restaurantName: "The Spice Route",
    subscriptionTier: "STARTER",
    initialBranchName: "Downtown",
  });

  assert.equal(tenant.tenantId, "org-spice-route");
  assert.equal(tenant.restaurantName, "The Spice Route");
  assert.equal(tenant.branches.length, 1);
  assert.equal(tenant.branches[0].branchName, "Downtown");
});

test("Feature 1: Organization & Branch Scoping - enforces unique tenant IDs", () => {
  const manager = new TenancyManager();
  manager.createTenant({
    tenantId: "org-cafe-delight",
    restaurantName: "Cafe Delight",
  });

  assert.throws(
    () => manager.createTenant({ tenantId: "org-cafe-delight", restaurantName: "Duplicate Cafe" }),
    /already exists/,
  );
});

test("Feature 1: Organization & Branch Scoping - strictly isolates branches across tenants", () => {
  const manager = new TenancyManager();
  const t1 = manager.createTenant({ tenantId: "tenant-a", restaurantName: "Tenant A" });
  const t2 = manager.createTenant({ tenantId: "tenant-b", restaurantName: "Tenant B" });

  assert.equal(manager.isIsolated("tenant-a", "tenant-b", t2.branches[0].branchId), true);
  assert.equal(manager.isIsolated("tenant-b", "tenant-a", t1.branches[0].branchId), true);
});

test("Feature 1: Organization & Branch Scoping - prevents cross-tenant data mutation", () => {
  const manager = new TenancyManager();
  manager.createTenant({ tenantId: "tenant-x", restaurantName: "Tenant X" });
  manager.createTenant({ tenantId: "tenant-y", restaurantName: "Tenant Y" });

  assert.throws(
    () => manager.addTable("tenant-x", "tenant-y-b1"),
    /does not belong to tenant tenant-x/,
  );
});

test("Feature 1: Organization & Branch Scoping - retrieves tenant context by ID", () => {
  const manager = new TenancyManager();
  manager.createTenant({
    tenantId: "tenant-lookup",
    restaurantName: "Bistro 42",
    subscriptionTier: "PRO",
  });

  const retrieved = manager.getTenant("tenant-lookup");
  assert.equal(retrieved.restaurantName, "Bistro 42");
  assert.equal(retrieved.subscriptionTier, "PRO");
  assert.throws(() => manager.getTenant("non-existent"), /not found/);
});
