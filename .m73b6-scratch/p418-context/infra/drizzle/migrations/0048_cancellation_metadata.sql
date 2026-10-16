-- 0048_cancellation_metadata.sql
-- M7.3-B.2: Merchant Cancellation + Shipment Synchronization
-- Adds cancellation audit columns to the orders table.
-- All columns are nullable — no backfill required.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_reason varchar(40);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_actor_type varchar(16);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancellation_actor_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
