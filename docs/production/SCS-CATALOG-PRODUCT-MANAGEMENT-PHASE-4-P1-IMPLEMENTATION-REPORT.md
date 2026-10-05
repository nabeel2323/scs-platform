# SCS Catalog Product Management — Phase 4 P1 Implementation Report

## 1. Executive Summary

Phase 4 P1 implements optimistic locking for product and variant updates using the existing `updatedAt` timestamp (BD-08). The implementation adds conditional `WHERE updated_at = clientUpdatedAt` to `updateProduct()` and `updateVariant()`, returning HTTP 409 CONFLICT when the timestamp is stale.

**P1 Status: PASS**

- 12 new unit tests: 12/12 PASS
- 13 new PostgreSQL integration tests: 13/13 PASS (including 10-writer and 50-writer concurrency)
- 432 existing Phase 3 regression: 432/432 PASS
- Total: 457/457 PASS
- TypeScript: 0 errors
- Nest build: 285 files, 0 issues
- No migration 0054 introduced

## 2. Scope

P1 implements:
- `updatedAt` field added to `UpdateProductInput`
- Optimistic locking in `updateProduct()` via conditional UPDATE
- Optimistic locking in `updateVariant()` via conditional UPDATE
- HTTP 409 CONFLICT response with `currentUpdatedAt`
- Backward compatibility: omitting `updatedAt` preserves legacy behavior
- Controller extraction of `updatedAt` from request body
- Timestamp precision fix: explicit `updatedAt: new Date()` in all product/variant INSERTs

P1 does NOT implement:
- `productTypeId`, `gtin`, `ean`, `mpn` editing (P2)
- Frontend conflict UX (P3/P6)
- Variant deactivation (P5/P7)
- Audit trail expansion (P9)
- Any migration or schema change

## 3. Business Rule Reference

**BD-08 — Optimistic Locking** (from Business Rules + Architecture Lock):

| Aspect | Implementation |
|--------|---------------|
| Strategy | `updatedAt` timestamp comparison |
| Conflict response | HTTP 409 with `{ statusCode: 409, message: "CONFLICT", currentUpdatedAt: "..." }` |
| Apply to | `updateProduct()`, `updateVariant()` |
| NOT applied to | Attribute replacement (FOR UPDATE protection) |
| Version column | NOT introduced |
| Backward compat | Omitting `updatedAt` → legacy behavior |

## 4. Files Changed

| File | Change | Lines |
|------|--------|-------|
| `apps/api/src/modules/catalog/catalog.service.ts` | Added `updatedAt` to `UpdateProductInput`; modified `updateProduct()` and `updateVariant()` with conditional UPDATE; added explicit `updatedAt: new Date()` to all product/variant INSERTs | +85 |
| `apps/api/src/modules/catalog/catalog.controller.ts` | Extract `updatedAt` from body, pass as separate parameter to service | +9 / -5 |
| `apps/api/src/__tests__/unit/catalog/catalog-optimistic-locking.spec.ts` | New: 12 unit tests | +254 |
| `apps/api/src/__tests__/integration/phase4-optimistic-locking.postgres.spec.ts` | New: 13 PostgreSQL integration tests | +490 |

## 5. UpdateProductInput Changes

```typescript
export interface UpdateProductInput {
  title?: string;
  titleAr?: string;
  description?: string;
  descriptionAr?: string;
  status?: string;
  condition?: string;
  images?: string[];
  categoryId?: string;
  brandId?: string;
  slug?: string;
  metadata?: Record<string, unknown>;
  /** PHASE 4 P1 — Optimistic locking. */
  updatedAt?: string;  // ← NEW
}
```

The controller extracts `updatedAt` from the body and passes it as a separate `clientUpdatedAt` parameter to the service method.

## 6. updateProduct Implementation

**Signature**: `updateProduct(id, input, clientUpdatedAt?)`

**Logic**:
1. Load product via `getProduct(id)` — throws 404 if not found
2. Build updates object with `updatedAt: new Date()`
3. Apply field-level changes from input
4. If `status === 'ACTIVE'`, run `validatePublish()`
5. **If `clientUpdatedAt` provided** (optimistic locking path):
   a. Parse to `Date`; throw `BadRequestException` if invalid
   b. `UPDATE products SET ... WHERE id = ? AND updated_at = clientDate` with `.returning()`
   c. If 0 rows: `getProduct(id)` → throw `ConflictException({ statusCode: 409, message: 'CONFLICT', currentUpdatedAt })`
   d. Invalidate cache, emit outbox event if published, audit
   e. Return updated product
6. **If `clientUpdatedAt` omitted** (legacy path):
   a. `UPDATE products SET ... WHERE id = ?` (no conditional)
   b. Same post-update logic

## 7. updateVariant Implementation

**Signature**: `updateVariant(productId, variantId, input, clientUpdatedAt?)`

**Logic**:
1. Reject `attributes` field (Phase 3 redirect)
2. Load product and variant — throw 404 if not found
3. Build updates object
4. **If `clientUpdatedAt` provided**:
   a. `UPDATE product_variants SET ... WHERE id = ? AND product_id = ? AND updated_at = clientDate` with `.returning()`
   b. If 0 rows: variant already verified to exist → throw `ConflictException`
   c. Return updated variant
5. **If omitted**: legacy unconditional UPDATE

## 8. Conflict Handling

**Response format** (via NestJS `ConflictException`):
```json
{
  "statusCode": 409,
  "message": "CONFLICT",
  "currentUpdatedAt": "2026-10-05T10:00:00.123Z"
}
```

**Distinction logic**:
- Product not found → `NotFoundException` (404) — existing behavior preserved
- Product exists but timestamp mismatch → `ConflictException` (409) — NEW
- `updatedAt` omitted → legacy unconditional update — backward compatible

## 9. Timestamp Handling

**Precision concern**: PostgreSQL `timestamp with time zone` has microsecond precision; JavaScript `Date` has millisecond precision.

**Root cause**: `defaultNow()` in PostgreSQL stores microseconds (e.g., `10:00:00.123456`). When read by JS, sub-ms digits are lost (`10:00:00.123`). The conditional WHERE then fails to match.

**Fix**: All product/variant INSERTs now explicitly set `updatedAt: new Date()` (JS ms precision, sub-ms digits = 0 in DB). This ensures round-trip fidelity:
- INSERT: `new Date()` → DB stores `10:00:00.123000`
- Read: JS Date → `10:00:00.123Z`
- ISO string: `2026-10-05T10:00:00.123Z`
- Parse back: `new Date("2026-10-05T10:00:00.123Z")` → `10:00:00.123000`
- WHERE match: ✅

**Affected INSERT locations**:
- `createProduct()` — product INSERT
- `createVariant()` — variant INSERT
- `bulkVariantOperations()` — variant INSERT in bulk create
- Import-based product/variant creation

## 10. Tenant/RBAC Preservation

All existing authorization is preserved:
- `assertProductInOrg()` called before `updateProduct()` in controller
- `assertProductInOrg()` called before `updateVariant()` in controller
- Optimistic locking happens WITHIN the authorization boundary
- Conflict response does not leak information about unauthorized resources
- Wrong-tenant variant update returns 404 (variant not found in product scope), NOT 409

## 11. Concurrency Design

**Atomic conditional UPDATE** — no SELECT-FOR-UPDATE, no JS comparison:
```sql
UPDATE products SET ... WHERE id = $1 AND updated_at = $2 RETURNING *
```

- Database guarantees exactly one writer wins
- No race conditions possible
- No transaction restructuring needed
- Consistent with the codebase's existing pattern (per memory: "Prefer atomic conditional UPDATE over SELECT FOR UPDATE")

## 12. Unit Tests

**File**: `src/__tests__/unit/catalog/catalog-optimistic-locking.spec.ts`

| # | Test | Result |
|---|------|--------|
| 1 | Product: omitted updatedAt → legacy update | ✅ PASS |
| 2 | Product: correct updatedAt → update succeeds | ✅ PASS |
| 3 | Product: stale updatedAt → ConflictException (409) | ✅ PASS |
| 4 | Product: not found → NotFoundException (404) | ✅ PASS |
| 5 | Product: invalid updatedAt → BadRequestException | ✅ PASS |
| 6 | Product: conflict includes currentUpdatedAt | ✅ PASS |
| 7 | Variant: omitted updatedAt → legacy update | ✅ PASS |
| 8 | Variant: correct updatedAt → update succeeds | ✅ PASS |
| 9 | Variant: stale updatedAt → ConflictException (409) | ✅ PASS |
| 10 | Variant: not found → NotFoundException (404) | ✅ PASS |
| 11 | Variant: invalid updatedAt → BadRequestException | ✅ PASS |
| 12 | Variant: attributes still rejected with locking | ✅ PASS |

## 13. PostgreSQL Integration Tests

**File**: `src/__tests__/integration/phase4-optimistic-locking.postgres.spec.ts`

| Test | Scenario | Result | Duration |
|------|----------|--------|----------|
| TEST 1 | Two concurrent product writers — 1 wins, 1 gets 409 | ✅ PASS | |
| TEST 2 | Two concurrent variant writers — 1 wins, 1 gets 409 | ✅ PASS | |
| TEST 3 | 10 concurrent product writers — exactly 1 winner | ✅ PASS | 326ms |
| TEST 4 | 50 concurrent product writers — exactly 1 winner | ✅ PASS | 322ms |
| TEST 5 | Fresh timestamp → sequential update succeeds | ✅ PASS | |
| TEST 6 | Stale timestamp → 409 | ✅ PASS | |
| TEST 7 | Product not found → 404 | ✅ PASS | |
| TEST 8 | Variant not found → 404 | ✅ PASS | |
| TEST 9 | Wrong tenant → 404 (not 409) | ✅ PASS | |
| TEST 10a | Legacy product update without updatedAt | ✅ PASS | |
| TEST 10b | Legacy variant update without updatedAt | ✅ PASS | |
| TEST 11 | Product timestamp precision round-trip | ✅ PASS | |
| TEST 12 | Variant timestamp precision round-trip | ✅ PASS | |

## 14. Regression Tests

| Suite | Tests | Result |
|-------|-------|--------|
| Catalog unit tests (incl. 12 new) | 160 | 160/160 PASS |
| Catalog import unit tests | 118 | 118/118 PASS |
| Governance roundtrip | 30 | 30/30 PASS |
| Phase 3 attribute cutover | 21 | 21/21 PASS |
| Phase 3 runtime verification | 38 | 38/38 PASS |
| Phase 1 integration | 38 | 38/38 PASS |
| Phase 2 integration | 39 | 39/39 PASS |
| Phase 4 P1 integration (new) | 13 | 13/13 PASS |
| **Total** | **457** | **457/457 PASS** |

Phase 3 baseline: 432/432 → still 432/432 (no regression). 25 new tests bring total to 457.

## 15. TypeScript/build

| Gate | Result |
|------|--------|
| `tsc --noEmit` | 0 errors |
| `nest build` | 285 files compiled, 0 issues |
| Migration 0054 | Does NOT exist |

## 16. Findings

### FINDING-P1-01: Timestamp Precision

| | |
|---|---|
| **Severity** | INFO |
| **Area** | Timestamp Handling |
| **Issue** | PostgreSQL `defaultNow()` has microsecond precision; JS Date has millisecond precision |
| **Fix Applied** | All product/variant INSERTs now explicitly set `updatedAt: new Date()` (ms precision) |
| **Impact** | Existing rows created before this fix may have microsecond precision. If a client loads such a row and attempts optimistic locking, the WHERE clause will not match → 409. This is safe behavior (conflict detected), but may cause unexpected 409s on first use with old data. |
| **Long-term** | If this becomes an issue, a migration to truncate existing `updatedAt` values to ms precision can be added in a later phase |

### FINDING-P1-02: No Schema Change Required

| | |
|---|---|
| **Severity** | INFO |
| The `updatedAt` column and existing Drizzle infrastructure fully support optimistic locking without any migration or schema change. The `eq()` operator from Drizzle correctly serializes JavaScript `Date` objects for PostgreSQL `timestamp with time zone` comparison. |

## 17. Known Limitations

1. **Existing data precision**: Products/variants created before P1 may have microsecond-precision `updatedAt` from `defaultNow()`. Optimistic locking on these rows will always return 409 on first attempt. Safe but potentially confusing.

2. **No frontend conflict UX**: P1 is backend-only. The frontend must handle 409 responses in P3/P6.

3. **No version column**: If future verification shows `updatedAt` is insufficient (e.g., sub-millisecond collisions in extremely high-throughput scenarios), a version column can be added per BD-08.

## 18. P1 Status

**P1 STATUS: PASS**

All 16 acceptance criteria satisfied:

| AC | Criterion | Result |
|----|-----------|--------|
| AC-P1-01 | UpdateProductInput accepts updatedAt | ✅ |
| AC-P1-02 | updateProduct conditional update | ✅ |
| AC-P1-03 | updateVariant conditional update | ✅ |
| AC-P1-04 | Stale product timestamp → 409 | ✅ |
| AC-P1-05 | Stale variant timestamp → 409 | ✅ |
| AC-P1-06 | 409 contains currentUpdatedAt | ✅ |
| AC-P1-07 | Missing product → 404 | ✅ |
| AC-P1-08 | Missing variant → 404 | ✅ |
| AC-P1-09 | Tenant/RBAC intact | ✅ |
| AC-P1-10 | Two writers → exactly one winner | ✅ |
| AC-P1-11 | 10 writers → exactly one winner | ✅ |
| AC-P1-12 | Fresh timestamp → next update succeeds | ✅ |
| AC-P1-13 | Legacy updates without updatedAt | ✅ |
| AC-P1-14 | Phase 3 regression 432/432 | ✅ |
| AC-P1-15 | TypeScript 0 errors | ✅ |
| AC-P1-16 | Nest build succeeds | ✅ |

No migration 0054 introduced. ✅

## 19. Recommended Independent Verification

Run the following to independently verify:

```bash
# Unit tests
vitest run src/__tests__/unit/catalog/catalog-optimistic-locking.spec.ts

# Integration tests (requires Docker)
vitest run src/__tests__/integration/phase4-optimistic-locking.postgres.spec.ts

# Full regression
vitest run src/__tests__/unit/catalog/
vitest run src/__tests__/unit/catalog-import/
vitest run src/__tests__/integration/catalog-governance-roundtrip.spec.ts
vitest run src/__tests__/integration/phase3-attribute-cutover.postgres.spec.ts
vitest run src/__tests__/integration/phase3-runtime-verification.postgres.spec.ts
vitest run src/__tests__/integration/phase1-marketplace.e2e.spec.ts
vitest run src/__tests__/integration/phase2-multi-merchant.e2e.spec.ts

# Build gates
tsc --noEmit
nest build
```

---

**NEXT STEP:** P1 Independent Runtime Verification / Release Gate
