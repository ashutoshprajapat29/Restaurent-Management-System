import assert from "node:assert/strict";
import { test } from "node:test";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Feature 17: Opening Float & Petty Cash - records opening cash float to initialize till", () => {
  const engine = new SettlementDrawerEngine();
  assert.equal(engine.isTillOpen(), false);

  const res = engine.openDrawer(2000);
  assert.equal(res.success, true);
  assert.equal(res.openingFloat, 2000);
  assert.equal(engine.isTillOpen(), true);
});

test("Feature 17: Opening Float & Petty Cash - rejects negative opening cash float", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(() => engine.openDrawer(-500), /cannot be negative/);
});

test("Feature 17: Opening Float & Petty Cash - records petty cash expense disbursed from drawer", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1500);

  const exp1 = engine.recordExpense("Dairy Supply", 350, "Milk and curd delivery");
  assert.equal(exp1.category, "Dairy Supply");
  assert.equal(exp1.amount, 350);
  assert.equal(exp1.note, "Milk and curd delivery");
});

test("Feature 17: Opening Float & Petty Cash - prevents recording expenses before drawer is opened", () => {
  const engine = new SettlementDrawerEngine();
  assert.throws(
    () => engine.recordExpense("Produce", 200),
    /Cash drawer must be opened before recording expenses/,
  );
});

test("Feature 17: Opening Float & Petty Cash - rejects non-positive expense amounts", () => {
  const engine = new SettlementDrawerEngine();
  engine.openDrawer(1000);

  assert.throws(() => engine.recordExpense("Fuel", 0), /must be positive/);
  assert.throws(() => engine.recordExpense("Fuel", -40), /must be positive/);
});
