import {
  pgTable,
  uuid,
  varchar,
  char,
  text,
  bigint,
  jsonb,
  timestamp,
  integer,
} from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';
import { orders } from '../orders/orders.schema';
import { stores } from '../merchant/merchant.schema';

/**
 * Payments schema (migration 0058_payment_financial_architecture)
 *
 * P12 — Payments & Financial Architecture
 *
 * - payment_records: one per sub-order, tracks payment lifecycle
 * - payment_events: append-only immutable payment lifecycle log
 * - refunds: full and partial refund tracking
 * - settlement_records: merchant settlement tracking
 *
 * All amounts are integer minor units of `currency` (SYP for Syria deployment).
 */

// ── Payment Records ─────────────────────────────────────────────

export const paymentRecords = pgTable('payment_records', {
  id: uuid('id').primaryKey(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  providerKey: varchar('provider_key', { length: 40 }).notNull().default('manual'),
  providerPaymentId: varchar('provider_payment_id', { length: 200 }),
  idempotencyKey: varchar('idempotency_key', { length: 120 }),
  paymentMethod: varchar('payment_method', { length: 24 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('CREATED'),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  confirmedAmountMinor: bigint('confirmed_amount_minor', { mode: 'number' }),
  failureCode: varchar('failure_code', { length: 40 }),
  failureReason: text('failure_reason'),
  receiptUrl: text('receipt_url'),
  receiptReference: varchar('receipt_reference', { length: 200 }),
  voucherCode: varchar('voucher_code', { length: 100 }),
  verifiedBy: uuid('verified_by').references(() => users.id),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verificationNotes: text('verification_notes'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  lastReconciledAt: timestamp('last_reconciled_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Payment Proof Upload Intents ─────────────────────────────────
// Durable ownership record for each generated object key. Stale intents
// are recoverable after lease expiry; cleanup checks the payment row first.
export const paymentProofUploadIntents = pgTable('payment_proof_upload_intents', {
  id: uuid('id').primaryKey(),
  paymentRecordId: uuid('payment_record_id')
    .notNull()
    .references(() => paymentRecords.id),
  storageBucket: varchar('storage_bucket', { length: 120 }).notNull(),
  storageKey: varchar('storage_key', { length: 512 }).notNull().unique(),
  contentType: varchar('content_type', { length: 100 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('UPLOADING'),
  attemptCount: integer('attempt_count').notNull().default(0),
  leaseOwner: varchar('lease_owner', { length: 160 }),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  lastErrorCode: varchar('last_error_code', { length: 60 }),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
  committedAt: timestamp('committed_at', { withTimezone: true }),
  cleanedAt: timestamp('cleaned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Payment Events (append-only) ────────────────────────────────

export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey(),
  paymentRecordId: uuid('payment_record_id')
    .notNull()
    .references(() => paymentRecords.id, { onDelete: 'cascade' }),
  eventType: varchar('event_type', { length: 40 }).notNull(),
  providerEventId: varchar('provider_event_id', { length: 200 }),
  fromStatus: varchar('from_status', { length: 30 }),
  toStatus: varchar('to_status', { length: 30 }).notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  actorType: varchar('actor_type', { length: 16 }).notNull().default('SYSTEM'),
  amountMinor: bigint('amount_minor', { mode: 'number' }),
  notes: text('notes'),
  receiptUrl: text('receipt_url'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Refunds ─────────────────────────────────────────────────────

export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey(),
  paymentRecordId: uuid('payment_record_id')
    .notNull()
    .references(() => paymentRecords.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  idempotencyKey: varchar('idempotency_key', { length: 120 }),
  providerRefundId: varchar('provider_refund_id', { length: 200 }),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('REQUESTED'),
  reason: varchar('reason', { length: 40 }).notNull(),
  notes: text('notes'),
  requestedBy: uuid('requested_by').references(() => users.id),
  approvedBy: uuid('approved_by').references(() => users.id),
  providerRefundStatus: varchar('provider_refund_status', { length: 40 }),
  // P13: link to originating return request / dispute (nullable). Migration
  // 0059 installs the return_requests FK; keep it migration-only here to avoid
  // a payments <-> returns schema-module initialization cycle.
  returnRequestId: uuid('return_request_id'),
  disputeId: uuid('dispute_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Settlement Records ──────────────────────────────────────────

export const settlementRecords = pgTable('settlement_records', {
  id: uuid('id').primaryKey(),
  subOrderId: uuid('sub_order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  paymentRecordId: uuid('payment_record_id')
    .notNull()
    .references(() => paymentRecords.id, { onDelete: 'cascade' }),
  merchantStoreId: uuid('merchant_store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  grossMinor: bigint('gross_minor', { mode: 'number' }).notNull(),
  refundMinor: bigint('refund_minor', { mode: 'number' }).notNull().default(0),
  commissionMinor: bigint('commission_minor', { mode: 'number' }).notNull().default(0),
  feeMinor: bigint('fee_minor', { mode: 'number' }).notNull().default(0),
  netMinor: bigint('net_minor', { mode: 'number' }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('PENDING'),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  paymentReference: text('payment_reference'),
  notes: text('notes'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
