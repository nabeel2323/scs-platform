-- Migration 0055: Import chunking, concurrent processing guard, inventory integrity.
--
-- P8 Import/Export Production Hardening.
-- Idempotent: safe to run multiple times.
-- Non-destructive: no data modification, no table rewrites.
-- Compatible with migration 0054 (store_members).

-- 1. Import job chunks ────────────────────────────────────────────────────────
-- Supports chunked import processing (100 rows per chunk).
-- Each chunk tracks its own status, counts, errors, and attempt history.

CREATE TABLE IF NOT EXISTS import_job_chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_job_id   UUID         NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    chunk_index     INTEGER      NOT NULL,
    start_row       INTEGER      NOT NULL,
    end_row         INTEGER      NOT NULL,
    status          VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
    row_count       INTEGER      NOT NULL,
    processed_rows  INTEGER      NOT NULL DEFAULT 0,
    created_count   INTEGER      NOT NULL DEFAULT 0,
    updated_count   INTEGER      NOT NULL DEFAULT 0,
    skipped_count   INTEGER      NOT NULL DEFAULT 0,
    error_count     INTEGER      NOT NULL DEFAULT 0,
    error_log       JSONB        NOT NULL DEFAULT '[]',
    attempt_count   INTEGER      NOT NULL DEFAULT 0,
    last_error      TEXT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_import_job_chunks_job_index
        UNIQUE (import_job_id, chunk_index),
    CONSTRAINT ck_import_job_chunks_status
        CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    CONSTRAINT ck_import_job_chunks_index_non_negative
        CHECK (chunk_index >= 0),
    CONSTRAINT ck_import_job_chunks_rows_valid
        CHECK (end_row >= start_row),
    CONSTRAINT ck_import_job_chunks_attempts_non_negative
        CHECK (attempt_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_import_job_chunks_job_status
    ON import_job_chunks (import_job_id, status);

CREATE INDEX IF NOT EXISTS idx_import_job_chunks_job_index
    ON import_job_chunks (import_job_id, chunk_index);

-- 2. Import job concurrent processing guard ──────────────────────────────────
-- locked_at records when a job entered PROCESSING state.
-- Used for stale-job detection (>30 min → recoverable).

ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

-- 3. Inventory integrity constraints ─────────────────────────────────────────
-- Safety net: prevent negative quantities at database level.
-- Application-level guards already exist in all write paths;
-- these CHECK constraints provide a final safety net against bugs
-- or direct database access.
--
-- Note: CHECK (qty_reserved <= qty_on_hand) is intentionally NOT added.
-- transferStock reads qty_on_hand/qty_reserved outside a FOR UPDATE lock,
-- so a concurrent reserveStock could create a transient violation.
-- That invariant requires transferStock hardening first (done in this migration's
-- application code changes).

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_inventory_qty_on_hand_non_negative'
    ) THEN
        ALTER TABLE inventory_items
            ADD CONSTRAINT ck_inventory_qty_on_hand_non_negative
            CHECK (qty_on_hand >= 0);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_inventory_qty_reserved_non_negative'
    ) THEN
        ALTER TABLE inventory_items
            ADD CONSTRAINT ck_inventory_qty_reserved_non_negative
            CHECK (qty_reserved >= 0);
    END IF;
END $$;
