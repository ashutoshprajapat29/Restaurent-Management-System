import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  kotItemStatusUpdateSchema,
  rejectKotSchema,
  rejectOrderSchema,
  setPrioritySchema,
  type SessionUser,
} from '@nodedr-restaurant/types';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { KdsService } from './kds.service';

@ApiTags('kds')
@Controller('v1/kds')
export class KdsController {
  constructor(
    private readonly kdsService: KdsService,
    private readonly branchAccess: BranchAccessService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Auth('kds.manage')
  @Get('stations')
  async listStations(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.subscriptionService.checkKdsAccess(user.restaurantId);
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kdsService.listStations(branchId);
  }

  @Auth('kds.manage')
  @Get('tickets')
  async listTickets(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('stationId') stationId?: string,
  ) {
    await this.subscriptionService.checkKdsAccess(user.restaurantId);
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kdsService.listActiveTickets(branchId, stationId);
  }

  // Orders waiting to be accepted - shown on the kitchen screen so they can be
  // answered there.
  @Auth('orders.accept')
  @Get('incoming')
  async listIncoming(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kdsService.listIncoming(branchId);
  }

  @Auth('orders.accept')
  @Post('incoming/:id/accept')
  async acceptIncoming(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kdsService.acceptIncoming(branchId, id, user.id);
  }

  @Auth('orders.accept')
  @Post('incoming/:id/reject')
  @UsePipes(new ZodValidationPipe(rejectOrderSchema))
  async declineIncoming(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { reason } = body as { reason: string };
    return this.kdsService.declineIncoming(branchId, id, user.id, reason);
  }

  // Kitchen progress for the order-taking screens (POS / tables): ticket
  // status only, no guest contact details.
  @Auth('orders.create')
  @Get('progress')
  async progress(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kdsService.progress(branchId);
  }

  @Auth('kds.manage')
  @Get('performance')
  async getPerformance(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Query('date') date?: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kdsService.getPerformanceReport(branchId, date);
  }

  @Auth('kds.manage')
  @Patch('tickets/:id/status')
  @UsePipes(new ZodValidationPipe(kotItemStatusUpdateSchema))
  async updateStatus(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { status } = body as { status: string };
    return this.kdsService.updateStatus(branchId, id, status, user.id);
  }

  // The kitchen declining a ticket. Needs a reason; a ticket already being
  // cooked can only be rejected by someone who may also cancel orders, and
  // only with an explicit confirmation.
  @Auth('kds.manage')
  @Post('tickets/:id/reject')
  @UsePipes(new ZodValidationPipe(rejectKotSchema))
  async rejectTicket(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { reason, confirmStarted } = body as {
      reason: string;
      confirmStarted?: boolean;
    };
    return this.kdsService.rejectTicket(branchId, id, user.id, {
      reason,
      confirmStarted,
      mayRejectStarted: user.permissions.includes('orders.cancel'),
    });
  }

  @Auth('kds.manage')
  @Patch('tickets/:id/priority')
  @UsePipes(new ZodValidationPipe(setPrioritySchema))
  async setPriority(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    const { isPriority } = body as { isPriority: boolean };
    return this.kdsService.setPriority(branchId, id, isPriority);
  }

  // First print of a ticket (409 ALREADY_PRINTED if it already went out).
  @Auth('kds.manage')
  @Post('tickets/:id/print')
  async print(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kdsService.print(branchId, id, false);
  }

  // Deliberate extra copy, stamped REPRINT on paper.
  @Auth('kds.manage')
  @Post('tickets/:id/reprint')
  async reprint(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.kdsService.print(branchId, id, true);
  }
}
