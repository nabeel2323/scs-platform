# Product Catalog Architecture — Phase 1 Discovery & Migration Report

**Scope:** Evolve the existing product model into a governed, multi-merchant B2B marketplace catalog (Canonical Product + Variant + Merchant Offer, driven by Product Type / Attribute templates).

**Status:** DISCOVERY ONLY. No code was modified. This report corresponds to PHASE 1 of the master prompt and satisfies Section 4 (A. Current architecture, B. Problems, C. Proposed architecture, D. Migration strategy).

**Evidence base:** audited against the live tree under `scs-platform/apps/api`, `scs-platform/apps/web`, `scs-platform/apps/admin` (Sept 2026). The `apps/scs-platform-b2-test/**` tree is a **stale full-repo copy** (older, smaller files, its own nested `apps/api`) and is excluded from the analysis.

---

## 0. Repository orientation

| Concern | Location | Finding |
|---|---|---|
| Backend framework | `apps/api` | **NestJS** modular monolith (`@Controller`/`@Injectable`, guards, `app.module.ts`) |
| ORM | `apps/api/src/**` | **Drizzle ORM** (`pgTable`, `drizzle-orm`) against **PostgreSQL** |
| Schema source of truth | `apps/api/src/drizzle/schema.ts` | Barrel re-exporting per-module `<ctx>.schema.ts` |
| Migrations | `infra/drizzle/migrations/NNNN_name.sql` | **Hand-written SQL**, applied by `apps/api/infra/drizzle/migrate.ts`, tracked in `_migration_log`. **Highest applied = `0022`.** New work starts at **`0023`**. |
| Auth / ownership | `common/guards/*`, `common/tenant-scope.ts` | JWT + `PermissionsGuard` + `OrgScopeGuard`; permission strings like `merchant:products:write`, `catalog:categories:write` |
| Buyer storefront + **Merchant console** | `apps/web` | Single Next.js **App Router** app; merchant screens live under `apps/web/src/app/merchant/**` |
| Platform admin console | `apps/admin` | Next.js App Router; catalog routes are thin stubs over a generic `ManagementPage` grid |
| Design system | `packages/ui-kit` (`@scs/ui-kit`) | `PageHeader`, `Breadcrumb`, tokens (`colors`, `typeScale`, `radii`, `shadows`) — already used by product pages |

> Note: the merchant console is **not** a separate app — it is a route segment inside `apps/web`. There is no distinct "merchant" BFF; both buyer and merchant call the same `apps/api` (via `apps/web/src/lib/buyer-api.ts` and `apps/web/src/lib/api.ts`).

---

## A. Current architecture (as-is)

### A.1 Current Product model — `apps/api/src/modules/catalog/catalog.schema.ts`

`products` is **store-owned**, not canonical:

```ts
export const products = pgTable('products', {
  id, storeId (NOT NULL → stores.id, cascade),   // merchant owns the product
  categoryId, brandId,
  slug, title, titleAr, description, descriptionAr,
  status ('DRAFT'), condition ('NEW'),
  isAvailable, moq (INTEGER, default 1),          // ← B2B commercial data on the "product"
  images (jsonb []), attributes (jsonb {}), metadata (jsonb {}),
  publishedAt, deletedAt, createdAt, updatedAt,
});
```

- `storeId NOT NULL` → the relationship is **Merchant(store) → Product**, exactly the anti-pattern the master prompt flags.
- `attributes` and `metadata` are **untyped JSONB blobs** — no schema, no definitions, not queryable.
- `moq`, `condition`, `isAvailable` are **offer/commercial concerns sitting on the product**.
- No `productTypeId`, no dedup identifiers (GTIN/EAN/MPN), no completeness scoring.

### A.2 Current Variant model — same file

```ts
export const productVariants = pgTable('product_variants', {
  id, productId (NOT NULL → products, cascade),
  sku (NOT NULL), barcode, title, titleAr,
  unit ('PCS'), weightGrams, dimensionsMm (jsonb),
  attributes (jsonb {}), images (jsonb []),
  isActive, createdAt, updatedAt,
});
```

- Variants are **the purchasable unit** and hang off a store-owned product.
- `sku` is `NOT NULL` but has **no uniqueness constraint** (per-product or global). `barcode` lives here.
- `attributes` JSONB again — no controlled variant dimensions, **no variant-combination uniqueness**, no matrix semantics.
- A variant is implicitly single-merchant because its owning product is single-store.

### A.3 Category model — same file

```ts
export const categories = pgTable('categories', {
  id, storeId (→ stores, cascade),   // ← categories are STORE-scoped, not platform-governed
  parentId, path, slug, name, nameAr, description, imageUrl,
  sortOrder, isActive, productCount, metadata (jsonb), …
});
```

- Has hierarchy (`parentId`, materialized `path`), slug, i18n name, sort order — good basics.
- **Critical:** `storeId` makes categories merchant-owned; there is **no single platform taxonomy**, and **no link from a category to a Product Type**. `search.service.getTopCategories` even branches on `isNull(categories.storeId)` (platform root) vs store — so platform-level categories are only half-supported.

### A.4 Brand model — same file

```ts
export const brands = pgTable('brands', {
  id, name, nameAr, slug (unique), logoUrl, description, isActive, …
});
```

- **Already a first-class platform-level entity** (no `storeId`) — aligns with the target. Missing: `website`, `verified` flag, ownership/authorized-merchant concepts (deferred per prompt §7 "do not overimplement").

### A.5 Media — `productMedia` (same file)

Proper separate table: `productId`, nullable `variantId`, `mediaType`, `url`, `thumbUrl`, `altText(+Ar)`, `sortOrder`, `blurhash`. Canonical media is well modeled today; there is **no merchant-offer-scoped media** concept (all media belongs to product/variant, which is store-owned).

### A.6 Inventory — `apps/api/src/modules/inventory/inventory.schema.ts`

```ts
export const inventoryItems = pgTable('inventory_items', {
  variantId (→ product_variants, cascade),
  warehouseId (→ warehouses, cascade),   // warehouse → store → merchant
  qtyOnHand, qtyReserved, reorderPoint, maxStock, …
});
export const stockMovements = pgTable('stock_movements', { inventoryItemId, movementType, quantity, … }); // append-only ledger
```

- Inventory is per **(variant, warehouse)**; warehouse is per store, so stock is merchant-scoped **transitively through the product/store link**.
- Good ledger + reservation model exists (reused, not rebuilt).

### A.7 Pricing — `apps/api/src/modules/pricing/pricing.schema.ts`

```ts
export const priceLists = pgTable('price_lists', { storeId, name, currency, channel ('B2B'), audience, priority, validFrom/Until, … });
export const priceTiers = pgTable('price_tiers', { priceListId, variantId, minQty, maxQty, unitPriceMinor (bigint), … });
```

- Pricing is already **store + variant + quantity-tier** based (B2B tiers exist: `minQty/maxQty`, minor units). This is a strong asset for the Offer model.
- There is **no explicit price-on-product**; effective price is resolved from tiers by `pricing/price-resolution.ts` (`priceForQty`). Buyer page mirrors this in `unitPriceFor()`.

### A.8 Orders — `apps/api/src/modules/orders/orders.schema.ts`

```ts
orderItems: { orderId, variantId (→ product_variants), sku, title, quantity, unitPriceMinor, tierMinQty, lineTotalMinor, … }
orders: { storeId, … }   // sub-order per store
```

- Orders key on **`variantId`** and snapshot price/sku. Sub-orders are per `storeId`.
- **Implication for Offers:** today an order line = a store-owned variant. When Offer is introduced, `orderItems` must reference an **Offer** (merchant + variant + price) rather than a bare variant, or retain `variantId` + add `offerId`. This is the main downstream coupling to protect (§53 legacy compatibility).

### A.9 API surface — `catalog.controller.ts`, `search.service.ts`

| Endpoint | Guard | Notes |
|---|---|---|
| `POST/GET/PATCH/DELETE /categories` | `catalog:categories:write` (write) | `GET /categories` accepts `storeId` filter |
| `POST/GET/PATCH/DELETE /brands` | `catalog:brands:manage` (write) | brand is platform-level |
| `POST /products` | `merchant:products:write` | creates a **store-owned** product |
| `GET /stores/:storeId/products` | — | products always scoped by store |
| `GET /products/:id` | — | returns product + variants + pricing + media + stock (`getProductDetail`) |
| `POST /products/:id/variants`, `.../variants/bulk` | `merchant:products:write` | manual variant create/edit/delete/toggle |
| `POST /products/:id/media`, `/media/reorder`, `/media/presign` | `merchant:products:write` | presigned S3 upload |
| `POST /stores/:storeId/imports`, `/imports/:id/process` | `merchant:products:write` | bulk XLSX import (`importJobs`) |
| `GET /search` | — | **filters limited to `storeId`, `categoryId`, `brandId`** — no attribute facets |

- No `/product-types`, `/attributes`, `/offers` endpoints exist (nothing to extend for those concepts — they are genuinely absent).
- `GET /variants/:id/offers`, `POST /merchant/offers` — do not exist.

### A.10 Merchant experience — `apps/web/src/app/merchant/catalog/product/[id]/page.tsx`

A **single hardcoded form** (no wizard, no template). Fields actually rendered:

`Title(En/Ar)`, `Category` (dropdown of store categories), `Brand` (dropdown), `Condition` (`NEW/USED/REFURBISHED`), **`MOQ`**, `Available` checkbox, `Description(En/Ar)`, `Image URLs` (textarea), SEO `slug/metaTitle/metaDescription`.

- Variants are a **flat manual table**: add one row at a time with `SKU / Title / Unit / Barcode / Weight`. **No matrix, no option dimensions, no combination generation.**
- **The `attributes` JSONB is never edited in the UI at all** — there is no key/value, no attribute picker. It is effectively dead reserved structure.
- No completeness score, no step workflow, no dynamic form generation, no category→template resolution.

### A.11 Buyer experience — `apps/web/src/app/products/[id]/page.tsx`

- Renders a polished gallery + a **"Sold by {store}"** single-seller block, MOQ chip, "Price from {cheapest variant}".
- Variants shown as a **flat list of cards** (SKU, price, per-card qty input + Add-to-cart). **No dimension selector** (no "pick RAM / Storage / Color"), no invalid-combination handling.
- **No specifications/attributes section** — the JSONB attributes are not displayed.
- **No multi-merchant comparison** — the product belongs to one store, so the buyer sees one seller only. (`search.service` A5-2 comment notes cards carry a seller + comparable price so buyers can compare "the same product across stores" — but that only works if duplicate products already exist per store, which is the exact duplication problem.)

### A.12 Admin experience — `apps/admin/src/app/{products,categories,brands}/page.tsx`

All are 5-line stubs: `return <ManagementPage entity="products" />`. `ManagementPage` is a **generic table view/grid** backed by `admin-tables.ts` (column + filter config per entity). Admin can view/edit raw rows; there is **no Product Type Builder, no Attribute manager, no taxonomy governance UI, no catalog quality dashboard**. `admin-tables.ts` "filters" are admin-grid column filters, **not** buyer facets.

### A.13 Search & discovery — `search.service.ts`

- Good foundation: `normalize_arabic()` DB function, tsvector FTS, trigram similarity, SKU/barcode fast path, `search_queries` analytics log.
- **However**: the raw SQL matches on **`p.title` only** (no description/attributes), and the only filters are store/category/brand. No facet aggregation, no attribute-driven filters, no sort beyond `sim_score`/`created_at`.

---

## B. Problems (gap analysis vs. master prompt)

| # | Problem | Evidence | Master-prompt section |
|---|---|---|---|
| B1 | **Product is merchant-owned, not canonical.** Cannot have multiple merchants offer the same product without duplicating it. | `products.storeId NOT NULL`; every listing scoped `/stores/:id/products` | §1, §24, §58 |
| B2 | **No Merchant Offer entity.** Price/stock/MOQ are spread across `products.moq`, `price_lists(store)`, `inventory_items(variant×warehouse)` with no single "merchant sells variant X under terms Y" object. | catalog/inventory/pricing schema | §23–§26, §49–§51 |
| B3 | **Commercial data mixed into product.** `moq`, `condition`, `isAvailable` live on `products`. | `products.moq` | §17, §25, Rule 4 |
| B4 | **Attribute system is a JSON blob.** `products.attributes`, `variants.attributes` are untyped and (in practice) unused; no `AttributeDefinition/Option/Scope`. | JSONB columns; no UI edits them | §8–§10, Rule 8 |
| B5 | **No Product Type / Template.** Nothing maps category → schema; no required/optional attributes, validation, groups, conditional rules, versioning. | no `product_types` table/endpoint | §11–§16, §33 |
| B6 | **Category is store-scoped, not platform-governed; no link to a template.** | `categories.storeId` | §6, §28, §58 |
| B7 | **Variant model can't express dimensions.** No dimension values, no combination uniqueness, no matrix. | `productVariants` free `attributes`, no unique idx | §19–§22 |
| B8 | **Search/filters are hardcoded to category/brand.** No dynamic facets; FTS covers title only. | `search.service` | §40–§41, §66, Rule 6 |
| B9 | **Buyer UX has no variant selector, no specs, no offer comparison.** | `products/[id]/page.tsx` | §35–§39, §62 |
| B10 | **Merchant UX is one hardcoded form; no template-driven generation, no matrix, no completeness.** | merchant editor page | §27–§30, §59–§60, Rule 5 |
| B11 | **No catalog governance.** No admin Product Type Builder / Attribute manager / taxonomy request workflow / data-quality reporting. | admin `ManagementPage` only | §31–§34, §64–§65 |
| B12 | **No identifiers/dedup.** GTIN/EAN/MPN absent; nothing prevents duplicate canonical products. | schema | §44–§45 |
| B13 | **Lifecycle conflated.** Product `status` is doing product-lifecycle duty; no independent Offer lifecycle. | `products.status`, no offer status | §47–§48 |

Assets to **reuse, not rebuild**: brand table (platform-level), `product_media`, `inventory_items`+`stock_movements` ledger+reservation, `price_lists`/`price_tiers` (already B2B-tiered), FTS/Arabic normalization, RBAC guards, presigned upload, bulk import jobs, `@scs/ui-kit`.

---

## C. Proposed architecture (to-be)

### C.1 Target domain entities

Naming follows existing conventions (`pgTable`, snake_case columns, `deletedAt`, minor-unit `*Minor` numerics, `metadata jsonb`). New tables live in a new **`catalog` domain** alongside existing files, exported from `apps/api/src/drizzle/schema.ts`.

**Platform-owned (governance layer)**

| Table | Purpose | Key columns |
|---|---|---|
| `product_types` | Template/schema per product kind, versioned | `id, code, name, nameAr, category_id, version, status(DRAFT/PUBLISHED/DEPRECATED), published_at, effective_from, variant_dimensions(jsonb of attr ids), completeness_rules(jsonb), metadata` |
| `attribute_definitions` | Global reusable attributes | `id, code, name, nameAr, type (TEXT/INTEGER/DECIMAL/BOOLEAN/DATE/SELECT/MULTI_SELECT/COLOR/MEASUREMENT/CURRENCY/URL), unit, scope (PRODUCT/VARIANT/OFFER), status, validation(jsonb)` |
| `attribute_options` | Controlled values for SELECT/MULTI_SELECT | `id, attribute_id, value, value_ar, order, is_active` |
| `attribute_groups` | Grouping for presentation (Processor/Memory/…) | `id, name, name_ar, kind` |
| `product_type_attributes` | Join: type ↔ attribute w/ per-type config | `product_type_id, attribute_definition_id, group_id, required, scope, display_order, filterable, searchable, sortable, comparable, visible_in_listing, visible_in_detail, allowed_values(jsonb), validation_rules(jsonb), conditional_rules(jsonb)` |
| `taxonomy_requests` | Merchant→Admin request for new category/brand/attribute/option (§31) | `id, store_id, requested_by, kind, payload(jsonb), status(PENDING/APPROVED/REJECTED), reviewed_by, decision_notes` |

**Canonical catalog layer**

| Table | Purpose | Key columns |
|---|---|---|
| `products` (evolved) | Canonical product — **drop the store ownership requirement** | add `product_type_id`, `product_type_version`; make `store_id` **nullable** (becomes "first/publishing contributor", later deprecated); move `moq/condition` out; add identifier columns `gtin, ean, upc, mpn`; keep `category_id, brand_id, slug, title, status, media` |
| `product_attribute_values` | Structured PRODUCT-scope values | `id, product_id, attribute_definition_id, value_text, value_number, value_boolean, value_jsonb(multi), option_value_id` (typed columns keep it queryable; JSON only for genuinely dynamic bits) |
| `product_variants` (evolved) | Canonical variant = valid combination | add `product_type_id`; **unique index on `(product_id, combination_hash)`** (§22); `combination_hash` generated from ordered variant-scope attribute values |
| `variant_attribute_values` | Structured VARIANT-scope values (the dimension values) | `id, variant_id, attribute_definition_id, option_value_id, value_text, value_number` |

**Merchant commercial layer**

| Table | Purpose | Key columns |
|---|---|---|
| `merchant_offers` | Merchant sells a canonical variant under B2B terms (§23) | `id, merchant_store_id, variant_id, merchant_sku, status(DRAFT/PENDING_APPROVAL/ACTIVE/PAUSED/OUT_OF_STOCK/SUSPENDED/EXPIRED), price_minor, currency, moq, max_order_qty, lead_time_days, condition, incoterms, payment_terms, stock_strategy, shipping_info(jsonb), custom_attributes(jsonb), approved_by, approved_at` |
| `offer_attribute_values` | OFFER-scope dynamic attributes (§25) | `id, offer_id, attribute_definition_id, value_*` |

Relationships (target):

```
Category ── ProductType(version) ──┬── ProductTypeAttribute ── AttributeDefinition ── AttributeOption
                                    └── variant_dimensions
Canonical Product ── ProductAttributeValue
        └── ProductVariant ── VariantAttributeValue
                 └── MerchantOffer (merchant_store_id × variant_id)  ← price/stock/MOQ/lead time here
                          └── references inventory_items / price_tiers (migrated or bridged)
OrderItems ──► MerchantOffer (was: bare variantId)
```

### C.2 Ownership & permissions (§57–§58)

- **Platform** owns: categories (make `store_id` nullable → platform roots), brands, attribute definitions/options, product types (+ versions), canonical products/variants. New permission family `catalog:taxonomy:manage`, `catalog:product-types:manage`, `catalog:attributes:manage`.
- **Merchant** owns: offers (price, stock link, merchant SKU, MOQ, lead time, merchant media, custom attributes) — permission `merchant:offers:write`. Merchants contribute canonical products only via an approval path; they never edit global schema.
- **Buyer**: read-only browse/search/compare/select offer; permissionless read of published catalog.
- Enforce with existing `PermissionsGuard` + `OrgScopeGuard`; offer writes must assert `offer.merchant_store_id ∈ caller's stores` (mirrors current `merchant:products:write` store checks).

### C.3 API surface (extend, don't duplicate — §56)

- New: `GET/POST/PATCH /admin/product-types`, `/admin/attributes`, `/admin/attribute-options`, `/categories` (already exists; add platform scope), `/taxonomy-requests` + `POST /admin/taxonomy-requests/:id/decision`.
- New: `GET /products/:id/variants` (exists), `GET /variants/:id/offers`, `GET /products/:id` must return canonical product + variants + **offer summaries** ("from $X, N merchants").
- Merchant: `POST /merchant/offers`, `PATCH /merchant/offers/:id`, `GET /merchant/offers`; `POST /merchant/products` becomes "create-or-match canonical product" (§60), returning/attaching an offer.
- Buyer search: extend `GET /search` with `facets` (attribute-driven) — keep `/categories`,`/brands` endpoints; add facet aggregation derived from `product_type_attributes.filterable`.

### C.4 Dynamic form & presentation engine (§27–§30, §33–§43, §69–§71)

- `GET /admin/product-types/:id/schema` returns the ordered, grouped attribute config with validation + variant dimensions.
- **Merchant editor** renders a **step wizard** driven by that schema (category → resolve type → dynamic spec form → variant matrix builder → offer terms → media → review/publish). Variant matrix: choose values per dimension → system generates combinations → merchant disables ones not sold (§21), with backend uniqueness on `(product_id, combination_hash)`.
- **Buyer PDP**: dynamic dimension selectors resolving the exact variant (disable impossible combos §36), then **offer comparison table** across merchants (price, MOQ, stock, lead time, warranty, merchant — §37–§38), then dynamic Specifications grouped by `attribute_groups` (hide empties §39).
- Reuse `@scs/ui-kit` tokens/components throughout; no new visual language (§68, Rule 12).

---

## D. Migration strategy (§52–§53; do not destroy data)

**Guiding rule:** additive, reversible, back-fill, keep legacy green. Every canonical/offer change is a new migration numbered from **`0023`**, hand-written SQL, idempotent, inserting its own `_migration_log` row (per established convention). Never reuse `0001–0022`.

### Phase plan (maps master-prompt Phases 2–12 → concrete migrations)

| Migration | Content | Disruption |
|---|---|---|
| `0023_attributes` | `attribute_definitions`, `attribute_options` (+ indexes on `code`, `scope`) | none (new tables) |
| `0024_product_types` | `product_types`, `attribute_groups`, `product_type_attributes` | none |
| `0025_canonical_link` | `ALTER products ADD product_type_id NULL, product_type_version, gtin, ean, upc, mpn`; `ALTER categories ADD product_type_id NULL`; make `categories.store_id` nullable; **`ALTER products MODIFY store_id NULL`** | low — existing rows unaffected (still have store_id) |
| `0026_variant_values` | `product_attribute_values`, `variant_attribute_values`; back-fill from `products.attributes`/`variants.attributes` JSONB where parseable, else flag for review; add `combination_hash` + **unique index** on product_variants | medium — back-fill must tolerate unparseable JSON (write to `migration_review_required`) |
| `0027_offers` | `merchant_offers`, `offer_attribute_values`; **back-fill one offer per existing variant** using `product.store_id`, `product.moq`, and the variant's resolved base price from `price_tiers`; index `(merchant_store_id)`, `(variant_id)`, unique `(merchant_store_id, variant_id, merchant_sku)` | high-value bridge |
| `0028_offer_lifecycle` | offer status defaults, `taxonomy_requests` | none |
| `0029_orders_offer` | `ALTER order_items ADD offer_id NULL` (keep `variant_id`); back-fill `offer_id` from the legacy per-store offer; new orders write `offer_id` | protected — `variant_id` retained for legacy reads |
| `00xx_search_facets` | attribute-value indexes; optional materialized facet view | performance only |

**Back-fill mapping** (§52 flow): Existing product → identify its `category_id` → resolve/assign default `product_type` (per-category fallback template so nothing is left unmapped) → parse `attributes` JSONB into `product_attribute_values` (unknown keys → custom/review) → variants → `variant_attribute_values` + compute `combination_hash` → create one `merchant_offer` per (store, variant) carrying `moq`/price → validate → flag incomplete records. **Never invent data**: unparseable/ambiguous rows go to a `Migration Review Required` state (reuse `metadata` flag + a report), surfaced in the admin data-quality dashboard (§64).

**Dual-write / compatibility:** during Phase 4–7 keep `products.store_id` and existing `/products`, `/search` endpoints working (canonical `storeId` = publishing contributor). The buyer PDP and cart continue on `variantId`; `offerId` is additive. Legacy `Merchant → Product` remains readable until a deliberate cutover once Offers are fully populated.

**Risks & mitigations**
- **Variant combination uniqueness** may reject existing duplicates → run detection query first; resolve/review before adding the unique index.
- **Price on Offer vs price_tiers:** avoid double source of truth — Offer references the existing tier machinery (offer→price_list link) rather than re-storing every tier; base `price_minor` is the fallback.
- **JSONB `attributes` heterogeneity:** back-fill is best-effort; anything that can't map to an `attribute_definition` is preserved verbatim in a staging column so no data is lost.
- **Order integrity:** `order_items.variant_id` is NOT removed; historical snapshots (`sku`, `unitPriceMinor`, `title`) stay authoritative.
- **Cart:** cart is keyed by `variantId + storeId` today (natural de-facto offer); formalize to `offerId` later without breaking existing carts.

---

## E. Recommended sequencing & decision points before coding

1. **Confirm scope of "merchant creates product."** Does the business want merchants to *propose* canonical products (admin-approved) or only *attach offers* to pre-approved canonical products? This determines whether `products.store_id` becomes nullable immediately or after governance UI exists.
2. **Confirm Offer/price unification** with the existing `price_lists`/`price_tiers` (B2B tiers already work). Proposal: Offer owns commercial *terms* + base price; quantity tiers remain in `price_tiers` linked to the offer's store.
3. **Seed a fallback Product Type per category** so every existing product has a valid template on migration day.
4. Only after Phases 2–4 land green, build Admin Type Builder (Phase 6), then dynamic Merchant wizard (Phase 7), then Buyer selector/offer-comparison (Phase 8), then template-driven facets (Phase 9).

**No code was changed.** Awaiting go-ahead to begin PHASE 2 (domain model: `attribute_definitions`, `attribute_options`, `product_types`, `product_type_attributes` as additive, non-breaking migrations `0023`–`0024`).
