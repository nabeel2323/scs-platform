-- 0007_search.sql — Full-text search with Arabic normalization
-- Module boundary: modules/catalog/* (search is a cross-cutting concern)

-- ── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram for fuzzy matching

-- ── Arabic Normalization Function ─────────────────────────────────────────────
-- Strips diacritics (tashkeel), folds alef variants, taa-marbuta→haa, unifies ya.
-- This ensures search works regardless of Arabic orthographic variation.

CREATE OR REPLACE FUNCTION normalize_arabic(input TEXT)
RETURNS TEXT AS $$
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;

  RETURN
    -- Strip Arabic diacritics (U+064B–U+0652: fathatan, dammatan, kasratan, fatha, damma, kasra, shadda, sukun)
    regexp_replace(input, '[' ||
      chr(0x064B) || chr(0x064C) || chr(0x064D) || chr(0x064E) ||
      chr(0x064F) || chr(0x0650) || chr(0x0651) || chr(0x0652) ||
      chr(0x0640) ||  -- tatweel (kashida)
    ']', '', 'g')
    -- Fold alef variants → bare alef (U+0627)
    .translate(
      chr(0x0622) || chr(0x0623) || chr(0x0625) || chr(0x0675),  -- alef madda, hamza above, hamza below, extended
      chr(0x0627) || chr(0x0627) || chr(0x0627) || chr(0x0627)
    )
    -- Taa marbuta (U+0629) → haa (U+0647)
    .replace(chr(0x0629), chr(0x0647))
    -- Alef maqsura (U+0649) → ya (U+064A)
    .replace(chr(0x0649), chr(0x064A))
    -- Lowercase + trim
    .lower()
    ;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Search Indexes on Products ────────────────────────────────────────────────
-- Trigram index on title for fuzzy matching (handles typos, partial matches)
-- GIN tsvector index for full-text search

-- Trigram indexes for fuzzy search
CREATE INDEX idx_products_title_trgm ON products USING GIN (normalize_arabic(title) gin_trgm_ops);
CREATE INDEX idx_products_title ON products USING GIN (to_tsvector('simple', normalize_arabic(title)));

-- Trigram indexes on variants (SKU/barcode exact-match fast path)
CREATE INDEX idx_variants_sku_trgm ON product_variants USING GIN (sku gin_trgm_ops);
CREATE INDEX idx_variants_barcode_trgm ON product_variants USING GIN (barcode gin_trgm_ops) WHERE barcode IS NOT NULL;

-- Composite search vector on products (title + description + brand name)
CREATE INDEX idx_products_search_vector ON products USING GIN (
  setweight(to_tsvector('simple', normalize_arabic(COALESCE(title, ''))), 'A') ||
  setweight(to_tsvector('simple', normalize_arabic(COALESCE(description, ''))), 'B')
);

-- ── Search History (for analytics) ────────────────────────────────────────────

CREATE TABLE search_queries (
  id              UUID PRIMARY KEY,
  query_text      TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id),
  results_count   INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_queries_text ON search_queries USING GIN (normalized_text gin_trgm_ops);
CREATE INDEX idx_search_queries_created ON search_queries(created_at DESC);
