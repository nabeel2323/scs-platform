-- 0040_shipments.sql
-- M7.1: Order fulfillment shipments and shipment events.
-- One shipment per merchant sub-order (not per master order).
-- Shipment events are append-only audit trail of fulfillment transitions.

-- ── Shipments ────────────────────────────────────────────────────────────────
-- One fulfillment shipment per merchant sub-order.

CREATE TABLE IF NOT EXISTS shipments (
  id                  UUID PRIMARY KEY,
  order_id            UUID NOT NULL REFERENCES orders(id),
  store_id            UUID NOT NULL REFERENCES stores(id),
  status              VARCHAR(24) NOT NULL DEFAULT 'PREPARING',
  assigned_driver_id  UUID REFERENCES users(id),
  assigned_at         TIMESTAMPTZ,
  picked_up_at        TIMESTAMPTZ,
  out_for_delivery_at TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One shipment per sub-order (unique 1:1 relationship)
  CONSTRAINT uq_shipments_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_shipments_store ON shipments(store_id);
CREATE INDEX IF NOT EXISTS idx_shipments_driver ON shipments(assigned_driver_id)
  WHERE assigned_driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status)
  WHERE status NOT IN ('DELIVERED', 'COMPLETED');

-- ── Shipment Events ──────────────────────────────────────────────────────────
-- Append-only audit trail of every fulfillment transition.

CREATE TABLE IF NOT EXISTS shipment_events (
  id              UUID PRIMARY KEY,
  shipment_id     UUID NOT NULL REFERENCES shipments(id),
  event_type      VARCHAR(24) NOT NULL,
  actor_user_id   UUID REFERENCES users(id),
  actor_type      VARCHAR(16) NOT NULL DEFAULT 'MERCHANT',
  location_text   VARCHAR(300),
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  sequence        SERIAL NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment ON shipment_events(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_events_type ON shipment_events(event_type);
