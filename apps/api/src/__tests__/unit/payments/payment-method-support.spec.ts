import { describe, expect, it, vi } from 'vitest';
import { PaymentsService, toSafeMinorUnitTotal } from '../../../modules/payments/payments.service';
import {
  isSupportedPaymentMethod,
  PAYMENT_METHODS,
  SUPPORTED_PAYMENT_METHODS,
  type PaymentMethod,
} from '../../../modules/payments/payments.types';

describe('Supported payment method boundary', () => {
  it('retains DIGITAL for historical persistence but excludes it from new transactions', () => {
    expect(PAYMENT_METHODS).toContain('DIGITAL');
    expect(SUPPORTED_PAYMENT_METHODS).toEqual(['BANK_TRANSFER', 'CASH_ON_DELIVERY', 'VOUCHER']);
    expect(isSupportedPaymentMethod('DIGITAL')).toBe(false);
  });

  it.each(SUPPORTED_PAYMENT_METHODS)('accepts supported method %s', (method) => {
    expect(isSupportedPaymentMethod(method)).toBe(true);
  });

  it('rejects DIGITAL before resolving a provider or writing a payment record', async () => {
    const registry = { getDefault: vi.fn() };
    const service = new PaymentsService({} as any, {} as any, registry as any);
    const tx = { insert: vi.fn() };

    await expect(
      service.createPaymentInTransaction(
        tx,
        'order-1',
        10000,
        'SAR',
        'DIGITAL' as PaymentMethod,
        'idem-1',
      ),
    ).rejects.toThrow('Unsupported payment method: DIGITAL');

    expect(registry.getDefault).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

describe('Payment minor-unit aggregate precision', () => {
  it('converts PostgreSQL numeric text without 32-bit truncation', () => {
    expect(toSafeMinorUnitTotal('3000000000', 'Refunded amount')).toBe(3_000_000_000);
  });

  it('rejects aggregates outside JavaScript safe-integer range', () => {
    expect(() => toSafeMinorUnitTotal('9007199254740992', 'Refunded amount')).toThrow(
      'aggregate exceeds the supported safe integer range',
    );
  });

  it('rejects negative or malformed aggregate values', () => {
    expect(() => toSafeMinorUnitTotal('-1', 'Refunded amount')).toThrow(
      'aggregate exceeds the supported safe integer range',
    );
    expect(() => toSafeMinorUnitTotal('not-a-number', 'Refunded amount')).toThrow(
      'aggregate is not a valid integer',
    );
  });
});
