import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ProductGovernanceService, HIGH_RISK_FIELDS } from '../../../modules/catalog/product-governance.service';

/**
 * P11 Product Governance — Security & Tenant Isolation Tests
 *
 * Verifies:
 * 1. Store isolation: merchant actions reject products from other stores
 * 2. State machine: invalid transitions are rejected with 409 Conflict
 * 3. Role enforcement: admin-only vs merchant-only operations
 * 4. Rejection reason validation
 * 5. Import eligibility gating
 * 6. HIGH_RISK_FIELDS completeness
 * 7. Moderation queue filtering
 */

// ── Mock helpers ──────────────────────────────────────────────────

type Row = Record<string, unknown>;

function makeProductRow(overrides: Row = {}): Row {
  return {
    id: 'product-1',
    storeId: 'store-a',
    status: 'DRAFT',
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
    categoryId: 'cat-1',
    ...overrides,
  };
}

function makeMockDb(productRow: Row | null = makeProductRow()) {
  const returningResult = productRow
    ? [{ id: productRow['id'], status: productRow['status'], updatedAt: productRow['updatedAt'] }]
    : [undefined];

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returningResult),
  };

  const txClient: Record<string, any> = {
    update: vi.fn().mockReturnValue(updateChain),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockResolvedValue(returningResult),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue([]),
    // Make txClient thenable so SELECT chains resolve to [] when awaited
    then: vi.fn().mockImplementation((resolve: any) => Promise.resolve([]).then(resolve)),
  };

  return {
    db: {
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue(productRow),
        },
      },
      transaction: vi.fn().mockImplementation(async (fn: any) => fn(txClient)),
    },
    _tx: txClient,
  };
}

function makeMockOutbox() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockAudit() {
  return {
    log: vi.fn().mockResolvedValue(undefined),
  };
}

function makeService(productRow: Row | null = makeProductRow()) {
  const mockDb = makeMockDb(productRow);
  const outbox = makeMockOutbox();
  const audit = makeMockAudit();
  const svc = new ProductGovernanceService(mockDb as any, outbox as any, audit as any);
  return { svc, mockDb, outbox, audit };
}

const ACTOR = { actorUserId: 'user-a', actorRole: 'MERCHANT_OWNER' };
const ADMIN_ACTOR = { actorUserId: 'admin-1', actorRole: 'ADMIN' };

// ── 1. Store Isolation ──────────────────────────────────────────

describe('P11 Security — Store Isolation', () => {
  it('submitProduct rejects product from another store (403)', async () => {
    const product = makeProductRow({ storeId: 'store-b' });
    const { svc } = makeService(product);

    await expect(
      svc.submitProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('withdrawProduct rejects product from another store (403)', async () => {
    const product = makeProductRow({ storeId: 'store-b', status: 'SUBMITTED' });
    const { svc } = makeService(product);

    await expect(
      svc.withdrawProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('publishProduct rejects product from another store (403)', async () => {
    const product = makeProductRow({ storeId: 'store-b', status: 'APPROVED' });
    const { svc } = makeService(product);

    await expect(
      svc.publishProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('unpublishProduct rejects product from another store (403)', async () => {
    const product = makeProductRow({ storeId: 'store-b', status: 'PUBLISHED' });
    const { svc } = makeService(product);

    await expect(
      svc.unpublishProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('submitProduct rejects non-existent product (404)', async () => {
    const { svc } = makeService(null);

    await expect(
      svc.submitProduct({ productId: 'missing', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(NotFoundException);
  });
});

// ── 2. State Machine Enforcement ────────────────────────────────

describe('P11 Security — State Machine Enforcement', () => {
  it('cannot submit a PUBLISHED product (409)', async () => {
    const product = makeProductRow({ status: 'PUBLISHED', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.submitProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot submit an APPROVED product (409)', async () => {
    const product = makeProductRow({ status: 'APPROVED', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.submitProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot submit a SUBMITTED product again (409)', async () => {
    const product = makeProductRow({ status: 'SUBMITTED', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.submitProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot submit an UNDER_REVIEW product (409)', async () => {
    const product = makeProductRow({ status: 'UNDER_REVIEW', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.submitProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot withdraw a DRAFT product (409)', async () => {
    const product = makeProductRow({ status: 'DRAFT', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.withdrawProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot withdraw an APPROVED product (409)', async () => {
    const product = makeProductRow({ status: 'APPROVED', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.withdrawProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot startReview on a DRAFT product (409)', async () => {
    const product = makeProductRow({ status: 'DRAFT' });
    const { svc } = makeService(product);

    await expect(
      svc.startReview('product-1', ADMIN_ACTOR.actorUserId, ADMIN_ACTOR.actorRole),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot startReview on an APPROVED product (409)', async () => {
    const product = makeProductRow({ status: 'APPROVED' });
    const { svc } = makeService(product);

    await expect(
      svc.startReview('product-1', ADMIN_ACTOR.actorUserId, ADMIN_ACTOR.actorRole),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot moderate a SUBMITTED product (409)', async () => {
    const product = makeProductRow({ status: 'SUBMITTED' });
    const { svc } = makeService(product);

    await expect(
      svc.moderateProduct({
        productId: 'product-1',
        decision: 'APPROVED',
        ...ADMIN_ACTOR,
        clientUpdatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot moderate a DRAFT product (409)', async () => {
    const product = makeProductRow({ status: 'DRAFT' });
    const { svc } = makeService(product);

    await expect(
      svc.moderateProduct({
        productId: 'product-1',
        decision: 'REJECTED',
        reason: 'test',
        ...ADMIN_ACTOR,
        clientUpdatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot publish a DRAFT product (409)', async () => {
    const product = makeProductRow({ status: 'DRAFT', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.publishProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot publish a SUBMITTED product (409)', async () => {
    const product = makeProductRow({ status: 'SUBMITTED', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.publishProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot unpublish an APPROVED product (409)', async () => {
    const product = makeProductRow({ status: 'APPROVED', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.unpublishProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('cannot unpublish a DRAFT product (409)', async () => {
    const product = makeProductRow({ status: 'DRAFT', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.unpublishProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR }),
    ).rejects.toThrow(ConflictException);
  });

  it('can submit a DRAFT product (valid transition)', async () => {
    const product = makeProductRow({ status: 'DRAFT', storeId: 'store-a' });
    const { svc } = makeService(product);

    // The mock transaction returns the updated row, so this should succeed
    const result = await svc.submitProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR });
    expect(result.status).toBe('SUBMITTED');
  });

  it('can submit a REJECTED product (resubmit)', async () => {
    const product = makeProductRow({ status: 'REJECTED', storeId: 'store-a' });
    const { svc } = makeService(product);

    const result = await svc.submitProduct({ productId: 'product-1', storeId: 'store-a', ...ACTOR });
    expect(result.status).toBe('SUBMITTED');
  });
});

// ── 3. Rejection Reason Validation ──────────────────────────────

describe('P11 Security — Rejection Reason Validation', () => {
  it('moderateProduct rejects REJECTED decision without reason (400)', async () => {
    const product = makeProductRow({ status: 'UNDER_REVIEW' });
    const { svc } = makeService(product);

    await expect(
      svc.moderateProduct({
        productId: 'product-1',
        decision: 'REJECTED',
        ...ADMIN_ACTOR,
        clientUpdatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('moderateProduct rejects REJECTED decision with empty reason (400)', async () => {
    const product = makeProductRow({ status: 'UNDER_REVIEW' });
    const { svc } = makeService(product);

    await expect(
      svc.moderateProduct({
        productId: 'product-1',
        decision: 'REJECTED',
        reason: '   ',
        ...ADMIN_ACTOR,
        clientUpdatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('moderateProduct rejects reason exceeding 1000 chars (400)', async () => {
    const product = makeProductRow({ status: 'UNDER_REVIEW' });
    const { svc } = makeService(product);

    await expect(
      svc.moderateProduct({
        productId: 'product-1',
        decision: 'REJECTED',
        reason: 'x'.repeat(1001),
        ...ADMIN_ACTOR,
        clientUpdatedAt: new Date().toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('moderateProduct accepts APPROVED decision without reason', async () => {
    const product = makeProductRow({ status: 'UNDER_REVIEW' });
    const { svc } = makeService(product);

    // APPROVED doesn't require a reason — should not throw BadRequest
    // Use the product's updatedAt so the optimistic lock check passes under the D-2 row lock
    const result = await svc.moderateProduct({
      productId: 'product-1',
      decision: 'APPROVED',
      ...ADMIN_ACTOR,
      clientUpdatedAt: '2026-01-01T00:00:00Z',
    });
    expect(result.status).toBe('APPROVED');
  });
});

// ── 4. Invalid Timestamp Validation ─────────────────────────────

describe('P11 Security — Timestamp Validation', () => {
  it('submitProduct rejects invalid clientUpdatedAt (400)', async () => {
    const product = makeProductRow({ status: 'DRAFT', storeId: 'store-a' });
    const { svc } = makeService(product);

    await expect(
      svc.submitProduct({
        productId: 'product-1',
        storeId: 'store-a',
        ...ACTOR,
        clientUpdatedAt: 'not-a-date',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('moderateProduct rejects invalid clientUpdatedAt (400)', async () => {
    const product = makeProductRow({ status: 'UNDER_REVIEW' });
    const { svc } = makeService(product);

    await expect(
      svc.moderateProduct({
        productId: 'product-1',
        decision: 'APPROVED',
        ...ADMIN_ACTOR,
        clientUpdatedAt: 'garbage',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

// ── 5. HIGH_RISK_FIELDS Completeness ────────────────────────────

describe('P11 Security — HIGH_RISK_FIELDS', () => {
  it('includes all identity/descriptive fields', () => {
    const expected = ['title', 'titleAr', 'description', 'descriptionAr'];
    for (const field of expected) {
      expect(HIGH_RISK_FIELDS.has(field), `${field} should be high-risk`).toBe(true);
    }
  });

  it('includes classification fields', () => {
    const expected = ['categoryId', 'brandId', 'productTypeId'];
    for (const field of expected) {
      expect(HIGH_RISK_FIELDS.has(field), `${field} should be high-risk`).toBe(true);
    }
  });

  it('includes identifier fields', () => {
    const expected = ['gtin', 'ean', 'mpn'];
    for (const field of expected) {
      expect(HIGH_RISK_FIELDS.has(field), `${field} should be high-risk`).toBe(true);
    }
  });

  it('includes media field', () => {
    expect(HIGH_RISK_FIELDS.has('images')).toBe(true);
  });

  it('does NOT include low-risk fields', () => {
    const lowRisk = ['slug', 'status', 'storeId', 'moq', 'isAvailable', 'condition'];
    for (const field of lowRisk) {
      expect(HIGH_RISK_FIELDS.has(field), `${field} should NOT be high-risk`).toBe(false);
    }
  });
});

// ── 6. Import Eligibility Gating ────────────────────────────────

describe('P11 Security — Import Eligibility', () => {
  it('SUBMITTED products are not eligible for import', async () => {
    const product = makeProductRow({ status: 'SUBMITTED' });
    const { svc } = makeService(product);

    const result = await svc.checkImportEligibility('product-1');
    expect(result.eligible).toBe(false);
    expect(result.action).toBe('skip');
    expect(result.currentStatus).toBe('SUBMITTED');
  });

  it('UNDER_REVIEW products are not eligible for import', async () => {
    const product = makeProductRow({ status: 'UNDER_REVIEW' });
    const { svc } = makeService(product);

    const result = await svc.checkImportEligibility('product-1');
    expect(result.eligible).toBe(false);
    expect(result.action).toBe('skip');
    expect(result.currentStatus).toBe('UNDER_REVIEW');
  });

  it('PUBLISHED products are eligible but require re-review', async () => {
    const product = makeProductRow({ status: 'PUBLISHED' });
    const { svc } = makeService(product);

    const result = await svc.checkImportEligibility('product-1');
    expect(result.eligible).toBe(true);
    expect(result.action).toBe('re-review');
    expect(result.currentStatus).toBe('PUBLISHED');
  });

  it('DRAFT products are eligible with no re-review', async () => {
    const product = makeProductRow({ status: 'DRAFT' });
    const { svc } = makeService(product);

    const result = await svc.checkImportEligibility('product-1');
    expect(result.eligible).toBe(true);
    expect(result.action).toBe('allowed');
  });

  it('APPROVED products are eligible with no re-review', async () => {
    const product = makeProductRow({ status: 'APPROVED' });
    const { svc } = makeService(product);

    const result = await svc.checkImportEligibility('product-1');
    expect(result.eligible).toBe(true);
    expect(result.action).toBe('allowed');
  });

  it('REJECTED products are eligible with no re-review', async () => {
    const product = makeProductRow({ status: 'REJECTED' });
    const { svc } = makeService(product);

    const result = await svc.checkImportEligibility('product-1');
    expect(result.eligible).toBe(true);
    expect(result.action).toBe('allowed');
  });

  it('non-existent products are eligible (new product creation)', async () => {
    const { svc } = makeService(null);

    const result = await svc.checkImportEligibility('new-product');
    expect(result.eligible).toBe(true);
    expect(result.action).toBe('allowed');
    expect(result.currentStatus).toBe('NEW');
  });
});

// ── 7. Moderation Queue ─────────────────────────────────────────

describe('P11 Security — Moderation Queue', () => {
  it('getModerationQueue caps limit at 100', async () => {
    const { svc, mockDb } = makeService(null);
    // Override the select chain for queue queries
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    (mockDb.db as any).select = vi.fn().mockReturnValue(mockChain);

    await svc.getModerationQueue({ limit: 500 });
    expect(mockChain.limit).toHaveBeenCalledWith(100);
  });

  it('getModerationQueue uses default limit of 20', async () => {
    const { svc, mockDb } = makeService(null);
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    (mockDb.db as any).select = vi.fn().mockReturnValue(mockChain);

    await svc.getModerationQueue({});
    expect(mockChain.limit).toHaveBeenCalledWith(20);
  });
});

// ── 8. Moderation History ───────────────────────────────────────

describe('P11 Security — Moderation History', () => {
  it('getModerationHistory throws NotFoundException for missing product', async () => {
    const { svc } = makeService(null);
    // Override findFirst for the history call
    (svc as any).db.db.query.products.findFirst.mockResolvedValue(null);

    await expect(svc.getModerationHistory('missing')).rejects.toThrow(NotFoundException);
  });
});
