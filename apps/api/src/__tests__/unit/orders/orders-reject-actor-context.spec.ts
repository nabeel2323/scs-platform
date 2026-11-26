import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../../../modules/orders/orders.service';

vi.mock('../../../common/tenant-scope', () => ({
  assertOrderAccessible: vi.fn().mockResolvedValue(undefined),
  assertMasterOrderAccessible: vi.fn().mockResolvedValue(undefined),
  assertStoreInOrg: vi.fn().mockResolvedValue(undefined),
  isTenantPrivileged: vi.fn().mockReturnValue(false),
}));

describe('OrdersService.rejectOrder actor-context boundaries (G-002)', () => {
  it('commits rejection and inventory work before creating an idempotent refund request', async () => {
    const events: string[] = [];
    const actorContexts: unknown[] = [];
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'order-a' }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    };
    const db = {
      db: {
        transaction: vi.fn(
          async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
        ),
      },
      withActorContext: vi.fn(async (actor: unknown, operation: () => Promise<unknown>) => {
        actorContexts.push(actor);
        events.push('actor-start');
        const result = await operation();
        events.push('actor-commit');
        return result;
      }),
    };
    const outbox = {
      publish: vi.fn(async () => {
        events.push('order-rejected-outbox');
        return 'outbox-a';
      }),
    };
    const payments = {
      getPaymentForOrder: vi.fn().mockResolvedValue({
        id: 'payment-a',
        status: 'CONFIRMED',
        confirmedAmountMinor: 12500,
        amountMinor: 12500,
      }),
      requestRefund: vi.fn(async () => {
        events.push('refund-request');
        return { refundId: 'refund-a', status: 'REQUESTED' };
      }),
    };
    const service = new OrdersService(
      db as any,
      outbox as any,
      {} as any,
      undefined,
      undefined,
      undefined,
      undefined,
      payments as any,
    );
    const order = {
      id: 'order-a',
      status: 'PENDING_CONFIRMATION',
      buyerId: 'buyer-a',
      storeId: 'store-a',
      masterOrderId: 'master-a',
    };
    vi.spyOn(service, 'getOrder').mockResolvedValue(order as any);
    const settleStock = vi
      .spyOn(service as any, 'settleStockForStatus')
      .mockResolvedValue(undefined);
    vi.spyOn(service, 'recalculateMasterOrderStatus').mockResolvedValue('REJECTED');
    const caller = { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' };

    await service.rejectOrder('order-a', 'merchant-a', 'OUT_OF_STOCK', caller);

    expect(actorContexts).toHaveLength(3);
    expect(actorContexts[0]).toEqual({
      actorKind: 'user',
      actorId: 'merchant-a',
      actorRole: 'MERCHANT_OWNER',
      activeOrgId: 'org-a',
    });
    expect(settleStock).toHaveBeenCalledWith('order-a', 'REJECTED', 'merchant-a', tx);
    expect(outbox.publish).toHaveBeenCalledWith(
      'order.rejected',
      'order-a',
      { orderId: 'order-a', storeId: 'store-a', reason: 'OUT_OF_STOCK' },
      {},
      null,
      tx,
    );
    expect(events.indexOf('actor-commit')).toBeLessThan(events.indexOf('refund-request'));
    expect(payments.requestRefund).toHaveBeenCalledWith(
      'payment-a',
      12500,
      'MERCHANT_REJECTION',
      'merchant-a',
      { sub: 'merchant-a', role: 'MERCHANT_OWNER', activeOrg: 'org-a' },
      { idempotencyKey: 'reject-refund:order-a' },
    );
    expect(service.recalculateMasterOrderStatus).toHaveBeenCalledWith('master-a');
  });
  it('fails closed when no caller actor is supplied', async () => {
    const withActorContext = vi.fn();
    const service = new OrdersService(
      { withActorContext } as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.rejectOrder('order-a', 'merchant-a', 'OUT_OF_STOCK', undefined as any),
    ).rejects.toThrow('Authenticated database actor context is missing');

    expect(withActorContext).not.toHaveBeenCalled();
  });

  it('fails closed when an HTTP caller has no authenticated role', async () => {
    const db = { withActorContext: vi.fn() };
    const service = new OrdersService(db as any, {} as any, {} as any);
    await expect(
      service.rejectOrder('order-a', 'merchant-a', 'OUT_OF_STOCK', { sub: 'merchant-a' } as any),
    ).rejects.toThrow('Authenticated database actor context is missing');
    expect(db.withActorContext).not.toHaveBeenCalled();
  });

  it('fails closed when an HTTP caller has no subject', async () => {
    const db = { withActorContext: vi.fn() };
    const service = new OrdersService(db as any, {} as any, {} as any);
    await expect(
      service.rejectOrder('order-a', 'merchant-a', 'OUT_OF_STOCK', { role: 'MERCHANT_OWNER' } as any),
    ).rejects.toThrow('Authenticated database actor context is missing');
    expect(db.withActorContext).not.toHaveBeenCalled();
  });


  it('rejects a rejection actor ID that differs from the authenticated caller', async () => {
    const db = { withActorContext: vi.fn() };
    const service = new OrdersService(db as any, {} as any, {} as any);

    await expect(
      service.rejectOrder('order-a', 'other-user', 'OUT_OF_STOCK', {
        sub: 'merchant-a',
        role: 'MERCHANT_OWNER',
        activeOrg: 'org-a',
      }),
    ).rejects.toThrow('Rejection actor must match the authenticated caller');

    expect(db.withActorContext).not.toHaveBeenCalled();
  });

});
