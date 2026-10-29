"use client";

import { ArrowRightLeft, Users } from "lucide-react";
import { toast } from "sonner";
import { TableShapeIcon } from "@/components/tables/table-shape-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOpenOrdersForTable, useTransferOrder } from "@/hooks/use-orders";
import type { RestaurantTable } from "@/hooks/use-tables";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export function TransferTableDialog({
  branchId,
  table,
  allTables,
  open,
  onOpenChange,
}: {
  branchId: string | null;
  table: RestaurantTable;
  allTables: RestaurantTable[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: orders, isLoading: loadingOrder } = useOpenOrdersForTable(
    branchId,
    open ? table.id : null,
  );
  const thisOrder = orders?.[0];
  const transfer = useTransferOrder(branchId);

  const availableTables = allTables.filter(
    (t) => t.id !== table.id && t.status === "AVAILABLE",
  );

  const handleTransfer = (targetTable: RestaurantTable) => {
    transfer.mutate(
      {
        orderId: thisOrder?.id,
        sourceTableId: table.id,
        targetTableId: targetTable.id,
      },
      {
        onSuccess: () => {
          toast.success(
            `Order transferred to ${targetTable.name ?? `Table ${targetTable.number}`}`,
          );
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError
              ? err.message
              : "Could not transfer order to target table",
          ),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Transfer {table.name ?? `Table ${table.number}`}
          </DialogTitle>
          <DialogDescription>
            Move the active order, bill, and seated guests to another vacant table.
          </DialogDescription>
        </DialogHeader>

        {loadingOrder ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Loading active order details...
          </p>
        ) : !thisOrder ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            This table has no active order to transfer.
          </p>
        ) : availableTables.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm font-medium text-foreground">No vacant tables</p>
            <p className="mt-1 text-xs text-muted-foreground">
              All other tables are currently occupied, billed, or out of service.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 py-2">
            <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs">
              <span className="font-semibold text-foreground">
                Order #{thisOrder.orderNumber}
              </span>
              <span className="mx-2 text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                Total: {formatCurrency(thisOrder.totalAmount)}
              </span>
            </div>

            <p className="text-xs font-medium text-muted-foreground">
              Select destination table:
            </p>

            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
              {availableTables.map((t) => (
                <Button
                  key={t.id}
                  variant="outline"
                  className="min-h-[48px] justify-between p-3"
                  disabled={transfer.isPending}
                  onClick={() => handleTransfer(t)}
                >
                  <div className="flex items-center gap-2.5">
                    <TableShapeIcon
                      shape={t.shape}
                      capacity={t.capacity}
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                    />
                    <span className="font-semibold text-foreground">
                      {t.name ?? `Table ${t.number}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>{t.capacity} seats</span>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
