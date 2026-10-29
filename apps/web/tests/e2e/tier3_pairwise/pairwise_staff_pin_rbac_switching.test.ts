import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";

test("Pairwise: Waiter Takes Order -> Quick Switch to Cashier for Discount & Settlement", () => {
  const engine = new AuthRbacEngine();
  const waiter = engine.createStaff({ id: "w1", name: "Waiter Raj", role: "WAITER", pin: "1234", branchIds: ["b1"] });
  const cashier = engine.createStaff({ id: "c1", name: "Cashier Amit", role: "CASHIER", pin: "5678", branchIds: ["b1"] });

  // 1. Waiter logs in at shared terminal
  engine.switchStaffWithPin("1234");
  assert.equal(engine.getActiveStaff()?.id, waiter.id);
  assert.equal(engine.hasPermission("orders.create"), true);
  assert.equal(engine.hasPermission("discounts.apply"), false); // Waiter cannot apply discount

  // 2. Customer asks for discount -> Cashier steps up and enters PIN
  engine.switchStaffWithPin("5678");
  assert.equal(engine.getActiveStaff()?.id, cashier.id);
  assert.equal(engine.hasPermission("discounts.apply"), true); // Cashier applies discount
  assert.equal(engine.hasPermission("bills.print"), true);
});

test("Pairwise: Cashier Active -> Quick Switch to Kitchen Staff Redirects to KDS", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "c", name: "Cashier", role: "CASHIER", pin: "1111", branchIds: ["b1"] });
  engine.createStaff({ id: "k", name: "Kitchen", role: "KITCHEN_STAFF", pin: "2222", branchIds: ["b1"] });

  engine.switchStaffWithPin("1111");
  assert.equal(engine.getDefaultLandingRoute(), "/dashboard");

  engine.switchStaffWithPin("2222");
  assert.equal(engine.getDefaultLandingRoute(), "/kds");
  assert.equal(engine.canAccessRoute("/dashboard"), false);
});

test("Pairwise: Fast Staff Switch During Order Creation Preserves Seamless Context", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "w-a", name: "Waiter A", role: "WAITER", pin: "3333", branchIds: ["b1"] });
  engine.createStaff({ id: "w-b", name: "Waiter B", role: "WAITER", pin: "4444", branchIds: ["b1"] });

  engine.switchStaffWithPin("3333");
  assert.equal(engine.getActiveStaff()?.name, "Waiter A");

  engine.switchStaffWithPin("4444");
  assert.equal(engine.getActiveStaff()?.name, "Waiter B");
  assert.equal(engine.hasPermission("orders.create"), true);
});

test("Pairwise: Owner Steps into Terminal to Override Settings and Switches Back to Cashier", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "c-term", name: "Cashier Terminal", role: "CASHIER", pin: "1010", branchIds: ["b1"] });
  engine.createStaff({ id: "o-boss", name: "Owner Boss", role: "OWNER", pin: "9999", branchIds: ["b1"] });

  // Terminal operating in Cashier mode
  engine.switchStaffWithPin("1010");
  assert.equal(engine.canAccessRoute("/settings"), false);

  // Owner enters PIN to update restaurant tax settings
  engine.switchStaffWithPin("9999");
  assert.equal(engine.canAccessRoute("/settings"), true);
  assert.equal(engine.hasPermission("settings.manage"), true);

  // Switch back to cashier
  engine.switchStaffWithPin("1010");
  assert.equal(engine.canAccessRoute("/settings"), false);
});

test("Pairwise: Staff Deactivation Real-Time Eviction from Shared Terminal", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "s-fired", name: "Terminated Staff", role: "WAITER", pin: "8888", branchIds: ["b1"] });

  engine.switchStaffWithPin("8888");
  assert.equal(engine.getActiveStaff()?.id, "s-fired");

  // Admin deactivates staff
  engine.deactivateStaff("s-fired");
  assert.equal(engine.getActiveStaff(), null);
  assert.throws(() => engine.switchStaffWithPin("8888"), /Invalid PIN or inactive/);
});
