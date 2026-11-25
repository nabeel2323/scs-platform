import { describe, expect, it } from 'vitest';
import { ShippingService } from '../../../modules/shipping/shipping.service';
import { ShippingProviderRegistry } from '../../../modules/shipping/shipping-registry';
import { ManualDeliveryProvider } from '../../../modules/shipping/providers/manual-delivery.provider';
import type { AramexProvider } from '../../../modules/shipping/aramex/aramex.provider';

describe('ShippingService provider registration', () => {
  it('registers Aramex as non-default while retaining manual-driver as default', () => {
    const registry = new ShippingProviderRegistry();
    const manual = new ManualDeliveryProvider();
    const aramex = { key: 'aramex', name: 'Aramex' } as unknown as AramexProvider;
    const service = new ShippingService({} as any, registry, manual, aramex);

    service.onModuleInit();

    expect(registry.getDefaultProvider()).toBe(manual);
    expect(registry.hasProvider('aramex')).toBe(true);
    expect(registry.getProvider('aramex')).toBe(aramex);
  });

  it('keeps direct three-argument construction compatible when no external provider is injected', () => {
    const registry = new ShippingProviderRegistry();
    const manual = new ManualDeliveryProvider();
    const service = new ShippingService({} as any, registry, manual);

    service.onModuleInit();

    expect(registry.getDefaultProvider()).toBe(manual);
    expect(registry.hasProvider('aramex')).toBe(false);
  });
});
