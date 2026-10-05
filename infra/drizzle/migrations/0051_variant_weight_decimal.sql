-- 0051 — Widen product_variants.weight_grams from INT to NUMERIC(10,2)
--
-- Root cause: real manufacturer data contains decimal weights (e.g. 9.7 g).
-- The INT column rejected these with "invalid input syntax for type integer",
-- and because the import ran in a single transaction, one bad row poisoned
-- every subsequent row (25P02 cascade).
--
-- This migration:
--   1. Alters the column type to NUMERIC(10,2) — existing integer values
--      are implicitly compatible (100 → 100.00, no data loss).
--   2. Adds a CHECK constraint: weight must be positive or NULL.
--
-- Rollback: ALTER COLUMN … TYPE INTEGER USING weight_grams::INTEGER
--           (decimal values would be truncated — verify data first).

-- Sanitize any pre-existing invalid data (should not exist, but be safe).
-- Set zero or negative weights to NULL before adding the CHECK constraint.
UPDATE product_variants
SET weight_grams = NULL
WHERE weight_grams IS NOT NULL AND weight_grams <= 0;

-- Widen the column type.  INT → NUMERIC(10,2) is a safe implicit cast.
ALTER TABLE product_variants
  ALTER COLUMN weight_grams
  TYPE NUMERIC(10,2)
  USING weight_grams::NUMERIC(10,2);

-- Positive-or-null constraint (locked business rule BD-01).
ALTER TABLE product_variants
  ADD CONSTRAINT chk_variant_weight_positive
  CHECK (weight_grams IS NULL OR weight_grams > 0);
