-- 0024_product_types.sql — Product Type / Template system (PHASE 2 domain model)
-- Module boundary: modules/catalog/*
--
-- Introduces the first-class Product Type (§11) that binds a category to a set
-- of attributes with per-type configuration, and the versioned schema (§12) that
-- will later drive dynamic merchant forms and buyer presentation. ADDITIVE ONLY:
-- `products`/`categories` are NOT modified in this phase — the canonical link
-- (products.product_type_id) lands in a later phase so nothing breaks today.
-- Idempotent: IF NOT EXISTS on DDL (the runner records application in _migration_log).

-- ── Product types (versioned) ──────────────────────────────────────────────────
-- A logical template identified by `code`; each revision is a new row sharing
-- the code with a higher `version` (§12). Existing products keep pointing at the
-- version they were created under; new work resolves the PUBLISHED version.
--   status: DRAFT | PUBLISHED | DEPRECATED
--   variant_dimensions: ordered array of attribute_definition ids that are the
--           allowed variation axes for this type (§20) — e.g. ["ram","storage","color"].

CREATE TABLE product_types (
  id                  UUID PRIMARY KEY,
  code                VARCHAR(80)  NOT NULL,                  -- logical key, e.g. "laptop"
  version             INT          NOT NULL DEFAULT 1,
  name                VARCHAR(200) NOT NULL,
  name_ar             VARCHAR(200),
  description         TEXT,
  category_id         UUID REFERENCES categories(id) ON DELETE SET NULL, -- §28 category → type
  status              VARCHAR(16)  NOT NULL DEFAULT 'DRAFT',  -- DRAFT | PUBLISHED | DEPRECATED
  variant_dimensions  JSONB        NOT NULL DEFAULT '[]',     -- [attribute_definition_id, …]
  metadata            JSONB        NOT NULL DEFAULT '{}',
  published_at        TIMESTAMPTZ,
  effective_from      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (code, version)
);

CREATE INDEX idx_pt_code       ON product_types(code);
CREATE INDEX idx_pt_category   ON product_types(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_pt_published  ON product_types(status) WHERE status = 'PUBLISHED';

-- ── Product type ⇄ attribute configuration ─────────────────────────────────────
-- The source of truth (§13) for the dynamic merchant form and buyer presentation.
-- One row per (product_type, attribute) with the required/optional flag, scope
-- override, grouping, ordering, and the search/facet/comparison/visibility toggles
-- (§41). `conditional_rules` encodes §15 (e.g. IF gpu_type=Dedicated THEN
-- gpu_model required) as data, never as hardcoded frontend logic.

CREATE TABLE product_type_attributes (
  id                        UUID PRIMARY KEY,
  product_type_id           UUID NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
  attribute_definition_id   UUID NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
  group_id                  UUID REFERENCES attribute_groups(id) ON DELETE SET NULL,
  required                  BOOLEAN NOT NULL DEFAULT FALSE,
  scope                     VARCHAR(16) NOT NULL DEFAULT 'PRODUCT',   -- PRODUCT | VARIANT | OFFER
  display_order             INT NOT NULL DEFAULT 0,
  filterable                BOOLEAN NOT NULL DEFAULT FALSE,
  searchable                BOOLEAN NOT NULL DEFAULT FALSE,
  sortable                  BOOLEAN NOT NULL DEFAULT FALSE,
  comparable                BOOLEAN NOT NULL DEFAULT FALSE,
  visible_in_listing        BOOLEAN NOT NULL DEFAULT TRUE,
  visible_in_detail         BOOLEAN NOT NULL DEFAULT TRUE,
  allowed_values            JSONB NOT NULL DEFAULT '[]',              -- restrict to subset of options
  validation_rules          JSONB NOT NULL DEFAULT '{}',              -- overrides attribute default
  conditional_rules         JSONB NOT NULL DEFAULT '[]',              -- §15 conditional required/visible
  metadata                  JSONB NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_type_id, attribute_definition_id)
);

CREATE INDEX idx_pta_type      ON product_type_attributes(product_type_id);
CREATE INDEX idx_pta_attribute ON product_type_attributes(attribute_definition_id);
CREATE INDEX idx_pta_filter    ON product_type_attributes(product_type_id) WHERE filterable = TRUE;

-- Application is recorded by the migration runner (migrate.ts) in `_migration_log`;
-- this file must NOT insert that row itself (the runner's insert would collide on
-- the PRIMARY KEY). The DDL above is idempotent so re-runs are safe.
