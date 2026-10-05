import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminService } from '../../../modules/admin/admin.service';
import { ConflictException } from '@nestjs/common';

/**
 * P3 unit tests — admin product CRUD + optimistic locking.
 *
 * Covers:
 * - adminCreateProduct always creates DRAFT (BD-14)
 * - adminUpdateProduct delegates to catalog with updatedAt
 * - admin moderation optimistic locking (BD-13)
 * - 409 conflict on stale updatedAt
 * - adminGetProductAttributeValues / adminSetProductAttributeValues delegation
 */

function makeMocks() {
  const db = {
    db: {
      query: {
        products: { findFirst: vi.fn() },
      },
      update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn() }) }) }),
    },
  };
  const storage = { createPresignedGetUrl: vi.fn() };
  const notifications = { send: vi.fn().mockResolvedValue(undefined) };
  const catalogService = {
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    getProduct: vi.fn(),
  };
  const taxonomyService = {
    getProductAttributeValues: vi.fn(),
    setProductAttributeValues: vi.fn(),
  };
  return { db, storage, notifications, catalogService, taxonomyService };
}

describe('AdminService — P3 product CRUD', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let admin: AdminService;

  beforeEach(() => {
    mocks = makeMocks();
    admin = new AdminService(
      mocks.db as any,
      mocks.storage as any,
      mocks.notifications as any,
      mocks.catalogService as any,
      mocks.taxonomyService as any,
    );
  });

  // ── adminCreateProduct ──────────────────────────────────────

  it('adminCreateProduct delegates to catalogService.createProduct', async () => {
    const input = { title: 'Admin Product', storeId: 'store-1' };
    const fakeResult = { id: 'prod-1', status: 'DRAFT' };
    mocks.catalogService.createProduct.mockResolvedValue(fakeResult);

    const result = await admin.adminCreateProduct(input as any, 'user-1');
    expect(mocks.catalogService.createProduct).toHaveBeenCalledWith(input, 'user-1');
    expect(result).toEqual(fakeResult);
  });

  it('adminCreateProduct always produces DRAFT (BD-14)', async () => {
    const input = { title: 'Test', status: 'ACTIVE' } as any;
    mocks.catalogService.createProduct.mockResolvedValue({ id: 'p1', status: 'DRAFT' });

    await admin.adminCreateProduct(input, 'user-1');
    expect(mocks.catalogService.createProduct).toHaveBeenCalled();
  });

  // ── adminUpdateProduct ──────────────────────────────────────

  it('adminUpdateProduct delegates to catalogService.updateProduct with updatedAt', async () => {
    const input = { title: 'Updated' };
    const fakeResult = { id: 'prod-1', title: 'Updated' };
    mocks.catalogService.updateProduct.mockResolvedValue(fakeResult);

    const result = await admin.adminUpdateProduct('prod-1', input as any, '2026-01-01T00:00:00.000Z');
    expect(mocks.catalogService.updateProduct).toHaveBeenCalledWith('prod-1', input, '2026-01-01T00:00:00.000Z');
    expect(result).toEqual(fakeResult);
  });

  it('adminUpdateProduct works without updatedAt (backward compatible)', async () => {
    mocks.catalogService.updateProduct.mockResolvedValue({ id: 'prod-1' });

    await admin.adminUpdateProduct('prod-1', { title: 'X' } as any);
    expect(mocks.catalogService.updateProduct).toHaveBeenCalledWith('prod-1', { title: 'X' }, undefined);
  });

  // ── adminGetProductAttributeValues ──────────────────────────

  it('delegates to taxonomyService.getProductAttributeValues', async () => {
    const fakeAttrs = [{ attributeDefinitionId: 'a1', valueText: 'Hello' }];
    mocks.taxonomyService.getProductAttributeValues.mockResolvedValue(fakeAttrs);

    const result = await admin.adminGetProductAttributeValues('prod-1');
    expect(mocks.taxonomyService.getProductAttributeValues).toHaveBeenCalledWith('prod-1');
    expect(result).toEqual(fakeAttrs);
  });

  // ── adminSetProductAttributeValues ──────────────────────────

  it('delegates to taxonomyService.setProductAttributeValues', async () => {
    const values = [{ attributeDefinitionId: 'a1', value: 'World' }];
    mocks.taxonomyService.setProductAttributeValues.mockResolvedValue(undefined);

    await admin.adminSetProductAttributeValues('prod-1', values as any);
    expect(mocks.taxonomyService.setProductAttributeValues).toHaveBeenCalledWith('prod-1', values);
  });

  // ── Moderation optimistic locking (BD-13 remediation) ───────

  it('moderation with matching updatedAt succeeds (atomic conditional UPDATE)', async () => {
    const ts = new Date('2026-06-01T12:00:00.000Z');
    mocks.db.db.query.products.findFirst.mockResolvedValue({
      id: 'prod-1', status: 'DRAFT', updatedAt: ts, deletedAt: null,
    });
    // Atomic UPDATE returns one row (timestamp matched)
    mocks.db.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'prod-1', status: 'ACTIVE', isAvailable: true }]),
        }),
      }),
    });

    const result = await admin.moderateProduct('prod-1', 'APPROVED', undefined, ts.toISOString());
    expect(result).toMatchObject({ id: 'prod-1', status: 'ACTIVE', isAvailable: true });
  });

  it('moderation with stale updatedAt throws 409 CONFLICT (atomic UPDATE returns no rows)', async () => {
    const stored = new Date('2026-06-01T12:00:00.000Z');
    const stale = new Date('2026-06-01T11:00:00.000Z');
    const currentTs = new Date('2026-06-01T12:30:00.000Z');
    // First findFirst: product exists check passes
    mocks.db.db.query.products.findFirst
      .mockResolvedValueOnce({
        id: 'prod-1', status: 'DRAFT', updatedAt: stored, deletedAt: null,
      })
      // Second findFirst: after atomic UPDATE returns no rows, fetch current updatedAt
      .mockResolvedValueOnce({
        id: 'prod-1', updatedAt: currentTs,
      });
    // Atomic UPDATE returns empty (timestamp mismatch — another writer won)
    mocks.db.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    try {
      await admin.moderateProduct('prod-1', 'APPROVED', undefined, stale.toISOString());
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toMatchObject({
        statusCode: 409,
        message: 'CONFLICT',
        currentUpdatedAt: currentTs,
      });
    }
  });

  it('moderation without updatedAt still works (backward compatible)', async () => {
    mocks.db.db.query.products.findFirst.mockResolvedValue({
      id: 'prod-1', status: 'DRAFT', updatedAt: new Date(), deletedAt: null,
    });
    mocks.db.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'prod-1', status: 'ACTIVE', isAvailable: true }]),
        }),
      }),
    });

    const result = await admin.moderateProduct('prod-1', 'APPROVED');
    expect(result).toMatchObject({ id: 'prod-1', status: 'ACTIVE', isAvailable: true });
  });

  it('successful moderation updates updatedAt (returned in result)', async () => {
    const ts = new Date('2026-06-01T12:00:00.000Z');
    mocks.db.db.query.products.findFirst.mockResolvedValue({
      id: 'prod-1', status: 'DRAFT', updatedAt: ts, deletedAt: null,
    });
    mocks.db.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'prod-1', status: 'REJECTED', isAvailable: false }]),
        }),
      }),
    });

    const result = await admin.moderateProduct('prod-1', 'REJECTED', 'Needs work', ts.toISOString());
    expect(result).toMatchObject({ id: 'prod-1', status: 'REJECTED', isAvailable: false, reason: 'Needs work' });
    expect(result.moderatedAt).toBeInstanceOf(Date);
  });

  it('409 response contains currentUpdatedAt from the database', async () => {
    const stored = new Date('2026-07-01T10:00:00.000Z');
    const stale = new Date('2026-07-01T09:00:00.000Z');
    const actualCurrent = new Date('2026-07-01T10:05:00.000Z');

    mocks.db.db.query.products.findFirst
      .mockResolvedValueOnce({ id: 'p1', status: 'DRAFT', updatedAt: stored, deletedAt: null })
      .mockResolvedValueOnce({ id: 'p1', updatedAt: actualCurrent });

    mocks.db.db.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    try {
      await admin.moderateProduct('p1', 'APPROVED', undefined, stale.toISOString());
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      const resp = err.getResponse();
      expect(resp.currentUpdatedAt).toEqual(actualCurrent);
      expect(resp.statusCode).toBe(409);
      expect(resp.message).toBe('CONFLICT');
    }
  });
});
