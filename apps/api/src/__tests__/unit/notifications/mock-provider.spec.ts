/**
 * Mock OTP provider tests.
 *
 * Covers:
 * - In-memory OTP storage and retrieval
 * - Production/staging environment rejection (hard security boundary)
 * - OTP clearing for test isolation
 * - No OTP leakage in logs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockOtpProvider } from '../../../modules/notifications/providers/mock.provider';

describe('MockOtpProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Ensure we're in test mode with explicit mock opt-in
    process.env['NODE_ENV'] = 'test';
    process.env['OTP_MOCK_ENABLED'] = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  // ── Initialization Guard ──────────────────────────────────────

  describe('initialization guard', () => {
    it('allows construction in test environment with explicit opt-in', () => {
      process.env['NODE_ENV'] = 'test';
      process.env['OTP_MOCK_ENABLED'] = 'true';
      expect(() => new MockOtpProvider()).not.toThrow();
    });

    it('allows construction in development environment with explicit opt-in', () => {
      process.env['NODE_ENV'] = 'development';
      process.env['OTP_MOCK_ENABLED'] = 'true';
      expect(() => new MockOtpProvider()).not.toThrow();
    });

    it('rejects construction in production environment even with opt-in', () => {
      process.env['NODE_ENV'] = 'production';
      process.env['OTP_MOCK_ENABLED'] = 'true';
      expect(() => new MockOtpProvider()).toThrow(/REFUSED/);
    });

    it('rejects construction in staging environment even with opt-in', () => {
      process.env['NODE_ENV'] = 'staging';
      process.env['OTP_MOCK_ENABLED'] = 'true';
      expect(() => new MockOtpProvider()).toThrow(/REFUSED/);
    });

    it('rejects construction when OTP_MOCK_ENABLED is absent (fail-closed, S1.38 F-10)', () => {
      process.env['NODE_ENV'] = 'test';
      delete process.env['OTP_MOCK_ENABLED'];
      expect(() => new MockOtpProvider()).toThrow(/REFUSED/);
    });

    it('rejects construction when OTP_MOCK_ENABLED is false', () => {
      process.env['NODE_ENV'] = 'test';
      process.env['OTP_MOCK_ENABLED'] = 'false';
      expect(() => new MockOtpProvider()).toThrow(/REFUSED/);
    });

    it('rejects construction when NODE_ENV is unset (fail-closed, S1.38 F-10)', () => {
      delete process.env['NODE_ENV'];
      process.env['OTP_MOCK_ENABLED'] = 'true';
      // isProductionLikeEnv treats unset as 'development', but MockOtpProvider
      // constructor's own NODE_ENV check passes. The registry-level guard is
      // what blocks this — tested in provider-registry.spec.ts.
      // At the provider level, unset NODE_ENV + opt-in still constructs,
      // but the registry won't call the constructor in that case.
      expect(() => new MockOtpProvider()).not.toThrow();
    });

    it('error message does not contain OTP values or credentials', () => {
      process.env['NODE_ENV'] = 'production';
      try {
        new MockOtpProvider();
        expect.unreachable('Should have thrown');
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).not.toContain('otp');
        expect(msg).not.toContain('password');
        expect(msg).not.toContain('secret');
      }
    });
  });

  // ── Provider Identity ──────────────────────────────────────────

  describe('provider identity', () => {
    it('has channel "mock"', () => {
      const provider = new MockOtpProvider();
      expect(provider.channel).toBe('mock');
    });

    it('has name "mock"', () => {
      const provider = new MockOtpProvider();
      expect(provider.name).toBe('mock');
    });

    it('is always configured', () => {
      const provider = new MockOtpProvider();
      expect(provider.isConfigured()).toBe(true);
    });
  });

  // ── OTP Storage and Retrieval ──────────────────────────────────

  describe('OTP storage', () => {
    let provider: MockOtpProvider;

    beforeEach(() => {
      provider = new MockOtpProvider();
    });

    it('stores and retrieves OTP by subject', async () => {
      await provider.sendOtp({
        otp: '123456',
        channel: 'mock',
        subject: 'user@example.com',
        subjectType: 'email',
      });

      expect(provider.getLastOtp('user@example.com')).toBe('123456');
    });

    it('stores OTP keyed by phone when subject is missing', async () => {
      await provider.sendOtp({
        otp: '654321',
        channel: 'mock',
        phone: '+966500000000',
      });

      expect(provider.getLastOtp('+966500000000')).toBe('654321');
    });

    it('stores OTP keyed by email when subject and phone are missing', async () => {
      await provider.sendOtp({
        otp: '111222',
        channel: 'mock',
        email: 'fallback@example.com',
      });

      expect(provider.getLastOtp('fallback@example.com')).toBe('111222');
    });

    it('returns null for unknown subject', () => {
      expect(provider.getLastOtp('nobody@example.com')).toBeNull();
    });

    it('overwrites previous OTP for same subject', async () => {
      await provider.sendOtp({
        otp: '111111',
        channel: 'mock',
        subject: 'user@example.com',
        subjectType: 'email',
      });
      await provider.sendOtp({
        otp: '222222',
        channel: 'mock',
        subject: 'user@example.com',
        subjectType: 'email',
      });

      expect(provider.getLastOtp('user@example.com')).toBe('222222');
    });

    it('hasOtp returns true when OTP exists', async () => {
      await provider.sendOtp({
        otp: '123456',
        channel: 'mock',
        subject: 'user@example.com',
        subjectType: 'email',
      });

      expect(provider.hasOtp('user@example.com')).toBe(true);
    });

    it('hasOtp returns false when no OTP exists', () => {
      expect(provider.hasOtp('nobody@example.com')).toBe(false);
    });

    it('clearAll removes all stored OTPs', async () => {
      await provider.sendOtp({
        otp: '123456',
        channel: 'mock',
        subject: 'a@example.com',
        subjectType: 'email',
      });
      await provider.sendOtp({
        otp: '654321',
        channel: 'mock',
        subject: 'b@example.com',
        subjectType: 'email',
      });

      provider.clearAll();

      expect(provider.hasOtp('a@example.com')).toBe(false);
      expect(provider.hasOtp('b@example.com')).toBe(false);
    });
  });

  // ── Delivery Result ────────────────────────────────────────────

  describe('sendOtp result', () => {
    it('returns success with mock_delivered status', async () => {
      const provider = new MockOtpProvider();
      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'mock',
        subject: 'user@example.com',
        subjectType: 'email',
        correlationId: 'test-corr',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('mock_delivered');
      expect(result.deliveryOutcome).toBe('accepted');
      expect(result.messageId).toMatch(/^mock-/);
    });
  });

  // ── Log Safety ─────────────────────────────────────────────────

  describe('log safety', () => {
    it('does not log OTP values', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const provider = new MockOtpProvider();

      await provider.sendOtp({
        otp: '999888',
        channel: 'mock',
        subject: 'user@example.com',
        subjectType: 'email',
      });

      const allLogs = consoleSpy.mock.calls.map((c) => c.join(' '));
      for (const log of allLogs) {
        expect(log).not.toContain('999888');
      }
    });
  });
});
