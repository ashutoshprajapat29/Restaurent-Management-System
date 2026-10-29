import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";

test("Boundary 21: Staff Account Management - PIN containing leading zeros (e.g. 0005)", () => {
  const engine = new AuthRbacEngine();
  const staff = engine.createStaff({
    id: "s-zero",
    name: "Zero Lead",
    role: "WAITER",
    pin: "0005",
    branchIds: ["b1"],
  });

  assert.equal(staff.pin, "0005");
  const login = engine.loginWithPin("0005");
  assert.equal(login.user.name, "Zero Lead");
});

test("Boundary 21: Staff Account Management - PIN with all same digits (0000 and 9999)", () => {
  const engine = new AuthRbacEngine();
  const s1 = engine.createStaff({ id: "s-0", name: "Four Zeros", role: "CASHIER", pin: "0000", branchIds: ["b1"] });
  const s2 = engine.createStaff({ id: "s-9", name: "Four Nines", role: "CASHIER", pin: "9999", branchIds: ["b1"] });

  assert.equal(engine.loginWithPin("0000").user.id, s1.id);
  assert.equal(engine.loginWithPin("9999").user.id, s2.id);
});

test("Boundary 21: Staff Account Management - updating staff with invalid PIN throws error without corrupting user", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({ id: "s-upd", name: "Upd Test", role: "WAITER", pin: "1234", branchIds: ["b1"] });

  assert.throws(
    () => engine.updateStaff("s-upd", { pin: "12345" }), // 5 digits
    /PIN must be exactly 4 digits/,
  );

  // Original PIN remains 1234
  assert.equal(engine.loginWithPin("1234").user.name, "Upd Test");
});

test("Boundary 21: Staff Account Management - updating non-existent staff member throws error", () => {
  const engine = new AuthRbacEngine();
  assert.throws(
    () => engine.updateStaff("ghost-staff", { name: "New Name" }),
    /Staff user ghost-staff not found/,
  );
});

test("Boundary 21: Staff Account Management - multiple branches assigned to a single staff member", () => {
  const engine = new AuthRbacEngine();
  const multiStaff = engine.createStaff({
    id: "s-multi",
    name: "Area Supervisor",
    role: "RESTAURANT_MANAGER",
    pin: "7890",
    branchIds: ["branch-north", "branch-south", "branch-east"],
  });

  assert.equal(multiStaff.branchIds.length, 3);
  assert.equal(engine.loginWithPin("7890", "branch-north").user.id, "s-multi");
  assert.equal(engine.loginWithPin("7890", "branch-south").user.id, "s-multi");
  assert.equal(engine.loginWithPin("7890", "branch-east").user.id, "s-multi");
  assert.throws(() => engine.loginWithPin("7890", "branch-west"), /Invalid PIN/);
});
