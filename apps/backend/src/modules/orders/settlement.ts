// Bill and settlement arithmetic, kept free of I/O so the exact figures a
// cashier sees, the printed bill and the checkout charge all come from one
// place and can be unit-tested. Prices here are tax-INCLUSIVE (see pricing.ts).
//
// Discount and tax: a discount is given on the tax-inclusive price, so it
// reduces the taxable value too. The tax breakup shown on the bill is scaled
// by (subtotal - discount) / subtotal, i.e. the discount is spread pro-rata
// over the lines. Loyalty points are a form of tender, not a price reduction,
// so redeeming them does not change the tax. Tips and delivery fees are
// outside the taxable subtotal.

import { BadRequestException } from '@nestjs/common';
import { computeOrderTotals, round2, type PricedLine } from './pricing';

export interface BillInput {
  lines: PricedLine[];
  /** Manual percentage discount entered by the cashier. */
  discountPercent?: number;
  /** Manual flat discount entered by the cashier. */
  discountFlat?: number;
  /** Coupon / happy-hour discount resolved by the server. */
  autoDiscount?: number;
  /** Currency value of the loyalty points the guest wants to redeem. */
  loyaltyDiscountRequested?: number;
  tip?: number;
  deliveryFee?: number;
}

export interface Bill {
  subtotal: number;
  /** Manual + coupon/promotion discount, never more than the subtotal. */
  discountAmount: number;
  /** discountAmount as a percentage of the subtotal (0 when there is none). */
  discountPercent: number;
  /** Tax breakup after the discount. */
  taxAmount: number;
  loyaltyDiscountAmount: number;
  tipAmount: number;
  deliveryFee: number;
  /** What the guest owes: subtotal - discounts - loyalty + tip + delivery. */
  totalDue: number;
}

export function computeBill(input: BillInput): Bill {
  const totals = computeOrderTotals(
    input.lines,
    input.discountPercent ?? 0,
    (input.discountFlat ?? 0) + (input.autoDiscount ?? 0),
  );
  const loyaltyDiscountAmount = round2(
    Math.min(
      Math.max(input.loyaltyDiscountRequested ?? 0, 0),
      totals.totalAmount,
    ),
  );
  const tipAmount = Math.max(0, round2(input.tip ?? 0));
  const deliveryFee = Math.max(0, round2(input.deliveryFee ?? 0));
  const taxAmount =
    totals.subtotal > 0
      ? round2(
          (totals.taxAmount * (totals.subtotal - totals.discountAmount)) /
            totals.subtotal,
        )
      : 0;
  return {
    subtotal: totals.subtotal,
    discountAmount: totals.discountAmount,
    discountPercent: discountPercentOf(totals.subtotal, totals.discountAmount),
    taxAmount,
    loyaltyDiscountAmount,
    tipAmount,
    deliveryFee,
    totalDue: round2(
      totals.totalAmount - loyaltyDiscountAmount + tipAmount + deliveryFee,
    ),
  };
}

/** The percentage equivalent of a currency discount, to 2 decimals. */
export function discountPercentOf(
  subtotal: number,
  discountAmount: number,
): number {
  if (subtotal <= 0 || discountAmount <= 0) return 0;
  return round2((discountAmount / subtotal) * 100);
}

/** How the manual discount was entered, for the audit trail and the bill. */
export function manualDiscountEntry(
  percent: number,
  flat: number,
): { type: 'PERCENT' | 'FIXED'; value: number } | null {
  if (percent > 0) return { type: 'PERCENT', value: round2(percent) };
  if (flat > 0) return { type: 'FIXED', value: round2(flat) };
  return null;
}

export interface PaymentLineInput {
  method: string;
  /** Applied to the bill. */
  amount: number;
  /** Cash handed over, if more than `amount`. */
  tendered?: number;
  reference?: string;
}

export interface SettledPayment {
  method: string;
  amount: number;
  tendered: number | null;
  changeGiven: number | null;
  reference?: string;
}

export interface Settlement {
  payments: SettledPayment[];
  /** Applied by these payments, including any gift card. */
  paidNow: number;
  /** Still owed after these payments. */
  balanceAfter: number;
  /** Change to hand back across the cash lines. */
  changeDue: number;
  fullyPaid: boolean;
}

/**
 * Validates and normalises a set of payments against what is still owed.
 *
 * `amount` on a stored payment is what was applied to the bill, so revenue and
 * the till stay right. Handing over more cash than due is recorded as
 * `tendered` with the difference as `changeGiven`. For older clients that
 * simply send an `amount` above the balance, the excess is treated as change
 * on the cash lines (last first); an excess no cash line can absorb is an
 * error, never a silent overpayment.
 */
export function settlePayments(args: {
  balance: number;
  payments: PaymentLineInput[];
  /** Already applied from a gift card in this same settlement. */
  giftCardApplied?: number;
  allowPartial?: boolean;
}): Settlement {
  const balance = round2(args.balance);
  const giftCardApplied = round2(args.giftCardApplied ?? 0);

  const lines: SettledPayment[] = args.payments.map((p) => {
    const amount = round2(p.amount);
    if (!(amount > 0)) {
      throw new BadRequestException('Each payment must be more than zero');
    }
    if (p.tendered !== undefined) {
      if (p.method !== 'CASH') {
        throw new BadRequestException(
          'Only a cash payment can have an amount received',
        );
      }
      const tendered = round2(p.tendered);
      if (tendered < amount) {
        throw new BadRequestException(
          'The amount received cannot be less than the payment',
        );
      }
      return {
        method: p.method,
        amount,
        tendered,
        changeGiven: round2(tendered - amount),
        reference: p.reference,
      };
    }
    return {
      method: p.method,
      amount,
      tendered: null,
      changeGiven: null,
      reference: p.reference,
    };
  });

  let excess = round2(
    lines.reduce((sum, l) => sum + l.amount, 0) + giftCardApplied - balance,
  );
  if (excess > 0) {
    for (let i = lines.length - 1; i >= 0 && excess > 0; i--) {
      const line = lines[i];
      if (line.method !== 'CASH') continue;
      const take = Math.min(excess, line.amount);
      const handedOver = line.tendered ?? line.amount;
      line.amount = round2(line.amount - take);
      line.tendered = handedOver;
      line.changeGiven = round2(handedOver - line.amount);
      excess = round2(excess - take);
    }
    if (excess > 0) {
      throw new BadRequestException(
        `Payments exceed the amount due (${balance}) - only cash can be over-tendered`,
      );
    }
  }

  const kept = lines.filter(
    (l) => l.amount > 0 || (l.tendered ?? 0) > 0 || (l.changeGiven ?? 0) > 0,
  );
  const paidNow = round2(
    kept.reduce((sum, l) => sum + l.amount, 0) + giftCardApplied,
  );
  const balanceAfter = round2(balance - paidNow);
  const fullyPaid = balanceAfter <= 0;

  if (!fullyPaid && !args.allowPartial) {
    throw new BadRequestException(
      `Payments (${paidNow}) do not cover the total due (${balance})`,
    );
  }
  if (!fullyPaid && paidNow <= 0) {
    throw new BadRequestException('Enter a payment to record');
  }

  return {
    payments: kept,
    paidNow,
    balanceAfter: Math.max(balanceAfter, 0),
    changeDue: round2(kept.reduce((sum, l) => sum + (l.changeGiven ?? 0), 0)),
    fullyPaid,
  };
}
