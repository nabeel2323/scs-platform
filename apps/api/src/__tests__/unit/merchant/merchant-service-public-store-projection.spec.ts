import { describe, expect, it, vi } from 'vitest';
import { MerchantService } from '../../../modules/merchant/merchant.service';

describe('MerchantService public store projection', () => {
  it('returns only safe fields for active, verified storefronts', async () => {
    const store = {
      id: 'store-a',
      slug: 'store-a',
      displayName: 'Store A',
      description: 'Public description',
      logoUrl: 'https://cdn.example.test/logo.png',
      coverUrl: 'https://cdn.example.test/cover.png',
      currency: 'SAR',
      locale: 'ar',
      hidePopularityBadge: false,
    };
    const findFirst = vi.fn().mockResolvedValue(store);
    const service = new MerchantService(
      { db: { query: { stores: { findFirst } } } } as any,
      {} as any,
      {} as any,
    );

    await expect(service.getPublicStoreBySlug('store-a')).resolves.toEqual(store);

    const query = findFirst.mock.calls[0]?.[0] as { columns?: Record<string, boolean> };
    expect(query.columns).toEqual({
      id: true,
      slug: true,
      displayName: true,
      description: true,
      logoUrl: true,
      coverUrl: true,
      currency: true,
      locale: true,
      hidePopularityBadge: true,
    });
    expect(query.columns).not.toHaveProperty('orgId');
    expect(query.columns).not.toHaveProperty('address');
    expect(query.columns).not.toHaveProperty('metadata');
    expect(query.columns).not.toHaveProperty('verificationStatus');
  });
});
