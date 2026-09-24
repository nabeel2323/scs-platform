-- 0026_merchant_offers.sql — Merchant Offer layer (PHASE 4 domain model)
-- Module boundary: modules/catalog/*
--
-- Realises the "how a merchant sells it" side of the canonical-product split.
-- A canonical product/variant (Phase 3) can now carry MANY merchant offers
-- without duplicating the product. The OFFER owns the commercial terms and is
-- the unit that pricing/stock hang off, per the resolved decision that offers
-- FULLY ABSORB pricing.
--
-- ADDITIVE ONLY / non-breaking: this creates a new table and does NOT alter or
-- move any existing `price_lists`/`price_tiers`/`inventory_items`/`cart`/order
-- data. Re-wiring the price/stock resolvers and cart/checkout onto offers is a
-- SEPARATE, approval-gated step (Phase 4b) so nothing in the working purchase
-- path changes until that is signed off. Idempotent DDL only (IF NOT EXISTS);
-- the runner records application in _migration_log, so this file adds none.
--
-- Pricing/stock absorption model (§ Merchant Offer):
--   • base_price_minor / compare_at_price_minor + currency are the offer's lead
--     price; the quantity ladder continues to live in price_tiers, reached
--     through price_list_id (the store's price book) which the offer points at.
--     That link is what "moves pricing under the offer" without a destructive
--     data migration of existing tiers.
--   • inventory continues to be tracked in inventory_items per (variant,
--     warehouse); warehouse_id names the stock source backing this offer.

-- ── Merchant offers ────────────────────────────────────────────────────────────
--   status: DRAFT | PROPOSED | ACTIVE | SUSPENDED | REJECTED | WITHDRAWN
--     A merchant creates a draft and may PROPOSE it (and, for an not-yet-canonical
--     product, the merchant's proposal of the canonical product rides along with
--     it). A platform admin APPROVES → ACTIVE, or REJECTS with a reason. ACTIVE
--     offers can be SUSPENDED and later re-ACTIVATED, or WITHDRAWN by the store.
--   variant_id nullable: a NULL variant_id means a product-level offer (applies to
--     the product's default variant), so uniqueness is split across two partial
--     indexes below rather than a single composite UNIQUE.

CREATE TABLE IF NOT EXISTS merchant_offers (
  id                     UUID PRIMARY KEY,
  store_id               UUID         NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id             UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id             UUID         REFERENCES product_variants(id) ON DELETE CASCADE,
  status                 VARCHAR(16)  NOT NULL DEFAULT 'DRAFT',
  currency               CHAR(3)      NOT NULL DEFAULT 'SAR',
  base_price_minor       BIGINT,                              -- offer lead price (minor units)
  compare_at_price_minor BIGINT,                              -- optional reference/list price
  moq                    INT          NOT NULL DEFAULT 1,      -- § offer owns MOQ (was on product)
  order_increment        INT,                                  -- purchasable step above MOQ
  lead_time_days         INT,                                  -- § offer owns lead time
  is_available           BOOLEAN      NOT NULL DEFAULT TRUE,   -- § offer owns availability
  price_list_id          UUID         REFERENCES price_lists(id) ON DELETE SET NULL, -- tier ladder source (§ absorb pricing)
  warehouse_id           UUID         REFERENCES warehouses(id) ON DELETE SET NULL,  -- stock source
  external_ref           VARCHAR(120),                         -- merchant's own SKU/code for this offer
  proposed_by            UUID         REFERENCES users(id),    -- who proposed the offer / canonical product
  reviewed_by            UUID         REFERENCES users(id),    -- platform admin decision
  reviewed_at            TIMESTAMPTZ,
  rejection_reason       TEXT,
  activated_at           TIMESTAMPTZ,
  metadata               JSONB        NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- A buyer searches/browses canonical products then sees who offers them; the two
-- hot access paths are "offers for a product" and "a store's own offers".
CREATE INDEX IF NOT EXISTS idx_offer_product   ON merchant_offers(product_id);
CREATE INDEX IF NOT EXISTS idx_offer_store     ON merchant_offers(store_id);
CREATE INDEX IF NOT EXISTS idx_offer_status    ON merchant_offers(status);
CREATE INDEX IF NOT EXISTS idx_offer_variant   ON merchant_offers(variant_id)   WHERE variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offer_pricelist ON merchant_offers(price_list_id) WHERE price_list_id IS NOT NULL;

-- One offer per (store, variant) …
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_store_variant
  ON merchant_offers(store_id, variant_id)
  WHERE variant_id IS NOT NULL;
-- … and exactly one product-level offer per (store, product) when variant is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_store_product
  ON merchant_offers(store_id, product_id)
  WHERE variant_id IS NULL;

-- NOTE: no INSERT INTO _migration_log here — the migration runner owns that row
-- (adding it would collide on the PRIMARY KEY / break direct-SQL integration runs).
