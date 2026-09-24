-- 0034: Platform-level catalog import tables (admin-driven Excel imports).
--
-- Separate from the existing store-scoped `import_jobs` (migration 0004).
-- These tables track administrator-initiated catalog master-data imports
-- from Excel workbooks that populate the canonical catalog entities
-- (categories, brands, attributes, product types, products, variants).

CREATE TABLE IF NOT EXISTS catalog_imports (
  id UUID PRIMARY KEY,
  file_name VARCHAR(260) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  file_type VARCHAR(10) NOT NULL DEFAULT 'XLSX',
  storage_key TEXT NOT NULL,
  import_type VARCHAR(30) NOT NULL DEFAULT 'FULL_CATALOG',
  status VARCHAR(20) NOT NULL DEFAULT 'UPLOADED',
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  created_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  unchanged_rows INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  stats JSONB NOT NULL DEFAULT '{}',
  uploaded_by UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_imports_status ON catalog_imports(status);
CREATE INDEX IF NOT EXISTS idx_catalog_imports_uploaded_by ON catalog_imports(uploaded_by);

CREATE TABLE IF NOT EXISTS catalog_import_errors (
  id UUID PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES catalog_imports(id) ON DELETE CASCADE,
  sheet VARCHAR(60),
  row_number INTEGER,
  entity_type VARCHAR(40),
  external_key VARCHAR(200),
  field VARCHAR(80),
  error_code VARCHAR(40),
  error_message TEXT,
  raw_value TEXT,
  suggested_fix TEXT,
  severity VARCHAR(10) NOT NULL DEFAULT 'ERROR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalog_import_errors_import ON catalog_import_errors(import_id);
