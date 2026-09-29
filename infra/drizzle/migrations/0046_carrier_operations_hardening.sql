-- 0046_carrier_operations_hardening.sql
-- M7.2.4-A: Carrier Operations Remediation & Multi-Tenant Hardening
--
-- Changes:
--   1. Partial UNIQUE index on shipment_events.external_event_id (tracking dedup)
--   2. Remove redundant indexes on shipment_events.external_event_id
--   3. Index to support optimized tracking poller query
--
-- Idempotent DDL only — no _migration_log writes.

-- ── 1. Tracking Event Dedup: Partial Unique Index ──────────────────────────
-- Replaces the non-unique indexes from 0043 and 0045.
-- Ensures no duplicate tracking events under concurrent processing.
-- NULL values are excluded (multiple NULLs allowed).

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipment_events_external_id
  ON shipment_events (external_event_id)
  WHERE external_event_id IS NOT NULL;

-- ── 2. Remove Redundant Indexes ────────────────────────────────────────────
-- idx_shipment_events_ext (0043) and idx_shipment_events_external (0045)
-- are both non-unique indexes on the same column.
-- The new unique index uq_shipment_events_external_id supersedes both.

DROP INDEX IF EXISTS idx_shipment_events_ext;
DROP INDEX IF EXISTS idx_shipment_events_external;

-- ── 3. Tracking Poller Performance Index ───────────────────────────────────
-- Supports the optimized tracking poller query that filters at SQL level:
--   WHERE carrier_create_status = 'SUCCESS'
--     AND carrier_tracking_id IS NOT NULL
--     AND carrier_status_mapped NOT IN ('DELIVERED','CANCELLED','COMPLETED')
--   ORDER BY last_carrier_sync_at NULLS FIRST

CREATE INDEX IF NOT EXISTS idx_shipments_tracking_poll
  ON shipments (last_carrier_sync_at)
  WHERE carrier_create_status = 'SUCCESS'
    AND carrier_tracking_id IS NOT NULL
    AND (carrier_status_mapped IS NULL
         OR carrier_status_mapped NOT IN ('DELIVERED', 'CANCELLED', 'COMPLETED'));
