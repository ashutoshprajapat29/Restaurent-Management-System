import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SUBSCRIPTION_TIER_CONFIGS } from '@nodedr-restaurant/types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  const mockRestaurant = {
    id: 'rest-1',
    name: 'Bistro One',
    subscriptionPlan: 'FREE',
    subscriptionStatus: 'TRIALING',
    maxTables: 10,
    maxStaff: 3,
    maxBranches: 1,
    trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days in future
    kdsEnabled: false,
    customBrandingEnabled: false,
  };

  const mockPrisma = {
    restaurant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    table: {
      count: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    branch: {
      count: jest.fn(),
    },
  };

  const mockAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  describe('getTenantSubscription', () => {
    it('throws NotFoundException if restaurant does not exist', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(
        service.getTenantSubscription('unknown-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns subscription dto with real usage counts', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      mockPrisma.table.count.mockResolvedValue(4);
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.branch.count.mockResolvedValue(1);

      const result = await service.getTenantSubscription('rest-1');

      expect(result.plan).toBe('FREE');
      expect(result.status).toBe('TRIALING');
      expect(result.maxTables).toBe(10);
      expect(result.maxStaff).toBe(3);
      expect(result.maxBranches).toBe(1);
      expect(result.isTrialActive).toBe(true);
      expect(result.isSubscriptionValid).toBe(true);
      expect(result.currentUsage).toEqual({
        tablesCount: 4,
        staffCount: 2,
        branchesCount: 1,
      });
    });

    it('evaluates trial as expired if trialEndsAt is in the past', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      });
      mockPrisma.table.count.mockResolvedValue(2);
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.branch.count.mockResolvedValue(1);

      const result = await service.getTenantSubscription('rest-1');

      expect(result.isTrialActive).toBe(false);
      expect(result.isSubscriptionValid).toBe(false);
    });

    it('evaluates ACTIVE subscription as valid regardless of trial date', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'PRO',
        maxTables: 100,
        trialEndsAt: null,
      });
      mockPrisma.table.count.mockResolvedValue(20);
      mockPrisma.user.count.mockResolvedValue(8);
      mockPrisma.branch.count.mockResolvedValue(2);

      const result = await service.getTenantSubscription('rest-1');

      expect(result.isSubscriptionValid).toBe(true);
      expect(result.plan).toBe('PRO');
    });
  });

  describe('checkTableQuota', () => {
    it('allows table creation when under quota limit', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      mockPrisma.table.count.mockResolvedValue(9);
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.branch.count.mockResolvedValue(1);

      await expect(
        service.checkTableQuota('rest-1', 1),
      ).resolves.toBeUndefined();
    });

    it('throws BadRequestException when single table creation exceeds quota', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      mockPrisma.table.count.mockResolvedValue(10);
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.branch.count.mockResolvedValue(1);

      await expect(service.checkTableQuota('rest-1', 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when bulk table creation exceeds quota', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      mockPrisma.table.count.mockResolvedValue(8);
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.branch.count.mockResolvedValue(1);

      // 8 + 3 = 11 > 10
      await expect(service.checkTableQuota('rest-1', 3)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when subscription is cancelled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionStatus: 'CANCELLED',
      });
      mockPrisma.table.count.mockResolvedValue(2);
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.branch.count.mockResolvedValue(1);

      await expect(service.checkTableQuota('rest-1', 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('checkStaffQuota', () => {
    it('allows adding staff when within limit', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      mockPrisma.table.count.mockResolvedValue(2);
      mockPrisma.user.count.mockResolvedValue(2); // 2 + 1 = 3 <= 3
      mockPrisma.branch.count.mockResolvedValue(1);

      await expect(
        service.checkStaffQuota('rest-1', 1),
      ).resolves.toBeUndefined();
    });

    it('rejects adding staff when limit is reached', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      mockPrisma.table.count.mockResolvedValue(2);
      mockPrisma.user.count.mockResolvedValue(3); // 3 + 1 = 4 > 3
      mockPrisma.branch.count.mockResolvedValue(1);

      await expect(service.checkStaffQuota('rest-1', 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('checkBranchQuota', () => {
    it('allows branch creation within quota', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'STARTER',
        maxBranches: 2,
      });
      mockPrisma.table.count.mockResolvedValue(5);
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.branch.count.mockResolvedValue(1); // 1 + 1 = 2 <= 2

      await expect(
        service.checkBranchQuota('rest-1', 1),
      ).resolves.toBeUndefined();
    });

    it('rejects branch creation when quota is exceeded', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(mockRestaurant);
      mockPrisma.table.count.mockResolvedValue(5);
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.branch.count.mockResolvedValue(1); // 1 + 1 = 2 > 1

      await expect(service.checkBranchQuota('rest-1', 1)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('feature gating (KDS & Custom Branding)', () => {
    it('blocks KDS access when kdsEnabled is false', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        kdsEnabled: false,
      });
      mockPrisma.table.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.branch.count.mockResolvedValue(0);

      await expect(service.checkKdsAccess('rest-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('permits KDS access when kdsEnabled is true', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        kdsEnabled: true,
      });
      mockPrisma.table.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.branch.count.mockResolvedValue(0);

      await expect(service.checkKdsAccess('rest-1')).resolves.toBeUndefined();
    });

    it('blocks custom branding when customBrandingEnabled is false', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        customBrandingEnabled: false,
      });
      mockPrisma.table.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.branch.count.mockResolvedValue(0);

      await expect(
        service.checkCustomBrandingAccess('rest-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('permits custom branding when customBrandingEnabled is true', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        customBrandingEnabled: true,
      });
      mockPrisma.table.count.mockResolvedValue(0);
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.branch.count.mockResolvedValue(0);

      await expect(
        service.checkCustomBrandingAccess('rest-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('updateSubscription', () => {
    it('applies plan defaults when upgrading tier without explicit quota overrides', async () => {
      const proDefaults = SUBSCRIPTION_TIER_CONFIGS.PRO;

      mockPrisma.restaurant.update.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'PRO',
        subscriptionStatus: 'ACTIVE',
        maxTables: proDefaults.maxTables,
        maxStaff: proDefaults.maxStaff,
        maxBranches: proDefaults.maxBranches,
        kdsEnabled: proDefaults.kdsEnabled,
        customBrandingEnabled: proDefaults.customBrandingEnabled,
      });

      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        subscriptionPlan: 'PRO',
        subscriptionStatus: 'ACTIVE',
        maxTables: proDefaults.maxTables,
        maxStaff: proDefaults.maxStaff,
        maxBranches: proDefaults.maxBranches,
        kdsEnabled: proDefaults.kdsEnabled,
        customBrandingEnabled: proDefaults.customBrandingEnabled,
      });
      mockPrisma.table.count.mockResolvedValue(5);
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.branch.count.mockResolvedValue(1);

      const result = await service.updateSubscription('rest-1', 'actor-1', {
        plan: 'PRO',
        status: 'ACTIVE',
      });

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rest-1' },
          data: expect.objectContaining({
            subscriptionPlan: 'PRO',
            subscriptionStatus: 'ACTIVE',
            maxTables: 100,
            maxStaff: 50,
            maxBranches: 5,
            kdsEnabled: true,
            customBrandingEnabled: true,
          }),
        }),
      );

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          action: 'subscription.updated',
          entity: 'Restaurant',
          entityId: 'rest-1',
        }),
      );

      expect(result.plan).toBe('PRO');
      expect(result.maxTables).toBe(100);
    });
  });
});
