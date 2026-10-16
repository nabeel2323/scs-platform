import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

/**
 * M7.2.2: Tests for the per-store checkout fingerprint algorithm.
 *
 * These tests replicate the fingerprint computation logic to verify that:
 * - Same selections in different array order produce the same fingerprint
 * - Different selections produce different fingerprints
 * - Adding a shipping method ID changes the fingerprint
 * - The fingerprint includes all relevant data (items, selections, address)
 *
 * The actual computeCheckoutFingerprint is a private method on OrdersService,
 * so we replicate the algorithm here and test the invariants.
 */

// Replicate the fingerprint algorithm from OrdersService.computeCheckoutFingerprint
function computeFingerprint(
  items: Array<{ variantId: string; quantity: number; offerId: string | null }>,
  deliveryAddress: Record<string, unknown>,
  selectionsByStore: Map<string, { fulfillmentMethod: string; shippingMethodId?: string }>,
): string {
  const sorted = [...items].sort((a, b) => {
    const aKey = `${a.variantId}|${a.offerId || ''}`;
    const bKey = `${b.variantId}|${b.offerId || ''}`;
    return aKey.localeCompare(bKey);
  });
  const lines = sorted.map(i => `${i.variantId}:${i.quantity}:${i.offerId || ''}`).join(',');
  const addr = JSON.stringify(deliveryAddress, Object.keys(deliveryAddress).sort());

  const shippingSegment = [...selectionsByStore.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([storeId, sel]) => `${storeId}:${sel.fulfillmentMethod}:${sel.shippingMethodId || ''}`)
    .join(';');

  return createHash('sha256')
    .update(`${lines}|${shippingSegment}|${addr}`)
    .digest('hex')
    .slice(0, 64);
}

describe('M7.2.2 Checkout Fingerprint', () => {
  const baseItems = [
    { variantId: 'v1', quantity: 2, offerId: 'o1' },
    { variantId: 'v2', quantity: 1, offerId: null },
  ];
  const baseAddress = { street: '123 Main St', city: 'Riyadh' };

  it('produces the same fingerprint for same selections in different order', () => {
    const selectionsA = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY', shippingMethodId: 'sm1' }],
      ['storeB', { fulfillmentMethod: 'PICKUP' }],
    ]);
    const selectionsB = new Map([
      ['storeB', { fulfillmentMethod: 'PICKUP' }],
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY', shippingMethodId: 'sm1' }],
    ]);

    const fpA = computeFingerprint(baseItems, baseAddress, selectionsA);
    const fpB = computeFingerprint(baseItems, baseAddress, selectionsB);
    expect(fpA).toBe(fpB);
  });

  it('produces different fingerprints for different fulfillment methods', () => {
    const selections1 = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY' }],
    ]);
    const selections2 = new Map([
      ['storeA', { fulfillmentMethod: 'PICKUP' }],
    ]);

    const fp1 = computeFingerprint(baseItems, baseAddress, selections1);
    const fp2 = computeFingerprint(baseItems, baseAddress, selections2);
    expect(fp1).not.toBe(fp2);
  });

  it('produces different fingerprints for different shipping method IDs', () => {
    const selections1 = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY', shippingMethodId: 'sm-standard' }],
    ]);
    const selections2 = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY', shippingMethodId: 'sm-express' }],
    ]);

    const fp1 = computeFingerprint(baseItems, baseAddress, selections1);
    const fp2 = computeFingerprint(baseItems, baseAddress, selections2);
    expect(fp1).not.toBe(fp2);
  });

  it('produces different fingerprints when a shipping method is added vs absent', () => {
    const selections1 = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY' }],
    ]);
    const selections2 = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY', shippingMethodId: 'sm1' }],
    ]);

    const fp1 = computeFingerprint(baseItems, baseAddress, selections1);
    const fp2 = computeFingerprint(baseItems, baseAddress, selections2);
    expect(fp1).not.toBe(fp2);
  });

  it('produces different fingerprints for different addresses', () => {
    const selections = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY' }],
    ]);
    const addr1 = { street: '123 Main St', city: 'Riyadh' };
    const addr2 = { street: '456 Other St', city: 'Jeddah' };

    const fp1 = computeFingerprint(baseItems, addr1, selections);
    const fp2 = computeFingerprint(baseItems, addr2, selections);
    expect(fp1).not.toBe(fp2);
  });

  it('produces different fingerprints for different cart items', () => {
    const selections = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY' }],
    ]);
    const items1 = [{ variantId: 'v1', quantity: 2, offerId: 'o1' }];
    const items2 = [{ variantId: 'v1', quantity: 3, offerId: 'o1' }]; // different qty

    const fp1 = computeFingerprint(items1, baseAddress, selections);
    const fp2 = computeFingerprint(items2, baseAddress, selections);
    expect(fp1).not.toBe(fp2);
  });

  it('produces different fingerprints for different store sets', () => {
    const selections1 = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY' }],
    ]);
    const selections2 = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY' }],
      ['storeB', { fulfillmentMethod: 'PLATFORM_DELIVERY' }],
    ]);

    const fp1 = computeFingerprint(baseItems, baseAddress, selections1);
    const fp2 = computeFingerprint(baseItems, baseAddress, selections2);
    expect(fp1).not.toBe(fp2);
  });

  it('produces a 64-character hex string', () => {
    const selections = new Map([
      ['storeA', { fulfillmentMethod: 'PLATFORM_DELIVERY' }],
    ]);
    const fp = computeFingerprint(baseItems, baseAddress, selections);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});
