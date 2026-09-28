-- 0041_shipping.sql
-- M7.2: Shipping & Delivery foundation.
--
-- New tables:
--   shipping_methods          — per-store shipping options (STANDARD/EXPRESS/SAME_DAY)
--   delivery_zones            — geographic zones for shipping availability
--   delivery_zone_methods     — which shipping methods are available in each zone
--   shipment_labels           — shipping label storage references
--   delivery_proofs           — proof-of-delivery (photo + signature)
--   driver_profiles           — driver eligibility metadata
--   driver_store_assignments  — relational driver↔store assignment
--   carrier_webhook_events    — inbound carrier webhook dedup log
--
-- Extended columns on shipments:
--   delivery_address, carrier_tracking_id, shipping_method_id, shipping_provider_key

-- ── Shipments: extended columns ─────────────────────────────────────────────

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_address JSONB;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS carrier_tracking_id VARCHAR(120);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS shipping_method_id UUID;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS shipping_provider_key VARCHAR(40);

CREATE INDEX IF NOT EXISTS idx_shipments_provider ON shipments(shipping_provider_key)
  WHERE shipping_provider_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(carrier_tracking_id)
  WHERE carrier_tracking_id IS NOT NULL;

-- ── Shipping Methods ────────────────────────────────────────────────────────
-- Per-store shipping options.  Linked to a fulfillment_method so that each
-- method is a concrete delivery tier (STANDARD, EXPRESS, SAME_DAY).

CREATE TABLE IF NOT EXISTS shipping_methods (
  id                  UUID PRIMARY KEY,
  store_id            UUID NOT NULL REFERENCES stores(id),
  name                VARCHAR(80) NOT NULL,
  fulfillment_method  VARCHAR(24) NOT NULL,
  type                VARCHAR(24) NOT NULL DEFAULT 'STANDARD',
  estimated_days_min  INTEGER,
  estimated_days_max  INTEGER,
  base_fee_minor      BIGINT NOT NULL DEFAULT 0,
  currency            CHAR(3) NOT NULL DEFAULT 'SAR',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipping_methods_store ON shipping_methods(store_id);
CREATE INDEX IF NOT EXISTS idx_shipping_methods_active ON shipping_methods(store_id)
  WHERE is_active = TRUE;

-- ── Delivery Zones ──────────────────────────────────────────────────────────
-- Geographic zones that control which shipping methods are available.

CREATE TABLE IF NOT EXISTS delivery_zones (
  id          UUID PRIMARY KEY,
  store_id    UUID NOT NULL REFERENCES stores(id),
  name        VARCHAR(120) NOT NULL,
  type        VARCHAR(24) NOT NULL DEFAULT 'CITY',
  city        VARCHAR(120),
  region      VARCHAR(120),
  postal_code VARCHAR(20),
  country     CHAR(2) NOT NULL DEFAULT 'SA',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_store ON delivery_zones(store_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_city ON delivery_zones(city)
  WHERE city IS NOT NULL;

-- ── Delivery Zone ↔ Shipping Method mapping ─────────────────────────────────

CREATE TABLE IF NOT EXISTS delivery_zone_methods (
  zone_id            UUID NOT NULL REFERENCES delivery_zones(id),
  shipping_method_id UUID NOT NULL REFERENCES shipping_methods(id),
  override_fee_minor BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (zone_id, shipping_method_id)
);

-- ── Shipment Labels ─────────────────────────────────────────────────────────
-- 1:1 with shipment.  Stores S3 key + metadata for the label PDF/image.

CREATE TABLE IF NOT EXISTS shipment_labels (
  id              UUID PRIMARY KEY,
  shipment_id     UUID NOT NULL REFERENCES shipments(id),
  label_number    VARCHAR(120),
  storage_key     VARCHAR(500) NOT NULL,
  mime_type       VARCHAR(80) NOT NULL DEFAULT 'application/pdf',
  size_bytes      INTEGER,
  tracking_url    VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One label per shipment
  CONSTRAINT uq_shipment_labels_shipment UNIQUE (shipment_id)
);

-- ── Delivery Proofs ─────────────────────────────────────────────────────────
-- 1:1 with shipment.  Photo + optional signature for proof of delivery.

CREATE TABLE IF NOT EXISTS delivery_proofs (
  id              UUID PRIMARY KEY,
  shipment_id     UUID NOT NULL REFERENCES shipments(id),
  photo_url       VARCHAR(500),
  signature_url   VARCHAR(500),
  receiver_name   VARCHAR(120),
  notes           TEXT,
  delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One proof per shipment
  CONSTRAINT uq_delivery_proofs_shipment UNIQUE (shipment_id)
);

-- ── Driver Profiles ─────────────────────────────────────────────────────────
-- Driver eligibility metadata.  Extends the existing users/roles system.

CREATE TABLE IF NOT EXISTS driver_profiles (
  id                  UUID PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES users(id),
  org_id              UUID NOT NULL REFERENCES organizations(id),
  vehicle_type        VARCHAR(40),
  license_number      VARCHAR(80),
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  max_delivery_radius_km INTEGER,
  rating              NUMERIC(3,2) DEFAULT 0.00,
  total_deliveries    INTEGER NOT NULL DEFAULT 0,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_driver_profiles_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_org ON driver_profiles(org_id);

-- ── Driver ↔ Store Assignments (relational) ─────────────────────────────────
-- Explicit driver-to-store mapping.  If a driver has zero rows they are
-- eligible for all stores in their org ("unrestricted mode").

CREATE TABLE IF NOT EXISTS driver_store_assignments (
  driver_profile_id UUID NOT NULL REFERENCES driver_profiles(id),
  store_id          UUID NOT NULL REFERENCES stores(id),
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (driver_profile_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_store_assignments_store
  ON driver_store_assignments(store_id);

-- ── Carrier Webhook Events (inbound dedup) ──────────────────────────────────
-- Stores every inbound carrier webhook payload.  The UNIQUE constraint on
-- (provider_key, external_delivery_id) prevents duplicate processing.

CREATE TABLE IF NOT EXISTS carrier_webhook_events (
  id                    UUID PRIMARY KEY,
  provider_key          VARCHAR(40) NOT NULL,
  event_type            VARCHAR(80) NOT NULL,
  external_delivery_id  VARCHAR(200) NOT NULL,
  shipment_id           UUID REFERENCES shipments(id),
  payload               JSONB NOT NULL DEFAULT '{}',
  processed             BOOLEAN NOT NULL DEFAULT FALSE,
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Dedup: one processed event per carrier+external ID
  CONSTRAINT uq_carrier_webhook_dedup UNIQUE (provider_key, external_delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_carrier_webhook_events_shipment
  ON carrier_webhook_events(shipment_id)
  WHERE shipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_carrier_webhook_events_unprocessed
  ON carrier_webhook_events(received_at)
  WHERE processed = FALSE;
