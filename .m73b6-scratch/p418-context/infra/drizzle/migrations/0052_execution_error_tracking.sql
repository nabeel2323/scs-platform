-- 0052: Phase 2 — Execution error tracking & plan persistence for retry
--
-- Extends catalog_import_errors with dependency tracking columns
-- (dependency, root_error_id) and richer error context (normalized_value,
-- expected, actual).
--
-- Extends catalog_imports with plan_snapshot / refs_snapshot JSONB columns
-- so that a COMPLETED_WITH_ERRORS or FAILED import can be retried without
-- re-uploading the original XLSX, and adds skipped_rows for dependency-skip
-- accounting.

-- ── catalog_import_errors: dependency tracking ────────────────────

ALTER TABLE catalog_import_errors
  ADD COLUMN IF NOT EXISTS dependency       VARCHAR(200),
  ADD COLUMN IF NOT EXISTS root_error_id    UUID,
  ADD COLUMN IF NOT EXISTS normalized_value TEXT,
  ADD COLUMN IF NOT EXISTS expected         VARCHAR(500),
  ADD COLUMN IF NOT EXISTS actual           VARCHAR(500);

-- Widen severity to accommodate 'DEPENDENCY' (was varchar(10))
ALTER TABLE catalog_import_errors
  ALTER COLUMN severity TYPE VARCHAR(12);

-- Index for fast root-cause drill-down
CREATE INDEX IF NOT EXISTS idx_catalog_import_errors_root
  ON catalog_import_errors (root_error_id)
  WHERE root_error_id IS NOT NULL;

-- ── catalog_imports: plan persistence for retry ───────────────────

ALTER TABLE catalog_imports
  ADD COLUMN IF NOT EXISTS plan_snapshot   JSONB,
  ADD COLUMN IF NOT EXISTS refs_snapshot   JSONB,
  ADD COLUMN IF NOT EXISTS skipped_rows    INTEGER NOT NULL DEFAULT 0;
