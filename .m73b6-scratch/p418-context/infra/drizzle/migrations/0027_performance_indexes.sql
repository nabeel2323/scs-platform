-- 0027_performance_indexes.sql
-- Phase 8: Composite indexes for hot query paths identified during Phases 4-7.
-- All DDL uses IF NOT EXISTS for idempotency.

-- ─── products: store listings filtered by status + category ───────────────────
-- Covers: GET /stores/:storeId/products, search empty-query path, product-card enrichment.
CREATE INDEX IF NOT EXISTS idx_products_store_status_cat
  ON products(store_id, status, category_id)
  WHERE deleted_at IS NULL;

-- ─── products: MPN dedup lookups (GTIN/EAN already have partial unique) ───────
CREATE INDEX IF NOT EXISTS idx_products_mpn
  ON products(mpn)
  WHERE mpn IS NOT NULL;

-- ─── merchant_offers: resolveOfferPrices path (store + ACTIVE + product/variant) ─
CREATE INDEX IF NOT EXISTS idx_offer_store_status_product
  ON merchant_offers(store_id, status, product_id);

CREATE INDEX IF NOT EXISTS idx_offer_store_status_variant
  ON merchant_offers(store_id, status, variant_id)
  WHERE variant_id IS NOT NULL;

-- ─── product_attribute_values: composite filter for detail + facets ─────────────
-- Covers: getProductDetail attributeValues, getFacets aggregation.
CREATE INDEX IF NOT EXISTS idx_pav_product_attr
  ON product_attribute_values(product_id, attribute_definition_id);

-- ─── product_variants: combination_key lookup for dedup guard ───────────────────
CREATE INDEX IF NOT EXISTS idx_variant_product_combkey
  ON product_variants(product_id, combination_key)
  WHERE combination_key IS NOT NULL;

-- ─── audit_logs: resource-scoped queries for catalog governance (Phase 9) ────────
CREATE INDEX IF NOT EXISTS idx_audit_resource_action_created
  ON audit_logs(resource, action, created_at DESC);
