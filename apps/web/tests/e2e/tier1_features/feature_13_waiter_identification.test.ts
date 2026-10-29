import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";

test("Feature 13: Waiter Identification Attribution - records waiter ID and name on KOT ticket creation", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "401",
    orderType: "DINE_IN",
    tableNumber: "T-01",
    waiterId: "staff-w101",
    waiterName: "Rajesh Kumar",
    items: [{ id: "1", name: "Paneer Tikka", quantity: 1, stationName: "Tandoor" }],
  });

  assert.equal(ticket.waiterId, "staff-w101");
  assert.equal(ticket.waiterName, "Rajesh Kumar");
});

test("Feature 13: Waiter Identification Attribution - prominently displays waiter name in thermal header", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "402",
    orderType: "DINE_IN",
    tableNumber: "T-02",
    waiterId: "staff-w102",
    waiterName: "Ananya Sharma",
    items: [{ id: "1", name: "Hakka Noodles", quantity: 1, stationName: "Kitchen" }],
  });

  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.ok(layout.header.includes("Waiter: Ananya Sharma"));
});

test("Feature 13: Waiter Identification Attribution - includes server attribution and staff ID in thermal footer", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "403",
    orderType: "DINE_IN",
    waiterId: "staff-w103",
    waiterName: "Vikram Singh",
    items: [{ id: "1", name: "Spring Rolls", quantity: 2, stationName: "Kitchen" }],
  });

  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.ok(layout.footer.includes("Server: Vikram Singh (ID: staff-w103)"));
});

test("Feature 13: Waiter Identification Attribution - attributes takeaway orders to active cashier/waiter", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "404",
    orderType: "TAKEAWAY",
    waiterId: "cashier-05",
    waiterName: "Kavita",
    items: [{ id: "1", name: "Cold Coffee", quantity: 1, stationName: "Bar" }],
  });

  assert.equal(ticket.waiterId, "cashier-05");
  assert.equal(ticket.waiterName, "Kavita");
  const layout = kds.renderThermalLayout(ticket.id, 58);
  assert.ok(layout.header.includes("Waiter: Kavita"));
});

test("Feature 13: Waiter Identification Attribution - preserves waiter attribution across status lifecycle transitions", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "405",
    orderType: "DINE_IN",
    waiterId: "waiter-99",
    waiterName: "Deepak",
    items: [{ id: "1", name: "Masala Dosa", quantity: 2, stationName: "Kitchen" }],
  });

  kds.updateStatus(ticket.id, "ACCEPTED");
  kds.updateStatus(ticket.id, "PREPARING");
  kds.updateStatus(ticket.id, "READY");

  assert.equal(ticket.waiterId, "waiter-99");
  assert.equal(ticket.waiterName, "Deepak");
});
