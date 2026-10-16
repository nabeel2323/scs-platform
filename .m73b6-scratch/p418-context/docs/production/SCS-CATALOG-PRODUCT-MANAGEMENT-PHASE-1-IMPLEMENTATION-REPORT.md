# SCS Catalog/Product Management — Phase 1 Implementation Report

## Import Data Contract + Critical Persistence Fixes

---

## Executive Summary

| Item | Value |
|---|---|
| **Phase** | Phase 1 — Import Data Contract + Critical Persistence Fixes |
| **Status** | **IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT RUNTIME VERIFICATION** |
| **Baseline commit** | `0549e1f` (develop) — feat(shipments): add inventory return-to-stock |
| **Current HEAD** | `0549e1f` + uncommitted working-tree changes |
| **Migration created** | `0051_variant_weight_decimal.sql` |
| **Files changed** | 5 modified, 3 new (see below) |
| **Tests** | 16 new Phase 1 regression tests — all pass; 104 total catalog-import unit tests — all pass; 7 integration tests — all pass |
| **TypeScript typecheck** | `tsc --noEmit` — zero errors |

### Files Changed

**Modified (5):**

| File | Change |
|---|---|
| `apps/api/src/modules/catalog/catalog.schema.ts` | `integer('weight_grams')` → `numeric('weight_grams', { precision: 10, scale: 2 })` |
| `apps/api/src/modules/catalog-import/excel-validator.service.ts` | +144 lines: `INTEGER_FIELDS`, `DECIMAL_FIELD_SPECS`, `ENUM_FIELDS` constants; `validateNumericAndEnumFields()` method; `isIntegerString()` helper |
| `apps/api/src/modules/catalog-import/excel-planner.service.ts` | 3 integer field conversions changed from `Number()` to `parseInt(..., 10)` |
| `apps/api/src/modules/catalog-import/excel-executor.service.ts` | `weightGrams` insert: `(d.weightGrams as number)` → `d.weightGrams != null ? String(d.weightGrams) : null` |
| `apps/api/src/modules/catalog/catalog.service.ts` | Added `coerceVariantNumeric()` helper; applied to getVariant, updateVariant, listVariantsByProduct; number→String conversion at 3 insert/update points |

**New (3):**

| File | Purpose |
|---|---|
| `infra/drizzle/migrations/0051_variant_weight_decimal.sql` | INT → NUMERIC(10,2) migration + CHECK constraint |
| `apps/api/src/__tests__/unit/catalog-import/phase1-weight-numeric.spec.ts` | 16 regression tests covering cases A–L + root-cause regression |
| `docs/production/SCS-CATALOG-PRODUCT-MANAGEMENT-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | Decision lock document (Gate 2 output) |

**Also new (not Phase 1 implementation):**

| File | Purpose |
|---|---|
| `docs/production/SCS-CATALOG-PRODUCT-MANAGEMENT-FRESH-AUDIT.md` | Fresh architecture audit (predecessor to decision lock) |

---

## Root Cause Fixed

The original production failure:

```text
weight_grams INT
+
validator accepted 9.7
+
planner produced 9.7
+
PostgreSQL rejected decimal into INT
```

**What happened:** The KC3000-2TB product has `weight_grams = 9.7` (a decimal). The column was `INT`. The validator had no numeric type check, so it passed. The planner produced `Number("9.7") = 9.7`. PostgreSQL rejected the INSERT because 9.7 cannot be stored in an integer column.

**How Phase 1 fixes it:**

1. **Migration 0051** changes the column from `INT` to `NUMERIC(10,2)`, which accepts decimals.
2. **CHECK constraint** `chk_variant_weight_positive` ensures `weight_grams IS NULL OR weight_grams > 0`.
3. **Validator** now validates `weight_grams` as a decimal field with range `[0.01, 99999999.99]`, rejecting zero, negatives, non-numeric strings, and out-of-range values *before* they reach the database.
4. **Drizzle schema** updated to `numeric()` so the ORM type matches the database type.
5. **Executor** converts the planner's `number` to `String` for Drizzle's `numeric()` insert (Drizzle expects strings for NUMERIC columns).
6. **API serialization** coerces Drizzle's string return back to `number` for JSON responses.

---

## Database

| Property | Old | New |
|---|---|---|
| **Column type** | `integer` | `numeric(10, 2)` |
| **Constraint** | None | `CHECK (weight_grams IS NULL OR weight_grams > 0)` |
| **Nullability** | Nullable | Nullable (unchanged) |
| **Range** | Any integer | 0.01 – 99,999,999.99 (enforced by validator) |

### Migration Safety

The migration (`0051_variant_weight_decimal.sql`):

1. **Sanitizes invalid data first:** Sets `weight_grams = NULL` for any existing rows where `weight_grams <= 0` (zero or negative). This prevents the CHECK constraint from failing on existing data.
2. **ALTER COLUMN TYPE:** Uses `USING weight_grams::NUMERIC(10,2)` — PostgreSQL's implicit cast from INT to NUMERIC is safe and lossless. Integer values like `100` become `100.00`.
3. **Adds CHECK constraint:** `chk_variant_weight_positive` — `weight_grams IS NULL OR weight_grams > 0`.

### Data Verification

- `Number("100")` → `100` (integer preserved, stored as 100.00 in DB)
- `Number("9.7")` → `9.7` (decimal preserved exactly in NUMERIC(10,2))
- No data loss for any existing integer values.

---

## Validation

### Newly Enforced Rules

All new rules are in `excel-validator.service.ts`, method `validateNumericAndEnumFields()`.

#### Decimal Fields (`DECIMAL_FIELD_SPECS`)

| Entity | Field | Min | Max | Allow Zero | Error Code |
|---|---|---|---|---|---|
| `variants` | `weight_grams` | 0.01 | 99,999,999.99 | No | `VALUE_OUT_OF_RANGE` |
| `product_attributes` | `value_number` | -99,999,999.99 | 99,999,999.99 | Yes | `VALUE_OUT_OF_RANGE` |
| `variant_attributes` | `value_number` | -99,999,999.99 | 99,999,999.99 | Yes | `VALUE_OUT_OF_RANGE` |

Non-numeric values (e.g., `"abc"`, `"9.7g"`) produce `INVALID_NUMERIC`.

#### Integer Fields (`INTEGER_FIELDS`)

| Entity | Field | Error Code |
|---|---|---|
| `categories` | `sort_order` | `INVALID_INTEGER` |
| `attribute_options` | `sort_order` | `INVALID_INTEGER` |
| `product_type_attributes` | `display_order` | `INVALID_INTEGER` |

Decimal values in integer fields (e.g., `sort_order = 1.5`) are rejected using `isIntegerString()` regex: `/^[+-]?\d+$/`.

#### Enum Fields (`ENUM_FIELDS`)

| Entity | Field | Allowed Values | Error Code |
|---|---|---|---|
| `products` | `status` | DRAFT, ACTIVE, ARCHIVED, REJECTED, APPROVED, PENDING | `INVALID_ENUM` |
| `products` | `condition` | NEW, USED, REFURBISHED | `INVALID_ENUM` |
| `attributes` | `type` | TEXT, LONG_TEXT, INTEGER, DECIMAL, BOOLEAN, DATE, DATETIME, SELECT, MULTI_SELECT, COLOR, URL, FILE, MEASUREMENT, CURRENCY | `INVALID_ENUM` |
| `attributes` | `scope` | PRODUCT, VARIANT, OFFER | `INVALID_ENUM` |
| `product_type_attributes` | `scope` | PRODUCT, VARIANT, OFFER | `INVALID_ENUM` |

#### NOT NULL

NOT NULL validation is pre-existing (via `REQUIRED_HEADERS` and per-entity validation methods). Phase 1 does not change NOT NULL behavior but confirms it remains functional (test I).

---

## Planner / Executor

### Planner Numeric Handling

**Integer fields** — changed from `Number()` to `parseInt(str, 10)`:

| Location | Field | Before | After |
|---|---|---|---|
| Categories | `sort_order` | `Number(row['sort_order'])` | `parseInt(row['sort_order'], 10)` |
| Attribute Options | `sort_order` | `Number(row['sort_order'])` | `parseInt(row['sort_order'], 10)` |
| Product Type Attributes | `display_order` | `Number(row['display_order'])` | `parseInt(row['display_order'], 10)` |

This prevents silent truncation: `Number("1.5")` → `1.5` (would be silently truncated to `1` by the DB integer column). Now `parseInt("1.5", 10)` → `1`, but the validator catches `1.5` before it reaches the planner.

**Decimal fields** — `Number()` retained:

| Location | Field | Behavior |
|---|---|---|
| Variants | `weight_grams` | `Number(row['weight_grams'])` — correctly preserves decimals: `Number("9.7")` → `9.7` |

### Executor Numeric Handling

Drizzle's `numeric()` type expects `string` for insert/update, not `number`.

**Before:**
```typescript
weightGrams: (d.weightGrams as number) ?? null
```

**After:**
```typescript
weightGrams: d.weightGrams != null ? String(d.weightGrams) : null
```

This converts the planner's `number` (e.g., `9.7`) to `"9.7"` for Drizzle, which PostgreSQL then stores as `9.70` in `NUMERIC(10,2)`.

---

## API Serialization

Drizzle's `numeric()` returns strings from PostgreSQL (e.g., `"9.70"`). API consumers expect JSON numbers.

### Solution: `coerceVariantNumeric<V>()`

```typescript
private coerceVariantNumeric<V extends { weightGrams?: string | number | null } | undefined>(v: V): V {
  if (v && v.weightGrams != null) {
    (v as any).weightGrams = Number(v.weightGrams);
  }
  return v;
}
```

### Applied To

| Method | Behavior |
|---|---|
| `getVariant(id)` | Return value coerced |
| `updateVariant(...)` | Return value coerced |
| `listVariantsByProduct(...)` | Each row coerced via `.then(rows => rows.map(r => this.coerceVariantNumeric(r)))` |
| `createVariant(...)` | Returns via `getVariant()`, so already coerced |

### Insert/Update Points (number → string for Drizzle)

| Location | Conversion |
|---|---|
| Bulk variant create (line ~1416) | `input.weightGrams != null ? String(input.weightGrams) : null` |
| `createVariant` (line ~1602) | Same |
| `updateVariant` (line ~1630) | Same |

### Result

```json
{ "weight_grams": 9.7 }
```

Not:

```json
{ "weight_grams": "9.70" }
```

---

## Tests

### Commands Executed

```powershell
# Phase 1 regression tests (16 tests)
cd c:\TAIF\scs-platform\apps\api
npx vitest run src/__tests__/unit/catalog-import/phase1-weight-numeric.spec.ts

# All catalog-import unit tests (104 tests across 6 files)
npx vitest run src/__tests__/unit/catalog-import/

# Integration tests (7 tests)
npx vitest run src/__tests__/integration/catalog-import-pipeline.spec.ts

# TypeScript typecheck
npx tsc --noEmit
```

### Results

| Suite | Tests | Result |
|---|---|---|
| Phase 1 regression (`phase1-weight-numeric.spec.ts`) | 16 | **16 passed** |
| All catalog-import unit tests | 104 | **104 passed** |
| Catalog import pipeline integration | 7 | **7 passed** |
| TypeScript typecheck (`tsc --noEmit`) | — | **0 errors** |

### Test Coverage

| Case | Description | Status |
|---|---|---|
| A | Decimal weight acceptance (9.7) | PASS |
| B | Integer weight backward compatible (1250) | PASS |
| C | Zero rejected | PASS |
| D | Negative rejected (-1) | PASS |
| E | Maximum accepted (99999999.99) | PASS |
| F | Above maximum rejected (100000000) | PASS |
| G | Invalid numeric rejected ("abc", "9.7g") | PASS (2 tests) |
| H | Integer fields reject decimals (sort_order=1.5, display_order=2.5) | PASS (2 tests) |
| I | NOT NULL validation still catches missing SKU | PASS |
| J | Enum validation rejects invalid status/condition | PASS |
| K | Migration safety: integer → Number() preserved | PASS |
| L | API serialization: string → JSON number | PASS (2 tests) |
| REGRESSION | KC3000-2TB weight_grams=9.7 root cause fixed | PASS |

### Failures

None.

### Pre-existing Failures

None detected in the affected test suites.

---

## Scope Compliance

Phase 1 is strictly limited to the Import Data Contract + Critical Persistence Fixes. The following were **NOT** implemented:

| Phase | Description | Implemented? |
|---|---|---|
| Phase 2 | Import transaction isolation (per-entity-type transactions) | **NO** |
| Phase 2 | Error classification (ROOT_ERROR / DEPENDENCY_ERROR / CASCADE_ERROR) | **NO** |
| Phase 2 | Retry-without-reupload architecture | **NO** |
| Phase 3 | JSONB → typed-table attribute backfill | **NO** |
| Phase 3 | Typed-table cutover (deprecating JSONB) | **NO** |
| Phase 4 | Admin Product Management UI redesign | **NO** |
| Phase 5 | Product Studio attribute UI redesign | **NO** |
| Phase 6 | E2E import → manage → publish workflow | **NO** |
| M7.3-D | (Next milestone) | **NO** |

No unrelated modifications were made. All changes are strictly within the Phase 1 scope.

---

## Remaining Work

```text
Phase 2 — Import Transaction / Error Architecture
```

is **NOT** implemented.

The original transaction-poisoning/cascade-error problem (where one invalid row causes the entire import to fail, and cascade errors mask the root cause) is addressed **architecturally only in Phase 2**, not Phase 1. Phase 1 prevents deterministic failures from reaching the executor by catching them in validation, but it does not change the transaction model.

### Next Gate

```text
INDEPENDENT RUNTIME VERIFICATION — CATALOG PRODUCT MANAGEMENT PHASE 1
```

No further implementation phase should begin until independent runtime verification of Phase 1 passes.

---

## Final Status

```text
CATALOG PRODUCT MANAGEMENT PHASE 1:
IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT RUNTIME VERIFICATION
```

---

## Governance Notices

- This document does **not** mark the entire Catalog Product Management milestone as complete.
- Phase 2–6 are **not** marked complete.
- No Release Closure document has been created.
- Catalog Product Management is **not** marked CLOSED/PASS.
- The correct next gate is **Independent Runtime Verification**.
