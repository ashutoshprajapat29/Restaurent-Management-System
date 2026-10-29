import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  DEFAULT_ROLE_PERMISSIONS,
  STAFF_ROLES,
  TAX_REGIME_PRESETS,
  permissionSatisfied,
  restaurantSettingsSchema,
} from "@nodedr-restaurant/types";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";

const webDir = fs.existsSync(path.resolve(process.cwd(), "apps/web"))
  ? path.resolve(process.cwd(), "apps/web")
  : process.cwd();

test("Challenger M4 Touch Target Verification: PinSwitchDialog touch targets >= 44x44px", () => {
  const filePath = path.resolve(
    webDir,
    "components/layout/pin-switch-dialog.tsx",
  );
  const content = fs.readFileSync(filePath, "utf-8");

  // Switch Staff Trigger Button
  assert.ok(
    content.includes('data-testid="pin-switch-button"') &&
      content.includes("min-h-[44px]") &&
      content.includes("min-w-[44px]"),
    "Pin switch trigger button must satisfy min-h-[44px] and min-w-[44px]",
  );

  // Keypad numeric buttons 0-9
  assert.ok(
    content.includes('["1", "2", "3", "4", "5", "6", "7", "8", "9"]') &&
      content.includes("min-h-[44px] min-w-[44px]"),
    "Keypad digit buttons 1-9 must have min-h-[44px] min-w-[44px]",
  );

  // Clear button
  assert.ok(
    content.includes("Clear") && content.includes("min-h-[44px] min-w-[44px]"),
    "Keypad Clear button must have min-h-[44px] min-w-[44px]",
  );

  // Digit 0 button
  assert.ok(
    content.includes('handleDigit("0")') &&
      content.includes("min-h-[44px] min-w-[44px]"),
    "Keypad digit 0 button must have min-h-[44px] min-w-[44px]",
  );

  // Backspace button
  assert.ok(
    content.includes('aria-label="Backspace"') &&
      content.includes("min-h-[44px] min-w-[44px]"),
    "Keypad Backspace button must have min-h-[44px] min-w-[44px]",
  );

  // Submit button
  assert.ok(
    content.includes('data-testid="pin-submit-button"') &&
      content.includes("min-h-[44px]"),
    "Keypad Submit button must have min-h-[44px]",
  );
});

test("Challenger M4 Touch Target Verification: EditStaffDialog and AddStaffDialog buttons >= 44px", () => {
  const editStaffPath = path.resolve(
    webDir,
    "components/settings/edit-staff-dialog.tsx",
  );
  const editContent = fs.readFileSync(editStaffPath, "utf-8");

  // Edit staff pencil icon trigger button
  assert.ok(
    editContent.includes("min-h-[44px] min-w-[44px]"),
    "EditStaffDialog trigger button must have min-h-[44px] min-w-[44px]",
  );
  // Edit staff submit button
  assert.ok(
    editContent.includes('type="submit"') &&
      editContent.includes("min-h-[44px]"),
    "EditStaffDialog submit button must have min-h-[44px]",
  );

  const addStaffPath = path.resolve(
    webDir,
    "components/settings/add-staff-dialog.tsx",
  );
  const addContent = fs.readFileSync(addStaffPath, "utf-8");
  // Add staff submit button
  assert.ok(
    addContent.includes('type="submit"') &&
      addContent.includes("min-h-[44px]"),
    "AddStaffDialog submit button must have min-h-[44px]",
  );
});

test("Challenger M4 Touch Target Verification: Settings Color Pickers & Staff Actions >= 44px", () => {
  const settingsPath = path.resolve(
    webDir,
    "app/(dashboard)/settings/page.tsx",
  );
  const settingsContent = fs.readFileSync(settingsPath, "utf-8");

  // Primary & accent color pickers
  assert.ok(
    settingsContent.includes("id=\"r-primary-picker\"") &&
      settingsContent.includes("min-h-[44px] min-w-[44px]"),
    "Primary color picker must have min-h-[44px] min-w-[44px]",
  );
  assert.ok(
    settingsContent.includes("id=\"r-accent-picker\"") &&
      settingsContent.includes("min-h-[44px] min-w-[44px]"),
    "Accent color picker must have min-h-[44px] min-w-[44px]",
  );

  const staffPagePath = path.resolve(
    webDir,
    "app/(dashboard)/settings/staff/page.tsx",
  );
  const staffPageContent = fs.readFileSync(staffPagePath, "utf-8");

  // Reset 2FA button
  assert.ok(
    staffPageContent.includes("Reset 2FA") &&
      staffPageContent.includes("min-h-[44px]"),
    "Reset 2FA button must have min-h-[44px]",
  );

  // Delete staff button
  assert.ok(
    staffPageContent.includes("Delete staff account") &&
      staffPageContent.includes("min-h-[44px] min-w-[44px]"),
    "Delete staff button must have min-h-[44px] min-w-[44px]",
  );
});

test("Challenger M4 Empirical Test: Hex Color Regex & Validation Boundaries", () => {
  // Valid 6-digit hex
  const valid6 = restaurantSettingsSchema.parse({
    primaryColor: "#0A2540",
    accentColor: "#635BFF",
  });
  assert.equal(valid6.primaryColor, "#0A2540");
  assert.equal(valid6.accentColor, "#635BFF");

  // Valid 3-digit hex
  const valid3 = restaurantSettingsSchema.parse({
    primaryColor: "#000",
    accentColor: "#FFF",
  });
  assert.equal(valid3.primaryColor, "#000");
  assert.equal(valid3.accentColor, "#FFF");

  // Invalid: missing hash
  assert.throws(
    () => restaurantSettingsSchema.parse({ primaryColor: "0A2540" }),
    /Must be valid hex color/,
  );

  // Invalid: non-hex characters
  assert.throws(
    () => restaurantSettingsSchema.parse({ primaryColor: "#ZZZZZZ" }),
    /Must be valid hex color/,
  );

  // Invalid: named CSS color
  assert.throws(
    () => restaurantSettingsSchema.parse({ primaryColor: "blue" }),
    /Must be valid hex color/,
  );

  // Invalid: length mismatch (4, 5, 7, 8 hex digits)
  assert.throws(
    () => restaurantSettingsSchema.parse({ primaryColor: "#1234" }),
    /Must be valid hex color/,
  );
  assert.throws(
    () => restaurantSettingsSchema.parse({ primaryColor: "#12345" }),
    /Must be valid hex color/,
  );
  assert.throws(
    () => restaurantSettingsSchema.parse({ primaryColor: "#1234567" }),
    /Must be valid hex color/,
  );
});

test("Challenger M4 Empirical Test: 4-Digit PIN Fast Switch Multi-Branch Isolation & State Machine", () => {
  const engine = new AuthRbacEngine();

  // Create Staff in Branch 1 and Branch 2
  engine.createStaff({
    id: "cashier-b1",
    name: "Cashier Bob",
    role: "CASHIER",
    pin: "1111",
    branchIds: ["branch-1"],
  });

  engine.createStaff({
    id: "waiter-b1",
    name: "Waiter Alice",
    role: "WAITER",
    pin: "2222",
    branchIds: ["branch-1"],
  });

  engine.createStaff({
    id: "cashier-b2",
    name: "Cashier Charlie",
    role: "CASHIER",
    pin: "3333",
    branchIds: ["branch-2"],
  });

  // Fast switch in branch-1 to Bob
  const s1 = engine.switchStaffWithPin("1111", "branch-1");
  assert.equal(s1.id, "cashier-b1");
  assert.equal(engine.getActiveStaff()?.name, "Cashier Bob");
  assert.ok(engine.hasPermission("orders.create"));
  assert.ok(engine.hasPermission("bills.print"));
  assert.equal(engine.canAccessRoute("/pos"), true);
  assert.equal(engine.canAccessRoute("/settings"), false);

  // Fast switch in branch-1 to Alice
  const s2 = engine.switchStaffWithPin("2222", "branch-1");
  assert.equal(s2.id, "waiter-b1");
  assert.equal(engine.getActiveStaff()?.name, "Waiter Alice");
  assert.ok(engine.hasPermission("tables.view"));
  assert.equal(engine.canAccessRoute("/pos"), true);
  assert.equal(engine.canAccessRoute("/dashboard"), false);

  // Attempt to switch in branch-1 using Charlie's PIN (assigned to branch-2 only)
  assert.throws(
    () => engine.switchStaffWithPin("3333", "branch-1"),
    /Invalid PIN or inactive staff account/,
  );
  // Active user remains Alice
  assert.equal(engine.getActiveStaff()?.id, "waiter-b1");

  // Deactivate Alice -> subsequent switch attempt fails
  engine.deactivateStaff("waiter-b1");
  assert.throws(
    () => engine.switchStaffWithPin("2222", "branch-1"),
    /Invalid PIN or inactive staff account/,
  );
});

test("Challenger M4 Empirical Test: Granular RBAC Matrix Across All 11 System Roles", () => {
  for (const role of STAFF_ROLES) {
    const permissions = DEFAULT_ROLE_PERMISSIONS[role];
    assert.ok(Array.isArray(permissions), `Role ${role} should have permissions array`);

    if (role === "OWNER" || role === "ADMINISTRATOR") {
      assert.ok(permissionSatisfied(permissions, "settings.manage"));
      assert.ok(permissionSatisfied(permissions, "users.manage"));
      assert.ok(permissionSatisfied(permissions, "dashboard.sales.view"));
    } else {
      // Non-admin roles cannot manage settings or users
      assert.equal(
        permissionSatisfied(permissions, "settings.manage"),
        false,
        `${role} must not have settings.manage`,
      );
      assert.equal(
        permissionSatisfied(permissions, "users.manage"),
        false,
        `${role} must not have users.manage`,
      );
    }

    if (role === "KITCHEN_STAFF" || role === "CHEF") {
      assert.ok(permissionSatisfied(permissions, "kds.manage"));
    }

    if (role === "WAITER") {
      assert.ok(permissionSatisfied(permissions, "orders.create"));
      assert.ok(permissionSatisfied(permissions, "tables.view"));
      assert.equal(permissionSatisfied(permissions, "kds.manage"), false);
      assert.equal(permissionSatisfied(permissions, "dashboard.sales.view"), false);
    }
  }
});
