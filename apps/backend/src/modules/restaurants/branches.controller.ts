import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { SessionUser } from '@nodedr-restaurant/types';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';

// Roles that run the whole restaurant see every branch of it; everyone else
// sees only the branches they were assigned to (UserBranch).
const ALL_BRANCH_ROLES = ['OWNER', 'ADMINISTRATOR'];

@ApiTags('branches')
@Controller('v1/branches')
export class BranchesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Auth()
  @Get()
  listBranches(@CurrentUser() user: SessionUser) {
    const sees = ALL_BRANCH_ROLES.includes(user.roleName)
      ? {}
      : { users: { some: { userId: user.id } } };
    return this.prisma.branch.findMany({
      where: { restaurantId: user.restaurantId, isActive: true, ...sees },
      orderBy: { name: 'asc' },
    });
  }

  @Auth('settings.manage')
  @Post()
  async createBranch(
    @CurrentUser() user: SessionUser,
    @Body() body: { name: string; address?: string; phone?: string },
  ) {
    if (!body?.name?.trim()) {
      throw new BadRequestException('Branch name is required');
    }
    await this.subscriptionService.checkBranchQuota(user.restaurantId, 1);
    return this.prisma.branch.create({
      data: {
        restaurantId: user.restaurantId,
        name: body.name.trim(),
        address: body.address,
        phone: body.phone,
      },
    });
  }
}
