/**
 * Twilio SMS provider implementation.
 *
 * This provider sends OTP codes via SMS using the Twilio REST API.
 * Supports Syria (+963) and Saudi Arabia (+966) phone numbers.
 *
 * Security:
 * - Never logs OTP values or full phone numbers.
 * - Never exposes credentials in error messages or logs.
 * - Returns explicit failure when not configured.
 *
 * API Reference: https://www.twilio.com/docs/sms/send-messages
 */

import { Logger } from '@nestjs/common';
import {
  NotificationProvider,
  OtpDeliveryRequest,
  OtpDeliveryResult,
  ProviderPermanentError,
  ProviderTransientError,
} from './provider.interface';
import { TwilioConfig } from './provider.config';

const logger = new Logger('TwilioSmsProvider');

/**
 * Twilio REST API base URL.
 */
const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * Twilio SMS provider implementation.
 */
export class TwilioSmsProvider implements NotificationProvider {
  readonly name = 'twilio-sms';
  readonly channel = 'sms' as const;

  constructor(private readonly config: TwilioConfig) {}

  /**
   * Check if Twilio is properly configured.
   */
  isConfigured(): boolean {
    return this.config.enabled;
  }

  /**
   * Send an OTP via Twilio SMS.
   *
   * @param request - The OTP delivery request.
   * @returns The delivery result.
   */
  async sendOtp(request: OtpDeliveryRequest): Promise<OtpDeliveryResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'not_configured',
        errorReason: 'TWILIO_NOT_CONFIGURED',
        retryable: false,
        deliveryOutcome: 'rejected' as const,
      };
    }

    const { phone, otp, correlationId } = request;

    try {
      // Mask phone number for logging (show only last 4 digits)
      const maskedPhone = this.maskPhone(phone);
      logger.log(`Attempting SMS delivery to ${maskedPhone} (correlation: ${correlationId || 'none'})`);

      // Build Twilio API request
      const url = `${TWILIO_API_BASE}/Accounts/${encodeURIComponent(this.config.accountSid)}/Messages.json`;
      
      const body = new URLSearchParams({
        To: phone,
        From: this.config.fromNumber,
        Body: `Your verification code is: ${otp}. Valid for 90 seconds.`,
      });

      // Encode credentials for Basic auth
      const credentials = Buffer.from(
        `${this.config.accountSid}:${this.config.authToken}`,
      ).toString('base64');

      // Send request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Twilio API error: ${response.status} ${response.statusText}`);
          
          // Parse Twilio error response
          try {
            const errorJson = JSON.parse(errorText);
            const errorCode = errorJson.code || errorJson.status;
            
            // Permanent errors (invalid number, unauthorized, etc.)
            if (response.status === 400 || response.status === 401 || response.status === 403) {
              throw new ProviderPermanentError(
                `Twilio rejected message: ${errorCode}`,
                this.name,
                `TWILIO_ERROR_${errorCode}`,
              );
            }
            
            // Transient errors (rate limit, server error)
            if (response.status === 429 || response.status >= 500) {
              throw new ProviderTransientError(
                `Twilio transient error: ${errorCode}`,
                this.name,
                `TWILIO_ERROR_${errorCode}`,
                true,
              );
            }
          } catch (parseError) {
            if (parseError instanceof ProviderPermanentError || parseError instanceof ProviderTransientError) {
              throw parseError;
            }
            // If we can't parse the error, treat as transient
            throw new ProviderTransientError(
              `Twilio API error: ${response.status}`,
              this.name,
              'TWILIO_API_ERROR',
              true,
            );
          }
        }

        // Parse successful response
        const result: { sid?: string } = await response.json() as { sid?: string };
        const messageId = result.sid;

        logger.log(`SMS delivery accepted by Twilio (message: ${messageId}, correlation: ${correlationId || 'none'})`);

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
          logger.error(`Twilio API timeout (correlation: ${correlationId || 'none'})`);
          return {
            success: false,
            status: 'timeout',
            errorReason: 'TWILIO_TIMEOUT',
            retryable: false,
            deliveryOutcome: 'unknown' as const,
          };
        }

        // Other network errors — delivery outcome is uncertain.
        logger.error(`Twilio API network error: ${fetchError instanceof Error ? fetchError.message : 'unknown'}`);
        return {
          success: false,
          status: 'failed',
          errorReason: 'TWILIO_NETWORK_ERROR',
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
        // 429 / 5xx: the request reached Twilio but the delivery outcome cannot be
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
      logger.error(`Unexpected error in Twilio provider: ${error instanceof Error ? error.message : 'unknown'}`);
      return {
        success: false,
        status: 'failed',
        errorReason: 'TWILIO_UNEXPECTED_ERROR',
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
