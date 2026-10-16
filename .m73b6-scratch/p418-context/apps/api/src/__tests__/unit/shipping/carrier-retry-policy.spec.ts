/**
 * Carrier Retry Policy — Unit Tests (M7.2.3-C)
 *
 * Tests:
 *   - Retry classification (terminal, retryable, rate-limit, unsupported)
 *   - Backoff calculation (exponential, jitter, cap)
 *   - Rate-limit handling (Retry-After, 2x backoff)
 *   - Max attempts budget exhaustion
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CarrierRetryPolicy } from '../../../modules/shipping/carrier-retry-policy';
import {
  RetryableCarrierError,
  RateLimitCarrierError,
  NonRetryableCarrierError,
  AuthenticationCarrierError,
  UnsupportedCarrierOperationError,
} from '../../../modules/shipping/carrier-errors';

describe('CarrierRetryPolicy', () => {
  let policy: CarrierRetryPolicy;

  beforeEach(() => {
    policy = new CarrierRetryPolicy();
  });

  // ── Error Classification ──────────────────────────────────────────────

  describe('classify()', () => {
    it('classifies RetryableCarrierError as retryable with nextAttemptAt', () => {
      const err = new RetryableCarrierError('temp failure', {
        providerKey: 'aramex',
        operation: 'createShipment',
      });
      const result = policy.classify(err, 1);
      expect(result.isFinal).toBe(false);
      expect(result.nextAttemptAt).toBeInstanceOf(Date);
      expect(result.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
      expect(result.safeMessage).toContain('temp failure');
    });

    it('classifies NonRetryableCarrierError as terminal (no retry)', () => {
      const err = new NonRetryableCarrierError('account suspended', {
        providerKey: 'aramex',
        operation: 'createShipment',
      });
      const result = policy.classify(err, 1);
      expect(result.isFinal).toBe(true);
      expect(result.nextAttemptAt).toBeNull();
      expect(result.decision).toBe('terminal');
    });

    it('classifies AuthenticationCarrierError as terminal', () => {
      const err = new AuthenticationCarrierError('invalid API key', {
        providerKey: 'aramex',
        operation: 'createShipment',
      });
      const result = policy.classify(err, 1);
      expect(result.isFinal).toBe(true);
      expect(result.nextAttemptAt).toBeNull();
    });

    it('classifies UnsupportedCarrierOperationError as unsupported', () => {
      const err = new UnsupportedCarrierOperationError('cancel not supported', {
        providerKey: 'aramex',
        operation: 'cancelShipment',
      });
      const result = policy.classify(err, 1);
      expect(result.isFinal).toBe(true);
      expect(result.decision).toBe('unsupported');
    });

    it('classifies generic Error as retryable', () => {
      const err = new Error('something went wrong');
      const result = policy.classify(err, 1);
      expect(result.isFinal).toBe(false);
      expect(result.nextAttemptAt).toBeInstanceOf(Date);
    });

    it('returns isFinal=true when max attempts reached', () => {
      const err = new RetryableCarrierError('temp', {
        providerKey: 'aramex',
        operation: 'createShipment',
      });
      // Default maxAttempts = 8
      const result = policy.classify(err, 8);
      expect(result.isFinal).toBe(true);
      expect(result.nextAttemptAt).toBeNull();
    });

    it('respects custom maxAttempts via opts', () => {
      const err = new RetryableCarrierError('temp', {
        providerKey: 'aramex',
        operation: 'createShipment',
      });
      const result = policy.classify(err, 3, { maxAttempts: 3 });
      expect(result.isFinal).toBe(true);
    });
  });

  // ── Backoff Calculation ──────────────────────────────────────────────

  describe('calculateBackoff()', () => {
    it('returns exact exponential values without jitter', () => {
      expect(CarrierRetryPolicy.calculateBackoff(1, { jitter: false })).toBe(30_000);
      expect(CarrierRetryPolicy.calculateBackoff(2, { jitter: false })).toBe(60_000);
      expect(CarrierRetryPolicy.calculateBackoff(3, { jitter: false })).toBe(120_000);
      expect(CarrierRetryPolicy.calculateBackoff(4, { jitter: false })).toBe(240_000);
      expect(CarrierRetryPolicy.calculateBackoff(5, { jitter: false })).toBe(480_000);
    });

    it('caps at maxDelay', () => {
      // 30s * 2^9 = 15360s, capped at 3600s (1h)
      const delay = CarrierRetryPolicy.calculateBackoff(10, { jitter: false });
      expect(delay).toBe(3_600_000);
    });

    it('applies ±25% jitter when enabled', () => {
      // Run 50 times to verify jitter bounds
      for (let i = 0; i < 50; i++) {
        const delay = CarrierRetryPolicy.calculateBackoff(1, { jitter: true });
        expect(delay).toBeGreaterThanOrEqual(22_500); // 30000 * 0.75
        expect(delay).toBeLessThanOrEqual(37_500);    // 30000 * 1.25
      }
    });

    it('respects custom initialDelayMs', () => {
      const delay = CarrierRetryPolicy.calculateBackoff(1, {
        initialDelayMs: 10_000,
        jitter: false,
      });
      expect(delay).toBe(10_000);
    });
  });

  // ── Rate-Limit Handling ──────────────────────────────────────────────

  describe('rate-limit handling', () => {
    it('respects Retry-After from RateLimitCarrierError', () => {
      const err = new RateLimitCarrierError('rate limited', {
        providerKey: 'aramex',
        operation: 'createShipment',
        retryAfterSeconds: 120,
      });
      const delay = policy.calculateDelay(err, 1);
      expect(delay).toBe(120_000);
    });

    it('caps Retry-After at maxDelay', () => {
      const err = new RateLimitCarrierError('rate limited', {
        providerKey: 'aramex',
        operation: 'createShipment',
        retryAfterSeconds: 7200, // 2 hours
      });
      const delay = policy.calculateDelay(err, 1);
      expect(delay).toBe(3_600_000); // capped at 1h
    });

    it('uses 2x normal backoff for rate-limit without Retry-After', () => {
      const err = new RateLimitCarrierError('rate limited', {
        providerKey: 'aramex',
        operation: 'createShipment',
      });
      const delay = policy.calculateDelay(err, 1, { jitter: false });
      // Normal: 30s * 2^0 = 30s, rate-limit: 2 * 30s = 60s
      expect(delay).toBe(60_000);
    });

    it('classifies RateLimitCarrierError as retryable', () => {
      const err = new RateLimitCarrierError('rate limited', {
        providerKey: 'aramex',
        operation: 'createShipment',
        retryAfterSeconds: 30,
      });
      const result = policy.classify(err, 1);
      expect(result.isFinal).toBe(false);
      expect(result.nextAttemptAt).toBeInstanceOf(Date);
    });
  });

  // ── getMaxAttempts ────────────────────────────────────────────────────

  describe('getMaxAttempts()', () => {
    it('returns default 8', () => {
      expect(policy.getMaxAttempts()).toBe(8);
    });
  });
});
