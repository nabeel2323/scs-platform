-- 0008_promotions.sql — Promotions and redemptions
-- Module boundary: modules/promotions/*

-- ── Promotions ────────────────────────────────────────────────────────────────
-- Types supported in Phase 1: PERCENT, FIXED, QTY_DISCOUNT, TIME_LIMITED
-- scope: STORE (applies to entire store), CATEGORY, PRODUCT, VARIANT
-- applied_at: CHECKOUT (most common), CART_PREVIEW

CREATE TABLE promotions (
  id              UUID PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code            VARCHAR(40),                               -- promo code (NULL = automatic)
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  promo_type      VARCHAR(20) NOT NULL,                      -- PERCENT, FIXED, QTY_DISCOUNT, TIME_LIMITED
  scope           VARCHAR(16) NOT NULL DEFAULT 'STORE',      -- STORE, CATEGORY, PRODUCT, VARIANT
  scope_id        UUID,                                      -- FK to category/product/variant depending on scope
  discount_value  BIGINT NOT NULL,                           -- percentage (0-100) or fixed amount in minor units
  min_order_minor BIGINT DEFAULT 0,                          -- minimum order value in minor units
  max_discount_minor BIGINT,                                 -- cap on discount amount (minor units)
  max_redemptions INT,                                       -- total usage cap
  redemption_count INT NOT NULL DEFAULT 0,                   -- current usage count
  per_user_limit  INT DEFAULT 1,                             -- max redemptions per user
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, code)
);

CREATE INDEX idx_promotions_store ON promotions(store_id);
CREATE INDEX idx_promotions_code ON promotions(code) WHERE code IS NOT NULL;
CREATE INDEX idx_promotions_active ON promotions(is_active, starts_at, ends_at)
  WHERE is_active = TRUE;
CREATE INDEX idx_promotions_scope ON promotions(scope, scope_id) WHERE scope_id IS NOT NULL;

-- ── Promotion Redemptions ─────────────────────────────────────────────────────
-- Tracks each promotion usage for analytics and per-user limit enforcement.

CREATE TABLE promotion_redemptions (
  id              UUID PRIMARY KEY,
  promotion_id    UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  order_id        UUID,                                      -- set when order is placed
  code_used       VARCHAR(40),
  discount_minor  BIGINT NOT NULL,                           -- actual discount applied
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_redemptions_promotion ON promotion_redemptions(promotion_id);
CREATE INDEX idx_redemptions_user ON promotion_redemptions(user_id);
CREATE INDEX idx_redemptions_order ON promotion_redemptions(order_id) WHERE order_id IS NOT NULL;
