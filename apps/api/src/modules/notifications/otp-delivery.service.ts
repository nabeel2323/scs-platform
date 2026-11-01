/**
 * OTP delivery service — orchestrates provider selection and delivery.
 *
 * This service manages the lifecycle of OTP delivery:
 * 1. Select the appropriate provider via the ProviderRegistryService.
 * 2. Attempt delivery via the selected provider.
 * 3. Handle failures gracefully (no silent bypasses).
 * 4. Log delivery status without exposing sensitive data.
 *
 * Security:
 * - Never logs OTP values or full phone/email addresses.
 * - Returns explicit failure when no provider is configured.
 * - Returns deliveryOutcome classification for safe OTP lifecycle management.
 * - Mock provider is accessible only through internal test injection.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  OtpDeliveryChannel,
  InternalDeliveryChannel,
  ChallengeDeliveryRequest,
  OtpDeliveryResult,
} from './providers/provider.interface';
import { ProviderRegistryService } from './provider-registry.service';
import { maskPhone } from '../../common/utils/phone-validation';
import { maskEmail } from '../../common/utils/email-normalization';

@Injectable()
export class OtpDeliveryService {
  private readonly logger = new Logger(OtpDeliveryService.name);
  private readonly registry!: ProviderRegistryService;

  constructor(registry?: ProviderRegistryService) {
    if (registry) {
      this.registry = registry;
    } else {
      // Legacy test path — create a default registry
      try {
        this.registry = new ProviderRegistryService();
      } catch {
        // ProviderRegistryService may fail in test env without config
      }
    }
  }

  /**
   * Deliver an OTP via a phone channel (SMS or WhatsApp).
   *
   * Backward-compatible method for existing phone OTP flows.
   *
   * @param phone - Destination phone number in E.164 format.
   * @param otp - The OTP code to deliver (6 digits).
   * @param channel - Requested delivery channel ('sms' or 'whatsapp').
   * @param correlationId - Optional correlation ID for tracking.
   * @returns The delivery result.
   */
  async deliverOtp(
    phone: string,
    otp: string,
    channel: OtpDeliveryChannel,
    correlationId?: string,
  ): Promise<OtpDeliveryResult> {
    return this.deliverChallenge({
      otp,
      channel,
      correlationId,
      phone,
      subject: maskPhone(phone),
      subjectType: 'phone',
    });
  }

  /**
   * Deliver an OTP via email.
   *
   * @param email - Normalized recipient email address.
   * @param otp - The OTP code to deliver (6 digits).
   * @param correlationId - Optional correlation ID for tracking.
   * @returns The delivery result.
   */
  async deliverEmailOtp(
    email: string,
    otp: string,
    correlationId?: string,
  ): Promise<OtpDeliveryResult> {
    return this.deliverChallenge({
      otp,
      channel: 'email',
      correlationId,
      email,
      subject: maskEmail(email),
      subjectType: 'email',
    });
  }

  /**
   * Deliver an OTP challenge via a specific internal channel (including mock).
   * Used by test infrastructure for deterministic OTP delivery.
   */
  async deliverToTestChannel(
    request: ChallengeDeliveryRequest,
  ): Promise<OtpDeliveryResult> {
    return this.deliverChallenge(request);
  }

  /**
   * Check if a specific public channel is available.
   */
  isChannelAvailable(channel: OtpDeliveryChannel): boolean {
    return this.registry.isChannelAvailable(channel);
  }

  /**
   * Get the list of available public delivery channels.
   */
  getAvailableChannels(): OtpDeliveryChannel[] {
    return this.registry.getAvailableChannels();
  }

  /**
   * Core delivery method — routes through the provider registry.
   */
  private async deliverChallenge(
    request: ChallengeDeliveryRequest,
  ): Promise<OtpDeliveryResult> {
    const channel = request.channel;

    // Reject unknown channels explicitly (backward compat)
    if (!this.isPublicChannel(channel) && channel !== 'mock') {
      return {
        success: false,
        status: 'failed',
        errorReason: 'UNKNOWN_CHANNEL',
        retryable: false,
        deliveryOutcome: 'rejected' as const,
      };
    }

    try {
      // Route through the appropriate registry accessor
      const provider = this.isPublicChannel(channel)
        ? this.registry.getForChannel(channel as OtpDeliveryChannel)
        : this.registry.getForTest(channel as InternalDeliveryChannel);

      if (!provider.isConfigured()) {
        this.logger.warn(`Provider for channel '${channel}' is not configured`);
        return {
          success: false,
          status: 'failed',
          errorReason: `${channel.toUpperCase()}_PROVIDER_NOT_CONFIGURED`,
          retryable: false,
          deliveryOutcome: 'rejected' as const,
        };
      }

      const result = await provider.sendOtp(request);

      if (result.success) {
        this.logger.log(
          `OTP delivered via ${channel} to ${request.subject} (message: ${result.messageId || 'unknown'}, correlation: ${request.correlationId || 'none'})`,
        );
      } else {
        this.logger.warn(
          `OTP delivery failed via ${channel} to ${request.subject}: ${result.errorReason} (retryable: ${result.retryable || false})`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Unexpected error during OTP delivery via ${channel} to ${request.subject}: ${error instanceof Error ? error.message : 'unknown'}`,
      );

      return {
        success: false,
        status: 'failed',
        errorReason: 'DELIVERY_ERROR',
        retryable: false,
        deliveryOutcome: 'unknown' as const,
      };
    }
  }

  private isPublicChannel(channel: string): boolean {
    return channel === 'sms' || channel === 'whatsapp' || channel === 'email';
  }
}
