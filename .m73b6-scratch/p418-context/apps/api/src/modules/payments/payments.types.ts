/**
 * P12 Payment domain types.
 *
 * Locked vocabulary — do not add values without updating the architecture lock
 * document and migration 0058 CHECK constraints.
 */

// ── Payment Methods ─────────────────────────────────────────────

export const PAYMENT_METHODS = [
  'BANK_TRANSFER',
  'CASH_ON_DELIVERY',
  'VOUCHER',
  'DIGITAL',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// ── Payment Record Statuses ─────────────────────────────────────

export const PAYMENT_STATUSES = [
  'CREATED',
  'AWAITING_PAYMENT',
  'AWAITING_VERIFICATION',
  'CONFIRMED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'PROCESSING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'REFUND_FAILED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Terminal states — no further transitions permitted. */
export const PAYMENT_TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'CONFIRMED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
]);

// ── Payment Event Types ─────────────────────────────────────────

export const PAYMENT_EVENT_TYPES = [
  'PAYMENT_CREATED',
  'PAYMENT_AWAITING',
  'PAYMENT_METHOD_SELECTED',
  'PAYMENT_PROOF_SUBMITTED',
  'PAYMENT_VERIFICATION_STARTED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_REJECTED',
  'PAYMENT_EXPIRED',
  'PAYMENT_AUTHORIZE_REQUESTED',
  'PAYMENT_AUTHORIZED',
  'PAYMENT_CAPTURED',
  'PAYMENT_FAILED',
  'PAYMENT_REFUND_REQUESTED',
  'PAYMENT_REFUND_SUCCEEDED',
  'PAYMENT_REFUND_FAILED',
  'PAYMENT_CANCELLED',
] as const;

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

// ── Refund Statuses ─────────────────────────────────────────────

export const REFUND_STATUSES = [
  'REQUESTED',
  'PROCESSING',
  'SUCCEEDED',
  'FAILED',
  'APPROVED',
  'REJECTED',
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

// ── Refund Reasons (controlled vocabulary) ──────────────────────

export const REFUND_REASONS = [
  'CUSTOMER_REQUEST',
  'MERCHANT_UNABLE_TO_FULFILL',
  'OUT_OF_STOCK',
  'PRICE_ERROR',
  'PAYMENT_ERROR',
  'DUPLICATE_CHARGE',
  'PRODUCT_NOT_AS_DESCRIBED',
  'MERCHANT_REJECTION',
  'SYSTEM_ERROR',
  'ADMINISTRATIVE',
  'OTHER',
] as const;

export type RefundReason = (typeof REFUND_REASONS)[number];

// ── Settlement Statuses ─────────────────────────────────────────

export const SETTLEMENT_STATUSES = [
  'PENDING',
  'CALCULATED',
  'DUE',
  'PAID',
] as const;

export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

// ── Provider Interface Types ────────────────────────────────────

export interface CreatePaymentParams {
  orderId: string;
  amountMinor: number;
  currency: string;
  paymentMethod: PaymentMethod;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentIntentResult {
  providerKey: string;
  providerPaymentId?: string;
  status: PaymentStatus;
  instructions?: PaymentInstructions;
}

export interface PaymentInstructions {
  /** For BANK_TRANSFER: bank details to display to buyer. */
  bankDetails?: {
    bankName: string;
    accountNumber: string;
    iban?: string;
    accountHolder: string;
    reference: string;
  };
  /** Amount the buyer must pay. */
  amountMinor: number;
  currency: string;
  /** ISO-8601 deadline for payment. */
  expiresAt?: string;
}

export interface PaymentStatusResult {
  providerKey: string;
  providerPaymentId?: string;
  status: PaymentStatus;
}

export interface RefundParams {
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  reason: string;
  idempotencyKey?: string;
}

export interface RefundResult {
  providerKey: string;
  providerRefundId?: string;
  status: RefundStatus;
}

export interface ParsedWebhookEvent {
  providerEventId: string;
  eventType: string;
  providerPaymentId: string;
  status: PaymentStatus;
  amountMinor?: number;
  raw: unknown;
}

// ── Configuration ───────────────────────────────────────────────

/** Default bank-transfer payment window (72 hours). */
export const DEFAULT_PAYMENT_EXPIRY_HOURS = 72;

/** Platform bank details — read from env at runtime. */
export interface PlatformBankDetails {
  bankName: string;
  accountNumber: string;
  iban?: string;
  accountHolder: string;
}
