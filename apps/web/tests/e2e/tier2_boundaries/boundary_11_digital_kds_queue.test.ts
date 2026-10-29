import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";

test("Boundary 11: Digital KDS Queue - kitchen declining/rejecting ticket with required reason", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "801",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Mark",
    items: [{ id: "1", name: "Special Fish", quantity: 1, stationName: "Kitchen" }],
  });

  kds.updateStatus(ticket.id, "REJECTED", "Ingredients depleted unexpectedly");
  assert.equal(ticket.status, "REJECTED");
  assert.equal(ticket.rejectionReason, "Ingredients depleted unexpectedly");
});

test("Boundary 11: Digital KDS Queue - attempting to move terminal status SERVED throws error", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "802",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Mark",
    items: [{ id: "1", name: "Tea", quantity: 1, stationName: "Bar" }],
  });

  kds.updateStatus(ticket.id, "ACCEPTED");
  kds.updateStatus(ticket.id, "PREPARING");
  kds.updateStatus(ticket.id, "READY");
  kds.updateStatus(ticket.id, "SERVED");

  assert.throws(
    () => kds.updateStatus(ticket.id, "PREPARING"),
    /Invalid KOT status transition/,
  );
});

test("Boundary 11: Digital KDS Queue - elapsed time calculation with zero duration (just created)", () => {
  const kds = new KotKdsEngine();
  const now = new Date();
  const ticket = kds.createKot({
    orderNumber: "803",
    orderType: "TAKEAWAY",
    waiterId: "w1",
    waiterName: "Sam",
    items: [{ id: "1", name: "Juice", quantity: 1, stationName: "Bar" }],
    createdAt: now,
  });

  const elapsed = kds.getElapsedMinutes(ticket.id, now);
  assert.equal(elapsed, 0);
});

test("Boundary 11: Digital KDS Queue - empty items array rejected or handled cleanly", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "804",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Sam",
    items: [],
  });

  assert.equal(ticket.items.length, 0);
  assert.equal(kds.getTicketsForStation("Bar").length, 0);
});

test("Boundary 11: Digital KDS Queue - non-existent ticket ID lookup throws descriptive error", () => {
  const kds = new KotKdsEngine();
  assert.throws(
    () => kds.updateStatus("missing-kot-id", "ACCEPTED"),
    /KOT ticket missing-kot-id not found/,
  );
});
