/**
 * Resend email provider implementation.
 *
 * Delivers OTP codes via email using the Resend HTTPS API.
 *
 * Security:
 * - Never logs OTP values or full email addresses.
 * - Never exposes Resend API key in error messages or logs.
 * - Returns explicit failure when not configured.
 * - Bounded delivery timeout (10s, matching SMTP pattern).
 * - Classifies Resend API responses into accepted/rejected/unknown.
 * - Does not auto-retry (prevents duplicate/ambiguous delivery).
 * - 'accepted' means Resend accepted the email request � NOT confirmed mailbox delivery.
 */

import { Logger } from '@nestjs/common';
import {
  NotificationProvider,
  ChallengeDeliveryRequest,
  OtpDeliveryResult,
  ProviderPermanentError,
  ProviderTransientError,
} from './provider.interface';
import { ResendConfig } from './provider.config';
import { maskEmail } from '../../../common/utils/email-normalization';

const logger = new Logger('ResendEmailProvider');

/** Bounded delivery timeout in milliseconds (matches SMTP pattern). */
const RESEND_TIMEOUT_MS = 10_000;

/** Resend API endpoint. */
const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * Professional HTML email template for OTP delivery.
 * Same template as SMTP provider for consistent branding.
 */
function buildOtpEmailHtml(otp: string, fromAddress: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
  <tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
      <tr>
        <td style="background:#1a73e8;padding:24px 32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:600;">Verification Code</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 16px;color:#333333;font-size:16px;line-height:1.5;">Your one-time verification code is:</p>
          <div style="background:#f4f4f7;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px;">
            <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1a73e8;font-family:monospace;">${otp}</span>
          </div>
          <p style="margin:0 0 16px;color:#666666;font-size:14px;line-height:1.5;">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">
          <p style="margin:0;color:#999999;font-size:12px;line-height:1.5;">If you did not request this code, please ignore this email. Do not click any links or reply. If you are concerned about your account security, contact support.</p>
        </td>
      </tr>
      <tr>
        <td style="background:#f9f9fb;padding:16px 32px;text-align:center;">
          <p style="margin:0;color:#999999;font-size:11px;">Sent by ${fromAddress}</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function buildOtpEmailText(otp: string): string {
  return [
    'Your verification code is:',
    '',
    `  ${otp}`,
    '',
    'This code expires in 5 minutes. Do not share it with anyone.',
    '',
    'If you did not request this code, please ignore this email.',
  ].join('\n');
}

export class ResendEmailProvider implements NotificationProvider {
  readonly name = 'resend-email';
  readonly channel = 'email' as const;

  private readonly config: ResendConfig;

  constructor(config: ResendConfig) {
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config.enabled;
  }

  async sendOtp(request: ChallengeDeliveryRequest): Promise<OtpDeliveryResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'not_configured',
        errorReason: 'RESEND_NOT_CONFIGURED',
        retryable: false,
        deliveryOutcome: 'rejected' as const,
      };
    }

    const { email, otp, correlationId } = request;
    if (!email) {
      return {
        success: false,
        status: 'failed',
        errorReason: 'MISSING_EMAIL',
        retryable: false,
        deliveryOutcome: 'rejected' as const,
      };
    }

    const masked = maskEmail(email);

    // Build sender: use RESEND_FROM_NAME if set, otherwise bare address
    const from = this.config.fromName
      ? `${this.config.fromName} <${this.config.from}>`
      : this.config.from;

    try {
      logger.log(`Sending email OTP to ${masked} (correlation: ${correlationId || 'none'})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

      try {
        const response = await fetch(RESEND_API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            ...(correlationId ? { 'X-SCS-Correlation-ID': correlationId } : {}),
          },
          body: JSON.stringify({
            from,
            to: email,
            subject: 'Your verification code',
            text: buildOtpEmailText(otp),
            html: buildOtpEmailHtml(otp, this.config.from),
          }),
          signal: controller.signal,
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          const messageId = (data as { id?: string })?.id;

          logger.log(`Email OTP accepted by Resend (message: ${messageId || 'unknown'}, correlation: ${correlationId || 'none'})`);

          return {
            success: true,
            status: 'delivered',
            messageId,
            deliveryOutcome: 'accepted' as const,
          };
        }

        // Non-2xx response � read body for error details without logging credentials
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = await response.text().catch(() => undefined);
        }

        // 4xx = definitive rejection
        if (response.status >= 400 && response.status < 500) {
          logger.warn(`Resend rejected email to ${masked} (status: ${response.status}, correlation: ${correlationId || 'none'})`);
          return {
            success: false,
            status: 'rejected',
            errorReason: 'RESEND_REJECTED',
            retryable: false,
            deliveryOutcome: 'rejected' as const,
          };
        }

        // 5xx = transient, outcome unknown
        logger.error(`Resend transient error (status: ${response.status}) sending to ${masked} (correlation: ${correlationId || 'none'})`);
        return {
          success: false,
          status: 'failed',
          errorReason: 'RESEND_TRANSIENT_ERROR',
          retryable: true,
          deliveryOutcome: 'unknown' as const,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Timeout, network error, AbortError, etc. — outcome unknown
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const isNetworkError = error instanceof TypeError;

      if (isTimeout || isNetworkError || error instanceof Error) {
        logger.error(`Resend ${isTimeout ? 'timeout' : 'network error'} sending to ${masked} (correlation: ${correlationId || 'none'})`);
      }

      return {
        success: false,
        status: isTimeout ? 'timeout' : 'failed',
        errorReason: isTimeout ? 'RESEND_TIMEOUT' : 'RESEND_NETWORK_ERROR',
        retryable: false,
        deliveryOutcome: 'unknown' as const,
      };
    }
  }
}

