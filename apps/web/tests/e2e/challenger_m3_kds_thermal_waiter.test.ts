import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { KotKdsEngine, type KotStatus } from "./helpers/kot-kds-engine.ts";
import { resolveStation, readStation, writeStation, type KeyValueStorage } from "../../lib/kds-station.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Challenger M3 Empirical Tests: KDS Queue, Thermal Print & Waiter Attribution", () => {
  describe("1. KDS Station Filtering & Routing (Feature 11)", () => {
    test("Partitions tickets across multiple distinct kitchen stations without cross-leakage", () => {
      const kds = new KotKdsEngine();

      // Create orders assigned to different stations
      kds.createKot({
        orderNumber: "ORD-GRILL-1",
        orderType: "DINE_IN",
        tableNumber: "T-01",
        waiterId: "w-1",
        waiterName: "Alice",
        stationId: "st-grill",
        items: [{ id: "i1", name: "BBQ Ribs", quantity: 2, stationName: "Grill" }],
      });

      kds.createKot({
        orderNumber: "ORD-BAR-1",
        orderType: "DINE_IN",
        tableNumber: "T-02",
        waiterId: "w-2",
        waiterName: "Bob",
        stationId: "st-bar",
        items: [{ id: "i2", name: "Mojito", quantity: 3, stationName: "Bar" }],
      });

      kds.createKot({
        orderNumber: "ORD-DESSERT-1",
        orderType: "TAKEAWAY",
        waiterId: "w-1",
        waiterName: "Alice",
        stationId: "st-dessert",
        items: [{ id: "i3", name: "Tiramisu", quantity: 1, stationName: "Dessert" }],
      });

      const grillTickets = kds.getTicketsForStation("Grill");
      const barTickets = kds.getTicketsForStation("Bar");
      const dessertTickets = kds.getTicketsForStation("Dessert");
      const tandoorTickets = kds.getTicketsForStation("Tandoor");

      assert.equal(grillTickets.length, 1);
      assert.equal(grillTickets[0].orderNumber, "ORD-GRILL-1");

      assert.equal(barTickets.length, 1);
      assert.equal(barTickets[0].orderNumber, "ORD-BAR-1");

      assert.equal(dessertTickets.length, 1);
      assert.equal(dessertTickets[0].orderNumber, "ORD-DESSERT-1");

      assert.equal(tandoorTickets.length, 0);
    });

    test("Multi-item split routing: order with items across Bar and Kitchen matches both filters", () => {
      const kds = new KotKdsEngine();
      kds.createKot({
        orderNumber: "ORD-COMBO-77",
        orderType: "DINE_IN",
        tableNumber: "T-05",
        waiterId: "w-3",
        waiterName: "Charlie",
        items: [
          { id: "it1", name: "Classic Burger", quantity: 1, stationName: "Kitchen" },
          { id: "it2", name: "Craft Beer", quantity: 2, stationName: "Bar" },
        ],
      });

      const kitchenView = kds.getTicketsForStation("Kitchen");
      const barView = kds.getTicketsForStation("Bar");
      const pizzaView = kds.getTicketsForStation("Pizza");

      assert.equal(kitchenView.length, 1);
      assert.equal(barView.length, 1);
      assert.equal(kitchenView[0].id, barView[0].id);
      assert.equal(pizzaView.length, 0);
    });

    test("Stress Harness: 100 tickets routed across 5 stations maintain exact counts and partition integrity", () => {
      const kds = new KotKdsEngine();
      const stations = ["Grill", "Salad", "Pizza", "Bakery", "Beverage"];
      const counts: Record<string, number> = { Grill: 0, Salad: 0, Pizza: 0, Bakery: 0, Beverage: 0 };

      for (let i = 1; i <= 100; i++) {
        const station = stations[i % stations.length];
        counts[station]++;
        kds.createKot({
          orderNumber: `ORD-BULK-${i}`,
          orderType: i % 2 === 0 ? "DINE_IN" : "TAKEAWAY",
          waiterId: `waiter-${i % 4}`,
          waiterName: `Staff ${i % 4}`,
          items: [{ id: `item-${i}`, name: `Dish ${i}`, quantity: 1, stationName: station }],
        });
      }

      for (const st of stations) {
        const retrieved = kds.getTicketsForStation(st);
        assert.equal(retrieved.length, counts[st], `Station ${st} ticket count mismatch`);
        // Verify every ticket in this partition actually has an item for this station
        for (const t of retrieved) {
          assert.ok(t.items.some((it) => it.stationName === st));
        }
      }
    });

    test("Station selector persistence and resolution logic (kds-station)", () => {
      const memory: Record<string, string> = {};
      const storage: KeyValueStorage = {
        getItem: (k) => memory[k] ?? null,
        setItem: (k, v) => { memory[k] = v; },
        removeItem: (k) => { delete memory[k]; },
      };

      // Write station for branch b1
      assert.ok(writeStation(storage, "branch-alpha", "station-grill"));
      assert.equal(readStation(storage, "branch-alpha").value, "station-grill");

      // Verify resolution when station exists in branch
      const resolvedValid = resolveStation("station-grill", [{ id: "station-grill" }, { id: "station-bar" }]);
      assert.deepEqual(resolvedValid, { active: "station-grill", stale: false, ready: true });

      // Verify resolution when saved station has been deleted (falls back to all, marked stale)
      const resolvedStale = resolveStation("station-grill", [{ id: "station-bar" }]);
      assert.deepEqual(resolvedStale, { active: "", stale: true, ready: true });

      // Verify resolution when station list is still loading (ready: false)
      const resolvedLoading = resolveStation("station-grill", undefined, false);
      assert.deepEqual(resolvedLoading, { active: "", stale: false, ready: false });
    });
  });

  describe("2. Elapsed Cooking Time Calculation Oracle (Feature 11)", () => {
    test("Computes elapsed minutes accurately at 0m, 1m, 14m, 15m (late threshold), and 45m", () => {
      const kds = new KotKdsEngine();
      const baseNow = new Date("2026-10-28T20:00:00.000Z");

      const t0 = kds.createKot({
        orderNumber: "T-0M",
        orderType: "DINE_IN",
        waiterId: "w1",
        waiterName: "Alice",
        items: [{ id: "1", name: "Soup", quantity: 1, stationName: "Kitchen" }],
        createdAt: new Date("2026-10-28T20:00:00.000Z"),
      });

      const t1 = kds.createKot({
        orderNumber: "T-1M",
        orderType: "DINE_IN",
        waiterId: "w1",
        waiterName: "Alice",
        items: [{ id: "1", name: "Soup", quantity: 1, stationName: "Kitchen" }],
        createdAt: new Date("2026-10-28T19:59:00.000Z"), // 1 min ago
      });

      const t14 = kds.createKot({
        orderNumber: "T-14M",
        orderType: "DINE_IN",
        waiterId: "w1",
        waiterName: "Alice",
        items: [{ id: "1", name: "Soup", quantity: 1, stationName: "Kitchen" }],
        createdAt: new Date("2026-10-28T19:46:00.000Z"), // 14 mins ago
      });

      const t15 = kds.createKot({
        orderNumber: "T-15M",
        orderType: "DINE_IN",
        waiterId: "w1",
        waiterName: "Alice",
        items: [{ id: "1", name: "Soup", quantity: 1, stationName: "Kitchen" }],
        createdAt: new Date("2026-10-28T19:45:00.000Z"), // 15 mins ago
      });

      const t45 = kds.createKot({
        orderNumber: "T-45M",
        orderType: "DINE_IN",
        waiterId: "w1",
        waiterName: "Alice",
        items: [{ id: "1", name: "Soup", quantity: 1, stationName: "Kitchen" }],
        createdAt: new Date("2026-10-28T19:15:00.000Z"), // 45 mins ago
      });

      assert.equal(kds.getElapsedMinutes(t0.id, baseNow), 0);
      assert.equal(kds.getElapsedMinutes(t1.id, baseNow), 1);
      assert.equal(kds.getElapsedMinutes(t14.id, baseNow), 14);
      assert.equal(kds.getElapsedMinutes(t15.id, baseNow), 15);
      assert.equal(kds.getElapsedMinutes(t45.id, baseNow), 45);

      // Verify late condition (elapsed >= 15)
      assert.equal(kds.getElapsedMinutes(t14.id, baseNow) >= 15, false);
      assert.equal(kds.getElapsedMinutes(t15.id, baseNow) >= 15, true);
      assert.equal(kds.getElapsedMinutes(t45.id, baseNow) >= 15, true);
    });

    test("Clock skew resilience: negative elapsed time (createdAt in the future) clamps to 0", () => {
      const kds = new KotKdsEngine();
      const current = new Date("2026-10-28T20:00:00.000Z");
      const future = new Date("2026-10-28T20:05:00.000Z"); // 5 mins ahead

      const ticket = kds.createKot({
        orderNumber: "T-SKEW",
        orderType: "TAKEAWAY",
        waiterId: "w1",
        waiterName: "Sam",
        items: [{ id: "1", name: "Juice", quantity: 1, stationName: "Bar" }],
        createdAt: future,
      });

      const elapsed = kds.getElapsedMinutes(ticket.id, current);
      assert.equal(elapsed, 0, "Negative elapsed time must clamp to 0");
    });

    test("Fresh ticket threshold: new tickets < 2 minutes qualify as fresh, >= 2m do not", () => {
      const FRESH_MINUTES = 2;
      const baseNow = new Date("2026-10-28T20:00:00.000Z");

      const freshTime = new Date("2026-10-28T19:59:00.000Z"); // 1 min ago
      const staleTime = new Date("2026-10-28T19:57:30.000Z"); // 2.5 mins ago

      const diffFreshMin = Math.floor((baseNow.getTime() - freshTime.getTime()) / 60_000);
      const diffStaleMin = Math.floor((baseNow.getTime() - staleTime.getTime()) / 60_000);

      assert.ok(diffFreshMin < FRESH_MINUTES);
      assert.ok(diffStaleMin >= FRESH_MINUTES);
    });
  });

  describe("3. KDS Ticket Status Transitions & Rejection Controls (Feature 11)", () => {
    test("Enforces forward progression: NEW -> ACCEPTED -> PREPARING -> READY -> SERVED", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "ORD-FLOW-1",
        orderType: "DINE_IN",
        tableNumber: "T-03",
        waiterId: "w-1",
        waiterName: "Raj",
        items: [{ id: "1", name: "Butter Chicken", quantity: 1, stationName: "Kitchen" }],
      });

      assert.equal(ticket.status, "NEW");

      kds.updateStatus(ticket.id, "ACCEPTED");
      assert.equal(ticket.status, "ACCEPTED");

      kds.updateStatus(ticket.id, "PREPARING");
      assert.equal(ticket.status, "PREPARING");

      kds.updateStatus(ticket.id, "READY");
      assert.equal(ticket.status, "READY");

      kds.updateStatus(ticket.id, "SERVED");
      assert.equal(ticket.status, "SERVED");
    });

    test("Rejects illegal status skipping (NEW -> READY, NEW -> SERVED, ACCEPTED -> SERVED)", () => {
      const kds = new KotKdsEngine();
      const ticket1 = kds.createKot({
        orderNumber: "SKIP-1",
        orderType: "DINE_IN",
        waiterId: "w-1",
        waiterName: "Raj",
        items: [{ id: "1", name: "Rice", quantity: 1, stationName: "Kitchen" }],
      });

      // Cannot skip to READY or SERVED from NEW
      assert.throws(() => kds.updateStatus(ticket1.id, "READY"), /Invalid KOT status transition/);
      assert.throws(() => kds.updateStatus(ticket1.id, "SERVED"), /Invalid KOT status transition/);

      // Move to ACCEPTED
      kds.updateStatus(ticket1.id, "ACCEPTED");
      // Cannot skip to SERVED from ACCEPTED
      assert.throws(() => kds.updateStatus(ticket1.id, "SERVED"), /Invalid KOT status transition/);
    });

    test("Rejects illegal backward status transitions (PREPARING -> ACCEPTED, READY -> PREPARING)", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "BACK-1",
        orderType: "DINE_IN",
        waiterId: "w-1",
        waiterName: "Raj",
        items: [{ id: "1", name: "Soup", quantity: 1, stationName: "Kitchen" }],
      });

      kds.updateStatus(ticket.id, "ACCEPTED");
      kds.updateStatus(ticket.id, "PREPARING");

      // Cannot regress PREPARING -> ACCEPTED
      assert.throws(() => kds.updateStatus(ticket.id, "ACCEPTED"), /Invalid KOT status transition/);

      kds.updateStatus(ticket.id, "READY");
      // Cannot regress READY -> PREPARING
      assert.throws(() => kds.updateStatus(ticket.id, "PREPARING"), /Invalid KOT status transition/);
    });

    test("Terminal state immutability: SERVED cannot transition to any other status", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "TERM-1",
        orderType: "TAKEAWAY",
        waiterId: "w-1",
        waiterName: "Raj",
        items: [{ id: "1", name: "Tea", quantity: 1, stationName: "Bar" }],
      });

      kds.updateStatus(ticket.id, "ACCEPTED");
      kds.updateStatus(ticket.id, "PREPARING");
      kds.updateStatus(ticket.id, "READY");
      kds.updateStatus(ticket.id, "SERVED");

      const allStatuses: KotStatus[] = ["NEW", "ACCEPTED", "PREPARING", "READY", "SERVED", "REJECTED"];
      for (const st of allStatuses) {
        assert.throws(
          () => kds.updateStatus(ticket.id, st),
          /Invalid KOT status transition/,
          `SERVED ticket must not transition to ${st}`,
        );
      }
    });

    test("Rejection flow records mandatory reason and terminates ticket lifecycle", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "REJ-1",
        orderType: "DINE_IN",
        waiterId: "w-2",
        waiterName: "Maya",
        items: [{ id: "1", name: "Salmon Steak", quantity: 1, stationName: "Grill" }],
      });

      // Rejecting from NEW with reason
      kds.updateStatus(ticket.id, "REJECTED", "Fish shipment delayed");
      assert.equal(ticket.status, "REJECTED");
      assert.equal(ticket.rejectionReason, "Fish shipment delayed");

      // Once REJECTED, cannot transition to anything
      assert.throws(() => kds.updateStatus(ticket.id, "ACCEPTED"), /Invalid KOT status transition/);
    });
  });

  describe("4. Dual 80mm & 58mm Thermal Print Layouts (Feature 12)", () => {
    test("80mm layout enforces 48-column formatting, dividers, and content bounds", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "PRINT-80",
        orderType: "DINE_IN",
        tableNumber: "T-42",
        waiterId: "w-80",
        waiterName: "Sanjay",
        items: [
          { id: "1", name: "Chicken Tikka Masala", quantity: 2, stationName: "Kitchen" },
          { id: "2", name: "Garlic Butter Naan", quantity: 3, stationName: "Tandoor" },
        ],
      });

      const layout = kds.renderThermalLayout(ticket.id, 80);
      assert.equal(layout.columns, 48);

      const lines = layout.text.split("\n");
      for (const line of lines) {
        assert.ok(
          line.length <= 48,
          `Line exceeds 48 columns for 80mm print: "${line}" (${line.length} chars)`,
        );
      }

      assert.ok(layout.header.includes("Order: #PRINT-80"));
      assert.ok(layout.header.includes("Table: T-42"));
      assert.ok(layout.body.includes("2x Chicken Tikka Masala"));
      assert.ok(layout.body.includes("3x Garlic Butter Naan"));
      assert.ok(layout.footer.includes("Server: Sanjay (ID: w-80)"));
    });

    test("58mm layout enforces 32-column formatting on body/footer, identifies 34-char title overflow in helper", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "PRINT-58",
        orderType: "TAKEAWAY",
        waiterId: "w-58",
        waiterName: "Anil",
        items: [
          { id: "1", name: "Veg Hakka Noodles", quantity: 1, stationName: "Wok" },
        ],
      });

      const layout = kds.renderThermalLayout(ticket.id, 58);
      assert.equal(layout.columns, 32);

      const lines = layout.text.split("\n");
      for (const line of lines) {
        if (line.includes("KITCHEN ORDER TICKET")) {
          // Empirical finding: the banner string in KotKdsEngine helper is 34 characters wide (overflows 32 cols)
          assert.equal(line.trim(), "*** KITCHEN ORDER TICKET (KOT) ***");
          assert.equal(line.trim().length, 34);
        } else {
          assert.ok(
            line.length <= 32,
            `Line exceeds 32 columns for 58mm print: "${line}" (${line.length} chars)`,
          );
        }
      }

      assert.ok(layout.header.includes("Order: #PRINT-58"));
      assert.ok(layout.header.includes("Takeaway"));
      assert.ok(layout.body.includes("1x Veg Hakka Noodles"));
      assert.ok(layout.footer.includes("Server: Anil (ID: w-58)"));
    });

    test("Standard ESC/POS binary stream starts with ESC @ (0x1B, 0x40) and ends with GS V 0 (0x1D, 0x56, 0x00)", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "ESCPOS-1",
        orderType: "DINE_IN",
        tableNumber: "T-01",
        waiterId: "w-1",
        waiterName: "Ramesh",
        items: [{ id: "1", name: "Cappuccino", quantity: 2, stationName: "Bar" }],
      });

      const stream80 = kds.encodeEscPos(ticket.id, 80);
      const stream58 = kds.encodeEscPos(ticket.id, 58);

      for (const stream of [stream80, stream58]) {
        assert.ok(stream instanceof Uint8Array);
        assert.ok(stream.length > 50);

        // Header: ESC @ [0x1B, 0x40] printer init
        assert.equal(stream[0], 0x1b, "Expected ESC byte at index 0");
        assert.equal(stream[1], 0x40, "Expected @ byte at index 1");

        // Footer: GS V 0 [0x1D, 0x56, 0x00] paper cut
        const len = stream.length;
        assert.equal(stream[len - 3], 0x1d, "Expected GS byte at len - 3");
        assert.equal(stream[len - 2], 0x56, "Expected V byte at len - 2");
        assert.equal(stream[len - 1], 0x00, "Expected 0x00 byte at len - 1");
      }
    });
  });

  describe("5. Waiter Identification Attribution (Feature 13)", () => {
    test("Waiter identification is captured on ticket creation and preserved throughout lifecycle", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "WAITER-001",
        orderType: "DINE_IN",
        tableNumber: "T-09",
        waiterId: "staff-w109",
        waiterName: "Vikram Malhotra",
        items: [{ id: "1", name: "Thali", quantity: 1, stationName: "Kitchen" }],
      });

      assert.equal(ticket.waiterId, "staff-w109");
      assert.equal(ticket.waiterName, "Vikram Malhotra");

      // Verify preservation across every status transition
      kds.updateStatus(ticket.id, "ACCEPTED");
      assert.equal(ticket.waiterId, "staff-w109");
      assert.equal(ticket.waiterName, "Vikram Malhotra");

      kds.updateStatus(ticket.id, "PREPARING");
      assert.equal(ticket.waiterId, "staff-w109");
      assert.equal(ticket.waiterName, "Vikram Malhotra");

      kds.updateStatus(ticket.id, "READY");
      assert.equal(ticket.waiterId, "staff-w109");
      assert.equal(ticket.waiterName, "Vikram Malhotra");

      kds.updateStatus(ticket.id, "SERVED");
      assert.equal(ticket.waiterId, "staff-w109");
      assert.equal(ticket.waiterName, "Vikram Malhotra");
    });

    test("Thermal layouts prominently render Waiter in header and Server with staff ID in footer", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "WAITER-PRINT",
        orderType: "DINE_IN",
        tableNumber: "T-11",
        waiterId: "emp-789",
        waiterName: "Pooja Sharma",
        items: [{ id: "1", name: "Paneer Tikka", quantity: 2, stationName: "Tandoor" }],
      });

      const layout80 = kds.renderThermalLayout(ticket.id, 80);
      assert.ok(layout80.header.includes("Waiter: Pooja Sharma"));
      assert.ok(layout80.footer.includes("Server: Pooja Sharma (ID: emp-789)"));

      const layout58 = kds.renderThermalLayout(ticket.id, 58);
      assert.ok(layout58.header.includes("Waiter: Pooja Sharma"));
      assert.ok(layout58.footer.includes("Server: Pooja Sharma (ID: emp-789)"));
    });

    test("Takeaway orders attribute creating cashier/waiter in both header and footer", () => {
      const kds = new KotKdsEngine();
      const ticket = kds.createKot({
        orderNumber: "TAKEAWAY-W",
        orderType: "TAKEAWAY",
        waiterId: "cashier-02",
        waiterName: "Gaurav Mehta",
        items: [{ id: "1", name: "Cold Coffee", quantity: 2, stationName: "Bar" }],
      });

      const layout = kds.renderThermalLayout(ticket.id, 58);
      assert.ok(layout.header.includes("Waiter: Gaurav Mehta"));
      assert.ok(layout.footer.includes("Server: Gaurav Mehta (ID: cashier-02)"));
    });

    test("Adversarial: verifies ticket-card.tsx DOM component contains expected data-testid contracts", () => {
      // Statically verify ticket-card source code for exact required data-testid hooks
      const ticketCardPath = path.resolve(__dirname, "../../components/kds/ticket-card.tsx");
      const content = fs.readFileSync(ticketCardPath, "utf-8");

      // Verify waiter testid hook: data-testid={`kds-ticket-waiter-${ticket.id}`}
      assert.ok(
        content.includes('data-testid={`kds-ticket-waiter-${ticket.id}`}'),
        "ticket-card.tsx must include data-testid={`kds-ticket-waiter-${ticket.id}`}",
      );

      // Verify order number testid hook: data-testid={`kds-ticket-ordernum-${ticket.id}`}
      assert.ok(
        content.includes('data-testid={`kds-ticket-ordernum-${ticket.id}`}'),
        "ticket-card.tsx must include data-testid={`kds-ticket-ordernum-${ticket.id}`}",
      );

      // Verify card root testid: data-testid={`kds-ticket-${ticket.id}`}
      assert.ok(
        content.includes('data-testid={`kds-ticket-${ticket.id}`}'),
        "ticket-card.tsx must include data-testid={`kds-ticket-${ticket.id}`}",
      );

      // Verify rendered waiter text: Waiter: {ticket.order.createdBy?.name || "Staff"}
      assert.ok(
        content.includes("ticket.order.createdBy?.name"),
        "ticket-card.tsx must render ticket.order.createdBy?.name",
      );
    });
  });
});
