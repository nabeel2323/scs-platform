import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { TenantDatabaseContextInterceptor } from '../../../common/database/tenant-database-context.interceptor';

function createContext(user: Record<string, unknown>) {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

function createDatabase() {
  const database = {
    db: {
      query: {
        organizationMembers: { findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }) },
        organizations: { findFirst: vi.fn().mockResolvedValue({ id: 'org-1' }) },
      },
    },
    withActorContext: vi.fn(async (_actor: unknown, operation: () => Promise<unknown>) => operation()),
  };
  return database as any;
}

describe('TenantDatabaseContextInterceptor active organization boundary', () => {
  it('revalidates active membership before invoking the handler in the actor transaction', async () => {
    const database = createDatabase();
    const interceptor = new TenantDatabaseContextInterceptor(database);
    const next = { handle: vi.fn(() => of('ok')) };

    const result = await lastValueFrom(
      interceptor.intercept(
        createContext({ sub: 'user-1', role: 'MERCHANT_OWNER', activeOrg: 'org-1' }),
        next as any,
      ),
    );

    expect(result).toBe('ok');
    expect(database.withActorContext).toHaveBeenCalledWith(
      {
        actorKind: 'user',
        actorId: 'user-1',
        actorRole: 'MERCHANT_OWNER',
        activeOrgId: 'org-1',
      },
      expect.any(Function),
    );
    expect(database.db.query.organizationMembers.findFirst).toHaveBeenCalledTimes(1);
    expect(database.db.query.organizations.findFirst).toHaveBeenCalledTimes(1);
    expect(next.handle).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the handler for an inactive organization', async () => {
    const database = createDatabase();
    database.db.query.organizations.findFirst.mockResolvedValue(null);
    const interceptor = new TenantDatabaseContextInterceptor(database);
    const next = { handle: vi.fn(() => of('ok')) };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext({ sub: 'user-1', role: 'MERCHANT_OWNER', activeOrg: 'org-1' }),
          next as any,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('does not query membership for a buyer without an active organization', async () => {
    const database = createDatabase();
    const interceptor = new TenantDatabaseContextInterceptor(database);
    const next = { handle: vi.fn(() => of('ok')) };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext({ sub: 'buyer-1', role: 'BUYER', activeOrg: null }),
          next as any,
        ),
      ),
    ).resolves.toBe('ok');
    expect(database.db.query.organizationMembers.findFirst).not.toHaveBeenCalled();
    expect(database.db.query.organizations.findFirst).not.toHaveBeenCalled();
  });

  it('rejects missing verified identity before opening an actor transaction', () => {
    const database = createDatabase();
    const interceptor = new TenantDatabaseContextInterceptor(database);
    const next = { handle: vi.fn(() => of('ok')) };

    expect(() => interceptor.intercept(createContext({}), next as any)).toThrow(UnauthorizedException);
    expect(database.withActorContext).not.toHaveBeenCalled();
    expect(next.handle).not.toHaveBeenCalled();
  });
  it('fails closed for an empty activeOrg claim instead of skipping membership validation', async () => {
    const database = createDatabase();
    const interceptor = new TenantDatabaseContextInterceptor(database);
    const next = { handle: vi.fn(() => of('ok')) };

    await expect(
      lastValueFrom(
        interceptor.intercept(
          createContext({ sub: 'user-1', role: 'MERCHANT_OWNER', activeOrg: '' }),
          next as any,
        ),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(database.db.query.organizationMembers.findFirst).not.toHaveBeenCalled();
    expect(next.handle).not.toHaveBeenCalled();
  });

});
