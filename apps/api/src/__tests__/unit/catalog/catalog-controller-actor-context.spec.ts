import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { TenantDatabaseContextInterceptor } from '../../../common/database/tenant-database-context.interceptor';
import { CatalogController } from '../../../modules/catalog/catalog.controller';

const DB_ONLY_MUTATIONS = [
  'createCategory',
  'updateCategory',
  'deleteCategory',
  'createBrand',
  'updateBrand',
  'deactivateBrand',
  'createProduct',
  'submitProduct',
  'withdrawProduct',
  'publishProduct',
  'unpublishProduct',
  'setProductAttributeValues',
  'createVariant',
  'updateVariant',
  'setVariantAttributeValues',
  'bulkVariantOperations',
  'bulkProductOperations',
  'reorderMedia',
  'removeMedia',
  'createImportJob',
  'updateImportMapping',
  'cancelImport',
  'retryImportJob',
] as const;

describe('CatalogController database actor boundaries (G-002)', () => {
  it.each(DB_ONLY_MUTATIONS)('%s runs inside the verified user actor context', (methodName) => {
    const descriptor = Object.getOwnPropertyDescriptor(CatalogController.prototype, methodName);
    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, descriptor!.value)).toContain(
      TenantDatabaseContextInterceptor,
    );
  });
});

const DATABASE_SCOPED_READS = [
  'createCategory',
  'listCategories',
  'getCategoryTree',
  'getCategory',
  'listCategoryProductTypes',
  'listCategoryProducts',
  'listCategoryProductTypesForAdmin',
  'updateCategory',
  'deleteCategory',
  'createBrand',
  'listBrandsEnriched',
  'listBrands',
  'getBrand',
  'updateBrand',
  'deactivateBrand',
  'createProduct',
  'listProducts',
  'submitProduct',
  'withdrawProduct',
  'publishProduct',
  'unpublishProduct',
  'getMerchantModerationHistory',
  'getProductAttributeValues',
  'setProductAttributeValues',
  'getVariantMatrix',
  'createVariant',
  'listVariants',
  'updateVariant',
  'getVariantAttributeValues',
  'setVariantAttributeValues',
  'bulkVariantOperations',
  'bulkProductOperations',
  'exportProducts',
  'listStoreVariants',
  'reorderMedia',
  'removeMedia',
  'createImportJob',
  'listImportJobs',
  'getImportJob',
  'updateImportMapping',
  'getImportChunks',
  'cancelImport',
  'retryImportJob',
  'search',
  'getTopCategories',
  'getPopularBrands',
  'findByIdentifiers',
  'searchCanonical',
  'findDuplicates',
] as const;

describe('CatalogController database-only request actor boundaries (G-002)', () => {
  it.each(DATABASE_SCOPED_READS)('%s runs in the verified user actor context', (methodName) => {
    const descriptor = Object.getOwnPropertyDescriptor(CatalogController.prototype, methodName);
    expect(descriptor?.value).toBeDefined();
    expect(Reflect.getMetadata(INTERCEPTORS_METADATA, descriptor!.value)).toContain(
      TenantDatabaseContextInterceptor,
    );
  });
});

const MIXED_DB_PHASE_MUTATIONS = [
  'getProduct',
  'updateProduct',
  'deleteProduct',
  'addMedia',
  'stageImportRows',
  'uploadImportFile',
  'processImportJob',
  'previewImportJob',
  'getImportErrors',
  'listMedia',
  'getSearchFacets',
] as const;

describe('CatalogController mixed operation boundaries (G-002)', () => {
  it.each(MIXED_DB_PHASE_MUTATIONS)(
    '%s does not hold a request-wide actor transaction across cache/audit side effects',
    (methodName) => {
      const descriptor = Object.getOwnPropertyDescriptor(CatalogController.prototype, methodName);
      expect(descriptor?.value).toBeDefined();
      expect(Reflect.getMetadata(INTERCEPTORS_METADATA, descriptor!.value) ?? []).not.toContain(
        TenantDatabaseContextInterceptor,
      );
    },
  );
});
