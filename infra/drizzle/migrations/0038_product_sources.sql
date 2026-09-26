-- 0038: Product Sources — provenance tracking for canonical catalog data.
--
-- Each row records where a product's information originated (manufacturer
-- datasheet, distributor feed, manual entry, etc.).  Supports idempotent
-- catalog import: the same (product, source_type, source_url) triple
-- is never duplicated.
--
-- FK targets: products (migration 0004).

CREATE TABLE IF NOT EXISTS product_sources (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID         NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    source_type     VARCHAR(30)  NOT NULL,            -- MANUFACTURER, DISTRIBUTOR, MANUAL, API, IMPORT
    source_url      TEXT         NOT NULL,
    verified_at     TIMESTAMPTZ,
    metadata        JSONB        NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- Idempotency: same product + type + URL is a single source record.
    CONSTRAINT uq_product_source UNIQUE (product_id, source_type, source_url)
);

-- Lookup by product (the dominant query pattern: "show me all sources for product X").
CREATE INDEX IF NOT EXISTS idx_product_sources_product
    ON product_sources (product_id);

-- Lookup by type (e.g. "all MANUFACTURER sources").
CREATE INDEX IF NOT EXISTS idx_product_sources_type
    ON product_sources (source_type);
