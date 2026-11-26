import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { CatalogImportController } from '../../../modules/catalog-import/catalog-import.controller';
import { TenantDatabaseContextInterceptor } from '../../../common/database/tenant-database-context.interceptor';

describe('CatalogImportController actor-context metadata', () => {
  it.each(['list', 'detail', 'errors'] as const)(
    'wraps the database-only %s route in verified user actor context',
    (method) => {
      const handler = CatalogImportController.prototype[method];
      const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, handler) as unknown[];

      expect(interceptors).toContain(TenantDatabaseContextInterceptor);
    },
  );

  it('does not wrap in-memory preview or mixed storage/execution routes in a request-wide transaction', () => {
    for (const method of ['preview', 'upload', 'execute', 'retry'] as const) {
      const handler = CatalogImportController.prototype[method];
      const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, handler) as unknown[] | undefined;

      expect(interceptors ?? []).not.toContain(TenantDatabaseContextInterceptor);
    }
  });
});
