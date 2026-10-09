/**
 * P12 Payment State Machine
 *
 * Enforces valid payment status transitions. Every transition must be validated
 * before persistence. No arbitrary status updates are permitted.
 *
 * Locked per architecture lock §8.2.
 */

import { ConflictException } from '@nestjs/common';
import {
  PaymentStatus,
  PaymentEventType,
  PAYMENT_TERMINAL_STATUSES,
} from './payments.types';

/**
 * Payment status transition map.
 *
 * Manual path:  CREATED → AWAITING_PAYMENT → AWAITING_VERIFICATION → CONFIRMED
 *                                                       ↓ (reject)
 *                                                   REJECTED → AWAITING_PAYMENT
 * Digital path: CREATED → AWAITING_PAYMENT → PROCESSING → AUTHORIZED → CAPTURED
 *                                                          ↓
 *                                                      PARTIALLY_REFUNDED → REFUNDED
 * Shared:       Any non-terminal → CANCELLED
 *               AWAITING_PAYMENT / AWAITING_VERIFICATION → EXPIRED
 */
const PAYMENT_TRANSITIONS: Record<string, string[]> = {
  CREATED: ['AWAITING_PAYMENT', 'CANCELLED'],
  AWAITING_PAYMENT: [
    'AWAITING_VERIFICATION',  // proof submitted (bank transfer)
    'PROCESSING',             // digital payment initiated
    'EXPIRED',                // timeout
    'CANCELLED',              // order cancelled
    'CONFIRMED',              // COD cash confirmed / voucher auto-confirmed
  ],
  AWAITING_VERIFICATION: [
    'CONFIRMED',              // admin verified
    'REJECTED',              // admin rejected proof
    'EXPIRED',               // timeout
    'CANCELLED',             // order cancelled
  ],
  REJECTED: [
    'AWAITING_PAYMENT',      // buyer re-submits
    'CANCELLED',             // buyer gives up
  ],
  PROCESSING: [
    'AUTHORIZED',            // digital auth success
    'CONFIRMED',             // direct capture (some providers)
    'FAILED',                // digital auth failure
    'CANCELLED',
  ],
  AUTHORIZED: [
    'CAPTURED',              // funds captured
    'FAILED',                // capture failure
    'CANCELLED',             // void auth
  ],
  CAPTURED: [
    'PARTIALLY_REFUNDED',    // partial refund
    'REFUNDED',              // full refund
  ],
  PARTIALLY_REFUNDED: [
    'PARTIALLY_REFUNDED',    // additional partial refund
    'REFUNDED',              // remaining balance refunded
  ],
  CONFIRMED: [
    'PARTIALLY_REFUNDED',    // partial refund after manual confirm
    'REFUNDED',              // full refund after manual confirm
  ],
  // Terminal states — no forward transitions
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
  FAILED: [
    'AWAITING_PAYMENT',      // retry
    'CANCELLED',
  ],
  REFUND_FAILED: [],
};

/**
 * Assert that a payment status transition is valid.
 * Throws ConflictException if the transition is not allowed.
 */
export function assertPaymentTransition(
  fromStatus: string,
  toStatus: string,
): void {
  const allowed = PAYMENT_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new ConflictException(
      `Invalid payment transition: ${fromStatus} → ${toStatus}`,
    );
  }
}

/**
 * Check whether a payment status is terminal (no further transitions).
 */
export function isPaymentTerminal(status: string): boolean {
  return PAYMENT_TERMINAL_STATUSES.has(status);
}

/**
 * Resolve the payment event type for a given status transition.
 */
export function resolvePaymentEventType(
  fromStatus: string,
  toStatus: string,
): PaymentEventType {
  // Explicit mapping for known transitions
  const eventMap: Record<string, PaymentEventType> = {
    'CREATED→AWAITING_PAYMENT': 'PAYMENT_CREATED',
    'AWAITING_PAYMENT→AWAITING_VERIFICATION': 'PAYMENT_PROOF_SUBMITTED',
    'AWAITING_PAYMENT→PROCESSING': 'PAYMENT_AUTHORIZE_REQUESTED',
    'AWAITING_PAYMENT→CONFIRMED': 'PAYMENT_CONFIRMED',
    'AWAITING_PAYMENT→EXPIRED': 'PAYMENT_EXPIRED',
    'AWAITING_PAYMENT→CANCELLED': 'PAYMENT_CANCELLED',
    'AWAITING_VERIFICATION→CONFIRMED': 'PAYMENT_CONFIRMED',
    'AWAITING_VERIFICATION→REJECTED': 'PAYMENT_REJECTED',
    'AWAITING_VERIFICATION→EXPIRED': 'PAYMENT_EXPIRED',
    'AWAITING_VERIFICATION→CANCELLED': 'PAYMENT_CANCELLED',
    'REJECTED→AWAITING_PAYMENT': 'PAYMENT_METHOD_SELECTED',
    'PROCESSING→AUTHORIZED': 'PAYMENT_AUTHORIZED',
    'PROCESSING→CONFIRMED': 'PAYMENT_CAPTURED',
    'PROCESSING→FAILED': 'PAYMENT_FAILED',
    'AUTHORIZED→CAPTURED': 'PAYMENT_CAPTURED',
    'AUTHORIZED→FAILED': 'PAYMENT_FAILED',
    'AUTHORIZED→CANCELLED': 'PAYMENT_CANCELLED',
    'CAPTURED→PARTIALLY_REFUNDED': 'PAYMENT_REFUND_SUCCEEDED',
    'CAPTURED→REFUNDED': 'PAYMENT_REFUND_SUCCEEDED',
    'CONFIRMED→PARTIALLY_REFUNDED': 'PAYMENT_REFUND_SUCCEEDED',
    'CONFIRMED→REFUNDED': 'PAYMENT_REFUND_SUCCEEDED',
    'PARTIALLY_REFUNDED→PARTIALLY_REFUNDED': 'PAYMENT_REFUND_SUCCEEDED',
    'PARTIALLY_REFUNDED→REFUNDED': 'PAYMENT_REFUND_SUCCEEDED',
    'FAILED→AWAITING_PAYMENT': 'PAYMENT_METHOD_SELECTED',
    'FAILED→CANCELLED': 'PAYMENT_CANCELLED',
    'REJECTED→CANCELLED': 'PAYMENT_CANCELLED',
  };

  return eventMap[`${fromStatus}→${toStatus}`] || 'PAYMENT_CONFIRMED';
}

/**
 * Get all allowed next statuses from a given status.
 */
export function getAllowedPaymentTransitions(status: string): string[] {
  return PAYMENT_TRANSITIONS[status] || [];
}
