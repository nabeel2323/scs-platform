import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CatalogService } from '../../../modules/catalog/catalog.service';
import { ForbiddenException } from '@nestjs/common';
import { PgDialect, type SQL } from 'drizzle-orm/pg-core';

/**
 * Catalog Service — Saved Suppliers unit tests (§21.3 retailer capability).
 *
 * Focus: the store-level analog of product favorites. Verifies
 *  - listSavedSuppliers enriches each save with its store in ONE batched query
 *    (inArray) and drops saves whose store has disappeared,
 *  - saveSupplier is idempotent and 404s on an unknown store,
 *  - removeSavedSupplier is an idempotent no-op that still reports success.
 *
 * CatalogService is instantiated with mocked collaborators; only the
 * saved-supplier query path is exercised here.
 */

// ── Mock builder ──────────────────────────────────────────────────
function createMocks() {
  // select().from().where() chain used by the batched store fetch.
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };

  const db = {
    query: {
      savedSuppliers: { findMany: vi.fn(), findFirst: vi.fn() },
      favorites: { findMany: vi.fn(), findFirst: vi.fn() },
      stores: { findFirst: vi.fn() },
      storeMembers: { findFirst: vi.fn() },
      products: { findFirst: vi.fn() },
    },
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  };

  const withActorContext = vi.fn(async (_context: unknown, operation: () => Promise<unknown>) => operation());
  const mockDb = { db, withActorContext } as any;
  const mockRedis = { client: { get: vi.fn(), set: vi.fn(), del: vi.fn() } } as any;
  const mockOutbox = { publish: vi.fn().mockResolvedValue(undefined) } as any;

  return { db, selectChain, mockDb, mockRedis, mockOutbox, withActorContext };
}

function createService(mocks: ReturnType<typeof createMocks>) {
  return new CatalogService(
    mocks.mockDb,
    mocks.mockRedis,
    mocks.mockOutbox,
    { createPresignedGetUrl: async () => null } as never,
    { record: async () => {} } as never,
    { evaluate: () => ({ effects: new Map(), errors: [] }) } as never,
    { setVariantAttributeValues: async () => [], setProductAttributeValues: async () => [] } as never,
    {} as any, // MerchantXlsxParserService
    {} as any, // ImportValidationService,
    {} as any, // ProductGovernanceService
  );
}

const actor = { sub: 'user-1', role: 'BUYER', activeOrg: 'org-1' };

describe('CatalogService — Saved Suppliers (§21.3)', () => {
  let service: CatalogService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    service = createService(mocks);
  });

  describe('listSavedSuppliers', () => {
    it('returns an empty list without querying stores when nothing is saved', async () => {
      mocks.db.query.savedSuppliers.findMany.mockResolvedValue([]);
      const result = await service.listSavedSuppliers('user-1', actor);
      expect(result).toEqual([]);
      expect(mocks.db.select).not.toHaveBeenCalled();
    });

    it('enriches each save with its store from a single batched query', async () => {
      mocks.db.query.savedSuppliers.findMany.mockResolvedValue([
        { id: 'ss-1', userId: 'user-1', storeId: 'store-A', createdAt: new Date('2026-09-01') },
        { id: 'ss-2', userId: 'user-1', storeId: 'store-B', createdAt: new Date('2026-09-02') },
      ]);
      mocks.selectChain.where.mockResolvedValue([
        { id: 'store-A', displayName: 'Supplier A' },
        { id: 'store-B', displayName: 'Supplier B' },
      ]);

      const result = await service.listSavedSuppliers('user-1');

      // One batched store fetch, not one-per-save (N+1 guard).
      expect(mocks.db.select).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0]!.store).toMatchObject({ id: 'store-A', displayName: 'Supplier A' });
      expect(result[1]!.store).toMatchObject({ id: 'store-B', name: 'Supplier B' });
    });

    it('drops saves whose store no longer exists', async () => {
      mocks.db.query.savedSuppliers.findMany.mockResolvedValue([
        { id: 'ss-1', userId: 'user-1', storeId: 'store-A', createdAt: new Date() },
        { id: 'ss-2', userId: 'user-1', storeId: 'store-GONE', createdAt: new Date() },
      ]);
      mocks.selectChain.where.mockResolvedValue([{ id: 'store-A', name: 'Supplier A' }]);

      const result = await service.listSavedSuppliers('user-1');
      expect(result).toHaveLength(1);
      expect(result[0]!.storeId).toBe('store-A');
    });
  });

  describe('saveSupplier', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      mocks.db.query.stores.findFirst.mockResolvedValue(undefined);
      await expect(service.saveSupplier('user-1', 'store-ghost', actor)).rejects.toThrow(
        /Store not found/,
      );
      expect(mocks.db.insert).not.toHaveBeenCalled();
    });

    it('requires an active verified public store before saving it', async () => {
      mocks.db.query.stores.findFirst.mockResolvedValue({ id: 'store-A' });
      mocks.db.query.savedSuppliers.findFirst.mockResolvedValue(undefined);

      await service.saveSupplier('user-1', 'store-A', actor);

      const where = mocks.db.query.stores.findFirst.mock.calls[0]![0].where as SQL;
      const compiled = new PgDialect().sqlToQuery(where);
      expect(compiled.params).toContain('ACTIVE');
      expect(compiled.params).toContain('VERIFIED');
    });

    it('is idempotent: re-saving returns the existing row without inserting', async () => {
      mocks.db.query.stores.findFirst.mockResolvedValue({ id: 'store-A', name: 'Supplier A' });
      const existing = { id: 'ss-1', userId: 'user-1', storeId: 'store-A', createdAt: new Date() };
      mocks.db.query.savedSuppliers.findFirst.mockResolvedValue(existing);

      const result = await service.saveSupplier('user-1', 'store-A', actor);
      expect(result).toBe(existing);
      expect(mocks.db.insert).not.toHaveBeenCalled();
    });

    it('inserts a new save when the store exists and is not yet saved', async () => {
      mocks.db.query.stores.findFirst.mockResolvedValue({ id: 'store-A', name: 'Supplier A' });
      mocks.db.query.savedSuppliers.findFirst.mockResolvedValue(undefined);

      const result = await service.saveSupplier('user-1', 'store-A');
      expect(mocks.db.insert).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ userId: 'user-1', storeId: 'store-A' });
      expect(result.id).toEqual(expect.any(String));
    });
  });

  it('requires the user id to match the authenticated actor before reading saved suppliers', async () => {
    await expect(service.listSavedSuppliers('another-user', actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mocks.db.query.savedSuppliers.findMany).not.toHaveBeenCalled();
  });

  it('returns only public store projection fields for active verified suppliers', async () => {
    mocks.db.query.savedSuppliers.findMany.mockResolvedValue([
      { id: 'ss-1', userId: 'user-1', storeId: 'store-A', createdAt: new Date() },
    ]);
    mocks.selectChain.where.mockResolvedValue([
      { id: 'store-A', displayName: 'Supplier A', slug: 'supplier-a', logoUrl: 'logo.png', verificationStatus: 'VERIFIED' },
    ]);

    const result = await service.listSavedSuppliers('user-1', actor);

    expect(result[0]!.store).toMatchObject({
      id: 'store-A',
      displayName: 'Supplier A',
      slug: 'supplier-a',
      verificationStatus: 'VERIFIED',
    });
    expect(result[0]!.store).not.toHaveProperty('orgId');
    expect(result[0]!.store).not.toHaveProperty('address');
    expect(result[0]!.store).not.toHaveProperty('metadata');
    const compiled = new PgDialect().sqlToQuery(mocks.selectChain.where.mock.calls[0]![0] as SQL);
    expect(compiled.params).toContain('ACTIVE');
    expect(compiled.params).toContain('VERIFIED');
  });

  describe('Favorites caller visibility', () => {
    it('rejects adding a favorite for a product the caller cannot read', async () => {
      mocks.db.query.products.findFirst.mockResolvedValue({
        id: 'product-private',
        storeId: 'store-A',
        status: 'DRAFT',
      });
      mocks.db.query.stores.findFirst.mockResolvedValue({ orgId: 'org-1' });
      mocks.db.query.storeMembers.findFirst.mockResolvedValue(null);

      await expect(
        service.addFavorite('user-1', 'product-private', actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.db.insert).not.toHaveBeenCalled();
    });

    it('allows favoriting a product only after the caller-readable check succeeds', async () => {
      mocks.db.query.products.findFirst.mockResolvedValue({
        id: 'product-active',
        storeId: 'store-A',
        status: 'ACTIVE',
      });
      mocks.db.query.favorites.findFirst.mockResolvedValue(undefined);

      const result = await service.addFavorite('user-1', 'product-active', actor);

      expect(mocks.db.insert).toHaveBeenCalledOnce();
      expect(result).toMatchObject({ userId: 'user-1', productId: 'product-active' });
    });

    it('does not return unreadable private products in the favorites list', async () => {
      mocks.db.query.favorites.findMany.mockResolvedValue([
        { id: 'fav-1', userId: 'user-1', productId: 'product-private' },
      ]);
      mocks.db.query.products.findFirst.mockResolvedValue({
        id: 'product-private',
        storeId: 'store-A',
        status: 'DRAFT',
      });
      mocks.db.query.stores.findFirst.mockResolvedValue({ orgId: 'org-1' });
      mocks.db.query.storeMembers.findFirst.mockResolvedValue(null);

      await expect(service.listFavorites('user-1', actor)).resolves.toEqual([]);
    });

    it('rejects attempts to mutate another user favorites', async () => {
      await expect(
        service.removeFavorite('another-user', 'product-1', actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mocks.db.delete).not.toHaveBeenCalled();
    });
  });

  describe('removeSavedSupplier', () => {
    it('deletes by (user, store) and reports success even when nothing matched', async () => {
      const result = await service.removeSavedSupplier('user-1', 'store-A', actor);
      expect(mocks.db.delete).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true });
    });
  });
});
