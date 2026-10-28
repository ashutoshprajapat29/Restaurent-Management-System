import { z } from "zod";

export const SUBSCRIPTION_PLANS = [
  "FREE",
  "STARTER",
  "PRO",
  "ENTERPRISE",
] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

export const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionTierConfig {
  plan: SubscriptionPlan;
  name: string;
  maxTables: number;
  maxStaff: number;
  maxBranches: number;
  kdsEnabled: boolean;
  customBrandingEnabled: boolean;
}

export const SUBSCRIPTION_TIER_CONFIGS: Record<
  SubscriptionPlan,
  SubscriptionTierConfig
> = {
  FREE: {
    plan: "FREE",
    name: "Free",
    maxTables: 10,
    maxStaff: 3,
    maxBranches: 1,
    kdsEnabled: false,
    customBrandingEnabled: false,
  },
  STARTER: {
    plan: "STARTER",
    name: "Starter",
    maxTables: 25,
    maxStaff: 10,
    maxBranches: 2,
    kdsEnabled: true,
    customBrandingEnabled: false,
  },
  PRO: {
    plan: "PRO",
    name: "Professional",
    maxTables: 100,
    maxStaff: 50,
    maxBranches: 5,
    kdsEnabled: true,
    customBrandingEnabled: true,
  },
  ENTERPRISE: {
    plan: "ENTERPRISE",
    name: "Enterprise",
    maxTables: 10000,
    maxStaff: 10000,
    maxBranches: 100,
    kdsEnabled: true,
    customBrandingEnabled: true,
  },
};

export interface TenantSubscriptionUsage {
  tablesCount: number;
  staffCount: number;
  branchesCount: number;
}

export interface TenantSubscriptionDto {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  maxTables: number;
  maxStaff: number;
  maxBranches: number;
  trialEndsAt: string | null;
  kdsEnabled: boolean;
  customBrandingEnabled: boolean;
  isTrialActive: boolean;
  isSubscriptionValid: boolean;
  currentUsage: TenantSubscriptionUsage;
}

export interface TenantContext {
  tenantId: string;
  branchId: string;
  subscriptionTier: SubscriptionPlan;
  status: SubscriptionStatus;
}

export const updateSubscriptionSchema = z.object({
  plan: z.enum(SUBSCRIPTION_PLANS).optional(),
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  maxTables: z.number().int().positive().optional(),
  maxStaff: z.number().int().positive().optional(),
  maxBranches: z.number().int().positive().optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
  kdsEnabled: z.boolean().optional(),
  customBrandingEnabled: z.boolean().optional(),
});

export type UpdateSubscriptionDto = z.infer<typeof updateSubscriptionSchema>;
