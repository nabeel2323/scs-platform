import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReturnsService } from '../../../modules/returns/returns.service';

describe('ReturnsService platform transition authorization', () => {
  it.each(['EXPIRED', 'ESCALATED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED'])(
    'rejects non-platform callers for %s transitions',
    async (status) => {
      const service = new ReturnsService(
        { db: { query: {} } } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
      await expect(
        (service as any).assertTransitionAuthorized(
          { id: 'return-a', buyerId: 'buyer-a', subOrderId: 'order-a' },
          status,
          { sub: 'buyer-a', role: 'BUYER', activeOrg: null },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('requires a privileged caller before loading an escalated return', async () => {
    const findFirst = vi.fn();
    const service = new ReturnsService(
      { db: { query: { returnRequests: { findFirst } } } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.resolveEscalation('return-a', 'APPROVE', null, {
        sub: 'buyer-a',
        role: 'BUYER',
        activeOrg: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
