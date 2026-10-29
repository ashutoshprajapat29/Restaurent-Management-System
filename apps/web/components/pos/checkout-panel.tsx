"use client";

import { kitchenProgress, type PaymentMethodDto } from "@nodedr-restaurant/types";
import { ArrowLeft, CheckCircle2, ChefHat, Pencil, Printer } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StatusNote, useNoteToast } from "@/components/ui/status-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryError } from "@/components/ui/query-error";
import { PaymentMethodButtons } from "@/components/pos/payment-method-buttons";
import { CustomerPicker } from "@/components/pos/customer-picker";
import type { Customer } from "@/hooks/use-customers";
import { lookupGiftCard } from "@/hooks/use-gift-cards";
import { CancelOrderDialog, useCanCancelOrders } from "@/components/orders/cancel-order-dialog";
import { EditBillDialog } from "@/components/orders/edit-bill-dialog";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import {
  useBillPreview,
  useCheckoutOrder,
  useOrder,
  type BillPreview,
  type CheckoutResult,
  type CreatedOrder,
} from "@/hooks/use-orders";
import { usePrintKot, usePrintOrderUsb, type PrintJobResult } from "@/hooks/use-print";
import { useSettings } from "@/hooks/use-settings";
import { api, ApiError } from "@/lib/api";
import { discountSummary, parseMoney, planPayment } from "@/lib/bill";
import { formatCurrency } from "@/lib/format";
import { publishDisplay } from "@/lib/customer-display";
import { playPaymentReceived } from "@/lib/celebrate";
import { buildUpiUri } from "@/lib/upi";
import { QRCodeSVG } from "qrcode.react";
import { openKotPrint, openReceiptPrint } from "@/lib/print";
import { round2 } from "@/lib/pricing-preview";

const METHODS: PaymentMethodDto[] = ["CASH", "CARD", "UPI", "OTHER"];

const KITCHEN_LABEL: Record<string, string> = {
  NEW: "Waiting for the kitchen",
  ACCEPTED: "Kitchen accepted",
  PREPARING: "Being prepared",
  READY: "Ready to serve",
  SERVED: "Served",
};

/** Re-evaluates a value after the user has stopped changing it for `ms`. */
function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function CheckoutPanel({
  order: orderSnapshot,
  branchId,
  initialCustomer = null,
  onDone,
}: {
  order: CreatedOrder;
  branchId: string | null;
  initialCustomer?: Customer | null;
  onDone: () => void;
}) {
  // The order passed in is a snapshot from when it was sent; the live copy
  // carries edits (removed lines, new totals), payments already taken, the
  // kitchen's progress, and a cancel/pay by someone else.
  const { data: live } = useOrder(branchId, orderSnapshot.id);
  const order: CreatedOrder = live
    ? {
        ...orderSnapshot,
        subtotal: live.subtotal,
        taxAmount: live.taxAmount,
        totalAmount: live.totalAmount,
        status: live.status,
      }
    : orderSnapshot;
  const [method, setMethod] = useState<PaymentMethodDto>("CASH");
  const [amountText, setAmountText] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [tipAmount, setTipAmount] = useState("0");
  const [pointsToRedeem, setPointsToRedeem] = useState("0");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [giftCardBalance, setGiftCardBalance] = useState<number | null>(null);
  const [checkingGiftCard, setCheckingGiftCard] = useState(false);
  const [splitCount, setSplitCount] = useState("1");
  const [customer, setCustomer] = useState<Customer | null>(initialCustomer);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const checkout = useCheckoutOrder(branchId);
  const { note, clear: clearNote, toast } = useNoteToast();
  const canCancelRole = useCanCancelOrders();
  const { data: me } = useCurrentUser();
  const canEditRole = hasPermission(me?.user, "orders.edit");
  const canDiscount = hasPermission(me?.user, "discounts.apply");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const printUsb = usePrintOrderUsb(branchId);
  const printKot = usePrintKot(branchId);
  const onPrinted = (r: PrintJobResult) =>
    r.unsupportedChars?.length
      ? toast.warning(`Sent, but ${r.unsupportedChars.join(" ")} cannot be printed by this printer's code page. Use browser print for the full text.`)
      : toast.success("Sent to the thermal printer");
  // First print sends only tickets not yet printed. If they already went out
  // (e.g. a double tap or retry) the server refuses to print a duplicate and we
  // offer an explicit, REPRINT-stamped copy instead.
  const printKotNow = (reprint: boolean) =>
    printKot.mutate(
      { orderId: order.id, reprint },
      {
        onSuccess: (r) => {
          onPrinted(r);
          if (reprint) toast.success("Reprint sent — marked REPRINT on paper");
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "ALREADY_PRINTED") {
            toast.info("The kitchen ticket was already printed", {
              action: { label: "Print a REPRINT", onClick: () => printKotNow(true) },
            });
            return;
          }
          toast.error(err instanceof ApiError ? err.message : "Could not print to the kitchen printer");
        },
      },
    );
  const [completed, setCompleted] = useState<CheckoutResult | null>(null);
  const { data: settings } = useSettings(branchId);
  const currency = settings?.restaurant.currency ?? "INR";
  const taxMode = settings?.branch.taxMode ?? "INCLUSIVE";
  const taxRegime = settings?.branch.taxRegime ?? "INDIA_GST";
  const taxLabel = settings?.branch.taxLabel ?? null;
  const money = (val: number | string) => formatCurrency(val, currency);

  // What the guest has typed in, as numbers. Once a payment has been taken the
  // server locks the figures, so these stop mattering (and are not sent).
  const adjustments = useMemo(
    () => ({
      discountPercent: Number(discountPercent) || 0,
      tipAmount: Number(tipAmount) || 0,
      loyaltyPointsToRedeem: Math.max(0, Math.floor(Number(pointsToRedeem) || 0)),
      couponCode: appliedCoupon || undefined,
    }),
    [discountPercent, tipAmount, pointsToRedeem, appliedCoupon],
  );
  const settled = useDebounced(adjustments);
  // Once any payment is on the bill the server fixes its figures and refuses
  // further adjustments, so none are sent from then on.
  const hasPayments = (live?.payments.length ?? 0) > 0;

  // The server prices the bill: this is the single source for the figures on
  // screen, on the printed bill, and at checkout.
  const billQuery = useBillPreview(
    branchId,
    order.id,
    hasPayments ? {} : settled,
    order.status === "OPEN",
  );
  const bill: BillPreview | undefined = billQuery.data;
  const locked = (bill?.locked ?? false) || hasPayments;
  const repricing = adjustments !== settled;

  // A coupon is checked when applied, so the bill above only ever sees a valid
  // code (or none) and never drops the happy-hour discount on an error.
  const applyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return setAppliedCoupon("");
    try {
      // Validate this code on its own before adopting it.
      await api.post(`/orders/${order.id}/bill-preview?branchId=${branchId}`, { couponCode: code });
      setAppliedCoupon(code);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not apply coupon");
    }
  };

  const balance = bill?.balanceDue ?? 0;
  const giftCardApplied = giftCardBalance !== null ? round2(Math.min(giftCardBalance, balance)) : 0;
  const remainingDue = round2(balance - giftCardApplied);
  const entered = parseMoney(amountText);
  const plan = planPayment({ remaining: remainingDue, entered, method });
  const split = Math.max(1, Math.floor(Number(splitCount) || 1));

  const checkGiftCard = async () => {
    if (!giftCardCode) return;
    setCheckingGiftCard(true);
    try {
      const card = await lookupGiftCard(branchId, giftCardCode);
      if (!card) {
        toast.error("No gift card found with that code");
        setGiftCardBalance(null);
        return;
      }
      setGiftCardBalance(Number(card.balance));
    } finally {
      setCheckingGiftCard(false);
    }
  };

  // What the QR asks the guest to pay: the amount being recorded now.
  const upiAmount = plan.valid ? plan.applied : remainingDue;
  const upiVpa = settings?.restaurant.upiVpa;
  const upiName = settings?.restaurant.upiPayeeName || settings?.restaurant.name;
  const upiUri =
    method !== "UPI" || !upiVpa || !(upiAmount > 0)
      ? null
      : buildUpiUri({
          vpa: upiVpa,
          name: upiName,
          amount: upiAmount,
          note: `Order ${order.id.slice(-6).toUpperCase()}`,
          ref: order.id,
        });

  // Mirror the QR to the customer-facing screen while UPI is selected, and
  // clear it again if the cashier switches method.
  useEffect(() => {
    if (completed) return;
    if (upiUri) {
      publishDisplay({ kind: "upi", total: upiAmount, uri: upiUri, payee: upiName || "" });
    }
  }, [upiUri, upiAmount, upiName, completed]);

  // One id per distinct attempt: a retry after a dropped connection (same
  // payload) reuses it, so the server records the payment once.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const requestIdFor = (payload: unknown) => {
    const key = JSON.stringify(payload);
    if (attempt.current?.key !== key) {
      attempt.current = { key, id: crypto.randomUUID() };
    }
    return attempt.current.id;
  };

  const handleCheckout = () => {
    if (!bill || repricing) return;
    const payments =
      plan.applied > 0
        ? [
            {
              method,
              amount: plan.applied,
              ...(plan.tendered ? { tendered: plan.tendered } : {}),
            },
          ]
        : [];
    const dto = {
      customerId: customer?.id,
      ...(locked ? {} : settled),
      giftCardCode: giftCardBalance !== null ? giftCardCode : undefined,
      payments,
      allowPartial: plan.partial || undefined,
    };
    checkout.mutate(
      { orderId: order.id, dto: { ...dto, requestId: requestIdFor(dto) } },
      {
        onSuccess: (result) => {
          attempt.current = null;
          setAmountText("");
          if (result.settlement.fullyPaid) {
            setCompleted(result);
            publishDisplay({ kind: "paid", total: Number(result.totalAmount), method });
            playPaymentReceived(money(result.totalAmount));
            toast.success("Payment recorded");
          } else {
            toast.success(
              `Part payment of ${money(result.settlement.amountPaid)} recorded — ${money(result.settlement.balanceDue)} still due`,
            );
          }
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Checkout failed"),
      },
    );
  };

  const printBill = () => branchId && openReceiptPrint(order.id, branchId, locked ? {} : settled);
  const printBillThermal = () =>
    printUsb.mutate(
      { orderId: order.id, adjustments: locked ? {} : settled },
      {
        onSuccess: onPrinted,
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not print to the thermal printer"),
      },
    );

  if (completed) {
    const { settlement } = completed;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <StatusNote note={note} onClear={clearNote} className="w-full text-left" />
        <CheckCircle2 className="h-10 w-10 text-success" />
        <p className="text-lg font-semibold text-foreground">
          Order #{order.orderNumber} paid
        </p>
        <p className="text-2xl font-semibold tabular-nums text-foreground">
          {money(completed.totalAmount)}
        </p>
        {settlement.changeDue > 0 && (
          <p className="rounded-lg bg-success/10 px-4 py-2 text-lg font-semibold tabular-nums text-success">
            Change due {money(settlement.changeDue)}
          </p>
        )}
        {Number(completed.loyaltyDiscountAmount) > 0 && (
          <p className="text-xs text-muted-foreground">
            {completed.loyaltyPointsRedeemed} points redeemed
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button
            variant="outline"
            className="h-11"
            onClick={() => branchId && openReceiptPrint(completed.id, branchId)}
          >
            Print receipt (browser)
          </Button>
          <Button
            variant="outline"
            className="h-11"
            disabled={printUsb.isPending}
            onClick={() =>
              printUsb.mutate({ orderId: completed.id, drawer: completed.payments?.some((p) => p.method === "CASH") }, {
                onSuccess: onPrinted,
                onError: (err) =>
                  toast.error(err instanceof ApiError ? err.message : "Could not print to the thermal printer"),
              })
            }
          >
            {printUsb.isPending ? "Printing…" : "Thermal receipt"}
          </Button>
          <Button className="h-11" onClick={onDone}>New order</Button>
        </div>
      </div>
    );
  }

  // Someone else (another terminal) already closed this bill.
  if (order.status === "CANCELLED" || (order.status === "PAID" && !completed)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <StatusNote note={note} onClear={clearNote} className="w-full text-left" />
        <p className="text-sm font-medium text-foreground">
          Order #{order.orderNumber} was {order.status === "CANCELLED" ? "cancelled" : "already paid"}
        </p>
        <p className="text-xs text-muted-foreground">
          {order.status === "CANCELLED"
            ? "The kitchen tickets were withdrawn and the table is free again. The order stays in History."
            : "Nothing more to do here."}
        </p>
        <Button className="h-11" onClick={onDone}>Done</Button>
      </div>
    );
  }

  const kitchen = live ? kitchenProgress(live.kots.map((k) => k.status)) : null;
  const paidSoFar = live?.payments ?? [];
  const partialLabel = `Record partial payment · ${money(plan.applied)}`;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto">
      <StatusNote note={note} onClear={clearNote} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 shrink-0 text-muted-foreground"
          onClick={onDone}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          {canEditRole && !locked && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Edit bill
            </Button>
          )}
          {canCancelRole && !locked && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Cancel order
            </Button>
          )}
        </div>
        <CancelOrderDialog
          branchId={branchId}
          orderId={order.id}
          orderNumber={order.orderNumber}
          open={cancelOpen}
          onOpenChange={setCancelOpen}
        />
        <EditBillDialog branchId={branchId} orderId={order.id} open={editOpen} onOpenChange={setEditOpen} />
      </div>

      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Order #{order.orderNumber} sent to kitchen</p>
            {kitchen && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <ChefHat className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                {KITCHEN_LABEL[kitchen]}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => branchId && openKotPrint(order.id, branchId)}
          >
            <Printer className="h-4 w-4" />
            KOT (browser)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={printKot.isPending}
            onClick={() => printKotNow(false)}
          >
            <Printer className="h-4 w-4" />
            {printKot.isPending ? "Printing…" : "KOT (thermal)"}
          </Button>
          </div>
        </div>
        {!locked && (
          <p className="mt-2 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            No need to pay right now — tap <span className="font-medium text-foreground">Back</span> to
            help another table and come bill this one later from here or the Tables page.
          </p>
        )}
      </div>

      {paidSoFar.length > 0 && (
        <div className="rounded-xl border border-border px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Payments so far</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-sm">
            {paidSoFar.map((p) => (
              <li key={p.id} className="flex justify-between tabular-nums">
                <span>{p.method}</span>
                <span>{money(p.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            Discount, tip and points are locked until this bill is settled.
          </p>
        </div>
      )}

      <CustomerPicker branchId={branchId} customer={customer} onSelect={setCustomer} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="discount">Discount %</Label>
          <Input
            id="discount"
            type="number"
            min="0"
            max="100"
            className="h-11"
            value={discountPercent}
            disabled={locked || !canDiscount}
            onChange={(e) => setDiscountPercent(e.target.value)}
          />
          {!canDiscount && (
            <p className="text-[11px] text-muted-foreground">Your role cannot apply discounts.</p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="tip">Tip</Label>
          <Input
            id="tip"
            type="number"
            min="0"
            className="h-11"
            value={tipAmount}
            disabled={locked}
            onChange={(e) => setTipAmount(e.target.value)}
          />
        </div>
      </div>

      {customer && customer.loyaltyPoints > 0 && !locked && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="points">Redeem loyalty points</Label>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() =>
                setPointsToRedeem(String(Math.min(customer.loyaltyPoints, Math.floor(bill?.totalDue ?? 0))))
              }
            >
              Max ({customer.loyaltyPoints} available)
            </button>
          </div>
          <Input
            id="points"
            type="number"
            min="0"
            max={customer.loyaltyPoints}
            className="h-11"
            value={pointsToRedeem}
            onChange={(e) => setPointsToRedeem(e.target.value)}
          />
        </div>
      )}

      {canDiscount && !locked && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="coupon">Coupon code (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="coupon"
              className="h-11"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value)}
              placeholder="e.g. SAVE10"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={!couponInput.trim() && !appliedCoupon}
              onClick={applyCoupon}
            >
              Apply
            </Button>
          </div>
        </div>
      )}

      {!locked && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="gift-card">Gift card code (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="gift-card"
              className="h-11"
              value={giftCardCode}
              onChange={(e) => {
                setGiftCardCode(e.target.value);
                setGiftCardBalance(null);
              }}
              placeholder="e.g. 8A7B629E8EEA"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={!giftCardCode || checkingGiftCard}
              onClick={checkGiftCard}
            >
              {checkingGiftCard ? "…" : "Check"}
            </Button>
          </div>
          {giftCardBalance !== null && (
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
              Balance {money(giftCardBalance)} — applying {money(giftCardApplied)}
            </p>
          )}
        </div>
      )}

      {billQuery.isError && !bill ? (
        <QueryError
          error={billQuery.error}
          what="the bill"
          onRetry={() => void billQuery.refetch()}
          retrying={billQuery.isFetching}
        />
      ) : (
        <>
          {remainingDue > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Payment method</Label>
              <PaymentMethodButtons methods={METHODS} value={method} onChange={setMethod} />
            </div>
          )}

          {remainingDue > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">{method === "CASH" ? "Cash received" : "Amount to pay now"}</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                className="h-12 text-lg tabular-nums"
                value={amountText}
                placeholder={String(remainingDue)}
                onChange={(e) => setAmountText(e.target.value)}
              />
              {plan.valid && plan.change > 0 && (
                <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-base font-semibold tabular-nums text-emerald-800 dark:text-emerald-300" role="status">
                  Change due {money(plan.change)}
                </p>
              )}
              {plan.valid && plan.partial && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-900 dark:text-amber-200" role="status">
                  Part payment — {money(plan.balanceAfter)} will stay due and the table stays open.
                </p>
              )}
              {plan.clamped && (
                <p className="text-xs text-muted-foreground" role="status">
                  {method} can only pay the balance ({money(remainingDue)}); only that will be charged.
                </p>
              )}
            </div>
          )}

          {method === "UPI" && remainingDue > 0 && (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-4">
              {upiUri ? (
                <>
                  <QRCodeSVG value={upiUri} size={176} level="M" marginSize={1} />
                  <p className="text-xs font-medium text-[#17251d]">
                    Scan with any UPI app · {money(upiAmount)} pre-filled
                  </p>
                  <p className="text-[11px] text-neutral-500">Also shown on the customer display</p>
                </>
              ) : (
                <p className="text-center text-xs text-neutral-600">
                  No UPI id set yet. <Link href="/settings" className="font-medium underline">Add your UPI id in Settings → Restaurant</Link> to show a payment QR here.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <Label htmlFor="split" className="text-xs text-muted-foreground">
              Split between
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="split"
                type="number"
                min="1"
                value={splitCount}
                onChange={(e) => setSplitCount(e.target.value)}
                className="h-8 w-16 text-center"
              />
              <span className="text-xs text-muted-foreground">guests</span>
            </div>
          </div>
          {split > 1 && bill && (
            <p className="-mt-2 text-center text-xs text-muted-foreground">
              {money(round2(balance / split))} each — enter each guest&apos;s share as a part
              payment, or collect separately and complete payment once for the whole table.
            </p>
          )}
        </>
      )}

      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
        <BillSummary
          bill={bill}
          giftCardApplied={giftCardApplied}
          pending={repricing || billQuery.isFetching}
          currency={currency}
          taxMode={taxMode}
          taxRegime={taxRegime}
          taxLabel={taxLabel}
        />

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={!bill}
            onClick={printBill}
            title="Prints the bill for the guest. Nothing is charged and the table stays open."
          >
            <Printer className="h-4 w-4" />
            Print bill
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={!bill || printUsb.isPending}
            onClick={printBillThermal}
            title="Prints the bill on the thermal printer. Nothing is charged and the cash drawer stays shut."
          >
            <Printer className="h-4 w-4" />
            {printUsb.isPending ? "Printing…" : "Print bill (thermal)"}
          </Button>
        </div>

        <Button
          className="h-12 text-base"
          disabled={checkout.isPending || !bill || repricing || !plan.valid}
          onClick={handleCheckout}
        >
          {checkout.isPending
            ? "Processing…"
            : plan.partial
              ? partialLabel
              : plan.change > 0
                ? `Complete payment · change ${money(plan.change)}`
                : "Complete payment"}
        </Button>
      </div>
    </div>
  );
}

// The settlement summary: every figure on the printed bill, in the same order.
function BillSummary({
  bill,
  giftCardApplied,
  pending,
  currency = "INR",
  taxMode = "INCLUSIVE",
  taxRegime = "INDIA_GST",
  taxLabel,
}: {
  bill: BillPreview | undefined;
  giftCardApplied: number;
  pending: boolean;
  currency?: string;
  taxMode?: string;
  taxRegime?: string;
  taxLabel?: string | null;
}) {
  if (!bill) {
    return <p className="text-sm text-muted-foreground">Pricing the bill…</p>;
  }
  const source = bill.couponCode
    ? `coupon ${bill.couponCode}`
    : bill.promotionName
      ? bill.promotionName
      : bill.discountType === "FIXED"
        ? "flat discount"
        : null;

  const isExclusive = taxMode === "EXCLUSIVE";
  const subtotalDisplay = isExclusive
    ? round2(bill.subtotal - bill.taxAmount)
    : bill.subtotal;

  const resolvedLabel = taxLabel?.trim() || (taxRegime === "INDIA_GST" ? "GST" : "Tax");
  const isIgst = taxRegime === "INDIA_GST" && taxLabel?.trim().toUpperCase() === "IGST";

  return (
    <div className={pending ? "opacity-70" : undefined} aria-busy={pending}>
      <dl className="flex flex-col gap-1 text-sm">
        <Row
          label={isExclusive ? "Subtotal (excl. tax)" : "Subtotal"}
          value={formatCurrency(subtotalDisplay, currency)}
        />
        {bill.discountAmount > 0 && (
          <Row
            label={`Discount${source ? ` (${source})` : ""}`}
            value={`− ${discountSummary(bill.discountPercent, bill.discountAmount, (v) => formatCurrency(v, currency))}`}
            accent
          />
        )}
        {isExclusive ? (
          <Row
            label={resolvedLabel}
            value={`+ ${formatCurrency(bill.taxAmount, currency)}`}
          />
        ) : taxRegime === "INDIA_GST" && !isIgst ? (
          <>
            <Row
              label="CGST (incl.)"
              value={formatCurrency(round2(bill.taxAmount / 2), currency)}
              muted
            />
            <Row
              label="SGST (incl.)"
              value={formatCurrency(round2(bill.taxAmount - round2(bill.taxAmount / 2)), currency)}
              muted
            />
          </>
        ) : (
          <Row
            label={`${resolvedLabel} (incl.)`}
            value={formatCurrency(bill.taxAmount, currency)}
            muted
          />
        )}
        {bill.loyaltyDiscountAmount > 0 && (
          <Row
            label={`Loyalty (${bill.loyaltyPointsRedeemed} pts)`}
            value={`− ${formatCurrency(bill.loyaltyDiscountAmount, currency)}`}
            accent
          />
        )}
        {bill.tipAmount > 0 && (
          <Row label="Tip" value={formatCurrency(bill.tipAmount, currency)} />
        )}
        {bill.deliveryFee > 0 && (
          <Row label="Delivery fee" value={formatCurrency(bill.deliveryFee, currency)} />
        )}
      </dl>
      <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
        <span className="text-sm font-medium text-foreground">Total due</span>
        <span className="text-lg font-semibold tabular-nums text-foreground">
          {formatCurrency(bill.totalDue, currency)}
        </span>
      </div>
      {bill.amountPaid > 0 && (
        <dl className="mt-1 flex flex-col gap-1 text-sm">
          <Row label="Paid so far" value={formatCurrency(bill.amountPaid, currency)} />
        </dl>
      )}
      {giftCardApplied > 0 && (
        <Row label="Gift card" value={`− ${formatCurrency(giftCardApplied, currency)}`} accent />
      )}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Balance due</span>
        <span className="text-base font-semibold tabular-nums text-foreground">
          {formatCurrency(Math.max(round2(bill.balanceDue - giftCardApplied), 0), currency)}
        </span>
      </div>
    </div>
  );
}

function Row({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={muted ? "text-xs text-muted-foreground" : "text-muted-foreground"}>{label}</dt>
      <dd className={`tabular-nums ${accent ? "text-success" : muted ? "text-xs text-muted-foreground" : "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}
