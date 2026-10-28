// Self-printing HTML receipt — ported from nodedr-pos's
// backend/src/lib/receipt.js (same 80mm-thermal-safe layout rules: @page
// margin 0, left-aligned body, box-sizing border-box so 80mm stays 80mm
// after padding). Loaded into a hidden iframe by the frontend
// (lib/print.ts), which calls window.print() itself; the inline script here
// is only a fallback for engines that block that cross-frame call.
//
// Multi-region tax (2026-09-27): which tax rows get shown, and whether the
// top line reads as a tax-inclusive subtotal or a pre-tax one, now follows
// the branch's taxRegime/taxMode — see resolveTaxLabel/resolveTaxIdLabel
// in @nodedr-restaurant/types. This file only changes labels and which
// rows are shown; order.subtotal/taxAmount/totalAmount are unchanged
// (computed once, correctly, in pricing.ts — see its own multi-region
// note) and are never recomputed here.

import { qrSvg } from '../verifactu/verifactu.qr';
import type { ReceiptVerifactu } from './escpos-receipt';
import {
  resolveTaxIdLabel,
  resolveTaxLabel,
  TAX_REGIME_PRESETS,
  type TaxMode,
  type TaxRegime,
} from '@nodedr-restaurant/types';

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

function esc(value: string | number | null | undefined): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

interface ReceiptOrder {
  /** Spain VERI*FACTU invoice QR, printed on a paid receipt. */
  verifactu?: ReceiptVerifactu | null;
  orderNumber: string;
  type: string;
  createdAt: Date;
  table: { label?: string; name?: string } | null;
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

export function buildReceiptHtml({
  restaurantName,
  branch,
  currency,
  order,
  paperWidthMm = 80,
  logoUrl,
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
  order: ReceiptOrder;
  paperWidthMm?: 58 | 80;
  logoUrl?: string | null;
}): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const money = (n: number) => `${sym}${Number(n).toFixed(2)}`;
  const dateStr = new Date(order.createdAt).toLocaleString();
  const taxLabel = resolveTaxLabel(branch.taxRegime, branch.taxLabel);
  // gstNumber is the pre-multi-region field every India install already
  // has populated; taxId is the new generic one. India falls back to the
  // old field so nothing already printed on file goes blank.
  const taxIdValue =
    branch.taxId ||
    (branch.taxRegime === 'INDIA_GST' ? branch.gstNumber : null);
  const taxIdLabel = resolveTaxIdLabel(branch.taxRegime);

  const itemRows = order.items
    .map((item) => {
      const modifierLines = item.modifiers
        .map((m) => `<div class="sub">+ ${esc(m.nameSnapshot)}</div>`)
        .join('');
      return `
        <tr>
          <td>${esc(item.nameSnapshot)}${modifierLines}${
            Number(item.taxRateSnapshot) > 0
              ? `<div class="sub">${esc(taxLabel)} @ ${item.taxRateSnapshot}%</div>`
              : ''
          }</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${money(item.unitPriceSnapshot)}</td>
          <td class="num">${money(item.lineTotal)}</td>
        </tr>`;
    })
    .join('');

  const totalRows: [string, string][] = [];
  if (branch.taxMode === 'EXCLUSIVE') {
    // US-style: show the pre-tax subtotal, then add tax as its own line —
    // order.subtotal/taxAmount are unchanged, this only reslices the
    // display (see pricing.ts: the stored subtotal already has tax baked
    // in, exactly like every other regime, so the pre-tax figure the
    // customer expects to see is subtotal - taxAmount).
    totalRows.push(['Subtotal', money(order.subtotal - order.taxAmount)]);
    if (order.discountAmount > 0) {
      totalRows.push([
        order.discountPercent && order.discountPercent > 0
          ? `Discount (${Number(order.discountPercent)}%)`
          : 'Discount',
        `- ${money(order.discountAmount)}`,
      ]);
    }
    if (order.taxAmount > 0) {
      totalRows.push([taxLabel, money(order.taxAmount)]);
    }
  } else {
    totalRows.push(['Subtotal', money(order.subtotal)]);
    if (order.discountAmount > 0) {
      totalRows.push([
        order.discountPercent && order.discountPercent > 0
          ? `Discount (${Number(order.discountPercent)}%)`
          : 'Discount',
        `- ${money(order.discountAmount)}`,
      ]);
    }
    if (order.taxAmount > 0) {
      // Prices are tax-inclusive (see ARCHITECTURE.md) — this is a breakup
      // of tax already inside the total above, not an additional charge.
      if (TAX_REGIME_PRESETS[branch.taxRegime].splitCgstSgst) {
        const half =
          Math.round((order.taxAmount / 2 + Number.EPSILON) * 100) / 100;
        totalRows.push(['CGST (incl.)', money(half)]);
        totalRows.push(['SGST (incl.)', money(order.taxAmount - half)]);
      } else {
        totalRows.push([`${taxLabel} (incl.)`, money(order.taxAmount)]);
      }
    }
  }
  if (order.loyaltyDiscountAmount > 0) {
    totalRows.push([
      `Loyalty (${order.loyaltyPointsRedeemed} pts)`,
      `- ${money(order.loyaltyDiscountAmount)}`,
    ]);
  }
  if (order.tipAmount > 0) {
    totalRows.push(['Tip', money(order.tipAmount)]);
  }

  const paymentRows = order.payments.flatMap((p) => {
    const rows = [
      `<tr><td>Paid (${esc(p.method)})</td><td class="num">${money(p.amount)}</td></tr>`,
    ];
    if (p.tendered != null && p.changeGiven != null && p.changeGiven > 0) {
      rows.push(
        `<tr><td class="sub">&nbsp;&nbsp;Received</td><td class="num sub">${money(p.tendered)}</td></tr>`,
        `<tr><td class="sub">&nbsp;&nbsp;Change</td><td class="num sub">${money(p.changeGiven)}</td></tr>`,
      );
    }
    return rows;
  });
  const settlementRows =
    order.amountPaid !== undefined && order.balanceDue !== undefined
      ? `<hr class="rule"><table class="totals">
          <tr><td>Amount paid</td><td class="num">${money(order.amountPaid)}</td></tr>
          <tr class="grand"><td>Balance due</td><td class="num">${money(order.balanceDue)}</td></tr>
        </table>`
      : '';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(order.orderNumber)}</title>
<style>
  * { box-sizing: border-box; }
  html { margin: 0; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 0; padding: 4mm; color: #111; width: ${paperWidthMm}mm; font-size: ${paperWidthMm === 58 ? '10px' : '12px'}; }
  p { margin: 0 0 3px; }
  .receipt { width: 100%; margin: 0; }
  h1 { font-size: 15px; text-align: center; margin: 0 0 2px; }
  .center { text-align: center; }
  .muted { color: #555; font-size: 11px; line-height: 1.35; }
  .rule { border: none; border-top: 1px dashed #999; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; font-size: ${paperWidthMm === 58 ? '11px' : '12px'}; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; color: #777; padding-bottom: 2px; }
  td { padding: 1px 0; vertical-align: top; word-break: break-word; }
  .num { text-align: right; white-space: nowrap; padding-left: 6px; }
  .sub { font-size: 10px; color: #777; }
  .totals td { padding: 1px 0; }
  .grand td { font-weight: 700; font-size: 13px; border-top: 1px solid #111; padding-top: 3px; }
  .vf { text-align: center; font-size: 11px; }
  .vf svg { display: block; margin: 4px auto; }
  .footer { text-align: center; margin-top: 6px; font-size: 11px; }
  @page { size: ${paperWidthMm}mm auto; margin: 0; }
  @media print {
    html, body { width: ${paperWidthMm}mm; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <script>
    window.addEventListener('message', function (e) { if (e.data === 'print') window.print(); });
  </script>
  <div class="receipt">
    ${logoUrl ? `<div class="center"><img src="${esc(logoUrl)}" class="logo" style="max-height:48px;max-width:140px;margin-bottom:8px;" /></div>` : ''}
    <h1>${esc(restaurantName)}</h1>
    <p class="center muted">
      ${esc(branch.name)}${branch.address ? `<br>${esc(branch.address)}` : ''}
      ${branch.phone ? `<br>Ph: ${esc(branch.phone)}` : ''}
      ${taxIdValue ? `<br>${esc(taxIdLabel)}: ${esc(taxIdValue)}` : ''}
    </p>
    <hr class="rule">
    <p class="muted">
      ${esc(dateStr)}<br>
      Order: #${esc(order.orderNumber)} · ${esc(order.type.replace('_', ' '))}
      ${order.table ? `<br>Table: ${esc(order.table.label ?? order.table.name)}` : ''}
      ${order.customer ? `<br>Guest: ${esc(order.customer.name)}${order.customer.phone ? ` · ${esc(order.customer.phone)}` : ''}` : ''}
    </p>
    <hr class="rule">
    <table>
      <thead>
        <tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <hr class="rule">
    <table class="totals">
      ${totalRows.map(([l, v]) => `<tr><td>${esc(l)}</td><td class="num">${esc(v)}</td></tr>`).join('')}
      <tr class="grand"><td>${order.isProvisional ? 'TOTAL DUE' : 'GRAND TOTAL'}</td><td class="num">${money(order.totalAmount)}</td></tr>
    </table>
    ${
      paymentRows.length > 0
        ? `<hr class="rule"><table class="totals">${paymentRows.join('')}</table>`
        : ''
    }
    ${settlementRows}
    ${
      order.verifactu && !order.isProvisional
        ? `<hr class="rule"><div class="vf"><strong>Factura simplificada ${esc(order.verifactu.invoiceNumber)}</strong><div>${esc(order.verifactu.heading)}</div>${qrSvg(order.verifactu.url, '35mm')}<div>${esc(order.verifactu.legend)}</div><strong>${esc(order.verifactu.short)}</strong></div>`
        : ''
    }
    <hr class="rule">
    <p class="footer">${
      order.isProvisional
        ? 'Bill only &mdash; not a receipt. Payment pending.'
        : 'Thank you! Visit again.'
    }</p>
  </div>
</body>
</html>`;
}
