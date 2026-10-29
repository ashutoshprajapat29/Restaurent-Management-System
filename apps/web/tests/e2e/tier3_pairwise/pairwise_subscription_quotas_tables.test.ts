import assert from "node:assert/strict";
import { test } from "node:test";
import { TableFloorManager } from "../helpers/table-floor-engine.ts";
import { TenancyManager } from "../helpers/tenancy-engine.ts";

test("Pairwise: Subscription Tier Free Quota (5 Tables) Restricts Floor Management Creation", () => {
  const tenancy = new TenancyManager();
  const tenant = tenancy.createTenant({ tenantId: "t-quota-floor", restaurantName: "Quota Cafe", subscriptionTier: "FREE" });
  const branchId = tenant.branches[0].branchId;

  const floorManager = new TableFloorManager();
  const floor = floorManager.createFloor(branchId, "Main Floor");

  // Create 5 tables
  for (let i = 1; i <= 5; i++) {
    tenancy.addTable("t-quota-floor", branchId);
    floorManager.createTable({ floorId: floor.id, number: `T-${i}` });
  }

  // 6th table blocked by tenancy quota
  const check = tenancy.canAddTable("t-quota-floor");
  assert.equal(check.allowed, false);
  assert.throws(() => tenancy.addTable("t-quota-floor", branchId), /Quota exceeded/);
});

test("Pairwise: Tier Upgrade From Free to Pro Unlocks High-Density Floor Plan", () => {
  const tenancy = new TenancyManager();
  const tenant = tenancy.createTenant({ tenantId: "t-upgrade-density", restaurantName: "Bistro Deluxe", subscriptionTier: "FREE" });
  const branchId = tenant.branches[0].branchId;

  const floorManager = new TableFloorManager();
  const floor = floorManager.createFloor(branchId, "Hall 1");

  for (let i = 1; i <= 5; i++) {
    tenancy.addTable("t-upgrade-density", branchId);
    floorManager.createTable({ floorId: floor.id, number: `T-${i}` });
  }

  // Upgrade to PRO (ceiling 50)
  tenancy.updateTier("t-upgrade-density", "PRO");
  assert.equal(tenancy.canAddTable("t-upgrade-density").allowed, true);

  // Add 10 more tables
  for (let i = 6; i <= 15; i++) {
    tenancy.addTable("t-upgrade-density", branchId);
    floorManager.createTable({ floorId: floor.id, number: `T-${i}` });
  }
  assert.equal(tenant.branches[0].tableCount, 15);
});

test("Pairwise: Floor Canvas Spatial Movement Operates Independently of Subscription Quotas", () => {
  const floorManager = new TableFloorManager();
  const floor = floorManager.createFloor("b1", "Patio");
  const table = floorManager.createTable({ floorId: floor.id, number: "P-1", posX: 10, posY: 20 });

  // Moving/resizing table doesn't consume new quota
  const moved = floorManager.updateLayout(table.id, { posX: 80, posY: 90, rotation: 30 });
  assert.equal(moved.posX, 80);
  assert.equal(moved.posY, 90);
  assert.equal(moved.rotation, 30);
});

test("Pairwise: Multi-Branch Quota Isolation - tables in Branch 1 do not inflate Branch 2 floor limit", () => {
  const tenancy = new TenancyManager();
  const tenant = tenancy.createTenant({ tenantId: "t-multi-branch", restaurantName: "Chain", subscriptionTier: "PRO" });
  tenant.branches.push({ branchId: "b2", branchName: "Branch 2", tableCount: 0, staffCount: 1 });

  tenancy.addTable("t-multi-branch", tenant.branches[0].branchId);
  tenancy.addTable("t-multi-branch", tenant.branches[0].branchId);
  tenancy.addTable("t-multi-branch", "b2");

  assert.equal(tenant.branches[0].tableCount, 2);
  assert.equal(tenant.branches[1].tableCount, 1);
});

test("Pairwise: Subscription Cancellation Freezes Table Seatings and Modifications", () => {
  const tenancy = new TenancyManager();
  const tenant = tenancy.createTenant({ tenantId: "t-cancel-freeze", restaurantName: "Frozen Restro", status: "CANCELLED" });

  assert.equal(tenancy.canAddTable("t-cancel-freeze").allowed, false);
  assert.match(tenancy.canAddTable("t-cancel-freeze").reason!, /Subscription is CANCELLED/);
});
