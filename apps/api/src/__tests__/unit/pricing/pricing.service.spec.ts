import { describe, it, expect } from 'vitest';

/**
 * Pricing Service — Unit Tests
 *
 * Covers:
 * - Price tier resolution logic (min_qty <= qty < max_qty)
 * - Price list priority ordering
 * - Edge cases: no matching tier, qty at boundary, max_qty null (unlimited)
 *
 * These tests verify the pure business logic of price resolution,
 * independent of the database layer.
 */

// ── Price Tier Resolution Logic ───────────────────────────────────

interface PriceTier {
  id: string;
  variantId: string;
  priceListId: string;
  minQty: number;
  maxQty: number | null;
  unitPriceMinor: number;
}

interface PriceList {
  id: string;
  storeId: string;
  name: string;
  isActive: boolean;
  priority: number;
  channel: string;
  audience: string;
  currency: string;
}

/**
 * Resolve the unit price for a variant in a price list at a given quantity.
 * Mirrors the logic in pricing.service.ts resolvePrice().
 *
 * Algorithm:
 * 1. Filter tiers where minQty <= qty AND (maxQty IS NULL OR qty < maxQty)
 * 2. Sort by minQty descending (most specific tier first)
 * 3. Return the first match
 */
function resolvePrice(
  tiers: PriceTier[],
  variantId: string,
  priceListId: string,
  qty: number,
): { unitPriceMinor: number; tierId: string } | null {
  // Filter matching tiers
  const matching = tiers
    .filter(t =>
      t.variantId === variantId &&
      t.priceListId === priceListId &&
      t.minQty <= qty &&
      (t.maxQty === null || qty < t.maxQty)
    )
    .sort((a, b) => b.minQty - a.minQty); // descending by minQty

  const tier = matching[0];
  if (!tier) return null;

  return { unitPriceMinor: tier.unitPriceMinor, tierId: tier.id };
}

/**
 * Get the applicable price lists for a store, ordered by priority.
 * Mirrors pricing.service.ts getProductPricing() list filtering.
 */
function getApplicablePriceLists(lists: PriceList[], storeId: string): PriceList[] {
  return lists
    .filter(l => l.storeId === storeId && l.isActive)
    .sort((a, b) => b.priority - a.priority);
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

describe('Pricing Service — Tier Resolution', () => {
  const variantA = 'variant-a';
  const list1 = 'list-1';

  const tiers: PriceTier[] = [
    { id: 't1', variantId: variantA, priceListId: list1, minQty: 1, maxQty: 10, unitPriceMinor: 1000 },
    { id: 't2', variantId: variantA, priceListId: list1, minQty: 10, maxQty: 50, unitPriceMinor: 900 },
    { id: 't3', variantId: variantA, priceListId: list1, minQty: 50, maxQty: null, unitPriceMinor: 800 },
  ];

  describe('basic tier matching', () => {
    it('should return the first tier for qty=1', () => {
      const result = resolvePrice(tiers, variantA, list1, 1);
      expect(result).toEqual({ unitPriceMinor: 1000, tierId: 't1' });
    });

    it('should return the first tier for qty=5 (within 1-10 range)', () => {
      const result = resolvePrice(tiers, variantA, list1, 5);
      expect(result).toEqual({ unitPriceMinor: 1000, tierId: 't1' });
    });

    it('should return the second tier for qty=10 (boundary)', () => {
      const result = resolvePrice(tiers, variantA, list1, 10);
      expect(result).toEqual({ unitPriceMinor: 900, tierId: 't2' });
    });

    it('should return the second tier for qty=25', () => {
      const result = resolvePrice(tiers, variantA, list1, 25);
      expect(result).toEqual({ unitPriceMinor: 900, tierId: 't2' });
    });

    it('should return the third tier for qty=50 (boundary)', () => {
      const result = resolvePrice(tiers, variantA, list1, 50);
      expect(result).toEqual({ unitPriceMinor: 800, tierId: 't3' });
    });

    it('should return the third tier for qty=1000 (unlimited maxQty)', () => {
      const result = resolvePrice(tiers, variantA, list1, 1000);
      expect(result).toEqual({ unitPriceMinor: 800, tierId: 't3' });
    });
  });

  describe('boundary conditions', () => {
    it('should NOT match tier when qty equals maxQty (exclusive upper bound)', () => {
      // qty=10 should match t2 (minQty=10), NOT t1 (maxQty=10, exclusive)
      const result = resolvePrice(tiers, variantA, list1, 10);
      expect(result!.tierId).toBe('t2');
      expect(result!.unitPriceMinor).toBe(900);
    });

    it('should return null when no tiers match', () => {
      const result = resolvePrice(tiers, 'nonexistent-variant', list1, 5);
      expect(result).toBeNull();
    });

    it('should return null when qty is below all minQty values', () => {
      const highTiers: PriceTier[] = [
        { id: 't10', variantId: variantA, priceListId: list1, minQty: 100, maxQty: null, unitPriceMinor: 500 },
      ];
      const result = resolvePrice(highTiers, variantA, list1, 5);
      expect(result).toBeNull();
    });
  });

  describe('tier selection priority', () => {
    it('should select the highest minQty tier when multiple match', () => {
      // Overlapping tiers: qty=15 matches both t1 (1-10, NO) and t2 (10-50, YES)
      const overlapping: PriceTier[] = [
        { id: 't1', variantId: variantA, priceListId: list1, minQty: 1, maxQty: 20, unitPriceMinor: 1000 },
        { id: 't2', variantId: variantA, priceListId: list1, minQty: 10, maxQty: null, unitPriceMinor: 800 },
      ];
      const result = resolvePrice(overlapping, variantA, list1, 15);
      // t2 has higher minQty (10 > 1), so it wins
      expect(result!.tierId).toBe('t2');
    });

    it('should handle single tier with no maxQty', () => {
      const singleTier: PriceTier[] = [
        { id: 't1', variantId: variantA, priceListId: list1, minQty: 1, maxQty: null, unitPriceMinor: 1500 },
      ];
      expect(resolvePrice(singleTier, variantA, list1, 1)).toEqual({ unitPriceMinor: 1500, tierId: 't1' });
      expect(resolvePrice(singleTier, variantA, list1, 9999)).toEqual({ unitPriceMinor: 1500, tierId: 't1' });
    });
  });

  describe('multi-variant, multi-list', () => {
    const variantB = 'variant-b';
    const list2 = 'list-2';

    const multiTiers: PriceTier[] = [
      { id: 't1', variantId: variantA, priceListId: list1, minQty: 1, maxQty: null, unitPriceMinor: 1000 },
      { id: 't2', variantId: variantB, priceListId: list1, minQty: 1, maxQty: null, unitPriceMinor: 2000 },
      { id: 't3', variantId: variantA, priceListId: list2, minQty: 1, maxQty: null, unitPriceMinor: 1200 },
    ];

    it('should filter by variantId', () => {
      const result = resolvePrice(multiTiers, variantB, list1, 5);
      expect(result!.unitPriceMinor).toBe(2000);
    });

    it('should filter by priceListId', () => {
      const result = resolvePrice(multiTiers, variantA, list2, 5);
      expect(result!.unitPriceMinor).toBe(1200);
    });

    it('should not cross-contaminate between lists', () => {
      const resultA = resolvePrice(multiTiers, variantA, list1, 5);
      const resultB = resolvePrice(multiTiers, variantA, list2, 5);
      expect(resultA!.unitPriceMinor).toBe(1000);
      expect(resultB!.unitPriceMinor).toBe(1200);
    });
  });
});

describe('Pricing Service — Price List Priority', () => {
  const storeId = 'store-1';

  const lists: PriceList[] = [
    { id: 'l1', storeId, name: 'Standard', isActive: true, priority: 0, channel: 'B2B', audience: 'PUBLIC', currency: 'SAR' },
    { id: 'l2', storeId, name: 'VIP', isActive: true, priority: 10, channel: 'B2B', audience: 'SEGMENT', currency: 'SAR' },
    { id: 'l3', storeId, name: 'Flash Sale', isActive: true, priority: 20, channel: 'B2C', audience: 'PUBLIC', currency: 'SAR' },
    { id: 'l4', storeId, name: 'Inactive', isActive: false, priority: 100, channel: 'B2B', audience: 'PUBLIC', currency: 'SAR' },
    { id: 'l5', storeId: 'other-store', name: 'Other', isActive: true, priority: 50, channel: 'B2B', audience: 'PUBLIC', currency: 'SAR' },
  ];

  it('should return only active lists for the given store', () => {
    const applicable = getApplicablePriceLists(lists, storeId);
    expect(applicable).toHaveLength(3);
    expect(applicable.every(l => l.isActive)).toBe(true);
    expect(applicable.every(l => l.storeId === storeId)).toBe(true);
  });

  it('should order by priority descending (highest first)', () => {
    const applicable = getApplicablePriceLists(lists, storeId);
    expect(applicable[0]!.name).toBe('Flash Sale');   // priority 20
    expect(applicable[1]!.name).toBe('VIP');           // priority 10
    expect(applicable[2]!.name).toBe('Standard');      // priority 0
  });

  it('should exclude inactive lists even with high priority', () => {
    const applicable = getApplicablePriceLists(lists, storeId);
    expect(applicable.find(l => l.name === 'Inactive')).toBeUndefined();
  });

  it('should exclude lists from other stores', () => {
    const applicable = getApplicablePriceLists(lists, storeId);
    expect(applicable.find(l => l.storeId === 'other-store')).toBeUndefined();
  });
});

describe('Pricing Service — Edge Cases', () => {
  it('should handle zero quantity', () => {
    const tiers: PriceTier[] = [
      { id: 't1', variantId: 'v1', priceListId: 'l1', minQty: 0, maxQty: null, unitPriceMinor: 500 },
    ];
    const result = resolvePrice(tiers, 'v1', 'l1', 0);
    expect(result!.unitPriceMinor).toBe(500);
  });

  it('should handle minQty = maxQty (empty range — no match)', () => {
    const tiers: PriceTier[] = [
      { id: 't1', variantId: 'v1', priceListId: 'l1', minQty: 10, maxQty: 10, unitPriceMinor: 500 },
    ];
    // minQty=10 <= qty=10, but maxQty=10 means qty < 10 is required → no match
    const result = resolvePrice(tiers, 'v1', 'l1', 10);
    expect(result).toBeNull();
  });

  it('should handle large quantities', () => {
    const tiers: PriceTier[] = [
      { id: 't1', variantId: 'v1', priceListId: 'l1', minQty: 1, maxQty: null, unitPriceMinor: 100 },
    ];
    const result = resolvePrice(tiers, 'v1', 'l1', 999999);
    expect(result!.unitPriceMinor).toBe(100);
  });

  it('should handle zero price', () => {
    const tiers: PriceTier[] = [
      { id: 't1', variantId: 'v1', priceListId: 'l1', minQty: 1, maxQty: null, unitPriceMinor: 0 },
    ];
    const result = resolvePrice(tiers, 'v1', 'l1', 5);
    expect(result!.unitPriceMinor).toBe(0);
  });
});
