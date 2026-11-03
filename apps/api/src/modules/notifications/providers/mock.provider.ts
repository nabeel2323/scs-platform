/**
 * Internal mock OTP delivery provider.
 *
 * Available ONLY for isolated automated tests and explicitly controlled
 * non-production development. This provider:
 *
 * - Stores delivered OTPs in memory for test retrieval.
 * - Rejects initialization in production and staging environments.
 * - Is NEVER registered in the public provider map.
 * - Is NEVER selectable through a public API request parameter.
 * - NEVER returns generated OTP values through ordinary API responses.
 * - OTP retrieval for tests uses internal service injection only.
 *
 * Security:
 * - No OTP values are logged.
 * - No email addresses or phone numbers are logged in full.
 * - The mock channel is excluded from public DTOs via @IsIn validation.
 */

import { Logger } from '@nestjs/common';
import {
  NotificationProvider,
  ChallengeDeliveryRequest,
  OtpDeliveryResult,
  InternalDeliveryChannel,
} from './provider.interface';
import { isProductionLikeEnv } from '../../../config/env-gate';

const logger = new Logger('MockOtpProvider');

export class MockOtpProvider implements NotificationProvider {
  readonly name = 'mock';
  readonly channel: InternalDeliveryChannel = 'mock';

  /**
   * In-memory store of delivered OTPs keyed by subject (normalized email or phone).
   * Each entry holds the most recent OTP for that subject.
   */
  private readonly otpStore = new Map<string, string>();

  constructor() {
    // Initialization guard: reject mock provider in production/staging.
    const nodeEnv = process.env['NODE_ENV'];
    if (isProductionLikeEnv(nodeEnv)) {
      throw new Error(
        `MockOtpProvider: REFUSED — mock delivery provider cannot be initialized in ` +
        `"${nodeEnv || 'unset'}" environment. This is a hard security boundary.`,
      );
    }

    // F-10 (S1.38): require explicit opt-in even in development/test.
    // An absent or blank NODE_ENV no longer silently activates mock delivery.
    const mockEnabled = (process.env['OTP_MOCK_ENABLED'] || '').trim().toLowerCase();
    if (mockEnabled !== 'true') {
      throw new Error(
        'MockOtpProvider: REFUSED — mock delivery provider requires explicit ' +
        'OTP_MOCK_ENABLED=true opt-in. This is a fail-closed security boundary (S1.38 F-10).',
      );
    }

    logger.log('MockOtpProvider initialized (development/test with explicit opt-in only)');
  }

  isConfigured(): boolean {
    return true;
  }

  async sendOtp(request: ChallengeDeliveryRequest): Promise<OtpDeliveryResult> {
    // Store the OTP keyed by subject for test retrieval.
    // Derive a key from phone/email if subject is not provided.
    const key = request.subject ?? request.phone ?? request.email ?? 'unknown';
    this.otpStore.set(key, request.otp);

    logger.log(`Mock OTP stored for ${request.subjectType ?? 'unknown'} subject (correlation: ${request.correlationId || 'none'})`);

    return {
      success: true,
      status: 'mock_delivered',
      messageId: `mock-${Date.now()}`,
      deliveryOutcome: 'accepted' as const,
    };
  }

  /**
   * Retrieve the last OTP stored for a subject.
   *
   * This is an INTERNAL-ONLY method for automated test injection.
   * It must NEVER be exposed through API responses or controllers.
   *
   * @param subject - Normalized email or phone used as the key.
   * @returns The last OTP stored, or null if none.
   */
  getLastOtp(subject: string): string | null {
    return this.otpStore.get(subject) ?? null;
  }

  /**
   * Clear all stored OTPs. For test cleanup between test cases.
   */
  clearAll(): void {
    this.otpStore.clear();
  }

  /**
   * Check if a subject has a stored OTP (without returning the value).
   */
  hasOtp(subject: string): boolean {
    return this.otpStore.has(subject);
  }
}
