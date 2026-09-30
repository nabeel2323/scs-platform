-- 0049_carrier_cancellation.sql
-- M7.3-B.3.1: Carrier-Cancel State Foundation
--
-- Adds the carrier-cancellation operation state and carrier-pickup
-- persistence columns to the shipments table. Cancellation state is
-- modeled in a DEDICATED carrier_cancel_* field group and never overloads
-- the carrier_create_* create-flow columns (they are separate lifecycles).
--
-- Constraints honored (per M7.3-B.3.0 lock):
--   - Additive only. No DROP, no destructive ALTER, no data rewrite.
--   - Idempotent (IF NOT EXISTS). Safe to run repeatedly.
--   - Fresh-DB safe, existing-DB safe, zero-downtime (nullable / constant-default columns).
--   - Existing shipments stay behaviorally inactive:
--         pickup_scheduled = false, carrier_pickup_id = NULL,
--         carrier_cancel_status = NULL, carrier_cancel_retries = 0,
--         carrier_cancel_attempted_at/error/error_class/idempotency_key = NULL.
--   - recovery_status remains VARCHAR(24) with no CHECK constraint (unchanged here).
--
-- Migration-runner bookkeeping (the applied-name log table) is intentionally
-- not written here: the runner owns that; this file is idempotent DDL only.

-- ── Carrier Pickup Persistence (BD-1: currently unreachable in prod) ────────
-- pickup_scheduled / carrier_pickup_id let a future pickup-scheduling workflow
-- persist the Aramex pickup GUID so a worker can decide/deterministically
-- assemble CancelPickup WITHOUT calling the carrier just to discover it.
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_pickup_id VARCHAR(200);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS pickup_scheduled BOOLEAN NOT NULL DEFAULT false;

-- ── Carrier Cancellation State (dedicated group) ────────────────────────────
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_cancel_status VARCHAR(24);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_cancel_error TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_cancel_error_class VARCHAR(40);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_cancel_retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_cancel_attempted_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_cancel_idempotency_key VARCHAR(120);

-- ── Cancellation Claim / Reconciliation Index ───────────────────────────────
-- Supports the B.3 worker/reconciliation claim path that scans active
-- (non-terminal) cancellation states ordered by their reconciliation schedule.
-- Partial: only rows with a pending/unknown/retrying cancel are indexed.
CREATE INDEX IF NOT EXISTS idx_shipments_carrier_cancel
  ON shipments (carrier_cancel_status, next_reconciliation_at)
  WHERE carrier_cancel_status IN
    ('PENDING', 'IN_PROGRESS', 'UNKNOWN', 'RETRY', 'RECONCILIATION_REQUIRED');
