/**
 * OTP delivery boot gate — email-only initial staging release.
 *
 * The release permits email only (`OTP_CHANNELS` defaults to `email`), so two
 * situations must never be conflated:
 *
 *  - **SMS credentials are absent.** This is the intended state of the release.
 *    It is not an error, it produces no readiness problem, and it must never
 *    stop the process from booting. The Twilio/WhatsApp implementations stay in
 *    the codebase, dormant, for a later phase.
 *  - **No permitted channel can deliver.** A deployed process in this state
 *    accepts OTP requests it can never fulfil and tells users a code is on its
 *    way. That is the silent-failure class this whole remediation exists to
 *    remove, so the process refuses to boot and names the variables to set.
 *
 * When email is unconfigured but some *other* permitted channel can deliver, the
 * email problem is reported as a warning and the process still boots — the
 * operator has made a deliberate choice and the API is not dead.
 *
 * Like the other boot gates this is a no-op in development/test, and it never
 * includes credential values in its messages.
 */

import { Logger } from '@nestjs/common';
import { isProductionLikeEnv } from './env-gate';
import {
  OtpReadiness,
  resolveNotificationConfig,
  resolveOtpReadiness,
} from '../modules/notifications/providers/provider.config';

const logger = new Logger('OtpDeliveryGate');

/** Raised when a deployed process has no usable OTP delivery channel. */
export class OtpDeliveryConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpDeliveryConfigurationError';
  }
}

/**
 * Validate OTP delivery configuration before the app is created.
 *
 * @param env Environment to read; defaults to `process.env`.
 * @returns The resolved readiness, so the caller can log a non-sensitive summary.
 * @throws {OtpChannelConfigurationError} when `OTP_CHANNELS` is malformed — in
 *   every environment, because a typo there silently disables a channel.
 * @throws {OtpDeliveryConfigurationError} when a production-like process has no
 *   permitted channel that can deliver.
 */
export function assertOtpDeliveryConfig(env: NodeJS.ProcessEnv = process.env): OtpReadiness {
  const nodeEnv = env['NODE_ENV'];
  const productionLike = isProductionLikeEnv(nodeEnv);

  // Throws on a malformed allowlist regardless of environment.
  const config = resolveNotificationConfig(env);

  // The mock channel is a hard non-production boundary (see ProviderRegistryService):
  // it may only count as a delivery path where it would actually be instantiated.
  const mockOptIn = (env['OTP_MOCK_ENABLED'] || '').trim().toLowerCase() === 'true';
  const readiness = resolveOtpReadiness(config, {
    mockAvailable: !productionLike && mockOptIn,
  });

  for (const problem of readiness.problems) {
    logger.warn(`[${problem.code}] ${problem.message}`);
  }

  if (productionLike && !readiness.ready) {
    throw new OtpDeliveryConfigurationError(
      'No permitted OTP delivery channel is configured — refusing to boot an environment ' +
        'that would accept OTP requests it cannot fulfil.\n' +
        readiness.problems.map((p) => `  [${p.code}] ${p.message}`).join('\n'),
    );
  }

  return readiness;
}