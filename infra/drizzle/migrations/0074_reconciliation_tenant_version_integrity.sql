-- FIN-021: Reconciliation run versioning and atomic history integrity.
-- Forward-only migration. Never apply to shared/staging databases without the
-- separately required database-access review and deployment authorization.

-- Refuse to rewrite history unless every legacy edge is a valid, unambiguous
-- predecessor link. This is intentionally fail-closed: operators must repair
-- anomalous data explicitly rather than silently rewriting financial history.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM reconciliation_runs AS newer
    WHERE newer.superseded_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM reconciliation_runs AS older WHERE older.id = newer.superseded_by
      )
  ) THEN
    RAISE EXCEPTION '0074 preflight: dangling reconciliation superseded_by reference';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reconciliation_runs AS newer
    JOIN reconciliation_runs AS older ON older.id = newer.superseded_by
    WHERE newer.period_start IS DISTINCT FROM older.period_start
       OR newer.period_end IS DISTINCT FROM older.period_end
       OR newer.currency IS DISTINCT FROM older.currency
       OR newer.org_id IS DISTINCT FROM older.org_id
  ) THEN
    RAISE EXCEPTION '0074 preflight: reconciliation history crosses period, currency, or organization scope';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reconciliation_runs AS newer
    JOIN reconciliation_runs AS older ON older.id = newer.superseded_by
    WHERE newer.version <= older.version
  ) THEN
    RAISE EXCEPTION '0074 preflight: reconciliation version pointers are not strictly increasing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reconciliation_runs
    WHERE superseded_by IS NOT NULL
    GROUP BY superseded_by
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '0074 preflight: branching reconciliation history has multiple successors';
  END IF;

  IF EXISTS (
    WITH RECURSIVE walk(start_id, next_id, path, cycle) AS (
      SELECT id, superseded_by, ARRAY[id], false
      FROM reconciliation_runs
      WHERE superseded_by IS NOT NULL
      UNION ALL
      SELECT walk.start_id, next_run.superseded_by,
             walk.path || next_run.id, next_run.id = ANY(walk.path)
      FROM walk
      JOIN reconciliation_runs AS next_run ON next_run.id = walk.next_id
      WHERE walk.next_id IS NOT NULL AND NOT walk.cycle
    )
    SELECT 1 FROM walk WHERE cycle
  ) THEN
    RAISE EXCEPTION '0074 preflight: cyclic reconciliation history';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reconciliation_runs
    GROUP BY period_start, period_end, currency, version, org_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION '0074 preflight: duplicate reconciliation version in the same organization scope';
  END IF;
END;
$preflight$;

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
