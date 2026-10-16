-- P13 Phase 3: Commission reversals, settlement adjustments, approvals, reconciliation
-- Idempotent: safe on fresh DB, existing DB, and repeated runs.
-- No _migration_log writes — the runner owns bookkeeping.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Fix settlement CHECK constraint — add ADJUSTMENT and REJECTED
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_status') THEN
    ALTER TABLE settlement_records DROP CONSTRAINT chk_settlement_status;
  END IF;
  ALTER TABLE settlement_records ADD CONSTRAINT chk_settlement_status
    CHECK (status IN (
      'PENDING', 'CALCULATED', 'DUE', 'PAID',
      'ADJUSTMENT', 'REJECTED'
    ));
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Commission reversals — responsibility-based ledger
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS commission_reversals (
  id                        UUID PRIMARY KEY,
  return_request_id         UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  refund_id                 UUID REFERENCES refunds(id),
  settlement_id             UUID REFERENCES settlement_records(id),
  original_commission_minor BIGINT NOT NULL,
  reversal_minor            BIGINT NOT NULL,
  responsibility_category   VARCHAR(30) NOT NULL,
  idempotency_key           VARCHAR(120) NOT NULL,
  status                    VARCHAR(24) NOT NULL DEFAULT 'POSTED',
  currency                  CHAR(3) NOT NULL DEFAULT 'SYP',
  notes                     TEXT,
  created_by                UUID REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: one reversal per return+idempotency-key
CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_reversals_idempotency
  ON commission_reversals(idempotency_key);

-- Lookup by return
CREATE INDEX IF NOT EXISTS idx_commission_reversals_return
  ON commission_reversals(return_request_id);

-- Lookup by settlement
CREATE INDEX IF NOT EXISTS idx_commission_reversals_settlement
  ON commission_reversals(settlement_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_commission_reversals_status') THEN
    ALTER TABLE commission_reversals ADD CONSTRAINT chk_commission_reversals_status
      CHECK (status IN ('POSTED', 'REVERSED', 'FAILED'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_commission_reversals_amount') THEN
    ALTER TABLE commission_reversals ADD CONSTRAINT chk_commission_reversals_amount
      CHECK (reversal_minor >= 0 AND reversal_minor <= original_commission_minor);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_commission_reversals_responsibility') THEN
    ALTER TABLE commission_reversals ADD CONSTRAINT chk_commission_reversals_responsibility
      CHECK (responsibility_category IN ('MERCHANT', 'PLATFORM', 'CARRIER_DAMAGE', 'BUYER_REMORSE'));
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Settlement adjustments — approval workflow
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlement_adjustments (
  id                      UUID PRIMARY KEY,
  settlement_id           UUID REFERENCES settlement_records(id),
  sub_order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  return_request_id       UUID REFERENCES return_requests(id),
  adjustment_type         VARCHAR(30) NOT NULL,
  amount_minor            BIGINT NOT NULL,
  currency                CHAR(3) NOT NULL DEFAULT 'SYP',
  usd_equivalent_minor    BIGINT,
  fx_rate_source          VARCHAR(100),
  fx_rate                 NUMERIC(20, 10),
  fx_status               VARCHAR(24) DEFAULT 'NOT_REQUIRED',
  status                  VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  reason                  TEXT NOT NULL,
  requires_dual_approval  BOOLEAN NOT NULL DEFAULT false,
  created_by              UUID REFERENCES users(id),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_adjustments_settlement
  ON settlement_adjustments(settlement_id);

CREATE INDEX IF NOT EXISTS idx_settlement_adjustments_order
  ON settlement_adjustments(sub_order_id);

CREATE INDEX IF NOT EXISTS idx_settlement_adjustments_status
  ON settlement_adjustments(status);

CREATE INDEX IF NOT EXISTS idx_settlement_adjustments_return
  ON settlement_adjustments(return_request_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_adjustments_status') THEN
    ALTER TABLE settlement_adjustments ADD CONSTRAINT chk_settlement_adjustments_status
      CHECK (status IN (
        'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'POSTED',
        'REJECTED', 'FAILED', 'BLOCKED_FX'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_adjustments_type') THEN
    ALTER TABLE settlement_adjustments ADD CONSTRAINT chk_settlement_adjustments_type
      CHECK (adjustment_type IN (
        'COMMISSION_REVERSAL', 'DELIVERY_FEE_REFUND', 'SETTLEMENT_CORRECTION',
        'BALANCE_ADJUSTMENT', 'REFUND_SUPPLEMENT'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_adjustments_fx_status') THEN
    ALTER TABLE settlement_adjustments ADD CONSTRAINT chk_settlement_adjustments_fx_status
      CHECK (fx_status IN ('NOT_REQUIRED', 'RESOLVED', 'BLOCKED', 'PENDING_REVIEW'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_adjustments_amount') THEN
    ALTER TABLE settlement_adjustments ADD CONSTRAINT chk_settlement_adjustments_amount
      CHECK (amount_minor > 0);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Settlement adjustment approvals — dual-approver tracking
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlement_adjustment_approvals (
  id              UUID PRIMARY KEY,
  adjustment_id   UUID NOT NULL REFERENCES settlement_adjustments(id) ON DELETE CASCADE,
  approver_id     UUID NOT NULL REFERENCES users(id),
  approver_role   VARCHAR(40) NOT NULL,
  approval_hash   VARCHAR(120) NOT NULL,
  approved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT
);

-- Prevent duplicate approval by same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_adjustment_approvals_unique
  ON settlement_adjustment_approvals(adjustment_id, approver_id);

CREATE INDEX IF NOT EXISTS idx_adjustment_approvals_adjustment
  ON settlement_adjustment_approvals(adjustment_id);

-- ═══════════════════════════════════════════════════════════════════
-- 5. Reconciliation runs and discrepancies
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id                UUID PRIMARY KEY,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  currency          CHAR(3) NOT NULL DEFAULT 'SYP',
  status            VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
  summary           JSONB NOT NULL DEFAULT '{}',
  discrepancy_count INTEGER NOT NULL DEFAULT 0,
  executed_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_period
  ON reconciliation_runs(period_start, period_end);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_reconciliation_runs_status') THEN
    ALTER TABLE reconciliation_runs ADD CONSTRAINT chk_reconciliation_runs_status
      CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
  id                UUID PRIMARY KEY,
  run_id            UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  discrepancy_type  VARCHAR(40) NOT NULL,
  source_ref        VARCHAR(200) NOT NULL,
  expected_minor    BIGINT,
  actual_minor      BIGINT,
  delta_minor       BIGINT,
  description       TEXT,
  resolved          BOOLEAN NOT NULL DEFAULT false,
  resolved_at       TIMESTAMPTZ,
  resolved_by       UUID REFERENCES users(id),
  resolution_notes  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_run
  ON reconciliation_discrepancies(run_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_type
  ON reconciliation_discrepancies(discrepancy_type);

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_unresolved
  ON reconciliation_discrepancies(run_id) WHERE resolved = false;

-- ═══════════════════════════════════════════════════════════════════
-- 6. Add return_request_id and dispute_id to refunds (if not present)
-- ═══════════════════════════════════════════════════════════════════

-- Migration 0058 created refunds without these FK columns;
-- the Drizzle schema declares them but the migration didn't add them.
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS return_request_id UUID REFERENCES return_requests(id);
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS dispute_id UUID;

-- ═══════════════════════════════════════════════════════════════════
-- 7. Add delivery_fee_minor to order_items for per-item delivery allocation
-- ═══════════════════════════════════════════════════════════════════

-- The order-level delivery fee is in order_financial_breakdown.
-- For partial returns we need to know the per-item allocation.
-- Default 0 — only populated if explicitly allocated at checkout.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS delivery_fee_minor BIGINT NOT NULL DEFAULT 0;
