import { Injectable, Logger } from '@nestjs/common';
import { ShippingProvider } from './shipping-provider';

/**
 * ShippingProviderRegistry — manages all registered shipping providers.
 *
 * During module initialisation the ShippingModule registers the
 * ManualDeliveryProvider as the default.  External carrier providers
 * will be registered in later M7.2 phases.
 */
@Injectable()
export class ShippingProviderRegistry {
  private readonly logger = new Logger(ShippingProviderRegistry.name);
  private readonly providers = new Map<string, ShippingProvider>();
  private defaultProviderKey: string | null = null;

  /**
   * Register a shipping provider.
   *
   * @param provider  The provider instance to register.
   * @param asDefault If true, this provider becomes the default.
   */
  register(provider: ShippingProvider, asDefault = false): void {
    if (this.providers.has(provider.key)) {
      this.logger.warn(`Provider '${provider.key}' is already registered — overwriting.`);
    }
    this.providers.set(provider.key, provider);
    if (asDefault || this.defaultProviderKey === null) {
      this.defaultProviderKey = provider.key;
    }
    this.logger.log(`Registered shipping provider: ${provider.key} (${provider.name})`);
  }

  /**
   * Retrieve a provider by its unique key.
   *
   * @throws Error if the provider is not registered.
   */
  getProvider(key: string): ShippingProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new Error(`Unknown shipping provider: '${key}'. Registered: [${this.listProviderKeys().join(', ')}]`);
    }
    return provider;
  }

  /**
   * Try to retrieve a provider by key, returning undefined if not found.
   */
  findProvider(key: string): ShippingProvider | undefined {
    return this.providers.get(key);
  }

  /**
   * Get the default provider (manual-driver in M7.2.1).
   */
  getDefaultProvider(): ShippingProvider {
    if (!this.defaultProviderKey) {
      throw new Error('No default shipping provider registered.');
    }
    return this.getProvider(this.defaultProviderKey);
  }

  /**
   * List all registered provider keys.
   */
  listProviderKeys(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check whether a provider is registered.
   */
  hasProvider(key: string): boolean {
    return this.providers.has(key);
  }
}
