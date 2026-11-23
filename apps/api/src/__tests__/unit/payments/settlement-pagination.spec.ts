import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { PaymentsService } from '../../../modules/payments/payments.service';
import {
  DEFAULT_SETTLEMENT_PAGE_SIZE,
  MAX_SETTLEMENT_PAGE_SIZE,
  normalizeSettlementPagination,
  parseSettlementPagination,
} from '../../../modules/payments/settlement-pagination';

describe('settlement pagination contract', () => {
  it('uses a bounded default page and zero offset', () => {
    expect(parseSettlementPagination()).toEqual({
      limit: DEFAULT_SETTLEMENT_PAGE_SIZE,
      offset: 0,
    });
  });

  it('accepts the maximum page size and a safe offset', () => {
    expect(parseSettlementPagination(String(MAX_SETTLEMENT_PAGE_SIZE), '250')).toEqual({
      limit: MAX_SETTLEMENT_PAGE_SIZE,
      offset: 250,
    });
  });

  it.each(['0', '101', '-1', '1.5', 'abc', ''])('rejects invalid limit %s', (value) => {
    expect(() => parseSettlementPagination(value)).toThrow(BadRequestException);
  });

  it.each(['-1', '1.5', 'abc', '9007199254740992'])('rejects invalid offset %s', (value) => {
    expect(() => parseSettlementPagination('25', value)).toThrow(BadRequestException);
  });

  it('validates internal service paging input rather than silently coercing it', () => {
    expect(() => normalizeSettlementPagination({ limit: 0, offset: 0 })).toThrow(BadRequestException);
    expect(() => normalizeSettlementPagination({ limit: 25, offset: -1 })).toThrow(BadRequestException);
  });
});

describe('PaymentsService settlement list pagination', () => {
  it('applies the same organization and status scope to merchant rows and total count', async () => {
    const row = { settlement: { id: 'settlement-1' } };
    const rowsQuery: any = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([row]),
    };
    const countQuery: any = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ total: '26' }]),
    };
    const select = vi.fn()
      .mockImplementationOnce(() => rowsQuery)
      .mockImplementationOnce(() => countQuery);
    const service = new PaymentsService({ db: { select } } as any, {} as any, {} as any);

    const result = await service.listMerchantSettlements(
      { sub: 'merchant-a', role: 'MERCHANT', activeOrg: 'org-a' } as any,
      { status: 'PAID', limit: 25, offset: 25 },
    );

    expect(result).toEqual({
      data: [row.settlement],
      total: 26,
      limit: 25,
      offset: 25,
    });
    expect(rowsQuery.limit).toHaveBeenCalledWith(25);
    expect(rowsQuery.offset).toHaveBeenCalledWith(25);

    const dialect = new PgDialect();
    for (const where of [rowsQuery.where.mock.calls[0]?.[0], countQuery.where.mock.calls[0]?.[0]]) {
      const compiled = dialect.sqlToQuery(where);
      expect(compiled.params).toEqual(expect.arrayContaining(['org-a', 'PAID']));
    }
  });

  it('paginates admin results and counts with the same filters', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'settlement-1' }]);
    const countQuery: any = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ total: '41' }]),
    };
    const service = new PaymentsService({
      db: {
        query: { settlementRecords: { findMany } },
        select: vi.fn().mockReturnValue(countQuery),
      },
    } as any, {} as any, {} as any);

    const result = await service.listSettlements({ status: 'DUE', limit: 10, offset: 30 });

    expect(result).toEqual({
      data: [{ id: 'settlement-1' }],
      total: 41,
      limit: 10,
      offset: 30,
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, offset: 30 }));
    const compiled = new PgDialect().sqlToQuery(findMany.mock.calls[0]?.[0]?.where);
    expect(compiled.params).toContain('DUE');
    const countCondition = new PgDialect().sqlToQuery(countQuery.where.mock.calls[0]?.[0]);
    expect(countCondition.params).toContain('DUE');
  });
});
