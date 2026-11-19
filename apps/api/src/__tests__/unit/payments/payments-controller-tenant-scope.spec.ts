import { describe, expect, it, vi } from 'vitest';
import { PaymentsController } from '../../modules/payments/payments.controller';

const user = {
  sub: 'merchant-user-a',
  role: 'MERCHANT',
  activeOrg: 'org-a',
} as any;

describe('PaymentsController merchant listing tenant context (G-030)', () => {
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

    await controller.merchantSettlements(user, 'store-a', 'CALCULATED');

    expect(payments.listMerchantSettlements).toHaveBeenCalledWith(
      { sub: 'merchant-user-a', role: 'MERCHANT', activeOrg: 'org-a' },
      { storeId: 'store-a', status: 'CALCULATED' },
    );
  });
});
