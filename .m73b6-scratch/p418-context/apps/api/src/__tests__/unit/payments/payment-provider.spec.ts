/**
 * P12 Payment Provider Abstraction Unit Tests
 *
 * Verifies:
 * - PaymentProviderRegistry registration and retrieval
 * - ManualVerificationProvider contract compliance
 * - Default provider resolution
 * - Bank transfer instructions returned
 * - Webhook boundary (no live provider)
 */
import { describe, it, expect } from 'vitest';
import { PaymentProviderRegistry } from '../../../modules/payments/payments.provider-registry';
import { ManualVerificationProvider } from '../../../modules/payments/manual-verification.provider';

describe('P12 Payment Provider Abstraction', () => {
  // ── Registry ─────────────────────────────────────────────────────────

  describe('PaymentProviderRegistry', () => {
    it('getDefault returns the manual provider when registered', () => {
      const registry = new PaymentProviderRegistry();
      const manual = new ManualVerificationProvider();
      registry.register(manual);
      const def = registry.getDefault();
      expect(def.key).toBe('manual');
    });

    it('get returns registered provider by key', () => {
      const registry = new PaymentProviderRegistry();
      const manual = new ManualVerificationProvider();
      registry.register(manual);
      expect(registry.get('manual')).toBe(manual);
    });

    it('get throws for unknown key', () => {
      const registry = new PaymentProviderRegistry();
      expect(() => registry.get('stripe')).toThrow();
    });

    it('has returns true for registered, false for unknown', () => {
      const registry = new PaymentProviderRegistry();
      const manual = new ManualVerificationProvider();
      registry.register(manual);
      expect(registry.has('manual')).toBe(true);
      expect(registry.has('unknown')).toBe(false);
    });

    it('listKeys returns all registered keys', () => {
      const registry = new PaymentProviderRegistry();
      registry.register(new ManualVerificationProvider());
      const keys = registry.listKeys();
      expect(keys).toContain('manual');
    });

    it('register overwrites same key', () => {
      const registry = new PaymentProviderRegistry();
      const m1 = new ManualVerificationProvider();
      const m2 = new ManualVerificationProvider();
      registry.register(m1);
      registry.register(m2);
      expect(registry.get('manual')).toBe(m2);
    });
  });

  // ── Manual Verification Provider ─────────────────────────────────────

  describe('ManualVerificationProvider', () => {
    const provider = new ManualVerificationProvider();

    it('has key "manual"', () => {
      expect(provider.key).toBe('manual');
    });

    it('createPaymentIntent returns instructions for BANK_TRANSFER', async () => {
      const result = await provider.createPaymentIntent({
        orderId: 'order-1',
        amountMinor: 50000,
        currency: 'SYP',
        paymentMethod: 'BANK_TRANSFER',
      });
      expect(result).toBeDefined();
      expect(result.instructions).toBeDefined();
      expect(result.instructions!.bankDetails!.bankName).toBeTruthy();
      expect(result.status).toBe('CREATED');
    });

    it('createPaymentIntent returns no bank details for CASH_ON_DELIVERY', async () => {
      const result = await provider.createPaymentIntent({
        orderId: 'order-2',
        amountMinor: 30000,
        currency: 'SYP',
        paymentMethod: 'CASH_ON_DELIVERY',
      });
      expect(result.status).toBe('CREATED');
      expect(result.instructions!.bankDetails).toBeUndefined();
    });

    it('getPaymentStatus returns CREATED (no real gateway)', async () => {
      const status = await provider.getPaymentStatus('dummy-ref');
      expect(status.status).toBe('CREATED');
    });

    it('cancelPayment resolves (no-op for manual)', async () => {
      await expect(provider.cancelPayment('dummy-ref')).resolves.toBeUndefined();
    });

    it('refund returns REQUESTED status (no automated money movement)', async () => {
      const result = await provider.refund({
        providerPaymentId: 'dummy-ref',
        amountMinor: 10000,
        currency: 'SYP',
        reason: 'test refund',
      });
      expect(result.status).toBe('REQUESTED');
    });

    it('verifyWebhookSignature returns true (N/A for manual)', () => {
      expect(provider.verifyWebhookSignature(Buffer.from('body'), 'sig')).toBe(true);
    });

    it('parseWebhookEvent throws (no webhook for manual)', () => {
      expect(() => provider.parseWebhookEvent(Buffer.from('{}'))).toThrow();
    });
  });
});
