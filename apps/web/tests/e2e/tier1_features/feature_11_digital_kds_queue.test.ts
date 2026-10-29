import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";

test("Feature 11: Digital KDS Queue - creates KOT ticket in NEW status", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "101",
    orderType: "DINE_IN",
    tableNumber: "T-04",
    waiterId: "waiter-bob",
    waiterName: "Bob",
    items: [
      { id: "i1", name: "Paneer Butter Masala", quantity: 1, stationName: "Main Kitchen" },
    ],
  });

  assert.equal(ticket.orderNumber, "101");
  assert.equal(ticket.status, "NEW");
  assert.equal(ticket.items.length, 1);
});

test("Feature 11: Digital KDS Queue - transitions ticket from NEW -> ACCEPTED -> PREPARING -> READY -> SERVED", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "102",
    orderType: "DINE_IN",
    waiterId: "waiter-01",
    waiterName: "Alice",
    items: [{ id: "i2", name: "Garlic Naan", quantity: 3, stationName: "Tandoor" }],
  });

  kds.updateStatus(ticket.id, "ACCEPTED");
  assert.equal(ticket.status, "ACCEPTED");

  kds.updateStatus(ticket.id, "PREPARING");
  assert.equal(ticket.status, "PREPARING");

  kds.updateStatus(ticket.id, "READY");
  assert.equal(ticket.status, "READY");

  kds.updateStatus(ticket.id, "SERVED");
  assert.equal(ticket.status, "SERVED");
});

test("Feature 11: Digital KDS Queue - prevents illegal status transitions", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "103",
    orderType: "TAKEAWAY",
    waiterId: "waiter-01",
    waiterName: "Alice",
    items: [{ id: "i3", name: "Burger", quantity: 1, stationName: "Grill" }],
  });

  // Cannot jump from NEW directly to SERVED
  assert.throws(
    () => kds.updateStatus(ticket.id, "SERVED"),
    /Invalid KOT status transition/,
  );
});

test("Feature 11: Digital KDS Queue - filters orders by kitchen station", () => {
  const kds = new KotKdsEngine();
  kds.createKot({
    orderNumber: "201",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "John",
    items: [{ id: "it1", name: "Mojito", quantity: 2, stationName: "Bar" }],
  });
  kds.createKot({
    orderNumber: "202",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "John",
    items: [{ id: "it2", name: "Tandoori Roti", quantity: 4, stationName: "Tandoor" }],
  });

  const barTickets = kds.getTicketsForStation("Bar");
  const tandoorTickets = kds.getTicketsForStation("Tandoor");

  assert.equal(barTickets.length, 1);
  assert.equal(barTickets[0].orderNumber, "201");
  assert.equal(tandoorTickets.length, 1);
  assert.equal(tandoorTickets[0].orderNumber, "202");
});

test("Feature 11: Digital KDS Queue - tracks elapsed cooking time accurately", () => {
  const kds = new KotKdsEngine();
  const pastTime = new Date(Date.now() - 15 * 60 * 1000); // 15 mins ago
  const ticket = kds.createKot({
    orderNumber: "305",
    orderType: "DINE_IN",
    waiterId: "w2",
    waiterName: "Sara",
    items: [{ id: "i5", name: "Pizza", quantity: 1, stationName: "Main Kitchen" }],
    createdAt: pastTime,
  });

  const elapsed = kds.getElapsedMinutes(ticket.id);
  assert.ok(elapsed >= 15);
});
