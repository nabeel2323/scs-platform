import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { ManualDeliveryProvider } from './providers/manual-delivery.provider';
import { ShippingProvider } from './shipping-provider';
import { CreateShipmentRequest, CreateShipmentResult } from './shipping.types';

/**
 * ShippingService — orchestrates shipping operations via the provider registry.
 *
 * In M7.2.1 this service:
 * - Registers the ManualDeliveryProvider on module init
 * - Provides a createShipment() facade that delegates to the correct provider
 * - Exposes provider lookup for use by OrdersModule in later phases
 *
 * Later phases will add:
 * - Shipping method CRUD (M7.2.2)
 * - Delivery zone management (M7.2.3)
 * - Driver eligibility (M7.2.5)
 * - Carrier webhook handling (M7.2.7)
 */
@Injectable()
export class ShippingService implements OnModuleInit {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ShippingProviderRegistry,
    private readonly manualProvider: ManualDeliveryProvider,
  ) {}

  /**
   * Register the manual delivery provider during module initialisation.
   */
  onModuleInit(): void {
    this.registry.register(this.manualProvider, true);
    this.logger.log('ShippingService initialised — manual-driver provider registered.');
  }

  /**
   * Create a shipment via the specified (or default) provider.
   *
   * @param request  Shipment creation request
   * @param providerKey  Optional provider key; defaults to manual-driver
   */
  async createShipment(
    request: CreateShipmentRequest,
    providerKey?: string,
  ): Promise<CreateShipmentResult> {
    const provider = providerKey
      ? this.registry.getProvider(providerKey)
      : this.registry.getDefaultProvider();

    return provider.createShipment(request);
  }

  /**
   * Get the provider for a given key.
   */
  getProvider(key: string): ShippingProvider {
    return this.registry.getProvider(key);
  }

  /**
   * Get the default provider.
   */
  getDefaultProvider(): ShippingProvider {
    return this.registry.getDefaultProvider();
  }

  /**
   * List all registered provider keys.
   */
  listProviders(): string[] {
    return this.registry.listProviderKeys();
  }
}
