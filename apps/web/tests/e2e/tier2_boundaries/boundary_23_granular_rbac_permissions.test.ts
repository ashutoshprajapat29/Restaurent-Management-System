import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";

test("Boundary 23: Granular RBAC Permissions - custom permissions granted on top of default role", () => {
  const engine = new AuthRbacEngine();
  // Waiter who is also granted discounts.apply
  engine.createStaff({
    id: "w-senior",
    name: "Senior Waiter",
    role: "WAITER",
    pin: "5001",
    branchIds: ["b1"],
    customPermissions: ["orders.create", "orders.edit", "tables.view", "menu.view", "bills.print", "discounts.apply"],
  });

  engine.switchStaffWithPin("5001");
  assert.equal(engine.hasPermission("orders.create"), true);
  assert.equal(engine.hasPermission("discounts.apply"), true);
  assert.equal(engine.hasPermission("settings.manage"), false);
});

test("Boundary 23: Granular RBAC Permissions - sub-path protection under restricted route (e.g. /dashboard/sales)", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "w", name: "Waiter", role: "WAITER", pin: "5002", branchIds: ["b1"] });
  engine.switchStaffWithPin("5002");

  assert.equal(engine.canAccessRoute("/dashboard"), false);
  assert.equal(engine.canAccessRoute("/dashboard/sales"), false);
  assert.equal(engine.canAccessRoute("/dashboard/settings/roles"), false);
});

test("Boundary 23: Granular RBAC Permissions - default landing route computes correctly per role", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "o", name: "Owner", role: "OWNER", pin: "1111", branchIds: ["b1"] });
  engine.createStaff({ id: "w", name: "Waiter", role: "WAITER", pin: "2222", branchIds: ["b1"] });
  engine.createStaff({ id: "k", name: "Kitchen", role: "KITCHEN_STAFF", pin: "3333", branchIds: ["b1"] });

  engine.switchStaffWithPin("1111");
  assert.equal(engine.getDefaultLandingRoute(), "/dashboard");

  engine.switchStaffWithPin("2222");
  assert.equal(engine.getDefaultLandingRoute(), "/pos");

  engine.switchStaffWithPin("3333");
  assert.equal(engine.getDefaultLandingRoute(), "/kds");
});

test("Boundary 23: Granular RBAC Permissions - unknown route without permission guard is allowed by default", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "w", name: "Waiter", role: "WAITER", pin: "4444", branchIds: ["b1"] });
  engine.switchStaffWithPin("4444");

  const customRoutes = [
    { href: "/public-info" }, // no permission required
    { href: "/secret-admin", permission: "system.update" },
  ];

  assert.equal(engine.canAccessRoute("/public-info", customRoutes), true);
  assert.equal(engine.canAccessRoute("/secret-admin", customRoutes), false);
});

test("Boundary 23: Granular RBAC Permissions - revoking all permissions blocks access to all guarded routes", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({
    id: "stripped",
    name: "Stripped User",
    role: "WAITER",
    pin: "5555",
    branchIds: ["b1"],
    customPermissions: [], // empty permissions
  });

  engine.switchStaffWithPin("5555");
  assert.equal(engine.canAccessRoute("/pos"), false);
  assert.equal(engine.canAccessRoute("/tables"), false);
  assert.equal(engine.canAccessRoute("/kds"), false);
  assert.equal(engine.canAccessRoute("/dashboard"), false);
});
