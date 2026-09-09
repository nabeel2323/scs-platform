-- Migration 0017: Saved Suppliers (§21.3 retailer capability)
-- Store-level "saved suppliers": a retailer bookmarks the stores (suppliers)
-- they source from repeatedly. This is the store-level analog of the product
-- `favorites` table (migration 0004). Module boundary: modules/catalog/*.
-- Idempotent: safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS saved_suppliers (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_suppliers_user ON saved_suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_suppliers_store ON saved_suppliers(store_id);

COMMIT;
