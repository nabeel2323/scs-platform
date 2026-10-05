# SCS Platform — Catalog Import + Product / Variant Management

# Business Rules + Architecture Decision Lock

**Gate:** Decision Lock (Gate 2 of 4)
**Milestone scope:** Catalog Import + Product / Variant Management
**Status:** DECISION-LOCK COMPLETE
**Predecessor:** SCS-CATALOG-PRODUCT-MANAGEMENT-FRESH-AUDIT.md (GO WITH CONDITIONS)
**Next Phase:** Catalog Product Management Implementation
**Implementation:** STRICTLY FORBIDDEN IN THIS PHASE

---

## 1. Scope

This document is the authoritative implementation specification for all catalog import and product/variant management work derived from the Fresh Architecture Audit. It locks every business rule, architecture decision, data contract, and acceptance criterion that implementation must follow.

**In scope:**
- Admin XLSX catalog import pipeline (parse → validate → plan → execute)
- Product/variant/category/brand/attribute CRUD via API and UI
- Merchant Product Studio (6-step wizard)
- Merchant CSV import pipeline
- Attribute storage model (typed tables vs JSONB)
- Import transaction/error architecture
- Admin product management UX
- RBAC/tenancy as it relates to catalog operations

**Out of scope (non-goals, §18):**
- Payment/refund, shipping, fulfillment, returns, notifications
- Mobile application catalog UI
- Arabic/RTL localization
- Unrelated infrastructure work
- M7.3-D or any later milestone

---

## 2. Baseline

```text
Branch:       develop
HEAD:         229949f934f6bfe447d4bce600a84fcbfe4dc365 (M7.3-C CLOSED/PASS)
Migrations:   0001–0050
Audit:        docs/production/SCS-CATALOG-PRODUCT-MANAGEMENT-FRESH-AUDIT.md
Audit verdict: GO WITH CONDITIONS
```

**Verified repository state:**
- `product_variants.weight_grams` is `integer('weight_grams')` in Drizzle (catalog.schema.ts:102), `INT` in migration 0004:101. No migration has ever altered this column type.
- `ExcelExecutorService.upsertVariant()` (excel-executor.service.ts:636) inserts `weightGrams: (d.weightGrams as number) ?? null` — no integer coercion.
- `ExcelPlannerService` (excel-planner.service.ts:465) converts via `Number(row['weight_grams'])` — `"9.7"` becomes `9.7` (float).
- `ExcelValidatorService.validateVariants()` (excel-validator.service.ts:501–520) checks only product_slug, SKU presence, SKU duplicates. No numeric type, NOT NULL, enum, or range validation.
- Entire import executes in a single `db.transaction()` (excel-executor.service.ts:89). Per-entity try/catch blocks are ineffective due to PostgreSQL transaction poisoning.
- `ProductDetails.tsx` (admin) reads `value['attributes']` — the legacy JSONB column. It does not read `product_attribute_values` or `variant_attribute_values`.
- `useProductStudio.ts` writes attributes as `valueText` for all types (line 185) and variant attributes as JSONB (line 212: `attributes: JSON.parse(comboKey)`).
- Merchant import (`/merchant/import`) is a completely separate CSV pipeline with different target columns and no shared code with the admin XLSX pipeline.
- RBAC: admin import gated by `catalog:imports:manage` + ADMIN/SUPER_ADMIN role. Merchant product CRUD gated by `merchant:products:write` with `assertProductInOrg` tenant-scope check.

---

## 3. Audit Reference

All findings from the audit are accepted as verified. The critical findings driving this lock:

| ID | Severity | Summary |
|----|----------|---------|
| CF-01 | CRITICAL | `weight_grams INT` vs decimal values — validation passes, persistence fails |
| CF-02 | CRITICAL | Single-transaction import — one failure poisons all subsequent operations |
| CF-03 | CRITICAL | Validator does not check numeric types, NOT NULL, enums, or ranges |
| HF-01 | HIGH | Admin product list is generic ManagementPage, no catalog-specific search |
| HF-02 | HIGH | `weight_grams INT` semantically wrong for physical product weights |
| HF-03 | HIGH | Dual attribute storage (JSONB + typed tables) with no authoritative source |
| HF-04 | HIGH | Two separate import systems with no shared validation |
| HF-05 | HIGH | Product Studio does not enforce product-type required attributes |
| MF-01 | MEDIUM | `sort_order`/`display_order` Number() into INT — same class of error |
| MF-02 | MEDIUM | No per-entity transaction isolation |
| MF-03 | MEDIUM | Error display does not distinguish root from cascade |
| MF-04 | MEDIUM | `dimensions_mm JSONB` has no schema enforcement |
| MF-05 | MEDIUM | No E2E test for import → product management workflow |
| MF-06 | MEDIUM | Typed attribute values written by importer not rendered by admin UI |

---

## 4. Business Rules — BD-01: Weight Representation

### Decision: NUMERIC(10,2)

**Rationale:** Real manufacturer data legitimately contains decimal weights (e.g., Kingston KC3000 SSD: 9.7g). The B2B marketplace imports real catalog data from manufacturers who routinely provide decimal weights. Rounding to integer loses meaningful precision. Rejecting decimals forces users to manually pre-process data, which is unacceptable for a bulk import system.

**Locked specification:**

| Property | Value |
|----------|-------|
| Database type | `NUMERIC(10,2)` |
| Precision | 10 total digits |
| Scale | 2 decimal places |
| Minimum value | `0.01` (one hundredth of a gram) |
| Maximum value | `99999999.99` (~10 metric tons) |
| Zero valid? | NO — `CHECK (weight_grams > 0)` |
| Null valid? | YES — weight is optional for products where weight is unknown |
| Unit | Grams (g) |
| Import representation | Decimal number in XLSX cell (e.g., `9.7`, `0.5`, `1250.00`) |
| API representation | `number` in JSON (serialized as decimal, e.g., `9.70`) |
| UI representation | Decimal number with unit label "g" (e.g., "9.70 g") |
| Rounding behavior | N/A — NUMERIC(10,2) stores exact decimal, no rounding needed |
| Serialization | Drizzle `numeric()` returns string; API coerces to `number` for JSON response |

**Migration required:** `ALTER TABLE product_variants ALTER COLUMN weight_grams TYPE NUMERIC(10,2)`. Existing integer values are implicitly compatible (e.g., `100` becomes `100.00`). No data loss.

**Drizzle schema change:** `weightGrams: numeric('weight_grams', { precision: 10, scale: 2 })`.

**Validator contract:** The import validator must reject non-numeric values, negative values, zero values, and values exceeding 99999999.99.

---

## 5. Business Rules — BD-02: Import Atomicity

### Decision: VALID-ROWS-COMMIT with Per-Entity-Type Isolation

**Rationale:** A catalog import may contain thousands of rows across 12 entity types. Losing all work because one variant has a bad weight value is unacceptable for administrators managing large catalogs. The current all-or-nothing approach is safe but unusable at scale.

**Locked specification:**

| Concept | Definition |
|---------|------------|
| **Entity** | A single row in a specific entity type (e.g., one category, one product, one variant) |
| **Entity type** | One of: categories, brands, attribute_groups, attributes, attribute_options, product_types, product_type_attributes, products, product_attributes, variants, variant_attributes, sources |
| **Batch** | All entities of a single entity type within one import job |
| **Transaction boundary** | One database transaction per entity type (12 transactions total per import) |
| **Independent entity** | An entity type that has no FK dependency on entities created earlier in the same import |
| **Dependent entity** | An entity type that requires a FK reference resolved from a prior entity type |

**Dependency chain (locked):**

```text
categories              → independent
brands                  → independent
attribute_groups        → independent
attributes              → independent
attribute_options       → depends on: attributes
product_types           → depends on: categories
product_type_attributes → depends on: product_types, attributes, attribute_groups
products                → depends on: categories, brands, product_types
product_attributes      → depends on: products, attributes
variants                → depends on: products
variant_attributes      → depends on: variants, attributes
sources                 → depends on: products
```

**Failure semantics:**

| Scenario | Behavior |
|----------|----------|
| Category row fails | That category is rejected. Dependent product_types referencing it are also rejected (DEPENDENCY_ERROR). Independent entities (brands, attributes) continue normally. |
| Product row fails | That product is rejected. All variants referencing that product are rejected (DEPENDENCY_ERROR). All product_attributes referencing that product are rejected. Independent entities continue. |
| Variant row fails | That variant is rejected. Variant_attributes referencing that variant are rejected. Other variants of the same product are unaffected. Other entity types continue. |
| Attribute row fails | That attribute is rejected. Attribute_options, product_type_attributes, product_attributes, variant_attributes referencing it are rejected. |
| Product type row fails | That product type is rejected. Products referencing it are rejected. Product_type_attributes for it are rejected. |

**Parent-child commit rules:**

| Question | Answer |
|----------|--------|
| Can products commit when their variants fail? | YES — products are in their own transaction; variant failures do not affect product commit |
| Can variants commit when their product fails? | NO — if the product transaction failed, variants referencing it get DEPENDENCY_ERROR |
| Can categories/brands/attributes commit independently? | YES — each has its own transaction |
| Can product_attributes commit when their product fails? | NO — DEPENDENCY_ERROR |
| What happens to cross-sheet dependencies? | Resolved by natural key; if the parent entity was rejected, children get DEPENDENCY_ERROR with the root_error_id pointing to the parent failure |

---

## 6. Business Rules — BD-03: Attribute Storage Authority

### Decision: Typed Attribute Tables Become Authoritative

**Rationale:** The typed value tables (`product_attribute_values`, `variant_attribute_values`) were specifically designed (migration 0025) to replace the legacy JSONB blobs. They support faceting, filtering, comparison queries, and governed attribute definitions. The import pipeline already writes to them. The Product Studio must be migrated to write to them. The admin UI must be migrated to read from them.

**Locked specification:**

| Property | Value |
|----------|-------|
| Authoritative product attributes | `product_attribute_values` |
| Authoritative variant attributes | `variant_attribute_values` |
| Allowed value types | `value_text` (TEXT), `value_number` (NUMERIC), `value_boolean` (BOOLEAN), `option_value` (VARCHAR(200)), `value_json` (JSONB) |
| SELECT semantics | Store single option_key in `option_value` |
| MULTI_SELECT semantics | Store as `value_json` JSON array of option_keys |
| Required attributes | Enforced at application layer via `product_type_attributes.required = true` |
| Variant-scope attributes | `product_type_attributes.scope = 'VARIANT'` — stored in `variant_attribute_values` |
| Product-scope attributes | `product_type_attributes.scope = 'PRODUCT'` — stored in `product_attribute_values` |

**Read path (locked):**
- Admin ProductDetails reads from `product_attribute_values` + `variant_attribute_values` (NOT legacy JSONB)
- Merchant product detail reads from typed tables
- Buyer product display reads from typed tables
- API responses serialize typed values with their attribute definition metadata

**Write path (locked):**
- Import pipeline writes to typed tables (already does — no change)
- Product Studio writes to typed tables via `upsertProductAttributeValues` / `upsertVariantAttributeValues` API (MUST change from current JSONB write)
- Direct API `createVariant` / `updateVariant` writes to typed tables (MUST change from current JSONB write)
- Legacy JSONB `attributes` column is NOT written by any new code path

**Migration / backfill:**

| Step | Action |
|------|--------|
| 1 | Identify all products/variants with non-empty JSONB `attributes` |
| 2 | For each JSONB key-value pair, resolve the attribute definition by name/code |
| 3 | Insert corresponding row into `product_attribute_values` or `variant_attribute_values` |
| 4 | Detect conflicts: if both JSONB and typed table have a value for the same attribute, report the conflict |
| 5 | Conflict resolution: typed table value wins (it was written by the governed pipeline) |
| 6 | After backfill, set JSONB `attributes` to `{}` (empty) for backfilled rows |
| 7 | JSONB column remains in schema (readable) but is deprecated — no new writes |

**Compatibility period:** During the implementation phase, both storage paths may coexist. The admin UI must check typed tables first; if empty, fall back to JSONB for display only. After the cutover migration is verified, JSONB fallback is removed.

**Deprecation strategy:** After cutover migration + verification:
- Remove JSONB write paths from `catalog.service.ts` createVariant/updateVariant
- Remove JSONB read paths from admin ProductDetails
- Keep JSONB column in schema (do NOT drop column — too destructive) but ignore it
- Document JSONB as deprecated in code comments

---

## 7. Business Rules — BD-04: Admin vs Merchant Import

### Decision: Keep Separate with Clear Boundary Contract

**Rationale:** The two systems serve fundamentally different purposes:
- Admin XLSX import: canonical catalog data (categories, brands, attributes, product types, products, variants) — platform-governed
- Merchant CSV import: store-scoped products with pricing (name, sku, price, moq, stock) — merchant-owned

Unifying them into one pipeline would create unnecessary complexity and risk. However, they must not silently evolve into incompatible product models.

**Locked boundary:**

| Aspect | Admin XLSX Import | Merchant CSV Import |
|--------|-------------------|---------------------|
| Responsibility | Canonical catalog master data | Store-scoped product + offer data |
| File format | XLSX (multi-sheet workbook) | CSV (single sheet) |
| Entity scope | categories, brands, attributes, product types, products, variants, sources | products (store-scoped), variants, offers |
| Creates canonical products? | YES (store_id NULL or specified) | YES (store_id = merchant's store) |
| Creates offers? | NO | YES (price, MOQ, stock) |
| Creates variants? | YES (canonical variants) | YES (store-scoped variants) |
| Validation ownership | ExcelValidatorService (server-side, 5-layer) | Client-side CSV parser + server-side validation |
| Error model | Structured ImportError with sheet/row/field/code | Simple error list |
| Product creation | Via canonical pipeline with slug/brand/category/type | Via merchant API with name/store |
| Offer creation | N/A | Creates merchant_offers row |
| Variant creation | Via canonical pipeline with SKU/product_slug | Via merchant API with SKU/product |
| Shared components | Product/variant DB tables, Drizzle schema | Product/variant DB tables, Drizzle schema |
| Separate components | Parser, validator, resolver, planner, executor | CSV parser, column mapper, merchant import service |

**Invariant:** Both systems write to the same `products` and `product_variants` tables. Both must respect the same column constraints (VARCHAR lengths, numeric types, NOT NULL). The merchant import must NOT bypass the validation improvements locked in AD-02.

---

## 8. Business Rules — BD-05: Dimension Model

### Decision: Keep JSONB with Explicit Schema Contract

**Rationale:** Dedicated columns (length_mm, width_mm, height_mm) would require a migration and schema change for marginal benefit. A structured typed dimension model is over-engineering for the current need. JSONB is flexible enough for dimensions, which are rarely queried as filter criteria in a B2B catalog.

**Locked JSONB schema contract:**

```json
{
  "length": number | null,
  "width": number | null,
  "height": number | null
}
```

| Property | Value |
|----------|-------|
| Units | Millimeters (mm) |
| Allowed decimal precision | 2 decimal places (e.g., `152.50`) |
| Minimum value | `0.01` per dimension |
| Maximum value | `99999.99` per dimension |
| Null behavior | Individual dimensions may be null; the object defaults to `{}` (empty) |
| Validation | Application-layer: each key must be a positive number or null; no extra keys allowed |
| API shape | `Record<string, number \| null>` — serialized as JSON object |
| Import representation | Not imported via XLSX pipeline (dimensions set via API/UI only) |
| UI representation | Three labeled input fields: "Length (mm)", "Width (mm)", "Height (mm)" |

**Validator contract:** When dimensions are provided, the validator must reject:
- Non-numeric values
- Negative or zero values
- Values exceeding 99999.99
- Keys other than `length`, `width`, `height`

---

## 9. Architecture Decisions — AD-01: Import Transaction Isolation

### Decision: Separate Transaction per Entity Type (Option B)

**Rationale:** SAVEPOINT per entity (Option A) has overhead proportional to entity count and still risks long-running transactions. Separate transaction per entity (Option C) is too granular — 10,000 products = 10,000 transactions. Separate transaction per entity type (12 transactions) balances isolation with performance and aligns with the BD-02 dependency model.

**Locked transaction boundaries:**

| # | Entity Type | Transaction | Depends On |
|---|-------------|-------------|------------|
| 1 | categories | TX-1 | — |
| 2 | brands | TX-2 | — |
| 3 | attribute_groups | TX-3 | — |
| 4 | attributes | TX-4 | — |
| 5 | attribute_options | TX-5 | TX-4 (attributes) |
| 6 | product_types | TX-6 | TX-1 (categories) |
| 7 | product_type_attributes | TX-7 | TX-6, TX-4, TX-3 |
| 8 | products | TX-8 | TX-1, TX-2, TX-6 |
| 9 | product_attributes | TX-9 | TX-8, TX-4 |
| 10 | variants | TX-10 | TX-8 |
| 11 | variant_attributes | TX-11 | TX-10, TX-4 |
| 12 | sources | TX-12 | TX-8 |

**Dependency handling:**
- If TX-N fails for an entity type, all subsequent transactions that depend on it skip entities referencing the failed rows
- Skipped entities are recorded as DEPENDENCY_ERROR with root_error_id pointing to the original failure
- Independent transactions continue normally

**Rollback behavior:**
- Within a transaction: all-or-nothing for that entity type batch
- Across transactions: no rollback of committed transactions — prior entity types remain committed
- The import job status becomes `COMPLETED_WITH_ERRORS` if any transaction had rejections

**Retry behavior:**
- A failed import can be re-executed without re-uploading (the parsed/validated plan is cached)
- Re-execution starts from the first failed entity type transaction
- Already-committed entity types are re-evaluated: existing entities are matched by natural key and classified as UNCHANGED
- Idempotency is guaranteed by upsert-on-conflict for all entity types (ON CONFLICT DO UPDATE or DO NOTHING)

**Partial success semantics:**
- An import with 12 entity types may have 10 succeed fully, 1 succeed partially, and 1 fail entirely
- The result report shows per-entity-type breakdown: created, updated, unchanged, rejected
- Users see exactly which entity types succeeded and which failed

**Result reporting:**
- `ExecutionResult` extended with per-entity-type breakdown
- Each entity type has: `{ created, updated, unchanged, rejected, errors[] }`
- Total row: sum of all entity types

**Idempotency:**
- Categories by `slug` (UNIQUE)
- Brands by `slug` (UNIQUE)
- Attributes by `code` (UNIQUE)
- Products by `(store_id, slug)` (UNIQUE)
- Variants by `(product_id, sku)` (UNIQUE)
- All upserts use ON CONFLICT to prevent duplicate-key errors

**Duplicate handling:**
- Within-file duplicates are caught by the validator (DUPLICATE_KEY error)
- Cross-import duplicates are handled by upsert (existing entity is updated or classified as UNCHANGED)

---

## 10. Architecture Decisions — AD-02: Validation Contract

### Decision: 5-Layer DB-Aware Validation

**Goal:** `VALIDATION PASS → EXECUTION SHOULD NOT FAIL` except for genuine concurrency/external/database failures.

**Locked validation layers:**

### Layer 1 — File Validation

| Check | Detail |
|-------|--------|
| File type | XLSX only (reject non-XLSX with clear error) |
| Sheet structure | Expected sheets present (brands, categories, products, variants, etc.) |
| Headers | Required columns present in each sheet |
| Encoding | Handled by ExcelJS library |
| Required columns | Per-sheet required column list enforced |

### Layer 2 — Syntax Validation

| Type | Check | Applies To |
|------|-------|------------|
| Integer | Value must parse as integer (no decimal point) | `sort_order`, `display_order`, `moq` |
| Decimal | Value must parse as valid number | `weight_grams`, `value_number` |
| Boolean | Value must be `true`/`false`/`0`/`1`/`yes`/`no` | boolean columns |
| Enum | Value must match allowed set | `status`, `condition`, `scope`, `type` (attribute) |
| String | Value must be non-empty if required | all NOT NULL fields |
| UUID | Value must be valid UUID format | FK references where applicable |

### Layer 3 — Domain Validation

| Check | Detail |
|-------|--------|
| Numeric ranges | `weight_grams > 0 AND weight_grams <= 99999999.99` |
| Required values | NOT NULL DB columns must have values |
| Business rules | SKU format, slug format (lowercase, hyphens) |
| Variant rules | SKU unique per product; combination_key uniqueness |
| Attribute rules | Value matches attribute type (TEXT/NUMBER/BOOLEAN/SELECT/MULTI_SELECT) |
| Dimension validation | If provided, each dimension is positive number <= 99999.99 |

### Layer 4 — Reference Validation

| Check | Detail |
|-------|--------|
| Category | `category_slug` exists in workbook or database |
| Brand | `brand_slug` exists in workbook or database |
| Product type | `product_type_code` exists in workbook or database |
| Attribute | `attribute_code` exists in workbook or database |
| Option | `option_key` exists for the parent attribute |
| Product | `product_slug` exists in workbook products sheet |
| Variant | `variant_sku` exists in workbook variants sheet |
| Dependency | Parent entity must not have been rejected in a prior transaction |

### Layer 5 — Persistence Compatibility

| Constraint | Validation |
|------------|------------|
| NOT NULL | Checked in Layer 3 |
| Unique constraints | Checked in Layer 3 (within-file) + Layer 4 (cross-reference) |
| FK constraints | Checked in Layer 4 |
| Enum constraints | Checked in Layer 2 |
| Numeric types | Checked in Layer 2 (integer vs decimal distinction) |
| Numeric ranges | Checked in Layer 3 |
| String lengths | Checked by existing VARCHAR_LIMITS pre-flight |
| CHECK constraints | Validated where defined (e.g., `weight_grams > 0`) |

**Guarantee:** If validation passes, execution will not fail due to data type mismatch, constraint violation, or reference error. The only remaining failure modes are:
- Concurrent modification (another process deletes a referenced entity)
- Database infrastructure failure (disk full, connection lost)
- Storage service failure (for media imports)

---

## 11. Architecture Decisions — AD-03: Error Model

### Decision: Three-Tier Error Classification with Structured Error Records

**Locked error types:**

### ROOT_ERROR
The original, actionable failure. The user can fix this by correcting the data.

Examples:
- `weight_grams = "9.7"` when column was INT (now fixed by BD-01, but pattern remains)
- `sku = ""` (missing required value)
- `category_slug = "nonexistent"` (reference not found)
- `status = "INVALID"` (enum violation)

### DEPENDENCY_ERROR
A record could not be processed because its parent/dependency failed with a ROOT_ERROR.

Examples:
- Variant cannot be created because its product was rejected
- Product_attribute cannot be created because its attribute definition was rejected
- Variant_attribute cannot be created because its variant was rejected

### CASCADE_ERROR (suppressed)
A technical consequence that is NOT shown as an independent user error. Under the new transaction model, cascade errors are eliminated by design (separate transactions prevent transaction poisoning). If a cascade error somehow occurs, it is logged but not displayed to the user.

**Locked error record structure:**

```typescript
interface ImportError {
  error_id: string;           // UUID
  severity: 'ERROR' | 'WARNING' | 'DEPENDENCY';
  entity_type: string;        // 'products' | 'variants' | 'categories' | etc.
  entity_identifier: string;  // natural key (slug, sku, code)
  sheet: string;              // XLSX sheet name
  row: number;                // 1-based row number
  column: string | null;      // column name in sheet
  field: string | null;       // logical field name
  raw_value: string | null;   // original cell value
  normalized_value: string | null; // parsed/trimmed value
  code: string;               // machine-readable error code
  message: string;            // human-readable message
  expected: string | null;    // what was expected (e.g., "positive integer")
  actual: string | null;      // what was found (e.g., "9.7 (decimal)")
  dependency: string | null;  // entity_identifier of the dependency that failed
  root_error_id: string | null; // links DEPENDENCY_ERROR to its ROOT_ERROR
}
```

**Error display by context:**

| Context | What appears |
|---------|-------------|
| Validation preview | All ROOT_ERRORs + DEPENDENCY_ERRORs (grouped by root cause) |
| Execution result | ROOT_ERRORs + DEPENDENCY_ERRORs with per-entity-type breakdown |
| Import history | Summary counts: N root errors, N dependency errors, N warnings |
| Downloadable report | Full error table with all fields |
| UI notifications | Top-level summary: "Import completed with N errors. X root causes identified." |

**UI rules:**
- ROOT_ERRORs are displayed prominently with field-level detail
- DEPENDENCY_ERRORs are collapsed under their root_error_id (e.g., "3 variants rejected because product 'laptop-14' was rejected")
- CASCADE_ERRORs are never displayed
- The user can always identify the actual root cause immediately

---

## 12. Architecture Decisions — AD-04: Admin Product Management

### Decision: Build Catalog-Specific Product List and Enhanced Product Detail

**Locked Admin Product List contract:**

| Capability | Required | Implementation |
|------------|----------|----------------|
| Product search by name | YES | Text input → API `?search=` |
| SKU search | YES | Text input → API `?sku=` (searches variant SKUs) |
| Variant SKU search | YES | Same as SKU search (variant-level) |
| Barcode search | YES | Text input → API `?barcode=` |
| Category filter | YES | Dropdown → API `?categoryId=` |
| Brand filter | YES | Dropdown → API `?brandId=` |
| Product-type filter | YES | Dropdown → API `?productTypeId=` |
| Status filter | YES | Dropdown → API `?status=` (DRAFT, ACTIVE, ARCHIVED, REJECTED) |
| Pagination | YES | Server-side pagination with page size selector |
| Sorting | YES | Sortable columns: name, created, updated, status |
| Bulk selection | YES | Checkbox per row + select all |
| Bulk actions | YES | Activate, Archive, Export selected |
| Import shortcut | YES | "Import" button → `/catalog-import` |
| Export shortcut | YES | "Export" button → triggers catalog export XLSX |

**Locked Admin Product Detail contract:**

| Section | Content |
|---------|---------|
| Overview | Product identity: title, slug, description, category, brand, product type, status, GTIN/EAN/MPN, condition, created/updated dates |
| Typed Attributes | Product-scope attribute values from `product_attribute_values`, grouped by attribute group |
| Variants | Variant table with inline edit capability: SKU, title, barcode, unit, weight, dimensions, status. "Add Variant" button. |
| Offers | Merchant offers for this product: store, price, MOQ, lead time, status |
| Media | Product-level and variant-level media with reorder capability |
| Status | Current status with moderation actions (APPROVE, REJECT, ARCHIVE) |
| Audit/History | Where supported: created_at, updated_at, uploaded_by |

**Locked Variant Management contract:**

| Capability | Required |
|------------|----------|
| Create variant | YES — from product detail page |
| Edit variant | YES — inline or modal form |
| Deactivate variant | YES — toggle is_active |
| Archive variant | Where appropriate |
| Variant attribute editing | YES — edit typed attribute values |
| SKU management | YES — edit SKU with uniqueness check |
| Barcode | YES — edit barcode |
| Physical data | YES — weight_grams (decimal), dimensions_mm |
| Variant-specific media | YES — assign media to specific variant |
| Validation | YES — clear field-level validation messages |

---

## 13. Merchant Product Studio Contract

The existing 6-step wizard is retained with the following locked enhancements:

### Step 1: Identity
- Product type selection is **required** before proceeding
- Selecting a product type loads its attribute schema (required attributes, variant dimensions)
- Required attributes are visually indicated with asterisk (*)

### Step 2: Specifications
- Shows ONLY the attributes defined by the selected product type
- Required attributes are enforced — user cannot proceed without filling them
- Attribute input type matches attribute definition type (TEXT → text input, NUMBER → numeric input, SELECT → dropdown, BOOLEAN → toggle)
- Real-time validation feedback per field

### Step 3: Variants
- Variant dimension options come from the product type's configured `variant_dimensions`
- Shows which attributes are variant-scoped
- Combination matrix generated from variant dimension values
- SKU auto-generated from combination attributes

### Step 4: Offer
- Pricing, MOQ, lead time, warehouse selection
- Store selection required
- Currency defaults to SAR

### Step 5: Media
- Image upload with presigned URLs
- Primary image designation
- Drag-to-reorder

### Step 6: Review
- Completeness score (existing)
- Summary of all entered data
- Required attribute completeness check
- User can review before committing

**Locked rules:**
- Validation occurs at each step, not deferred to save
- Required attributes block progression from Step 2
- Product type selection is mandatory (no skip)
- Save creates product + typed attribute values + variants + offer in sequence
- All attribute writes go to typed tables (NOT legacy JSONB)

---

## 14. Product / Variant Business Rules

### Ownership Model (locked):

| Entity | Represents | Owns |
|--------|------------|------|
| **Product** | WHAT THE PRODUCT IS | title, description, brand, category, product type, product attributes, GTIN/EAN/MPN, condition, status |
| **Variant** | WHAT IS ACTUALLY PURCHASED AS A SKU | SKU, barcode, unit, weight, dimensions, variant attributes, combination_key |
| **Merchant Offer** | HOW A MERCHANT SELLS THE PRODUCT/VARIANT | price, MOQ, stock, warehouse, lead time, availability, currency, order_increment |

### Field Ownership (locked):

| Field | Owned By |
|-------|----------|
| title, title_ar | Product |
| description, description_ar | Product |
| brand | Product |
| category | Product |
| product type | Product |
| product attributes | Product (via product_attribute_values) |
| variant attributes | Variant (via variant_attribute_values) |
| SKU | Variant |
| barcode | Variant |
| weight_grams | Variant |
| dimensions_mm | Variant |
| media (product-level) | Product |
| media (variant-level) | Variant |
| price | Merchant Offer |
| MOQ | Merchant Offer |
| stock/availability | Merchant Offer (via inventory_items) |
| warehouse | Merchant Offer |

**Invariant:** Price, MOQ, stock, and availability are NEVER stored on products or variants. They are exclusively on merchant_offers.

---

## 15. Import ↔ UI Parity Rule

**Locked invariants:**

1. Any canonical product/variant state created by the importer MUST be representable and manageable through the Admin Product Management UI.
2. Any canonical product/variant state created through the Admin Product Management UI MUST be representable by the canonical XLSX exporter.
3. There must be NO silent creation of data that the UI cannot display or edit.

**Current exceptions (to be remediated):**

| Exception | Current State | Remediation |
|-----------|---------------|-------------|
| Typed attribute values from import not visible in admin UI | Import writes `product_attribute_values`; admin reads JSONB | AD-04 + BD-03 cutover: admin reads typed tables |
| Product Studio writes JSONB not visible to import | Studio writes `variants.attributes` JSONB | BD-03: Studio writes typed tables |
| Merchant CSV import creates store-scoped products | Store-scoped products not in admin XLSX export scope | Documented exception: merchant products are managed via merchant tools |

---

## 16. RBAC / Tenancy Contract

**Locked capability matrix:**

| Capability | Admin | SuperAdmin | Moderator | Merchant Owner | Merchant Staff | Merchant Manager | Buyer | Driver |
|------------|-------|------------|-----------|----------------|----------------|------------------|-------|--------|
| Admin catalog import | YES | YES | — | — | — | — | — | — |
| Category CRUD | YES | YES | YES | — | — | — | — | — |
| Brand CRUD | YES | YES | — | — | — | — | — | — |
| Attribute governance | YES | YES | — | — | — | — | — | — |
| Product type governance | YES | YES | — | — | — | — | — | — |
| Admin product list/detail | YES | YES | YES (read) | — | — | — | — | — |
| Admin variant management | YES | YES | — | — | — | — | — | — |
| Merchant product CRUD | — | — | — | YES | YES* | YES* | — | — |
| Merchant Product Studio | — | — | — | YES | YES* | YES* | — | — |
| Merchant CSV import | — | — | — | YES | YES* | YES* | — | — |
| Product browse (buyer) | — | — | — | — | — | — | YES | — |

`*` = restricted by `assertProductInOrg` tenant-scope check.

**Rules:**
- Backend authorization is authoritative (NestJS guards)
- Frontend hiding is NOT a security boundary
- No role gains access outside its existing authorized scope
- Merchant staff/manager can only operate on products within their organization

---

## 17. Import Result Contract

**Locked import result structure:**

```typescript
interface ImportResult {
  importId: string;
  status: ImportStatus;
  startedAt: string;        // ISO timestamp
  completedAt: string;      // ISO timestamp
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;          // dependent entities skipped due to parent failure
  rootErrors: ImportError[];
  dependencyErrors: ImportError[];
  warnings: ImportError[];
  entityBreakdown: Record<string, {
    created: number;
    updated: number;
    unchanged: number;
    rejected: number;
    skipped: number;
  }>;
}
```

**Locked statuses:**

| Status | Semantics |
|--------|-----------|
| UPLOADED | File received, not yet parsed |
| PARSING | File is being parsed |
| VALIDATING | Parsed, running validation |
| VALIDATED | Validation complete, ready for preview |
| READY | User has reviewed preview, ready to execute |
| EXECUTING | Plan is being executed |
| COMPLETED | All entity types committed successfully, zero errors |
| COMPLETED_WITH_ERRORS | Some entity types/rows committed, some rejected |
| FAILED | Execution failed before any entity type could commit (infrastructure error) |
| CANCELLED | User cancelled the import |

**Transitions:**
```text
UPLOADED → PARSING → VALIDATING → VALIDATED → READY → EXECUTING → COMPLETED | COMPLETED_WITH_ERRORS | FAILED
Any non-terminal → CANCELLED (user action)
```

---

## 18. Retry Contract

**Locked retry behavior:**

| Capability | Behavior |
|------------|----------|
| Re-upload required? | NO — corrected overrides can be re-executed without re-uploading |
| Can existing import be retried? | YES — if status is COMPLETED_WITH_ERRORS or FAILED |
| Can corrected overrides be re-executed? | YES — user applies overrides in preview, then re-executes |
| Can only failed entities be retried? | YES — re-execution skips already-committed entity types (classified as UNCHANGED) |
| Are successful entities skipped? | YES — upsert logic classifies existing entities as UNCHANGED |
| Idempotency guarantee | All upserts use ON CONFLICT — re-executing the same data produces the same result |
| Duplicate handling | Within-file duplicates caught by validator; cross-import duplicates handled by upsert |

---

## 19. Import Performance Contract

| Property | Value |
|----------|-------|
| Maximum file size | 25 MB (existing limit in controller) |
| Maximum rows per sheet | 50,000 (recommended limit, warn above 10,000) |
| Transaction size | One transaction per entity type (max ~50,000 rows per transaction) |
| Batching strategy | INSERT in batches of 100 within each transaction |
| Memory expectations | Parser loads entire workbook (25MB max); plan held in memory |
| Progress reporting | Per-entity-type progress: "Processing products... (450 of 1200)" |
| Timeout behavior | Per-transaction timeout of 5 minutes; overall import timeout of 30 minutes |
| Retry behavior | Re-execute from failed entity type (no re-parse/re-validate needed) |

**Architecture constraint:** The system must NOT depend on a single massive transaction for arbitrary catalog size. The per-entity-type transaction model ensures that a 50,000-row import does not hold locks for the entire duration.

---

## 20. Database Migration Contract

### Migration 1: weight_grams INT → NUMERIC(10,2)

| Property | Value |
|----------|-------|
| SQL | `ALTER TABLE product_variants ALTER COLUMN weight_grams TYPE NUMERIC(10,2) USING weight_grams::NUMERIC(10,2)` |
| Existing values conversion | Integer values implicitly compatible (100 → 100.00) |
| Data validation before migration | Check for negative values: `SELECT COUNT(*) FROM product_variants WHERE weight_grams < 0` |
| Zero/negative values | If found, set to NULL before migration (weight is optional) |
| Existing nulls | Remain NULL |
| Rollback | `ALTER TABLE product_variants ALTER COLUMN weight_grams TYPE INTEGER USING weight_grams::INTEGER` (decimal values truncated) |
| API serialization | Drizzle `numeric()` returns string; API must coerce to `number` for JSON |
| CHECK constraint | `ALTER TABLE product_variants ADD CHECK (weight_grams IS NULL OR weight_grams > 0)` |

### Migration 2: Attribute Backfill (BD-03)

| Property | Value |
|----------|-------|
| Scope | Products/variants with non-empty JSONB `attributes` |
| Process | For each JSONB key-value, resolve attribute definition, insert into typed table |
| Conflict detection | If typed table already has a value for the same (product/variant, attribute), report conflict |
| Conflict resolution | Typed table value wins |
| Post-backfill | JSONB `attributes` set to `{}` for backfilled rows |
| Rollback | Re-copy typed values back to JSONB (complex but possible) |

---

## 21. Attribute Cutover Contract

**Locked cutover sequence:**

```text
Phase A: Backfill
  Existing JSONB → resolve attribute definitions → insert into typed tables
  ↓
Phase B: Dual-read (compatibility)
  Application reads typed tables FIRST; falls back to JSONB if typed is empty
  Application writes to typed tables ONLY (no new JSONB writes)
  ↓
Phase C: Single-read (cutover complete)
  Application reads typed tables ONLY
  JSONB is deprecated (column exists but is never read or written)
```

**Locked decisions:**

| Question | Answer |
|----------|--------|
| Are existing JSONB values backfilled? | YES — automated backfill migration |
| Are conflicts detected? | YES — if both JSONB and typed have values for the same attribute |
| Which wins on conflict? | Typed table value wins (it was written by the governed pipeline) |
| Are conflicts reported? | YES — logged as warnings in the migration output |
| Does JSONB remain readable? | YES during Phase B; NO in Phase C |
| Does JSONB remain writable? | NO — from implementation time, no new code writes to JSONB |
| Is synchronization temporary? | YES — Phase B is temporary; removed after verification |
| Is legacy JSONB eventually removed? | Column remains in schema (cannot DROP COLUMN safely) but is ignored and documented as deprecated |

---

## 22. Testing Contract

### Import Validation Tests

| Test | Required |
|------|----------|
| Decimal weight (9.7) accepted when NUMERIC(10,2) | YES |
| Integer-only field rejects decimal (sort_order = 1.5) | YES |
| Invalid decimal for integer field rejected | YES |
| Invalid numeric (non-numeric string) rejected | YES |
| NOT NULL violation caught before persistence | YES |
| Enum violation caught before persistence | YES |
| Range violation (weight_grams <= 0) caught | YES |
| Reference failure (unknown category_slug) caught | YES |

### Transaction Isolation Tests

| Test | Required |
|------|----------|
| One invalid variant does not poison unrelated entity groups | YES |
| Valid entity types commit when other entity types fail | YES |
| Dependent entities fail with DEPENDENCY_ERROR | YES |
| Root errors are reported with full detail | YES |
| Cascade errors are not duplicated | YES |
| Products commit when their variants fail | YES |
| Variants fail when their product fails | YES |

### Product/Variant Tests

| Test | Required |
|------|----------|
| Product CRUD via API | YES |
| Variant CRUD via API | YES |
| Typed attribute value write + read | YES |
| Required attribute enforcement | YES |
| Variant dimension validation | YES |
| Duplicate SKU rejection | YES |
| Duplicate combination_key rejection | YES |
| Weight as NUMERIC(10,2) round-trip | YES |

### E2E Tests

| Path | Required |
|------|----------|
| Admin: Import → Validation → Preview → Execute → Product list → Product detail → Variant management | YES |
| Merchant: Product Studio → Product Type → Required Attributes → Variants → Offer → Review → Save | YES |

---

## 23. Acceptance Criteria

### AC-01: Import Weight

A workbook containing `weight_grams = 9.7` must be valid and persist correctly as `9.70` in the database. It must NEVER pass validation and then fail with a raw database type error.

### AC-02: Transaction Isolation

A failure in one entity type (e.g., one invalid variant) must NOT create hundreds of misleading `25P02` errors. Only the actual root cause is reported. Dependent entities are reported as DEPENDENCY_ERROR with clear linkage.

### AC-03: Error UX

The user must be able to identify the actual root cause within 5 seconds of viewing the error report. No cascade errors are displayed. Root errors are grouped with their dependent errors.

### AC-04: Product UI

Administrators must be able to:
- Locate products by SKU, variant SKU, or barcode
- Filter by category, brand, product type, status
- View and edit typed attribute values
- Add/edit/deactivate variants from the product detail page

### AC-05: Attribute Consistency

Imported and UI-created canonical products must use the same authoritative attribute model (typed tables). The admin ProductDetails component must render typed attribute values, not legacy JSONB.

### AC-06: Merchant UX

Required product-type attributes must be enforced in the Product Studio. The user cannot proceed past Step 2 without filling required attributes.

### AC-07: Security

No role may gain access outside its existing authorized scope. All new endpoints must follow the RBAC matrix in §16.

### AC-08: Migration Safety

The `weight_grams` migration must not lose data. Existing integer values must be preserved exactly. The migration must be reversible.

---

## 24. Implementation Phasing

### Phase 1: Import Data Contract + Critical Persistence Fixes

**Scope:** Fix the root cause of the reported failure.

| Item | Detail |
|------|--------|
| Migration | `weight_grams INT → NUMERIC(10,2)` + CHECK constraint |
| Drizzle schema | Update `catalog.schema.ts` |
| Validator | Add numeric type validation (integer vs decimal), NOT NULL checks, enum validation, range checks |
| Planner | Update `Number()` conversions to distinguish integer vs decimal fields |
| API serialization | Ensure weight_grams serializes as number (not string) in API responses |
| Tests | Decimal weight acceptance, integer field rejection, range validation |
| Acceptance | AC-01, AC-08 |
| Risks | Migration on large table (mitigated by ALTER TYPE being a metadata-only change for compatible types) |
| Files affected | `0004_catalog.sql` (new migration), `catalog.schema.ts`, `excel-validator.service.ts`, `excel-planner.service.ts`, `excel-executor.service.ts`, `catalog.service.ts` |
| Prerequisites | None |

### Phase 2: Import Transaction / Error Architecture

**Scope:** Eliminate cascade errors, implement per-entity-type isolation.

| Item | Detail |
|------|--------|
| Executor | Replace single transaction with 12 separate transactions (one per entity type) |
| Error model | Implement three-tier classification (ROOT_ERROR, DEPENDENCY_ERROR, CASCADE_ERROR) |
| Error schema | Extend `catalog_import_errors` with `root_error_id`, `severity = 'DEPENDENCY'` |
| Result structure | Implement per-entity-type breakdown in `ExecutionResult` |
| UI | Update error display to group by root cause, collapse dependency errors |
| Retry | Implement re-execution without re-upload |
| Tests | Transaction isolation, dependency error propagation, retry behavior |
| Acceptance | AC-02, AC-03 |
| Risks | Complex refactoring of executor; requires careful testing of dependency chain |
| Files affected | `excel-executor.service.ts`, `catalog-import.service.ts`, `catalog-import.schema.ts`, `catalog-import/page.tsx` |
| Prerequisites | Phase 1 |

### Phase 3: Attribute Storage Authority / Cutover

**Scope:** Resolve dual storage, make typed tables authoritative.

| Item | Detail |
|------|--------|
| Backfill migration | JSONB → typed tables with conflict detection |
| Product Studio | Change attribute writes from JSONB to typed tables |
| createVariant/updateVariant | Change from JSONB to typed tables |
| Admin ProductDetails | Read from typed tables instead of JSONB |
| Compatibility | Phase B dual-read with JSONB fallback |
| Tests | Backfill correctness, typed value round-trip, admin UI rendering |
| Acceptance | AC-05 |
| Risks | Data migration complexity; conflict resolution |
| Files affected | `catalog.service.ts`, `ProductDetails.tsx`, `useProductStudio.ts`, `buyer-api.ts`, new migration |
| Prerequisites | Phase 2 |

### Phase 4: Admin Product Management UX

**Scope:** Build catalog-specific product list and enhanced product detail.

| Item | Detail |
|------|--------|
| Product list | New catalog-specific page replacing generic ManagementPage |
| Search | SKU, variant SKU, barcode, name search |
| Filters | Category, brand, product type, status |
| Product detail | Add Typed Attributes tab, inline variant editing |
| Variant management | Add/edit/deactivate from product detail |
| Tests | UI rendering, search/filter correctness, variant CRUD |
| Acceptance | AC-04 |
| Risks | Large UI refactoring |
| Files affected | `admin/src/app/products/page.tsx`, `ProductDetails.tsx`, new components |
| Prerequisites | Phase 3 (for typed attribute rendering) |

### Phase 5: Merchant Product Studio UX

**Scope:** Enforce product-type rules, real-time validation.

| Item | Detail |
|------|--------|
| Required attributes | Enforce in Step 2, block progression |
| Product type | Mandatory selection in Step 1 |
| Variant dimensions | Show from product type configuration |
| Validation | Real-time per-field feedback |
| Attribute writes | Typed tables (from Phase 3) |
| Tests | Required attribute enforcement, step validation |
| Acceptance | AC-06 |
| Risks | UX complexity |
| Files affected | `useProductStudio.ts`, `StepSpecifications.tsx`, `StepVariants.tsx`, `StepIdentity.tsx` |
| Prerequisites | Phase 3 |

### Phase 6: Import ↔ Product UI E2E + Regression

**Scope:** End-to-end verification, regression testing.

| Item | Detail |
|------|--------|
| E2E tests | Admin import → product management flow |
| E2E tests | Merchant Product Studio → save → verify |
| Regression | All existing catalog tests still pass |
| Parity | Verify import ↔ UI parity invariants |
| Acceptance | All AC-01 through AC-08 |
| Prerequisites | Phases 1–5 |

---

## 25. Non-Goals

The following are explicitly excluded from this lock and any implementation derived from it:

- Payment processing / refund logic
- Shipping / carrier operations
- Fulfillment / order lifecycle
- Returns / RMA flow
- Notification consumers
- Feature flags console
- Arabic localization / RTL
- Mobile app catalog UI
- Unrelated infrastructure work
- M7.3-D or any later milestone

---

## 26. Decision Matrix

| ID | Decision | Final Choice | Reason | Implementation Impact | Migration? | Blocking? |
|----|----------|-------------|--------|----------------------|------------|-----------|
| BD-01 | Weight representation | NUMERIC(10,2) | Real manufacturer data requires decimal weights (e.g., 9.7g). INT is too restrictive for B2B marketplace. | Schema change, validator update, planner update, API serialization | YES — ALTER COLUMN TYPE | NO |
| BD-02 | Import atomicity | VALID-ROWS-COMMIT with per-entity-type isolation | All-or-nothing is unusable at scale. Valid work must commit even when some rows fail. | Executor refactoring (12 transactions), error model, retry logic | NO (schema unchanged) | NO |
| BD-03 | Attribute storage authority | Typed tables authoritative, JSONB deprecated | Typed tables support faceting/filtering/comparison. Import already writes them. Dual storage is a consistency hazard. | Backfill migration, Product Studio write path change, admin UI read path change | YES — backfill migration | NO |
| BD-04 | Admin vs merchant import | Keep separate with clear boundary | Different purposes (canonical vs store-scoped). Unification adds complexity without proportional benefit. | No structural change; validator improvements apply to admin pipeline only | NO | NO |
| BD-05 | Dimension model | Keep JSONB with explicit schema contract | Dedicated columns require migration for marginal benefit. JSONB is flexible enough. | Application-layer validation only | NO | NO |
| AD-01 | Transaction isolation | Separate transaction per entity type (12 transactions) | Balances isolation with performance. Aligns with BD-02 dependency model. | Executor refactoring | NO | NO |
| AD-02 | Validation contract | 5-layer DB-aware validation | Validation must catch everything that can deterministically fail at persistence. | Validator enhancement (numeric, NOT NULL, enum, range) | NO | NO |
| AD-03 | Error model | Three-tier (ROOT/DEPENDENCY/CASCADE suppressed) | Users must identify root cause immediately. Cascade errors are noise. | Error schema extension, UI error display refactoring | YES — error table extension | NO |
| AD-04 | Admin product management | Build catalog-specific product list + enhanced detail | Generic ManagementPage lacks SKU/barcode/type search. Admin needs catalog-specific tools. | New admin page components, ProductDetails enhancement | NO | NO |

---

## 27. Governance

This lock is a separate gate. The following rules apply:

- No implementation has been performed during this lock phase
- No source code, migrations, schema, frontend, API, tests, or configuration have been modified
- No existing milestone closure documents have been modified
- M7.3-D has NOT been started
- This document is the sole deliverable of this gate
- This document becomes the authoritative specification for the next gate (Implementation)

---

## 28. Final Verdict

```text
CATALOG PRODUCT MANAGEMENT DECISION LOCK: LOCKED
```

**Justification:**

- All 5 Business Decisions (BD-01 through BD-05) are resolved with explicit, verifiable specifications
- All 4 Architecture Decisions (AD-01 through AD-04) are resolved with implementation-ready detail
- Attribute authority is explicit: typed tables authoritative, JSONB deprecated, cutover sequence defined
- Import atomicity is explicit: VALID-ROWS-COMMIT with per-entity-type isolation and dependency chain
- Validation contract is explicit: 5-layer model covering file, syntax, domain, reference, and persistence compatibility
- Transaction/error model is explicit: 12 separate transactions, three-tier error classification, retry without re-upload
- Product/variant/offer responsibilities are explicit: field ownership table locked
- Admin UX contract is explicit: product list with search/filter/bulk, product detail with typed attributes and variant management
- Merchant UX contract is explicit: 6-step wizard with required attribute enforcement and real-time validation
- RBAC is explicit: full capability matrix locked
- Migration requirements are explicit: weight_grams ALTER TYPE + attribute backfill
- Acceptance criteria are explicit: AC-01 through AC-08
- No unresolved implementation-blocking decision remains
- Implementation phasing is defined with dependencies, risks, and per-phase acceptance criteria
