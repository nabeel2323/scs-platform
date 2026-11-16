import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResendEmailProvider } from '../../../modules/notifications/providers/resend-email.provider';
import { ResendConfig } from '../../../modules/notifications/providers/provider.config';

const BASE_CONFIG: ResendConfig = {
  apiKey: 're_test_1234567890abcdef',
  from: 'noreply@scs.example.com',
  fromName: '',
  enabled: true,
  credentialsPresent: true,
};

function mockFetch(ok: boolean, status: number, body: unknown = {}) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

const REQUEST_BASE = {
  otp: '123456',
  channel: 'email' as const,
  email: 'user@example.com',
};

describe('ResendEmailProvider', () => {
  let config: ResendConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = { ...BASE_CONFIG };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Configuration ──────────────────────────────────────────────

  describe('configuration', () => {
    it('reports as configured when enabled', () => {
      const provider = new ResendEmailProvider(config);
      expect(provider.isConfigured()).toBe(true);
    });

    it('reports as not configured when disabled', () => {
      const provider = new ResendEmailProvider({ ...config, enabled: false });
      expect(provider.isConfigured()).toBe(false);
    });

    it('has channel "email"', () => {
      const provider = new ResendEmailProvider(config);
      expect(provider.channel).toBe('email');
    });

    it('has name "resend-email"', () => {
      const provider = new ResendEmailProvider(config);
      expect(provider.name).toBe('resend-email');
    });
  });

  // ─── Successful Delivery ────────────────────────────────────────

  describe('successful delivery', () => {
    it('accepts a 2xx response with a message id', async () => {
      mockFetch(true, 200, { id: 're_abc123' });
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp({ ...REQUEST_BASE, correlationId: 'corr-123' });

      expect(result.success).toBe(true);
      expect(result.status).toBe('delivered');
      expect(result.messageId).toBe('re_abc123');
      expect(result.deliveryOutcome).toBe('accepted');
    });

    it('propagates the provider message id', async () => {
      mockFetch(true, 200, { id: 're_propagate-999' });
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp({ ...REQUEST_BASE, otp: '654321' });

      expect(result.messageId).toBe('re_propagate-999');
    });

    it('omits messageId when response body has no id', async () => {
      mockFetch(true, 200, {});
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp({ ...REQUEST_BASE, otp: '111222' });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeUndefined();
    });
  });

  // ─── Definitive Rejection (4xx) ─────────────────────────────────

  describe('definitive rejection', () => {
    it('classifies a 4xx response as rejected', async () => {
      mockFetch(false, 400, { message: 'Invalid from' });
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp(REQUEST_BASE);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('RESEND_REJECTED');
      expect(result.retryable).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('classifies a 422 response as rejected', async () => {
      mockFetch(false, 422, { message: 'Validation failed' });
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp(REQUEST_BASE);

      expect(result.deliveryOutcome).toBe('rejected');
      expect(result.retryable).toBe(false);
    });
  });

  // ─── Timeout (AbortError) ───────────────────────────────────────

  describe('timeout', () => {
    it('classifies an AbortError as timeout with unknown outcome', async () => {
      const abortError = new DOMException('The operation was aborted.', 'AbortError');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp(REQUEST_BASE);

      expect(result.success).toBe(false);
      expect(result.status).toBe('timeout');
      expect(result.errorReason).toBe('RESEND_TIMEOUT');
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('classifies a Node.js-style AbortError (plain Error) as timeout with unknown outcome', async () => {
      const abortError = new Error('The operation was aborted.');
      abortError.name = 'AbortError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp(REQUEST_BASE);

      expect(result.success).toBe(false);
      expect(result.status).toBe('timeout');
      expect(result.errorReason).toBe('RESEND_TIMEOUT');
      expect(result.deliveryOutcome).toBe('unknown');
      expect(result.retryable).toBe(false);
    });

    it('classifies an ordinary TypeError network failure as network error with unknown outcome', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp(REQUEST_BASE);

      expect(result.success).toBe(false);
      expect(result.status).toBe('failed');
      expect(result.errorReason).toBe('RESEND_NETWORK_ERROR');
      expect(result.deliveryOutcome).toBe('unknown');
      expect(result.retryable).toBe(false);
    });
  });

  // ─── Ambiguous Network Failure (TypeError) ──────────────────────

  describe('network failure', () => {
    it('classifies a TypeError as network error with unknown outcome', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp(REQUEST_BASE);

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('RESEND_NETWORK_ERROR');
      expect(result.deliveryOutcome).toBe('unknown');
    });
  });

  // ─── Missing / Invalid Configuration ────────────────────────

  describe('missing configuration', () => {
    it('returns explicit failure when disabled', async () => {
      const provider = new ResendEmailProvider({ ...config, enabled: false });
      const result = await provider.sendOtp(REQUEST_BASE);
      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('RESEND_NOT_CONFIGURED');
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('returns explicit failure when apiKey is missing', async () => {
      const provider = new ResendEmailProvider({ ...config, apiKey: '', credentialsPresent: false, enabled: false });
      const result = await provider.sendOtp(REQUEST_BASE);
      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('RESEND_NOT_CONFIGURED');
    });

    it('returns explicit failure when from is missing', async () => {
      const provider = new ResendEmailProvider({ ...config, from: '', credentialsPresent: false, enabled: false });
      const result = await provider.sendOtp(REQUEST_BASE);
      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('RESEND_NOT_CONFIGURED');
    });

    it('returns explicit failure when email is missing', async () => {
      const provider = new ResendEmailProvider(config);
      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        // no email
      });
      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('MISSING_EMAIL');
      expect(result.deliveryOutcome).toBe('rejected');
    });
  });

  // ─── Credential Redaction ───────────────────────────────────────

  describe('credential redaction', () => {
    it('does not include the API key in logs or results', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetch(false, 400, { message: 'rejected' });
      const provider = new ResendEmailProvider(config);

      const result = await provider.sendOtp(REQUEST_BASE);

      const resultJson = JSON.stringify(result);
      expect(resultJson).not.toContain(config.apiKey);
      expect(resultJson).not.toContain('re_test_1234567890abcdef');

      const allLogs = [...consoleSpy.mock.calls, ...consoleWarnSpy.mock.calls].map((c) => c.join(' '));
      for (const log of allLogs) {
        expect(log).not.toContain(config.apiKey);
      }
    });

    it('masks the full email in logs', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockFetch(false, 400, { message: 'rejected' });
      const provider = new ResendEmailProvider(config);

      await provider.sendOtp({ ...REQUEST_BASE, email: 'secret-user@private-domain.com' });

      const allLogs = [...consoleSpy.mock.calls, ...consoleWarnSpy.mock.calls, ...consoleErrSpy.mock.calls].map((c) => c.join(' '));
      for (const log of allLogs) {
        expect(log).not.toContain('secret-user@private-domain.com');
      }
    });

    it('does not include the OTP value in any output', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockFetch(true, 200, { id: 're_ok' });
      const provider = new ResendEmailProvider(config);

      await provider.sendOtp({ ...REQUEST_BASE, otp: '999888' });

      const allLogs = consoleSpy.mock.calls.map((c) => c.join(' '));
      for (const log of allLogs) {
        expect(log).not.toContain('999888');
      }
    });
  });
});