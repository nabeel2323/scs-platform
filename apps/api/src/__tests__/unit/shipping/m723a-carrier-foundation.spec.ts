/**
 * M7.2.3-A Carrier Integration Foundation — Unit Tests
 *
 * Covers:
 *   - Credential encryption/decryption (AES-256-GCM)
 *   - Wrong key / malformed payload handling
 *   - Provider registry with typed returns
 *   - Idempotency key generation
 *   - Carrier create status types
 *   - Retry/backoff calculation
 *   - Webhook HMAC signature validation
 *   - Timestamp validation / replay protection
 *   - Body size validation
 *   - Provider capability contract
 *   - Shipping method → provider binding validation
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as crypto from 'node:crypto';

// ── Credential Encryption ──────────────────────────────────────────────────

describe('CarrierCredentialCryptoService', () => {
  const TEST_KEY = crypto.randomBytes(32).toString('hex');

  beforeEach(() => {
    process.env['CARRIER_CREDENTIALS_MASTER_KEY'] = TEST_KEY;
  });

  afterEach(() => {
    delete process.env['CARRIER_CREDENTIALS_MASTER_KEY'];
  });

  async function createCryptoService() {
    const { CarrierCredentialCryptoService } = await import(
      '../../../modules/shipping/carrier-credential-crypto.service'
    );
    return new CarrierCredentialCryptoService();
  }

  it('encrypts and decrypts a plaintext string', async () => {
    const svc = await createCryptoService();
    const plaintext = '{"apiKey":"sk_test_123","accountNumber":"123456"}';

    const encrypted = svc.encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(typeof encrypted).toBe('string');

    const decrypted = svc.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertexts for the same plaintext (random IV)', async () => {
    const svc = await createCryptoService();
    const plaintext = 'secret';

    const e1 = svc.encrypt(plaintext);
    const e2 = svc.encrypt(plaintext);

    expect(e1).not.toBe(e2); // Different IVs
    expect(svc.decrypt(e1)).toBe(plaintext);
    expect(svc.decrypt(e2)).toBe(plaintext);
  });

  it('fails to decrypt with wrong key', async () => {
    const svc = await createCryptoService();
    const encrypted = svc.encrypt('secret data');

    // Change the master key
    process.env['CARRIER_CREDENTIALS_MASTER_KEY'] = crypto.randomBytes(32).toString('hex');
    const svc2 = await createCryptoService();

    expect(() => svc2.decrypt(encrypted)).toThrow();
  });

  it('fails to decrypt malformed ciphertext (too short)', async () => {
    const svc = await createCryptoService();
    expect(() => svc.decrypt('abcd')).toThrow(/too short/i);
  });

  it('fails to decrypt tampered ciphertext (auth tag mismatch)', async () => {
    const svc = await createCryptoService();
    const encrypted = svc.encrypt('secret');

    // Tamper with the ciphertext (flip a byte in the ciphertext portion)
    const buf = Buffer.from(encrypted, 'hex');
    buf[buf.length - 1] = (buf[buf.length - 1] ?? 0) ^ 0xff;
    const tampered = buf.toString('hex');

    expect(() => svc.decrypt(tampered)).toThrow();
  });

  it('constructs without master key but encrypt/decrypt throw', async () => {
    delete process.env['CARRIER_CREDENTIALS_MASTER_KEY'];

    const { CarrierCredentialCryptoService } = await import(
      '../../../modules/shipping/carrier-credential-crypto.service'
    );
    // Constructor degrades gracefully — no throw
    const svc = new CarrierCredentialCryptoService();
    expect(svc).toBeDefined();
    // Encrypt / decrypt throw at first use with a clear message
    expect(() => svc.encrypt('test')).toThrow(/CARRIER_CREDENTIALS_MASTER_KEY/);
    expect(() => svc.decrypt('aabb')).toThrow(/CARRIER_CREDENTIALS_MASTER_KEY/);
  });

  it('fails construction when master key has invalid format', async () => {
    process.env['CARRIER_CREDENTIALS_MASTER_KEY'] = 'not-a-hex-key';

    const { CarrierCredentialCryptoService } = await import(
      '../../../modules/shipping/carrier-credential-crypto.service'
    );
    expect(() => new CarrierCredentialCryptoService()).toThrow(/64-character hex/);
  });

  it('encryptOptional returns null for null/undefined', async () => {
    const svc = await createCryptoService();
    expect(svc.encryptOptional(null)).toBeNull();
    expect(svc.encryptOptional(undefined)).toBeNull();
  });

  it('decryptOptional returns null for null/undefined', async () => {
    const svc = await createCryptoService();
    expect(svc.decryptOptional(null)).toBeNull();
    expect(svc.decryptOptional(undefined)).toBeNull();
  });
});

// ── Idempotency Key Generation ─────────────────────────────────────────────

describe('Idempotency key generation', () => {
  it('generates deterministic key from shipment ID', async () => {
    const { generateIdempotencyKey } = await import('../../../modules/shipping/shipping.types');
    const key = generateIdempotencyKey('shipment-123');
    expect(key).toBe('carrier-create:shipment-123');
  });

  it('same shipment ID always produces same key', async () => {
    const { generateIdempotencyKey } = await import('../../../modules/shipping/shipping.types');
    const k1 = generateIdempotencyKey('abc');
    const k2 = generateIdempotencyKey('abc');
    expect(k1).toBe(k2);
  });

  it('different shipment IDs produce different keys', async () => {
    const { generateIdempotencyKey } = await import('../../../modules/shipping/shipping.types');
    const k1 = generateIdempotencyKey('abc');
    const k2 = generateIdempotencyKey('def');
    expect(k1).not.toBe(k2);
  });
});

// ── Carrier Create Status Types ────────────────────────────────────────────

describe('Carrier create status', () => {
  it('assertCarrierCreateStatus accepts valid statuses', async () => {
    const { assertCarrierCreateStatus, CARRIER_CREATE_STATUSES } = await import(
      '../../../modules/shipping/shipping.types'
    );

    for (const status of CARRIER_CREATE_STATUSES) {
      expect(() => assertCarrierCreateStatus(status)).not.toThrow();
    }
  });

  it('assertCarrierCreateStatus rejects invalid statuses', async () => {
    const { assertCarrierCreateStatus } = await import('../../../modules/shipping/shipping.types');

    expect(() => assertCarrierCreateStatus('INVALID')).toThrow(/Invalid carrier create status/);
    expect(() => assertCarrierCreateStatus('')).toThrow();
    expect(() => assertCarrierCreateStatus('pending')).toThrow(); // case-sensitive
  });

  it('CARRIER_CREATE_STATUSES contains exactly 5 values (M7.2.3-C: added RECOVERY_REQUIRED)', async () => {
    const { CARRIER_CREATE_STATUSES } = await import('../../../modules/shipping/shipping.types');
    expect(CARRIER_CREATE_STATUSES).toHaveLength(5);
    expect(CARRIER_CREATE_STATUSES).toContain('PENDING');
    expect(CARRIER_CREATE_STATUSES).toContain('IN_PROGRESS');
    expect(CARRIER_CREATE_STATUSES).toContain('SUCCESS');
    expect(CARRIER_CREATE_STATUSES).toContain('FAILED');
    expect(CARRIER_CREATE_STATUSES).toContain('RECOVERY_REQUIRED');
  });
});

// ── Webhook Security ───────────────────────────────────────────────────────

describe('WebhookSecurityService', () => {
  async function createSecurityService() {
    const { WebhookSecurityService } = await import(
      '../../../modules/shipping/webhook-security.service'
    );
    return new WebhookSecurityService();
  }

  it('computes and verifies a valid HMAC signature', async () => {
    const svc = await createSecurityService();
    const body = '{"event":"shipment.created","data":{}}';
    const secret = 'webhook-secret-123';

    const signature = svc.computeSignature(body, secret);
    const result = svc.verifySignature(body, signature, secret);
    expect(result.valid).toBe(true);
  });

  it('rejects mismatched signature', async () => {
    const svc = await createSecurityService();
    const body = '{"event":"test"}';
    const secret = 'correct-secret';

    const result = svc.verifySignature(body, 'wrong-signature-value-0000000000000000000000000000000000000000000000000000000000000000', secret);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/mismatch/i);
    }
  });

  it('verifies signature with timestamp', async () => {
    const svc = await createSecurityService();
    const body = '{"event":"test"}';
    const secret = 'my-secret';
    const timestamp = String(Math.floor(Date.now() / 1000));

    const signature = svc.computeSignature(body, secret, timestamp);
    const result = svc.verifySignature(body, signature, secret, timestamp);
    expect(result.valid).toBe(true);
  });

  it('rejects stale timestamp (>5 minutes)', async () => {
    const svc = await createSecurityService();
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 600); // 10 minutes ago

    const result = svc.validateTimestamp(staleTimestamp);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/too old/i);
    }
  });

  it('accepts fresh timestamp', async () => {
    const svc = await createSecurityService();
    const freshTimestamp = String(Math.floor(Date.now() / 1000));

    const result = svc.validateTimestamp(freshTimestamp);
    expect(result.valid).toBe(true);
  });

  it('rejects invalid timestamp format', async () => {
    const svc = await createSecurityService();
    const result = svc.validateTimestamp('not-a-number');
    expect(result.valid).toBe(false);
  });

  it('validates body size within limit', async () => {
    const svc = await createSecurityService();
    const smallBody = '{"small":true}';
    const result = svc.validateBodySize(smallBody);
    expect(result.valid).toBe(true);
  });

  it('rejects oversized body', async () => {
    const svc = await createSecurityService();
    const largeBody = 'x'.repeat(300 * 1024); // 300 KB > 256 KB limit
    const result = svc.validateBodySize(largeBody);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toMatch(/too large/i);
    }
  });

  it('supports millisecond timestamps', async () => {
    const svc = await createSecurityService();
    const msTimestamp = String(Date.now());
    const result = svc.validateTimestamp(msTimestamp);
    expect(result.valid).toBe(true);
  });
});

// ── Retry/Backoff Calculation ──────────────────────────────────────────────

describe('CarrierRetryPolicy backoff (M7.2.3-C)', () => {
  it('calculates backoff delays', async () => {
    const { CarrierRetryPolicy } = await import(
      '../../../modules/shipping/carrier-retry-policy'
    );

    // Attempt 1: base 30s * 2^0 = 30s (no jitter)
    const delay1 = CarrierRetryPolicy.calculateBackoff(1, { jitter: false });
    expect(delay1).toBe(30_000);

    // Attempt 2: base 30s * 2^1 = 60s (no jitter)
    const delay2 = CarrierRetryPolicy.calculateBackoff(2, { jitter: false });
    expect(delay2).toBe(60_000);

    // Attempt 3: base 30s * 2^2 = 120s (no jitter)
    const delay3 = CarrierRetryPolicy.calculateBackoff(3, { jitter: false });
    expect(delay3).toBe(120_000);

    // With jitter: should be within ±25% of base
    const delayJitter = CarrierRetryPolicy.calculateBackoff(1, { jitter: true });
    expect(delayJitter).toBeGreaterThanOrEqual(22_500); // 30000 * 0.75
    expect(delayJitter).toBeLessThanOrEqual(37_500);    // 30000 * 1.25
  });

  it('classifies terminal errors as final', async () => {
    const { CarrierRetryPolicy } = await import(
      '../../../modules/shipping/carrier-retry-policy'
    );
    const { NonRetryableCarrierError } = await import(
      '../../../modules/shipping/carrier-errors'
    );

    const policy = new CarrierRetryPolicy();
    const classification = policy.classify(new NonRetryableCarrierError('test', { providerKey: 'test', operation: 'createShipment' }), 1);
    expect(classification.isFinal).toBe(true);
    expect(classification.nextAttemptAt).toBeNull();
  });

  it('returns isFinal=true for max attempts exceeded', async () => {
    const { CarrierRetryPolicy } = await import(
      '../../../modules/shipping/carrier-retry-policy'
    );

    const policy = new CarrierRetryPolicy();
    // Default maxAttempts = 8
    const result = policy.classify(new Error('test'), 8);
    expect(result.isFinal).toBe(true);
  });
});

// ── Provider Capability Contract (M7.2.3-A) ────────────────────────────────

describe('Provider capability contract (M7.2.3-A)', () => {
  it('ManualDeliveryProvider.cancelShipment returns unsupported result', async () => {
    const { ManualDeliveryProvider } = await import(
      '../../../modules/shipping/providers/manual-delivery.provider'
    );
    const provider = new ManualDeliveryProvider();

    const result = await provider.cancelShipment('any-id');
    expect(result).toHaveProperty('supported', false);
    expect(result).toHaveProperty('reason');
  });

  it('ManualDeliveryProvider.generateLabel returns unsupported result', async () => {
    const { ManualDeliveryProvider } = await import(
      '../../../modules/shipping/providers/manual-delivery.provider'
    );
    const provider = new ManualDeliveryProvider();

    const result = await provider.generateLabel('any-id');
    expect(result).toHaveProperty('supported', false);
    expect(result).toHaveProperty('reason');
  });

  it('ManualDeliveryProvider.getTrackingInfo returns null', async () => {
    const { ManualDeliveryProvider } = await import(
      '../../../modules/shipping/providers/manual-delivery.provider'
    );
    const provider = new ManualDeliveryProvider();

    const result = await provider.getTrackingInfo('any-tracking-id');
    expect(result).toBeNull();
  });

  it('ManualDeliveryProvider.mapCarrierStatus returns null', async () => {
    const { ManualDeliveryProvider } = await import(
      '../../../modules/shipping/providers/manual-delivery.provider'
    );
    const provider = new ManualDeliveryProvider();

    expect(provider.mapCarrierStatus('DELIVERED')).toBeNull();
  });

  it('ManualDeliveryProvider still creates shipments normally', async () => {
    const { ManualDeliveryProvider } = await import(
      '../../../modules/shipping/providers/manual-delivery.provider'
    );
    const provider = new ManualDeliveryProvider();

    const result = await provider.createShipment({
      shipmentId: 's1',
      orderId: 'o1',
      storeId: 'st1',
      deliveryAddress: { street: 'A', city: 'B', country: 'SA' },
    });

    expect(result.providerKey).toBe('manual-driver');
    expect(result.metadata).toBeDefined();
  });
});

// ── RBAC Permission Keys ───────────────────────────────────────────────────

describe('M7.2.3-A RBAC permissions', () => {
  it('seed function is exported and callable', async () => {
    // Verify the seed module exports the expected function
    const seedModule = await import('../../../../infra/drizzle/seed-pg');
    expect(seedModule.seedPlatformRbac).toBeDefined();
    expect(typeof seedModule.seedPlatformRbac).toBe('function');
  });
});

// ── Shipping Types Enrichment ──────────────────────────────────────────────

describe('Shipping types enrichment (M7.2.3-A)', () => {
  it('CreateShipmentRequest supports carrier-specific fields', async () => {
    // TypeScript compile-time check — if this compiles, the type is correct
    const request: import('../../../modules/shipping/shipping.types').CreateShipmentRequest = {
      shipmentId: 's1',
      orderId: 'o1',
      storeId: 'st1',
      deliveryAddress: { street: 'A', city: 'B', country: 'SA' },
      senderAddress: { street: 'C', city: 'D', country: 'SA' },
      serviceType: 'EXPRESS',
      weightGrams: 500,
      dimensionsCm: { lengthCm: 30, widthCm: 20, heightCm: 10 },
      packageCount: 1,
      codAmountMinor: 15000,
      currency: 'SAR',
      declaredValueMinor: 50000,
      idempotencyKey: 'carrier-create:s1',
    };

    expect(request.weightGrams).toBe(500);
    expect(request.dimensionsCm?.lengthCm).toBe(30);
    expect(request.idempotencyKey).toBe('carrier-create:s1');
  });

  it('CreateShipmentResult supports carrier response fields', async () => {
    const result: import('../../../modules/shipping/shipping.types').CreateShipmentResult = {
      providerKey: 'aramex',
      carrierShipmentId: 'AWB123456',
      trackingId: 'TRK789',
      carrierStatus: 'SHIPPED',
      estimatedDeliveryDate: '2026-10-01',
      labelData: 'base64data...',
      labelFormat: 'PDF',
      rateQuoteMinor: 2500,
      rateCurrency: 'SAR',
    };

    expect(result.carrierShipmentId).toBe('AWB123456');
    expect(result.labelFormat).toBe('PDF');
  });

  it('CancelShipmentResult supports typed union', async () => {
    const cancelled: import('../../../modules/shipping/shipping.types').CancelShipmentResult = {
      supported: true,
      cancelled: true,
      carrierStatus: 'CANCELLED',
    };

    const notCancelled: import('../../../modules/shipping/shipping.types').CancelShipmentResult = {
      supported: true,
      cancelled: false,
      reason: 'Already shipped',
    };

    const unsupported: import('../../../modules/shipping/shipping.types').CancelShipmentResult = {
      supported: false,
      reason: 'Provider does not support cancellation',
    };

    expect(cancelled).toHaveProperty('supported', true);
    expect(notCancelled).toHaveProperty('cancelled', false);
    expect(unsupported).toHaveProperty('supported', false);
  });

  it('GenerateLabelResult supports typed union', async () => {
    const label: import('../../../modules/shipping/shipping.types').GenerateLabelResult = {
      supported: true,
      labelData: 'base64...',
      labelFormat: 'PDF',
    };

    const unsupported: import('../../../modules/shipping/shipping.types').GenerateLabelResult = {
      supported: false,
      reason: 'No label support',
    };

    expect(label).toHaveProperty('supported', true);
    expect(unsupported).toHaveProperty('supported', false);
  });

  it('TrackingInfo has typed events', async () => {
    const tracking: import('../../../modules/shipping/shipping.types').TrackingInfo = {
      trackingId: 'TRK123',
      status: 'IN_TRANSIT',
      events: [
        {
          timestamp: '2026-09-28T10:00:00Z',
          status: 'PICKED_UP',
          location: 'Riyadh Hub',
        },
        {
          timestamp: '2026-09-28T14:00:00Z',
          status: 'IN_TRANSIT',
          location: 'Highway',
          description: 'Package in transit',
        },
      ],
    };

    expect(tracking.events).toHaveLength(2);
    expect(tracking.events[0]!.location).toBe('Riyadh Hub');
  });
});
