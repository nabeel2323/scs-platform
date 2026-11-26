import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { TenantDatabaseContextInterceptor } from '../../../common/database/tenant-database-context.interceptor';
import { CatalogOfferController } from '../../../modules/catalog/catalog.offer.controller';
import { CatalogRequestsController } from '../../../modules/catalog/catalog.requests.controller';
import { CatalogTaxonomyController } from '../../../modules/catalog/catalog.taxonomy.controller';
import { PricingController } from '../../../modules/pricing/pricing.controller';
import { ReviewsController } from '../../../modules/reviews/reviews.controller';

describe('Catalog-adjacent controller actor coverage (G-002)', () => {
  it.each([
    ['CatalogOfferController', CatalogOfferController],
    ['CatalogRequestsController', CatalogRequestsController],
    ['CatalogTaxonomyController', CatalogTaxonomyController],
    ['PricingController', PricingController],
    ['ReviewsController', ReviewsController],
  ])('%s establishes a verified actor context for its database operations', (_name, controller) => {
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, controller) ?? []).toContain(
      TenantDatabaseContextInterceptor,
    );
  });
});
