import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";

test("Feature 22: 4-Digit PIN Quick Switch - switches active staff immediately on valid PIN entry", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "s1", name: "Cashier Bob", role: "CASHIER", pin: "1111", branchIds: ["b1"] });
  engine.createStaff({ id: "s2", name: "Waiter Alice", role: "WAITER", pin: "2222", branchIds: ["b1"] });

  engine.switchStaffWithPin("1111");
  assert.equal(engine.getActiveStaff()?.name, "Cashier Bob");

  engine.switchStaffWithPin("2222");
  assert.equal(engine.getActiveStaff()?.name, "Waiter Alice");
});

test("Feature 22: 4-Digit PIN Quick Switch - rejects unknown PIN without changing active staff", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "s1", name: "Owner Dave", role: "OWNER", pin: "9999", branchIds: ["b1"] });
  engine.switchStaffWithPin("9999");
  assert.equal(engine.getActiveStaff()?.name, "Owner Dave");

  assert.throws(
    () => engine.switchStaffWithPin("0000"),
    /Invalid PIN or inactive staff account/,
  );
  // Active staff remains unchanged
  assert.equal(engine.getActiveStaff()?.name, "Owner Dave");
});

test("Feature 22: 4-Digit PIN Quick Switch - enforces branch boundary when switching staff on terminal", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "s-branch1", name: "Staff Branch 1", role: "WAITER", pin: "1234", branchIds: ["branch-1"] });
  engine.createStaff({ id: "s-branch2", name: "Staff Branch 2", role: "WAITER", pin: "5678", branchIds: ["branch-2"] });

  // Terminal at branch-1 can switch to staff-1
  const user1 = engine.switchStaffWithPin("1234", "branch-1");
  assert.equal(user1.id, "s-branch1");

  // Terminal at branch-1 cannot switch to staff-2 assigned only to branch-2
  assert.throws(
    () => engine.switchStaffWithPin("5678", "branch-1"),
    /Invalid PIN or inactive staff account/,
  );
});

test("Feature 22: 4-Digit PIN Quick Switch - switches staff without full page reload or session loss", () => {
  const engine = new AuthRbacEngine();
  const s1 = engine.createStaff({ id: "staff-a", name: "Staff A", role: "WAITER", pin: "3333", branchIds: ["b1"] });
  const s2 = engine.createStaff({ id: "staff-b", name: "Staff B", role: "CASHIER", pin: "4444", branchIds: ["b1"] });

  engine.loginWithPin("3333");
  assert.equal(engine.getActiveStaff()?.id, s1.id);

  engine.switchStaffWithPin("4444");
  assert.equal(engine.getActiveStaff()?.id, s2.id);
});

test("Feature 22: 4-Digit PIN Quick Switch - denies quick switch for deactivated user", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "staff-inactive", name: "Fired Staff", role: "WAITER", pin: "7777", branchIds: ["b1"] });
  engine.deactivateStaff("staff-inactive");

  assert.throws(
    () => engine.switchStaffWithPin("7777"),
    /Invalid PIN or inactive staff account/,
  );
});
