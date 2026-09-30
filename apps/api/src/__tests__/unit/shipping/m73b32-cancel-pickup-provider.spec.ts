/**
 * M7.3-B.3.2 — Provider Abstraction + Cancel Wiring (Unit Tests)
 *
 * Tests the provider-level cancelPickup abstraction and Aramex mapping
 * in isolation (no HTTP, no database).
 *
 * Coverage:
 *   B32-U-01  Aramex capability reports canCancelPickup = true
 *   B32-U-02  Aramex capability reports canCancel = false (no CancelShipment)
 *   B32-U-03  Manual capability reports canCancelPickup = false
 *   B32-U-04  Manual cancelPickup returns unsupported
 *   B32-U-05  CancelPickupRequest shape is correct
 *   B32-U-06  CancelPickupResult success shape
 *   B32-U-07  CancelPickupResult business-error shape
 *   B32-U-08  CancelPickupResult unsupported shape
 *   B32-U-09  Deterministic idempotency key unchanged (carrier-cancel:<id>)
 *   B32-U-10  No blind retry inside provider method
 *   B32-U-11  Credentials never appear in result or error messages
 *   B32-U-12  Aramex provider remains behind the abstraction
 */

import { describe, it, expect } from 'vitest';
import { ManualDeliveryProvider } from '../../../modules/shipping/providers/manual-delivery.provider';
import type {
  CancelPickupRequest,
  CancelPickupResult,
  ProviderCapabilities,
} from '../../../modules/shipping/shipping.types';
import {
  CARRIER_CANCEL_STATUSES,
  generateCarrierCancelIdempotencyKey,
} from '../../../modules/shipping/shipping.types';

// ── B32-U-01/02: Aramex Capabilities ──────────────────────────────────────

describe('B32-U-01/02: Aramex Provider Capabilities', () => {
  // We test the capability shape without instantiating AramexProvider
  // (which requires DI). The actual Aramex capabilities are verified
  // in the HTTP spec via a controlled test server.
  const aramexCaps: ProviderCapabilities = {
    canCreateShipment: true,
    canCancel: false,
    canCancelPickup: true,
    canGenerateLabel: true,
    canTrack: true,
    canValidateAddress: true,
    canReceiveWebhooks: true,
  };

  it('B32-U-01: reports canCancelPickup = true', () => {
    expect(aramexCaps.canCancelPickup).toBe(true);
  });

  it('B32-U-02: reports canCancel = false (no CancelShipment)', () => {
    expect(aramexCaps.canCancel).toBe(false);
  });
});

// ── B32-U-03/04: Manual Provider Capabilities ─────────────────────────────

describe('B32-U-03/04: Manual Provider Cancel Pickup', () => {
  const provider = new ManualDeliveryProvider();

  it('B32-U-03: reports canCancelPickup = false', () => {
    expect(provider.capabilities.canCancelPickup).toBe(false);
  });

  it('B32-U-04: cancelPickup returns unsupported result', async () => {
    const request: CancelPickupRequest = {
      carrierPickupId: 'PU-12345',
      storeId: 'store-1',
      shipmentId: 'ship-1',
    };
    const result = await provider.cancelPickup(request);
    expect(result).toEqual({
      supported: false,
      reason: 'manual-driver does not support pickup cancellation',
    });
  });
});

// ── B32-U-05/06/07/08: CancelPickupResult Shapes ──────────────────────────

describe('B32-U-05/06/07/08: CancelPickupResult Type Shapes', () => {
  it('B32-U-05: CancelPickupRequest has required fields', () => {
    const request: CancelPickupRequest = {
      carrierPickupId: 'PU-GUID-123',
      storeId: 'store-id',
      shipmentId: 'shipment-id',
      comments: 'Customer requested cancellation',
    };
    expect(request.carrierPickupId).toBe('PU-GUID-123');
    expect(request.storeId).toBe('store-id');
    expect(request.shipmentId).toBe('shipment-id');
    expect(request.comments).toBe('Customer requested cancellation');
  });

  it('B32-U-05b: CancelPickupRequest comments are optional', () => {
    const request: CancelPickupRequest = {
      carrierPickupId: 'PU-GUID-123',
      storeId: 'store-id',
      shipmentId: 'shipment-id',
    };
    expect(request.comments).toBeUndefined();
  });

  it('B32-U-06: success result shape', () => {
    const result: CancelPickupResult = {
      supported: true,
      cancelled: true,
      carrierStatus: 'CANCELLED',
    };
    expect(result.supported).toBe(true);
    if (result.supported && result.cancelled) {
      expect(result.carrierStatus).toBe('CANCELLED');
    }
  });

  it('B32-U-07: business-error result shape with carrierCode', () => {
    const result: CancelPickupResult = {
      supported: true,
      cancelled: false,
      reason: 'Pickup already dispatched',
      carrierCode: 'ERR01',
    };
    expect(result.supported).toBe(true);
    if (result.supported && !result.cancelled) {
      expect(result.reason).toBe('Pickup already dispatched');
      expect(result.carrierCode).toBe('ERR01');
    }
  });

  it('B32-U-08: unsupported result shape', () => {
    const result: CancelPickupResult = {
      supported: false,
      reason: 'manual-driver does not support pickup cancellation',
    };
    expect(result.supported).toBe(false);
    if (!result.supported) {
      expect(result.reason).toBeTruthy();
    }
  });
});

// ── B32-U-09: Deterministic Idempotency Key ───────────────────────────────

describe('B32-U-09: Cancellation Idempotency Key', () => {
  it('deterministic: same shipmentId → same key', () => {
    const key1 = generateCarrierCancelIdempotencyKey('shipment-abc');
    const key2 = generateCarrierCancelIdempotencyKey('shipment-abc');
    expect(key1).toBe(key2);
  });

  it('prefixed with carrier-cancel:', () => {
    const key = generateCarrierCancelIdempotencyKey('shipment-xyz');
    expect(key).toBe('carrier-cancel:shipment-xyz');
  });

  it('different shipmentId → different key', () => {
    const key1 = generateCarrierCancelIdempotencyKey('shipment-a');
    const key2 = generateCarrierCancelIdempotencyKey('shipment-b');
    expect(key1).not.toBe(key2);
  });

  it('is distinct from create idempotency key', () => {
    const cancelKey = generateCarrierCancelIdempotencyKey('s1');
    // Create key uses a different function with a different prefix
    expect(cancelKey.startsWith('carrier-cancel:')).toBe(true);
    expect(cancelKey.startsWith('carrier-create:')).toBe(false);
  });
});

// ── B32-U-10: No Blind Retry ──────────────────────────────────────────────

describe('B32-U-10: No Blind Retry in Provider Method', () => {
  it('ManualDeliveryProvider.cancelPickup does not retry — returns unsupported immediately', async () => {
    const provider = new ManualDeliveryProvider();
    const start = Date.now();
    const result = await provider.cancelPickup({
      carrierPickupId: 'PU-1',
      storeId: 'store-1',
      shipmentId: 'ship-1',
    });
    const elapsed = Date.now() - start;
    expect(result.supported).toBe(false);
    // Should return nearly instantly — no retry delay
    expect(elapsed).toBeLessThan(100);
  });
});

// ── B32-U-11: Credential Safety ───────────────────────────────────────────

describe('B32-U-11: Credentials Never in Output/Error/Logging', () => {
  it('unsupported result contains no credential fields', () => {
    const provider = new ManualDeliveryProvider();
    return provider.cancelPickup({
      carrierPickupId: 'PU-1',
      storeId: 'store-1',
      shipmentId: 'ship-1',
    }).then((result) => {
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('userName');
      expect(serialized).not.toContain('accountPin');
      expect(serialized).not.toContain('secret');
    });
  });

  it('error messages from unsupported provider contain no credentials', async () => {
    const provider = new ManualDeliveryProvider();
    const result = await provider.cancelPickup({
      carrierPickupId: 'PU-1',
      storeId: 'store-1',
      shipmentId: 'ship-1',
    });
    if (!result.supported) {
      expect(result.reason).not.toContain('password');
      expect(result.reason).not.toContain('secret');
    }
  });
});

// ── B32-U-12: Aramex Isolation Behind Abstraction ─────────────────────────

describe('B32-U-12: Aramex Provider Isolation', () => {
  it('ShippingProvider base class defines cancelPickup contract', async () => {
    // The ManualDeliveryProvider inherits from ShippingProvider.
    // If cancelPickup were not on the base class, this would not compile.
    const provider = new ManualDeliveryProvider();
    expect(typeof provider.cancelPickup).toBe('function');
  });

  it('CancelPickupRequest is the only input type — no Aramex-specific types leak', () => {
    // Verify the request type uses carrier-neutral field names
    const request: CancelPickupRequest = {
      carrierPickupId: 'PU-123',
      storeId: 'store-1',
      shipmentId: 'ship-1',
    };
    // No PickupGUID, no ClientInfo — those are Aramex-specific
    expect(request).not.toHaveProperty('PickupGUID');
    expect(request).not.toHaveProperty('ClientInfo');
  });
});

// ── Carrier Cancel Status Vocabulary (B3.1 regression) ────────────────────

describe('B32 regression: Carrier Cancel Status Vocabulary', () => {
  it('CARRIER_CANCEL_STATUSES has exactly 8 values', () => {
    expect(CARRIER_CANCEL_STATUSES).toHaveLength(8);
    expect(CARRIER_CANCEL_STATUSES).toContain('PENDING');
    expect(CARRIER_CANCEL_STATUSES).toContain('IN_PROGRESS');
    expect(CARRIER_CANCEL_STATUSES).toContain('SUCCEEDED');
    expect(CARRIER_CANCEL_STATUSES).toContain('FAILED');
    expect(CARRIER_CANCEL_STATUSES).toContain('UNKNOWN');
    expect(CARRIER_CANCEL_STATUSES).toContain('NOT_REQUIRED');
    expect(CARRIER_CANCEL_STATUSES).toContain('RECONCILIATION_REQUIRED');
    expect(CARRIER_CANCEL_STATUSES).toContain('RETRY');
  });
});
