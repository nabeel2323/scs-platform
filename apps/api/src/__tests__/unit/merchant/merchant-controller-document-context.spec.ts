import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { TenantDatabaseContextInterceptor } from '../../../common/database/tenant-database-context.interceptor';
import { describe, expect, it } from 'vitest';
import { MerchantController } from '../../../modules/merchant/merchant.controller';

describe('MerchantController database-only metadata and review actor context (G-002)', () => {
  it('scopes database-only document registration/listing and verification review handlers', () => {
    const scoped = [
      'uploadDocument',
      'listOrgDocuments',
      'listStoreDocuments',
      'reviewVerification',
    ] as const;
    for (const method of scoped) {
      const handler = MerchantController.prototype[method];
      const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, handler) as unknown[];
      expect(interceptors).toContain(TenantDatabaseContextInterceptor);
    }
  });

  it('keeps object-storage presign handlers outside the request transaction', () => {
    const storageHandlers = [
      'presignDocumentUpload',
      'presignDocument',
      'presignMerchantDocument',
    ] as const;
    for (const method of storageHandlers) {
      const handler = MerchantController.prototype[method];
      const interceptors =
        (Reflect.getMetadata(INTERCEPTORS_METADATA, handler) as unknown[] | undefined) ?? [];
      expect(interceptors).not.toContain(TenantDatabaseContextInterceptor);
    }
  });
});
