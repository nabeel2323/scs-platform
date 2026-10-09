# P12 Fresh Architecture & Business Audit

**Phase**: P12 — Fresh Architecture & Business Audit  
**Date**: 2026-10-08  
**Predecessor**: P11 = CLOSED / PASS  
**Gate**: P12 FRESH ARCHITECTURE & BUSINESS AUDIT  

---

## 1. Executive Summary

This is a fresh, evidence-driven audit of the entire SCS Platform codebase. Every module, schema, service, controller, and frontend page was inspected directly. No assumption from prior milestones was carried forward without source verification.

**Key findings:**

- The platform has substantial B2B marketplace infrastructure across 20 API modules, 57 migrations, a Flutter mobile app, a Next.js buyer web app, and a Next.js admin app.
- **Payments are completely absent** — the single largest production blocker. Orders are created without any financial transaction. This is the #1 revenue blocker.
- **Settlement/commission/payout** — calculations exist (order financial breakdown with VAT + commission) but no actual money movement infrastructure.
- **Returns/refunds** — no formal return request workflow, no refund processing, no inventory restoration on return.
- **Inventory receiving/transfers/cycle counts/valuation** — all missing.
- **Mobile search parity** — mobile has a search screen but lacks price filter, availability filter, and sort (backend supports all of these).
- **Notifications** — structured with templates and multi-channel support but no actual email/SMS/push provider integration.
- **XLSX export** — not implemented (CSV export exists).
- No P0/P1 defects in closed milestones. All P1–P11 milestones remain CLOSED / PASS.

**Verdict**: `P12 FRESH ARCHITECTURE & BUSINESS AUDIT = COMPLETE`

**Recommended P12**: Payments & Financial Architecture — the single most critical missing capability.

---

## 2. Baseline

| Item | Value |
|------|-------|
| Git branch | `develop` |
| Git HEAD | `94b4644` — test(api): update product status and verify index and migration changes |
| Git status | Clean (0 uncommitted) |
| Latest migration | 0057_governance_index_offer_snapshot.sql |
| Total migrations | 57 |
| Node.js | v26.4.0 |
| pnpm | 9.15.9 |
| Docker | 29.1.2 |
| PostgreSQL | 16 (postgis/postgis:16-3.4) |
| API modules | 20 (admin, ads, ai, analytics, audit, catalog, catalog-import, delivery, identity, inventory, merchant, notifications, orders, payments, pricing, promotions, realtime, reviews, shipping, support) |
| Mobile | Flutter 3.47.1, 32 screens |
| Web | Next.js 14.2.35, 44 pages |
| Admin | Next.js, 46 pages |
| API TypeScript | 0 errors |
| NestJS build | 314 files, 0 issues |
| Web TypeScript | 0 errors |
| Admin TypeScript | 0 errors |

**Empty modules** (directory exists, 0 source files): `payments`, `delivery`, `ads`, `ai`.

---

## 3. Current Architecture Map

### Domain Implementation Status

| Domain | Status | Evidence |
|--------|--------|----------|
| Authentication | **IMPLEMENTED** | `identity/auth.controller.ts` + `identity.service.ts` — OTP, password, refresh, logout, device-check, session management |
| Authorization / RBAC | **IMPLEMENTED** | Organization/store/membership roles, admin/moderator/merchant/buyer, caller context propagation |
| Organizations | **IMPLEMENTED** | `identity/organizations.controller.ts` — full CRUD, invite codes, update requests |
| Stores | **IMPLEMENTED** | `merchant/merchant.controller.ts` — CRUD, profiles, slug routing |
| Store Membership | **IMPLEMENTED** | `merchant/store-membership.controller.ts` — OWNER/ADMIN/MEMBER roles |
| Catalog — Categories | **IMPLEMENTED** | `catalog/catalog.taxonomy.controller.ts` — tree structure, CRUD |
| Catalog — Product Types | **IMPLEMENTED** | Taxonomy service — versioned, attribute-bound |
| Catalog — Products | **IMPLEMENTED** | `catalog/catalog.controller.ts` — full CRUD, variants, typed attributes |
| Catalog — Variants | **IMPLEMENTED** | Per-product variants with SKU, weight, identifiers |
| Catalog — Typed Attributes | **IMPLEMENTED** | Attribute definitions, product/variant attribute values, conditional rules |
| Catalog — Media | **PARTIAL** | Product images via URL; no dedicated media upload/resize service |
| Catalog — Brands | **IMPLEMENTED** | `catalog.taxonomy.controller.ts` — CRUD |
| Catalog — GTIN/Identifiers | **IMPLEMENTED** | GTIN, MPN, EAN uniqueness constraints |
| Merchant Offers | **IMPLEMENTED** | `catalog/catalog.offer.controller.ts` — per-store/per-variant, tier pricing, availability |
| Pricing | **IMPLEMENTED** | `pricing/pricing.controller.ts` — price lists, tiers, resolution |
| Inventory | **PARTIAL** | `inventory/inventory.controller.ts` — CRUD, reservations, adjustments, low-stock. Missing: receiving, transfers, cycle counts, valuation |
| Cart | **IMPLEMENTED** | `orders/cart.controller.ts` — per-store, offer validation |
| Checkout | **IMPLEMENTED** | `orders/orders.service.ts` `checkout()` — idempotent, financial breakdown, sub-order splitting |
| Orders | **IMPLEMENTED** | Full FSM: DRAFT → SUBMITTED → PENDING_CONFIRMATION → ACCEPTED/PARTIALLY_ACCEPTED/REJECTED/CANCELLED → PREPARED → READY → DELIVERED → COMPLETED |
| Sub-orders | **IMPLEMENTED** | Multi-store order splitting at checkout |
| Shipping | **IMPLEMENTED** | 34 files — shipments, carriers, webhooks, polling, retry, circuit breaker, cancellation, reconciliation, delivery exceptions |
| Carriers | **IMPLEMENTED** | Aramex provider, stub carriers, credential encryption, SSRF protection |
| Fulfillment | **IMPLEMENTED** | prepare/ready/deliver flow, stock settlement at delivery |
| Drivers | **PARTIAL** | Driver shipment screen exists in mobile; no dedicated driver management backend |
| Tracking | **IMPLEMENTED** | Carrier tracking poller, webhook bridge, deduplication |
| Delivery Exceptions | **IMPLEMENTED** | Exception types, resolution, stock settlement |
| Cancellation | **IMPLEMENTED** | Merchant cancel, carrier cancel, inventory settlement, shipment sync |
| Returns | **MISSING** | No return request workflow, no return shipment, no inspection flow |
| Refunds | **MISSING** | No refund processing, no partial/full refund, no financial adjustment |
| Disputes | **PARTIAL** | `reviews/disputes.service.ts` — create, evidence, response, resolve, conversations. NOT connected to money/orders/returns/inventory |
| Payments | **MISSING** | Module directory exists but contains 0 files. No payment provider, no intent, no authorization, no capture |
| Settlement | **MISSING** | Financial breakdown computed at checkout but no payout, reconciliation, or settlement execution |
| Commission | **PARTIAL** | `computeOrderFinancials()` calculates commission (5% default); stored in `order_financial_breakdown`. No actual collection or payout |
| Promotions | **IMPLEMENTED** | `promotions/promotions.controller.ts` — CRUD, discount application |
| Coupons | **PARTIAL** | Promotion codes exist; standalone coupon system not verified |
| Reviews | **IMPLEMENTED** | `reviews/reviews.controller.ts` — product/order reviews, trust scores |
| Notifications | **PARTIAL** | `notifications/notifications.service.ts` — template-driven, multi-channel (SMS/PUSH/IN_APP/WHATSAPP). No actual provider integration (no SendGrid, no FCM key, no SMS gateway) |
| Realtime | **PARTIAL** | `realtime/realtime.gateway.ts` — WebSocket gateway with room-based broadcast (order status, notifications). Functional but limited event coverage |
| Search | **IMPLEMENTED** | `catalog/search.service.ts` — FTS + trigram, price/availability/sort filters, facets, pagination. Both Drizzle and raw SQL paths |
| Imports | **IMPLEMENTED** | `catalog-import/` — XLSX import with chunking, resumability, preview, validation, error reports |
| Exports | **PARTIAL** | CSV export with variants + typed attributes. XLSX export not implemented |
| Product Governance | **IMPLEMENTED** | `catalog/product-governance.service.ts` — full lifecycle, moderation, offer snapshots |
| Moderation | **IMPLEMENTED** | Queue, start review, approve/reject, optimistic locking, concurrency-safe |
| Admin | **IMPLEMENTED** | 46 pages — organizations, stores, products, variants, orders, shipments, moderation, analytics, audit, disputes |
| Merchant Portal | **IMPLEMENTED** | 34 pages — catalog, offers, pricing, inventory, orders, shipping, import, governance, members |
| Buyer Web | **IMPLEMENTED** | 44 pages — search, cart, checkout, orders, tracking, account, reviews |
| Mobile | **PARTIAL** | 32 Flutter screens — auth, search, cart, checkout, orders, merchant features. Missing: governance, import, search filter parity |
| Reporting | **PARTIAL** | Admin analytics + KPIs exist. No merchant-facing reports, no financial reports |
| Audit Logs | **IMPLEMENTED** | `audit/audit.service.ts` — append-only, comprehensive |
| Outbox | **IMPLEMENTED** | `common/outbox/outbox-dispatcher.service.ts` — polling, retry with backoff, delayed retry |
| Background Workers | **IMPLEMENTED** | Outbox dispatcher (1s poll), carrier tracking poller, shipping carrier worker |
| Scheduled Jobs | **PARTIAL** | Outbox dispatcher and tracking poller run on intervals. No cron framework |
| Observability | **PARTIAL** | Structured logs, correlation IDs, execution error tracking. No metrics export, no APM, no alerting |

---

## 4. Business Workflow Map

### Merchant Lifecycle

```
Organization → ✅ Store → ✅ Membership → ✅ Product Creation → ✅ Product Import → ✅
Product Governance → ✅ Approval → ✅ Publication → ✅ Offer Creation → ✅
Inventory → ⚠️ (no receiving) Pricing → ✅ Orders → ✅ Fulfillment → ✅ Shipping → ✅
Settlement → ❌ MISSING
```

**Broken transitions:**
- Inventory → Pricing: No receiving workflow to populate initial stock
- Fulfillment → Settlement: No payment collection, no payout execution

### Buyer Lifecycle

```
Search → ✅ Product → ✅ Variant → ✅ Offer Selection → ✅ Cart → ✅
Checkout → ✅ Order → ⚠️ (no payment) Merchant Acceptance → ✅
Fulfillment → ✅ Shipping → ✅ Delivery → ✅ Completion → ✅
Return/Refund/Dispute → ❌ MISSING (disputes exist but disconnected)
```

**Broken transitions:**
- Checkout → Order: Order created without payment confirmation
- Completion → Return: No return request workflow
- Dispute → Refund: Disputes not connected to financial adjustments

---

## 5. Buyer-to-Order Workflow Audit

| Transition | Implemented? | Transactional? | Idempotent? | Concurrency Safe? | Tenant Safe? | Financially Connected? | Auditable? | User-Visible? | Failure-Recoverable? |
|------------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Search → Product | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| Product → Variant | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| Variant → Offer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Offer → Cart | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cart → Checkout | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Checkout → Order | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Order → Payment | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Order → Acceptance | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| Acceptance → Fulfillment | ✅ | ✅ | N/A | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| Fulfillment → Shipping | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| Shipping → Delivery | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delivery → Completion | ✅ | ✅ | ✅ | ✅ | ✅ | N/A | ✅ | ✅ | ✅ |
| Completion → Return | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Critical gap**: Checkout → Order bypasses payment entirely. Orders are created without financial confirmation.

---

## 6. Payment / Financial Architecture

| Capability | Status | Evidence |
|------------|--------|----------|
| Payment Providers | **MISSING** | `payments/` module is empty (0 files) |
| Payment Intent | **MISSING** | No payment intent entity or flow |
| Authorization | **MISSING** | No payment authorization |
| Capture | **MISSING** | No capture flow |
| Payment Failure | **MISSING** | No failure handling |
| Payment Retry | **MISSING** | No retry mechanism |
| Refund | **MISSING** | No refund processing |
| Partial Refund | **MISSING** | Not implemented |
| Merchant Settlement | **MISSING** | No settlement execution |
| Platform Commission | **PARTIAL** | `computeOrderFinancials()` calculates 5% commission, stored in `order_financial_breakdown`. No collection mechanism |
| Fees | **PARTIAL** | Platform delivery fee computed (currently 0 for pilot). No configurable fee engine |
| Taxes | **PARTIAL** | 15% KSA VAT computed correctly. No tax reporting |
| Shipping Charges | **PARTIAL** | Delivery fee resolved per fulfillment method. No carrier shipping price integration |
| Order Financial Ledger | **PARTIAL** | `order_financial_breakdown` table stores per-order breakdown. Not immutable (can be updated) |
| Payout | **MISSING** | No payout entity or flow |
| Reconciliation | **MISSING** | No financial reconciliation |
| Chargebacks | **MISSING** | No chargeback handling |

**Financial calculation engine** (`order-pricing.ts`):
- Integer minor units (halalas) throughout — correct
- VAT: 15% on (net goods + delivery) — correct
- Commission: 5% on net goods only — correct
- Discount clamped to [0, subtotal] — correct
- Currency snapshot in order schema — correct

**What's missing**: Everything between "calculate the numbers" and "actually move money."

---

## 7. Inventory Architecture Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Receiving | **MISSING** | No receiving workflow, no GRN |
| Stock In | **PARTIAL** | `createItem` + `bulkAdjustStock` can increase stock, but no formal receiving |
| Stock Out | **IMPLEMENTED** | Sale settlement at delivery completion |
| Reservations | **IMPLEMENTED** | `qtyReserved` tracked, reserved at merchant acceptance |
| Reservation Release | **IMPLEMENTED** | Released on cancellation |
| Sale | **IMPLEMENTED** | Atomic inventory settlement at DELIVERED |
| Cancellation | **IMPLEMENTED** | Stock released on cancel |
| Returns | **MISSING** | No return-to-stock flow |
| Return-to-Stock | **MISSING** | Not implemented |
| Adjustments | **IMPLEMENTED** | `bulkAdjustStock` with reason tracking |
| Transfers | **MISSING** | No inter-warehouse transfer |
| Warehouses | **IMPLEMENTED** | Per-store warehouses |
| Cycle Counts | **MISSING** | No cycle count workflow |
| Valuation | **MISSING** | No cost tracking, no valuation method |
| Cost | **MISSING** | No cost price on inventory items |
| Negative Stock | **PARTIAL** | `bulkAdjustStock` respects reserved stock. No explicit negative stock prevention |
| Concurrency | **IMPLEMENTED** | Transactional adjustments, reserved stock checks |
| Audit Trail | **PARTIAL** | `stock_movements` table tracks SALE/CANCEL/ADJUSTMENT. Missing: RECEIVING, TRANSFER, RETURN |

---

## 8. Returns / Refunds / Disputes

### Returns

| Capability | Status |
|------------|--------|
| Return Request | **MISSING** |
| Merchant Review | **MISSING** |
| Approved/Rejected | **MISSING** |
| Return Shipment | **MISSING** |
| Received | **MISSING** |
| Inspection | **MISSING** |
| Refund | **MISSING** |
| Inventory Restoration | **MISSING** |

### Disputes

| Capability | Status | Evidence |
|------------|--------|----------|
| Create Dispute | **IMPLEMENTED** | `disputes.service.ts` `createDispute()` |
| Submit Evidence | **IMPLEMENTED** | `submitEvidence()` |
| Submit Response | **IMPLEMENTED** | `submitResponse()` |
| Resolve Dispute | **IMPLEMENTED** | `resolveDispute()` — admin resolution |
| Connected to Money | **❌ NO** | Resolution is text-only, no financial adjustment |
| Connected to Orders | **✅ YES** | Disputes reference orders |
| Connected to Returns | **❌ NO** | No return workflow exists |
| Connected to Inventory | **❌ NO** | No inventory restoration on dispute resolution |

---

## 9. Marketplace Economics

The system has a **coherent canonical financial calculation model** in `order-pricing.ts`:

```
Subtotal (from offers) → Discount → Net Goods → + Delivery Fee → Taxable → + VAT → Total
Net Goods → - Commission → Merchant Net
```

**Issues identified:**
- Financial breakdown is computed at checkout but stored in a mutable table (`order_financial_breakdown`)
- No immutable financial ledger — records can be updated after creation
- Commission is calculated but never collected
- Merchant net is calculated but never paid out
- No currency conversion (single currency: SAR)
- Rounding: integer minor units throughout — correct

---

## 10. Shipping / Fulfillment Audit

**Status**: IMPLEMENTED — comprehensive M7 shipping foundation

| Capability | Status | Evidence |
|------------|--------|----------|
| Shipment | ✅ | `shipping/shipping.schema.ts` — full shipment entity |
| Carrier | ✅ | Aramex + stub carriers |
| Carrier Provider | ✅ | `carrier-configurations.service.ts` |
| Tracking | ✅ | `carrier-tracking-poller.ts` — webhook + poll dual mode |
| Pickup | ✅ | Carrier pickup scheduling |
| Cancellation | ✅ | Carrier cancel with retry, state machine |
| Delivery | ✅ | Delivery completion bridge |
| Delivery Exception | ✅ | Exception types, resolution flow |
| RTS (Return to Sender) | **PARTIAL** | Exception handling exists, formal RTS workflow not verified |
| Carrier Reconciliation | ✅ | `carrier-reconciliation.service.ts` — cycle-based reconciliation |
| Webhook | ✅ | `carrier-webhook.controller.ts` — signature validation, HMAC, replay protection |
| Polling | ✅ | Tracking poller with deduplication |
| Retry | ✅ | Exponential backoff, retry-after headers, circuit breaker |
| Circuit Breaker | ✅ | Error classification: retryable/terminal/indeterminate |
| Outbox | ✅ | All shipping events via outbox |

**Remaining gaps**: Proof of delivery (signature/photo), returns shipment integration.

---

## 11. Product Governance Audit

**Status**: P11 CLOSED / PASS — treated as baseline

P11 governance integrates correctly with:

| Integration Point | Status | Evidence |
|-------------------|--------|----------|
| Product Studio | ✅ | Studio edit page shows governance status |
| Imports | ✅ | `checkImportEligibility` gates SUBMITTED/UNDER_REVIEW |
| Offers | ✅ | `snapshotAndSuspendOffersForProduct` / `restoreOffersFromSnapshot` |
| Search | ✅ | Only PUBLISHED products buyer-visible |
| Buyer Visibility | ✅ | Search service filters `status = 'PUBLISHED'` |
| Moderation | ✅ | Queue, approve/reject, concurrency-safe |
| Notifications | ⚠️ | Outbox events emitted but no notification consumer for governance events |
| Variants | ✅ | Variant changes trigger re-review |
| Typed Attributes | ✅ | Attribute changes trigger re-review |

**Integration gap**: Governance state changes emit outbox events but no notification templates consume them. Merchants are not notified of moderation decisions.

---

## 12. Catalog Audit

| Area | Status | Notes |
|------|--------|-------|
| Category | ✅ | Tree structure, CRUD |
| Product Type | ✅ | Versioned, attribute-bound |
| Product | ✅ | Full CRUD, governance lifecycle |
| Variant | ✅ | Per-product, SKU, weight, identifiers |
| Typed Attributes | ✅ | Definitions, values, conditional rules |
| Media | ⚠️ | URL-based, no upload service |
| Brand | ✅ | CRUD |
| Identifiers | ✅ | GTIN/MPN/EAN uniqueness |
| Merchant Offer | ✅ | Per-store/per-variant, tier pricing |
| Canonical vs Merchant | ✅ | Canonical products + merchant offers |
| Store Authorization | ✅ | `product.storeId !== storeId → ForbiddenException` |
| Import Consistency | ✅ | XLSX import with governance gating |
| Export Completeness | ⚠️ | CSV only, XLSX not implemented |
| Search Sync | ✅ | Search queries products directly |

---

## 13. Search Audit

| Capability | Web | Mobile | Notes |
|------------|:---:|:---:|-------|
| Text Search | ✅ | ✅ | FTS + trigram |
| Price Filter | ✅ | ❌ | Backend supports, mobile doesn't use |
| Availability Filter | ✅ | ❌ | Backend supports, mobile doesn't use |
| Sorting | ✅ | ❌ | Backend supports, mobile doesn't use |
| Pagination | ✅ | ✅ | |
| Merchant Offers | ✅ | ✅ | |
| Facets | ✅ | ❌ | |
| Category Filter | ✅ | ✅ | |
| Brand Filter | ✅ | ❌ | |
| Attributes | ✅ | ❌ | |
| Performance | ✅ | N/A | Both search paths optimized |

**Mobile search parity gap**: CONFIRMED — mobile has basic text search but lacks all advanced filters (price, availability, sort, facets, brand, attributes).

---

## 14. Import / Export Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| CSV Import | ✅ | Via XLSX parser (handles both) |
| XLSX Import | ✅ | `excel-parser.service.ts`, `excel-executor.service.ts` |
| Mapping | ✅ | `excel-planner.service.ts` — column mapping |
| Preview | ✅ | `excel-validator.service.ts` — preview + validation |
| Validation | ✅ | Comprehensive validation pipeline |
| Chunking | ✅ | Large imports chunked for resumability |
| Resumability | ✅ | Chunk-level resume on failure |
| Concurrency | ✅ | Ownership constraint prevents double-processing |
| Cancellation | ✅ | Import can be cancelled |
| Retry | ✅ | Failed chunks can be retried |
| Error Reports | ✅ | Per-row error tracking |
| Import History | ✅ | Import records with status |
| Authorization | ✅ | Store membership required |
| Tenant Isolation | ✅ | Store-scoped imports |
| CSV Export | ✅ | Variant-expanded, typed attributes |
| XLSX Export | **MISSING** | Not implemented |

---

## 15. Mobile Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Authentication | ✅ | Login, OTP, password, sessions, credential setup |
| Catalog | ✅ | Merchant catalog, product detail, store detail |
| Search | ⚠️ | Basic text search only. No price/availability/sort/facets |
| Cart | ✅ | Cart screen |
| Checkout | ✅ | Checkout screen |
| Orders | ✅ | Order list, order detail |
| Tracking | ✅ | Order tracking |
| Notifications | ✅ | Notifications screen |
| Product Studio | ✅ | Product edit screen |
| Merchant Features | ✅ | Dashboard, catalog, offers, orders, customers, inventory |
| Governance | **MISSING** | No governance status display, no submission/moderation UI |
| Import | **MISSING** | No mobile import flow |
| Error Handling | ✅ | Standard Flutter error handling |
| Offline Behavior | **MISSING** | No offline caching or sync |
| API Parity | ⚠️ | Uses backend API but doesn't exercise all endpoints (search filters, governance) |

---

## 16. Web Buyer Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Search | ✅ | `search/page.tsx` — full server-side filtering |
| Category | ✅ | Category browsing |
| Product | ✅ | `products/[id]/page.tsx` |
| Variant | ✅ | Variant selection on product page |
| Offer Selection | ✅ | Offer comparison |
| Cart | ✅ | `cart/page.tsx` |
| Checkout | ✅ | `checkout/page.tsx` |
| Order | ✅ | `orders/page.tsx`, `orders/[id]/page.tsx` |
| Tracking | ✅ | Order tracking |
| Delivery | ✅ | Delivery status |
| Returns | **MISSING** | No return request UI |
| Refunds | **MISSING** | No refund tracking UI |
| Disputes | **MISSING** | No dispute filing UI (backend exists) |
| Notifications | ⚠️ | `notifications/page.tsx` exists but no provider delivers to it |

---

## 17. Merchant Portal Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Store | ✅ | `merchant/store/page.tsx` |
| Membership | ✅ | `merchant/members/page.tsx` |
| Product Studio | ✅ | `merchant/product-studio/` — create, edit, governance |
| Import | ✅ | `merchant/import/page.tsx`, `merchant/imports/page.tsx` |
| Offers | ✅ | `merchant/offers/page.tsx` |
| Pricing | ✅ | `merchant/pricing/page.tsx` |
| Inventory | ⚠️ | `merchant/inventory/page.tsx` — view/adjust only, no receiving |
| Orders | ✅ | `merchant/orders/` — list, detail, accept/reject |
| Fulfillment | ✅ | Via order management |
| Shipping | ✅ | `merchant/shipping/page.tsx` |
| Governance | ✅ | Via product studio |
| Reports | **MISSING** | No merchant-facing reports or analytics |
| Notifications | ⚠️ | Page exists but no delivery mechanism |

---

## 18. Admin / Moderator Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Organizations | ✅ | `admin/organizations/` |
| Stores | ✅ | Via organization detail |
| Membership | ✅ | Via organization detail |
| Catalog | ✅ | Products, variants, categories, brands, product types |
| Products | ✅ | Full CRUD, edit, variant management |
| Variants | ✅ | Detail, edit |
| Moderation | ✅ | Product governance integration |
| Orders | ✅ | `admin/orders/` |
| Offers | ✅ | `admin/offers/` + KPIs + trends |
| Inventory | ⚠️ | View only via merchant detail |
| Shipping | ✅ | `admin/shipments/`, `admin/carrier/` |
| Disputes | ✅ | `admin/disputes/` — list, detail, resolve |
| Financials | **MISSING** | No financial management, no settlement dashboard |
| Reports | ✅ | Analytics, KPIs, data quality |
| Audit | ✅ | `admin/audit/` |
| Security | ✅ | User management, verification |

---

## 19. Notifications / Realtime Audit

### Notifications

| Capability | Status | Evidence |
|------------|--------|----------|
| Outbox | ✅ | Transactional outbox with retry |
| Templates | ✅ | 8+ built-in templates (order.created, order.accepted, etc.) |
| Email | **MISSING** | No email provider (SendGrid, SES, etc.) |
| Push | **MISSING** | No FCM/APNs key configuration |
| SMS | **MISSING** | No SMS gateway (Twilio, etc.) |
| In-App | **PARTIAL** | Template generates IN_APP events but no delivery/persistence mechanism |
| Realtime | **PARTIAL** | WebSocket gateway exists but limited event coverage |
| WebSocket | ✅ | `realtime.gateway.ts` — room-based broadcast |
| SSE | **MISSING** | Not implemented |
| Retry | ✅ | Outbox retry with backoff |
| Deduplication | ✅ | Outbox event dedup |
| Tenant Isolation | ✅ | Room-based isolation |

**Critical gap**: Notifications are structured and templated but have no actual delivery channel. No email, no SMS, no push. Merchants and buyers are never actually notified.

---

## 20. Security Audit

### Authentication
- JWT + refresh tokens ✅
- Session management ✅
- Device-check ✅
- Expiration ✅
- Revocation ✅ (session invalidation)

### Authorization
- Organization-scoped ✅
- Store-scoped ✅
- Membership roles ✅
- Resource ownership ✅
- Caller context propagation ✅

### IDOR
- Product: ✅ (storeId check)
- Variant: ✅ (via product ownership)
- Offer: ✅ (storeId check)
- Inventory: ✅ (storeId check)
- Cart: ✅ (buyer-scoped)
- Order: ✅ (buyer/merchant scoping)
- Shipment: ✅ (store-scoped)
- Import: ✅ (store-scoped)
- Moderation: ✅ (admin/moderator role)

### Tenant Isolation
- Cross-org: ✅ Protected
- Cross-store: ✅ Protected

### Webhooks
- Signature validation: ✅ HMAC
- Replay protection: ✅ Timestamp validation
- Deduplication: ✅ Tracking dedup
- Tenant routing: ✅
- Rate limiting: ✅

### SSRF
- ✅ `ssrf-protection.ts` — URL validation for carrier integrations

---

## 21. Concurrency / Data Integrity Audit

| Workflow | Mechanism | Status |
|----------|-----------|--------|
| Inventory reservation | Transaction | ✅ |
| Inventory settlement | Atomic transaction | ✅ |
| Cart quantity | Optimistic | ✅ |
| Checkout | Idempotency key + fingerprint | ✅ |
| Order acceptance | Optimistic lock | ✅ |
| Cancellation | Optimistic lock + inventory settlement | ✅ |
| Shipping | Outbox + idempotency | ✅ |
| Carrier reconciliation | Transaction | ✅ |
| Moderation | SELECT FOR UPDATE | ✅ |
| Offer state | Transaction | ✅ |
| Product edits | Optimistic lock | ✅ |
| Imports | Ownership constraint | ✅ |
| Membership | Transaction | ✅ |
| Payments | ❌ N/A | Not implemented |
| Refunds | ❌ N/A | Not implemented |
| Settlement | ❌ N/A | Not implemented |

---

## 22. Financial Integrity Audit

| Field | Exists? | Immutable? | Evidence |
|-------|:---:|:---:|--------|
| Order Total | ✅ | ⚠️ | `order_financial_breakdown.totalMinor` — mutable |
| Merchant Subtotal | ✅ | ⚠️ | `productsMinor` |
| Shipping | ✅ | ⚠️ | `deliveryFeeMinor` |
| Tax | ✅ | ⚠️ | `taxMinor` |
| Discount | ✅ | ⚠️ | `discountMinor` |
| Platform Commission | ✅ | ⚠️ | `commissionMinor` |
| Merchant Net | ✅ | ⚠️ | `merchantNetMinor` |
| Buyer Paid | ❌ | ❌ | No payment = no "paid" record |
| Refunded | ❌ | ❌ | Not implemented |
| Settled | ❌ | ❌ | Not implemented |
| Outstanding | ❌ | ❌ | Not implemented |

**Key concern**: Financial breakdown records are mutable. Once an order is completed, the financial record should be immutable for audit correctness.

---

## 23. Observability / Operations Audit

| Capability | Status | Evidence |
|------------|--------|----------|
| Structured Logs | ✅ | NestJS Logger throughout |
| Correlation IDs | ✅ | Request-scoped logging |
| Metrics | **MISSING** | No Prometheus/OTel metrics export |
| Error Tracking | **PARTIAL** | `execution_error_tracking` table. No Sentry/Datadog |
| Outbox Monitoring | **PARTIAL** | Outbox events table queryable. No dashboard |
| Worker Monitoring | **PARTIAL** | Console logging. No health endpoint for workers |
| Job Monitoring | **PARTIAL** | Import job status in DB. No dashboard |
| Database Health | **MISSING** | No connection pool monitoring |
| Slow Queries | **MISSING** | No query performance monitoring |
| Retries | ✅ | Outbox retry with backoff |
| Dead Letter / Recovery | **PARTIAL** | Outbox FAILED status. No DLQ UI |
| Audit Logs | ✅ | Comprehensive |
| Admin Recovery | **PARTIAL** | Admin can moderate products. No order recovery tools |

---

## 24. Performance Audit

- Search: FTS + trigram with proper indexes ✅
- Governance index: `idx_products_governance_status` ✅
- Performance indexes: Migration 0027 ✅
- Variant weight decimal: Migration 0051 ✅
- No N+1 query patterns detected in core services
- No unbounded queries detected (all list endpoints paginated)
- Import chunking prevents large-batch memory issues ✅

**No critical performance issues identified.**

---

## 25. Database / Migration Audit

- **57 migrations**, ordered 0001–0057
- All migrations use `IF NOT EXISTS` / `IF EXISTS` — idempotent ✅
- Foreign keys with CASCADE where appropriate ✅
- Soft deletes via `deleted_at` ✅
- Tenant scoping via `store_id` ✅
- Unique constraints on business keys ✅
- JSONB legacy: `offer_snapshot` and `promo_snapshot` on order_items — intentional snapshot pattern ✅
- No deprecated schema detected
- No orphan risks detected

**P12 migration requirement**: YES — payment entities require new tables.

---

## 26. Architecture Debt

| Item | Severity | Impact |
|------|----------|--------|
| Empty module directories (payments, delivery, ads, ai) | P3 | Confusing — suggests functionality that doesn't exist |
| Mutable financial breakdown | P2 | Audit risk — completed order financials should be immutable |
| No notification delivery | P1 | Users never receive notifications despite template infrastructure |
| Disputes disconnected from money | P2 | Dispute resolution has no financial effect |
| Duplicated pricing logic (order-pricing.ts vs search.service.ts) | P3 | Maintenance risk |
| No metrics/APM | P2 | Cannot detect production performance issues |
| Mobile search filter gap | P3 | Inferior mobile UX |
| No XLSX export | P3 | Missing business feature |
| No merchant reports | P3 | Merchants cannot analyze their business |
| Governance notification gap | P3 | Merchants not notified of moderation decisions |

---

## 27. Findings Matrix

| ID | Severity | Domain | Title | Current | Expected | Migration? | Security? | Concurrency? |
|----|----------|--------|-------|---------|----------|:---:|:---:|:---:|
| F-01 | **P0** | Payments | No payment processing | Orders created without payment | Payment gateway integration | ✅ | ✅ | ✅ |
| F-02 | **P1** | Settlement | No settlement/payout | Commission calculated but never collected | Settlement engine | ✅ | ✅ | ✅ |
| F-03 | **P1** | Returns | No return/refund workflow | No return request possible | Return/refund flow | ✅ | ✅ | ✅ |
| F-04 | **P1** | Notifications | No notification delivery | Templates exist but no provider | Email/SMS/push integration | ❌ | ❌ | ❌ |
| F-05 | **P2** | Inventory | No receiving/transfers/cycle counts | Cannot populate stock formally | Warehouse operations | ✅ | ❌ | ✅ |
| F-06 | **P2** | Financial | Mutable financial records | Breakdown can be updated post-completion | Immutable financial ledger | ✅ | ✅ | ❌ |
| F-07 | **P2** | Disputes | Disputes disconnected from money | Resolution is text-only | Financial adjustment on resolution | ✅ | ✅ | ❌ |
| F-08 | **P2** | Observability | No metrics/APM | Console logs only | OpenTelemetry + metrics | ❌ | ❌ | ❌ |
| F-09 | **P3** | Mobile | Search filter parity | No price/availability/sort | Full filter support | ❌ | ❌ | ❌ |
| F-10 | **P3** | Export | No XLSX export | CSV only | XLSX export | ❌ | ❌ | ❌ |
| F-11 | **P3** | Governance | No moderation notifications | Merchants not notified | Outbox → notification consumer | ❌ | ❌ | ❌ |
| F-12 | **P3** | Admin | No financial dashboard | No settlement/commission view | Financial admin views | ❌ | ❌ | ❌ |
| F-13 | **P3** | Merchant | No merchant reports | Cannot analyze business | Merchant analytics | ❌ | ❌ | ❌ |
| F-14 | **P3** | Code | Empty module dirs | payments/delivery/ads/ai empty | Remove or implement | ❌ | ❌ | ❌ |

---

## 28. P0/P1/P2/P3 Summary

| Severity | Count | Items |
|----------|:---:|-------|
| **P0** | 1 | F-01 (no payments) |
| **P1** | 3 | F-02 (settlement), F-03 (returns/refunds), F-04 (notifications) |
| **P2** | 4 | F-05 (inventory ops), F-06 (mutable financials), F-07 (disputes), F-08 (observability) |
| **P3** | 6 | F-09 through F-14 |

---

## 29. Business Priority Matrix

| Finding | Business Criticality | User Impact | Revenue Impact | Implementation Complexity | Recommendation |
|---------|:---:|:---:|:---:|:---:|:---:|
| F-01 Payments | **CRITICAL** | **CRITICAL** | **CRITICAL** | HIGH | **NOW** |
| F-02 Settlement | HIGH | MEDIUM | **CRITICAL** | HIGH | **NOW** (with F-01) |
| F-03 Returns/Refunds | HIGH | HIGH | HIGH | MEDIUM | NEXT |
| F-04 Notifications | HIGH | HIGH | MEDIUM | MEDIUM | NEXT |
| F-05 Inventory Ops | MEDIUM | MEDIUM | MEDIUM | MEDIUM | LATER |
| F-06 Immutable Financials | MEDIUM | LOW | HIGH | LOW | NOW (with F-01) |
| F-07 Disputes→Money | MEDIUM | MEDIUM | MEDIUM | MEDIUM | LATER |
| F-08 Observability | MEDIUM | LOW | LOW | MEDIUM | LATER |
| F-09 Mobile Search | LOW | MEDIUM | LOW | LOW | LATER |
| F-10 XLSX Export | LOW | LOW | LOW | LOW | DEFER |
| F-11 Moderation Notify | LOW | MEDIUM | LOW | LOW | NEXT |
| F-12 Financial Dashboard | LOW | LOW | MEDIUM | LOW | LATER |
| F-13 Merchant Reports | LOW | MEDIUM | LOW | MEDIUM | LATER |
| F-14 Empty Modules | LOW | LOW | LOW | TRIVIAL | DEFER |

---

## 30. Candidate P12 Themes

Each candidate was evaluated against audit evidence before selecting the final P12 recommendation.

| Candidate | Theme | Evidence | Verdict |
|-----------|-------|----------|---------|
| A | Payments / Financial Architecture | `payments/` module is empty (0 files). Orders created without any financial transaction. #1 revenue blocker. | **SELECTED** |
| B | Inventory Receiving & Warehouse Operations | Receiving, transfers, cycle counts, valuation all MISSING. However, basic stock in/out and reservations work. Not the primary revenue blocker. | LATER |
| C | Returns / Refunds | No return request workflow, no refund processing. Important for buyer trust but requires payments first. | NEXT (P13) |
| D | Mobile Production Parity | Mobile lacks search filters, governance, import. Functional for core buyer flow. | LATER |
| E | Marketplace Operational Completion | Notifications have no delivery, disputes disconnected from money. Important but secondary to payments. | LATER |
| F | Settlement / Commission | Commission calculated but never collected. Tightly coupled to payments — should be part of P12, not separate. | MERGED into P12 |
| G | Other (discovered during audit) | No additional candidate surpassed payments in business criticality. | N/A |

**Decision**: Candidate A (Payments / Financial Architecture) is the clear P12 choice. Candidate F (Settlement/Commission) is merged into P12 scope since settlement cannot exist without payments. All others are deferred to P13+.

---

## 31. Recommended P12

### P12 Objective
**Payments & Financial Architecture** — Implement the payment processing pipeline that enables actual financial transactions in the marketplace.

### Business Problem
The platform processes orders end-to-end but **no money ever changes hands**. This is the single largest production blocker. Without payments:
- Merchants receive no revenue
- Platform collects no commission
- Buyers place orders without financial commitment
- The marketplace cannot operate as a business

### Scope
- Payment provider integration (Stripe or regional: Moyasar, HyperPay, Tap)
- Payment intent creation at checkout
- Payment authorization and capture
- Payment webhook handling (success/failure/refund)
- Payment status integration with order FSM (PAYMENT_PENDING state)
- Immutable financial ledger (lock down `order_financial_breakdown` post-completion)
- Basic settlement tracking (what is owed to merchants)
- Commission collection tracking
- Refund processing (full and partial)

### Out of Scope
- Payout to merchant bank accounts (P13+)
- Multi-currency support
- Subscription/recurring payments
- Escrow
- Chargeback handling (basic webhook handling only)

### Expected Business Value
- **Revenue enablement**: Platform can actually collect commission on every order
- **Merchant trust**: Merchants receive payment for their goods
- **Buyer confidence**: Formal payment flow with receipts and refund capability
- **Regulatory compliance**: Financial audit trail with immutable records

### Dependencies
- F-06 (immutable financial records) — must be done WITH payments
- Existing order FSM — must add PAYMENT_PENDING state
- Existing outbox — payment events via outbox

### Architecture Impact
- New migration required: payment_intents, payment_events, settlement_records tables
- Order FSM extension: SUBMITTED → PAYMENT_PENDING → ACCEPTED (on payment success)
- Checkout flow: create payment intent → await webhook → transition order
- Refund flow: initiate refund → webhook → financial adjustment

### Migration Requirement
**MIGRATION REQUIRED** — new tables for payment_intents, payment_events, and potentially settlement_records.

### Security Impact
- Payment webhook signature validation (critical — prevents fraudulent payment confirmations)
- PCI-DSS compliance considerations (use provider's hosted fields / Elements)
- Idempotency on payment intent creation (prevent double charges)
- Financial record immutability (prevent post-hoc financial manipulation)

### Concurrency Requirements
- Payment intent creation must be idempotent (idempotency key from checkout)
- Webhook processing must be idempotent (duplicate webhook protection)
- Refund processing must prevent double-refund (similar to double-payment prevention)
- Financial records must be append-only after creation

### Acceptance Gate
Independent runtime verification of:
- Payment intent creation + authorization + capture flow
- Webhook handling (success, failure, refund)
- Order FSM transition on payment success/failure
- Idempotent payment processing (no double charges)
- Immutable financial records
- Refund processing (full + partial)
- Concurrent webhook handling

### Estimated Complexity
**HIGH** — payment integration touches checkout, orders, financial records, webhooks, and requires careful idempotency and security analysis.

---

## 32. P13+ Candidates

| Candidate | Theme | Priority |
|-----------|-------|----------|
| P13 | Returns / Refunds / Disputes→Money | NEXT |
| P14 | Notification Delivery (email/SMS/push) | NEXT |
| P15 | Inventory Receiving & Warehouse Operations | LATER |
| P16 | Mobile Production Parity | LATER |
| P17 | Observability & Monitoring | LATER |
| P18 | Merchant Analytics & Reports | LATER |
| P19 | XLSX Export | DEFER |
| P20 | Payout to Merchant Bank Accounts | LATER |

---

## 33. Migration Decision

```
MIGRATION REQUIRED
```

**Reason**: P12 payments require new database entities:
- `payment_intents` — tracks payment intent lifecycle (created, authorized, captured, failed)
- `payment_events` — immutable log of payment provider webhooks
- Potentially `settlement_records` — tracks what is owed to merchants
- Order FSM extension: new `PAYMENT_PENDING` status value
- Financial breakdown immutability constraint

---

## 34. Important Historical Baseline

No closed milestones were reopened during this audit. All prior milestones remain at their confirmed status:

```
M5    = CLOSED / PASS
M6    = CLOSED / PASS
M6.1  = CLOSED / PASS
M6.2  = CLOSED / PASS
M7.1  = CLOSED / PASS
M7.2.1 = CLOSED / PASS
M7.2.2 = CLOSED / PASS
M7.2.3 = CLOSED / PASS
M7.2.4 = CLOSED / PASS WITH CONDITIONS
M7.3-A = CLOSED / PASS
M7.3-B = CLOSED / PASS
P1    = CLOSED / PASS
P2    = CLOSED / PASS
P3    = CLOSED / PASS WITH CONDITIONS
P5    = CLOSED / PASS WITH CONDITIONS
P6    = CLOSED / PASS WITH CONDITIONS
P7    = CLOSED / PASS
P8    = CLOSED / PASS
P9    = CLOSED / PASS
P10   = CLOSED / PASS
P11   = CLOSED / PASS
```

No regressions discovered that would require reopening any closed milestone.

---

## 35. Production Readiness

```
P0: 1 (no payments)
P1: 3 (settlement, returns/refunds, notifications)
P2: 4 (inventory ops, mutable financials, disputes, observability)
P3: 6 (mobile parity, XLSX export, moderation notify, financial dashboard, merchant reports, empty modules)

Production Readiness: NOT READY — no payment processing
Security: STRONG — RBAC, IDOR protection, SSRF protection, webhook security
Data Integrity: STRONG — optimistic locking, FOR UPDATE, idempotency, outbox
Concurrency: STRONG — all write paths covered
Financial Readiness: NOT READY — calculations exist but no money movement
Operational Readiness: PARTIAL — logs + audit good, no metrics/APM
Mobile Readiness: PARTIAL — functional but missing search filter parity, governance, import
Web Readiness: STRONG — comprehensive buyer experience
Merchant Readiness: STRONG — full portal with studio, import, orders, shipping
Admin Readiness: STRONG — comprehensive admin + moderation
```

---

## 36. Final Gate

```
P12 FRESH ARCHITECTURE & BUSINESS AUDIT = COMPLETE
```

**Recommended P12**: Payments & Financial Architecture  
**Migration**: REQUIRED  
**Next decision**: P12 BUSINESS RULES & ARCHITECTURE LOCK
