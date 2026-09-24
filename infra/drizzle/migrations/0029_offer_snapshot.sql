-- 0029_offer_snapshot.sql
-- PHASE 15: Immutably snapshot the merchant offer's terms at checkout time so
-- historical orders remain truthful even after the offer is edited, suspended,
-- or deleted.
--
-- Additive & reversible:
--   * Column is nullable — legacy rows continue to read `NULL` and fall back to
--     the live `merchant_offers` join (Phase 12 enrichment).
--   * Existing FK `offer_id → merchant_offers ON DELETE SET NULL` (0028) is
--     untouched; the snapshot is what survives after that FK nulls out.
--   * Rollback: `ALTER TABLE order_items DROP COLUMN IF EXISTS offer_snapshot;`

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS offer_snapshot JSONB;

-- Comment for consumers reading pg_catalog; the Drizzle schema is the source of
-- truth but this helps DBAs inspect the column without cross-referencing code.
COMMENT ON COLUMN order_items.offer_snapshot IS
  'PHASE 15: immutable capture of merchant_offer terms at checkout (currency, moq, leadTimeDays, basePriceMinor, priceListId, storeId, snapshotStatus). Null for lines not backed by an offer.';
