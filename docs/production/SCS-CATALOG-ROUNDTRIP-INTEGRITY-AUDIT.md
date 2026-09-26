# SCS Catalog Round-Trip Integrity Audit

**Date:** 2026-09-26
**Prepared for:** Catalog Import/Export Integrity, Product Type Publishing & Category Contents Remediation
**Scope of this document:** Findings only. No runtime code has been changed. This is the required pre-change audit (Task §1) that reproduces the workbook comparison programmatically before any remediation begins.

---

## 0. How the findings were reproduced

Two throwaway Node scripts were run against the acceptance workbooks using the repo's existing `exceljs` dependency (`apps/api/node_modules/exceljs`). No database, API, or UI was invoked. The scripts read only the two `.xlsx` files under `docs/production/`.

- Sheet inventory, header capture, per-sheet row counts, and per-column blank counts.
- Key-based diff between import and export workbooks (natural keys: `Categories.slug`, `Product Types.code`, `Variants.sku`, `Products.slug`).
- Targeted scan for JSON-as-SKU corruption.

Scripts were deleted after producing the output. They are not part of the codebase and are not a deliverable.

Reproduced artefacts:

- Input: `docs/production/catalog-import-real-test-data-final.xlsx`
- Output: `docs/production/catalog-export-2026-09-26.xlsx`

The exact numbers below are the numbers the scripts produced, not the numbers quoted in the task. They match, and each user-reported symptom now has a concrete row-level cause.

---

## 1. Sheet-level counts (confirmed)

| Sheet | Input (import) | Output (export) | Δ | Notes |
|---|---:|---:|---:|---|
| README | 27 | 0 (missing) | −27 | Exporter never writes a README sheet |
| Categories | 16 | 16 | 0 | Row count matches, but hierarchy is destroyed (§3) |
| Brands | 16 | 16 | 0 | OK |
| Attribute Groups | 7 | 0 (missing) | −7 | Exporter never writes this sheet |
| Attributes | 33 | 33 | 0 | Header includes `validation`; value column is written empty |
| Attribute Options | 50 | 50 | 0 | OK |
| Product Types | 12 | **13** | +1 | Extra `Test Laptop` (§6) |
| Product Type Attributes | 58 | 0 (missing) | −58 | Exporter never writes this sheet — **root cause of publish failure (§5)** |
| Products | 20 | 20 | 0 | Row count matches, but every relationship column is blank (§4) |
| Product Attributes | 82 | 0 (missing) | −82 | Exporter never writes this sheet |
| Variants | 33 | **37** | +4 | Extra variants — see §7 |
| Variant Attributes | 62 | 0 (missing) | −62 | Exporter never writes this sheet |
| Sources | 14 | 0 (missing) | −14 | Exporter never writes this sheet |

The exporter is currently emitting only **7 sheets** (Categories, Brands, Attributes, Attribute Options, Product Types, Products, Variants) instead of the **13 sheets** the importer/template round-trip needs. This confirms Task §2 ("critical defect") verbatim.

Source of the omission: `apps/api/src/modules/catalog-import/template-generator.service.ts` `generateExport()` (lines 89–105). It calls only these seven methods and never invokes any equivalent of `exportProductTypeAttributes`, `exportProductAttributes`, `exportVariantAttributes`, `exportSources`, or `exportAttributeGroups`. The `SHEET_HEADERS` constant at the top of the same file already declares all 13 sheet shapes — the export code simply has not been written for six of them.

---

## 2. Category hierarchy — every parent is being destroyed

Reproduced column-level result:

| | `parent_slug` blank count |
|---|---:|
| Input `Categories` | 5 / 16 (i.e. **11 have parents**) |
| Output `Categories` | **16 / 16 (100% blank)** |

The five blanks in the input are the legitimate top-level categories. The export has replaced every non-null parent with the empty string.

Concrete cause: `template-generator.service.ts` `exportCategories()` (lines 233–247).

```ts
const rows = await this.db.db.select({
  slug: categories.slug,
  name: categories.name,
  nameAr: categories.nameAr,
  description: categories.description,
  sortOrder: categories.sortOrder,
}).from(categories).where(isNull(categories.storeId));
// ...
sheet.addRow([r.slug, r.name, r.nameAr ?? '', r.description ?? '', '', r.sortOrder ?? 0]);
//                                                                    ^^^^^^ literal ''
```

The parent slug is not selected, not joined, and a literal `''` is written to the `parent_slug` column. This is not an Excel formatting issue and it is not a display issue; the persistence layer never queries the relationship at all. `categories.parentId` is present in the schema and populated by the importer (`excel-executor.service.ts` lines 379–403) — the exporter simply does not read it back.

---

## 3. Product relationships — every relationship column is destroyed

Reproduced column-level result on the Products sheet in the export:

| Column | Blank / total |
|---|---:|
| `brand_slug` | **20 / 20** |
| `product_type_code` | **20 / 20** |
| `category_slug` | **20 / 20** |

Same defect class as §2. In `exportProducts()` (lines 326–349):

```ts
sheet.addRow([
  r.slug, r.title, r.title_ar ?? '', r.description ?? '', r.description_ar ?? '',
  '', '', '', r.mpn ?? '', r.gtin ?? '', r.ean ?? '',
  r.condition ?? 'NEW', r.status ?? 'ACTIVE',
]);
// ^ ^ ^ literal empties for brand_slug, product_type_code, category_slug
```

`products.brandId`, `products.categoryId`, and `products.productTypeId` are all populated by the importer (see `excel-executor.service.ts` `upsertProduct` lines 553–569) and are foreign keys on the `products` table, but the export query does not select or join them.

---

## 4. Missing sheets (concrete list)

These sheets exist in the importer and template but are never produced by `generateExport()`:

1. `Attribute Groups`
2. `Product Type Attributes` — **the direct cause of the publish failure** (§5)
3. `Product Attributes`
4. `Variant Attributes`
5. `Sources`
6. `README` (task §26 metadata)

Every one of these is present as a header definition in `SHEET_HEADERS`, which means the exporter *knows* the shape but has not been implemented. The task's directive "Fix the exporter, not the spreadsheet" (§2, §32) is exactly the right diagnosis.

---

## 5. Product Type publish failure — root cause identified

Trace of `POST /admin/product-types/:id/publish` (`catalog.taxonomy.service.ts` lines 378–412):

```
publishProductType(id)
  1. load productTypes row by id
  2. load productTypeAttributes rows where productTypeId = id
  3. if length === 0  ->  BadRequestException('Cannot publish a product type with no attributes')
  4. validateVariantDimensions(pt.categoryId, pt.variantDimensions)
  5. flip prior PUBLISHED -> DEPRECATED
  6. flip current -> PUBLISHED
```

The importer *does* correctly populate `productTypeAttributes` (executor lines 205–221) at first import. So the immediate cause is not the importer.

The cause is the round trip:

```
Import (PTA rows written to DB)
   ↓
Export (Product Type Attributes sheet is missing entirely — §4)
   ↓
Re-import (workbook has no PTA sheet → refs empty → nothing inserted)
   ↓
Publish → 0 attributes → BadRequestException
```

The task's exact symptom — "Imported Product Types cannot be published" — is reproduced on the current export workbook. Additionally, the export's `variant_dimensions` column mixes two formats: for the 12 legitimate imported types it writes human-readable attribute codes (`cpu-model,ram-gb,storage-gb,os`); for the extra Test Laptop row it writes raw attribute UUIDs. See §6.

Secondary hazard — the error is opaque. `publishProductType` currently surfaces only `Cannot publish a product type with no attributes`. Task §8 requires structured diagnostics of the form:

```
✓ Category exists
✓ Product Type exists
✗ 0 Product Type Attributes linked
✗ variant_dimensions contain unresolved UUIDs
```

The backend does not yet produce that shape.

---

## 6. Extra Product Type: `Test Laptop` (Task §15)

Reproduced row present in the export, absent from the import:

```json
{
  "code": "Test Laptop",
  "name": "Test Laptop",
  "name_ar": "",
  "description": "",
  "category_slug": "business-laptops",
  "variant_dimensions":
    "97e9ddf3-273e-4feb-a89c-edcb34b99794,15505572-7bbd-4069-af26-2d560a25461d,1c002c11-5fea-4bc5-b5f2-7d563acc1f20,113e4436-17cb-4a80-a22a-98fc5e01811e"
}
```

Classification evidence:

- `code` is a human-readable name (`Test Laptop`) not the platform's `kebab-case` convention (`business-laptop`, `monitor`, etc.). The importer's normalised `variant_dimensions` are codes; this row stores raw UUIDs — which the importer never emits (see `excel-executor.service.ts` line 187: `dimIds = dimCodes.map(code => resolveId(...))` — codes get resolved to UUIDs only at persistence time in the DB, but export currently reads them back as UUIDs, meaning this row was inserted **directly via the API**, not through a workbook.
- Empty `name_ar` and empty `description`, unlike every legitimate imported row which is bilingual.
- Its `variant_dimensions` includes `15505572-7bbd-4069-af26-2d560a25461d` — **the exact same UUID appears verbatim inside the corrupted SKU string** documented in §7. That is a strong indication this Product Type was used as a scratch target during the manual/API test that produced the corrupted variant.

**Recommendation:** Classify as `TEST` / `import artifact` (via direct API call, not via a workbook import). Do **not** delete automatically (Task §15). Under remediation the correct handling is:

1. Preserve the row (audit trail).
2. Exclude from production catalog exports via a status filter, or archive it with `status = 'DEPRECATED'` and a `metadata.note` recording the classification. This must be a data decision after the exporter/validator is fixed — not a raw SQL delete.

The row is *only* observed in the export because the export currently emits every `productTypes` row with no filter (`template-generator.service.ts` line 316: `from productTypes LEFT JOIN categories` — no WHERE clause). This is exactly the "existing unexpected records must be classified, not hidden" requirement of Task §15 / §32.

---

## 7. Extra variants — four non-imported rows (Task §16)

Reproduced rows present in the export, absent from the import:

| # | `product_slug` | `sku` | Classification (evidence-based) |
|---|---|---|---|
| V1 | `apple-67029f2e` | `00000001` | TEST (product slug has 8-hex-char random suffix `apple-67029f2e`; unit=`KG`, weight=1000; title is mojibake-encoded Arabic; SKU is a hand-typed 8-char numeric string; no matching product row in the import) |
| V2 | `apple-67029f2e` | `0000002` | TEST (same product; SKU is 7 digits, differs from V1 only in a missing leading `0`; consistent with a quick manual UI test of the create-variant form) |
| V3 | `bannana-aa7ac6ea` | `000001` | TEST (product slug `bannana-aa7ac6ea` is a typo "bannana" + random suffix; title `bab`; unit=`PCS`; empty `weight_grams`) |
| V4 | `hp-450ee-b7ec93aa` | `SKU-[{"attrId":"15505572-...","value` | **CORRUPTED** — see §8 |

Classification legend per Task §16:

- V1, V2, V3: `TEST` (manual/API-created variants against API-created test products; not part of any workbook; not referenced by any seed script in `apps/api/infra/seed-data/`)
- V4: `CORRUPTED` (see §8)
- None of the four appear in the supplied import workbook.
- None of the four correspond to any file in `apps/api/infra/seed-data/*` (verified by name; the corpus contains `product-types.ts`, `seed-catalog*` and similar).

**Do not delete before confirming with the DB whether these variants are referenced by `merchant_offers`, `cart_items`, `order_items`, or `inventory` rows.** Task §16 and §17 both require the same discipline.

---

## 8. Corrupted SKU — the JSON-as-SKU defect (Task §17)

Reproduced row (truncated because Excel cell length limits; the actual DB column may be longer and truncated on export):

```json
{
  "product_slug": "hp-450ee-b7ec93aa",
  "sku": "SKU-[{\"attrId\":\"15505572-7bbd-4069-af26-2d560a25461d\",\"value",
  "title": "[{\"attrId\":\"15505572-7bbd-4069-af26-2d560a25461d\",\"value\":\"Intel Core i3-1315U\"},{\"attrId\":\"97e9ddf3-273e-4feb-a89c-edcb34b99794\",\"value\":\"Windows 11 Pro\"}]",
  "unit": "PCS"
}
```

Analysis of what this row *is*:

1. `title` holds a JSON array of `{attrId, value}` pairs — the internal shape used by `variantAttributeValues` and by the combination-key algorithm in the executor.
2. `sku` is `"SKU-" + <same JSON array, truncated at the DB column limit>` — `productVariants.sku` is `varchar(100)`, so the JSON was truncated at 100 chars, which is exactly what we see (`SKU-` (4 chars) + `[{attrId:...,"value` (96 chars)).

Root cause candidate (needs confirmation at remediation time, not assumed):

- The Excel importer never writes `SKU-[...]` (see `excel-executor.service.ts` `upsertVariant` line 605: it writes `d.sku` from the workbook verbatim).
- The variant title in the DB is a JSON string — which is exactly the shape produced by the **manual/API variant creation path** when a caller passes the combination payload into both `sku` and `title` fields, prefixed with `SKU-`.
- The UUID `15505572-7bbd-4069-af26-2d560a25461d` appears both in the `Test Laptop` product type's `variant_dimensions` and inside this SKU — meaning the same manual/API session created both. See §6.
- Related existing path: `apps/api/src/modules/admin/admin.service.ts` and `catalog.service.ts` — these must be inspected during remediation for a code path that constructs `sku = 'SKU-' + JSON.stringify(attributes)`. The audit does **not** assume the exact caller without confirming; Task §17 asks specifically to determine "Which API/import path created it?" and that requires runtime evidence (server logs, `created_by` audit fields, `created_at`) which the current DB state alone cannot supply.

Because Task §17 requires the investigation to be *proven, not assumed*:

- **Do not migrate this SKU until the caller is identified** and the write path is patched. Otherwise the same corruption will reappear after the migration.
- **Do not delete the row until referential integrity against `merchant_offers`, `cart_items`, `order_items`, and any inventory ledger has been checked**. If a transactional row references this variant ID, the migration must preserve the historical snapshot and only re-key the SKU.
- The correct order is: (1) identify the write path, (2) patch it so no new corrupted SKU can be created, (3) only then migrate the single existing row (Task §32 "Do not mask the problem").

---

## 9. Additional defect: `variant_dimensions` export format is inconsistent

Observed in the Product Types sheet:

- The 12 imported types export `variant_dimensions` as comma-joined **attribute codes** (`cpu-model,ram-gb,storage-gb,os`) — correct.
- The extra `Test Laptop` row exports `variant_dimensions` as comma-joined **UUIDs** — round-trip will fail because the importer looks up codes, not UUIDs.

Cause: `productTypes.variantDimensions` is a JSONB array of whatever was inserted. The importer writes UUIDs (`upsertProductType` line 499, from `resolvedVariantDimensionIds`), but the *export* reads `productTypes.variantDimensions` **without mapping them back to codes** (`template-generator.service.ts` line 321: `Array.isArray(r.variantDimensions) ? r.variantDimensions.join(',') : ''`).

So even for the 12 imported Product Types, the round-trip currently emits **UUIDs** — which the importer cannot consume. The `cpu-model,ram-gb,storage-gb,os` values we see in the export must therefore correspond to rows where variant_dimensions were populated as codes by some other path (seed data or admin UI). This means:

- The 12 imported rows will round-trip **only** if `product_types.variant_dimensions` happens to already hold codes — the audit did not verify each row against live DB state.
- The Test Laptop row will not round-trip because it holds UUIDs.

Fix required: The exporter must translate stored UUIDs → codes on export, or the DB storage convention must be normalised to codes with UUID resolution happening at import time only. This must be an explicit, tested decision at remediation time.

---

## 10. Importer execution order and dependency handling (Task §19)

Read of `excel-executor.service.ts` `execute()` (lines 62–323) — the current order is:

```
1. Categories
2. Brands
3. Attribute Groups
4. Attributes
5. Attribute Options
6. Product Types
7. Product Type Attributes
8. Products
9. Product Attributes
10. Variants
11. Variant Attributes
```

Task §19's canonical order is:

```
1. Attribute Groups
2. Categories
3. Brands
4. Attributes
5. Attribute Options
6. Product Types
7. Product Type Attributes
8. Products
9. Product Attributes
10. Variants
11. Variant Attributes
12. Sources
```

Findings:

- Categories currently runs before Attribute Groups. This is generally fine because Categories has no FK to Attribute Groups, but it violates the documented canonical order and will need to be aligned (or the doc updated).
- **Sources (step 12) is not executed by the importer at all.** `SHEET_HEADERS` declares `Sources: ['product_slug', 'source_type', 'source_url', 'verified_at']` and the template generation includes it, but there is no `plan.sources` / `upsertSource` code in the executor. Task §13 asks for Sources to be preserved on export; Task §14 asks for round-trip including Sources. That is a *third* defect: Sources cannot currently be imported either, not merely exported.

The executor does use a single transaction and inserts in dependency order within that transaction, so the "deterministic order" half of Task §19 is met. The "dependency resolution rather than spreadsheet row order" half is met because the planner groups rows by section and the executor iterates each section in a fixed sequence, regardless of sheet row order.

---

## 11. Import validator (Task §18)

The existing `excel-validator.service.ts` (605 lines) validates:

- Required columns per sheet
- Duplicate keys within the workbook
- Cross-sheet references (e.g. `Products.brand_slug` must exist in `Brands`)
- Enum membership for `type`, `scope`, `condition`, `status`
- Field length pre-flight (`VARCHAR_LIMITS`)

Missing validation per Task §18:

- **Product Type must have at least one Product Type Attribute before being publishable** — this is *the* round-trip invariant that would have caught the current failure mode earlier.
- **Variant dimensions must all resolve to VARIANT-scope attributes** — currently only checked in `validateVariantDimensions` at publish time; not in the preview stage.
- **Required variant attributes referenced by Product Type Attributes with `scope='VARIANT'` must appear in each variant's `Variant Attributes` sheet** — not currently validated.
- **`product_attribute_values` typed value must match the attribute definition type** — the executor writes into `valueText/valueNumber/valueBoolean/optionValue` columns from workbook fields with the same names, but there is no cross-check that the value is populated in the column matching the attribute's declared `type`.

None of these are Excel formatting issues. All are semantic validation.

---

## 12. Category API and UI gaps (Tasks §4–§6, §21, §23–§24)

Read of `catalog.service.ts`:

- `listCategories(filters?: { storeId?; parentId?; isActive?; all? })` — the `all=true` mode returns a flat list of every category, no parent/children enrichment.
- `getCategory(id)` — returns the raw row.

Neither endpoint returns any of the fields Task §5 explicitly requires:

```
parent: { id, slug, name }        // missing
children: []                       // missing
productTypeCount                   // missing
directProductCount                 // missing
descendantProductCount             // missing
```

No tree/hierarchy endpoint exists. No descendant-product aggregation exists.

Admin UI (`apps/admin/src/app/categories/page.tsx` and `[id]/page.tsx`) — not yet read at the row level, but the API gap above guarantees the UI cannot display what it does not receive. The UI work is downstream of the API work. The API must be fixed first.

---

## 13. What this audit does *not* claim

To stay honest per Task §34 ("Do not claim production readiness unless the complete round-trip and publishing tests have actually passed"):

- The exact write path that produced the JSON-as-SKU row (`§8`) is not yet identified with runtime evidence. It is *strongly suspected* to be a manual/API path but requires `created_by` / audit log / timestamp query against the live DB before we can name the caller. The audit refuses to name it here without that evidence.
- Whether V1–V3 (`§7`) are referenced by any transactional row has not been verified. Requires `SELECT` against `merchant_offers`, `cart_items`, `order_items`, and inventory ledger tables.
- Whether the current DB actually holds Product Types with `variant_dimensions` as codes vs UUIDs in the 12 legitimate rows has not been verified (the export *appears* to show codes, but we have not read the live column). Requires a single DB query.
- The admin UI state (`Categories`, `Category Detail`, `Product Type Detail`) was not opened. The API contract gap is sufficient to conclude that any UI currently showing counts is doing so from stale or client-side-guessed data; that must be verified during remediation.

---

## 14. Root-cause summary — one paragraph per reported symptom

1. **"Imported Product Types cannot be published."**
   Because the exporter never writes a `Product Type Attributes` sheet (Task §2 / this doc §4), the round trip produces a workbook that, when re-imported, has zero PTA rows for each Product Type. The publish validator in `catalog.taxonomy.service.ts:386` throws `Cannot publish a product type with no attributes`. The importer itself is correct; the exporter is missing half of its sheet coverage.

2. **"Categories do not show what products/product types they contain."**
   Because the Category API (`getCategory` / `listCategories`) never joins or aggregates `products` / `productTypes` counts, and no tree/hierarchy endpoint exists, the Admin UI has no server-side data on which to render child categories, direct products, descendant products, or product types. Task §4/§5/§21 requires a contract change on the API before UI work can proceed.

3. **"The exported catalog does not preserve important relationships."**
   Three separate causes, all in `template-generator.service.ts`:
   (a) `exportCategories` writes literal `''` for `parent_slug` (§2),
   (b) `exportProducts` writes literal `''` for `brand_slug`, `product_type_code`, `category_slug` (§3),
   (c) Six required sheets are not produced at all (§4).

4. **"Existing bad variant/SKU data is still present."**
   The exporter selects every row from `productVariants` with no filter, so TEST / CORRUPTED / manual-API rows (`§7`, `§8`) leak into every export. The single JSON-as-SKU row (`§8`) is the most severe — it will re-enter the DB via any re-import of the current export and be treated as a legitimate variant.

---

## 15. Concrete deliverables required by the remediation (mapped from Task §1–§34)

For the next phase, the following are the specific, minimal edits that resolve the reproduced findings. Each maps to one or more numbered sections of the task.

### Backend — exporter (`template-generator.service.ts`)

- **Fix `exportCategories`** — select `parentSlug` via a self-join on `categories.parentId`; write it into the row. (Task §3)
- **Fix `exportProducts`** — join `brands`, `productTypes`, `categories`; select and write `brand_slug`, `product_type_code`, `category_slug`. (Task §7)
- **Fix `exportProductTypes`** — resolve stored UUIDs in `variantDimensions` back to attribute codes on export, or normalise the storage convention. (This doc §9)
- **Add `exportProductTypeAttributes`** — every row. (Task §10)
- **Add `exportProductAttributes`** — every row with typed values. (Task §11)
- **Add `exportVariantAttributes`** — every row; **never** export JSON-blob SKUs. (Task §12)
- **Add `exportSources`** — requires first determining whether the `sources` table exists in the current schema (it is referenced by SHEET_HEADERS but its presence in the DB has not been verified by this audit). (Task §13)
- **Add `exportAttributeGroups`** — currently entirely missing.
- **Add `README` / metadata sheet** with export date, organization, catalog version, schema version, and per-sheet counts. (Task §26)
- **Add `Attribute Groups` sheet** to the export — currently missing.

### Backend — API

- **Extend `getCategory(id)`** to return `parent`, `children`, `productTypeCount`, `directProductCount`, `descendantProductCount` (Task §5).
- **Add `GET /categories/tree`** (or equivalent) returning the full hierarchy with counts. (Task §23)
- **Add `GET /categories/:id/products`** returning direct and descendant products with a clear separation of the two sets. (Task §4)
- **Add `GET /categories/:id/product-types`** returning Product Types whose `categoryId` = this category. (Task §21)
- **Do not build a redundant publish endpoint**; add a single shared `validateProductTypeForPublish(id): { canPublish, errors[], warnings[] }` and consume it from the existing `publishProductType`, the Admin UI, the Import Center preview, and tests. (Task §20)

### Backend — importer / validator

- **Add Sources import** (executor currently has no `plan.sources` handling; see §10 above). (Task §19)
- **Align section execution to the canonical dependency order** in Task §19 (Attribute Groups before Categories, Sources last).
- **Add publishability preview** to `excel-validator.service.ts`: warn "Product Type X will not be publishable" if it has 0 PTA rows in the workbook OR if its `variant_dimensions` includes non-VARIANT-scope attributes. (Task §18, §20)
- **Add required-attribute coverage check**: for each Product, every PTA row with `required=true` at `scope='PRODUCT'` must have a corresponding Product Attributes row; for each Variant, every PTA row with `required=true` at `scope='VARIANT'` must have a corresponding Variant Attributes row. (Task §18)

### Backend — data classification / migration

- **Do not delete `Test Laptop`, V1, V2, V3, V4 without evidence.**
- **Query FK references** for V4 (and V1–V3) against `merchant_offers`, `cart_items`, `order_items`, and any inventory ledger before choosing an action. (Task §16, §17)
- **Only after the write path that produced the JSON SKU is patched**, run a controlled migration for V4 to a valid SKU. If V4 is referenced transactionally, keep the historical variant row and only re-key the SKU, or preserve it in a shadow table. (Task §17, §32)

### Admin UI (Next.js `apps/admin`)

- **Category list page** → tree view (Task §24). Uses new `/categories/tree` API.
- **Category detail page** → tabs: Overview / Products / Product Types / Subcategories, with clear direct-vs-descendant product counts (Task §4, §6, §21).
- **Product detail page** → display category path (breadcrumb `Components › Processors`) not just the leaf slug (Task §22).
- **Product detail page** → display Product Type prominently with link (Task §33).
- **Product Type detail page** → attribute list from live data (Task §33).
- **Publish flow** → surface the structured errors from `validateProductTypeForPublish` (Task §8, §20), not the current single-string `BadRequestException`.

### Import Center UI

- **Show per-sheet counts and per-relationship counts** from the workbook preview before execution (Task §27).
- **Preview must run the extended validator** and refuse execution if any required relationship is unresolvable or publishability will fail (Task §18).
- **Show Import/Export summary** with `Imported / Created / Updated / Unchanged / Rejected` (already present but must include Sources counts once §13 lands) and per-sheet Exported counts.

### Tests (required before any production-readiness claim)

- **Full round-trip integration test (Task §28)**: real Postgres (or Testcontainers if that infrastructure exists in the repo). Workbook A → import → DB snapshot → export Workbook B → re-import Workbook B → assert `created=0, unexpected_update=0, duplicate=0, rejected=0`.
- **Category contents test (Task §29)**: `business-laptops` returns 5 products, 1 product type; `processors` returns 2 products, 1 product type; `storage` returns 3 products, 2 product types; `components` returns 0 direct products but the documented descendant set.
- **Publishability test (Task §30)**: for every code in `business-laptop, monitor, desktop-processor, internal-ssd, portable-ssd, graphics-card, laptop-memory, access-point, network-switch, keyboard-mouse-combo, webcam, headset`, import → validate → publish must succeed on a fresh DB.
- **Corrupted-SKU regression test (Task §31)**: assert that no code path writes `SKU-[...]` or JSON into `productVariants.sku`, and that SKU is always sourced from `ProductVariant.sku` (never from `variantAttributeValues`).
- **Exporter completeness test**: assert the export workbook contains all 13 sheets and that per-sheet rows equal live DB counts, including for Products, Product Type Attributes, Product Attributes, Variant Attributes, Sources.
- **Relationship retention test**: for every exported Product, `brand_slug`, `product_type_code`, `category_slug` are non-empty whenever the corresponding FK is non-null in the DB.

---

## 16. Suggested remediation sequencing

The remediation is best executed as four coordinated milestones, each of which is independently testable:

1. **M1 — Exporter fidelity** (fixes §2, §3, §4 of this doc; tasks §3, §7, §10–§13, §25, §26):
   All 13 sheets exported correctly; hierarchy and relationship columns preserved; `variant_dimensions` round-trip normalised. Add exporter-completeness tests. *Do not touch the DB or UI yet.*

2. **M2 — API contracts for contents and publishability** (tasks §5, §8, §20, §21, §22, §23):
   Extend `getCategory` / add tree endpoint; add `validateProductTypeForPublish` returning structured errors; wire into existing publish endpoint. Contract tests.

3. **M3 — Import validator preview + Sources import** (tasks §13, §18, §19):
   Add Sources import path; align execution order; add preview-time publishability and required-attribute checks.

4. **M4 — Admin UI surfacing the new contracts** (tasks §4, §6, §21, §22, §24, §27):
   Category tree, category detail tabs with direct-vs-descendant counts, Product breadcrumb, Product Type attribute view, structured publish errors, Import/Export Center count summaries.

5. **M5 — Data classification & safe migration** (tasks §15, §16, §17, §32):
   Only after M1 and M3 are green: query FK references for V1–V4, identify the write path for the JSON SKU (with runtime evidence), patch it, and only then migrate V4's SKU.

6. **M6 — Round-trip and publishability acceptance tests** (tasks §28–§31):
   Real Postgres round-trip, per-category contents, publishability for every imported Product Type, corrupted-SKU regression. **Do not claim production readiness** until these pass. Task §34 explicitly requires this discipline.

---

## 17. Files inspected for this audit

Only reads; nothing modified.

- `apps/api/src/modules/catalog-import/template-generator.service.ts` — full file (377 lines)
- `apps/api/src/modules/catalog-import/excel-executor.service.ts` — full file (684 lines)
- `apps/api/src/modules/catalog-import/excel-validator.service.ts` — grep only (605 lines)
- `apps/api/src/modules/catalog-import/excel-planner.service.ts` — grep only
- `apps/api/src/modules/catalog-import/excel-parser.service.ts` — grep only
- `apps/api/src/modules/catalog-import/catalog-import.service.ts` — grep (450 lines)
- `apps/api/src/modules/catalog/catalog.taxonomy.service.ts` — key sections (lines 313–460, 600–680)
- `apps/api/src/modules/catalog/catalog.taxonomy.controller.ts` — full file
- `apps/api/src/modules/catalog/catalog.taxonomy.schema.ts` — full file
- `apps/api/src/modules/catalog/catalog.service.ts` — grep only (1946 lines; category methods)
- `docs/production/catalog-import-real-test-data-final.xlsx` — via ExcelJS
- `docs/production/catalog-export-2026-09-26.xlsx` — via ExcelJS

---

## 18. Sign-off gate

This document closes Task §1 (reproduce the workbook comparison). **No code has been changed.** Before proceeding to Task §3 (Category hierarchy fix) through Task §34 (final report), the sequencing in §16 above and the scope should be confirmed. The full remediation spans ~6 backend files, ~5 admin UI pages, at least 6 new integration tests, and one data-classification decision that requires runtime evidence from the live database (§8, §16, §17) before it can be executed safely.

---

## 19. Milestone M1 — Exporter fidelity (completed 2026-09-26)

The user approved M1 only (no M2+ implementation, no new tests, no live DB access). One file changed:

- `apps/api/src/modules/catalog-import/template-generator.service.ts`

### Concrete changes

| Audit finding | Method affected | What changed |
|---|---|---|
| §2 — every `Categories.parent_slug` was written as `''` | `exportCategories` | Now selects `categories.id` + `categories.parentId`, builds an id→slug map, and writes the resolved parent slug per row. |
| §3 — every `Products.brand_slug`, `product_type_code`, `category_slug` was written as `''` | `exportProducts` | Now LEFT JOINs `brands`, `productTypes`, `categories` via their FKs and writes the joined natural keys. |
| §9 — `variant_dimensions` was written as raw UUIDs (unimportable) | `exportProductTypes` | Loads `attributeDefinitions.id → code` map, translates stored UUIDs to codes at export time, and passes legacy code-form values through unchanged. Handles both storage conventions safely so the pre-existing DB rows continue to round-trip. |
| §4 — `Product Type Attributes` sheet never emitted (root cause of the publish failure) | **new** `exportProductTypeAttributes` | INNER JOINs `productTypes` and `attributeDefinitions`, LEFT JOINs `attributeGroups`; writes all 10 columns the importer expects. Every PTA relationship is now exported. |
| §4 — `Product Attributes` sheet never emitted | **new** `exportProductAttributes` | JOINs `products` + `attributeDefinitions`; writes the four typed value columns the importer consumes (`value_text`, `value_number`, `value_boolean`, `option_key`). Rows whose only value lives in the JSONB `value_json` column (MULTI_SELECT) are skipped, matching what the importer can currently ingest; documented inline so the gap is explicit and not hidden. |
| §4 — `Variant Attributes` sheet never emitted | **new** `exportVariantAttributes` | JOINs `productVariants` + `attributeDefinitions`; `variant_sku` comes from `productVariants.sku` (Task §12 — never a JSON blob). The pre-existing corrupted SKU row is exported verbatim rather than silently rewritten, so it remains visible for the M5 data-classification decision (Task §32: "do not mask the problem"). |
| §4 — `Attribute Groups` sheet never emitted | **new** `exportAttributeGroups` | Selects name / name_ar / kind from `attributeGroups`. |
| §4 / Task §13 — `Sources` sheet never emitted | **new** `exportSources` | Emits the sheet with the correct 4 headers but zero rows, with an inline comment explaining that no `sources` / `product_sources` table exists in the current Drizzle schema. Preserves the workbook shape without inventing values (Task §13: "Do not invent values"). |
| Task §26 — no metadata / record counts in the export | **new** `addExportReadme` | Adds a README sheet at the end of the workbook with export date and per-sheet record counts. Organization / Catalog Version / Schema Version fields are present but intentionally empty pending M2+ (they require data not available in the export path). |
| Header column count bug | `exportAttributes` | `SHEET_HEADERS['Attributes']` declared 8 columns but the previous writer emitted 7; added `validation` column serialised as JSON when non-empty. |

`generateExport()` now calls all 12 export methods (was 7) plus the metadata sheet, and each method returns its row count for the README aggregation.

### Verification performed in this environment

| Gate | Result |
|---|---|
| `pnpm exec tsc --noEmit` (apps/api) | Exit 0, clean |
| `pnpm exec vitest run src/__tests__/unit` | 652/652 passed across 48 files |
| `pnpm exec vitest run src/__tests__/integration/catalog-import-pipeline.spec.ts` | 7/7 passed (mocked DB) |
| `pnpm exec eslint src/modules/catalog-import/template-generator.service.ts` | Exit 0, clean |
| `pnpm exec vitest run` (whole api suite) | 711 passed, 267 skipped, 9 files failed — **all failures are `Could not find a working container runtime strategy`** (Docker unavailable in this sandbox). These failures pre-date M1 and are unrelated to the exporter change; no code touched by those specs was modified. |

### What M1 does not do

- **No API changes** — category detail still has no `parent` / `children` / counts (Task §5, M2 scope).
- **No new `validateProductTypeForPublish`** — publish still throws a single opaque string when PTA is empty (Task §8, §20, M2 scope). The reason this is no longer fatal for the round trip is that M1 now emits PTA rows, so a fresh export→reimport will populate the table and publish will succeed. That said, the structured diagnostic requirement of Task §8 is **not** satisfied by M1 alone.
- **No import of Sources** — the persistence layer for Sources does not exist. The export emits the sheet shape but no data flows either direction. Task §13 is therefore partially satisfied ("don't invent values") but not fully (Sources cannot yet round-trip).
- **No classification of V1–V4 or the corrupted SKU** — Task §15, §16, §17 remain open; those need live-DB queries to check FK references before any migration.
- **No round-trip / category-contents / publishability integration tests** — Task §28–§31 deferred per user directive ("keep existing suite green").
- **No changes to `apps/admin`** — the Category tree, tabbed Category detail, Product breadcrumb, and Product Type attribute view (Task §4, §6, §21, §22, §24) all remain open and depend on the M2 API contract.

### Recommended verification before merge

Because this environment cannot run the container-based tests, a human reviewer must:

1. Start Docker (or run in CI where Testcontainers works).
2. `pnpm vitest run src/__tests__/integration/phase4-import-commerce.e2e.spec.ts` — must pass.
3. Manually exercise the round trip on a staging DB with the supplied acceptance workbook: upload the current export, confirm the resulting DB state now contains 12 Product Types **with PTA rows**, 58 PTA relationships, 82 Product Attributes, 62 Variant Attributes, and that re-export produces the same counts (not identical files, but identical row counts per sheet).
4. Open the Admin Product Types list against the re-imported data and attempt Publish — must succeed for every imported type.

The final claim of "M1 is production-ready" is gated on step 3–4, which cannot be executed from this sandbox (per §13 of this audit and Task §34's discipline).

---

## 20. Milestone M2 — API contracts for contents and publishability (completed 2026-09-26)

**Files changed:**

- `apps/api/src/modules/catalog/catalog.service.ts` — added `collectDescendantIds` helper, `getCategoryContents`, `getCategoryTree`, `getCategoryProducts`, `listCategoryProductTypesForAdmin`, plus three private helpers (`loadPlatformCategoryNodes`, `countProductsInCategories`, `queryCategoryProductRows`).
- `apps/api/src/modules/catalog/catalog.controller.ts` — added `GET /categories/tree` (declared BEFORE `GET /categories/:id` per the NestJS literal-before-parameterized invariant), added `GET /categories/:id/products` with `scope` query, added `GET /admin/categories/:id/product-types` (permission-gated), and pointed the existing `GET /categories/:id` at the enriched service method.
- `apps/api/src/modules/catalog/catalog.taxonomy.service.ts` — added `PublishValidationIssue` / `PublishValidationResult` interfaces, added `validateProductTypeForPublish(id)`, and rewired `publishProductType(id)` to throw `UnprocessableEntityException` with the structured payload when validation fails.
- `apps/api/src/modules/catalog/catalog.taxonomy.controller.ts` — added `GET /admin/product-types/:id/publish-readiness` (permission-gated).
- `apps/api/src/__tests__/unit/catalog/catalog-taxonomy.spec.ts` — one existing assertion updated from `BadRequestException` to `UnprocessableEntityException` to reflect the intentional contract change (Task §8).

### Contract decisions

1. **Enrich, do not replace.** `getCategory(id)` still returns the raw row for internal callers (`createCategory`, `updateCategory`, `deleteCategory`); a new `getCategoryContents(id)` is what the HTTP GET now serves. Consumers that read only `slug`/`name`/`parentId` continue to work; the response is a strict superset.
2. **Tree traversal avoids the materialized path.** The importer writes `categories.path` inconsistently (see §3 note under executor). Descendant computation walks `parentId` in memory over the small (~16) platform-category set. Once M5 data cleanup normalises `path`, this can be pushed down into a recursive CTE without changing the API surface.
3. **Two product-type listings, deliberately.** `GET /categories/:id/product-types` remains PUBLISHED-only for merchant/buyer surfaces (unchanged behavior). The new `GET /admin/categories/:id/product-types` returns every status with `variantCount` / `attributeCount` / `publishStatus` per Task §6/§21. Merging them would either leak DRAFT types to buyers or hide them from admins; the split is the honest contract.
4. **Structured publish errors, no prose parsing.** `validateProductTypeForPublish` returns `{ canPublish, errors[], warnings[] }` where every item has a stable `code`, `field`, `message`, `severity`. `POST /admin/product-types/:id/publish` now throws `422 Unprocessable Entity` with that payload embedded; `GET /admin/product-types/:id/publish-readiness` returns it non-mutatively.
5. **Warnings do not block publishing.** Missing-category, missing-PTA, malformed-UUID and non-VARIANT-scope dimensions are ERRORS. Store-scoped category, no-required-attribute, dimension-not-in-PTA and inactive-dimension-attribute are WARNINGS. Only errors flip `canPublish` to `false`.

### Verification gates

| Gate | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` (apps/api) | exit 0 |
| `pnpm exec vitest run src/__tests__/unit` | **652 / 652** across 48 files |
| `pnpm exec vitest run src/__tests__/integration/catalog-import-pipeline.spec.ts` | 7 / 7 |
| `pnpm exec eslint` on the four changed source files | 0 errors (3 pre-existing warnings unrelated to M2) |

### What M2 explicitly does **not** do

- **No changes to `apps/admin`** — the Category tree view, tabbed Category detail with parent/children/attribute/product/product-type panels, Product Type publish-readiness banner, and the breadcrumb on Product detail (Task §4, §6, §21, §22, §24) all remain open and now have the API contract to build against.
- **No migration to fix V1–V4 or the corrupted SKU** (Task §24–§27). That is M5 and needs the live DB.
- **No Sources persistence layer** — the `sources` / `product_sources` table still does not exist (see §7 note). M2 does not close Task §13.
- **No new tests added** per user direction; the only test-file edit was updating the one existing assertion to match the intentional exception-type change.
- **No round-trip integration test yet** exercising "import → publish succeeds for every imported PT". This is Task §29 and requires the container-capable environment.

### Recommended verification before merging M2

1. Run `POST /admin/product-types/:id/publish` for every one of the 12 imported Product Types against a database seeded from the acceptance workbook. Every one must now succeed (M1 exporter change repopulates PTA on re-import; M2 validator confirms the PTA + variant-dimension wiring).
2. Call `GET /admin/product-types/:id/publish-readiness` for `Test Laptop` — must return `canPublish: false` with `errors[]` including `VARIANT_DIMENSION_INVALID_REF` (because its `variantDimensions` still contain raw UUIDs from before the M1 export fix). This is the intended, honest behavior; the type is not silently hidden or auto-patched.
3. Call `GET /categories/tree` and confirm `business-laptops` reports `directProductCount: 5, descendantProductCount: 0`, `processors` reports `2 / 0`, `storage` reports `3 / 0`, and the parent `components` node reports `descendantProductCount: 7` (or whatever matches the current data). This is the API-level equivalent of Task §29 tests 1–4.
4. Confirm the buyer-side `GET /categories/:id/product-types` still returns only PUBLISHED types (regression guard against the new admin listing leaking through).
