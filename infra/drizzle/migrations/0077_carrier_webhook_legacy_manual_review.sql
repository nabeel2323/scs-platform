-- Quarantine historical carrier webhook links that have no authenticated
-- credential binding. Keep processed/processed_at unchanged so previously
-- processed events are never reopened; unprocessed events remain unprocessed
-- and the worker will refuse to replay them without a credential.
UPDATE carrier_webhook_events
SET shipment_id = NULL,
    processing_error = CASE
      WHEN processing_error IS NULL OR btrim(processing_error) = ''
        THEN 'Legacy webhook had no credential binding; shipment link detached for manual review'
      ELSE left(processing_error || E'\nLegacy webhook had no credential binding; shipment link detached for manual review', 2000)
    END
WHERE credential_id IS NULL
  AND shipment_id IS NOT NULL;
