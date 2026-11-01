import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthRbacEngine } from "../helpers/auth-rbac-engine.ts";
import { SettlementDrawerEngine } from "../helpers/settlement-drawer-engine.ts";

test("Scenario 5: Shift Handover & Drawer Discrepancy Auditing with Z-Report Variance", () => {
  // 1. Shift 1 (Morning): Cashier A opens drawer with 1000 float
  const drawerA = new SettlementDrawerEngine();
  drawerA.openDrawer(1000);

  const auth = new AuthRbacEngine();
  const cashierA = auth.createStaff({ id: "c-a", name: "Cashier A (Morning)", role: "CASHIER", pin: "1111", branchIds: ["b1"] });
  const cashierB = auth.createStaff({ id: "c-b", name: "Cashier B (Evening)", role: "CASHIER", pin: "2222", branchIds: ["b1"] });
  const manager = auth.createStaff({ id: "m-lead", name: "Floor Manager", role: "RESTAURANT_MANAGER", pin: "9999", branchIds: ["b1"] });

  auth.switchStaffWithPin("1111");

  // Morning transactions:
  // Order 1: 300 Cash
  drawerA.settleOrder({ orderId: "ORD-M-1", totalAmount: 300, payments: [{ method: "CASH", amount: 300, tendered: 300 }] });
  // Order 2: 450 Cash (tendered 500, change 50)
  drawerA.settleOrder({ orderId: "ORD-M-2", totalAmount: 450, payments: [{ method: "CASH", amount: 450, tendered: 500 }] });
  // Order 3: 600 UPI
  drawerA.settleOrder({ orderId: "ORD-M-3", totalAmount: 600, payments: [{ method: "UPI", amount: 600 }] });

  // Petty cash expense: 120
  drawerA.recordExpense("Cleaning Supplies", 120, "Detergent & Mops");

  // Expected cash in morning till = 1000 + 300 + 450 - 120 = 1630
  // Handover count: Cashier A counts 1600 (minor discrepancy: shortage of 30)
  const zMorning = drawerA.generateDailyZReport(1600, "2026-10-28-Shift1");
  assert.equal(zMorning.expectedCash, 1630);
  assert.equal(zMorning.countedCash, 1600);
  assert.equal(zMorning.cashVariance, -30);

  // Manager steps in to verify and sign off
  auth.switchStaffWithPin("9999");
  assert.equal(auth.getActiveStaff()?.name, "Floor Manager");
  assert.equal(auth.hasPermission("reports.access"), true);

  // 2. Shift 2 (Evening): Cashier B takes over with 1600 starting cash
  drawerA.closeDrawer();

  const drawerB = new SettlementDrawerEngine();
  drawerB.openDrawer(1600);
  auth.switchStaffWithPin("2222");
  assert.equal(auth.getActiveStaff()?.name, "Cashier B (Evening)");

  // Evening transactions:
  drawerB.settleOrder({ orderId: "ORD-E-1", totalAmount: 850, payments: [{ method: "CASH", amount: 850, tendered: 1000 }] });
  drawerB.settleOrder({ orderId: "ORD-E-2", totalAmount: 1100, payments: [{ method: "CARD", amount: 1100 }] });

  // Evening Expected Cash = 1600 + 850 = 2450
  // Evening Count: Exact 2450
  const zEvening = drawerB.generateDailyZReport(2450, "2026-10-28-Shift2");
  assert.equal(zEvening.expectedCash, 2450);
  assert.equal(zEvening.countedCash, 2450);
  assert.equal(zEvening.cashVariance, 0);
  assert.equal(zEvening.totalSales, 1950);
});
