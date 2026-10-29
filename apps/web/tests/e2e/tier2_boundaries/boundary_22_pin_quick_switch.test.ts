import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";

test("Boundary 22: 4-Digit PIN Quick Switch - quick-switching back and forth between same 2 staff members", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "w1", name: "Waiter 1", role: "WAITER", pin: "1001", branchIds: ["b1"] });
  engine.createStaff({ id: "w2", name: "Waiter 2", role: "WAITER", pin: "1002", branchIds: ["b1"] });

  for (let i = 0; i < 5; i++) {
    engine.switchStaffWithPin("1001");
    assert.equal(engine.getActiveStaff()?.id, "w1");
    engine.switchStaffWithPin("1002");
    assert.equal(engine.getActiveStaff()?.id, "w2");
  }
});

test("Boundary 22: 4-Digit PIN Quick Switch - entering current staff PIN again is a valid no-op reaffirmation", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "c1", name: "Cashier", role: "CASHIER", pin: "2002", branchIds: ["b1"] });
  engine.switchStaffWithPin("2002");
  assert.equal(engine.getActiveStaff()?.id, "c1");

  engine.switchStaffWithPin("2002");
  assert.equal(engine.getActiveStaff()?.id, "c1");
});

test("Boundary 22: 4-Digit PIN Quick Switch - PIN entry with whitespace trimmed or rejected", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "s-space", name: "Spaced", role: "WAITER", pin: "3003", branchIds: ["b1"] });

  // Untrimmed PIN containing whitespace fails
  assert.throws(() => engine.switchStaffWithPin(" 3003 "), /Invalid PIN/);
  // Exact 4 digits succeeds
  assert.equal(engine.switchStaffWithPin("3003").name, "Spaced");
});

test("Boundary 22: 4-Digit PIN Quick Switch - empty or undefined active staff before initial login", () => {
  const engine = new AuthRbacEngine();
  assert.equal(engine.getActiveStaff(), null);
  assert.equal(engine.hasPermission("orders.create"), false);
  assert.equal(engine.getDefaultLandingRoute(), "/login");
});

test("Boundary 22: 4-Digit PIN Quick Switch - switching to cashier changes permissions immediately without delay", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "w", name: "Waiter", role: "WAITER", pin: "4001", branchIds: ["b1"] });
  engine.createStaff({ id: "c", name: "Cashier", role: "CASHIER", pin: "4002", branchIds: ["b1"] });

  engine.switchStaffWithPin("4001");
  assert.equal(engine.hasPermission("discounts.apply"), false);

  engine.switchStaffWithPin("4002");
  assert.equal(engine.hasPermission("discounts.apply"), true);
});
