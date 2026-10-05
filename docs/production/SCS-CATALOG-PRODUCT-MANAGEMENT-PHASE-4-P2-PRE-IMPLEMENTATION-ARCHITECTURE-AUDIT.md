# SCS Catalog Product Management — Phase 4 P2 Pre-Implementation Architecture Audit

## 1. Executive Summary

This audit inspects the current repository after the formally closed Phase 4 P1 (Optimistic Locking) milestone and produces a precise implementation contract for P2 (UpdateProductInput Expansion + Identifier/Type Rules).

**Verdict: GO WITH CONDITIONS**

P2 can proceed to implementation after the P2 Business Rules + Architecture Lock formally records the conditions and design decisions documented herein.

| Aspect | Finding |
|--------|---------|
| P2 scope clarity | Fully defined by BD-05 and BD-06 |
| Missing fields in UpdateProductInput | 4: `productTypeId`, `gtin`, `ean`, `mpn` |
| Migration required | NO — all columns already exist |
| Concurrency concern | productTypeId guard vs concurrent variant creation requires `SELECT ... FOR UPDATE` |
| Optimistic locking interaction | P1 pattern extends naturally to new fields |
| Authorization impact | No new permissions required |
| Backward compatibility | All new fields optional — fully backward compatible |
| Identifier validation | Only DB length constraints exist; no domain validation logic |
| Proposed acceptance criteria | 28 (P2-01 through P2-28) |

## 2. Authoritative Baseline

| Aspect | Value |
|--------|-------|
| Branch | `develop` |
| HEAD | `0549e1f` |
| Latest migration | `0053_attribute_backfill.sql` |
| Migration 0054 | Does NOT exist (verified: COUNT = 0) |
| Phase 3 | CLOSED / PASS |
| P1 | CLOSED / PASS |
| P1 unit tests | 12/12 |
| P1 PostgreSQL integration | 13/13 |
| Phase 3 regression | 432/432 |
| Total tests | 457/457 |
| TypeScript | 0 errors |
| Nest build | 285 files |
| P1 optimistic locking | `updateProduct()` and `updateVariant()` via atomic conditional UPDATE on `updatedAt` |

## 3. Business Rules

P2 is governed by two locked business decisions:

### BD-05 — Identifier Editing

GTIN, EAN, and MPN are editable after creation.

| Requirement | Detail |
|-------------|--------|
| Server-side validation | Length constraints already defined in schema |
| Uniqueness | GTIN and EAN have partial unique indexes; MPN does not |
| Audit trail | Changes recorded via existing `this.audit.record()` |
| Optimistic locking | P1 pattern applies |
| GTIN dedup UI | NOT introduced in Phase 4 |

### BD-06 — Product Type Editing

Product type is NOT freely editable after variants or merchant offers exist.

| Condition | Allowed? |
|-----------|----------|
| No variants AND no merchant offers | Yes — subject to product type existence validation |
| Has variants OR has merchant offers | No — backend rejects with clear error |

- Backend is authoritative.
- Reason: changing product type changes attribute schema and variant dimensions.

## 4. Current Implementation Audit

### 4.1 UpdateProductInput (current)

**File**: `apps/api/src/modules/catalog/catalog.service.ts` L2591-2605

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
  updatedAt?: string;  // P1 optimistic locking
}
```

### 4.2 CreateProductInput (current)

**File**: `apps/api/src/modules/catalog/catalog.service.ts` L2573-2589

```typescript
export interface CreateProductInput {
  storeId?: string | null;
  title: string;
  titleAr?: string;
  slug?: string;
  description?: string;
  descriptionAr?: string;
  categoryId?: string;
  brandId?: string;
  condition?: string;
  images?: string[];
  gtin?: string;       // Already in create
  ean?: string;        // Already in create
  mpn?: string;        // Already in create
  productTypeId?: string;  // Already in create
}
```

### 4.3 Product Schema (products table)

**File**: `apps/api/src/modules/catalog/catalog.schema.ts` L57-92

| Column | Type | Nullable | Constraints |
|--------|------|----------|-------------|
| `product_type_id` | `uuid` | Yes | FK to `product_types(id)` via migration 0025 |
| `gtin` | `varchar(20)` | Yes | Partial unique index `uq_products_gtin` (migration 0025) |
| `ean` | `varchar(20)` | Yes | Partial unique index `uq_products_ean` (migration 0025) |
| `mpn` | `varchar(100)` | Yes | Non-unique index `idx_products_mpn` (migration 0027) |

### 4.4 updateProduct() Service Logic

**File**: `apps/api/src/modules/catalog/catalog.service.ts` L1318-1410

Current behavior:
1. Load product via `getProduct(id)` — throws 404 if not found
2. Build updates object
3. Apply field-level changes from input (title, description, status, condition, images, categoryId, brandId, slug, metadata)
4. If status → ACTIVE, run `validatePublish()`
5. If `clientUpdatedAt` provided → conditional UPDATE with P1 optimistic locking
6. If omitted → legacy unconditional UPDATE

**P2 gap**: No handling of `productTypeId`, `gtin`, `ean`, `mpn`.

### 4.5 Controller Extraction

**File**: `apps/api/src/modules/catalog/catalog.controller.ts` L224-233

```typescript
async updateProduct(@CurrentUser() user, @Param('id') id, @Body() input: UpdateProductInput) {
  await assertProductInOrg(this.db, { ... }, id);
  const { updatedAt: clientUpdatedAt, ...rest } = input;
  return this.catalogService.updateProduct(id, rest, clientUpdatedAt);
}
```

P2 adds 4 new fields to the body — they flow through `...rest` naturally. No controller extraction needed for these fields (unlike `updatedAt` which has special handling).

### 4.6 Variant and Offer Existence Queries

The codebase already has patterns for counting variants and offers per product:

**Variant count** (L561-568):
```typescript
const vRows = await this.db.db.select({
  productId: productVariants.productId,
  count: sql<number>`count(*)::int`,
}).from(productVariants)
  .where(inArray(productVariants.productId, productIds))
  .groupBy(productVariants.productId);
```

**Offer count** (L902-910):
```typescript
const oRows = await this.db.db.select({
  productId: merchantOffers.productId,
  count: sql<number>`count(*)::int`,
}).from(merchantOffers)
  .where(and(
    inArray(merchantOffers.productId, productIds),
    eq(merchantOffers.status, 'ACTIVE'),
  ))
  .groupBy(merchantOffers.productId);
```

**P2 note**: The offer count query filters by `status = 'ACTIVE'`. For BD-06 guard, we should count ALL offers (not just ACTIVE) since any offer reference makes a product type change unsafe.

## 5. UpdateProductInput Gap Analysis

| Field | Current UpdateProductInput | Required P2 | Gap |
|-------|---------------------------|-------------|-----|
| `title` | ✅ `string?` | — | None |
| `titleAr` | ✅ `string?` | — | None |
| `description` | ✅ `string?` | — | None |
| `descriptionAr` | ✅ `string?` | — | None |
| `status` | ✅ `string?` | — | None |
| `condition` | ✅ `string?` | — | None |
| `images` | ✅ `string[]?` | — | None |
| `categoryId` | ✅ `string?` | — | None |
| `brandId` | ✅ `string?` | — | None |
| `slug` | ✅ `string?` | — | None |
| `metadata` | ✅ `Record?` | — | None |
| `updatedAt` | ✅ `string?` (P1) | — | None |
| **`productTypeId`** | ❌ MISSING | `string?` with BD-06 guard | **ADD** |
| **`gtin`** | ❌ MISSING | `string?` with length validation | **ADD** |
| **`ean`** | ❌ MISSING | `string?` with length validation | **ADD** |
| **`mpn`** | ❌ MISSING | `string?` with length validation | **ADD** |

### Web frontend UpdateProductInput

**File**: `apps/web/src/lib/buyer-api.ts` L1058-1070

The web frontend's `UpdateProductInput` is a separate type definition that mirrors the API's. It also lacks `productTypeId`, `gtin`, `ean`, `mpn`. P2 must update this type to match the API.

## 6. Identifier Validation Audit

### 6.1 Database Constraints

| Identifier | Column | Max Length | Unique Index | Non-Unique Index |
|------------|--------|------------|--------------|------------------|
| GTIN | `varchar(20)` | 20 chars | `uq_products_gtin` (partial, WHERE NOT NULL) | — |
| EAN | `varchar(20)` | 20 chars | `uq_products_ean` (partial, WHERE NOT NULL) | — |
| MPN | `varchar(100)` | 100 chars | — | `idx_products_mpn` (migration 0027) |

### 6.2 Existing Validation

| Check | Status | Evidence |
|-------|--------|----------|
| Length constraints | DB-level only | varchar(20) / varchar(100) |
| Format validation (check digits) | NOT implemented | No GTIN/EAN check-digit logic found |
| Normalization (whitespace trimming) | NOT implemented | Values stored as-is |
| Uniqueness check on create | ✅ Implemented | `findProductByIdentifiers()` in `createProduct()` |
| Uniqueness check on update | NOT implemented | `updateProduct()` does not check identifier uniqueness |
| Null handling | ✅ Correct | All three are nullable; partial indexes exclude NULLs |

### 6.3 Rules Classification

| Rule | Status | Source | P2 Action |
|------|--------|--------|-----------|
| varchar length | ✅ Already implemented | DB schema | No action — DB enforces |
| GTIN uniqueness | ✅ Partially implemented | `findProductByIdentifiers()` on create | P2 must check on update too |
| EAN uniqueness | ✅ Partially implemented | Same | P2 must check on update too |
| MPN uniqueness | ❌ Not required | No unique index exists | No action — MPN is not unique by design |
| Check-digit validation | ❌ Not implemented | No domain logic exists | **Optional future enhancement** — BD-05 says "format check" but does not define check-digit rules |
| Whitespace trimming | ❌ Not implemented | — | P2 should trim before storing |
| Null/empty handling | Needs clarification | — | P2: empty string `""` should be stored as `null` |

### 6.4 BD-05 "Format Check" Interpretation

BD-05 says "format check" but does NOT define:
- GTIN-8/12/13/14 check-digit validation
- EAN-13 check-digit validation
- MPN format rules

The DB schema already enforces length constraints. The audit recommends:
- P2 implements: length validation (already in DB), whitespace trimming, empty→null normalization, uniqueness check on update (for GTIN/EAN)
- P2 does NOT implement: check-digit validation (no project-defined rule exists)
- Future: check-digit validation can be added when business rules are defined

## 7. Product Type Change Guard Analysis

### 7.1 Current State

`productTypeId` is set during `createProduct()` (L762) but is **never modified** by `updateProduct()`. There is no guard logic.

### 7.2 Required Guard (BD-06)

A productTypeId change is allowed ONLY when:
- `SELECT COUNT(*) FROM product_variants WHERE product_id = ?` = 0
- AND `SELECT COUNT(*) FROM merchant_offers WHERE product_id = ?` = 0

### 7.3 Concurrency / Race Condition Analysis

**Case A: P2 changes productTypeId while another transaction creates a variant**

```
T1: BEGIN; SELECT product FOR UPDATE → check variants = 0
T2: INSERT INTO product_variants (product_id = ?) → succeeds (no product lock)
T1: UPDATE products SET product_type_id = ? → succeeds
COMMIT → Product has new type BUT variant was created under old type's attribute schema
```

**Severity: HIGH** — Variant exists under wrong product type attribute schema.

**Case B: P2 changes productTypeId while another transaction creates an offer**

```
T1: check offers = 0
T2: INSERT INTO merchant_offers (product_id = ?)
T1: UPDATE product_type_id
```

**Severity: MEDIUM** — Offer references a product whose type changed. Less critical than variant case because offers don't directly depend on attribute schema.

**Case C: Two simultaneous productTypeId changes**

Protected by P1 optimistic locking — only one writer's `updatedAt` matches. The other gets 409.

**Severity: NONE** — P1 handles this.

**Case D: productTypeId change racing with variant deletion**

If variant is being deleted, the product type change might see count > 0 and reject. After deletion completes, a retry would succeed.

**Severity: LOW** — Safe behavior (false rejection, no data corruption).

**Case E: productTypeId change racing with offer deletion**

Same as Case D — safe false rejection.

**Severity: LOW**

### 7.4 Recommended Concurrency Strategy

**Use `SELECT ... FOR UPDATE` within a transaction for the productTypeId change path:**

```typescript
if (input.productTypeId !== undefined && input.productTypeId !== current.productTypeId) {
  await this.db.db.transaction(async (tx) => {
    // Lock the product row exclusively
    const [locked] = await tx.select()
      .from(products)
      .where(eq(products.id, id))
      .for('update')
      .limit(1);

    // Check variant count = 0
    const variantCount = await tx.select({ count: sql`count(*)::int` })
      .from(productVariants)
      .where(eq(productVariants.productId, id));
    if (variantCount[0].count > 0) {
      throw new BadRequestException('Cannot change product type: product has variants');
    }

    // Check offer count = 0 (ALL offers, not just ACTIVE)
    const offerCount = await tx.select({ count: sql`count(*)::int` })
      .from(merchantOffers)
      .where(eq(merchantOffers.productId, id));
    if (offerCount[0].count > 0) {
      throw new BadRequestException('Cannot change product type: product has merchant offers');
    }

    // Update productTypeId within the same transaction
    await tx.update(products)
      .set({ productTypeId: input.productTypeId, updatedAt: new Date() })
      .where(eq(products.id, id));
  });
}
```

**For `createVariant()`**: Add `FOR SHARE` lock on the product row before inserting the variant. This allows concurrent variant creation but blocks when a productTypeId change holds `FOR UPDATE`:

```typescript
// In createVariant, before inserting:
await tx.select().from(products).where(eq(products.id, productId)).for('share').limit(1);
```

- `FOR SHARE` allows multiple concurrent variant creations (they don't conflict with each other)
- `FOR UPDATE` (productTypeId change) conflicts with `FOR SHARE` → serialization
- `FOR UPDATE` also conflicts with other `FOR UPDATE` → productTypeId changes serialized

**Alternative considered**: Advisory locks — rejected as non-standard and harder to reason about.

**Alternative considered**: Relying solely on optimistic locking — rejected because variant creation does not modify the product row, so P1's `updatedAt` check does not detect the race.

### 7.5 Product Type Existence Validation

Before setting `productTypeId`, P2 must verify the target product type exists:

```typescript
if (input.productTypeId !== null) {
  const pt = await this.db.db.query.productTypes.findFirst({
    where: eq(productTypes.id, input.productTypeId),
  });
  if (!pt) throw new NotFoundException('Product type not found');
}
```

Setting `productTypeId` to `null` should be allowed (removing the type assignment).

## 8. Optimistic Locking Interaction

P1 is CLOSED / PASS. P2 must preserve the exact P1 pattern.

### 8.1 Expected Behavior Matrix

| Scenario | Expected Status | Explanation |
|----------|----------------|-------------|
| productTypeId changed with correct updatedAt | 200 | Normal update, new updatedAt returned |
| Identifier changed with correct updatedAt | 200 | Normal update, new updatedAt returned |
| Multiple P2 fields changed together | 200 | Single atomic UPDATE |
| Stale updatedAt supplied | 409 | P1 ConflictException — unchanged |
| updatedAt omitted | 200 (legacy) | P1 backward compat — unconditional UPDATE |
| productTypeId guard fails (variants exist) | 400 | BadRequestException — business rule |
| productTypeId guard fails (offers exist) | 400 | BadRequestException — business rule |
| Product does not exist | 404 | NotFoundException — unchanged |
| Product belongs to another tenant | 404 | `assertProductInOrg()` → ForbiddenException mapped to 403, or 404 depending on path |
| GTIN uniqueness violation | 409 or 400 | See §8.2 |

### 8.2 GTIN/EAN Uniqueness Conflict

When an update sets a GTIN/EAN that already exists on another product:
- The DB partial unique index will raise a violation
- This should be caught and returned as a clear error
- **Recommended**: 400 BadRequestException with message "GTIN already exists" / "EAN already exists"
- **NOT 409**: This is a validation error, not an optimistic locking conflict
- **NOT 404**: The resource exists but the identifier is taken

### 8.3 Interaction with productTypeId Transaction

The productTypeId guard uses `FOR UPDATE` inside a transaction. The optimistic locking conditional UPDATE uses `WHERE updatedAt = ?`. These two patterns must be combined carefully:

**Option A (recommended)**: When `productTypeId` is being changed AND `clientUpdatedAt` is provided:
1. Open transaction
2. `SELECT ... FOR UPDATE` to lock product
3. Check variant count = 0 AND offer count = 0
4. Conditional UPDATE with `WHERE id = ? AND updated_at = ?`
5. If 0 rows → 409 (conflict) or 400 (guard failure)
6. Commit

**Option B**: When only identifiers are changed (no productTypeId change):
- Use the existing P1 conditional UPDATE path — no transaction needed

### 8.4 Order of Checks

1. `assertProductInOrg()` → 403/404 (tenant isolation — runs in controller BEFORE service)
2. `getProduct(id)` → 404 (product not found)
3. Validate `updatedAt` format → 400 (if provided and invalid)
4. Validate `productTypeId` exists → 404 (if provided and not found)
5. Validate GTIN/EAN uniqueness → 400 (if new value conflicts)
6. Product type guard → 400 (if variants/offers exist)
7. Conditional UPDATE → 409 (if timestamp mismatch)

## 9. Authorization / Tenant Isolation

### 9.1 Current Authorization Path

| Check | Location | Effect |
|-------|----------|--------|
| `assertProductInOrg()` | `catalog.controller.ts` L229 | Runs BEFORE `updateProduct()` |
| `isTenantPrivileged()` | `tenant-scope.ts` L84 | Admin/Moderator bypass |
| Product `storeId` match | `tenant-scope.ts` L89 | Merchant must own product |

### 9.2 P2 Impact

| Aspect | Impact |
|--------|--------|
| New permissions required | **NONE** — existing `catalog:products:write` covers all P2 operations |
| Tenant isolation | **UNCHANGED** — `assertProductInOrg()` still runs first |
| Product type change exposing data | **No** — the guard checks counts within the same product; no cross-tenant data exposed |
| Wrong-tenant productTypeId guard | **Safe** — `assertProductInOrg()` runs before the guard; wrong-tenant request gets 403 before reaching variant/offer count queries |
| Identifier uniqueness oracle | **Minimal** — GTIN/EAN uniqueness check could theoretically reveal that a GTIN exists. However, the uniqueness check only runs AFTER authorization, so cross-tenant requests are rejected first |

### 9.3 Information Leakage Analysis

| Scenario | Risk | Mitigation |
|----------|------|------------|
| Wrong-tenant GTIN uniqueness check | Could reveal GTIN exists | `assertProductInOrg()` runs first → 403 before uniqueness check |
| Product type guard reveals variant count | Could reveal variant existence | Same — `assertProductInOrg()` runs first |
| Product type guard reveals offer count | Could reveal offer existence | Same |

**Verdict**: No new information leakage. Existing authorization is sufficient.

## 10. Lifecycle Analysis

### 10.1 Current Lifecycle States

| State | Editable (current) | P2 Editable? |
|-------|--------------------|--------------|
| DRAFT | Yes | Yes — all P2 fields |
| ACTIVE | Yes (limited fields) | Yes — all P2 fields |
| REJECTED | Yes (correction) | Yes — all P2 fields |
| ARCHIVED | No (admin restore first) | No — same as current |

### 10.2 Business Rules Lock Analysis

The Phase 4 Business Rules + Architecture Lock (BD-02, BD-04, BD-05, BD-06) do NOT explicitly restrict P2 field editing by lifecycle state. The existing `updateProduct()` allows editing in all non-ARCHIVED states.

**Finding**: No lifecycle restrictions specific to P2 fields. The general lifecycle rules apply:
- DRAFT/ACTIVE/REJECTED: editing allowed
- ARCHIVED: must be restored to DRAFT/ACTIVE first (existing behavior)
- Publishing (DRAFT → ACTIVE): `validatePublish()` still runs

### 10.3 validatePublish() Interaction

`validatePublish()` (L1243-1246) checks attribute completeness based on `productTypeId`. If P2 changes `productTypeId`, the publish validation will use the NEW type's attribute schema. This is correct behavior — the product must satisfy the new type's requirements before publishing.

## 11. Database / Migration Analysis

### 11.1 Column Existence Check

| Column | Table | Exists? | Migration |
|--------|-------|---------|-----------|
| `product_type_id` | `products` | ✅ Yes | 0025 |
| `gtin` | `products` | ✅ Yes | 0025 |
| `ean` | `products` | ✅ Yes | 0025 |
| `mpn` | `products` | ✅ Yes | 0025 |

### 11.2 Index Existence Check

| Index | Type | Exists? | Migration |
|-------|------|---------|-----------|
| `uq_products_gtin` | Partial unique (WHERE NOT NULL) | ✅ Yes | 0025 |
| `uq_products_ean` | Partial unique (WHERE NOT NULL) | ✅ Yes | 0025 |
| `idx_products_mpn` | Non-unique | ✅ Yes | 0027 |
| `idx_products_ptype` | Partial (WHERE NOT NULL) | ✅ Yes | 0025 |

### 11.3 FK Constraint

| FK | Source | Target | On Delete | Exists? |
|----|--------|--------|-----------|---------|
| `products.product_type_id` | `products` | `product_types(id)` | SET NULL | ✅ Yes (migration 0025) |

### 11.4 Migration Decision

**NO MIGRATION REQUIRED.**

All columns, indexes, and constraints needed for P2 already exist in the database. P2 is purely a service-layer change:
- Add fields to `UpdateProductInput`
- Add field handling in `updateProduct()`
- Add product type guard logic
- Add identifier uniqueness check on update

**Migration 0054 is NOT needed for P2.**

## 12. Compatibility Analysis

### 12.1 API Backward Compatibility

| Change | Impact |
|--------|--------|
| Add `productTypeId?: string` to UpdateProductInput | ✅ Optional — existing clients unaffected |
| Add `gtin?: string` to UpdateProductInput | ✅ Optional — existing clients unaffected |
| Add `ean?: string` to UpdateProductInput | ✅ Optional — existing clients unaffected |
| Add `mpn?: string` to UpdateProductInput | ✅ Optional — existing clients unaffected |
| Product type guard (400 on variants/offers) | ✅ New validation — only triggers when `productTypeId` is explicitly sent |
| GTIN/EAN uniqueness check on update | ✅ New validation — only triggers when identifier is explicitly sent |

**Verdict**: Fully backward compatible. All new fields are optional. New validation only activates when the new fields are used.

### 12.2 Legacy updatedAt Behavior

P1 preserved legacy behavior when `updatedAt` is omitted. P2 must NOT change this:
- Omitting `updatedAt` → legacy unconditional UPDATE (including P2 fields)
- Providing `updatedAt` → conditional UPDATE with optimistic locking (including P2 fields)

### 12.3 Frontend Impact

| Consumer | File | Impact |
|----------|------|--------|
| Web `UpdateProductInput` | `apps/web/src/lib/buyer-api.ts` L1058-1070 | Must add 4 optional fields to match API |
| B2B test `UpdateProductInput` | `apps/scs-platform-b2-test/apps/web/src/lib/buyer-api.ts` | Separate type — not in P2 scope |

### 12.4 Import Pipeline

The import pipeline creates products with identifiers via `createProduct()`. P2 does NOT modify `createProduct()` — it only modifies `updateProduct()`. Import pipeline is unaffected.

### 12.5 Existing Tests

No existing test exercises `updateProduct()` with `productTypeId`, `gtin`, `ean`, or `mpn` in the input. P2 adds new tests without modifying existing ones.

## 13. Concurrency / Race Analysis

### 13.1 Summary of Race Conditions

| Race | Severity | Mitigation |
|------|----------|------------|
| P2 productTypeId change vs concurrent variant creation | HIGH | `SELECT FOR UPDATE` on product + `FOR SHARE` in createVariant |
| P2 productTypeId change vs concurrent offer creation | MEDIUM | `SELECT FOR UPDATE` on product covers this (offer INSERT doesn't conflict, but guard check is inside the locked transaction) |
| Two simultaneous productTypeId changes | NONE | P1 optimistic locking handles this |
| P2 identifier update vs concurrent identifier update | NONE | P1 optimistic locking handles this (both modify the same product row) |
| P2 productTypeId change vs concurrent product deletion | LOW | `FOR UPDATE` serializes with `DELETE` on the same row |

### 13.2 Detailed Transaction Design for productTypeId Change

```
BEGIN TRANSACTION
  → SELECT products.* WHERE id = ? FOR UPDATE  (locks product row)
  → SELECT COUNT(*) FROM product_variants WHERE product_id = ?
  → If count > 0 → ROLLBACK + throw BadRequestException(400)
  → SELECT COUNT(*) FROM merchant_offers WHERE product_id = ?
  → If count > 0 → ROLLBACK + throw BadRequestException(400)
  → If clientUpdatedAt provided:
      → UPDATE products SET ... WHERE id = ? AND updated_at = ? RETURNING *
      → If 0 rows → ROLLBACK + throw ConflictException(409)
  → Else:
      → UPDATE products SET ... WHERE id = ?
  → Validate new productTypeId exists (if non-null)
COMMIT
```

### 13.3 createVariant Lock Recommendation

To fully prevent Case A (productTypeId change vs variant creation), `createVariant()` should acquire a `FOR SHARE` lock on the product:

```
BEGIN TRANSACTION (in createVariant)
  → SELECT * FROM products WHERE id = ? FOR SHARE  (shared lock)
  → INSERT INTO product_variants ...
COMMIT
```

- Multiple `FOR SHARE` locks are compatible (concurrent variant creation still works)
- `FOR UPDATE` (productTypeId change) is NOT compatible with `FOR SHARE` → serialization
- This adds minimal overhead (one additional SELECT per variant creation)

**Note**: If `createVariant()` modification is considered out of P2 scope, the audit recommends documenting this as a known race condition with LOW practical probability (product type changes are rare when no variants exist).

## 14. Recommended Implementation Design

### A. DTO Changes

**File**: `apps/api/src/modules/catalog/catalog.service.ts`

Add to `UpdateProductInput`:
```typescript
/** PHASE 4 P2 — Product type (BD-06). Blocked when variants or offers exist. */
productTypeId?: string | null;
/** PHASE 4 P2 — GTIN identifier (BD-05). varchar(20), unique where not null. */
gtin?: string | null;
/** PHASE 4 P2 — EAN identifier (BD-05). varchar(20), unique where not null. */
ean?: string | null;
/** PHASE 4 P2 — MPN identifier (BD-05). varchar(100), not unique. */
mpn?: string | null;
```

### B. Controller Changes

**File**: `apps/api/src/modules/catalog/catalog.controller.ts`

No structural changes needed. The 4 new fields flow through `...rest` to the service. The `updatedAt` extraction remains the only special handling.

### C. Service Changes

**File**: `apps/api/src/modules/catalog/catalog.service.ts` — `updateProduct()`

1. Add field assignments for `productTypeId`, `gtin`, `ean`, `mpn`
2. Add identifier normalization: trim whitespace, empty string → null
3. Add GTIN/EAN uniqueness check (when value changes)
4. Add productTypeId guard (when value changes): transaction with `FOR UPDATE`
5. Add product type existence validation (when non-null)

### D. Repository / Query Changes

New queries needed:
- `countVariantsByProduct(productId)` — single product variant count
- `countOffersByProduct(productId)` — single product offer count (ALL statuses)
- `findProductByGtin(gtin)` / `findProductByEan(ean)` — uniqueness check excluding self

### E. Transaction Boundaries

- **Identifier-only update** (no productTypeId change): No transaction needed — use existing P1 conditional UPDATE
- **productTypeId change**: Transaction with `FOR UPDATE` on product row
- **Combined productTypeId + identifiers**: Transaction with `FOR UPDATE`

### F. Row-Lock Strategy

- `FOR UPDATE` on product row during productTypeId change
- `FOR SHARE` on product row during createVariant (recommended, may be deferred)

### G. Optimistic-Lock Strategy

P1 pattern extends naturally. New fields are part of the same `updates` object. The conditional `WHERE updatedAt = ?` covers all fields atomically.

### H. Validation Strategy

| Field | Validation |
|-------|-----------|
| `gtin` | Trim; if empty → null; max 20 chars (DB enforces); uniqueness check |
| `ean` | Trim; if empty → null; max 20 chars (DB enforces); uniqueness check |
| `mpn` | Trim; if empty → null; max 100 chars (DB enforces); no uniqueness check |
| `productTypeId` | If non-null: must exist in `product_types`; guard: variants = 0 AND offers = 0 |

### I. Error Mapping

| Error | Status | Message |
|-------|--------|---------|
| Product not found | 404 | "Product not found" |
| Invalid updatedAt | 400 | "Invalid updatedAt timestamp" |
| Product type not found | 404 | "Product type not found" |
| Product type guard: has variants | 400 | "Cannot change product type: product has variants" |
| Product type guard: has offers | 400 | "Cannot change product type: product has merchant offers" |
| GTIN already exists | 400 | "GTIN already exists on another product" |
| EAN already exists | 400 | "EAN already exists on another product" |
| Stale updatedAt | 409 | `{ statusCode: 409, message: 'CONFLICT', currentUpdatedAt: '...' }` |

### J. Tenant / RBAC Behavior

No changes. `assertProductInOrg()` continues to run first in the controller.

### K. Test Strategy

See §15.

### L. Migration Decision

No migration required. All DB objects exist.

### M. API Compatibility Strategy

All new fields optional. Existing clients unaffected. New validation only activates when new fields are used.

## 15. Test Strategy

### 15.1 Unit Tests

| # | Test | Expected |
|---|------|----------|
| U1 | Update GTIN with correct updatedAt | 200, GTIN updated |
| U2 | Update EAN with correct updatedAt | 200, EAN updated |
| U3 | Update MPN with correct updatedAt | 200, MPN updated |
| U4 | Update productTypeId with no variants/offers | 200, productTypeId updated |
| U5 | Update productTypeId when variants exist | 400, guard rejection |
| U6 | Update productTypeId when offers exist | 400, guard rejection |
| U7 | Set productTypeId to null | 200, productTypeId cleared |
| U8 | Set non-existent productTypeId | 404, product type not found |
| U9 | GTIN uniqueness violation | 400, GTIN exists |
| U10 | EAN uniqueness violation | 400, EAN exists |
| U11 | MPN allows duplicates | 200, MPN not unique |
| U12 | Combined productTypeId + identifiers update | 200, all fields updated |
| U13 | Identifier update with stale updatedAt | 409, P1 conflict |
| U14 | Empty string identifier → stored as null | 200, null in DB |

### 15.2 PostgreSQL Integration Tests

| # | Test | Transactions | Expected Winner | Expected Loser | Expected Status | Final State |
|---|------|-------------|-----------------|----------------|----------------|-------------|
| T1 | Identifier update with correct lock | 1 | Client | — | 200 | GTIN updated, new updatedAt |
| T2 | Identifier update with stale lock | 2 | Client A (first) | Client B (stale) | A: 200, B: 409 | A's GTIN persisted |
| T3 | Two simultaneous productTypeId changes | 2 | 1 (first commit) | 1 (409 from P1) | Winner: 200, Loser: 409 | One productTypeId applied |
| T4 | productTypeId change vs variant creation | 2 | Depends on timing | Loser gets error | Type change: 200 or variant: 200 | Serialized — one blocks the other |
| T5 | productTypeId change vs offer creation | 2 | Type change (FOR UPDATE blocks offer check) | Offer may proceed but type change saw 0 | Both may succeed (offer doesn't lock product) | productTypeId changed; offer created |
| T6 | productTypeId change when variants exist | 1 | — | Request rejected | 400 | productTypeId unchanged |
| T7 | productTypeId change when offers exist | 1 | — | Request rejected | 400 | productTypeId unchanged |
| T8 | Identifier update concurrent with another identifier update | 2 | 1 (P1 lock) | 1 (409) | A: 200, B: 409 | A's identifiers persisted |
| T9 | productTypeId update concurrent with normal product update | 2 | 1 (P1 lock) | 1 (409) | A: 200, B: 409 | One update wins |
| T10 | Wrong tenant productTypeId change | 1 | — | Rejected | 403/404 | No change |
| T11 | Missing product identifier update | 1 | — | Rejected | 404 | No change |
| T12 | Invalid GTIN (too long) | 1 | — | Rejected | 400 (DB error) | No change |
| T13 | Successful GTIN update | 1 | Client | — | 200 | GTIN updated |
| T14 | Combined productTypeId + identifiers | 1 | Client | — | 200 | All fields updated |
| T15 | GTIN uniqueness: update to existing GTIN | 1 | — | Rejected | 400 | No change |

### 15.3 Regression Tests

All 457 existing tests must continue to pass.

## 16. P2 Acceptance Criteria

| ID | Criterion | Testable? |
|----|-----------|-----------|
| P2-01 | `UpdateProductInput` accepts optional `productTypeId` (string or null) | ✅ |
| P2-02 | `UpdateProductInput` accepts optional `gtin` (string or null) | ✅ |
| P2-03 | `UpdateProductInput` accepts optional `ean` (string or null) | ✅ |
| P2-04 | `UpdateProductInput` accepts optional `mpn` (string or null) | ✅ |
| P2-05 | GTIN update with correct updatedAt succeeds (200) | ✅ |
| P2-06 | EAN update with correct updatedAt succeeds (200) | ✅ |
| P2-07 | MPN update with correct updatedAt succeeds (200) | ✅ |
| P2-08 | productTypeId update succeeds when no variants and no offers exist | ✅ |
| P2-09 | productTypeId update rejected (400) when variants exist | ✅ |
| P2-10 | productTypeId update rejected (400) when merchant offers exist | ✅ |
| P2-11 | productTypeId can be set to null (clear type assignment) | ✅ |
| P2-12 | Non-existent productTypeId → 404 | ✅ |
| P2-13 | GTIN uniqueness enforced on update (400 if taken) | ✅ |
| P2-14 | EAN uniqueness enforced on update (400 if taken) | ✅ |
| P2-15 | MPN allows duplicates (no uniqueness constraint) | ✅ |
| P2-16 | Stale updatedAt with P2 fields → 409 (P1 preserved) | ✅ |
| P2-17 | Omitted updatedAt with P2 fields → legacy update (P1 preserved) | ✅ |
| P2-18 | Tenant isolation: wrong-tenant P2 update → 403/404 | ✅ |
| P2-19 | RBAC: no new permissions required | ✅ |
| P2-20 | Lifecycle: P2 fields editable in DRAFT, ACTIVE, REJECTED | ✅ |
| P2-21 | productTypeId guard uses transaction with row lock (no race) | ✅ |
| P2-22 | Empty string identifier stored as null | ✅ |
| P2-23 | Backward compatible: existing clients unaffected | ✅ |
| P2-24 | No migration 0054 required | ✅ |
| P2-25 | Phase 3 regression: 432/432 baseline PASS | ✅ |
| P2-26 | P1 regression: 12/12 unit + 13/13 integration PASS | ✅ |
| P2-27 | TypeScript: 0 errors | ✅ |
| P2-28 | Nest build: succeeds | ✅ |

## 17. Scope / Non-Goals

P2 does NOT include:

- Admin editor (P3)
- Admin attributes editor (P4)
- Admin variant management (P5)
- Merchant Product Studio edit mode (P6)
- Merchant variant editing (P7)
- Admin product list redesign (P8)
- Audit trail expansion (P9)
- Frontend conflict UX (P3/P6)
- Variant deactivation (P5/P7)
- GTIN dedup UI (deferred)
- Performance/index redesign
- Mobile redesign
- Shipping, payment, returns, refunds, notifications
- Check-digit validation for GTIN/EAN (no project-defined rule)
- `createProduct()` changes (already supports all P2 fields)
- Import pipeline changes

## 18. Risks and Open Questions

### RISK-01: productTypeId Guard vs createVariant Race

**Risk**: If `createVariant()` is not modified to acquire `FOR SHARE`, a narrow race window exists where a productTypeId change and variant creation could interleave.

**Probability**: LOW — productTypeId changes only occur when no variants exist, and variant creation is typically done before product type changes.

**Mitigation**: Add `FOR SHARE` in `createVariant()` as part of P2, or defer to a follow-up.

**Recommendation**: Include in P2 for completeness.

### RISK-02: GTIN/EAN Uniqueness Scope

**Risk**: The uniqueness check on update must exclude the current product (self-match). If product A has GTIN "123" and updates GTIN to "123" (same value), it should not fail.

**Mitigation**: Uniqueness query must include `WHERE id != currentProductId`.

### RISK-03: Offer Count Scope

**Risk**: The existing offer count query filters by `status = 'ACTIVE'`. BD-06 guard should count ALL offers regardless of status.

**Mitigation**: P2 guard query must NOT filter by status.

### OPEN-01: Check-Digit Validation

BD-05 says "format check" but does not define check-digit rules. This audit recommends deferring check-digit validation until business rules are explicitly defined. If the user wants check-digit validation in P2, this should be resolved in the P2 Business Rules + Architecture Lock.

### OPEN-02: Identifier Normalization Beyond Trim

Should GTIN/EAN be normalized (e.g., remove dashes, spaces)? The current codebase does not normalize. This audit recommends: trim whitespace only. Further normalization deferred.

## 19. GO / NO-GO Verdict

**GO WITH CONDITIONS**

Conditions:
1. The productTypeId guard MUST use `SELECT ... FOR UPDATE` within a transaction (not a simple SELECT→check→UPDATE pattern)
2. The offer count check for BD-06 MUST count ALL offers (not just ACTIVE)
3. The GTIN/EAN uniqueness check MUST exclude the current product (self-match)
4. `createVariant()` SHOULD acquire `FOR SHARE` on the product row to fully prevent the productTypeId-vs-variant-creation race (or this race must be explicitly accepted as a known limitation)

These conditions are implementable within P2 without architectural changes.

## 20. Exact Next Step

After this audit, the next step is:

**P2 BUSINESS RULES + ARCHITECTURE LOCK**

This document formally records:
- All conditions from this audit
- Check-digit validation decision (implement or defer)
- Identifier normalization decision
- `createVariant()` lock decision (include or defer)
- Exact error messages and status codes
- Test requirements

**NOT P2 IMPLEMENTATION.**

---

**Production files changed: 0**
**Database migrations created: 0**
**Schema changes: 0**
**Frontend changes: 0**
