-- 0039_cart_offer_unique.sql
-- M6.2: Replace the original UNIQUE(cart_id, variant_id) constraint with two
-- partial unique indexes that include offer_id, enabling multi-merchant cart
-- lines for the same variant (BUG-M6-001 fix, formalised as a migration).
--
-- Idempotent: safe on fresh DB (no old constraint) and existing M6 DB.
-- Uses DROP CONSTRAINT IF EXISTS + CREATE UNIQUE INDEX (replaces any existing
-- index with the same name).

-- Step 1: Drop the legacy constraint if it still exists.
-- On a fresh DB that ran 0009_cart.sql, this constraint exists.
-- On an already-migrated DB (manual script ran), it was already dropped.
ALTER TABLE cart_items
  DROP CONSTRAINT IF EXISTS cart_items_cart_id_variant_id_key;

-- Step 2: Create partial unique index for offer-scoped cart lines.
-- Allows multiple cart lines for the same (cart_id, variant_id) as long as
-- each has a different offer_id (different merchant offers).
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_variant_offer_unique
  ON cart_items (cart_id, variant_id, offer_id)
  WHERE offer_id IS NOT NULL;

-- Step 3: Create partial unique index for legacy (no-offer) cart lines.
-- Preserves the original one-line-per-variant behaviour for rows without an
-- offer_id, preventing duplicate legacy lines.
CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_variant_legacy_unique
  ON cart_items (cart_id, variant_id)
  WHERE offer_id IS NULL;
