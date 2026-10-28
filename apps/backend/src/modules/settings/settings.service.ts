import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TAX_REGIME_PRESETS,
  type BranchSettingsDto,
  type RestaurantSettingsDto,
} from '@nodedr-restaurant/types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async get(restaurantId: string, branchId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, restaurantId },
    });
    if (!restaurant || !branch) {
      throw new NotFoundException('Restaurant or branch not found');
    }
    return { restaurant, branch };
  }

  async updateRestaurant(
    restaurantId: string,
    userId: string,
    dto: RestaurantSettingsDto,
  ) {
    if (
      (dto.logoUrl !== undefined && dto.logoUrl !== null) ||
      (dto.primaryColor !== undefined && dto.primaryColor !== null) ||
      (dto.accentColor !== undefined && dto.accentColor !== null)
    ) {
      await this.subscriptionService.checkCustomBrandingAccess(restaurantId);
    }
    const updated = await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: dto,
    });
    await this.audit.record({
      userId,
      action: 'settings.restaurant_updated',
      entity: 'Restaurant',
      entityId: restaurantId,
      metadata: { changes: dto },
    });
    return updated;
  }

  async updateBranch(branchId: string, userId: string, dto: BranchSettingsDto) {
    if (
      dto.kioskDineInEnabled !== undefined ||
      dto.kioskTakeawayEnabled !== undefined
    ) {
      const current = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { kioskDineInEnabled: true, kioskTakeawayEnabled: true },
      });
      const dineIn = dto.kioskDineInEnabled ?? current?.kioskDineInEnabled;
      const takeaway =
        dto.kioskTakeawayEnabled ?? current?.kioskTakeawayEnabled;
      if (!dineIn && !takeaway) {
        throw new BadRequestException(
          'The kiosk needs at least one of dine-in or takeaway',
        );
      }
    }
    if (dto.printerConnection === 'NETWORK' || dto.printerHost !== undefined) {
      const current = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { printerConnection: true, printerHost: true },
      });
      const connection = dto.printerConnection ?? current?.printerConnection;
      const host =
        dto.printerHost !== undefined ? dto.printerHost : current?.printerHost;
      if (connection === 'NETWORK' && !host) {
        throw new BadRequestException(
          'Enter the printer address (IP or host name) for network printing',
        );
      }
    }
    // Picking a new regime without also stating a mode gets that regime's
    // own default (INDIA_GST/EU_VAT/ES_IVA -> inclusive, US_SALES_TAX ->
    // exclusive) — a picker that silently kept the old mode across a
    // regime switch would quietly mis-price every item on that branch.
    const data =
      dto.taxRegime && dto.taxMode === undefined
        ? { ...dto, taxMode: TAX_REGIME_PRESETS[dto.taxRegime].defaultMode }
        : dto;
    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data,
    });
    await this.audit.record({
      userId,
      action: 'settings.branch_updated',
      entity: 'Branch',
      entityId: branchId,
      metadata: { changes: dto },
    });
    return updated;
  }

  /**
   * Kiosk URL credential. 'enable' keeps an existing token (idempotent),
   * 'rotate' replaces it (the old URL stops working immediately — use when a
   * kiosk is lost or the link leaked), 'disable' removes it entirely.
   */
  async setKioskToken(
    branchId: string,
    userId: string,
    action: 'enable' | 'rotate' | 'disable',
  ) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { kioskToken: true },
    });
    if (!branch) throw new NotFoundException('Branch not found');
    const kioskToken =
      action === 'disable'
        ? null
        : action === 'enable' && branch.kioskToken
          ? branch.kioskToken
          : randomBytes(16).toString('hex');
    await this.prisma.branch.update({
      where: { id: branchId },
      data: { kioskToken },
    });
    await this.audit.record({
      userId,
      action: `settings.kiosk_${action}`,
      entity: 'Branch',
      entityId: branchId,
      // Never log the token itself.
      metadata: { enabled: kioskToken !== null },
    });
    return { kioskToken };
  }
}
