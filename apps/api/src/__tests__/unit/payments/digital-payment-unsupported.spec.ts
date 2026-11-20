import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../../../modules/payments/payments.service';

describe('PaymentsService unsupported digital method', () => {
  it('rejects DIGITAL before inserting payment or payment-event rows', async () => {
    const insert = vi.fn();
    const registry = { getDefault: vi.fn(() => ({ key: 'manual' })) };
    const service = new PaymentsService(
      {} as any,
      {} as any,
      registry as any,
    );
    const tx = { insert };

    await expect(
      service.createPaymentInTransaction(
        tx,
        'order-1',
        12500,
        'SAR',
        'DIGITAL',
        'idempotency-1',
      ),
    ).rejects.toThrow('DIGITAL payments are not supported');

    expect(insert).not.toHaveBeenCalled();
    expect(registry.getDefault).not.toHaveBeenCalled();
  });
});
