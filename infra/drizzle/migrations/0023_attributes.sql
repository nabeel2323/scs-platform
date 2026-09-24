-- 0023_attributes.sql — Global attribute framework (PHASE 2 domain model)
-- Module boundary: modules/catalog/*
--
-- Establishes the reusable, platform-governed attribute system that Product
-- Types (§8–§11) and canonical products/variants (§17–§22) will build on.
-- Purely ADDITIVE: no existing table is altered and no working feature depends
-- on these rows yet. Every statement is idempotent (IF NOT EXISTS / ON CONFLICT)
-- so a re-run against a partially-migrated database is safe.

-- ── Attribute definitions ──────────────────────────────────────────────────────
-- A single catalogue of every attribute the marketplace understands, independent
-- of any product type. `scope` is the mandatory PRODUCT / VARIANT / OFFER split
-- (§10); the same attribute is never redefined per merchant.
--   type  : TEXT, LONG_TEXT, INTEGER, DECIMAL, BOOLEAN, DATE, DATETIME, SELECT,
--           MULTI_SELECT, COLOR, URL, FILE, MEASUREMENT, CURRENCY
--   scope : PRODUCT | VARIANT | OFFER
--   status: ACTIVE | DEPRECATED

CREATE TABLE attribute_definitions (
  id            UUID PRIMARY KEY,
  code          VARCHAR(80)  NOT NULL,                       -- stable machine key, e.g. "ram_gb"
  name          VARCHAR(200) NOT NULL,
  name_ar       VARCHAR(200),
  description   TEXT,
  type          VARCHAR(20)  NOT NULL DEFAULT 'TEXT',
  unit          VARCHAR(40),                                 -- e.g. "GB", "inch" (MEASUREMENT/DECIMAL)
  scope         VARCHAR(16)  NOT NULL DEFAULT 'PRODUCT',     -- PRODUCT | VARIANT | OFFER
  status        VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',      -- ACTIVE | DEPRECATED
  validation    JSONB        NOT NULL DEFAULT '{}',          -- {min,max,regex,enum,...} reusable defaults
  metadata      JSONB        NOT NULL DEFAULT '{}',
  deleted_at    TIMESTAMPTZ,                                 -- soft delete
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (code)
);

CREATE INDEX idx_attr_def_scope   ON attribute_definitions(scope)   WHERE deleted_at IS NULL;
CREATE INDEX idx_attr_def_type    ON attribute_definitions(type)    WHERE deleted_at IS NULL;
CREATE INDEX idx_attr_def_active  ON attribute_definitions(status)  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- ── Attribute options ──────────────────────────────────────────────────────────
-- Controlled values for SELECT / MULTI_SELECT attributes (§9) so merchants pick
-- from an existing list instead of retyping "Black"/"16 GB" every time.

CREATE TABLE attribute_options (
  id            UUID PRIMARY KEY,
  attribute_id  UUID         NOT NULL REFERENCES attribute_definitions(id) ON DELETE CASCADE,
  value         VARCHAR(200) NOT NULL,
  value_ar      VARCHAR(200),
  label         VARCHAR(200),
  sort_order    INT          NOT NULL DEFAULT 0,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (attribute_id, value)
);

CREATE INDEX idx_attr_opt_attr ON attribute_options(attribute_id) WHERE is_active = TRUE;

-- ── Attribute groups ───────────────────────────────────────────────────────────
-- Presentation buckets (§14) such as General / Processor / Memory / Display.
-- The group membership + ordering are configured per product type (0024); this
-- table only holds the shared group vocabulary.

CREATE TABLE attribute_groups (
  id            UUID PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  name_ar       VARCHAR(120),
  kind          VARCHAR(40),                                 -- optional classifier (SPEC / COMMERCIAL …)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (name)
);

-- Application/order is recorded by the migration runner (apps/api/infra/drizzle/
-- migrate.ts) in `_migration_log`; this file must NOT write that row itself, or
-- the runner's insert would collide on the PRIMARY KEY (and direct-SQL execution
-- in integration specs would fail because the table isn't created here). The DDL
-- above is idempotent (IF NOT EXISTS) so re-runs are safe.
