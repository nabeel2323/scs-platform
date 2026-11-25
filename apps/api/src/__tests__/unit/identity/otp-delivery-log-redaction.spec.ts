import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { OtpDeliveryService } from '../../../modules/notifications/otp-delivery.service';

const OTP = '583921';
const EMAIL = 'private.person@example.test';
const PHONE = '+966500123456';

function createService(provider: {
  isConfigured: () => boolean;
  sendOtp: (request: unknown) => Promise<unknown>;
}) {
  const registry = {
    isChannelPermitted: vi.fn().mockReturnValue(true),
    getForChannel: vi.fn().mockReturnValue(provider),
    getForTest: vi.fn().mockReturnValue(provider),
    isChannelAvailable: vi.fn().mockReturnValue(true),
    getAvailableChannels: vi.fn().mockReturnValue(['email']),
  };
  return new OtpDeliveryService(registry as any);
}

const request = {
  channel: 'email',
  otp: OTP,
  email: EMAIL,
  phone: PHONE,
  subject: EMAIL,
  subjectType: 'email',
  correlationId: 'otp-correlation-1',
} as any;

describe('OtpDeliveryService log redaction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not log recipient, OTP, provider errorReason, or provider message id', async () => {
    const provider = {
      isConfigured: () => true,
      sendOtp: vi.fn().mockResolvedValue({
        success: false,
        status: 'failed',
        errorReason: `provider rejected ${EMAIL} with OTP ${OTP}`,
        messageId: `provider-message-${PHONE}`,
        retryable: false,
      }),
    };
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = createService(provider);

    await service.deliverToTestChannel(request);

    const output = warn.mock.calls.flat().join(' ');
    expect(output).toContain('OTP delivery failed via email');
    expect(output).not.toContain(OTP);
    expect(output).not.toContain(EMAIL);
    expect(output).not.toContain(PHONE);
    expect(output).not.toContain('provider rejected');
    expect(output).not.toContain('provider-message');
  });

  it('does not log raw provider exception messages or request subject', async () => {
    const provider = {
      isConfigured: () => true,
      sendOtp: vi.fn().mockRejectedValue(
        new Error(`SMTP exception for ${EMAIL}, phone ${PHONE}, OTP ${OTP}`),
      ),
    };
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = createService(provider);

    await service.deliverToTestChannel(request);

    const output = error.mock.calls.flat().join(' ');
    expect(output).toContain('Unexpected error during OTP delivery via email [Error]');
    expect(output).not.toContain(OTP);
    expect(output).not.toContain(EMAIL);
    expect(output).not.toContain(PHONE);
    expect(output).not.toContain('SMTP exception');
  });
});
