import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";

test("Feature 23: Granular RBAC Permissions - Owner has full administrative permissions across all routes", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "u-owner", name: "Restaurant Owner", role: "OWNER", pin: "0001", branchIds: ["b1"] });
  engine.switchStaffWithPin("0001");

  assert.equal(engine.hasPermission("orders.create"), true);
  assert.equal(engine.hasPermission("discounts.apply"), true);
  assert.equal(engine.hasPermission("tables.manage"), true);
  assert.equal(engine.hasPermission("menu.manage"), true);
  assert.equal(engine.hasPermission("settings.manage"), true);
  assert.equal(engine.hasPermission("users.manage"), true);

  assert.equal(engine.canAccessRoute("/dashboard"), true);
  assert.equal(engine.canAccessRoute("/pos"), true);
  assert.equal(engine.canAccessRoute("/tables"), true);
  assert.equal(engine.canAccessRoute("/settings"), true);
});

test("Feature 23: Granular RBAC Permissions - Waiter can access POS and tables but is blocked from dashboard/settings", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "u-waiter", name: "Waiter Sam", role: "WAITER", pin: "0002", branchIds: ["b1"] });
  engine.switchStaffWithPin("0002");

  assert.equal(engine.canAccessRoute("/pos"), true);
  assert.equal(engine.canAccessRoute("/tables"), true);
  assert.equal(engine.canAccessRoute("/menu"), true);

  // Denied
  assert.equal(engine.canAccessRoute("/dashboard"), false);
  assert.equal(engine.canAccessRoute("/settings"), false);
  assert.equal(engine.hasPermission("settings.manage"), false);
  assert.equal(engine.hasPermission("discounts.apply"), false);
});

test("Feature 23: Granular RBAC Permissions - Kitchen Staff is routed to KDS and blocked from orders/revenue", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "u-kitchen", name: "Chef Gordon", role: "KITCHEN_STAFF", pin: "0003", branchIds: ["b1"] });
  engine.switchStaffWithPin("0003");

  assert.equal(engine.canAccessRoute("/kds"), true);
  assert.equal(engine.hasPermission("kds.manage"), true);

  assert.equal(engine.canAccessRoute("/pos"), false);
  assert.equal(engine.canAccessRoute("/dashboard"), false);
  assert.equal(engine.canAccessRoute("/settings"), false);
  assert.equal(engine.hasPermission("orders.create"), false);
});

test("Feature 23: Granular RBAC Permissions - Cashier can handle ordering, billing and dashboard view", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "u-cashier", name: "Cashier Priya", role: "CASHIER", pin: "0004", branchIds: ["b1"] });
  engine.switchStaffWithPin("0004");

  assert.equal(engine.hasPermission("orders.create"), true);
  assert.equal(engine.hasPermission("bills.print"), true);
  assert.equal(engine.hasPermission("discounts.apply"), true);
  assert.equal(engine.canAccessRoute("/pos"), true);
  assert.equal(engine.canAccessRoute("/dashboard"), true);

  // Settings manage is restricted to Owner/Admin
  assert.equal(engine.hasPermission("settings.manage"), false);
  assert.equal(engine.canAccessRoute("/settings"), false);
});

test("Feature 23: Granular RBAC Permissions - manage permission implicitly satisfies view permission", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({
    id: "u-manager",
    name: "Floor Lead",
    role: "RESTAURANT_MANAGER",
    pin: "0005",
    branchIds: ["b1"],
  });
  engine.switchStaffWithPin("0005");

  assert.equal(engine.hasPermission("tables.manage"), true);
  assert.equal(engine.hasPermission("tables.view"), true); // implied by tables.manage
  assert.equal(engine.hasPermission("menu.manage"), true);
  assert.equal(engine.hasPermission("menu.view"), true); // implied by menu.manage
});
