import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES } from '../../../common/database/rbac-seed.data';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/guards/current-user.decorator';
import { CatalogController } from '../../../modules/catalog/catalog.controller';

const merchantReadMethods = [
  'getMerchantModerationHistory',
  'listImportJobs',
  'getImportJob',
  'getImportChunks',
  'getImportErrors',
] as const;

function contextFor(handler: Function, perms: string[]): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => CatalogController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'merchant-user-1', perms } }),
    }),
  } as unknown as ExecutionContext;
}

describe('CatalogController merchant read permission alignment', () => {
  const guard = new PermissionsGuard(new Reflector());

  it.each(merchantReadMethods)('%s requires the canonical catalog read permission', (method) => {
    const handler = CatalogController.prototype[method];
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['catalog:products:read']);
    expect(() => guard.canActivate(contextFor(handler, []))).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor(handler, ['catalog:products:read']))).toBe(true);
  });

  it('uses a permission present in the canonical seed and merchant roles', () => {
    expect(PERMISSIONS).toContain('catalog:products:read');
    for (const roleKey of ['MERCHANT_OWNER', 'MERCHANT_STAFF']) {
      const role = ROLES.find((candidate) => candidate.key === roleKey);
      expect(role?.permissions).toContain('catalog:products:read');
    }
  });
});
