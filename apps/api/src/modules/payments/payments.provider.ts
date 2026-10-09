/**
 * P12 Payment Provider Abstraction
 *
 * Business logic depends only on this interface, never on concrete provider
 * classes. Adding a new provider (e.g., Moyasar for KSA expansion) requires
 * only implementing this interface and registering it in the registry.
 *
 * Locked per architecture lock §18.1.
 */

import {
  CreatePaymentParams,
  PaymentIntentResult,
  PaymentStatusResult,
  RefundParams,
  RefundResult,
  ParsedWebhookEvent,
} from './payments.types';

export interface PaymentProvider {
  /** Unique provider key (e.g., 'manual', 'moyasar', 'tap', 'stripe'). */
  readonly key: string;

  /** Create a new payment intent / record. */
  createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntentResult>;

  /** Query current payment status from the provider. */
  getPaymentStatus(providerPaymentId: string): Promise<PaymentStatusResult>;

  /** Cancel a payment that has not yet been captured. */
  cancelPayment(providerPaymentId: string): Promise<void>;

  /** Issue a refund against a captured payment. */
  refund(params: RefundParams): Promise<RefundResult>;

  /**
   * Verify webhook signature (digital providers only).
   * Manual provider always returns true (no webhooks).
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string): boolean;

  /**
   * Parse a webhook event body into a normalized structure.
   * Manual provider throws — webhooks are not applicable.
   */
  parseWebhookEvent(rawBody: Buffer): ParsedWebhookEvent;
}
