import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisThrottlerStorageService } from './common/throttler/redis-throttler-storage.service';
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
import { RedisService } from './common/redis/redis.service';
import { OutboxModule } from './common/outbox/outbox.module';
import { StorageModule } from './common/storage/storage.module';
import { CatalogImportModule } from './modules/catalog-import/catalog-import.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { OperationsModule } from './modules/operations/operations.module';

@Module({
  imports: [
    // ── Rate limiting (S1.7: Redis-backed distributed counters) ──
    // The array form uses in-memory storage (per-process), which breaks under
    // multi-replica topology. The object form with `storage` injects a shared
    // Redis-backed implementation so all replicas share the same counters.
    ThrottlerModule.forRootAsync({
      useFactory: (redisService: RedisService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: 100,
          },
          {
            // Webhook-specific throttler — tighter limit for inbound carrier webhooks.
            name: 'webhook',
            ttl: parseInt(process.env['WEBHOOK_THROTTLE_TTL_MS'] || '60000', 10),
            limit: parseInt(process.env['WEBHOOK_THROTTLE_LIMIT'] || '30', 10),
          },
          {
            // OTP request throttler — IP-scoped limit to prevent cost amplification.
            // Per-phone limits are enforced separately in IdentityService via Redis Lua.
            name: 'otp-request',
            ttl: 60_000,
            limit: 20,
          },
          {
            // OTP verification throttler — IP-scoped limit for verify attempts.
            name: 'otp-verify',
            ttl: 60_000,
            limit: 40,
          },
        ],
        storage: new RedisThrottlerStorageService(redisService),
      }),
      inject: [RedisService],
    }),

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
    ShippingModule,
    PaymentsModule,
    ReturnsModule,
    // P13 Phase 4: worker lease, ops controls, alerting and pilot gate. ReturnsModule
    // imports it too; Nest dedupes the module so there is exactly one instance.
    OperationsModule,
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
