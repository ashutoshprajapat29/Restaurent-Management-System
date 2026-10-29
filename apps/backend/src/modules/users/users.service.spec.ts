import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { UsersService } from './users.service';

describe('UsersService - Staff Quota Gating', () => {
  let service: UsersService;

  const mockPrisma = {
    role: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    branch: {
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(1),
    },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockAudit = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  const mockSubscription = {
    checkStaffQuota: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.branch.count.mockResolvedValue(1);
    mockSubscription.checkStaffQuota.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: SubscriptionService, useValue: mockSubscription },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    it('checks staff quota before creating staff member', async () => {
      mockPrisma.role.findFirst.mockResolvedValue({ id: 'role-1' });
      mockPrisma.branch.findMany.mockResolvedValue([{ id: 'branch-1' }]);
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        name: 'Staff John',
        email: 'john@restaurant.local',
        roleId: 'role-1',
        isActive: true,
      });

      const result = await service.create('rest-1', 'actor-1', {
        name: 'Staff John',
        email: 'john@restaurant.local',
        password: 'Password123!',
        roleId: 'role-1',
        branchIds: ['branch-1'],
      });

      expect(mockSubscription.checkStaffQuota).toHaveBeenCalledWith(
        'rest-1',
        1,
      );
      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result.id).toBe('user-1');
    });

    it('rejects staff creation if staff quota is exceeded', async () => {
      mockSubscription.checkStaffQuota.mockRejectedValue(
        new BadRequestException('Staff limit reached'),
      );

      await expect(
        service.create('rest-1', 'actor-1', {
          name: 'Staff Exceed',
          email: 'exceed@restaurant.local',
          password: 'Password123!',
          roleId: 'role-1',
          branchIds: ['branch-1'],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });
});
