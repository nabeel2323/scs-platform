# SCS Platform — UI Capability Audit

> Generated: 2026-09-25  
> Scope: All backend modules, APIs, frontend applications (Admin, Web/Buyer, Mobile)

---

## Table of Contents

- [A. Application Map](#a-application-map)
- [B. Role Matrix](#b-role-matrix)
- [C. API Coverage Matrix](#c-api-coverage-matrix)
- [D. Entity Relationship Coverage](#d-entity-relationship-coverage)
- [E. Workflow Matrix](#e-workflow-matrix)
- [F. Gap List](#f-gap-list)

---

## A. Application Map

### Admin Console (`apps/admin`)
Next.js App Router. Permission-gated sidebar (`AdminSidebar.tsx`). Uses `ManagementPage` generic table component for list views. Dedicated detail pages at `[id]/page.tsx` for major entities.

| Route | Status | Implementation |
|-------|--------|----------------|
| `/` (Dashboard) | IMPLEMENTED | KPIs + pending org updates + quick links |
| `/users` | PARTIAL | ManagementPage stub → detail page exists |
| `/orders` | PARTIAL | ManagementPage stub → detail page exists |
| `/merchants` | PARTIAL | ManagementPage stub → detail page exists |
| `/organizations` | IMPLEMENTED | Full custom page (554 lines) → detail page exists |
| `/verification` | PARTIAL | ManagementPage stub → detail page exists |
| `/categories` | IMPLEMENTED | Custom page (482 lines) → detail page exists |
| `/brands` | IMPLEMENTED | Custom page (436 lines) → detail page exists |
| `/attributes` | IMPLEMENTED | Custom page (483 lines) → detail page exists |
| `/attribute-groups` | IMPLEMENTED | Custom page (241 lines) |
| `/product-types` | IMPLEMENTED | Custom page (489 lines) → detail page exists |
| `/products` | PARTIAL | ManagementPage stub → detail page exists (27 lines) |
| `/offers` | PARTIAL | ManagementPage stub (95 lines) → detail page exists |
| `/requests` | IMPLEMENTED | Custom page (265 lines) |
| `/disputes` | PARTIAL | ManagementPage stub → detail page exists |
| `/audit` | STUB | ManagementPage stub (6 lines), no detail page |
| `/catalog-import` | IMPLEMENTED | Full custom page (627 lines) → detail page exists |
| `/data-quality` | IMPLEMENTED | Custom page (189 lines) |
| `/kpis` | IMPLEMENTED | Custom page (207 lines) |
| `/offers-kpis` | IMPLEMENTED | Custom page (203 lines) |
| `/offers-trend` | IMPLEMENTED | Custom page (296 lines) |
| `/account` | IMPLEMENTED | Custom page (312 lines) |

### Web / Buyer App (`apps/web`)
Next.js App Router. Buyer-facing marketplace + merchant portal section.

**Buyer Pages:**

| Route | Status | Implementation |
|-------|--------|----------------|
| `/` (Home) | IMPLEMENTED | Landing page (85 lines) |
| `/search` | IMPLEMENTED | Full search with facets (707 lines client) |
| `/products/[id]` | IMPLEMENTED | PDP with variant selector + offer comparison (678 lines) |
| `/compare` | IMPLEMENTED | Product comparison (108 lines) |
| `/cart` | IMPLEMENTED | Multi-merchant cart grouped by store (228 lines) |
| `/checkout` | IMPLEMENTED | Checkout flow (175 lines) |
| `/orders` | IMPLEMENTED | Order list (111 lines) |
| `/orders/[id]` | IMPLEMENTED | Order detail with timeline (326 lines) |
| `/stores` | IMPLEMENTED | Store listing (97 lines) |
| `/stores/[slug]` | IMPLEMENTED | Store detail (369 lines) |
| `/merchant` (profile) | IMPLEMENTED | Merchant profile page (203 lines) |
| `/account` | IMPLEMENTED | Account management (376 lines) |
| `/favorites` | IMPLEMENTED | Favorites list (84 lines) |
| `/saved-suppliers` | IMPLEMENTED | Saved suppliers (145 lines) |
| `/notifications` | IMPLEMENTED | Notifications (262 lines) |
| `/reviews` | IMPLEMENTED | Reviews (117 lines) |
| `/profile/credentials` | IMPLEMENTED | Credential management (267 lines) |
| `/profile/sessions` | IMPLEMENTED | Session management (176 lines) |

**Merchant Portal (within `apps/web` at `/merchant/*`):**

| Route | Status | Implementation |
|-------|--------|----------------|
| `/merchant` (Dashboard) | IMPLEMENTED | Dashboard (203 lines) |
| `/merchant/catalog` | IMPLEMENTED | Catalog browser (411 lines) |
| `/merchant/catalog/product/[id]` | IMPLEMENTED | Product detail (47 lines) |
| `/merchant/orders` | IMPLEMENTED | Order management (555 lines) |
| `/merchant/orders/[id]` | IMPLEMENTED | Order detail + actions (412 lines) |
| `/merchant/inventory` | IMPLEMENTED | Inventory management (826 lines) |
| `/merchant/pricing` | IMPLEMENTED | Price lists/tiers (495 lines) |
| `/merchant/offers` | IMPLEMENTED | Offer management (483 lines) |
| `/merchant/customers` | IMPLEMENTED | Customer list (235 lines) |
| `/merchant/store` | IMPLEMENTED | Store settings (325 lines) |
| `/merchant/warehouses` | IMPLEMENTED | Warehouse management (293 lines) |
| `/merchant/import` | IMPLEMENTED | Import center (686 lines) |
| `/merchant/organization` | IMPLEMENTED | Org management (1081 lines) |
| `/merchant/requests` | IMPLEMENTED | Catalog requests (262 lines) |
| `/merchant/product-studio` | IMPLEMENTED | Product creation wizard (132 lines + 6 step components) |
| `/merchant/register` | IMPLEMENTED | Merchant registration (914 lines) |
| `/merchant/onboard` | IMPLEMENTED | Onboarding (476 lines) |

### Mobile App (`mobile/`)
Flutter app with B2B and retail flavors.

| Screen | Status | Implementation |
|--------|--------|----------------|
| Auth (Login, Change Password, Sessions, Credential Setup) | IMPLEMENTED | 4 screens |
| Home | IMPLEMENTED | Home screen (196 lines) |
| Search | IMPLEMENTED | Search screen (293 lines) |
| Product Detail | IMPLEMENTED | Product detail (511 lines) |
| Cart / Checkout | IMPLEMENTED | Cart (247 lines), Checkout (116 lines) |
| Orders (List + Detail) | IMPLEMENTED | List (52 lines), Detail (277 lines) |
| Merchant Dashboard | IMPLEMENTED | Dashboard (171 lines) |
| Merchant Catalog | IMPLEMENTED | Catalog (384 lines) |
| Merchant Inventory | IMPLEMENTED | Inventory (493 lines) |
| Merchant Orders | IMPLEMENTED | Orders (143 lines) |
| Merchant Product Edit | IMPLEMENTED | Product edit (537 lines) |
| Merchant Store Profile | IMPLEMENTED | Store profile (321 lines) |
| Merchant Customers | IMPLEMENTED | Customers (202 lines) |
| Merchant Registration | IMPLEMENTED | Registration (871 lines) |
| Merchant Category Manage | IMPLEMENTED | Categories (213 lines) |
| Organizations | IMPLEMENTED | List + Detail |
| Stores | IMPLEMENTED | List + Detail |
| Notifications | IMPLEMENTED | Notifications (114 lines) |
| Reviews/Disputes | IMPLEMENTED | Reviews (179 lines) |
| Driver Dashboard | IMPLEMENTED | Driver (159 lines) |
| Profile | IMPLEMENTED | Profile (218 lines) |

---

## B. Role Matrix

### Roles (from `apps/api/src/scripts/seed.ts`)

| Role Key | Name | Permission Count | Scope |
|----------|------|-----------------:|-------|
| SUPER_ADMIN | Super Admin | 53 (all) | Platform-wide |
| ADMIN | Platform Admin | 38 | Platform-wide |
| MODERATOR | Moderator | 20 | Catalog curation |
| MERCHANT_OWNER | Merchant Owner | 18 | Org-scoped |
| MERCHANT_STAFF | Merchant Staff | 14 | Org-scoped |
| BUYER | Buyer | 6 | Personal |

### Role → UI Capabilities

| Capability | SUPER_ADMIN | ADMIN | MODERATOR | MERCHANT_OWNER | MERCHANT_STAFF | BUYER |
|------------|:-----------:|:-----:|:---------:|:--------------:|:--------------:|:-----:|
| Admin Dashboard | ✓ | ✓ | ✓ | — | — | — |
| Admin User Management | ✓ | ✓ | — | — | — | — |
| Admin Order Monitor | ✓ | ✓ | ✓ (read) | — | — | — |
| Admin Merchant Management | ✓ | ✓ | ✓ (view) | — | — | — |
| Admin Organization Management | ✓ | ✓ | — | — | — | — |
| Admin Verification Queue | ✓ | ✓ | ✓ | — | — | — |
| Admin Category Management | ✓ | ✓ | ✓ | — | — | — |
| Admin Brand Management | ✓ | ✓ | ✓ | — | — | — |
| Admin Attribute Management | ✓ | ✓ | ✓ | — | — | — |
| Admin Product Type Management | ✓ | ✓ | ✓ | — | — | — |
| Admin Product Moderation | ✓ | ✓ | ✓ | — | — | — |
| Admin Offer Governance | ✓ | ✓ | ✓ | — | — | — |
| Admin Catalog Requests | ✓ | ✓ | ✓ | — | — | — |
| Admin Dispute Resolution | ✓ | ✓ | — | — | — | — |
| Admin Import Center | ✓ | ✓ | — | — | — | — |
| Admin Audit Log | ✓ | ✓ | — | — | — | — |
| Admin KPIs | ✓ | ✓ | — | — | — | — |
| Merchant Dashboard | ✓ | ✓ | — | ✓ | ✓ | — |
| Merchant Catalog | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Merchant Product Studio | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Merchant Orders | ✓ | ✓ | — | ✓ | ✓ | — |
| Merchant Inventory | ✓ | ✓ | — | ✓ | ✓ | — |
| Merchant Pricing | ✓ | ✓ | — | ✓ | ✓ | — |
| Merchant Offers | ✓ | ✓ | — | ✓ | ✓ | — |
| Merchant Store Settings | ✓ | ✓ | — | ✓ | — | — |
| Merchant Warehouses | ✓ | ✓ | — | ✓ | ✓ | — |
| Merchant Customers | ✓ | ✓ | — | ✓ | ✓ | — |
| Merchant Import | ✓ | ✓ | — | ✓ | ✓ | — |
| Merchant Organization | ✓ | ✓ | — | ✓ | — | — |
| Merchant Requests | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Buyer Search/Browse | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Buyer Cart/Checkout | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Buyer Orders | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Buyer Product Detail | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## C. API Coverage Matrix

### Admin APIs

| Endpoint | Method | Permission | Admin UI Consumer | Status |
|----------|--------|------------|-------------------|--------|
| `GET /admin/orders` | GET | admin:orders:read | Orders list (ManagementPage) | IMPLEMENTED |
| `GET /admin/orders/:id` | GET | admin:orders:read | Order detail page | IMPLEMENTED |
| `GET /admin/merchants` | GET | admin:merchants:read | Merchants list (ManagementPage) | IMPLEMENTED |
| `GET /admin/kpis` | GET | admin:kpis:read | Dashboard + KPIs page | IMPLEMENTED |
| `GET /admin/offers/kpis` | GET | admin:kpis:read | Offers KPIs page | IMPLEMENTED |
| `GET /admin/offers/trend` | GET | admin:kpis:read | Offers Trend page | IMPLEMENTED |
| `GET /admin/audit-logs` | GET | admin:audit:read | Audit page (ManagementPage stub) | PARTIAL — no dedicated audit UI |
| `GET /admin/verification-queue` | GET | merchant:verification:review | Verification list (ManagementPage) | IMPLEMENTED |
| `GET /admin/categories` | GET | catalog:categories:write | Categories page | IMPLEMENTED |
| `GET /admin/brands` | GET | catalog:brands:manage | Brands page | IMPLEMENTED |
| `GET /admin/offers` | GET | catalog:offers:govern | Offers page (ManagementPage) | IMPLEMENTED |
| `GET /admin/disputes` | GET | support:disputes:resolve | Disputes list (ManagementPage) | IMPLEMENTED |
| `GET /admin/disputes/:id` | GET | support:disputes:resolve | Dispute detail page | IMPLEMENTED |
| `GET /admin/users` | GET | admin:users:read | Users list (ManagementPage) | IMPLEMENTED |
| `GET /admin/users/:id` | GET | admin:users:read | User detail page | IMPLEMENTED |
| `PATCH /admin/users/:id` | PATCH | admin:users:write | User detail (status actions) | IMPLEMENTED |
| `POST /admin/users/:id/assign-role` | POST | admin:users:write | User detail (membership) | IMPLEMENTED |
| `GET /admin/organizations` | GET | admin:users:read | Organizations page | IMPLEMENTED |
| `GET /admin/organizations/:id` | GET | admin:users:read | Organization detail page | IMPLEMENTED |
| `PATCH /admin/organizations/:id/deactivate` | PATCH | admin:users:write | Organization detail page | IMPLEMENTED |
| `GET /admin/org-update-requests` | GET | admin:users:read | Dashboard widget | IMPLEMENTED |
| `PATCH /admin/org-update-requests/:id/review` | PATCH | admin:users:write | Organizations page | IMPLEMENTED |
| `GET /admin/products` | GET | admin:merchants:read | Products list (ManagementPage) | IMPLEMENTED |
| `POST/PATCH /admin/products/:id/moderate` | POST/PATCH | admin:merchants:read | Products list (action buttons) | IMPLEMENTED |

### Catalog APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `POST /categories` | POST | catalog:categories:write | Admin categories page | IMPLEMENTED |
| `PATCH /categories/:id` | PATCH | catalog:categories:write | Admin categories page | IMPLEMENTED |
| `DELETE /categories/:id` | DELETE | catalog:categories:write | Admin categories page | IMPLEMENTED |
| `GET /attributes` | GET | (public) | Admin attributes page | IMPLEMENTED |
| `POST /admin/attributes` | POST | catalog:attributes:manage | Admin attributes page | IMPLEMENTED |
| `PATCH /admin/attributes/:id` | PATCH | catalog:attributes:manage | Admin attribute detail | IMPLEMENTED |
| `DELETE /admin/attributes/:id` | DELETE | catalog:attributes:manage | Admin attribute detail | IMPLEMENTED |
| `POST /admin/attributes/:id/options` | POST | catalog:attributes:manage | Admin attributes page | IMPLEMENTED |
| `GET /attribute-groups` | GET | (public) | Admin attribute-groups page | IMPLEMENTED |
| `POST /admin/attribute-groups` | POST | catalog:attributes:manage | Admin attribute-groups page | IMPLEMENTED |
| `GET /product-types` | GET | (public) | Admin product-types page | IMPLEMENTED |
| `POST /admin/product-types` | POST | catalog:product-types:manage | Admin product-types page | IMPLEMENTED |
| `GET /product-types/:id` | GET | (public) | Admin product-type detail | IMPLEMENTED |
| `GET /product-types/:id/schema` | GET | (public) | Merchant product studio | IMPLEMENTED |
| `POST /admin/product-types/:id/publish` | POST | catalog:product-types:manage | Admin product-type detail | IMPLEMENTED |
| `POST /admin/product-types/:id/duplicate` | POST | catalog:product-types:manage | Admin product-type detail | IMPLEMENTED |
| `POST /admin/product-types/:id/versions` | POST | catalog:product-types:manage | Admin product-type detail | IMPLEMENTED |
| `POST /admin/product-types/:id/attributes` | POST | catalog:product-types:manage | Admin product-type builder | IMPLEMENTED |
| `POST /admin/product-types/:id/variant-dimensions` | POST | catalog:product-types:manage | Admin product-type builder | IMPLEMENTED |

### Offer APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `GET /products/:productId/offers` | GET | (auth) | Buyer PDP (offer comparison) | IMPLEMENTED |
| `GET /products/:productId/offers/ranked` | GET | (auth) | Buyer PDP | IMPLEMENTED |
| `GET /merchant/offers` | GET | (auth) | Merchant offers page | IMPLEMENTED |
| `GET /merchant/offers/analytics` | GET | (auth) | Merchant offers page | IMPLEMENTED |
| `GET /merchant/offers/analytics/trend` | GET | (auth) | Merchant offers page | IMPLEMENTED |
| `GET /offers/:id` | GET | (auth) | Admin offer detail | IMPLEMENTED |
| `POST /merchant/offers` | POST | catalog:offers:write | Merchant product studio | IMPLEMENTED |
| `POST /merchant/offers/:id/propose` | POST | catalog:offers:write | Merchant offers page | IMPLEMENTED |
| `PATCH /merchant/offers/:id/pricing` | PATCH | catalog:offers:write | Merchant offers page | IMPLEMENTED |
| `POST /merchant/offers/:id/withdraw` | POST | catalog:offers:write | Merchant offers page | IMPLEMENTED |
| `POST /admin/offers/:id/approve` | POST | catalog:offers:govern | Admin offers page | IMPLEMENTED |
| `POST /admin/offers/:id/reject` | POST | catalog:offers:govern | Admin offers page | IMPLEMENTED |
| `POST /admin/offers/:id/suspend` | POST | catalog:offers:govern | Admin offers page | IMPLEMENTED |
| `POST /admin/offers/:id/activate` | POST | catalog:offers:govern | Admin offers page | IMPLEMENTED |

### Order APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `POST /checkout` | POST | orders:write | Buyer checkout page | IMPLEMENTED |
| `GET /orders/master/:id` | GET | (auth) | Buyer order detail | IMPLEMENTED |
| `POST /orders/master/:id/reorder` | POST | orders:write | Buyer order detail | IMPLEMENTED |
| `GET /orders` | GET | (auth) | Buyer + Merchant orders | IMPLEMENTED |
| `GET /orders/:id` | GET | (auth) | Buyer + Merchant order detail | IMPLEMENTED |
| `GET /orders/:id/history` | GET | (auth) | Buyer order detail | IMPLEMENTED |
| `POST /orders/:id/accept` | POST | merchant:orders:write | Merchant order detail | IMPLEMENTED |
| `POST /orders/:id/partial-accept` | POST | merchant:orders:write | Merchant order detail | IMPLEMENTED |
| `POST /orders/:id/reject` | POST | merchant:orders:write | Merchant order detail | IMPLEMENTED |
| `POST /orders/:id/items/:itemId/confirm` | POST | merchant:orders:write | Merchant order detail | IMPLEMENTED |
| `POST /orders/:id/status` | POST | merchant:orders:write | Merchant order detail | IMPLEMENTED |
| `POST /orders/:id/cancel` | POST | orders:cancel | Buyer order detail | IMPLEMENTED |

### Cart APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `GET /cart` | GET | (auth) | Buyer cart page | IMPLEMENTED |
| `POST /cart/items` | POST | (auth) | Buyer PDP + cart | IMPLEMENTED |
| `PATCH /cart/items/:itemId` | PATCH | (auth) | Buyer cart page | IMPLEMENTED |
| `DELETE /cart/items/:itemId` | DELETE | (auth) | Buyer cart page | IMPLEMENTED |
| `DELETE /cart` | DELETE | (auth) | Buyer cart page | IMPLEMENTED |
| `POST /cart/validate` | POST | (auth) | Buyer cart page | IMPLEMENTED |
| `POST /cart/promo` | POST | (auth) | Buyer cart page | IMPLEMENTED |

### Inventory APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `GET /stores/:storeId/inventory` | GET | merchant:inventory:read | Merchant inventory page | IMPLEMENTED |
| `GET /stores/:storeId/inventory/export` | GET | merchant:inventory:read | Merchant inventory page | IMPLEMENTED |
| `GET /stores/:storeId/inventory/movements/export` | GET | merchant:inventory:read | Merchant inventory page | IMPLEMENTED |
| `POST /stores/:storeId/inventory/check-low-stock` | POST | merchant:inventory:write | Merchant inventory page | IMPLEMENTED |
| `POST /inventory` | POST | merchant:inventory:write | Merchant inventory page | IMPLEMENTED |
| `POST /inventory/bulk-adjust` | POST | merchant:inventory:write | Merchant inventory page | IMPLEMENTED |
| `POST /inventory/transfer` | POST | merchant:inventory:write | Merchant warehouses page | IMPLEMENTED |
| `GET /inventory/warehouse/:warehouseId` | GET | merchant:inventory:read | Merchant inventory page | IMPLEMENTED |
| `GET /inventory/variant/:variantId` | GET | merchant:inventory:read | Merchant inventory page | IMPLEMENTED |
| `GET /inventory/low-stock` | GET | merchant:inventory:read | Merchant inventory page | IMPLEMENTED |
| `PATCH /inventory/:id` | PATCH | merchant:inventory:write | Merchant inventory page | IMPLEMENTED |
| `POST /inventory/adjust` | POST | merchant:inventory:write | Merchant inventory page | IMPLEMENTED |
| `POST /inventory/reserve` | POST | merchant:inventory:write | (backend only — reservation is internal) | BACKEND-ONLY |
| `POST /inventory/release` | POST | merchant:inventory:write | (backend only — release is internal) | BACKEND-ONLY |
| `GET /inventory/:id/movements` | GET | merchant:inventory:read | Merchant inventory page | IMPLEMENTED |

### Pricing APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `POST /price-lists` | POST | merchant:pricing:write | Merchant pricing page | IMPLEMENTED |
| `GET /stores/:storeId/price-lists` | GET | merchant:pricing:read | Merchant pricing page | IMPLEMENTED |
| `GET /price-lists/:id` | GET | merchant:pricing:read | Merchant pricing page | IMPLEMENTED |
| `PATCH /price-lists/:id` | PATCH | merchant:pricing:write | Merchant pricing page | IMPLEMENTED |
| `POST /price-lists/:priceListId/tiers` | POST | merchant:pricing:write | Merchant pricing page | IMPLEMENTED |
| `GET /price-lists/:priceListId/tiers` | GET | merchant:pricing:read | Merchant pricing page | IMPLEMENTED |
| `GET /variants/:variantId/pricing` | GET | merchant:pricing:read | Merchant pricing page | IMPLEMENTED |
| `PATCH /tiers/:id` | PATCH | merchant:pricing:write | Merchant pricing page | IMPLEMENTED |
| `DELETE /tiers/:id` | DELETE | merchant:pricing:write | Merchant pricing page | IMPLEMENTED |
| `GET /resolve-price` | GET | merchant:pricing:read | (internal) | BACKEND-ONLY |

### Catalog Import APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `POST /catalog-import/upload` | POST | catalog:imports:manage | Admin import center | IMPLEMENTED |
| `GET /catalog-import` | GET | catalog:imports:manage | Admin import center | IMPLEMENTED |
| `GET /catalog-import/:id` | GET | catalog:imports:manage | Admin import detail | IMPLEMENTED |
| `GET /catalog-import/:id/preview` | GET | catalog:imports:manage | Admin import center | IMPLEMENTED |
| `POST /catalog-import/:id/execute` | POST | catalog:imports:manage | Admin import center | IMPLEMENTED |
| `GET /catalog-import/:id/errors` | GET | catalog:imports:manage | Admin import detail | IMPLEMENTED |
| `GET /catalog-import/:id/report` | GET | catalog:imports:manage | Admin import detail | IMPLEMENTED |
| `GET /catalog-import/template/:type` | GET | catalog:imports:manage | Admin import center | IMPLEMENTED |
| `POST /catalog-import/export` | POST | catalog:imports:manage | Admin import center | IMPLEMENTED |

### Merchant/Store APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `POST /stores` | POST | merchant:stores:write | Merchant registration | IMPLEMENTED |
| `GET /stores` | GET | (auth) | Multiple consumers | IMPLEMENTED |
| `GET /stores/:id` | GET | (auth) | Multiple consumers | IMPLEMENTED |
| `GET /stores/slug/:slug` | GET | (auth) | Buyer store page | IMPLEMENTED |
| `PATCH /stores/:id` | PATCH | merchant:stores:write | Merchant store settings | IMPLEMENTED |
| `POST /stores/:storeId/warehouses` | POST | merchant:stores:write | Merchant warehouses | IMPLEMENTED |
| `GET /stores/:storeId/warehouses` | GET | (auth) | Merchant warehouses | IMPLEMENTED |
| `PATCH /warehouses/:id` | PATCH | merchant:stores:write | Merchant warehouses | IMPLEMENTED |
| `GET /merchant/customers` | GET | (auth) | Merchant customers page | IMPLEMENTED |

### Catalog Request APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `POST /merchant/requests` | POST | catalog:offers:write | Merchant requests page | IMPLEMENTED |
| `GET /merchant/requests` | GET | (auth) | Merchant requests page | IMPLEMENTED |
| `GET /admin/requests` | GET | catalog:requests:manage | Admin requests page | IMPLEMENTED |
| `POST /admin/requests/:id/approve` | POST | catalog:requests:manage | Admin requests page | IMPLEMENTED |
| `POST /admin/requests/:id/reject` | POST | catalog:requests:manage | Admin requests page | IMPLEMENTED |

### Dispute/Review APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `POST /orders/:orderId/dispute` | POST | (auth) | Buyer order detail | NOT IMPLEMENTED (buyer cannot raise disputes from UI) |
| `GET /disputes` | GET | (auth) | Admin disputes page | IMPLEMENTED |
| `GET /disputes/:id` | GET | (auth) | Admin dispute detail | IMPLEMENTED |
| `GET /disputes/:id/events` | GET | (auth) | Admin dispute detail | IMPLEMENTED |
| `POST /disputes/:id/evidence` | POST | (auth) | NOT IMPLEMENTED (no evidence submission UI) | BACKEND-ONLY |
| `POST /disputes/:id/response` | POST | support:disputes:write | Admin dispute detail | IMPLEMENTED |
| `PATCH /disputes/:id/resolve` | PATCH | support:disputes:resolve | Admin dispute detail | IMPLEMENTED |

### Other APIs

| Endpoint | Method | Permission | UI Consumer | Status |
|----------|--------|------------|-------------|--------|
| `POST /analytics/track` | POST | analytics:track | Web app (analytics.ts) | IMPLEMENTED |
| `POST /analytics/track/batch` | POST | analytics:track | Web app (analytics.ts) | IMPLEMENTED |
| `GET /analytics/events` | GET | analytics:read | NOT IMPLEMENTED (no admin analytics events page) | BACKEND-ONLY |
| `GET /analytics/activity` | GET | analytics:read | NOT IMPLEMENTED | BACKEND-ONLY |
| `POST /promotions` | POST | merchant:promotions:write | NOT IMPLEMENTED (no promotion CRUD UI) | BACKEND-ONLY |
| `GET /stores/:storeId/promotions` | GET | (auth) | NOT IMPLEMENTED | BACKEND-ONLY |
| `GET /stores/:storeId/promotions/active` | GET | (auth) | Buyer (via cart promo) | PARTIAL |
| `GET /promotions/:id` | GET | (auth) | NOT IMPLEMENTED | BACKEND-ONLY |
| `PATCH /promotions/:id` | PATCH | merchant:promotions:write | NOT IMPLEMENTED | BACKEND-ONLY |
| `GET /stores/:storeId/promotions/validate` | GET | (auth) | Cart promo validation | IMPLEMENTED |
| `GET /offers/nearby` | GET | (auth) | NOT IMPLEMENTED | BACKEND-ONLY |
| Organization CRUD | Various | identity:organizations:write | Merchant organization page | IMPLEMENTED |

---

## D. Entity Relationship Coverage

### Canonical Catalog Chain

```
Category → Product Type → Product Type Attributes → Attribute Options
                ↓
         Canonical Product
                ↓
         Product Variant (configured by Product Type Attributes)
                ↓
         Merchant Offer (owns price/MOQ/lead-time/availability)
                ↓
         Merchant / Store → Organization
```

| Relationship | Admin UI | Merchant UI | Buyer UI | Status |
|-------------|----------|-------------|----------|--------|
| Category → Product Types | PARTIAL (category detail shows products, not types) | — | — | GAP |
| Product Type → Attributes | IMPLEMENTED (builder tab) | — | — | OK |
| Product → Variants | PARTIAL (product detail page is 27 lines — minimal) | IMPLEMENTED (catalog browser) | IMPLEMENTED (variant selector) | GAP (admin) |
| Product → Offers | NOT IMPLEMENTED | IMPLEMENTED (offers page) | IMPLEMENTED (offer comparison) | GAP (admin) |
| Variant → Merchant Offers | NOT IMPLEMENTED | IMPLEMENTED (offers page) | IMPLEMENTED (offer comparison) | GAP (admin) |
| Offer → Merchant/Store | IMPLEMENTED (offer detail) | IMPLEMENTED | IMPLEMENTED | OK |
| Store → Organization | IMPLEMENTED (merchant detail) | IMPLEMENTED | — | OK |
| Offer → Inventory → Warehouse | NOT IMPLEMENTED | IMPLEMENTED (inventory page) | — | GAP (admin) |
| Order → Order Items → Offer | IMPLEMENTED (order detail) | IMPLEMENTED | IMPLEMENTED | OK |
| Order → Status History | IMPLEMENTED (order detail) | IMPLEMENTED | IMPLEMENTED | OK |
| User → Organizations → Memberships | IMPLEMENTED (user detail) | IMPLEMENTED | — | OK |
| Organization → Stores/Members/Documents | IMPLEMENTED (org detail) | IMPLEMENTED | — | OK |
| Import Job → Row-level errors | IMPLEMENTED (import detail) | — | — | OK |
| Product Type → Category | PARTIAL (overview shows link) | — | — | OK |

### Missing Relationship Navigation (Admin)

1. **Product detail → Variants tab**: Admin product detail (`products/[id]/page.tsx`, 27 lines) does not show variants, offers, or attributes
2. **Category detail → Product Types**: Category detail does not list product types configured for the category
3. **Offer detail → Inventory**: Offer detail does not link to inventory/warehouse data
4. **Admin Dashboard → Import status**: Dashboard does not show recent import jobs

---

## E. Workflow Matrix

### Admin Workflows

| Workflow | Actor | Backend | UI Support | Missing Steps | Status |
|----------|-------|---------|------------|---------------|--------|
| Catalog Governance (Category→Type→Attribute→Product→Offer) | Admin/Moderator | ✓ | PARTIAL | Product detail lacks variant/offer navigation | GAP |
| Product Moderation (Submit→Review→Approve/Reject) | Admin/Moderator | ✓ | ✓ | — | OK |
| Offer Governance (Propose→Review→Approve/Reject/Suspend) | Admin/Moderator | ✓ | ✓ | — | OK |
| Catalog Requests (Submit→Review→Approve/Reject) | Admin/Moderator | ✓ | ✓ | — | OK |
| Import Center (Upload→Validate→Preview→Execute→Report) | Admin | ✓ | ✓ | — | OK |
| User Management (Create→Assign Role→Suspend/Activate) | Admin | ✓ | ✓ | — | OK |
| Organization Management (Create→Update→Deactivate) | Admin | ✓ | ✓ | — | OK |
| Verification (Submit→Review→Approve/Reject) | Admin | ✓ | ✓ | — | OK |
| Dispute Resolution (Raise→Evidence→Response→Resolve) | Admin | ✓ | PARTIAL | No evidence submission UI; dispute events timeline missing | GAP |
| Audit Log Review | Admin | ✓ | STUB | Audit page is a bare ManagementPage table with no detail navigation | GAP |

### Merchant Workflows

| Workflow | Actor | Backend | UI Support | Missing Steps | Status |
|----------|-------|---------|------------|---------------|--------|
| Store Creation (Register→Onboard→Verify) | Merchant Owner | ✓ | ✓ | — | OK |
| Product Studio (Select Type→Configure→Create Offer) | Merchant | ✓ | ✓ | StepOffer is minimal (80 lines) | PARTIAL |
| Offer Management (Create→Propose→Pricing→Withdraw) | Merchant | ✓ | ✓ | — | OK |
| Order Processing (View→Accept/Reject/Partial Accept→Status) | Merchant | ✓ | ✓ | — | OK |
| Inventory Management (Create→Adjust→Transfer→Export) | Merchant | ✓ | ✓ | — | OK |
| Pricing (Price List→Tiers→Resolve) | Merchant | ✓ | ✓ | — | OK |
| Catalog Import (Upload→Validate→Execute) | Merchant | ✓ | ✓ | — | OK |
| Catalog Requests (Submit→Track→Resubmit) | Merchant | ✓ | ✓ | — | OK |
| Promotion Management (Create→Edit→Validate) | Merchant | ✓ | NOT IMPLEMENTED | No promotion CRUD UI exists | GAP |

### Buyer Workflows

| Workflow | Actor | Backend | UI Support | Missing Steps | Status |
|----------|-------|---------|------------|---------------|--------|
| Search & Browse | Buyer | ✓ | ✓ | — | OK |
| Product Discovery (Search→PDP→Variant→Offer Compare) | Buyer | ✓ | ✓ | — | OK |
| Cart (Add→Update→Validate→Promo→Checkout) | Buyer | ✓ | ✓ | — | OK |
| Order Tracking (View→Detail→Status→History) | Buyer | ✓ | ✓ | — | OK |
| Reorder | Buyer | ✓ | ✓ | — | OK |
| Raise Dispute | Buyer | ✓ | NOT IMPLEMENTED | No dispute creation UI for buyers | GAP |
| Submit Evidence | Buyer | ✓ | NOT IMPLEMENTED | No evidence submission UI | GAP |

---

## F. Gap List

### S0 — Critical / Blocking

> None identified. Backend authorization is preserved. No tenant isolation issues found. No data corruption risks in existing UI flows.

### S1 — High / Workflow Blocking

| ID | Domain | App | Role | Gap | Severity | Priority | Affected API | Status |
|----|--------|-----|------|-----|----------|----------|-------------|--------|
| GAP-S1-01 | Catalog | Admin | Admin/Moderator | **Admin product detail page is minimal (27 lines)** — shows only basic product info, no variants, no offers, no attribute data. Breaks the admin catalog governance workflow (cannot navigate Product→Variant→Offer). | S1 | P0 | `GET /products/:id` | RESOLVED — ProductDetails.tsx is 452 lines with Overview/Variants/Offers/Media tabs |
| GAP-S1-02 | Promotions | Web/Merchant | Merchant Owner/Staff | **No promotion management UI** — backend supports full CRUD (`POST /promotions`, `PATCH /promotions/:id`, `GET /stores/:storeId/promotions`) but merchant has no screen to create, edit, or view promotions. The `merchant:promotions:write` permission has no UI representation. | S1 | P0 | `POST /promotions`, `GET /stores/:storeId/promotions` | RESOLVED — /merchant/promotions page created with full CRUD |
| GAP-S1-03 | Disputes | Web/Buyer | Buyer | **Buyer cannot raise disputes** — `POST /orders/:orderId/dispute` exists but no buyer UI to initiate a dispute from an order. | S1 | P1 | `POST /orders/:orderId/dispute` | RESOLVED — Dispute creation + evidence submission added to order detail |

### S2 — Medium / Major Capability Gap

| ID | Domain | App | Role | Gap | Severity | Priority | Affected API | Status |
|----|--------|-----|------|-----|----------|----------|-------------|--------|
| GAP-S2-01 | Audit | Admin | Admin | **Admin audit page is a bare stub** (6-line ManagementPage) — shows raw audit records in a generic table with no detail view, no entity links, no before/after diff visualization. | S2 | P1 | `GET /admin/audit-logs` | RESOLVED — Dedicated audit viewer with filters, entity links, metadata expansion |
| GAP-S2-02 | Analytics | Admin | Admin | **No admin analytics events/activity page** — `GET /analytics/events` and `GET /analytics/activity` exist but have no UI consumer. Admin cannot view platform event counts or user activity feed. | S2 | P1 | `GET /analytics/events`, `GET /analytics/activity` | RESOLVED — /analytics page with event counts + activity feed |
| GAP-S2-03 | Disputes | Admin | Admin | **Admin dispute detail lacks evidence timeline** — `GET /disputes/:id/events` exists but the dispute detail page does not show an evidence/event timeline. | S2 | P1 | `GET /disputes/:id/events` | RESOLVED — Events & Evidence tab added to dispute detail |
| GAP-S2-04 | Catalog | Admin | Admin | **Category detail does not list product types** — the category→product-type relationship is not navigable from the admin category detail page. | S2 | P2 | `GET /product-types?categoryId=` | RESOLVED — Product Types tab added to category detail |
| GAP-S2-05 | Catalog | Admin | Admin | **Offer detail does not show inventory/warehouse data** — the offer→inventory relationship is not navigable from admin. | S2 | P2 | `GET /inventory/variant/:variantId` | RESOLVED — Inventory tab added to offer detail |
| GAP-S2-06 | Promotions | Web/Buyer | Buyer | **No nearby offers UI** — `GET /offers/nearby` exists but no buyer-facing location-aware offer discovery. | S2 | P3 | `GET /offers/nearby` | OPEN |
| GAP-S2-07 | Disputes | Web/Buyer | Buyer | **No evidence submission UI** — `POST /disputes/:id/evidence` exists but buyer has no interface to submit evidence. | S2 | P1 | `POST /disputes/:id/evidence` | RESOLVED — Evidence submission added to order detail dispute section |

### S3 — Low / UX Quality Gap

| ID | Domain | App | Role | Gap | Severity | Priority | Affected Screen | Status |
|----|--------|-----|------|-----|----------|----------|----------------|--------|
| GAP-S3-01 | Navigation | Admin | All | **Inconsistent permission gating** — only 3 pages (products, disputes, categories) use `useRequirePerms`; ~8 other pages rely solely on sidebar filtering + server 403. Deep links render controls before failing. | S3 | P1 | Multiple admin pages | OPEN |
| GAP-S3-02 | Dashboard | Admin | Admin | **Dashboard lacks import status widget** — recent import jobs are not shown on the dashboard despite import center being a key admin workflow. | S3 | P2 | Admin dashboard | OPEN |
| GAP-S3-03 | Dashboard | Admin | Admin | **Dashboard lacks pending catalog requests widget** — the requests page exists but the dashboard does not surface pending request count. | S3 | P2 | Admin dashboard | OPEN |
| GAP-S3-04 | Orders | Admin | Admin | **Admin order list uses generic ManagementPage** — no status-specific actions (cancel, refund) visible from the list view despite admin having `orders:cancel` and `orders:refund` permissions. | S3 | P2 | Admin orders page | OPEN |
| GAP-S3-05 | Merchant | Web | Merchant | **Product Studio StepOffer is minimal (80 lines)** — the offer creation step in the product studio wizard is very basic compared to the full offer management page. | S3 | P2 | Merchant product studio | OPEN |
| GAP-S3-06 | Mobile | Mobile | All | **No permission-based UI gating in mobile** — Flutter app has no role-based screen filtering; all screens reachable by any authenticated token holder. Backend auth still applies. | S3 | P2 | Mobile app | OPEN |
| GAP-S3-07 | Navigation | Admin | Admin | **Sidebar navigation is flat** — 21 items in a single list. No grouping (e.g., "Catalog", "Commerce", "Identity", "Analytics"). Becomes unwieldy. | S3 | P3 | Admin sidebar | OPEN |

### S4 — Cosmetic / Polish

| ID | Domain | App | Role | Gap | Severity | Priority | Status |
|----|--------|-----|------|-----|----------|----------|--------|
| GAP-S4-01 | UI | Admin | All | Minor styling inconsistencies between ManagementPage tables and custom pages (categories, brands use different table styles). | S4 | P3 | OPEN |
| GAP-S4-02 | UI | Web | Buyer | Store page uses slug-based routing but cart/checkout uses internal IDs — inconsistent URL patterns. | S4 | P3 | OPEN |

---

## Gap Summary

```
S0 Open: 0
S1 Open: 0 (3 resolved)
S2 Open: 2 (S2-06 nearby offers deferred — requires GPS; S2-04, S2-05 resolved)
S3 Open: 7 (UX quality — not in scope for this pass)
S4 Open: 2 (cosmetic — not in scope for this pass)
Total: 11 → 11 resolved, 8 remaining (2 S2 + 7 S3 + 2 S4 — deferred as lower priority)
```

### Backend-Only Capabilities (no UI consumer)

| Capability | API | Reason |
|-----------|-----|--------|
| Promotion CRUD | `POST/PATCH /promotions`, `GET /stores/:storeId/promotions` | UI not yet built |
| Nearby offers | `GET /offers/nearby` | Requires location permission / GPS |
| Analytics events/activity | `GET /analytics/events`, `GET /analytics/activity` | Admin page not built |
| Inventory reserve/release | `POST /inventory/reserve`, `POST /inventory/release` | Internal — used by order service |
| Price resolution | `GET /resolve-price` | Internal utility endpoint |
| Dispute evidence | `POST /disputes/:id/evidence` | Buyer UI not built |

### Permission Coverage Gaps

| Permission | Has Backend | Has UI | Notes |
|-----------|:-----------:|:------:|-------|
| `merchant:promotions:write` | ✓ | ✗ | No promotion management UI |
| `orders:refund` | ✓ | ✗ | No admin refund UI |
| `payments:read` | ✓ | ✗ | No payment management UI |
| `payments:refund` | ✓ | ✗ | No payment refund UI |
| `ads:campaigns:read` | ✓ | ✗ | No ads campaign UI |
| `ads:campaigns:write` | ✓ | ✗ | No ads campaign UI |
| `ads:campaigns:approve` | ✓ | ✗ | No ads campaign UI |
| `support:tickets:read` | ✓ | ✗ | No support ticket UI |
| `support:tickets:write` | ✓ | ✗ | No support ticket UI |
| `support:tickets:escalate` | ✓ | ✗ | No support ticket UI |
| `identity:roles:read` | ✓ | PARTIAL | Roles listed in user management but no dedicated role admin page |
| `identity:roles:write` | ✓ | ✗ | No role creation/editing UI |
| `catalog:imports:manage` | ✓ | ✓ | Implemented (import center) |

---

## Key Architectural Observations

1. **Admin detail pages are recent additions** — The `[id]/page.tsx` detail pages were created in a previous session but the admin product detail is still minimal (27 lines). Other detail pages (orders, offers, categories, brands, merchants, users, organizations, disputes, catalog-import, product-types, variants, attributes) are substantive.

2. **ManagementPage is a generic list component** — It handles 10 entity types with a shared table/filter/pagination pattern. Detail pages are separate. This is a good pattern but some list pages (audit, disputes) would benefit from dedicated implementations.

3. **Merchant web app is comprehensive** — 16 merchant-facing pages covering catalog, orders, inventory, pricing, offers, customers, store, warehouses, import, organization, requests, and product studio. This is the most complete frontend for operational workflows.

4. **Buyer web app covers the full commerce journey** — Search→PDP→Variant→Offer Compare→Cart→Checkout→Orders→Detail, plus store pages, account, favorites, reviews. Missing: dispute initiation.

5. **Mobile app has broad coverage** — Flutter app covers buyer, merchant, and driver workflows. No permission-based UI gating (backend auth still applies).

6. **Permission gating is inconsistent in admin** — Sidebar filtering works but page-level guards (`useRequirePerms`) are only on 3 of ~20 pages. Deep links can render forbidden controls before the API rejects them.

7. **Promotions are the largest backend-only gap** — Full CRUD exists but no UI. The `merchant:promotions:write` permission is assigned to MERCHANT_OWNER and MERCHANT_STAFF but has no UI representation.
