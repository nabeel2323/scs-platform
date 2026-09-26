# Backend Extension Spec — Search Filters, Notification Read-Filter & Inventory Labels

**Status:** FOR IMPLEMENTATION (backend owner)
**Author:** Mobile/UI parity workstream
**Date:** 2026-09-26
**Related:** `MOBILE-WEB-PARITY-AUDIT.md` §6 Backend Gap Register — **BG-3** (search filters), **BG-5** (notification status); §4.5 **row 198** (inventory labels)

---

## 0. Why this exists

Two mobile (and web) features are **BACKEND LIMITED** — the client cannot ship them
truthfully because the API rejects or ignores the needed query params. Per the
spec's "no fabricated data / no client-side fakery" rule, the mobile app currently:

- **Search:** offers only brand + category + attribute filters + pagination. Price /
  in-stock / verified-seller / sort are **omitted** (they cannot be honoured server-side).
- **Notifications:** ALL / UNREAD / READ tabs can only filter the **already-fetched page**
  client-side, which is wrong across pagination.

The web search page (`apps/web/src/app/search/page.tsx`) already renders `pmin`, `pmax`,
`verified`, `instock`, `sort` controls but applies them **client-side after fetch** for the
same reason. Once the params below exist, **both** web and mobile move filtering server-side.

This spec is **contract-first** and names the exact real tables/columns and insertion
points verified in the codebase, so it can be implemented without re-discovery.

**Response shapes MUST stay unchanged** — these are additive query-param filters only.

---

## 1. Endpoint A — `GET /v1/notifications` read-filter  ✅ LOW RISK / HIGH VALUE (do first)

### 1.1 Current state (verified)
- Controller: `apps/api/src/modules/notifications/notifications.controller.ts` L23-34 — `list()` accepts **only** `limit`, `offset`.
- Service: `apps/api/src/modules/notifications/notifications.service.ts` L398 `listNotifications(userId, limit=50, offset=0)` — `where(and(eq(userId), eq(channel,'IN_APP')))` L400-409.
- Schema: `apps/api/src/modules/notifications/notifications.schema.ts`:
  - **`readAt` timestamp (L26)** ← read-state. `NULL` = unread, non-null = read.
  - **`status` varchar (L21, default 'PENDING')** ← **delivery** state (PENDING/SENT/…). **DO NOT** use this for the read filter.

> ⚠️ **Critical:** the audit called this a "`status` param", but the correct column is
> **`readAt`**. Using the existing `status` column would filter by delivery lifecycle, not
> read/unread, and silently return wrong sets.

### 1.2 New query param
| Param | Type | Values | Default | Meaning |
|-------|------|--------|---------|---------|
| `read` | string enum | `all` \| `unread` \| `read` | `all` | Filter by read-state. |

(Chosen name `read` to avoid collision with the existing `status` delivery column. If you
prefer `status=UNREAD|READ|ALL` for client symmetry, that is acceptable **only** if it maps
to `readAt`, never to the `status` column — document it loudly.)

### 1.3 Implementation
**Controller** (`notifications.controller.ts` `list()`):
```ts
@Get('notifications')
async list(
  @CurrentUser() user: { sub: string },
  @Query('limit') limit?: string,
  @Query('offset') offset?: string,
  @Query('read') read?: 'all' | 'unread' | 'read',   // NEW
) {
  return this.notificationsService.listNotifications(
    user.sub,
    limit ? parseInt(limit, 10) : 50,
    offset ? parseInt(offset, 10) : 0,
    read ?? 'all',                                    // NEW
  );
}
```
**Service** (`notifications.service.ts` `listNotifications`): add the predicate inside the
existing `and(...)` (keep `channel='IN_APP'`):
```ts
async listNotifications(userId: string, limit = 50, offset = 0, read: 'all'|'unread'|'read' = 'all') {
  const conds = [ eq(notifications.userId, userId), eq(notifications.channel, 'IN_APP') ];
  if (read === 'unread') conds.push(isNull(notifications.readAt));
  if (read === 'read')   conds.push(isNotNull(notifications.readAt));
  return this.db.db.select().from(notifications)
    .where(and(...conds))
    .orderBy(desc(notifications.createdAt))
    .limit(limit).offset(offset);
}
```
(`isNull` / `isNotNull` from `drizzle-orm`.)

**Also update** `unread-count` only if you want a matching `read` param there — not required.

### 1.4 Acceptance
- `GET /v1/notifications?read=unread` → only rows with `read_at IS NULL`.
- `?read=read` → only rows with `read_at IS NOT NULL`.
- `?read=all` / omitted → identical to today (no behaviour change).
- Invalid value → ignore (treat as `all`) or 400; pick one and document.

---

## 2. Endpoint B — `GET /v1/search` filters  ⚠️ MEDIUM (tiered)

### 2.1 Current state (verified)
- Controller: `apps/api/src/modules/catalog/catalog.controller.ts` L381-403 `search()` — accepts `q, storeId, categoryId, brandId, limit, offset, attrFilters` only.
- Service: `apps/api/src/modules/catalog/search.service.ts` L38 `search(query, options)`. **Two code paths — filters MUST be added to BOTH:**
  1. **Empty-query path** (L40-98): Drizzle `products.findMany({ where: and(...conditions, attrSql) })`, plus a parallel **count** query (L61-64) that must get the **same** predicates.
  2. **Text-query path** (L100+): **raw SQL** trigram/FTS (`SELECT p.* FROM products p …`, attr filter via `buildRawAttrFilter` L172), also with a parallel count query.
- Options type: `search.service.ts` L433 `interface SearchOptions` — extend it.

### 2.2 Relevant real schema
| Table | File | Columns used |
|-------|------|--------------|
| `products` (`p`) | `catalog.schema.ts` L56 | `status` (L79, `'ACTIVE'`), `isAvailable` (L81, bool), `storeId` (L61, **nullable** — canonical products may have no owning store), `categoryId`, `brandId`, `createdAt` |
| `merchant_offers` (`mo`) | `catalog.offer.schema.ts` L39 | `product_id`, `variant_id`, `store_id` (L41), `status` (`'ACTIVE'`), `base_price_minor`, `currency`, `moq`, `lead_time_days` |
| `stores` (`s`) | `merchant.schema.ts` L13 | `verificationStatus` → **`verification_status`** (L25, `'VERIFIED'`), `status` |

> ⚠️ **Products carry no price.** Displayed/effective price lives on **`merchant_offers.base_price_minor`**.
> A product is a match for a price band if it has **≥1 ACTIVE offer** whose `base_price_minor` is in range.
> **Currency caveat:** offers have a `currency` column; a numeric min/max is only meaningful
> within one currency. Either (a) scope price filters to a `currency` param (default `SAR`),
> or (b) document that mixed-currency results are compared on raw minor units. Recommend (a).

### 2.3 New query params
| Param | Type | Default | Semantics | Tier |
|-------|------|---------|-----------|------|
| `inStock` | bool (`true`) | — | `p.is_available = true` | **A (simple)** |
| `verified` | bool (`true`) | — | product has ≥1 ACTIVE offer from a store with `verification_status='VERIFIED'` | **C (join)** |
| `minPrice` | int (minor units) | — | ≥1 ACTIVE offer with `base_price_minor >= minPrice` | **B (subquery)** |
| `maxPrice` | int (minor units) | — | ≥1 ACTIVE offer with `base_price_minor <= maxPrice` | **B (subquery)** |
| `currency` | char(3) | `SAR` | scopes `minPrice`/`maxPrice` to one currency | **B** |
| `sort` | enum | `relevance`/`newest` | `relevance` (text path FTS score) · `newest` (`p.created_at DESC`, today's default) · `price_asc` · `price_desc` | **B/C** |

All params are **optional**; omitting them reproduces today's behaviour exactly.

### 2.4 Implementation guidance

**Controller** (`catalog.controller.ts` `search()`) — add `@Query` params and forward into the
options object passed to `searchService.search(q, { … })`. Parse ints; ignore malformed.

**`SearchOptions`** (L433) — add: `inStock?: boolean; verified?: boolean; minPriceMinor?: number;
maxPriceMinor?: number; currency?: string; sort?: 'relevance'|'newest'|'price_asc'|'price_desc';`

**Empty-query Drizzle path (L43-64):**
```ts
if (options?.inStock) conditions.push(eq(products.isAvailable, true));
// price / verified need EXISTS subqueries (see SQL below) pushed into `conditions`
// (they work in Drizzle via sql`EXISTS (...)`), and MUST also be added to the count query L61-64.
```

**Text-query raw-SQL path (L172+):** add the same predicates to the `WHERE` of **both** the
rows query and the count query:
```sql
-- inStock
AND p.is_available = true

-- minPrice / maxPrice (single-currency scoped)
AND EXISTS (
  SELECT 1 FROM merchant_offers mo
  WHERE mo.product_id = p.id
    AND mo.status = 'ACTIVE'
    AND mo.currency = $currency
    AND mo.base_price_minor >= $minPrice     -- omit clause if param absent
    AND mo.base_price_minor <= $maxPrice     -- omit clause if param absent
)

-- verified merchant
AND EXISTS (
  SELECT 1 FROM merchant_offers mo
  JOIN stores s ON s.id = mo.store_id
  WHERE mo.product_id = p.id
    AND mo.status = 'ACTIVE'
    AND s.verification_status = 'VERIFIED'
)
```

**Sorting:**
- `newest` → `ORDER BY p.created_at DESC` (current default on empty-query path).
- `relevance` → keep existing FTS/trigram score ordering (text path only). On the empty-query
  path `relevance` has no score — fall back to `newest`.
- `price_asc` / `price_desc` → order by the product's **best ACTIVE offer** price:
```sql
ORDER BY (
  SELECT MIN(mo.base_price_minor) FROM merchant_offers mo
  WHERE mo.product_id = p.id AND mo.status = 'ACTIVE'
    AND ($currency IS NULL OR mo.currency = $currency)
) ASC   -- or DESC for price_asc → price_desc
NULLS LAST
```
(In the Drizzle empty-query path, use a `sql` template in `orderBy`, or switch that path to
raw SQL for price sorts.)

> ⚠️ **Both paths, both queries.** The #1 way this ships broken is filtering the rows query but
> not the **count** query (pagination total then lies), or adding to one path but not the other.

### 2.5 Acceptance
- Each param in isolation narrows results and the returned `total` matches the filtered count.
- Combining `q` + `minPrice`/`maxPrice` + `inStock` + `verified` + `sort=price_asc` returns a
  correctly ordered, correctly counted set.
- Omitting all new params → byte-identical behaviour to today (regression guard).
- Cross-currency: with `currency=SAR`, offers in other currencies are excluded from the price band.

---

## 2C. Endpoint C — `GET /v1/stores/:storeId/inventory` label projection  ⚠️ LOW/MED (row 198)

### 2C.1 Current state (verified)
- Service: `apps/api/src/modules/inventory/inventory.service.ts` `listByStore(storeId, paging)` **L123-139** returns **raw** `inventoryItems.findMany(...)` rows — columns `id, variantId, warehouseId, qtyOnHand, qtyReserved, reorderPoint, maxStock, lowStockAlert` only. **No** variant/product join.
- `getLowStockItems(warehouseId?, caller?)` **L92-119** (backs `GET /v1/inventory/low-stock`) returns the **same** raw shape.
- Consequence: the mobile inventory list can only render `Variant <uuid-prefix>` (`mobile/lib/screens/merchant/inventory_screen.dart` L286) because the payload carries no human label. Audit **row 198**.

### 2C.2 Requested change (additive projection)
Enrich each returned inventory row with three **nullable** label fields, resolved via
`inventory_items.variantId → product_variants.id` (`sku`, `title`, `productId`) `→ products.id` (`title`):

| Field | Source | Nullable |
|-------|--------|----------|
| `variantSku` | `product_variants.sku` | yes (variant row missing) |
| `variantTitle` | `product_variants.title` | yes |
| `productTitle` | `products.title` (via `product_variants.productId`) | yes |

This is the **same join** `catalog.offer.service.ts listOfferAnalytics` (L386-429) already performs
to label analytics rows (variant `sku`/`title` + product `title`), so the pattern is proven in-repo.

> Keep every existing column and the `{ data, total }` envelope unchanged — **add** the three
> keys only. Do not rename `variantId`. Use a batched `WHERE id IN (…)` lookup (like the analytics
> merge) to avoid N+1.

### 2C.3 Acceptance
- `GET /v1/stores/:id/inventory` rows include `variantSku` / `variantTitle` / `productTitle`
  (null when the variant or product is gone), alongside all current columns.
- `GET /v1/inventory/low-stock` rows carry the same three labels (optional, but recommended for a
  consistent client model).
- No change to counts, paging, tenant scoping, or permissions.

### 2C.4 Mobile follow-up (not blocked)
Once landed, extend the mobile `InventoryItem` model with the three nullable fields and render
`productTitle` (+ `variantSku`) instead of `Variant <uuid>`. Until then the app ships truthfully
with the uuid label — **no fabricated names**.

---

## 3. Priority & sequencing

| # | Change | Risk | Value | Notes |
|---|--------|------|-------|-------|
| 1 | **Notifications `read` filter** (§1) | Low | High | Single-column predicate on `readAt`. Ship first. |
| 2 | **Search `inStock`** (§2, Tier A) | Low | Med | Single-column predicate on `products.is_available`. |
| 3 | **Search `verified`** (§2, Tier C) | Med | Med | EXISTS over `merchant_offers`→`stores`. |
| 4 | **Search `minPrice`/`maxPrice`/`currency`** (§2, Tier B) | Med | High | EXISTS over `merchant_offers`; must scope currency. |
| 5 | **Search `sort`** (§2) | Med | High | `price_*` needs best-offer subquery in `ORDER BY`. |
| 6 | **Inventory label projection** (§2C, row 198) | Low/Med | Med | Join `product_variants`+`products`; same pattern as `listOfferAnalytics`. |

---

## 4. What the mobile client will do once these land

(Tracked in `MOBILE-WEB-PARITY-AUDIT.md` §8 — Phase 2 search, Phase 3 notifications.)

- **Notifications:** replace the client-side ALL/UNREAD/READ window filter with
  `GET /v1/notifications?read=unread|read|all` per tab (+ paging). Removes the BG-5 caveat.
- **Search:** add price range, in-stock toggle, verified-seller toggle, and a sort control to
  the search filter sheet, passing `minPrice`/`maxPrice`/`currency`/`inStock`/`verified`/`sort`
  to `GET /v1/search`. Removes the BG-3 caveat and the web page's client-side filtering.
- **Inventory (row 198):** render `productTitle` + `variantSku` instead of `Variant <uuid>` once
  `GET /v1/stores/:id/inventory` (and `/v1/inventory/low-stock`) project the labels (§2C).

**No mobile code changes are blocked on this** — the app ships truthfully today by *omitting*
these controls. This spec only unlocks the enhanced versions.

---

## 5. Out of scope (do NOT change here)
- No change to response DTOs, auth, guards, or tenant scoping.
- No change to the FTS/trigram ranking algorithm beyond adding the `sort` options.
- Variant-level *quantity* stock aggregation (warehouse sums) is a separate, heavier feature;
  `inStock` here intentionally maps to the existing `products.is_available` flag only.
