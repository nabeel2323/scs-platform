/**
 * SMTP email provider tests.
 *
 * Covers:
 * - Provider configuration and isConfigured()
 * - Successful email delivery via Nodemailer
 * - Missing email rejection
 * - Error classification (permanent vs transient)
 * - Credential redaction in logs and error messages
 * - Email template formatting
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SmtpEmailProvider } from '../../../modules/notifications/providers/smtp-email.provider';
import { SmtpConfig } from '../../../modules/notifications/providers/provider.config';

// Mock nodemailer
vi.mock('nodemailer', () => {
  const mockSendMail = vi.fn();
  const mockCreateTransport = vi.fn(() => ({
    sendMail: mockSendMail,
  }));
  return {
    createTransport: mockCreateTransport,
    __mockSendMail: mockSendMail,
    __mockCreateTransport: mockCreateTransport,
  };
});

// Get the mock functions
import * as nodemailer from 'nodemailer';
const mockSendMail = (nodemailer as any).__mockSendMail as ReturnType<typeof vi.fn>;
const mockCreateTransport = (nodemailer as any).__mockCreateTransport as ReturnType<typeof vi.fn>;

describe('SmtpEmailProvider', () => {
  let config: SmtpConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      user: 'smtp-user',
      password: 'smtp-pass',
      from: 'noreply@scs.example.com',
      enabled: true,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Configuration ──────────────────────────────────────────────

  describe('configuration', () => {
    it('reports as configured when enabled', () => {
      const provider = new SmtpEmailProvider(config);
      expect(provider.isConfigured()).toBe(true);
    });

    it('reports as not configured when disabled', () => {
      const provider = new SmtpEmailProvider({ ...config, enabled: false });
      expect(provider.isConfigured()).toBe(false);
    });

    it('creates nodemailer transport with correct settings', () => {
      new SmtpEmailProvider(config);
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: { user: 'smtp-user', pass: 'smtp-pass' },
        }),
      );
    });

    it('creates transport without auth when user is empty', () => {
      new SmtpEmailProvider({ ...config, user: '' });
      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: undefined,
        }),
      );
    });

    it('has channel "email"', () => {
      const provider = new SmtpEmailProvider(config);
      expect(provider.channel).toBe('email');
    });

    it('has name "smtp-email"', () => {
      const provider = new SmtpEmailProvider(config);
      expect(provider.name).toBe('smtp-email');
    });
  });

  // ── Successful Delivery ────────────────────────────────────────

  describe('successful delivery', () => {
    it('sends email and returns accepted outcome', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'test-message-id-123' });
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
        subject: 'u***@example.com',
        subjectType: 'email',
        correlationId: 'corr-123',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('delivered');
      expect(result.messageId).toBe('test-message-id-123');
      expect(result.deliveryOutcome).toBe('accepted');
    });

    it('passes correct email fields to nodemailer', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-1' });
      const provider = new SmtpEmailProvider(config);

      await provider.sendOtp({
        otp: '654321',
        channel: 'email',
        email: 'recipient@example.com',
        subject: 'r***@example.com',
        subjectType: 'email',
        correlationId: 'corr-abc',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@scs.example.com',
          to: 'recipient@example.com',
          subject: 'Your verification code',
        }),
      );
    });

    it('includes correlation ID header when provided', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-2' });
      const provider = new SmtpEmailProvider(config);

      await provider.sendOtp({
        otp: '111222',
        channel: 'email',
        email: 'user@example.com',
        correlationId: 'unique-corr-id',
      });

      const mailOptions = mockSendMail.mock.calls[0]![0]!;
      expect(mailOptions.headers).toEqual(
        expect.objectContaining({
          'X-SCS-Correlation-ID': 'unique-corr-id',
        }),
      );
    });

    it('includes both HTML and text body (accessible formatting)', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-3' });
      const provider = new SmtpEmailProvider(config);

      await provider.sendOtp({
        otp: '333444',
        channel: 'email',
        email: 'user@example.com',
      });

      const mailOptions = mockSendMail.mock.calls[0]![0]!;
      expect(mailOptions.html).toBeDefined();
      expect(mailOptions.text).toBeDefined();
      // HTML should contain the OTP code
      expect(mailOptions.html).toContain('333444');
      // Text should contain the OTP code
      expect(mailOptions.text).toContain('333444');
      // HTML should mention 5-minute expiry
      expect(mailOptions.html).toContain('5 minutes');
    });
  });

  // ── Missing Email Rejection ────────────────────────────────────

  describe('missing email', () => {
    it('returns explicit failure when email is missing', async () => {
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        // no email field
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('MISSING_EMAIL');
      expect(result.deliveryOutcome).toBe('rejected');
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // ── Not Configured ─────────────────────────────────────────────

  describe('not configured', () => {
    it('returns explicit failure when disabled', async () => {
      const provider = new SmtpEmailProvider({ ...config, enabled: false });

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_NOT_CONFIGURED');
      expect(result.deliveryOutcome).toBe('rejected');
    });
  });

  // ── Error Classification ───────────────────────────────────────

  describe('error classification', () => {
    it('classifies auth failure (EAUTH) as permanent rejection', async () => {
      const authError = Object.assign(new Error('Auth failed'), { code: 'EAUTH' });
      mockSendMail.mockRejectedValue(authError);
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_AUTH_FAILED');
      expect(result.retryable).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('classifies envelope rejection (EENVELOPE) as permanent', async () => {
      const envError = Object.assign(new Error('Bad recipient'), { code: 'EENVELOPE' });
      mockSendMail.mockRejectedValue(envError);
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_RECIPIENT_REJECTED');
      expect(result.retryable).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('classifies timeout as transient with unknown outcome', async () => {
      const timeoutError = Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' });
      mockSendMail.mockRejectedValue(timeoutError);
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_TIMEOUT');
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('classifies connection refused as transient with unknown outcome', async () => {
      const connError = Object.assign(new Error('Connection refused'), { code: 'ECONNREFUSED' });
      mockSendMail.mockRejectedValue(connError);
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_NETWORK_ERROR');
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('classifies 4xx SMTP response as transient and retryable', async () => {
      const transientError = Object.assign(new Error('Transient'), { response: '451 Try again later' });
      mockSendMail.mockRejectedValue(transientError);
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_TRANSIENT_ERROR');
      expect(result.retryable).toBe(true);
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('classifies 550 response as permanent recipient rejection', async () => {
      const permError = Object.assign(new Error('User unknown'), { response: '550 User not found' });
      mockSendMail.mockRejectedValue(permError);
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_RECIPIENT_REJECTED');
      expect(result.retryable).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('classifies unknown errors with unknown outcome', async () => {
      mockSendMail.mockRejectedValue(new Error('Something weird'));
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_UNEXPECTED_ERROR');
      expect(result.deliveryOutcome).toBe('unknown');
    });
  });

  // ── Credential Redaction ───────────────────────────────────────

  describe('credential redaction', () => {
    it('does not include SMTP password in error messages', async () => {
      const errorWithCreds = Object.assign(new Error('Auth failed: smtp-pass'), { code: 'EAUTH' });
      mockSendMail.mockRejectedValue(errorWithCreds);
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const provider = new SmtpEmailProvider(config);

      const result = await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'user@example.com',
        correlationId: 'corr-redact-test',
      });

      // The result should not contain the password
      expect(JSON.stringify(result)).not.toContain('smtp-pass');
      // Check logs don't contain password
      for (const call of consoleSpy.mock.calls) {
        expect(call.join(' ')).not.toContain('smtp-pass');
      }
    });

    it('does not include full email in error logs', async () => {
      mockSendMail.mockRejectedValue(Object.assign(new Error('fail'), { code: 'ETIMEDOUT' }));
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const provider = new SmtpEmailProvider(config);

      await provider.sendOtp({
        otp: '123456',
        channel: 'email',
        email: 'secret-user@private-domain.com',
      });

      // All log output should use masked form
      const allLogs = [...consoleSpy.mock.calls, ...consoleErrSpy.mock.calls].map((c) => c.join(' '));
      for (const log of allLogs) {
        expect(log).not.toContain('secret-user@private-domain.com');
      }
    });

    it('does not include OTP value in any output', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-ok' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const provider = new SmtpEmailProvider(config);

      await provider.sendOtp({
        otp: '999888',
        channel: 'email',
        email: 'user@example.com',
      });

      const allLogs = consoleSpy.mock.calls.map((c) => c.join(' '));
      for (const log of allLogs) {
        expect(log).not.toContain('999888');
      }
    });
  });
});
