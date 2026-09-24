-- 0030_store_popularity_disclosure.sql
-- PHASE 23: Per-store opt-out for the buyer-facing "Most Popular Seller" badge
-- and units-sold disclosure introduced in Phase 22. Privacy-sensitive sellers
-- can suppress the sales-count overlay without hiding the store from search or
-- affecting how their competitors' badges render.
--
-- Additive & reversible:
--   * Column is NOT NULL with DEFAULT false so every existing store keeps the
--     Phase 22 behaviour (badge shown) with zero backfill work.
--   * Only the buyer-facing ranking projection (`listOffersForProductRanked`)
--     reads this flag; merchant-internal analytics (Phase 16/18) and admin
--     governance (Phase 17/19) still see the true counts.
--   * Rollback:
--       ALTER TABLE stores DROP COLUMN IF EXISTS hide_popularity_badge;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS hide_popularity_badge BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN stores.hide_popularity_badge IS
  'PHASE 23: when TRUE, the buyer-facing "Most Popular Seller" ranking hides this store''s ordersCount/unitsSold/isMostPopular overlay. Affects only GET /v1/products/:id/offers/ranked; does not affect store visibility, offer listing, or admin/merchant analytics.';
