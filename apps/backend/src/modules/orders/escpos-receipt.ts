// Builds raw ESC/POS jobs for direct-USB thermal printing from this app's
// Order data (receipt.html.ts / kot.html.ts render the same data as HTML for
// the browser-print fallback). Everything is native printer text: items,
// quantities, modifiers, notes and totals use the printer's own fonts with
// ESC/POS alignment, bold and size commands, never a bitmap. Layout, wrapping,
// code page handling and the end-of-job reset live in escpos/encoder.ts.
//
// Multi-region tax (2026-09-27): same regime/mode-aware labeling as
// receipt.html.ts. order.subtotal/taxAmount/totalAmount are unchanged here
// too; only which rows get printed differs.

import {
  resolveTaxIdLabel,
  resolveTaxLabel,
  TAX_REGIME_PRESETS,
  type TaxMode,
  type TaxRegime,
} from '@nodedr-restaurant/types';
import {
  CMD,
  EscposWriter,
  resolveProfile,
  type PrinterProfile,
} from './escpos/encoder';

export { resolveProfile, type PrinterProfile } from './escpos/encoder';

// Preferred symbol first; used only when the selected code page can print it,
// otherwise the ISO-style code after it (never a '?').
const CURRENCY_SYMBOLS: Record<string, [string, string]> = {
  INR: ['Rs.', 'Rs.'],
  USD: ['$', 'USD '],
  EUR: ['\u20ac', 'EUR '],
  GBP: ['\u00a3', 'GBP '],
};

function currencySymbol(w: EscposWriter, currency: string): string {
  const [preferred, fallback] = CURRENCY_SYMBOLS[currency] ?? [
    `${currency} `,
    `${currency} `,
  ];
  return [...preferred].every((c) => w.has(c)) ? preferred : fallback;
}

export interface PrintResult {
  buffer: Buffer;
  /** Characters printed as '?' because the code page cannot represent them. */
  unsupportedChars: string[];
}

export interface ReceiptVerifactu {
  url: string;
  heading: string;
  legend: string;
  short: string;
  invoiceNumber: string;
}

export interface EscposReceiptOrder {
  /** Spain VERI*FACTU invoice QR, printed on a paid receipt. */
  verifactu?: ReceiptVerifactu | null;
  orderNumber: string;
  type: string;
  createdAt: Date;
  table: { label: string } | null;
  customer: { name: string; phone: string | null } | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  tipAmount: number;
  loyaltyPointsRedeemed: number;
  loyaltyDiscountAmount: number;
  totalAmount: number;
  /** Discount as a percentage of the subtotal, printed next to the amount. */
  discountPercent?: number;
  /** A bill handed over before payment: no "paid in full" wording. */
  isProvisional?: boolean;
  /** Applied so far / still owed; printed when set. */
  amountPaid?: number;
  balanceDue?: number;
  items: {
    nameSnapshot: string;
    quantity: number;
    unitPriceSnapshot: number;
    lineTotal: number;
    taxRateSnapshot: number;
    modifiers: { nameSnapshot: string; priceAdjSnapshot: number }[];
  }[];
  payments: {
    method: string;
    amount: number;
    tendered?: number | null;
    changeGiven?: number | null;
  }[];
}

/** "Discount (10%)" when the percentage is known, else plain "Discount". */
export function discountLabel(percent?: number): string {
  return percent && percent > 0 ? `Discount (${Number(percent)}%)` : 'Discount';
}

interface JobFormat {
  profile?: PrinterProfile;
  /** IANA time zone / locale for the printed timestamp (server default if omitted). */
  timeZone?: string;
  locale?: string;
}

const stamp = (d: Date | string, f: JobFormat) =>
  new Date(d).toLocaleString(f.locale, { timeZone: f.timeZone });

export function buildReceiptEscPosJob({
  restaurantName,
  branch,
  currency,
  order,
  openDrawer = false,
  profile = resolveProfile(),
  timeZone,
  locale,
}: {
  restaurantName: string;
  branch: {
    name: string;
    address: string | null;
    phone: string | null;
    gstNumber: string | null;
    taxRegime: TaxRegime;
    taxMode: TaxMode;
    taxLabel: string | null;
    taxId: string | null;
  };
  currency: string;
  order: EscposReceiptOrder;
  /** Also kick the cash drawer (for cash payments). */
  openDrawer?: boolean;
} & JobFormat): PrintResult {
  const w = new EscposWriter(profile);
  const sym = currencySymbol(w, currency);
  const money = (n: number) => `${sym}${Number(n).toFixed(2)}`;
  const taxLabel = resolveTaxLabel(branch.taxRegime, branch.taxLabel);
  const taxIdValue =
    branch.taxId ||
    (branch.taxRegime === 'INDIA_GST' ? branch.gstNumber : null);
  const taxIdLabel = resolveTaxIdLabel(branch.taxRegime);

  w.text(restaurantName, { align: 'center', bold: true, size: 'big' });
  w.text(branch.name, { align: 'center' });
  if (branch.address) w.text(branch.address, { align: 'center' });
  if (branch.phone) w.text(`Ph: ${branch.phone}`, { align: 'center' });
  if (taxIdValue) {
    w.text(`${taxIdLabel}: ${taxIdValue}`, { align: 'center' });
  }
  w.rule();
  w.text(stamp(order.createdAt, { timeZone, locale }));
  w.text(`Order: #${order.orderNumber} - ${order.type.replace('_', ' ')}`);
  if (order.table) w.text(`Table: ${order.table.label}`);
  if (order.customer) {
    w.text(
      `Guest: ${order.customer.name}${order.customer.phone ? ` - ${order.customer.phone}` : ''}`,
    );
  }
  w.rule();

  for (const item of order.items) {
    w.text(item.nameSnapshot, { bold: true });
    for (const mod of item.modifiers) w.text(`  + ${mod.nameSnapshot}`);
    w.row(
      `${item.quantity} x ${money(item.unitPriceSnapshot)}`,
      money(item.lineTotal),
      { indent: 2 },
    );
    if (Number(item.taxRateSnapshot) > 0) {
      w.text(`  ${taxLabel} @ ${item.taxRateSnapshot}%`);
    }
  }
  w.rule();

  if (branch.taxMode === 'EXCLUSIVE') {
    w.row('Subtotal', money(order.subtotal - order.taxAmount));
    if (order.discountAmount > 0) {
      w.row(
        discountLabel(order.discountPercent),
        `-${money(order.discountAmount)}`,
      );
    }
    if (order.taxAmount > 0) w.row(taxLabel, money(order.taxAmount));
  } else {
    w.row('Subtotal', money(order.subtotal));
    if (order.discountAmount > 0) {
      w.row(
        discountLabel(order.discountPercent),
        `-${money(order.discountAmount)}`,
      );
    }
    if (order.taxAmount > 0) {
      // Prices are tax-inclusive - this is a breakup of tax already inside
      // the total above, not an additional charge (see ARCHITECTURE.md).
      if (TAX_REGIME_PRESETS[branch.taxRegime].splitCgstSgst) {
        const half =
          Math.round((order.taxAmount / 2 + Number.EPSILON) * 100) / 100;
        w.row('CGST (incl.)', money(half));
        w.row('SGST (incl.)', money(order.taxAmount - half));
      } else {
        w.row(`${taxLabel} (incl.)`, money(order.taxAmount));
      }
    }
  }
  if (order.loyaltyDiscountAmount > 0) {
    w.row(
      `Loyalty (${order.loyaltyPointsRedeemed} pts)`,
      `-${money(order.loyaltyDiscountAmount)}`,
    );
  }
  if (order.tipAmount > 0) w.row('Tip', money(order.tipAmount));
  w.rule();
  w.row(order.isProvisional ? 'TOTAL DUE' : 'TOTAL', money(order.totalAmount), {
    bold: true,
    size: 'tall',
  });

  if (order.payments.length > 0) {
    w.rule();
    for (const p of order.payments) {
      w.row(`Paid (${p.method})`, money(p.amount));
      if (p.tendered != null && p.changeGiven != null && p.changeGiven > 0) {
        w.row(`  Received`, money(p.tendered));
        w.row(`  Change`, money(p.changeGiven));
      }
    }
  }
  if (order.amountPaid !== undefined && order.balanceDue !== undefined) {
    w.rule();
    w.row('Amount paid', money(order.amountPaid));
    w.row('Balance due', money(order.balanceDue), { bold: true });
  }

  if (order.verifactu && !order.isProvisional) {
    w.rule();
    w.text(`Factura simplificada ${order.verifactu.invoiceNumber}`, {
      align: 'center',
      bold: true,
    });
    w.text(order.verifactu.heading, { align: 'center' });
    w.qr(order.verifactu.url);
    w.text(order.verifactu.legend, { align: 'center' });
    w.text(order.verifactu.short, { align: 'center', bold: true });
  }

  w.rule();
  w.text(
    order.isProvisional
      ? 'Bill only - not a receipt. Payment pending.'
      : 'Thank you! Visit again.',
    { align: 'center' },
  );
  return {
    buffer: w.finish({ drawer: openDrawer }),
    unsupportedChars: [...w.unsupported],
  };
}

export interface EscposKotOrder {
  orderNumber: string;
  type: string;
  createdAt: Date;
  table: { label: string } | null;
  customer: { name: string } | null;
  waiterName?: string | null;
  waiterId?: string | null;
  /** Order-level note ("allergy: nuts"), printed above the items. */
  notes?: string | null;
  items: {
    nameSnapshot: string;
    quantity: number;
    kitchenNote: string | null;
    modifiers: { nameSnapshot: string }[];
  }[];
}

/** Which kitchen ticket this is; `reprint` > 0 prints a REPRINT banner. */
export interface KotTicketInfo {
  number: string;
  station?: string | null;
  reprint?: number;
}

/** Kitchen ticket: quantities, modifiers and notes only - no prices or tax. */
export function buildKotEscPosJob({
  branchName,
  order,
  ticket,
  profile = resolveProfile(),
  timeZone,
  locale,
}: {
  branchName: string;
  order: EscposKotOrder;
  ticket?: KotTicketInfo;
} & JobFormat): PrintResult {
  const w = new EscposWriter(profile);
  w.text('KITCHEN ORDER', { align: 'center', bold: true, size: 'tall' });
  if (ticket?.reprint) {
    w.text(`*** REPRINT #${ticket.reprint} ***`, {
      align: 'center',
      bold: true,
      size: 'tall',
    });
  }
  w.text(branchName, { align: 'center' });
  if (ticket) {
    w.text(
      `Ticket ${ticket.number}${ticket.station ? ` - ${ticket.station}` : ''}`,
      { align: 'center' },
    );
  }
  w.rule();
  w.text(`#${order.orderNumber}`, { bold: true, size: 'big' });
  w.text(
    `${order.type.replace('_', ' ')}${order.table ? ` - Table ${order.table.label}` : ''}`,
    { bold: true, size: 'tall' },
  );
  if (order.waiterName) w.text(`Waiter: ${order.waiterName}`, { bold: true });
  if (order.customer) w.text(`Guest: ${order.customer.name}`);
  w.text(stamp(order.createdAt, { timeZone, locale }));
  if (order.notes) w.text(`ORDER NOTE: ${order.notes}`, { bold: true });
  w.rule('=');

  let units = 0;
  for (const item of order.items) {
    units += item.quantity;
    w.text(`${item.quantity} x ${item.nameSnapshot}`, {
      bold: true,
      size: 'tall',
    });
    for (const mod of item.modifiers) w.text(`    + ${mod.nameSnapshot}`);
    if (item.kitchenNote) {
      w.text(`    NOTE: ${item.kitchenNote}`, { bold: true });
    }
    w.blank();
  }
  w.rule('=');
  w.text(`${order.items.length} line(s), ${units} item(s)`);
  if (order.waiterName) {
    w.text(
      `Server: ${order.waiterName}${order.waiterId ? ` (ID: ${order.waiterId})` : ''}`,
    );
  }
  return {
    buffer: w.finish(),
    unsupportedChars: [...w.unsupported],
  };
}

/** Back-compatible wrapper: just the bytes. */
export function buildReceiptEscPos(
  args: Parameters<typeof buildReceiptEscPosJob>[0],
): Buffer {
  return buildReceiptEscPosJob(args).buffer;
}

export function buildKotEscPos(
  args: Parameters<typeof buildKotEscPosJob>[0],
): Buffer {
  return buildKotEscPosJob(args).buffer;
}

/** Just the drawer pulse, for a "No sale" / test open. */
export function buildOpenDrawer(): Buffer {
  return Buffer.concat([CMD.init, CMD.openDrawer]);
}

/**
 * Test slip for a new printer: column ruler (checks the paper width setting),
 * accented / currency sample (checks the code page) and the size/bold styles.
 * If the sample line shows wrong glyphs, change the code page in settings.
 */
export function buildTestSlip(
  profile: PrinterProfile = resolveProfile(),
): Buffer {
  const w = new EscposWriter(profile);
  w.text('Nodedr OrderRestro', { align: 'center', bold: true, size: 'big' });
  w.text('Printer test OK', { align: 'center' });
  w.rule();
  const ruler = '1234567890'.repeat(7).slice(0, profile.columns);
  w.text(ruler);
  w.text(
    `${profile.paperWidthMm} mm - ${profile.columns} columns - ${profile.codepage}`,
  );
  w.text(
    'Accents: \u00e1\u00e9\u00ed\u00f3\u00fa \u00f1 \u00fc \u00bf? \u00a1! \u20ac \u00a3',
  );
  w.text('Bold', { bold: true });
  w.text('Tall text', { size: 'tall' });
  w.text('Wide text', { size: 'wide' });
  w.text(stamp(new Date(), {}));
  return w.finish();
}

/** A sample kitchen ticket, to prove the kitchen printer end to end. */
export function buildKotTestSlip(
  profile: PrinterProfile = resolveProfile(),
  branchName = 'Test print',
): PrintResult {
  return buildKotEscPosJob({
    branchName,
    profile,
    ticket: { number: 'TEST-1', station: 'Kitchen' },
    order: {
      orderNumber: 'TEST',
      type: 'DINE_IN',
      createdAt: new Date(),
      table: { label: '1' },
      customer: null,
      notes: 'This is only a test - no food to make',
      items: [
        {
          nameSnapshot: 'Sample dish',
          quantity: 2,
          kitchenNote: 'No onion',
          modifiers: [{ nameSnapshot: 'Extra spicy' }],
        },
      ],
    },
  });
}
