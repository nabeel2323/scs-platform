import { describe, expect, it, vi } from 'vitest';
import { resolveCarrierShipmentTenantContext } from '../../../modules/shipping/carrier-shipment-tenant-context';

describe('resolveCarrierShipmentTenantContext', () => {
  function setup(store: { id: string; orgId: string | null } | null, orderStoreId?: string) {
    const scopes: Array<string | null> = [];
    const findFirst = vi.fn().mockResolvedValue(orderStoreId ? { storeId: orderStoreId } : undefined);
    const withWorkerContext = vi.fn(async (operation: () => Promise<unknown>, activeOrgId?: string) => {
      scopes.push(activeOrgId ?? null);
      return operation();
    });
    const merchant = { getStoreTenantContextForSystem: vi.fn().mockResolvedValue(store) };
    const db = { db: { query: { orders: { findFirst } } } };
    return { scopes, findFirst, withWorkerContext, merchant, db };
  }

  it('resolves the authoritative store org and verifies order/store lineage in that org scope', async () => {
    const deps = setup({ id: 'store-a', orgId: 'org-a' }, 'store-a');
    await expect(resolveCarrierShipmentTenantContext(
      { order_id: 'order-a', store_id: 'store-a' }, deps as any,
    )).resolves.toEqual({ orgId: 'org-a', storeId: 'store-a', orderId: 'order-a' });
    expect(deps.scopes).toEqual([null, 'org-a']);
    expect(deps.findFirst).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the store is missing or has no organization', async () => {
    for (const store of [null, { id: 'store-a', orgId: null }]) {
      const deps = setup(store);
      await expect(resolveCarrierShipmentTenantContext(
        { orderId: 'order-a', storeId: 'store-a' }, deps as any,
      )).resolves.toBeNull();
      expect(deps.findFirst).not.toHaveBeenCalled();
    }
  });

  it('fails closed when the order belongs to a different store', async () => {
    const deps = setup({ id: 'store-a', orgId: 'org-a' }, 'store-b');
    await expect(resolveCarrierShipmentTenantContext(
      { orderId: 'order-a', storeId: 'store-a' }, deps as any,
    )).resolves.toBeNull();
    expect(deps.scopes).toEqual([null, 'org-a']);
  });

  it('rejects incomplete shipment lineage without querying store ownership', async () => {
    const deps = setup({ id: 'store-a', orgId: 'org-a' }, 'store-a');
    await expect(resolveCarrierShipmentTenantContext(
      { orderId: 'order-a' }, deps as any,
    )).resolves.toBeNull();
    expect(deps.merchant.getStoreTenantContextForSystem).not.toHaveBeenCalled();
    expect(deps.findFirst).not.toHaveBeenCalled();
  });
});
