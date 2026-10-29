import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Boundary 17: Opening Float & Petty Cash - opening float of zero is valid (starting with empty till)", () => {
  const engine = new SettlementDrawerEngine();
  const res = engine.openDrawer(0);
  assert.equal(res.success, true);
  assert.equal(res.openingFloat, 0);
  assert.equal(engine.isTillOpen(), true);
});

test("Boundary 17: Opening Float & Petty Cash - multiple petty cash expenses accumulate correctly", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(2000);

  engine.recordExpense("Ice bags", 60);
  engine.recordExpense("Lemons", 40);
  engine.recordExpense("Stationery", 100);

  const z = engine.generateDailyZReport(1800);
  assert.equal(z.cashExpenses, 200);
  assert.equal(z.expectedCash, 1800); // 2000 - 200
  assert.equal(z.cashVariance, 0);
});

test("Boundary 17: Opening Float & Petty Cash - expense category and note with special characters", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);

  const exp = engine.recordExpense("Maintenance (AC/HVAC)", 450.5, "Urgent filter swap @ 3:00 PM");
  assert.equal(exp.category, "Maintenance (AC/HVAC)");
  assert.equal(exp.amount, 450.5);
  assert.equal(exp.note, "Urgent filter swap @ 3:00 PM");
});

test("Boundary 17: Opening Float & Petty Cash - expenses exceeding opening float before cash sales handled without crash", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(100);

  // Expense of 150 when float is only 100
  engine.recordExpense("Emergency repair", 150);

  // Expected cash = 100 - 150 = -50
  const z = engine.generateDailyZReport(0);
  assert.equal(z.expectedCash, -50);
  assert.equal(z.cashVariance, 50); // counted 0 vs -50 expected
});

test("Boundary 17: Opening Float & Petty Cash - closing drawer and reopening resets state", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(500);
  assert.equal(engine.isTillOpen(), true);

  engine.closeDrawer();
  assert.equal(engine.isTillOpen(), false);

  assert.throws(() => engine.recordExpense("Late expense", 50), /Cash drawer must be opened/);
});
