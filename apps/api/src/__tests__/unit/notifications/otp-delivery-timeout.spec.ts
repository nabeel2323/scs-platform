import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwilioSmsProvider } from '../../../modules/notifications/providers/twilio-sms.provider';
import { WhatsAppProvider } from '../../../modules/notifications/providers/whatsapp.provider';
import { OtpDeliveryService } from '../../../modules/notifications/otp-delivery.service';
import { TwilioConfig, WhatsAppConfig } from '../../../modules/notifications/providers/provider.config';

/**
 * OTP Delivery Timeout Tests (S1.2 Phase G)
 *
 * Verifies delivery outcome classification:
 * - Definite rejection → challenge cleaned up
 * - Provider acceptance → success returned
 * - Timeout → deliveryOutcome 'unknown', challenge preserved
 * - Network error → deliveryOutcome 'unknown'
 * - No automatic retry on unknown outcome
 */

describe('OTP Delivery Timeout Handling (S1.2)', () => {
  // ── Twilio Timeout ──────────────────────────────────────────────

  describe('TwilioSmsProvider — timeout handling', () => {
    let provider: TwilioSmsProvider;
    let config: TwilioConfig;

    beforeEach(() => {
      config = {
        accountSid: 'ACtest123',
        authToken: 'test-token',
        fromNumber: '+15551234567',
        enabled: true,
      };
      provider = new TwilioSmsProvider(config);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns deliveryOutcome "unknown" on timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('unknown');
      expect(result.errorReason).toBe('TWILIO_TIMEOUT');
      expect(result.retryable).toBe(false);
    });

    it('returns deliveryOutcome "unknown" on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('unknown');
      expect(result.errorReason).toBe('TWILIO_NETWORK_ERROR');
    });

    it('returns deliveryOutcome "rejected" on 400 (definite rejection)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ code: 21211, message: 'Invalid phone' }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
      expect(result.retryable).toBe(false);
    });

    it('returns deliveryOutcome "accepted" on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ sid: 'SM123' }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(true);
      expect(result.deliveryOutcome).toBe('accepted');
    });

    it('returns deliveryOutcome "rejected" when not configured', async () => {
      const disabled = new TwilioSmsProvider({ ...config, enabled: false });

      const result = await disabled.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
      expect(result.errorReason).toBe('TWILIO_NOT_CONFIGURED');
    });
  });

  // ── WhatsApp Timeout ────────────────────────────────────────────

  describe('WhatsAppProvider — timeout handling', () => {
    let provider: WhatsAppProvider;
    let config: WhatsAppConfig;

    beforeEach(() => {
      config = {
        accessToken: 'test-access-token',
        phoneNumberId: '123456789',
        businessAccountId: '987654321',
        templateName: 'authentication',
        apiVersion: 'v18.0',
        enabled: true,
      };
      provider = new WhatsAppProvider(config);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('returns deliveryOutcome "unknown" on timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('unknown');
      expect(result.errorReason).toBe('WHATSAPP_TIMEOUT');
      expect(result.retryable).toBe(false);
    });

    it('returns deliveryOutcome "unknown" on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('returns deliveryOutcome "rejected" on 400', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ error: { code: 100 } }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('returns deliveryOutcome "accepted" on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.test' }] }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(true);
      expect(result.deliveryOutcome).toBe('accepted');
    });
  });

  // ── OtpDeliveryService ──────────────────────────────────────────

  describe('OtpDeliveryService — outcome pass-through', () => {
    let service: OtpDeliveryService;

    beforeEach(() => {
      process.env['TWILIO_ACCOUNT_SID'] = 'ACtest';
      process.env['TWILIO_AUTH_TOKEN'] = 'token';
      process.env['TWILIO_FROM_NUMBER'] = '+15551234567';
      process.env['WHATSAPP_ACCESS_TOKEN'] = 'wa-token';
      process.env['WHATSAPP_PHONE_NUMBER_ID'] = '123';
      process.env['WHATSAPP_BUSINESS_ACCOUNT_ID'] = '456';

      service = new OtpDeliveryService();
    });

    afterEach(() => {
      delete process.env['TWILIO_ACCOUNT_SID'];
      delete process.env['TWILIO_AUTH_TOKEN'];
      delete process.env['TWILIO_FROM_NUMBER'];
      delete process.env['WHATSAPP_ACCESS_TOKEN'];
      delete process.env['WHATSAPP_PHONE_NUMBER_ID'];
      delete process.env['WHATSAPP_BUSINESS_ACCOUNT_ID'];
      vi.restoreAllMocks();
    });

    it('passes through "unknown" outcome on timeout', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

      const result = await service.deliverOtp('+966500000000', '123456', 'sms', 'corr-1');

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('passes through "accepted" outcome on success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ sid: 'SM123' }),
      } as Response);

      const result = await service.deliverOtp('+966500000000', '123456', 'sms', 'corr-2');

      expect(result.success).toBe(true);
      expect(result.deliveryOutcome).toBe('accepted');
    });

    it('returns "rejected" for unknown channel', async () => {
      const result = await service.deliverOtp(
        '+966500000000',
        '123456',
        'unknown' as any,
        'corr-3',
      );

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
      expect(result.errorReason).toBe('UNKNOWN_CHANNEL');
    });

    it('returns "rejected" when provider is not configured', async () => {
      // Clear Twilio config
      delete process.env['TWILIO_ACCOUNT_SID'];
      delete process.env['TWILIO_AUTH_TOKEN'];
      delete process.env['TWILIO_FROM_NUMBER'];

      // Recreate service with cleared config
      const freshService = new OtpDeliveryService();

      const result = await freshService.deliverOtp('+966500000000', '123456', 'sms', 'corr-4');

      expect(result.success).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });
  });
});
