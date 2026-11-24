import { BadRequestException } from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { TenantDatabaseContextInterceptor } from '../../../common/database/tenant-database-context.interceptor';
import { describe, expect, it, vi } from 'vitest';
import { PaymentsController } from '../../../modules/payments/payments.controller';

const user = {
  sub: 'merchant-user-a',
  role: 'MERCHANT',
  activeOrg: 'org-a',
} as any;

describe('PaymentsController bounded read actor context (G-002)', () => {
  it('wraps database-only payment and settlement GET routes in the verified user actor context', () => {
    const methods = [
      'getPayment',
      'requestedRefunds',
      'listPayments',
      'verificationQueue',
      'stalePayments',
      'listSettlements',
      'merchantListPayments',
      'merchantSettlements',
      'confirmCash',
      'verifyPayment',
      'calculateSettlement',
      'markSettlementPaid',
    ] as const;

    for (const method of methods) {
      const handler = PaymentsController.prototype[method];
      const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, handler) as unknown[];
      expect(interceptors).toContain(TenantDatabaseContextInterceptor);
    }
  });
});

describe('PaymentsController merchant listing tenant context (G-030)', () => {
  it('lists requested refunds through the admin queue service', async () => {
    const requested = [{ id: 'refund-1', status: 'REQUESTED' }];
    const payments = { getRequestedRefunds: vi.fn().mockResolvedValue(requested) };
    const controller = new PaymentsController(payments as any, {} as any);
    await expect(controller.requestedRefunds()).resolves.toEqual(requested);
    expect(payments.getRequestedRefunds).toHaveBeenCalledOnce();
  });

  it('passes the authenticated caller to merchant payment listing', async () => {
    const payments = {
      listMerchantPayments: vi.fn().mockResolvedValue([]),
    };
    const controller = new PaymentsController(payments as any, {} as any);

    await controller.merchantListPayments(user, 'store-a', 'CONFIRMED');

    expect(payments.listMerchantPayments).toHaveBeenCalledWith(
      { sub: 'merchant-user-a', role: 'MERCHANT', activeOrg: 'org-a' },
      { storeId: 'store-a', status: 'CONFIRMED' },
    );
  });

  it('passes the authenticated caller to merchant settlement listing', async () => {
    const payments = {
      listMerchantSettlements: vi.fn().mockResolvedValue([]),
    };
    const controller = new PaymentsController(payments as any, {} as any);

    await controller.merchantSettlements(user, 'store-a', 'CALCULATED', '50', '25');

    expect(payments.listMerchantSettlements).toHaveBeenCalledWith(
      { sub: 'merchant-user-a', role: 'MERCHANT', activeOrg: 'org-a' },
      { storeId: 'store-a', status: 'CALCULATED', limit: 50, offset: 25 },
    );
  });

  it('rejects invalid pagination before querying the merchant settlement service', async () => {
    const payments = { listMerchantSettlements: vi.fn() };
    const controller = new PaymentsController(payments as any, {} as any);

    await expect(
      controller.merchantSettlements(user, 'store-a', 'CALCULATED', '101', '0'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(payments.listMerchantSettlements).not.toHaveBeenCalled();
  });
});
