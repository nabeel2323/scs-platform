/**
 * Notification provider configuration and validation.
 *
 * This module validates environment variables for SMS, WhatsApp, and SMTP
 * providers following the same pattern as env-gate.ts. Credentials are never
 * logged or exposed in error messages.
 *
 * Two independent questions are answered here, and they must not be conflated:
 *
 * 1. **Is the channel permitted?** `OTP_CHANNELS` is an explicit allowlist.
 *    It defaults to `email` alone, because the initial staging release delivers
 *    OTP by email only and SMS is deferred to a later phase (no SMS provider
 *    cost during testing). Setting TWILIO_* therefore does NOT switch SMS on.
 * 2. **Are credentials present?** `credentialsPresent` reports that, separately.
 *
 * `enabled` is the conjunction: permitted AND credentialed. A provider that is
 * not enabled never sends, and absent credentials for a channel that is not
 * permitted are not an error — they are the expected staging state.
 */

import { Logger } from '@nestjs/common';
import type { OtpDeliveryChannel } from './provider.interface';

const logger = new Logger('NotificationConfig');

/** Environment variable holding the comma-separated OTP channel allowlist. */
export const OTP_CHANNELS_ENV_VAR = 'OTP_CHANNELS';

/**
 * Channels the deployment permits when `OTP_CHANNELS` is unset or blank.
 * Email only: the initial staging release must not incur SMS provider cost.
 */
export const DEFAULT_OTP_CHANNELS: readonly OtpDeliveryChannel[] = ['email'];

/** Every channel an operator may name. The internal mock channel is excluded. */
const CONFIGURABLE_OTP_CHANNELS: readonly OtpDeliveryChannel[] = ['email', 'sms', 'whatsapp'];

/**
 * Raised when `OTP_CHANNELS` cannot be interpreted. Configuration errors abort
 * rather than silently falling back to a weaker or wider channel set.
 */
export class OtpChannelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpChannelConfigurationError';
  }
}

/** Resolved channel permission, independent of credential presence. */
export interface OtpChannelPolicy {
  /** Permitted public channels, in operator order, de-duplicated. */
  readonly channels: readonly OtpDeliveryChannel[];
  /** True when `OTP_CHANNELS` was unset/blank and the email-only default applied. */
  readonly defaulted: boolean;
}

/**
 * Resolve the OTP channel allowlist.
 *
 * Unknown or empty values throw: a typo such as `OTP_CHANNELS=emial` must not
 * quietly disable the only intended channel, and `mock` is never configurable
 * because it is an internal test channel (see provider-registry.service.ts).
 */
export function resolveOtpChannelPolicy(
  env: NodeJS.ProcessEnv = process.env,
): OtpChannelPolicy {
  const raw = env[OTP_CHANNELS_ENV_VAR]?.trim();
  if (!raw) {
    return { channels: [...DEFAULT_OTP_CHANNELS], defaulted: true };
  }

  const tokens = raw
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);

  const permitted = CONFIGURABLE_OTP_CHANNELS.join(', ');
  if (tokens.length === 0) {
    throw new OtpChannelConfigurationError(
      `${OTP_CHANNELS_ENV_VAR} is set but names no channel. ` +
        `Use a comma-separated list of: ${permitted}, or unset it for the email-only default.`,
    );
  }

  const channels: OtpDeliveryChannel[] = [];
  for (const token of tokens) {
    if (!CONFIGURABLE_OTP_CHANNELS.includes(token as OtpDeliveryChannel)) {
      throw new OtpChannelConfigurationError(
        `Unknown value "${token}" in ${OTP_CHANNELS_ENV_VAR}. ` +
          `Permitted channels are: ${permitted}. The internal mock channel is never configurable.`,
      );
    }
    const channel = token as OtpDeliveryChannel;
    if (!channels.includes(channel)) channels.push(channel);
  }

  return { channels, defaulted: false };
}

/** Whether the policy permits a channel, regardless of credentials. */
export function isChannelPermitted(
  policy: OtpChannelPolicy,
  channel: OtpDeliveryChannel,
): boolean {
  return policy.channels.includes(channel);
}

/**
 * Twilio SMS provider configuration.
 */
export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  /** Permitted by `OTP_CHANNELS` AND credentialed. Only this field gates sending. */
  enabled: boolean;
  /** Credentials are present, regardless of whether the channel is permitted. */
  credentialsPresent: boolean;
}

/**
 * Meta WhatsApp Business Cloud API configuration.
 */
export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  templateName: string;
  /** Graph API version segment, e.g. 'v18.0' (validated, never empty). */
  apiVersion: string;
  /** Permitted by `OTP_CHANNELS` AND credentialed. Only this field gates sending. */
  enabled: boolean;
  /** Credentials are present, regardless of whether the channel is permitted. */
  credentialsPresent: boolean;
}

/**
 * SMTP email provider configuration.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /**
   * Optional sender display name (`SMTP_FROM_NAME`). Combined with `from` into
   * an RFC 5322 `Name <address>` sender when set. Purely presentational: it never
   * affects enablement, and no paid service is required to use it.
   */
  fromName: string;
  /** Permitted by `OTP_CHANNELS` AND credentialed. Only this field gates sending. */
  enabled: boolean;
  /** Host and sender are present, regardless of whether the channel is permitted. */
  credentialsPresent: boolean;
}

/**
 * Default WhatsApp Graph API version when `WHATSAPP_API_VERSION` is unset or
 * invalid. This is the historically-pinned value; operators must confirm it is
 * still supported by Meta for their account before deploying.
 */
export const DEFAULT_WHATSAPP_API_VERSION = 'v18.0';

/** Accepted shape: `v<major>.<minor>` (e.g. v18.0, v21.1). */
const WHATSAPP_API_VERSION_PATTERN = /^v\d+\.\d+$/;

/**
 * Resolved notification provider configuration.
 */
export interface NotificationProviderConfig {
  /** Channel permission resolved from `OTP_CHANNELS` (default: email only). */
  policy: OtpChannelPolicy;
  twilio: TwilioConfig;
  whatsapp: WhatsAppConfig;
  smtp: SmtpConfig;
}

/**
 * Resolve Twilio configuration from environment variables.
 *
 * Security: Never logs credential values. Only reports presence/absence.
 *
 * @param env - Environment variables (defaults to process.env).
 * @returns Resolved Twilio configuration.
 */
export function resolveTwilioConfig(
  env: NodeJS.ProcessEnv = process.env,
  policy: OtpChannelPolicy = resolveOtpChannelPolicy(env),
): TwilioConfig {
  const accountSid = env['TWILIO_ACCOUNT_SID']?.trim();
  const authToken = env['TWILIO_AUTH_TOKEN']?.trim();
  const fromNumber = env['TWILIO_FROM_NUMBER']?.trim();

  const credentialsPresent = !!(accountSid && authToken && fromNumber);
  const permitted = isChannelPermitted(policy, 'sms');
  const enabled = credentialsPresent && permitted;

  // Report the two facts separately: "disabled by policy" is the expected
  // email-only staging state and is not a configuration problem.
  if (!permitted) {
    logger.log(
      `Twilio SMS provider is DISABLED by ${OTP_CHANNELS_ENV_VAR} (email-only release); ` +
        `credentials ${credentialsPresent ? 'present but unused' : 'absent — not required'}`,
    );
  } else if (!credentialsPresent) {
    logger.log('Twilio SMS provider is permitted but not configured (missing credentials)');
  } else {
    logger.log('Twilio SMS provider is configured and permitted');
  }

  return {
    accountSid: accountSid || '',
    authToken: authToken || '',
    fromNumber: fromNumber || '',
    enabled,
    credentialsPresent,
  };
}

/**
 * Resolve WhatsApp configuration from environment variables.
 *
 * Security: Never logs credential values. Only reports presence/absence.
 *
 * @param env - Environment variables (defaults to process.env).
 * @returns Resolved WhatsApp configuration.
 */
export function resolveWhatsAppConfig(
  env: NodeJS.ProcessEnv = process.env,
  policy: OtpChannelPolicy = resolveOtpChannelPolicy(env),
): WhatsAppConfig {
  const accessToken = env['WHATSAPP_ACCESS_TOKEN']?.trim();
  const phoneNumberId = env['WHATSAPP_PHONE_NUMBER_ID']?.trim();
  const businessAccountId = env['WHATSAPP_BUSINESS_ACCOUNT_ID']?.trim();
  const templateName = env['WHATSAPP_TEMPLATE_NAME']?.trim() || 'authentication';

  // Validate the Graph API version. An unset or malformed value falls back to the
  // documented default rather than crashing, and is reported without echoing input.
  const rawVersion = env['WHATSAPP_API_VERSION']?.trim();
  let apiVersion = DEFAULT_WHATSAPP_API_VERSION;
  if (rawVersion) {
    if (WHATSAPP_API_VERSION_PATTERN.test(rawVersion)) {
      apiVersion = rawVersion;
    } else {
      logger.warn(
        `WHATSAPP_API_VERSION is set but malformed (expected v<major>.<minor>). ` +
          `Falling back to the default ${DEFAULT_WHATSAPP_API_VERSION}.`,
      );
    }
  }

  const credentialsPresent = !!(accessToken && phoneNumberId && businessAccountId);
  const permitted = isChannelPermitted(policy, 'whatsapp');
  const enabled = credentialsPresent && permitted;

  if (!permitted) {
    logger.log(
      `WhatsApp provider is DISABLED by ${OTP_CHANNELS_ENV_VAR}; ` +
        `credentials ${credentialsPresent ? 'present but unused' : 'absent — not required'}`,
    );
  } else if (!credentialsPresent) {
    logger.log('WhatsApp provider is permitted but not configured (missing credentials)');
  } else {
    logger.log(`WhatsApp provider is configured and permitted (Graph API ${apiVersion})`);
  }

  return {
    accessToken: accessToken || '',
    phoneNumberId: phoneNumberId || '',
    businessAccountId: businessAccountId || '',
    templateName,
    apiVersion,
    enabled,
    credentialsPresent,
  };
}

/**
 * Resolve SMTP configuration from environment variables.
 *
 * Security: Never logs credential values. Only reports presence/absence.
 */
export function resolveSmtpConfig(
  env: NodeJS.ProcessEnv = process.env,
  policy: OtpChannelPolicy = resolveOtpChannelPolicy(env),
): SmtpConfig {
  const host = env['SMTP_HOST']?.trim() || '';
  const port = parseInt(env['SMTP_PORT']?.trim() || '587', 10);
  const secure = (env['SMTP_SECURE']?.trim() || 'false').toLowerCase() === 'true';
  const user = env['SMTP_USER']?.trim() || '';
  const password = env['SMTP_PASSWORD']?.trim() || '';
  const from = env['SMTP_FROM']?.trim() || '';
  const fromName = env['SMTP_FROM_NAME']?.trim() || '';

  // SMTP is considered configured when at minimum host and from are set.
  // Authentication (user/password) is optional — local dev uses Mailhog without auth.
  const credentialsPresent = !!(host && from);
  const permitted = isChannelPermitted(policy, 'email');
  const enabled = credentialsPresent && permitted;

  if (!permitted) {
    logger.log(`SMTP email provider is DISABLED by ${OTP_CHANNELS_ENV_VAR}`);
  } else if (!credentialsPresent) {
    logger.log('SMTP email provider is not configured (missing SMTP_HOST or SMTP_FROM)');
  } else {
    const authStatus = user ? 'with auth' : 'without auth (anonymous relay)';
    logger.log(`SMTP email provider is configured (${host}:${port}, ${authStatus})`);
  }

  return { host, port, secure, user, password, from, fromName, enabled, credentialsPresent };
}

/**
 * Resolve all notification provider configurations.
 *
 * @param env - Environment variables (defaults to process.env).
 * @returns Resolved provider configurations.
 */
export function resolveNotificationConfig(
  env: NodeJS.ProcessEnv = process.env,
): NotificationProviderConfig {
  const policy = resolveOtpChannelPolicy(env);
  return {
    policy,
    twilio: resolveTwilioConfig(env, policy),
    whatsapp: resolveWhatsAppConfig(env, policy),
    smtp: resolveSmtpConfig(env, policy),
  };
}

/** A single actionable configuration problem. Never contains credential values. */
export interface OtpReadinessProblem {
  /** Stable machine-readable code, safe to surface in an API response. */
  code: string;
  /** What an operator must do about it. Names variables, never their values. */
  message: string;
}

/** Whether this deployment can deliver an OTP at all, and what blocks it. */
export interface OtpReadiness {
  ready: boolean;
  problems: readonly OtpReadinessProblem[];
}

/**
 * Assess OTP delivery readiness for the resolved configuration.
 *
 * The email-only staging release makes email the channel that must work, so a
 * missing SMTP configuration is reported as an actionable error naming the exact
 * variables to set. Absent SMS/WhatsApp credentials are NOT problems while those
 * channels are not permitted — that is the intended state, and reporting it would
 * push operators towards buying an SMS provider they have deliberately deferred.
 *
 * `mockAvailable` lets development/test satisfy readiness through the internal
 * mock provider. It is passed in by the registry, which only creates that
 * provider under a non-production NODE_ENV plus an explicit opt-in, so this
 * function cannot be used to weaken the production boundary.
 */
export function resolveOtpReadiness(
  config: NotificationProviderConfig,
  options: { mockAvailable?: boolean } = {},
): OtpReadiness {
  const problems: OtpReadinessProblem[] = [];
  const mockAvailable = options.mockAvailable === true;

  if (isChannelPermitted(config.policy, 'email') && !config.smtp.enabled && !mockAvailable) {
    const missing: string[] = [];
    if (!config.smtp.host) missing.push('SMTP_HOST');
    if (!config.smtp.from) missing.push('SMTP_FROM');
    problems.push({
      code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
      message:
        `Email is the permitted OTP channel but SMTP is not configured (missing ${missing.join(' and ')}). ` +
        'Set SMTP_HOST, SMTP_PORT, SMTP_FROM and — for an authenticated relay — SMTP_USER and SMTP_PASSWORD. ' +
        'OTP requests will fail with EMAIL_PROVIDER_NOT_CONFIGURED until this is set; no SMS fallback exists.',
    });
  }

  if (isChannelPermitted(config.policy, 'sms') && !config.twilio.enabled) {
    problems.push({
      code: 'SMS_PROVIDER_NOT_CONFIGURED',
      message:
        `SMS is permitted by ${OTP_CHANNELS_ENV_VAR} but Twilio credentials are missing. ` +
        'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER, or remove sms from the allowlist.',
    });
  }

  if (isChannelPermitted(config.policy, 'whatsapp') && !config.whatsapp.enabled) {
    problems.push({
      code: 'WHATSAPP_PROVIDER_NOT_CONFIGURED',
      message:
        `WhatsApp is permitted by ${OTP_CHANNELS_ENV_VAR} but credentials are missing. ` +
        'Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_BUSINESS_ACCOUNT_ID, or remove whatsapp from the allowlist.',
    });
  }

  const canDeliver =
    mockAvailable || config.smtp.enabled || config.twilio.enabled || config.whatsapp.enabled;
  if (!canDeliver) {
    problems.push({
      code: 'NO_OTP_CHANNEL_AVAILABLE',
      message:
        `No permitted OTP channel can deliver (permitted: ${config.policy.channels.join(', ')}). ` +
        `Configure a provider for one of them, or set ${OTP_CHANNELS_ENV_VAR} to a channel you have configured.`,
    });
  }

  return { ready: canDeliver, problems };
}

/**
 * Validate that at least one notification provider is configured.
 *
 * This is a soft validation — the application can boot without providers,
 * but OTP delivery will fail explicitly.
 *
 * @param config - Resolved provider configuration.
 * @returns Whether at least one provider is configured.
 */
export function hasAnyProvider(config: NotificationProviderConfig): boolean {
  return config.twilio.enabled || config.whatsapp.enabled || config.smtp.enabled;
}

/**
 * Log provider status summary (no credentials).
 *
 * @param config - Resolved provider configuration.
 */
export function logProviderStatus(config: NotificationProviderConfig): void {
  logger.log(
    `OTP channels permitted by ${OTP_CHANNELS_ENV_VAR}: ${config.policy.channels.join(', ')}` +
      (config.policy.defaulted ? ' (default — email-only release)' : ''),
  );
  logger.log(`Twilio SMS provider: ${config.twilio.enabled ? 'ENABLED' : 'DISABLED'}`);
  logger.log(`WhatsApp provider: ${config.whatsapp.enabled ? 'ENABLED' : 'DISABLED'}`);
  logger.log(`SMTP email provider: ${config.smtp.enabled ? 'ENABLED' : 'DISABLED'}`);

  const readiness = resolveOtpReadiness(config);
  for (const problem of readiness.problems) {
    logger.warn(`[${problem.code}] ${problem.message}`);
  }
}
