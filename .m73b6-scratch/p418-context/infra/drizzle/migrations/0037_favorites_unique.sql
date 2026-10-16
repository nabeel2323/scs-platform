-- 0037_favorites.sql
-- Create the favorites table (user ↔ product bookmark) and prevent duplicates.
-- The Drizzle schema (catalog.schema.ts) defines this table, but no prior
-- migration created it, causing "relation favorites does not exist" in tests.

CREATE TABLE IF NOT EXISTS favorites (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_product
  ON favorites (user_id, product_id);
