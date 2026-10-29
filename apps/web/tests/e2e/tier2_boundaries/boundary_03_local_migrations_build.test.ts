import assert from "node:assert/strict";
import { test } from "node:test";
import {
  branchSettingsSchema,
  restaurantSettingsSchema,
  tableSchema,
} from "@nodedr-restaurant/types";

test("Boundary 3: Local Migrations & Build - restaurant name exactly at max length (40 chars)", () => {
  const exact40 = "A".repeat(40);
  const parsed = restaurantSettingsSchema.parse({ name: exact40 });
  assert.equal(parsed.name, exact40);

  const overflow41 = "A".repeat(41);
  assert.throws(() => restaurantSettingsSchema.parse({ name: overflow41 }), /Too big/);
});

test("Boundary 3: Local Migrations & Build - empty string restaurant name is rejected", () => {
  assert.throws(() => restaurantSettingsSchema.parse({ name: "" }), /Too small/);
});

test("Boundary 3: Local Migrations & Build - printer port boundary values (1 and 65535)", () => {
  const minPort = branchSettingsSchema.parse({ printerPort: 1 });
  assert.equal(minPort.printerPort, 1);

  const maxPort = branchSettingsSchema.parse({ printerPort: 65535 });
  assert.equal(maxPort.printerPort, 65535);

  assert.throws(() => branchSettingsSchema.parse({ printerPort: 0 }), /Too small/);
  assert.throws(() => branchSettingsSchema.parse({ printerPort: 65536 }), /Too big/);
});

test("Boundary 3: Local Migrations & Build - printer paper width accepts only 58 or 80 mm", () => {
  assert.equal(branchSettingsSchema.parse({ printerPaperWidthMm: 58 }).printerPaperWidthMm, 58);
  assert.equal(branchSettingsSchema.parse({ printerPaperWidthMm: 80 }).printerPaperWidthMm, 80);

  assert.throws(() => branchSettingsSchema.parse({ printerPaperWidthMm: 72 as any }), /Invalid/);
});

test("Boundary 3: Local Migrations & Build - table capacity must be positive integer", () => {
  assert.throws(() => tableSchema.parse({ floorId: "f1", number: "T1", capacity: 0 }), /Too small/);
  assert.throws(() => tableSchema.parse({ floorId: "f1", number: "T1", capacity: -4 }), /Too small/);

  const valid = tableSchema.parse({ floorId: "f1", number: "T1", capacity: 1 });
  assert.equal(valid.capacity, 1);
});
