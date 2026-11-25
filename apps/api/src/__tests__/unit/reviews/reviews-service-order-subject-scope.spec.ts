import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReviewsService } from '../../../modules/reviews/reviews.service';

function createService() {
  const getOrder = vi.fn().mockResolvedValue({
    id: 'order-a',
    buyerId: 'buyer-a',
    storeId: 'store-a',
    status: 'DELIVERED',
  });
  const listPurchasedVariantIds = vi.fn().mockResolvedValue(['variant-a']);
  const hasVariantForProduct = vi.fn().mockResolvedValue(false);
  const reviewFindFirst = vi.fn();
  const insert = vi.fn();
  const service = new ReviewsService(
    { db: { query: { reviews: { findFirst: reviewFindFirst } }, insert } } as any,
    { publish: vi.fn() } as any,
    { getOrder, listPurchasedVariantIds } as any,
    { hasVariantForProduct } as any,
  );
  return { service, getOrder, listPurchasedVariantIds, hasVariantForProduct, insert };
}

describe('ReviewsService order subject ownership', () => {
  it('rejects a reviewer who is not the order buyer', async () => {
    const h = createService();

    await expect(
      h.service.createReview({
        orderId: 'order-a',
        reviewerId: 'attacker',
        subjectId: 'store-a',
        subjectType: 'STORE',
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.getOrder).toHaveBeenCalledWith('order-a');
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects a store review targeting a store not present on the order', async () => {
    const h = createService();

    await expect(
      h.service.createReview({
        orderId: 'order-a',
        reviewerId: 'buyer-a',
        subjectId: 'store-b',
        subjectType: 'STORE',
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.listPurchasedVariantIds).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('preserves the empty-order-lines validation before product lookup', async () => {
    const h = createService();
    h.listPurchasedVariantIds.mockResolvedValue([]);

    await expect(
      h.service.createReview({
        orderId: 'order-a',
        reviewerId: 'buyer-a',
        subjectId: 'product-a',
        subjectType: 'PRODUCT',
        rating: 5,
      }),
    ).rejects.toThrow('The order contains no reviewable product lines');

    expect(h.hasVariantForProduct).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects a product review when none of the order variants belong to that product', async () => {
    const h = createService();

    await expect(
      h.service.createReview({
        orderId: 'order-a',
        reviewerId: 'buyer-a',
        subjectId: 'product-b',
        subjectType: 'PRODUCT',
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.listPurchasedVariantIds).toHaveBeenCalledWith('order-a');
    expect(h.hasVariantForProduct).toHaveBeenCalledWith(['variant-a'], 'product-b');
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects unsupported review subject types', async () => {
    const h = createService();

    await expect(
      h.service.createReview({
        orderId: 'order-a',
        reviewerId: 'buyer-a',
        subjectId: 'store-a',
        subjectType: 'USER' as any,
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(h.insert).not.toHaveBeenCalled();
  });
});
