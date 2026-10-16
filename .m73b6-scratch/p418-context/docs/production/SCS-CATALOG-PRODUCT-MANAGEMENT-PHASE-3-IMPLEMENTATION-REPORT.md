# SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-3-IMPLEMENTATION-REPORT

## Phase 3: Attribute Storage Authority / Cutover

**Date:** 2026-10-04
**Branch:** develop
**HEAD:** 0549e1f
**Migration:** 0053_attribute_backfill.sql
**Status:** IMPLEMENTATION COMPLETE

---

## 1. Executive Summary

Phase 3 establishes the typed attribute tables (`product_attribute_values`, `variant_attribute_values`) as the **sole authoritative storage** for product and variant attributes. The legacy JSONB columns (`products.attributes`, `product_variants.attributes`) remain physically present but are deprecated — no code path reads or writes them as authoritative.

**Key changes:**
- Migration 0053 creates a `backfill_errors` audit table and PL/pgSQL backfill logic
- `getVariantMatrix()` switched from JSONB read to typed attribute read
- Two new endpoints: `PUT /v1/products/:id/attribute-values` and `PUT /v1/products/:productId/variants/:variantId/attribute-values`
- `createVariant()` writes typed attributes instead of JSONB
- `updateVariant()` explicitly rejects attribute fields
- `setProductAttributeValues()` and `setVariantAttributeValues()` hardened with `SELECT ... FOR UPDATE` transactions
- JSONB schema columns and `CreateVariantInput.attributes` marked `@deprecated`

---

## 2. Baseline

| Item | Value |
|------|-------|
| Branch | develop |
| HEAD | 0549e1f |
| Working tree | 25 files changed, +1224 / -397 |
| Migrations applied | 0001–0053 |
| Products | 10 |
| Variants | 10 |
| JSONB non-empty rows | 0 |
| Typed table rows | 0 |

---

## 3. P0 Verification

All baseline checks match the Phase 3 audit:
- `products.attributes` non-empty rows = 0 ✓
- `product_variants.attributes` non-empty rows = 0 ✓
- `product_attribute_values` = 0 rows ✓
- `variant_attribute_values` = 0 rows ✓
- `attribute_definitions` = 0 rows ✓
- All typed table indexes and constraints present ✓

---

## 4. Migration 0053

**File:** `infra/drizzle/migrations/0053_attribute_backfill.sql` (367 lines)

**Schema changes:**
- `CREATE TABLE IF NOT EXISTS backfill_errors` — audit table for conflicts/unknowns/invalid values
- `CREATE INDEX IF NOT EXISTS idx_backfill_errors_migration`

**PL/pgSQL backfill:**
- Processes products and variants with non-empty JSONB attributes
- Resolves JSONB keys to `attribute_definitions` (UUID or code match)
- Type-aware coercion: INTEGER, DECIMAL, BOOLEAN, SELECT, MULTI_SELECT, DATE, TEXT
- Conflict detection: typed value preserved as authoritative (BD-03)
- Unknown attributes logged as UNKNOWN_ATTRIBUTE
- Invalid values logged as INVALID_VALUE
- Batch commit every 500 rows

**Applied to dev DB:** ✓ (0 rows processed — no JSONB data)
**Idempotency verified:** ✓ (re-run produces no errors)
**Migration tracking:** ✓ (0053 in `_migration_log`)

---

## 5. Backfill Behavior

| Scenario | Behavior | Verified |
|----------|----------|----------|
| `{}` or null JSONB | SKIP — no typed row | T2 ✓ |
| Valid JSONB + no typed row | CREATE typed row | T1, T3 ✓ |
| Valid JSONB + identical typed row | SKIP | T4 ✓ |
| JSONB differs from typed row | CONFLICT — typed preserved | T5 ✓ |
| Unknown attribute definition | ERROR logged, skip | T6 ✓ |
| Invalid value for type | ERROR logged, skip | T7 ✓ |
| Rerun backfill | No duplicates | T8 ✓ |

---

## 6. Conflict Handling

Per BD-03: typed value is authoritative. The migration's PL/pgSQL checks for existing typed rows before inserting. If a typed row exists with a different value, a CONFLICT error is logged to `backfill_errors` and the typed value is preserved.

---

## 7. Variant Matrix Changes

**File:** `apps/api/src/modules/catalog/catalog.service.ts` — `getVariantMatrix()`

**Before:** Read `v['attributes']` as JSONB `Record<string, unknown>`, looked up by attribute definition ID.

**After:** Reads typed attributes from `listVariantsByProduct()` enrichment (which queries `variant_attribute_values` JOIN `attribute_definitions`). Builds `code → attributeDefinitionId` lookup, maps typed attribute values by code to definition ID.

**Guard:** `Array.isArray(rawAttrs)` check handles legacy JSONB `{}` in variant rows.

---

## 8. Product Attribute Endpoint

**Endpoint:** `PUT /v1/products/:id/attribute-values`
**Controller:** `catalog.controller.ts` → `setProductAttributeValues()`
**Service:** `CatalogTaxonomyService.setProductAttributeValues()`

**Security:**
- JwtAuthGuard (class-level) ✓
- PermissionsGuard + `merchant:products:write` ✓
- `assertProductInOrg()` tenant enforcement ✓

**Behavior:**
- Validates attribute definitions exist and match PRODUCT scope ✓
- Coerces values via `coerceValue()` ✓
- Atomic DELETE+INSERT in transaction with `SELECT ... FOR UPDATE` ✓
- Does NOT write JSONB ✓

---

## 9. Variant Attribute Endpoint

**Endpoint:** `PUT /v1/products/:productId/variants/:variantId/attribute-values`
**Controller:** `catalog.controller.ts` → `setVariantAttributeValues()`
**Service:** `CatalogTaxonomyService.setVariantAttributeValues()`

**Security:**
- JwtAuthGuard + PermissionsGuard + `merchant:products:write` ✓
- `assertProductInOrg()` tenant enforcement ✓
- Variant must belong to product (enforced in service) ✓

**Behavior:**
- Validates VARIANT scope ✓
- Atomic DELETE+INSERT with `SELECT ... FOR UPDATE` ✓
- Recomputes `combination_key` ✓
- Does NOT write JSONB ✓

---

## 10. createVariant Changes

**Before:** `attributes: input.attributes || {}` written to JSONB column.

**After:**
1. Converts `input.attributes` (Record) to `AttributeValueInput[]` (typed)
2. Inserts variant with JSONB `attributes` omitted (DB default `{}`)
3. If typed attributes provided, calls `setVariantAttributeValues()`
4. If attribute write fails, variant is deleted (manual rollback)

**Both `createVariant()` and `batchUpdateVariants()` create path updated.**

---

## 11. updateVariant Contract

**Decision:** Reject attribute mutation with clear error.

**Implementation:** If `input['attributes'] !== undefined`, throws `BadRequestException` directing client to `PUT /v1/products/:productId/variants/:variantId/attribute-values`.

---

## 12. Concurrency Hardening

Both `setProductAttributeValues()` and `setVariantAttributeValues()` now:
1. Open a `db.transaction()`
2. Execute `SELECT ... FOR UPDATE` on the parent entity (product or variant)
3. Perform DELETE + INSERT within the locked transaction
4. Use `loadDefsForScopeFrom(tx, ...)` for transaction-aware definition reads

**Guarantees:**
- No lost update from concurrent replacement ✓
- No partially visible attribute set ✓
- No duplicate typed values (UNIQUE constraints preserved) ✓
- Rollback on failure ✓

---

## 13. Transaction Boundaries

| Operation | Transaction | Lock |
|-----------|------------|------|
| setProductAttributeValues | `db.transaction()` | `SELECT ... FOR UPDATE` on product |
| setVariantAttributeValues | `db.transaction()` | `SELECT ... FOR UPDATE` on variant |
| createVariant + attributes | Sequential + manual rollback | N/A |
| Backfill (migration 0053) | Single DO block | N/A |

---

## 14. JSONB Deprecation

- `catalog.schema.ts`: Both `products.attributes` and `product_variants.attributes` marked `@deprecated`
- `CreateVariantInput.attributes`: Marked `@deprecated` with migration guidance
- `createProduct()`: Already writes `{}` with deprecation comment
- No JSONB column dropped (deferred to migration 0054)
- Other JSONB fields (`dimensions_mm`, `images`, `metadata`) unaffected

---

## 15. Import Compatibility

Phase 2 import architecture (CLOSED/PASS) unchanged:
- `excel-executor.service.ts` continues writing `product_attribute_values` and `variant_attribute_values` exclusively
- No import path writes JSONB attributes
- 12-step transaction architecture preserved
- SAVEPOINT row isolation preserved
- All error tracking (ROOT_ERROR, DEPENDENCY_ERROR) preserved

---

## 16. Security

| Check | Result |
|-------|--------|
| Unauthenticated request | Rejected (JwtAuthGuard) |
| Insufficient permission | Rejected (PermissionsGuard) |
| Wrong organization | Rejected (assertProductInOrg) |
| Wrong product | Rejected (assertProductInOrg) |
| Wrong variant | Rejected (service-level check) |
| Variant belongs to another product | Rejected (T18 ✓) |
| Cross-tenant attribute access | Not possible |

---

## 17. Test Matrix T1–T20

| Test | Description | Result |
|------|-------------|--------|
| T1 | clean JSONB → typed backfill | PASS ✓ |
| T2 | empty JSONB → SKIP | PASS ✓ |
| T3 | missing typed row → CREATE | PASS ✓ |
| T4 | existing typed row → idempotent | PASS ✓ |
| T5 | conflicting values → typed authoritative | PASS ✓ |
| T6 | unknown definition → ERROR | PASS ✓ |
| T7 | partial failure → no corruption | PASS ✓ |
| T8 | second backfill → no duplicates | PASS ✓ |
| T9 | createVariant writes typed | PASS ✓ |
| T10 | product attribute replacement atomic | PASS ✓ |
| T11 | variant attribute replacement atomic | PASS ✓ |
| T12 | variant matrix typed read | PASS ✓ |
| T13 | product detail typed attributes | PASS ✓ |
| T14 | search facets regression | PASS ✓ |
| T15 | concurrent product attribute updates | PASS ✓ |
| T16 | concurrent variant attribute updates | PASS ✓ |
| T17 | import vs attribute update concurrency | PASS ✓ |
| T18 | cross-tenant rejection | PASS ✓ |
| T19 | transaction rollback | PASS ✓ |
| T20 | JSONB deprecation behavior | PASS ✓ |

**Test file:** `apps/api/src/__tests__/integration/phase3-attribute-cutover.postgres.spec.ts` (21 tests, all pass)

---

## 18. Migration Verification

| Check | Result |
|-------|--------|
| A. Fresh DB (0001–0053) | PASS ✓ |
| B. Existing DB (0053 after 0052) | PASS ✓ |
| C. Idempotency (rerun 0053) | PASS ✓ |
| D. Migration tracking (0053 in _migration_log) | PASS ✓ |
| E. Data preservation | PASS ✓ |
| F. Synthetic JSONB backfill | PASS (T1) ✓ |
| G. Conflict behavior | PASS (T5) ✓ |
| H. Invalid/unknown data | PASS (T6, T7) ✓ |
| I. Dev DB (0 rows need migration) | PASS ✓ |

---

## 19. Regression Results

| Suite | Expected | Actual | Result |
|-------|----------|--------|--------|
| Phase 1 weight tests | 16 | 16 | PASS ✓ |
| Phase 2 import tests | 14 | 14 | PASS ✓ |
| Catalog import unit | 118 | 118 | PASS ✓ |
| Catalog unit tests | 148 | 148 | PASS ✓ |
| Catalog taxonomy unit | 12 | 12 | PASS ✓ |
| Phase 3 postgres tests | 21 | 21 | PASS ✓ |
| Catalog governance roundtrip | 30 | 30 | PASS ✓ |

---

## 20. TypeScript/Build Results

| Check | Result |
|-------|--------|
| `tsc --noEmit` (api) | 0 errors ✓ |
| `nest build` | 282 files compiled, 0 issues ✓ |

---

## 21. Acceptance Criteria

| AC | Description | Result |
|----|-------------|--------|
| AC-01 | typed tables authoritative | PASS ✓ |
| AC-02 | no new attribute writes to JSONB | PASS ✓ |
| AC-03 | no attribute reads depend on JSONB | PASS ✓ |
| AC-04 | variant matrix uses typed attributes | PASS ✓ |
| AC-05 | Product Studio backend attribute endpoint works securely | PASS ✓ |
| AC-06 | create/update variant attribute behavior explicit and correct | PASS ✓ |
| AC-07 | tenant isolation verified | PASS ✓ |
| AC-08 | concurrent attribute updates safe | PASS ✓ |
| AC-09 | migration 0053 idempotent and data-safe | PASS ✓ |
| AC-10 | synthetic JSONB backfill passes | PASS ✓ |
| AC-11 | import regression green | PASS ✓ |
| AC-12 | Phase 1/Phase 2 regression green | PASS ✓ |
| AC-13 | TypeScript/build passes | PASS ✓ |
| AC-14 | implementation ready for independent runtime verification | PASS ✓ |

---

## 22. Changed Files

| File | Change |
|------|--------|
| `infra/drizzle/migrations/0053_attribute_backfill.sql` | NEW — backfill migration |
| `apps/api/src/modules/catalog/catalog.schema.ts` | JSONB columns marked @deprecated |
| `apps/api/src/modules/catalog/catalog.service.ts` | createVariant typed writes, updateVariant rejection, getVariantMatrix typed read, batchUpdateVariants fix, taxonomy service injection |
| `apps/api/src/modules/catalog/catalog.controller.ts` | Two new PUT endpoints, taxonomy service injection |
| `apps/api/src/modules/catalog/catalog.taxonomy.service.ts` | Transaction + FOR UPDATE hardening, loadDefsForScopeFrom |
| `apps/api/src/__tests__/integration/phase3-attribute-cutover.postgres.spec.ts` | NEW — 21 tests T1–T20 |
| `apps/api/src/__tests__/unit/catalog/catalog-taxonomy.spec.ts` | Mock updated for transaction support |
| 10 test files | CatalogService constructor updated (7th arg) |

---

## 23. Known Limitations

1. **Variant matrix value mapping**: The `getVariantMatrix()` typed read correctly queries `variant_attribute_values` and returns dimension descriptors. The per-variant value mapping depends on `listVariantsByProduct()` enrichment returning `attributeCode`-keyed data. When no typed attributes exist, the matrix correctly returns empty values (not JSONB).

2. **createVariant rollback**: Uses manual delete-on-error rather than a true DB transaction for the variant+attributes pair. This is because the taxonomy service's `setVariantAttributeValues` opens its own transaction. If the attribute write fails, the variant row is cleaned up explicitly.

---

## 24. Scope Confirmation

**Implemented:**
- P0–P8 as specified in the Phase 3 lock document

**NOT implemented (explicitly deferred):**
- P9 Independent Runtime Verification (separate governance gate)
- P10 Release Closure (separate governance gate)
- Migration 0054 / JSONB column removal
- Product Studio UI redesign
- Admin Product Management redesign
- GTIN deduplication
- Performance/index work
- Any payment/refund/shipping/returns/notifications work

---

## 25. Final Implementation Status

**IMPLEMENTATION COMPLETE**

- Implementation report: `docs/production/SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-3-IMPLEMENTATION-REPORT.md`
- Migration: `infra/drizzle/migrations/0053_attribute_backfill.sql`
- Tests: 21/21 Phase 3 tests pass, 148/148 catalog unit tests pass, 118/118 import tests pass
- TypeScript: 0 errors
- Build: 282 files compiled successfully
- Migration verification: All 9 checks pass
- Security verification: All tenant isolation checks pass
- Acceptance criteria: AC-01 through AC-14 all PASS

**NEXT STEP:** Independent Runtime Verification of Phase 3.
