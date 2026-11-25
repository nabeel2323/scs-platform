-- FIN-025: durable payment proof upload intents and bounded orphan recovery.
-- Forward-only. Source-only until isolated Phase 3 migration validation and
-- existing shared-database approval gates are satisfied.

CREATE TABLE IF NOT EXISTS payment_proof_upload_intents (
  id UUID PRIMARY KEY,
  payment_record_id UUID NOT NULL REFERENCES payment_records(id),
  storage_bucket VARCHAR(120) NOT NULL,
  storage_key VARCHAR(512) NOT NULL UNIQUE,
  content_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 10485760),
  status VARCHAR(24) NOT NULL DEFAULT 'UPLOADING'
    CHECK (status IN (
      'UPLOADING', 'UPLOADED', 'COMMITTED',
      'CLEANUP_PENDING', 'CLEANING', 'CLEANED', 'FAILED'
    )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_owner VARCHAR(160),
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  last_error_code VARCHAR(60),
  uploaded_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  cleaned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_payment_proof_upload_lease_pair
    CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_payment_proof_upload_intents_payment
  ON payment_proof_upload_intents(payment_record_id);

CREATE INDEX IF NOT EXISTS idx_payment_proof_upload_intents_recovery
  ON payment_proof_upload_intents(status, created_at, next_attempt_at, lease_expires_at)
  WHERE status IN ('UPLOADING', 'UPLOADED', 'CLEANUP_PENDING', 'CLEANING');

COMMENT ON TABLE payment_proof_upload_intents IS
  'Durable per-object upload ownership and recovery state; cleanup must verify payment_records.receipt_url before deleting an object.';


-- Recovery verifies that no payment row references the exact object key.
-- This partial index keeps those checks bounded as the payment table grows.
CREATE INDEX IF NOT EXISTS idx_payment_records_receipt_url_nonnull
  ON payment_records(receipt_url)
  WHERE receipt_url IS NOT NULL;
