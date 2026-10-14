import {
  pgTable, uuid, varchar, text, bigint, integer, boolean, jsonb,
  timestamp, date, numeric, char,
} from 'drizzle-orm/pg-core';
import { users } from '../identity/identity.schema';
import { returnRequests } from './returns.schema';
import { refunds, settlementRecords } from '../payments/payments.schema';
import { orders } from '../orders/orders.schema';

/**
 * P13 Phase 3 — Financial correctness schema
 *
 * - commissionReversals: responsibility-based commission reversal ledger
 * - settlementAdjustments: approval workflow for financial adjustments
 * - settlementAdjustmentApprovals: dual-approver tracking
 * - reconciliationRuns: monthly reconciliation execution records
 * - reconciliationDiscrepancies: identified financial discrepancies
 */

// ── Commission Reversals ────────────────────────────────────────

export const commissionReversals = pgTable('commission_reversals', {
  id: uuid('id').primaryKey(),
  returnRequestId: uuid('return_request_id').notNull().references(() => returnRequests.id, { onDelete: 'cascade' }),
  refundId: uuid('refund_id').references(() => refunds.id),
  settlementId: uuid('settlement_id').references(() => settlementRecords.id),
  originalCommissionMinor: bigint('original_commission_minor', { mode: 'number' }).notNull(),
  reversalMinor: bigint('reversal_minor', { mode: 'number' }).notNull(),
  responsibilityCategory: varchar('responsibility_category', { length: 30 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('POSTED'),
  currency: char('currency', { length: 3 }).notNull().default('SYP'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => users.id),
  orgId: uuid('org_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Settlement Adjustments ──────────────────────────────────────

export const settlementAdjustments = pgTable('settlement_adjustments', {
  id: uuid('id').primaryKey(),
  settlementId: uuid('settlement_id').references(() => settlementRecords.id),
  subOrderId: uuid('sub_order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  returnRequestId: uuid('return_request_id').references(() => returnRequests.id),
  adjustmentType: varchar('adjustment_type', { length: 30 }).notNull(),
  amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
  currency: char('currency', { length: 3 }).notNull().default('SYP'),
  usdEquivalentMinor: bigint('usd_equivalent_minor', { mode: 'number' }),
  fxRateSource: varchar('fx_rate_source', { length: 100 }),
  fxRate: numeric('fx_rate', { precision: 20, scale: 10 }),
  fxStatus: varchar('fx_status', { length: 24 }).default('NOT_REQUIRED'),
  fxEvidence: jsonb('fx_evidence'),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  reason: text('reason').notNull(),
  requiresDualApproval: boolean('requires_dual_approval').notNull().default(false),
  approvalHash: varchar('approval_hash', { length: 120 }),
  createdBy: uuid('created_by').references(() => users.id),
  orgId: uuid('org_id'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Settlement Adjustment Approvals ─────────────────────────────

export const settlementAdjustmentApprovals = pgTable('settlement_adjustment_approvals', {
  id: uuid('id').primaryKey(),
  adjustmentId: uuid('adjustment_id').notNull().references(() => settlementAdjustments.id, { onDelete: 'cascade' }),
  approverId: uuid('approver_id').notNull().references(() => users.id),
  approverRole: varchar('approver_role', { length: 40 }).notNull(),
  approvalHash: varchar('approval_hash', { length: 120 }).notNull(),
  approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  notes: text('notes'),
});

// ── Reconciliation Runs ─────────────────────────────────────────

export const reconciliationRuns = pgTable('reconciliation_runs', {
  id: uuid('id').primaryKey(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('SYP'),
  version: integer('version').notNull().default(1),
  status: varchar('status', { length: 24 }).notNull().default('RUNNING'),
  summary: jsonb('summary').notNull().default({}),
  discrepancyCount: integer('discrepancy_count').notNull().default(0),
  executedBy: uuid('executed_by').references(() => users.id),
  orgId: uuid('org_id'),
  supersededBy: uuid('superseded_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// ── Reconciliation Discrepancies ────────────────────────────────

export const reconciliationDiscrepancies = pgTable('reconciliation_discrepancies', {
  id: uuid('id').primaryKey(),
  runId: uuid('run_id').notNull().references(() => reconciliationRuns.id, { onDelete: 'cascade' }),
  discrepancyType: varchar('discrepancy_type', { length: 40 }).notNull(),
  sourceRef: varchar('source_ref', { length: 200 }).notNull(),
  expectedMinor: bigint('expected_minor', { mode: 'number' }),
  actualMinor: bigint('actual_minor', { mode: 'number' }),
  deltaMinor: bigint('delta_minor', { mode: 'number' }),
  description: text('description'),
  resolved: boolean('resolved').notNull().default(false),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolutionNotes: text('resolution_notes'),
  orgId: uuid('org_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
