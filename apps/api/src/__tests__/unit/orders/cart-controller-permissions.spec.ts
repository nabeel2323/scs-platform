import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { PERMISSIONS_KEY } from '../../../common/guards/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CartController } from '../../../modules/orders/cart.controller';

const writeMethods = [
  'addItem',
  'updateItem',
  'removeItem',
  'clearCart',
  'validateCart',
  'removePromo',
  'applyPromo',
] as const;

type Handler = (...args: never[]) => unknown;

function contextFor(handler: Handler, perms: string[]): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => CartController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { sub: 'buyer-1', perms } }),
    }),
  } as unknown as ExecutionContext;
}

describe('CartController permission enforcement', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('runs JWT and permission guards for the cart controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CartController) as unknown[];
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, PermissionsGuard]));
  });

  it.each(writeMethods)('%s requires orders:write', (method) => {
    const handler = CartController.prototype[method];
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['orders:write']);
    expect(() => guard.canActivate(contextFor(handler, []))).toThrow(ForbiddenException);
    expect(guard.canActivate(contextFor(handler, ['orders:write']))).toBe(true);
  });

  it('keeps GET cart as an authenticated self-scoped read', () => {
    const handler = CartController.prototype.getCart;
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toBeUndefined();
    expect(guard.canActivate(contextFor(handler, []))).toBe(true);
  });
});
