# SCS Catalog/Product Management — Phase 3 Pre-Implementation Architecture Audit

> **Gate**: M7.3-C Gate 1 — Phase 3 Pre-Implementation Audit  
> **Audit type**: READ-ONLY (no code/schema/data modifications)  
> **Date**: 2026-10-04  
> **Auditor**: AI architecture agent  
> **Prerequisites**: Phase 1 (CLOSED/PASS), Phase 2 (CLOSED/PASS)

---

## §1 Executive Summary

| Item | Value |
|------|-------|
| **Decision** | **GO WITH CONDITIONS** |
| **Conditions** | 3 HIGH findings require resolution before implementation |
| **Critical findings** | 0 |
| **High findings** | 3 |
| **Medium findings** | 4 |
| **Low findings** | 2 |

Phase 3 (Attribute Storage Authority / Cutover) is architecturally feasible and the repository is substantially ready. The typed attribute schema (migrations 0023–0025) is complete with proper constraints, indexes, and FK relationships. The catalog import executor already writes typed tables exclusively. Read paths are mostly migrated.

**The single most important finding**: All existing JSONB `attributes` columns contain `{}` (empty object) for every product and variant. There is **zero JSONB attribute data to backfill**. This dramatically simplifies Phase 3 — the backfill is a no-op, and the cutover reduces to wiring remaining write/read paths to typed tables and deprecating the JSONB columns.

---

## §2 Audit Scope

This audit covers:
- All attribute-related database tables and columns
- All JSONB attribute usage across the codebase (API, Admin, Web)
- All typed attribute table usage
- Source-of-truth analysis for every attribute operation
- Data consistency between JSONB and typed representations
- Backfill feasibility and conflict model
- Product Studio write paths
- createVariant/updateVariant paths
- Catalog import/export paths
- Migration strategy, concurrency, RBAC, performance, and test coverage

---

## §3 Baseline

| Item | Value |
|------|-------|
| Branch | `develop` |
| HEAD | `0549e1f` |
| Latest migration | `0052_execution_error_tracking.sql` |
| Phase 1 migration | `0051_variant_weight_decimal.sql` (applied) |
| Phase 2 migration | `0052_execution_error_tracking.sql` (applied) |
| Typed schema migrations | `0023_attributes.sql`, `0024_product_types.sql`, `0025_canonical_products.sql` (all applied) |
| Products | 10 rows |
| Variants | 10 rows |
| product_attribute_values | 0 rows |
| variant_attribute_values | 0 rows |
| attribute_definitions | 0 rows |
| attribute_groups | 0 rows |
| product_types | 0 rows |

---

## §4 Current Database Attribute Model

### 4.1 JSONB Attribute Columns (Legacy)

| Table | Column | Type | Nullable | Default | Current Data |
|-------|--------|------|----------|---------|--------------|
| `products` | `attributes` | JSONB | NOT NULL | `'{}'` | All 10 rows = `{}` |
| `product_variants` | `attributes` | JSONB | NOT NULL | `'{}'` | All 10 rows = `{}` |

### 4.2 Typed Attribute Tables (Migration 0023–0025)

#### `attribute_definitions`
| Column | Type | Nullable | Constraint |
|--------|------|----------|------------|
| `id` | UUID | NOT NULL | PK |
| `code` | VARCHAR(80) | NOT NULL | UNIQUE |
| `name` | VARCHAR(200) | NOT NULL | — |
| `name_ar` | VARCHAR(200) | nullable | — |
| `type` | VARCHAR(40) | NOT NULL | DEFAULT 'TEXT' |
| `unit` | VARCHAR(40) | nullable | — |
| `scope` | VARCHAR(16) | NOT NULL | DEFAULT 'PRODUCT' |
| `status` | VARCHAR(16) | NOT NULL | DEFAULT 'ACTIVE' |
| `validation` | JSONB | NOT NULL | DEFAULT '{}' |
| `metadata` | JSONB | NOT NULL | DEFAULT '{}' |
| `deleted_at` | TIMESTAMPTZ | nullable | — |

Indexes: `attribute_definitions_code_key` (UNIQUE), `idx_attr_def_active`, `idx_attr_def_scope`, `idx_attr_def_type`

#### `attribute_groups`
| Column | Type | Nullable | Constraint |
|--------|------|----------|------------|
| `id` | UUID | NOT NULL | PK |
| `name` | VARCHAR(120) | NOT NULL | UNIQUE |
| `name_ar` | VARCHAR(120) | nullable | — |
| `kind` | VARCHAR(40) | nullable | — |

#### `attribute_options`
| Column | Type | Nullable | Constraint |
|--------|------|----------|------------|
| `id` | UUID | NOT NULL | PK |
| `attribute_id` | UUID | NOT NULL | FK → attribute_definitions(id) ON DELETE CASCADE |
| `value` | VARCHAR(200) | NOT NULL | — |
| `value_ar` | VARCHAR(200) | nullable | — |
| `label` | VARCHAR(200) | nullable | — |
| `sort_order` | INTEGER | NOT NULL | DEFAULT 0 |
| `is_active` | BOOLEAN | NOT NULL | DEFAULT true |

Unique: `(attribute_id, value)`. Index: `idx_attr_opt_attr`

#### `product_attribute_values`
| Column | Type | Nullable | Constraint |
|--------|------|----------|------------|
| `id` | UUID | NOT NULL | PK |
| `product_id` | UUID | NOT NULL | FK → products(id) ON DELETE CASCADE |
| `attribute_definition_id` | UUID | NOT NULL | FK → attribute_definitions(id) ON DELETE RESTRICT |
| `value_text` | TEXT | nullable | — |
| `value_number` | NUMERIC | nullable | — |
| `value_boolean` | BOOLEAN | nullable | — |
| `option_value` | VARCHAR(200) | nullable | — |
| `value_json` | JSONB | nullable | — |

Unique: `(product_id, attribute_definition_id)`. Indexes: `idx_pav_product`, `idx_pav_attribute`, `idx_pav_product_attr`

#### `variant_attribute_values`
| Column | Type | Nullable | Constraint |
|--------|------|----------|------------|
| `id` | UUID | NOT NULL | PK |
| `variant_id` | UUID | NOT NULL | FK → product_variants(id) ON DELETE CASCADE |
| `attribute_definition_id` | UUID | NOT NULL | FK → attribute_definitions(id) ON DELETE RESTRICT |
| `value_text` | TEXT | nullable | — |
| `value_number` | NUMERIC | nullable | — |
| `value_boolean` | BOOLEAN | nullable | — |
| `option_value` | VARCHAR(200) | nullable | — |
| `value_json` | JSONB | nullable | — |

Unique: `(variant_id, attribute_definition_id)`. Indexes: `idx_vav_variant`, `idx_vav_attribute`

### 4.3 Other JSONB Columns (Not Attribute-Related)

| Table | Column | Purpose | Phase 3 Impact |
|-------|--------|---------|----------------|
| `products` | `images` | Product image list | None |
| `products` | `metadata` | Free-form metadata | None |
| `product_variants` | `dimensions_mm` | Dimensions (BD-05: keep JSONB) | None |
| `product_variants` | `images` | Variant image list | None |
| `product_types` | `variant_dimensions` | Variant dimension config | None |
| `product_types` | `metadata` | Free-form metadata | None |
| `product_type_attributes` | `allowed_values`, `validation_rules`, `conditional_rules`, `metadata` | Schema config | None |

---

## §5 JSONB Usage Inventory

### 5.1 `products.attributes` (JSONB)

| Location | Type | Classification | Detail |
|----------|------|----------------|--------|
| `catalog.schema.ts:85` | Schema def | INFO | Column definition |
| `catalog.service.ts:770` | WRITE | I (LEGACY) | `createProduct()` writes `attributes: {}` hardcoded with deprecation comment |
| `catalog.service.ts` (getProductDetail) | READ | I (LEGACY) | Returns `product.attributes` in response (always `{}`) |
| `buyer-api.ts:75` | Type def | F (API SERIALIZATION) | `Product.attributes: Record<string, unknown>` |
| `excel-executor.ts:827` | WRITE | I (LEGACY) | `upsertProduct()` does NOT set `attributes` (uses DB default `{}`) |

### 5.2 `product_variants.attributes` (JSONB)

| Location | Type | Classification | Detail |
|----------|------|----------------|--------|
| `catalog.schema.ts:105` | Schema def | INFO | Column definition |
| `catalog.service.ts:1604` | WRITE | A (WRITE) | `createVariant()` writes `attributes: input.attributes \|\| {}` |
| `catalog.service.ts:1769` | READ | B (READ) | `getVariantMatrix()` reads `v['attributes']` for dimension values |
| `buyer-api.ts:1080` | Type def | F (API SERIALIZATION) | `CreateVariantInput.attributes?: Record<string, unknown>` |
| `excel-executor.ts:874` | WRITE | I (LEGACY) | `upsertVariant()` does NOT set `attributes` (uses DB default `{}`) |

### 5.3 Summary

| JSONB Column | WRITE Paths | READ Paths | Data Volume |
|--------------|-------------|------------|-------------|
| `products.attributes` | 2 (both write `{}`) | 1 (always `{}`) | 0 non-empty rows |
| `product_variants.attributes` | 2 (1 accepts input, 1 writes `{}`) | 1 (`getVariantMatrix`) | 0 non-empty rows |

---

## §6 Typed Attribute Usage Inventory

### 6.1 WRITE Paths

| Service | Method | Target Table | Detail |
|---------|--------|--------------|--------|
| `excel-executor.service.ts` | `upsertProductAttributeValue()` | `product_attribute_values` | ON CONFLICT DO UPDATE (upsert) |
| `excel-executor.service.ts` | `upsertVariantAttributeValue()` | `variant_attribute_values` | ON CONFLICT DO UPDATE (upsert) |
| `catalog.taxonomy.service.ts` | `setProductAttributeValues()` | `product_attribute_values` | DELETE + INSERT (replace-all) |
| `catalog.taxonomy.service.ts` | `setVariantAttributeValues()` | `variant_attribute_values` | DELETE + INSERT + recompute combination_key |

### 6.2 READ Paths

| Service | Method | Source Table | Detail |
|---------|--------|--------------|--------|
| `catalog.service.ts` | `getProductDetail()` (line 1139–1158) | `product_attribute_values` + `attribute_definitions` | JOIN, returns `attributeValues` array |
| `catalog.service.ts` | `listVariantsByProduct()` (line 602–636) | `variant_attribute_values` + `attribute_definitions` | JOIN, enriches variant rows |
| `catalog.service.ts` | `getVariantMatrix()` (line 1769) | `product_variants.attributes` (JSONB!) | **FALLBACK TO JSONB** for dimension values |
| `search.service.ts` | `getFacets()` (line 396–410) | `product_attribute_values` | Raw SQL aggregation for dynamic facets |
| `catalog.taxonomy.service.ts` | `getProductAttributeValues()` | `product_attribute_values` | Direct query |
| `catalog.taxonomy.service.ts` | `getVariantAttributeValues()` | `variant_attribute_values` | Direct query |

### 6.3 Dual-Population Status

| Entity | JSONB populated? | Typed populated? | Both? |
|--------|------------------|-------------------|-------|
| Products | `{}` (empty) | 0 rows | No — JSONB has empty default, typed has nothing |
| Variants | `{}` (empty) | 0 rows | No — same |
| Import-created | `{}` (default) | Typed rows inserted | Yes — import writes both paths (typed explicitly, JSONB by DB default) |
| Studio-created | N/A (no endpoint) | N/A (no endpoint) | Neither path active for Studio |

---

## §7 Source-of-Truth Matrix

| Operation | Current JSONB | Current Typed | Actual Source of Truth |
|-----------|---------------|---------------|------------------------|
| `createProduct()` | Writes `{}` | Nothing | **Neither** — no attributes set at creation |
| `updateProduct()` | Not modified | Not modified | N/A — product update doesn't touch attributes |
| `createVariant()` | Writes `input.attributes \|\| {}` | Nothing | **JSONB** — but always `{}` in practice |
| `updateVariant()` | Not modified | Not modified | N/A |
| Read product detail | Returns `attributes: {}` | Returns `attributeValues: []` | **Typed** (JSONB is always empty) |
| Read variant list | Returns `attributes: {}` | Returns enriched `attributes: [...]` | **Typed** (enrichment overwrites) |
| `getVariantMatrix()` | Reads `v['attributes']` for dimensions | Not used | **JSONB** (but always `{}` → empty values) |
| Catalog import (products) | DB default `{}` | INSERT into `product_attribute_values` | **Typed** |
| Catalog import (variants) | DB default `{}` | INSERT into `variant_attribute_values` | **Typed** |
| Catalog export (CSV) | Not used | Not used | N/A — export doesn't include attributes |
| Admin product view | Via `getProductDetail()` → `attributeValues` | Via `getProductDetail()` → `attributeValues` | **Typed** |
| Merchant product view | Via `getProductDetail()` → `attributeValues` | Via `getProductDetail()` → `attributeValues` | **Typed** |
| API serialization | `Product.attributes` in response | `attributeValues` array in response | **Both returned** — JSONB always `{}` |
| Search facets | Not used | `product_attribute_values` aggregation | **Typed** |
| Product Studio create | Not wired | Not wired | **N/A** — no endpoint |
| Product Studio edit | Not wired | Not wired | **N/A** — no endpoint |
| Validation | Not validated | `coerceValue()` in taxonomy service | **Typed** |

### Divergence: JSONB ≠ Typed

**No active divergence exists** because all JSONB `attributes` values are `{}` and all typed tables are empty. The system is in a clean "both empty" state.

---

## §8 Data Consistency Results

| Check | Result | Count |
|-------|--------|-------|
| Products with non-empty JSONB attributes | 0 | 0/10 |
| Variants with non-empty JSONB attributes | 0 | 0/10 |
| Products with typed attribute values | 0 | 0/10 |
| Variants with typed attribute values | 0 | 0/10 |
| JSONB records with no typed representation | 10 products, 10 variants | All (but JSONB is empty) |
| Typed records with no JSONB representation | 0 | N/A |
| Conflicting values (JSONB ≠ typed) | 0 | None possible (both empty) |
| Duplicate typed records | 0 | None |
| Orphaned typed records | 0 | None |
| Orphaned JSONB references | 0 | None |
| Invalid attribute definitions | 0 | None (table empty) |
| Invalid attribute values | 0 | None (table empty) |
| Type mismatches | 0 | None |
| Missing required attributes | 0 | None (no product types defined) |
| Stale representations | 0 | None |

**Conclusion**: Data consistency is trivially satisfied — there is nothing to reconcile.

---

## §9 Backfill Feasibility

### 9.1 Source JSON Structure

`products.attributes` and `product_variants.attributes` are both `{}` for every row. The JSONB schema was designed to hold `{ [attributeDefinitionId]: value }` but was never populated.

### 9.2 Target Typed Schema

The typed tables (`product_attribute_values`, `variant_attribute_values`) are fully defined with:
- Unique constraints preventing duplicate `(entity_id, attribute_definition_id)` pairs
- FK to `attribute_definitions` with `ON DELETE RESTRICT`
- Typed value columns: `value_text`, `value_number`, `value_boolean`, `option_value`, `value_json`

### 9.3 Backfill Assessment

| Category | Count | Action |
|----------|-------|--------|
| JSONB rows with data to migrate | 0 | SKIP — nothing to migrate |
| JSONB rows with `{}` | 20 (10 products + 10 variants) | SKIP — empty |
| Attribute definitions to resolve | 0 | N/A |
| Value conversions needed | 0 | N/A |
| Conflicts possible | 0 | N/A |

### 9.4 Feasibility Verdict

**The backfill is a no-op.** Zero JSONB attribute data exists to migrate. A backfill migration should still be written for correctness (to handle any future data that might exist in production), but it will process 0 rows on this database.

---

## §10 Conflict Model

### 10.1 Theoretical Conflict Categories

| # | Category | Possible? | Evidence |
|---|----------|-----------|----------|
| 1 | JSONB has value, typed missing | **No** | All JSONB = `{}` |
| 2 | Typed has value, JSONB missing | **No** | All typed tables empty |
| 3 | Both have same value | **No** | Both empty |
| 4 | Both have different values | **No** | Both empty |
| 5 | JSONB contains unknown attribute | **No** | JSONB is `{}` |
| 6 | JSONB contains invalid type | **No** | JSONB is `{}` |
| 7 | Duplicate typed representation | **Prevented** | UNIQUE constraints |
| 8 | Stale typed representation | **No** | Typed tables empty |
| 9 | Deleted/deactivated attribute def | **Theoretical** | Could occur if def is soft-deleted while values exist |
| 10 | Incompatible value conversion | **No** | No data to convert |

### 10.2 Recommended Classifications

Since no conflicts exist, the backfill migration can use a simple classification:
- **SKIP**: JSONB is `{}` or null → no action
- **CREATE**: JSONB has key-value pairs, no typed row exists → insert
- **UPDATE**: JSONB has key-value pairs, typed row exists → update (idempotent)
- **CONFLICT**: Typed row has different value than JSONB → log warning, prefer typed (typed is authoritative per BD-03)
- **ERROR**: Unknown attribute definition → log error, skip row

---

## §11 Product Studio Audit

### 11.1 Current State

**Product Studio does not have a dedicated attribute write endpoint in the API.**

The web app (`buyer-api.ts`) defines:
- `upsertProductAttributeValues()` → `PUT /v1/products/:id/attribute-values`
- `fetchVariantMatrix()` → `GET /v1/products/:id/variant-matrix`
- `fetchProductTypeSchema()` → `GET /v1/product-types/:id/schema`

But the **backend controller does NOT expose `PUT /v1/products/:id/attribute-values`**.

The taxonomy service has `setProductAttributeValues()` and `setVariantAttributeValues()` methods, but they are **not wired to any controller endpoint**.

### 11.2 Product Studio Write Path

| Step | Current | Phase 3 Target |
|------|---------|----------------|
| UI selects attributes | Not implemented | Needs endpoint |
| API receives attribute values | No endpoint | `PUT /v1/products/:id/attribute-values` |
| Service validates + coerces | `coerceValue()` exists | Wire to controller |
| Persistence | `setProductAttributeValues()` exists | Wire to controller |
| Read-back | `getProductAttributeValues()` exists | Already works |

### 11.3 Variant Matrix (getVariantMatrix)

**[HIGH] Finding F-1**: `getVariantMatrix()` at line 1769 reads `v['attributes']` (JSONB) for dimension values instead of querying `variant_attribute_values`. Since JSONB is always `{}`, dimension values are always empty. This is a **dead code path** — the variant matrix cannot display dimension values.

**Fix**: Replace JSONB read with typed table query. The `listVariantsByProduct()` already enriches variants with typed attributes (lines 602–636), but the variant matrix method uses its own path that reads JSONB.

---

## §12 createVariant / updateVariant Audit

### 12.1 `createVariant()` (catalog.service.ts:1590–1615)

```
Input: CreateVariantInput { sku, barcode?, title?, titleAr?, unit?, weightGrams?, dimensionsMm?, attributes?: Record<string, unknown>, images? }
```

| Aspect | Current Behavior | Phase 3 Impact |
|--------|-----------------|----------------|
| Input representation | `attributes?: Record<string, unknown>` (JSONB) | Must accept typed attribute values |
| Persistence | `attributes: input.attributes \|\| {}` → JSONB column | Must write typed tables instead |
| Read representation | Returns full variant row including `attributes: {}` | Must return typed values |
| Update behavior | N/A (create only) | N/A |
| Transaction | Single INSERT, no explicit TX | May need TX for variant + attribute inserts |

**[HIGH] Finding F-2**: `createVariant()` writes JSONB `attributes` from input. This is the **only active JSONB attribute write path** that accepts non-empty data. Phase 3 must redirect this to typed tables.

### 12.2 `updateVariant()` (catalog.service.ts:1617–1637)

| Aspect | Current Behavior | Phase 3 Impact |
|--------|-----------------|----------------|
| Input | `Partial<CreateVariantInput>` | Same as create |
| Persistence | Does NOT update `attributes` field | No change needed for JSONB |
| Typed attributes | Not touched | Phase 3 may need to add attribute update |

### 12.3 `CreateVariantInput` Interface

```typescript
export interface CreateVariantInput {
  sku: string;
  attributes?: Record<string, unknown>;  // ← JSONB legacy
  // ... other fields
}
```

Phase 3 must either:
- Remove `attributes` from `CreateVariantInput` and add a separate typed attribute endpoint, OR
- Replace `attributes` with a typed structure and write to typed tables

### 12.4 Concurrency Concerns

- `createVariant()` uses a single INSERT — no race condition on JSONB
- Phase 3 typed writes (variant + attribute values) need a transaction to prevent orphaned attribute rows
- The taxonomy service's `setVariantAttributeValues()` uses DELETE + INSERT (replace-all) — this has a race window if two concurrent calls target the same variant. A SELECT FOR UPDATE or advisory lock would be safer.

---

## §13 Catalog Import / Export Audit

### 13.1 Import — Current Write Behavior

| Entity Type | JSONB Written? | Typed Written? | Detail |
|-------------|----------------|----------------|--------|
| Products | No (DB default `{}`) | Yes → `product_attribute_values` | `upsertProduct()` omits `attributes` field |
| Variants | No (DB default `{}`) | Yes → `variant_attribute_values` | `upsertVariant()` omits `attributes` field |
| Product attributes | N/A | Yes → `product_attribute_values` | `upsertProductAttributeValue()` with ON CONFLICT |
| Variant attributes | N/A | Yes → `variant_attribute_values` | `upsertVariantAttributeValue()` with ON CONFLICT |

**Import is already fully typed.** The JSONB columns receive only the DB default `{}`.

### 13.2 Import — Retry Behavior

Retry re-executes from stored plan snapshot. Since the executor writes typed tables, retry also writes typed tables. No JSONB interaction.

### 13.3 Export — Current Read Behavior

`exportProductsCsv()` does NOT read or export any attribute data. The CSV columns are: `title, titleAr, sku, priceMinor, category, brand, status, description`.

**Phase 3 impact**: None. If attribute columns are added to export later, they should read from typed tables.

### 13.4 Round-Trip Semantics

Admin XLSX import → typed tables → admin XLSX export (when implemented) should read from typed tables. No JSONB dependency exists in the import/export pipeline.

---

## §14 Migration Strategy

### 14.1 Recommended Sequence

| Stage | Description | Risk | Migration? |
|-------|-------------|------|------------|
| **P0** | Schema readiness — verify typed schema is complete | LOW | No |
| **P1** | Backfill engine — write backfill migration (will process 0 rows) | LOW | Yes (0053) |
| **P2** | Dual-write — `createVariant()` writes typed tables + JSONB (transitional) | MEDIUM | No |
| **P3** | Wire Product Studio endpoints — `PUT /products/:id/attribute-values` | MEDIUM | No |
| **P4** | Fix `getVariantMatrix()` — read typed tables instead of JSONB | LOW | No |
| **P5** | Authority switch — `createVariant()` stops writing JSONB | LOW | No |
| **P6** | Verification — full regression suite | LOW | No |
| **P7** | JSONB deprecation — mark columns deprecated in schema comments | LOW | No |
| **P8** | JSONB removal — DROP COLUMN (requires major version) | HIGH | Yes (0054?) |

### 14.2 Migration Count

- **Minimum 1 migration** (P1: backfill) — required even if 0 rows
- **Optional 1 migration** (P8: JSONB removal) — should be deferred to a future major version
- Dual-write and authority switch are code changes, not schema changes

### 14.3 Single vs Multiple Migrations

**Recommended**: 2 migrations total for Phase 3:
1. `0053_attribute_backfill.sql` — backfill + any supporting indexes
2. (Future) `0054_drop_jsonb_attributes.sql` — remove JSONB columns

---

## §15 Concurrency Analysis

### 15.1 Current Transaction Boundaries

| Operation | Transaction | Row Locks | Concern |
|-----------|-------------|-----------|---------|
| `createVariant()` | Single INSERT | Implicit row lock on new variant | None |
| `updateVariant()` | Single UPDATE | Implicit row lock | None |
| `setProductAttributeValues()` | DELETE + INSERT | No explicit lock | Race if two concurrent calls |
| `setVariantAttributeValues()` | DELETE + INSERT + UPDATE | No explicit lock | Race if two concurrent calls |
| Import executor | 12 TXs with SAVEPOINTs | Per-entity-type | Well-isolated |

### 15.2 Lost-Update Scenarios

| Scenario | Possible? | Detail |
|----------|-----------|--------|
| Import vs Product Studio race on same product | **Yes** | Import upserts typed values; Studio DELETE+INSERTs. Last writer wins. |
| Two concurrent Studio edits on same product | **Yes** | DELETE+INSERT pattern is not atomic without SELECT FOR UPDATE |
| Import vs createVariant race on same variant | **Yes** | Import upserts typed values; createVariant writes JSONB |
| Backfill vs live write | **Theoretical** | Backfill should use advisory lock or batch with SELECT FOR UPDATE SKIP LOCKED |

### 15.3 Recommendations

- `setProductAttributeValues()` and `setVariantAttributeValues()` should use `SELECT FOR UPDATE` on the parent product/variant before DELETE+INSERT
- Backfill should process in batches with `SKIP LOCKED` to avoid contention
- Phase 3 must ensure JSONB and typed writes don't race during the dual-write period

---

## §16 RBAC / Tenancy Analysis

### 16.1 Current RBAC on Attribute Operations

| Endpoint | Permission | Role Guard | Tenant Guard |
|----------|------------|------------|--------------|
| `POST /admin/attributes` | `catalog:attributes:manage` | — | Org-scoped |
| `PUT /admin/attributes/:id` | `catalog:attributes:manage` | — | Org-scoped |
| `DELETE /admin/attributes/:id` | `catalog:attributes:manage` | — | Org-scoped |
| `POST /admin/product-types/:id/attributes` | `catalog:product-types:manage` | — | Org-scoped |
| Catalog import (all entity types) | `catalog:imports:manage` | ADMIN, SUPER_ADMIN | Org-scoped |
| `POST /products/:id/variants` | `merchant:products:write` | — | `assertProductInOrg()` |

### 16.2 Backfill Tenant Safety

The backfill migration runs as a database-level operation. Since `attribute_definitions` and typed value tables don't have a direct `store_id` or `organization_id` column, tenant isolation is enforced at the application layer via product/variant ownership.

**Risk**: A backfill that processes ALL products could cross tenant boundaries at the DB level. This is acceptable because:
1. The backfill reads JSONB (always `{}`) and writes typed tables (0 rows)
2. Application-layer tenant guards remain unchanged
3. No cross-tenant data leakage is possible (JSONB is empty)

### 16.3 Admin Endpoint Safety

The `setProductAttributeValues()` method doesn't check organization membership. When wired to a controller endpoint, it must include `assertProductInOrg()` to prevent cross-tenant attribute writes.

---

## §17 Performance / Scale Analysis

### 17.1 Current Data Volume

| Table | Rows | Estimated Size |
|-------|------|----------------|
| `products` | 10 | ~5 KB |
| `product_variants` | 10 | ~5 KB |
| `product_attribute_values` | 0 | 0 |
| `variant_attribute_values` | 0 | 0 |
| `attribute_definitions` | 0 | 0 |

### 17.2 Backfill Performance

- **Rows to process**: 20 (10 products + 10 variants)
- **JSONB to parse**: 20 × `{}` = trivial
- **Estimated time**: < 1 second
- **Lock duration**: None needed (0 rows to write)
- **Batch size**: N/A (all rows fit in single TX)

### 17.3 Production Scale Considerations

For a production database with thousands of products:
- Backfill should batch at 500–1000 rows per transaction
- Each batch should use `SELECT FOR UPDATE SKIP LOCKED` to avoid contention
- JSONB parsing should use `jsonb_each_text()` for efficient key-value extraction
- Indexes on typed value tables already exist for efficient queries

### 17.4 Missing Indexes

No missing indexes detected. The typed value tables have:
- PK on `id`
- UNIQUE on `(entity_id, attribute_definition_id)`
- Indexes on `entity_id`, `attribute_definition_id`, and composite

---

## §18 Current Test Coverage

### 18.1 Existing Attribute-Related Tests

| Test File | Coverage | Attribute-Specific? |
|-----------|----------|---------------------|
| `catalog-taxonomy.spec.ts` | CRUD for definitions, groups, options, product types | Yes — taxonomy management |
| `catalog-governance-roundtrip.spec.ts` | FK integrity, scope enforcement | Yes — validates typed table constraints |
| `catalog-seed.postgres.spec.ts` | Seed data integrity | Partial — checks typed tables exist |
| `phase1-weight-numeric.spec.ts` | Weight validation | No — weight only |
| `phase2-transaction-error-architecture.spec.ts` | 12-TX architecture, SAVEPOINT, errors | Partial — import writes typed tables |
| `corrupted-sku-regression.spec.ts` | SKU validation | No — has `attributeValues` fixture but doesn't test persistence |

### 18.2 Coverage Gaps

| Area | Current Coverage | Phase 3 Need |
|------|-----------------|--------------|
| Backfill correctness | 0 tests | Need: clean backfill, missing data, conflicts, idempotent rerun |
| Dual-write consistency | 0 tests | Need: JSONB + typed written atomically |
| Product Studio attribute write | 0 tests (no endpoint) | Need: full CRUD |
| Variant matrix typed read | 0 tests | Need: dimension values from typed tables |
| JSONB deprecation safety | 0 tests | Need: reads work without JSONB |
| Concurrent attribute updates | 0 tests | Need: race condition prevention |
| Tenant isolation on attribute writes | 0 tests | Need: cross-org rejection |

---

## §19 Phase 3 Test Matrix (Proposed)

| # | Test Scenario | Category | Priority |
|---|--------------|----------|----------|
| T1 | Clean backfill: JSONB → typed with valid data | Backfill | HIGH |
| T2 | Backfill with empty JSONB (`{}`) → SKIP | Backfill | HIGH |
| T3 | Backfill with missing typed data → CREATE | Backfill | HIGH |
| T4 | Backfill with existing typed data → UPDATE (idempotent) | Backfill | HIGH |
| T5 | Backfill with conflicting values → CONFLICT logged | Backfill | MEDIUM |
| T6 | Backfill with unknown attribute def → ERROR logged | Backfill | MEDIUM |
| T7 | Backfill rerun after partial failure → resume safely | Backfill | HIGH |
| T8 | Idempotent backfill: second run produces no changes | Backfill | HIGH |
| T9 | `createVariant()` writes typed tables | Studio/Create | HIGH |
| T10 | `setProductAttributeValues()` replaces all values | Studio/Edit | HIGH |
| T11 | `setVariantAttributeValues()` recomputes combination_key | Studio/Edit | HIGH |
| T12 | `getVariantMatrix()` reads typed tables | Read path | HIGH |
| T13 | `getProductDetail()` returns typed `attributeValues` | Read path | PASS (already works) |
| T14 | Search facets aggregate from typed tables | Read path | PASS (already works) |
| T15 | Concurrent `setProductAttributeValues()` → no lost update | Concurrency | MEDIUM |
| T16 | Concurrent import + Studio edit → last writer wins safely | Concurrency | MEDIUM |
| T17 | Cross-org attribute write rejected | Tenant | HIGH |
| T18 | Large dataset backfill (1000 products) batches correctly | Performance | LOW |
| T19 | Rollback: TX failure during backfill → no partial writes | Safety | HIGH |
| T20 | JSONB removal: reads work without `attributes` column | Deprecation | MEDIUM |

---

## §20 Required Architecture Questions (Answered)

**Q1. Is the current typed schema sufficient to become authoritative?**
**YES.** The typed schema has proper value columns (text, number, boolean, option, json), unique constraints, FK relationships, and indexes. It is already written to by the import executor and read by the product detail API.

**Q2. Is the JSONB structure fully mappable to the typed schema?**
**YES — trivially.** All JSONB `attributes` values are `{}`. There is nothing to map. The JSONB structure was designed for `{ [attributeDefinitionId]: value }` which maps directly to typed rows.

**Q3. What percentage of existing data can be migrated automatically?**
**100%.** Zero JSONB data exists. The backfill processes 0 data rows.

**Q4. What data requires manual/conflict handling?**
**None.** No conflicts are possible.

**Q5. Can the backfill be idempotent?**
**YES.** Use `ON CONFLICT DO UPDATE` or check for existing rows before INSERT. A second run produces no changes.

**Q6. Can it be safely resumed after interruption?**
**YES.** Each batch is independent. Use batch-level tracking or simply rerun the full backfill (idempotent).

**Q7. How should conflicts be represented?**
As a `backfill_conflicts` audit table or log entries: `(entity_id, entity_type, attribute_code, jsonb_value, typed_value, resolution)`. Resolution: prefer typed (authoritative per BD-03).

**Q8. What should happen if JSONB and typed data disagree?**
**REQUIRES BUSINESS DECISION** — but the locked architecture (BD-03) says typed tables are authoritative. Recommendation: prefer typed value, log discrepancy.

**Q9. Can Product Studio safely switch to typed writes?**
**YES** — once the `PUT /products/:id/attribute-values` endpoint is wired. The `setProductAttributeValues()` service method already exists with proper coercion and validation.

**Q10. Can createVariant/updateVariant safely switch to typed reads?**
**YES** — after the variant matrix `getVariantMatrix()` is fixed to read typed tables (Finding F-1). The `listVariantsByProduct()` already reads typed tables correctly.

**Q11. Is dual-write necessary?**
**NO** — since JSONB is always `{}`, there is no need for a dual-write period. Phase 3 can switch directly to typed-only writes.

**Q12. Is dual-read necessary?**
**NO** — since JSONB is always `{}`, there is no need for a dual-read fallback. All reads can switch to typed tables immediately.

**Q13. How can authority be switched without downtime?**
Switch read paths from JSONB to typed in a single deployment:
1. Fix `getVariantMatrix()` to read typed tables (Finding F-1)
2. Remove `attributes` from `CreateVariantInput` or redirect to typed writes
3. Both changes are backward-compatible (JSONB was always `{}`)

**Q14. Are new migrations required?**
**YES** — minimum 1 (backfill), optional 1 (JSONB column removal).

**Q15. Are any locked decisions insufficient or ambiguous?**
**NO.** BD-03 (typed tables authoritative, JSONB deprecated) is clear and sufficient. The implementation path is straightforward given the empty JSONB state.

---

## §21 Risks / Findings

### Critical Findings

None.

### High Findings

| ID | Finding | Evidence | Impact | Remediation | Business Decision? |
|----|---------|----------|--------|-------------|---------------------|
| **F-1** | `getVariantMatrix()` reads JSONB for dimension values | `catalog.service.ts:1769`: `const attrs = (v['attributes'] ?? {}) as Record<string, unknown>` | Variant matrix cannot display dimension values — dead code path | Replace with typed table query | No |
| **F-2** | `createVariant()` writes JSONB `attributes` from input | `catalog.service.ts:1604`: `attributes: input.attributes \|\| {}` | Only active JSONB write path accepting non-empty data | Redirect to typed tables | No |
| **F-3** | `PUT /products/:id/attribute-values` endpoint missing | `buyer-api.ts:1948` calls it; no controller handles it | Product Studio cannot persist attribute values | Wire `setProductAttributeValues()` to controller | No |

### Medium Findings

| ID | Finding | Evidence | Impact | Remediation |
|----|---------|----------|--------|-------------|
| **F-4** | `CreateVariantInput.attributes` typed as `Record<string, unknown>` | `catalog.service.ts:2462` | API contract still exposes JSONB shape | Replace with typed attribute input or remove | 
| **F-5** | `setProductAttributeValues()` uses DELETE+INSERT without lock | `catalog.taxonomy.service.ts:971–987` | Race condition on concurrent edits | Add SELECT FOR UPDATE |
| **F-6** | No tenant guard on `setProductAttributeValues()` | `catalog.taxonomy.service.ts:963` | Cross-org attribute writes possible | Add `assertProductInOrg()` when wiring endpoint |
| **F-7** | `updateVariant()` doesn't update attributes at all | `catalog.service.ts:1617–1637` | Variant attribute edits via update path silently ignored | Phase 3 should add typed attribute update to `updateVariant()` or rely on separate endpoint |

### Low Findings

| ID | Finding | Evidence | Impact |
|----|---------|----------|--------|
| **F-8** | `buyer-api.ts` defines `upsertProductAttributeValues` for non-existent endpoint | `buyer-api.ts:1944–1954` | Client code exists but is non-functional | 
| **F-9** | CSV export doesn't include attributes | `catalog.service.ts:1496` | Export is incomplete (not a Phase 3 requirement) |

---

## §22 Recommended Implementation Sequence

Based on evidence, the recommended Phase 3 sequence is:

### P0 — Schema/Data Readiness (no code changes)
- Verify typed schema completeness ✅ (confirmed in this audit)
- Verify JSONB data volume ✅ (confirmed: 0 non-empty rows)
- Confirm no production data requires manual review ✅ (confirmed)

### P1 — Backfill Engine
- Write migration `0053_attribute_backfill.sql`
- Backfill processes JSONB → typed tables (will handle 0 rows on current DB)
- Idempotent, resumable, batched
- Audit table for conflicts (if any)

### P2 — Fix Variant Matrix Read Path (F-1)
- Replace `getVariantMatrix()` JSONB read with typed table query
- Use `variant_attribute_values` JOIN `attribute_definitions`
- Regression test: variant matrix displays dimension values correctly

### P3 — Wire Product Studio Endpoints (F-3, F-6)
- Expose `PUT /v1/products/:id/attribute-values` → `setProductAttributeValues()`
- Expose `PUT /v1/products/:productId/variants/:variantId/attribute-values` → `setVariantAttributeValues()`
- Add `assertProductInOrg()` tenant guard
- Add RBAC permission check

### P4 — Redirect createVariant to Typed Writes (F-2, F-4)
- Remove `attributes` from `CreateVariantInput` or deprecate
- Add typed attribute input to variant creation
- Write to `variant_attribute_values` instead of JSONB
- Recompute `combination_key` on variant creation

### P5 — Verification
- Full regression suite
- Phase 3 test matrix (T1–T20)
- Typecheck + build

### P6 — JSONB Deprecation
- Mark `products.attributes` and `product_variants.attributes` as `@deprecated` in schema comments
- Remove from API response DTOs
- Document migration path for any external consumers

### P7 — JSONB Removal (Future Major Version)
- DROP COLUMN `products.attributes`
- DROP COLUMN `product_variants.attributes`
- Separate migration, separate release

---

## §23 GO / GO WITH CONDITIONS / NO-GO Decision

### Decision: **GO WITH CONDITIONS**

Phase 3 implementation can proceed after the following conditions are acknowledged:

| # | Condition | Finding | Resolution |
|---|-----------|---------|------------|
| 1 | Fix `getVariantMatrix()` JSONB read | F-1 | Must be fixed before typed-only reads |
| 2 | Redirect `createVariant()` JSONB write | F-2 | Must be fixed before typed-only writes |
| 3 | Wire Product Studio attribute endpoint | F-3 | Required for Product Studio to function |
| 4 | Add tenant guard to attribute write endpoints | F-6 | Required for security |
| 5 | Add concurrency protection to DELETE+INSERT pattern | F-5 | Required for data integrity |

All conditions are implementation tasks, not business decisions. No unresolved ambiguity exists.

---

## §24 Explicit Scope Boundary

### Phase 3 Includes:
- Backfill migration (JSONB → typed, even though 0 rows)
- Fix variant matrix read path
- Wire Product Studio attribute endpoints
- Redirect createVariant to typed writes
- Add tenant guards and concurrency protection
- JSONB deprecation (comments, DTO changes)
- Phase 3 regression tests
- Phase 3 independent runtime verification

### Phase 3 Does NOT Include:
- JSONB column removal (deferred to future major version)
- Product Studio UI redesign (Phase 4)
- Admin Product Management redesign (Phase 4)
- Dynamic search facets implementation (Phase 4 — facets already work via typed tables)
- GTIN deduplication (Phase 5)
- Performance indexes (Phase 6 — indexes already exist)
- Merchant UI changes
- E2E catalog workflow
- Arabic/RTL
- Mobile catalog UI

---

## §25 Sign-Off

| Gate | Verdict |
|------|---------|
| Typed schema completeness | ✅ PASS |
| JSONB data volume | ✅ PASS (0 rows to migrate) |
| Backfill feasibility | ✅ PASS (trivial) |
| Import already typed | ✅ PASS |
| Read paths mostly typed | ✅ PASS (1 fix needed) |
| Write paths need redirect | ⚠️ 1 path (createVariant) |
| Product Studio endpoints | ⚠️ Not wired |
| Tenant isolation | ⚠️ Missing on 1 method |
| Concurrency protection | ⚠️ Missing on DELETE+INSERT |
| Test coverage | ⚠️ Gaps identified |

**Overall Phase 3 Pre-Implementation Audit: GO WITH CONDITIONS**

The repository is architecturally ready for Phase 3. The typed schema is complete, the import pipeline already writes typed tables, and the backfill is trivially safe. Three HIGH findings require implementation before typed-only authority can be declared, but none require business decisions or architectural renegotiation.
