import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { DatabaseService } from '../../../common/database/database.service';
import { CatalogReviewLookupService } from '../../../modules/catalog/catalog-review-lookup.service';

describe('CatalogReviewLookupService', () => {
  const variantFindFirst = vi.fn();
  let service: CatalogReviewLookupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CatalogReviewLookupService({
      currentActorContext: {
        actorKind: 'user',
        actorId: 'reviewer-user',
        actorRole: 'BUYER',
        activeOrgId: 'org-1',
      },
      db: { query: { productVariants: { findFirst: variantFindFirst } } },
    } as unknown as DatabaseService);
  });

  it('rejects a non-empty lookup without a verified user actor context', async () => {
    const unscoped = new CatalogReviewLookupService({
      db: { query: { productVariants: { findFirst: variantFindFirst } } },
    } as unknown as DatabaseService);

    await expect(unscoped.hasVariantForProduct(['variant-a'], 'product-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('confirms a purchased variant belongs to the reviewed product', async () => {
    variantFindFirst.mockResolvedValue({ id: 'variant-a' });

    await expect(
      service.hasVariantForProduct(['variant-a', 'variant-b'], 'product-a'),
    ).resolves.toBe(true);
    expect(variantFindFirst).toHaveBeenCalledOnce();
  });

  it('returns false when no purchased variants are supplied', async () => {
    await expect(service.hasVariantForProduct([], 'product-a')).resolves.toBe(false);
    expect(variantFindFirst).not.toHaveBeenCalled();
  });

  it('returns false when no purchased variant belongs to the product', async () => {
    variantFindFirst.mockResolvedValue(undefined);

    await expect(service.hasVariantForProduct(['variant-a'], 'product-b')).resolves.toBe(false);
  });

  it('deduplicates purchased variant identifiers before querying', async () => {
    variantFindFirst.mockResolvedValue({ id: 'variant-a' });

    await service.hasVariantForProduct(['variant-a', 'variant-a'], 'product-a');

    expect(variantFindFirst).toHaveBeenCalledOnce();
  });
});
