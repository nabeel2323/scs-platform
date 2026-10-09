/**
 * P12 Manual Verification Provider
 *
 * Default payment provider for Syria deployment. Handles bank transfer,
 * cash on delivery, and voucher payments through manual verification
 * workflows rather than automated gateway integration.
 *
 * Locked per architecture lock §18.2.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider } from './payments.provider';
import {
  CreatePaymentParams,
  PaymentIntentResult,
  PaymentStatusResult,
  RefundParams,
  RefundResult,
  ParsedWebhookEvent,
  PaymentInstructions,
  DEFAULT_PAYMENT_EXPIRY_HOURS,
} from './payments.types';

@Injectable()
export class ManualVerificationProvider implements PaymentProvider {
  readonly key = 'manual';
  private readonly logger = new Logger(ManualVerificationProvider.name);

  /**
   * Create a payment intent for manual verification.
   * Returns payment instructions (bank details, reference, deadline).
   */
  async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult> {
    this.logger.log(
      `Creating manual payment intent for order ${params.orderId} ` +
      `(${params.paymentMethod}, ${params.amountMinor} ${params.currency})`,
    );

    const instructions: PaymentInstructions = {
      amountMinor: params.amountMinor,
      currency: params.currency,
    };

    // For bank transfers, include platform bank details
    if (params.paymentMethod === 'BANK_TRANSFER') {
      const expiryHours = Number(
        process.env['PAYMENT_EXPIRY_HOURS'] || DEFAULT_PAYMENT_EXPIRY_HOURS,
      );
      instructions.bankDetails = {
        bankName: process.env['PLATFORM_BANK_NAME'] || 'Platform Bank',
        accountNumber: process.env['PLATFORM_BANK_ACCOUNT'] || '',
        iban: process.env['PLATFORM_BANK_IBAN'],
        accountHolder: process.env['PLATFORM_BANK_HOLDER'] || 'SCS Platform',
        reference: `PAY-${params.orderId.substring(0, 8).toUpperCase()}`,
      };
      instructions.expiresAt = new Date(
        Date.now() + expiryHours * 60 * 60 * 1000,
      ).toISOString();
    }

    return {
      providerKey: this.key,
      status: 'CREATED',
      instructions,
    };
  }

  /**
   * Manual provider returns status from local records — no external query.
   */
  async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult> {
    // Manual provider does not query external systems.
    // Status is always resolved from local payment_records.
    return {
      providerKey: this.key,
      providerPaymentId,
      status: 'CREATED',
    };
  }

  /**
   * Cancel a manual payment.
   */
  async cancelPayment(_providerPaymentId: string): Promise<void> {
    // Manual cancellation is handled by the payments service
    // updating the local payment_record status.
    this.logger.log(`Manual payment cancelled: ${_providerPaymentId}`);
  }

  /**
   * Issue a manual refund.
   * Creates a refund record for admin processing — no automated money movement.
   */
  async refund(params: RefundParams): Promise<RefundResult> {
    this.logger.log(
      `Manual refund requested: ${params.amountMinor} ${params.currency} ` +
      `for payment ${params.providerPaymentId}`,
    );

    return {
      providerKey: this.key,
      status: 'REQUESTED',
    };
  }

  /**
   * Webhook signature verification — not applicable for manual provider.
   */
  verifyWebhookSignature(_rawBody: Buffer, _signature: string): boolean {
    return true; // N/A for manual
  }

  /**
   * Webhook event parsing — not applicable for manual provider.
   */
  parseWebhookEvent(_rawBody: Buffer): ParsedWebhookEvent {
    throw new Error('Manual verification provider does not support webhooks');
  }
}
