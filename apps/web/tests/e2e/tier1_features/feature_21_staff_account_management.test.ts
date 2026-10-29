import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";

test("Feature 21: Staff Account Management - creates staff user with assigned role and 4-digit PIN", () => {
  const engine = new AuthRbacEngine();
  const staff = engine.createStaff({
    id: "staff-1",
    name: "Suresh",
    role: "WAITER",
    pin: "1234",
    email: "suresh@restaurant.com",
    branchIds: ["b1"],
  });

  assert.equal(staff.id, "staff-1");
  assert.equal(staff.name, "Suresh");
  assert.equal(staff.role, "WAITER");
  assert.equal(staff.pin, "1234");
  assert.equal(staff.isActive, true);
});

test("Feature 21: Staff Account Management - rejects non-4-digit PIN strings", () => {
  const engine = new AuthRbacEngine();
  assert.throws(
    () =>
      engine.createStaff({
        id: "staff-err",
        name: "Test",
        role: "CASHIER",
        pin: "12", // too short
        branchIds: ["b1"],
      }),
    /PIN must be exactly 4 digits/,
  );

  assert.throws(
    () =>
      engine.createStaff({
        id: "staff-err2",
        name: "Test",
        role: "CASHIER",
        pin: "abcd", // non-digits
        branchIds: ["b1"],
      }),
    /PIN must be exactly 4 digits/,
  );
});

test("Feature 21: Staff Account Management - edits staff member details and updates role", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({
    id: "staff-2",
    name: "Rahul",
    role: "WAITER",
    pin: "4321",
    branchIds: ["b1"],
  });

  const updated = engine.updateStaff("staff-2", {
    name: "Rahul Sharma",
    role: "CASHIER",
    pin: "5678",
  });

  assert.equal(updated.name, "Rahul Sharma");
  assert.equal(updated.role, "CASHIER");
  assert.equal(updated.pin, "5678");
});

test("Feature 21: Staff Account Management - deactivates staff member and prevents subsequent login", () => {
  const engine = new AuthRbacEngine();
  engine.createStaff({
    id: "staff-3",
    name: "Meena",
    role: "WAITER",
    pin: "9988",
    branchIds: ["b1"],
  });

  engine.deactivateStaff("staff-3");
  assert.throws(() => engine.loginWithPin("9988"), /Invalid PIN or inactive staff account/);
});

test("Feature 21: Staff Account Management - assigns default permissions matching role", () => {
  const engine = new AuthRbacEngine();
  const waiter = engine.createStaff({
    id: "w-10",
    name: "Waiter",
    role: "WAITER",
    pin: "1111",
    branchIds: ["b1"],
  });
  const kitchen = engine.createStaff({
    id: "k-10",
    name: "Chef",
    role: "KITCHEN_STAFF",
    pin: "2222",
    branchIds: ["b1"],
  });

  assert.ok(waiter.permissions.includes("orders.create"));
  assert.ok(waiter.permissions.includes("tables.view"));
  assert.equal(waiter.permissions.includes("kds.manage"), false);

  assert.ok(kitchen.permissions.includes("kds.manage"));
  assert.equal(kitchen.permissions.includes("orders.create"), false);
});
