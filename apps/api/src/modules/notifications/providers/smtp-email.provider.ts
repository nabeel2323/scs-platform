/**
 * SMTP email provider implementation.
 *
 * Delivers OTP codes via email using Nodemailer. Supports authenticated and
 * anonymous (relay) SMTP configurations.
 *
 * Security:
 * - Never logs OTP values or full email addresses.
 * - Never exposes SMTP credentials in error messages or logs.
 * - Returns explicit failure when not configured.
 * - Bounded delivery timeout (10s, matching phone provider pattern).
 * - Classifies temporary and permanent SMTP errors.
 * - Does not auto-retry (prevents duplicate/ambiguous delivery).
 * - 'accepted' means SMTP server accepted — NOT confirmed mailbox delivery.
 */

import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  NotificationProvider,
  ChallengeDeliveryRequest,
  OtpDeliveryResult,
  ProviderPermanentError,
  ProviderTransientError,
} from './provider.interface';
import { SmtpConfig } from './provider.config';
import { maskEmail } from '../../../common/utils/email-normalization';

const logger = new Logger('SmtpEmailProvider');

/** Bounded delivery timeout in milliseconds (matches Twilio/WhatsApp pattern). */
const SMTP_TIMEOUT_MS = 10_000;

/**
 * Professional HTML email template for OTP delivery.
 *
 * Includes:
 * - Six-digit code prominently displayed.
 * - Five-minute expiry notice.
 * - Security warning if the recipient did not request the code.
 * - Accessible formatting (plain text fallback, semantic HTML).
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

export class SmtpEmailProvider implements NotificationProvider {
  readonly name = 'smtp-email';
  readonly channel = 'email' as const;

  private transporter: Transporter | null = null;

  /**
   * Sender identity handed to Nodemailer.
   *
   * `SMTP_FROM_NAME` is purely presentational. When it is set we pass the
   * structured `{ name, address }` form so Nodemailer performs RFC 2047 encoding
   * and quoting for us; CR/LF are stripped first so a misconfigured display name
   * can never inject additional mail headers. When it is unset we keep the bare
   * address form, which is what a plain relay expects.
   */
  private readonly sender: string | { name: string; address: string };

  constructor(private readonly config: SmtpConfig) {
    const displayName = (config.fromName || '').replace(/[\r\n]+/g, ' ').trim();
    this.sender = displayName
      ? { name: displayName, address: config.from }
      : config.from;

    if (config.enabled) {
      this.transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user
          ? { user: config.user, pass: config.password }
          : undefined,
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
      });
    }
  }

  isConfigured(): boolean {
    return this.config.enabled && this.transporter !== null;
  }

  async sendOtp(request: ChallengeDeliveryRequest): Promise<OtpDeliveryResult> {
    if (!this.isConfigured()) {
      return {
        success: false,
        status: 'not_configured',
        errorReason: 'SMTP_NOT_CONFIGURED',
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

    try {
      logger.log(`Sending email OTP to ${masked} (correlation: ${correlationId || 'none'})`);

      const info = await this.transporter!.sendMail({
        from: this.sender,
        to: email,
        subject: 'Your verification code',
        text: buildOtpEmailText(otp),
        html: buildOtpEmailHtml(otp, this.config.from),
        headers: correlationId
          ? { 'X-SCS-Correlation-ID': correlationId }
          : undefined,
      });

      logger.log(`Email OTP accepted by SMTP (message: ${info.messageId || 'unknown'}, correlation: ${correlationId || 'none'})`);

      return {
        success: true,
        status: 'delivered',
        messageId: info.messageId,
        deliveryOutcome: 'accepted' as const,
      };
    } catch (error) {
      return this.classifyError(error, masked, correlationId);
    }
  }

  /**
   * Classify SMTP errors into permanent vs transient without exposing credentials
   * or sensitive connection details in logs.
   */
  private classifyError(
    error: unknown,
    maskedEmail: string,
    correlationId?: string,
  ): OtpDeliveryResult {
    const err = error as NodeJS.ErrnoException & { code?: string; response?: string };
    const code = err.code;

    // Authentication failures — permanent
    if (code === 'EAUTH' || code === 'ECONNECTION' && err.response?.includes('535')) {
      logger.error(`SMTP auth failure (correlation: ${correlationId || 'none'})`);
      return {
        success: false,
        status: 'failed',
        errorReason: 'SMTP_AUTH_FAILED',
        retryable: false,
        deliveryOutcome: 'rejected' as const,
      };
    }

    // Invalid recipient — permanent
    if (code === 'EENVELOPE' || err.response?.includes('550') || err.response?.includes('553')) {
      logger.warn(`SMTP rejected recipient ${maskedEmail} (correlation: ${correlationId || 'none'})`);
      return {
        success: false,
        status: 'failed',
        errorReason: 'SMTP_RECIPIENT_REJECTED',
        retryable: false,
        deliveryOutcome: 'rejected' as const,
      };
    }

    // Timeout — transient, outcome unknown
    if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      logger.error(`SMTP timeout sending to ${maskedEmail} (correlation: ${correlationId || 'none'})`);
      return {
        success: false,
        status: 'timeout',
        errorReason: 'SMTP_TIMEOUT',
        retryable: false,
        deliveryOutcome: 'unknown' as const,
      };
    }

    // Network error — transient, outcome unknown
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND') {
      logger.error(`SMTP network error (${code}) sending to ${maskedEmail} (correlation: ${correlationId || 'none'})`);
      return {
        success: false,
        status: 'failed',
        errorReason: 'SMTP_NETWORK_ERROR',
        retryable: false,
        deliveryOutcome: 'unknown' as const,
      };
    }

    // Server error responses (4xx) — transient
    if (err.response && /^4\d{2}/.test(err.response)) {
      logger.warn(`SMTP transient error sending to ${maskedEmail} (correlation: ${correlationId || 'none'})`);
      return {
        success: false,
        status: 'failed',
        errorReason: 'SMTP_TRANSIENT_ERROR',
        retryable: true,
        deliveryOutcome: 'unknown' as const,
      };
    }

    // Unknown error — preserve challenge (outcome uncertain)
    logger.error(`Unexpected SMTP error sending to ${maskedEmail}: ${code || 'unknown'} (correlation: ${correlationId || 'none'})`);
    return {
      success: false,
      status: 'failed',
      errorReason: 'SMTP_UNEXPECTED_ERROR',
      retryable: false,
      deliveryOutcome: 'unknown' as const,
    };
  }
}
