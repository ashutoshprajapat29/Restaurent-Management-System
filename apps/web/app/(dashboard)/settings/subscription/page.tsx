"use client";

import { Check, ShieldCheck, Sparkles, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  SUBSCRIPTION_TIER_CONFIGS,
  type SubscriptionPlan,
} from "@nodedr-restaurant/types";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscription, useUpdateSubscription } from "@/hooks/use-settings";
import { cn } from "@/lib/utils";

export default function SubscriptionSettingsPage() {
  const { data: sub, isLoading, error } = useSubscription();
  const updateMutation = useUpdateSubscription();

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    try {
      await updateMutation.mutateAsync({ plan });
      toast.success(`Plan updated to ${plan}`);
    } catch {
      toast.error("Failed to update subscription plan");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-foreground">
          Subscription & SaaS Quotas
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your restaurant organization plan, quota limits, and feature access
        </p>
      </div>

      <SettingsTabs />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : error || !sub ? (
        <Card className="p-6 text-center text-destructive">
          <AlertCircle className="mx-auto mb-2 h-8 w-8" />
          <p>Failed to load subscription details. Please try again later.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Active Plan & Quotas Summary */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="flex flex-col justify-between p-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Current Plan
                  </span>
                  <Badge
                    variant={sub.status === "ACTIVE" ? "default" : "secondary"}
                    className="font-medium"
                  >
                    {sub.status}
                  </Badge>
                </div>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                  {SUBSCRIPTION_TIER_CONFIGS[sub.plan]?.name ?? sub.plan} Tier
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {sub.isTrialActive
                    ? `Trial active until ${sub.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleDateString() : "end of trial"}`
                    : sub.status === "ACTIVE"
                      ? "Active commercial subscription"
                      : "Subscription requires attention"}
                </p>
              </div>

              <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-border">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground">
                  {sub.kdsEnabled ? "✓ KDS Enabled" : "✕ KDS Locked"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground">
                  {sub.customBrandingEnabled
                    ? "✓ Custom Branding"
                    : "✕ Standard Branding"}
                </span>
              </div>
            </Card>

            {/* Quota Usage */}
            <Card className="p-6 lg:col-span-2">
              <h3 className="text-base font-semibold text-foreground">
                Organization Quota Usage
              </h3>
              <p className="text-xs text-muted-foreground">
                Resource utilization across all floors and branches
              </p>

              <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
                {/* Tables */}
                <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-muted/20">
                  <span className="text-xs font-medium text-muted-foreground">
                    Dining Tables
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground">
                      {sub.currentUsage.tablesCount}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      / {sub.maxTables}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
                        sub.currentUsage.tablesCount >= sub.maxTables
                          ? "bg-destructive"
                          : "bg-primary",
                      )}
                      style={{
                        width: `${Math.min(
                          100,
                          (sub.currentUsage.tablesCount / Math.max(1, sub.maxTables)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Staff */}
                <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-muted/20">
                  <span className="text-xs font-medium text-muted-foreground">
                    Staff Accounts
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground">
                      {sub.currentUsage.staffCount}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      / {sub.maxStaff}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
                        sub.currentUsage.staffCount >= sub.maxStaff
                          ? "bg-destructive"
                          : "bg-primary",
                      )}
                      style={{
                        width: `${Math.min(
                          100,
                          (sub.currentUsage.staffCount / Math.max(1, sub.maxStaff)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Branches */}
                <div className="flex flex-col gap-2 rounded-lg border border-border p-4 bg-muted/20">
                  <span className="text-xs font-medium text-muted-foreground">
                    Branches
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-foreground">
                      {sub.currentUsage.branchesCount}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      / {sub.maxBranches}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
                        sub.currentUsage.branchesCount >= sub.maxBranches
                          ? "bg-destructive"
                          : "bg-primary",
                      )}
                      style={{
                        width: `${Math.min(
                          100,
                          (sub.currentUsage.branchesCount / Math.max(1, sub.maxBranches)) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Available Subscription Tiers */}
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Available SaaS Plans
            </h3>
            <p className="text-sm text-muted-foreground">
              Switch plans to adjust quotas and unlocked features for your restaurant
            </p>

            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {(
                Object.keys(SUBSCRIPTION_TIER_CONFIGS) as SubscriptionPlan[]
              ).map((planKey) => {
                const config = SUBSCRIPTION_TIER_CONFIGS[planKey];
                const isCurrent = sub.plan === planKey;

                return (
                  <Card
                    key={planKey}
                    className={cn(
                      "flex flex-col justify-between p-6 transition-all",
                      isCurrent
                        ? "border-primary shadow-sm ring-1 ring-primary"
                        : "hover:border-foreground/30",
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-foreground">
                          {config.name}
                        </span>
                        {isCurrent ? (
                          <Badge variant="default" className="text-xs">
                            Active
                          </Badge>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          <span>Up to {config.maxTables} tables</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          <span>Up to {config.maxStaff} staff members</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-primary shrink-0" />
                          <span>Up to {config.maxBranches} branches</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {config.kdsEnabled ? (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <span className="h-4 w-4 text-muted-foreground/50 text-center shrink-0">
                              -
                            </span>
                          )}
                          <span
                            className={cn(
                              !config.kdsEnabled && "text-muted-foreground/60 line-through",
                            )}
                          >
                            Kitchen Display System
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {config.customBrandingEnabled ? (
                            <Check className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <span className="h-4 w-4 text-muted-foreground/50 text-center shrink-0">
                              -
                            </span>
                          )}
                          <span
                            className={cn(
                              !config.customBrandingEnabled &&
                                "text-muted-foreground/60 line-through",
                            )}
                          >
                            Custom Branding & Logos
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-border">
                      <Button
                        className="w-full min-h-[44px]"
                        variant={isCurrent ? "outline" : "default"}
                        disabled={isCurrent || updateMutation.isPending}
                        onClick={() => handleSelectPlan(planKey)}
                      >
                        {isCurrent ? "Current Plan" : `Switch to ${config.name}`}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
