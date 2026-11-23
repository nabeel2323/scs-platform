import { describe, expect, it, vi } from 'vitest';
import { ReviewsService } from '../../../modules/reviews/reviews.service';
import { assertStoreInOrg, assertStoreMember } from '../../../common/tenant-scope';

vi.mock('../../../common/tenant-scope', () => ({
  assertStoreInOrg: vi.fn(),
  assertStoreMember: vi.fn(),
  isTenantPrivileged: vi.fn(() => false),
}));

describe('ReviewsService order review visibility', () => {
  it('rejects unrelated users before reading order reviews', async () => {
    const orderFindFirst = vi.fn().mockResolvedValue({ buyerId: 'buyer-a', storeId: 'store-a' });
    const reviewFindMany = vi.fn();
    vi.mocked(assertStoreInOrg).mockRejectedValue(new Error('not in org'));
    const service = new ReviewsService(
      {
        db: {
          query: { orders: { findFirst: orderFindFirst }, reviews: { findMany: reviewFindMany } },
        },
      } as any,
      {} as any,
    );

    await expect(
      service.getReviewsByOrder('order-a', {
        sub: 'attacker',
        role: 'BUYER',
        activeOrg: 'org-b',
      }),
    ).rejects.toThrow('not in org');

    expect(assertStoreMember).not.toHaveBeenCalled();
    expect(reviewFindMany).not.toHaveBeenCalled();
  });

  it('allows the order buyer to read order-linked reviews', async () => {
    const orderFindFirst = vi.fn().mockResolvedValue({ buyerId: 'buyer-a', storeId: 'store-a' });
    const expected = [{ id: 'review-a', orderId: 'order-a' }];
    const reviewFindMany = vi.fn().mockResolvedValue(expected);
    const service = new ReviewsService(
      {
        db: {
          query: { orders: { findFirst: orderFindFirst }, reviews: { findMany: reviewFindMany } },
        },
      } as any,
      {} as any,
    );

    await expect(
      service.getReviewsByOrder('order-a', {
        sub: 'buyer-a',
        role: 'BUYER',
        activeOrg: null,
      }),
    ).resolves.toEqual(expected);
    expect(reviewFindMany).toHaveBeenCalledOnce();
  });
});
