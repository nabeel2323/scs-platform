import { describe, it, expect } from 'vitest';
import {
  DEFAULT_OTP_CHANNELS,
  OtpChannelConfigurationError,
  resolveNotificationConfig,
  resolveOtpChannelPolicy,
  resolveOtpReadiness,
  resolveSmtpConfig,
} from '../../../modules/notifications/providers/provider.config';

/**
 * Email-only OTP channel policy (initial staging release).
 *
 * The business decision is that the first staging release delivers OTP by EMAIL
 * only: SMS is deferred to a later phase so no SMS provider cost is incurred
 * during testing. Before this policy existed, a provider was "enabled" purely
 * because its credentials were present, which meant setting TWILIO_* silently
 * turned SMS on. These tests pin the opposite: permission is explicit and
 * separate from credential presence, and the default permits email alone.
 *
 * Every assertion here names a production change that would break it — e.g.
 * making `enabled` credential-only again, or defaulting the allowlist to all
 * three channels.
 */

const SMTP_CREDS = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'otp@example.test',
  SMTP_PASSWORD: 'not-a-real-secret',
  SMTP_FROM: 'otp@example.test',
};

const TWILIO_CREDS = {
  TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
  TWILIO_AUTH_TOKEN: 'not-a-real-token',
  TWILIO_FROM_NUMBER: '+15005550006',
};

const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv =>
  ({ ...extra } as NodeJS.ProcessEnv);

describe('resolveOtpChannelPolicy — explicit permission, email-only by default', () => {
  it('permits email alone when OTP_CHANNELS is unset', () => {
    const policy = resolveOtpChannelPolicy(env());
    expect([...policy.channels]).toEqual(['email']);
    expect(policy.defaulted).toBe(true);
  });

  it('exports the default as email only, so the default cannot drift silently', () => {
    expect([...DEFAULT_OTP_CHANNELS]).toEqual(['email']);
  });

  it('treats a blank OTP_CHANNELS as unset rather than as "no channels"', () => {
    expect([...resolveOtpChannelPolicy(env({ OTP_CHANNELS: '   ' })).channels]).toEqual(['email']);
  });

  it('accepts an explicit email-only allowlist', () => {
    const policy = resolveOtpChannelPolicy(env({ OTP_CHANNELS: 'email' }));
    expect([...policy.channels]).toEqual(['email']);
    expect(policy.defaulted).toBe(false);
  });

  it('permits SMS only when the operator lists it (the future activation path)', () => {
    const policy = resolveOtpChannelPolicy(env({ OTP_CHANNELS: 'email,sms' }));
    expect([...policy.channels]).toEqual(['email', 'sms']);
  });

  it('trims, lowercases and de-duplicates while preserving operator order', () => {
    const policy = resolveOtpChannelPolicy(env({ OTP_CHANNELS: ' SMS , email ,sms, WhatsApp ' }));
    expect([...policy.channels]).toEqual(['sms', 'email', 'whatsapp']);
  });

  it('rejects an unknown channel by name instead of silently ignoring it', () => {
    expect(() => resolveOtpChannelPolicy(env({ OTP_CHANNELS: 'email,pigeon' }))).toThrow(
      OtpChannelConfigurationError,
    );
    try {
      resolveOtpChannelPolicy(env({ OTP_CHANNELS: 'email,pigeon' }));
      expect.unreachable('an unknown channel must abort configuration');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('OTP_CHANNELS');
      expect(message).toContain('pigeon');
      expect(message).toContain('email');
    }
  });

  it('rejects a list that parses to nothing', () => {
    expect(() => resolveOtpChannelPolicy(env({ OTP_CHANNELS: ' , , ' }))).toThrow(
      OtpChannelConfigurationError,
    );
  });

  it('never permits the internal mock channel through configuration', () => {
    expect(() => resolveOtpChannelPolicy(env({ OTP_CHANNELS: 'email,mock' }))).toThrow(
      OtpChannelConfigurationError,
    );
  });
});

describe('resolveNotificationConfig — permission is separate from credentials', () => {
  it('keeps SMS disabled even when full Twilio credentials are present', () => {
    const config = resolveNotificationConfig(env({ ...SMTP_CREDS, ...TWILIO_CREDS }));
    expect(config.twilio.credentialsPresent).toBe(true);
    expect(config.twilio.enabled).toBe(false);
  });

  it('keeps WhatsApp disabled even when full credentials are present', () => {
    const config = resolveNotificationConfig(
      env({
        ...SMTP_CREDS,
        WHATSAPP_ACCESS_TOKEN: 'not-a-real-token',
        WHATSAPP_PHONE_NUMBER_ID: '123',
        WHATSAPP_BUSINESS_ACCOUNT_ID: '456',
      }),
    );
    expect(config.whatsapp.credentialsPresent).toBe(true);
    expect(config.whatsapp.enabled).toBe(false);
  });

  it('does not throw when SMS credentials are absent and SMS is not permitted', () => {
    expect(() => resolveNotificationConfig(env(SMTP_CREDS))).not.toThrow();
    const config = resolveNotificationConfig(env(SMTP_CREDS));
    expect(config.twilio.enabled).toBe(false);
    expect(config.twilio.credentialsPresent).toBe(false);
    expect(config.smtp.enabled).toBe(true);
  });

  it('enables email when it is permitted and SMTP is configured', () => {
    const config = resolveNotificationConfig(env(SMTP_CREDS));
    expect(config.smtp.enabled).toBe(true);
    expect(config.smtp.credentialsPresent).toBe(true);
    expect([...config.policy.channels]).toEqual(['email']);
  });

  it('disables email when the operator omits it from the allowlist', () => {
    const config = resolveNotificationConfig(env({ ...SMTP_CREDS, OTP_CHANNELS: 'sms' }));
    expect(config.smtp.credentialsPresent).toBe(true);
    expect(config.smtp.enabled).toBe(false);
  });

  it('enables SMS only when it is both permitted and credentialed', () => {
    const permitted = resolveNotificationConfig(
      env({ ...SMTP_CREDS, ...TWILIO_CREDS, OTP_CHANNELS: 'email,sms' }),
    );
    expect(permitted.twilio.enabled).toBe(true);

    const uncredentialed = resolveNotificationConfig(env({ ...SMTP_CREDS, OTP_CHANNELS: 'email,sms' }));
    expect(uncredentialed.twilio.enabled).toBe(false);
  });
});

describe('resolveSmtpConfig — sender display name', () => {
  it('reads SMTP_FROM_NAME so the sender can be labelled without a paid service', () => {
    const config = resolveSmtpConfig(env({ ...SMTP_CREDS, SMTP_FROM_NAME: 'SCS Staging' }));
    expect(config.fromName).toBe('SCS Staging');
  });

  it('trims the display name and defaults to empty when unset', () => {
    expect(resolveSmtpConfig(env({ ...SMTP_CREDS, SMTP_FROM_NAME: '  SCS  ' })).fromName).toBe('SCS');
    expect(resolveSmtpConfig(env(SMTP_CREDS)).fromName).toBe('');
  });

  it('never derives enablement from the display name', () => {
    expect(resolveSmtpConfig(env({ SMTP_FROM_NAME: 'SCS' })).enabled).toBe(false);
  });
});

describe('resolveOtpReadiness — actionable email configuration error', () => {
  it('is ready when email is permitted and SMTP is configured', () => {
    const readiness = resolveOtpReadiness(resolveNotificationConfig(env(SMTP_CREDS)));
    expect(readiness.ready).toBe(true);
    expect(readiness.problems).toEqual([]);
  });

  it('reports missing email configuration with the variables an operator must set', () => {
    const readiness = resolveOtpReadiness(resolveNotificationConfig(env()));
    expect(readiness.ready).toBe(false);
    const problem = readiness.problems.find((p) => p.code === 'EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(problem).toBeDefined();
    expect(problem?.message).toContain('SMTP_HOST');
    expect(problem?.message).toContain('SMTP_FROM');
  });

  it('does not report a problem for absent SMS credentials while SMS is disabled', () => {
    const readiness = resolveOtpReadiness(resolveNotificationConfig(env(SMTP_CREDS)));
    expect(readiness.problems.map((p) => p.code)).not.toContain('SMS_PROVIDER_NOT_CONFIGURED');
    expect(readiness.ready).toBe(true);
  });

  it('accepts the internal mock provider as delivery in dev/test only', () => {
    const config = resolveNotificationConfig(env());
    expect(resolveOtpReadiness(config, { mockAvailable: true }).ready).toBe(true);
    expect(resolveOtpReadiness(config, { mockAvailable: false }).ready).toBe(false);
  });

  it('reports when the allowlist permits no channel that can deliver', () => {
    const readiness = resolveOtpReadiness(
      resolveNotificationConfig(env({ ...SMTP_CREDS, OTP_CHANNELS: 'sms' })),
    );
    expect(readiness.ready).toBe(false);
    expect(readiness.problems.map((p) => p.code)).toContain('NO_OTP_CHANNEL_AVAILABLE');
  });

  it('never echoes credential values into a readiness message', () => {
    const readiness = resolveOtpReadiness(
      resolveNotificationConfig(env({ SMTP_HOST: 'smtp.example.test', SMTP_FROM: '' , SMTP_PASSWORD: 'super-secret-value' })),
    );
    const serialized = JSON.stringify(readiness);
    expect(serialized).not.toContain('super-secret-value');
  });
});