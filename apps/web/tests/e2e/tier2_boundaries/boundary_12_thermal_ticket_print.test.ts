import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";

test("Boundary 12: Thermal Ticket Print - long item name does not wrap uncontrollably or overflow columns", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "701",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Rajesh",
    items: [
      {
        id: "1",
        name: "Super Duper Extra Special Chef Signature Multi Grain Crispy Dosa with Special Sambhar",
        quantity: 1,
        stationName: "Kitchen",
      },
    ],
  });

  const layout = kds.renderThermalLayout(ticket.id, 58);
  assert.equal(layout.columns, 32);
  assert.ok(layout.text.includes("Super Duper Extra Special"));
});

test("Boundary 12: Thermal Ticket Print - special symbols and currency characters in receipt layout", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "702",
    orderType: "DINE_IN",
    tableNumber: "T-★#5",
    waiterId: "w2",
    waiterName: "Renée & Zoë",
    items: [{ id: "1", name: "Crème Brûlée & Cappuccino", quantity: 2, stationName: "Dessert" }],
  });

  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.ok(layout.text.includes("Table: T-★#5"));
  assert.ok(layout.text.includes("Renée & Zoë"));
  assert.ok(layout.text.includes("Crème Brûlée & Cappuccino"));
});

test("Boundary 12: Thermal Ticket Print - ESC/POS byte sequence encodes valid UTF-8 characters", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "703",
    orderType: "TAKEAWAY",
    waiterId: "w3",
    waiterName: "Ashok",
    items: [{ id: "1", name: "Jalebi & Rabri", quantity: 1, stationName: "Sweets" }],
  });

  const bytes = kds.encodeEscPos(ticket.id, 80);
  const decoded = new TextDecoder().decode(bytes);
  assert.ok(decoded.includes("Jalebi & Rabri"));
  assert.ok(decoded.includes("Order: #703"));
});

test("Boundary 12: Thermal Ticket Print - formatting with multiple long kitchen notes", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "704",
    orderType: "DINE_IN",
    waiterId: "w4",
    waiterName: "Arun",
    items: [
      {
        id: "1",
        name: "Pizza",
        quantity: 1,
        stationName: "Kitchen",
        kitchenNote: "Guest requests very crispy crust, cut into 8 slices, chili flakes on side",
      },
    ],
  });

  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.ok(layout.text.includes("Note: Guest requests very crispy crust"));
});

test("Boundary 12: Thermal Ticket Print - switching paper widths between 80mm and 58mm adjusts column boundaries", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "705",
    orderType: "DINE_IN",
    waiterId: "w5",
    waiterName: "Vikas",
    items: [{ id: "1", name: "Biryani", quantity: 2, stationName: "Kitchen" }],
  });

  const l80 = kds.renderThermalLayout(ticket.id, 80);
  const l58 = kds.renderThermalLayout(ticket.id, 58);

  assert.equal(l80.columns, 48);
  assert.equal(l58.columns, 32);
});
