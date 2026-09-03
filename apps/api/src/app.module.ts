import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller';
import { IdentityModule } from './modules/identity/identity.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SupportModule } from './modules/support/support.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';
import { DatabaseModule } from './common/database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { OutboxModule } from './common/outbox/outbox.module';

@Module({
  imports: [
    // ── Rate limiting (Redis token bucket per user/IP/role) ──
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    // ── Infrastructure ───────────────────────────────────────
    DatabaseModule,
    RedisModule,
    OutboxModule,

    // ── Domain modules (Phase 1) ─────────────────────────────
    IdentityModule,
    MerchantModule,
    CatalogModule,
    InventoryModule,
    PricingModule,
    PromotionsModule,
    OrdersModule,
    ReviewsModule,
    SupportModule,
    NotificationsModule,
    AnalyticsModule,
    AuditModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
