import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";
import { TenancyManager } from "../helpers/tenancy-engine.ts";

test("Scenario 4: Multi-Tenant SaaS Lifecycle: Expansion, Quota Boundary & Cross-Branch RBAC Enforcement", () => {
  const tenancy = new TenancyManager();

  // 1. Tenant A: Small Pizzeria on Free Tier
  const tenantA = tenancy.createTenant({
    tenantId: "tenant-pizzeria",
    restaurantName: "Luigi's Pizzeria",
    subscriptionTier: "FREE",
  });
  const bA1 = tenantA.branches[0].branchId;

  // 2. Tenant B: Multi-Location Burger Chain on Pro Tier
  const tenantB = tenancy.createTenant({
    tenantId: "tenant-burgers",
    restaurantName: "Stack Burger Co.",
    subscriptionTier: "PRO",
  });
  const bB1 = tenantB.branches[0].branchId;

  // 3. Quota Boundary Check on Tenant A:
  // Fills Free quota with 5 tables
  for (let i = 0; i < 5; i++) tenancy.addTable(tenantA.tenantId, bA1);
  assert.equal(tenancy.canAddTable(tenantA.tenantId).allowed, false);

  // Attempting 6th table throws Quota Exceeded
  assert.throws(
    () => tenancy.addTable(tenantA.tenantId, bA1),
    /Quota exceeded: FREE tier permits maximum 5 tables/,
  );

  // Tenant A decides to upgrade to Starter
  tenancy.updateTier(tenantA.tenantId, "STARTER");
  assert.equal(tenancy.canAddTable(tenantA.tenantId).allowed, true);
  // Now can add up to 15 tables
  tenancy.addTable(tenantA.tenantId, bA1);
  assert.equal(tenantA.branches[0].tableCount, 6);

  // 4. Data Scoping & Multi-Tenant Isolation
  // Tenant A cannot mutate or add tables to Tenant B's branch
  assert.throws(
    () => tenancy.addTable(tenantA.tenantId, bB1),
    /does not belong to tenant tenant-pizzeria/,
  );
  assert.equal(tenancy.isIsolated(tenantA.tenantId, tenantB.tenantId, bB1), true);

  // 5. Staff Branch Isolation & Pin Switching
  const auth = new AuthRbacEngine();
  const staffA = auth.createStaff({ id: "staff-luigi", name: "Luigi", role: "OWNER", pin: "1111", branchIds: [bA1] });
  const staffB = auth.createStaff({ id: "staff-bob", name: "Bob", role: "CASHIER", pin: "2222", branchIds: [bB1] });

  // Terminal at Branch A1 accepts staff A
  assert.equal(auth.loginWithPin("1111", bA1).user.id, staffA.id);

  // Terminal at Branch A1 refuses staff B from Branch B1
  assert.throws(
    () => auth.loginWithPin("2222", bA1),
    /Invalid PIN or inactive staff account/,
  );
});
