// Pure accounting maths, separate from the database code so it can be tested.

export const round2 = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;

export interface GstLine {
  /** Tax-inclusive line total as stored on the order item. */
  lineTotal: number;
  taxRatePercent: number;
}

export interface GstRow {
  ratePercent: number;
  taxableValue: number;
  tax: number;
  total: number;
}

/**
 * Groups order lines by tax rate. Prices are stored tax-inclusive, so a
 * line's tax is lineTotal x r / (100 + r). `factor` scales every line by
 * the share of the order that was actually charged after discounts
 * (1 = no discount), so the report reflects what was really collected.
 */
export function gstSummary(lines: (GstLine & { factor: number })[]): {
  rows: GstRow[];
  totalTaxable: number;
  totalTax: number;
} {
  const byRate = new Map<number, { total: number; tax: number }>();
  for (const l of lines) {
    const charged = l.lineTotal * l.factor;
    const rate = Math.max(0, l.taxRatePercent);
    const tax = rate > 0 ? (charged * rate) / (100 + rate) : 0;
    const row = byRate.get(l.taxRatePercent) ?? { total: 0, tax: 0 };
    row.total += charged;
    row.tax += tax;
    byRate.set(l.taxRatePercent, row);
  }
  const rows = [...byRate.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ratePercent, v]) => ({
      ratePercent,
      taxableValue: round2(v.total - v.tax),
      tax: round2(v.tax),
      total: round2(v.total),
    }));
  return {
    rows,
    totalTaxable: round2(rows.reduce((s, r) => s + r.taxableValue, 0)),
    totalTax: round2(rows.reduce((s, r) => s + r.tax, 0)),
  };
}

/** Cash the till should hold at close of day. */
export function expectedCash(
  openingFloat: number,
  cashSales: number,
  cashRefunds: number,
  cashExpenses: number,
): number {
  return round2(openingFloat + cashSales - cashRefunds - cashExpenses);
}
