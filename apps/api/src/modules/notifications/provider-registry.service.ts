/**
 * Provider registry — manages notification provider instances and enforces
 * the public/internal channel boundary.
 *
 * Public channels (sms, whatsapp, email) are selectable via API request
 * parameters. The internal mock channel is available only for automated tests
 * and controlled non-production development through service injection.
 *
 * Security:
 * - Mock provider is never returned for public channel requests.
 * - Mock provider is never included in available-channel enumeration.
 * - Public DTOs use @IsIn(['sms', 'whatsapp', 'email']) to reject 'mock'.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationProvider,
  OtpDeliveryChannel,
  InternalDeliveryChannel,
} from './providers/provider.interface';
import {
  NotificationProviderConfig,
  resolveNotificationConfig,
} from './providers/provider.config';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { MockOtpProvider } from './providers/mock.provider';

@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);
  private readonly config: NotificationProviderConfig;

  /** Public providers — keyed by OtpDeliveryChannel. */
  private readonly publicProviders = new Map<OtpDeliveryChannel, NotificationProvider>();

  /** Internal providers — keyed by InternalDeliveryChannel (includes mock). */
  private readonly internalProviders = new Map<InternalDeliveryChannel, NotificationProvider>();

  /** Mock provider reference (for test injection). */
  private mockProvider: MockOtpProvider | null = null;

  constructor() {
    this.config = resolveNotificationConfig();

    // Initialize public providers
    const twilio = new TwilioSmsProvider(this.config.twilio);
    const whatsapp = new WhatsAppProvider(this.config.whatsapp);
    const smtp = new SmtpEmailProvider(this.config.smtp);

    this.publicProviders.set('sms', twilio);
    this.publicProviders.set('whatsapp', whatsapp);
    this.publicProviders.set('email', smtp);

    // Internal providers include all public ones
    this.internalProviders.set('sms', twilio);
    this.internalProviders.set('whatsapp', whatsapp);
    this.internalProviders.set('email', smtp);

    // Conditionally initialize mock provider (dev/test only — constructor guards)
    const nodeEnv = (process.env['NODE_ENV'] || 'development').trim().toLowerCase();
    if (nodeEnv === 'development' || nodeEnv === 'test') {
      try {
        this.mockProvider = new MockOtpProvider();
        this.internalProviders.set('mock', this.mockProvider);
      } catch (error) {
        this.logger.warn(`Mock provider not initialized: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }

    this.logStatus();
  }

  /**
   * Get a provider for a public channel. Throws if the channel is 'mock' or unknown.
   */
  getForChannel(channel: OtpDeliveryChannel): NotificationProvider {
    const provider = this.publicProviders.get(channel);
    if (!provider) {
      throw new Error(`No provider registered for public channel: ${channel}`);
    }
    return provider;
  }

  /**
   * Get a provider for an internal channel (includes mock).
   * Used by test infrastructure for OTP retrieval.
   */
  getForTest(channel: InternalDeliveryChannel): NotificationProvider {
    const provider = this.internalProviders.get(channel);
    if (!provider) {
      throw new Error(`No provider registered for internal channel: ${channel}`);
    }
    return provider;
  }

  /**
   * Get the mock provider instance for test OTP retrieval.
   * Returns null if mock is not available (production/staging).
   */
  getMockProvider(): MockOtpProvider | null {
    return this.mockProvider;
  }

  /**
   * Get available PUBLIC channels only. Mock is never included.
   */
  getAvailableChannels(): OtpDeliveryChannel[] {
    const available: OtpDeliveryChannel[] = [];
    for (const [channel, provider] of this.publicProviders.entries()) {
      if (provider.isConfigured()) {
        available.push(channel);
      }
    }
    return available;
  }

  /**
   * Check if a specific public channel is available.
   */
  isChannelAvailable(channel: OtpDeliveryChannel): boolean {
    const provider = this.publicProviders.get(channel);
    return provider?.isConfigured() || false;
  }

  private logStatus(): void {
    const available = this.getAvailableChannels();
    if (available.length === 0) {
      this.logger.warn(
        'No notification providers are configured. OTP delivery will fail explicitly.',
      );
    } else {
      this.logger.log(`Available public delivery channels: ${available.join(', ')}`);
    }
    if (this.mockProvider) {
      this.logger.log('Mock provider: available (internal/test only)');
    }
  }
}
