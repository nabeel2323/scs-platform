import { describe, it, expect, vi } from 'vitest';
import { MerchantService } from '../../../modules/merchant/merchant.service';

/**
 * A4-8 — merchant customers endpoint returns snake_case rows from raw SQL,
 * but both clients (web and mobile) parse camelCase keys. The service must
 * map the response so the contract is stable.
 */

function createMocks() {
  const execute = vi.fn();
  const db = {
    db: {
      execute,
      query: {
        stores: {
          findMany: vi.fn(),
        },
      },
    },
  };
  const outbox = { publish: vi.fn() };
  const storage = {
    createPresignedGetUrl: vi.fn(),
    createPresignedPutUrl: vi.fn(),
    putObject: vi.fn(),
    getObject: vi.fn(),
    deleteObject: vi.fn(),
    exists: vi.fn(),
  };

  return { db, outbox, storage, execute };
}

describe('MerchantService.getCustomersByOrg', () => {
  it('returns an empty array when the org has no stores', async () => {
    const mocks = createMocks();
    mocks.db.db.query.stores.findMany.mockResolvedValue([]);
    const service = new MerchantService(mocks.db as any, mocks.outbox as any, mocks.storage as any);

    const result = await service.getCustomersByOrg('org-1');

    expect(result).toEqual([]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('maps snake_case SQL columns to camelCase with numeric conversion', async () => {
    const mocks = createMocks();
    mocks.db.db.query.stores.findMany.mockResolvedValue([
      { id: 'store-1' },
      { id: 'store-2' },
    ]);
    // Postgres returns numeric aggregates as strings; the service must convert.
    // First call: main customer list. Second call: per-currency breakdown.
    mocks.execute
      .mockResolvedValueOnce([
        {
          buyer_id: 'buyer-1',
          buyer_name: 'Alice',
          buyer_phone: '+1234567890',
          buyer_email: 'alice@example.com',
          order_count: '5',
          total_spent_minor: '12500',
          last_order_at: '2026-09-01T10:00:00Z',
        },
        {
          buyer_id: 'buyer-2',
          buyer_name: 'Bob',
          buyer_phone: null,
          buyer_email: 'bob@example.com',
          order_count: '3',
          total_spent_minor: '7500',
          last_order_at: '2026-08-15T14:30:00Z',
        },
      ])
      .mockResolvedValueOnce([
        { buyer_id: 'buyer-1', currency: 'SAR', total_minor: '10000' },
        { buyer_id: 'buyer-1', currency: 'AED', total_minor: '2500' },
        { buyer_id: 'buyer-2', currency: 'SAR', total_minor: '7500' },
      ]);
    const service = new MerchantService(mocks.db as any, mocks.outbox as any, mocks.storage as any);

    const result = await service.getCustomersByOrg('org-1');

    expect(result).toEqual([
      {
        buyerId: 'buyer-1',
        buyerName: 'Alice',
        buyerPhone: '+1234567890',
        buyerEmail: 'alice@example.com',
        orderCount: 5,
        totalSpentMinor: 12500,
        spentByCurrency: [
          { currency: 'SAR', totalMinor: 10000 },
          { currency: 'AED', totalMinor: 2500 },
        ],
        lastOrderAt: '2026-09-01T10:00:00Z',
      },
      {
        buyerId: 'buyer-2',
        buyerName: 'Bob',
        buyerPhone: null,
        buyerEmail: 'bob@example.com',
        orderCount: 3,
        totalSpentMinor: 7500,
        spentByCurrency: [{ currency: 'SAR', totalMinor: 7500 }],
        lastOrderAt: '2026-08-15T14:30:00Z',
      },
    ]);
  });

  it('handles null aggregate values gracefully', async () => {
    const mocks = createMocks();
    mocks.db.db.query.stores.findMany.mockResolvedValue([{ id: 'store-1' }]);
    // A buyer with no completed orders would have null aggregates; the mapping
    // must not throw.
    mocks.execute
      .mockResolvedValueOnce([
        {
          buyer_id: 'buyer-1',
          buyer_name: 'Alice',
          buyer_phone: null,
          buyer_email: null,
          order_count: '0',
          total_spent_minor: null,
          last_order_at: null,
        },
      ])
      .mockResolvedValueOnce([]); // No currency breakdown for a buyer with no orders.
    const service = new MerchantService(mocks.db as any, mocks.outbox as any, mocks.storage as any);

    const result = await service.getCustomersByOrg('org-1');

    expect(result).toEqual([
      {
        buyerId: 'buyer-1',
        buyerName: 'Alice',
        buyerPhone: null,
        buyerEmail: null,
        orderCount: 0,
        totalSpentMinor: 0,
        spentByCurrency: [],
        lastOrderAt: null,
      },
    ]);
  });
});
