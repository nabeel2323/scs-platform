import 'reflect-metadata';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { TenantDatabaseContextInterceptor } from '../../common/database/tenant-database-context.interceptor';
import { PaymentsController } from './payments.controller';

describe('PaymentsController database actor context', () => {
  it('scopes buyer refund requests to the authenticated actor transaction', () => {
    const interceptors = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      PaymentsController.prototype.requestRefund,
    ) as unknown[] | undefined;

    expect(interceptors).toContain(TenantDatabaseContextInterceptor);
  });

  it('scopes admin refund approvals to the authenticated actor transaction', () => {
    const interceptors = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      PaymentsController.prototype.approveRefund,
    ) as unknown[] | undefined;

    expect(interceptors).toContain(TenantDatabaseContextInterceptor);
  });
});
