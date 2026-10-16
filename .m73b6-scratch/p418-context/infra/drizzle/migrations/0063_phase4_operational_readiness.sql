-- P13 Phase 4: Pilot Operational Readiness, Observability, and Recovery
-- Forward-only migration. Does NOT modify 0060/0061/0062.
-- Idempotent: safe on fresh DB, existing DB, and repeated runs.
-- No _migration_log writes — the runner owns bookkeeping.
--
-- Objects added here:
--   1. worker_leases        — renewable exclusive lease + fencing epoch + heartbeat
--   2. ops_controls         — durable pause / kill-switch state for protected jobs
--   3. ops_control_audit    — append-only evidence of every control change
--   4. ops_alerts           — alert dedup, severity, and delivery confirmation
--   5. p13_pilot_allowlist  — org/store pilot eligibility allowlist
--   6. feature_flags        — audit columns for runtime toggle changes

-- ═══════════════════════════════════════════════════════════════════
-- 1. Worker exclusivity lease
-- ═══════════════════════════════════════════════════════════════════
-- One row per protected job key. A worker may only execute the job while it
-- holds the row with its own holder_id AND its own epoch. `epoch` is a fencing
-- token: it is incremented on every acquisition, so a stale worker that was
-- partitioned (GC pause, network split, host resume) can detect — before it
-- mutates anything — that it no longer owns the lease.
--
-- No FK to users/orgs: lease rows are infrastructure state, not tenant data.

CREATE TABLE IF NOT EXISTS worker_leases (
  lease_key        VARCHAR(80)  PRIMARY KEY,
  holder_id        VARCHAR(120),
  holder_host      VARCHAR(120),
  holder_pid       INTEGER,
  epoch            BIGINT       NOT NULL DEFAULT 0,
  acquired_at      TIMESTAMPTZ,
  heartbeat_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  -- Alert 1 input: consecutive poll failures for THIS holder/epoch.
  poll_failures    INTEGER      NOT NULL DEFAULT 0,
  last_error_code  VARCHAR(60),
  last_job_at      TIMESTAMPTZ,
  last_job_summary VARCHAR(300),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Observability: which leases are held and which are stale.
CREATE INDEX IF NOT EXISTS idx_worker_leases_heartbeat
  ON worker_leases(heartbeat_at);

CREATE INDEX IF NOT EXISTS idx_worker_leases_expiry
  ON worker_leases(expires_at);

-- Seed the protected P13 job row so the first acquisition is an UPDATE, not an
-- INSERT. This is idempotent state initialisation for an infrastructure table
-- (no business/financial data), and it lets `epoch` start at a known 0.
INSERT INTO worker_leases (lease_key)
VALUES ('p13-return-expiration')
ON CONFLICT (lease_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Durable operational controls (pause / kill switch)
-- ═══════════════════════════════════════════════════════════════════
-- Read by the worker at the top of every cycle AND before every unit of
-- protected work, so pausing takes effect without corrupting in-flight
-- transactions (each unit of work is its own DB transaction).

CREATE TABLE IF NOT EXISTS ops_controls (
  control_key VARCHAR(80) PRIMARY KEY,
  paused      BOOLEAN     NOT NULL DEFAULT FALSE,
  reason      VARCHAR(300),
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default row is explicitly NOT paused only for the generic control table's
-- existence; pilot safety comes from the worker being disabled by default in
-- configuration (P13_WORKER_ENABLED). Absence of a row is treated as
-- "not paused" by the reader, so no seed is required for correct behaviour.

-- ═══════════════════════════════════════════════════════════════════
-- 3. Append-only control-change audit
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ops_control_audit (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  control_key VARCHAR(80) NOT NULL,
  paused      BOOLEAN     NOT NULL,
  reason      VARCHAR(300),
  actor_id    UUID,
  actor_kind  VARCHAR(16) NOT NULL DEFAULT 'ADMIN',
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_control_audit_key
  ON ops_control_audit(control_key, changed_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- 4. Ops alerts with dedup + delivery confirmation
-- ═══════════════════════════════════════════════════════════════════
-- `dedup_key` is unique: repeat occurrences of the same condition on the same
-- resource UPDATE this row (fire_count/suppressed_count) instead of emitting a
-- second notification. Status is the delivery state machine:
--   PENDING -> SENT        (sink acknowledged)
--   PENDING -> FAILED      (sink errored; retried on next scan)
--   PENDING -> SUPPRESSED  (no sink configured; log-only, documented)

CREATE TABLE IF NOT EXISTS ops_alerts (
  id                UUID         PRIMARY KEY,
  dedup_key         VARCHAR(200) NOT NULL,
  condition_key     VARCHAR(80)  NOT NULL,
  severity          VARCHAR(16)  NOT NULL,
  title             VARCHAR(200) NOT NULL,
  -- Sanitised projection only: identifiers and counts. Never tokens,
  -- credentials, personal data, or full request/response bodies.
  detail            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  status            VARCHAR(16)  NOT NULL DEFAULT 'PENDING',
  fire_count        INTEGER      NOT NULL DEFAULT 1,
  suppressed_count  INTEGER      NOT NULL DEFAULT 0,
  attempt_count     INTEGER      NOT NULL DEFAULT 0,
  delivery_channel  VARCHAR(40),
  last_error        VARCHAR(300),
  org_id            UUID,
  resource_type     VARCHAR(60),
  resource_id       UUID,
  first_observed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_observed_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  delivered_at      TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_alerts_dedup
  ON ops_alerts(dedup_key);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_condition
  ON ops_alerts(condition_key, last_observed_at DESC);

-- Partial index for the "still open" queries the monitor and runbook use.
CREATE INDEX IF NOT EXISTS idx_ops_alerts_open
  ON ops_alerts(status, last_observed_at DESC)
  WHERE status IN ('PENDING', 'SENT', 'FAILED');

-- ═══════════════════════════════════════════════════════════════════
-- 5. P13 pilot eligibility allowlist
-- ═══════════════════════════════════════════════════════════════════
-- store_id NULL  => the whole organization is eligible.
-- store_id set   => only that merchant store is eligible.
-- Partial unique indexes keep both scopes enforceable without a sentinel value.

CREATE TABLE IF NOT EXISTS p13_pilot_allowlist (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL,
  store_id   UUID,
  enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  note       VARCHAR(300),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_p13_pilot_allowlist_org_store
  ON p13_pilot_allowlist(org_id, store_id)
  WHERE store_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_p13_pilot_allowlist_org_wide
  ON p13_pilot_allowlist(org_id)
  WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_p13_pilot_allowlist_enabled
  ON p13_pilot_allowlist(enabled, org_id);

-- ═══════════════════════════════════════════════════════════════════
-- 6. feature_flags: make toggle changes attributable
-- ═══════════════════════════════════════════════════════════════════
-- The table existed since 0002 but had no code readers and no provenance.
-- Adding nullable columns is non-destructive to any existing rows.

ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS updated_by UUID;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
