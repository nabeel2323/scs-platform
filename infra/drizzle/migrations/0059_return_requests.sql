-- P13: Returns, Refunds & Disputes Integration
-- Idempotent: safe on fresh DB, existing DB, and repeated runs.
-- No _migration_log writes — the runner owns bookkeeping.

-- ═══════════════════════════════════════════════════════════════════
-- 1. return_requests — buyer-initiated return lifecycle
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS return_requests (
  id                       UUID PRIMARY KEY,
  sub_order_id             UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_record_id        UUID NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  buyer_id                 UUID NOT NULL REFERENCES users(id),
  refund_id                UUID,  -- set after refund is created (FK added below)
  status                   VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  reason                   VARCHAR(40) NOT NULL,
  description              TEXT,
  evidence_urls            JSONB NOT NULL DEFAULT '[]',
  requested_refund_minor BIGINT NOT NULL,
  actual_refund_minor      BIGINT,
  shipping_tracking_number VARCHAR(200),
  shipping_notes           TEXT,
  merchant_notes           TEXT,
  inspection_condition     VARCHAR(20),
  inspection_notes         TEXT,
  inspected_by             UUID REFERENCES users(id),
  inspected_at             TIMESTAMPTZ,
  idempotency_key          VARCHAR(120),
  expires_at               TIMESTAMPTZ,
  metadata                 JSONB NOT NULL DEFAULT '{}',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 2. return_request_items — per-line return details
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS return_request_items (
  id                 UUID PRIMARY KEY,
  return_request_id  UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  order_item_id      UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity           INTEGER NOT NULL,
  condition          VARCHAR(20),
  inventory_item_id  UUID,  -- resolved during inspection (FK added below)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 3. return_request_events — append-only return lifecycle log
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS return_request_events (
  id                 UUID PRIMARY KEY,
  return_request_id  UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  event_type         VARCHAR(40) NOT NULL,
  from_status        VARCHAR(30),
  to_status          VARCHAR(30) NOT NULL,
  actor_id           UUID REFERENCES users(id),
  actor_type         VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
  notes              TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 4. Refunds table extensions — link to return/dispute origin
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS return_request_id UUID;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS dispute_id UUID;

-- Deferred FK for refunds → return_requests (table created above)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_refunds_return_request') THEN
    ALTER TABLE refunds ADD CONSTRAINT fk_refunds_return_request
      FOREIGN KEY (return_request_id) REFERENCES return_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 5. Disputes table extension — link to return request
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS return_request_id UUID;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_disputes_return_request') THEN
    ALTER TABLE disputes ADD CONSTRAINT fk_disputes_return_request
      FOREIGN KEY (return_request_id) REFERENCES return_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Deferred FK for refunds → disputes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_refunds_dispute') THEN
    ALTER TABLE refunds ADD CONSTRAINT fk_refunds_dispute
      FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Deferred FK for return_request_items → inventory_items
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_return_items_inventory') THEN
    ALTER TABLE return_request_items ADD CONSTRAINT fk_return_items_inventory
      FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Deferred FK for return_requests → refunds
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_return_requests_refund') THEN
    ALTER TABLE return_requests ADD CONSTRAINT fk_return_requests_refund
      FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 6. CHECK constraints
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_return_requests_status') THEN
    ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_status
      CHECK (status IN (
        'REQUESTED', 'MERCHANT_APPROVED', 'BUYER_SHIPPED', 'RECEIVED',
        'INSPECTED', 'REFUND_PENDING', 'REFUND_FAILED', 'REFUNDED',
        'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_return_requests_condition') THEN
    ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_condition
      CHECK (inspection_condition IS NULL OR inspection_condition IN (
        'GOOD', 'DAMAGED', 'DEFECTIVE', 'UNSALEABLE'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_return_items_condition') THEN
    ALTER TABLE return_request_items ADD CONSTRAINT chk_return_items_condition
      CHECK (condition IS NULL OR condition IN (
        'GOOD', 'DAMAGED', 'DEFECTIVE', 'UNSALEABLE'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_return_items_quantity') THEN
    ALTER TABLE return_request_items ADD CONSTRAINT chk_return_items_quantity
      CHECK (quantity > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_return_requests_refund_positive') THEN
    ALTER TABLE return_requests ADD CONSTRAINT chk_return_requests_refund_positive
      CHECK (requested_refund_minor > 0);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 7. Indexes — return_requests
-- ═══════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_return_requests_idempotency
  ON return_requests(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- One active return per sub-order (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_return_requests_active_per_order
  ON return_requests(sub_order_id)
  WHERE status NOT IN (
    'REFUNDED', 'MERCHANT_REJECTED', 'CANCELLED', 'EXPIRED', 'REJECTED_AFTER_INSPECTION'
  );

CREATE INDEX IF NOT EXISTS idx_return_requests_buyer
  ON return_requests(buyer_id);

CREATE INDEX IF NOT EXISTS idx_return_requests_sub_order
  ON return_requests(sub_order_id);

CREATE INDEX IF NOT EXISTS idx_return_requests_status
  ON return_requests(status);

CREATE INDEX IF NOT EXISTS idx_return_requests_payment
  ON return_requests(payment_record_id);

-- ═══════════════════════════════════════════════════════════════════
-- 8. Indexes — return_request_items
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_return_request_items_request
  ON return_request_items(return_request_id);

CREATE INDEX IF NOT EXISTS idx_return_request_items_order_item
  ON return_request_items(order_item_id);

-- ═══════════════════════════════════════════════════════════════════
-- 9. Indexes — return_request_events
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_return_request_events_request
  ON return_request_events(return_request_id);

CREATE INDEX IF NOT EXISTS idx_return_request_events_type
  ON return_request_events(event_type);

-- ═══════════════════════════════════════════════════════════════════
-- 10. Indexes — refunds extensions
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_refunds_return_request
  ON refunds(return_request_id) WHERE return_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_dispute
  ON refunds(dispute_id) WHERE dispute_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 11. Settlement status extension — add ADJUSTMENT
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_status') THEN
    ALTER TABLE settlement_records DROP CONSTRAINT chk_settlement_status;
  END IF;
  ALTER TABLE settlement_records ADD CONSTRAINT chk_settlement_status
    CHECK (status IN ('PENDING', 'CALCULATED', 'DUE', 'PAID', 'ADJUSTMENT'));
END $$;
