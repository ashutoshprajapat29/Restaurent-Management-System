"use client";

import { ApiError } from "@/lib/api";
import { Flame, Globe, Printer, Star, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusNote, useNoteToast } from "@/components/ui/status-note";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactDetailsDialog } from "@/components/contact-details-dialog";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import {
  NEXT_STATUS,
  useRejectKot,
  useReprintKot,
  useSetKotPriority,
  useUpdateKotStatus,
  type KotTicket,
} from "@/hooks/use-kds";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Accept",
  ACCEPTED: "Start preparing",
  PREPARING: "Mark ready",
  READY: "Mark served",
};

const REJECT_REASONS = ["Out of stock", "Item unavailable", "Kitchen too busy", "Equipment problem"];

// A ticket this young is new enough to draw the eye (and it stops on its own).
const FRESH_MINUTES = 2;

function useElapsedMinutes(createdAt: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const compute = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)));
    compute();
    const id = setInterval(compute, 30_000);
    return () => clearInterval(id);
  }, [createdAt]);
  return elapsed;
}

function customerDisplayName(order: KotTicket["order"]) {
  return order.customer?.name || order.guestName || null;
}

function customerPhone(order: KotTicket["order"]) {
  return order.customer?.phone || null;
}

export function TicketCard({ ticket, branchId }: { ticket: KotTicket; branchId: string | null }) {
  const elapsed = useElapsedMinutes(ticket.createdAt);
  const updateStatus = useUpdateKotStatus(branchId);
  const setPriority = useSetKotPriority(branchId);
  const reprint = useReprintKot(branchId);
  const { note, clear: clearNote, toast } = useNoteToast();
  const nextStatus = NEXT_STATUS[ticket.status];
  const isLate = elapsed >= 15;
  const isFresh = ticket.status === "NEW" && elapsed < FRESH_MINUTES;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const reject = useRejectKot(branchId);
  const { data: me } = useCurrentUser();
  // Rejecting before cooking starts is for anyone on the kitchen screen; food
  // already on the stove is a manager's call (the server enforces the same).
  const started = ticket.status === "PREPARING";
  const canReject =
    (ticket.status === "NEW" || ticket.status === "ACCEPTED" || started) &&
    (!started || hasPermission(me?.user, "orders.cancel"));

  return (
    <Card
      data-testid={`kds-ticket-${ticket.id}`}
      className={cn(
        "flex shrink-0 flex-col gap-3 p-4",
        (isLate || ticket.isPriority) && "border-warning/50 ring-1 ring-warning/30",
        isFresh && "border-primary ring-2 ring-primary/40 motion-safe:animate-pulse",
      )}
    >
      <StatusNote note={note} onClear={clearNote} />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ticket for order #${ticket.order.orderNumber}?`}
        description={
          ticket.order.table
            ? `Table ${ticket.order.table.number} will be told the kitchen cannot make this. The ticket stays on record with your name and reason.`
            : "The guest will be told the kitchen cannot make this. The ticket stays on record with your name and reason."
        }
        warning={started ? "This ticket is already being prepared. Rejecting it means the food in progress is wasted." : undefined}
        reasons={REJECT_REASONS}
        confirmLabel="Reject ticket"
        keepLabel="Keep ticket"
        onSubmit={(reason) =>
          reject.mutateAsync({ id: ticket.id, reason, confirmStarted: started ? true : undefined })
        }
      />
      <ContactDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title={`Order #${ticket.order.orderNumber}`}
        name={customerDisplayName(ticket.order)}
        subtitle={ticket.order.table ? `Table ${ticket.order.table.number}` : ticket.order.type}
        phone={customerPhone(ticket.order)}
        waMessage={`Hi ${customerDisplayName(ticket.order) ?? ""}, this is regarding your order #${ticket.order.orderNumber}.`}
      />
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className="flex items-center justify-between rounded-md text-left transition hover:opacity-80"
        title="View customer details"
      >
        <div>
          <p
            data-testid={`kds-ticket-ordernum-${ticket.id}`}
            className="flex items-center gap-1.5 text-sm font-semibold text-foreground"
          >
            #{ticket.order.orderNumber}
            {ticket.isPriority && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
            {ticket.order.channel === "ONLINE" && (
              <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-label="Online order" />
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {ticket.order.table ? `Table ${ticket.order.table.number}` : ticket.order.type}
            {ticket.station && ` · ${ticket.station.name}`}
            {customerDisplayName(ticket.order) && ` · ${customerDisplayName(ticket.order)}`}
          </p>
          <span
            data-testid={`kds-ticket-waiter-${ticket.id}`}
            className="mt-1 inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground"
          >
            Waiter: {ticket.order.createdBy?.name || "Staff"}
          </span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium tabular-nums",
            isLate ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground",
          )}
        >
          <Timer className="h-3 w-3" />
          {elapsed}m
        </div>
      </button>

      {ticket.order.notes && (
        <p className="flex items-start gap-1 rounded-lg bg-warning/10 px-2 py-1.5 text-xs text-warning">
          <Flame className="mt-0.5 h-3 w-3 shrink-0" /> {ticket.order.notes}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {ticket.items.map((item) => (
          <div key={item.id} className="text-sm">
            <p className="font-medium text-foreground">
              {item.orderItem.quantity}× {item.orderItem.nameSnapshot}
            </p>
            {item.orderItem.modifiers.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {item.orderItem.modifiers.map((m) => m.nameSnapshot).join(", ")}
              </p>
            )}
            {item.orderItem.kitchenNote && (
              <p className="flex items-center gap-1 text-xs text-warning">
                <Flame className="h-3 w-3" /> {item.orderItem.kitchenNote}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {nextStatus && (
          <Button
            className="h-12 flex-1 text-base"
            disabled={updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate(
                { id: ticket.id, status: nextStatus },
                {
                  onError: (err) =>
                    toast.error(
                      err instanceof ApiError
                        ? err.message
                        : "Could not update the ticket. Check the connection and try again.",
                    ),
                },
              )
            }
          >
            {updateStatus.isPending ? "Updating…" : STATUS_LABEL[ticket.status]}
          </Button>
        )}
        {canReject && (
          <Button
            variant="destructive"
            className="h-12 shrink-0 px-4"
            onClick={() => setRejectOpen(true)}
            aria-label={`Reject ticket for order ${ticket.order.orderNumber}`}
          >
            <X className="h-5 w-5" aria-hidden />
            Reject
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 shrink-0"
          title={ticket.isPriority ? "Unmark priority" : "Mark priority"}
          aria-label={ticket.isPriority ? "Unmark priority" : "Mark priority"}
          disabled={setPriority.isPending}
          onClick={() =>
            setPriority.mutate({ id: ticket.id, isPriority: !ticket.isPriority })
          }
        >
          <Star className={cn("h-5 w-5", ticket.isPriority && "fill-warning text-warning")} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 shrink-0"
          title={ticket.printedCount > 0 ? "Reprint ticket (marked REPRINT)" : "Print ticket"}
          aria-label={ticket.printedCount > 0 ? "Reprint ticket" : "Print ticket"}
          disabled={reprint.isPending}
          onClick={() =>
            reprint.mutate(
              { id: ticket.id, reprint: ticket.printedCount > 0 },
              {
                onSuccess: () =>
                  toast.success(
                    ticket.printedCount > 0 ? "Reprint sent to the kitchen printer" : "Ticket sent to the kitchen printer",
                  ),
                onError: (err) =>
                  toast.error(err instanceof ApiError ? err.message : "Could not print the ticket"),
              },
            )
          }
        >
          <Printer className="h-5 w-5" />
        </Button>
      </div>
    </Card>
  );
}
