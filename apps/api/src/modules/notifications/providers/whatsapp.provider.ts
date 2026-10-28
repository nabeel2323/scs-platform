/**
 * Meta WhatsApp Business Cloud API provider implementation.
 *
 * This provider sends OTP codes via WhatsApp using Meta's Cloud API.
 * Requires an approved authentication template.
 *
 * Security:
 * - Never logs OTP values or full phone numbers.
 * - Never exposes credentials in error messages or logs.
 * - Returns explicit failure when not configured.
 * - Validates webhook signatures (if webhooks are implemented).
 *
 * API Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */

import { Logger } from '@nestjs/common';
import {
  NotificationProvider,
  OtpDeliveryRequest,
  OtpDeliveryResult,
  ProviderPermanentError,
  ProviderTransientError,
} from './provider.interface';
import { WhatsAppConfig } from './provider.config';

const logger = new Logger('WhatsAppProvider');

/**
 * Meta WhatsApp Cloud API host. The Graph API version is supplied per-request
 * from the validated `config.apiVersion` (S1.3 L-03), not hardcoded here.
 */
const WHATSAPP_GRAPH_HOST = 'https://graph.facebook.com';

/**
 * Meta WhatsApp Business provider implementation.
 */
export class WhatsAppProvider implements NotificationProvider {
  readonly name = 'whatsapp-meta';
  readonly channel = 'whatsapp' as const;

  constructor(private readonly config: WhatsAppConfig) {}

  /**
   * Check if WhatsApp is properly configured.
   */
  isConfigured(): boolean {
    return this.config.enabled;
  }

  /**
   * Send an OTP via WhatsApp.
   *
   * @param request - The OTP delivery request.
   * @returns The delivery result.
   */
  async sendOtp(request: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'not_configured',
        errorReason: 'WHATSAPP_NOT_CONFIGURED',
        retryable: false,
        deliveryOutcome: 'rejected' as const,
      };
    }

    const { phone, otp, correlationId } = request;

    try {
      // Mask phone number for logging (show only last 4 digits)
      const maskedPhone = this.maskPhone(phone);
      logger.log(`Attempting WhatsApp delivery to ${maskedPhone} (correlation: ${correlationId || 'none'})`);

      // Build WhatsApp Cloud API request
      const url = `${WHATSAPP_GRAPH_HOST}/${this.config.apiVersion}/${encodeURIComponent(this.config.phoneNumberId)}/messages`;

      // WhatsApp requires using a template message for authentication codes
      // The template must be pre-approved by Meta
      const body = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'template',
        template: {
          name: this.config.templateName,
          language: {
            code: 'en',
          },
          components: [
            {
              type: 'body',
              parameters: [
                {
                  type: 'text',
                  text: otp,
                },
              ],
            },
          ],
        },
      };

      // Send request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`WhatsApp API error: ${response.status} ${response.statusText}`);

          // Parse Meta error response
          try {
            const errorJson = JSON.parse(errorText) as {
              error?: {
                code?: number;
                error_subcode?: number;
                message?: string;
              };
            };
            const errorCode = errorJson.error?.code || errorJson.error?.error_subcode;

            // Permanent errors (invalid number, template not found, etc.)
            if (response.status === 400 || response.status === 401 || response.status === 403 || response.status === 404) {
              throw new ProviderPermanentError(
                `WhatsApp rejected message: ${errorCode || 'unknown'}`,
                this.name,
                `WHATSAPP_ERROR_${errorCode || 'UNKNOWN'}`,
              );
            }

            // Rate limit or server error
            if (response.status === 429 || response.status >= 500) {
              throw new ProviderTransientError(
                `WhatsApp transient error: ${errorCode || 'unknown'}`,
                this.name,
                `WHATSAPP_ERROR_${errorCode || 'UNKNOWN'}`,
                true,
              );
            }
          } catch (parseError) {
            if (parseError instanceof ProviderPermanentError || parseError instanceof ProviderTransientError) {
              throw parseError;
            }
            // If we can't parse the error, treat as transient
            throw new ProviderTransientError(
              `WhatsApp API error: ${response.status}`,
              this.name,
              'WHATSAPP_API_ERROR',
              true,
            );
          }
        }

        // Parse successful response
        const result: { messages?: Array<{ id?: string }> } = await response.json() as { messages?: Array<{ id?: string }> };
        const messageId = result.messages?.[0]?.id;

        logger.log(`WhatsApp delivery accepted (message: ${messageId || 'unknown'}, correlation: ${correlationId || 'none'})`);

        return {
          success: true,
          status: 'delivered',
          messageId,
          deliveryOutcome: 'accepted' as const,
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof ProviderPermanentError || fetchError instanceof ProviderTransientError) {
          throw fetchError;
        }

        // Timeout — provider may have accepted the message before the connection dropped.
        // Return 'unknown' outcome so the caller preserves the OTP challenge.
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          logger.error(`WhatsApp API timeout (correlation: ${correlationId || 'none'})`);
          return {
            success: false,
            status: 'timeout',
            errorReason: 'WHATSAPP_TIMEOUT',
            retryable: false,
            deliveryOutcome: 'unknown' as const,
          };
        }

        // Other network errors — delivery outcome is uncertain.
        logger.error(`WhatsApp API network error: ${fetchError instanceof Error ? fetchError.message : 'unknown'}`);
        return {
          success: false,
          status: 'failed',
          errorReason: 'WHATSAPP_NETWORK_ERROR',
          retryable: false,
          deliveryOutcome: 'unknown' as const,
        };
      }
    } catch (error) {
      if (error instanceof ProviderPermanentError) {
        return {
          success: false,
          status: 'failed',
          errorReason: error.reason,
          retryable: false,
          deliveryOutcome: 'rejected' as const,
        };
      }

      if (error instanceof ProviderTransientError) {
        // 429 / 5xx: the request reached Meta but the delivery outcome cannot be
        // established — the message may still be sent. Classify as 'unknown' so the
        // challenge is preserved rather than deleted (S1.3 M-01).
        return {
          success: false,
          status: 'failed',
          errorReason: error.reason,
          retryable: error.retryable,
          deliveryOutcome: 'unknown' as const,
        };
      }

      // Unexpected error — outcome cannot be established; preserve the challenge.
      logger.error(`Unexpected error in WhatsApp provider: ${error instanceof Error ? error.message : 'unknown'}`);
      return {
        success: false,
        status: 'failed',
        errorReason: 'WHATSAPP_UNEXPECTED_ERROR',
        retryable: false,
        deliveryOutcome: 'unknown' as const,
      };
    }
  }

  /**
   * Mask a phone number for logging (show only last 4 digits).
   *
   * @param phone - Phone number in E.164 format.
   * @returns Masked phone number.
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '***';
    return '***' + phone.slice(-4);
  }
}
