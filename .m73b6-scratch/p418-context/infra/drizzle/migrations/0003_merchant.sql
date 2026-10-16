-- 0003_merchant.sql — Merchant onboarding, stores, warehouses, documents, verification
-- Module boundary: modules/merchant/*

-- ── Stores ────────────────────────────────────────────────────────────────────
-- A store is a merchant's storefront on the platform.
-- Linked to an organization (the merchant entity).
-- Verification status gates go-live.

CREATE TABLE stores (
  id              UUID PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug            VARCHAR(120) NOT NULL UNIQUE,
  display_name    VARCHAR(200) NOT NULL,
  description     TEXT,
  logo_url        TEXT,
  cover_url       TEXT,
  currency        CHAR(3) NOT NULL DEFAULT 'SAR',        -- ISO 4217
  timezone        VARCHAR(60) NOT NULL DEFAULT 'Asia/Riyadh',
  locale          VARCHAR(10) NOT NULL DEFAULT 'ar',
  status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',  -- DRAFT, ACTIVE, SUSPENDED, CLOSED
  verification_status VARCHAR(16) NOT NULL DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED, REVIEW
  address         JSONB NOT NULL DEFAULT '{}',           -- {street, city, province, postal, lat, lng}
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stores_org_id ON stores(org_id);
CREATE INDEX idx_stores_status ON stores(status) WHERE status IN ('ACTIVE', 'SUSPENDED');
CREATE INDEX idx_stores_verification ON stores(verification_status) WHERE verification_status = 'PENDING';

-- ── Warehouses ────────────────────────────────────────────────────────────────
-- Physical locations where inventory is stored.
-- A store can have multiple warehouses.

CREATE TABLE warehouses (
  id              UUID PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name            VARCHAR(160) NOT NULL,
  address         JSONB NOT NULL DEFAULT '{}',           -- {street, city, province, postal, lat, lng}
  manager_name    VARCHAR(160),
  manager_phone   VARCHAR(20),
  status          VARCHAR(12) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_warehouses_store_id ON warehouses(store_id);

-- ── Business Documents ───────────────────────────────────────────────────────
-- Uploaded documents for merchant verification (CR, tax cert, etc.)
-- Stored as presigned S3/MinIO URLs.

CREATE TABLE business_documents (
  id              UUID PRIMARY KEY,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,  -- nullable: org-level docs
  doc_type        VARCHAR(40) NOT NULL,                  -- COMMERCIAL_REG, TAX_CERT, BANK_LETTER, NATIONAL_ID, OTHER
  file_name       VARCHAR(260) NOT NULL,
  mime_type       VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  file_size       BIGINT NOT NULL DEFAULT 0,             -- bytes
  storage_key     TEXT NOT NULL,                         -- S3/MinIO object key
  storage_url     TEXT,                                  -- presigned download URL (short-lived)
  verification_status VARCHAR(16) NOT NULL DEFAULT 'PENDING', -- PENDING, VERIFIED, REJECTED
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  expires_at      TIMESTAMPTZ,                           -- document expiry (e.g. CR renewal)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_docs_org_id ON business_documents(org_id);
CREATE INDEX idx_business_docs_store_id ON business_documents(store_id);
CREATE INDEX idx_business_docs_pending ON business_documents(verification_status) WHERE verification_status = 'PENDING';

-- ── Verification Requests ────────────────────────────────────────────────────
-- Tracks the merchant verification workflow.
-- One request per store verification attempt.

CREATE TABLE verification_requests (
  id              UUID PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status          VARCHAR(16) NOT NULL DEFAULT 'SUBMITTED', -- SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, REVISION
  submitted_by    UUID NOT NULL REFERENCES users(id),
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  decision_notes  TEXT,                                  -- reviewer notes
  rejection_reasons JSONB DEFAULT '[]',                  -- structured rejection reasons array
  auto_verified   BOOLEAN NOT NULL DEFAULT FALSE,        -- true if auto-approved by rules
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_verification_requests_store ON verification_requests(store_id);
CREATE INDEX idx_verification_requests_status ON verification_requests(status) WHERE status IN ('SUBMITTED', 'UNDER_REVIEW');
CREATE INDEX idx_verification_requests_org ON verification_requests(org_id);
