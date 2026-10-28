import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  bulkTableCreateSchema,
  floorSchema,
  floorUpdateSchema,
  tableSchema,
  tableUpdateSchema,
  tableLayoutUpdateSchema,
  transferOrderSchema,
  type SessionUser,
  type TableLayoutUpdateDto,
  type TransferOrderDto,
} from '@nodedr-restaurant/types';
import { z } from 'zod';
import { Auth } from '../../common/decorators/auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { TablesService } from './tables.service';

@ApiTags('tables')
@Controller('v1/tables')
export class TablesController {
  constructor(
    private readonly tablesService: TablesService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  @Auth('tables.view')
  @Get('requests')
  async listRequests(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.listOpenRequests(branchId);
  }

  @Auth('tables.view', 'orders.edit')
  @Patch('requests/:id/resolve')
  async resolveRequest(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.resolveRequest(branchId, id);
  }

  @Auth('tables.view')
  @Get('floors')
  async listFloors(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.listFloors(branchId);
  }

  @Auth('tables.manage')
  @Post('floors')
  @UsePipes(new ZodValidationPipe(floorSchema))
  async createFloor(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.createFloor(branchId, body as never);
  }

  @Auth('tables.manage')
  @Post()
  @UsePipes(new ZodValidationPipe(tableSchema))
  async createTable(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.createTable(branchId, body as never);
  }

  @Auth('tables.manage')
  @Post('bulk')
  @UsePipes(new ZodValidationPipe(bulkTableCreateSchema))
  async createTables(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.createTables(branchId, body as never);
  }

  @Auth('tables.manage')
  @Patch('floors/:id')
  @UsePipes(new ZodValidationPipe(floorUpdateSchema))
  async updateFloor(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.updateFloor(branchId, id, body as never);
  }

  @Auth('tables.manage')
  @Patch('layout')
  @UsePipes(new ZodValidationPipe(z.array(tableLayoutUpdateSchema)))
  async updateLayout(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: TableLayoutUpdateDto[],
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.updateTableLayout(branchId, body);
  }

  @Auth('tables.manage')
  @Patch(':id')
  @UsePipes(new ZodValidationPipe(tableUpdateSchema))
  async updateTable(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.updateTable(branchId, id, body as never);
  }

  @Auth('tables.view', 'orders.edit')
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: { status: never; assignedWaiterId?: string },
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.updateTableStatus(
      branchId,
      id,
      body.status,
      body.assignedWaiterId,
    );
  }

  @Auth('tables.view', 'orders.edit')
  @Post('transfer')
  @UsePipes(new ZodValidationPipe(transferOrderSchema))
  async transferOrder(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Body() body: TransferOrderDto,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.transferOrder(branchId, body, user.id);
  }

  @Auth('tables.manage')
  @Post(':id/qr-token')
  async rotateQrToken(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.rotateQrToken(branchId, id);
  }

  @Auth('tables.manage')
  @Delete(':id')
  async deleteTable(
    @CurrentUser() user: SessionUser,
    @Query('branchId') branchId: string,
    @Param('id') id: string,
  ) {
    await this.branchAccess.assertAccess(user.restaurantId, branchId);
    return this.tablesService.deleteTable(branchId, id);
  }
}
