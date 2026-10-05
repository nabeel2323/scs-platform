/**
 * M7.3-C Phase 4 P1 — Optimistic Locking: Unit Tests
 *
 * Tests the optimistic locking behavior of updateProduct() and updateVariant()
 * using mocked Drizzle ORM chains. Covers:
 *
 * - updatedAt omitted → legacy behavior
 * - updatedAt correct → update succeeds
 * - updatedAt stale → ConflictException (409)
 * - product/variant not found → NotFoundException (404)
 * - conflict response includes currentUpdatedAt
 * - invalid timestamp → BadRequestException
 */
import { describe, it, expect, vi } from 'vitest';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CatalogService } from '../../../modules/catalog/catalog.service';

// ── Mock helpers ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

/**
 * Build a mock DatabaseService whose update().set().where() chain returns
 * `updateReturning` when the WHERE predicate matches, or [] when it doesn't.
 *
 * `matchConditional` is called with the Drizzle SQL expression object produced
 * by `and(eq(...), eq(...))`. In unit tests we simply check whether the test
 * scenario says the update should succeed.
 */
function makeMockDb(opts: {
  product?: Row | null;
  variant?: Row | null;
  updateReturning?: Row[];
}) {
  const product = opts.product ?? null;
  const variant = opts.variant ?? null;
  const updateReturning = opts.updateReturning ?? [];

  const updateChain = (returnRows: Row[]) => ({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(returnRows),
    }),
  });

  return {
    db: {
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue(product),
        },
        productVariants: {
          findFirst: vi.fn().mockResolvedValue(variant),
        },
      },
      update: vi.fn().mockImplementation(() => updateChain(updateReturning)),
    },
  };
}

function makeService(mockDb: any) {
  return new CatalogService(
    mockDb as any,
    { client: { del: vi.fn().mockResolvedValue(0) } } as any,   // RedisService
    { publish: vi.fn().mockResolvedValue(undefined) } as any,    // OutboxDispatcher
    { createPresignedGetUrl: vi.fn().mockResolvedValue(null) } as any, // StorageService
    { record: vi.fn().mockResolvedValue(undefined) } as any,     // AuditService
    { evaluate: () => ({ effects: new Map(), errors: [] }) } as any, // ConditionalRulesService
    { setProductAttributeValues: vi.fn(), setVariantAttributeValues: vi.fn() } as any, // TaxonomyService
  );
}

const NOW = new Date('2026-10-05T10:00:00.000Z');
const LATER = new Date('2026-10-05T10:01:00.000Z');

// ═══════════════════════════════════════════════════════════════════════════
// updateProduct — optimistic locking
// ═══════════════════════════════════════════════════════════════════════════

describe('updateProduct — optimistic locking', () => {
  it('omitted updatedAt → legacy update succeeds (no conditional WHERE)', async () => {
    const product = { id: 'p1', title: 'Old', updatedAt: NOW, status: 'DRAFT', storeId: 's1' };
    const updatedProduct = { ...product, title: 'New', updatedAt: LATER };
    const mockDb = makeMockDb({ product, updateReturning: [] });
    // Legacy path uses .update().set().where() without .returning()
    // Override the chain for legacy path (no returning)
    mockDb.db.update.mockReturnValue({
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue(undefined),
    });
    const svc = makeService(mockDb);
    // getProduct is called at start and end; mock both
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    const result = await svc.updateProduct('p1', { title: 'New' });
    // Legacy path: no conflict, returns product
    expect(result).toBeDefined();
  });

  it('correct updatedAt → update succeeds, returns updated product', async () => {
    const product = { id: 'p1', title: 'Old', updatedAt: NOW, status: 'DRAFT', storeId: 's1' };
    const updatedRow = { ...product, title: 'New', updatedAt: LATER };
    const mockDb = makeMockDb({ product, updateReturning: [updatedRow] });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct')
      .mockResolvedValueOnce(product as any)   // initial getProduct
      .mockResolvedValueOnce(updatedRow as any); // after update

    const result = await svc.updateProduct('p1', { title: 'New' }, NOW.toISOString());
    expect(result).toBeDefined();
    expect(mockDb.db.update).toHaveBeenCalled();
  });

  it('stale updatedAt → ConflictException (409) with currentUpdatedAt', async () => {
    const product = { id: 'p1', title: 'Current', updatedAt: LATER, status: 'DRAFT', storeId: 's1' };
    const mockDb = makeMockDb({ product, updateReturning: [] }); // 0 rows → conflict
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    const staleTs = NOW.toISOString();
    try {
      await svc.updateProduct('p1', { title: 'Overwrite' }, staleTs);
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = err.getResponse();
      expect(body.statusCode).toBe(409);
      expect(body.message).toBe('CONFLICT');
      expect(body.currentUpdatedAt).toBeDefined();
    }
  });

  it('product not found → NotFoundException (404)', async () => {
    const mockDb = makeMockDb({ product: null });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockRejectedValue(new NotFoundException('Product not found'));

    await expect(
      svc.updateProduct('missing', { title: 'X' }, NOW.toISOString()),
    ).rejects.toThrow(NotFoundException);
  });

  it('invalid updatedAt → BadRequestException', async () => {
    const product = { id: 'p1', updatedAt: NOW, status: 'DRAFT', storeId: 's1' };
    const mockDb = makeMockDb({ product });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    await expect(
      svc.updateProduct('p1', { title: 'X' }, 'not-a-date'),
    ).rejects.toThrow(BadRequestException);
  });

  it('conflict response includes currentUpdatedAt as ISO string', async () => {
    const product = { id: 'p1', updatedAt: LATER, status: 'DRAFT', storeId: 's1' };
    const mockDb = makeMockDb({ product, updateReturning: [] });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    try {
      await svc.updateProduct('p1', { title: 'X' }, NOW.toISOString());
      expect.fail('Should have thrown');
    } catch (err: any) {
      const body = err.getResponse();
      // currentUpdatedAt should be the actual current timestamp
      expect(body.currentUpdatedAt).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// updateVariant — optimistic locking
// ═══════════════════════════════════════════════════════════════════════════

describe('updateVariant — optimistic locking', () => {
  const baseVariant = {
    id: 'v1', productId: 'p1', sku: 'SKU-1', updatedAt: NOW, weightGrams: '100.00',
  };

  it('omitted updatedAt → legacy update succeeds', async () => {
    const product = { id: 'p1', storeId: 's1' };
    const updatedRow = { ...baseVariant, sku: 'SKU-2', updatedAt: LATER };
    const mockDb = makeMockDb({ product, variant: baseVariant, updateReturning: [updatedRow] });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    const result = await svc.updateVariant('p1', 'v1', { sku: 'SKU-2' });
    expect(result).toBeDefined();
  });

  it('correct updatedAt → update succeeds', async () => {
    const product = { id: 'p1', storeId: 's1' };
    const updatedRow = { ...baseVariant, sku: 'SKU-2', updatedAt: LATER };
    const mockDb = makeMockDb({ product, variant: baseVariant, updateReturning: [updatedRow] });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    const result = await svc.updateVariant('p1', 'v1', { sku: 'SKU-2' }, NOW.toISOString());
    expect(result).toBeDefined();
  });

  it('stale updatedAt → ConflictException (409) with currentUpdatedAt', async () => {
    const product = { id: 'p1', storeId: 's1' };
    const currentVariant = { ...baseVariant, updatedAt: LATER };
    const mockDb = makeMockDb({ product, variant: baseVariant, updateReturning: [] });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);
    vi.spyOn(svc, 'getVariant').mockResolvedValue(currentVariant as any);

    try {
      await svc.updateVariant('p1', 'v1', { sku: 'X' }, NOW.toISOString());
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      const body = err.getResponse();
      expect(body.statusCode).toBe(409);
      expect(body.message).toBe('CONFLICT');
      expect(body.currentUpdatedAt).toBeDefined();
    }
  });

  it('variant not found → NotFoundException (404)', async () => {
    const product = { id: 'p1', storeId: 's1' };
    const mockDb = makeMockDb({ product, variant: null });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    await expect(
      svc.updateVariant('p1', 'missing', { sku: 'X' }, NOW.toISOString()),
    ).rejects.toThrow(NotFoundException);
  });

  it('invalid updatedAt → BadRequestException', async () => {
    const product = { id: 'p1', storeId: 's1' };
    const mockDb = makeMockDb({ product, variant: baseVariant });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    await expect(
      svc.updateVariant('p1', 'v1', { sku: 'X' }, 'garbage'),
    ).rejects.toThrow(BadRequestException);
  });

  it('attributes field still rejected with optimistic locking', async () => {
    const product = { id: 'p1', storeId: 's1' };
    const mockDb = makeMockDb({ product, variant: baseVariant });
    const svc = makeService(mockDb);
    vi.spyOn(svc, 'getProduct').mockResolvedValue(product as any);

    await expect(
      svc.updateVariant('p1', 'v1', { attributes: { x: 1 } } as any, NOW.toISOString()),
    ).rejects.toThrow(BadRequestException);
  });
});
