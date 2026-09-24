-- 0031_catalog_requests.sql
-- PHASE COS-12: Merchant catalog entity requests (categories, brands, attributes, options).
-- Merchants submit requests; admins approve (auto-create entity) or reject.

CREATE TABLE IF NOT EXISTS catalog_requests (
  id UUID PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id),
  requested_by UUID REFERENCES users(id),
  type VARCHAR(20) NOT NULL,          -- CATEGORY, BRAND, ATTRIBUTE, OPTION
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED
  reviewed_by UUID REFERENCES users(id),
  review_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_requests_store
  ON catalog_requests(store_id);

CREATE INDEX IF NOT EXISTS idx_catalog_requests_status
  ON catalog_requests(status);
