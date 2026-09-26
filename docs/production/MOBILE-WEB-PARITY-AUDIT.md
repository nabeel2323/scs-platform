# SCS Marketplace — Mobile ↔ Web Feature-Parity Audit (PHASE 0)

**Document:** `docs/production/MOBILE-WEB-PARITY-AUDIT.md`
**Created:** 2026-09-26
**Phase:** 0 — Full Repository Audit (mandatory gate before any UI transformation)
**Companion:** `docs/production/CAPABILITY-MATRIX.md` (2026-09-25), `docs/production/SCS-HUMAN-UAT-GUIDE.html`
**Method:** Direct source inspection only. Every status below is backed by a file read or grep of the actual repository. Nothing is assumed. Where this audit disagrees with `CAPABILITY-MATRIX.md`, the disagreement is called out explicitly and resolved against source.

---

## 0. Scope & Repository Layout

The monorepo contains **two copies** of the platform. Only one is live:

| Path | Status |
|------|--------|
| `scs-platform/mobile/` | **LIVE** Flutter app (79 Dart files, 27 screens) |
| `scs-platform/apps/web/` | **LIVE** Next.js buyer + merchant web (34 real pages) |
| `scs-platform/apps/api/` | **LIVE** NestJS backend (19 controllers) |
| `scs-platform/apps/admin/` | **LIVE** Admin console (out of mobile scope — Admin roles are console-only) |
| `scs-platform/apps/scs-platform-b2-test/` | **STALE duplicate — IGNORED** for this audit (older snapshots of mobile/web/api) |

Counts verified by glob:
- Flutter screens: **27** (`mobile/lib/screens/**`)
- Flutter routes registered: **24** (`mobile/lib/router/router.dart`)
- Web pages (buyer + merchant): **34** (`apps/web/src/app/**/page.tsx`)
- API controllers: **19** (`apps/api/src/modules/**/*.controller.ts`)
- Mobile API client methods: **~70** (`mobile/lib/services/api_service.dart`, 920 lines)
- Mobile Riverpod providers: **34** (`mobile/lib/providers/providers.dart`, 190 lines)

---

## 1. Flutter Application Audit

### 1.1 Architecture (must remain intact)

| Concern | Finding | Evidence |
|---------|---------|----------|
| Flutter root | `scs-platform/mobile/` | `pubspec.yaml` name `scs_platform` |
| Entry point | `lib/main.dart` (20 lines) → `lib/core/app.dart` | glob |
| **State management** | **Riverpod** (`flutter_riverpod ^2.5.1`) — hand-written providers, no codegen in use | `providers.dart`; `riverpod_annotation`/`riverpod_generator` declared but unused |
| Routing | `go_router ^14.2.0`, `Provider<GoRouter>` with a `redirect` guard | `router/router.dart` |
| HTTP client | `Dio ^5.4.3+1` wrapped by `mobile_core`'s `ApiClient` (JWT interceptor + auto-refresh) | `api_service.dart`; `providers.dart` L11-17 |
| Secure storage | `flutter_secure_storage ^9.0.0` via `mobile_core`'s `AuthStorage` | `packages/mobile-core/lib/src/auth_storage.dart` |
| Auth model | Dual: phone OTP **and** email/password + device trust | `api_service.dart` L34-108 |
| Realtime | `socket_io_client ^2.0.3+1` → `services/realtime_service.dart` (143 lines) | order + notification push |
| Push | `firebase_messaging` + `flutter_local_notifications` → `push_notification_service.dart` | `login_screen` init |
| Models | Single hand-written barrel `models/models.dart` (1122 lines), manual `fromJson` | glob |
| Theme | `core/theme.dart` → `TaifTokens` (colors/spacing/radius/shadow/fonts) + Material `ThemeData` | `theme.dart` (55 lines) |
| Reusable widgets | `widgets/common_widgets.dart` (397 lines): `StatusBadge`, `EmptyState`, `LoadingSpinner`, `ErrorBanner`, `ProductCard`, `QuantityStepper`, `TierLadder` | read in full |
| Localization | `flutter_localizations` + `generate: true`; `intl ^0.20.3`; profile has `locale` (ar/en) | `pubspec.yaml`; `profile_screen.dart` L178-189 |
| Barcode | `mobile_scanner ^6.0.2` wired into search | `search_screen.dart` L219-294 |
| Image caching | `cached_network_image ^3.3.1` **declared but NOT used** — screens call `Image.network` directly | `pubspec.yaml` L23 vs `product_detail_screen.dart` L227, `merchant_catalog_screen.dart` L227 |
| Skeletons | `shimmer ^3.0.0` **declared but NOT used** — all loading states are `CircularProgressIndicator` | `pubspec.yaml` L24; `common_widgets.dart` L84-89 |

**Conclusion:** The architecture is **Riverpod + go_router + Dio**, clean and appropriate. Per the spec ("do not replace the architecture without a concrete technical reason"), **no architecture change is warranted**. Two purchased-but-unused capabilities (`cached_network_image`, `shimmer`) are already available for Phase 1/5 without new dependencies.

### 1.2 Design tokens (baseline for Phase 1)

`TaifTokens` already mirrors the web `ui-kit` tokens: brandPrimary `#174A5B`, brandSecondary `#0F3340`, brandAccent `#C98A2D`; semantic ok/warn/err/info; ink/muted/surface/bg/line; spacing `sp4–sp32`; radius `sm6/md10/lg14`; shadows `sm/md/lg`; fonts `Inter` + `IBMPlexSansArabic`. This is a solid seed for the `AppColors/AppSpacing/AppRadius/AppElevation/AppTypography` components the spec requests — Phase 1 should **wrap and extend** these, not replace them.

### 1.3 Navigation model (current)

- **No bottom navigation.** Home is a scrollable grid of `_navCard` launchers (`home_screen.dart` L143-178). The spec's preferred buyer model (Home / Search / Cart / Orders / Account) and merchant model (Dashboard / Orders / Catalog / Inventory / Account) are **not implemented** as persistent nav.
- Route guard (`router.dart` L42-73): unauthenticated → `/login`; merchant routes require `MERCHANT_OWNER`/`MERCHANT_STAFF` (except `/merchant/register`); `/driver` always redirects to `/home`.
- **Role leakage in UI:** Home renders "Merchant Dashboard" and "Merchant Orders" cards to **every** user regardless of role (`home_screen.dart` L164-170). The route guard bounces a buyer, but the cards are visible — a UX/permission-presentation defect.

---

## 2. User Roles & Permissions

Roles verified from `CAPABILITY-MATRIX.md` §15/§17.3 and `router.dart`. **No `DRIVER` role exists in the backend** (BG-1); mobile `driver_dashboard_screen.dart` is dead scaffolding, correctly hidden by the router.

| Role | Surface | Mobile access | Route protection | API authorization |
|------|---------|---------------|------------------|-------------------|
| `SUPER_ADMIN` / `ADMIN` / `MODERATOR` | Admin console only | **Not applicable** to mobile | n/a | `PermissionsGuard` + `admin:*` perms |
| `MERCHANT_OWNER` | Web merchant + Mobile | Merchant screens | `router.dart` L62-66 role check | `JwtAuthGuard` + tenant scope |
| `MERCHANT_STAFF` | Web merchant + Mobile | Merchant screens | same | same (staff-scoped perms) |
| `BUYER` | Web buyer + Mobile | Buyer screens | default | `JwtAuthGuard` |
| `DRIVER` | **Does not exist** | Hidden | `/driver` → `/home` | none |

**Org/store isolation:** enforced server-side (`tenant-scope.ts`); mobile sends the re-minted token from `/v1/auth/switch-org` (`api_service.dart` L198-201). Mobile merchant screens resolve the store via `activeStoreProvider` = first store of the active org (`providers.dart` L123-130) — **single-store assumption**; multi-store orgs cannot pick a store on mobile.

---

## 3. Web Capability Inventory (source of truth for parity)

### 3.1 Buyer Web (`apps/web/src/app/`)

`page.tsx` (home), `search/`, `products/[id]/` (PDP), `compare/`, `stores/`, `stores/[slug]/`, `cart/`, `checkout/`, `orders/`, `orders/[id]/`, `favorites/`, `saved-suppliers/`, `notifications/`, `reviews/`, `account/`, `auth/login/`, `profile/credentials/`, `profile/sessions/`.

### 3.2 Merchant Web (`apps/web/src/app/merchant/`)

`page.tsx` (dashboard), `catalog/`, `catalog/product/[id]/`, `product-studio/`, `offers/`, `inventory/`, `pricing/`, `promotions/`, `orders/`, `orders/[id]/`, `customers/`, `store/`, `warehouses/`, `organization/`, `requests/`, `import/`, `onboard/`, `register/`, `success/`.

---

## 4. Web → Mobile Parity Matrix

Statuses: `IMPLEMENTED` · `PARTIALLY IMPLEMENTED` · `MISSING` · `BACKEND LIMITED` · `NOT APPLICABLE`.
"API" column = the backend endpoint the capability needs. "Mobile API" = whether `api_service.dart` already has a method for it (decides whether a gap is UI-only or needs a new client method).

### 4.1 Identity, Org & Account

| Capability | Web Route/Feature | Mobile Route/Feature | API | Current Status | Required Action |
|-----------|-------------------|----------------------|-----|----------------|-----------------|
| OTP login | `auth/login` | `/login` `login_screen` | `POST /v1/auth/otp/*` | IMPLEMENTED | Keep; restyle in Phase 2 |
| Password login + device trust | `auth/login` | `/login` | `POST /v1/auth/login/password` | IMPLEMENTED | Keep |
| Token refresh | `authFetch` | Dio interceptor | `POST /v1/auth/refresh` | IMPLEMENTED | Keep |
| Session persistence (keep logged in) | cookie/localStorage | `AuthStorage` + `sessionRestorationProvider` | — | IMPLEMENTED | Fixed this cycle; verify cold start |
| Profile view/edit | `account` | `/profile` | `GET/PATCH /v1/me` | IMPLEMENTED | Restyle |
| Credential setup | `profile/credentials` | `/profile/credentials` | `POST /v1/me/credentials/setup` | IMPLEMENTED | Keep |
| Change password | `account` | `/profile/change-password` | `POST /v1/me/credentials/change-password` | IMPLEMENTED | Keep |
| Sessions list/revoke | `profile/sessions` | `/profile/sessions` | `GET /v1/me/sessions` | IMPLEMENTED | Keep |
| Org list / switch | `switchOrg` | `/organizations` + `/organizations/:id` | `POST /v1/auth/switch-org` | IMPLEMENTED | Fixed this cycle (immediate UI reflect) |
| Org member management | `merchant/organization` | `/organizations/:id` | `GET/POST/DELETE /v1/organizations/:id/members` | IMPLEMENTED | Keep |
| Structured Account hub | `account` (tabs) | **profile only** | — | PARTIALLY IMPLEMENTED | Add Account hub: orders/favorites/saved-suppliers/notifications/store/settings (§37) |

### 4.2 Discovery: Home, Search, Catalog, Stores

| Capability | Web Route/Feature | Mobile Route/Feature | API | Mobile API? | Current Status | Required Action |
|-----------|-------------------|----------------------|-----|-------------|----------------|-----------------|
| Home commerce sections | `page.tsx` (products/deals) | `/home` nav-card launcher | search/recommendations | partial | PARTIALLY IMPLEMENTED | Add real-data sections (categories, popular, suppliers) — only if API-backed (§14); no fake recs |
| Full-text search | `search/` | `/search` | `GET /v1/search` | ✅ `search()` | IMPLEMENTED | Keep debounce; add states |
| Category filter | `search/` multi-category | `/search` chips | `GET /v1/search/categories` | ✅ | IMPLEMENTED | Keep |
| **Brand filter** | `search/` brand facet | **state only, no UI** | `GET /v1/search/brands` | ✅ `fetchBrands()` + `brandsProvider` | **MISSING (UI)** | Wire brand chips/sheet — provider already exists (`search_screen.dart` L22/L39 unused) |
| **Price range filter** | `search/` min/max | — | `GET /v1/search` accepts only `q,storeId,categoryId,brandId,limit,offset,attrFilters` (`catalog.controller.ts` L381-403) | ❌ no backend param | **BACKEND LIMITED** | Backend must add `minPrice/maxPrice` before mobile can filter server-side; DEFER mobile UI until then |
| **In-stock filter** | `search/` toggle | — | same — no `inStock` param | ❌ no backend param | **BACKEND LIMITED** | Backend param required; DEFER |
| **Verified-merchant filter** | `search/` toggle | — | same — no `verified` param | ❌ no backend param | **BACKEND LIMITED** | Backend param required; DEFER |
| Attribute facets | `search/` dynamic facets | `/search` facet chips (COS-15) | `GET /v1/search/facets` | ✅ (in `SearchResult.facets`) | IMPLEMENTED | Keep; move into filter sheet |
| Sorting | `search/` sort dropdown | — | `GET /v1/search` — no `sort` param (verified L381-403) | ❌ no backend param | **BACKEND LIMITED** | Backend param required; DEFER mobile sort until added |
| Pagination / infinite scroll | `search/` URL-backed | `limit:30` hardcoded, no paging | `?limit&offset` | ✅ params exist | PARTIALLY IMPLEMENTED | Add load-more/`ListView.builder` paging |
| Filter bottom sheet + active chips | `search/` panel | — | — | n/a | MISSING | Build mobile filter sheet (§15) |
| Barcode scan search | — (n/a on web) | `/search` scanner | `GET /v1/search?q=<code>` | ✅ | IMPLEMENTED (mobile-only strength) | Keep |
| **Product compare page** | `compare/` (max 4) | — | client-side | ❌ | MISSING | Decide: implement compare or DEFER with reason (§6) |
| PDP core | `products/[id]/` | `/products/:id` | `GET /v1/products/:id` | ✅ | IMPLEMENTED | Restyle hierarchy (§17) |
| Variant selection (dynamic) | `products/[id]` VariantSelector | `/products/:id` matrix chips | `GET /v1/products/:id/variant-matrix` | ✅ | **PARTIALLY IMPLEMENTED** | `_isOptionAvailable()` is a **stub returning `true`** (`product_detail_screen.dart` L99-106); selecting dims does **not** update price/stock/SKU/image (§19) |
| Offer comparison + ranked badges | `OfferComparisonTable` | `/products/:id` offer cards | `GET /v1/products/:id/offers(/ranked)` | ✅ | IMPLEMENTED | Keep; polish cards (§20) |
| **Image gallery (swipe/zoom/thumbs)** | `products/[id]` gallery+zoom | **single `Image.network`, h180** | `GET /v1/products/:id/media` | ✅ `listMedia()` + `productMediaProvider` | PARTIALLY IMPLEMENTED | Build gallery w/ `cached_network_image`; provider already exists (§18) |
| Rating/reviews on PDP | `products/[id]` reviews | — | `GET /v1/stores/:id/reviews` | ✅ `fetchStoreReviews()` (unused) | MISSING | Surface reviews on PDP |
| Related products | `products/[id]` | — | search by category | ✅ | MISSING (optional) | Only if API-backed; else DEFER |
| Stores list | `stores/` | `/stores` | `GET /v1/stores` | ✅ | PARTIALLY IMPLEMENTED | No search/filter/save action; basic tiles |
| Store detail (branding) | `stores/[slug]/` (header, reviews, save) | `/stores/:id` **products only** | `GET /v1/stores/:id` | ✅ `fetchStore()` (unused on screen) | PARTIALLY IMPLEMENTED | Add store header, verified badge, reviews, save-supplier (§35) |

### 4.3 Cart, Checkout, Orders

| Capability | Web Route/Feature | Mobile Route/Feature | API | Mobile API? | Current Status | Required Action |
|-----------|-------------------|----------------------|-----|-------------|----------------|-----------------|
| Add to cart (offer-attributed) | `cart/` | PDP/search/store | `POST /v1/cart/items` | ✅ | IMPLEMENTED | Fixed this cycle (DTO validation) |
| Cart multi-supplier grouping | `cart/` grouped | `/cart` grouped by store | `GET /v1/cart` | ✅ | IMPLEMENTED | Keep |
| Update qty / remove / clear | `cart/` | `/cart` | `PATCH/DELETE /v1/cart/items/:id` | ✅ | IMPLEMENTED | Use `QuantityStepper` + MOQ floor (currently raw ± buttons) |
| Cart validation (stale/repriced) | `cart/` warnings | `/cart` banners | `POST /v1/cart/validate` | ✅ | IMPLEMENTED | Keep |
| **Promo code at cart/checkout** | `cart/` promo input | — | `POST /v1/cart/promo` | ✅ `applyPromo()` (unused) | MISSING (UI) | Wire promo input |
| Checkout idempotency | `checkout/` UUID | `/checkout` UUID | `POST /v1/checkout` | ✅ | IMPLEMENTED | Keep |
| Fulfillment method | `checkout/` selection | `/checkout` radio group | checkout body | ✅ | IMPLEMENTED | Keep |
| **Checkout review step + merchant breakdown** | `checkout/` review | **single form, no review** | — | n/a | MISSING | Add Address→Fulfillment→Review→Confirmation (§22) |
| **Hardcoded placeholder address** | user address book | `'123 Main St'`/`'Riyadh'` defaults | — | n/a | **DEFECT** | Remove fabricated defaults (`checkout_screen.dart` L15-16); §22 forbids fake data |
| Delivery/tax display | `checkout/` (BG-2 zero) | order detail rows | order pricing | ✅ | BACKEND LIMITED | Show actual API values + "invoiced on delivery" note (BG-2) |
| Order list (buyer) | `orders/` + status filter | `/orders` | `GET /v1/orders` | ✅ | PARTIALLY IMPLEMENTED | Add status filter tabs (§24); compact rich cards |
| Order detail + financials | `orders/[id]/` | `/orders/:id` | `GET /v1/orders/:id` | ✅ | IMPLEMENTED | Keep |
| Order status timeline | `orders/[id]` timeline | `/orders/:id` history dots | `GET /v1/orders/:id/history` | ✅ | PARTIALLY IMPLEMENTED | Upgrade to proper vertical timeline (§25); never mark future done |
| Order cancel (buyer) | `orders/[id]` cancel | `/orders/:id` popup menu | `POST /v1/orders/:id/cancel` | ✅ | **IMPLEMENTED** | **Matrix says "—" — WRONG.** Present at `order_detail_screen.dart` L70-93. Add FSM guard (only cancellable statuses) + confirm dialog |
| Order reorder | `orders/[id]` reorder | `/orders/:id` button | `POST /v1/orders/master/:id/reorder` | ✅ | **IMPLEMENTED** | **Matrix says "—" — WRONG.** Present L165-202 with partial-result summary |
| Realtime order status | `orders/[id]` `watchOrder` | `/orders/:id` socket | realtime gateway | ✅ | IMPLEMENTED | Keep (BG-4: not E2E verified) |
| Dispute create (from order) | `orders/[id]` dispute | **only via `/reviews` manual form** | `POST /v1/orders/:id/dispute` | ✅ | PARTIALLY IMPLEMENTED | Add "Open dispute" on order detail with order context (§33) |

### 4.4 Reviews, Disputes, Notifications, Favorites

| Capability | Web Route/Feature | Mobile Route/Feature | API | Mobile API? | Current Status | Required Action |
|-----------|-------------------|----------------------|-----|-------------|----------------|-----------------|
| Reviews list | `reviews/` | — | `GET /v1/stores/:id/reviews` | ✅ `fetchStoreReviews()` (unused) | MISSING | Add reviews list (PDP + store) |
| Review create | `reviews/` from order | `/reviews` **manual Order ID + Subject ID text fields** | `POST /v1/orders/:id/review` | ✅ | **PARTIALLY IMPLEMENTED (poor UX)** | Drive from order context; remove raw UUID entry (`reviews_disputes_screen.dart` L106-107) |
| Review eligibility | `reviews/` gated | — | order completion | ✅ | MISSING | Gate to delivered/completed orders |
| Disputes list | `reviews/` tab | — | `GET /v1/disputes` | ✅ `fetchDisputes()` (unused) | MISSING | Add disputes list + detail |
| Dispute detail + evidence + timeline | `orders/[id]` | — | `GET /v1/disputes/:id`, `/events`, `POST /evidence`, `/response`, `PATCH /resolve` — **all exist** (`disputes.controller.ts` L38-68) | ❌ no mobile method | **MISSING (mobile client)** | Backend is COMPLETE; add mobile client methods + read-only detail/evidence UI |
| Dispute create | `orders/[id]` | `/reviews` manual Order ID | `POST /v1/orders/:id/dispute` | ✅ | PARTIALLY IMPLEMENTED | Same as above — context-driven |
| Notifications list | `notifications/` | `/notifications` | `GET /v1/notifications` | ✅ | IMPLEMENTED | Keep |
| Mark read / all read | `notifications/` | `/notifications` | `PATCH /v1/notifications/*` | ✅ | IMPLEMENTED | Keep |
| **Notification filter tabs** | ALL/UNREAD/READ | — | `GET /v1/notifications?status` | ❌ param absent | MISSING | Add tabs (client-side filter or API param) |
| **Date grouping (Today/Yesterday/Earlier)** | `notifications/` | — | — | n/a | MISSING | Group list (§36) |
| Notification deep-link target | `notifications/` nav | tap only marks read | payload target | partial | MISSING | Navigate on tap using notification payload |
| Realtime notification push | `onNotification` | `/notifications` socket | realtime gateway | ✅ | IMPLEMENTED | Keep (BG-4) |
| **Favorites / wishlist** | `favorites/` | **none** | `GET/POST/DELETE /v1/me/favorites` | ❌ no method | **MISSING** | Add api methods + provider + screen + PDP/card toggle (§35) |
| **Saved suppliers** | `saved-suppliers/` | **none** | `GET /v1/me/saved-suppliers` | ❌ no method | **MISSING** | Add api methods + provider + screen + store save action (§35) |

### 4.5 Merchant Operations

| Capability | Web Route/Feature | Mobile Route/Feature | API | Mobile API? | Current Status | Required Action |
|-----------|-------------------|----------------------|-----|-------------|----------------|-----------------|
| Merchant dashboard **metrics** | `merchant/` KPIs | `/merchant` **nav-card hub, zero KPIs** | `GET /v1/merchant/offers/analytics` + `/analytics/trend` (revenue/units), `checkLowStock`, order counts — components exist, no single aggregate | ✅ partial (offer analytics unused) | PARTIALLY IMPLEMENTED | Build KPIs from existing analytics + low-stock + order-count endpoints (§29); no fabricated numbers |
| Merchant registration/onboarding | `merchant/register`,`onboard` | `/merchant/register` (871 lines) | `POST /v1/merchant/*` | ✅ | IMPLEMENTED | Keep; verify store creation flow |
| Catalog list (search/status) | `merchant/catalog` | `/merchant/catalog` | `GET /v1/stores/:id/products` | ✅ | IMPLEMENTED | Add server pagination (currently `limit:200` client filter) |
| Product create/edit (studio) | `merchant/product-studio` (6-step) | `/merchant/catalog/new` + `/product/:id` (537 lines) | `POST/PATCH /v1/products` | ✅ | IMPLEMENTED | Convert to wizard w/ progress + draft (§30) |
| Variant create | Product Studio step 3 | `product_edit_screen` | `POST /v1/products/:id/variants` | ✅ | IMPLEMENTED | Keep |
| Product media upload | Product Studio step 5 | `product_edit_screen` | `POST /v1/media/presign` | ✅ | IMPLEMENTED | Keep |
| Category manage | (admin/web) | `/merchant/categories` | `GET/POST/PATCH/DELETE /v1/categories` | ✅ | IMPLEMENTED | Keep |
| **Offer management (create/price)** | `merchant/offers/` (483 lines) | **none** (offers only viewed in PDP) | `POST /v1/offers`, pricing update | ❌ no method | **MISSING** | Add merchant offer create/edit/price + list (§4.4 offers) |
| Inventory list (paginated) | `merchant/inventory` (826 lines) | `/merchant/inventory` | `GET /v1/stores/:id/inventory` | ✅ | IMPLEMENTED | Show product/SKU not `Variant <uuid>` (§28) |
| Stock adjust / transfer | `merchant/inventory` | `/merchant/inventory` dialogs | `POST /v1/inventory/adjust`,`/transfer` | ✅ | IMPLEMENTED | Keep |
| Bulk adjust / low-stock / export | `merchant/inventory` | low-stock ✅, export ✅, **bulk ✗** | `POST /v1/inventory/bulk-adjust` | ✅ `bulkAdjustStock()` (unused) | PARTIALLY IMPLEMENTED | Wire bulk adjust; add search + warehouse filter |
| Create inventory item (assign variant) | `merchant/inventory` | — | `POST /v1/inventory` | ✅ `createInventoryItem()` (unused) | MISSING | Wire "assign variant to warehouse" |
| Merchant order list | `merchant/orders` (555 lines) | `/merchant/orders` | `GET /v1/orders?storeId` | ✅ | PARTIALLY IMPLEMENTED | Add search + status filters + customer info (§26) |
| Order accept/reject | `merchant/orders/[id]` | `/merchant/orders` inline | `POST /v1/orders/:id/accept`,`/reject` | ✅ | PARTIALLY IMPLEMENTED | **No try/catch → silent failures** (`merchant_orders_screen.dart` L82-98); add error handling + confirm + busy state |
| **Partial acceptance** | `merchant/orders/[id]` | **none** | `POST /v1/orders/:id/items/confirm` | ✅ `partialAccept()` (unused) | **MISSING** | Build partial-accept flow (§27 CRITICAL) |
| FSM transitions | `merchant/orders/[id]` NEXT_STATUS_MAP | `/merchant/orders` next buttons | `POST /v1/orders/:id/status` | ✅ | IMPLEMENTED | Keep; large touch targets |
| Customer directory | `merchant/customers` | `/merchant/customers` | `GET /v1/merchant/customers` | ✅ | IMPLEMENTED | Keep |
| Store profile | `merchant/store` | `/merchant/store` (321 lines) | `GET/PATCH /v1/stores/:id` | ✅ | IMPLEMENTED | Keep |
| **Warehouse management** | `merchant/warehouses/` (293 lines) | `store_profile` has **create + list** (not edit/delete); no dedicated screen | `POST /v1/stores/:id/warehouses` | ✅ `createWarehouse()`/`fetchStoreWarehouses()` | PARTIALLY IMPLEMENTED | **Matrix correction:** create+list already exist in `store_profile_screen.dart`; add edit/delete + warehouse filter across inventory (§13) |
| **Pricing management** | `merchant/pricing/` (495 lines) | **none** | `GET /v1/stores/:id/price-lists`,`/tiers` | ✅ read-only (`fetchStorePriceLists`,`fetchPriceListTiers`) | PARTIALLY IMPLEMENTED (read only) | Add price-list/tier create-edit (§31) |
| **Promotions** | `merchant/promotions/` (341 lines) | **none** | `promotions.controller` | ❌ no method | **MISSING** | Add api methods + list/create/edit/activate (§32) |
| **Catalog import (XLSX)** | `merchant/import/` (686 lines) | **none** | `catalog-import.controller` | partial (`createImportJob`/`process`) | MISSING | Document as BACKEND/UX gap — XLSX wizard is desktop-heavy; DEFER with reason |
| **Catalog requests** | `merchant/requests/` (262 lines) | **none** | `catalog.requests.controller` | ❌ | MISSING | DEFER (admin-adjacent) with reason |
| Organization settings | `merchant/organization` (1081 lines) | `/organizations`,`/organizations/:id` | `organizations.controller` | ✅ | PARTIALLY IMPLEMENTED | Mobile covers members; org settings lighter |

### 4.6 Cross-cutting

| Capability | Web | Mobile | Current Status | Required Action |
|-----------|-----|--------|----------------|-----------------|
| Loading state | Spinner | `CircularProgressIndicator` everywhere | PARTIALLY IMPLEMENTED | Add skeletons via `shimmer` (§38) — dep already present |
| Empty state | `EmptyState` | `EmptyState` widget | IMPLEMENTED | Keep; make actions contextual (§39) |
| Error state | `ErrorBanner` + retry | `ErrorBanner` + raw `'$e'` in most screens | PARTIALLY IMPLEMENTED | Route all errors through `ApiService.errorMessage()` (only ~6 screens use it); map 401/403/404/409/422/429 (§40) |
| Duplicate-submission guard | disabled + busy | partial (`_submitting` in checkout/reviews) | PARTIALLY IMPLEMENTED | Add busy/disable to accept/reject/adjust/create (§41) |
| Accessibility | a11y labels | tooltips on some icons only | PARTIALLY IMPLEMENTED | Semantic labels, 48px targets, contrast (§42) |
| RTL / Arabic | full RTL | `textDirection: rtl` on a few Arabic fields | PARTIALLY IMPLEMENTED | Proper RTL mirroring (§43); locale exists |
| Dark mode | (web theme) | **not implemented** | NOT APPLICABLE | Do NOT add incomplete dark mode (§46) |
| Image caching | next/image | `Image.network` (no cache) | PARTIALLY IMPLEMENTED | Switch to `cached_network_image` (§44) — dep present |
| Pagination | URL-backed | mostly absent | PARTIALLY IMPLEMENTED | Add to search/catalog/orders |

---

## 5. Complete Screen Inventory

Every screen in `mobile/lib/screens/**` is accounted for below (**28 screens**; 27 live + 1 dead scaffolding). Routes are taken verbatim from `router.dart`. Fields follow the spec's mandated 12-item format. "API deps" lists the `api_service.dart` methods the screen actually calls.

### 5.A Buyer & Shared Screens

#### 5.A.1 — Home
- **Screen:** `home_screen.dart` (204 lines) — `HomeScreen`
- **Route:** `/home`
- **Role:** BUYER / MERCHANT_* (shared landing)
- **Web Equivalent:** `apps/web/src/app/page.tsx` (commerce home: hero, categories, products, deals)
- **API Dependencies:** none directly (nav launcher only); indirectly relies on `profileProvider`, `cartProvider`
- **Permissions:** any authenticated user
- **Current State:** A scrollable grid of `_navCard` launchers (Search / Stores / Cart / Orders / Notifications / Profile / Merchant…). **Not a commerce home.** No search bar, no product/category/deal feeds.
- **Missing Features:** search entry field, category rail, popular/recently-viewed products, featured suppliers, cart badge, notification badge (§14).
- **UX Problems:** Functions as a menu, not a storefront; user must navigate to `/search` to begin shopping — violates the spec's "search-first" principle.
- **Performance Problems:** none (static grid).
- **Accessibility Problems:** nav cards rely on color+icon; no semantic labels; tap targets acceptable.
- **Required Changes:** **Role leakage — renders "Merchant Dashboard" + "Merchant Orders" cards to ALL users (`home_screen.dart` L164-170).** Gate merchant cards behind `isMerchant`. Rebuild as commerce home with real API-backed sections only (no fabricated recommendations, §14). Add persistent bottom nav (Home/Search/Cart/Orders/Account, §11).

#### 5.A.2 — Search
- **Screen:** `search_screen.dart` (294 lines) — `SearchScreen`
- **Route:** `/search`
- **Role:** BUYER (also usable by merchants)
- **Web Equivalent:** `search/` (facets, sort, pagination)
- **API Dependencies:** `search()`, `fetchCategories()`; `brandsProvider` exists but is **never consumed**
- **Permissions:** any authenticated user
- **Current State:** Debounced (300 ms) text search, category chips, dynamic attribute facets (COS-15), barcode scanner (`mobile_scanner`).
- **Missing Features:** brand filter UI, price range, in-stock toggle, verified-merchant toggle, sort control, pagination (hardcoded `limit:30`), filter bottom-sheet with active-filter chips (§15).
- **UX Problems:** `String? _selectedBrand;` (L22) is **dead state** — declared, never set by any widget. No way to refine beyond category/attribute.
- **Performance Problems:** no paging → capped result set; refetch on each keystroke (debounced, acceptable).
- **Accessibility Problems:** scanner icon lacks label; error banner text raw.
- **Required Changes:** Wire brand chips from existing `brandsProvider`; add `minPrice/maxPrice/inStock/verified/sort` params to `search()` + a filter sheet; paginate via `ListView.builder`; replace `'Search failed: $e'` with `ApiService.errorMessage(e)`; remove or wire `_selectedBrand`.

#### 5.A.3 — Product Detail (PDP)
- **Screen:** `product_detail_screen.dart` (513 lines) — `ProductDetailScreen`
- **Route:** `/products/:id`
- **Role:** BUYER
- **Web Equivalent:** `products/[id]/` (gallery+zoom, VariantSelector, OfferComparisonTable, reviews)
- **API Dependencies:** `fetchProduct()`, `fetchVariants()`, `fetchVariantMatrix()`, `fetchProductOffers()`, `fetchProductOffersRanked()`; `productMediaProvider` available but gallery not built
- **Permissions:** any authenticated user
- **Current State:** Strong data model — variant matrix chips, ranked offer comparison with badges, specifications table.
- **Missing Features:** image gallery (swipe/zoom/thumbnails), rating & reviews, favorite/compare actions, related products, dynamic price/stock/SKU/image update on variant selection (§18–§20).
- **UX Problems:** **`_isOptionAvailable()` is a stub returning `true` (L99-106)** — selecting dimensions does not filter unavailable combos nor update price/stock/SKU/image (§19 violation). Single `Image.network` (h180), no gallery.
- **Performance Problems:** `Image.network` uncached (dep `cached_network_image` present but unused); no image placeholder.
- **Accessibility Problems:** image has no semantic label; offer/matrix chips lack labels.
- **Required Changes:** Implement real variant-matrix availability + price/stock/SKU/image recompute on selection; build gallery with `cached_network_image`; surface reviews (`fetchStoreReviews`) and favorite toggle (needs new favorites API — see §6); restyle hierarchy (§17).

#### 5.A.4 — Cart
- **Screen:** `cart_screen.dart` (247 lines) — `CartScreen`
- **Route:** `/cart`
- **Role:** BUYER
- **Web Equivalent:** `cart/` (grouped, promo, validation)
- **API Dependencies:** `fetchCart()`, `updateCartItem()`, `removeCartItem()`, `clearCart()`, `validateCart()`
- **Permissions:** BUYER
- **Current State:** Multi-supplier grouping, validation banners (stale/repriced), mixed-currency handling.
- **Missing Features:** promo-code input (`applyPromo()` exists, unused), per-item stock/MOQ enforcement, save-for-later.
- **UX Problems:** Quantity uses **raw IconButtons**, not the existing `QuantityStepper` widget → no MOQ floor guard.
- **Performance Problems:** none notable.
- **Accessibility Problems:** +/- icon buttons lack semantic labels.
- **Required Changes:** Adopt `QuantityStepper` with MOQ floor; wire promo input to `applyPromo()`; show per-item stock.

#### 5.A.5 — Checkout
- **Screen:** `checkout_screen.dart` (116 lines) — `CheckoutScreen`
- **Route:** `/checkout`
- **Role:** BUYER
- **Web Equivalent:** `checkout/` (Address → Fulfillment → Review → Confirmation)
- **API Dependencies:** `checkout()` (idempotency via `Uuid().v4()`), cart data
- **Permissions:** BUYER
- **Current State:** Single-screen linear form (address + fulfillment radio) with idempotent submit.
- **Missing Features:** multi-step flow, order review/summary, per-merchant breakdown, address book, confirmation step (§22).
- **UX Problems:** **DEFECT — hardcoded placeholder defaults `'123 Main St'` / `'Riyadh'` (L15-16)**, violating the spec's "no fabricated data" rule (§22). No review before placing order.
- **Performance Problems:** none.
- **Accessibility Problems:** raw error text `_error = '$e'`.
- **Required Changes:** Remove fabricated defaults; build Address→Fulfillment→Review→Confirmation; show real merchant/financial breakdown; map errors via `ApiService.errorMessage`. Note BG-2 (delivery/tax are zero at checkout — show "invoiced on delivery").

#### 5.A.6 — Orders List
- **Screen:** `orders_list_screen.dart` (52 lines) — `OrdersListScreen`
- **Route:** `/orders`
- **Role:** BUYER
- **Web Equivalent:** `orders/` (status filters, rich cards)
- **API Dependencies:** `fetchOrders()`
- **Permissions:** BUYER
- **Current State:** Minimal list of orders (thin wrapper).
- **Missing Features:** status filter tabs (All/Active/Delivered/Cancelled), compact rich cards (items, total, status badge), pagination (§24).
- **UX Problems:** Very low information density; no filtering.
- **Performance Problems:** no paging.
- **Accessibility Problems:** minimal markup.
- **Required Changes:** Add status filter tabs + rich order cards + paging.

#### 5.A.7 — Order Detail
- **Screen:** `order_detail_screen.dart` (277 lines) — `OrderDetailScreen`
- **Route:** `/orders/:id`
- **Role:** BUYER
- **Web Equivalent:** `orders/[id]/` (timeline, financials, cancel/reorder/dispute)
- **API Dependencies:** `fetchOrder()`, `fetchOrderHistory()`, `cancelOrder()`, `reorder()`; realtime `_realtime.watchOrder()`
- **Permissions:** BUYER (owner-scoped)
- **Current State:** Financials, item list, status history (dots+rows), realtime status, cancel popup menu, reorder.
- **Missing Features:** proper vertical status timeline (§25), dispute-from-order button, FSM-guarded cancel.
- **UX Problems:** Cancel popup is available for **all** statuses (no FSM guard) — a buyer can attempt to cancel a delivered order; history is dots, not a timeline.
- **Performance Problems:** none.
- **Accessibility Problems:** popup actions lack labels.
- **Required Changes:** **CAPABILITY-MATRIX correction — cancel (L70-93) and reorder (L165-202) ARE implemented despite matrix "—".** Add FSM guard + confirm dialog on cancel; upgrade to vertical timeline; add "Open dispute" using `createDispute()` with order context.

#### 5.A.8 — Notifications
- **Screen:** `notifications_screen.dart` (114 lines) — `NotificationsScreen`
- **Route:** `/notifications`
- **Role:** BUYER / MERCHANT_*
- **Web Equivalent:** `notifications/`
- **API Dependencies:** `fetchNotifications()`, `fetchUnreadCount()`, `markNotificationRead()`, `markAllNotificationsRead()`; realtime push
- **Permissions:** any authenticated user
- **Current State:** List with read/unread styling, mark-all-read, realtime push.
- **Missing Features:** filter tabs (ALL/UNREAD/READ), date grouping (Today/Yesterday/Earlier), deep-link navigation on tap (§36).
- **UX Problems:** Tapping only marks read — does not navigate to the related order/product.
- **Performance Problems:** `fetchNotifications()` has no status param (client-side filter needed).
- **Accessibility Problems:** unread indicator is color-only.
- **Required Changes:** Add tabs + date grouping + tap-through deep-link using notification payload.

#### 5.A.9 — Stores List
- **Screen:** `stores_list_screen.dart` (44 lines) — `StoresListScreen`
- **Route:** `/stores`
- **Role:** BUYER
- **Web Equivalent:** `stores/`
- **API Dependencies:** `fetchStores()`
- **Permissions:** any authenticated user
- **Current State:** Basic list of store tiles.
- **Missing Features:** search, category/verified filters, save-supplier action, ratings.
- **UX Problems:** Thin; no discovery affordances.
- **Performance Problems:** no paging.
- **Accessibility Problems:** minimal.
- **Required Changes:** Add search/filter, verified badge, save-supplier (needs saved-suppliers API — §6).

#### 5.A.10 — Store Detail
- **Screen:** `store_detail_screen.dart` (82 lines) — `StoreDetailScreen`
- **Route:** `/stores/:id`
- **Role:** BUYER
- **Web Equivalent:** `stores/[slug]/` (header, branding, reviews, save, products)
- **API Dependencies:** `fetchStoreProducts()`; `fetchStore()` and `fetchStoreReviews()` **exist but are not called here**
- **Permissions:** any authenticated user
- **Current State:** Products grid only.
- **Missing Features:** store header/branding, verified badge, rating & reviews, save-supplier action (§35).
- **UX Problems:** No store identity — jumps straight to a product grid.
- **Performance Problems:** uncached images.
- **Accessibility Problems:** minimal.
- **Required Changes:** Call `fetchStore()` for header; add reviews via `fetchStoreReviews()`; add save-supplier action.

#### 5.A.11 — Reviews & Disputes
- **Screen:** `reviews_disputes_screen.dart` (179 lines) — `ReviewsDisputesScreen`
- **Route:** `/reviews`
- **Role:** BUYER
- **Web Equivalent:** `reviews/` (list + create, dispute tab)
- **API Dependencies:** `createReview()`, `createDispute()`; `fetchStoreReviews()` + `fetchDisputes()` **exist but unused**
- **Permissions:** BUYER
- **Current State:** Two forms (create review / create dispute).
- **Missing Features:** list of existing reviews, list of disputes, dispute detail/evidence, review eligibility gating (§33).
- **UX Problems:** **Requires manual entry of raw `Order ID` and `Subject ID` UUIDs as text (L106-107)** — unusable for real users. Subject-type dropdown offers `DRIVER`, which does not exist in the backend (BG-1). Success messages reuse the error banner (`_show`).
- **Performance Problems:** none.
- **Accessibility Problems:** raw UUID fields; no helpers.
- **Required Changes:** Drive review/dispute creation from order context (no raw UUID entry); add reviews + disputes lists (APIs already exist); remove `DRIVER` option; separate success vs error UI.

#### 5.A.12 — Profile
- **Screen:** `profile_screen.dart` (219 lines) — `ProfileScreen`
- **Route:** `/profile`
- **Role:** BUYER / MERCHANT_*
- **Web Equivalent:** `account/` (tabbed hub)
- **API Dependencies:** `fetchProfile()`, `updateProfile()`; locale switch (ar/en)
- **Permissions:** self
- **Current State:** View/edit profile fields, locale toggle, links to credentials/change-password/sessions/organizations.
- **Missing Features:** structured Account hub aggregating orders/favorites/saved-suppliers/notifications/settings (§37).
- **UX Problems:** Flat form; account sub-areas are scattered links rather than a hub.
- **Performance Problems:** none.
- **Accessibility Problems:** acceptable; verify contrast on muted text.
- **Required Changes:** Evolve into an Account hub with entries for favorites/saved-suppliers once those screens exist.

### 5.B Auth Screens

#### 5.B.1 — Login
- **Screen:** `login_screen.dart` (407 lines) — `LoginScreen`
- **Route:** `/login`
- **Role:** public (unauthenticated)
- **Web Equivalent:** `auth/login/`
- **API Dependencies:** `loginPassword()`, `requestOtp()`, `verifyOtp()`, `checkDeviceLogin()`
- **Permissions:** none
- **Current State:** **Well built.** Tabbed Email/Password + Phone OTP, device-trust flow (auto-switches to OTP tab on untrusted device), auto-login prefill, busy state, errors via `ApiService.errorMessage`.
- **Missing Features:** forgot-password entry (if backend supports), biometric re-entry (optional).
- **UX Problems:** minor — custom error container instead of shared `ErrorBanner`.
- **Performance Problems:** none.
- **Accessibility Problems:** OTP field uses `letterSpacing:8`; ensure screen-reader announces digits; password toggle labeled by icon only.
- **Required Changes:** Restyle to Phase 1 design system; otherwise keep. Low priority.

#### 5.B.2 — Credential Setup
- **Screen:** `credential_setup_screen.dart` (306 lines) — `CredentialSetupScreen`
- **Route:** `/profile/credentials`
- **Role:** authenticated (post-OTP)
- **Web Equivalent:** `profile/credentials/`
- **API Dependencies:** `setupCredentials()`
- **Permissions:** self
- **Current State:** **Well built.** `Form` + validators (email regex, ≥12 chars, ≥3 char classes, confirm match), password requirements panel, error/success banners, busy state, skip action.
- **Missing Features:** password strength meter (optional).
- **UX Problems:** none material.
- **Performance Problems:** none.
- **Accessibility Problems:** error text uses `e.toString()` (not `ApiService.errorMessage`).
- **Required Changes:** Route errors through `ApiService.errorMessage`; restyle. Low priority.

#### 5.B.3 — Change Password
- **Screen:** `change_password_screen.dart` (314 lines) — `ChangePasswordScreen`
- **Route:** `/profile/change-password`
- **Role:** authenticated
- **Web Equivalent:** `account/` (security)
- **API Dependencies:** `changePassword()`
- **Permissions:** self
- **Current State:** **Well built.** Current/new/confirm with validators, "must differ from current" rule, logout-other-devices notice, error/success banners, busy state.
- **Missing Features:** none material.
- **UX Problems:** none material.
- **Performance Problems:** none.
- **Accessibility Problems:** errors via `e.toString()`.
- **Required Changes:** Route errors through `ApiService.errorMessage`; restyle. Low priority.

#### 5.B.4 — Sessions
- **Screen:** `sessions_screen.dart` (429 lines) — `SessionsScreen`
- **Route:** `/profile/sessions`
- **Role:** authenticated
- **Web Equivalent:** `profile/sessions/`
- **API Dependencies:** `fetchSessions()`, `revokeSessionsByDevice()`
- **Permissions:** self
- **Current State:** **Well built.** Session cards (current/revoked badges, device name mapping, relative time, IP), pull-to-refresh, revoke confirm dialog, empty/error states, info panel.
- **Missing Features:** revoke-all (optional).
- **UX Problems:** device-name mapping is heuristic (UA substring).
- **Performance Problems:** none.
- **Accessibility Problems:** color-only "Current"/"Revoked" chips (text present — acceptable); errors via `e.toString()`.
- **Required Changes:** Route errors through `ApiService.errorMessage`; restyle. Low priority.

### 5.C Organization Screens

#### 5.C.1 — Organizations
- **Screen:** `organizations_screen.dart` (210 lines) — `OrganizationsScreen`
- **Route:** `/organizations`
- **Role:** authenticated (multi-org users)
- **Web Equivalent:** org switcher
- **API Dependencies:** `fetchMyOrganizations()`, `createOrganization()`, `switchOrg()` (persists re-minted token, API-B9)
- **Permissions:** self
- **Current State:** List with active badge, inline create form (name/country/type), switch action, pull-to-refresh, empty/error states.
- **Missing Features:** join-by-invite-code from this screen (exists in registration wizard only).
- **UX Problems:** create-org errors use raw `$e`.
- **Performance Problems:** none.
- **Accessibility Problems:** active state conveyed by color+chip (chip text present).
- **Required Changes:** Route errors through `ApiService.errorMessage`; restyle.

#### 5.C.2 — Organization Detail
- **Screen:** `org_detail_screen.dart` (371 lines) — `OrgDetailScreen`
- **Route:** `/organizations/:id`
- **Role:** MERCHANT_OWNER (org admins)
- **Web Equivalent:** `merchant/organization/`
- **API Dependencies:** `fetchOrganization()`, `updateOrganization()`, `fetchOrgMembers()`, `addOrgMember()`, `removeOrgMember()`, `switchOrg()`
- **Permissions:** org admin (server-enforced)
- **Current State:** Tabbed Details/Members; edit org dialog; add/remove member with confirm; switch org with confirm.
- **Missing Features:** member role picker (roles are hardcoded UUID text), invite flow, member search.
- **UX Problems:** **Add Member requires raw `User ID` + `Role ID` UUIDs as text (L235-257)** — same defect class as reviews. Create/edit member errors otherwise use `ApiService.errorMessage` (good).
- **Performance Problems:** none.
- **Accessibility Problems:** UUID text fields lack helpers.
- **Required Changes:** Replace raw UUID entry with a searchable user picker + role dropdown (requires a users/roles lookup endpoint — verify backend; if absent, DEFER with reason).

### 5.D Merchant Screens

#### 5.D.1 — Merchant Dashboard
- **Screen:** `merchant_dashboard_screen.dart` (173 lines) — `MerchantDashboardScreen`
- **Route:** `/merchant`
- **Role:** MERCHANT_OWNER / MERCHANT_STAFF
- **Web Equivalent:** `merchant/` (KPI dashboard)
- **API Dependencies:** `activeStoreProvider` (org/store gate); no aggregate-metrics method called
- **Permissions:** merchant role (router-guarded)
- **Current State:** Nav-card hub (Store Profile / Catalog / Inventory / Categories / Orders / Customers / Organization) with org/store onboarding gate + CTA.
- **Missing Features:** **Zero KPIs** — spec §29 wants Pending Orders / Today's Orders / Low Stock / Active Offers / Revenue. Also missing links: Offers, Pricing, Promotions, Warehouses, Requests, Import.
- **UX Problems:** No at-a-glance business health.
- **Performance Problems:** none.
- **Accessibility Problems:** nav cards icon+color.
- **Required Changes:** Add real API-backed KPIs only (no fabricated numbers, §29). Requires a merchant-stats aggregate endpoint — **verify backend; if absent, mark BACKEND LIMITED and derive from existing list endpoints (e.g., pending order count, low-stock count) rather than inventing values.**

#### 5.D.2 — Merchant Catalog
- **Screen:** `merchant_catalog_screen.dart` (384 lines) — `MerchantCatalogScreen`
- **Route:** `/merchant/catalog`
- **Role:** MERCHANT_*
- **Web Equivalent:** `merchant/catalog/`
- **API Dependencies:** `fetchStoreProducts()`, `deleteProduct()`; `Image.network`
- **Permissions:** merchant role
- **Current State:** Product list with create/edit/delete navigation; client-side filter over `limit:200`.
- **Missing Features:** server pagination, status filter (available/unavailable), search.
- **UX Problems:** `limit:200` cap will silently hide products beyond 200.
- **Performance Problems:** uncached images; large single fetch.
- **Accessibility Problems:** image tiles lack labels.
- **Required Changes:** Server-side pagination + search + status filter; `cached_network_image`.

#### 5.D.3 — Product Create/Edit
- **Screen:** `product_edit_screen.dart` (537 lines) — `ProductEditScreen`
- **Route:** `/merchant/catalog/new` and `/merchant/catalog/product/:id`
- **Role:** MERCHANT_*
- **Web Equivalent:** `merchant/product-studio/` (**6-step wizard**)
- **API Dependencies:** `fetchProduct()`, `createProduct()`, `updateProduct()`, `createVariant()`, `listMedia()`, `addMedia()`, `presignMedia()`, `storeCategoriesProvider`, `brandsProvider`
- **Permissions:** merchant role
- **Current State:** Single-page scrolling form (title/description/category/brand/MOQ/available/image-URLs) + Variants and Media sections in edit mode. Create→edit handoff via `pushReplacement`.
- **Missing Features:** the **6-step wizard** (Identity → Specifications → Variants → Offer → Media → Review), progress indicator, draft save, offer/pricing management (§30).
- **UX Problems:** Images entered as **newline-separated URL text**; long single page; no validation grouping; no draft persistence.
- **Performance Problems:** none material.
- **Accessibility Problems:** URL-text image entry is error-prone.
- **Required Changes:** Convert to a stepped wizard modeled on `merchant_registration_screen.dart` (already a working `PageController` wizard); replace URL-text images with picker/upload (upload path already implemented via `presignMedia`); add draft save.

#### 5.D.4 — Category Management
- **Screen:** `category_manage_screen.dart` (213 lines) — `CategoryManageScreen`
- **Route:** `/merchant/categories`
- **Role:** MERCHANT_*
- **Web Equivalent:** `merchant/catalog` categories tab
- **API Dependencies:** `fetchStoreCategories()`, `createCategory()`, `updateCategory()`, `deleteCategory()`
- **Permissions:** merchant role
- **Current State:** **Well built.** List with EN/AR names, create/edit dialog, delete confirm, store gate, empty/error states.
- **Missing Features:** category ordering/hierarchy (if backend supports).
- **UX Problems:** create/edit/delete errors use raw `$e` (not `ApiService.errorMessage`).
- **Performance Problems:** none.
- **Accessibility Problems:** trailing icon buttons have no tooltips.
- **Required Changes:** Route errors through `ApiService.errorMessage`; add tooltips; restyle.

#### 5.D.5 — Inventory
- **Screen:** `inventory_screen.dart` (493 lines) — `InventoryScreen`
- **Route:** `/merchant/inventory`
- **Role:** MERCHANT_*
- **Web Equivalent:** `merchant/inventory/`
- **API Dependencies:** `fetchStoreInventory()`, `adjustStock()`, `transferStock()`, `checkLowStock()`, `exportInventoryCsv()`, `exportMovementsCsv()`; `bulkAdjustStock()` + `createInventoryItem()` **exist but unused**
- **Permissions:** merchant role
- **Current State:** **Most complete merchant screen.** Pagination, low-stock highlight, adjust + transfer dialogs, low-stock check, CSV exports, pull-to-refresh.
- **Missing Features:** search, warehouse filter, bulk adjust (API exists), create inventory item / assign variant to warehouse (API exists) (§28).
- **UX Problems:** Rows show **`Variant <short-uuid>`** (L286) instead of product name/SKU — unreadable for merchants.
- **Performance Problems:** none notable.
- **Accessibility Problems:** dense rows; verify tap targets.
- **Required Changes:** Show product title + SKU (join variant data); add search + warehouse filter; wire `bulkAdjustStock()` and `createInventoryItem()`.

#### 5.D.6 — Merchant Orders
- **Screen:** `merchant_orders_screen.dart` (143 lines) — `MerchantOrdersScreen`
- **Route:** `/merchant/orders`
- **Role:** MERCHANT_*
- **Web Equivalent:** `merchant/orders/` + `orders/[id]/`
- **API Dependencies:** `acceptOrder()`, `rejectOrder()`, `transitionStatus()`; `partialAccept()` **exists but unused**
- **Permissions:** merchant role
- **Current State:** Order list with accept/reject and FSM next-status buttons (`_nextStatuses()` matches backend FSM).
- **Missing Features:** **partial acceptance UI (§27 CRITICAL)**, search, status filters, customer info, order detail drill-down.
- **UX Problems:** **Accept/reject have NO try/catch (L82-98) → silent failures**; no confirm dialog; no busy state; small fonts (10–12).
- **Performance Problems:** none.
- **Accessibility Problems:** small text; buttons lack labels.
- **Required Changes:** Wrap accept/reject/transition in try/catch + confirm + busy state; build partial-acceptance flow using existing `partialAccept()`; add filters/search; enlarge touch targets & type.

#### 5.D.7 — Merchant Customers
- **Screen:** `merchant_customers_screen.dart` (202 lines) — `MerchantCustomersScreen`
- **Route:** `/merchant/customers`
- **Role:** MERCHANT_*
- **Web Equivalent:** `merchant/customers/`
- **API Dependencies:** `fetchMerchantCustomers()`
- **Permissions:** merchant role
- **Current State:** **Relatively complete.** Search, sort (Recent/Top Spent/Most Orders), stats grid (Customers/Revenue/Orders/Avg Order), customer cards.
- **Missing Features:** server-side pagination, customer drill-down (order history per customer).
- **UX Problems:** Filtering/sorting is **client-side only** (won't scale).
- **Performance Problems:** full list loaded; fine for small data.
- **Accessibility Problems:** stat card labels uppercase 10 px — low legibility.
- **Required Changes:** Add server pagination if endpoint supports it; customer detail view; restyle stats.

#### 5.D.8 — Store Profile
- **Screen:** `store_profile_screen.dart` (321 lines) — `StoreProfileScreen`
- **Route:** `/merchant/store`
- **Role:** MERCHANT_OWNER
- **Web Equivalent:** `merchant/store/`
- **API Dependencies:** `activeStoreProvider`, `updateStore()`, `createWarehouse()`, `fetchStoreWarehouses()`
- **Permissions:** merchant owner
- **Current State:** **Well built.** Editable displayName/description/currency/locale/timezone/city; read-only slug + verification badge; warehouses sub-section with **add + list**; store gate; busy state.
- **Missing Features:** warehouse edit/delete; logo/branding upload; full address fields.
- **UX Problems:** save errors use raw `$e`; warehouse add errors raw `$e`.
- **Performance Problems:** none.
- **Accessibility Problems:** dropdowns labeled; acceptable.
- **Required Changes:** Route errors through `ApiService.errorMessage`; add warehouse edit/delete + branding. **Matrix correction:** warehouse create+list already exist here (matrix said "none").

#### 5.D.9 — Merchant Registration
- **Screen:** `merchant_registration_screen.dart` (871 lines) — `MerchantRegistrationScreen`
- **Route:** `/merchant/register` (open to any authenticated user)
- **Role:** any authenticated → becomes MERCHANT_OWNER
- **Web Equivalent:** `merchant/register/` + `onboard/`
- **API Dependencies:** `createOrganization()` / `joinOrganization()`, `createStore()`, `createWarehouse()`, `registerDocument()`, `presignDocumentUpload()`, `uploadBusinessDocument()`, `submitVerification()`
- **Permissions:** authenticated
- **Current State:** **Well built — proper 5-step wizard** (Profile → Business → Store → Documents → Review) via `PageController`, per-step validation, create-or-join org mode, document picker/upload, review step.
- **Missing Features:** save-and-resume draft; back-navigation persistence check.
- **UX Problems:** long flow; ensure validation messages surface per step.
- **Performance Problems:** document uploads — ensure progress feedback.
- **Accessibility Problems:** verify step indicator is announced.
- **Required Changes:** Keep as the reference wizard pattern; reuse for `product_edit_screen`. Restyle to Phase 1 system.

### 5.E Dead Scaffolding

#### 5.E.1 — Driver Dashboard (DELETE)
- **Screen:** `driver_dashboard_screen.dart` (159 lines) — `DriverDashboardScreen`
- **Route:** `/driver` (router **always redirects to `/home`** — unreachable)
- **Role:** none (no `DRIVER` role exists in backend — BG-1)
- **Web Equivalent:** none
- **API Dependencies:** none
- **Permissions:** n/a
- **Current State:** **Contains hardcoded fake data** — job tiles with fabricated IDs/addresses (`'abc12345'`, `'123 King Fahd Rd'`, `'2.3 km'`, etc., L69-80) and non-functional Accept buttons (`onPressed: () {}`).
- **Missing Features:** n/a.
- **UX Problems:** Dead scaffolding; violates the spec's "no mock/fake data" rule (§48).
- **Performance Problems:** n/a.
- **Accessibility Problems:** n/a.
- **Required Changes:** **DELETE the screen and its `/driver` route** (§48). It is correctly hidden today, but fabricated data must not remain in the codebase. Removing it also lets us drop the router's `/driver` special-case.

---


## 6. Backend Gap Register (verified against `apps/api/src`)

Each gap is classified by whether the **backend** is limited or only the **mobile client** is missing. This distinction drives the remediation plan: client-only gaps are pure mobile work; backend-limited gaps must be deferred or escalated (the spec forbids modifying backend business logic as part of the mobile transformation).

### 6.1 Genuine backend limitations (mobile cannot fully close these alone)

| ID | Capability | Verified backend state | Impact on mobile | Disposition |
|----|-----------|------------------------|------------------|-------------|
| BG-1 | `DRIVER` role | **Does not exist** anywhere in backend | `driver_dashboard_screen.dart` is dead scaffolding with fake data | DELETE screen + `/driver` route (§48) |
| BG-2 | Delivery/tax at checkout | Computed as **zero** at order time; invoiced on delivery (per CAPABILITY-MATRIX) | Checkout/order cannot show real shipping/tax totals | Show actual API values + explicit "invoiced on delivery" note; never fabricate |
| BG-3 | Search filters (price/in-stock/verified/sort) | `GET /v1/search` accepts **only** `q, storeId, categoryId, brandId, limit, offset, attrFilters` (`catalog.controller.ts` L381-403); products carry no price (it lives on `merchant_offers.base_price_minor`) | Mobile **cannot** offer server-side price/inStock/verified/sort | Implement only brand + category + attribute filters + pagination now; **DEFER** price/inStock/verified/sort as BACKEND LIMITED — **spec delivered: `BACKEND-EXTENSION-SPEC.md` §2** |
| BG-4 | Realtime order/notification push | Gateway + `socket_io_client` wired; **not E2E verified** this cycle | Status/push may not update live in all cases | Keep code; mark "NOT TESTED" for live push until human E2E run |
| BG-5 | Notification read filter | `GET /v1/notifications` accepts **only** `limit, offset` (`notifications.controller.ts` L23-34). Read-state is the **`readAt`** column (`notifications.schema.ts` L26) — NOT the `status` column (L21), which is delivery state | ALL/UNREAD/READ tabs must filter the fetched page **client-side** | Implement client-side tabs on the loaded window; note server param absent — **spec delivered: `BACKEND-EXTENSION-SPEC.md` §1** (filter on `readAt`) |
| BG-6 | Merchant KPI aggregate | **No single** dashboard-stats endpoint; components exist: `merchant/offers/analytics` (orders/units/revenue per offer incl. zero-sale rows), `merchant/offers/analytics/trend` (day/week buckets), `checkLowStock`, order lists | KPIs must be **composed** from several calls | Build KPIs from existing endpoints; no fabricated numbers (§29) |

### 6.2 Backend COMPLETE — mobile client method + UI missing (pure mobile work)

These are the highest-value parity gaps: the API already exists and is proven, so closing them requires **only** new `api_service.dart` methods, providers, and screens — no backend change.

| Capability | Verified backend endpoints | Mobile today |
|-----------|---------------------------|--------------|
| Favorites / wishlist | `GET/POST /v1/me/favorites`, `DELETE /v1/me/favorites/:productId` (`profile.controller.ts` L78-93) | ❌ no method/provider/screen |
| Saved suppliers | `GET/POST /v1/me/saved-suppliers`, `DELETE .../:storeId` (`profile.controller.ts` L99-109) | ❌ no method/provider/screen |
| Promotions (merchant) | `POST /v1/promotions`, `GET /v1/stores/:id/promotions(/active)`, `GET/PATCH /v1/promotions/:id`, `GET .../validate`, `GET /v1/offers/nearby` (`promotions.controller.ts`) | ❌ no method/UI |
| Merchant offers (create/price/withdraw) + analytics | `GET /v1/merchant/offers`, `POST /v1/merchant/offers`, `POST .../:id/propose`, `PATCH .../:id/pricing`, `POST .../:id/withdraw`, `GET .../analytics(/trend)` (`catalog.offer.controller.ts`) | ❌ offers only *viewed* in PDP; no merchant management |
| Dispute detail / evidence / response / resolve | `GET /v1/disputes/:id`, `/events`, `POST .../evidence`, `POST .../response`, `PATCH .../resolve` (`disputes.controller.ts` L38-68) | ❌ only `fetchDisputes()` (list) exists, unused |
| Reviews list | `GET /v1/stores/:id/reviews` (`fetchStoreReviews()` already in client) | ⚠️ method exists, **unused** — no UI |
| Promo at cart | `POST /v1/cart/promo` (`applyPromo()` already in client) | ⚠️ method exists, **unused** — no UI |
| Partial order acceptance | `POST /v1/orders/:id/items/confirm` (`partialAccept()` already in client) | ⚠️ method exists, **unused** — no UI |
| Bulk stock adjust / create inventory item | `bulkAdjustStock()`, `createInventoryItem()` already in client | ⚠️ methods exist, **unused** — no UI |

### 6.3 Requires backend verification before Phase 4 (do not assume)

- **Pricing management (price-lists/tiers create/edit):** mobile client has only read methods (`fetchStorePriceLists`, `fetchPriceListTiers`). Whether the backend exposes price-list/tier **write** endpoints was **not verified** in this audit. **Action:** verify `pricing` controller in Phase 4 before promising create/edit; if absent → BACKEND LIMITED.
- **Catalog import (XLSX)** and **Catalog requests:** backend controllers exist (`catalog-import.controller.ts`), but the flows are desktop-heavy (file upload, preview, error report). **DEFER** to a later phase with documented reason; not a Phase 1-3 blocker.

---

## 7. Design System Baseline & Component Gap (Phase 1 input)

### 7.1 What already exists

- **`core/theme.dart` → `TaifTokens`** (55 lines): brand `#174A5B` / `#0F3340` / accent `#C98A2D`; semantic `ok/warn/err/info`; neutrals `ink/muted/surface/bg/line`; spacing `sp4–sp32`; radius `sm6/md10/lg14`; shadows `sm/md/lg`; fonts `Inter` + `IBMPlexSansArabic`. Mirrors the web `ui-kit` tokens.
- **`widgets/common_widgets.dart`** (397 lines): `StatusBadge`, `EmptyState`, `LoadingSpinner`, `ErrorBanner`, `ProductCard`, `QuantityStepper`, `TierLadder`.
- **Unused-but-declared deps** ready for Phase 1/5 with **no new dependency**: `cached_network_image ^3.3.1`, `shimmer ^3.0.0`.

### 7.2 Gap vs the spec's `App*` component set (§ Phase 1)

| Spec component | Exists today? | Phase 1 action |
|----------------|---------------|----------------|
| `AppColors` / `AppSpacing` / `AppRadius` / `AppElevation` | ✅ as `TaifTokens` | **Wrap/extend**, don't replace |
| `AppTypography` | partial (Material `textTheme`) | Formalize type scale (display/title/body/caption) on `TaifTokens` fonts |
| `AppTheme` | ✅ `ThemeData` in `theme.dart` | Extend with component themes (buttons, inputs, chips) |
| `AppButton` (primary/secondary/ghost/loading) | ❌ (raw `ElevatedButton`) | Build; standardize busy/disabled states (§41) |
| `AppTextField` / form field | ❌ (raw `TextField`) | Build with consistent label/error/dense styling |
| `AppProductCard` | ⚠️ `ProductCard` exists | Upgrade: `cached_network_image`, rating, price clarity, favorite affordance |
| `AppOfferCard` | ❌ | Build for PDP offer comparison (§20) |
| `AppSkeleton` | ❌ (spinner only) | Build on `shimmer`; replace list-loading spinners (§38) |
| `AppEmptyState` | ✅ `EmptyState` | Keep; make actions contextual (§39) |
| `AppErrorState` / `AppErrorBanner` | ⚠️ `ErrorBanner` exists | Route **all** errors through `ApiService.errorMessage`; map 401/403/404/409/422/429 (§40) |
| `AppStatusBadge` | ✅ `StatusBadge` | Keep; verify FSM color/label coverage |
| `AppQuantityStepper` | ✅ `QuantityStepper` | Adopt in cart (currently unused there) with MOQ floor |
| Bottom nav shell (`Home/Search/Cart/Orders/Account`) | ❌ | Build buyer + merchant shells (§11) |
| Filter bottom sheet | ❌ | Build for search (§15) |

**Conclusion:** Roughly half the design system already exists as tokens/widgets. Phase 1 is **consolidation + a handful of new primitives** (`AppButton`, `AppTextField`, `AppSkeleton`, `AppOfferCard`, nav shell, filter sheet), not a rewrite.

---

## 8. Prioritized Remediation Plan (mapped to Phases 1–6)

Sequenced by dependency and user impact. Every item is traceable to a spec section and to evidence above.

### Phase 1 — Design system foundation (no feature changes)
1. Wrap `TaifTokens` into `AppColors/AppSpacing/AppRadius/AppElevation`; formalize `AppTypography`; extend `AppTheme` component themes.
2. Add primitives: `AppButton`, `AppTextField`, `AppSkeleton` (shimmer), `AppOfferCard`; upgrade `ProductCard` to `cached_network_image`.
3. Centralize error mapping via `ApiService.errorMessage` (401/403/404/409/422/429) and a shared `AppErrorState`.

### Phase 2 — Buyer navigation & discovery
4. Build bottom-nav shell (Home/Search/Cart/Orders/Account) + merchant shell; gate merchant nav by role (fix home role leakage L164-170).
5. Rebuild Home as commerce home with **API-backed** sections only (§14).
6. Search: wire existing `brandsProvider`; add filter bottom sheet (brand/category/attribute) + pagination; **DEFER** price/inStock/verified/sort (BG-3).
7. PDP: implement real variant availability (replace `_isOptionAvailable` stub L99-106) with price/stock/SKU/image recompute (§19); build image gallery; surface reviews.

### Phase 3 — Cart, checkout, orders
8. Cart: adopt `QuantityStepper` w/ MOQ floor; wire `applyPromo()`.
9. Checkout: **remove fabricated `'123 Main St'`/`'Riyadh'` defaults** (L15-16); build Address→Fulfillment→Review→Confirmation (§22); real financial breakdown + BG-2 note.
10. Orders list: status filter tabs + rich cards + paging. Order detail: vertical timeline (§25), FSM-guarded cancel + confirm, dispute-from-order.
11. Favorites + Saved suppliers: add client methods/providers/screens (backend ready — §6.2) + PDP/store toggles (§35).
12. Notifications: client-side ALL/UNREAD/READ tabs (BG-5), date grouping, tap-through deep-link (§36).

### Phase 4 — Merchant operations
13. Merchant orders: **add try/catch + confirm + busy** to accept/reject/transition (fix silent failures L82-98); build partial-acceptance UI via `partialAccept()` (§27 CRITICAL); filters/search.
14. Merchant dashboard: KPIs composed from `merchant/offers/analytics(/trend)` + `checkLowStock` + order counts (BG-6); no fabricated numbers (§29).
15. Product editor: convert to stepped wizard modeled on `merchant_registration_screen.dart`; replace URL-text images with picker/upload; draft save (§30).
16. Inventory: show product title/SKU not `Variant <uuid>` (L286); add search + warehouse filter; wire `bulkAdjustStock()` + `createInventoryItem()` (§28).
17. Offers + Promotions: add client methods + management UI (backend ready — §6.2). Pricing: **verify backend write endpoints first** (§6.3).

### Phase 5 — Quality, performance, accessibility
18. Skeletons on all list-loading states; `cached_network_image` everywhere.
19. Duplicate-submission guards (busy/disable) on all mutations (§41).
20. Accessibility pass: semantic labels, 48px targets, contrast (§42); RTL mirroring (§43). No incomplete dark mode (§46).
21. **DELETE** `driver_dashboard_screen.dart` + `/driver` route (§48).

### Phase 6 — Parity validation
22. Re-run this matrix against the transformed app; update `CAPABILITY-MATRIX.md`; produce human-UAT checklist. Any capability not exercised by a real human stays **"NOT TESTED"**.

### Deferred (documented, not silently dropped)
- Search price/inStock/verified/sort — **BG-3 backend limited**.
- Notification server-side status param — **BG-5**.
- Catalog import (XLSX) + catalog requests — desktop-heavy, **DEFER** (§6.3).
- Product compare page — decide implement vs defer in Phase 2 with reason (§6).

---

## 9. Corrections to `CAPABILITY-MATRIX.md`

The 2026-09-25 matrix is the authoritative baseline but is **stale/under-claiming** in the following verified places. It should be updated so the two documents agree:

| Matrix claim | Verified reality | Evidence |
|--------------|------------------|----------|
| Mobile order **cancel** = "—" | **IMPLEMENTED** | `order_detail_screen.dart` L70-93 (`cancelOrder()`) |
| Mobile **reorder** = "—" | **IMPLEMENTED** (with partial-result summary) | `order_detail_screen.dart` L165-202 (`reorder()`) |
| Mobile **warehouse** = none | create + list exist | `store_profile_screen.dart` L97-149, L271-309 |
| Inventory transfer/bulk/low-stock/export understated | transfer ✅, low-stock ✅, export ✅ implemented; bulk + create-item methods exist (UI unused) | `inventory_screen.dart`; `api_service.dart` |
| Dispute detail "backend limited/list only" | Backend **complete** (`:id`, `/events`, `/evidence`, `/response`, `/resolve`) | `disputes.controller.ts` L38-68 |
| Search price/inStock/verified/sort implied available | **Backend does not accept these params** | `catalog.controller.ts` L381-403 |

---

## 10. Phase 0 Certification

- ✅ Repository inspected directly (mobile screens, `api_service.dart`, `providers.dart`, `router.dart`, `theme.dart`, `common_widgets.dart`, and the relevant `apps/api/src` controllers). Nothing assumed.
- ✅ Live vs stale copies disambiguated (`scs-platform/mobile|apps/web|apps/api` live; `apps/scs-platform-b2-test/**` ignored).
- ✅ 6-column parity matrix produced (§4, six sub-tables) with statuses `IMPLEMENTED / PARTIALLY IMPLEMENTED / MISSING / BACKEND LIMITED / NOT APPLICABLE`.
- ✅ Complete screen inventory produced — **all 28 screens accounted for** (§5), each with the 12 mandated fields.
- ✅ Roles & permissions analyzed (§2); no `DRIVER` role in backend (BG-1).
- ✅ Backend gaps documented and classified backend-limited vs mobile-client-only (§6).
- ✅ Design-system baseline + component gap mapped to Phase 1 (§7).
- ✅ Prioritized remediation plan mapped to Phases 1–6, with explicit deferrals (§8).
- ✅ Corrections to `CAPABILITY-MATRIX.md` recorded (§9).

**Phase 0 gate status: COMPLETE.** No UI transformation was performed during this audit (per the spec's "no major UI changes before audit completion"). Human UI tests remain **NOT TESTED** — none were performed in this phase.

**Recommended next step:** Review this audit, confirm the phased approach and the deferral decisions (BG-3/BG-5/import/compare), then begin **Phase 1 (design system foundation)** — the lowest-risk, highest-leverage change, since ~half the primitives already exist as `TaifTokens` + `common_widgets.dart`.
