"use client";

import type { TableStatusDto } from "@nodedr-restaurant/types";
import { ArrowRightLeft, ClipboardList, Merge, Plus, QrCode, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUpdateTableStatus, type RestaurantTable } from "@/hooks/use-tables";
import { cn } from "@/lib/utils";
import { BillTableDialog } from "./bill-table-dialog";
import { ElapsedTimer } from "./elapsed-timer";
import { MergeTableDialog } from "./merge-table-dialog";
import { TableQrDialog } from "./table-qr-dialog";
import { TableShapeIcon } from "./table-shape-icon";
import { TransferTableDialog } from "./transfer-table-dialog";

const STATUS_STYLES: Record<TableStatusDto, string> = {
  AVAILABLE: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15",
  OCCUPIED: "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-400 hover:bg-amber-500/15",
  BILLED: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15",
  RESERVED: "bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/15",
  CLEANING: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
  OUT_OF_SERVICE: "bg-muted border-border text-muted-foreground opacity-60",
};

const STATUS_LABEL: Record<TableStatusDto, string> = {
  AVAILABLE: "Vacant",
  OCCUPIED: "Cooking",
  BILLED: "Billed",
  RESERVED: "Reserved",
  CLEANING: "Cleaning",
  OUT_OF_SERVICE: "Out of service",
};

export function TableTile({
  table,
  allTables,
  branchId,
  style,
}: {
  table: RestaurantTable;
  allTables: RestaurantTable[];
  branchId: string | null;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const updateStatus = useUpdateTableStatus(branchId);
  const [qrOpen, setQrOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const hasActiveOrder = table.status === "OCCUPIED" || table.status === "BILLED";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={style}
          className={cn(
            "absolute flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-1 rounded-2xl border-2 text-xs font-medium shadow-sm transition-transform hover:scale-[1.03]",
            STATUS_STYLES[table.status],
          )}
        >
          <TableShapeIcon shape={table.shape} capacity={table.capacity} className="h-6 w-6" />
          <span className="text-sm font-semibold">{table.name ?? `T${table.number}`}</span>
          <span className="flex items-center gap-1 text-[11px] opacity-80">
            <Users className="h-3 w-3" />
            {table.capacity}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
              table.status === "AVAILABLE" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
              table.status === "OCCUPIED" && "bg-amber-500/20 text-amber-800 dark:text-amber-300",
              table.status === "BILLED" && "bg-blue-500/20 text-blue-700 dark:text-blue-300",
              table.status === "RESERVED" && "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
              table.status === "CLEANING" && "bg-purple-500/20 text-purple-700 dark:text-purple-300",
              table.status === "OUT_OF_SERVICE" && "bg-muted text-muted-foreground",
            )}
          >
            {STATUS_LABEL[table.status]}
          </span>
          {(table.status === "OCCUPIED" || table.status === "BILLED" || table.status === "RESERVED") && (
            <ElapsedTimer since={table.statusSince} className="flex items-center gap-1 text-[10px] opacity-70" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            {STATUS_LABEL[table.status]} · {table.capacity} guests
          </div>
          {(Object.keys(STATUS_LABEL) as TableStatusDto[]).map((status) => (
            <DropdownMenuItem
              key={status}
              className="min-h-11 py-2.5 cursor-pointer"
              disabled={status === table.status}
              onClick={() => updateStatus.mutate({ id: table.id, status })}
            >
              {STATUS_LABEL[status]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11 py-2.5 cursor-pointer" onClick={() => setQrOpen(true)}>
            <QrCode className="h-4 w-4" />
            View QR code
          </DropdownMenuItem>
          {(table.status === "AVAILABLE" || table.status === "RESERVED") && (
            <DropdownMenuItem className="min-h-11 py-2.5 cursor-pointer" onClick={() => router.push(`/pos?tableId=${table.id}`)}>
              <Plus className="h-4 w-4" />
              New order
            </DropdownMenuItem>
          )}
          {hasActiveOrder && (
            <>
              <DropdownMenuItem className="min-h-11 py-2.5 cursor-pointer" onClick={() => router.push(`/pos?tableId=${table.id}`)}>
                <Plus className="h-4 w-4" />
                Add another round
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 py-2.5 cursor-pointer" onClick={() => setBillOpen(true)}>
                <ClipboardList className="h-4 w-4" />
                Bill this table
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 py-2.5 cursor-pointer" onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft className="h-4 w-4" />
                Transfer order to another table
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 py-2.5 cursor-pointer" onClick={() => setMergeOpen(true)}>
                <Merge className="h-4 w-4" />
                Merge another table&apos;s bill here
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <TableQrDialog table={table} branchId={branchId} open={qrOpen} onOpenChange={setQrOpen} />
      <TransferTableDialog
        branchId={branchId}
        table={table}
        allTables={allTables}
        open={transferOpen}
        onOpenChange={setTransferOpen}
      />
      <MergeTableDialog
        branchId={branchId}
        table={table}
        allTables={allTables}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
      />
      <BillTableDialog branchId={branchId} table={table} open={billOpen} onOpenChange={setBillOpen} />
    </>
  );
}
