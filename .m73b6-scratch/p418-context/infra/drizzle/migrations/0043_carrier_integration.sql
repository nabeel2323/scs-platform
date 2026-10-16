-- 0043_carrier_integration.sql
-- M7.2.3-A: Carrier integration foundation.
--
-- New tables:
--   carrier_credentials     — encrypted per-org carrier API credentials
--   carrier_configurations  — org/store-level carrier configuration
--
-- Extended columns on shipments:
--   carrier_shipment_id, idempotency_key, carrier_status_raw,
--   carrier_status_mapped, last_carrier_sync_at, carrier_create_status,
--   carrier_create_error, carrier_create_retries, carrier_create_attempted_at,
--   cancelled_at, cancellation_reason
--
-- Extended columns on shipping_methods:
--   shipping_provider_key, carrier_service_code
--
-- Extended columns on shipment_events:
--   external_event_id, carrier_event_code
--
-- Extended columns on carrier_webhook_events:
--   signature_valid, raw_body, processed_at, processing_error
--
-- Extended columns on outbox_events:
--   next_attempt_at
--
-- Shipment labels:
--   Drop UNIQUE constraint on shipment_id (allow multiple labels)
--   Add is_void, provider_key columns
--
-- Safe on fresh DB and existing M7.2.2 DB.  Non-destructive.

-- ── Carrier Credentials ─────────────────────────────────────────────────────
-- Encrypted per-org carrier API credentials.  Only SUPER_ADMIN/ADMIN can
-- manage these.  Plaintext credentials are NEVER returned through API responses.

CREATE TABLE IF NOT EXISTS carrier_credentials (
  id                       UUID PRIMARY KEY,
  org_id                   UUID NOT NULL REFERENCES organizations(id),
  provider_key             VARCHAR(40) NOT NULL,
  environment              VARCHAR(16) NOT NULL DEFAULT 'sandbox',
  label                    VARCHAR(120) NOT NULL,
  credentials_encrypted    TEXT NOT NULL,              -- hex-encoded AES-256-GCM ciphertext
  endpoint_url             VARCHAR(500),
  webhook_secret_encrypted TEXT,                       -- hex-encoded AES-256-GCM ciphertext
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_by               UUID REFERENCES users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_credentials_org
  ON carrier_credentials(org_id);

-- Only one active credential set per org/provider/environment.
-- Partial unique index: only counts rows where is_active = TRUE.
CREATE UNIQUE INDEX IF NOT EXISTS uq_carrier_creds_org_provider_env
  ON carrier_credentials(org_id, provider_key, environment)
  WHERE is_active = TRUE;

-- ── Carrier Configurations ──────────────────────────────────────────────────
-- Org-wide or store-specific carrier configuration.
-- store_id = NULL → org-wide default.
-- store_id = X    → store-specific override.

CREATE TABLE IF NOT EXISTS carrier_configurations (
  id                    UUID PRIMARY KEY,
  org_id                UUID NOT NULL REFERENCES organizations(id),
  credential_id         UUID NOT NULL REFERENCES carrier_credentials(id),
  store_id              UUID REFERENCES stores(id),
  provider_key          VARCHAR(40) NOT NULL,
  default_service_code  VARCHAR(40),
  default_package_type  VARCHAR(40),
  pickup_address        JSONB,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carrier_config_org
  ON carrier_configurations(org_id);
CREATE INDEX IF NOT EXISTS idx_carrier_config_store
  ON carrier_configurations(store_id)
  WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carrier_config_credential
  ON carrier_configurations(credential_id);

-- ── Shipments: carrier state columns ────────────────────────────────────────

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_shipment_id VARCHAR(200);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_status_raw VARCHAR(80);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_status_mapped VARCHAR(24);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS last_carrier_sync_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_status VARCHAR(16);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_error TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_retries INTEGER NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_create_attempted_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(300);

-- Indexes for carrier state queries
CREATE INDEX IF NOT EXISTS idx_shipments_carrier_sid
  ON shipments(carrier_shipment_id)
  WHERE carrier_shipment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shipments_create_status
  ON shipments(carrier_create_status)
  WHERE carrier_create_status IN ('PENDING', 'IN_PROGRESS', 'FAILED');

CREATE INDEX IF NOT EXISTS idx_shipments_idempotency
  ON shipments(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── Shipping Methods: provider binding ──────────────────────────────────────

ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS shipping_provider_key VARCHAR(40);
ALTER TABLE shipping_methods ADD COLUMN IF NOT EXISTS carrier_service_code VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_shipping_methods_provider
  ON shipping_methods(shipping_provider_key)
  WHERE shipping_provider_key IS NOT NULL;

-- ── Shipment Events: carrier event tracking ─────────────────────────────────

ALTER TABLE shipment_events ADD COLUMN IF NOT EXISTS external_event_id VARCHAR(200);
ALTER TABLE shipment_events ADD COLUMN IF NOT EXISTS carrier_event_code VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_shipment_events_ext
  ON shipment_events(external_event_id)
  WHERE external_event_id IS NOT NULL;

-- ── Carrier Webhook Events: security metadata ───────────────────────────────

ALTER TABLE carrier_webhook_events ADD COLUMN IF NOT EXISTS signature_valid BOOLEAN;
ALTER TABLE carrier_webhook_events ADD COLUMN IF NOT EXISTS raw_body TEXT;
ALTER TABLE carrier_webhook_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;
ALTER TABLE carrier_webhook_events ADD COLUMN IF NOT EXISTS processing_error TEXT;

-- ── Outbox Events: delayed retry support ────────────────────────────────────

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outbox_next_attempt
  ON outbox_events(next_attempt_at)
  WHERE status = 'PENDING';

-- ── Shipment Labels: multi-label support ────────────────────────────────────
-- Drop the 1:1 uniqueness constraint on shipment_id.
-- Add is_void and provider_key columns.

DO $$
BEGIN
  -- Drop the unique constraint if it exists (added by 0041)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_shipment_labels_shipment'
  ) THEN
    ALTER TABLE shipment_labels DROP CONSTRAINT uq_shipment_labels_shipment;
  END IF;
END $$;

-- Also drop the unique index if it was created as an index rather than constraint
DROP INDEX IF EXISTS uq_shipment_labels_shipment;

ALTER TABLE shipment_labels ADD COLUMN IF NOT EXISTS is_void BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shipment_labels ADD COLUMN IF NOT EXISTS provider_key VARCHAR(40);
ALTER TABLE shipment_labels ADD COLUMN IF NOT EXISTS label_type VARCHAR(24) NOT NULL DEFAULT 'SHIPPING';

CREATE INDEX IF NOT EXISTS idx_shipment_labels_shipment
  ON shipment_labels(shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipment_labels_active
  ON shipment_labels(shipment_id)
  WHERE is_void = FALSE;
