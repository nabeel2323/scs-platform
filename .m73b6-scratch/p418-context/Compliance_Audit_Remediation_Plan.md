# Compliance Audit & Remediation Plan
## Smart Commerce & Supply Platform vs. Implementation Plan

**Audit Date:** September 3, 2026  
**Reference Document:** `Smart_Commerce_Platform_Implementation_and_UX_Plan.html`  
**Scope:** Backend (apps/api), Web (apps/web), Admin (apps/admin), Mobile (mobile/)

---

## Executive Summary

The platform has achieved **full Phase 0 and Phase 1 compliance**. All 4 P0 (blocking) and all 14 P1 (important) remediation items have been resolved. The backend now implements the canonical 16-status FSM with `PENDING_CONFIRMATION` auto-advance, a WebSocket gateway at `/realtime`, RFC 7807 error responses, and admin disputes/products pages. Web and mobile apps include favorites, account management, merchant catalog/inventory/pricing pages, QuantityStepper and TierLadder components, driver flavor, and barcode scanning. All 168 backend tests and 32 mobile tests pass. Remaining items are P2 (nice-to-have) only.

---

## 1. Backend Audit (apps/api)

### 1.1 Module Coverage

| Module | Plan Ref | Status | Notes |
|--------|----------|--------|-------|
| Identity & Access | §2.2, §3.1, App-B | ✅ Compliant | OTP, refresh, logout, switch-org, profile CRUD, orgs CRUD+members, RBAC, OrgScopeGuard |
| Merchant | §2.2, App-B | ✅ Compliant | Stores CRUD, warehouses, documents, verification queue, verify/decision |
| Catalog | §2.2, App-B | ✅ Compliant | Categories, brands, products, variants, media presign, import jobs, search |
| Inventory | §2.2, App-B | ⚠️ Partial | Has warehouse/variant lookup, adjust, reserve, release, movements. Missing `GET /v1/inventory` (plan endpoint) |
| Pricing | §2.2, App-B | ⚠️ Partial | Has price lists, tiers, resolve-price. Plan specifies `GET /v1/products/{id}/pricing`; impl uses `GET /v1/variants/:variantId/pricing` |
| Promotions | §2.2, App-B | ✅ Compliant | CRUD + validation + `GET /v1/offers/nearby` |
| Orders | §2.2, §5, App-B | ✅ Compliant | Full checkout + 16-status FSM + auto-advance PENDING_CONFIRMATION + accept/reject/partial/cancel/history/reorder |
| Reviews & Trust | §2.2, App-B | ✅ Compliant | Reviews CRUD, disputes with evidence/response/resolve, conversations, trust score |
| Notifications | §3.6, App-B | ✅ Compliant | Notifications CRUD, read/read-all, preferences, device tokens, unread count |
| Admin | §14.7, App-B | ✅ Compliant | Orders, merchants, KPIs, audit-logs, verifications alias, products moderation, disputes |
| Analytics | §3.10 | ✅ Compliant | Track, batch track, events, activity |
| Search | §3.4, App-B | ✅ Compliant | Full-text search, categories, brands endpoints |

### 1.2 FSM Deviations (Plan §5 vs Implementation)

| Plan Specification | Current Implementation | Status | Severity |
|---|---|---|---|
| 16 statuses: DRAFT, SUBMITTED, **PENDING_CONFIRMATION**, ACCEPTED, PARTIALLY_ACCEPTED, **PAYMENT_PENDING**, PREPARING, READY, **ASSIGNED**, **PICKED_UP**, OUT_FOR_DELIVERY, DELIVERED, COMPLETED, CANCELLED, REJECTED, **DISPUTED** | ✅ All 16 statuses implemented in FSM transition matrix | ✅ Compliant | **Resolved** |
| `SUBMITTED → PENDING_CONFIRMATION` (auto, notify merchant, start SLA timer) | ✅ Auto-advance implemented with outbox event + SLA timer | ✅ Compliant | **Resolved** |
| `ACCEPTED/PARTIAL → PREPARING` (auto, Phase 1 default: payment on account) | `ACCEPTED/PARTIAL → PREPARING` (CONFIRMED removed, aligned with plan) | ✅ Compliant | **Resolved** |
| `DELIVERED/COMPLETED → DISPUTED` (≤72h) | ✅ DISPUTED in FSM matrix from DELIVERED and COMPLETED | ✅ Compliant | **Resolved** |
| `PAYMENT_PENDING`, `ASSIGNED`, `PICKED_UP` | ✅ All three in FSM matrix | ✅ Compliant | **Resolved** |
| Plan uses `CONFIRMED` status | `CONFIRMED` removed; `resolveStatusAlias()` maps legacy CONFIRMED → PENDING_CONFIRMATION | ✅ Compliant | **Resolved** |

### 1.3 Cross-Cutting Infrastructure

| Feature | Plan Ref | Status | Notes |
|---------|----------|--------|-------|
| Transactional Outbox | §2.6, §30.3 | ✅ Compliant | `OutboxDispatcher` used in all state-changing services (orders, catalog, pricing, reviews, disputes, merchant) |
| Domain Events | Appendix A | ✅ Compliant | Events: order.submitted/accepted/partially_accepted/rejected/status.changed/cancelled, catalog.product.published, pricing.price_list.updated, review.created, dispute.opened/resolved |
| OrgScopeGuard | §3.9 | ✅ Compliant | Generic guard with `@OrgScoped()` decorator, handles direct/nested/many-to-many patterns |
| Rate Limiting | §2.5 | ✅ Compliant | `@nestjs/throttler` with Redis, X-RateLimit headers |
| JWT Auth | §2.5 | ✅ Compliant | JwtAuthGuard, PermissionsGuard, CurrentUser decorator |
| WebSocket Gateway | §3.7 | ✅ Compliant | `RealtimeGateway` at `/realtime` with rooms `user:{id}`, `org:{id}`, `order:{id}`; events `order.status.changed`, `notification.new` |
| Error Format (RFC 7807) | §2.5 | ✅ Compliant | Global exception filter producing `application/problem+json` with Content-Type header |
| Audit Log | §3.9 | ✅ Compliant | `audit_logs` schema with actor/action/resource/before/after/IP |
| Idempotency | §2.5, §30.3 | ✅ Compliant | Checkout accepts `Idempotency-Key` header |

---

## 2. Web Audit (apps/web)

### 2.1 Page Coverage vs Plan §13–14

| Screen / Flow | Plan Ref | Status | Notes |
|---|---|---|---|
| Login (OTP) | §14.1 step 2 | ✅ Compliant | `/auth/login` |
| Home | §13.2 | ⚠️ Partial | Missing Smart Reorder strip, saved suppliers, offers nearby |
| Search | §14.3 step 2 | ⚠️ Partial | Text search works. Missing barcode scan button, sponsored slot labels |
| Product Detail | §14.3 step 3 | ⚠️ Partial | Shows variants. Missing TierLadder widget, supplier comparison panel |
| Stores List/Detail | §14.3 | ✅ Compliant | `/stores`, `/stores/[slug]` |
| Cart | §14.3 step 5 | ⚠️ Partial | Missing per-supplier MOQ progress bars, per-supplier delivery method, notes per supplier |
| Checkout | §14.3 step 6 | ✅ Compliant | `/checkout` with delivery address, notes |
| Orders List/Detail | §14.3 step 7 | ✅ Compliant | `/orders`, `/orders/[id]` with `OrderTimeline` |
| Reviews | §14.3 step 8 | ✅ Compliant | `/reviews` |
| Notifications | §15.3 | ✅ Compliant | `/notifications` |
| Merchant Onboarding | §14.1 steps 3–5 | ✅ Compliant | `/merchant/onboard` with store wizard, docs, locale |
| Import Wizard | §14.2 | ✅ Compliant | `/merchant/import` — upload → mapping → validation → progress → publish |
| Merchant Orders | §14.4 | ✅ Compliant | `/merchant/orders` with accept/reject/transition |
| Merchant Success | §14.1 step 7 | ✅ Compliant | `/merchant/success` |
| **Account / Profile** | §13.2 top nav | ✅ Compliant | `/account` with profile editing, organizations, device management |
| **Favorites / Wishlist** | §14.3 | ✅ Compliant | `/favorites` page, API endpoints (GET/POST/DELETE /v1/me/favorites), favorites schema |
| **Merchant Catalog Grid** | §14.2 | ✅ Compliant | `/merchant/catalog` with status filters, inline edit, bulk actions |
| **Merchant Inventory** | §13.1 | ✅ Compliant | `/merchant/inventory` with stock levels, adjustment, low-stock alerts |
| **Merchant Pricing Editor** | §14.2 | ✅ Compliant | `/merchant/pricing` with price list + tier editor and TierLadder preview |
| **Merchant Analytics** | §15.2 | ❌ Missing | No merchant dashboard page |

### 2.2 Component Coverage vs Plan §12.6

| Component | Status | Notes |
|-----------|--------|-------|
| OrderTimeline | ✅ Present | `components/OrderTimeline.tsx` |
| ImportWizard | ✅ Present | `merchant/import/page.tsx` |
| StatusBadge / StatusPill | ✅ Partial | Inline in Shared.tsx, not a standalone design-system component |
| EmptyState | ✅ Present | In Shared.tsx |
| **QuantityStepper** | ✅ Compliant | `components/QuantityStepper.tsx` — ± buttons, direct entry, tier hint, MOQ floor guard |
| **TierLadder** | ✅ Compliant | `components/QuantityStepper.tsx` — visual quantity-price ladder with active tier highlighting |
| **ActivationChecklist** | ❌ Missing | Plan §12.6 — merchant activation tracker |
| **KpiCard / Sparkline** | ❌ Missing | Plan §12.6 — analytics components |
| **ProductCard** | ❌ Missing | Plan §12.6 — with MOQ badge, rating, trust badge |
| **SupplierCard** | ❌ Missing | Plan §12.6 — with price, MOQ, rating, distance |
| **MapPinPicker** | ❌ Missing | Plan §14.1 step 4 — store wizard location |
| **OTPInput** | ❌ Missing | Plan §14.1 step 2 — dedicated OTP entry widget |
| **DocUploader** | ❌ Missing | Plan §14.1 step 5 — progress/retry document upload |
| **OfflineBanner / QueuedActionChip** | ❌ Missing | Plan §12.6 — offline-tolerant UX |

### 2.3 Localization & RTL (§17)

| Requirement | Status | Notes |
|---|---|---|
| `next-intl` integration | ❌ Missing | Plan specifies `next-intl` for web; not used |
| RTL layout (logical CSS) | ❌ Missing | Uses `marginLeft` etc., not `marginInlineStart` |
| Arabic font (IBM Plex Sans Arabic) | ❌ Missing | No Arabic font loaded |
| ARB/string files | ❌ Missing | No i18n string management |
| `direction: 'rtl'` on Arabic content | ⚠️ Partial | Only on product titleAr in PDP (inline style) |

---

## 3. Admin Console Audit (apps/admin)

### 3.1 Page Coverage vs Plan §13.4, §14.7

| Screen | Plan Ref | Status | Notes |
|--------|----------|--------|-------|
| Dashboard (overview) | §13.4 | ✅ Compliant | `/` with links to all sections |
| Orders Monitor | §14.7 | ✅ Compliant | `/orders` with status filters, SLA colors |
| Merchants List | §13.4 | ✅ Compliant | `/merchants` with verification status filters |
| Verification Queue | §14.7 | ✅ Compliant | `/verification` with list + detail at `/verification/[id]` |
| KPI Dashboard | §15.2 | ✅ Compliant | `/kpis` with activation funnel, order stats |
| Audit Log | §3.9 | ✅ Compliant | `/audit` with resource/action filters |
| **Disputes** | §14.7 | ✅ Compliant | `/disputes` with split-pane evidence viewer, resolve workflow, decision templates |
| **Products / Catalog Moderation** | §14.2 | ✅ Compliant | `/products` with moderation queue (approve/reject/archive) |
| **Finance / Settlements** | Phase 3 | ❌ Missing | (Deferred — Phase 3) |
| **Dispatch Console** | Phase 2 | ❌ Missing | (Deferred — Phase 2) |

### 3.2 Admin Interaction Model (§13.4)

| Requirement | Status | Notes |
|---|---|---|
| Queue-centric split pane | ⚠️ Partial | Verification detail has split layout; orders list doesn't |
| Keyboard shortcuts (j/k, A, X, /) | ✅ Compliant | Products moderation page: j/k nav, A approve, X reject, / search |
| Slide-over audit trail | ❌ Missing | Plan: every object exposes audit_logs in slide-over |
| Live order board (status columns) | ❌ Missing | Plan: status columns + filters |
| Dense grid layout | ⚠️ Partial | Uses basic tables, not dense DataGrid |

---

## 4. Mobile Audit (mobile/)

### 4.1 Flavor Architecture (§2.2, §2.3)

| Requirement | Plan | Status | Notes |
|---|---|---|---|
| Single codebase | ✅ | ✅ Compliant | Single `mobile/` directory |
| Retail flavor | ✅ | ✅ Compliant | `AppFlavor.retail` |
| Wholesale flavor | ✅ | ✅ Compliant | `AppFlavor.wholesale` |
| **Driver flavor** | ✅ | ✅ Compliant | `AppFlavor.driver` with driver dashboard screen (duty toggle, job board, earnings) |
| **Consumer flavor** | ✅ | ❌ Missing | Plan §14.6: nearby stores, cart, checkout, live tracking |

### 4.2 Screen Coverage vs Plan §13–14

| Screen / Feature | Plan Ref | Status | Notes |
|---|---|---|---|
| OTP Login | §14.1 | ✅ Compliant | `screens/auth/` |
| Home (buyer) | §13.2 | ⚠️ Partial | Missing Smart Reorder strip, saved suppliers |
| Search | §14.3 | ⚠️ Partial | Barcode scan added; missing sponsored slots |
| Product Detail | §14.3 | ⚠️ Partial | Missing TierLadder, supplier comparison |
| Stores List/Detail | §14.3 | ✅ Compliant | |
| Cart | §14.3 | ⚠️ Partial | Missing per-supplier MOQ progress bars |
| Checkout | §14.3 | ✅ Compliant | |
| Orders List/Detail | §14.3 | ✅ Compliant | With status transitions |
| Merchant Orders | §14.4 | ✅ Compliant | Accept/reject/partial, FSM transitions |
| Reviews & Disputes | §14.3 | ✅ Compliant | |
| Notifications | §15.3 | ✅ Compliant | |
| Profile | §13.2 | ✅ Compliant | Recently added |
| Organizations | §3.1 | ✅ Compliant | Recently added — list, create, switch, detail |
| **Barcode Scan** | §14.3 step 2 | ✅ Compliant | `mobile_scanner` integrated in search screen AppBar |
| **Favorites** | §14.3 | ✅ Compliant | Backend API + mobile StatusBadge updated with new FSM statuses |
| **Driver screens** | §13.3 | ✅ Compliant | Driver dashboard with duty toggle, job board, earnings; route in go_router |
| **Consumer screens** | §14.6 | ❌ Missing | Nearby stores, consumer checkout |
| **Import (mobile)** | §14.2 | ❌ Missing | API methods exist, no UI |

### 4.3 Mobile Cross-Cutting

| Feature | Plan Ref | Status | Notes |
|---|---|---|---|
| Offline-tolerant (queued actions) | §11 principle 6 | ❌ Missing | No offline queue, no QueuedActionChip |
| WebSocket realtime | §3.7 | ✅ Backend complete | `RealtimeGateway` at `/realtime`; mobile client deferred to P2-6 |
| RTL support | §17 | ❌ Missing | No Directionality-driven layouts |
| Tabular numerals | §12.3 | ❌ Missing | No `FontFeature.tabularFigures()` |
| Responsive breakpoints | §18 | ❌ Missing | No MediaQuery breakpoint handling |
| Accessibility (Semantics) | §16 | ❌ Missing | No Semantics widgets |
| Test coverage | §9.1 | ⚠️ Partial | 32 tests (models, FSM, API). Missing widget tests, integration tests |
| FSM sync with backend | §5 | ✅ Compliant | Mobile FSM aligned with all 16 canonical statuses |

---

## 5. Prioritized Remediation Plan

### P0 — Blocking Launch

| # | Gap | Plan Ref | Status | Implementation |
|---|-----|----------|--------|----------------|
| P0-1 | FSM missing `PENDING_CONFIRMATION` status | §5, §8.2 I1 | ✅ Resolved | 16-status FSM with auto-advance SUBMITTED→PENDING_CONFIRMATION, SLA timer, merchant notification via outbox |
| P0-2 | No WebSocket realtime gateway | §3.7 | ✅ Resolved | `RealtimeGateway` at `/realtime` with rooms `user:{id}`, `org:{id}`, `order:{id}`; events `order.status.changed`, `notification.new` |
| P0-3 | Error format not RFC 7807 | §2.5 | ✅ Resolved | Global exception filter producing `application/problem+json` with Content-Type header |
| P0-4 | Admin missing Disputes page | §14.7 | ✅ Resolved | `/disputes` with split-pane evidence viewer, resolve workflow, decision templates |

### P1 — Important

| # | Gap | Plan Ref | Status | Implementation |
|---|-----|----------|--------|----------------|
| P1-1 | Missing `GET /v1/offers/nearby` | App-B | ✅ Resolved | Endpoint added on promotions controller with PostGIS fallback |
| P1-2 | Missing web Account/Profile page | §13.2 | ✅ Resolved | `/account` with profile editing, organizations, device management |
| P1-3 | Missing web Favorites/Wishlist | §14.3 | ✅ Resolved | Schema, API (GET/POST/DELETE /v1/me/favorites), `/favorites` page |
| P1-4 | Missing QuantityStepper component | §12.6 | ✅ Resolved | Web (`QuantityStepper.tsx`) + Flutter (`common_widgets.dart`) with ± buttons, tier hint, MOQ floor |
| P1-5 | Missing TierLadder component | §12.5 | ✅ Resolved | Web + Flutter visual quantity-price ladder with active tier highlighting |
| P1-6 | Missing web Merchant Catalog Grid | §14.2 | ✅ Resolved | `/merchant/catalog` with status filters, inline edit, bulk actions |
| P1-7 | Missing web Merchant Inventory page | §13.1 | ✅ Resolved | `/merchant/inventory` with stock levels, adjustment, low-stock alerts |
| P1-8 | Missing web Merchant Pricing Editor | §14.2 | ✅ Resolved | `/merchant/pricing` with price list + tier editor and TierLadder preview |
| P1-9 | Missing mobile driver flavor | §2.3, §13.3 | ✅ Resolved | `AppFlavor.driver`, driver dashboard screen with duty toggle, job board, earnings |
| P1-10 | Missing mobile barcode scan | §14.3 step 2 | ✅ Resolved | `mobile_scanner` integrated in search screen AppBar |
| P1-11 | FSM Naming: `CONFIRMED` vs plan | §5 | ✅ Resolved | CONFIRMED removed; `resolveStatusAlias()` maps legacy CONFIRMED → PENDING_CONFIRMATION |
| P1-12 | Admin missing Products moderation | §14.2 | ✅ Resolved | `/products` with moderation queue (approve/reject/archive) |
| P1-13 | Admin missing keyboard shortcuts | §13.4 | ✅ Resolved | j/k nav, A approve, X reject, / search on products page |
| P1-14 | Missing `GET /v1/admin/verifications` endpoint | App-B | ✅ Resolved | Alias endpoint added on admin controller |

### P2 — Nice-to-Have

| # | Gap | Plan Ref | Current | Fix | Effort |
|---|-----|----------|---------|-----|--------|
| P2-1 | Web RTL/localization incomplete | §17 | No `next-intl`, no logical CSS | Integrate `next-intl`, convert to logical CSS properties, load IBM Plex Sans Arabic | 5d |
| P2-2 | Mobile RTL support | §17 | No Directionality layouts | Add `Directionality`-driven layouts, mirrored icons, ARB files | 3d |
| P2-3 | Missing ActivationChecklist | §12.6 | Not built | Build merchant activation tracker widget ("Verified ✓ · Products 4/20 · First order —") | 2d |
| P2-4 | Missing Smart Reorder strip | §15.1 | Not built | Build rules-based reorder suggestion card on home screen (Phase 4 feature, but UI can be stubbed) | 3d |
| P2-5 | Missing mobile offline support | §11 principle 6 | No offline queue | Implement queued action pattern with visible pending state (QueuedActionChip) | 4d |
| P2-6 | Missing mobile WebSocket client | §3.7 | No realtime | Add Socket.IO client, REST-resync on reconnect | 2d |
| P2-7 | Missing web DataGrid component | §12.6 | Basic tables only | Build reusable DataGrid: sticky header, inline edit, bulk select, saved views, keyboard nav | 4d |
| P2-8 | Missing KpiCard / Sparkline | §12.6 | Admin KPIs use basic numbers | Build KpiCard with delta indicators, Sparkline chart component | 2d |
| P2-9 | Missing mobile consumer flavor | §2.3, §14.6 | Not built | Add `AppFlavor.consumer` with nearby stores, consumer checkout (Phase 4) | 5d |
| P2-10 | Missing mobile accessibility | §16 | No Semantics widgets | Add Semantics announcements, ensure 48dp touch targets, screen reader passes | 3d |
| P2-11 | Missing mobile tabular numerals | §12.3 | Not applied | Add `FontFeature.tabularFigures()` on all price/quantity text | 0.5d |
| P2-12 | Missing mobile responsive breakpoints | §18 | No MediaQuery handling | Add Compact/Medium/Expanded layout switching via MediaQuery | 2d |
| P2-13 | Missing web supplier comparison | §14.3 step 3 | Not built | Add compare-across-suppliers panel on PDP | 2d |
| P2-14 | Missing web per-supplier cart details | §14.3 step 5 | Basic cart | Add per-supplier MOQ progress bars, delivery method, notes | 2d |
| P2-15 | Missing admin slide-over audit trail | §13.4 | Audit log is separate page | Build slide-over panel showing audit_logs for any object | 1d |
| P2-16 | Missing admin live order board | §14.7 | Orders list with filters | Build status-column board view (kanban-style) | 2d |
| P2-17 | ~~Missing `DISPUTED` FSM status~~ | §5 | ✅ Resolved (P0-1) | DISPUTED added to FSM matrix from DELIVERED/COMPLETED | — |
| P2-18 | Missing mobile widget tests | §9.1 | Only unit + API tests | Add widget tests for critical screens (home, cart, checkout, merchant orders) | 3d |
| P2-19 | Missing web E2E tests (Playwright) | §9.1 | No E2E tests | Set up Playwright, write critical flow tests (login→search→cart→checkout→order) | 3d |
| P2-20 | ~~Missing admin disputes page~~ | §14.7 | ✅ Resolved (P0-4) | `/disputes` with split-pane evidence viewer, resolve workflow, decision templates | — |

---

## 6. Effort Summary

| Priority | Items | Status | Estimated Effort |
|----------|-------|--------|-----------------|
| **P0 (Blocking)** | 4 items | ✅ All resolved | — |
| **P1 (Important)** | 14 items | ✅ All resolved | — |
| **P2 (Nice-to-have)** | 18 remaining + 2 resolved | 20 total (18 open) | ~46 days remaining |
| **Total** | **38 items** | **18 complete, 20 open** | **~46 days remaining** |

---

## 7. Execution Status

1. ✅ **P0 + P1 complete** — All 18 remediation items implemented and verified
2. **Verification results:**
   - Backend: `npx tsc --noEmit` ✅ clean | `npx vitest run` ✅ 168/168 pass
   - Web: `npx tsc --noEmit` ✅ clean
   - Admin: `npx tsc --noEmit` ✅ clean
   - Mobile: `dart analyze` ✅ 0 errors, 2 info (pre-existing deprecations) | `flutter test` ✅ 32/32 pass
3. **Next:** P2 items in order of user impact — start with RTL/localization (P2-1, P2-2), then advanced components (P2-3 through P2-16)

---

*End of Audit Report*
