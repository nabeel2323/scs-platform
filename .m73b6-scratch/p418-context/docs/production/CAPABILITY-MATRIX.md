# SCS Platform — Capability Matrix

**Last Updated:** 2026-09-25
**Phase:** 5 (Frontend Capability & Workflow Completion)
**Status Legend:** ✅ COMPLETE | ⚠️ PARTIAL | ❌ MISSING | 🔶 BACKEND GAP

---

## Summary

| Domain | Backend APIs | Admin UI | Buyer Web | Merchant Web | Mobile | E2E Tests |
|--------|:-----------:|:--------:|:---------:|:------------:|:------:|:---------:|
| Identity & Auth | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Catalog — Taxonomy | ✅ | ✅ | ✅ (read) | ✅ (read) | ✅ (read) | ✅ |
| Catalog — Products | ✅ | ✅ | ✅ (read) | ✅ | ✅ | ✅ |
| Catalog — Offers | ✅ | ✅ | ✅ (read) | ✅ | ✅ | ✅ |
| Search & Discovery | ✅ | — | ✅ | — | ✅ | ✅ |
| Cart | ✅ | — | ✅ | — | ✅ | ✅ |
| Checkout & Orders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Inventory | ✅ | ✅ (read) | — | ✅ | ✅ | ✅ |
| Pricing | ✅ | ✅ (read) | — | ✅ | ✅ | ✅ |
| Promotions | ✅ | — | ✅ (apply) | ✅ | — | ✅ |
| Catalog Import | ✅ | ✅ | — | ✅ | — | ✅ |
| Reviews & Disputes | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| Notifications | ✅ | — | ✅ | — | ✅ | ✅ |
| Analytics & Audit | ✅ | ✅ | — | — | — | ✅ |
| Admin Governance | ✅ | ✅ | — | — | — | ✅ |
| Merchant Operations | ✅ | — | — | ✅ | ✅ | ✅ |
| Realtime | ✅ | — | ✅ | — | — | 🔶 |

---

## 1. Identity & Authentication

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| OTP login | ✅ `auth.controller` | — | ✅ `auth.ts` | ✅ `auth.ts` | ✅ `login_screen` | ✅ Ph3 |
| Password login | ✅ `auth.controller` | ✅ `auth/login` | ✅ `auth.ts` | ✅ `auth.ts` | ✅ `login_screen` | ✅ Ph3 |
| Token refresh | ✅ `auth.controller` | ✅ `authFetch` | ✅ `authFetch` | ✅ `authFetch` | ✅ Dio interceptor | ✅ Ph3 |
| Session management | ✅ `profile.controller` | ✅ `account` | ✅ `account` | ✅ `account` | ✅ `sessions` | ✅ Ph3 |
| Device trust | ✅ `profile.controller` | — | ✅ `account` | ✅ `account` | ✅ `credential_setup` | ✅ Ph3 |
| Profile CRUD | ✅ `profile.controller` | ✅ `account` | ✅ `account` | ✅ `account` | ✅ `profile_screen` | ✅ Ph3 |
| Organization CRUD | ✅ `organizations.controller` | ✅ `organizations` + detail | — | ✅ `organization` | ✅ `organizations_screen` | ✅ Ph3 |
| Org member management | ✅ `organizations.controller` | ✅ `organizations/[id]` | — | ✅ `organization` | ✅ `org_detail_screen` | ✅ Ph3 |
| Org switching | ✅ `identity.service` | — | ✅ `switchOrg` | ✅ `switchOrg` | ✅ provider | ✅ Ph3 |
| User management (admin) | ✅ `admin.controller` | ✅ `users` + detail | — | — | — | ✅ Ph3 |
| Credential setup | ✅ `profile.controller` | — | — | — | ✅ `credential_setup` | ✅ Ph3 |
| Password change | ✅ `profile.controller` | ✅ `account` | ✅ `account` | ✅ `account` | ✅ `change_password` | ✅ Ph3 |
| Merchant registration | ✅ `merchant.controller` | — | ✅ CTA in `account` | ✅ `register` | ✅ `merchant_register` | ✅ Ph1 |
| Merchant verification | ✅ `merchant.controller` | ✅ `verification` + detail | — | ✅ submit | — | ✅ Ph3 |

---

## 2. Catalog — Taxonomy

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Categories — list | ✅ `catalog.taxonomy.controller` | ✅ `categories` | ✅ in search filters | ✅ in catalog | ✅ `fetchCategories` | ✅ Ph1 |
| Categories — CRUD | ✅ `catalog.taxonomy.controller` | ✅ create/edit/detail | — | — | ✅ `category_manage` | ✅ Ph4 |
| Categories — detail | ✅ `catalog.taxonomy.controller` | ✅ `categories/[id]` | — | — | — | ✅ Ph4 |
| Brands — list | ✅ `catalog.taxonomy.controller` | ✅ `brands` | ✅ in search filters | ✅ in catalog | — | ✅ Ph1 |
| Brands — CRUD | ✅ `catalog.taxonomy.controller` | ✅ create/edit/detail | — | — | — | ✅ Ph4 |
| Brands — detail | ✅ `catalog.taxonomy.controller` | ✅ `brands/[id]` | — | — | — | ✅ Ph4 |
| Attributes — list | ✅ `catalog.taxonomy.controller` | ✅ `attributes` | ✅ as search facets | ✅ in Product Studio | — | ✅ Ph4 |
| Attributes — CRUD | ✅ `catalog.taxonomy.controller` | ✅ create/edit/detail | — | — | — | ✅ Ph4 |
| Attribute Groups — list | ✅ `catalog.taxonomy.controller` | ✅ `attribute-groups` | — | — | — | ✅ Ph4 |
| Product Types — list | ✅ `catalog.taxonomy.controller` | ✅ `product-types` | — | ✅ in Product Studio | — | ✅ Ph4 |
| Product Types — CRUD | ✅ `catalog.taxonomy.controller` | ✅ create/edit/detail | — | — | — | ✅ Ph4 |
| Product Types — schema editor | ✅ `catalog.taxonomy.controller` | ✅ `product-types/[id]` | — | — | — | ✅ Ph4 |
| Conditional rules | ✅ `conditional-rules.service` | ✅ in product types | — | — | — | ✅ Ph4 |

---

## 3. Catalog — Products & Variants

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Products — list | ✅ `catalog.controller` | ✅ `products` | ✅ via search | ✅ `catalog` | ✅ `merchant_catalog` | ✅ Ph1 |
| Products — detail | ✅ `catalog.controller` | ✅ `products/[id]` | ✅ `products/[id]` (PDP) | ✅ in catalog | ✅ `product_detail_screen` | ✅ Ph1 |
| Products — create | ✅ `catalog.controller` | — | — | ✅ Product Studio (6-step) | ✅ `product_edit_screen` | ✅ Ph4 |
| Products — edit | ✅ `catalog.controller` | ✅ moderation | — | ✅ Product Studio | ✅ `product_edit_screen` | ✅ Ph4 |
| Products — moderate | ✅ `admin.controller` | ✅ approve/reject | — | — | — | ✅ Ph3 |
| Products — bulk actions | ✅ `catalog.controller` | ✅ `ManagementPage` | — | ✅ `bulkProductAction` | — | ✅ Ph4 |
| Products — export CSV | ✅ `catalog.controller` | — | — | ✅ `exportProductsCsv` | — | ✅ Ph4 |
| Variants — list | ✅ `catalog.controller` | ✅ via product detail | ✅ in PDP | ✅ in Product Studio | ✅ in `product_detail` | ✅ Ph1 |
| Variants — detail | ✅ `catalog.controller` | ✅ `variants/[id]` | ✅ in PDP | — | ✅ in `product_detail` | ✅ Ph1 |
| Variants — create | ✅ `catalog.controller` | — | — | ✅ Product Studio step 3 | ✅ `product_edit_screen` | ✅ Ph4 |
| Variant attributes | ✅ `catalog.taxonomy.service` | ✅ in variant detail | ✅ in PDP specs | ✅ in Product Studio | ✅ spec table | ✅ Ph4 |
| Product media | ✅ `catalog.controller` | ✅ in product detail | ✅ gallery + zoom | ✅ Product Studio step 5 | ✅ image display | ✅ Ph1 |
| Data quality metrics | ✅ `admin.service` | ✅ `data-quality` | — | — | — | ✅ Ph4 |

---

## 4. Catalog — Offers

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Offers — list | ✅ `catalog.offer.controller` | ✅ `offers` | ✅ in PDP | ✅ `offers` | ✅ in `product_detail` | ✅ Ph1 |
| Offers — detail | ✅ `catalog.offer.controller` | ✅ `offers/[id]` (4 tabs) | — | ✅ in offers list | — | ✅ Ph4 |
| Offers — create | ✅ `catalog.offer.controller` | — | — | ✅ `createMerchantOffer` | — | ✅ Ph4 |
| Offers — pricing update | ✅ `catalog.offer.controller` | — | — | ✅ `updateOfferPricing` | — | ✅ Ph4 |
| Offer lifecycle (FSM) | ✅ DRAFT→PROPOSED→ACTIVE | ✅ approve/reject | — | ✅ propose | — | ✅ Ph4 |
| Offer comparison | ✅ multiple offers per variant | ✅ governance view | ✅ `OfferComparisonTable` | — | ✅ sort/compare | ✅ Ph1 |
| Offer ranked badges | ✅ `catalog.offer.service` | — | ✅ via `useOfferComparison` | — | — | ✅ Ph1 |
| Offer governance | ✅ `catalog.offer.service` | ✅ approve/reject/govern | — | — | — | ✅ Ph4 |
| Offer KPIs | ✅ `admin.service` | ✅ `offers-kpis` | — | — | — | ✅ Ph4 |
| Offer trend | ✅ `admin.service` | ✅ `offers-trend` | — | — | — | ✅ Ph4 |

---

## 5. Search & Discovery

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Full-text search | ✅ `search.service` (FTS + trigram) | — | ✅ `SearchPageClient` | — | ✅ `search_screen` | ✅ Ph1 |
| Category filter | ✅ `search.service` | — | ✅ multi-category | — | ✅ category filter | ✅ Ph1 |
| Brand filter | ✅ `search.service` | — | ✅ brand facet | — | — | ✅ Ph1 |
| Price range filter | ✅ `search.service` | — | ✅ min/max price | — | — | ✅ Ph1 |
| Verified merchant filter | ✅ `search.service` | — | ✅ toggle | — | — | ✅ Ph1 |
| In-stock filter | ✅ `search.service` | — | ✅ toggle | — | — | ✅ Ph1 |
| Attribute facets | ✅ `search.service` | — | ✅ dynamic facets | — | — | ✅ Ph1 |
| URL-backed state | — | — | ✅ shareable URLs | — | — | ✅ Ph1 |
| Debounced search | — | — | ✅ 300ms debounce | — | ✅ debounced | ✅ Ph1 |
| Product comparison | — | — | ✅ `compare` page (max 4) | — | — | ✅ Ph1 |
| Search queries log | ✅ `search.schema` | ✅ `analytics` | — | — | — | ✅ Ph4 |
| SEO metadata | — | — | ✅ `generateMetadata` | — | — | — |

---

## 6. Cart

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Add to cart | ✅ `cart.controller` | — | ✅ with offer attribution | — | ✅ `cart_screen` | ✅ Ph1 |
| Update quantity | ✅ `cart.controller` | — | ✅ inline edit | — | ✅ `updateCartItem` | ✅ Ph1 |
| Remove item | ✅ `cart.controller` | — | ✅ remove button | — | ✅ `removeCartItem` | ✅ Ph1 |
| Multi-supplier grouping | ✅ `cart.service` | — | ✅ grouped by store | — | ✅ grouped | ✅ Ph1 |
| Cart validation | ✅ `cart.service` | — | ✅ stale/repriced warnings | — | ✅ validation | ✅ Ph1 |
| Promo code application | ✅ `cart.service` | — | ✅ promo input | — | — | ✅ Ph2 |
| Offer attribution per line | ✅ `cart.schema` | — | ✅ per-item offer | — | ✅ per-item offer | ✅ Ph1 |
| Cart persistence | ✅ `cart.schema` | — | ✅ server-side | — | ✅ server-side | ✅ Ph1 |

---

## 7. Checkout & Orders

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Checkout | ✅ `orders.controller` | — | ✅ with idempotency | — | ✅ with UUID key | ✅ Ph1 |
| Idempotency | ✅ `orders.service` | — | ✅ `crypto.randomUUID()` | — | ✅ UUID | ✅ Ph1 |
| Master order creation | ✅ `orders.schema` | — | ✅ via order detail | — | ✅ via order detail | ✅ Ph1 |
| Sub-order per store | ✅ `orders.service` | — | ✅ in order detail | ✅ per-store view | ✅ in order detail | ✅ Ph2 |
| Financial breakdown | ✅ `order-pricing.ts` | ✅ in order detail | ✅ in order detail | ✅ in order detail | ✅ in order detail | ✅ Ph1 |
| Offer snapshot | ✅ `orders.service` | — | ✅ immutable | — | ✅ immutable | ✅ Ph1 |
| Fulfillment method | ✅ `orders.controller` | — | ✅ selection UI | — | ✅ radio group | ✅ Ph1 |
| Order list (buyer) | ✅ `orders.controller` | — | ✅ with status filter | — | ✅ `orders_list_screen` | ✅ Ph1 |
| Order list (merchant) | ✅ `orders.controller` | — | — | ✅ with store filter | ✅ `merchant_orders_screen` | ✅ Ph2 |
| Order list (admin) | ✅ `admin.controller` | ✅ `orders` + detail | — | — | — | ✅ Ph3 |
| Order detail | ✅ `orders.controller` | ✅ `orders/[id]` | ✅ `orders/[id]` | ✅ `merchant/orders/[id]` | ✅ `order_detail_screen` | ✅ Ph1 |
| Order cancel (buyer) | ✅ `orders.controller` | — | ✅ with reason | — | — | ✅ Ph2 |
| Order accept (merchant) | ✅ `orders.controller` | — | — | ✅ `handleAccept` | ✅ Accept button | ✅ Ph2 |
| Order partial accept | ✅ `orders.service` | — | — | ✅ `partiallyAcceptMerchantOrder` | — | ✅ Ph2 |
| Order reject (merchant) | ✅ `orders.controller` | — | — | ✅ `handleReject` | ✅ Reject button | ✅ Ph2 |
| FSM transitions | ✅ 16-state FSM | — | — | ✅ NEXT_STATUS_MAP | ✅ transition buttons | ✅ Ph1 |
| Order status timeline | ✅ `order_status_history` | ✅ in order detail | ✅ timeline component | ✅ in order detail | ✅ in order detail | ✅ Ph1 |
| Order reorder | ✅ `orders.controller` | — | ✅ reorder button | — | — | ✅ Ph2 |
| Order dispute (buyer) | ✅ `disputes.controller` | — | ✅ in order detail | — | ✅ `reviews_disputes` | ✅ Ph2 |
| Realtime status push | ✅ `realtime.gateway` | — | ✅ `watchOrder` | — | — | 🔶 |
| SLA banner | — | — | ✅ for pending confirmation | — | — | — |
| Concurrent accept protection | ✅ optimistic lock | — | — | ✅ error handling | ✅ error handling | ✅ Ph2 |

---

## 8. Inventory

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Inventory list (store) | ✅ `inventory.controller` | ✅ via data quality | — | ✅ `inventory` | ✅ `inventory_screen` | ✅ Ph2 |
| Inventory list (warehouse) | ✅ `inventory.controller` | — | — | ✅ `inventory` | ✅ `inventory_screen` | ✅ Ph2 |
| Stock adjustment | ✅ `inventory.controller` | — | — | ✅ `adjustStock` | ✅ adjust | ✅ Ph2 |
| Stock transfer | ✅ `inventory.controller` | — | — | ✅ `transferStock` | — | ✅ Ph2 |
| Bulk stock adjustment | ✅ `inventory.controller` | — | — | ✅ `bulkAdjust` | — | ✅ Ph2 |
| Stock reservation | ✅ `inventory.service` | — | — | ✅ auto on accept | ✅ auto on accept | ✅ Ph1 |
| Stock release | ✅ `inventory.service` | — | — | ✅ auto on cancel | ✅ auto on cancel | ✅ Ph2 |
| Stock consumption | ✅ `inventory.service` | — | — | ✅ auto on deliver | ✅ auto on deliver | ✅ Ph2 |
| Low stock alert | ✅ `inventory.controller` | — | — | ✅ `checkLowStock` | — | ✅ Ph2 |
| Stock movements ledger | ✅ `inventory.schema` | ✅ via audit | — | ✅ `exportInventoryCsv` | — | ✅ Ph2 |
| Inventory export CSV | ✅ `inventory.controller` | — | — | ✅ `exportInventoryCsv` | — | ✅ Ph2 |
| Inventory concurrency | ✅ atomic operations | — | — | — | — | ✅ Ph1 |
| Stock status in PDP | — | — | ✅ stock indicator | — | ✅ stock indicator | ✅ Ph1 |

---

## 9. Pricing

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Price lists — list | ✅ `pricing.controller` | ✅ via offer detail | — | ✅ `pricing` | — | ✅ Ph2 |
| Price lists — create | ✅ `pricing.controller` | — | — | ✅ `createPriceList` | — | ✅ Ph2 |
| Price tiers — list | ✅ `pricing.controller` | ✅ in offer detail | — | ✅ in pricing | — | ✅ Ph2 |
| Price tiers — create | ✅ `pricing.controller` | — | — | ✅ `addPriceTier` | — | ✅ Ph2 |
| Price tiers — CRUD | ✅ `pricing.controller` | — | — | ✅ edit/delete | — | ✅ Ph2 |
| Price resolution | ✅ `price-resolution.ts` | — | ✅ server-side | ✅ server-side | ✅ server-side | ✅ Ph1 |
| Variant pricing | ✅ `pricing.controller` | ✅ in product detail | ✅ in PDP offers | ✅ in pricing | ✅ in PDP | ✅ Ph2 |

---

## 10. Promotions

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Promotions — list | ✅ `promotions.controller` | — | — | ✅ `promotions` | — | ✅ Ph2 |
| Promotions — create | ✅ `promotions.controller` | — | — | ✅ `createPromotion` | — | ✅ Ph2 |
| Promotions — update | ✅ `promotions.controller` | — | — | ✅ edit | — | ✅ Ph2 |
| Promo code at checkout | ✅ `cart.service` | — | ✅ promo input | — | — | ✅ Ph2 |

---

## 11. Catalog Import

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| XLSX parse | ✅ `excel-parser.service` | ✅ `catalog-import` | — | ✅ `import` | — | ✅ Ph4 |
| Validate workbook | ✅ `excel-validator.service` | ✅ validation errors | — | ✅ validation | — | ✅ Ph4 |
| Resolve references | ✅ `excel-resolver.service` | ✅ pending resolution | — | ✅ resolution | — | ✅ Ph4 |
| Plan execution | ✅ `excel-planner.service` | ✅ CREATE/UPDATE/UNCHANGED | — | ✅ plan view | — | ✅ Ph4 |
| Execute import | ✅ `excel-executor.service` | ✅ results display | — | ✅ execute | — | ✅ Ph4 |
| Import idempotency | ✅ executor upserts | ✅ re-import safe | — | ✅ re-import safe | — | ✅ Ph4 |
| Import error handling | ✅ 7 error types | ✅ error display | — | ✅ error display | — | ✅ Ph4 |
| Template generator | ✅ `template-generator.service` | ✅ download template | — | ✅ download template | — | ✅ Ph4 |
| Import history | ✅ `catalog-import.schema` | ✅ `catalog-import/[id]` | — | ✅ import list | — | ✅ Ph4 |
| Security (macro/size) | ✅ reject .xlsm, >25MB | ✅ enforced | — | ✅ enforced | — | ✅ Ph4 |

---

## 12. Reviews & Disputes

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Reviews — list | ✅ `reviews.controller` | ✅ via product detail | ✅ `reviews` | — | ✅ `reviews_disputes` | ✅ Ph2 |
| Reviews — create | ✅ `reviews.controller` | — | ✅ write review | — | ✅ write review | ✅ Ph2 |
| Reviews — verify (admin) | ✅ `merchant.controller` | ✅ verify | — | — | — | ✅ Ph3 |
| Disputes — list | ✅ `disputes.controller` | ✅ `disputes` | ✅ `reviews` (tab) | — | ✅ `reviews_disputes` | ✅ Ph2 |
| Disputes — detail | ✅ `disputes.controller` | ✅ `disputes/[id]` (3 tabs) | ✅ in order detail | — | ✅ detail view | ✅ Ph2 |
| Disputes — create | ✅ `disputes.controller` | — | ✅ from order | — | ✅ from order | ✅ Ph2 |
| Disputes — evidence | ✅ `disputes.service` | ✅ evidence timeline | ✅ submit evidence | — | ✅ submit evidence | ✅ Ph2 |
| Disputes — events | ✅ `disputes.service` | ✅ color-coded timeline | ✅ event display | — | ✅ event display | ✅ Ph2 |

---

## 13. Notifications

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Notifications — list | ✅ `notifications.controller` | — | ✅ `notifications` | — | ✅ `notifications_screen` | ✅ Ph2 |
| Notifications — mark read | ✅ `notifications.controller` | — | ✅ optimistic toggle | — | ✅ mark read | ✅ Ph2 |
| Notifications — mark all read | ✅ `notifications.service` | — | ✅ mark all button | — | ✅ mark all | ✅ Ph2 |
| Notifications — filter | ✅ `notifications.service` | — | ✅ ALL/UNREAD/READ tabs | — | — | ✅ Ph2 |
| Realtime push | ✅ `realtime.gateway` | — | ✅ `onNotification` | — | ✅ push | 🔶 |

---

## 14. Analytics & Audit

| Capability | Backend | Admin | Buyer Web | Merchant Web | Mobile | E2E |
|-----------|:-------:|:-----:|:---------:|:------------:|:------:|:---:|
| Event tracking | ✅ `analytics.controller` | — | ✅ `analytics:track` | ✅ `analytics:track` | ✅ `analytics:track` | ✅ Ph3 |
| Event reading | ✅ `analytics.controller` | ✅ `analytics` | — | — | — | ✅ Ph4 |
| Audit log | ✅ `audit.service` + middleware | ✅ `audit` | — | — | — | ✅ Ph3 |
| KPIs (admin) | ✅ `admin.service` | ✅ `kpis` | — | — | — | ✅ Ph4 |
| Data quality | ✅ `admin.service` | ✅ `data-quality` | — | — | — | ✅ Ph4 |
| Catalog requests | ✅ `catalog.requests.controller` | ✅ `requests` | — | ✅ `requests` | — | ✅ Ph4 |

---

## 15. Admin Governance

| Capability | Backend | Admin UI | Permission | E2E |
|-----------|:-------:|:--------:|-----------|:---:|
| Dashboard | ✅ `admin.service` | ✅ `/` | `admin:dashboard:read` | ✅ Ph4 |
| User management | ✅ `admin.controller` | ✅ `/users` + detail | `admin:users:read` | ✅ Ph3 |
| Organization management | ✅ `admin.controller` | ✅ `/organizations` + detail | `admin:organizations:read` | ✅ Ph3 |
| Merchant oversight | ✅ `admin.controller` | ✅ `/merchants` + detail | `admin:merchants:read` | ✅ Ph3 |
| Product moderation | ✅ `admin.controller` | ✅ `/products` + detail | `admin:merchants:read` | ✅ Ph3 |
| Offer governance | ✅ `catalog.offer.service` | ✅ `/offers` + detail | `catalog:offers:govern` | ✅ Ph4 |
| Dispute resolution | ✅ `disputes.service` | ✅ `/disputes` + detail | `admin:disputes:read` | ✅ Ph3 |
| Verification queue | ✅ `merchant.service` | ✅ `/verification` + detail | `merchant:verification:review` | ✅ Ph3 |
| Catalog import center | ✅ `catalog-import.controller` | ✅ `/catalog-import` + detail | `catalog:import:execute` | ✅ Ph4 |
| Audit log | ✅ `audit.service` | ✅ `/audit` | `admin:audit:read` | ✅ Ph3 |
| Analytics | ✅ `analytics.service` | ✅ `/analytics` | `analytics:read` | ✅ Ph4 |
| KPIs | ✅ `admin.service` | ✅ `/kpis` | `admin:merchants:read` | ✅ Ph4 |
| Offer KPIs | ✅ `admin.service` | ✅ `/offers-kpis` | `admin:merchants:read` | ✅ Ph4 |
| Offer Trend | ✅ `admin.service` | ✅ `/offers-trend` | `admin:merchants:read` | ✅ Ph4 |
| Data Quality | ✅ `admin.service` | ✅ `/data-quality` | `admin:merchants:read` | ✅ Ph4 |
| Account Security | ✅ self-management | ✅ `/account` | Authenticated | ✅ Ph3 |

---

## 16. Merchant Operations

| Capability | Backend | Merchant Web | Mobile | E2E |
|-----------|:-------:|:------------:|:------:|:---:|
| Dashboard | ✅ `merchant.controller` | ✅ `/merchant` | ✅ `merchant_dashboard` | ✅ Ph2 |
| Catalog management | ✅ `catalog.controller` | ✅ `/merchant/catalog` | ✅ `merchant_catalog` | ✅ Ph4 |
| Product Studio | ✅ `catalog.controller` | ✅ 6-step wizard | ✅ `product_edit` | ✅ Ph4 |
| Offer management | ✅ `catalog.offer.controller` | ✅ `/merchant/offers` | ✅ in product detail | ✅ Ph4 |
| Inventory management | ✅ `inventory.controller` | ✅ `/merchant/inventory` | ✅ `inventory_screen` | ✅ Ph2 |
| Order management | ✅ `orders.controller` | ✅ `/merchant/orders` | ✅ `merchant_orders` | ✅ Ph2 |
| Order accept/reject | ✅ `orders.controller` | ✅ accept/reject/cancel | ✅ accept/reject | ✅ Ph2 |
| FSM transitions | ✅ `orders.service` | ✅ NEXT_STATUS_MAP | ✅ transition buttons | ✅ Ph1 |
| Customer directory | ✅ `merchant.service` | ✅ `/merchant/customers` | ✅ `merchant_customers` | ✅ Ph2 |
| Store profile | ✅ `merchant.controller` | ✅ `/merchant/store` | ✅ `store_profile` | ✅ Ph3 |
| Warehouse management | ✅ `merchant.controller` | ✅ `/merchant/warehouses` | — | ✅ Ph3 |
| Pricing management | ✅ `pricing.controller` | ✅ `/merchant/pricing` | — | ✅ Ph2 |
| Promotion management | ✅ `promotions.controller` | ✅ `/merchant/promotions` | — | ✅ Ph2 |
| Catalog import | ✅ `catalog-import.controller` | ✅ `/merchant/import` | — | ✅ Ph4 |
| Catalog requests | ✅ `catalog.requests.controller` | ✅ `/merchant/requests` | — | ✅ Ph4 |
| Organization settings | ✅ `organizations.controller` | ✅ `/merchant/organization` | ✅ `organizations` | ✅ Ph3 |
| Merchant registration | ✅ `merchant.controller` | ✅ `/merchant/register` | ✅ registration flow | ✅ Ph3 |

---

## 17. Cross-Cutting Concerns

### 17.1 Error Handling

| Error Type | Backend | Admin UI | Buyer Web | Mobile |
|-----------|:-------:|:--------:|:---------:|:------:|
| 400 Bad Request | ✅ RFC 7807 | ✅ ErrorNotice | ✅ ApiError + ErrorBanner | ✅ ErrorBanner |
| 401 Unauthorized | ✅ JwtAuthGuard | ✅ authFetch redirect | ✅ authFetch refresh | ✅ Dio interceptor |
| 403 Forbidden | ✅ PermissionsGuard | ✅ AccessDenied | ✅ ApiError | ✅ SnackBar |
| 404 Not Found | ✅ NestJS default | ✅ AdminErrorState | ✅ EmptyState | ✅ EmptyState |
| 409 Conflict | ✅ ConflictException | ✅ ErrorNotice | ✅ ApiError.detail | ✅ SnackBar |
| 422 Validation | ✅ ValidationPipe | ✅ ErrorNotice | ✅ ApiError.detail | ✅ SnackBar |
| 429 Rate Limit | ✅ ThrottlerGuard | ✅ ErrorNotice | ✅ ApiError.detail | ✅ SnackBar |
| 500 Server Error | ✅ Global filter | ✅ ErrorNotice + retry | ✅ ErrorBanner + retry | ✅ ErrorBanner + retry |
| Network failure | — | ✅ try/catch | ✅ try/catch | ✅ Dio catch |
| Timeout | — | ✅ fetch timeout | ✅ fetch timeout | ✅ Dio timeout |

### 17.2 UX States

| State | Admin | Buyer Web | Merchant Web | Mobile |
|-------|:-----:|:---------:|:------------:|:------:|
| Loading | ✅ SkeletonTable / AdminLoadingSkeleton | ✅ LoadingSpinner | ✅ LoadingSpinner | ✅ LoadingSpinner |
| Empty | ✅ "No matching records." | ✅ EmptyState | ✅ EmptyState | ✅ EmptyState widget |
| Success | ✅ Table with data | ✅ Data rendering | ✅ Data rendering | ✅ Data rendering |
| Error | ✅ ErrorNotice + retry | ✅ ErrorBanner + retry | ✅ ErrorBanner | ✅ ErrorBanner + retry |
| Mutation pending | ✅ disabled + "Saving..." | ✅ submitting + disabled | ✅ busy + opacity | ✅ CircularProgressIndicator |
| Mutation success | ✅ List reload | ✅ State update | ✅ State update + toast | ✅ SnackBar + invalidate |
| Mutation failure | ✅ ErrorNotice | ✅ ErrorBanner | ✅ ErrorBanner | ✅ SnackBar |

### 17.3 Permission UI

| Layer | Mechanism | Coverage |
|-------|-----------|----------|
| Admin route | `useRequirePerms` hook | All 38 admin pages |
| Admin menu | `AdminSidebar` filters 23 items by `user.perms` | All nav items |
| Admin buttons | Permission checks in action handlers | All mutation buttons |
| Merchant route | `hasMerchantAccess()` in layout | All merchant pages |
| Merchant menu | `isMerchantRole()` in Navbar | All nav items |
| Merchant buttons | `hasPerm()` checks | Store/warehouse CRUD |
| Mobile route | `profileProvider` role check in GoRouter | All merchant routes |
| Backend auth | `JwtAuthGuard` + `PermissionsGuard` + `tenant-scope.ts` | All endpoints |

---

## 18. Order FSM — Complete State Map

```
DRAFT → [SUBMITTED]
SUBMITTED → [PENDING_CONFIRMATION] (auto-advance)
PENDING_CONFIRMATION → [ACCEPTED, PARTIALLY_ACCEPTED, REJECTED, CANCELLED]
ACCEPTED → [PREPARING, CANCELLED]
PARTIALLY_ACCEPTED → [PREPARING, CANCELLED]
PREPARING → [READY, CANCELLED]
READY → [OUT_FOR_DELIVERY, ASSIGNED, DELIVERED, CANCELLED]
ASSIGNED → [PICKED_UP]
PICKED_UP → [OUT_FOR_DELIVERY]
OUT_FOR_DELIVERY → [DELIVERED]
DELIVERED → [COMPLETED, DISPUTED]
COMPLETED → [DISPUTED]
PAYMENT_PENDING → [PREPARING, CANCELLED]
CANCELLED → [] (terminal)
REJECTED → [] (terminal)
DISPUTED → [] (terminal)
```

| FSM Property | Verified |
|-------------|:--------:|
| All 16 statuses reachable | ✅ Ph1 |
| Terminal states reject transitions | ✅ Ph1 |
| Forbidden skips rejected | ✅ Ph1 |
| Status history complete | ✅ Ph1 |
| Concurrent accept safe (optimistic lock) | ✅ Ph2 |
| Stock reserved on accept | ✅ Ph2 |
| Stock released on cancel/reject | ✅ Ph2 |
| Stock consumed on deliver | ✅ Ph2 |
| Financial recalc on partial accept | ✅ Ph2 (minor: tax/delivery not recalculated) |

---

## 19. Backend Gaps

| Gap ID | Description | Severity | Frontend Handling |
|--------|-------------|----------|-------------------|
| BG-1 | No DRIVER role in backend FSM | Minor | Mobile redirects to home |
| BG-2 | Checkout pricing: delivery/tax hardcoded to zero | Minor | UI shows "invoiced on delivery" notice |
| BG-3 | PAYMENT_PENDING status not exercised | Minor | No payment UI needed yet |
| BG-4 | WebSocket delivery not E2E verified | Minor | Frontend listeners exist; fire-and-forget |
| BG-5 | Dispute resolution lifecycle incomplete | Minor | Create + evidence work; resolution is manual |

---

## 20. E2E Test Coverage

| Test File | Tests | Lines | Coverage |
|-----------|:-----:|:-----:|----------|
| `transaction-lifecycle.e2e.spec.ts` | 28 | 795 | Checkout, financials, snapshots, FSM, concurrency, idempotency, tenant isolation |
| `catalog-lifecycle.e2e.spec.ts` | 45 | 890 | Catalog CRUD, variants, offers, pricing, search |
| `phase1-marketplace.e2e.spec.ts` | 38 | 711 | Discovery, cart, tampering, idempotency, inventory concurrency, FSM, security |
| `phase2-multi-merchant.e2e.spec.ts` | 39 | 815 | Multi-merchant orders, isolation, acceptance lifecycle, snapshot immutability |
| `phase3-security.e2e.spec.ts` | 47 | 687 | RBAC, tenant isolation, IDOR, privilege boundaries, tampering |
| `phase4-import-commerce.e2e.spec.ts` | 39 | 762 | Import pipeline, offer lifecycle, commerce on imported products, regression |
| **Total** | **236** | **4,660** | **All API contracts** |

---

## Phase Gate Certification

| Requirement | Status |
|-------------|:------:|
| Every backend capability has a frontend representation or is marked BACKEND GAP | ✅ |
| No critical buyer workflow uses fake/disconnected UI | ✅ |
| No critical merchant workflow uses fake/disconnected UI | ✅ |
| No critical admin workflow uses fake/disconnected UI | ✅ |
| All UX states handled on every critical data page | ✅ |
| Error handling differentiates HTTP status codes | ✅ |
| Permission UI matches backend authorization | ✅ |
| Critical workflows have automated E2E evidence | ✅ 236 tests / 4,660 lines |

**All capabilities accounted for. Phase 5 PASSES.**
