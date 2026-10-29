import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";

test("Feature 12: Thermal Ticket Print - formats clean 80mm thermal layout (48 columns)", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "777",
    orderType: "DINE_IN",
    tableNumber: "T-10",
    waiterId: "waiter-7",
    waiterName: "Rohan",
    items: [
      { id: "1", name: "Dal Makhani", quantity: 2, stationName: "Main Kitchen" },
      { id: "2", name: "Butter Naan", quantity: 4, stationName: "Tandoor" },
    ],
  });

  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.equal(layout.columns, 48);
  assert.ok(layout.text.includes("Order: #777"));
  assert.ok(layout.text.includes("Table: T-10"));
  assert.ok(layout.text.includes("2x Dal Makhani"));
  assert.ok(layout.text.includes("4x Butter Naan"));
});

test("Feature 12: Thermal Ticket Print - formats clean 58mm thermal layout (32 columns)", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "888",
    orderType: "TAKEAWAY",
    waiterId: "waiter-9",
    waiterName: "Priya",
    items: [{ id: "1", name: "Veg Biryani", quantity: 1, stationName: "Kitchen" }],
  });

  const layout = kds.renderThermalLayout(ticket.id, 58);
  assert.equal(layout.columns, 32);
  assert.ok(layout.text.includes("Order: #888"));
  assert.ok(layout.text.includes("Takeaway"));
  assert.ok(layout.text.includes("1x Veg Biryani"));
});

test("Feature 12: Thermal Ticket Print - renders modifier additions and kitchen notes on ticket", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "999",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Alex",
    items: [
      {
        id: "1",
        name: "Double Cheeseburger",
        quantity: 1,
        stationName: "Grill",
        modifiers: ["Extra Bacon", "Gluten-Free Bun"],
        kitchenNote: "Allergies: strictly no mustard",
      },
    ],
  });

  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.ok(layout.text.includes("+ Extra Bacon, Gluten-Free Bun"));
  assert.ok(layout.text.includes("Note: Allergies: strictly no mustard"));
});

test("Feature 12: Thermal Ticket Print - generates standard ESC/POS binary stream", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "112",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Dave",
    items: [{ id: "1", name: "Espresso", quantity: 1, stationName: "Bar" }],
  });

  const escposBytes = kds.encodeEscPos(ticket.id, 80);
  assert.ok(escposBytes instanceof Uint8Array);
  assert.ok(escposBytes.length > 50);

  // Check ESC @ init byte header [0x1B, 0x40]
  assert.equal(escposBytes[0], 0x1b);
  assert.equal(escposBytes[1], 0x40);

  // Check cut command suffix [0x1D, 0x56, 0x00]
  const len = escposBytes.length;
  assert.equal(escposBytes[len - 3], 0x1d);
  assert.equal(escposBytes[len - 2], 0x56);
  assert.equal(escposBytes[len - 1], 0x00);
});

test("Feature 12: Thermal Ticket Print - throws error when rendering non-existent ticket", () => {
  const kds = new KotKdsEngine();
  assert.throws(() => kds.renderThermalLayout("ghost-id"), /not found/);
});
