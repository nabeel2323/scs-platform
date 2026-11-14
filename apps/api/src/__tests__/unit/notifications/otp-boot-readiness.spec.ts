/**
 * OTP delivery boot gate — email-only staging release.
 *
 * Two failure modes have to be kept apart:
 *
 *  1. SMS credentials are absent. During the email-only release this is the
 *     EXPECTED state, not a misconfiguration, and it must never stop the process
 *     from booting.
 *  2. No permitted channel can deliver at all. A deployed process in that state
 *     accepts OTP requests it can never fulfil, so it must refuse to boot with a
 *     message that names the variables an operator has to set.
 *
 * Like the other boot gates, this is a no-op in development/test so local tooling
 * and the suite keep working without any provider configured.
 */

import { describe, it, expect } from 'vitest';
import {
  OtpDeliveryConfigurationError,
  assertOtpDeliveryConfig,
} from '../../../config/otp-delivery-gate';

const SMTP_CREDS = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_USER: 'smtp-user',
  SMTP_PASSWORD: 'not-a-real-secret',
  SMTP_FROM: 'otp@example.test',
};

const TWILIO_CREDS = {
  TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
  TWILIO_AUTH_TOKEN: 'not-a-real-token',
  TWILIO_FROM_NUMBER: '+15005550006',
};

const env = (extra: Record<string, string> = {}) =>
  ({ NODE_ENV: 'staging', ...extra }) as NodeJS.ProcessEnv;

describe('assertOtpDeliveryConfig', () => {
  it('boots staging with email configured and no SMS credential anywhere', () => {
    const readiness = assertOtpDeliveryConfig(env({ ...SMTP_CREDS }));

    expect(readiness.ready).toBe(true);
    expect(readiness.problems).toEqual([]);
  });

  it('refuses to boot a deployed process that cannot deliver any OTP', () => {
    expect(() => assertOtpDeliveryConfig(env())).toThrow(OtpDeliveryConfigurationError);
  });

  it('names the SMTP variables an operator must set', () => {
    let message = '';
    try {
      assertOtpDeliveryConfig(env());
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('SMTP_HOST');
    expect(message).toContain('SMTP_FROM');
    expect(message).toContain('EMAIL_PROVIDER_NOT_CONFIGURED');
  });

  it('does not demand Twilio credentials while SMS is disabled', () => {
    expect(() => assertOtpDeliveryConfig(env({ ...SMTP_CREDS }))).not.toThrow();

    const readiness = assertOtpDeliveryConfig(env({ ...SMTP_CREDS }));
    expect(readiness.problems.map((p) => p.code)).not.toContain('SMS_PROVIDER_NOT_CONFIGURED');
  });

  it('is a no-op in development, which has no provider configured', () => {
    const readiness = assertOtpDeliveryConfig({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(readiness.ready).toBe(false);
  });

  it('is a no-op in test', () => {
    expect(() =>
      assertOtpDeliveryConfig({ NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('accepts the mock provider as a development delivery path but never in staging', () => {
    const mockEnv = { NODE_ENV: 'development', OTP_MOCK_ENABLED: 'true' };
    expect(() => assertOtpDeliveryConfig(mockEnv as NodeJS.ProcessEnv)).not.toThrow();

    // A deployed process may not rely on the mock channel.
    expect(() =>
      assertOtpDeliveryConfig(env({ OTP_MOCK_ENABLED: 'true' })),
    ).toThrow(OtpDeliveryConfigurationError);
  });

  it('fails fast on a malformed OTP_CHANNELS value in any environment', () => {
    expect(() =>
      assertOtpDeliveryConfig({ NODE_ENV: 'development', OTP_CHANNELS: 'carrier-pigeon' } as NodeJS.ProcessEnv),
    ).toThrow(/OTP_CHANNELS/);
  });

  it('warns but still boots when email is unconfigured yet another permitted channel can deliver', () => {
    const readiness = assertOtpDeliveryConfig(
      env({ ...TWILIO_CREDS, OTP_CHANNELS: 'email,sms' }),
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.problems.map((p) => p.code)).toContain('EMAIL_PROVIDER_NOT_CONFIGURED');
  });

  it('never puts credential values in the thrown message', () => {
    let message = '';
    try {
      assertOtpDeliveryConfig(env({ ...SMTP_CREDS, SMTP_FROM: '' }));
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain('not-a-real-secret');
    expect(message).not.toContain('smtp-user');
  });
});