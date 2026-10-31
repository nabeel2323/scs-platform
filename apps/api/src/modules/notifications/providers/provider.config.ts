/**
 * Notification provider configuration and validation.
 *
 * This module validates environment variables for SMS and WhatsApp providers
 * following the same pattern as env-gate.ts. Credentials are never logged or
 * exposed in error messages.
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('NotificationConfig');

/**
 * Twilio SMS provider configuration.
 */
export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  enabled: boolean;
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
  enabled: boolean;
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
  twilio: TwilioConfig;
  whatsapp: WhatsAppConfig;
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
): TwilioConfig {
  const accountSid = env['TWILIO_ACCOUNT_SID']?.trim();
  const authToken = env['TWILIO_AUTH_TOKEN']?.trim();
  const fromNumber = env['TWILIO_FROM_NUMBER']?.trim();

  const enabled = !!(accountSid && authToken && fromNumber);

  if (!enabled) {
    logger.log('Twilio SMS provider is not configured (missing credentials)');
  } else {
    logger.log('Twilio SMS provider is configured');
  }

  return {
    accountSid: accountSid || '',
    authToken: authToken || '',
    fromNumber: fromNumber || '',
    enabled,
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

  const enabled = !!(accessToken && phoneNumberId && businessAccountId);

  if (!enabled) {
    logger.log('WhatsApp provider is not configured (missing credentials)');
  } else {
    logger.log(`WhatsApp provider is configured (Graph API ${apiVersion})`);
  }

  return {
    accessToken: accessToken || '',
    phoneNumberId: phoneNumberId || '',
    businessAccountId: businessAccountId || '',
    templateName,
    apiVersion,
    enabled,
  };
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
  return {
    twilio: resolveTwilioConfig(env),
    whatsapp: resolveWhatsAppConfig(env),
  };
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
  return config.twilio.enabled || config.whatsapp.enabled;
}

/**
 * Log provider status summary (no credentials).
 *
 * @param config - Resolved provider configuration.
 */
export function logProviderStatus(config: NotificationProviderConfig): void {
  logger.log(`SMS provider (Twilio): ${config.twilio.enabled ? 'ENABLED' : 'DISABLED'}`);
  logger.log(`WhatsApp provider: ${config.whatsapp.enabled ? 'ENABLED' : 'DISABLED'}`);

  if (!hasAnyProvider(config)) {
    logger.warn(
      'No notification providers are configured. OTP delivery will fail explicitly. ' +
        'Set TWILIO_* or WHATSAPP_* environment variables to enable delivery.',
    );
  }
}
