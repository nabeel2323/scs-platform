/**
 * G-001 — HTTP-level merchant-offer tenant authorization regression.
 *
 * Boots the real Nest controller/router and injects authenticated test identities
 * at the JwtAuthGuard boundary. Tenant helper policy is represented by deterministic
 * store/org/member fixtures so this suite verifies HTTP status mapping, request-user
 * propagation, all three route handlers, and service-call suppression on denial.
 *
 * The companion controller unit test covers helper invocation and missing storeId.
 * This suite does not claim to exercise PostgreSQL; the DB-backed tenant helper
 * integration coverage remains in catalog-lifecycle.e2e.spec.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ForbiddenException, INestApplication, VersioningType } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { CatalogOfferController } from '../../modules/catalog/catalog.offer.controller';
import { CatalogOfferService } from '../../modules/catalog/catalog.offer.service';
import { DatabaseService } from '../../common/database/database.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

vi.mock('../../common/tenant-scope', async () => {
  const actual = await vi.importActual<typeof import('../../common/tenant-scope')>(
    '../../common/tenant-scope',
  );
  const stores = new Map([
    ['store-a', 'org-a'],
    ['store-b', 'org-b'],
  ]);
  const activeMembers = new Set(['merchant-a:store-a', 'merchant-b:store-b']);

  return {
    ...actual,
    assertStoreInOrg: vi.fn(async (_db, caller, storeId: string) => {
      if (['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SYSTEM'].includes(caller.role ?? '')) return;
      if (!stores.has(storeId) || stores.get(storeId) !== caller.activeOrg) {
        throw new ForbiddenException('You do not have access to this store');
      }
    }),
    assertStoreMember: vi.fn(async (_db, caller, storeId: string) => {
      if (['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SYSTEM'].includes(caller.role ?? '')) return;
      if (!activeMembers.has(`${caller.sub}:${storeId}`)) {
        throw new ForbiddenException('You are not authorized for this store');
      }
    }),
  };
});

const routes = [
  '/merchant/offers?storeId=store-a',
  '/merchant/offers/analytics?storeId=store-a',
  '/merchant/offers/analytics/trend?storeId=store-a',
];

type TestIdentity = {
  sub: string;
  role: string;
  activeOrg: string | null;
  perms: string[];
  iat: number;
  exp: number;
};

const identities: Record<string, TestIdentity> = {
  merchantA: {
    sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a',
    perms: [], iat: 1, exp: 2,
  },
  merchantB: {
    sub: 'merchant-b', role: 'MERCHANT_OWNER', activeOrg: 'org-b',
    perms: [], iat: 1, exp: 2,
  },
  inactiveMember: {
    sub: 'merchant-c', role: 'MERCHANT', activeOrg: 'org-a',
    perms: [], iat: 1, exp: 2,
  },
  buyer: {
    sub: 'buyer-1', role: 'BUYER', activeOrg: null,
    perms: [], iat: 1, exp: 2,
  },
  admin: {
    sub: 'admin-1', role: 'SUPER_ADMIN', activeOrg: null,
    perms: [], iat: 1, exp: 2,
  },
};

describe('G-001 merchant offer tenant authorization (HTTP)', () => {
  let app: INestApplication;
  let port: number;
  const service = {
    listOffersForStore: vi.fn().mockResolvedValue([]),
    listOfferAnalytics: vi.fn().mockResolvedValue([]),
    listOfferTrend: vi.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CatalogOfferController],
      providers: [
        { provide: CatalogOfferService, useValue: service },
        { provide: DatabaseService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: any) {
          const request = context.switchToHttp().getRequest();
          const identityKey = String(request.headers['x-test-identity'] ?? '');
          const identity = identities[identityKey];
          if (!identity) return false;
          request.user = identity;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function request(path: string, identity: string) {
    const response = await fetch(`http://127.0.0.1:${port}/v1${path}`, {
      headers: { 'x-test-identity': identity },
    });
    return { status: response.status, body: await response.text() };
  }

  it.each(routes)('allows an active owner/member on their own store: %s', async (path) => {
    const result = await request(path, 'merchantA');
    expect(result.status).toBe(200);
  });

  it.each(routes)('denies Merchant A when targeting Merchant B store: %s', async (path) => {
    const foreignPath = path.replace('store-a', 'store-b');
    const result = await request(foreignPath, 'merchantA');
    expect(result.status).toBe(403);
  });

  it.each(routes)('denies a same-organization user without active store membership: %s', async (path) => {
    const result = await request(path, 'inactiveMember');
    expect(result.status).toBe(403);
  });

  it.each(routes)('denies a buyer on merchant analytics routes: %s', async (path) => {
    const result = await request(path, 'buyer');
    expect(result.status).toBe(403);
  });

  it.each(routes)('preserves platform staff bypass behavior: %s', async (path) => {
    const result = await request(path, 'admin');
    expect(result.status).toBe(200);
  });

  it('never queries offer data after an HTTP authorization denial', async () => {
    const result = await request(routes[0]!, 'merchantB');
    expect(result.status).toBe(403);
    expect(service.listOffersForStore).not.toHaveBeenCalled();
    expect(service.listOfferAnalytics).not.toHaveBeenCalled();
    expect(service.listOfferTrend).not.toHaveBeenCalled();
  });
});
