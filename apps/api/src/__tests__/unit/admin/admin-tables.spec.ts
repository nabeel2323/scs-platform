import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { PgDialect } from 'drizzle-orm/pg-core';
import { adminTables, AdminTable, buildAdminList, safeUserFields } from '../../../modules/admin/admin-tables';
import { AdminController } from '../../../modules/admin/admin.controller';
import { AdminService } from '../../../modules/admin/admin.service';
import { imageReferences, isProductMediaKey } from '../../../modules/catalog/product-images';
import { PERMISSIONS_KEY } from '../../../common/guards/current-user.decorator';

const dialect = new PgDialect();
describe('admin database-wide query validation', () => {
  it.each(Object.keys(adminTables) as AdminTable[])('%s validates common inputs and stable SQL ordering', name => {
    for (const query of [
      { limit: '0' }, { limit: '101' }, { limit: '1.5' }, { limit: '-1' }, { offset: '-1' },
      { offset: '1e3' }, { sortDir: 'DESC' }, { sortBy: 'id; SELECT 1' }, { dateField: 'passwordHash' },
      { from: '2025-02-30' }, { from: 'tomorrow' }, { from: '2025-03-01', to: '2025-02-01' },
      { search: 'a'.repeat(201) }, { unexpected: 'true' },
    ]) expect(() => buildAdminList(name, query)).toThrow(BadRequestException);
    const built = buildAdminList(name, { search: "x' OR 1=1 --_%", sortBy: 'id', sortDir: 'asc' });
    const compiled = dialect.sqlToQuery(built.rows);
    expect(compiled.sql).toContain('asc nulls last');
    expect(compiled.sql).not.toContain("x' OR 1=1");
    expect(compiled.params).toContain("%x' OR 1=1 --\\_\\%%");
    expect(built.query).toMatchObject({ limit: 50, offset: 0 });
  });
  it('validates entity filters and requires a currency for amounts', () => {
    for (const input of [{ isAvailable: 'yes' }, { hasImages: '1' }, { storeId: 'not-a-uuid' }, { moqMin: '2.5' }, { moqMin: '5', moqMax: '1' }]) {
      expect(() => buildAdminList('products', input)).toThrow(BadRequestException);
    }
    expect(() => buildAdminList('orders', { totalMin: '100' })).toThrow('currency');
    expect(() => buildAdminList('orders', { sortBy: 'totalMinor' })).toThrow('currency');
    expect(() => buildAdminList('orders', { currency: 'sar' })).toThrow();
    expect(() => buildAdminList('categories', { scope: 'private' })).toThrow();
    expect(() => buildAdminList('users', { emailVerified: 'TRUE' })).toThrow();
    expect(safeUserFields).not.toHaveProperty('passwordHash');
  });
});

describe('admin HTTP permission contracts', () => {
  it.each([
    ['listOrders', 'admin:orders:read'], ['listMerchants', 'admin:merchants:read'],
    ['getAuditLogs', 'admin:audit:read'], ['listVerifications', 'admin:merchants:read'],
    ['verificationQueue', 'merchant:verification:review'], ['listUsers', 'admin:users:read'],
    ['listProductsModeration', 'admin:merchants:read'], ['listCategories', 'catalog:categories:write'],
    ['listDisputes', 'support:disputes:resolve'], ['getDispute', 'support:disputes:resolve'],
    ['productMediaPreviews', 'admin:merchants:read'],
  ])('%s retains its permission', (method, permission) => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, (AdminController.prototype as any)[method!])).toEqual([permission]);
  });
  it('POST and PATCH moderation use the same service, DTO behavior and permission', async () => {
    const moderateProduct = vi.fn().mockResolvedValue({ status: 'ACTIVE' });
    const controller = new AdminController({ moderateProduct } as unknown as AdminService);
    const body = { decision: 'APPROVED' as const, reason: 'Reviewed' };
    expect(await controller.moderateProductPost('id', body)).toEqual(await controller.moderateProduct('id', body));
    expect(moderateProduct.mock.calls).toEqual([['id', 'APPROVED', 'Reviewed'], ['id', 'APPROVED', 'Reviewed']]);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.moderateProductPost)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(METHOD_METADATA, controller.moderateProduct)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.moderateProductPost)).toBe(200);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, controller.moderateProductPost)).toEqual(Reflect.getMetadata(PERMISSIONS_KEY, controller.moderateProduct));
  });
});

describe('product image normalization and key restrictions', () => {
  it('deduplicates references without trusting malformed JSON or variants', () => {
    expect(imageReferences([' a ', null, 3, '', '\t', 'a'], [{ mediaType: 'IMAGE', url: ' a' }, { mediaType: 'VIDEO', url: 'video' }])).toEqual(['a']);
    expect(imageReferences({ not: 'array' }, [{ mediaType: 'IMAGE', url: ' b ' }])).toEqual(['b']);
  });
  it.each(['documents/a.pdf', 'products/../a', 'products/./a', 'products//a', 'products/%2e%2e/a', 'products/a?key=x', 'products/a\\b', 'https://example.test/a'])('rejects %s', key => {
    expect(isProductMediaKey(key)).toBe(false);
  });
  it('allows a product media object key', () => expect(isProductMediaKey('products/abc-123/photo.png')).toBe(true));
});
