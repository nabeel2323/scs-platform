-- FIN-021: Reconciliation run versioning and atomic history integrity.
-- Forward-only migration. Never apply to shared/staging databases without the
-- separately required database-access review and deployment authorization.

-- Phase 3.1 stored the previous run ID on the newly-created row. Convert those
-- backward pointers to the intended predecessor -> successor relationship.
DO $$
DECLARE
  link RECORD;
BEGIN
  FOR link IN
    SELECT newer.id AS newer_id, newer.superseded_by AS older_id
    FROM reconciliation_runs AS newer
    WHERE newer.superseded_by IS NOT NULL
    ORDER BY newer.period_start, newer.period_end, newer.currency,
             newer.org_id NULLS FIRST, newer.version ASC
  LOOP
    UPDATE reconciliation_runs
    SET superseded_by = link.newer_id
    WHERE id = link.older_id;

    UPDATE reconciliation_runs
    SET superseded_by = NULL
    WHERE id = link.newer_id;
  END LOOP;
END $$;

-- Allocate versions independently per organization. NULL org_id is the
-- single legacy/global scope and must also have unique versions.
DROP INDEX IF EXISTS idx_reconciliation_runs_unique_version;
CREATE UNIQUE INDEX idx_reconciliation_runs_unique_version
  ON reconciliation_runs (period_start, period_end, currency, version, org_id)
  NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_org_period_version
  ON reconciliation_runs (org_id, period_start, period_end, currency, version DESC);
