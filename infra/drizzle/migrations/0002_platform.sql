-- 0002_platform.sql — Audit, Outbox, Feature Flags, Analytics
-- Canonical migration for platform-level infrastructure tables.

-- ── Audit Logs (append-only) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY,
  actor_type  VARCHAR(20) NOT NULL CHECK (actor_type IN ('BUYER','MERCHANT','DRIVER','ADMIN','SYSTEM')),
  actor_id    UUID,
  action      VARCHAR(60) NOT NULL,        -- e.g. 'merchant.verification.approved'
  resource    VARCHAR(60) NOT NULL,        -- e.g. 'organizations'
  resource_id UUID,
  org_id      UUID,
  metadata    JSONB NOT NULL DEFAULT '{}', -- decision details, before/after snapshots
  ip          INET,
  user_agent  VARCHAR(300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor    ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs (resource, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org      ON audit_logs (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action   ON audit_logs (action, created_at DESC);

-- ── Outbox Events (transactional outbox) ─────────────────────
CREATE TABLE IF NOT EXISTS outbox_events (
  id           UUID PRIMARY KEY,
  event_type   VARCHAR(80) NOT NULL,         -- e.g. 'order.submitted'
  aggregate_id UUID,
  payload      JSONB NOT NULL DEFAULT '{}',
  metadata     JSONB NOT NULL DEFAULT '{}',  -- correlation-id, causation-id
  status       VARCHAR(16) NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','DISPATCHED','FAILED')),
  attempts     INT NOT NULL DEFAULT 0,
  last_error   TEXT,
  dispatched_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_dispatch
  ON outbox_events (created_at ASC)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_outbox_type ON outbox_events (event_type, created_at DESC);

-- ── Feature Flags ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  key         VARCHAR(80) PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  description VARCHAR(300),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default feature flags
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('prepay_enabled', false, 'Enable prepayment flow at checkout'),
  ('b2c_enabled', false, 'Enable B2C consumer marketplace'),
  ('ads_enabled', false, 'Enable advertising module'),
  ('smart_reorder_enabled', false, 'Enable Smart Reorder (AI-driven)'),
  ('whatsapp_notifications', false, 'Enable WhatsApp notification channel')
ON CONFLICT (key) DO NOTHING;

-- ── Analytics Events (monthly partitions) ────────────────────
-- Note: In production, use pg_partman for automatic partition management.
-- This creates the parent table; partitions are created per-month.
CREATE TABLE IF NOT EXISTS analytics_events (
  id           UUID NOT NULL,
  event_type   VARCHAR(80) NOT NULL,       -- search_performed, product_viewed, cart_item_added, etc.
  user_id      UUID,
  org_id       UUID,
  session_id   VARCHAR(64),
  properties   JSONB NOT NULL DEFAULT '{}',
  device       VARCHAR(20),                -- WEB, MOBILE, ADMIN
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial partition for current month
CREATE TABLE IF NOT EXISTS analytics_events_y2026m09
  PARTITION OF analytics_events
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events (user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_org  ON analytics_events (org_id, created_at DESC) WHERE org_id IS NOT NULL;
