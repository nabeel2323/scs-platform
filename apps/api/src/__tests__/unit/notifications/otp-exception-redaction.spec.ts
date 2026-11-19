import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OtpDeliveryService } from '../../../modules/notifications/otp-delivery.service';
import { TwilioSmsProvider } from '../../../modules/notifications/providers/twilio-sms.provider';
import { WhatsAppProvider } from '../../../modules/notifications/providers/whatsapp.provider';

const SECRET_OTP = '8675309';
const SECRET_PHONE = '+966500123456';
const UNSAFE_PROVIDER_ERROR = new TypeError(
  `provider diagnostic echoed OTP ${SECRET_OTP} for recipient ${SECRET_PHONE}`,
);

function captureErrorLogs() {
  return vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
}

function serializedLogs(spy: ReturnType<typeof captureErrorLogs>): string {
  return JSON.stringify(spy.mock.calls);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OTP exception log redaction', () => {
  it('suppresses provider exception details in OtpDeliveryService', async () => {
    const errorLogs = captureErrorLogs();
    const provider = {
      isConfigured: () => true,
      sendOtp: vi.fn().mockRejectedValue(UNSAFE_PROVIDER_ERROR),
    };
    const registry = {
      isChannelPermitted: () => true,
      getForChannel: () => provider,
      getForTest: () => provider,
    };
    const service = new OtpDeliveryService(registry as never);

    const result = await service.deliverOtp(
      SECRET_PHONE,
      SECRET_OTP,
      'sms',
      'otp-redaction-test-correlation',
    );

    expect(result.success).toBe(false);
    expect(result.errorReason).toBe('DELIVERY_ERROR');
    expect(errorLogs).toHaveBeenCalledOnce();
    expect(serializedLogs(errorLogs)).not.toContain(SECRET_OTP);
    expect(serializedLogs(errorLogs)).not.toContain(SECRET_PHONE);
    expect(serializedLogs(errorLogs)).toContain('otp-redaction-test-correlation');
  });

  it('suppresses raw network exception details in Twilio logs', async () => {
    const errorLogs = captureErrorLogs();
    const provider = new TwilioSmsProvider({
      accountSid: 'ACtest123',
      authToken: 'test-token',
      fromNumber: '+15551234567',
      enabled: true,
      credentialsPresent: true,
    });

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(UNSAFE_PROVIDER_ERROR);

    const result = await provider.sendOtp({
      phone: SECRET_PHONE,
      otp: SECRET_OTP,
      channel: 'sms',
      correlationId: 'twilio-redaction-test',
    });

    expect(result.success).toBe(false);
    expect(result.errorReason).toBe('TWILIO_NETWORK_ERROR');
    expect(errorLogs).toHaveBeenCalledOnce();
    expect(serializedLogs(errorLogs)).not.toContain(SECRET_OTP);
    expect(serializedLogs(errorLogs)).not.toContain(SECRET_PHONE);
    expect(serializedLogs(errorLogs)).toContain('twilio-redaction-test');
  });

  it('suppresses raw network exception details in WhatsApp logs', async () => {
    const errorLogs = captureErrorLogs();
    const provider = new WhatsAppProvider({
      accessToken: 'test-access-token',
      phoneNumberId: '123456789',
      businessAccountId: '987654321',
      templateName: 'authentication',
      apiVersion: 'v18.0',
      enabled: true,
      credentialsPresent: true,
    });

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(UNSAFE_PROVIDER_ERROR);

    const result = await provider.sendOtp({
      phone: SECRET_PHONE,
      otp: SECRET_OTP,
      channel: 'whatsapp',
      correlationId: 'whatsapp-redaction-test',
    });

    expect(result.success).toBe(false);
    expect(result.errorReason).toBe('WHATSAPP_NETWORK_ERROR');
    expect(errorLogs).toHaveBeenCalledOnce();
    expect(serializedLogs(errorLogs)).not.toContain(SECRET_OTP);
    expect(serializedLogs(errorLogs)).not.toContain(SECRET_PHONE);
    expect(serializedLogs(errorLogs)).toContain('whatsapp-redaction-test');
  });
});
