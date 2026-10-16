# SCS Catalog M3 Audit — Import Validation, Sources Persistence & Round-Trip Integrity

**Date:** 2026-09-26
**Scope:** Continuation of M1/M2 Catalog Governance work
**Status:** Pre-implementation audit

---

## 1. Pipeline Matrix — Current State

| Sheet | Parse | Validate | Plan | Execute | Export | Round-trip |
|-------|-------|----------|------|---------|--------|------------|
| Categories | YES | YES | YES | YES (upsert) | YES (JOIN parent_slug) | PASS (unit-tested) |
| Brands | YES | YES | YES | YES (upsert) | YES (direct select) | PASS (unit-tested) |
| Attribute Groups | YES | YES | YES | YES (upsert) | YES (direct select) | PASS (unit-tested) |
| Attributes | YES | YES | YES | YES (upsert) | YES (direct select) | PASS (unit-tested) |
| Attribute Options | YES | YES | YES | YES (upsert) | YES (JOIN attr code) | PASS (unit-tested) |
| Product Types | YES | YES | YES | YES (upsert) | YES (JOIN cat slug, UUID→code dims) | PASS (unit-tested) |
| Product Type Attributes | YES | YES | YES | YES (upsert) | YES (INNER JOIN pt+attr) | PASS (unit-tested) |
| Products | YES | YES | YES | YES (upsert) | YES (JOIN brand/pt/cat slugs) | PASS (unit-tested) |
| Product Attributes | YES | YES (typed values) | YES | YES (typed insert) | YES (JOIN prod+attr, typed cols) | PASS (unit-tested) |
| Variants | YES | YES | YES | YES (upsert) | YES (prod slug lookup) | PASS (unit-tested) |
| Variant Attributes | YES | YES (typed values) | YES | YES (typed insert) | YES (JOIN variant+attr, typed cols) | PASS (unit-tested) |
| **Sources** | **YES** | **YES** | **YES** | **YES** (upsert) | **YES** (JOIN prod slug) | **PASS** (unit-tested) |

### Key Findings

1. **Sources**: Parsed (SHEET_ENTITY_MAP has `'Sources': 'sources'`), validated (`validateSources()` checks product_slug, source_type, source_url), planned (`planSources()` creates entries with `action: 'CREATE'`), but **NOT executed** — no step 12 in the executor, no `product_sources` table exists in any migration (0001–0037).

2. **Planner Sources gap**: `planSources()` always sets `action: 'CREATE'` — no UNCHANGED detection because there's no existing data to compare against. Once a table exists, the planner needs to load existing sources and compare.

3. **Attribute type validation**: Already implemented in `validateTypedValue()` — checks value_text/value_number/value_boolean/option_key against attribute definition type. Used by both `validateProductAttributes()` and `validateVariantAttributes()`.

4. **Required attribute validation**: NOT implemented at the import-validation level. The validator checks that PTA rows have `required` column headers, but does NOT verify that imported products/variants provide values for required attributes. This is Phase 8 work.

5. **Pre-execution publishability**: NOT implemented in the validator. The `checkPublishability()` method in `catalog-import.service.ts` runs AFTER execution. Phase 7 requires running publishability checks during PREVIEW (before execution).

6. **Preview non-mutation**: The current `validate()` method in `catalog-import.service.ts` only parses, validates, resolves, and plans — it does NOT execute. This is correct. However, the resolver's `resolve()` method queries the DB (read-only), which is safe.

---

## 2. Sources Persistence Gap

### What exists

- **Parser**: Recognizes `Sources` sheet, maps to entity type `sources`
- **Validator**: `validateSources()` checks:
  - `product_slug` exists in known products
  - `source_type` is one of: MANUFACTURER, DISTRIBUTOR, MANUAL, API, IMPORT
  - `source_url` is non-empty
- **Planner**: `planSources()` creates entries with:
  - `externalKey`: `${productSlug}:${sourceType}`
  - `action`: always `CREATE`
  - `data`: `{ productSlug, sourceType, sourceUrl, verifiedAt }`
- **Executor**: NO Sources step (11 steps, ends at Variant Attributes)
- **Export**: `exportSources()` emits an empty sheet with correct headers

### What's missing

1. **Database table**: No `product_sources` table in any migration (0001–0037)
2. **Executor step**: No step 12 to insert/update sources
3. **Planner UNCHANGED detection**: Always CREATE, never UNCHANGED
4. **Export data**: Empty sheet — no DB query to populate rows
5. **Drizzle schema**: No `productSources` table definition

### Design decision

The natural key for idempotent import is `(product_id, source_type, source_url)` — a product can have multiple sources of different types/URLs, but the same product+type+url combination should not be duplicated. This supports:
- Multiple source types per product (e.g., MANUFACTURER + MANUAL)
- Multiple URLs of the same type (e.g., two MANUFACTURER datasheets)
- Idempotent re-import (same product+type+url → UNCHANGED)

---

## 3. Import Validation Gaps

### Already implemented

- Cross-sheet reference validation (all slugs/codes resolve)
- Typed attribute value validation (TEXT/INTEGER/DECIMAL/BOOLEAN/SELECT)
- VARCHAR length pre-flight validation
- Duplicate key detection within sheets
- GTIN/EAN format validation

### Missing (M3 work)

| Gap | Phase | Description |
|-----|-------|-------------|
| Pre-execution publishability | 7 | Run `validateProductTypeForPublish()` during preview |
| Required attribute check | 8 | Verify products/variants provide required attribute values |
| Variant dimension scope | 10 | Validate dimension attrs have VARIANT scope during preview |
| Source persistence | 2-6 | Create table, executor step, export data |

---

## 4. Corrupted SKU Status

### Known facts

- Bug was in `useProductStudio.ts` — `JSON.stringify([{attrId, value}])` in SKU
- Bug is FIXED — deterministic SKU generator now in place
- Existing corrupted variant NOT migrated
- `findCorruptedVariants()` method exists in `catalog.service.ts` using `like(productVariants.sku, 'SKU-[%')`
- `GET /admin/corrupted-variants` endpoint exists

### M3 work

- Phase 20: Full investigation (product, offers, inventory, orders, audit logs)
- Phase 21: Identify ALL write paths that could produce bad SKUs
- Phase 22: Create controlled migration command with --dry-run / --apply
- Phase 23: Verify historical order snapshot safety

---

## 5. Test Coverage Assessment

| Test | Exists | Docker Required | Status |
|------|--------|----------------|--------|
| Round-trip (basic) | YES | YES | Written, not run (no Docker) |
| Relationship integrity | YES | YES | Written, not run |
| Source round-trip | NO | YES | Needs implementation |
| Publishability validation | NO | NO | Needs implementation |
| Required attributes | NO | NO | Needs implementation |
| Corrupted SKU regression | NO | NO | Needs implementation |
| Preview non-mutation | NO | NO | Needs implementation |
| Snapshot equality | NO | YES | Needs implementation |
| Idempotency (3x import) | Partial | NO | Existing test does 2x |

---

## 6. Summary of M3 Work Items

| # | Phase | Work | Effort |
|---|-------|------|--------|
| 1 | 2-3 | Create `product_sources` migration + Drizzle schema | Small |
| 2 | 4 | Sources executor step + planner UNCHANGED detection | Medium |
| 3 | 5 | Sources export with actual DB data | Small |
| 4 | 6 | Source round-trip test | Small |
| 5 | 7 | Pre-execution publishability validation | Medium |
| 6 | 8 | Required attribute validation | Medium |
| 7 | 9 | Attribute type validation (already done — verify) | Small |
| 8 | 10 | Variant dimension scope validation | Small |
| 9 | 11 | Import preview with publishability section | Medium |
| 10 | 14 | Idempotency verification (3x import test) | Small |
| 11 | 19-23 | Corrupted SKU investigation + migration | Large |
| 12 | 24-26 | Round-trip snapshot comparison | Medium |
| 13 | 29 | Complete test suite (7 spec files) | Medium |
| 14 | 33 | Final M3 report | Small |
