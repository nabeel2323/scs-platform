-- 0042_shipping_methods_enhancement.sql
-- M7.2.2: Enhance shipping_methods with CRUD fields and fix shipment FK.
--
-- Changes:
--   1. Add key, description, carrier_type, min_order_minor, free_above_minor
--      to shipping_methods (all idempotent ADD COLUMN IF NOT EXISTS).
--   2. Add UNIQUE index on (store_id, key) for duplicate-key prevention.
--   3. Add FK shipments.shipping_method_id → shipping_methods.id
--      ON DELETE SET NULL (preserve historical shipments if method removed).
--
-- Safe on fresh DB and existing M7.2.1 DB.  Non-destructive.

-- ── Shipping Methods: new columns ───────────────────────────────────────────

ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS key VARCHAR(60);
ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS carrier_type VARCHAR(24) NOT NULL DEFAULT 'MERCHANT';
ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS min_order_minor BIGINT;
ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS free_above_minor BIGINT;

-- Backfill key from type for any rows created during M7.2.1 (none expected,
-- but defensive).  Only fills rows where key IS NULL.
UPDATE shipping_methods SET key = LOWER(type) WHERE key IS NULL;

-- ── Unique constraint: (store_id, key) ──────────────────────────────────────
-- Using a unique index because PostgreSQL supports IF NOT EXISTS on indexes
-- but not on named UNIQUE constraints via ALTER TABLE.

CREATE UNIQUE INDEX IF NOT EXISTS uq_shipping_methods_store_key
  ON shipping_methods(store_id, key)
  WHERE key IS NOT NULL;

-- ── Shipment FK: shipping_method_id → shipping_methods ──────────────────────
-- ON DELETE SET NULL: if a shipping method is somehow removed, the shipment
-- preserves its historical record with a NULL method reference.  The preferred
-- lifecycle is deactivation (is_active = false), not deletion.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_shipments_shipping_method'
  ) THEN
    ALTER TABLE shipments
      ADD CONSTRAINT fk_shipments_shipping_method
      FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id)
      ON DELETE SET NULL;
  END IF;
END $$;
