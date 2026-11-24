import { describe, expect, it, vi } from 'vitest';
import { OrdersService } from '../../../modules/orders/orders.service';

vi.mock('../../../common/tenant-scope', () => ({
  assertOrderAccessible: vi.fn().mockResolvedValue(undefined),
  assertMasterOrderAccessible: vi.fn().mockResolvedValue(undefined),
  assertStoreInOrg: vi.fn().mockResolvedValue(undefined),
  isTenantPrivileged: vi.fn().mockReturnValue(false),
}));

describe('OrdersService.cancelOrder actor-context boundary (G-002)', () => {
  it('commits the DB-only cancellation actor scope before emitting realtime', async () => {
    const events: string[] = [];
    const actorCalls: unknown[] = [];
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: 'order-a' }]),
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue([]) })),
          })),
        })),
      })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
    };
    const db = {
      db: { transaction: vi.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) },
      withActorContext: vi.fn(async (actor: unknown, operation: () => Promise<unknown>) => {
        actorCalls.push(actor);
        events.push('actor-start');
        const result = await operation();
        events.push('actor-commit');
        return result;
      }),
    };
    const realtime = {
      emitOrderStatusChanged: vi.fn(() => events.push('realtime')),
    };
    const outbox = { publish: vi.fn().mockResolvedValue(undefined) };
    const payments = { getPaymentForOrder: vi.fn().mockResolvedValue(null) };
    const service = new OrdersService(
      db as any,
      outbox as any,
      {} as any,
      realtime as any,
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
    vi.spyOn(service as any, 'settleStockForStatus').mockResolvedValue(undefined);
    vi.spyOn(service, 'recalculateMasterOrderStatus').mockResolvedValue('CANCELLED');
    const caller = { sub: 'buyer-a', role: 'BUYER', activeOrg: null };

    await service.cancelOrder('order-a', 'buyer-a', 'CUSTOMER_REQUEST', caller);

    expect(actorCalls).toHaveLength(2);
    expect(actorCalls[0]).toEqual({
      actorKind: 'user',
      actorId: 'buyer-a',
      actorRole: 'BUYER',
      activeOrgId: null,
    });
    expect(events.indexOf('actor-commit')).toBeLessThan(events.indexOf('realtime'));
    expect(payments.getPaymentForOrder).toHaveBeenCalledWith('order-a');
    expect(service.recalculateMasterOrderStatus).toHaveBeenCalledWith('master-a');
  });
});
