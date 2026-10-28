import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SUBSCRIPTION_TIER_CONFIGS,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type TenantSubscriptionDto,
  type UpdateSubscriptionDto,
} from '@nodedr-restaurant/types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getTenantSubscription(
    restaurantId: string,
  ): Promise<TenantSubscriptionDto> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    if (!restaurant) {
      throw new NotFoundException('Restaurant tenant not found');
    }

    const [tablesCount, staffCount, branchesCount] = await Promise.all([
      this.prisma.table.count({
        where: { floor: { branch: { restaurantId } } },
      }),
      this.prisma.user.count({
        where: { restaurantId },
      }),
      this.prisma.branch.count({
        where: { restaurantId, isActive: true },
      }),
    ]);

    const now = new Date();
    const trialEndsAtDate = restaurant.trialEndsAt
      ? new Date(restaurant.trialEndsAt)
      : null;
    const isTrialActive =
      restaurant.subscriptionStatus === 'TRIALING' &&
      Boolean(trialEndsAtDate && trialEndsAtDate.getTime() > now.getTime());

    const isSubscriptionValid =
      restaurant.subscriptionStatus === 'ACTIVE' || isTrialActive;

    return {
      plan: restaurant.subscriptionPlan as SubscriptionPlan,
      status: restaurant.subscriptionStatus as SubscriptionStatus,
      maxTables: restaurant.maxTables,
      maxStaff: restaurant.maxStaff,
      maxBranches: restaurant.maxBranches,
      trialEndsAt: restaurant.trialEndsAt
        ? restaurant.trialEndsAt.toISOString()
        : null,
      kdsEnabled: restaurant.kdsEnabled,
      customBrandingEnabled: restaurant.customBrandingEnabled,
      isTrialActive,
      isSubscriptionValid,
      currentUsage: {
        tablesCount,
        staffCount,
        branchesCount,
      },
    };
  }

  async checkTableQuota(
    restaurantId: string,
    additionalTables = 1,
  ): Promise<void> {
    const sub = await this.getTenantSubscription(restaurantId);
    if (!sub.isSubscriptionValid) {
      throw new ForbiddenException(
        `Subscription status is ${sub.status.toLowerCase()}. Please activate or renew your subscription to create tables.`,
      );
    }

    if (sub.currentUsage.tablesCount + additionalTables > sub.maxTables) {
      throw new BadRequestException(
        `Table limit reached for your ${sub.plan} plan (${sub.maxTables} tables maximum). Current count: ${sub.currentUsage.tablesCount}. Upgrade your subscription to add more tables.`,
      );
    }
  }

  async checkStaffQuota(
    restaurantId: string,
    additionalStaff = 1,
  ): Promise<void> {
    const sub = await this.getTenantSubscription(restaurantId);
    if (!sub.isSubscriptionValid) {
      throw new ForbiddenException(
        `Subscription status is ${sub.status.toLowerCase()}. Please activate or renew your subscription to add staff.`,
      );
    }

    if (sub.currentUsage.staffCount + additionalStaff > sub.maxStaff) {
      throw new BadRequestException(
        `Staff limit reached for your ${sub.plan} plan (${sub.maxStaff} staff members maximum). Current count: ${sub.currentUsage.staffCount}. Upgrade your subscription to add more staff.`,
      );
    }
  }

  async checkBranchQuota(
    restaurantId: string,
    additionalBranches = 1,
  ): Promise<void> {
    const sub = await this.getTenantSubscription(restaurantId);
    if (!sub.isSubscriptionValid) {
      throw new ForbiddenException(
        `Subscription status is ${sub.status.toLowerCase()}. Please activate or renew your subscription to add branches.`,
      );
    }

    if (sub.currentUsage.branchesCount + additionalBranches > sub.maxBranches) {
      throw new BadRequestException(
        `Branch limit reached for your ${sub.plan} plan (${sub.maxBranches} branches maximum). Current count: ${sub.currentUsage.branchesCount}. Upgrade your subscription to add more branches.`,
      );
    }
  }

  async checkKdsAccess(restaurantId: string): Promise<void> {
    const sub = await this.getTenantSubscription(restaurantId);
    if (!sub.isSubscriptionValid) {
      throw new ForbiddenException(
        `Subscription status is ${sub.status.toLowerCase()}. Please activate or renew your subscription to access KDS.`,
      );
    }

    if (!sub.kdsEnabled) {
      throw new ForbiddenException(
        `Kitchen Display System (KDS) is not included in your ${sub.plan} plan. Upgrade to Starter, Pro, or Enterprise to unlock KDS.`,
      );
    }
  }

  async checkCustomBrandingAccess(restaurantId: string): Promise<void> {
    const sub = await this.getTenantSubscription(restaurantId);
    if (!sub.isSubscriptionValid) {
      throw new ForbiddenException(
        `Subscription status is ${sub.status.toLowerCase()}. Please activate or renew your subscription to customize branding.`,
      );
    }

    if (!sub.customBrandingEnabled) {
      throw new ForbiddenException(
        `Custom branding is not included in your ${sub.plan} plan. Upgrade to Pro or Enterprise to customize logos and themes.`,
      );
    }
  }

  async updateSubscription(
    restaurantId: string,
    actorId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<TenantSubscriptionDto> {
    const defaults = dto.plan ? SUBSCRIPTION_TIER_CONFIGS[dto.plan] : null;

    const data: Record<string, unknown> = {};
    if (dto.plan !== undefined) data.subscriptionPlan = dto.plan;
    if (dto.status !== undefined) data.subscriptionStatus = dto.status;
    if (dto.maxTables !== undefined) {
      data.maxTables = dto.maxTables;
    } else if (defaults) {
      data.maxTables = defaults.maxTables;
    }
    if (dto.maxStaff !== undefined) {
      data.maxStaff = dto.maxStaff;
    } else if (defaults) {
      data.maxStaff = defaults.maxStaff;
    }
    if (dto.maxBranches !== undefined) {
      data.maxBranches = dto.maxBranches;
    } else if (defaults) {
      data.maxBranches = defaults.maxBranches;
    }
    if (dto.trialEndsAt !== undefined) {
      data.trialEndsAt = dto.trialEndsAt ? new Date(dto.trialEndsAt) : null;
    }
    if (dto.kdsEnabled !== undefined) {
      data.kdsEnabled = dto.kdsEnabled;
    } else if (defaults) {
      data.kdsEnabled = defaults.kdsEnabled;
    }
    if (dto.customBrandingEnabled !== undefined) {
      data.customBrandingEnabled = dto.customBrandingEnabled;
    } else if (defaults) {
      data.customBrandingEnabled = defaults.customBrandingEnabled;
    }

    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data,
    });

    await this.audit.record({
      userId: actorId,
      action: 'subscription.updated',
      entity: 'Restaurant',
      entityId: restaurantId,
      metadata: {
        plan: updated.subscriptionPlan,
        status: updated.subscriptionStatus,
        maxTables: updated.maxTables,
        maxStaff: updated.maxStaff,
        maxBranches: updated.maxBranches,
        kdsEnabled: updated.kdsEnabled,
        customBrandingEnabled: updated.customBrandingEnabled,
      },
    });

    return this.getTenantSubscription(restaurantId);
  }
}
