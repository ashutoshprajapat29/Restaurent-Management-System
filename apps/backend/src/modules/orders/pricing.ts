// Server-authoritative pricing. Mirrors the hard-won lesson from
// nodedr-pos (see its project memory): the price entered against a menu
// item is TAX-INCLUSIVE, not tax-exclusive — GST/VAT must be backed OUT of
// it, never added on top. A flat/percent discount is computed against the
// tax-inclusive subtotal directly (the rupee amount a cashier actually
// types), not against an already-backed-out exclusive base — computing it
// the other way under-discounts the customer, a distinct trap from the
// inclusive/exclusive bug itself.
//
// Never re-derive this from scratch on future pricing changes — round with
// round2, verify numerically (a clean MRP like 118 at 18% backs out to
// exactly 100), and confirm totalAmount never exceeds the sum of entered
// prices before any discount.
//
// Multi-region tax (2026-09-27): a branch's taxMode decides how a raw menu
// item price is turned into the tax-inclusive unit price this file works
// off of. INCLUSIVE (India GST / EU VAT / Spain IVA — tax-inclusive menu
// prices are the norm/regulation in all three) passes the entered price
// through unchanged, exactly as before. EXCLUSIVE (US sales tax — prices
// are conventionally shown pre-tax, tax added at checkout) grosses it up
// by the tax rate first. toEffectiveInclusiveUnitPrice is the ONLY place
// that conversion happens; priceLine/computeOrderTotals below are
// unchanged and still always operate on an inclusive amount, so every
// downstream consumer (OrderItem.lineTotal, receipts, refunds, KOTs) keeps
// working exactly as it did before this file existed.

import type { TaxMode } from '@nodedr-restaurant/types';

export function toEffectiveInclusiveUnitPrice(
  rawUnitPrice: number,
  taxRatePercent: number,
  taxMode: TaxMode,
): number {
  if (taxMode === 'EXCLUSIVE' && taxRatePercent > 0) {
    return round2(rawUnitPrice * (1 + taxRatePercent / 100));
  }
  return round2(rawUnitPrice);
}

export interface PricedLineInput {
  quantity: number;
  unitPriceInclusive: number; // menuItem.price + sum(selected modifier.priceAdjustment)
  taxRatePercent: number;
}

export interface PricedLine {
  lineTotal: number; // inclusive
  taxAmount: number; // informational breakup only, already inside lineTotal
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function priceLine(input: PricedLineInput): PricedLine {
  const lineTotal = round2(input.unitPriceInclusive * input.quantity);
  const rate = input.taxRatePercent / 100;
  const taxAmount = rate > 0 ? round2(lineTotal - lineTotal / (1 + rate)) : 0;
  return { lineTotal, taxAmount };
}

export interface OrderTotals {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
}

export function computeOrderTotals(
  lines: PricedLine[],
  discountPercent = 0,
  discountFlat = 0,
): OrderTotals {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
  const taxAmount = round2(lines.reduce((sum, l) => sum + l.taxAmount, 0));

  const validPercent = Math.max(0, Math.min(100, discountPercent));
  const validFlat = Math.max(0, discountFlat);
  const percentDiscount = round2((subtotal * validPercent) / 100);
  const discountAmount = round2(
    Math.max(0, Math.min(percentDiscount + validFlat, subtotal)),
  );

  const totalAmount = round2(subtotal - discountAmount);

  return { subtotal, taxAmount, discountAmount, totalAmount };
}
