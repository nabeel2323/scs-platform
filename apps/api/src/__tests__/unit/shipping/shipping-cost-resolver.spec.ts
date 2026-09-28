import { describe, expect, it } from 'vitest';
import {
  resolveShippingCost,
  matchDeliveryZone,
  DeliveryZoneRow,
} from '../../../modules/shipping/shipping-cost.resolver';

/**
 * Unit tests for M7.2.2 shipping cost resolver and zone matching.
 *
 * Tests cover:
 * - resolveShippingCost: AVAILABLE, UNAVAILABLE, FREE outcomes
 * - resolveShippingCost: boundary conditions (exact thresholds)
 * - resolveShippingCost: no minimum / no free threshold
 * - matchDeliveryZone: postal code > city > region > country precedence
 * - matchDeliveryZone: inactive zones excluded
 * - matchDeliveryZone: no match returns null
 */

// ── resolveShippingCost ────────────────────────────────────────────────────

describe('resolveShippingCost', () => {
  it('returns AVAILABLE with base fee when no thresholds are set', () => {
    const result = resolveShippingCost({
      subtotalMinor: 10000,
      baseFeeMinor: 1500,
      minOrderMinor: null,
      freeAboveMinor: null,
    });
    expect(result.status).toBe('AVAILABLE');
    expect(result.feeMinor).toBe(1500);
  });

  it('returns UNAVAILABLE when subtotal is below minimum', () => {
    const result = resolveShippingCost({
      subtotalMinor: 5000,
      baseFeeMinor: 1500,
      minOrderMinor: 10000,
      freeAboveMinor: null,
    });
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.feeMinor).toBe(0);
    expect(result.reason).toContain('Minimum order');
  });

  it('returns AVAILABLE when subtotal exactly meets minimum', () => {
    const result = resolveShippingCost({
      subtotalMinor: 10000,
      baseFeeMinor: 1500,
      minOrderMinor: 10000,
      freeAboveMinor: null,
    });
    expect(result.status).toBe('AVAILABLE');
    expect(result.feeMinor).toBe(1500);
  });

  it('returns FREE when subtotal meets free threshold', () => {
    const result = resolveShippingCost({
      subtotalMinor: 50000,
      baseFeeMinor: 1500,
      minOrderMinor: null,
      freeAboveMinor: 50000,
    });
    expect(result.status).toBe('FREE');
    expect(result.feeMinor).toBe(0);
  });

  it('returns AVAILABLE when subtotal is just below free threshold', () => {
    const result = resolveShippingCost({
      subtotalMinor: 49999,
      baseFeeMinor: 1500,
      minOrderMinor: null,
      freeAboveMinor: 50000,
    });
    expect(result.status).toBe('AVAILABLE');
    expect(result.feeMinor).toBe(1500);
  });

  it('returns UNAVAILABLE when minOrder not met, even if free threshold exists', () => {
    const result = resolveShippingCost({
      subtotalMinor: 3000,
      baseFeeMinor: 1500,
      minOrderMinor: 10000,
      freeAboveMinor: 50000,
    });
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.feeMinor).toBe(0);
  });

  it('returns FREE when both min and free thresholds are met', () => {
    const result = resolveShippingCost({
      subtotalMinor: 60000,
      baseFeeMinor: 1500,
      minOrderMinor: 10000,
      freeAboveMinor: 50000,
    });
    expect(result.status).toBe('FREE');
    expect(result.feeMinor).toBe(0);
  });

  it('handles zero base fee', () => {
    const result = resolveShippingCost({
      subtotalMinor: 10000,
      baseFeeMinor: 0,
      minOrderMinor: null,
      freeAboveMinor: null,
    });
    expect(result.status).toBe('AVAILABLE');
    expect(result.feeMinor).toBe(0);
  });

  it('clamps negative base fee to 0', () => {
    const result = resolveShippingCost({
      subtotalMinor: 10000,
      baseFeeMinor: -500,
      minOrderMinor: null,
      freeAboveMinor: null,
    });
    expect(result.feeMinor).toBe(0);
  });

  it('rounds fractional base fee to integer', () => {
    const result = resolveShippingCost({
      subtotalMinor: 10000,
      baseFeeMinor: 1500.7,
      minOrderMinor: null,
      freeAboveMinor: null,
    });
    expect(result.feeMinor).toBe(1501);
  });
});

// ── matchDeliveryZone ──────────────────────────────────────────────────────

describe('matchDeliveryZone', () => {
  const makeZone = (overrides: Partial<DeliveryZoneRow>): DeliveryZoneRow => ({
    id: overrides.id || 'zone-1',
    storeId: overrides.storeId || 'store-1',
    name: overrides.name || 'Test Zone',
    city: overrides.city ?? null,
    region: overrides.region ?? null,
    postalCode: overrides.postalCode ?? null,
    country: overrides.country || 'SA',
    isActive: overrides.isActive ?? true,
  });

  it('returns null when no zones exist', () => {
    expect(matchDeliveryZone([], { city: 'Riyadh' })).toBeNull();
  });

  it('returns null when all zones are inactive', () => {
    const zones = [makeZone({ city: 'Riyadh', isActive: false })];
    expect(matchDeliveryZone(zones, { city: 'Riyadh', country: 'SA' })).toBeNull();
  });

  it('matches by postal code (highest priority)', () => {
    const zones = [
      makeZone({ id: 'z1', city: 'Riyadh', country: 'SA' }),
      makeZone({ id: 'z2', postalCode: '12345', country: 'SA' }),
    ];
    const result = matchDeliveryZone(zones, { postalCode: '12345', city: 'Riyadh', country: 'SA' });
    expect(result?.id).toBe('z2');
  });

  it('matches by city + country when no postal code', () => {
    const zones = [
      makeZone({ id: 'z1', city: 'Riyadh', country: 'SA' }),
      makeZone({ id: 'z2', city: 'Jeddah', country: 'SA' }),
    ];
    const result = matchDeliveryZone(zones, { city: 'Riyadh', country: 'SA' });
    expect(result?.id).toBe('z1');
  });

  it('matches by country only (lowest priority)', () => {
    const zones = [
      makeZone({ id: 'z1', country: 'SA' }), // country-only zone
      makeZone({ id: 'z2', city: 'Riyadh', country: 'SA' }),
    ];
    // Address with country but no city/postal
    const result = matchDeliveryZone(zones, { country: 'SA' });
    expect(result?.id).toBe('z1');
  });

  it('returns null when no zone matches the address', () => {
    const zones = [
      makeZone({ city: 'Riyadh', country: 'SA' }),
    ];
    const result = matchDeliveryZone(zones, { city: 'Dubai', country: 'AE' });
    expect(result).toBeNull();
  });

  it('is case-insensitive for city matching', () => {
    const zones = [
      makeZone({ city: 'riyadh', country: 'SA' }),
    ];
    const result = matchDeliveryZone(zones, { city: 'Riyadh', country: 'SA' });
    expect(result).not.toBeNull();
  });

  it('is case-insensitive for postal code matching', () => {
    const zones = [
      makeZone({ postalCode: 'ABCD', country: 'SA' }),
    ];
    const result = matchDeliveryZone(zones, { postalCode: 'abcd', country: 'SA' });
    expect(result).not.toBeNull();
  });
});
