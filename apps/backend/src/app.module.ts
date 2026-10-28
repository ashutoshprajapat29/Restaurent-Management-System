import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { MenuModule } from './modules/menu/menu.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { HrModule } from './modules/hr/hr.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { ReportsModule } from './modules/reports/reports.module';
import { OperationsModule } from './modules/operations/operations.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { EmailModule } from './modules/email/email.module';
import { TablesModule } from './modules/tables/tables.module';
import { OrdersModule } from './modules/orders/orders.module';
import { KdsModule } from './modules/kds/kds.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { RestaurantsModule } from './modules/restaurants/restaurants.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { PublicModule } from './modules/public/public.module';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { CustomersModule } from './modules/customers/customers.module';
import { GiftCardsModule } from './modules/gift-cards/gift-cards.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SyncModule } from './sync/sync.module';
import { UsersModule } from './modules/users/users.module';
import { PermissionsModule } from './permissions/permissions.module';
import { AuditModule } from './audit/audit.module';
import { RolesModule } from './roles/roles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BackupModule } from './backup/backup.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { McpModule } from './mcp/mcp.module';
import { SystemModule } from './system/system.module';
import { VerifactuModule } from './modules/verifactu/verifactu.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    RealtimeModule,
    AuthModule,
    MenuModule,
    TablesModule,
    AttendanceModule,
    DeliveryModule,
    HrModule,
    AccountingModule,
    MarketingModule,
    ReportsModule,
    OperationsModule,
    WebhooksModule,
    EmailModule,
    OrdersModule,
    KdsModule,
    DashboardModule,
    RestaurantsModule,
    ReservationsModule,
    WaitlistModule,
    PublicModule,
    DownloadsModule,
    CustomersModule,
    GiftCardsModule,
    InventoryModule,
    SettingsModule,
    SyncModule,
    VerifactuModule,
    SubscriptionModule,
    UsersModule,
    PermissionsModule,
    AuditModule,
    RolesModule,
    NotificationsModule,
    BackupModule,
    IntegrationsModule,
    McpModule,
    SystemModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
