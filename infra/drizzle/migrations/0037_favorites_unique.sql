-- 0037_favorites_unique.sql
-- ADVERSARIAL FIX: prevent duplicate favorites per (user, product).
-- The favorites table had no unique constraint, so double-clicking "favorite"
-- could create duplicate rows. The application uses findFirst + insert (not
-- upsert), so the DB constraint is the only guard against duplicates.

CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_user_product
  ON favorites (user_id, product_id);
