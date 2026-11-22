-- G-002: bind inbound carrier webhooks to the credential that authenticated them.
-- Existing rows are backfilled only when providerKey identifies exactly one
-- credential; ambiguous historical rows remain NULL and are never guessed.

ALTER TABLE carrier_webhook_events
  ADD COLUMN IF NOT EXISTS credential_id UUID;

UPDATE carrier_webhook_events AS event
SET credential_id = credential.id
FROM carrier_credentials AS credential
WHERE event.credential_id IS NULL
  AND event.provider_key = credential.provider_key
  AND (
    SELECT COUNT(*)
    FROM carrier_credentials AS candidate
    WHERE candidate.provider_key = event.provider_key
  ) = 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'carrier_webhook_events_credential_id_carrier_credentials_id_fk'
  ) THEN
    ALTER TABLE carrier_webhook_events
      ADD CONSTRAINT fk_carrier_webhook_events_credential
      FOREIGN KEY (credential_id)
      REFERENCES carrier_credentials(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE carrier_webhook_events
  DROP CONSTRAINT IF EXISTS uq_carrier_webhook_dedup;

DROP INDEX IF EXISTS uq_carrier_webhook_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS uq_carrier_webhook_dedup_credential
  ON carrier_webhook_events (credential_id, external_delivery_id)
  WHERE credential_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_carrier_webhook_events_credential
  ON carrier_webhook_events (credential_id)
  WHERE credential_id IS NOT NULL;
