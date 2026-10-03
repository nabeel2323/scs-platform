# SCS-B2B-FRAMEWORK-COMPLETENESS-AUDIT

## Project-Wide B2B Framework Completeness Audit & Roadmap

| Field | Value |
|-------|-------|
| Audit type | READ-ONLY comprehensive audit and roadmap exercise |
| Audit date | 2026-10-02 |
| Branch | `develop` |
| HEAD | `5c6649dc2334e278c808b44c558b020db7e6db7b` |
| Release baseline | M7.3-B.5 — RTS + Reconciliation (CLOSED / PASS) |
| Migrations | 0001–0050 (50 SQL files) |
| Production code modified | **NO** |
| Authoritative scope source | `Smart_Commerce_Development_Implementation_Plan.md`, `docs/production/*` release closures |

---

# 1. Executive Summary

The SCS platform today is a **verified multi-merchant B2B wholesale marketplace core**: identity/RBAC, organizations, catalog (taxonomy → canonical products → merchant offers), quantity-tier pricing, search, multi-supplier cart, a 16-state order FSM with master/sub-order splitting, inventory with reservation semantics, promotions, reviews/disputes, notifications, analytics/audit, and — delivered through the M7.2/M7.3 series — a substantial shipping/delivery backbone (shipping methods, zones, carrier integration with Aramex, delivery exceptions, retries, cancellation, and RTS).

The platform's engineering quality is high where milestones have closed: every milestone M7.2.1 → M7.3-B.5 carries a four-gate evidence chain (audit → lock → implementation → independent runtime verification against real PostgreSQL), 1,634 regression tests + PostgreSQL integration suites pass, and concurrency/tenant-isolation properties are runtime-verified.

**However, measured as a complete B2B framework, the platform has three structural deficits:**

1. **A financial void.** There is no payments capability at all — the `payments` module directory is empty, `PAYMENT_PENDING` is an unreachable FSM state, checkout is effectively offline/COD with tax and delivery fee hardcoded/defaulted, and there are no invoices, refunds, credit accounts, or receivables. The authoritative plan assigns this to Phase 3 (not yet started); the operational roadmap assigns refunds to M7.3-D.
2. **A backend↔frontend imbalance concentrated in shipping operations.** The entire M7.2.3/M7.3 operations surface — shipment creation/cancel/labels, delivery exception reporting/retry, the full RTS workflow (request/approve/reject/complete, LOST direct flow), carrier credentials/configurations/recovery queue — is **backend-only**. No admin console page, no merchant page, and no mobile screen exposes it. Only buyer tracking display, merchant driver-assignment, merchant shipping-method/zone configuration, and the mobile driver shipment list consume any of it.
3. **Classic B2B procurement capabilities are absent and mostly out of the documented scope.** No RFQ/quotations, no purchase-order approvals or spending limits, no customer-segment price resolution (schema columns exist but are behaviorally dark), no buyer address book, no post-delivery returns (M7.3-C audited, not implemented), no email channel, and an English-only LTR UI despite Arabic search support in the backend.

**Verdict:** the platform is a strong *transactional marketplace foundation* with verified integrity properties, but it is **not yet a complete B2B framework**. The next coherent engineering increments are: (a) expose the already-built shipping/RTS operations through UI, (b) close the returns loop (M7.3-C), (c) build the financial layer (payments → refunds → reconciliation), then (d) decide product-wise which classic B2B procurement capabilities (RFQ, contract pricing, credit) are in scope.

---

# 2. Current Repository Baseline

## 2.1 Verified state

| Check | Result | Evidence |
|-------|--------|----------|
| Branch | `develop` | `git branch --show-current` |
| HEAD | `5c6649dc2334e278c808b44c558b020db7e6db7b` | `git rev-parse HEAD` — **exactly** the B.5 closure baseline |
| Commits after B.5 | **None** — HEAD is the B.5 tip commit | `git log --oneline` |
| Working tree | Clean except 3 untracked documentation files | `git status --porcelain` |
| Untracked files | `SCS-M7.3-B.5-INDEPENDENT-RUNTIME-VERIFICATION.md`, `SCS-M7.3-B.5-RELEASE-CLOSURE.md`, `SCS-M7.3-C-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` (all docs, no code) | git status |
| Migrations | 0001–0050; latest `0050_delivery_exceptions.sql` | `infra/drizzle/migrations/` |
| Functionality added after B.5 | **None** | git history |
| Undocumented changes | None detected | git history |

## 2.2 Status taxonomy used throughout this audit

- **COMPLETE** — business workflow executes end-to-end (UI → API → authz → logic → DB → events → UI update) within its defined scope.
- **BACKEND ONLY** — API/service/DB implemented and verified, but no user-facing workflow consumes it.
- **PARTIAL** — some layers exist; the workflow cannot finish end-to-end or material sub-capabilities are absent.
- **PLANNED** — an authoritative document explicitly schedules it.
- **NOT IMPLEMENTED** — sufficient evidence the capability does not exist.
- **OUT OF SCOPE (DOCUMENTED)** — an authoritative document explicitly excludes/defers it.
- **NOT FOUND / UNKNOWN** — insufficient evidence.

## 2.3 Formally released vs. implemented-not-released vs. planned

| Category | Items |
|----------|-------|
| Formally completed (release-closed) | Phase 1 marketplace (Ph1–Ph5 capability matrix), M6 catalog/offer series, M7.1 hardening, M7.2 shipping/delivery spec series (M7.2.1 → M7.2.4-A.1), M7.3-A, M7.3-B → B.5 (cancellation, delivery exceptions, retries, carrier cancel, RTS) |
| Implemented but not formally released | Nothing — HEAD equals B.5 closure |
| Audited but not implemented | **M7.3-C Returns (inventory return-to-stock + RTS physical handling)** — pre-implementation audit COMPLETE, verdict GO WITH CONDITIONS (8 conditions), dated 2026-10-02 |
| Planned (authoritative) | M7.3-D Refunds, M7.3-E Disputes (buyer dispute flow), M7.3-F Notifications expansion (per M7.3-B.0 lock §27); Phase 3 Payments/Settlement; Phase 4 B2C; Phase 5 Ads; Phase 6 AI; Phase 7 infrastructure incl. regulated trade credit |
| Missing / undefined | RFQ/quotations, PO approvals, spending limits, invoices, buyer address book, email channel, i18n/RTL UI — see §17 |

---

# 3. Authoritative Project Scope

## 3.1 Documents relied upon

| Document | Role |
|----------|------|
| `Smart_Commerce_Development_Implementation_Plan.md` (repo root, 1,571 lines) | Master plan; Phases 0–7; Phase 1 = "Launchable B2B MVP" |
| `Smart_Commerce_Implementation_Progress.md` | Progress ledger |
| `docs/production/CAPABILITY-MATRIX.md` (2026-09-25) | Phase-5-certified capability matrix across backend/admin/buyer web/merchant web/mobile/E2E |
| `docs/production/PHASE-1..5-*.md` | Phase implementation records |
| `docs/production/SCS-M7.2-SHIPPING-DELIVERY-SPEC.md` | Shipping/delivery scope |
| `docs/production/SCS-M7.3-B*-BUSINESS-RULES-ARCHITECTURE-LOCK.md` | Locked business decisions for cancellation/exceptions/RTS |
| `docs/production/SCS-M7.3-B.5-RELEASE-CLOSURE.md` | Latest closed release |
| `docs/production/SCS-M7.3-C-PRE-IMPLEMENTATION-ARCHITECTURE-AUDIT.md` | Next-milestone audit (Returns) |
| `docs/architecture/ADR-0001..0003`, `ADR-M7.3-B0-013` | Architecture decision records |
| `docs/RBAC_Audit_Report.md`, `docs/Role_Hierarchy_Workflow_Audit.md` | Role/permission model |

## 3.2 What the authoritative plan defines as "B2B"

Phase 1 (§5.1): *"an operating B2B marketplace in one area — registration, verification, catalog, tiered pricing, search, cart, ordering, accept/reject, statuses, notifications, basic ratings. Fulfillment = self-pickup or merchant-managed delivery."*

Phase 1 spine (plan line 1422): `auth → RBAC → catalog+pricing → search → cart → order FSM → notifications`.

Explicit Phase 1 **non-goals** (plan line 1352): *"Do NOT build: independent delivery marketplace · B2C · advanced advertising · complex ML · ERP accounting · **credit system** · multi-party settlement · microservices · **multi-warehouse/branch** · real-time GPS · public API · multi-currency · chat (fast-follow after pilot — schema ships, UI deferred)."*

Phase 3 (Payments, Settlement & Monetization, plan line 1380–1384): hosted-provider card checkout, **COD two-step capture at POD**, payment status in order timeline, admin finance console (payments monitor, settlement runs, refund approvals, reconciliation exceptions, revenue reports); fences: *"no trade credit (P7, regulated partners only), no multi-currency, no split payments."*

## 3.3 Documentation vs. implementation discrepancies

| # | Documented expectation | Actual implementation | Discrepancy |
|---|------------------------|-----------------------|-------------|
| D-1 | Plan §1204: order FSM 16 statuses "complete from day one"; `PAYMENT_PENDING`, `ASSIGNED`, `PICKED_UP` unreachable until P2/P3 | All 16 statuses exist in `orders.service.ts` FSM map; `PAYMENT_PENDING` still unreachable (payments absent); `ASSIGNED`/`PICKED_UP` reachable via driver endpoints | None — as designed; P3 behavior still missing |
| D-2 | Plan: "tiered pricing" for B2B | Implemented: quantity tiers per price list; `price_lists.audience` (PUBLIC/SEGMENT/CONTRACT) and `segment_id` stored but **not used by price resolution** | Schema is ahead of behavior; segment/contract pricing is dark |
| D-3 | Plan: "chat (fast-follow after pilot — schema ships, UI deferred)" | `conversations`, `messages` tables + disputes conversations API exist; no standalone chat UI located | Consistent with "UI deferred" — labeled backend-only here |
| D-4 | CAPABILITY-MATRIX (2026-09-25) presents a fully UI-covered platform | It predates the M7.2.3/M7.3 shipping-operations series; its "all capabilities accounted for" claim does not cover shipments/exceptions/RTS | Documentation gap: the matrix needs a shipping-operations refresh |
| D-5 | M7.2 spec intent: platform delivery with carrier integration | Backend delivered (Aramex, webhooks, recovery); **no operations UI** for any of it | The spec's operational loop is not usable by humans without API tooling |

Where documentation and implementation differ, this audit records both and does not decide which should win (per audit rules).

---

# 4. Existing Feature Inventory

## 4.1 Repository topology

```
scs-platform/                       (pnpm + turbo monorepo)
├── apps/
│   ├── api/                        NestJS 10 + drizzle-orm + PostgreSQL + Redis + socket.io
│   │   └── src/modules/            admin, analytics, audit, catalog, catalog-import,
│   │                             identity, inventory, merchant, notifications, orders,
│   │                             pricing, promotions, realtime, reviews, shipping
│   │                             (+ EMPTY dirs: payments, delivery, ads, ai;
│   │                              support = module stub only)
│   ├── web/                        Next.js (buyer + merchant), port 3100, 39 pages
│   ├── admin/                      Next.js (SUPER_ADMIN/ADMIN/MODERATOR), port 3200, 38 pages
│   └── scs-platform-b2-test/       Full repo copy — test sandbox, excluded from audit counts
├── mobile/                         Flutter (buyer + merchant + driver scaffolding), 32 screens
├── packages/                       contracts, env, event-types, ui-kit
├── infra/                          drizzle migrations (0001–0050), k8s, ci, backup, load
└── docs/                           plan, ADRs, audits, production release records
```

## 4.2 Scale metrics (measured, not estimated)

| Metric | Count | Method |
|--------|-------|--------|
| API controllers | 23 | `*.controller.ts` under `apps/api/src/modules` |
| API endpoints (route decorators) | ~290 | decorator scan across controllers |
| Database tables | 69 | `CREATE TABLE` scan over migrations 0001–0050 |
| Web pages | 39 | `page.tsx` under `apps/web/src/app` |
| Admin pages | 38 | `page.tsx` under `apps/admin/src/app` |
| Mobile screens | 32 | `*_screen.dart` under `mobile/lib` |
| Seeded roles | 6 | `apps/api/src/scripts/seed.ts` ROLES |
| Permission keys (seed) | ~117 | seed.ts |
| Permission guard usages | 197 | `@RequirePermission/@Permissions` scan |
| API test files | 111 | `apps/api/src/__tests__/**/*.spec.ts` |
| API test cases | ~1,911 | `it(`/`test(` scan (1,634 non-postgres + integration suites per B.5 verification) |
| Web test files | 0 | — |
| Admin test files | 1 | `apps/admin/src/__tests__/management.test.tsx` |
| Mobile test files | 6 | `mobile/test` |

---

# 5. Domain-by-Domain Assessment

Status legend: **C** = COMPLETE · **BO** = BACKEND ONLY · **P** = PARTIAL · **PL** = PLANNED · **NI** = NOT IMPLEMENTED · **OOS** = documented out-of-scope · **?** = UNKNOWN

## 5.1 Organization / Tenant Management — **C (minor gaps)**

| Capability | Status | Evidence |
|------------|--------|----------|
| Organizations CRUD | C | `identity/organizations.controller.ts`; admin `/organizations` + detail; merchant `/merchant/organization`; mobile `organizations_screen` |
| Org members add/remove/lookup | C | `POST/GET/DELETE organizations/:id/members*`; admin + merchant + mobile UI |
| Org switching | C | `POST auth/switch-org`; web `switchOrg`; mobile provider |
| Org update requests + admin review | C | `organization_update_requests` (migration 0022); `admin/org-update-requests` endpoints |
| Org deactivate | C | `PATCH admin/organizations/:id/deactivate`; `is_active` (migration 0021) |
| Org invite code | C (backend+mobile) | migration 0016 |
| Buyer-org member management in buyer web | P | buyer web `/account` only switches orgs; member management exists in merchant web + mobile |
| Branches | NI (OOS Phase 1) | plan line 1352 excludes multi-branch; no branch table |
| Tenant isolation | C (verified) | `common/tenant-scope.ts`; phase3 security E2E; B.5 gate 8 |

## 5.2 Customer / Buyer Management — **P**

| Capability | Status | Evidence |
|------------|--------|----------|
| Buyer users (registration/login) | C | dual auth (OTP + password), `auth.controller.ts` |
| Buyer organizations | C | same org model as merchants |
| Merchant's customer directory | C | `GET merchant/customers`; web `/merchant/customers`; mobile `merchant_customers_screen` |
| Contacts (multiple per customer org) | P | `order-identity.ts` attaches buyer contacts to orders; no standalone contact entity |
| Customer addresses / multiple delivery locations | **NI** | no address table; checkout collects free-text `{street, city}` into `orders.deliveryAddress` JSONB (`apps/web/src/app/checkout/page.tsx` lines 23–130) |
| Customer lifecycle (activation/deactivation) | P | org-level `is_active`; no per-customer lifecycle |
| Customer ownership/assignment (sales reps) | NI | not found |
| Saved suppliers | C | migration 0017; web `/saved-suppliers` |

## 5.3 Catalog — **C**

Delivered through Catalog Phases 1–9 + Admin Product Type Builder (see memory-verified docs): categories/tree, brands, attributes/groups, product types with schema editor + conditional rules + publish/readiness/versions, products + variants + media + bulk actions + CSV export, canonical product layer (migration 0025) with GTIN/EAN/MPN dedup (`/canonical/match|search|duplicates`), merchant offers with FSM (DRAFT→PROPOSED→ACTIVE, approve/reject/suspend), dynamic attribute-driven search facets, Redis read-through caching, data-quality and corrupted-variant admin views. Arabic/English data: backend search normalization only (§16.7).

## 5.4 B2B Pricing — **P**

| Capability | Status | Evidence |
|------------|--------|----------|
| Price lists per store | C | migration 0006; `pricing.controller.ts`; merchant web `/merchant/pricing` |
| Quantity breaks (tiers) | C | `price_tiers` (min/max qty), `priceForQty()` in `price-resolution.ts` |
| Price resolution (priority, validity window, offer anchor) | C | `resolveOfferPrices()` shared resolver; used by PDP/cart/checkout |
| Currencies | P | `char(3)` currency column; single market (SAR) by design; plan fence: no multi-currency |
| Tax/VAT | P | `DEFAULT_VAT_RATE` in `order-pricing.ts`; **BG-2**: delivery/tax effectively zeroed at checkout (capability matrix Backend Gap) |
| Customer-group pricing (SEGMENT) | **NI (schema only)** | `price_lists.audience`/`segment_id` stored (migration 0006); `price-resolution.ts` never filters by audience/segment; **no buyer-segments table** — `segment_id` is a dangling UUID |
| Contract pricing (CONTRACT) | NI (schema only) | same as above |
| Negotiated pricing | NI | no negotiation entity |
| MOQ | P | tier `min_qty` acts as quantity break, not enforced minimum-order rule |
| Promotional pricing/discounts | C | promotions module + redemption at checkout |
| Effective dates | C | `valid_from`/`valid_until` honored by resolution |

## 5.5 Quotations / RFQ — **NI**

No quote/quotation/RFQ table, endpoint, service, page, or screen exists (repository-wide pattern scan: zero hits outside unrelated prose). Also **absent from the authoritative plan** — the Phase 1 B2B MVP never included RFQ. Classification: **NOT IMPLEMENTED and UNDOCUMENTED (requires product decision)**.

## 5.6 Orders (lifecycle) — **C for delivered scope; P as full lifecycle**

16-state FSM verified (`orders.service.ts` lines ~3323, capability matrix §18): DRAFT→SUBMITTED→PENDING_CONFIRMATION→ACCEPTED/PARTIALLY_ACCEPTED/REJECTED/CANCELLED→PREPARING→READY→{OUT_FOR_DELIVERY | ASSIGNED→PICKED_UP}→DELIVERED→COMPLETED/DISPUTED; PAYMENT_PENDING defined but unreachable. Master-order + per-store sub-orders, idempotent checkout (`Idempotency-Key` + fingerprint, migration 0033), immutable offer snapshots (migration 0029), financial breakdown (migration 0010 + 0019 currency), reorder, status history, optimistic-lock concurrency (runtime-verified 100-concurrent gates), cancellation (buyer pre-acceptance; merchant with reason; **B.5: cancellation wins over RTS at every stage, OUT_FOR_DELIVERY cancellable**). Missing from lifecycle: payment step, return step, refund step, closure accounting.

## 5.7 Order Management — **C (buyer+merchant), P (admin)**

Buyer: list/filter, detail, cancel with reason, reorder, dispute, tracking display. Merchant: list with store filter, detail, accept/partial-accept/reject, FSM transitions via `NEXT_STATUS_MAP`, cancel with reason, assign-driver (web orders list). Admin: list + **read-only** detail (`apps/admin/src/app/orders/[id]/page.tsx` — summary/items/financials/history; **no intervention actions**: no admin cancel, no force-transition, no shipment/exception/RTS visibility). Documents: none (no invoices/packing slips/delivery notes). Audit trail: `order_status_history` + admin timeline UI.

## 5.8 Inventory — **C**

Store + warehouse inventory, adjust/transfer/bulk-adjust, atomic reservation on accept / release on cancel / sale on deliver (ADR-0001 timing), low-stock check, movements ledger + CSV exports, concurrency verified (Phase 1/2 E2E + B-series gates). Warehouses exist (merchant web `/merchant/warehouses`, mobile) but **single-warehouse-per-store semantics** (multi-warehouse/branch excluded Phase 1). **Return/restock movement type exists in schema** (`0020_stock_movement_constraint.sql` includes `RETURN`) **but no workflow emits it** — deferred to M7.3-C.

## 5.9 Fulfillment — **P**

Merchant-driven PREPARING→READY→OUT_FOR_DELIVERY→DELIVERED with delivery proof table (`delivery_proofs`, migration 0047), confirm-delivery endpoint, driver assignment + pickup flow (ASSIGNED/PICKED_UP) with mobile driver screen. No picking/packing workflow entities (out of documented scope; plan fulfillment = self-pickup or merchant-managed delivery). Partial shipments: not found (partial *acceptance* exists; partial *shipment* does not).

## 5.10 Shipping / Carriers — **BO (Backend only)**

Delivered M7.2.1 → M7.3-B.5 and verified, but almost entirely without UI:

| Capability | Backend | UI |
|------------|---------|-----|
| Shipping methods + zones + zone-method mapping | C (`shipping.controller.ts`, 17 endpoints) | Merchant web `/merchant/shipping` (methods+zones) |
| Shipping estimate at checkout | C | Buyer checkout per-store estimate |
| Carrier abstraction + Aramex provider | C (`shipping/aramex/`, status mapper) | — |
| Carrier credentials + configurations | C (`carrier-admin.controller.ts`) | **None** |
| Shipment create/cancel/tracking/labels | C (`shipment-operations.controller.ts`) | Tracking display only (buyer order detail `fetchTracking`) |
| Carrier webhooks w/ token auth | C (`carrier-webhook.controller.ts`, migration 0044) | — |
| Carrier create/cancel reconciliation + recovery queue | C (migrations 0043–0046, 0049; `POST v1/carrier/shipments/:id/recover`, `GET v1/carrier/recovery/queue`) | **None** |
| Delivery exceptions (8 canonical types) + retry | C (migration 0050; `POST :id/exception`, `:id/retry`) | **None** |
| RTS (request/approve/reject/complete + LOST direct) | C (B.5, 5 endpoints, runtime-verified) | **None** |

## 5.11 Payments — **NI (PLANNED Phase 3)**

`apps/api/src/modules/payments/` is an **empty directory**. No payment tables (no transactions, no ledger despite plan §1056 `ledger_entries` DDL sketch), no provider integration, no refunds. `PAYMENT_PENDING` FSM state unreachable (capability-matrix BG-3). Checkout succeeds without payment; UI shows "invoiced on delivery" notice. This is the single largest gap vs. a production B2B platform.

## 5.12 B2B Credit / Accounts Receivable — **NI (OOS until P7)**

No credit accounts, limits, terms, balances, invoices, aging, or collections. Authoritative plan fences trade credit to Phase 7 "regulated partners only" (lines 1352, 1384). Classification: **NOT IMPLEMENTED — documented out-of-scope for the current framework; product decision required if B2B scope is redefined.**

## 5.13 Invoicing / Documents — **NI**

No invoice/credit-note/quotation/packing-slip/delivery-note entities; no PDF generation (no PDF dependency in `apps/api/package.json`); "invoice" appears only in two test files as prose. Business documents exist only for merchant *verification* uploads (`business_documents`, S3 presign). Arabic/English rendering: N/A.

## 5.14 Returns (post-delivery) — **PLANNED (M7.3-C), currently NI**

Distinct from delivery RTS (which exists, §5.10). M7.3-C pre-implementation audit (2026-10-02, GO WITH 8 CONDITIONS) scopes: return-to-stock on `RTS_COMPLETED`, return condition + quantity recording, physical return verification. No code exists yet: no return-request entity, no RMA flow, no inspection workflow, `RETURN` stock movement unused, no refund linkage.

## 5.15 Notifications — **P**

In-app notifications + preferences + device tokens + FCM push: implemented and UI-covered (web, mobile). Template-driven service declares SMS (two-provider failover) and WHATSAPP channels, but `sendSms()` is a stub ("In production: call primary SMS API" — `notifications.service.ts` line 312); no SMS/email provider dependencies exist. **No email channel at all.** M7.3-F plans buyer/merchant notification expansion (incl. shipping/RTS events — currently silent).

## 5.16 Reporting / Analytics — **P**

`analytics_events` (partitioned) + track endpoints (all clients), admin analytics page, KPIs/offers-kpis/offers-trend/data-quality pages, search query log, audit log viewer. Missing: sales/order/inventory/shipping/returns/payments **business reports**, merchant-facing analytics (only offer trend), buyer account-level reporting, operational dashboards for exceptions/reconciliation.

## 5.17 Admin / Operations — **P**

Strong governance surface (38 pages, 22 nav items, per-permission menu filtering): users, organizations, merchants, verification queue, product moderation, offer governance, disputes, catalog import center, taxonomy builders, KPIs, analytics, audit. **Operational blind spots:** no shipments/exceptions/RTS console, no carrier management, no order intervention, no finance console (Phase 3), no system settings/feature-flag UI.

## 5.18 Search / Filtering — **C**

PG FTS + trigram, Arabic normalization (migration 0011-era), dynamic attribute facets + `/search/facets`, category/brand/price/verified/in-stock filters, URL-backed state, compare page (max 4), Redis-cached detail/facets (Catalog Phase 8), SEO metadata. Saved filters: not found. Bulk actions: products (admin + merchant) only.

## 5.19 Import / Export / Bulk Operations — **C**

XLSX catalog import pipeline (parse→validate→resolve→plan→execute, idempotent, template generator, history, 7 error types, macro/size security) in both admin Import Center and merchant `/merchant/import`; product CSV export; inventory CSV exports; bulk product actions; bulk stock adjustment. Not covered: bulk price updates (UI), bulk customer import, bulk order operations.

## 5.20 Auditability — **C**

`audit_logs` (actor/type/timestamp/diff) via middleware + service, admin audit page; append-only `order_status_history`; `shipment_events` (actor/type/notes/metadata); `outbox_events` (idempotent dispatch); `credential_audit_log`; `carrier_webhook_events` journal. Correlation: request IDs in structured logs (pino); OpenTelemetry SDK wired.

---

# 6. API Inventory (condensed; full parity data in `SCS-B2B-API-UI-PARITY-MATRIX.csv`)

| Domain | Controller | Endpoints | UI consumer | Status |
|--------|-----------|:---------:|-------------|--------|
| Admin governance | `admin.controller.ts` | 30 | admin console | C |
| Analytics | `analytics.controller.ts` | 4 | admin + all clients (track) | C |
| Catalog core | `catalog.controller.ts` | 49 | all apps | C |
| Offers | `catalog.offer.controller.ts` | 13 | all apps | C |
| Catalog requests | `catalog.requests.controller.ts` | 5 | admin + merchant | C |
| Taxonomy | `catalog.taxonomy.controller.ts` | 20 | admin (+merchant read) | C |
| Catalog import | `catalog-import.controller.ts` | 9 | admin + merchant | C |
| Auth | `auth.controller.ts` | 7 | all apps | C |
| Organizations/roles | `organizations.controller.ts` | 12 | all apps (buyer web partial) | C |
| Profile | `profile.controller.ts` | 16 | all apps | C |
| Inventory | `inventory.controller.ts` | 14 | merchant + admin(read) | C |
| Merchant/stores | `merchant.controller.ts` | 21 | merchant + admin + buyer(store pages) | C |
| Notifications | `notifications.controller.ts` | 9 | buyer + merchant + mobile | C |
| Cart | `cart.controller.ts` | 7 | buyer + mobile | C |
| Orders | `orders.controller.ts` | 21 | buyer + merchant + mobile + driver | C |
| Pricing | `pricing.controller.ts` | 10 | merchant (+resolution internal) | C |
| Promotions | `promotions.controller.ts` | 7 | merchant + buyer(apply) | C |
| Disputes/conversations | `disputes.controller.ts` | 12 | buyer + admin + mobile | C (chat UI deferred) |
| Reviews | `reviews.controller.ts` | 5 | buyer + merchant(read) + mobile | C |
| Carrier admin | `carrier-admin.controller.ts` | 11 | **NONE** | **BO** |
| Carrier webhook | `carrier-webhook.controller.ts` | 2 | n/a (machine) | C |
| Shipment operations | `shipment-operations.controller.ts` | 10 | buyer tracking only (1 of 10) | **BO** |
| Shipping config | `shipping.controller.ts` | 17 | merchant `/merchant/shipping` | C |

**Backend endpoints without any UI consumer (hidden features):** carrier credentials (4), carrier configurations (5), shipment recovery + recovery queue (2), shipment create/cancel/labels (3), exception report/retry (2), RTS request/approve/reject/complete (4), admin shipping-zone administration (zone CRUD partially covered by merchant UI; admin has none), conversations/messages standalone chat (4–5), `GET v1/shipping/providers`, feature flags (no controller at all), `POST inventory/reserve` + `POST inventory/release` (internal service paths exposed as endpoints), analytics `GET events/activity` partially (admin analytics consumes aggregated views).

---

# 7. UI Inventory (condensed)

## 7.1 Buyer web (`apps/web`, buyer segment)

| Area | Pages | Backend | Status |
|------|-------|---------|--------|
| Auth/account | login, auth/login, account, profile/credentials, profile/sessions | C | C |
| Discovery | search, stores, stores/[slug], products/[id], compare, favorites, saved-suppliers | C | C |
| Cart/checkout | cart, checkout | C | C (address = free text; no payment step) |
| Orders | orders, orders/[id] (timeline, cancel, reorder, dispute, tracking) | C | C |
| Reviews | reviews (+disputes tab) | C | C |
| Notifications | notifications | C | C |
| **Buyer organization management** | (only switch inside /account) | C | **P** |
| **Invoices/payment methods/quotes/returns** | — | NI | **NI** |

## 7.2 Merchant web (`apps/web/app/merchant`)

dashboard, catalog (+product/[id]), product-studio (6-step), offers, inventory, orders (+[id]), customers, pricing, promotions, shipping (methods+zones), store, warehouses, organization, import, requests, register/onboard/success. **Missing:** shipments ops, exceptions, RTS, finance/payouts, analytics beyond offer trend, bulk price update UI.

## 7.3 Admin console (`apps/admin`)

dashboard(/), users(+[id]), organizations(+[id]), merchants(+[id]), verification(+[id]), products(+[id]), variants/[id], offers(+[id]), offers-kpis, offers-trend, categories(+[id]), brands(+[id]), attributes(+[id]), attribute-groups, product-types(+[id] builder), requests, catalog-import(+[id]), orders(+[id] read-only), disputes(+[id]), kpis, analytics, data-quality, audit, account. **Missing:** shipments, exceptions, RTS, carriers, finance, settings/feature-flags, notifications admin.

## 7.4 Mobile (Flutter)

auth (4), home, search, stores(2), products(1), cart/checkout(2), orders(2), reviews(1), notifications(1), profile(1), organizations(2), merchant shell + dashboard/catalog/offers(3)/orders/inventory/customers/store/registration/product-edit/category-manage (13), **driver_shipments_screen (1)**. Missing vs web: pricing, promotions, import, requests, warehouses, shipping config, disputes evidence depth (per `MOBILE-WEB-PARITY-AUDIT.md` lineage).

---

# 8. API ↔ UI Parity Audit

Case taxonomy: A=both complete · B=backend exists, UI missing · C=UI exists, backend missing · D=both exist, incomplete journey · E=contract mismatch · F=authorization mismatch · G=state-machine mismatch.

| Workflow | Case | Detail |
|----------|------|--------|
| Auth/identity/profile | A | dual auth all apps |
| Org management (merchant/admin/mobile) | A | buyer web partial (switch only) → **D** for buyer-org member management on web |
| Catalog taxonomy & products & offers | A | incl. admin builders |
| Search & discovery | A | — |
| Cart & checkout | A (scope: offline payment) | **G** — checkout implies payment never happens; `PAYMENT_PENDING` unreachable |
| Buyer orders (list/detail/cancel/reorder/dispute/tracking) | A | tracking renders carrier data read-only |
| Merchant order processing (accept/partial/reject/FSM/cancel/assign-driver) | A | — |
| **Shipment operations (create/cancel/labels)** | **B** | backend verified; zero UI |
| **Delivery exceptions (report/retry)** | **B** | backend verified; zero UI; buyers/merchants cannot even *see* exception state |
| **RTS workflow (request/approve/reject/complete/LOST)** | **B** | B.5 verified; zero UI — operationally invisible |
| **Carrier credentials/configurations/recovery** | **B** | admin APIs only; zero UI |
| Shipping methods & zones | A (merchant) / **B** (admin) | merchant self-service exists; admin has no equivalent |
| **Payments** | **— (neither)** | void both sides |
| **Refunds** | **— (neither)** | M7.3-D planned |
| **Returns (post-delivery)** | **— (neither)** | M7.3-C audited |
| Pricing lists & tiers | A (merchant) | admin read via offer detail |
| Segment/contract pricing | **E/G (schema vs behavior)** | columns stored; resolution ignores; no segments admin anywhere |
| Promotions | A | mobile missing (parity doc) |
| Reviews & disputes | A | resolution lifecycle manual (BG-5) |
| Notifications | A (in-app/push) | **D** for SMS/WhatsApp (stub providers) |
| Chat (conversations) | **B** | schema+API shipped; standalone chat UI intentionally deferred (documented) |
| Admin order intervention | **B/D** | admin detail read-only; backend has no admin-force-transition either → capability undefined |
| Feature flags | **B** | table exists; no controller, no UI |
| Driver delivery flow | **D** | mobile driver screen + endpoints exist; DRIVER role not seeded; no RBAC entries (documented scaffolding) |

**False-feature scan (UI appearing complete but not operational):** none detected at critical-path level — the Phase 5 gate certified "no critical buyer/merchant/admin workflow uses fake/disconnected UI" and this audit found no contradiction. Two soft cases: (1) checkout "shipping estimate" depends on merchant zone configuration — unconfigured stores fall back to defaults, which is handled in UI; (2) merchant offer "analytics/trend" endpoints render charts from thin data in fresh environments (data availability issue, not a false feature).

---

# 9. Role / Permission Matrix

Seeded roles (`apps/api/src/scripts/seed.ts`): `SUPER_ADMIN, ADMIN, MODERATOR, MERCHANT_OWNER, MERCHANT_STAFF, BUYER` (+ `DRIVER` referenced in code paths — `orders.service.ts`, `audit.service.ts` — and mobile scaffolding, **not seeded**). ~117 permission keys; 197 guarded endpoints; `SUPER_ADMIN` bypasses role checks (`roles.guard.ts`); tenant bypass roles `SUPER_ADMIN/ADMIN/MODERATOR` (`tenant-scope.ts`).

| Capability | API perms | ADMIN console | MERCHANT (web/mobile) | BUYER (web/mobile) | DRIVER | Complete? |
|------------|-----------|---------------|------------------------|--------------------|--------|-----------|
| User/org administration | `admin:users:*`, `admin:organizations:*` | ✅ | org self-mgmt | switch only | — | ✅ |
| Verification review | `merchant:verification:review` | ✅ | submit | — | — | ✅ |
| Catalog taxonomy | `catalog:*:manage/write` | ✅ | read/use | read | — | ✅ |
| Products/offers | merchant perms + `catalog:offers:govern` | govern | ✅ CRUD | read/order | — | ✅ |
| Orders | buyer own / merchant own-store / `admin:orders:read` | **read-only** | ✅ process | ✅ track/cancel | assigned list | ⚠️ admin intervention undefined |
| Inventory | merchant perms | read (data-quality) | ✅ | stock display | — | ✅ |
| Pricing/promotions | merchant perms | read | ✅ | apply | — | ✅ |
| **Shipments/exceptions/RTS** | merchant own-store + admin (verified B.5 matrix) | **no UI** | **no UI** | tracking view only | list only | **❌ invisible** |
| Disputes | `support:disputes:resolve` | ✅ resolve | view | create/evidence | — | ✅ |
| Analytics/KPIs/audit | `analytics:read`, `admin:kpis:read`, `admin:audit:read` | ✅ | trend only | — | — | ✅ |

Findings: (a) no excessive-privilege or tenant-boundary defects found — phase3 E2E + B-series gates verify; (b) DRIVER has endpoints but no seeded role/RBAC entries (documented scaffolding); (c) MERCHANT_STAFF write restrictions enforced backend-side (403) with UI hiding (documented in RBAC matrix); (d) admin shipping-operations permissions exist in guards but are unreachable through any admin screen.

---

# 10. End-to-End Workflow Audit

| Workflow | Trace summary | Verdict |
|----------|---------------|---------|
| Merchant onboarding | register → org → verification docs (S3) → admin review → store/warehouses → catalog (studio/import) → offers → pricing → live | **COMPLETE** (E2E-verified Ph1–Ph4) |
| Buyer onboarding | OTP/password → org create/join (invite code) → browse/search → cart → order | **COMPLETE**; address book absent (retype each checkout) |
| Product lifecycle | create (studio/import) → validate → moderation → publish → price (tiers) → offer propose → governance → ACTIVE → discoverable → orderable | **COMPLETE** |
| Quote lifecycle | — | **ABSENT** (no RFQ) |
| Order lifecycle | cart → checkout (idempotent) → master+sub orders → merchant accept/partial/reject → reserve → prepare → ready → deliver (merchant or driver) → delivered → completed; dispute path | **COMPLETE for delivered scope**; no payment/return/refund stages |
| Cancellation | buyer (pre-accept) / merchant (with reason) → FSM guard → stock release → shipment/carrier cancel (indeterminate-outcome safe, B.3.x/B.4) → events → UI | **COMPLETE** (incl. B.5 cancellation-wins-over-RTS) |
| Delivery exception | carrier webhook or ops report → exception record (8 types) → retry (max attempts) → RESOLVED or escalate → RTS eligibility | **BACKEND COMPLETE; no human surface** — exceptions cannot be observed or acted on via UI |
| RTS | request → approve → in-progress → physical confirmation → completed (audit + outbox) | **BACKEND COMPLETE; UI ABSENT**; restock deferred M7.3-C |
| Return (post-delivery) | — | **ABSENT** (M7.3-C planned) |
| Payment | — | **ABSENT** (Phase 3 planned) |
| Refund | — | **ABSENT** (M7.3-D planned) |
| Inventory | reserve→release/sale, adjust/transfer, ledger | **COMPLETE** (return/restock pending M7.3-C) |
| Admin intervention | admin views order (read-only) → …no authorized action path | **PARTIAL/UNDEFINED** — investigation possible, action absent |

---

# 11. State-Machine Consistency Audit

| Machine | Backend | DB | API | Frontend | Docs | Consistency |
|---------|---------|----|-----|----------|------|-------------|
| Order FSM (16 states) | `orders.service.ts` map | `orders.status` varchar(24)+history | transition endpoints + history | buyer timeline, merchant `NEXT_STATUS_MAP`, admin badge | plan §1204, matrix §18 | **CONSISTENT**; caveats: merchant web map predates B.5 (merchant cancel list hardcodes pre-B.5 statuses — verify refresh against B.5 OUT_FOR_DELIVERY cancellation); PAYMENT_PENDING rendered nowhere (harmless — unreachable) |
| Offer FSM (DRAFT→PROPOSED→ACTIVE/WITHDRAWN/SUSPENDED/REJECTED) | `catalog.offer.service` | `merchant_offers.status` | propose/approve/reject/suspend/activate/withdraw | merchant offers UI, admin governance | M6 docs | CONSISTENT |
| Shipment status | `shipment.schema.ts` (PREPARING…) + carrier mapped status | `shipments.status`, `carrier_status_mapped` | tracking endpoint | buyer tracking, driver screen | M7.2 spec | CONSISTENT for consumers; no UI renders full carrier reconciliation uncertainty (**G**: UI shows happy path only) |
| Exception FSM | `EXCEPTION_TRANSITIONS` (NULL→OPEN→RETRY_PENDING/RESOLVED/CLOSED/RTS_*) | `shipments.exception_status/type` | exception/retry/RTS endpoints | **none** | B.3–B.5 locks | **G — UI understands none of it** |
| Dispute FSM | disputes service | `disputes` + events | create/evidence/response/resolve | buyer + admin timelines | matrix §12 | CONSISTENT (resolution manual — BG-5) |
| Verification FSM | merchant service | `verification_requests` | review endpoints | admin queue | Ph3 docs | CONSISTENT |

Terminal-state handling: order terminal states reject transitions (E2E-verified); RTS terminal verified; delivery blocked during RTS (409, verified); cancellation closes exceptions (verified).

---

# 12. Database / Data Model Audit

69 tables across 50 migrations. Conventions: app-generated UUIDs, `timestamptz` UTC, money `bigint` minor + `char(3)` currency, `varchar`+CHECK statuses (plan §258/§412).

| Entity group | Tables | Assessment |
|--------------|--------|------------|
| Identity/RBAC | users, sessions, organizations, organization_members, roles, permissions, role_permissions | Sound; tenant scoping enforced; `credential_audit_log` for auth events |
| Merchant | stores, warehouses, business_documents, verification_requests | Sound; single-market assumptions documented |
| Catalog | categories, brands, products, product_variants, product_media, attribute_*, product_type*, product_attribute_values, variant_attribute_values, product_sources (canonical), merchant_offers | Mature (9 catalog phases); composite indexes (0027); offer atomization + snapshot (0028/0029) |
| Pricing | price_lists, price_tiers | **segment_id dangling (no segments table)**; channel/audience dark |
| Inventory | inventory_items, stock_movements | Append-only ledger; RETURN type reserved unused |
| Cart/orders | carts, cart_items, master_orders, orders, order_items, order_financial_breakdown, order_status_history | Sound; `delivery_address` JSONB (no normalization); idempotency fingerprint (0033) |
| Shipping | shipments, shipment_events, shipment_labels, delivery_proofs, shipping_methods, delivery_zones, delivery_zone_methods, carrier_credentials, carrier_configurations, carrier_webhook_events | Mature post-M7.3-B.5; reconciliation fields present (recovery_status, carrier_*_status) |
| Driver | driver_profiles, driver_store_assignments | Scaffolding (no seeded role) |
| Trust/comms | reviews, trust_snapshots, disputes, dispute_events, conversations, messages | Chat tables shipped dark per plan |
| Notifications | notifications, notification_preferences, device_tokens | Sound |
| Platform | audit_logs, outbox_events, analytics_events(+partition), feature_flags, search_queries, import_jobs, catalog_imports(+errors), catalog_requests, organization_update_requests, favorites, saved_suppliers | feature_flags has no management surface |
| **Absent** | **payments, payment_transactions, refunds, invoices, credit_notes, quotes, returns/rma, buyer_segments, addresses, credit_accounts, ledger_entries (sketched in plan only)** | See gap register |

Soft-delete/archival: predominantly hard deletes with `ON DELETE CASCADE`; org deactivation flag exists; analytics retention migration (0018). No general archival strategy documented — acceptable at current scale, flag for Phase 7.

---

# 13. Integration Audit

| Integration | Implemented | Abstraction | Retry | Idempotency | Reconciliation | Observability | Sandbox/live |
|-------------|-------------|-------------|-------|-------------|----------------|---------------|--------------|
| Aramex (carrier) | ✅ create/cancel/track/labels | provider port (`shipping/aramex/`) | ✅ recovery queue, retry classes | ✅ cancel idempotency key (0049) | ✅ create/cancel status + recovery fields (B.1–B.4) | webhook journal, status mapping | ✅ credentials table separates accounts |
| Carrier webhooks | ✅ token-authenticated (0044) | provider-keyed route | n/a | ✅ event journal | ✅ | logged | ✅ per-provider token |
| FCM push | ✅ device tokens | notifications service | — | — | — | — | — |
| SMS (Unifonic/Twilio-style) | **stub** | two-provider failover designed | **no live call** | — | — | — | — |
| Email | **none** | — | — | — | — | — | — |
| WhatsApp | **stub channel** | template channel | — | — | — | — | — |
| S3 storage | ✅ presign up/download | AWS SDK v3 | — | — | — | — | env-configured |
| Payment gateway | **none** | — | — | — | — | — | — |
| Redis caching | ✅ read-through (catalog) | ioredis | — | — | — | slow-query wrapper | — |
| OpenTelemetry | ✅ SDK + auto-instrumentations | — | — | — | — | traces/metrics export | env-configured |

---

# 14. Security Audit

| Area | Status | Evidence |
|------|--------|----------|
| Authentication | C | dual OTP+password; JWT access/refresh; rotation & theft remediation documented (`JWT-REFRESH-SECURITY-REMEDIATION-REPORT.md`); device trust; session revocation |
| RBAC | C | seeded roles/permissions; guards; 197 guarded routes; admin UI permission-filtered (routes/menu/buttons); phase3 E2E |
| Tenant isolation / IDOR | C (runtime-verified) | `tenant-scope.ts` asserts; phase3 + B.5 gate 8 |
| API validation | C | ValidationPipe + zod/contracts; RFC 7807 errors |
| Rate limiting | C | `@nestjs/throttler` |
| Security headers/CORS | C | helmet; env-configured CORS |
| Secret management | P | env-based (`packages/env`); carrier credential fields redacted (`redactSecrets`, B.1 tests); no vault integration documented |
| Webhook authenticity | C | per-provider webhook token (0044) |
| Idempotency | C | checkout key+fingerprint; carrier cancel key; RTS idempotent transitions |
| Concurrency | C (runtime-verified) | optimistic locks; 100-concurrent gates (accept, RTS request/approve/complete); inventory atomic ops |
| Transaction boundaries | C | state+event+outbox in single TX (verified B.5 gate 17) |
| Sensitive data exposure | C | no card data (no payments); documents via presigned URLs |
| Audit logging | C | middleware + admin viewer |
| **Security findings (not feature gaps)** | — | (S-1) Web/admin test coverage near-zero → regressions in permission-filtered UI could escape detection; (S-2) DRIVER endpoints rely on scaffolding role not seeded — verify provisioning path before enabling drivers in production; (S-3) free-text delivery address (no validation/normalization) — fraud/misdelivery hygiene; (S-4) no email verification channel — phone-only identity proofing |

---

# 15. Testing / Quality Audit

| Layer | State | Evidence |
|-------|-------|----------|
| API unit+integration | **Strong** — 111 spec files, ~1,911 tests; real-PostgreSQL suites via Testcontainers (B.5: 35 PG tests; 100-concurrent gates) | `apps/api/src/__tests__` |
| API E2E (phase suites) | 6 files / 236 tests / 4,660 lines (Ph1–Ph4 era; pre-shipping) | capability matrix §20 |
| TypeScript | 0 errors (B.5 gate 23) | `tsc --noEmit` |
| Build | PASS (275 files swc) | B.5 gate 24 |
| Regression | 88 files / 1,634 tests green (B.5 gate 25) | closure doc |
| Web tests | **0 files** | — |
| Admin tests | 1 file | `management.test.tsx` |
| Mobile tests | 6 files | `mobile/test` |
| Load testing | k6 scaffolding (`infra/load`); M7.1 concurrency results documented | — |
| Migration testing | verify scripts in `infra/drizzle/migrations/*.sh`; M6.2 migration verification doc | — |
| Observability | pino structured logs, OTel, SLO/alerting doc (`docs/monitoring/slo-and-alerting.md`) | — |

**Quality gaps:** frontend test coverage (web 0, admin 1, mobile 6) is the dominant testing risk; no UI-workflow E2E (Playwright/Cypress) located; E2E phase suites predate the shipping series (coverage of M7.2/M7.3 behavior lives in PG integration specs instead).

---

# 16. UX Completeness Audit

Phase-5 gate certified UX states (loading/empty/error/mutation) across critical pages, error differentiation by HTTP status, permission-filtered navigation (§17 of capability matrix) — verified consistent with code (shared `LoadingSpinner/ErrorBanner/EmptyState`, admin `useRequirePerms`, sidebar perm filtering).

Material UX findings:

1. **F-16.1 Navigation discoverability (HIGH):** no navigation path anywhere to shipments, exceptions, RTS, carrier recovery — because no screens exist (see §18).
2. **F-16.2 Buyer checkout addresses (MEDIUM):** free-text street/city re-entered per checkout; no saved addresses, no validation, no multi-location delivery for org buyers.
3. **F-16.3 Internationalization (HIGH for KSA market):** both web apps hardcode `<html lang="en" dir="ltr">`; no i18n framework/locale resources found; Arabic exists only in backend search normalization and catalog data. RTL, Arabic UI, Arabic documents: **NOT IMPLEMENTED**.
4. **F-16.4 Admin order operations (MEDIUM):** admin order detail is read-only; no intervention UX (consistent with missing backend admin-transition capability — undefined requirement).
5. **F-16.5 Exception visibility (HIGH):** buyers see generic tracking; merchants see order status; neither sees delivery-exception/RTS states — a delivery in distress is invisible to both parties.
6. **F-16.6 Responsive/mobile:** dedicated Flutter apps cover buyer+merchant; web responsive behavior Phase-5 certified.
7. **F-16.7 Documents:** no downloadable invoice/quote/delivery-note UX (backend absent).

---

# 17. B2B Capability Assessment

Classification: ✅ implemented · ◐ partial · 📋 planned · ❌ missing · ⊘ not relevant · ❓ requires product decision

| Capability | Class | Rationale |
|------------|-------|-----------|
| Organization hierarchy | ◐ | single-level orgs; branches excluded Phase 1 (❓ multi-branch future) |
| Branch management | ❌ (⊘ per Phase 1 fence) | plan line 1352 |
| Multiple contacts | ◐ | order-attached contacts; no contact entity |
| Role-based buyer permissions | ◐ | org members share role model; no buyer-side granular perms (e.g., buyer vs. approver) |
| Approval workflows (orders) | ❌ | not in plan; ❓ product decision |
| Customer-specific catalogs | ❌ | no assortment restriction mechanism; ❓ |
| Customer-specific pricing | ◐ | schema columns (audience/segment) dark; no segments; resolution ignores |
| Price lists | ✅ | per-store lists with priority/validity |
| Negotiated pricing | ❌ | no negotiation entity |
| MOQ | ◐ | tier min_qty approximates; no enforced MOQ rule |
| RFQ/quotation | ❌ | nowhere in plan or code; ❓ product decision |
| Purchase orders | ◐ | orders serve as POs implicitly; no PO numbers/attachments |
| Order approvals | ❌ | ❓ |
| Spending limits | ❌ | ❓ |
| Credit accounts | ❌ (⊘ until P7) | documented fence |
| Payment terms | ❌ (⊘ until P7) | documented fence |
| Invoices | ❌ | ❓ (Phase 3 finance console may cover) |
| Account statements | ❌ | ❓ |
| Sales representatives / customer assignment | ❌ | ❓ |
| Business contracts | ◐ | `audience=CONTRACT` column only |
| Recurring orders | ❌ | reorder exists (manual) |
| Bulk ordering (CSV/Excel order) | ❌ | catalog import exists; order import does not; ❓ |
| Reorder workflows | ✅ | one-click reorder |
| Procurement workflows | ❌ | ❓ |
| Multi-address delivery | ❌ | free-text address only |
| Warehouse selection | ◐ | warehouses exist; checkout does not select |
| Multi-location inventory | ◐ | store+warehouse scopes; single-market |
| Account-level reporting | ❌ | buyer-side reporting absent |
| Financial reconciliation | ◐ | carrier reconciliation state; payment reconciliation absent (Phase 3) |
| B2B notifications | ◐ | in-app/push for orders; no email; no org-scoped notification routing |

---

# 18. Cross-Domain Gap Analysis (highest-value section)

| # | Cross-domain gap | Impact |
|---|------------------|--------|
| X-1 | **Shipping ops built but invisible.** Exceptions/RTS/carrier-recovery exist in API+DB+events with verified correctness, yet no admin/merchant screen consumes them → operations team cannot run delivery ops without direct API calls; B.5 investment unrealized | BLOCKING for operations |
| X-2 | **Order lifecycle ends at COMPLETED with no financial settlement.** Orders, inventory, disputes all assume money moved somehow; payments module empty → no refund on cancellation, no COD capture, no reconciliation vs. carrier fees | BLOCKING for production revenue |
| X-3 | **RTS_COMPLETED does not restock.** Inventory ledger supports RETURN; nothing emits it → stock sold-then-returned vanishes from sellable quantity until manually adjusted (M7.3-C scope, audited) | HIGH |
| X-4 | **Disputes resolve manually with no financial lever.** Dispute resolution cannot trigger refund/partial refund because refunds don't exist (M7.3-D/E dependency chain) | HIGH |
| X-5 | **Segment/contract pricing columns orphan.** Pricing schema anticipates B2B audiences; no segments entity, no resolution logic, no admin → merchants cannot do customer-specific pricing despite schema | MEDIUM |
| X-6 | **Buyer identity is phone-only; no email channel.** OTP via SMS stub means production OTP delivery itself depends on unimplemented provider wiring | HIGH (launch risk) |
| X-7 | **Arabic normalized in search but UI is English/LTR only.** KSA B2B buyers get an English console | MEDIUM-HIGH (market fit) |
| X-8 | **Events exist (outbox) with rich shipping/RTS vocabulary but no notification consumers.** M7.3-F will need subscribers; today state changes are silent | MEDIUM |
| X-9 | **Feature flags table dark.** No controller/UI → operational toggles unavailable | LOW |
| X-10 | **Driver flow wired to orders but role unprovisioned.** assign-driver + mobile screen exist; DRIVER not seeded → enablement requires seed/provisioning decision | MEDIUM |

---

# 19. Master Gap Register

Type: FEATURE/UX/API/DATA/WORKFLOW/SECURITY/ARCHITECTURE/INTEGRATION/TESTING/DOCUMENTATION/OBSERVABILITY/B2B PRODUCT/PERFORMANCE. Status: BLOCKING/HIGH/MEDIUM/LOW/INFO.

| ID | Domain | Gap | Current | Desired | Impact | Dependency | Type | Status |
|----|--------|-----|---------|---------|--------|------------|------|--------|
| G-01 | Shipping ops | No admin shipments/exceptions console | backend verified | admin UI: list, detail, exception report/retry, RTS queue/actions | delivery ops impossible via UI | none (API ready) | UX/WORKFLOW | BLOCKING |
| G-02 | Shipping ops | No merchant shipment/exception/RTS UI | backend verified | merchant UI: create/cancel shipment, labels, exception visibility, RTS request/track | merchant cannot run platform-delivery ops | none | UX/WORKFLOW | BLOCKING |
| G-03 | Shipping ops | No carrier management UI (credentials/config/recovery) | admin APIs verified | admin carrier console | recovery queue unusable | none | UX | HIGH |
| G-04 | Payments | Entire payments capability absent | empty module | Phase 3: provider integration, COD capture, payment status | no revenue path | product: provider selection | FEATURE/INTEGRATION | BLOCKING |
| G-05 | Refunds | No refund domain | absent | M7.3-D refund automation tied to disputes/cancellation/returns | financial closure impossible | G-04 | FEATURE/WORKFLOW | BLOCKING |
| G-06 | Returns | Post-delivery returns absent | M7.3-C audited, unimplemented | return-to-stock, condition/qty recording, RMA flow | inventory/financial leak | B.5 (done) | FEATURE/WORKFLOW | HIGH |
| G-07 | Finance | No invoices/credit notes/documents | absent | invoice generation (PDF), tax documents | B2B buyers require invoices | G-04, product decision | FEATURE/B2B PRODUCT | HIGH |
| G-08 | Pricing | Segment/contract pricing dark | schema only | buyer segments + resolution + admin assignment | cannot honor B2B price contracts | product decision | DATA/FEATURE | MEDIUM |
| G-09 | Buyer data | No address book / multi-location | JSONB free text | normalized addresses per org with checkout picker | B2B multi-site delivery unsupported | none | DATA/UX | MEDIUM |
| X-10→G-10 | Identity | DRIVER role unprovisioned | scaffolding | seed/provision DRIVER + RBAC entries | platform delivery staffing blocked | product/ops decision | SECURITY/WORKFLOW | MEDIUM |
| G-11 | Notifications | SMS provider stub; no email channel | stub code | wire SMS provider (OTP-critical); add email channel | OTP delivery + B2B comms at risk | provider selection | INTEGRATION | HIGH |
| G-12 | Notifications | Shipping/RTS events silent | outbox only | M7.3-F notification expansion | parties unaware of exceptions | G-01/G-02 | FEATURE | MEDIUM |
| G-13 | i18n | English-only LTR UI | hardcoded en/ltr | Arabic + RTL across web/admin/mobile + docs | KSA market fit | product decision | UX | HIGH |
| G-14 | B2B product | No RFQ/quotation | absent | ❓ product decision (absent from plan) | classic B2B procurement unsupported | product decision | B2B PRODUCT | INFO→HIGH if in scope |
| G-15 | B2B product | No order approvals/spending limits | absent | ❓ product decision | enterprise buyer governance unsupported | product decision | B2B PRODUCT | INFO |
| G-16 | B2B product | No credit/terms/AR | absent (fenced P7) | out of scope until P7 (documented) | trade credit unsupported | regulated partner (P7) | B2B PRODUCT | INFO |
| G-17 | Admin ops | Admin order intervention undefined/absent | read-only detail | define + build admin cancel/force-transition with audit | support cannot intervene | product decision | WORKFLOW | MEDIUM |
| G-18 | Testing | Web/admin/mobile test coverage ~0/1/6 | as stated | UI regression suites + E2E (Playwright) | UI regressions undetectable | none | TESTING | HIGH |
| G-19 | Analytics | No business reporting (sales/ops/finance) | event infra only | merchant + admin report surfaces | data-driven ops unsupported | G-04 (finance) | FEATURE | MEDIUM |
| G-20 | Docs | CAPABILITY-MATRIX stale post-M7.2 | dated 2026-09-25 | refresh incl. shipping/RTS/parity | governance drift | none | DOCUMENTATION | LOW |
| G-21 | Platform | Feature flags no management surface | table only | admin flags UI + controller | ops toggles unavailable | none | FEATURE | LOW |
| G-22 | Reconciliation | No reconciliation worker/scheduled jobs | state recording only (B.5 scope) | scheduled sweeps of recovery queue + alerting | stale carrier drift undetected | G-03 | ARCHITECTURE/OBSERVABILITY | MEDIUM |
| G-23 | Commerce | Tax/delivery fee hardcoded/defaulted at checkout (BG-2) | zeroed amounts | zone-based fee resolution everywhere + VAT config | financial accuracy | G-04 | FEATURE/DATA | MEDIUM |
| G-24 | Checkout | No bulk/CSV ordering | absent | ❓ product decision (B2B convenience) | large-order friction | product decision | B2B PRODUCT | LOW |
| G-25 | Support | Support module empty stub | module file only | helpdesk/ticketing or remove | undefined | product decision | FEATURE | LOW |

---

# 20. Improvement Recommendations

Format: Recommendation / Why / Affected area / Expected benefit / Dependencies / Risks / Suggested milestone.

### Must-have for a coherent B2B framework

1. **R-1 Ship-Ops Console (admin) + Merchant Delivery Ops (web).** Why: unlock G-01/G-02/G-03 — the entire M7.2.3/M7.3 investment is human-unusable. Area: apps/admin (new /shipments, /exceptions, /carriers pages), apps/web merchant (shipment create/cancel, labels, exception+RTS actions), mobile (merchant RTS visibility). Benefit: operational loop closable by humans; B.5 RTS workflow finally exercisable; carrier recovery queue actionable. Dependencies: none — backend contracts stable and verified. Risks: low; pure UI on verified APIs. Suggested milestone: **M7.3-B.6 "Ship-Ops UI"** (immediate next).
2. **R-2 M7.3-C Returns implementation.** Why: close X-3 (restock leak) and G-06; audit already GO with 8 conditions — cheapest high-value milestone. Area: orders/shipping/inventory services + merchant/admin UI from R-1. Benefit: physical return loop closes; inventory integrity. Dependencies: B.5 (done); R-1 recommended first so the RTS actions exist in UI. Risks: concurrency with cancellation/delivery (mitigated by B.5 lock patterns). Suggested: **M7.3-C** (as audited).
3. **R-3 Payments foundation (Phase 3 kickoff).** Why: G-04 blocks revenue, refunds, disputes closure, finance console. Area: new payments module (provider port, transactions, COD capture at POD, payment status on order timeline), checkout integration, admin finance console v1. Benefit: platform can monetize; unblocks M7.3-D refunds, M7.3-E dispute closure. Dependencies: provider selection (product), PCI-scope decision (hosted SDK per plan §1380). Risks: compliance scope; keep card data out of platform (plan guidance). Suggested: **M8.1 Payments — COD + provider**.
4. **R-4 Notification channel wiring (SMS live + email).** Why: OTP itself rides the stubbed SMS path (G-11) — launch-blocking in production; B2B buyers expect email docs. Area: notifications service providers, templates. Benefit: auth deliverability + exception/RTS silence (G-12) fixable in M7.3-F. Dependencies: provider contracts. Risks: deliverability ops. Suggested: **M8.0 or alongside R-3**.
5. **R-5 Frontend regression safety net.** Why: G-18 — 0 web / 1 admin / 6 mobile test files against 109 UI pages is unsustainable as ship-ops UI lands. Area: Playwright E2E for critical flows (checkout, accept, ship, RTS), component tests for new consoles. Benefit: safe iteration on R-1/R-2/R-3. Dependencies: none. Risks: low. Suggested: **start with R-1, grow with each milestone**.

### Strong improvements

6. **R-6 Buyer address book (org-scoped, multi-location).** G-09. Schema + checkout picker + validation. Suggested: M8.x commerce UX.
7. **R-7 Segment pricing activation.** G-08/G-05-schema: buyer segments entity + resolution filter + admin assignment UI — delivers real "customer-specific pricing" from dormant schema. Suggested: post-payments (commercial layer).
8. **R-8 Arabic/RTL i18n.** G-13: i18n framework, ar-SA resources, RTL layouts, Arabic documents (with invoices). Market-fit critical; schedule before pilot scale-up.
9. **R-9 Reconciliation worker + alerting.** G-22: scheduled sweep of carrier recovery queue, stale-state detection, ops alerts (extends B.5 recording into active reconciliation).
10. **R-10 Admin order intervention (defined + audited).** G-17: product decision then minimal force-actions with full audit trail.
11. **R-11 Business reporting v1.** G-19: merchant sales/orders report, admin ops dashboard (exceptions aging, RTS cycle time).
12. **R-12 DRIVER provisioning.** G-10: seed role + RBAC + dispatcher assignment UX (merchant assign-driver already exists).
13. **R-13 Fee/VAT resolution correctness.** G-23: replace zeroed delivery/tax at checkout with zone-fee + configurable VAT before payments land.

### Future enhancements (post-stabilization)

14. **R-14 RFQ/quotation domain** — only after explicit product decision (G-14); large surface (request→offer→negotiate→convert).
15. **R-15 Buyer-side approval workflows/spending limits** (G-15) — enterprise procurement tier.
16. **R-16 Bulk CSV ordering** (G-24), reorder templates.
17. **R-17 Credit/terms/AR** — Phase 7 regulated scope only (G-16).
18. **R-18 Chat UI** over shipped conversations schema (documented fast-follow).
19. **R-19 Feature-flag console** (G-21).
20. **R-20 Multi-warehouse/branch** — Phase 7 fence today.

---

# 21. B2B Completion Checklist (definition of done for the framework)

```text
Organization Management: complete when orgs+members+roles+tenant isolation are
  verified (DONE) AND buyer-org member management is available on every client
  AND (if in scope) branch hierarchy is decided.
Customer Management: complete when merchants can manage customer orgs, contacts,
  multiple delivery addresses, and lifecycle from UI (PARTIAL — addresses missing).
Catalog: complete when taxonomy/products/offers/import/governance are verified
  (DONE).
Pricing: complete when tier pricing is verified (DONE) AND customer-segment
  pricing resolves at checkout AND MOQ semantics are explicit.
Quotation: complete when product decides RFQ in/out; if in: RFQ→quote→negotiate
  →accept→order conversion with audit (UNDECIDED).
Ordering: complete when 16-state FSM + master/sub orders + idempotency verified
  (DONE) AND payment state participates AND admin intervention is defined.
Fulfillment: complete when merchant/driver delivery is verified (DONE) AND
  picking/packing scope is decided (currently out of scope — acceptable).
Inventory: complete when reserve/release/sale verified (DONE) AND return-to-stock
  settles returned quantity (M7.3-C).
Shipping: complete when carrier integration is verified (DONE) AND ops consoles
  expose shipments/exceptions/RTS/recovery AND reconciliation is actively
  monitored.
Returns: complete when post-delivery RMA→receipt→inspection→restock→refund runs
  end-to-end (NOT STARTED — M7.3-C/D).
Payments: complete when provider payments + COD capture + status-in-timeline +
  reconciliation run in production (NOT STARTED — Phase 3).
Financial: complete when invoices/credit notes are issuable and refunds settle
  disputes/cancellations/returns (NOT STARTED).
Reporting: complete when merchant and admin have sales/ops/finance dashboards
  (PARTIAL — KPIs only).
Admin: complete when governance (DONE) + operations (shipments/finance/settings)
  consoles exist (PARTIAL).
UI: complete when every verified backend workflow has a discoverable UI path on
  the correct role's surface (FAILS TODAY for shipping ops) AND i18n/RTL decision
  is implemented.
Security: complete when current verified posture (DONE) + DRIVER provisioning
  resolved + frontend authz covered by tests.
Observability: complete when logs/traces (DONE) + reconciliation alerting +
  business metrics exist (PARTIAL).
```

---

# 22. Recommended Roadmap

Full detail in `SCS-B2B-FRAMEWORK-ROADMAP.md`. Sequence (evidence-based, not the existing plan's repetition):

| Phase | Work packages | Unblocks |
|-------|---------------|----------|
| **R0 — Ship-Ops Visibility (M7.3-B.6)** | R-1, R-5(start), R-12 | human-usable delivery ops; RTS exercisable |
| **R1 — Returns Loop (M7.3-C)** | R-2 | inventory integrity; physical return truth |
| **R2 — Financial Foundation (M8.x)** | R-3, R-4, R-13 | revenue, refunds, finance console |
| **R3 — Refunds & Dispute Closure (M7.3-D/E)** | R-5(continue), refund automation, dispute-resolution financial levers | financial closure of conflicts |
| **R4 — Commercial Depth** | R-6, R-7, R-8, R-11 | real B2B pricing, KSA market fit, reporting |
| **R5 — Notification Expansion (M7.3-F)** | R-4 consumers, event-driven comms | engagement, exception awareness |
| **R6 — Platform Hardening** | R-9, R-10, R-19 | ops maturity |
| **R7 — Advanced B2B (product-gated)** | R-14..R-17 | enterprise procurement |

## 23. Dependency Graph

```text
B.5 (DONE: cancellation + exceptions + RTS backend)
   │
   ├─▶ R0 Ship-Ops UI ──────────────┐
   │      (admin console, merchant ops, DRIVER provisioning)
   │                                ▼
   ├─▶ R1 Returns (M7.3-C) ──▶ restock integrity ──▶ R3 Refund linkage
   │
   ├─▶ R2 Payments (provider+COD) ──▶ order payment state ──▶ R3 Refunds (M7.3-D)
   │            │                                            │
   │            ├─▶ Invoices/documents ──▶ Arabic docs ◀─────┤
   │            ▼                                            ▼
   │        Finance console ──▶ Reconciliation ──▶ Dispute financial closure (M7.3-E)
   │
   ├─▶ R4 Segment pricing ──▶ customer-specific price resolution
   │      └─▶ (product decision) RFQ/contract pricing
   │
   ├─▶ R5 Notifications expansion (M7.3-F) consumes outbox events from B.5/R1/R2/R3
   │
   └─▶ R6 Reconciliation worker + admin intervention + flags console
            │
            ▼
        R7 Advanced B2B: approvals, spending limits, bulk ordering, credit (P7-regulated)
```

Rule enforced: no UI milestone is scheduled before its backend contract is verified-stable (R0/R1 consume B.5-verified contracts; R3 UI follows R2 payment contracts).

## 24. Immediate Next Actions (engineering, no product decisions required)

1. **Plan M7.3-B.6 Ship-Ops UI** against the verified v1/shipments + v1/carrier contracts (scope: admin console + merchant ops + exception/RTS visibility for buyers where appropriate).
2. **Execute M7.3-C** per its completed audit (8 conditions).
3. **Open Phase 3 discovery**: payment provider selection + COD two-step capture design (product decision needed: provider, COD policy).
4. **Wire SMS provider** for OTP deliverability (production launch risk independent of roadmap order).
5. **Seed/provision DRIVER role** or formally descope driver flows (decision).
6. **Stand up Playwright critical-path suite** (checkout → accept → ship → exception → RTS) before ship-ops UI lands.
7. **Refresh CAPABILITY-MATRIX.md** to include the shipping/delivery/RTS surface (documentation debt).

## 25. Strategic Conclusion (five explicit conclusions)

### 25.1 CURRENT PLATFORM STATE
A release-governed, integrity-verified B2B marketplace core at M7.3-B.5: identity/RBAC/orgs, deep catalog+offers, tier pricing, search, cart, 16-state orders, inventory, promotions, disputes, notifications (in-app/push), analytics/audit, plus a verified shipping/delivery/cancellation/RTS backend — with 1,634+ green tests and runtime-verified concurrency/tenant isolation. HEAD exactly equals the B.5 closure baseline; no post-B.5 code exists.

### 25.2 B2B FRAMEWORK COMPLETENESS
- **Complete:** identity/auth, org/RBAC, catalog & offers, search, cart, ordering FSM (delivered scope), inventory (delivered scope), promotions, reviews/disputes (create→resolve), import/export, admin governance, auditability.
- **Partial:** buyer-org UX on web, pricing (segment dark), notifications (channels stubbed), analytics/reporting, admin operations (read-only orders), fulfillment (no pick/pack — out of scope), driver flow (unprovisioned), i18n.
- **Missing:** payments (BLOCKING), refunds, returns/restock (audited, ready to build), invoices/documents, RFQ/quotations (undocumented), approvals/spend limits (undocumented), credit/AR (documented P7), address book, email channel, Arabic/RTL UI, ship-ops UI (BLOCKING operational gap).

### 25.3 API/UI PARITY
- **Backend ahead (severe):** the entire shipping-operations domain (~32 endpoints: shipments ops, exceptions, RTS, carrier admin/recovery) plus conversations/chat and feature flags.
- **UI ahead:** none detected (Phase 5 gate eliminated fake UI; this audit found no contradictions).
- **Fully aligned:** catalog, offers, ordering, inventory, pricing (merchant), promotions, disputes, notifications (in-app), admin governance.
- **Misaligned:** checkout/payment state (neither side has payments; UI implies offline settlement); segment pricing (schema ↔ behavior); merchant web cancel matrix vs B.5 rule change (needs refresh verification).

### 25.4 CRITICAL GAPS (must solve before scaling)
1. Ship-ops visibility (G-01..G-03) — operations cannot run.
2. Payments void (G-04) — no revenue, no refunds, no finance console.
3. Returns/restock + refunds chain (G-05/G-06, X-3/X-4) — inventory & financial leakage.
4. Notification deliverability (G-11) — OTP over stubbed SMS is a launch risk.
5. Frontend test vacuum (G-18) — regression risk compounds as UI grows.

### 25.5 RECOMMENDED ROADMAP
- **Immediate (now → +2 milestones):** M7.3-B.6 Ship-Ops UI (+Playwright net, DRIVER decision) → M7.3-C Returns.
- **Near-term:** Phase 3 payments (COD + provider), SMS/email wiring, fee/VAT correctness.
- **Medium-term:** M7.3-D refunds, M7.3-E dispute closure, M7.3-F notifications, address book, segment pricing, Arabic/RTL, reporting v1.
- **Long-term (product-gated):** RFQ/quotations, buyer approvals/spend limits, bulk ordering, credit/AR (P7-regulated), multi-warehouse/branch, B2C (Phase 4), Ads (Phase 5), AI (Phase 6).

**This audit intentionally assigns no single percentage score; completeness is multi-dimensional and the populations are stated per metric above.**

---

# 26. Read-Only Validation

```text
Production code modified: NO
Frontend code modified:   NO
Backend code modified:    NO
Tests modified:           NO
Migrations added:         NO
Schema modified:          NO
Business rules changed:   NO
Implementation started:   NO
Artifacts created:        docs/production/SCS-B2B-FRAMEWORK-COMPLETENESS-AUDIT.md (this file)
                          docs/production/SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv
                          docs/production/SCS-B2B-API-UI-PARITY-MATRIX.csv
                          docs/production/SCS-B2B-FRAMEWORK-ROADMAP.md
```

*Repository used as primary source of truth for implementation status; authoritative documentation used as source of intended scope. No recommendation herein constitutes implementation.*
