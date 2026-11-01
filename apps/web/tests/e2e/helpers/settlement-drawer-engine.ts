/**
 * Settlement, Payment & Cash Drawer Engine (Opaque-Box Helper)
 * Implements dynamic UPI QR generation, cash change calculation,
 * split tenders, cash drawer float, petty cash expenses, and daily Z-reports.
 */

import { buildUpiUri } from "../../../lib/upi.ts";

export type PaymentMethod = "CASH" | "UPI" | "CARD" | "WALLET";

export interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
  tendered?: number;
  reference?: string;
  changeGiven?: number;
}

export interface CashExpense {
  id: string;
  category: string;
  amount: number;
  note?: string;
  createdAt: Date;
}

export class SettlementDrawerEngine {
  private openingFloat = 0;
  private isDrawerOpen = false;
  private expenses: CashExpense[] = [];
  private completedPayments: Array<PaymentEntry & { orderId: string; timestamp: Date }> = [];
  private refunds: Array<{ amount: number; method: PaymentMethod; timestamp: Date }> = [];

  openDrawer(floatAmount: number): { success: boolean; openingFloat: number } {
    if (floatAmount < 0) throw new Error("Opening float cannot be negative");
    this.openingFloat = Math.round((floatAmount + Number.EPSILON) * 100) / 100;
    this.isDrawerOpen = true;
    return { success: true, openingFloat: this.openingFloat };
  }

  isTillOpen(): boolean {
    return this.isDrawerOpen;
  }

  recordExpense(category: string, amount: number, note?: string): CashExpense {
    if (!this.isDrawerOpen) throw new Error("Cash drawer must be opened before recording expenses");
    if (amount <= 0) throw new Error("Expense amount must be positive");

    const expense: CashExpense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category,
      amount: Math.round((amount + Number.EPSILON) * 100) / 100,
      note,
      createdAt: new Date(),
    };
    this.expenses.push(expense);
    return expense;
  }

  generateUpiQr(opts: {
    vpa: string;
    payeeName: string;
    amount: number;
    orderNumber: string;
  }): { uri: string; isValid: boolean } {
    if (!opts.vpa.includes("@")) throw new Error("Invalid UPI VPA");
    if (opts.amount <= 0) throw new Error("UPI payment amount must be positive");

    const uri = buildUpiUri({
      vpa: opts.vpa,
      name: opts.payeeName,
      amount: opts.amount,
      note: `Bill #${opts.orderNumber}`,
      ref: `ORD-${opts.orderNumber}`,
    });

    return {
      uri,
      isValid: uri.startsWith("upi://pay?") && uri.includes(`am=${opts.amount.toFixed(2)}`),
    };
  }

  settleOrder(params: {
    orderId: string;
    totalAmount: number;
    payments: PaymentEntry[];
    allowPartial?: boolean;
  }): {
    fullyPaid: boolean;
    totalPaid: number;
    balanceRemaining: number;
    totalChange: number;
    recordedPayments: PaymentEntry[];
  } {
    if (params.totalAmount <= 0) throw new Error("Order total must be greater than zero");
    if (params.payments.length === 0) throw new Error("At least one payment entry is required");

    let totalApplied = 0;
    let totalChange = 0;
    const recorded: PaymentEntry[] = [];

    for (const p of params.payments) {
      if (p.amount <= 0) throw new Error("Payment amount must be positive");

      let change = 0;
      if (p.method === "CASH") {
        if (p.tendered !== undefined) {
          if (p.tendered < p.amount) {
            throw new Error(`Cash tendered (${p.tendered}) cannot be less than applied amount (${p.amount})`);
          }
          change = Math.round((p.tendered - p.amount + Number.EPSILON) * 100) / 100;
        }
      } else {
        if (p.tendered !== undefined && p.tendered !== p.amount) {
          throw new Error(`Tendered amount is only applicable to CASH, not ${p.method}`);
        }
      }

      totalApplied += p.amount;
      totalChange += change;
      const entry: PaymentEntry = {
        ...p,
        changeGiven: change,
      };
      recorded.push(entry);
      this.completedPayments.push({
        ...entry,
        orderId: params.orderId,
        timestamp: new Date(),
      });
    }

    totalApplied = Math.round((totalApplied + Number.EPSILON) * 100) / 100;
    if (totalApplied > params.totalAmount) {
      throw new Error(`Payments (${totalApplied}) exceed total amount (${params.totalAmount})`);
    }
    const balanceRemaining = Math.max(0, Math.round((params.totalAmount - totalApplied + Number.EPSILON) * 100) / 100);

    if (balanceRemaining > 0 && !params.allowPartial) {
      throw new Error(`Payments (${totalApplied}) do not cover total amount (${params.totalAmount})`);
    }

    return {
      fullyPaid: balanceRemaining === 0,
      totalPaid: totalApplied,
      balanceRemaining,
      totalChange,
      recordedPayments: recorded,
    };
  }

  recordRefund(amount: number, method: PaymentMethod): void {
    if (amount <= 0) throw new Error("Refund amount must be positive");
    this.refunds.push({
      amount: Math.round((amount + Number.EPSILON) * 100) / 100,
      method,
      timestamp: new Date(),
    });
  }

  generateDailyZReport(countedCash: number, businessDate?: string): {
    businessDate: string;
    openingFloat: number;
    cashSales: number;
    upiSales: number;
    cardSales: number;
    walletSales: number;
    totalSales: number;
    cashExpenses: number;
    cashRefunds: number;
    expectedCash: number;
    countedCash: number;
    cashVariance: number;
    tenderBreakup: Record<PaymentMethod, number>;
  } {
    if (!this.isDrawerOpen) throw new Error("Cash drawer is not open");
    if (countedCash < 0) throw new Error("Counted cash cannot be negative");

    let cashSales = 0;
    let upiSales = 0;
    let cardSales = 0;
    let walletSales = 0;

    for (const p of this.completedPayments) {
      if (p.method === "CASH") cashSales += p.amount;
      else if (p.method === "UPI") upiSales += p.amount;
      else if (p.method === "CARD") cardSales += p.amount;
      else if (p.method === "WALLET") walletSales += p.amount;
    }

    const cashExpenses = this.expenses.reduce((s, e) => s + e.amount, 0);
    const cashRefunds = this.refunds
      .filter((r) => r.method === "CASH")
      .reduce((s, r) => s + r.amount, 0);

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    cashSales = round2(cashSales);
    upiSales = round2(upiSales);
    cardSales = round2(cardSales);
    walletSales = round2(walletSales);
    const totalSales = round2(cashSales + upiSales + cardSales + walletSales);

    // Expected cash in drawer = openingFloat + cashSales - cashExpenses - cashRefunds
    const expectedCash = round2(this.openingFloat + cashSales - cashExpenses - cashRefunds);
    const cashVariance = round2(countedCash - expectedCash);

    return {
      businessDate: businessDate ?? new Date().toISOString().slice(0, 10),
      openingFloat: this.openingFloat,
      cashSales,
      upiSales,
      cardSales,
      walletSales,
      totalSales,
      cashExpenses: round2(cashExpenses),
      cashRefunds: round2(cashRefunds),
      expectedCash,
      countedCash: round2(countedCash),
      cashVariance,
      tenderBreakup: {
        CASH: cashSales,
        UPI: upiSales,
        CARD: cardSales,
        WALLET: walletSales,
      },
    };
  }

  closeDrawer(): void {
    this.isDrawerOpen = false;
  }
}
