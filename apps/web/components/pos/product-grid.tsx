"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/ui/query-error";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveTabs } from "@/components/ui/nav-picker";
import { useCategories, useMenuItems, useUpdateMenuItem, type MenuItem } from "@/hooks/use-menu";
import { useSettings } from "@/hooks/use-settings";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function ProductGrid({
  branchId,
  onSelect,
}: {
  branchId: string | null;
  onSelect: (item: MenuItem) => void;
}) {
  const { data: categories } = useCategories(branchId);
  const { data: settingsData } = useSettings(branchId);
  const currency = settingsData?.restaurant.currency ?? "INR";
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { data: items, isLoading, isError, error, refetch, isFetching } = useMenuItems(branchId, activeCategoryId);
  const updateMenuItem = useUpdateMenuItem(branchId);

  const filtered = items?.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex h-full flex-col gap-4">
      <Input
        placeholder="Search menu…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-11"
      />

      {categories && categories.length > 0 && (
        <ResponsiveTabs
          mobileOnly
          className="lg:hidden"
          label="Category"
          value={activeCategoryId ?? "all"}
          onChange={(id) => setActiveCategoryId(id === "all" ? undefined : id)}
          desktopListClassName="justify-start lg:h-auto lg:flex-wrap"
          items={[{ id: "all", label: "All" }, ...categories.map((c) => ({ id: c.id, label: c.name, hint: `${c._count.items} items` }))]}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-5">
      {categories && categories.length > 0 && (
        <nav
          aria-label="Category"
          className="hidden w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border pr-3 lg:flex xl:w-60"
        >
          {[{ id: undefined as string | undefined, name: "All", count: undefined as number | undefined }, ...categories.map((c) => ({ id: c.id as string | undefined, name: c.name, count: c._count.items as number | undefined }))].map((c) => {
            const active = c.id === activeCategoryId;
            return (
              <button
                key={c.id ?? "all"}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => setActiveCategoryId(c.id)}
                className={cn(
                  "flex min-h-10 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                    : "font-medium text-foreground hover:bg-secondary",
                )}
              >
                <span className="min-w-0 break-words leading-tight">{c.name}</span>
                {c.count !== undefined && (
                  <span className={cn("shrink-0 text-xs tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>
                    {c.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {isError && !items ? (
        <QueryError error={error} what="the menu" onRetry={() => void refetch()} retrying={isFetching} />
      ) : (
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-4 sm:grid-cols-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        {filtered?.map((item) => {
          const isOutOfStock = !item.isActive;
          return (
            <div
              key={item.id}
              data-testid={`pos-item-${item.id}`}
              role="button"
              tabIndex={isOutOfStock ? -1 : 0}
              onClick={() => {
                if (isOutOfStock) return;
                onSelect(item);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (isOutOfStock) return;
                  e.preventDefault();
                  onSelect(item);
                }
              }}
              className={cn(
                "group relative flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl border border-border bg-card p-3 text-left sm:p-4 shadow-sm transition-all lg:min-h-32 lg:p-4",
                isOutOfStock
                  ? "opacity-55 grayscale cursor-not-allowed bg-muted/40"
                  : "hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] active:translate-y-0 cursor-pointer lg:hover:border-primary/50",
              )}
            >
              <div className="flex w-full items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${item.isVeg ? "bg-success" : "bg-destructive"}`}
                  />
                  {isOutOfStock && (
                    <span
                      data-testid={`pos-item-badge-oos-${item.id}`}
                      className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-destructive-foreground tracking-wider uppercase"
                    >
                      OUT OF STOCK
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  data-testid={`pos-stock-toggle-${item.id}`}
                  title={isOutOfStock ? "Mark In Stock" : "86 / Mark Out of Stock"}
                  aria-label={isOutOfStock ? `Mark ${item.name} in stock` : `86 ${item.name} (out of stock)`}
                  disabled={updateMenuItem.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateMenuItem.mutate({ id: item.id, dto: { isActive: !item.isActive } }, {
                      onError: () => toast.error("Could not update item stock status"),
                    });
                  }}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-semibold transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center",
                    isOutOfStock
                      ? "bg-primary/20 text-primary hover:bg-primary/30"
                      : "bg-secondary text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                  )}
                >
                  {isOutOfStock ? "Restock" : "86"}
                </button>
              </div>
              <span
                data-testid={`pos-item-name-${item.id}`}
                className="text-sm font-medium leading-tight text-foreground lg:text-[15px]"
              >
                {item.name}
              </span>
              <span className="flex w-full items-baseline justify-between gap-2">
                <span
                  data-testid={`pos-item-price-${item.id}`}
                  className="text-sm font-semibold tabular-nums text-foreground lg:text-base"
                >
                  {formatCurrency(item.price, currency)}
                </span>
                {item.halfPrice != null && (
                  <span className="hidden text-[11px] tabular-nums text-muted-foreground lg:inline">
                    Half {formatCurrency(item.halfPrice, currency)}
                  </span>
                )}
              </span>
            </div>
          );
        })}
        {filtered?.length === 0 && !isLoading && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
            {search ? <>No items match &quot;{search}&quot;</> : "No items in this category yet"}
          </p>
        )}
      </div>
      )}
      </div>
      </div>
    </div>
  );
}
