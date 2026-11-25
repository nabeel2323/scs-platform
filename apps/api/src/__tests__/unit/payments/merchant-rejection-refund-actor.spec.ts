import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../../../modules/payments/payments.service';
import { assertOrderAccessible } from '../../../common/tenant-scope';

vi.mock('../../../common/tenant-scope', () => ({
  assertOrderAccessible: vi.fn(async (_db: unknown, caller: { activeOrg?: string | null }) => {
    if (caller.activeOrg !== 'org-a') {
      throw new Error('You do not have access to this order');
    }
  }),
  assertStoreInOrg: vi.fn().mockResolvedValue(undefined),
  isTenantPrivileged: vi.fn().mockReturnValue(false),
}));

describe('PaymentsService.requestRefund merchant rejection attribution', () => {
  it('allows only an order-scoped merchant rejection request and records the merchant actor', async () => {
    const lockedPayment = {
      id: 'payment-a',
      orderId: 'order-a',
      status: 'CONFIRMED',
      confirmedAmountMinor: 12500,
      amountMinor: 12500,
      currency: 'SAR',
    };
    const paymentLockQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([lockedPayment]),
          })),
        })),
      })),
    };
    const existingRefundQuery = {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
      })),
    };
    const aggregateQuery = {
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ total: '0' }]),
      })),
    };
    const insertedRows: Record<string, unknown>[] = [];
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(paymentLockQuery)
        .mockReturnValueOnce(existingRefundQuery)
        .mockReturnValueOnce(aggregateQuery),
      insert: vi.fn(() => ({
        values: vi.fn((row: Record<string, unknown>) => {
          insertedRows.push(row);
          return {
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ id: 'refund-a' }]),
            })),
          };
        }),
      })),
    };
    const db = {
      db: {
        transaction: vi.fn(
          async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
        ),
      },
    };
    const outbox = { publish: vi.fn().mockResolvedValue('outbox-a') };
    const service = new PaymentsService(db as any, outbox as any, {} as any);
    const order = { id: 'order-a', buyerId: 'buyer-a', storeId: 'store-a' };
    vi.spyOn(service, 'getPaymentOrThrow').mockResolvedValue(lockedPayment as any);
    vi.spyOn(service, 'getOrderForPayment').mockResolvedValue(order as any);
    const caller = {
      sub: 'merchant-a',
      role: 'MERCHANT_OWNER',
      activeOrg: 'org-a',
    };

    const result = await service.requestRefund(
      'payment-a',
      12500,
      'MERCHANT_REJECTION',
      'merchant-a',
      caller,
      { idempotencyKey: 'reject-refund:order-a' },
    );

    expect(result).toEqual({
      refundId: 'refund-a',
      amountMinor: 12500,
      status: 'REQUESTED',
    });
    expect(assertOrderAccessible).toHaveBeenCalledWith(db, caller, order);
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(insertedRows[1]).toMatchObject({ actorId: 'merchant-a', actorType: 'MERCHANT' });
    expect(outbox.publish).toHaveBeenCalledOnce();
  });

  it('does not allow a merchant to use the rejection reason for another buyer payment', async () => {
    const db = { db: {} };
    const service = new PaymentsService(db as any, {} as any, {} as any);
    vi.spyOn(service, 'getPaymentOrThrow').mockResolvedValue({
      id: 'payment-a',
      orderId: 'order-a',
    } as any);
    vi.spyOn(service, 'getOrderForPayment').mockResolvedValue({
      id: 'order-a',
      buyerId: 'buyer-a',
      storeId: 'store-a',
    } as any);

    await expect(
      service.requestRefund(
        'payment-a',
        100,
        'MERCHANT_REJECTION',
        'merchant-a',
        { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'other-org' },
      ),
    ).rejects.toThrow('You do not have access to this order');
  });
});
