import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";

function resolveWebPath(relPath: string): string {
  // Try relative to import.meta.dirname (which is in apps/web/tests/e2e/tier2_boundaries/)
  const fromDir = path.resolve(import.meta.dirname, "../../..", relPath);
  if (fs.existsSync(fromDir)) return fromDir;
  const fromCwd = path.resolve(process.cwd(), relPath);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(process.cwd(), "apps/web", relPath);
}

test("Touch Targets: PinSwitchDialog keypad and action buttons enforce min-h-[44px] min-w-[44px]", () => {
  const filePath = resolveWebPath("components/layout/pin-switch-dialog.tsx");
  const fileContent = fs.readFileSync(filePath, "utf-8");

  // Verify DialogTrigger has min-h-[44px] and min-w-[44px]
  assert.match(
    fileContent,
    /data-testid="pin-switch-button"[\s\S]*?min-h-\[44px\][\s\S]*?min-w-\[44px\]/,
    "Pin switch trigger button must enforce minimum 44x44px touch target",
  );

  // Verify digit buttons (0-9) have min-h-[44px] and min-w-[44px]
  assert.match(
    fileContent,
    /className="h-14 min-h-\[44px\] min-w-\[44px\] text-xl font-bold/,
    "Numeric keypad digits 0-9 must enforce minimum 44x44px touch target",
  );

  // Verify Clear button has min-h-[44px] and min-w-[44px]
  assert.match(
    fileContent,
    /className="h-14 min-h-\[44px\] min-w-\[44px\] text-xs font-medium text-muted-foreground/,
    "Clear button must enforce minimum 44x44px touch target",
  );

  // Verify Backspace button has min-h-[44px] and min-w-[44px]
  assert.match(
    fileContent,
    /className="h-14 min-h-\[44px\] min-w-\[44px\] text-muted-foreground/,
    "Backspace button must enforce minimum 44x44px touch target",
  );

  // Verify Enter PIN submit button has min-h-[44px]
  assert.match(
    fileContent,
    /data-testid="pin-submit-button"[\s\S]*?min-h-\[44px\]/,
    "PIN submit button must enforce minimum 44px height",
  );
});

test("Physical Keyboard Listeners: PinSwitchDialog handles digits, Backspace, Enter, Escape", () => {
  const filePath = resolveWebPath("components/layout/pin-switch-dialog.tsx");
  const fileContent = fs.readFileSync(filePath, "utf-8");

  // Digits 0-9
  assert.match(fileContent, /e\.key >= "0" && e\.key <= "9"/);
  // Backspace
  assert.match(fileContent, /e\.key === "Backspace"/);
  // Enter
  assert.match(fileContent, /e\.key === "Enter"/);
  // Escape
  assert.match(fileContent, /e\.key === "Escape"/);
});

test("Touch Targets: Staff Management modals (AddStaffDialog, EditStaffDialog) enforce >= 44x44px", () => {
  const addStaffPath = resolveWebPath("components/settings/add-staff-dialog.tsx");
  const addContent = fs.readFileSync(addStaffPath, "utf-8");
  assert.match(addContent, /className="min-h-\[44px\]">Add staff<\/Button>/);
  assert.match(addContent, /type="submit"[\s\S]*?className="min-h-\[44px\]"/);

  const editStaffPath = resolveWebPath("components/settings/edit-staff-dialog.tsx");
  const editContent = fs.readFileSync(editStaffPath, "utf-8");
  assert.match(editContent, /className="h-9 w-9 min-h-\[44px\] min-w-\[44px\]/);
  assert.match(editContent, /type="submit"[\s\S]*?className="min-h-\[44px\]"/);
});

test("Touch Targets: Accounting Z-Report buttons enforce >= 44px height", () => {
  const acctPath = resolveWebPath("app/(dashboard)/accounting/page.tsx");
  const acctContent = fs.readFileSync(acctPath, "utf-8");
  assert.match(acctContent, /className="min-h-\[44px\]"[\s\S]*?Close day\s*<\/Button>/);
  assert.match(acctContent, /className="min-h-\[44px\]"[\s\S]*?Print Z-Report\s*<\/Button>/);
});
