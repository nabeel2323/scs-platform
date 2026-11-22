import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReviewsService } from '../../../modules/reviews/reviews.service';

function createService(overrides: Record<string, unknown> = {}) {
  const orderFindFirst = vi.fn().mockResolvedValue({
    id: 'order-a',
    buyerId: 'buyer-a',
    storeId: 'store-a',
    status: 'DELIVERED',
  });
  const orderItemsFindMany = vi.fn().mockResolvedValue([{ variantId: 'variant-a' }]);
  const productVariantFindFirst = vi.fn().mockResolvedValue(null);
  const insert = vi.fn();
  const db = {
    db: {
      query: {
        orders: { findFirst: orderFindFirst },
        orderItems: { findMany: orderItemsFindMany },
        productVariants: { findFirst: productVariantFindFirst },
        reviews: { findFirst: vi.fn() },
      },
      insert,
    },
  };
  const service = new ReviewsService(db as any, { publish: vi.fn() } as any);
  return { service, orderFindFirst, orderItemsFindMany, productVariantFindFirst, insert, ...overrides };
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
    expect(h.orderItemsFindMany).not.toHaveBeenCalled();
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
    expect(h.orderItemsFindMany).toHaveBeenCalledOnce();
    expect(h.productVariantFindFirst).toHaveBeenCalledOnce();
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
