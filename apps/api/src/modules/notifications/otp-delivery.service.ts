/**
 * OTP delivery service — orchestrates provider selection and delivery.
 *
 * This service manages the lifecycle of OTP delivery:
 * 1. Select the appropriate provider based on the requested channel.
 * 2. Attempt delivery via the selected provider.
 * 3. Handle failures gracefully (no silent bypasses).
 * 4. Log delivery status without exposing sensitive data.
 *
 * Security:
 * - Never logs OTP values or full phone numbers.
 * - Returns explicit failure when no provider is configured.
 * - Returns deliveryOutcome classification for safe OTP lifecycle management.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationProvider,
  OtpDeliveryChannel,
  OtpDeliveryRequest,
  OtpDeliveryResult,
} from './providers/provider.interface';
import {
  NotificationProviderConfig,
  resolveNotificationConfig,
} from './providers/provider.config';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';

@Injectable()
export class OtpDeliveryService {
  private readonly logger = new Logger(OtpDeliveryService.name);
  private readonly providers: Map<OtpDeliveryChannel, NotificationProvider>;
  private readonly config: NotificationProviderConfig;

  constructor() {
    this.config = resolveNotificationConfig();
    this.providers = new Map();

    // Initialize providers
    const twilioProvider = new TwilioSmsProvider(this.config.twilio);
    const whatsappProvider = new WhatsAppProvider(this.config.whatsapp);

    this.providers.set('sms', twilioProvider);
    this.providers.set('whatsapp', whatsappProvider);

    this.logProviderStatus();
  }

  /**
   * Deliver an OTP via the specified channel.
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
    const provider = this.providers.get(channel);

    if (!provider) {
      this.logger.warn(`Unknown delivery channel requested: ${channel}`);
      return {
        success: false,
        status: 'failed',
        errorReason: 'UNKNOWN_CHANNEL',
        retryable: false,
        deliveryOutcome: 'rejected' as const,
      };
    }

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

    const request: OtpDeliveryRequest = {
      phone,
      otp,
      channel,
      correlationId,
    };

    try {
      const result = await provider.sendOtp(request);

      if (result.success) {
        this.logger.log(
          `OTP delivered via ${channel} (message: ${result.messageId || 'unknown'}, correlation: ${correlationId || 'none'})`,
        );
      } else {
        this.logger.warn(
          `OTP delivery failed via ${channel}: ${result.errorReason} (retryable: ${result.retryable || false})`,
        );
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Unexpected error during OTP delivery via ${channel}: ${error instanceof Error ? error.message : 'unknown'}`,
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

  /**
   * Check if a specific channel is available (configured and ready).
   *
   * @param channel - The delivery channel to check.
   * @returns Whether the channel is available.
   */
  isChannelAvailable(channel: OtpDeliveryChannel): boolean {
    const provider = this.providers.get(channel);
    return provider?.isConfigured() || false;
  }

  /**
   * Get the list of available delivery channels.
   *
   * @returns Array of available channel names.
   */
  getAvailableChannels(): OtpDeliveryChannel[] {
    const available: OtpDeliveryChannel[] = [];

    for (const [channel, provider] of this.providers.entries()) {
      if (provider.isConfigured()) {
        available.push(channel);
      }
    }

    return available;
  }

  /**
   * Log provider status summary (no credentials).
   */
  private logProviderStatus(): void {
    const availableChannels = this.getAvailableChannels();

    if (availableChannels.length === 0) {
      this.logger.warn(
        'No notification providers are configured. OTP delivery will fail explicitly. ' +
          'Set TWILIO_* or WHATSAPP_* environment variables to enable delivery.',
      );
    } else {
      this.logger.log(`Available delivery channels: ${availableChannels.join(', ')}`);
    }
  }
}
