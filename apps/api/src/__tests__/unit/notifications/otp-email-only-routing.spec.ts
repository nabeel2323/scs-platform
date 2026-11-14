/**
 * Email-only OTP release — routing behaviour.
 *
 * These tests exercise the REAL registry and the REAL delivery router with real
 * provider instances. Only the network edges are replaced: `fetch` (Twilio /
 * WhatsApp HTTP) and Nodemailer's transport (SMTP). Nothing about channel
 * selection, permission, or outcome classification is mocked.
 *
 * Proves, for the initial staging release:
 *  - Email OTP is delivered when SMTP is configured.
 *  - SMS is never invoked when it is not permitted, even with credentials present.
 *  - Absent SMS credentials do not prevent email OTP or block construction.
 *  - A missing email provider is reported as an unavailable channel, not a
 *    wrong-address rejection.
 *  - Email delivery failure never falls back to SMS.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

// SMTP edge: capture every sendMail call so "was email attempted?" is observable.
vi.mock('nodemailer', () => {
  const mockSendMail = vi.fn();
  const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));
  return {
    createTransport: mockCreateTransport,
    __mockSendMail: mockSendMail,
    __mockCreateTransport: mockCreateTransport,
  };
});

import * as nodemailer from 'nodemailer';
import { ProviderRegistryService } from '../../../modules/notifications/provider-registry.service';
import { OtpDeliveryService } from '../../../modules/notifications/otp-delivery.service';
import { TwilioSmsProvider } from '../../../modules/notifications/providers/twilio-sms.provider';
import { WhatsAppProvider } from '../../../modules/notifications/providers/whatsapp.provider';

const mockSendMail = (nodemailer as any).__mockSendMail as ReturnType<typeof vi.fn>;

const SMTP_ENV = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'smtp-user',
  SMTP_PASSWORD: 'not-a-real-secret',
  SMTP_FROM: 'otp@example.test',
  SMTP_FROM_NAME: 'SCS Platform',
};

const TWILIO_ENV = {
  TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
  TWILIO_AUTH_TOKEN: 'not-a-real-token',
  TWILIO_FROM_NUMBER: '+15005550006',
};

const WHATSAPP_ENV = {
  WHATSAPP_ACCESS_TOKEN: 'not-a-real-token',
  WHATSAPP_PHONE_NUMBER_ID: '123',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '456',
};

describe('Email-only OTP release — delivery routing', () => {
  let originalEnv: NodeJS.ProcessEnv;
  // Typed to the spied function rather than `ReturnType<typeof vi.spyOn>`, whose
  // generic default collapses the signature to `(...args: unknown[]) => unknown`
  // and will not accept the concrete spy that `vi.spyOn` actually returns.
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let smsSendSpy: MockInstance<TwilioSmsProvider['sendOtp']>;
  let whatsappSendSpy: MockInstance<WhatsAppProvider['sendOtp']>;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
    // Production-like: the mock provider must not be a hidden escape hatch.
    process.env['NODE_ENV'] = 'production';
    delete process.env['OTP_MOCK_ENABLED'];
    delete process.env['OTP_CHANNELS'];
    for (const key of [...Object.keys(SMTP_ENV), ...Object.keys(TWILIO_ENV), ...Object.keys(WHATSAPP_ENV)]) {
      delete process.env[key];
    }

    fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Spy on the real providers' send methods — this is how "SMS was invoked"
    // is proven, independent of whether the HTTP edge would have been reached.
    smsSendSpy = vi.spyOn(TwilioSmsProvider.prototype, 'sendOtp');
    whatsappSendSpy = vi.spyOn(WhatsAppProvider.prototype, 'sendOtp');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function applyEnv(values: Record<string, string>) {
    for (const [key, value] of Object.entries(values)) {
      process.env[key] = value;
    }
  }

  function buildService(): OtpDeliveryService {
    return new OtpDeliveryService(new ProviderRegistryService());
  }

  // ── Email works when configured ────────────────────────────────

  describe('email OTP when SMTP is configured', () => {
    beforeEach(() => {
      applyEnv(SMTP_ENV);
      mockSendMail.mockResolvedValue({ messageId: 'smtp-msg-1' });
    });

    it('delivers via email and reports the provider accepted the message', async () => {
      const service = buildService();

      const result = await service.deliverEmailOtp('buyer@example.test', '123456', 'corr-email-1');

      expect(result.success).toBe(true);
      expect(result.deliveryOutcome).toBe('accepted');
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail.mock.calls[0]![0]!.to).toBe('buyer@example.test');
    });

    it('lists email as the only available channel by default', () => {
      const service = buildService();

      expect(service.getAvailableChannels()).toEqual(['email']);
      expect(service.isChannelAvailable('email')).toBe(true);
      expect(service.isChannelAvailable('sms')).toBe(false);
      expect(service.isChannelAvailable('whatsapp')).toBe(false);
    });

    it('does not require any Twilio or WhatsApp credential to construct or deliver', async () => {
      // No TWILIO_* / WHATSAPP_* were set. Construction must not throw.
      expect(() => buildService()).not.toThrow();

      const service = buildService();
      const result = await service.deliverEmailOtp('buyer@example.test', '123456');

      expect(result.success).toBe(true);
      expect(smsSendSpy).not.toHaveBeenCalled();
      expect(whatsappSendSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  // ── SMS stays disabled ─────────────────────────────────────────

  describe('SMS disabled by default', () => {
    it('never invokes SMS even when Twilio credentials are present', async () => {
      applyEnv({ ...SMTP_ENV, ...TWILIO_ENV, ...WHATSAPP_ENV });

      const service = buildService();
      const result = await service.deliverOtp('+966500000000', '123456', 'sms', 'corr-sms-1');

      expect(result.success).toBe(false);
      expect(smsSendSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('reports a disabled channel distinctly from an unconfigured provider', async () => {
      applyEnv({ ...SMTP_ENV, ...TWILIO_ENV });

      const service = buildService();
      const result = await service.deliverOtp('+966500000000', '123456', 'sms', 'corr-sms-2');

      expect(result.errorReason).toBe('SMS_CHANNEL_DISABLED');
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('classifies a disabled channel as unavailable so no UI offers a retry', async () => {
      applyEnv({ ...SMTP_ENV, ...TWILIO_ENV });

      const service = buildService();
      const result = await service.deliverOtp('+966500000000', '123456', 'sms', 'corr-sms-3');

      // The client-side mapping of this reason is pinned in
      // apps/web/src/__tests__/otp-delivery-classifier.test.ts (the classifier
      // lives in @scs/contracts, which the API package does not depend on).
      expect(result.errorReason).toMatch(/_CHANNEL_DISABLED$/);
    });

    it('never invokes WhatsApp when it is not permitted', async () => {
      applyEnv({ ...SMTP_ENV, ...WHATSAPP_ENV });

      const service = buildService();
      const result = await service.deliverOtp('+966500000000', '123456', 'whatsapp', 'corr-wa-1');

      expect(result.errorReason).toBe('WHATSAPP_CHANNEL_DISABLED');
      expect(whatsappSendSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('can be explicitly re-enabled for the future SMS phase', async () => {
      applyEnv({ ...SMTP_ENV, ...TWILIO_ENV, OTP_CHANNELS: 'email,sms' });
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ sid: 'SM-future' }) } as Response);

      const service = buildService();
      const result = await service.deliverOtp('+966500000000', '123456', 'sms', 'corr-sms-4');

      expect(result.success).toBe(true);
      expect(smsSendSpy).toHaveBeenCalledTimes(1);
    });
  });

  // ── Missing email provider is reported clearly ─────────────────

  describe('email provider not configured', () => {
    it('reports the email channel as not configured rather than a wrong address', async () => {
      const service = buildService();

      const result = await service.deliverEmailOtp('buyer@example.test', '123456', 'corr-noemail');

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('EMAIL_PROVIDER_NOT_CONFIGURED');
      expect(mockSendMail).not.toHaveBeenCalled();
      expect(smsSendSpy).not.toHaveBeenCalled();
    });

    it('surfaces an actionable readiness problem naming the missing SMTP variables', () => {
      const registry = new ProviderRegistryService();

      const readiness = registry.getOtpReadiness();

      expect(readiness.ready).toBe(false);
      const codes = readiness.problems.map((p) => p.code);
      expect(codes).toContain('EMAIL_PROVIDER_NOT_CONFIGURED');
      expect(codes).toContain('NO_OTP_CHANNEL_AVAILABLE');
      const emailProblem = readiness.problems.find((p) => p.code === 'EMAIL_PROVIDER_NOT_CONFIGURED')!;
      expect(emailProblem.message).toContain('SMTP_HOST');
      expect(emailProblem.message).toContain('SMTP_FROM');
    });

    it('does not raise SMS or WhatsApp readiness problems while they are disabled', () => {
      const registry = new ProviderRegistryService();

      const codes = registry.getOtpReadiness().problems.map((p) => p.code);

      expect(codes).not.toContain('SMS_PROVIDER_NOT_CONFIGURED');
      expect(codes).not.toContain('WHATSAPP_PROVIDER_NOT_CONFIGURED');
    });

    it('is ready once SMTP is configured, with no SMS credential anywhere', () => {
      applyEnv(SMTP_ENV);
      const registry = new ProviderRegistryService();

      const readiness = registry.getOtpReadiness();

      expect(readiness.ready).toBe(true);
      expect(readiness.problems).toEqual([]);
    });

    it('never echoes credential values in readiness messages', () => {
      applyEnv({ ...SMTP_ENV, SMTP_HOST: '' });
      const registry = new ProviderRegistryService();

      const serialized = JSON.stringify(registry.getOtpReadiness());

      expect(serialized).not.toContain('not-a-real-secret');
      expect(serialized).not.toContain('smtp-user');
    });
  });

  // ── No SMS fallback on email failure ───────────────────────────

  describe('email failure never falls back to SMS', () => {
    beforeEach(() => {
      // Deliberately permit AND configure SMS: if any fallback existed, this is
      // the configuration in which it would fire.
      applyEnv({ ...SMTP_ENV, ...TWILIO_ENV, ...WHATSAPP_ENV, OTP_CHANNELS: 'email,sms,whatsapp' });
      fetchSpy.mockResolvedValue({ ok: true, json: async () => ({ sid: 'SM-should-not-happen' }) } as Response);
    });

    it('does not invoke SMS when SMTP rejects the recipient', async () => {
      mockSendMail.mockRejectedValue(Object.assign(new Error('User unknown'), { code: 'EENVELOPE' }));

      const service = buildService();
      const result = await service.deliverEmailOtp('buyer@example.test', '123456', 'corr-fb-1');

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(smsSendSpy).not.toHaveBeenCalled();
      expect(whatsappSendSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not invoke SMS when SMTP authentication fails', async () => {
      mockSendMail.mockRejectedValue(Object.assign(new Error('Auth failed'), { code: 'EAUTH' }));

      const service = buildService();
      const result = await service.deliverEmailOtp('buyer@example.test', '123456', 'corr-fb-2');

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('SMTP_AUTH_FAILED');
      expect(smsSendSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('reports an uncertain outcome on SMTP timeout without trying SMS', async () => {
      mockSendMail.mockRejectedValue(Object.assign(new Error('Timeout'), { code: 'ETIMEDOUT' }));

      const service = buildService();
      const result = await service.deliverEmailOtp('buyer@example.test', '123456', 'corr-fb-3');

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('unknown');
      expect(smsSendSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('does not invoke SMS when the email provider is entirely unconfigured', async () => {
      delete process.env['SMTP_HOST'];

      const service = buildService();
      const result = await service.deliverEmailOtp('buyer@example.test', '123456', 'corr-fb-4');

      expect(result.success).toBe(false);
      expect(smsSendSpy).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});