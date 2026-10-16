-- 0010_orders.sql — Master orders, sub-orders, items, financial breakdown, status history
-- Module boundary: modules/orders/*
--
-- Order FSM (16 statuses):
--   DRAFT → SUBMITTED → PENDING_CONFIRMATION → CONFIRMED → PREPARING → READY →
--   OUT_FOR_DELIVERY → DELIVERED → COMPLETED
--   Any pre-DELIVERED → CANCELLED
--   SUBMITTED → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED (merchant action)
--   CONFIRMED → RE_PRICE_GUARD (if price changed post-checkout)

-- ── Master Orders ─────────────────────────────────────────────────────────────
-- Buyer's purchase intent. One master order may contain multiple sub-orders (one per supplier).
-- Status is DERIVED from sub-order statuses (not directly set).

CREATE TABLE master_orders (
  id              UUID PRIMARY KEY,
  buyer_id        UUID NOT NULL REFERENCES users(id),
  status          VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
  delivery_address JSONB NOT NULL DEFAULT '{}',
  notes           TEXT,
  idempotency_key VARCHAR(64) UNIQUE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_master_orders_buyer ON master_orders(buyer_id);
CREATE INDEX idx_master_orders_idempotency ON master_orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── Sub-Orders (one per supplier) ─────────────────────────────────────────────
-- Each sub-order belongs to one store (supplier).
-- fulfillment_method: PICKUP, MERCHANT_DELIVERY, PLATFORM_DELIVERY

CREATE TABLE orders (
  id                UUID PRIMARY KEY,
  master_order_id   UUID NOT NULL REFERENCES master_orders(id),
  store_id          UUID NOT NULL REFERENCES stores(id),
  buyer_id          UUID NOT NULL REFERENCES users(id),
  status            VARCHAR(24) NOT NULL DEFAULT 'SUBMITTED',
  fulfillment_method VARCHAR(24) NOT NULL DEFAULT 'PLATFORM_DELIVERY',
  promo_code        VARCHAR(40),
  promotion_id      UUID REFERENCES promotions(id),
  subtotal_minor    BIGINT NOT NULL DEFAULT 0,
  discount_minor    BIGINT NOT NULL DEFAULT 0,
  delivery_fee_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor         BIGINT NOT NULL DEFAULT 0,
  total_minor       BIGINT NOT NULL DEFAULT 0,
  sla_confirmed_at  TIMESTAMPTZ,
  sla_at            TIMESTAMPTZ,
  rejection_reason  TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_master ON orders(master_order_id);
CREATE INDEX idx_orders_store ON orders(store_id);
CREATE INDEX idx_orders_buyer ON orders(buyer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_sla ON orders(sla_at) WHERE status NOT IN ('COMPLETED', 'CANCELLED');

-- ── Order Items ───────────────────────────────────────────────────────────────
-- Price/promotion are SNAPSHOT at checkout time (not FK to price_tiers).
-- qty_confirmed may differ from qty on partial acceptance.

CREATE TABLE order_items (
  id                UUID PRIMARY KEY,
  order_id          UUID NOT NULL REFERENCES orders(id),
  variant_id        UUID NOT NULL REFERENCES product_variants(id),
  sku               VARCHAR(100) NOT NULL,
  title             VARCHAR(500) NOT NULL,
  quantity          INT NOT NULL,
  qty_confirmed     INT,
  unit_price_minor  BIGINT NOT NULL,
  tier_min_qty      INT NOT NULL DEFAULT 1,
  promo_snapshot    JSONB DEFAULT '{}',
  line_total_minor  BIGINT NOT NULL,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);

-- ── Financial Breakdown ───────────────────────────────────────────────────────
-- Populated at checkout. Captures the full financial picture per sub-order.

CREATE TABLE order_financial_breakdown (
  id                UUID PRIMARY KEY,
  order_id          UUID NOT NULL REFERENCES orders(id),
  products_minor    BIGINT NOT NULL DEFAULT 0,
  discount_minor    BIGINT NOT NULL DEFAULT 0,
  delivery_fee_minor BIGINT NOT NULL DEFAULT 0,
  tax_minor         BIGINT NOT NULL DEFAULT 0,
  commission_minor  BIGINT NOT NULL DEFAULT 0,
  merchant_net_minor BIGINT NOT NULL DEFAULT 0,
  finalized_at      TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

-- ── Status History ────────────────────────────────────────────────────────────
-- Every transition, every actor. Append-only audit trail.

CREATE TABLE order_status_history (
  id              UUID PRIMARY KEY,
  order_id        UUID NOT NULL REFERENCES orders(id),
  from_status     VARCHAR(24),
  to_status       VARCHAR(24) NOT NULL,
  changed_by      UUID REFERENCES users(id),
  actor_type      VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
  reason          TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_history_order ON order_status_history(order_id);
CREATE INDEX idx_status_history_created ON order_status_history(created_at DESC);
