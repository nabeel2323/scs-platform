# Smart Commerce & Supply Platform — Implementation Progress Tracker

**Living document** — update status as work progresses  
**Last updated:** 2026-09-03 (M2 Merchant Onboarding complete — stores, warehouses, documents, verification, admin console, wizard UI)

---

## Project Phases Overview

| Phase | Name | Duration | Status | Exit Gate |
|---|---|---|---|---|
| **Phase 0** | Market Validation & Design | 4–8 weeks | 🟡 In Progress | Merchants committed; retailer intent; first procurement flow clear — **Sprint 0 scaffolded** |
| **Phase 1** | Launchable B2B MVP | 12–18 weeks | ⚪ Not Started | Activation rate; first-order conversion; completion rate; repeat orders |
| **Phase 2** | Delivery & Tracking | 8–12 weeks | ⚪ Not Started | Delivery cost/time/success/cancellation data reliable |
| **Phase 3** | Payments, Settlement & Monetization | 8–12 weeks | ⚪ Not Started | Unit economics visible; payment success rate; reconciliation accuracy |
| **Phase 4** | B2C Marketplace | 10–14 weeks | ⚪ Not Started | B2C MAU; conversion; repeat consumer order rate; AOV |
| **Phase 5** | Advertising & Merchant Analytics | 12–16 weeks | ⚪ Not Started | Ad revenue; ROAS; merchant ad retention; no organic degradation |
| **Phase 6** | AI & Optimization | 12–20 weeks | ⚪ Not Started | Recommendation lift; forecast accuracy; reorder adoption |
| **Phase 7** | Commerce Infrastructure | Continuous | ⚪ Not Started | Proven unit economics; ops maturity; stable retention |

**Status indicators:** ⚪ Not Started | 🟡 In Progress | 🔴 Blocked | 🟢 Completed

---

## Phase 1 Milestones — Detailed Checklist

### M1 Foundation (Weeks 1–3)

**Goal:** Identity + audit + outbox + middleware hardened; auth screens on web/admin

- [x] **Sprint 0 complete** (§0.4)
  - [x] Monorepo scaffold (pnpm + Turborepo)
  - [x] `infra/docker-compose.dev.yml` (Postgres+PostGIS, Redis, MinIO, Mailhog)
  - [x] NestJS bootstrap (Helmet, CORS, pino, RFC 7807, OTel, `/healthz`, `/readyz`)
  - [x] Drizzle setup + migration `0001_identity` + seed script
  - [x] Auth OTP end-to-end (request → verify → JWT pair → refresh rotation → logout)
  - [x] `packages/contracts` pipeline (zod → OpenAPI → TS/Dart clients)
  - [x] Flutter flavor scaffold (`retail`, `wholesale`)
  - [x] Next.js `web` + `admin` scaffolds with auth session handling
  - [x] Audit log middleware + outbox dispatcher skeleton
  - [x] k6 smoke script against `/healthz` + auth flow
- [x] **Identity module** (migration `0001_identity`)
  - [x] `users` table with phone-first identity
  - [x] `organizations` table (WHOLESALER, RETAILER, LOGISTICS, PLATFORM)
  - [x] `roles` + `permissions` + `role_permissions` tables
  - [x] `organization_members` with role assignment
  - [x] `sessions` table (refresh-token chain with rotation + reuse detection)
  - [x] JWT access tokens (15 min) with `sub`, `activeOrg`, `role`, `perms` claims
  - [x] Refresh tokens (30 d) with rotation and reuse detection
  - [x] `POST /v1/auth/otp/request` endpoint
  - [x] `POST /v1/auth/otp/verify` endpoint
  - [x] `POST /v1/auth/refresh` endpoint
  - [x] `POST /v1/auth/logout` endpoint
  - [x] `POST /v1/auth/switch-org` endpoint
- [x] **Audit & outbox infrastructure**
  - [x] `audit_logs` table (append-only; middleware-written)
  - [x] `outbox_events` table (transactional outbox)
  - [x] Audit log middleware (verification decisions, refunds, price overrides, admin impersonation, flag changes)
  - [x] Outbox dispatcher (polls `outbox_events` where `dispatched_at IS NULL`; publishes to event bus)
  - [x] Migration `0002_platform` (audit_logs, outbox_events, feature_flags, analytics_events)
  - [x] JWT auth guard + permissions guard + @CurrentUser decorator
  - [x] OpenAPI client generation scripts (TypeScript + Dart)
- [x] **Frontend / mobile**
  - [x] Web auth screens (OTP request/verify, org selection)
  - [x] Admin auth screens
  - [x] Flutter `retail` + `wholesale` flavors with auth flow
  - [x] Design tokens + API client in `mobile-core`

**Exit criteria:** Auth works end-to-end; JWT issued; refresh rotation works; audit log written; outbox dispatcher running

---

### M2 Merchant Onboarding (Weeks 3–6)

**Goal:** Merchant registration, store creation, document upload, verification queue

- [x] **Merchant module** (migration `0003_merchant`)
  - [x] `stores` table (linked to organizations; slug, currency, locale, address JSONB)
  - [x] `warehouses` table (per-store physical locations)
  - [x] `business_documents` table (doc types: COMMERCIAL_REG, TAX_CERT, BANK_LETTER, NATIONAL_ID, OTHER)
  - [x] `verification_requests` table (SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, REVISION)
  - [x] `POST /v1/stores` endpoint (with slug generation + outbox event)
  - [x] `PATCH /v1/stores/{id}` endpoint
  - [x] `GET /v1/stores` endpoint (admin: all; merchant: scoped to org)
  - [x] `GET /v1/stores/{id}` + `GET /v1/stores/slug/{slug}` endpoints
  - [x] `POST /v1/stores/{id}/warehouses` endpoint
  - [x] `GET /v1/stores/{id}/warehouses` + `PATCH /v1/warehouses/{id}` endpoints
  - [x] `POST /v1/documents` endpoint (register upload)
  - [x] `POST /v1/documents/{id}/presign` endpoint (presigned download URL)
  - [x] `GET /v1/documents/org/{orgId}` + `GET /v1/documents/store/{storeId}` endpoints
  - [x] `POST /v1/stores/{id}/verify` endpoint (submit verification)
  - [x] `GET /v1/verification/queue` endpoint (admin, permission-gated)
  - [x] `GET /v1/verification/{id}` endpoint (admin, permission-gated)
  - [x] `POST /v1/verification/{id}/review` endpoint (approve/reject/revision)
- [x] **Admin verification console**
  - [x] Verification queue page with status filters (admin console)
  - [x] Verification review page with store details, documents, decision form
  - [x] Decision workflow (approve/reject/revision with mandatory reason on reject)
  - [x] Admin API client (`lib/api.ts`) for verification + store + document endpoints
- [x] **Frontend / mobile**
  - [x] Merchant onboarding wizard (web) — 4-step flow: store info → warehouse → documents → review
  - [x] Onboarding success page
  - [x] Web API client (`lib/api.ts`) for merchant endpoints
  - [x] Home page updated with "Open a Store" link
- [x] **Events**
  - [x] `merchant.store.created` event published on store creation
  - [x] `merchant.verification.submitted` event published on verification submission
  - [x] `merchant.verification.approved` / `rejected` events published on review
- [x] **Contracts**
  - [x] Merchant zod schemas (Store, Warehouse, Document, Verification)
  - [x] TypeScript type exports for all merchant DTOs

**Exit criteria:** Merchant can register, create store, upload documents; admin can review and verify; events flow through outbox

---

### M3 Catalog & Pricing (Weeks 5–8)

**Goal:** Product catalog, variants, media pipeline, tiered pricing, bulk import

- [ ] **Catalog module** (migration `0003_catalog`)
  - [ ] `categories` table (materialized path)
  - [ ] `brands` table
  - [ ] `products` table (DRAFT, ACTIVE, ARCHIVED, REJECTED; soft delete)
  - [ ] `product_variants` table (SKU, barcode, unit, attributes)
  - [ ] `product_media` table (url, thumb_url, blurhash, alt_text)
  - [ ] `import_jobs` table (UPLOADED, MAPPING, VALIDATED, IMPORTING, REVIEW, COMPLETED, FAILED)
  - [ ] `POST /v1/products` endpoint
  - [ ] `PATCH /v1/products/{id}` endpoint
  - [ ] `POST /v1/products/{id}/variants` endpoint
  - [ ] `POST /v1/media/presign` endpoint
  - [ ] `POST /v1/catalog/imports` endpoint
  - [ ] `GET /v1/catalog/imports/{jobId}` endpoint
  - [ ] Media pipeline (presigned S3 upload → post-processing → renditions → CDN invalidation)
- [ ] **Inventory module** (migration `0004_inventory`)
  - [ ] `inventory_items` table (qty_on_hand, qty_reserved, reorder_point)
  - [ ] `stock_movements` table (append-only ledger: ADJUST, RESERVE, RELEASE, SALE, CANCEL)
  - [ ] `GET /v1/inventory` endpoint
  - [ ] `PATCH /v1/inventory/{itemId}` endpoint
  - [ ] `GET /v1/inventory/low-stock` endpoint
  - [ ] Reservation policy: stock reserved at merchant acceptance, not at cart
- [ ] **Pricing module** (migration `0005_pricing`)
  - [ ] `price_lists` table (B2B/B2C channel; PUBLIC/SEGMENT/CONTRACT audience)
  - [ ] `price_tiers` table (min_qty, max_qty, unit_price_minor)
  - [ ] `POST /v1/price-lists` endpoint
  - [ ] `POST /v1/price-lists/{id}/tiers` endpoint
  - [ ] `GET /v1/products/{id}/pricing` endpoint
  - [ ] Price resolution logic: `resolvePrice(variantId, listId, qty)` → tier-based unit price
- [ ] **Frontend / mobile**
  - [ ] Product editor (web/mobile)
  - [ ] TierLadder editor (web)
  - [ ] ImportWizard (web) — Excel/CSV upload, column mapping, row-level validation, preview, import
  - [ ] Admin moderation queue (web)
- [ ] **Events**
  - [ ] `catalog.product.published` event published on product activation
  - [ ] `catalog.import.completed` event published on import completion
  - [ ] `inventory.stock.reserved` / `inventory.stock.released` events (consumed by orders)
  - [ ] `pricing.price_list.updated` event published on price list change

**Exit criteria:** Merchant can create products with variants; upload media; set tiered pricing; import bulk catalog; inventory tracked

---

### M4 Discovery & Cart (Weeks 7–10)

**Goal:** Search, store/product pages, multi-supplier cart

- [ ] **Search** (migration `0011_search`)
  - [ ] `pg_trgm` extension + tsvector triggers
  - [ ] Arabic normalization function (strip diacritics, fold alef variants, taa-marbuta→haa, unify ya)
  - [ ] `GET /v1/search` endpoint (FTS + filters; SKU/barcode exact-match fast path)
  - [ ] `GET /v1/categories` endpoint
  - [ ] `GET /v1/categories/{id}/products` endpoint
  - [ ] SearchIndexer port (PostgreSQL FTS adapter; OpenSearch swap-ready)
- [ ] **Cart module** (part of migration `0006_orders`)
  - [ ] `carts` table (ACTIVE, CONVERTED, ABANDONED)
  - [ ] `cart_items` table (grouped by store_id for supplier grouping)
  - [ ] `GET /v1/cart` endpoint
  - [ ] `POST /v1/cart/items` endpoint
  - [ ] `PATCH /v1/cart/items/{id}` endpoint
  - [ ] `DELETE /v1/cart/items/{id}` endpoint
  - [ ] Multi-supplier cart (items grouped by store; checkout creates multiple sub-orders)
- [ ] **Promotions module** (migration `0007_promotions`)
  - [ ] `promotions` table (PERCENT, FIXED, QTY_DISCOUNT, TIME_LIMITED in Phase 1)
  - [ ] `promotion_redemptions` table
  - [ ] `POST /v1/promotions` endpoint
  - [ ] `GET /v1/promotions` endpoint
  - [ ] `GET /v1/offers/nearby` endpoint
  - [ ] Promotion resolution logic (applied at checkout; snapshot on order_items)
- [ ] **Frontend / mobile**
  - [ ] Search page with filters (web/mobile)
  - [ ] Store page (web/mobile)
  - [ ] Product page (web/mobile)
  - [ ] Cart page with multi-supplier grouping (web/mobile)
  - [ ] Favorites (web/mobile)

**Exit criteria:** Buyer can search, browse, add to cart from multiple suppliers; cart persists; promotions applied at checkout

---

### M5 Ordering (Weeks 9–12)

**Goal:** Checkout, order FSM, accept/partial/reject, reorder, notifications

- [ ] **Orders module** (migration `0006_orders`)
  - [ ] `master_orders` table (buyer's purchase intent; status derived from sub-orders)
  - [ ] `orders` table (sub-order per supplier; fulfillment_method: PICKUP, MERCHANT_DELIVERY, PLATFORM_DELIVERY)
  - [ ] `order_items` table (qty, qty_confirmed, unit_price_minor SNAPSHOT, tier_min_qty, promo_snapshot, line_total_minor)
  - [ ] `order_financial_breakdown` table (products, discount, delivery_fee, tax, commission, merchant_net)
  - [ ] `order_status_history` table (every transition, every actor)
  - [ ] Order FSM implementation (16 statuses; transition matrix §4.1)
  - [ ] `POST /v1/checkout` endpoint (idempotent; validates MOQ; resolves prices; snapshots; writes breakdown; emits `order.submitted`)
  - [ ] `GET /v1/orders` endpoint
  - [ ] `GET /v1/orders/{id}` endpoint
  - [ ] `POST /v1/orders/{id}/accept` endpoint (idempotent; reserves stock; re-price guard)
  - [ ] `POST /v1/orders/{id}/reject` endpoint (idempotent; reason mandatory)
  - [ ] `POST /v1/orders/{id}/items/{itemId}/confirm` endpoint (re-price confirmation)
  - [ ] `POST /v1/orders/{id}/status` endpoint (idempotent; FSM guard)
  - [ ] `POST /v1/orders/{id}/cancel` endpoint (idempotent; releases reservations)
  - [ ] `POST /v1/orders/{id}/reorder` endpoint
  - [ ] Re-price guard (I2): if price list changed post-checkout, return `409 price_changed` with per-line deltas
  - [ ] Idempotency keys (Redis-backed 24 h store; replays return original result)
  - [ ] SLA timers (confirmation SLA default 12 h; warning at T-2 h; auto-cancel at `sla_at`)
- [ ] **Notifications module** (migration `0009_comms`)
  - [ ] `notifications` table (TRANSACTIONAL, PROMOTIONAL, BEHAVIORAL)
  - [ ] `notification_preferences` table
  - [ ] `device_tokens` table
  - [ ] Notification dispatcher (triggered only by domain events via outbox)
  - [ ] Template registry (otp.login, order.submitted, order.accepted, order.ready, etc.)
  - [ ] `GET /v1/notifications` endpoint
  - [ ] `PATCH /v1/notifications/{id}/read` endpoint
  - [ ] `GET /v1/notification-preferences` endpoint
  - [ ] `PATCH /v1/notification-preferences` endpoint
  - [ ] SMS adapter with two-provider failover + WhatsApp fallback
  - [ ] FCM adapter
  - [ ] Quiet hours (22:00–07:00 local) for Behavioral/Promotional
- [ ] **Frontend / mobile**
  - [ ] Order flows (checkout, order list, order detail)
  - [ ] OrderTimeline component (status history visualization)
  - [ ] Notifications center (web/mobile)
  - [ ] Merchant order management (accept/reject/partial)
- [ ] **Events**
  - [ ] `order.submitted` → notifies merchant
  - [ ] `order.accepted` / `order.partially_accepted` / `order.rejected` → notifies buyer
  - [ ] `order.status.changed` → notifies buyer/merchant based on status
  - [ ] `order.cancelled` → notifies buyer
  - [ ] `order.completed` → enables review window

**Exit criteria:** Full order lifecycle works end-to-end; checkout → submit → accept/partial/reject → prepare → ready → delivered → completed; notifications fire; idempotency works; re-price guard works

---

### M6 Trust & Admin (Weeks 12–14)

**Goal:** Ratings, disputes-lite, admin KPIs, analytics funnels

- [ ] **Reviews module** (migration `0008_trust`)
  - [ ] `reviews` table (order-gated: one review per subject per order; subject_type: STORE, DRIVER, BUYER)
  - [ ] `trust_snapshots` table (dimensions, score, badges: VERIFIED, TRUSTED, FAST_FULFILLMENT)
  - [ ] `POST /v1/orders/{id}/review` endpoint
  - [ ] `GET /v1/stores/{id}/reviews` endpoint
  - [ ] Trust score computation (dimensions per §9.2 source)
- [ ] **Support module** (part of migration `0008_trust`)
  - [ ] `disputes` table (OPEN, EVIDENCE, RESPONSE, REVIEW, RESOLVED, CLOSED)
  - [ ] `dispute_events` table
  - [ ] `conversations` table (order-linked chat only)
  - [ ] `messages` table
  - [ ] Dispute workflow (open → evidence → response → review → resolved/closed)
  - [ ] Dispute window (72 h from DELIVERED; freezes `order_financial_breakdown.finalized_at`)
- [ ] **Admin console**
  - [ ] `GET /v1/admin/orders` endpoint
  - [ ] `GET /v1/admin/merchants` endpoint
  - [ ] `GET /v1/admin/kpis` endpoint
  - [ ] `GET /v1/admin/audit-logs` endpoint
  - [ ] Admin order monitor (web)
  - [ ] Admin KPI dashboard (web) — activation funnels, first-order conversion, repeat-order rate
- [ ] **Analytics** (migration `0010_platform`)
  - [ ] `analytics_events` table (monthly RANGE partitions; pg_partman)
  - [ ] Client SDK `track()` → `analytics_events`
  - [ ] Server domain events → `analytics_events`
  - [ ] Event taxonomy (search_performed, product_viewed, cart_item_added, checkout_started, order_submitted, etc.)
  - [ ] Activation funnels (wholesaler: registered → verified → catalog ≥ 20 → first order → repeat ×3)
  - [ ] Admin analytics dashboards (web)
- [ ] **Frontend / mobile**
  - [ ] Ratings UI (web/mobile)
  - [ ] Dispute flow (web/mobile)
  - [ ] Admin order monitor (web)
  - [ ] Admin KPI dashboard (web)

**Exit criteria:** Buyers can rate orders; disputes can be opened and resolved; admin can monitor orders, view KPIs, audit logs; analytics funnels measurable

---

### M7 Hardening & Pilot (Weeks 14–16+)

**Goal:** Load tests, security review, usability passes, pilot launch

- [ ] **Load testing** (k6 scripts in `infra/load/`)
  - [ ] Checkout flow load test (p95 < 800 ms)
  - [ ] Search flow load test (p95 < 300 ms)
  - [ ] Order acceptance flow load test
  - [ ] Location ingestion load test (Phase 2 prep)
  - [ ] Webhook storm test (Phase 3 prep)
- [ ] **Security review**
  - [ ] SAST scan in CI
  - [ ] Dependency + secrets scan in CI
  - [ ] External pen test (blocking for Phase 3)
  - [ ] RBAC verification (all protected routes have object-level authorization)
  - [ ] Backup + PITR verification (quarterly restore drills)
- [ ] **Usability passes**
  - [ ] Merchant task flows with real users (moderated sessions)
  - [ ] Buyer task flows with real users
  - [ ] RTL verification (Arabic)
  - [ ] Accessibility audit (WCAG 2.2 AA)
- [ ] **Operational playbooks** (ready before pilot)
  - [ ] Concierge catalog import (ops imports for the merchant)
  - [ ] Verification review SLA (48 h)
  - [ ] Order-blocking incident (< 30 min response)
  - [ ] Drop-off reason logging (first 30 days)
  - [ ] OTP/SMS provider failover drill
- [ ] **Pilot launch**
  - [ ] Anchor suppliers onboarded (catalogs imported)
  - [ ] Retailer group recruited (launch area)
  - [ ] Field support ready
  - [ ] Monitoring + alerting active (OTel dashboards; SLOs: API 99.5% availability, checkout p95 < 800 ms)
  - [ ] Go/no-go decision (activation rate, first-order conversion, completion rate, repeat-order rate, active merchants)

**Exit criteria:** Load tests pass p95 budgets; security review clean; usability validated; playbooks documented; pilot live; KPIs measurable

---

## Component Status Matrix

| Component | Phase | Status | Notes |
|---|---|---|---|
| **Identity & RBAC** | 1 | 🟢 Completed | JWT signing, auth guards, permissions guard, refresh rotation, org switching |
| **Merchant & Stores** | 1 | 🟢 Completed | Migration `0003_merchant`; store CRUD; warehouses; documents; verification workflow; admin console; wizard UI |
| **Catalog & Products** | 1 | ⚪ Not Started | Migration `0003_catalog`; media pipeline; bulk import |
| **Inventory & Stock** | 1 | ⚪ Not Started | Migration `0004_inventory`; reservation at acceptance |
| **Pricing & Tiers** | 1 | ⚪ Not Started | Migration `0005_pricing`; tier resolution; B2B/B2C channel |
| **Orders & FSM** | 1 | ⚪ Not Started | Migration `0006_orders`; 16 statuses; re-price guard; idempotency |
| **Promotions** | 1 | ⚪ Not Started | Migration `0007_promotions`; PERCENT, FIXED, QTY_DISCOUNT, TIME_LIMITED |
| **Reviews & Trust** | 1 | ⚪ Not Started | Migration `0008_trust`; order-gated reviews; trust snapshots |
| **Notifications & Comms** | 1 | ⚪ Not Started | Migration `0009_comms`; outbox-driven; SMS/PUSH/IN_APP |
| **Platform (Audit, Outbox, Analytics, Flags)** | 1 | 🟡 In Progress | Migration `0002_platform` created; outbox dispatcher running; audit schema + Drizzle models |
| **Search (FTS)** | 1 | ⚪ Not Started | Migration `0011_search`; Arabic normalization; OpenSearch-ready port |
| **Delivery & Tracking** | 2 | ⚪ Not Started | Migrations `0013`–`0016`; driver onboarding; zones; POD; live tracking |
| **Payments & Ledger** | 3 | ⚪ Not Started | Migrations `0017`–`0020`; provider adapters; double-entry ledger; settlements |
| **B2C Marketplace** | 4 | ⚪ Not Started | Migrations `0021`–`0022`; consumer identity; service areas; Smart Reorder v1 |
| **Advertising & Analytics** | 5 | ⚪ Not Started | Migrations `0023`–`0024`; campaigns; ROAS reporting; merchant dashboards |
| **AI & Optimization** | 6 | ⚪ Not Started | Migration `0025`; AI Gateway; Smart Reorder v2; recommendations; forecasting |
| **Commerce Infrastructure** | 7 | ⚪ Not Started | Multi-branch; ERP adapters; fleet APIs; regional cells |

---

## Expensive-to-Retrofit Decisions (§7.2) — Must Get Right in Phase 1

These decisions are **correct in Phase 1 or never**. Retrofitting them after launch is prohibitively expensive or impossible.

| # | Decision | Where Enforced | Cost of Getting It Wrong | Status |
|---|---|---|---|---|
| 1 | **User/Org/Role/Permission separation** | §2.1, migration `0001_identity` | Identity re-design breaks every table and token | ⚪ Not Started |
| 2 | **Master order + sub-orders per supplier** | §3.6, migration `0006_orders` | Settlement, returns, ratings corrupted at multi-supplier scale | ⚪ Not Started |
| 3 | **Price/promotion snapshots + financial breakdown** | §3.5–3.6 (`unit_price_minor`, `order_financial_breakdown`) | Audit and P3 ledger lose historical truth | ⚪ Not Started |
| 4 | **`price_lists.channel` + `audience`** | §3.5 DDL (present from day one) | P4 requires a pricing migration under live traffic | ⚪ Not Started |
| 5 | **Event taxonomy + transactional outbox** | §2.6, Appendix A, `outbox_events` | Analytics/notifications/search silently diverge | ⚪ Not Started |
| 6 | **UUIDv7 + `organization_id` scoping** | §2.2, §2.9 | Multi-tenancy retrofit = highest-severity security class | ⚪ Not Started |

**Verification checklist:**
- [ ] `users`, `organizations`, `organization_members`, `roles`, `permissions` are separate tables (not denormalized)
- [ ] `master_orders` and `orders` are separate; `orders.master_order_id` FK present
- [ ] `order_items.unit_price_minor` is a SNAPSHOT (not a FK to price_tiers); `order_items.promo_snapshot` JSONB present
- [ ] `order_financial_breakdown` populated at checkout (not retrofitted in P3)
- [ ] `price_lists.channel` and `price_lists.audience` columns present from migration `0005_pricing`
- [ ] All domain events flow through `outbox_events` (no fire-and-forget side effects)
- [ ] All tables have `id uuid primary key` (UUIDv7 generated in app layer)
- [ ] All tenant-scoped tables have `org_id` or equivalent; OrgScopeGuard enforces access

---

## Risk Register (§8.1) — Linked to Plan

| ID | Risk | Impact | Mitigation | Phase | Status |
|---|---|---|---|---|---|
| R1 | Weak supply at launch | Retailers find nothing; churn | Anchor suppliers signed in P0; concierge import; intake template | 0–1 | ⚪ Not Started |
| R2 | Weak demand | Merchants see no value | Small launch area; field sales; first-order incentives | 1 | ⚪ Not Started |
| R3 | Poor product data quality | Weak search/conversion | ImportWizard row-level validation; moderation queue; AI assist later | 1–6 | ⚪ Not Started |
| R4 | Premature complexity | Delayed launch | Scope fences are CI/PR-enforceable; monolith only | All | ⚪ Not Started |
| R5 | Fraud / fake accounts | Financial + trust loss | Verification flow; device fingerprinting; velocity rules; rate limits | 1–3 | ⚪ Not Started |
| R6 | Negative unit economics | Growth amplifies losses | Contribution margin per order tracked in admin KPIs; phase gates | All | ⚪ Not Started |
| R7 | Single-provider dependency (SMS, maps, payments) | Operational outage | Adapter ports + benchmarked second provider per spike (P0) | 1–3 | ⚪ Not Started |
| R8 | Payment webhook loss/duplication | Money mismatch | Signed idempotent webhooks; ledger invariants tested; daily reconciliation | 3 | ⚪ Not Started |
| R9 | Delivery experience failure | Trust damage | Start manual dispatch (2A); ETA ranges; POD mandatory | 2 | ⚪ Not Started |
| R10 | Location-data privacy breach | Legal + trust | 90-day raw retention; purpose-scoped access | 2 | ⚪ Not Started |
| R11 | Arabic search relevance | Discovery failure | Normalization layer; search→order conversion monitored; OpenSearch trigger pre-agreed | 1 | ⚪ Not Started |
| R12 | SMS OTP delivery variance | Signup drop-off | Two providers from day one; WhatsApp fallback | 1 | ⚪ Not Started |
| R13 | Scope creep from merchants | Launch slip | Feature Addition Decision Framework via Product Council | All | ⚪ Not Started |
| R14 | Key-person dependency | Bus factor | Contracts as source of truth; pairing; runbooks in `docs/` | All | ⚪ Not Started |

**Risk response tracking:**
- [ ] R1: Anchor suppliers signed in P0 (ops)
- [ ] R7: SMS provider benchmarks completed (2 providers)
- [ ] R12: OTP delivery variance measured; failover tested

---

## Sprint 0 Task Checklist (§0.4)

**Week 1 — Before M1 scope begins**

- [x] **Monorepo scaffold**
  - [x] `pnpm-workspace.yaml` (apps, packages, mobile)
  - [x] `turbo.json` (pipeline: build, dev, test, lint)
  - [x] Shared `tsconfig.json` (strict, ES2022, paths)
  - [x] ESLint config + `eslint-plugin-boundaries` (E6)
  - [x] Prettier config
  - [x] `.gitignore`, `.nvmrc` (Node 20 LTS), `.editorconfig`
- [x] **Infrastructure**
  - [x] `infra/docker-compose.dev.yml` (Postgres 16 + PostGIS 3.4, Redis 7, MinIO, Mailhog)
  - [x] Healthchecks for all services
  - [x] `.env.local` template (database URLs, Redis URL, S3 credentials, SMTP)
- [x] **NestJS API bootstrap**
  - [x] `apps/api/` with NestJS CLI scaffold
  - [x] Helmet + CORS allowlist
  - [x] pino logger with `requestId` correlation
  - [x] Global RFC 7807 exception filter (`application/problem+json`)
  - [x] OpenTelemetry SDK (auto-instrumentation: HTTP, PG, Redis)
  - [x] `/healthz` + `/readyz` endpoints
  - [x] Drizzle ORM setup (E2)
  - [x] Migration `0001_identity.sql` (users, organizations, roles, permissions, organization_members, sessions)
  - [x] Seed script (roles, permissions, test users)
- [x] **Auth end-to-end**
  - [x] OTP request endpoint (Redis-backed; per-phone throttle)
  - [x] OTP verify endpoint (JWT pair issuance)
  - [x] Refresh endpoint (rotation + reuse detection)
  - [x] Logout endpoint (session revocation)
  - [x] JWT claims: `sub`, `activeOrg`, `role`, `perms`, `iat`, `exp`, `jti`
- [x] **Contracts pipeline**
  - [x] `packages/contracts/` with zod schemas
  - [x] zod → OpenAPI 3.1 generation script
  - [ ] `openapi-typescript` client generation (web)
  - [ ] OpenAPI generator (Flutter/Dart)
  - [ ] Schemathesis wired into CI
- [x] **Mobile scaffold**
  - [x] `mobile/` with Flutter project
  - [x] Flavors: `retail`, `wholesale` (entry points)
  - [x] `mobile-core/` package (design tokens, API client, auth, i18n ARB)
  - [x] Riverpod state management
  - [ ] Offline queue skeleton
- [x] **Web scaffolds**
  - [x] `apps/web/` (Next.js: marketing + retailer/merchant app)
  - [x] `apps/admin/` (Next.js: platform admin console)
  - [x] Both on `packages/ui-kit` (TAIF design tokens)
  - [x] Auth session handling (JWT storage, refresh, org switching)
- [x] **Shared packages**
  - [x] `packages/ui-kit/` — TAIF design tokens (brand, colors, fonts, spacing, radii, shadows)
  - [x] `packages/env/` — Zod-validated environment schemas (API, Web, Admin)
  - [x] `packages/event-types/` — Domain + analytics event schemas (versioned)
- [x] **Audit + outbox**
  - [x] Audit log middleware (writes `audit_logs` for: verification decisions, refunds, price overrides, admin impersonation, flag changes)
  - [ ] Outbox dispatcher skeleton (polls `outbox_events`; publishes to event bus)
- [x] **CI skeleton**
  - [x] PR pipeline: lint → typecheck → boundary-lint → unit → integration → contract → build → preview deploy → smoke
  - [x] Main pipeline: all of PR + E2E + k6 smoke + Lighthouse + axe → staging deploy
  - [x] Boundary lint rules (E6): enforce module import boundaries
  - [x] Contract validation: OpenAPI diff reviewed when `packages/contracts` changes
- [x] **Load testing**
  - [x] `infra/load/` with k6 scripts
  - [x] Smoke script against `/healthz` + auth flow

**Exit criteria:** `pnpm install` works; `docker compose up` starts all services; `pnpm db:migrate && pnpm db:seed` runs; API starts on `:3000`; auth flow works end-to-end; CI pipeline runs green

---

**Notes & Blockers**

**Current focus:** M3 Catalog & Pricing — product catalog, variants, media pipeline, tiered pricing, bulk import

**Blockers:** None (greenfield project)

**Decisions made:**
- 2026-09-03: Project initiated; Sprint 0 tasks defined
- 2026-09-03: Monorepo scaffolded with pnpm 9 + Turborepo 2.x
- 2026-09-03: Docker Compose dev environment (PostGIS 16-3.4, Redis 7, MinIO, Mailhog)
- 2026-09-03: NestJS API bootstrapped with 16 module stubs, identity module implemented
- 2026-09-03: Drizzle ORM configured with per-module schema files
- 2026-09-03: Migration 0001_identity.sql created (users, organizations, roles, permissions, sessions)
- 2026-09-03: Contracts package with zod → OpenAPI 3.1 generation pipeline
- 2026-09-03: CI pipeline skeleton with boundary lint, contract validation, k6 smoke
- 2026-09-03: CODEOWNERS assigned per module path
- 2026-09-03: Codebase moved to `scs-platform/` subdirectory
- 2026-09-03: Flutter flavor scaffold complete (retail, wholesale) with Riverpod, go_router, Dio
- 2026-09-03: Next.js web scaffold complete with auth session handling (OTP, refresh, org switching)
- 2026-09-03: Next.js admin scaffold complete with auth session handling
- 2026-09-03: `packages/ui-kit` — TAIF design tokens (brand, colors, fonts, spacing, radii, shadows)
- 2026-09-03: `packages/env` — Zod-validated environment schemas (API, Web, Admin)
- 2026-09-03: `packages/event-types` — Domain + analytics event schemas (versioned)
- 2026-09-03: Seed script created (6 roles, 27 permissions)
- 2026-09-03: Boundary lint script created (enforces module isolation E6)
- 2026-09-03: All TypeScript projects compile clean (API, Contracts, Env, EventTypes, UIKit)
- 2026-09-03: `mobile-core` package with ApiClient and AuthStorage
- 2026-09-03: Migration `0002_platform` created (audit_logs, outbox_events, feature_flags, analytics_events)
- 2026-09-03: Outbox dispatcher implemented (polls PENDING events, 1s interval, 5 retry max)
- 2026-09-03: JWT signing integrated via @nestjs/jwt (15min access tokens with sub/activeOrg/role/perms claims)
- 2026-09-03: JwtAuthGuard + PermissionsGuard + @CurrentUser decorator created
- 2026-09-03: OpenAPI client generation scripts (TypeScript via openapi-typescript, Dart via openapi-generator-cli)
- 2026-09-03: Identity & RBAC module completed (JWT, refresh rotation, org switching)
- 2026-09-03: M1 Foundation milestone fully scaffolded
- 2026-09-03: Migration `0003_merchant` created (stores, warehouses, business_documents, verification_requests)
- 2026-09-03: Merchant Drizzle schema with FK references to identity tables
- 2026-09-03: Merchant service with full CRUD (stores, warehouses, documents, verification)
- 2026-09-03: Merchant controller with 16 endpoints (JWT-authenticated, permission-gated admin routes)
- 2026-09-03: Contracts package extended with merchant zod schemas (13 schemas + 12 type exports)
- 2026-09-03: Admin verification console (queue page with filters, review page with decision form)
- 2026-09-03: Admin API client for verification, store, and document endpoints
- 2026-09-03: Merchant onboarding wizard (web) — 4-step flow with store/warehouse/docs/review
- 2026-09-03: Web API client for merchant endpoints
- 2026-09-03: DOM lib added to web + admin tsconfigs for React event handling
- 2026-09-03: M2 Merchant Onboarding milestone complete
- 2026-09-03: All 5 TypeScript projects compile clean after M2

**Decisions pending:**
- Offline queue skeleton for mobile
- Integration tests for auth flow end-to-end

---

*This is a living document. Update status indicators (⚪ → 🟡 → 🟢 or 🔴) as work progresses. Add notes for context.*
