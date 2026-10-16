/**
 * P12 Payment Provider Registry
 *
 * Holds all registered payment providers and provides lookup by key.
 * The manual verification provider is always the default.
 *
 * Locked per architecture lock §18.3.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider } from './payments.provider';

@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly providers = new Map<string, PaymentProvider>();
  private defaultKey = 'manual';

  /** Register a payment provider. Overwrites any existing provider with the same key. */
  register(provider: PaymentProvider): void {
    this.providers.set(provider.key, provider);
    this.logger.log(`Registered payment provider: ${provider.key}`);
  }

  /** Get a provider by key. Throws if not found. */
  get(key: string): PaymentProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new Error(`Unknown payment provider: ${key}`);
    }
    return provider;
  }

  /** Get the default provider (manual verification). */
  getDefault(): PaymentProvider {
    return this.get(this.defaultKey);
  }

  /** Check if a provider is registered. */
  has(key: string): boolean {
    return this.providers.has(key);
  }

  /** List all registered provider keys. */
  listKeys(): string[] {
    return [...this.providers.keys()];
  }
}
