/**
 * Multi-Tenant SaaS & Subscription Engine (Opaque-Box Helper)
 * Implements tenant scoping, SaaS subscription quotas, and feature gating.
 */

export type SubscriptionTier = "FREE" | "STARTER" | "PRO" | "ENTERPRISE";
export type SubscriptionStatus = "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED";

export interface TierQuotas {
  maxTables: number;
  maxStaff: number;
  maxBranches: number;
  kdsEnabled: boolean;
  customBranding: boolean;
  analyticsLevel: "BASIC" | "STANDARD" | "ADVANCED";
}

export const TIER_LIMITS: Record<SubscriptionTier, TierQuotas> = {
  FREE: {
    maxTables: 5,
    maxStaff: 2,
    maxBranches: 1,
    kdsEnabled: false,
    customBranding: false,
    analyticsLevel: "BASIC",
  },
  STARTER: {
    maxTables: 15,
    maxStaff: 5,
    maxBranches: 1,
    kdsEnabled: true,
    customBranding: false,
    analyticsLevel: "STANDARD",
  },
  PRO: {
    maxTables: 50,
    maxStaff: 20,
    maxBranches: 3,
    kdsEnabled: true,
    customBranding: true,
    analyticsLevel: "ADVANCED",
  },
  ENTERPRISE: {
    maxTables: Number.POSITIVE_INFINITY,
    maxStaff: Number.POSITIVE_INFINITY,
    maxBranches: Number.POSITIVE_INFINITY,
    kdsEnabled: true,
    customBranding: true,
    analyticsLevel: "ADVANCED",
  },
};

export interface TenantContext {
  tenantId: string;
  restaurantName: string;
  subscriptionTier: SubscriptionTier;
  status: SubscriptionStatus;
  branches: Array<{
    branchId: string;
    branchName: string;
    tableCount: number;
    staffCount: number;
  }>;
}

export class TenancyManager {
  private tenants = new Map<string, TenantContext>();

  createTenant(params: {
    tenantId: string;
    restaurantName: string;
    subscriptionTier?: SubscriptionTier;
    status?: SubscriptionStatus;
    initialBranchName?: string;
  }): TenantContext {
    if (!params.tenantId || !params.tenantId.trim()) {
      throw new Error("Invalid tenantId: cannot be empty");
    }
    if (this.tenants.has(params.tenantId)) {
      throw new Error(`Tenant ${params.tenantId} already exists`);
    }

    const tenant: TenantContext = {
      tenantId: params.tenantId,
      restaurantName: params.restaurantName,
      subscriptionTier: params.subscriptionTier ?? "FREE",
      status: params.status ?? "ACTIVE",
      branches: [
        {
          branchId: `${params.tenantId}-b1`,
          branchName: params.initialBranchName ?? "Main Branch",
          tableCount: 0,
          staffCount: 1, // initial owner
        },
      ],
    };

    this.tenants.set(params.tenantId, tenant);
    return tenant;
  }

  getTenant(tenantId: string): TenantContext {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    return tenant;
  }

  updateTier(tenantId: string, newTier: SubscriptionTier): TenantContext {
    const tenant = this.getTenant(tenantId);
    tenant.subscriptionTier = newTier;
    return tenant;
  }

  canAddTable(tenantId: string): { allowed: boolean; reason?: string } {
    const tenant = this.getTenant(tenantId);
    if (tenant.status !== "ACTIVE" && tenant.status !== "TRIALING") {
      return { allowed: false, reason: `Subscription is ${tenant.status}` };
    }
    const quotas = TIER_LIMITS[tenant.subscriptionTier];
    const currentTables = tenant.branches.reduce((acc, b) => acc + b.tableCount, 0);
    if (currentTables >= quotas.maxTables) {
      return {
        allowed: false,
        reason: `Quota exceeded: ${tenant.subscriptionTier} tier permits maximum ${quotas.maxTables} tables (current: ${currentTables})`,
      };
    }
    return { allowed: true };
  }

  addTable(tenantId: string, branchId: string): void {
    const check = this.canAddTable(tenantId);
    if (!check.allowed) throw new Error(check.reason);
    const tenant = this.getTenant(tenantId);
    const branch = tenant.branches.find((b) => b.branchId === branchId);
    if (!branch) throw new Error(`Branch ${branchId} does not belong to tenant ${tenantId}`);
    branch.tableCount += 1;
  }

  canAddStaff(tenantId: string): { allowed: boolean; reason?: string } {
    const tenant = this.getTenant(tenantId);
    const quotas = TIER_LIMITS[tenant.subscriptionTier];
    const currentStaff = tenant.branches.reduce((acc, b) => acc + b.staffCount, 0);
    if (currentStaff >= quotas.maxStaff) {
      return {
        allowed: false,
        reason: `Quota exceeded: ${tenant.subscriptionTier} tier permits maximum ${quotas.maxStaff} staff members`,
      };
    }
    return { allowed: true };
  }

  addStaff(tenantId: string, branchId: string): void {
    const check = this.canAddStaff(tenantId);
    if (!check.allowed) throw new Error(check.reason);
    const tenant = this.getTenant(tenantId);
    const branch = tenant.branches.find((b) => b.branchId === branchId);
    if (!branch) throw new Error(`Branch ${branchId} does not belong to tenant ${tenantId}`);
    branch.staffCount += 1;
  }

  canAccessKds(tenantId: string): boolean {
    const tenant = this.getTenant(tenantId);
    return TIER_LIMITS[tenant.subscriptionTier].kdsEnabled;
  }

  canCustomizeBranding(tenantId: string): boolean {
    const tenant = this.getTenant(tenantId);
    return TIER_LIMITS[tenant.subscriptionTier].customBranding;
  }

  isIsolated(tenantAId: string, tenantBId: string, branchBId: string): boolean {
    const tenantA = this.getTenant(tenantAId);
    return !tenantA.branches.some((b) => b.branchId === branchBId);
  }
}
