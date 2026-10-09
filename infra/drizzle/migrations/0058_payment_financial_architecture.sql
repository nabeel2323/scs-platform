-- 0058_payment_financial_architecture.sql
-- P12: Payments & Financial Architecture
-- Idempotent: safe on fresh DB, existing DB, and repeated runs.
-- No _migration_log writes — the runner owns bookkeeping.

-- ═══════════════════════════════════════════════════════════════════
-- 1. payment_records — one per sub-order, tracks payment lifecycle
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_records (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider_key            VARCHAR(40) NOT NULL DEFAULT 'manual',
  provider_payment_id     VARCHAR(200),
  idempotency_key         VARCHAR(120),
  payment_method          VARCHAR(24) NOT NULL,  -- BANK_TRANSFER, CASH_ON_DELIVERY, VOUCHER, DIGITAL
  status                  VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  amount_minor            BIGINT NOT NULL,
  currency                CHAR(3) NOT NULL,
  confirmed_amount_minor  BIGINT,
  failure_code            VARCHAR(40),
  failure_reason          TEXT,
  receipt_url             TEXT,
  receipt_reference       VARCHAR(200),
  voucher_code            VARCHAR(100),
  verified_by             UUID REFERENCES users(id),
  verified_at             TIMESTAMPTZ,
  verification_notes      TEXT,
  expires_at              TIMESTAMPTZ,
  confirmed_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  last_reconciled_at      TIMESTAMPTZ,
  metadata                JSONB NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 2. payment_events — append-only immutable payment lifecycle log
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payment_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_record_id     UUID NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  event_type            VARCHAR(40) NOT NULL,
  provider_event_id     VARCHAR(200),
  from_status           VARCHAR(30),
  to_status             VARCHAR(30) NOT NULL,
  actor_id              UUID REFERENCES users(id),
  actor_type            VARCHAR(16) NOT NULL DEFAULT 'SYSTEM',
  amount_minor          BIGINT,
  notes                 TEXT,
  receipt_url           TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 3. refunds — full and partial refund tracking
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS refunds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_record_id     UUID NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  idempotency_key       VARCHAR(120),
  provider_refund_id    VARCHAR(200),
  amount_minor          BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL,
  status                VARCHAR(24) NOT NULL DEFAULT 'REQUESTED',
  reason                VARCHAR(40) NOT NULL,
  notes                 TEXT,
  requested_by          UUID REFERENCES users(id),
  approved_by           UUID REFERENCES users(id),
  provider_refund_status VARCHAR(40),
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 4. settlement_records — merchant settlement tracking
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS settlement_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_record_id     UUID NOT NULL REFERENCES payment_records(id) ON DELETE CASCADE,
  merchant_store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  gross_minor           BIGINT NOT NULL,
  refund_minor          BIGINT NOT NULL DEFAULT 0,
  commission_minor      BIGINT NOT NULL DEFAULT 0,
  fee_minor             BIGINT NOT NULL DEFAULT 0,
  net_minor             BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL,
  status                VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  calculated_at         TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  payment_reference     TEXT,
  notes                 TEXT,
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════
-- 5. Orders table extensions — payment_method + payment_status
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(24);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30);

-- ═══════════════════════════════════════════════════════════════════
-- 6. Indexes — payment_records
-- ═══════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_records_idempotency
  ON payment_records(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_records_order
  ON payment_records(order_id);

CREATE INDEX IF NOT EXISTS idx_payment_records_status
  ON payment_records(status);

CREATE INDEX IF NOT EXISTS idx_payment_records_method
  ON payment_records(payment_method);

CREATE INDEX IF NOT EXISTS idx_payment_records_expires
  ON payment_records(expires_at) WHERE status IN ('AWAITING_PAYMENT', 'AWAITING_VERIFICATION');

-- ═══════════════════════════════════════════════════════════════════
-- 7. Indexes — payment_events
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_payment_events_record
  ON payment_events(payment_record_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_events_provider
  ON payment_events(provider_event_id) WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_events_type
  ON payment_events(event_type);

-- ═══════════════════════════════════════════════════════════════════
-- 8. Indexes — refunds
-- ═══════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_refunds_idempotency
  ON refunds(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_refunds_payment
  ON refunds(payment_record_id);

CREATE INDEX IF NOT EXISTS idx_refunds_order
  ON refunds(order_id);

CREATE INDEX IF NOT EXISTS idx_refunds_status
  ON refunds(status);

-- ═══════════════════════════════════════════════════════════════════
-- 9. Indexes — settlement_records
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_settlement_order
  ON settlement_records(sub_order_id);

CREATE INDEX IF NOT EXISTS idx_settlement_store
  ON settlement_records(merchant_store_id);

CREATE INDEX IF NOT EXISTS idx_settlement_status
  ON settlement_records(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settlement_order_payment
  ON settlement_records(sub_order_id, payment_record_id)
  WHERE status IN ('PENDING', 'CALCULATED', 'DUE');

-- ═══════════════════════════════════════════════════════════════════
-- 10. CHECK constraints
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_records_status') THEN
    ALTER TABLE payment_records ADD CONSTRAINT chk_payment_records_status
      CHECK (status IN (
        'CREATED','AWAITING_PAYMENT','AWAITING_VERIFICATION','CONFIRMED',
        'REJECTED','EXPIRED','CANCELLED','PROCESSING','AUTHORIZED',
        'CAPTURED','FAILED','PARTIALLY_REFUNDED','REFUNDED','REFUND_FAILED'
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_payment_records_method') THEN
    ALTER TABLE payment_records ADD CONSTRAINT chk_payment_records_method
      CHECK (payment_method IN ('BANK_TRANSFER','CASH_ON_DELIVERY','VOUCHER','DIGITAL'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_refunds_amount_positive') THEN
    ALTER TABLE refunds ADD CONSTRAINT chk_refunds_amount_positive
      CHECK (amount_minor > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_refunds_status') THEN
    ALTER TABLE refunds ADD CONSTRAINT chk_refunds_status
      CHECK (status IN ('REQUESTED','PROCESSING','SUCCEEDED','FAILED','APPROVED','REJECTED'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_settlement_status') THEN
    ALTER TABLE settlement_records ADD CONSTRAINT chk_settlement_status
      CHECK (status IN ('PENDING','CALCULATED','DUE','PAID'));
  END IF;
END $$;
