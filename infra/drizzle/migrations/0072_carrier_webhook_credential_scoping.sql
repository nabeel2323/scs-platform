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

-- Revalidate historical links where the credential could be identified.
-- Any known cross-org/provider mismatch is detached for manual reconciliation.
UPDATE carrier_webhook_events AS event
SET shipment_id = NULL,
    processed = false,
    processed_at = NULL,
    processing_error = 'Historical webhook link failed credential tenant/provider revalidation; manual review required'
FROM shipments AS shipment,
     stores AS store,
     carrier_credentials AS credential
WHERE event.shipment_id = shipment.id
  AND store.id = shipment.store_id
  AND credential.id = event.credential_id
  AND event.credential_id IS NOT NULL
  AND (
    store.org_id IS DISTINCT FROM credential.org_id
    OR shipment.shipping_provider_key IS DISTINCT FROM event.provider_key
    OR shipment.carrier_shipment_id IS DISTINCT FROM event.external_delivery_id
  );

DO $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'carrier_webhook_events_credential_id_carrier_credentials_id_fk'
  ) THEN
    ALTER TABLE carrier_webhook_events
      ADD CONSTRAINT fk_carrier_webhook_events_credential
      FOREIGN KEY (credential_id)
      REFERENCES carrier_credentials(id)
      ON DELETE RESTRICT;
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
