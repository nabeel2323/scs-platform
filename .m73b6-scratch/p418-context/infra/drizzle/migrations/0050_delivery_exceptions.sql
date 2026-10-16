-- 0050_delivery_exceptions.sql
-- M7.3-B.4: Delivery Exception + Retry schema foundation.
-- Additive only — no destructive changes, no data migration.
-- Idempotent via IF NOT EXISTS.

-- Exception lifecycle columns on shipments.
-- The shipment remains the aggregate root for delivery exceptions.
-- exception_status: NULL → OPEN → RETRY_PENDING / RESOLVED / CLOSED / RTS_PENDING
-- exception_type: one of 8 canonical types (RECIPIENT_UNAVAILABLE, etc.)

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS exception_status VARCHAR(24);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS exception_type VARCHAR(30);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS exception_notes TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS exception_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS exception_resolved_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS max_delivery_attempts INTEGER NOT NULL DEFAULT 3;

-- Partial index: only rows with an active exception (non-NULL status).
-- Supports efficient queries for open exceptions, retry-eligible shipments, etc.
CREATE INDEX IF NOT EXISTS idx_shipments_exception_status
ON shipments(exception_status)
WHERE exception_status IS NOT NULL;

-- Extend shipment_events.event_type from varchar(24) to varchar(40)
-- to accommodate B.4 event types:
--   DELIVERY_EXCEPTION_RESOLVED (28 chars)
--   DELIVERY_RETRY_REQUESTED (24 chars)
--   DELIVERY_EXCEPTION_CLOSED (25 chars)
-- This is additive-only: existing events (DELIVERED, CANCELLED, etc.)
-- are all ≤ 24 chars and remain valid.
ALTER TABLE shipment_events ALTER COLUMN event_type TYPE VARCHAR(40);
