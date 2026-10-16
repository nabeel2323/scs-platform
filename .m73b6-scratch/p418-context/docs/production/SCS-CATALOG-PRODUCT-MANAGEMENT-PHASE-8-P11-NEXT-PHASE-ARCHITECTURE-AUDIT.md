# SCS Platform — P11 Fresh Architecture & Business Audit

**Document:** SCS-CATALOG-PRODUCT-MANAGEMENT-PHASE-8-P11-NEXT-PHASE-ARCHITECTURE-AUDIT.md
**Date:** 2026-10-08
**Predecessor:** P10 CLOSED / PASS
**Gate:** P11 FRESH ARCHITECTURE & BUSINESS AUDIT = COMPLETE

---

## 1. Executive Summary

This audit examines the SCS Platform after P10 (Merchant Import UX & XLSX Production Pipeline) closure. The platform has completed ten milestones spanning taxonomy, canonical products, merchant offers, import/export hardening, search enhancement, store membership, and XLSX production pipeline.

**Key findings:**
- 0 P0 blockers discovered
- 2 P1 findings: no payment processing; no product submission workflow
- 5 P2 findings: no returns/refunds; no inventory receiving; mobile search parity incomplete; promotions not wired to checkout; no XLSX export
- 12 P3 findings: deferred enhancements from previous milestones
- Production readiness: **PARTIAL** — catalog/order/fulfillment operational; financial settlement absent

**Recommended next milestone:** P11 — Product Governance & Submission Workflow

**Migration decision:** CONDITIONAL — depends on whether product lifecycle states require schema changes.

---

## 2. P10 Baseline

| Item | Value |
|------|-------|
| Branch | develop |
| HEAD | 4dc673e25bc361cb214a0a875474816de5a5361a |
| Latest migration | 0055_import_chunking_inventory_integrity.sql |
| Migration count | 55 |
| Migration 0056 | ABSENT |
| Node version | v26.4.0 |
| pnpm version | 9.15.9 |
| PostgreSQL | 16.4 |
| Redis | 7.4.11 |
| Docker | 29.1.2 |
| P10 acceptance | P10-A01..A20: ALL PASS |
| P10 security | P10-S01..S10: ALL PASS |
| P10 concurrency | P10-C01..C08: ALL PASS |
| P10 tests | 30/30 PASS (unit), 23/23 PASS (P8 regression), 39/39 PASS (P9 regression) |
| P10 TypeScript | API 0 errors, Web 0 errors |
| P10 Nest build | PASS |
| P10 Web build | PASS |
| P10 defects | P0=0, P1=0, P2=0 |
| P10 Architecture deviations | NONE |

---

## 3. Current Architecture

### Domain Model (Verified from source)

```
Category (materialized path hierarchy)
   ↓
Product Type / Template (conditional rules engine)
   ↓
Canonical Product (nullable store_id — platform-shared)
   ├── Attributes (product_attribute_values — PRODUCT scope, authoritative)
   ├── Variants (product_variants + variant_attribute_values — VARIANT scope)
   │   └── combination_key (partial unique index for dedup)
   ├── Media (product_media — optional variant_id, S3 presigned uploads)
   ├── Identifiers (gtin, ean, mpn — partial unique indexes)
   └── Sources (product_sources)
   ↓
Merchant Offer (store-owned, pricing/stock/MOQ/lead-time)
   ├── Price List → Price Tiers (quantity breaks)
   └── Warehouse → Inventory Items (qty_on_hand, qty_reserved)
   ↓
Merchant Store
   ├── Membership (store_members — ACTIVE/INACTIVE, last-owner protection)
   ├── Products / Offers / Inventory
   └── Import Jobs → Import Job Chunks (P8 hardening)
```

### API Module Inventory (Verified from apps/api/src/modules/)

| Module | Status | Key Capabilities |
|--------|--------|-----------------|
| catalog | COMPLETE | Products, variants, media, categories, brands, import/export, search, dedup |
| catalog (offer) | COMPLETE | Offer CRUD, price resolution, store-scoped offers |
| catalog (taxonomy) | COMPLETE | Product types, attributes, conditional rules |
| catalog-import | COMPLETE | Admin XLSX import pipeline (parser, planner, resolver, validator, executor) |
| inventory | COMPLETE | Stock ledger, movements, reservations, transfers |
| pricing | COMPLETE | Price lists, tiers, resolution |
| merchant | COMPLETE | Store management, verification |
| store-membership | COMPLETE | Membership CRUD, last-owner protection |
| admin | COMPLETE | Moderation, governance, KPIs, audit logs |
| orders | COMPLETE | Master/sub orders, lifecycle, cancellation, delivery, auto-complete |
| shipping | COMPLETE | Carrier abstraction, manual delivery, webhook security, reconciliation |
| notifications | COMPLETE | Multi-channel (SMS, PUSH, IN_APP, WHATSAPP), templates, quiet hours |
| reviews | COMPLETE | Reviews, disputes (OPEN → EVIDENCE → RESPONSE → REVIEW → RESOLVED/CLOSED) |
| promotions | PARTIAL | Module exists but not wired to cart/checkout |
| realtime | PARTIAL | WebSocket gateway exists but not used for live updates |
| identity | COMPLETE | Auth, profile, organizations, sessions |
| analytics | COMPLETE | KPIs, metrics |
| audit | COMPLETE | Audit trail middleware |
| support | EMPTY | Module registered but no implementation |
| payments | EMPTY | Directory exists, no implementation |
| delivery | EMPTY | Directory exists, no implementation |
| ads | EMPTY | Directory exists, no implementation |
| ai | EMPTY | Directory exists, no implementation |

### Web App Pages (Verified)

**Buyer:** search, product detail, stores, cart, checkout, orders, compare, favorites, reviews, notifications, profile, account, auth, login, saved-suppliers.

**Merchant:** catalog, product-studio (6-step wizard), import (5-step wizard), imports (history), inventory, offers, pricing, promotions, orders, deliveries, warehouses, members, store, organization.

### Admin App Pages (Verified)

products (moderation queue), product-types (builder), categories, brands, attributes, catalog-import, data-quality, audit, organizations, verification, offers, KPIs, orders, shipments, users, variants, requests, disputes, analytics, attribute-groups.

### Mobile App (Verified)

**Buyer:** search (with barcode scanner), product detail, cart, checkout, orders, stores, reviews, notifications, profile.

**Merchant:** dashboard, catalog, inventory, offers, orders, product edit, store profile, registration.

**Driver:** driver shipments.

---

## 4. Catalog Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Category management | COMPLETE | Materialized path, tree endpoint, CRUD |
| Brand management | COMPLETE | Platform-level, CRUD, enrichment |
| Product CRUD | COMPLETE | Admin + merchant, optimistic locking |
| Variant management | COMPLETE | combinationKey, FOR SHARE, bulk ops |
| Typed attributes | COMPLETE | product/variant_attribute_values, conditional rules |
| Product types | COMPLETE | Templates, conditional rules engine |
| Media management | COMPLETE | Presigned upload, reorder, MIME validation |
| GTIN/EAN/MPN dedup | COMPLETE | findByIdentifiers, findPotentialDuplicates |
| Audit trail | COMPLETE | AuditService on product/offer lifecycle |
| XLSX import (merchant) | COMPLETE | P10: upload, parse, preview, validate, process |
| XLSX import (admin) | COMPLETE | catalog-import module: parser, planner, resolver, validator, executor |
| CSV export | COMPLETE | Typed attribute export, one-row-per-variant |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-01 | P2 | No product submission workflow | Products go directly to ACTIVE via PATCH; no SUBMITTED/REVIEW/APPROVED states for merchants |
| F-P11-02 | P3 | No variant media management UI | product_media.variant_id exists in schema but no dedicated UI |
| F-P11-03 | P3 | No orphan media cleanup | Failed/abandoned uploads leave S3 objects; no scheduled job |
| F-P11-04 | P3 | No manufacturer entity | GTIN/EAN/MPN on products; no separate manufacturer table |
| F-P11-05 | P2 | No XLSX export | Only CSV export implemented; merchants expect XLSX |

---

## 5. Merchant/Store Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Store management | COMPLETE | CRUD, verification |
| Store membership | COMPLETE | OWNER/ADMIN/MEMBER roles, last-owner protection |
| Store authorization | COMPLETE | assertStoreInOrg + assertStoreMember on all merchant endpoints |
| Cross-tenant isolation | COMPLETE | 24/24 PASS in P10 tenant isolation test |
| Import jobs | COMPLETE | Chunked, resumable, cancelable |
| Offer management | COMPLETE | Offer CRUD, price lists, warehouses |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-06 | P3 | No invitation/onboarding flow | Membership added directly by OWNER; no email invitation |
| F-P11-07 | P3 | No membership audit trail | store_members has no updated_at or change history |

---

## 6. Product Governance Audit

### Current State

Products have a `status` field (ACTIVE/INACTIVE/DRAFT) but no formal lifecycle workflow. Admin moderation exists (POST/PATCH admin/products/:id/moderate) but merchant-created products bypass submission.

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-01 | P2 | No product submission workflow | Merchants can create products directly; no SUBMITTED → REVIEW → APPROVED flow |
| F-P11-08 | P2 | No edit-after-approval governance | Once APPROVED, edits go directly live; no re-moderation |
| F-P11-09 | P3 | No bulk moderation | Admin must moderate products one-by-one |
| F-P11-10 | P3 | No product merge/dedup UI | API exists (findPotentialDuplicates) but no UI |

**Business impact:** Without submission workflow, merchants can publish incomplete/incorrect products directly to the catalog. Admin moderation is reactive, not proactive.

---

## 7. Offer/Pricing Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Offer CRUD | COMPLETE | DRAFT/PROPOSED/ACTIVE/SUSPENDED/REJECTED/WITHDRAWN lifecycle |
| Price lists | COMPLETE | Price lists + tiers (quantity breaks) |
| Price resolution | COMPLETE | resolveOfferPrices shared resolver |
| Currency snapshot | COMPLETE | Offer currency captured at creation |
| Offer activation | COMPLETE | reviewedBy/reviewedAt, activatedAt |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-11 | P2 | Promotions not wired to checkout | promotions module exists but cart.service.ts does not apply promo codes |
| F-P11-12 | P3 | No price history | base_price_minor updated in place; no audit trail of price changes |
| F-P11-13 | P3 | No price validity periods | Offers have no valid_from/valid_to |
| F-P11-14 | P3 | No B2B negotiated pricing | No quote/RFQ functionality |

---

## 8. Inventory Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Stock ledger | COMPLETE | inventory_items + stock_movements (append-only) |
| Reservations | COMPLETE | qty_reserved, reserved at merchant acceptance |
| Transfers | COMPLETE | Warehouse-to-warehouse transfers |
| CHECK constraints | COMPLETE | qty_on_hand >= 0, qty_reserved >= 0 (migration 0055) |
| Low stock alerts | COMPLETE | reorderPoint, lowStockAlert flag |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-15 | P2 | No inventory receiving | No way to receive stock into warehouses; no purchase orders |
| F-P11-16 | P3 | No cycle counting | No inventory audit capability |
| F-P11-17 | P3 | No inventory valuation | No cost tracking (FIFO/LIFO/weighted average) |

**Business impact:** Merchants cannot receive stock into the system. Inventory starts at zero and can only be adjusted manually. No way to track stock value for accounting.

---

## 9. Order Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Master/sub order split | COMPLETE | One master order → N sub-orders (per store) |
| Order lifecycle | COMPLETE | 16 statuses: DRAFT → SUBMITTED → PENDING_CONFIRMATION → ACCEPTED/PARTIALLY_ACCEPTED/REJECTED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED → DISPUTED |
| Idempotency | COMPLETE | Idempotency key + request fingerprint |
| Immutable snapshots | COMPLETE | unit_price_minor, offer_snapshot captured at checkout |
| Financial breakdown | COMPLETE | order_financial_breakdown (products, discount, delivery, tax, commission, merchant_net) |
| Cancellation | COMPLETE | Buyer/merchant/admin cancellation with reason tracking |
| Delivery completion | COMPLETE | Driver delivery, buyer confirmation, auto-complete worker |
| Status history | COMPLETE | Append-only order_status_history |
| Stock settlement | COMPLETE | Atomic stock release on REJECTED/CANCELLED |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-18 | P1 | No payment processing | orders.service.ts has PAYMENT_PENDING in transition map but no payment module |
| F-P11-19 | P2 | No refunds | No refund module; disputes exist but no financial linkage |
| F-P11-20 | P2 | No returns | No return workflow; disputes are conversational only |

---

## 10. Payment/Financial Audit

### Current State

**NO PAYMENT MODULE EXISTS.** The `payments` directory is empty. Orders have financial breakdown (subtotal, discount, delivery, tax, commission, merchant_net) but no actual payment processing.

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-18 | P1 | No payment processing | payments/ directory empty; no payment gateway integration |
| F-P11-21 | P1 | No merchant settlement | No way to pay merchants for completed orders |
| F-P11-22 | P1 | No platform commission collection | commission_minor calculated but not collected |
| F-P11-19 | P2 | No refunds | No refund workflow |
| F-P11-23 | P3 | No invoices | No invoice generation |
| F-P11-24 | P3 | No credit/debit adjustments | No manual adjustment capability |
| F-P11-25 | P3 | No accounting integration | No export to accounting systems |

**Business impact:** CRITICAL. The platform cannot process real transactions. Orders are tracked but not financially settled. This is the #1 blocker for production adoption.

---

## 11. Returns/Refunds/Disputes Audit

### Current State

Disputes module exists with conversational workflow (OPEN → EVIDENCE → RESPONSE → REVIEW → RESOLVED/CLOSED). 72-hour window from DELIVERED. No financial linkage.

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-19 | P2 | No refunds | Disputes exist but no refund processing |
| F-P11-20 | P2 | No returns | No return workflow (RMA, return shipping, return-to-stock) |
| F-P11-26 | P2 | No partial refunds | Disputes are binary (resolved/closed); no partial refund amounts |
| F-P11-27 | P3 | No return-to-stock | No inventory adjustment on returns |

---

## 12. Fulfillment/Carrier Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Carrier abstraction | COMPLETE | ShippingProviderRegistry, ManualDeliveryProvider |
| Shipment lifecycle | COMPLETE | PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED |
| Driver assignment | COMPLETE | Driver workflow (ASSIGNED → PICKED_UP → OUT_FOR_DELIVERY) |
| Webhook security | COMPLETE | HMAC signature verification |
| Carrier reconciliation | COMPLETE | Reconciliation service |
| Delivery zones | COMPLETE | Zone-based shipping costs |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-28 | P3 | No real carrier sandbox | ManualDeliveryProvider only; no Aramex/test integration |
| F-P11-29 | P3 | No carrier retries | No automatic retry on carrier failure |
| F-P11-30 | P3 | No proof of delivery | No signature/photo capture |

---

## 13. Search/Discovery Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Full-text search | COMPLETE | tsvector + normalize_arabic() |
| Trigram fuzzy | COMPLETE | Fuzzy matching fallback |
| SKU fast-path | COMPLETE | Exact SKU match returns immediately |
| Price range filter | COMPLETE | priceMin/priceMax (P9) |
| Availability filter | COMPLETE | inStock filter (P9) |
| Sorting | COMPLETE | price_asc, price_desc, newest, name (P9) |
| Attribute facets | COMPLETE | Dynamic attribute facets (P9) |
| Search history | COMPLETE | search_queries logged for analytics |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-31 | P2 | Mobile search lacks P9 filters | Mobile search_screen.dart does not have price/availability/attribute filters |
| F-P11-32 | P3 | No typo tolerance | Trigram helps but no explicit typo correction |
| F-P11-33 | P3 | No synonyms | No synonym dictionary for search |
| F-P11-34 | P3 | No Arabic search optimization | normalize_arabic() exists but no stemming/lemmatization |

---

## 14. Mobile Audit

### Current State

Flutter mobile app with buyer, merchant, and driver screens. API client generated from OpenAPI spec.

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-31 | P2 | Mobile search lacks P9 filters | search_screen.dart does not have price/availability/attribute filters |
| F-P11-35 | P3 | No mobile XLSX import | Merchant import not available on mobile |
| F-P11-36 | P3 | No mobile Product Studio | Product creation/edit limited on mobile |

---

## 15. Notification Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Multi-channel | COMPLETE | SMS, PUSH, IN_APP, WHATSAPP |
| Templates | COMPLETE | 20+ templates (otp, order, dispute, import) |
| Quiet hours | COMPLETE | 22:00–07:00 for PROMOTIONAL/BEHAVIORAL |
| Device tokens | COMPLETE | FCM push notifications |
| Notification preferences | COMPLETE | User opt-in/opt-out |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-37 | P3 | No email notifications | Only SMS/PUSH/IN_APP/WHATSAPP; no email channel |
| F-P11-38 | P3 | No import completion/failure notifications | import.completed/import.failed templates exist but not wired |

---

## 16. Observability Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Structured logging | COMPLETE | NestJS Logger throughout |
| Audit trail | COMPLETE | AuditLogMiddleware on all routes |
| Query metrics | COMPLETE | timeQuery, recordCacheHit, recordCacheMiss |
| Outbox dispatcher | COMPLETE | Transactional outbox for events |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-39 | P3 | No distributed tracing | No OpenTelemetry/Jaeger integration |
| F-P11-40 | P3 | No metrics export | No Prometheus/Grafana integration |
| F-P11-41 | P3 | Process-local circuit breaker | Not distributed; horizontal scaling verification needed |

---

## 17. Security Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| JWT authorization | COMPLETE | All endpoints guarded |
| Permission checks | COMPLETE | PermissionsGuard + RequirePermission |
| Org isolation | COMPLETE | assertStoreInOrg on all merchant endpoints |
| Store membership | COMPLETE | assertStoreMember on all store-scoped endpoints |
| IDOR protection | COMPLETE | Ownership checks on orders, imports, disputes |
| Rate limiting | COMPLETE | ThrottlerModule (100 req/min default, 30/min webhook) |
| File upload security | COMPLETE | MIME validation, size limits, .xlsm rejection |
| Storage key protection | COMPLETE | Server-derived keys; client cannot supply |
| SQL injection protection | COMPLETE | Drizzle ORM parameterized queries |
| Optimistic locking | COMPLETE | updatedAt atomic conditional UPDATE |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-42 | P3 | No webhook replay protection | No timestamp-based replay prevention on carrier webhooks |
| F-P11-43 | P3 | No 2FA for admin | Admin login is password + device check only |

---

## 18. Concurrency/Data Integrity Audit

### Complete

| Capability | Status | Evidence |
|------------|--------|----------|
| Import chunk atomicity | COMPLETE | Atomic claim on import_job_chunks.status |
| Order status transitions | COMPLETE | Optimistic lock + atomic transaction |
| Stock settlement | COMPLETE | Atomic stock release on REJECTED/CANCELLED |
| Inventory CHECK constraints | COMPLETE | qty_on_hand >= 0, qty_reserved >= 0 |
| Idempotency | COMPLETE | Idempotency key + request fingerprint on checkout |
| Transactional outbox | COMPLETE | Outbox events inside same transaction |

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-44 | P3 | No payment idempotency | Payment processing (when implemented) needs idempotency |
| F-P11-45 | P3 | No refund idempotency | Refund processing (when implemented) needs idempotency |

---

## 19. Performance/Scale Audit

### Current State

- P10 performance: parse=695ms, preview=1043ms, report=87ms (all within thresholds)
- P9 performance: combined search 79.9ms median
- No load testing performed

### Gaps

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| F-P11-46 | P3 | No load testing | No evidence of concurrent user testing |
| F-P11-47 | P3 | Search performance at scale | No evidence of search performance with 100K+ products |

---

## 20. UX/Business Journey Audit

### Buyer Journey

```
Register/Login → Search → Browse → Product details → Compare offers → Cart → Checkout → [PAYMENT MISSING] → Order → Tracking → Delivery → Completion → [RETURN/REFUND MISSING]
```

**Stops at:** Checkout (no payment), Post-delivery (no returns/refunds)

### Merchant Journey

```
Register → Store → Membership → Product creation → Import → [MODERATION MISSING] → [PUBLICATION MISSING] → Offer → Inventory → [RECEIVING MISSING] → Order → Fulfillment → [SETTLEMENT MISSING]
```

**Stops at:** Product creation (no submission workflow), Inventory (no receiving), Fulfillment (no settlement)

### Admin Journey

```
Governance → Moderation → Catalog → Merchants → Orders → [PAYMENTS MISSING] → [DISPUTES PARTIAL] → Reports → Audit
```

**Stops at:** Orders (no payments), Disputes (no financial resolution)

---

## 21. Deferred Work Review

| # | Deferred Item | Recommendation | Rationale |
|---|---------------|----------------|-----------|
| 1 | Product submission workflow | **ELEVATE TO P11** | P2 finding; required for production governance |
| 2 | Mobile search parity | KEEP DEFERRED | P2 but not a production blocker |
| 3 | Inventory receiving | KEEP DEFERRED | P2 but can be post-payment |
| 4 | Cycle counting | KEEP DEFERRED | P3; operational enhancement |
| 5 | Inventory valuation | KEEP DEFERRED | P3; accounting integration |
| 6 | Promotions wired to checkout | KEEP DEFERRED | P2 but requires payment first |
| 7 | Payments | **ELEVATE TO P12** | P1 finding; #1 production blocker |
| 8 | Refunds | KEEP DEFERRED | P2; requires payment first |
| 9 | Returns | KEEP DEFERRED | P2; requires refunds first |
| 10 | SSE | KEEP DEFERRED | P3; enhancement |
| 11 | XLSX export | KEEP DEFERRED | P2; CSV export works |
| 12 | Admin XLSX redesign | KEEP DEFERRED | P3; current UI functional |
| 13 | Mobile XLSX import | KEEP DEFERRED | P3; mobile enhancement |
| 14 | Bulk moderation | KEEP DEFERRED | P3; operational enhancement |
| 15 | Product merge/dedup | KEEP DEFERRED | P3; API exists |
| 16 | Price validity/history | KEEP DEFERRED | P3; enhancement |
| 17 | Product Studio autosave | KEEP DEFERRED | P3; UX enhancement |
| 18 | Variant media UI | KEEP DEFERRED | P3; enhancement |
| 19 | Orphan S3 cleanup | KEEP DEFERRED | P3; operational |
| 20 | Search relevance | KEEP DEFERRED | P3; enhancement |
| 21 | Full-text optimization | KEEP DEFERRED | P3; performance |

---

## 22. Findings Matrix

| ID | Severity | Area | Current Behavior | Expected Behavior | Business Impact | Recommended Milestone |
|----|----------|------|------------------|-------------------|-----------------|----------------------|
| F-P11-01 | P2 | Catalog | No product submission workflow | SUBMITTED → REVIEW → APPROVED flow | Merchants can publish incomplete products | P11 |
| F-P11-02 | P3 | Catalog | No variant media UI | Dedicated variant media management | UX gap | Future |
| F-P11-03 | P3 | Catalog | No orphan media cleanup | Scheduled S3 cleanup job | Storage cost | Future |
| F-P11-04 | P3 | Catalog | No manufacturer entity | Separate manufacturer table | Data model gap | Future |
| F-P11-05 | P2 | Catalog | No XLSX export | XLSX export with typed attributes | Merchant expectation | P12+ |
| F-P11-06 | P3 | Merchant | No invitation flow | Email invitation for membership | Onboarding gap | Future |
| F-P11-07 | P3 | Merchant | No membership audit trail | Change history for store_members | Compliance gap | Future |
| F-P11-08 | P2 | Governance | No edit-after-approval governance | Re-moderation on edits | Compliance risk | P11 |
| F-P11-09 | P3 | Governance | No bulk moderation | Bulk approve/reject | Operational efficiency | Future |
| F-P11-10 | P3 | Governance | No product merge/dedup UI | UI for dedup workflow | Data quality | Future |
| F-P11-11 | P2 | Pricing | Promotions not wired to checkout | Cart applies promo codes | Revenue gap | P12 |
| F-P11-12 | P3 | Pricing | No price history | Audit trail of price changes | Compliance | Future |
| F-P11-13 | P3 | Pricing | No price validity periods | valid_from/valid_to on offers | Pricing flexibility | Future |
| F-P11-14 | P3 | Pricing | No B2B negotiated pricing | Quote/RFQ functionality | B2B feature gap | Future |
| F-P11-15 | P2 | Inventory | No inventory receiving | Purchase orders + receiving | Operational gap | P12+ |
| F-P11-16 | P3 | Inventory | No cycle counting | Inventory audit capability | Operational | Future |
| F-P11-17 | P3 | Inventory | No inventory valuation | Cost tracking (FIFO/LIFO) | Accounting | Future |
| F-P11-18 | P1 | Payment | No payment processing | Payment gateway integration | **CRITICAL: cannot process transactions** | P12 |
| F-P11-19 | P2 | Refunds | No refunds | Refund workflow | Customer satisfaction | P13 |
| F-P11-20 | P2 | Returns | No returns | Return workflow (RMA) | Customer satisfaction | P13 |
| F-P11-21 | P1 | Settlement | No merchant settlement | Pay merchants for completed orders | **CRITICAL: merchants not paid** | P12 |
| F-P11-22 | P1 | Commission | No commission collection | Collect platform fees | **CRITICAL: no revenue** | P12 |
| F-P11-23 | P3 | Finance | No invoices | Invoice generation | Compliance | Future |
| F-P11-24 | P3 | Finance | No credit/debit adjustments | Manual adjustment capability | Operational | Future |
| F-P11-25 | P3 | Finance | No accounting integration | Export to accounting systems | Integration | Future |
| F-P11-26 | P2 | Disputes | No partial refunds | Partial refund amounts | Customer satisfaction | P13 |
| F-P11-27 | P3 | Returns | No return-to-stock | Inventory adjustment on returns | Operational | Future |
| F-P11-28 | P3 | Fulfillment | No real carrier sandbox | Aramex/test integration | Operational | Future |
| F-P11-29 | P3 | Fulfillment | No carrier retries | Automatic retry on failure | Reliability | Future |
| F-P11-30 | P3 | Fulfillment | No proof of delivery | Signature/photo capture | Compliance | Future |
| F-P11-31 | P2 | Mobile | Mobile search lacks P9 filters | Price/availability/attribute filters on mobile | UX parity | P11+ |
| F-P11-32 | P3 | Search | No typo tolerance | Explicit typo correction | UX | Future |
| F-P11-33 | P3 | Search | No synonyms | Synonym dictionary | UX | Future |
| F-P11-34 | P3 | Search | No Arabic optimization | Stemming/lemmatization | UX | Future |
| F-P11-35 | P3 | Mobile | No mobile XLSX import | Merchant import on mobile | UX | Future |
| F-P11-36 | P3 | Mobile | No mobile Product Studio | Product creation on mobile | UX | Future |
| F-P11-37 | P3 | Notifications | No email notifications | Email channel | Communication | Future |
| F-P11-38 | P3 | Notifications | Import notifications not wired | Wire import.completed/failed | UX | Future |
| F-P11-39 | P3 | Observability | No distributed tracing | OpenTelemetry/Jaeger | Debugging | Future |
| F-P11-40 | P3 | Observability | No metrics export | Prometheus/Grafana | Monitoring | Future |
| F-P11-41 | P3 | Observability | Process-local circuit breaker | Distributed circuit breaker | Scalability | Future |
| F-P11-42 | P3 | Security | No webhook replay protection | Timestamp-based replay prevention | Security | Future |
| F-P11-43 | P3 | Security | No 2FA for admin | 2FA for admin login | Security | Future |
| F-P11-44 | P3 | Concurrency | No payment idempotency | Payment idempotency (when implemented) | Correctness | P12 |
| F-P11-45 | P3 | Concurrency | No refund idempotency | Refund idempotency (when implemented) | Correctness | P13 |
| F-P11-46 | P3 | Performance | No load testing | Concurrent user testing | Scalability | Future |
| F-P11-47 | P3 | Performance | Search at scale untested | 100K+ product search testing | Scalability | Future |

**Summary:**
- P0: 0
- P1: 3 (F-P11-18, F-P11-21, F-P11-22 — all payment/settlement)
- P2: 9 (F-P11-01, F-P11-05, F-P11-08, F-P11-11, F-P11-15, F-P11-19, F-P11-20, F-P11-26, F-P11-31)
- P3: 35

---

## 23. Priority Matrix

| Finding | Business Value | Customer Impact | Revenue Impact | Security Risk | Implementation Complexity | Dependencies | Priority |
|---------|---------------|-----------------|----------------|---------------|--------------------------|--------------|----------|
| F-P11-18 (Payment) | HIGH | HIGH | HIGH | LOW | HIGH | None | **P1** |
| F-P11-21 (Settlement) | HIGH | HIGH | HIGH | LOW | HIGH | F-P11-18 | **P1** |
| F-P11-22 (Commission) | HIGH | LOW | HIGH | LOW | MEDIUM | F-P11-18 | **P1** |
| F-P11-01 (Submission) | HIGH | MEDIUM | LOW | LOW | MEDIUM | None | **P2** |
| F-P11-08 (Edit governance) | MEDIUM | LOW | LOW | LOW | MEDIUM | F-P11-01 | **P2** |
| F-P11-11 (Promotions) | MEDIUM | HIGH | MEDIUM | LOW | MEDIUM | F-P11-18 | **P2** |
| F-P11-15 (Receiving) | MEDIUM | MEDIUM | LOW | LOW | HIGH | None | **P2** |
| F-P11-19 (Refunds) | MEDIUM | HIGH | LOW | LOW | HIGH | F-P11-18 | **P2** |
| F-P11-20 (Returns) | MEDIUM | HIGH | LOW | LOW | HIGH | F-P11-19 | **P2** |
| F-P11-31 (Mobile search) | LOW | MEDIUM | LOW | LOW | MEDIUM | None | **P2** |

---

## 24. Candidate Milestones

### Candidate 1: Product Governance & Submission (P11)

**Scope:** Product submission workflow, edit-after-approval governance, bulk moderation

**Rationale:** P2 finding; required for production governance. Merchants can currently publish products without review. This is a compliance and quality risk.

**Complexity:** MEDIUM

**Dependencies:** None

### Candidate 2: Payment & Financial Settlement (P12)

**Scope:** Payment gateway integration, merchant settlement, commission collection, refunds

**Rationale:** P1 finding; #1 production blocker. Cannot process real transactions without payment.

**Complexity:** HIGH

**Dependencies:** None (but refunds depend on payment)

### Candidate 3: Inventory Operations (P13)

**Scope:** Inventory receiving, cycle counting, valuation

**Rationale:** P2 finding; operational gap. Merchants cannot receive stock.

**Complexity:** HIGH

**Dependencies:** None

### Candidate 4: Returns & Refunds (P14)

**Scope:** Return workflow, refund processing, partial refunds, return-to-stock

**Rationale:** P2 finding; customer satisfaction. Disputes exist but no financial resolution.

**Complexity:** HIGH

**Dependencies:** F-P11-18 (payment)

### Candidate 5: Mobile Buyer Parity (P15)

**Scope:** Mobile search filters, mobile checkout enhancements

**Rationale:** P2 finding; UX parity with web.

**Complexity:** MEDIUM

**Dependencies:** None

### Candidate 6: Production Hardening (P16)

**Scope:** Load testing, distributed tracing, metrics export, circuit breaker

**Rationale:** P3 findings; scalability and observability.

**Complexity:** MEDIUM

**Dependencies:** None

---

## 25. Dependency Graph

```
Product Governance (P11)
        ↓
Product Publication
        ↓
Offer Activation
        ↓
Checkout
        ↓
Payment (P12)
        ↓
Settlement
        ↓
Refund / Return (P14)
```

```
Inventory Receiving (P13)
        ↓
Available Inventory
        ↓
Offer Availability
        ↓
Checkout
        ↓
Fulfillment
```

```
Merchant Membership
        ↓
Merchant Product Management
        ↓
Submission / Moderation (P11)
        ↓
Publication
```

---

## 26. Recommended P11 Outcome

### Recommended Next Milestone: P11 — Product Governance & Submission Workflow

**Why now:**
- P2 finding (F-P11-01, F-P11-08)
- Merchants can currently publish products without review
- No edit-after-approval governance
- Compliance and quality risk for production adoption

**Business objective:**
Establish product governance workflow so merchants submit products for review, admins moderate, and approved products are published to the catalog. Ensure edits after approval trigger re-moderation.

**Current gaps addressed:**
- F-P11-01: No product submission workflow
- F-P11-08: No edit-after-approval governance
- F-P11-09: No bulk moderation (partial)

**Scope:**
- Product submission workflow: DRAFT → SUBMITTED → PENDING_REVIEW → APPROVED → PUBLISHED
- Admin moderation queue with bulk actions
- Edit-after-approval: edits move product back to PENDING_REVIEW
- Moderation audit trail
- Merchant notification on approval/rejection

**Out of scope:**
- Payment processing (P12)
- Inventory receiving (P13)
- Returns/refunds (P14)
- Mobile search parity (P15)
- XLSX export (deferred)

**Dependencies:** None

**Migration expectation:** CONDITIONAL — may require schema changes to product status enum and moderation tables.

**Security considerations:**
- Store authorization: only store members can submit products
- Admin authorization: only admins/moderators can approve/reject
- IDOR protection: merchants cannot submit other stores' products

**Concurrency considerations:**
- Optimistic locking on product status transitions
- Atomic status updates with audit trail

**Acceptance strategy:**
- Unit tests for submission workflow
- Integration tests for moderation queue
- E2E tests for merchant submission → admin approval flow
- Regression tests for existing catalog functionality

**Estimated complexity:** MEDIUM (2-3 weeks)

**Why alternatives should wait:**
- Payment (P12) is P1 but requires more time and external dependencies (payment gateway)
- Product governance is foundational for production adoption and can be implemented independently
- Payment can follow immediately after governance is complete

---

## 27. Proposed Business Decisions

| ID | Decision | Status |
|----|----------|--------|
| BD-P11-01 | Who can submit products? (store members with OWNER/ADMIN role) | PROPOSED |
| BD-P11-02 | What state transitions are legal? (DRAFT → SUBMITTED → PENDING_REVIEW → APPROVED → PUBLISHED) | PROPOSED |
| BD-P11-03 | What happens concurrently? (moderation queue processing) | PROPOSED |
| BD-P11-04 | What happens on failure? (rejection with reason, resubmission allowed) | PROPOSED |
| BD-P11-05 | What is idempotent? (submission idempotency key) | PROPOSED |
| BD-P11-06 | What is tenant scoped? (submission is store-scoped) | PROPOSED |
| BD-P11-07 | What is financially authoritative? (N/A for submission) | PROPOSED |
| BD-P11-08 | What data is immutable? (moderation audit trail) | PROPOSED |
| BD-P11-09 | What requires approval? (product publication) | PROPOSED |
| BD-P11-10 | Do edits after approval require re-moderation? (YES) | PROPOSED |

**Note:** These are PROPOSED decisions for the next Business Rules & Architecture Lock. They are NOT locked.

---

## 28. Migration Decision

**Migration required?** CONDITIONAL

**If YES:**
- Affected tables: `products` (status enum extension), `product_moderation` (new table)
- Why: Product lifecycle states require schema changes
- Do not create migration yet

**If CONDITIONAL:**
- Evidence needed: Final decision on product status enum and moderation table structure
- Depends on: Business Rules & Architecture Lock for P11

---

## 29. Architecture Health Scorecard

| Domain | Status | Notes |
|--------|--------|-------|
| Catalog | GREEN | Complete taxonomy, products, variants, offers |
| Product Governance | YELLOW | No submission workflow (F-P11-01) |
| Merchant/Store | GREEN | Complete membership, authorization, isolation |
| Offers/Pricing | GREEN | Complete offer lifecycle, price resolution |
| Inventory | YELLOW | No receiving (F-P11-15) |
| Orders | GREEN | Complete lifecycle, cancellation, delivery |
| Payments | RED | **NO PAYMENT PROCESSING** (F-P11-18) |
| Returns/Refunds | RED | **NO REFUNDS/RETURNS** (F-P11-19, F-P11-20) |
| Fulfillment | GREEN | Complete carrier abstraction, driver workflow |
| Search | GREEN | Complete FTS, facets, filters (P9) |
| Mobile | YELLOW | Search lacks P9 filters (F-P11-31) |
| Notifications | GREEN | Complete multi-channel, templates |
| Security | GREEN | Complete JWT, RBAC, isolation, rate limiting |
| Observability | YELLOW | No distributed tracing/metrics (F-P11-39, F-P11-40) |
| Performance | YELLOW | No load testing (F-P11-46) |
| Data Integrity | GREEN | Complete optimistic locking, CHECK constraints |
| Admin/Governance | GREEN | Complete moderation, audit, KPIs |

---

## 30. Production Readiness Assessment

| Question | Answer | Evidence |
|----------|--------|----------|
| Can the platform support real merchants today? | PARTIAL | Catalog/order/fulfillment operational; payment absent |
| Can merchants create/manage products? | YES | Product Studio, import, CRUD |
| Can merchants sell offers? | PARTIAL | Offer management complete; no payment settlement |
| Can buyers discover products? | YES | Search with facets, filters, sorting |
| Can buyers checkout? | PARTIAL | Cart/checkout UI exists; no payment processing |
| Can orders be fulfilled? | YES | Complete fulfillment workflow |
| Can payments be settled? | NO | **NO PAYMENT MODULE** |
| Can returns/refunds be handled? | NO | **NO REFUND/RETURN WORKFLOW** |
| Can inventory be operated reliably? | PARTIAL | Stock ledger complete; no receiving |
| Can admins govern the marketplace? | YES | Moderation, audit, KPIs |
| Can the platform scale horizontally? | PARTIAL | Outbox/realtime exist; no distributed tracing/metrics |

---

## 31. P11 Gate Decision

```text
P11 FRESH ARCHITECTURE & BUSINESS AUDIT = COMPLETE
```

**Findings:**
- 0 P0 blockers
- 3 P1 findings (payment/settlement/commission)
- 9 P2 findings (submission workflow, refunds, returns, mobile parity, etc.)
- 35 P3 findings (deferred enhancements)

**Recommended next milestone:** P11 — Product Governance & Submission Workflow

**Next gate:** P11 BUSINESS RULES & ARCHITECTURE LOCK (after audit recommendation accepted)

**Migration decision:** CONDITIONAL (depends on P11 scope finalization)

**Production readiness:** PARTIAL (payment is #1 blocker)

---

## Appendix: Release Integrity

**Audit performed by:** Fresh architecture & business audit
**Date:** 2026-10-08
**Baseline:** P10 CLOSED / PASS
**Evidence sources:**
- 192 production docs reviewed
- 16 API modules audited
- 55 migrations verified
- Source code inspection (orders, inventory, catalog, shipping, notifications, disputes)
- Mobile app structure verified (128 Dart files)
- Web/admin app pages verified

---

**End of P11 Fresh Architecture & Business Audit**
