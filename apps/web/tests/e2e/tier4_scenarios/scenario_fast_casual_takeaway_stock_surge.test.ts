import assert from "node:assert/strict";
import { test } from "node:test";
import { KotKdsEngine } from "../helpers/kot-kds-engine.ts";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Scenario 3: Fast-Casual Takeaway Ordering with Sudden Out-of-Stock Surge & Dynamic UPI Settle", () => {
  const pos = new PosCartEngine();
  pos.orderType = "TAKEAWAY";

  // Menu Catalog
  pos.registerMenuItem({ id: "item-avocado-toast", name: "Avocado Toast", price: 220, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos.registerMenuItem({ id: "item-special-wrap", name: "Chef Special Burrito", price: 280, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });
  pos.registerMenuItem({ id: "item-cold-brew", name: "Nitro Cold Brew", price: 160, taxRatePercent: 5, isActive: true, modifierGroupIds: [] });

  // Customer 1 orders Chef Special Burrito & Cold Brew
  pos.addItem({ menuItemId: "item-special-wrap", quantity: 2 });
  pos.addItem({ menuItemId: "item-cold-brew", quantity: 2 });
  const order1Total = pos.calculateTotals().total; // 560 + 320 = 880

  // Kitchen alerts cashier: Avocado & Burrito wraps are completely finished (stock surge)
  pos.toggleOutOfStock("item-special-wrap", false);
  pos.toggleOutOfStock("item-avocado-toast", false);

  // Customer 2 in queue tries to order Avocado Toast -> blocked immediately
  assert.throws(
    () => pos.addItem({ menuItemId: "item-avocado-toast", quantity: 1 }),
    /is OUT OF STOCK and cannot be ordered/,
  );

  // Customer 1 pays via Dynamic UPI QR
  const settlement = new SettlementDrawerEngine();
  settlement.openDrawer(1000);

  const qr = settlement.generateUpiQr({
    vpa: "fastcasual@icici",
    payeeName: "Fast Casual Express",
    amount: order1Total,
    orderNumber: "TK-7701",
  });
  assert.equal(qr.isValid, true);
  assert.ok(qr.uri.includes("am=880.00"));

  const settle1 = settlement.settleOrder({
    orderId: "TK-7701",
    totalAmount: order1Total,
    payments: [{ method: "UPI", amount: order1Total, reference: "UPI-PAY-7701" }],
  });
  assert.equal(settle1.fullyPaid, true);

  // KOT printed on 58mm thermal printer for quick pickup
  const kds = new KotKdsEngine();
  const kot = kds.createKot({
    orderNumber: "7701",
    orderType: "TAKEAWAY",
    waiterId: "c-fast",
    waiterName: "Cashier Tina",
    items: [
      { id: "1", name: "Chef Special Burrito", quantity: 2, stationName: "Kitchen" },
      { id: "2", name: "Nitro Cold Brew", quantity: 2, stationName: "Bar" },
    ],
  });

  const thermal = kds.renderThermalLayout(kot.id, 58);
  assert.equal(thermal.columns, 32);
  assert.ok(thermal.text.includes("Order: #7701"));
  assert.ok(thermal.text.includes("Takeaway"));
  assert.ok(thermal.text.includes("Cashier Tina"));
});
