# SCS-CATALOG-PRODUCT-MANAGEMENT — FRESH ARCHITECTURE, DATA INTEGRITY & UX AUDIT

> **Gate:** Pre-Implementation Architecture Audit (Gate 1 of 4)
> **Milestone scope:** Catalog Import + Product / Variant Management
> **Status:** READ-ONLY AUDIT — no application code was modified

---

## 1. Executive Summary

This audit was commissioned to determine why catalog import users experience database execution errors after uploaded files successfully pass validation, and whether the Product / Variant management UI supports the expected business workflows.

**Root cause of the reported failure:** The `product_variants.weight_grams` column is `INT` (migration 0004), but real-world product data legitimately contains decimal weights (e.g. `9.7` kg or grams). The import validator does not check numeric type constraints, so `9.7` passes validation. The planner converts it to `Number("9.7") = 9.7` (float). The executor inserts it into the `INT` column. PostgreSQL rejects it with `invalid input syntax for type integer: "9.7"`. Because the entire import runs inside a single database transaction, this one failure poisons the transaction, causing every subsequent row to fail with `current transaction is aborted` — producing hundreds of misleading cascade errors from a single root cause.

**Additional findings:** The admin product management UI delegates to a generic `ManagementPage` component with limited catalog-specific functionality. The merchant Product Studio provides a 6-step wizard but does not enforce product-type attribute rules. Two separate import systems exist (admin XLSX pipeline vs. merchant CSV pipeline) with different capabilities and no shared validation logic. The domain model has dual attribute storage (legacy JSONB blobs alongside typed value tables) with no authoritative source.

**Audit verdict:** `GO WITH CONDITIONS` — implementation can proceed after addressing the 3 CRITICAL conditions and locking the business decisions identified in §25.

---

## 2. Current Repository Baseline

| Field | Value |
|-------|-------|
| Branch | `develop` |
| HEAD | `229949f934f6bfe447d4bce600a84fcbfe4dc365` (M7.3-C CLOSED/PASS) |
| Migrations | 0001–0050 |
| API modules | `modules/catalog/*` (19 files), `modules/catalog-import/*` (10 files) |
| Admin routes | `/products`, `/products/[id]`, `/catalog-import`, `/catalog-import/[id]`, `/product-types`, `/product-types/[id]` |
| Web (merchant) routes | `/merchant/catalog`, `/merchant/catalog/product/[id]`, `/merchant/product-studio`, `/merchant/import` |
| Web (buyer) routes | `/products/[id]` (with VariantSelector, OfferComparisonTable) |
| Key schemas | `catalog.schema.ts`, `catalog.taxonomy.schema.ts`, `catalog.offer.schema.ts` |
| Test files (backend) | 14 catalog-related test files (11 unit, 3 integration) |
| Test files (e2e) | 0 catalog-specific E2E tests |

---

## 3. Import Architecture

The admin catalog import pipeline (`modules/catalog-import/`) follows a 5-stage flow:

```
Upload (XLSX)
  ↓
ExcelParserService     — reads workbook → ParsedWorkbook (sheets, headers, rows as strings)
  ↓
ExcelValidatorService  — reference integrity, header presence, varchar lengths, duplicate SKUs
  ↓
ExcelResolverService   — resolves external keys → internal UUIDs (categories, brands, attributes)
  ↓
ExcelPlannerService    — classifies each entity as CREATE / UPDATE / UNCHANGED → ImportPlan
  ↓
ExcelExecutorService   — executes the plan inside a SINGLE DB transaction
```

**Key characteristics:**
- Parser converts ALL cell values to strings (`cellToString()`) — type information is lost at parse time
- Validator checks: header presence, reference integrity (FK resolution), varchar column lengths, duplicate SKUs, variant dimension scope
- Validator does NOT check: numeric type constraints, NOT NULL constraints, enum value validity, range validity
- Planner converts string values to numbers via `Number()` — no integer/decimal distinction
- Executor runs ALL entity types in a single `db.transaction()` — categories → brands → attribute groups → attributes → attribute options → product types → product type attributes → products → product attributes → variants → variant attributes → sources
- Per-entity `try/catch` blocks exist inside the transaction, but PostgreSQL transaction poisoning (any error aborts the entire transaction) makes them ineffective for most error types

**Merchant import** (`/merchant/import`) is a SEPARATE, simpler CSV-based pipeline for store-scoped product imports. It uses different target columns (name, sku, barcode, category, brand, unit, price_minor, moq, description, stock) and does NOT exercise the admin XLSX pipeline.

---

## 4. Reported Import Failure Analysis

### 4.1 Error Chain

```
Variant KC3000-2TB:
  invalid input syntax for type integer: "9.7"

Variant KC3000-4TB:
  current transaction is aborted, commands ignored until end of transaction block

[hundreds of subsequent variants with the same transaction-aborted error]
```

### 4.2 Root Cause Trace

| Stage | File | Line | Behavior |
|-------|------|------|----------|
| **DB column** | `infra/drizzle/migrations/0004_catalog.sql` | 101 | `weight_grams INT` — integer, no decimal |
| **Drizzle schema** | `modules/catalog/catalog.schema.ts` | 102 | `weightGrams: integer('weight_grams')` |
| **Parser** | `modules/catalog-import/excel-parser.service.ts` | 219–248 | `cellToString(9.7)` → `"9.7"` (string) |
| **Validator** | `modules/catalog-import/excel-validator.service.ts` | 501–520 | `validateVariants()` checks only product_slug, SKU presence, SKU duplicates — **does NOT validate weight_grams type** |
| **Planner** | `modules/catalog-import/excel-planner.service.ts` | 465 | `weightGrams: row['weight_grams'] ? Number(row['weight_grams']) : null` → `Number("9.7")` = `9.7` |
| **Executor** | `modules/catalog-import/excel-executor.service.ts` | 636 | `weightGrams: (d.weightGrams as number) ?? null` → inserts `9.7` into `INT` column |
| **PostgreSQL** | — | — | `ERROR: invalid input syntax for type integer: "9.7"` |

### 4.3 Why Validation Passes

The validator's `validateVariants()` method (lines 501–520) performs only three checks:
1. Product slug exists in the resolved product set
2. SKU is present (non-empty)
3. SKU is not duplicated within the file

It does NOT validate:
- Whether `weight_grams` is a valid integer
- Whether any numeric field matches its database column type
- Whether NOT NULL columns have values
- Whether numeric values are within valid ranges

### 4.4 Why Persistence Fails

PostgreSQL strictly rejects inserting a non-integer value (`9.7`) into an `INT` column. The error is `22P02` (invalid text representation), which poisons the transaction immediately.

### 4.5 Cascade Mechanism

Once the first `weight_grams` INSERT fails inside the transaction:
1. PostgreSQL marks the transaction as aborted
2. Every subsequent SQL statement (for any entity type) fails with `25P02: current transaction is aborted, commands ignored until end of transaction block`
3. The per-entity `try/catch` blocks catch these errors but cannot recover the transaction
4. The catch blocks increment `result.rejected` and push error messages, creating the illusion of hundreds of independent failures
5. The final `COMMIT` also fails, rolling back everything

### 4.6 Business Domain Analysis

**Should `weight_grams` be integer or decimal?**

Physical products legitimately have decimal weights:
- Kingston KC3000 SSD: 9.7g (the exact product in the error)
- Electronics components: 0.5g, 1.3g, etc.
- Food/beverage: 330ml = ~330g, but premium products might be 330.5g

The `INT` type was a reasonable default for a "grams" column (avoiding floating-point for most cases), but it is too restrictive for a B2B marketplace that imports real manufacturer data. Real-world catalog data from manufacturers routinely provides decimal weights.

**Recommendation:** Widen `weight_grams` from `INT` to `NUMERIC(10,2)` (or rename to `weight_grams` with `NUMERIC` type) to accommodate decimal weights while maintaining precision.

---

## 5. Validation vs Persistence Contract Analysis

### 5.1 Complete Field Contract Map (Variant Sheet)

| Field | Source (XLSX) | Parsed | Validated | Planner | DB Column | DB Type | Consistent? |
|-------|---------------|--------|-----------|---------|-----------|---------|-------------|
| sku | string | string | YES (presence+duplicate) | string | sku | VARCHAR(100) | YES |
| product_slug | string | string | YES (reference) | string | product_id | UUID (resolved) | YES |
| title | string | string | no | string | title | VARCHAR(300) | YES (varchar check) |
| title_ar | string | string | no | string | title_ar | VARCHAR(300) | YES |
| barcode | string | string | no | string | barcode | VARCHAR(60) | YES |
| unit | string | string | no | string | unit | VARCHAR(30) | YES |
| **weight_grams** | **string** | **string** | **NO** | **Number()** | **weight_grams** | **INT** | **NO — CRITICAL** |

### 5.2 Complete Field Contract Map (Product Attributes / Variant Attributes)

| Field | Source | Parsed | Validated | Planner | DB Column | DB Type | Consistent? |
|-------|--------|--------|-----------|---------|-----------|---------|-------------|
| value_text | string | string | type-guided | string | value_text | TEXT | YES |
| **value_number** | **string** | **string** | **NO** | **Number()** | **value_number** | **NUMERIC** | **PARTIAL** |
| value_boolean | string | string | NO | boolean | value_boolean | BOOLEAN | PARTIAL |
| option_key | string | string | reference | string | option_value | VARCHAR(200) | YES |

**`value_number` subtlety:** The DB column is `NUMERIC` (arbitrary precision), but the planner converts via `Number()` (JavaScript float, ~15 significant digits). The executor then converts to `String(d.valueNumber)` before inserting. For typical catalog values (prices, dimensions, weights), this is fine. For very large or very precise numbers (>15 significant digits), precision could be lost. Low risk for B2B catalog data.

### 5.3 Additional Mismatches Found

| Field | Issue | Severity |
|-------|-------|----------|
| `weight_grams` | INT column, decimal values from real data | CRITICAL |
| `value_number` | Number() conversion may lose extreme precision | LOW |
| `sort_order` (categories) | Number() conversion — if XLSX contains "1.5", inserts 1.5 into INT column | MEDIUM |
| `display_order` (product type attrs) | Same pattern — Number() into INT | MEDIUM |
| `moq` (products) | Not imported via XLSX pipeline — only via merchant CSV | LOW |

---

## 6. Transaction / Error Isolation Analysis

### 6.1 Current Transaction Scope

The entire catalog import executes inside **one database transaction** (`excel-executor.service.ts` line 89: `await this.db.db.transaction(async (tx) => {...})`).

### 6.2 Failure Isolation

| Question | Answer |
|----------|--------|
| When one variant fails, does the entire transaction abort? | **YES** — PostgreSQL transaction poisoning |
| Are previous valid rows rolled back? | **YES** — the COMMIT fails, everything rolls back |
| Are subsequent rows attempted unnecessarily? | **YES** — each attempt produces another "transaction aborted" error |
| Are subsequent errors merely cascades? | **YES** — all are `25P02` errors caused by the first failure |
| Does the system distinguish root from cascade errors? | **NO** — all errors are pushed to the same `result.errors` array |

### 6.3 User Experience

The user sees hundreds of error messages like:
```
Variant KC3000-2TB: invalid input syntax for type integer: "9.7"
Variant KC3000-4TB: current transaction is aborted, commands ignored until end of transaction block
Variant KC3000-8TB: current transaction is aborted, commands ignored until end of transaction block
...
```

There is no indication that 437 of the 438 errors are caused by a single root failure.

### 6.4 Recovery

| Capability | Available? |
|------------|------------|
| Correct the failed row and retry | Partial — overrides mechanism exists in the execute endpoint |
| Retry only failed rows | NO — the entire workbook must be re-imported |
| Retry the complete import | YES — re-upload and re-execute |
| Resume an interrupted import | NO — transaction is all-or-nothing |
| Inspect which records were committed | NONE — the transaction rolls back everything |
| Inspect which records were rolled back | ALL — everything is rolled back |

### 6.5 Atomicity Policy Recommendation

For a B2B catalog master-data import, the recommended policy is:

**VALID ROWS COMMIT, INVALID ROWS REPORTED** — with per-entity error isolation.

Rationale:
- A catalog import may contain thousands of rows; losing all because one has a bad weight value is unacceptable
- The current all-or-nothing approach is safe but unusable at scale
- Per-entity error isolation (using separate transactions or SAVEPOINTs per entity) would allow valid rows to commit while reporting only the actual failures
- The error report should distinguish ROOT errors (the actual data problem) from CASCADE errors (transaction poisoning)

---

## 7. Product Domain Model

```
products (canonical product — WHAT IT IS)
├── id (UUID PK)
├── store_id (UUID FK → stores, NULLABLE — canonical products have no owner)
├── category_id (UUID FK → categories)
├── brand_id (UUID FK → brands)
├── product_type_id (UUID FK → product_types — governed template)
├── slug, title, title_ar, description, description_ar
├── gtin, ean, mpn (manufacturer identifiers)
├── status (DRAFT | ACTIVE | ARCHIVED | REJECTED)
├── condition (NEW | USED | REFURBISHED)
├── is_available, moq (legacy — being absorbed by offers)
├── images (JSONB — legacy)
├── attributes (JSONB — legacy, being replaced by typed values)
├── metadata (JSONB)
├── published_at, deleted_at (soft delete)
│
├── product_attribute_values (typed values — PHASE 3)
│   ├── attribute_definition_id (FK)
│   ├── value_text | value_number | value_boolean | option_value | value_json
│   └── UNIQUE(product_id, attribute_definition_id)
│
├── product_variants (purchasable SKU — WHAT YOU BUY)
│   ├── id (UUID PK)
│   ├── sku (UNIQUE per product)
│   ├── barcode, title, title_ar, unit
│   ├── weight_grams (INT — THE ROOT CAUSE)
│   ├── dimensions_mm (JSONB — unstructured)
│   ├── attributes (JSONB — legacy)
│   ├── combination_key (SHA-256 digest of variant attribute values)
│   │
│   ├── variant_attribute_values (typed values — PHASE 3)
│   │   ├── attribute_definition_id (FK)
│   │   ├── value_text | value_number | value_boolean | option_value | value_json
│   │   └── UNIQUE(variant_id, attribute_definition_id)
│   │
│   └── merchant_offers (HOW A MERCHANT SELLS IT — PHASE 4)
│       ├── store_id, product_id, variant_id (nullable = product-level)
│       ├── status (DRAFT | PROPOSED | ACTIVE | SUSPENDED | REJECTED | WITHDRAWN)
│       ├── currency, base_price_minor, compare_at_price_minor
│       ├── moq, order_increment, lead_time_days, is_available
│       ├── price_list_id (FK → price_lists — quantity ladder)
│       └── warehouse_id (FK → warehouses — stock source)
│
└── product_media
    ├── variant_id (nullable = product-level)
    └── media_type, url, thumb_url, blurhash, alt_text, sort_order
```

### 7.1 Dual Storage Problem

Products and variants carry attributes in TWO places:
1. **Legacy JSONB:** `products.attributes`, `product_variants.attributes` — free-form key-value
2. **Typed tables:** `product_attribute_values`, `variant_attribute_values` — governed by attribute definitions

The typed tables are the intended future authoritative source (migration 0025 comment: "the free-form JSONB blobs are left INTACT (still authoritative during transition) and the new typed value tables run alongside them until cutover"). However, no cutover has occurred. The import pipeline writes to the typed tables; the legacy JSONB `attributes` column on variants is populated only by the direct API (`catalog.service.ts` createVariant).

---

## 8. Variant Domain Model

Variants represent purchasable SKUs. A variant's identity is determined by:
- **SKU** (unique per product) — the primary business key
- **Combination key** — SHA-256 digest of sorted VARIANT-scope attribute values (unique per product, prevents duplicate variant combinations)
- **Barcode** — optional EAN-13/UPC

Variant-specific data:
- Physical: `weight_grams` (INT — broken), `dimensions_mm` (JSONB — unstructured)
- Commercial: via `merchant_offers` (price, MOQ, lead time, availability)
- Inventory: via `inventory_items` linked through `warehouse_id` on the offer

### 8.1 Dimension Modeling Issue

`dimensions_mm` is stored as `JSONB DEFAULT '{}'`. There is no schema enforcement for the `{l, w, h}` structure. The import pipeline does not populate `dimensions_mm` at all — dimensions can only be set through the direct API or Product Studio UI.

---

## 9. Product Management API Audit

### 9.1 Catalog Endpoints (catalog.controller.ts)

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| POST | `/categories` | catalog:categories:write (ADMIN, MODERATOR) | Create category |
| GET | `/categories` | authenticated | List categories |
| GET | `/categories/tree` | authenticated | Full category tree |
| GET | `/categories/:id` | authenticated | Category detail |
| GET | `/categories/:id/products` | authenticated | Products in category |
| GET | `/categories/:id/product-types` | authenticated | Product types for category |
| PATCH | `/categories/:id` | catalog:categories:write (ADMIN, MOD) | Update category |
| DELETE | `/categories/:id` | catalog:categories:write (ADMIN, MOD) | Delete category |
| POST | `/brands` | catalog:brands:manage | Create brand |
| GET | `/brands` | authenticated | List brands |
| GET | `/admin/brands` | catalog:brands:manage | Enriched brand list |
| PATCH | `/brands/:id` | catalog:brands:manage | Update brand |
| DELETE | `/brands/:id` | catalog:brands:manage | Deactivate brand |
| POST | `/products` | merchant:products:write | Create product |
| GET | `/stores/:storeId/products` | authenticated | List store products |
| GET | `/products/:id` | authenticated | Product detail |
| PATCH | `/products/:id` | merchant:products:write | Update product |
| DELETE | `/products/:id` | merchant:products:write | Delete product |
| GET | `/products/:productId/variant-matrix` | authenticated | Variant matrix |
| POST | `/products/:productId/variants` | merchant:products:write | Create variant |
| GET | `/products/:productId/variants` | authenticated | List variants |
| PATCH | `/products/:productId/variants/:variantId` | merchant:products:write | Update variant |
| POST | `/products/:productId/variants/bulk` | merchant:products:write | Bulk variant ops |
| POST | `/stores/:storeId/products/bulk` | merchant:products:write | Bulk product ops |
| GET | `/stores/:storeId/products/export` | merchant:products:write | CSV export |
| POST | `/products/:productId/media` | merchant:products:write | Add media |
| GET | `/products/:productId/media` | authenticated | List media |
| DELETE | `/products/:productId/media/:mediaId` | merchant:products:write | Remove media |
| POST | `/products/:productId/media/reorder` | merchant:products:write | Reorder media |
| POST | `/media/presign` | merchant:products:write | Presigned upload URL |
| GET | `/search` | authenticated | Full-text search |
| GET | `/search/facets` | authenticated | Search facets |
| GET | `/canonical/match` | authenticated | Product match by GTIN/EAN/MPN |
| GET | `/canonical/search` | authenticated | Free-text canonical search |
| GET | `/canonical/duplicates` | catalog:product-types:manage | Duplicate detection |
| GET | `/admin/data-quality` | catalog:product-types:manage | Data quality metrics |
| GET | `/admin/corrupted-variants` | catalog:product-types:manage | Corrupted variant scan |

### 9.2 Catalog Import Endpoints (catalog-import.controller.ts)

| Method | Path | Permission | Role | Purpose |
|--------|------|------------|------|---------|
| POST | `/admin/catalog-imports/upload` | catalog:imports:manage | ADMIN, SUPER_ADMIN | Upload XLSX |
| GET | `/admin/catalog-imports` | catalog:imports:manage | ADMIN, SUPER_ADMIN | List imports |
| GET | `/admin/catalog-imports/:id` | catalog:imports:manage | ADMIN, SUPER_ADMIN | Import detail |
| GET | `/admin/catalog-imports/:id/preview` | catalog:imports:manage | ADMIN, SUPER_ADMIN | Validation preview |
| POST | `/admin/catalog-imports/:id/execute` | catalog:imports:manage | ADMIN, SUPER_ADMIN | Execute import |
| GET | `/admin/catalog-imports/:id/errors` | catalog:imports:manage | ADMIN, SUPER_ADMIN | Row-level errors |
| GET | `/admin/catalog-imports/:id/report` | catalog:imports:manage | ADMIN, SUPER_ADMIN | Download error report |
| GET | `/admin/catalog-imports/template/:type` | catalog:imports:manage | ADMIN, SUPER_ADMIN | Download template |
| POST | `/admin/catalog-imports/export` | catalog:imports:manage | ADMIN, SUPER_ADMIN | Export catalog XLSX |

### 9.3 Taxonomy Endpoints (catalog.taxonomy.controller.ts)

| Method | Path | Permission | Purpose |
|--------|------|------------|---------|
| GET | `/attributes` | authenticated | List attributes |
| POST | `/admin/attributes` | catalog:attributes:manage | Create attribute |
| GET | `/attributes/:id` | authenticated | Attribute detail |
| PATCH | `/admin/attributes/:id` | catalog:attributes:manage | Update attribute |
| DELETE | `/admin/attributes/:id` | catalog:attributes:manage | Delete attribute |
| POST | `/admin/attributes/:id/options` | catalog:attributes:manage | Add option |
| GET | `/attribute-groups` | authenticated | List groups |
| (+ product types, conditional rules) | | | |

---

## 10. Admin Product UX Audit

### 10.1 Product List (`/products`)

The admin product list page (`products/page.tsx`, 6 lines) delegates entirely to `ManagementPage` — a generic entity management component that renders a data table. It provides:
- Basic table rendering with pagination
- Row-click navigation to detail page

**Missing:**
- No catalog-specific search (by SKU, variant, barcode)
- No category/brand/status filtering UI
- No bulk actions (activate, archive, export)
- No variant-level search
- No product-type filtering
- No import/export quick-action buttons

### 10.2 Product Detail (`/products/[id]`)

`ProductDetails.tsx` (452 lines) is a well-structured component with:
- Tabbed layout: Overview, Variants, Offers, Media
- Moderation actions (APPROVED, REJECTED, ARCHIVED)
- Key-value grid for product attributes
- Related tables for variants and offers
- Status badges, copy buttons

**Adequate for moderation; missing for management:**
- No inline variant editing
- No attribute value editing
- No "add variant" workflow from the detail page
- No import history linkage

### 10.3 Catalog Import Center (`/catalog-import`)

`catalog-import/page.tsx` (628 lines) provides a comprehensive import workflow:
- Dashboard with import history
- File upload with auto-validation
- Preview stage with error display
- Execution with result display
- Template download
- Catalog export
- Override mechanism for correcting fixable errors

**Strengths:**
- Status color coding
- Error detail display with row numbers
- Override inputs for pre-execution correction
- Report download

**Weaknesses:**
- Errors are displayed flat (no root-cause vs cascade distinction)
- No per-field error grouping
- No "retry failed rows only" capability

---

## 11. Merchant Product UX Audit

### 11.1 Merchant Catalog (`/merchant/catalog`)

`merchant/catalog/page.tsx` (412 lines) provides:
- Product list with search, status filter, category filter
- Pagination (load more)
- Bulk selection and actions
- Category tab (read-only)
- Store picker

**Adequate for basic management.** Supports search, filtering, bulk operations.

### 11.2 Product Studio (`/merchant/product-studio`)

`merchant/product-studio/page.tsx` (145 lines) — a 6-step wizard:
1. **Identity** — title, category, brand, product type, canonical match search
2. **Specifications** — product attributes
3. **Variants** — variant matrix definition
4. **Offer** — pricing, store selection
5. **Media** — image upload
6. **Review** — completeness score, summary

**Strengths:**
- Guided workflow matches the domain model
- Canonical product deduplication (GTIN/EAN/MPN search)
- Progress indicator with step navigation
- Completeness scoring

**Weaknesses:**
- Does not enforce product-type required attributes
- No validation feedback until save
- Variant step does not show attribute dimension options from the product type
- No edit mode for existing products (create-only)

### 11.3 Merchant Import (`/merchant/import`)

`merchant/import/page.tsx` (687 lines) — a SEPARATE CSV-based import pipeline:
- 5 steps: Upload, Map Columns, Validation, Import Progress, Review
- Target columns: name, nameAr, sku, barcode, category, brand, unit, price_minor, moq, description, stock
- CSV parser implemented client-side

**This is a completely separate system from the admin XLSX pipeline.** It imports store-scoped products with pricing, not canonical catalog data.

---

## 12. Role / RBAC Audit

| Permission | Admin | SuperAdmin | Moderator | Merchant Owner | Merchant Staff | Merchant Manager | Buyer | Driver |
|------------|-------|------------|-----------|----------------|----------------|------------------|-------|--------|
| catalog:categories:write | YES | YES | YES | — | — | — | — | — |
| catalog:brands:manage | YES | YES | — | — | — | — | — | — |
| catalog:attributes:manage | YES | YES | — | — | — | — | — | — |
| catalog:product-types:manage | YES | YES | — | — | — | — | — | — |
| catalog:imports:manage | YES | YES | — | — | — | — | — | — |
| merchant:products:write | — | — | — | YES | YES* | YES* | — | — |

*Merchant Staff write is restricted by `assertProductInOrg` tenant-scope check.

**Findings:**
- Admin catalog governance (categories, brands, attributes, product types, imports) is properly gated behind admin permissions
- Merchant product CRUD is properly gated behind `merchant:products:write` with org-scope enforcement
- Buyers and Drivers have no write access (correct)
- Read access is broadly authenticated (correct for a marketplace)

---

## 13. Catalog Taxonomy Audit

### 13.1 Attribute System

The attribute framework (migration 0023) is well-designed:
- `attribute_definitions` — global catalog of attributes with type, scope, validation
- `attribute_options` — controlled values for SELECT/MULTI_SELECT
- `attribute_groups` — presentation buckets (General, Processor, Memory, Display)
- `product_types` — governed templates binding categories to attribute sets
- `product_type_attributes` — per-type attribute configuration (required, filterable, searchable, etc.)

### 13.2 Natural Key vs Internal ID

The import system uses **natural keys** throughout:
- Categories by `slug`
- Brands by `slug`
- Attributes by `code`
- Product types by `code`
- Products by `slug`
- Variants by `sku`

The resolver translates natural keys → UUIDs before execution. This is the correct pattern for workbook imports (users think in slugs/codes, not UUIDs).

### 13.3 Variant Dimension Scope

Product Types declare `variant_dimensions` (JSONB array of attribute definition UUIDs). The validator checks that each dimension attribute has `scope = VARIANT`. This is correctly enforced.

---

## 14. Import UX Audit

### 14.1 Import Workflow Stages

| Stage | Available? | Quality |
|-------|------------|---------|
| 1. File selection | YES | File picker with size/type validation |
| 2. File format detection | YES | XLSX only (CSV not supported in admin pipeline) |
| 3. Column mapping | Automatic | Headers normalized to lowercase+underscore |
| 4. Automatic column matching | YES | By header name |
| 5. Mapping confidence | NO | No confidence scoring |
| 6. Unmapped column warnings | PARTIAL | Unrecognized sheets logged as warnings |
| 7. Data type detection | NO | All values treated as strings |
| 8. Validation | YES | Reference integrity, varchar lengths, duplicates |
| 9. Validation summary | YES | Error list with row numbers |
| 10. Preview of transformed data | PARTIAL | Plan summary (create/update/unchanged counts) |
| 11. Warnings vs errors | NO | Single error list, no severity levels |
| 12. Duplicate detection | YES | Within-file SKU duplicates |
| 13. Reference resolution | YES | Cross-sheet and DB reference resolution |
| 14. Product/variant grouping | NO | Not shown in preview |
| 15. Estimated create/update counts | YES | Plan summary provides this |
| 16. Import strategy selection | NO | Always full import |
| 17. Confirmation before persistence | YES | Preview stage requires explicit execute |
| 18. Progress indication | YES | Stage transitions |
| 19. Live import status | NO | No real-time progress |
| 20. Failed-row reporting | YES | Error list + downloadable report |
| 21. Downloadable error report | YES | XLSX report download |
| 22. Retry capability | PARTIAL | Re-upload entire file; overrides for fixable errors |
| 23. Import history | YES | Import list with status |
| 24. Rollback/recovery visibility | NO | No visibility into what was committed/rolled back |

---

## 15. Import ↔ Product UI Consistency

| Question | Answer |
|----------|--------|
| Can every importable product be managed through the UI? | **PARTIALLY** — typed attribute values imported via XLSX are stored in `product_attribute_values` / `variant_attribute_values`, but the admin ProductDetails component does not render these typed values. It reads from the legacy `products.attributes` JSONB. |
| Can every UI-created product be represented by the importer? | **PARTIALLY** — the Product Studio creates products with legacy JSONB attributes; the importer writes typed value tables. The two paths produce products with different attribute storage. |
| Does the importer create state the UI cannot display? | **YES** — typed attribute values (`product_attribute_values`, `variant_attribute_values`) written by the importer are not rendered by the admin ProductDetails component. |
| Does the UI create state the importer cannot represent? | **YES** — the Product Studio writes `product_variants.attributes` (JSONB) which the importer does not populate. |

---

## 16. API/UI Parity

| Capability | API | Admin UI | Merchant UI | RBAC | Tested |
|------------|-----|----------|-------------|------|--------|
| Product CRUD | YES | PARTIAL (list+detail, no edit) | YES (Product Studio, create only) | YES | PARTIAL |
| Variant CRUD | YES | NO (read-only in detail) | PARTIAL (Product Studio step) | YES | PARTIAL |
| Category management | YES | YES (via ManagementPage) | Read-only | YES | YES |
| Brand management | YES | YES (via ManagementPage) | Read-only | YES | YES |
| Attribute governance | YES | NO dedicated UI | NO | YES | NO |
| Product type management | YES | YES (/product-types) | Read-only | YES | PARTIAL |
| Catalog import (admin) | YES | YES (628-line page) | N/A | YES | PARTIAL |
| Catalog import (merchant) | YES (legacy) | N/A | YES (687-line page) | YES | NO |
| Search | YES | NO dedicated UI | PARTIAL | YES | NO |
| Media management | YES | PARTIAL (in ProductDetails) | YES (Product Studio step) | YES | NO |
| Offer management | YES | PARTIAL (read in ProductDetails) | PARTIAL (Product Studio step) | YES | PARTIAL |
| Bulk operations | YES | NO | PARTIAL | YES | NO |
| Export | YES | YES (catalog export XLSX) | YES (CSV export) | YES | NO |
| Data quality | YES | NO dedicated UI | N/A | YES | NO |

---

## 17. Database Integrity

### 17.1 Numeric Column Audit

| Table | Column | DB Type | Semantic Type | Appropriate? |
|-------|--------|---------|---------------|--------------|
| product_variants | weight_grams | INT | Physical weight | **NO — should be NUMERIC** |
| products | moq | INT | Minimum order quantity | YES |
| merchant_offers | moq | INT | Minimum order quantity | YES |
| merchant_offers | order_increment | INT | Purchasable step | YES |
| merchant_offers | lead_time_days | INT | Lead time | YES |
| merchant_offers | base_price_minor | BIGINT | Price in minor units | YES |
| product_attribute_values | value_number | NUMERIC | Typed attribute value | YES |
| variant_attribute_values | value_number | NUMERIC | Typed attribute value | YES |
| categories | sort_order | INT | Display ordering | YES |
| product_media | sort_order | INT | Display ordering | YES |
| product_media | file_size | BIGINT | Bytes | YES |

### 17.2 Constraint Summary

- **Primary keys:** All UUID, properly defined
- **Foreign keys:** Properly cascading (CASCADE for ownership, SET NULL for optional references, RESTRICT for attribute definitions)
- **Unique constraints:** (store_id, slug) on products, (product_id, sku) on variants, (code) on attributes, combination_key partial unique on variants
- **Check constraints:** None found — no DB-level validation for status enums, numeric ranges
- **NOT NULL:** Properly applied to required fields
- **Indexes:** Comprehensive — covering indexes for common queries, partial indexes for active/visible records

---

## 18. Performance / Scale Risks

| Risk | Severity | Detail |
|------|----------|--------|
| Single-transaction import | HIGH | 10,000-row workbook = 10,000+ INSERTs in one transaction; lock contention, WAL growth |
| No import batching | MEDIUM | Executor processes entities one-by-one, not in batches |
| N+1 variant queries | MEDIUM | `getVariantMatrix` likely queries variants one at a time |
| JSONB attribute queries | LOW | Typed value tables have proper indexes; legacy JSONB is not indexed for faceting |
| Large XLSX parsing | LOW | Parser loads entire workbook into memory (25MB limit) |
| Search at scale | LOW | Trigram GIN index on categories; products rely on basic LIKE queries |

---

## 19. Test Coverage

### 19.1 Backend Tests

| Area | Files | Coverage Assessment |
|------|-------|-------------------|
| Import pipeline | `catalog-import-pipeline.spec.ts` (465 lines) | Integration: parse → validate → plan |
| Import validation | `excel-validator.spec.ts` (via catalog-validation-service.spec.ts, 173 lines) | Unit: header, reference, length validation |
| Import planner | `excel-planner.spec.ts` (referenced in memory) | Unit: plan generation |
| Catalog lifecycle | `catalog-lifecycle.e2e.spec.ts` (890 lines) | Integration: product CRUD, variant ops |
| Catalog governance | `catalog-governance-roundtrip.spec.ts` (988 lines) | Integration: taxonomy + product type roundtrip |
| Catalog seed | `catalog-seed.postgres.spec.ts` (226 lines), `catalog-seed.spec.ts` (275 lines) | Integration + unit: seed data |
| Catalog dedup | `catalog-dedup.spec.ts` (128 lines) | Unit: duplicate detection |
| Catalog offer | `catalog-offer.spec.ts` (182 lines) | Unit: offer logic |
| Catalog ownership | `catalog-ownership.spec.ts` (179 lines) | Unit: tenant scoping |
| Catalog taxonomy | `catalog-taxonomy.spec.ts` (258 lines) | Unit: attribute/type operations |
| Product card | `product-card.spec.ts` (177 lines) | Unit: card rendering logic |
| Store products | `store-products.spec.ts` (205 lines) | Unit: store-scoped queries |
| Canonical product | `canonical-product-nullable-store.spec.ts` (153 lines) | Unit: nullable store_id |

### 19.2 Missing Tests

- **NO E2E test** for the full import workflow (upload → validate → preview → execute → inspect product)
- **NO test** for numeric type validation in the import pipeline
- **NO test** for transaction failure isolation behavior
- **NO test** for the admin product list page
- **NO test** for the merchant Product Studio workflow
- **NO Playwright test** for catalog import or product management

---

## 20. Critical Findings

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| CF-01 | **CRITICAL** | Import / Validation | `weight_grams` is `INT` in the database but the validator accepts decimal values. The planner converts `"9.7"` → `9.7` (float). The executor inserts it. PostgreSQL rejects it. **Validation passes, persistence fails.** |
| CF-02 | **CRITICAL** | Import / Transaction | Single-transaction import means one type error poisons the entire import, producing hundreds of misleading cascade errors from a single root cause. |
| CF-03 | **CRITICAL** | Import / Validation | Validator does not check numeric type constraints, NOT NULL constraints, or enum value validity. Any data that parses as a string passes validation regardless of whether it can be persisted. |

---

## 21. High-Priority Findings

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| HF-01 | HIGH | Admin UX | Admin product list (`/products`) delegates to a generic `ManagementPage` with no catalog-specific search (SKU, barcode), filtering (category, brand, product type), or bulk actions. |
| HF-02 | HIGH | Domain Model | `weight_grams INT` is semantically wrong for physical product weights. Real manufacturer data routinely contains decimal weights (the reported failure is exactly this case). |
| HF-03 | HIGH | Domain Model | Dual attribute storage (legacy JSONB + typed value tables) with no authoritative source. Import writes typed tables; Product Studio writes JSONB. Admin ProductDetails reads JSONB, not typed tables. |
| HF-04 | HIGH | Architecture | Two separate import systems (admin XLSX pipeline + merchant CSV pipeline) with different capabilities, different validation, and no shared code. |
| HF-05 | HIGH | Merchant UX | Product Studio does not enforce product-type required attributes. A merchant can skip required specifications without warning. |

---

## 22. Medium/Low Priority Findings

| ID | Severity | Area | Finding |
|----|----------|------|---------|
| MF-01 | MEDIUM | Import | `sort_order` and `display_order` fields use `Number()` conversion into INT columns — decimal values in XLSX would cause the same class of error as `weight_grams`. |
| MF-02 | MEDIUM | Import | No per-entity transaction isolation — categories, brands, products, variants all share one transaction. |
| MF-03 | MEDIUM | Import UX | Error display does not distinguish root causes from cascade errors. |
| MF-04 | MEDIUM | Domain Model | `dimensions_mm JSONB` has no schema enforcement — `{l, w, h}` structure is convention-only. |
| MF-05 | MEDIUM | Test | No E2E test covers the full import → product management workflow. |
| MF-06 | MEDIUM | Import ↔ UI | Typed attribute values written by the importer are not rendered by the admin ProductDetails component. |
| LF-01 | LOW | API | No variant clone/duplicate endpoint — creating similar variants requires manual re-entry. |
| LF-02 | LOW | Import | Template generator could auto-detect column types and provide type hints. |
| LF-03 | LOW | Performance | Executor processes entities one-by-one rather than batching INSERTs. |

---

## 23. Recommended Target Architecture

### 23.1 Import Pipeline

```
Upload (XLSX)
  ↓
Parse → string rows
  ↓
Validate (enhanced):
  ├── Header presence
  ├── Reference integrity
  ├── VARCHAR lengths (existing)
  ├── **NUMERIC type checks (NEW)** — weight_grams must be valid number; sort_order must be integer
  ├── **NOT NULL checks (NEW)** — required DB columns must have values
  ├── **Enum validity (NEW)** — status, condition, type must match allowed values
  └── **Range checks (NEW)** — weight > 0, moq >= 1
  ↓
Preview (enhanced):
  ├── Plan summary (existing)
  ├── **Type mismatch warnings (NEW)**
  ├── **Root-cause error grouping (NEW)**
  └── **Per-field error detail (NEW)**
  ↓
Execute (enhanced):
  ├── **Per-entity transaction isolation (NEW)** — savepoints or separate transactions per entity type
  ├── **Root vs cascade error distinction (NEW)**
  └── **Partial commit support (NEW)** — valid rows commit, invalid rows reported
```

### 23.2 Database Changes

| Migration | Change | Rationale |
|-----------|--------|-----------|
| Widen `weight_grams` | `INT` → `NUMERIC(10,2)` | Accommodate decimal weights from real manufacturer data |
| (Optional) Add check constraints | `CHECK (weight_grams > 0)` | Prevent negative/zero weights at DB level |

### 23.3 Attribute Storage Cutover

The dual JSONB + typed-table storage should be resolved:
1. Admin ProductDetails should read from typed value tables (not legacy JSONB)
2. Product Studio should write to typed value tables (not legacy JSONB)
3. The legacy JSONB `attributes` column should be deprecated (read-only migration of existing data, then ignored)

---

## 24. Recommended Target User Workflows

### 24.1 Admin Import Workflow

1. Upload XLSX → auto-validate
2. Preview: see plan summary + **grouped errors** (root causes highlighted, cascade errors collapsed)
3. Correct errors inline (override mechanism — already exists)
4. Execute → see **real-time progress** (X of Y entities processed)
5. Result: see **root-cause errors only** with affected row count
6. Retry: re-execute with corrections (no need to re-upload)

### 24.2 Admin Product Management

1. Product list: search by name/SKU/barcode, filter by category/brand/status/type
2. Product detail: tabbed view with Overview, **Typed Attributes**, Variants, Offers, Media
3. Variant management: inline add/edit from product detail page

### 24.3 Merchant Product Studio

1. Step 1 (Identity): enforce product-type selection and show required attributes
2. Step 2 (Specifications): show **only** the attributes required by the selected product type
3. Step 3 (Variants): show dimension options from product type
4. Validation: **real-time** feedback at each step, not deferred to save

---

## 25. Required Business Decisions

| ID | Decision | Options | Recommendation |
|----|----------|---------|----------------|
| BD-01 | `weight_grams` column type | (a) Widen to NUMERIC(10,2); (b) Keep INT, round at import; (c) Keep INT, reject decimals | **(a)** — real manufacturer data requires decimal support |
| BD-02 | Import atomicity policy | (a) ALL-OR-NOTHING (current); (b) VALID-ROWS-COMMIT; (c) BATCH-ATOMIC | **(b)** — best UX for large catalog imports |
| BD-03 | Attribute storage cutover | (a) Migrate to typed tables now; (b) Keep dual storage; (c) Deprecate typed tables | **(a)** — typed tables are the designed target |
| BD-04 | Merchant import unification | (a) Unify admin XLSX + merchant CSV into one pipeline; (b) Keep separate; (c) Deprecate merchant CSV | **(b)** for now — the two serve different purposes (canonical vs store-scoped) |
| BD-05 | `dimensions_mm` structure | (a) Keep JSONB; (b) Add dedicated columns (length_mm, width_mm, height_mm) | **(a)** for now — JSONB is flexible enough; schema enforcement can come later |

---

## 26. Required Architecture Decisions

| ID | Decision | Options | Recommendation |
|----|----------|---------|----------------|
| AD-01 | Import transaction isolation | (a) SAVEPOINT per entity; (b) Separate transaction per entity type; (c) Separate transaction per entity | **(b)** — balances isolation with performance |
| AD-02 | Validation scope | (a) Format-only (current); (b) DB-aware validation (add type/NOT NULL/enum checks); (c) Full pre-flight (add FK existence, range) | **(b)** minimum — validation should catch everything that can be deterministically detected before persistence |
| AD-03 | Error reporting model | (a) Flat error list (current); (b) Root-cause + cascade grouping; (c) Per-field error detail with row numbers | **(c)** — most actionable for the user |
| AD-04 | Admin product list | (a) Keep generic ManagementPage; (b) Build catalog-specific product list | **(b)** — catalog requires SKU/barcode/type search that generic pages don't support |

---

## 27. Recommended Remediation Sequence

| Priority | Work | Depends On | Est. Complexity |
|----------|------|------------|-----------------|
| **P0** | Widen `weight_grams` INT → NUMERIC(10,2) (migration + Drizzle schema sync) | BD-01 | LOW |
| **P0** | Add numeric type validation to `excel-validator.service.ts` (weight_grams, sort_order, display_order, value_number) | AD-02 | MEDIUM |
| **P0** | Add NOT NULL and enum validation to validator | AD-02 | MEDIUM |
| **P1** | Implement per-entity-type transaction isolation (separate transactions for categories, brands, products, variants) | AD-01, BD-02 | HIGH |
| **P1** | Root-cause vs cascade error grouping in executor and UI | AD-03 | MEDIUM |
| **P2** | Admin product list: build catalog-specific page with SKU/barcode/type search | AD-04 | MEDIUM |
| **P2** | Admin ProductDetails: render typed attribute values (not just legacy JSONB) | BD-03 | MEDIUM |
| **P3** | Product Studio: enforce product-type required attributes | HF-05 | MEDIUM |
| **P3** | E2E test: full import → product management workflow | — | MEDIUM |
| **P4** | Dimensions schema enforcement | BD-05 | LOW |

---

## 28. Explicit Out-of-Scope Items

The following are explicitly NOT part of this audit or any subsequent implementation milestone derived from it:

- Payment processing / refund logic (M7.3-D scope)
- Returns / RMA flow (M7.3-C, already CLOSED/PASS)
- Shipping / carrier operations (M7.3-B.6, already CLOSED/PASS)
- Order lifecycle / fulfillment (existing milestones)
- Notification consumers (M7.3-F scope)
- Feature flags console (separate gap)
- Arabic localization / RTL (separate gap)
- Mobile app catalog UI (separate scope)

---

## 29. Audit Verdict

```
AUDIT VERDICT: GO WITH CONDITIONS
```

**Conditions (must be addressed before implementation):**

1. **CF-01/CF-02/CF-03 (CRITICAL):** The `weight_grams` INT type mismatch, single-transaction cascade failure, and missing numeric validation must be fixed. Migration to widen the column + enhanced validator + per-entity transaction isolation.

2. **BD-01 (Business Decision):** The `weight_grams` column type decision must be locked (recommendation: NUMERIC(10,2)).

3. **BD-02 (Business Decision):** The import atomicity policy must be locked (recommendation: VALID-ROWS-COMMIT with per-entity-type isolation).

4. **HF-03 (Dual Storage):** The attribute storage cutover decision must be locked — typed tables vs JSONB — before any implementation touches attribute rendering or writing.

**The architecture is sufficiently coherent for implementation to proceed once these conditions are addressed.** The domain model (products → variants → offers) is well-structured. The taxonomy system (attributes → product types → conditional rules) is sound. The API surface is comprehensive. The primary defects are in the import validation/persistence contract and the transaction error handling — both localized to the `catalog-import` module and the `weight_grams` column definition.
