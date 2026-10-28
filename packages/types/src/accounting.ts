import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const expenseSchema = z.object({
  spentOn: isoDate,
  category: z.string().trim().min(1).max(60),
  amount: z.coerce.number().positive(),
  note: z.string().max(300).optional(),
  paidFromCash: z.boolean().default(false),
});
export type ExpenseDto = z.infer<typeof expenseSchema>;

export const cashClosingSchema = z.object({
  businessDate: isoDate,
  openingFloat: z.coerce.number().min(0).default(0),
  countedCash: z.coerce.number().min(0),
  note: z.string().max(300).optional(),
});
export type CashClosingDto = z.infer<typeof cashClosingSchema>;

export interface CashClosingSummary {
  businessDate: string;
  openingFloat: number;
  cashSales: number;
  cashExpenses: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  tenderTotals: Record<string, number>;
  totalSales?: number;
}
