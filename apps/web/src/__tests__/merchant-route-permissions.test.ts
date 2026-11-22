import { describe, expect, it } from 'vitest';
import {
  canAccessMerchantRoute,
  filterMerchantNavigation,
  merchantRoutePermission,
} from '../lib/merchant-route-permissions';

describe('merchant route permission policy', () => {
  it.each([
    ['/merchant/catalog', 'catalog:products:read'],
    ['/merchant/orders', 'merchant:orders:read'],
    ['/merchant/deliveries', 'fulfillment:shipments:read'],
    ['/merchant/inventory', 'merchant:inventory:read'],
    ['/merchant/pricing', 'merchant:pricing:read'],
    ['/merchant/pricing/list-1', 'merchant:pricing:read'],
    ['/merchant/offers/new', 'catalog:offers:write'],
    ['/merchant/offers', 'merchant:stores:read'],
    ['/merchant/offers/offer-1', 'merchant:stores:read'],
    ['/merchant/customers', 'merchant:orders:read'],
    ['/merchant/store', 'merchant:stores:read'],
    ['/merchant/warehouses', 'merchant:stores:read'],
    ['/merchant/import', 'merchant:products:write'],
    ['/merchant/product-studio', 'merchant:products:write'],
    ['/merchant/product-studio/product-1/edit', 'merchant:products:write'],
    ['/merchant/promotions', 'merchant:promotions:write'],
    ['/merchant/returns', 'merchant:orders:read'],
    ['/merchant/organization', 'merchant:stores:read'],
    ['/merchant/requests', 'catalog:offers:write'],
  ])('maps %s to %s', (path, permission) => {
    expect(merchantRoutePermission(path)).toBe(permission);
    expect(canAccessMerchantRoute(path, [permission])).toBe(true);
    expect(canAccessMerchantRoute(path, [])).toBe(false);
  });

  it('requires store read access for the dashboard and leaves onboarding role-open', () => {
    expect(merchantRoutePermission('/merchant')).toBe('merchant:stores:read');
    expect(canAccessMerchantRoute('/merchant', ['merchant:stores:read'])).toBe(true);
    expect(canAccessMerchantRoute('/merchant', [])).toBe(false);
    expect(merchantRoutePermission('/merchant/register')).toBeNull();
    expect(merchantRoutePermission('/merchant/onboard')).toBeNull();
    expect(merchantRoutePermission('/merchant/success')).toBeNull();
  });

  it('filters navigation using the active organization permission projection', () => {
    const visible = filterMerchantNavigation([
      'merchant:orders:read',
      'merchant:stores:read',
    ]);
    expect(visible.map((item) => item.href)).toEqual([
      '/merchant',
      '/merchant/orders',
      '/merchant/offers',
      '/merchant/customers',
      '/merchant/store',
      '/merchant/warehouses',
      '/merchant/returns',
      '/merchant/organization',
    ]);
  });
});
