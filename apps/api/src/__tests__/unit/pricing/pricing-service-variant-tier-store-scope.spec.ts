import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { PricingService } from '../../../modules/pricing/pricing.service';
import { priceLists } from '../../../modules/pricing/pricing.schema';

describe('PricingService variant tier store scope', () => {
  it('requires a store scope for every variant-tier query, including a specific list', async () => {
    const service = new PricingService({ db: {} } as any, {} as any);
    await expect(service.listTiersByVariant('variant-a')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.listTiersByVariant('variant-a', 'list-a')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters cross-list variant tiers to the owning store', async () => {
    const rows = [{
      id: 'tier-a',
      priceListId: 'list-a',
      variantId: 'variant-a',
      minQty: 1,
      maxQty: null,
      unitPriceMinor: 1000,
    }];
    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ orderBy });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    const select = vi.fn().mockReturnValue({ from });
    const service = new PricingService({ db: { select } } as any, {} as any);

    await expect(
      service.listTiersByVariant('variant-a', undefined, 'store-a'),
    ).resolves.toEqual(rows);

    expect(innerJoin).toHaveBeenCalledWith(priceLists, expect.anything());
    const query = new PgDialect().sqlToQuery(where.mock.calls[0]![0]);
    expect(query.params).toContain('variant-a');
    expect(query.params).toContain('store-a');
  });
});
