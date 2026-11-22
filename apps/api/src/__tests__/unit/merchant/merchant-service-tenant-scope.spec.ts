import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { MerchantService } from '../../../modules/merchant/merchant.service';

const caller = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

function makeHarness(options?: {
  organizationMembership?: { id: string } | null;
  store?: { id: string; orgId: string } | null;
  storeMembership?: { id: string } | null;
}) {
  const organizationFindFirst = vi.fn().mockResolvedValue(options?.organizationMembership === null ? null : { id: 'org-member-a' });
  const storeFindFirst = vi.fn().mockResolvedValue(options?.store === null ? null : (options?.store ?? { id: 'store-a', orgId: 'org-a' }));
  const storeMemberFindFirst = vi.fn().mockResolvedValue(options?.storeMembership === null ? null : { id: 'store-member-a' });
  const businessDocumentFindFirst = vi.fn().mockResolvedValue({ id: 'doc-a', orgId: 'org-a', storeId: 'store-a', storageKey: 'docs/a.pdf' });
  const businessDocumentFindMany = vi.fn().mockResolvedValue([]);
  const verificationFindMany = vi.fn().mockResolvedValue([]);
  const storesFindMany = vi.fn().mockResolvedValue([{ id: 'store-a' }]);
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const createPresignedGetUrl = vi.fn().mockResolvedValue('https://storage.example/signed');
  const db = {
    db: {
      insert,
      query: {
        organizationMembers: { findFirst: organizationFindFirst },
        stores: { findFirst: storeFindFirst, findMany: storesFindMany },
        storeMembers: { findFirst: storeMemberFindFirst },
        businessDocuments: { findFirst: businessDocumentFindFirst, findMany: businessDocumentFindMany },
        verificationRequests: { findMany: verificationFindMany },
      },
    },
  };
  const service = new MerchantService(db as any, { publish: vi.fn() } as any, { createPresignedGetUrl } as any);
  return {
    service,
    organizationFindFirst,
    storeFindFirst,
    storeMemberFindFirst,
    businessDocumentFindFirst,
    businessDocumentFindMany,
    verificationFindMany,
    storesFindMany,
    insert,
    insertValues,
    createPresignedGetUrl,
  };
}

function queryParams(query: unknown): unknown[] {
  return new PgDialect().sqlToQuery(query as any).params;
}

describe('MerchantService — current organization membership', () => {
  it('denies document listing after organization membership is inactive', async () => {
    const h = makeHarness({ organizationMembership: null });
    await expect(h.service.listDocumentsByOrg('org-a', caller.sub)).rejects.toBeInstanceOf(ForbiddenException);
    expect(queryParams(h.organizationFindFirst.mock.calls[0]?.[0].where)).toContain('ACTIVE');
    expect(h.businessDocumentFindMany).not.toHaveBeenCalled();
  });

  it('denies merchant document downloads after organization membership is inactive', async () => {
    const h = makeHarness({ organizationMembership: null });
    await expect(h.service.presignForMerchant('doc-a', caller.sub)).rejects.toBeInstanceOf(ForbiddenException);
    expect(queryParams(h.organizationFindFirst.mock.calls[0]?.[0].where)).toContain('ACTIVE');
    expect(h.createPresignedGetUrl).not.toHaveBeenCalled();
  });

  it('denies organization verification reads after membership is inactive', async () => {
    const h = makeHarness({ organizationMembership: null });
    await expect(h.service.listVerificationsForOrg('org-a', caller.sub)).rejects.toBeInstanceOf(ForbiddenException);
    expect(queryParams(h.organizationFindFirst.mock.calls[0]?.[0].where)).toContain('ACTIVE');
    expect(h.storesFindMany).not.toHaveBeenCalled();
  });
});

describe('MerchantService — document upload ownership', () => {
  it('rejects a document for an organization other than the caller active organization', async () => {
    const h = makeHarness();
    await expect(h.service.uploadDocument({
      orgId: 'org-b',
      docType: 'COMMERCIAL_REG',
      fileName: 'foreign.pdf',
      uploadedBy: caller.sub,
    }, caller)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.organizationFindFirst).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('rejects a store reference that belongs to a different organization', async () => {
    const h = makeHarness({ store: null });
    await expect(h.service.uploadDocument({
      orgId: 'org-a',
      storeId: 'store-foreign',
      docType: 'COMMERCIAL_REG',
      fileName: 'foreign.pdf',
      uploadedBy: caller.sub,
    }, caller)).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.storeFindFirst).toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('requires active store membership for a store-scoped upload', async () => {
    const h = makeHarness({ storeMembership: null });
    await expect(h.service.uploadDocument({
      orgId: 'org-a',
      storeId: 'store-a',
      docType: 'COMMERCIAL_REG',
      fileName: 'store.pdf',
      uploadedBy: caller.sub,
    }, caller)).rejects.toBeInstanceOf(ForbiddenException);
    expect(queryParams(h.storeMemberFindFirst.mock.calls[0]?.[0].where)).toContain('ACTIVE');
    expect(h.insert).not.toHaveBeenCalled();
  });

  it('accepts an upload for the caller active organization and active store', async () => {
    const h = makeHarness();
    await expect(h.service.uploadDocument({
      orgId: 'org-a',
      storeId: 'store-a',
      docType: 'COMMERCIAL_REG',
      fileName: 'store.pdf',
      uploadedBy: caller.sub,
    }, caller)).resolves.toMatchObject({ id: 'doc-a' });
    expect(h.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-a',
      storeId: 'store-a',
      uploadedBy: caller.sub,
    }));
  });
});
