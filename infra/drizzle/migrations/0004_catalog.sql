-- 0004_catalog.sql — Product catalog: categories, brands, products, variants, media, imports
-- Module boundary: modules/catalog/*

-- ── Categories ────────────────────────────────────────────────────────────────
-- Materialized path for efficient hierarchy queries.
-- Example: path = '/food/beverages/juice' → depth 3

CREATE TABLE categories (
  id              UUID PRIMARY KEY,
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE, -- NULL = platform-level
  parent_id       UUID REFERENCES categories(id) ON DELETE SET NULL,
  path            TEXT NOT NULL DEFAULT '/',                    -- materialized path
  slug            VARCHAR(120) NOT NULL,
  name            VARCHAR(200) NOT NULL,
  name_ar         VARCHAR(200),                                -- Arabic localized name
  description     TEXT,
  image_url       TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  product_count   INT NOT NULL DEFAULT 0,                      -- denormalized counter
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, slug)
);

CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_path ON categories USING GIN (path gin_trgm_ops);
CREATE INDEX idx_categories_store ON categories(store_id) WHERE store_id IS NOT NULL;
CREATE INDEX idx_categories_active ON categories(is_active) WHERE is_active = TRUE;

-- ── Brands ────────────────────────────────────────────────────────────────────

CREATE TABLE brands (
  id              UUID PRIMARY KEY,
  name            VARCHAR(200) NOT NULL,
  name_ar         VARCHAR(200),
  slug            VARCHAR(120) NOT NULL UNIQUE,
  logo_url        TEXT,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brands_active ON brands(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_brands_slug ON brands(slug);

-- ── Products ──────────────────────────────────────────────────────────────────
-- Header-level product. Variants hold the actual purchasable items.
-- status: DRAFT → ACTIVE → ARCHIVED | REJECTED
-- Soft delete via deleted_at.

CREATE TABLE products (
  id              UUID PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  brand_id        UUID REFERENCES brands(id) ON DELETE SET NULL,
  slug            VARCHAR(200) NOT NULL,
  title           VARCHAR(300) NOT NULL,
  title_ar        VARCHAR(300),
  description     TEXT,
  description_ar  TEXT,
  status          VARCHAR(16) NOT NULL DEFAULT 'DRAFT',  -- DRAFT, ACTIVE, ARCHIVED, REJECTED
  condition       VARCHAR(16) NOT NULL DEFAULT 'NEW',    -- NEW, USED, REFURBISHED
  is_available    BOOLEAN NOT NULL DEFAULT FALSE,
  moq             INT NOT NULL DEFAULT 1,                 -- minimum order quantity
  images          JSONB NOT NULL DEFAULT '[]',            -- primary image URLs array
  attributes      JSONB NOT NULL DEFAULT '{}',            -- flexible key-value (color, size, material)
  metadata        JSONB NOT NULL DEFAULT '{}',
  published_at    TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,                            -- soft delete
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, slug)
);

CREATE INDEX idx_products_store ON products(store_id);
CREATE INDEX idx_products_category ON products(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_products_brand ON products(brand_id) WHERE brand_id IS NOT NULL;
CREATE INDEX idx_products_status ON products(status) WHERE status = 'ACTIVE' AND deleted_at IS NULL;
CREATE INDEX idx_products_available ON products(is_available) WHERE is_available = TRUE AND deleted_at IS NULL;

-- ── Product Variants ──────────────────────────────────────────────────────────
-- The actual purchasable SKU. Each variant has its own price, stock, barcode.

CREATE TABLE product_variants (
  id              UUID PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku             VARCHAR(100) NOT NULL,
  barcode         VARCHAR(60),                            -- EAN-13, UPC, etc.
  title           VARCHAR(300),                           -- e.g. "Large / Red"
  title_ar        VARCHAR(300),
  unit            VARCHAR(30) NOT NULL DEFAULT 'PCS',     -- PCS, KG, L, BOX, etc.
  weight_grams    INT,
  dimensions_mm   JSONB DEFAULT '{}',                     -- {l, w, h}
  attributes      JSONB NOT NULL DEFAULT '{}',            -- {color: "red", size: "XL"}
  images          JSONB NOT NULL DEFAULT '[]',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, sku)
);

CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_sku ON product_variants(sku);
CREATE INDEX idx_variants_barcode ON product_variants(barcode) WHERE barcode IS NOT NULL;

-- ── Product Media ─────────────────────────────────────────────────────────────
-- Separate media table for rich media management (reordering, thumbnails, etc.)

CREATE TABLE product_media (
  id              UUID PRIMARY KEY,
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id      UUID REFERENCES product_variants(id) ON DELETE CASCADE, -- NULL = product-level
  media_type      VARCHAR(16) NOT NULL DEFAULT 'IMAGE',   -- IMAGE, VIDEO
  url             TEXT NOT NULL,
  thumb_url       TEXT,
  blurhash        VARCHAR(60),                            -- blurhash for lazy loading
  alt_text        VARCHAR(300),
  alt_text_ar     VARCHAR(300),
  sort_order      INT NOT NULL DEFAULT 0,
  file_size       BIGINT NOT NULL DEFAULT 0,
  mime_type       VARCHAR(100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_product ON product_media(product_id);
CREATE INDEX idx_media_variant ON product_media(variant_id) WHERE variant_id IS NOT NULL;

-- ── Import Jobs ───────────────────────────────────────────────────────────────
-- Bulk catalog import from Excel/CSV.
-- Status: UPLOADED → MAPPING → VALIDATED → IMPORTING → REVIEW | COMPLETED | FAILED

CREATE TABLE import_jobs (
  id              UUID PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  file_name       VARCHAR(260) NOT NULL,
  file_type       VARCHAR(10) NOT NULL DEFAULT 'XLSX',    -- XLSX, CSV
  file_size       BIGINT NOT NULL DEFAULT 0,
  storage_key     TEXT NOT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'UPLOADED',
  total_rows      INT NOT NULL DEFAULT 0,
  processed_rows  INT NOT NULL DEFAULT 0,
  error_rows      INT NOT NULL DEFAULT 0,
  column_mapping  JSONB DEFAULT '{}',                     -- {excel_col: system_field}
  error_log       JSONB DEFAULT '[]',                     -- [{row, field, message}]
  created_by      UUID NOT NULL REFERENCES users(id),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_jobs_store ON import_jobs(store_id);
CREATE INDEX idx_import_jobs_status ON import_jobs(status) WHERE status NOT IN ('COMPLETED', 'FAILED');
