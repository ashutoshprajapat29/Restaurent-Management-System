import assert from "node:assert/strict";
import { describe, test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { buildUpiUri } from "../../../lib/upi.ts";
import { resolveStation, type KeyValueStorage } from "../../../lib/kds-station.ts";
import { PosCartEngine } from "../helpers/pos-cart-engine.ts";
import { planPayment, parseMoney } from "../../../lib/bill.ts";
import { round2 } from "../../../lib/pricing-preview.ts";

function resolveWebPath(relPath: string): string {
  const fromDir = path.resolve(import.meta.dirname, "../../..", relPath);
  if (fs.existsSync(fromDir)) return fromDir;
  const fromCwd = path.resolve(process.cwd(), relPath);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(process.cwd(), "apps/web", relPath);
}

// Relative luminance formula per WCAG 2.1 specs
function calculateRelativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Contrast ratio formula per WCAG 2.1 specs
function calculateContrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Mirroring the implementation from apps/web/components/layout/app-shell.tsx
function getAccessibleForegroundCurrent(hexColor: string): string {
  const clean = hexColor.replace("#", "");
  if (clean.length !== 6) return "#FFFFFF";
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.4 ? "#111827" : "#FFFFFF";
}

// Proposed optimal accessible foreground with 3-digit normalization and 0.20 crossover threshold
function getAccessibleForegroundOptimal(hexColor: string): string {
  let clean = hexColor.replace("#", "").trim();
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return "#FFFFFF";
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return lum > 0.2 ? "#111827" : "#FFFFFF";
}

describe("Tier 5 White-Box Adversarial Hardening: Frontend, POS, Touch & Accessibility", () => {
  // =========================================================================
  // 1. WCAG 2.1 AA Dynamic Luminance & Color Contrast
  // =========================================================================
  describe("1. Dynamic Relative Luminance & Theme Contrast (app-shell.tsx)", () => {
    test("High-contrast extreme colors correctly choose foreground with WCAG AA compliance", () => {
      const pureWhite = "#ffffff";
      const pureBlack = "#000000";
      const neonYellow = "#ffff00";
      const deepNavy = "#000080";

      assert.equal(getAccessibleForegroundCurrent(pureWhite), "#111827", "Pure white must use dark text");
      assert.equal(getAccessibleForegroundCurrent(pureBlack), "#FFFFFF", "Pure black must use white text");
      assert.equal(getAccessibleForegroundCurrent(neonYellow), "#111827", "Neon yellow must use dark text");
      assert.equal(getAccessibleForegroundCurrent(deepNavy), "#FFFFFF", "Deep navy must use white text");

      // Verify contrast ratios
      const lumWhite = calculateRelativeLuminance(1, 1, 1);
      const lumBlack = calculateRelativeLuminance(0, 0, 0);
      const lumDarkText = calculateRelativeLuminance(17 / 255, 24 / 255, 39 / 255); // #111827
      const lumWhiteText = 1.0;

      const whiteContrast = calculateContrastRatio(lumWhite, lumDarkText);
      assert.ok(whiteContrast >= 4.5, `White contrast ${whiteContrast} must pass WCAG AA (>= 4.5:1)`);

      const blackContrast = calculateContrastRatio(lumBlack, lumWhiteText);
      assert.ok(blackContrast >= 4.5, `Black contrast ${blackContrast} must pass WCAG AA (>= 4.5:1)`);
    });

    test("Sub-optimal threshold gap: Brand Orange (#f97316) yields low contrast with lum > 0.4 vs optimal lum > 0.2", () => {
      const brandOrange = "#f97316"; // Tailwind Orange 500
      const r = 0xf9 / 255;
      const g = 0x73 / 255;
      const b = 0x16 / 255;
      const lum = calculateRelativeLuminance(r, g, b);
      assert.ok(lum > 0.3 && lum < 0.35, `Orange luminance should be ~0.325, got ${lum}`);

      // Current implementation returns #FFFFFF because lum <= 0.4
      const currentFg = getAccessibleForegroundCurrent(brandOrange);
      assert.equal(currentFg, "#FFFFFF", "Current implementation returns #FFFFFF for orange");

      const currentContrast = calculateContrastRatio(lum, 1.0);
      // Contrast with white is ~2.80:1, which FAILS WCAG AA 4.5:1
      assert.ok(
        currentContrast < 4.5,
        `Current contrast with white is ${currentContrast.toFixed(2)}:1, failing WCAG AA (< 4.5:1)`,
      );

      // Optimal implementation returns #111827
      const optimalFg = getAccessibleForegroundOptimal(brandOrange);
      assert.equal(optimalFg, "#111827", "Optimal implementation chooses #111827");

      const lumDarkText = calculateRelativeLuminance(17 / 255, 24 / 255, 39 / 255);
      const optimalContrast = calculateContrastRatio(lum, lumDarkText);
      assert.ok(
        optimalContrast >= 4.5,
        `Optimal contrast with dark text is ${optimalContrast.toFixed(2)}:1, passing WCAG AA (>= 4.5:1)`,
      );
    });

    test("3-digit hex normalization gap: #fff in current code returns white-on-white text", () => {
      // Current behavior fails for 3-digit hex
      const shortWhite = "#fff";
      const currentResult = getAccessibleForegroundCurrent(shortWhite);
      assert.equal(
        currentResult,
        "#FFFFFF",
        "Current code returns #FFFFFF for 3-digit hex due to length !== 6 check",
      );

      // Optimal behavior expands 3-digit hex to 6 digits and chooses dark text
      const optimalResult = getAccessibleForegroundOptimal(shortWhite);
      assert.equal(
        optimalResult,
        "#111827",
        "Optimal code normalizes #fff to #ffffff and returns #111827",
      );

      const shortBlack = "#000";
      assert.equal(getAccessibleForegroundOptimal(shortBlack), "#FFFFFF");
    });

    test("Hostile inputs & edge cases survive gracefully without throwing", () => {
      const hostileCases = ["", "#", "#12", "#12345", "#gggggg", "not-a-color", "#ffffffff"];
      for (const c of hostileCases) {
        assert.doesNotThrow(() => getAccessibleForegroundCurrent(c));
        assert.doesNotThrow(() => getAccessibleForegroundOptimal(c));
        assert.equal(getAccessibleForegroundCurrent(c), "#FFFFFF", `Safe fallback for ${c}`);
      }
    });
  });

  // =========================================================================
  // 2. Mobile Touch Ergonomics (>= 44x44px) & Component Audit
  // =========================================================================
  describe("2. Mobile Touch Ergonomics & Component Target Audit", () => {
    test("PinSwitchDialog keypad and action buttons strictly enforce >= 44x44px", () => {
      const content = fs.readFileSync(resolveWebPath("components/layout/pin-switch-dialog.tsx"), "utf-8");

      assert.match(content, /data-testid="pin-switch-button"[\s\S]*?min-h-\[44px\][\s\S]*?min-w-\[44px\]/);
      assert.match(content, /className="h-14 min-h-\[44px\] min-w-\[44px\] text-xl font-bold/);
      assert.match(content, /data-testid="pin-submit-button"[\s\S]*?min-h-\[44px\]/);
    });

    test("KDS ticket action buttons strictly enforce >= 44x44px", () => {
      const ticketContent = fs.readFileSync(resolveWebPath("components/kds/ticket-card.tsx"), "utf-8");

      // Next status button has h-12 (48px >= 44px)
      assert.match(ticketContent, /className="h-12 flex-1 text-base"/);
      // Reject button has h-12 (48px >= 44px)
      assert.match(ticketContent, /variant="destructive"\s+className="h-12 shrink-0 px-4"/);
      // Priority button has h-12 w-12 (48x48px >= 44x44px)
      assert.match(ticketContent, /size="icon"\s+className="h-12 w-12 shrink-0"/);
    });

    test("CartPanel manipulation buttons strictly enforce >= 44x44px", () => {
      const cartContent = fs.readFileSync(resolveWebPath("components/pos/cart-panel.tsx"), "utf-8");

      // Inc, Dec, and Remove buttons
      assert.match(cartContent, /className="min-h-\[44px\] min-w-\[44px\] h-11 w-11"[\s\S]*?data-testid={`cart-line-dec-\${line\.key}`}/);
      assert.match(cartContent, /className="min-h-\[44px\] min-w-\[44px\] h-11 w-11"[\s\S]*?data-testid={`cart-line-inc-\${line\.key}`}/);
      assert.match(cartContent, /className="min-h-\[44px\] min-w-\[44px\] h-11 w-11 text-muted-foreground hover:text-destructive"[\s\S]*?data-testid={`cart-line-remove-\${line\.key}`}/);

      // Open bills selector pills
      assert.match(cartContent, /aria-label="Open bills on this table"[\s\S]*?min-h-\[44px\] min-w-\[44px\]/);

      // View & pay button
      assert.match(cartContent, /min-h-\[44px\] shrink-0 px-3 text-xs/);

      // Submit button has h-11 (44px)
      assert.match(cartContent, /data-testid="cart-submit-btn"[\s\S]*?className="h-11"/);
    });

    test("ProductGrid 86 out-of-stock toggle enforces >= 44x44px", () => {
      const gridContent = fs.readFileSync(resolveWebPath("components/pos/product-grid.tsx"), "utf-8");

      assert.match(
        gridContent,
        /data-testid={`pos-stock-toggle-\${item\.id}`}[\s\S]*?min-h-\[44px\] min-w-\[44px\]/,
      );
    });

    test("Mobile Touch Ergonomics: Modifier dialog confirms, options, and CartPanel tabs enforce >= 44px targets", () => {
      const modifierContent = fs.readFileSync(
        resolveWebPath("components/pos/modifier-picker-dialog.tsx"),
        "utf-8",
      );

      // Verify that Add to cart button uses explicit h-11 / min-h-[44px]
      const hasExplicitSubmitHeight =
        modifierContent.includes('data-testid="modifier-confirm-btn"') &&
        (modifierContent.includes("h-11") || modifierContent.includes("min-h-[44px]"));
      assert.equal(
        hasExplicitSubmitHeight,
        true,
        "Modifier confirm button must enforce explicit min-h-[44px] or h-11",
      );

      // Verify that modifier option rows use min-h-[44px]
      const hasModifierOptionMinHeight =
        modifierContent.includes('data-testid={`modifier-option-${mod.id}`}') &&
        modifierContent.includes("min-h-[44px]");
      assert.equal(
        hasModifierOptionMinHeight,
        true,
        "Modifier option buttons must enforce explicit min-h-[44px]",
      );

      // Verify that CartPanel order type TabsList uses explicit 44px height (h-11)
      const cartContent = fs.readFileSync(resolveWebPath("components/pos/cart-panel.tsx"), "utf-8");
      const hasCartTabsMinHeight =
        cartContent.includes('<TabsList className="w-full h-11') ||
        cartContent.includes('<TabsList className="w-full min-h-[44px]');
      assert.equal(
        hasCartTabsMinHeight,
        true,
        "CartPanel order type TabsList must enforce explicit 44px height (h-11)",
      );
    });
  });

  // =========================================================================
  // 3. Rapid Out-of-Stock Toggle Storm & State Consistency
  // =========================================================================
  describe("3. Rapid Out-of-Stock Toggle Storm & State Consistency", () => {
    test("100 rapid successive toggles preserve deterministic final state and odd/even parity", () => {
      const pos = new PosCartEngine();
      pos.registerMenuItem({
        id: "item-storm-1",
        name: "Paneer Tikka",
        price: 220,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: [],
      });

      for (let i = 1; i <= 100; i++) {
        const targetActive = i % 2 === 0; // Even -> true, Odd -> false
        pos.toggleOutOfStock("item-storm-1", targetActive);
      }

      // After 100 flips (even), item should be in stock
      const checkEven = pos.validateCartStock();
      assert.equal(checkEven.valid, true);

      // 101st flip -> out of stock
      pos.toggleOutOfStock("item-storm-1", false);
      assert.throws(
        () => pos.addItem({ menuItemId: "item-storm-1", quantity: 1 }),
        /is OUT OF STOCK and cannot be ordered/,
      );
    });

    test("Multi-item storm: 86ing an item present in active cart invalidates submission until removed or restocked", () => {
      const pos = new PosCartEngine();
      pos.registerMenuItem({
        id: "item-thali",
        name: "Special Thali",
        price: 280,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: [],
      });
      pos.registerMenuItem({
        id: "item-lassi",
        name: "Mango Lassi",
        price: 70,
        taxRatePercent: 5,
        isActive: true,
        modifierGroupIds: [],
      });

      const line1 = pos.addItem({ menuItemId: "item-thali", quantity: 2 });
      const line2 = pos.addItem({ menuItemId: "item-lassi", quantity: 2 });

      assert.equal(pos.validateCartStock().valid, true);

      // Chef 86es Thali while cashier has it in cart
      pos.toggleOutOfStock("item-thali", false);

      const check1 = pos.validateCartStock();
      assert.equal(check1.valid, false);
      assert.deepEqual(check1.outOfStockItemNames, ["Special Thali"]);

      // Cashier removes the 86'd item line from cart
      pos.removeLine(line1.lineId);

      const check2 = pos.validateCartStock();
      assert.equal(check2.valid, true, "Cart should be valid again once 86'd item is removed");

      // Chef restocks Thali and cashier adds it back
      pos.toggleOutOfStock("item-thali", true);
      pos.addItem({ menuItemId: "item-thali", quantity: 1 });
      assert.equal(pos.validateCartStock().valid, true);
    });

    test("ProductGrid white-box inspection: stock button is disabled during in-flight mutation", () => {
      const gridContent = fs.readFileSync(resolveWebPath("components/pos/product-grid.tsx"), "utf-8");

      assert.match(
        gridContent,
        /disabled={updateMenuItem\.isPending}/,
        "Stock toggle button must be disabled while mutation is pending to prevent race conditions",
      );

      assert.match(
        gridContent,
        /e\.stopPropagation\(\)/,
        "Stock toggle click must stop propagation to prevent adding the item to cart",
      );
    });
  });

  // =========================================================================
  // 4. UPI Deep Link NPCI Specification Compliance & Hostile Inputs
  // =========================================================================
  describe("4. UPI Deep Link NPCI Specification Compliance (apps/web/lib/upi.ts)", () => {
    test("Generates valid NPCI URI with exact 2-decimal formatted amount and %20 space encoding", () => {
      const uri = buildUpiUri({
        vpa: "merchant@okhdfcbank",
        name: "Grand Spice Kitchen",
        amount: 450.75,
        note: "Table 12 Bill #1042",
        ref: "TXN1042_ABC",
      });

      assert.ok(uri.startsWith("upi://pay?"), "Must use upi://pay scheme");
      assert.ok(uri.includes("pa=merchant%40okhdfcbank"), "VPA must be encoded");
      assert.ok(uri.includes("pn=Grand%20Spice%20Kitchen"), "Spaces must be %20, not +");
      assert.ok(uri.includes("am=450.75"), "Amount must have 2 decimal places");
      assert.ok(uri.includes("cu=INR"), "Currency must be INR");
      assert.ok(uri.includes("tn=Table%2012%20Bill%20%231042"), "Note must be encoded");
      assert.ok(uri.includes("tr=TXN1042_ABC"), "Ref must be present");
    });

    test("Clamps max string lengths per NPCI spec (name 60, note 60, ref 35)", () => {
      const longName = "A".repeat(100);
      const longNote = "B".repeat(100);
      const longRef = "C".repeat(100);

      const uri = buildUpiUri({
        vpa: "payee@upi",
        name: longName,
        note: longNote,
        ref: longRef,
        amount: 100,
      });

      assert.ok(uri.includes(`pn=${"A".repeat(60)}`), "Name must be clamped to 60 characters");
      assert.ok(uri.includes(`tn=${"B".repeat(60)}`), "Note must be clamped to 60 characters");
      assert.ok(uri.includes(`tr=${"C".repeat(35)}`), "Ref must be clamped to 35 characters");
    });

    test("Rejects invalid VPA without @ symbol", () => {
      assert.throws(
        () => buildUpiUri({ vpa: "invalidvpa", amount: 100 }),
        /Invalid UPI VPA/,
      );
      assert.throws(
        () => buildUpiUri({ vpa: "", amount: 100 }),
        /Invalid UPI VPA/,
      );
    });

    test("Edge case: amount < 0 throws Invalid amount while amount = 0 omits 'am' parameter", () => {
      const zeroUri = buildUpiUri({ vpa: "store@upi", amount: 0 });
      assert.ok(!zeroUri.includes("am="), "Zero amount omits am parameter");

      assert.throws(
        () => buildUpiUri({ vpa: "store@upi", amount: -10 }),
        /Invalid amount/,
        "Negative amount must throw Invalid amount error",
      );
    });

    test("Special character & fractional amount encoding in UPI URI", () => {
      const uri = buildUpiUri({
        vpa: "chef@upi",
        name: "Café & Bakery #1",
        note: "Order #500 + spicy & extra sauce?",
        amount: 19.999, // Should format to 20.00
      });

      assert.ok(uri.includes("am=20.00"), "Amount should be formatted to 20.00");
      assert.ok(uri.includes("pn=Caf%C3%A9%20%26%20Bakery%20%231"), "Name with accented & special characters encoded");
      assert.ok(uri.includes("tn=Order%20%23500%20%2B%20spicy%20%26%20extra%20sauce%3F"), "Note special chars encoded");
    });
  });

  // =========================================================================
  // 5. KDS Station Grouping, Timer & Order Attribution
  // =========================================================================
  describe("5. KDS Station Grouping, Waiter Attribution & Audio Alerts", () => {
    test("Station resolution: handles valid, stale, and loading states deterministically", () => {
      const stations = [
        { id: "station-grill", name: "Grill" },
        { id: "station-bar", name: "Bar" },
      ];

      // 1. Saved station exists
      const res1 = resolveStation("station-grill", stations);
      assert.equal(res1.active, "station-grill");
      assert.equal(res1.stale, false);
      assert.equal(res1.ready, true);

      // 2. Saved station was deleted -> marks stale and falls back to all stations
      const res2 = resolveStation("deleted-station", stations);
      assert.equal(res2.active, "");
      assert.equal(res2.stale, true);
      assert.equal(res2.ready, true);

      // 3. Station list is still loading (undefined)
      const res3 = resolveStation("station-bar", undefined);
      assert.equal(res3.ready, false, "Should not be ready while stations are loading");

      // 4. Station list failed to load from server -> trust saved station
      const res4 = resolveStation("station-bar", undefined, true);
      assert.equal(res4.active, "station-bar");
      assert.equal(res4.ready, true);
    });

    test("KDS TicketCard timer thresholds: late >= 15m and fresh < 2m styling contracts", () => {
      const ticketContent = fs.readFileSync(resolveWebPath("components/kds/ticket-card.tsx"), "utf-8");

      // Verify FRESH_MINUTES constant
      assert.match(ticketContent, /const FRESH_MINUTES = 2/);
      // Verify isLate condition
      assert.match(ticketContent, /const isLate = elapsed >= 15/);
      // Verify isFresh condition
      assert.match(ticketContent, /const isFresh = ticket\.status === "NEW" && elapsed < FRESH_MINUTES/);
      // Verify visual classes
      assert.match(ticketContent, /border-warning\/50 ring-1 ring-warning\/30/);
      assert.match(ticketContent, /border-primary ring-2 ring-primary\/40 motion-safe:animate-pulse/);
    });

    test("KDS TicketCard renders active waiter name attribution", () => {
      const ticketContent = fs.readFileSync(resolveWebPath("components/kds/ticket-card.tsx"), "utf-8");

      assert.match(
        ticketContent,
        /data-testid={`kds-ticket-waiter-\${ticket\.id}`}/,
        "Ticket card must render waiter testid attribute",
      );

      assert.match(
        ticketContent,
        /Waiter:\s*\{ticket\.order\.createdBy\?\.name\s*\|\|\s*"Staff"\}/,
        "Ticket card must display active waiter name with fallback",
      );
    });

    test("KDS Sound Hook handles both kot.created and pending order.created events", () => {
      const soundContent = fs.readFileSync(resolveWebPath("hooks/use-kds-sound.ts"), "utf-8");

      assert.match(soundContent, /socket\.on\("kot\.created",\s*chime\)/);
      assert.match(soundContent, /payload\?\.acceptance === "PENDING"/);
      assert.match(soundContent, /if \(!mutedRef\.current\) playNotificationFeedback\(\)/);
    });

    test("ProductGrid stock toggle error handling with onError feedback", () => {
      const gridContent = fs.readFileSync(resolveWebPath("components/pos/product-grid.tsx"), "utf-8");

      // Check whether updateMenuItem.mutate provides onError callback
      const hasStockMutationOnError =
        gridContent.includes("updateMenuItem.mutate({ id: item.id, dto: { isActive: !item.isActive } },") &&
        gridContent.includes("onError");
      assert.equal(
        hasStockMutationOnError,
        true,
        "ProductGrid 86 toggle must handle onError with toast notification",
      );
    });
  });

  // =========================================================================
  // 6. POS Payment Planning & Rounding Stress Tests
  // =========================================================================
  describe("6. Settlement Payment Planning & Change Precision (lib/bill.ts)", () => {
    test("Cash payment with over-tender calculates exact cent-precise change", () => {
      const plan = planPayment({
        remaining: 345.67,
        entered: 500,
        method: "CASH",
      });

      assert.equal(plan.valid, true);
      assert.equal(plan.applied, 345.67);
      assert.equal(plan.tendered, 500);
      assert.equal(plan.change, 154.33);
      assert.equal(plan.balanceAfter, 0);
      assert.equal(plan.partial, false);
      assert.equal(plan.clamped, false);
    });

    test("Non-cash payment (UPI/Card) clamps over-payment to balance without change", () => {
      const plan = planPayment({
        remaining: 250.0,
        entered: 300.0,
        method: "UPI",
      });

      assert.equal(plan.valid, true);
      assert.equal(plan.applied, 250.0);
      assert.equal(plan.change, 0, "UPI cannot return cash change");
      assert.equal(plan.balanceAfter, 0);
      assert.equal(plan.clamped, true, "Over-entered UPI amount must be clamped");
    });

    test("Partial payment leaves remaining balance due and sets partial flag", () => {
      const plan = planPayment({
        remaining: 500.0,
        entered: 200.0,
        method: "CARD",
      });

      assert.equal(plan.valid, true);
      assert.equal(plan.applied, 200.0);
      assert.equal(plan.balanceAfter, 300.0);
      assert.equal(plan.partial, true);
      assert.equal(plan.change, 0);
    });

    test("Hostile input: negative, NaN, or zero on positive balance returns invalid plan", () => {
      const neg = planPayment({ remaining: 100, entered: -50, method: "CASH" });
      assert.equal(neg.valid, false);

      const nan = planPayment({ remaining: 100, entered: Number.NaN, method: "CASH" });
      assert.equal(nan.valid, false);

      const zero = planPayment({ remaining: 100, entered: 0, method: "CASH" });
      assert.equal(zero.valid, false);
    });
  });
});
