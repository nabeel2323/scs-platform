import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { ShippingController } from './shipping.controller';
import { ShippingProviderRegistry } from './shipping-registry';
import { ManualDeliveryProvider } from './providers/manual-delivery.provider';
import { CarrierCredentialCryptoService } from './carrier-credential-crypto.service';
import { CarrierCredentialsService } from './carrier-credentials.service';
import { CarrierConfigurationsService } from './carrier-configurations.service';
import { WebhookSecurityService } from './webhook-security.service';
import { ShippingCarrierWorker } from './shipping-carrier.worker';
import { CarrierWebhookController } from './carrier-webhook.controller';
import { CarrierAdminController } from './carrier-admin.controller';
import { ShipmentOperationsController } from './shipment-operations.controller';
// M7.2.3-B.1 — carrier integration foundation hardening
import { CarrierEmailResolver } from './carrier-email-resolver';
import { CarrierConfigValidator } from './carrier-config-validation';
import { CarrierObservabilityService } from './carrier-observability';
// M7.2.3-B.2 — Aramex provider
import { AramexProvider } from './aramex/aramex.provider';

/**
 * ShippingModule — M7.2.3-A Shipping, Delivery & Carrier Integration.
 *
 * Dependency direction: OrdersModule → ShippingModule (unidirectional).
 * ShippingModule does NOT import OrdersModule.
 *
 * Uses global modules:
 * - DatabaseService (from DatabaseModule @Global)
 * - StorageService (from StorageModule @Global) — for labels/proofs
 * - OutboxDispatcher (from OutboxModule @Global) — for shipping events
 *
 * M7.2.1: Provider abstraction, registry, manual delivery.
 * M7.2.2: Shipping method CRUD, delivery zones, estimates.
 * M7.2.3-A: Carrier integration foundation:
 *   - AES-256-GCM credential encryption
 *   - Org-level credential ownership
 *   - Store-level carrier configuration
 *   - Dedicated ShippingCarrierWorker
 *   - Carrier webhook security (HMAC-SHA256)
 *   - Multi-label support
 *   - Shipment operations API
 *
 * M7.2.3-B.1: Carrier integration foundation hardening:
 *   - Atomic shipment + outbox transaction
 *   - Carrier email resolution
 *   - SSRF protection for carrier endpoints
 *   - Carrier error hierarchy
 *   - Generic carrier HTTP client
 *   - Multi-service carrier endpoint model
 *   - Webhook tenant routing (token-based)
 *   - Carrier configuration validation
 *   - Carrier observability (correlation IDs)
 */
@Module({
  controllers: [
    ShippingController,
    CarrierAdminController,
    CarrierWebhookController,
    ShipmentOperationsController,
  ],
  providers: [
    ShippingProviderRegistry,
    ShippingService,
    ManualDeliveryProvider,
    AramexProvider,
    CarrierCredentialCryptoService,
    CarrierCredentialsService,
    CarrierConfigurationsService,
    WebhookSecurityService,
    ShippingCarrierWorker,
    // M7.2.3-B.1
    CarrierEmailResolver,
    CarrierConfigValidator,
    CarrierObservabilityService,
  ],
  exports: [
    ShippingService,
    ShippingProviderRegistry,
    CarrierCredentialsService,
    CarrierConfigurationsService,
    // M7.2.3-B.1
    CarrierEmailResolver,
    CarrierConfigValidator,
    CarrierObservabilityService,
    // M7.2.3-B.2
    AramexProvider,
  ],
})
export class ShippingModule {}
