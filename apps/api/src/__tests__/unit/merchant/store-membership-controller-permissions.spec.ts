import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES } from '../../../common/database/rbac-seed.data';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/guards/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { StoreMembershipController } from '../../../modules/merchant/store-membership.controller';

type Handler = (...args: never[]) => unknown;

function contextFor(handler: Handler, perms: string[]): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => StoreMembershipController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'merchant-user-1', perms } }),
    }),
  } as unknown as ExecutionContext;
}

describe('StoreMembershipController permission alignment', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('uses the existing merchant store-read permission for member listing', () => {
    const handler = StoreMembershipController.prototype.listMembers;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['merchant:stores:read']);
    expect(PERMISSIONS).toContain('merchant:stores:read');
    expect(() => guard.canActivate(contextFor(handler, []))).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor(handler, ['merchant:stores:read']))).toBe(true);
  });

  it('grants store-read to both merchant owner and staff roles', () => {
    const owner = ROLES.find((role) => role.key === 'MERCHANT_OWNER');
    const staff = ROLES.find((role) => role.key === 'MERCHANT_STAFF');
    expect(owner?.permissions).toContain('merchant:stores:read');
    expect(staff?.permissions).toContain('merchant:stores:read');
  });

  it('retains JWT authentication at controller level and permission guard at the route', () => {
    const classGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      StoreMembershipController,
    ) as unknown[];
    const methodGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      StoreMembershipController.prototype.listMembers,
    ) as unknown[];
    expect(classGuards).toContain(JwtAuthGuard);
    expect(methodGuards).toContain(PermissionsGuard);
  });
});
