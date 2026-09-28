-- 0045_carrier_operations.sql
-- M7.2.3-C: Production Carrier Operations & Reconciliation
--
-- Extends outbox_events with lease tracking and tenant scoping.
-- Extends shipments with recovery/reconciliation fields.
-- Adds performance indexes for outbox claiming, reconciliation,
-- tracking lookup, and webhook queries.

-- ── Outbox Events Extensions ──────────────────────────────────────────────

-- Lease tracking for atomic claiming (FOR UPDATE SKIP LOCKED)
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_by VARCHAR(80);

-- Tenant scoping for multi-org job processing
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS organization_id UUID;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS store_id UUID;

-- Extend status CHECK constraint to include PROCESSING and DEAD_LETTER (M7.2.3-C)
ALTER TABLE outbox_events DROP CONSTRAINT IF EXISTS outbox_events_status_check;
ALTER TABLE outbox_events ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('PENDING','PROCESSING','DISPATCHED','FAILED','DEAD_LETTER'));

-- ── Shipment Recovery/Reconciliation Extensions ───────────────────────────

-- Widen carrier_create_status to accommodate RECOVERY_REQUIRED (17 chars)
ALTER TABLE shipments ALTER COLUMN carrier_create_status TYPE VARCHAR(24);

-- Recovery state machine for uncertain carrier operations
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS recovery_status VARCHAR(24);

-- Scheduling field for reconciliation worker
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS next_reconciliation_at TIMESTAMPTZ;

-- Error classification for retry decision transparency
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_error_class VARCHAR(40);

-- ── Indexes ───────────────────────────────────────────────────────────────

-- Outbox claiming: fast lookup of PENDING events ready for processing
CREATE INDEX IF NOT EXISTS idx_outbox_claim
  ON outbox_events (status, next_attempt_at)
  WHERE status = 'PENDING';

-- Reconciliation: shipments needing recovery
CREATE INDEX IF NOT EXISTS idx_shipments_reconciliation
  ON shipments (carrier_create_status, next_reconciliation_at)
  WHERE carrier_create_status IN ('PENDING', 'IN_PROGRESS', 'FAILED');

-- Tracking lookup by carrier shipment reference
CREATE INDEX IF NOT EXISTS idx_shipments_tracking
  ON shipments (carrier_shipment_id)
  WHERE carrier_shipment_id IS NOT NULL;

-- Tracking event dedup by external event ID
CREATE INDEX IF NOT EXISTS idx_shipment_events_external
  ON shipment_events (external_event_id)
  WHERE external_event_id IS NOT NULL;

-- Webhook event lookup (provider + external delivery ID)
CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup
  ON carrier_webhook_events (provider_key, external_delivery_id);
