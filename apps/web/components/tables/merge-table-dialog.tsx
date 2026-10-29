"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMergeOrder, useOpenOrders } from "@/hooks/use-orders";
import type { RestaurantTable } from "@/hooks/use-tables";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export function MergeTableDialog({
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
  const { data: openOrders } = useOpenOrders(branchId);
  const merge = useMergeOrder(branchId);

  const thisOrder = openOrders?.find((o) => o.tableId === table.id);
  const otherOccupiedTables = allTables.filter(
    (t) => t.id !== table.id && openOrders?.some((o) => o.tableId === t.id),
  );

  const handleMerge = (otherTableId: string) => {
    const otherOrder = openOrders?.find((o) => o.tableId === otherTableId);
    if (!thisOrder || !otherOrder) return;
    merge.mutate(
      { targetOrderId: thisOrder.id, sourceOrderId: otherOrder.id },
      {
        onSuccess: () => {
          toast.success(`Merged into ${table.name ?? `Table ${table.number}`}`);
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not merge orders"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            Merge into {table.name ?? `Table ${table.number}`}
          </DialogTitle>
        </DialogHeader>

        {!thisOrder ? (
          <p className="py-4 text-sm text-muted-foreground">
            This table has no open order to merge into.
          </p>
        ) : otherOccupiedTables.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No other tables have an open order right now.
          </p>
        ) : (
          <div className="flex flex-col gap-2 py-2">
            {otherOccupiedTables.map((t) => {
              const order = openOrders?.find((o) => o.tableId === t.id);
              return (
                <Button
                  key={t.id}
                  variant="outline"
                  className="min-h-11 min-h-[48px] justify-between p-3"
                  disabled={merge.isPending}
                  onClick={() => handleMerge(t.id)}
                >
                  <span>{t.name ?? `Table ${t.number}`}</span>
                  <span className="text-muted-foreground">
                    {order && formatCurrency(order.totalAmount)}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
