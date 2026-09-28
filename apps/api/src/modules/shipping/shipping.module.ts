import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { ShippingProviderRegistry } from './shipping-registry';
import { ManualDeliveryProvider } from './providers/manual-delivery.provider';

/**
 * ShippingModule — M7.2 Shipping & Delivery domain module.
 *
 * Dependency direction: OrdersModule → ShippingModule (unidirectional).
 * ShippingModule does NOT import OrdersModule.
 *
 * Uses global modules:
 * - DatabaseService (from DatabaseModule @Global)
 * - StorageService (from StorageModule @Global) — for labels/proofs in later phases
 * - OutboxDispatcher (from OutboxModule @Global) — for shipping events in later phases
 *
 * M7.2.1 provides:
 * - Provider abstraction (ShippingProvider interface)
 * - Provider registry (ShippingProviderRegistry)
 * - Manual delivery provider (ManualDeliveryProvider)
 * - Minimal GET /v1/shipping/providers endpoint
 *
 * Later phases will add:
 * - Shipping method CRUD
 * - Delivery zone management
 * - Driver eligibility
 * - Delivery proof
 * - Carrier webhook handling
 */
@Module({
  controllers: [ShippingController],
  providers: [
    ShippingProviderRegistry,
    ShippingService,
    ManualDeliveryProvider,
  ],
  exports: [ShippingService, ShippingProviderRegistry],
})
export class ShippingModule {}
