"use client";

import type { TableStatusDto } from "@nodedr-restaurant/types";
import { Users } from "lucide-react";
import { useState } from "react";
import { ElapsedTimer } from "@/components/tables/elapsed-timer";
import { TableShapeIcon } from "@/components/tables/table-shape-icon";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import type { Floor, RestaurantTable } from "@/hooks/use-tables";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<TableStatusDto, string> = {
  AVAILABLE: "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15",
  OCCUPIED: "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-400 hover:bg-amber-500/15",
  BILLED: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/15",
  RESERVED: "bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/15",
  CLEANING: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
  OUT_OF_SERVICE: "bg-muted border-border text-muted-foreground opacity-50",
};

const STATUS_LABEL: Record<TableStatusDto, string> = {
  AVAILABLE: "Vacant — tap to seat or order",
  OCCUPIED: "Cooking — active order in preparation",
  BILLED: "Billed — awaiting settlement",
  RESERVED: "Reserved",
  CLEANING: "Cleaning",
  OUT_OF_SERVICE: "Out of service",
};

// A click-to-order table grid, purpose-built for POS: pick a table, land
// straight in the menu. Deliberately a separate, simpler component from
// components/tables/table-tile.tsx (no status dropdown, QR, merge, or bill
// dialog here — that's the Tables page's job) so the Tables tab itself
// stays untouched.
export function PosTablePicker({
  floors,
  onSelect,
  isLoading = false,
  error = null,
  onRetry,
  retrying = false,
}: {
  floors: Floor[];
  onSelect: (table: RestaurantTable) => void;
  isLoading?: boolean;
  /** The floor request failed: say so, never show it as "no tables". */
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const [activeFloorId, setActiveFloorId] = useState<string | undefined>(undefined);
  const activeFloor = floors.find((f) => f.id === (activeFloorId ?? floors[0]?.id));

  if (error && floors.length === 0) {
    return <QueryError error={error} what="the tables" onRetry={() => onRetry?.()} retrying={retrying} />;
  }
  if (isLoading && floors.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5" aria-busy="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (floors.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No tables are set up for this branch yet. A manager can add them under Tables.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {floors.length > 1 && (
        <ResponsiveTabs
          label="Floor"
          value={activeFloor?.id ?? floors[0].id}
          onChange={setActiveFloorId}
          items={floors.map((f) => ({
            id: f.id,
            label: f.name,
            hint: `${f.tables.filter((t) => t.status === "AVAILABLE").length} free`,
          }))}
        />
      )}

      <div className="grid flex-1 auto-rows-min grid-cols-3 items-start gap-3 overflow-y-auto pb-2 sm:grid-cols-4 lg:grid-cols-5 lg:gap-4 xl:grid-cols-6 2xl:grid-cols-7">
        {activeFloor?.tables.map((table) => {
          const clickable = table.status !== "CLEANING" && table.status !== "OUT_OF_SERVICE";
          return (
            <button
              key={table.id}
              type="button"
              disabled={!clickable}
              title={STATUS_LABEL[table.status]}
              onClick={() => onSelect(table)}
              className={cn(
                "flex h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-xs font-medium shadow-sm transition-transform lg:h-36 lg:gap-1.5",
                clickable && "cursor-pointer hover:scale-[1.03] hover:shadow-md",
                !clickable && "cursor-not-allowed",
                STATUS_STYLES[table.status],
              )}
            >
              <TableShapeIcon shape={table.shape} capacity={table.capacity} className="h-6 w-6 lg:h-8 lg:w-8" />
              <span className="text-sm font-semibold lg:text-lg">{table.name ?? `T${table.number}`}</span>
              <span className="flex items-center gap-1 text-[11px] opacity-80">
                <Users className="h-3 w-3" />
                {table.capacity}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  table.status === "AVAILABLE" && "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
                  table.status === "OCCUPIED" && "bg-amber-500/20 text-amber-800 dark:text-amber-300",
                  table.status === "BILLED" && "bg-blue-500/20 text-blue-700 dark:text-blue-300",
                  table.status === "RESERVED" && "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
                  table.status === "CLEANING" && "bg-purple-500/20 text-purple-700 dark:text-purple-300",
                  table.status === "OUT_OF_SERVICE" && "bg-muted text-muted-foreground",
                )}
              >
                {table.status === "AVAILABLE"
                  ? "Vacant"
                  : table.status === "OCCUPIED"
                    ? "Cooking"
                    : table.status === "BILLED"
                      ? "Billed"
                      : table.status === "OUT_OF_SERVICE"
                        ? "Out of service"
                        : table.status.toLowerCase()}
              </span>
              {(table.status === "OCCUPIED" || table.status === "BILLED" || table.status === "RESERVED") && (
                <ElapsedTimer since={table.statusSince} className="flex items-center gap-1 text-[10px] opacity-70" />
              )}
            </button>
          );
        })}
        {activeFloor?.tables.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            No tables on this floor yet.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground lg:border-t lg:border-border lg:pt-3">
        <Legend color="bg-emerald-500" label="Vacant" />
        <Legend color="bg-amber-500" label="Cooking" />
        <Legend color="bg-blue-500" label="Billed" />
        <Legend color="bg-yellow-500" label="Reserved" />
        <Legend color="bg-muted-foreground" label="Cleaning / Out of service" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      {label}
    </div>
  );
}
