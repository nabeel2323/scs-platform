-- 0005_inventory.sql — Inventory tracking: items per warehouse, stock movement ledger
-- Module boundary: modules/inventory/*

-- ── Inventory Items ───────────────────────────────────────────────────────────
-- One row per (variant, warehouse) combination.
-- qty_on_hand: physical stock available
-- qty_reserved: reserved by accepted orders (not yet shipped)
-- reorder_point: threshold for low-stock alerts

CREATE TABLE inventory_items (
  id              UUID PRIMARY KEY,
  variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  qty_on_hand     INT NOT NULL DEFAULT 0,
  qty_reserved    INT NOT NULL DEFAULT 0,
  qty_available   INT GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,
  reorder_point   INT NOT NULL DEFAULT 0,
  max_stock       INT,                                    -- optional cap
  low_stock_alert BOOLEAN NOT NULL DEFAULT TRUE,
  last_counted_at TIMESTAMPTZ,                            -- last physical count
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (variant_id, warehouse_id)
);

CREATE INDEX idx_inventory_variant ON inventory_items(variant_id);
CREATE INDEX idx_inventory_warehouse ON inventory_items(warehouse_id);
CREATE INDEX idx_inventory_low_stock ON inventory_items(qty_available)
  WHERE qty_available <= reorder_point AND low_stock_alert = TRUE;

-- ── Stock Movements ───────────────────────────────────────────────────────────
-- Append-only ledger. Every stock change is a movement.
-- Types:
--   ADJUST   — manual stock adjustment (count correction)
--   RESERVE  — stock reserved when order accepted by merchant
--   RELEASE  — reservation released (order cancelled/rejected)
--   SALE     — stock deducted on shipment/delivery
--   CANCEL   — order cancelled after shipment started (return)
--   IMPORT   — initial stock load (bulk import)
--   RETURN   — customer return restocked

CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type   VARCHAR(16) NOT NULL,                   -- ADJUST, RESERVE, RELEASE, SALE, CANCEL, IMPORT, RETURN
  quantity        INT NOT NULL,                            -- positive = in, negative = out
  reference_type  VARCHAR(40),                             -- ORDER, IMPORT_JOB, ADJUSTMENT, etc.
  reference_id    UUID,                                    -- FK to the referencing entity
  reason          TEXT,                                    -- human-readable reason
  performed_by    UUID REFERENCES users(id),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movements_item ON stock_movements(inventory_item_id);
CREATE INDEX idx_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_movements_reference ON stock_movements(reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX idx_movements_created ON stock_movements(created_at DESC);
