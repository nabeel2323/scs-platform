-- 0020_stock_movement_constraint.sql — Ledger integrity: CHECK constraint + backfill
-- §9 policy decision: enforce the movement_type vocabulary at the DB level so
-- no caller can write an undocumented type, and fix legacy rows that violate
-- the sign convention.
--
-- Sign convention (from 0005_inventory.sql):
--   positive = in, negative = out
-- RESERVE and SALE write negative quantities (stock goes out of available).
-- RELEASE, ADJUST-in, IMPORT, RETURN write positive quantities (stock comes in).
--
-- Legacy data issue: some early RESERVE rows were written with positive
-- quantities (the opposite of the convention). The settlement code already
-- handles this via Math.abs, but the constraint must not reject those rows
-- until they are backfilled.

-- Step 1: Backfill legacy positive RESERVE rows to negative.
-- Only rows where quantity > 0 and movement_type = 'RESERVE' need flipping.
-- This is idempotent: running it twice is safe (the second run matches 0 rows).
UPDATE stock_movements
SET quantity = -quantity
WHERE movement_type = 'RESERVE'
  AND quantity > 0;

-- Step 2: Backfill any 'INBOUND' rows (written by demo-data.ts before the
-- vocabulary was enforced) to 'IMPORT', which is the documented type for
-- initial stock loads.
UPDATE stock_movements
SET movement_type = 'IMPORT'
WHERE movement_type = 'INBOUND';

-- Step 3: Add the CHECK constraint to enforce the vocabulary going forward.
-- This prevents any future caller from writing an undocumented type.
ALTER TABLE stock_movements
ADD CONSTRAINT chk_stock_movements_type
CHECK (movement_type IN ('ADJUST', 'RESERVE', 'RELEASE', 'SALE', 'CANCEL', 'IMPORT', 'RETURN'));

-- Log the migration for the runner.
INSERT INTO _migration_log (name) VALUES ('0020_stock_movement_constraint');
