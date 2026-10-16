-- P13 Phase 3.1: Hardening corrections
-- Forward-only migration. Does NOT modify 0061.
-- Idempotent: safe on fresh DB, existing DB, and repeated runs.
-- No _migration_log writes — the runner owns bookkeeping.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Reconciliation versioning — preserve audit history across reruns
-- ═══════════════════════════════════════════════════════════════════

-- Add version column (each rerun increments)
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Add superseded_by for linking reruns to prior runs
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS superseded_by UUID REFERENCES reconciliation_runs(id);

-- Add org_id for tenant scoping of reconciliation results
ALTER TABLE reconciliation_runs ADD COLUMN IF NOT EXISTS org_id UUID;

-- Unique constraint: one run per (period, currency, version)
-- Using a partial unique index since Drizzle/Postgres doesn't support unique constraints on nullable expressions easily
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_runs_unique_version
  ON reconciliation_runs(period_start, period_end, currency, version);

-- Index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_org
  ON reconciliation_runs(org_id);

-- ═══════════════════════════════════════════════════════════════════
-- 2. Settlement adjustments — add org_id for tenant isolation
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE settlement_adjustments ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_settlement_adjustments_org
  ON settlement_adjustments(org_id);

-- Add FX threshold evidence (JSONB: {evaluationTimestamp, thresholdMinor, currency, result, reason})
ALTER TABLE settlement_adjustments ADD COLUMN IF NOT EXISTS fx_evidence JSONB;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Commission reversals — add org_id for tenant isolation
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE commission_reversals ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_commission_reversals_org
  ON commission_reversals(org_id);

-- ═══════════════════════════════════════════════════════════════════
-- 4. Reconciliation discrepancies — add org_id for tenant isolation
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE reconciliation_discrepancies ADD COLUMN IF NOT EXISTS org_id UUID;

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_org
  ON reconciliation_discrepancies(org_id);

-- ═══════════════════════════════════════════════════════════════════
-- 5. Fix adjustment type constraint — add DELIVERY_FEE_EXCEPTION
-- ═══════════════════════════════════════════════════════════════════

-- The Phase 3 code uses 'DELIVERY_FEE_EXCEPTION' but the 0061 constraint
-- only allows: COMMISSION_REVERSAL, DELIVERY_FEE_REFUND, SETTLEMENT_CORRECTION,
-- BALANCE_ADJUSTMENT, REFUND_SUPPLEMENT.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_adjustments_type') THEN
    ALTER TABLE settlement_adjustments DROP CONSTRAINT chk_settlement_adjustments_type;
  END IF;
  ALTER TABLE settlement_adjustments ADD CONSTRAINT chk_settlement_adjustments_type
    CHECK (adjustment_type IN (
      'COMMISSION_REVERSAL', 'DELIVERY_FEE_REFUND', 'DELIVERY_FEE_EXCEPTION',
      'SETTLEMENT_CORRECTION', 'BALANCE_ADJUSTMENT', 'REFUND_SUPPLEMENT'
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 6. Add approval_hash_stored to settlement_adjustments
--    so that material changes can be detected at approval time
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE settlement_adjustments ADD COLUMN IF NOT EXISTS approval_hash VARCHAR(120);
