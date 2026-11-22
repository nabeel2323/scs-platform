import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SettlementAdjustmentService } from '../../../modules/returns/settlement-adjustment.service';

const input = {
  subOrderId: 'order-a',
  adjustmentType: 'DELIVERY_FEE_EXCEPTION',
  amountMinor: 500,
  currency: 'SYP',
  reason: 'Approved delivery correction',
};

function makeService(
  actualOrgId: string,
  returnRequest?: { id: string; subOrderId: string } | null,
) {
  const ordersFindFirst = vi.fn().mockResolvedValue({ storeId: 'store-a' });
  const storesFindFirst = vi.fn().mockResolvedValue({ orgId: actualOrgId });
  const returnRequestsFindFirst = vi.fn().mockResolvedValue(returnRequest ?? null);
  const transaction = vi.fn();

  const service = new SettlementAdjustmentService(
    {
      db: {
        query: {
          orders: { findFirst: ordersFindFirst },
          stores: { findFirst: storesFindFirst },
          returnRequests: { findFirst: returnRequestsFindFirst },
        },
        transaction,
      },
    } as any,
    { publish: vi.fn() } as any,
  );

  return {
    service,
    ordersFindFirst,
    storesFindFirst,
    returnRequestsFindFirst,
    transaction,
  };
}

describe('SettlementAdjustmentService — target tenant ownership', () => {
  it('rejects a sub-order outside the caller organization', async () => {
    const h = makeService('org-b');

    await expect(
      h.service.createAdjustment(input, 'finance-a', 'org-a'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('rejects a return request that belongs to a different sub-order', async () => {
    const h = makeService('org-a', null);

    await expect(
      h.service.createAdjustment(
        { ...input, returnRequestId: 'return-foreign' },
        'finance-a',
        'org-a',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(h.returnRequestsFindFirst).toHaveBeenCalled();
    expect(h.transaction).not.toHaveBeenCalled();
  });
});
