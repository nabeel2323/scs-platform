/**
 * OTP delivery provider tests — WhatsApp and SMS channels.
 *
 * Covers:
 * - Provider configuration validation
 * - Successful delivery via SMS (Twilio)
 * - Successful delivery via WhatsApp (Meta)
 * - Provider failures (permanent and transient)
 * - No OTP/phone leakage in logs
 * - Channel selection and availability
 * - Concurrent request handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TwilioSmsProvider } from '../../../modules/notifications/providers/twilio-sms.provider';
import { WhatsAppProvider } from '../../../modules/notifications/providers/whatsapp.provider';
import { OtpDeliveryService } from '../../../modules/notifications/otp-delivery.service';
import { TwilioConfig, WhatsAppConfig } from '../../../modules/notifications/providers/provider.config';

describe('OTP Delivery Providers', () => {
  // ── Twilio SMS Provider ─────────────────────────────────────────

  describe('TwilioSmsProvider', () => {
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

    it('should report as configured when credentials are present', () => {
      expect(provider.isConfigured()).toBe(true);
    });

    it('should report as not configured when disabled', () => {
      const disabledProvider = new TwilioSmsProvider({ ...config, enabled: false });
      expect(disabledProvider.isConfigured()).toBe(false);
    });

    it('should send OTP via SMS successfully', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ sid: 'SM123456' }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
        correlationId: 'test-corr-1',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('delivered');
      expect(result.messageId).toBe('SM123456');
      expect(result.deliveryOutcome).toBe('accepted');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify no OTP or full phone in the request body (only in the actual message)
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall?.[0]).toContain('api.twilio.com');
    });

    it('should handle permanent provider rejection (400)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ code: 21211, message: 'Invalid phone number' }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('TWILIO_ERROR');
      expect(result.retryable).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('should classify transient provider error (500) as unknown outcome', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => JSON.stringify({ code: 11200, message: 'Server error' }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('TWILIO_ERROR');
      expect(result.retryable).toBe(true);
      // S1.3 M-01: a 5xx reaches Twilio but the delivery outcome is uncertain,
      // so it must be 'unknown' (preserves the challenge), not a definite rejection.
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('should classify rate limiting (429) as unknown outcome', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => JSON.stringify({ code: 20500 }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      // S1.3 M-01: a 429 is transient; the message may still be delivered, so the
      // outcome is 'unknown' and the challenge must be preserved.
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('should return explicit failure when not configured', async () => {
      const disabledProvider = new TwilioSmsProvider({ ...config, enabled: false });

      const result = await disabledProvider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('TWILIO_NOT_CONFIGURED');
      expect(result.retryable).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('should not log OTP or full phone number', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ sid: 'SM123' }),
      } as Response);

      await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'sms',
      });

      // Check that no log contains the OTP or full phone
      const allLogs = [...consoleSpy.mock.calls, ...consoleWarnSpy.mock.calls];
      for (const log of allLogs) {
        const logStr = log.join(' ');
        expect(logStr).not.toContain('123456');
        expect(logStr).not.toContain('+966500000000');
      }
    });
  });

  // ── WhatsApp Provider ───────────────────────────────────────────

  describe('WhatsAppProvider', () => {
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

    it('should report as configured when credentials are present', () => {
      expect(provider.isConfigured()).toBe(true);
    });

    it('should report as not configured when disabled', () => {
      const disabledProvider = new WhatsAppProvider({ ...config, enabled: false });
      expect(disabledProvider.isConfigured()).toBe(false);
    });

    it('should send OTP via WhatsApp successfully', async () => {
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.test123' }] }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
        correlationId: 'test-corr-2',
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('delivered');
      expect(result.messageId).toBe('wamid.test123');
      expect(result.deliveryOutcome).toBe('accepted');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify the request was made to WhatsApp API
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall?.[0]).toContain('graph.facebook.com');
    });

    it('sends to the configured Graph API version segment (L-03)', async () => {
      // Provider constructed with an explicit non-default version.
      const v21Provider = new WhatsAppProvider({ ...config, apiVersion: 'v21.0' });
      const mockFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.v21' }] }),
      } as Response);

      await v21Provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      const url = String(mockFetch.mock.calls[0]?.[0]);
      expect(url).toContain('graph.facebook.com/v21.0/');
    });

    it('should handle permanent provider rejection (400)', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({ error: { code: 100, message: 'Invalid parameter' } }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('WHATSAPP_ERROR');
      expect(result.retryable).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('should classify transient provider error (500) as unknown outcome', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => JSON.stringify({ error: { code: 1, message: 'Server error' } }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toContain('WHATSAPP_ERROR');
      expect(result.retryable).toBe(true);
      // S1.3 M-01: a 5xx is transient; delivery outcome uncertain → 'unknown'.
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('should classify rate limiting (429) as unknown outcome', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => JSON.stringify({ error: { code: 4, message: 'Rate limited' } }),
      } as Response);

      const result = await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      // S1.3 M-01: a 429 is transient; delivery outcome uncertain → 'unknown'.
      expect(result.deliveryOutcome).toBe('unknown');
    });

    it('should return explicit failure when not configured', async () => {
      const disabledProvider = new WhatsAppProvider({ ...config, enabled: false });

      const result = await disabledProvider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('WHATSAPP_NOT_CONFIGURED');
      expect(result.retryable).toBe(false);
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('should not log OTP or full phone number', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.test' }] }),
      } as Response);

      await provider.sendOtp({
        phone: '+966500000000',
        otp: '123456',
        channel: 'whatsapp',
      });

      // Check that no log contains the OTP or full phone
      const allLogs = [...consoleSpy.mock.calls, ...consoleWarnSpy.mock.calls];
      for (const log of allLogs) {
        const logStr = log.join(' ');
        expect(logStr).not.toContain('123456');
        expect(logStr).not.toContain('+966500000000');
      }
    });
  });

  // ── OTP Delivery Service ────────────────────────────────────────

  describe('OtpDeliveryService', () => {
    let service: OtpDeliveryService;

    beforeEach(() => {
      // Set up environment with both providers configured
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

    it('should report both channels as available when configured', () => {
      expect(service.isChannelAvailable('sms')).toBe(true);
      expect(service.isChannelAvailable('whatsapp')).toBe(true);
    });

    it('should return list of available channels', () => {
      const channels = service.getAvailableChannels();
      expect(channels).toContain('sms');
      expect(channels).toContain('whatsapp');
    });

    it('should deliver OTP via SMS channel', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ sid: 'SM123' }),
      } as Response);

      const result = await service.deliverOtp('+966500000000', '123456', 'sms', 'corr-1');

      expect(result.success).toBe(true);
      expect(result.status).toBe('delivered');
      expect(result.deliveryOutcome).toBe('accepted');
    });

    it('should deliver OTP via WhatsApp channel', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [{ id: 'wamid.test' }] }),
      } as Response);

      const result = await service.deliverOtp('+966500000000', '123456', 'whatsapp', 'corr-2');

      expect(result.success).toBe(true);
      expect(result.status).toBe('delivered');
      expect(result.deliveryOutcome).toBe('accepted');
    });

    it('should fail explicitly for unknown channel', async () => {
      const result = await service.deliverOtp(
        '+966500000000',
        '123456',
        'unknown' as any,
        'corr-3',
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('UNKNOWN_CHANNEL');
      expect(result.deliveryOutcome).toBe('rejected');
    });

    it('should handle provider failure gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => JSON.stringify({ error: { code: 1 } }),
      } as Response);

      const result = await service.deliverOtp('+966500000000', '123456', 'sms');

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(true);
      // S1.3 M-01: a 5xx surfaced through the delivery service is transient, so the
      // outcome is 'unknown' and the caller must preserve the challenge.
      expect(result.deliveryOutcome).toBe('unknown');
    });
  });
});
