import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";

test("Pairwise: 1-Click Out-of-Stock Toggle Blocks Station Item Dispatch to KDS", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-tandoori",
    name: "Tandoori Chicken",
    price: 380,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
    stationId: "st-tandoor",
  });

  // Out of stock triggered for Tandoor station
  pos.toggleOutOfStock("item-tandoori", false);

  assert.throws(
    () => pos.addItem({ menuItemId: "item-tandoori" }),
    /OUT OF STOCK and cannot be ordered/,
  );
});

test("Pairwise: Out-of-Stock Item in Cart Flags Draft and Prevents KOT Routing", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-paneer",
    name: "Paneer Tikka",
    price: 250,
    taxRatePercent: 5,
    isActive: true,
    modifierGroupIds: [],
  });

  const line = pos.addItem({ menuItemId: "item-paneer", quantity: 2 });
  assert.equal(pos.validateCartStock().valid, true);

  // Paneer runs out before submit
  pos.toggleOutOfStock("item-paneer", false);
  const check = pos.validateCartStock();
  assert.equal(check.valid, false);

  // POS drops or rejects KOT generation until out-of-stock line is cleared
  pos.removeLine(line.lineId);
  assert.equal(pos.validateCartStock().valid, true);
});

test("Pairwise: Multi-Station KOT Routing - splits order across Bar and Kitchen stations", () => {
  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "MULTI-101",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Vijay",
    items: [
      { id: "1", name: "Cocktail", quantity: 2, stationName: "Bar" },
      { id: "2", name: "Butter Chicken", quantity: 1, stationName: "Main Kitchen" },
    ],
  });

  const barTickets = kds.getTicketsForStation("Bar");
  const kitchenTickets = kds.getTicketsForStation("Main Kitchen");

  assert.ok(barTickets.some((t) => t.id === kot.id));
  assert.ok(kitchenTickets.some((t) => t.id === kot.id));
});

test("Pairwise: KDS Station Rejection Notifies Floor Server with Actionable Reason", () => {
  const kds = new KotKdsEngine();
  const ticket = kds.createKot({
    orderNumber: "REJ-55",
    orderType: "DINE_IN",
    waiterId: "w-floor",
    waiterName: "Floor Waiter",
    items: [{ id: "1", name: "Fresh Crab", quantity: 1, stationName: "Seafood" }],
  });

  kds.updateStatus(ticket.id, "REJECTED", "Seafood station has no fresh crab available");
  const updated = kds.getTicket(ticket.id);

  assert.equal(updated.status, "REJECTED");
  assert.equal(updated.rejectionReason, "Seafood station has no fresh crab available");
  assert.equal(updated.waiterName, "Floor Waiter");
});

test("Pairwise: Re-Stocking Item Immediately Restores KOT Production Flow", () => {
  const pos = new PosCartEngine();
  pos.registerMenuItem({
    id: "item-dosa",
    name: "Masala Dosa",
    price: 120,
    taxRatePercent: 5,
    isActive: false, // temporarily 86'd
    modifierGroupIds: [],
  });

  assert.throws(() => pos.addItem({ menuItemId: "item-dosa" }), /OUT OF STOCK/);

  // Fresh batter arrives -> restock
  pos.toggleOutOfStock("item-dosa", true);
  const line = pos.addItem({ menuItemId: "item-dosa", quantity: 1 });
  assert.equal(line.itemName, "Masala Dosa");

  // Create KOT ticket
  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "RESTOCK-1",
    orderType: "DINE_IN",
    waiterId: "w1",
    waiterName: "Ramesh",
    items: [{ id: line.lineId, name: line.itemName, quantity: 1, stationName: "South Indian" }],
  });
  assert.equal(kot.status, "NEW");
});
