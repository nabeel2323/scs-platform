-- 0007_search.sql — Full-text search with Arabic normalization
-- Module boundary: modules/catalog/* (search is a cross-cutting concern)

-- ── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- trigram for fuzzy matching

-- ── Arabic Normalization Function ─────────────────────────────────────────────
-- Strips diacritics (tashkeel), folds alef variants, taa-marbuta→haa, unifies ya.
-- This ensures search works regardless of Arabic orthographic variation.

CREATE OR REPLACE FUNCTION normalize_arabic(input TEXT)
RETURNS TEXT AS $$
DECLARE
  result TEXT;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;

  -- Step 1: Strip diacritics (tashkeel) and tatweel
  -- U+064B(1611) U+064C(1612) U+064D(1613) U+064E(1614)
  -- U+064F(1615) U+0650(1616) U+0651(1617) U+0652(1618)
  -- U+0640(1600) tatweel/kashida
  result := regexp_replace(input, '[' ||
    chr(1611) || chr(1612) || chr(1613) || chr(1614) ||
    chr(1615) || chr(1616) || chr(1617) || chr(1618) ||
    chr(1600) ||
  ']', '', 'g');

  -- Step 2: Fold alef variants → bare alef (U+0627 = 1575)
  -- U+0622(1570), U+0623(1571), U+0625(1573), U+0675(1653)
  result := translate(result,
    chr(1570) || chr(1571) || chr(1573) || chr(1653),
    chr(1575) || chr(1575) || chr(1575) || chr(1575)
  );

  -- Step 3: Taa marbuta (U+0629=1577) → haa (U+0647=1607)
  result := replace(result, chr(1577), chr(1607));

  -- Step 4: Alef maqsura (U+0649=1609) → ya (U+064A=1610)
  result := replace(result, chr(1609), chr(1610));

  -- Step 5: Lowercase + trim
  result := lower(trim(result));

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ── Search Indexes on Products ────────────────────────────────────────────────
-- Trigram index on title for fuzzy matching (handles typos, partial text)
-- GIN tsvector index for full-text search

-- Trigram indexes for fuzzy search
CREATE INDEX idx_products_title_trgm ON products USING GIN (normalize_arabic(title) gin_trgm_ops);
CREATE INDEX idx_products_title ON products USING GIN (to_tsvector('simple', normalize_arabic(title)));

-- Trigram indexes on variants (SKU/barcode exact-match fast path)
CREATE INDEX idx_variants_sku_trgm ON product_variants USING GIN (sku gin_trgm_ops);
CREATE INDEX idx_variants_barcode_trgm ON product_variants USING GIN (barcode gin_trgm_ops) WHERE barcode IS NOT NULL;

-- Separate weighted search indexes on title and description
CREATE INDEX idx_products_search_title ON products USING GIN (setweight(to_tsvector('simple', normalize_arabic(COALESCE(title, ''))), 'A'));
CREATE INDEX idx_products_search_desc ON products USING GIN (setweight(to_tsvector('simple', normalize_arabic(COALESCE(description, ''))), 'B'));

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
