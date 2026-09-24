-- 0025_canonical_products.sql — Canonical Product layer (PHASE 3 domain model)
-- Module boundary: modules/catalog/*
--
-- Connects the Phase-2 taxonomy to the live catalog so a product can describe
-- WHAT IT IS (canonical) independently of WHO SELLS IT (offer, Phase 4). This is
-- the first phase that touches existing tables, so every change is strictly
-- ADDITIVE / non-breaking:
--   • new nullable columns are added (existing rows keep their data);
--   • `products.store_id` is relaxed NOT NULL → NULL at the DB level so a row may
--     become a platform-shared canonical product with no single owning store
--     (existing rows retain their store_id — no data is lost). The Drizzle ORM
--     column type is intentionally left required for now and relaxed in PHASE 4,
--     when merchant offers become the path that creates store-less rows; this
--     keeps every current read/write flow (cart, orders, search, tenant-scope)
--     compiling and behaving exactly as before.
--   • the free-form `products.attributes`/`product_variants.attributes` JSONB
--     blobs are left INTACT (still authoritative during transition) and the new
--     typed value tables run alongside them until cutover.
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP NOT NULL (safe no-op re-run),
-- CREATE TABLE/INDEX IF NOT EXISTS. The runner records application in _migration_log.

-- ── Canonical identity on the product ──────────────────────────────────────────
-- product_type_id binds a product to the governed template that defines its
-- attribute schema (§11/§28). GTIN/EAN/MPN are the manufacturer identifiers
-- (§30) used to recognise an existing canonical product when a merchant proposes
-- it, instead of creating a duplicate.

ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type_id UUID REFERENCES product_types(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gtin VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS ean VARCHAR(20);
ALTER TABLE products ADD COLUMN IF NOT EXISTS mpn VARCHAR(100);

-- A platform-shared canonical product has no owning store yet; merchants attach
-- offers to it later. Only relax the constraint — never drop the column.
ALTER TABLE products ALTER COLUMN store_id DROP NOT NULL;

-- Global barcode identifiers are unique when present; MPN is brand-scoped so it
-- is intentionally NOT globally constrained. Partial indexes ignore NULLs, so a
-- re-run and existing (all-NULL) rows are safe.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_gtin      ON products(gtin)      WHERE gtin IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_ean       ON products(ean)       WHERE ean IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_products_ptype    ON products(product_type_id) WHERE product_type_id IS NOT NULL;

-- ── Typed product-scope attribute values ───────────────────────────────────────
-- Replaces the unstructured `products.attributes` JSONB blob (§17) with one row
-- per (product, attribute) holding a type-appropriate value. Values are stored in
-- dedicated typed columns (not a single JSON blob) so facets/filters/comparison
-- (§41) query them directly. `option_value` carries the controlled SELECT value.

CREATE TABLE IF NOT EXISTS product_attribute_values (
  id                      UUID PRIMARY KEY,
  product_id              UUID    NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute_definition_id UUID    NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
  value_text              TEXT,
  value_number            NUMERIC,
  value_boolean           BOOLEAN,
  option_value            VARCHAR(200),                        -- SELECT: chosen option value
  value_json              JSONB,                               -- MULTI_SELECT / range / structured
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, attribute_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_pav_attribute ON product_attribute_values(attribute_definition_id);
CREATE INDEX IF NOT EXISTS idx_pav_product   ON product_attribute_values(product_id);

-- ── Typed variant-scope attribute values ───────────────────────────────────────
-- Same shape for VARIANT-scope attributes (Color / RAM / Storage …) that make up
-- the variation matrix (§19). A variant's set of these values is its combination.

CREATE TABLE IF NOT EXISTS variant_attribute_values (
  id                      UUID PRIMARY KEY,
  variant_id              UUID    NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  attribute_definition_id UUID    NOT NULL REFERENCES attribute_definitions(id) ON DELETE RESTRICT,
  value_text              TEXT,
  value_number            NUMERIC,
  value_boolean           BOOLEAN,
  option_value            VARCHAR(200),
  value_json              JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (variant_id, attribute_definition_id)
);

CREATE INDEX IF NOT EXISTS idx_vav_attribute ON variant_attribute_values(attribute_definition_id);
CREATE INDEX IF NOT EXISTS idx_vav_variant  ON variant_attribute_values(variant_id);

-- ── Variant combination uniqueness (§19) ───────────────────────────────────────
-- A normalized, ordered digest of a variant's attribute values. Two variants of
-- the same product may not resolve to the same combination. The service computes
-- the key; the partial unique index enforces it (NULL = not yet computed, so
-- existing rows and the JSONB transition are unaffected).

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS combination_key VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_combination
  ON product_variants(product_id, combination_key)
  WHERE combination_key IS NOT NULL;

-- Application is recorded by the migration runner (migrate.ts) in `_migration_log`;
-- this file must NOT insert that row itself (the runner's insert would collide on
-- the PRIMARY KEY). The DDL above is idempotent so re-runs are safe.
