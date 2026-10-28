import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateStaffDto, UpdateStaffDto } from '@nodedr-restaurant/types';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';

const SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  createdAt: true,
  roleId: true,
  role: { select: { id: true, name: true, label: true } },
  branches: { select: { branch: { select: { id: true, name: true } } } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  list(restaurantId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId },
      select: SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  listRoles(restaurantId: string) {
    return this.prisma.role.findMany({
      where: { restaurantId },
      orderBy: { label: 'asc' },
    });
  }

  async create(restaurantId: string, actorId: string, dto: CreateStaffDto) {
    await this.subscriptionService.checkStaffQuota(restaurantId, 1);
    await this.assertRoleInRestaurant(restaurantId, dto.roleId);
    await this.assertBranchesInRestaurant(restaurantId, dto.branchIds);

    if (dto.email) {
      const existing = await this.prisma.user.findFirst({
        where: { restaurantId, email: dto.email },
      });
      if (existing) {
        throw new ConflictException(
          'A staff account with this email already exists',
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 12) : null;
    const user = await this.prisma.user.create({
      data: {
        restaurantId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        roleId: dto.roleId,
        passwordHash,
        pinHash,
        branches: {
          create: dto.branchIds.map((branchId) => ({ branchId })),
        },
      },
      select: SELECT,
    });

    await this.audit.record({
      userId: actorId,
      action: 'staff.created',
      entity: 'User',
      entityId: user.id,
      metadata: { name: user.name, email: user.email, roleId: user.roleId },
    });

    return user;
  }

  async update(
    restaurantId: string,
    actorId: string,
    id: string,
    dto: UpdateStaffDto,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { id, restaurantId },
      include: { role: true },
    });
    if (!existing) {
      throw new NotFoundException('Staff account not found');
    }

    if (
      (dto.isActive === false || dto.roleId) &&
      existing.role.name === 'OWNER'
    ) {
      const otherActiveOwners = await this.prisma.user.count({
        where: {
          restaurantId,
          isActive: true,
          id: { not: id },
          role: { name: 'OWNER' },
        },
      });
      if (otherActiveOwners === 0) {
        throw new BadRequestException(
          'Cannot disable or change the role of the last active owner',
        );
      }
    }

    if (dto.roleId) {
      await this.assertRoleInRestaurant(restaurantId, dto.roleId);
    }
    if (dto.branchIds) {
      await this.assertBranchesInRestaurant(restaurantId, dto.branchIds);
    }

    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 12)
      : undefined;
    const pinHash = dto.pin
      ? await bcrypt.hash(dto.pin, 12)
      : undefined;

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        roleId: dto.roleId,
        isActive: dto.isActive,
        passwordHash,
        ...(pinHash !== undefined ? { pinHash } : {}),
        ...(dto.branchIds
          ? {
              branches: {
                deleteMany: {},
                create: dto.branchIds.map((branchId) => ({ branchId })),
              },
            }
          : {}),
      },
      select: SELECT,
    });

    // Never log `dto.password`/`passwordHash`/`dto.pin`/`pinHash` — only the fields it's safe
    // for an owner reviewing history to see. `passwordChanged` and `pinChanged` are boolean
    // flags, not the value, so secret rotations are still visible in the
    // trail without the audit log becoming a secondary place secrets leak.
    await this.audit.record({
      userId: actorId,
      action: 'staff.updated',
      entity: 'User',
      entityId: id,
      metadata: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        roleId: dto.roleId,
        isActive: dto.isActive,
        branchIds: dto.branchIds,
        passwordChanged: Boolean(dto.password),
        pinChanged: Boolean(dto.pin),
      },
    });

    return updated;
  }

  async remove(restaurantId: string, actorId: string, id: string) {
    if (id === actorId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const existing = await this.prisma.user.findFirst({
      where: { id, restaurantId },
      include: { role: true },
    });
    if (!existing) {
      throw new NotFoundException('Staff account not found');
    }

    if (existing.role.name === 'OWNER') {
      const otherActiveOwners = await this.prisma.user.count({
        where: {
          restaurantId,
          isActive: true,
          id: { not: id },
          role: { name: 'OWNER' },
        },
      });
      if (otherActiveOwners === 0) {
        throw new BadRequestException('Cannot delete the last active owner');
      }
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (err) {
      // Order/Refund/PurchaseOrder/... all keep a required, non-cascading
      // reference to the staff member who created them, so history is never
      // silently lost. Once a staffer has touched a real order they can no
      // longer be hard-deleted — disable them instead (`isActive: false`).
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2003'
      ) {
        throw new BadRequestException(
          'This staff account has order, purchase, or inventory history and cannot be deleted. Disable it instead.',
        );
      }
      throw err;
    }

    await this.audit.record({
      userId: actorId,
      action: 'staff.deleted',
      entity: 'User',
      entityId: id,
      metadata: { name: existing.name, email: existing.email },
    });

    return { ok: true };
  }

  private async assertRoleInRestaurant(restaurantId: string, roleId: string) {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, restaurantId },
    });
    if (!role) {
      throw new BadRequestException('Role not found for this restaurant');
    }
  }

  private async assertBranchesInRestaurant(
    restaurantId: string,
    branchIds: string[],
  ) {
    const count = await this.prisma.branch.count({
      where: { id: { in: branchIds }, restaurantId },
    });
    if (count !== branchIds.length) {
      throw new BadRequestException('One or more branches are invalid');
    }
  }
}
