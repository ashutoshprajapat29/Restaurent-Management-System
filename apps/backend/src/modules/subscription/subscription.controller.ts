import { Body, Controller, Get, Patch, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type SessionUser,
  type TenantSubscriptionDto,
  updateSubscriptionSchema,
} from '@nodedr-restaurant/types';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SubscriptionService } from './subscription.service';

@ApiTags('subscription')
@Controller('v1/subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Auth()
  @Get()
  async getSubscription(
    @CurrentUser() user: SessionUser,
  ): Promise<TenantSubscriptionDto> {
    return this.subscriptionService.getTenantSubscription(user.restaurantId);
  }

  @Auth('settings.manage')
  @Patch()
  @UsePipes(new ZodValidationPipe(updateSubscriptionSchema))
  async updateSubscription(
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ): Promise<TenantSubscriptionDto> {
    return this.subscriptionService.updateSubscription(
      user.restaurantId,
      user.id,
      body as never,
    );
  }
}
