import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";

test("Boundary 13: Waiter Identification Attribution - single-letter or minimal waiter name", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "601",
    orderType: "DINE_IN",
    waiterId: "w-min",
    waiterName: "A",
    items: [{ id: "1", name: "Tea", quantity: 1, stationName: "Bar" }],
  });

  assert.equal(ticket.waiterName, "A");
  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.ok(layout.text.includes("Waiter: A"));
});

test("Boundary 13: Waiter Identification Attribution - long waiter name truncation/wrapping safety", () => {
  const kds = new KotKdsEngine();
  const longName = "Bartholomew Montgomery Alexander-Fitzgerald III";
  const ticket = kds.createKot({
    orderNumber: "602",
    orderType: "DINE_IN",
    waiterId: "w-long",
    waiterName: longName,
    items: [{ id: "1", name: "Coffee", quantity: 1, stationName: "Bar" }],
  });

  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.ok(layout.text.includes("Bartholomew Montgomery"));
});

test("Boundary 13: Waiter Identification Attribution - waiter attribution with alphanumeric staff badge ID", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "603",
    orderType: "DINE_IN",
    waiterId: "EMP-9874-ZONE-A",
    waiterName: "Sarah Jenkins",
    items: [{ id: "1", name: "Salad", quantity: 1, stationName: "Kitchen" }],
  });

  const layout = kds.renderThermalLayout(ticket.id, 80);
  assert.ok(layout.footer.includes("EMP-9874-ZONE-A"));
});

test("Boundary 13: Waiter Identification Attribution - multiple orders created by distinct waiters retain independent attribution", () => {
  const kds = new KotKdsEngine();
  const t1 = kds.createKot({ orderNumber: "604", orderType: "DINE_IN", waiterId: "w1", waiterName: "Waiter One", items: [] });
  const t2 = kds.createKot({ orderNumber: "605", orderType: "DINE_IN", waiterId: "w2", waiterName: "Waiter Two", items: [] });

  assert.equal(kds.getTicket(t1.id).waiterName, "Waiter One");
  assert.equal(kds.getTicket(t2.id).waiterName, "Waiter Two");
});

test("Boundary 13: Waiter Identification Attribution - waiter attribution on rejected ticket is preserved for audit trail", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "606",
    orderType: "DINE_IN",
    waiterId: "w-audit",
    waiterName: "Audit Waiter",
    items: [{ id: "1", name: "Steak", quantity: 1, stationName: "Grill" }],
  });

  kds.updateStatus(ticket.id, "REJECTED", "Out of beef");
  const rejected = kds.getTicket(ticket.id);
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.waiterName, "Audit Waiter");
  assert.equal(rejected.waiterId, "w-audit");
});
