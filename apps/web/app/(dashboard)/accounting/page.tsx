"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAccountingActions,
  useBranchOverview,
  useClosingPreview,
  useClosings,
  useExpenses,
  useGst,
  useProfitLoss,
} from "@/hooks/use-accounting";
import { useBranch } from "@/hooks/use-branch";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BalanceSheetTab, BankTab, BudgetsTab } from "@/components/accounting/finance-tabs";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");
const TABS = ["expenses", "cash close", "profit & loss", "balance sheet", "budgets", "bank", "gst", "branches"] as const;
type Tab = (typeof TABS)[number];

function monthRange() {
  const now = new Date();
  return {
    from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
    to: iso(now),
  };
}

function RangePicker({
  range,
  onChange,
}: {
  range: { from: string; to: string };
  onChange: (r: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input type="date" className="w-40" value={range.from} onChange={(e) => onChange({ ...range, from: e.target.value })} />
      <Input type="date" className="w-40" value={range.to} onChange={(e) => onChange({ ...range, to: e.target.value })} />
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between py-1.5 text-sm", strong && "border-t border-border font-semibold")}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Expenses({ branchId }: { branchId: string | null }) {
  const [range, setRange] = useState(monthRange);
  const { data, isLoading } = useExpenses(branchId, range.from, range.to);
  const { addExpense, deleteExpense } = useAccountingActions(branchId);
  const [f, setF] = useState({ spentOn: iso(new Date()), category: "", amount: "", note: "", paidFromCash: false });
  const total = data?.reduce((s, e) => s + Number(e.amount), 0) ?? 0;

  const submit = () => {
    const amount = Number(f.amount);
    if (!f.category.trim() || !(amount > 0)) return toast.error("Enter a category and an amount");
    addExpense.mutate(
      { spentOn: f.spentOn, category: f.category.trim(), amount, note: f.note || undefined, paidFromCash: f.paidFromCash },
      {
        onSuccess: () => {
          toast.success("Expense added");
          setF({ ...f, category: "", amount: "", note: "" });
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Input type="date" value={f.spentOn} onChange={(e) => setF({ ...f, spentOn: e.target.value })} />
        <Input placeholder="Category (Rent, Supplies…)" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        <Input placeholder="Amount" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Input placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.paidFromCash} onChange={(e) => setF({ ...f, paidFromCash: e.target.checked })} />
          Paid from till
        </label>
        <div className="sm:col-span-2 lg:col-span-5">
          <Button onClick={submit} disabled={addExpense.isPending}>Add expense</Button>
        </div>
      </Card>
      <RangePicker range={range} onChange={setRange} />
      <Card className="flex flex-col divide-y divide-border p-2">
        {isLoading ? (
          <Skeleton className="m-4 h-12" />
        ) : data && data.length > 0 ? (
          <>
            {data.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium text-foreground">{e.category}</span>
                  <span className="text-muted-foreground"> · {e.spentOn.slice(0, 10)}{e.note && ` · ${e.note}`}{e.paidFromCash && " · till"}</span>
                </span>
                <span className="flex items-center gap-3">
                  {formatCurrency(e.amount)}
                  <Button size="sm" variant="outline" className="min-h-[44px] min-w-[64px]" onClick={() => deleteExpense.mutate(e.id, { onError: (err) => toast.error(errMsg(err)) })}>
                    Delete
                  </Button>
                </span>
              </div>
            ))}
            <div className="flex justify-between px-4 py-2.5 text-sm font-semibold">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </>
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">No expenses in this range.</p>
        )}
      </Card>
    </div>
  );
}

function CashClose({ branchId }: { branchId: string | null }) {
  const [date, setDate] = useState(() => iso(new Date()));
  const [floor, setFloor] = useState("0");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const { data: preview } = useClosingPreview(branchId, date, Number(floor) || 0);
  const { data: closings } = useClosings(branchId);
  const { closeDay } = useAccountingActions(branchId);
  const variance = preview && counted !== "" ? Number(counted) - preview.expectedCash : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-3">
          <Input type="date" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input className="w-40" inputMode="decimal" placeholder="Opening float" value={floor} onChange={(e) => setFloor(e.target.value)} />
        </div>
        {preview && (
          <div className="flex flex-col gap-3">
            <div>
              <Row label="Opening float" value={formatCurrency(preview.openingFloat)} />
              <Row label="Cash sales (net of cash refunds)" value={formatCurrency(preview.cashSales)} />
              <Row label="Cash expenses" value={`− ${formatCurrency(preview.cashExpenses)}`} />
              <Row strong label="Expected in till" value={formatCurrency(preview.expectedCash)} />
            </div>

            {preview.tenderTotals && Object.keys(preview.tenderTotals).length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Sales by Payment Tender (Z-Report)
                </p>
                {Object.entries(preview.tenderTotals).map(([method, amount]) => (
                  <Row key={method} label={method} value={formatCurrency(amount)} />
                ))}
                {preview.totalSales !== undefined && (
                  <Row strong label="Gross Total Sales" value={formatCurrency(preview.totalSales)} />
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Input className="w-40" inputMode="decimal" placeholder="Counted cash" value={counted} onChange={(e) => setCounted(e.target.value)} />
          {variance != null && (
            <span className={cn("text-sm", variance === 0 ? "text-emerald-700 font-medium dark:text-emerald-400" : "text-destructive")}>
              {variance === 0 ? "Balanced" : `${variance > 0 ? "Over" : "Short"} by ${formatCurrency(Math.abs(variance))}`}
            </span>
          )}
        </div>
        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex items-center gap-3">
          <Button
            className="min-h-[44px]"
            disabled={counted === "" || closeDay.isPending}
            onClick={() =>
              closeDay.mutate(
                { businessDate: date, openingFloat: Number(floor) || 0, countedCash: Number(counted), note: note || undefined },
                { onSuccess: () => { toast.success("Day closed"); setCounted(""); setNote(""); }, onError: (e) => toast.error(errMsg(e)) },
              )
            }
          >
            Close day
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px]"
            onClick={() => window.print()}
          >
            Print Z-Report
          </Button>
        </div>
      </Card>
      <Card className="flex flex-col divide-y divide-border p-2">
        {closings && closings.length > 0 ? (
          closings.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>{c.businessDate.slice(0, 10)}</span>
              <span className="text-muted-foreground">
                expected {formatCurrency(c.expectedCash)} · counted {formatCurrency(c.countedCash)} · variance {formatCurrency(c.variance)}
              </span>
            </div>
          ))
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">No closed days yet.</p>
        )}
      </Card>
    </div>
  );
}

function ProfitLossTab({ branchId }: { branchId: string | null }) {
  const [range, setRange] = useState(monthRange);
  const { data } = useProfitLoss(branchId, range.from, range.to);
  return (
    <div className="flex flex-col gap-4">
      <RangePicker range={range} onChange={setRange} />
      <Card className="p-4">
        {data ? (
          <div>
            <Row label={`Collected from ${data.orders} paid orders (excl. tips)`} value={formatCurrency(data.grossCollected)} />
            <Row label="Tax collected" value={`− ${formatCurrency(data.taxCollected)}`} />
            <Row label="Refunds" value={`− ${formatCurrency(data.refunds)}`} />
            <Row strong label="Net sales" value={formatCurrency(data.netSales)} />
            {data.expenses.map((e) => (
              <Row key={e.category} label={e.category} value={`− ${formatCurrency(e.amount)}`} />
            ))}
            <Row label="Payroll (finalized runs)" value={`− ${formatCurrency(data.payrollCost)}`} />
            <Row strong label="Net profit" value={formatCurrency(data.netProfit)} />
          </div>
        ) : (
          <Skeleton className="h-32" />
        )}
      </Card>
    </div>
  );
}

function GstTab({ branchId }: { branchId: string | null }) {
  const [range, setRange] = useState(monthRange);
  const { data } = useGst(branchId, range.from, range.to);
  return (
    <div className="flex flex-col gap-4">
      <RangePicker range={range} onChange={setRange} />
      <Card className="overflow-x-auto p-4">
        {data ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1">Rate</th><th>Taxable value</th><th>Tax</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.ratePercent} className="border-t border-border">
                  <td className="py-1.5">{r.ratePercent}%</td>
                  <td>{formatCurrency(r.taxableValue)}</td>
                  <td>{formatCurrency(r.tax)}</td>
                  <td className="text-right">{formatCurrency(r.total)}</td>
                </tr>
              ))}
              <tr className="border-t border-border font-semibold">
                <td className="py-1.5">Total</td>
                <td>{formatCurrency(data.totalTaxable)}</td>
                <td>{formatCurrency(data.totalTax)}</td>
                <td className="text-right">{formatCurrency(data.totalTaxable + data.totalTax)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <Skeleton className="h-24" />
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Based on paid orders in the range, with each bill&rsquo;s discounts applied pro-rata. Use it as a working
          summary; have your accountant confirm filings.
        </p>
      </Card>
    </div>
  );
}

function BranchesTab() {
  const [range, setRange] = useState(monthRange);
  const { data } = useBranchOverview(range.from, range.to);
  return (
    <div className="flex flex-col gap-4">
      <RangePicker range={range} onChange={setRange} />
      <Card className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr><th className="py-1">Branch</th><th>Orders</th><th>Sales</th><th>Open</th><th>Low stock</th><th className="text-right">Inventory value</th></tr>
          </thead>
          <tbody>
            {data?.map((b) => (
              <tr key={b.branchId} className="border-t border-border">
                <td className="py-1.5">{b.name}</td>
                <td>{b.orders}</td>
                <td>{formatCurrency(b.sales)}</td>
                <td>{b.openOrders}</td>
                <td>{b.lowStockItems}</td>
                <td className="text-right">{formatCurrency(b.inventoryValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function AccountingPage() {
  const { branchId } = useBranch();
  const [tab, setTab] = useState<Tab>("expenses");
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Accounting</h1>
        <p className="text-sm text-muted-foreground">Expenses, cash close, profit &amp; loss, balance sheet, budgets, bank reconciliation, tax and branches</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3.5 py-1 text-xs capitalize transition-colors",
              tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "expenses" && <Expenses branchId={branchId} />}
      {tab === "cash close" && <CashClose branchId={branchId} />}
      {tab === "profit & loss" && <ProfitLossTab branchId={branchId} />}
      {tab === "balance sheet" && <BalanceSheetTab branchId={branchId} />}
      {tab === "budgets" && <BudgetsTab branchId={branchId} />}
      {tab === "bank" && <BankTab branchId={branchId} />}
      {tab === "gst" && <GstTab branchId={branchId} />}
      {tab === "branches" && <BranchesTab />}
    </div>
  );
}
