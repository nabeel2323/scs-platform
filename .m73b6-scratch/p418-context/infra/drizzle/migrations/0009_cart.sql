-- 0009_cart.sql — Shopping cart with multi-supplier support
-- Module boundary: modules/orders/* (cart is part of the orders bounded context)

-- ── Carts ─────────────────────────────────────────────────────────────────────
-- One active cart per user. Converted to order on checkout.
-- Status: ACTIVE → CONVERTED | ABANDONED

CREATE TABLE carts (
  id              UUID PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE, CONVERTED, ABANDONED
  promo_code      VARCHAR(40),                               -- applied promo code
  promotion_id    UUID REFERENCES promotions(id),            -- resolved promotion
  total_minor     BIGINT NOT NULL DEFAULT 0,                 -- cart total in minor units
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_carts_user ON carts(user_id);
CREATE INDEX idx_carts_active ON carts(user_id, status) WHERE status = 'ACTIVE';

-- ── Cart Items ────────────────────────────────────────────────────────────────
-- Grouped by store_id for multi-supplier cart (each supplier's items are separate).
-- price_minor is SNAPSHOT at time of add (not live from price list).

CREATE TABLE cart_items (
  id              UUID PRIMARY KEY,
  cart_id         UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  store_id        UUID NOT NULL REFERENCES stores(id),       -- supplier grouping
  variant_id      UUID NOT NULL REFERENCES product_variants(id),
  quantity        INT NOT NULL DEFAULT 1,
  price_minor     BIGINT NOT NULL,                           -- SNAPSHOT unit price (halalas)
  tier_min_qty    INT NOT NULL DEFAULT 1,                    -- tier that was applied
  promo_snapshot  JSONB DEFAULT '{}',                        -- promotion applied to this line
  line_total_minor BIGINT NOT NULL,                          -- quantity * price_minor - promo
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, variant_id)                               -- one line per variant per cart
);

CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_store ON cart_items(store_id);
CREATE INDEX idx_cart_items_variant ON cart_items(variant_id);
