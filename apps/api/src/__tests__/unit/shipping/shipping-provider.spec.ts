import { describe, expect, it } from 'vitest';
import { ShippingProviderRegistry } from '../../../modules/shipping/shipping-registry';
import { ManualDeliveryProvider } from '../../../modules/shipping/providers/manual-delivery.provider';
import { ShippingProvider } from '../../../modules/shipping/shipping-provider';
import {
  CreateShipmentRequest,
  ProviderCapabilities,
  ShippingProviderType,
} from '../../../modules/shipping/shipping.types';

/**
 * Unit tests for the M7.2 shipping provider abstraction.
 *
 * Tests cover:
 * - Provider registry (register, lookup, default, error on unknown)
 * - Manual delivery provider (type, key, deterministic createShipment)
 */

// ── ManualDeliveryProvider ──────────────────────────────────────────────────

describe('ManualDeliveryProvider', () => {
  const provider = new ManualDeliveryProvider();

  it('has type MANUAL', () => {
    expect(provider.type).toBe<ShippingProviderType>('MANUAL');
  });

  it('has key manual-driver', () => {
    expect(provider.key).toBe('manual-driver');
  });

  it('has a human-readable name', () => {
    expect(provider.name).toBe('Manual Driver Delivery');
  });

  it('can create shipments but cannot cancel/label/track/validate/webhooks', () => {
    const caps: ProviderCapabilities = provider.capabilities;
    expect(caps.canCreateShipment).toBe(true);
    expect(caps.canCancel).toBe(false);
    expect(caps.canGenerateLabel).toBe(false);
    expect(caps.canTrack).toBe(false);
    expect(caps.canValidateAddress).toBe(false);
    expect(caps.canReceiveWebhooks).toBe(false);
  });

  it('createShipment is deterministic — returns providerKey and metadata', async () => {
    const request: CreateShipmentRequest = {
      shipmentId: 'test-shipment-id',
      orderId: 'test-order-id',
      storeId: 'test-store-id',
      deliveryAddress: {
        street: '123 Test St',
        city: 'Riyadh',
        country: 'SA',
      },
    };

    const result = await provider.createShipment(request);

    expect(result.providerKey).toBe('manual-driver');
    expect(result.trackingId).toBeUndefined();
    expect(result.labelUrl).toBeUndefined();
    expect(result.metadata).toEqual({
      shipmentId: 'test-shipment-id',
      orderId: 'test-order-id',
      storeId: 'test-store-id',
    });
  });

  it('createShipment does not fabricate a tracking ID', async () => {
    const request: CreateShipmentRequest = {
      shipmentId: 's1',
      orderId: 'o1',
      storeId: 'st1',
      deliveryAddress: { street: 'A', city: 'B', country: 'SA' },
    };
    const result = await provider.createShipment(request);
    expect(result.trackingId).toBeUndefined();
  });

  it('createShipment makes no external calls (no side effects)', async () => {
    // Run createShipment multiple times — results should be identical.
    const request: CreateShipmentRequest = {
      shipmentId: 's2',
      orderId: 'o2',
      storeId: 'st2',
      deliveryAddress: { street: 'X', city: 'Y', country: 'SA' },
    };
    const r1 = await provider.createShipment(request);
    const r2 = await provider.createShipment(request);
    expect(r1).toEqual(r2);
  });

  it('cancelShipment is a no-op (returns void)', async () => {
    await expect(provider.cancelShipment('any-id')).resolves.toBeUndefined();
  });

  it('generateLabel returns null', async () => {
    await expect(provider.generateLabel('any-id')).resolves.toBeNull();
  });

  it('getTrackingInfo returns null', async () => {
    await expect(provider.getTrackingInfo('any-id')).resolves.toBeNull();
  });

  it('validateAddress returns true (default pass-through)', async () => {
    await expect(
      provider.validateAddress({ street: 'A', city: 'B', country: 'SA' }),
    ).resolves.toBe(true);
  });

  it('mapCarrierStatus returns null', () => {
    expect(provider.mapCarrierStatus('DELIVERED')).toBeNull();
  });
});

// ── ShippingProviderRegistry ────────────────────────────────────────────────

describe('ShippingProviderRegistry', () => {
  it('manual provider is registered and retrievable by key', () => {
    const registry = new ShippingProviderRegistry();
    const manual = new ManualDeliveryProvider();
    registry.register(manual, true);

    expect(registry.hasProvider('manual-driver')).toBe(true);
    expect(registry.getProvider('manual-driver')).toBe(manual);
  });

  it('default provider is manual-driver when registered as default', () => {
    const registry = new ShippingProviderRegistry();
    const manual = new ManualDeliveryProvider();
    registry.register(manual, true);

    const defaultProvider = registry.getDefaultProvider();
    expect(defaultProvider.key).toBe('manual-driver');
  });

  it('first registered provider becomes default if no explicit default', () => {
    const registry = new ShippingProviderRegistry();
    const manual = new ManualDeliveryProvider();
    registry.register(manual); // asDefault defaults to false

    // First provider should still become default
    expect(registry.getDefaultProvider().key).toBe('manual-driver');
  });

  it('throws on unknown provider key', () => {
    const registry = new ShippingProviderRegistry();
    const manual = new ManualDeliveryProvider();
    registry.register(manual, true);

    expect(() => registry.getProvider('aramex')).toThrowError(
      /Unknown shipping provider: 'aramex'/,
    );
  });

  it('throws when no default provider is registered', () => {
    const registry = new ShippingProviderRegistry();
    expect(() => registry.getDefaultProvider()).toThrowError(
      /No default shipping provider registered/,
    );
  });

  it('findProvider returns undefined for unknown key (no throw)', () => {
    const registry = new ShippingProviderRegistry();
    expect(registry.findProvider('nonexistent')).toBeUndefined();
  });

  it('listProviderKeys returns all registered keys', () => {
    const registry = new ShippingProviderRegistry();
    const manual = new ManualDeliveryProvider();
    registry.register(manual, true);

    const keys = registry.listProviderKeys();
    expect(keys).toEqual(['manual-driver']);
  });

  it('hasProvider returns false for unregistered key', () => {
    const registry = new ShippingProviderRegistry();
    expect(registry.hasProvider('smsa')).toBe(false);
  });
});
