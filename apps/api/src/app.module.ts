import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { TerminusModule } from '@nestjs/terminus';
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
import { AuditLogMiddleware } from './modules/audit/audit-log.middleware';
import { AdminModule } from './modules/admin/admin.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { DatabaseModule } from './common/database/database.module';
import { RedisModule } from './common/redis/redis.module';
import { OutboxModule } from './common/outbox/outbox.module';
import { StorageModule } from './common/storage/storage.module';
import { CatalogImportModule } from './modules/catalog-import/catalog-import.module';

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
    TerminusModule,
    DatabaseModule,
    RedisModule,
    OutboxModule,
    StorageModule,
    RealtimeModule,

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
    CatalogImportModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  /**
   * Audit trail is registered as Nest middleware (not `app.use`) so it can
   * inject AuditService. It defers its write to the response `finish` event,
   * which is when the JWT guard has populated `req.user`.
   */
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuditLogMiddleware).forRoutes('*');
  }
}
