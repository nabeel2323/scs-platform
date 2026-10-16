-- 0006_pricing.sql — Price lists and tiered pricing
-- Module boundary: modules/pricing/*

-- ── Price Lists ───────────────────────────────────────────────────────────────
-- A price list groups pricing rules for a channel/audience.
-- channel: B2B, B2C
-- audience: PUBLIC (anyone), SEGMENT (buyer group), CONTRACT (negotiated)
-- A store can have multiple price lists (e.g. B2B-public, B2B-vip-contract).

CREATE TABLE price_lists (
  id              UUID PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  currency        CHAR(3) NOT NULL DEFAULT 'SAR',         -- ISO 4217
  channel         VARCHAR(8) NOT NULL DEFAULT 'B2B',      -- B2B, B2C
  audience        VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',   -- PUBLIC, SEGMENT, CONTRACT
  segment_id      UUID,                                    -- if audience=SEGMENT, references buyer segment
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  priority        INT NOT NULL DEFAULT 0,                  -- higher = checked first for resolution
  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_price_lists_store ON price_lists(store_id);
CREATE INDEX idx_price_lists_channel ON price_lists(channel) WHERE is_active = TRUE;
CREATE INDEX idx_price_lists_audience ON price_lists(audience) WHERE is_active = TRUE;
CREATE INDEX idx_price_lists_validity ON price_lists(valid_from, valid_until)
  WHERE valid_from IS NOT NULL OR valid_until IS NOT NULL;

-- ── Price Tiers ───────────────────────────────────────────────────────────────
-- Quantity-based pricing tiers within a price list for a specific variant.
-- unit_price_minor: price in smallest currency unit (halalas for SAR).
-- Example: min_qty=1, max_qty=9, unit_price_minor=1500 → 15.00 SAR for 1–9 units
--          min_qty=10, max_qty=NULL, unit_price_minor=1200 → 12.00 SAR for 10+ units

CREATE TABLE price_tiers (
  id              UUID PRIMARY KEY,
  price_list_id   UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  min_qty         INT NOT NULL DEFAULT 1,
  max_qty         INT,                                     -- NULL = unlimited
  unit_price_minor BIGINT NOT NULL,                        -- price in halalas (1/100 SAR)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (price_list_id, variant_id, min_qty)
);

CREATE INDEX idx_price_tiers_list ON price_tiers(price_list_id);
CREATE INDEX idx_price_tiers_variant ON price_tiers(variant_id);
CREATE INDEX idx_price_tiers_lookup ON price_tiers(variant_id, price_list_id, min_qty);
