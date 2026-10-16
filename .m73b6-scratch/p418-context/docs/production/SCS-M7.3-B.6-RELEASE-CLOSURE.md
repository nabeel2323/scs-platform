# SCS-M7.3-B.6 — Release Closure

## 1. Release Identity

| Field | Value |
|-------|-------|
| Milestone | M7.3-B.6 |
| Title | Ship-Ops Visibility |
| Parent | M7.3-B — Order Cancellation and Delivery Exceptions |
| Predecessor | M7.3-B.5 — CLOSED / PASS |
| Successor | M7.3-C — Returns (Fresh Architecture Audit required) |
| Business Objective | Expose shipping, delivery-exception, RTS, and carrier-recovery capabilities through complete admin, merchant, and buyer UI surfaces |
| Closure Date | 2026-10-03 |

---

## 2. Release Decision

```text
========================================
M7.3-B.6 RELEASE CLOSURE
========================================

Implementation:                  COMPLETE
Independent Runtime Verification: PASS
Release Closure:                 CLOSED / PASS

Playwright:                      5/5
API JSON buyer projection:       PASS
Tenant isolation:                PASS
Security:                        PASS
D-1:                             FIXED
D-2:                             FIXED
D-3:                             FIXED
Buyer projection leak:           FIXED

Known unrelated failures:
  Admin management.test.tsx:     2 pre-existing

Next:
  FRESH M7.3-C ARCHITECTURE AUDIT

No M7.3-C implementation started.
========================================
```

**All B.6-specific and required release verification gates pass.**
**Two unrelated pre-existing Admin management test failures remain.**

---

## 3. Evidence Chain

| # | Document | Expected Status | Actual Status |
|---|----------|----------------|---------------|
| 1 | `SCS-M7.3-B.6-IMPLEMENTATION-REPORT.md` | COMPLETE | COMPLETE — 34 sections |
| 2 | `SCS-M7.3-B.6-DRIVER-DECISION.md` | Decision record | DECISION RECORDED — DRIVER stays mobile-only |
| 3 | `SCS-M7.3-B.6-INDEPENDENT-RUNTIME-VERIFICATION.md` | PASS or BLOCKED | BLOCKED (no runtime environment available) |
| 4 | `SCS-M7.3-B.6-REMEDIATION-RE-VERIFICATION.md` | PASS | FAIL — D-1/D-2/D-3 fixed; buyer projection leak discovered |
| 5 | `SCS-M7.3-B.6-BUYER-PROJECTION-RE-VERIFICATION.md` | PASS | PASS — all gates green |
| 6 | `SCS-M7.3-B.6-RELEASE-CLOSURE.md` | PENDING → PASS | This document |

**Predecessor evidence:**

| # | Document | Status |
|---|----------|--------|
| 7 | `SCS-M7.3-B.5-RELEASE-CLOSURE.md` | CLOSED / PASS |
| 8 | `SCS-M7.3-B.5-INDEPENDENT-RUNTIME-VERIFICATION.md` | PASS (24/24 gates) |

**Verification sequence history (this is important — do not erase the earlier failures):**

```text
Initial verification       → BLOCKED (no runtime environment)
Runtime re-verification    → FAIL (D-1/D-2/D-3 defects + authored E2E scenario bug)
D-1/D-2/D-3 remediation   → FAIL (buyer projection leak discovered in test 5)
Buyer projection remediation → PASS (all gates green)
```

---

## 4. Baseline and Repository State

### 4.1 Confirmed Repository State

| Field | Value |
|-------|-------|
| Branch | `develop` |
| Committed HEAD | `d554fd7425664590bceed757facf9a293389f334` |
| B.6 implementation state | Uncommitted working-tree changes on top of HEAD |
| Implementation baseline | `d554fd7` (documentation-only commit) |
| B.5 baseline | `5c6649dc2334e278c808b44c558b020db7e6db7b` |
| Migrations | 0001–0050 (no new migration in B.6) |

### 4.2 Git Report

```text
git log -5 --oneline:

d554fd7 (HEAD -> develop, origin/develop) docs(production): add SCS B2B API UI parity and feature completeness matrices
5c6649d fix(tests): update OUT_FOR_DELIVERY cancel tests — B.5 now allows cancellation at this status
f6b7b22 fix(api): allow cancellation of OUT_FOR_DELIVERY orders — B.5 requires cancellation wins over RTS
a546522 fix(tests): B.5 postgres spec — fix cancelOrder arg order, LOST direct flow, audit trail event
07ff0f9 fix(tests): B.5 postgres spec — separate SQL parameter types for exception_type/exception_notes
```

### 4.3 Files Changed (17 modified + 15 untracked)

**Modified (production):**

| File | Description |
|------|-------------|
| `apps/api/src/modules/orders/orders.service.ts` | Buyer tracking projection: `BUYER_INTERNAL_EVENT_TYPES` filter + `exceptionStatus`/`exceptionType` surfacing |
| `apps/api/src/modules/shipping/shipment-operations.controller.ts` | D-1 route prefix fix + `GET /v1/shipments` list + `GET /v1/shipments/:id` detail |
| `apps/api/src/modules/shipping/carrier-admin.controller.ts` | D-1 route prefix fix |
| `apps/api/src/modules/shipping/carrier-webhook.controller.ts` | D-1 route prefix fix |
| `apps/api/src/modules/shipping/shipping.controller.ts` | D-1 route prefix fix |
| `apps/web/src/lib/buyer-api.ts` | `buyerDeliveryNote()` + `buyerEventLabel()` defense-in-depth |
| `apps/web/src/app/orders/[id]/page.tsx` | Buyer-safe tracking timeline rendering |
| `apps/admin/src/components/AdminSidebar.tsx` | Ship Operations + Carrier nav entries |
| `apps/web/src/app/merchant/layout.tsx` | Deliveries nav entry |
| `apps/api/infra/drizzle/seed-pg.ts` | D-3 ADMIN perm count 45→46 |

**Modified (test):**

| File | Description |
|------|-------------|
| `apps/api/src/__tests__/integration/phase3-security.e2e.spec.ts` | D-3 ADMIN perm 45→46 |
| `apps/api/src/__tests__/integration/seed-pg.postgres.spec.ts` | D-3 ADMIN perm 45→46 |

**Modified (governance):**

| File | Description |
|------|-------------|
| `docs/production/SCS-B2B-API-UI-PARITY-MATRIX.csv` | Tracking endpoint PARTIAL→ALIGNED |
| `docs/production/SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv` | B.6 feature status updates |
| `docs/production/SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html` | B.6 status reconciliation |
| `pnpm-lock.yaml` | Web test dependency lockfile |
| `apps/web/package.json` | Web test dependencies |

**Untracked (new):**

| Path | Description |
|------|-------------|
| `apps/admin/src/__tests__/shipops.test.tsx` | Admin Ship-Ops component tests (13 tests) |
| `apps/admin/src/app/carrier/` | Admin Carrier & Recovery console |
| `apps/admin/src/app/shipments/` | Admin Ship Operations console + detail |
| `apps/admin/src/lib/shipops.ts` | Admin Ship-Ops API client |
| `apps/api/src/__tests__/integration/m73b6-buyer-projection.postgres.spec.ts` | Buyer projection filter tests (3 tests) |
| `apps/api/src/__tests__/integration/m73b6-shipment-search.postgres.spec.ts` | D-2 search regression tests (8 tests) |
| `apps/e2e/` | Playwright E2E suite (5 tests) |
| `apps/web/src/__tests__/` | Web component + unit tests (17 tests) |
| `apps/web/src/app/merchant/deliveries/` | Merchant deliveries console |
| `apps/web/src/lib/shipops.ts` | Merchant delivery API client |
| `apps/web/vitest.config.ts` | Web vitest configuration |
| `docs/production/SCS-M7.3-B.6-BUYER-PROJECTION-RE-VERIFICATION.md` | Buyer projection remediation report |
| `docs/production/SCS-M7.3-B.6-DRIVER-DECISION.md` | DRIVER decision record |
| `docs/production/SCS-M7.3-B.6-IMPLEMENTATION-REPORT.md` | Implementation report |
| `docs/production/SCS-M7.3-B.6-INDEPENDENT-RUNTIME-VERIFICATION.md` | Initial IRV (BLOCKED) |
| `docs/production/SCS-M7.3-B.6-REMEDIATION-RE-VERIFICATION.md` | D-1/D-2/D-3 remediation report |

---

## 5. Scope

### 5.1 Delivered

**Admin Ship-Ops Console:**
- Shipment list with scopes (all/exceptions/rts/recovery)
- Shipment detail with status timeline
- Exception report + retry
- RTS lifecycle (request/approve/reject/complete + LOST)
- Carrier credential/configuration read visibility
- Recovery visibility + reconcile trigger

**Merchant Delivery Console:**
- Delivery list + detail
- Tracking timeline
- Exception operations (report)
- Retry operations
- RTS request + complete

**Buyer Visibility:**
- Order tracking with buyer-safe delivery status
- Buyer-safe exception/RTS messaging via `buyerDeliveryNote()`
- No internal operational event leakage (server-side filter + frontend defense-in-depth)

**Carrier/Recovery:**
- Read-only visibility (admin)
- Recovery trigger where authorized

**Backend (additive only):**
- `GET /v1/shipments` — list read model (tenant-scoped, filtered, paginated)
- `GET /v1/shipments/:id` — detail read model (shipment + store + order + events + labels)
- Buyer tracking projection hardened (`exceptionStatus`/`exceptionType` surfacing + RTS event filter)

### 5.2 DRIVER Decision

```text
DRIVER remains mobile-only.
No B.6 DRIVER web console.
Web console deferred to future milestone.
```

Documented in `SCS-M7.3-B.6-DRIVER-DECISION.md`.

---

## 6. Architecture Changes

B.6 is a UI/workflow completion milestone. No existing backend contract, FSM, or state machine was altered.

1. **Additive shipment read models** — `GET /v1/shipments` (list) and `GET /v1/shipments/:id` (detail). Both guarded by `fulfillment:shipments:read`, tenant-scoped.
2. **Admin UI surfaces** — Ship Operations (`/shipments`, `/shipments/[id]`), Carrier & Recovery (`/carrier`).
3. **Merchant UI surfaces** — Deliveries (`/merchant/deliveries`, `/merchant/deliveries/[id]`).
4. **Buyer projection** — `buyerDeliveryNote()` for exception/RTS state translation; `buyerEventLabel()` for tracking event labels.
5. **Buyer data boundary** — Server-side `BUYER_INTERNAL_EVENT_TYPES` filter in `getTracking()`; frontend `buyerEventLabel()` defense-in-depth.
6. **Permission changes** — ADMIN granted `fulfillment:shipments:read` (seed-pg.ts). ADMIN perm count 45→46.
7. **No new DRIVER web surface** — DRIVER remains mobile-only (documented decision).
8. **No new migrations** — B.6 uses existing schema only.
9. **No order FSM changes** — Order status machine unchanged.
10. **No inventory changes** — Stock settlement unchanged.

---

## 7. Runtime Verification History

This history is important. Do not erase the earlier failures.

### Phase 1: Initial Independent Runtime Verification

**Verdict: BLOCKED**

All compile-time gates passed (TypeScript, builds, unit suites). However, the release-critical runtime gates (live stack + Playwright) could not be executed — no servers listening, no seeded database, no provisioned auth states.

### Phase 2: D-1/D-2/D-3 Targeted Remediation

**Verdict: FAIL** (partial)

Three proven runtime defects identified and fixed:
- **D-1** — Route prefix mismatch (`/v1/v1/shipments` → `/v1/shipments`). Fixed by removing `v1/` prefix from four shipping controllers.
- **D-2** — UUID ILIKE 500 (`shipments.id ILIKE` → `shipments.id::text ILIKE`). Fixed by casting UUID to text.
- **D-3** — ADMIN perm count 45→46. Fixed in seed-pg.ts + test assertions.

Playwright tests 1-4 passed. Test 5 (buyer) FAILED — buyer projection leak discovered.

### Phase 3: Authored E2E Scenario Correction

The authored E2E test 3 encoded an invalid FSM sequence (retry→RTS). Corrected to valid journey (RTS directly from OPEN with RECIPIENT_REFUSED exception type).

### Phase 4: Buyer Projection Leak Remediation

**Verdict: PASS**

Root cause: `getTracking()` returned ALL `shipment_events` rows including `RTS_*` types. Frontend rendered `ev.eventType.replace(/_/g, ' ')` — raw passthrough.

Fix: Two-layer defense:
1. **Server-side (primary boundary):** `BUYER_INTERNAL_EVENT_TYPES` Set filters RTS events in `getTracking()`.
2. **Frontend (defense-in-depth):** `buyerEventLabel()` returns `null` for RTS_*/unknown events.

All gates passed: Playwright 5/5, API JSON inspection, tenant isolation, D-1/D-2/D-3 non-regression, full regression suite.

---

## 8. Final Verification

| Gate | Result |
|------|--------|
| API `tsc --noEmit` | **PASS** |
| Web `tsc --noEmit` | **PASS** |
| Admin `tsc --noEmit` | **PASS** |
| API `nest build` (277 files) | **PASS** |
| API vitest (88 files, 1634 tests) | **PASS** |
| Web vitest (2 files, 17 tests) | **PASS** |
| Admin vitest (shipops) | **PASS** (13/13) |
| Playwright E2E | **PASS** (5/5) |
| API JSON inspection | **PASS** — no RTS events in buyer response |
| Tenant isolation | **PASS** — cross-buyer access denied (400) |
| D-1 non-regression | **PASS** — `/v1/shipments` responds correctly |
| D-2 non-regression | **PASS** — partial UUID search works |
| D-3 non-regression | **PASS** — ADMIN perm count 46 verified |

### API JSON Evidence

```json
"events": [
  {
    "eventType": "DELIVERY_EXCEPTION",
    "actorType": "ADMIN",
    "createdAt": "2026-10-03T08:17:47.523Z",
    "notes": "RECIPIENT_REFUSED"
  }
]
```

`RTS_REQUESTED`, `RTS_APPROVED`, `RTS_COMPLETED` are NOT present (filtered server-side).

### Tenant Isolation Evidence

```text
Cross-buyer tracking request → 400 "Cannot access tracking for another buyer's order"
```

---

## 9. Regression

```text
API:  88 files / 1634 tests PASS
Web:  2 files / 17 tests PASS
Admin: 2 files / 23 tests (21 pass, 2 pre-existing failures)
```

**Known pre-existing failures:**

```text
Admin management.test.tsx:
  2 failures in product-moderation/shared-product-detail tests
  KNOWN PRE-EXISTING
  NOT B.6 REGRESSIONS
  NOT FIXED DURING B.6
```

The accurate statement: All B.6-specific and required release verification gates pass. Two unrelated pre-existing Admin management test failures remain.

---

## 10. Security / Tenant Isolation

### Verified Authorization Model

**Admin:** Requires `fulfillment:shipments:read` for read access. Mutations require established B.6/B.5 write permissions.

**Merchant:** Server-side organization/store scoping. Merchant cannot access another organization's shipments.

**Buyer:** Receives only buyer-safe tracking data. Server-side filtering = primary boundary. Frontend `buyerEventLabel()` = defense-in-depth.

### Tenant Isolation (Live Evidence)

```text
Unauthenticated → 401
Buyer → 403 on shipment operations
MERCHA → own shipments only
MERCHB → own shipments only
Cross-tenant shipment detail → denied
Cross-buyer order tracking → denied (400)
```

### Buyer Data Boundary

```text
DB shipment_events
        ↓
OrdersService.getTracking()
        ↓
filter BUYER_INTERNAL_EVENT_TYPES (RTS_REQUESTED, RTS_APPROVED, RTS_REJECTED, RTS_COMPLETED)
        ↓
buyer-safe API response
        ↓
buyerEventLabel() (defense-in-depth)
        ↓
buyer UI
```

This is a security/privacy/data-boundary fix, not merely a cosmetic UI fix.

---

## 11. Verified State Consistency

```text
Report exception → backend state changes → UI reload → OPEN displayed
Request RTS     → RTS_PENDING → UI reload
Approve RTS     → RTS_IN_PROGRESS → UI reload
Complete RTS    → RTS_COMPLETED → UI reload
```

No stale optimistic-only state found during runtime verification.

---

## 12. Verified API Contract

B.6 introduced/verified:

```text
GET /v1/shipments        → working (list, tenant-scoped, filtered, paginated)
GET /v1/shipments/:id    → working (detail: shipment + store + order + events + labels)
/v1/v1/shipments         → 404 (D-1 fix confirmed)
```

Shipment list verified: tenant scoping, status filters, exception filters, RTS filters, recovery filters, carrier status filters, search, pagination, limit cap, sorting, event ordering.

Shipment detail verified: shipment, store, order, events, labels, authorization, tenant access.

D-2 search fix: `shipments.id::text ILIKE ...` — partial UUID search no longer produces HTTP 500.

---

## 13. Residuals (Intentionally Deferred)

```text
Carrier credential write CRUD deferred
Carrier configuration write CRUD deferred
Provider catalog UI deferred
DRIVER web console deferred
Native in-app label PDF download remains partial/deferred
Carrier reconciliation worker remains outside B.6 scope
```

These are acknowledged limitations deferred to future milestones. They are not defects.

---

## 14. Scope Compliance

### In Scope — Delivered

| Item | Status |
|------|--------|
| Admin Ship-Ops console | Delivered |
| Admin shipment list/detail/timeline | Delivered |
| Admin exception report/retry | Delivered |
| Admin RTS lifecycle | Delivered |
| Admin carrier/labels visibility | Delivered |
| Admin recovery visibility | Delivered |
| Merchant deliveries console | Delivered |
| Merchant delivery list/detail | Delivered |
| Merchant tracking timeline | Delivered |
| Merchant exception/retry/RTS | Delivered |
| Buyer-safe tracking projection | Delivered |
| Buyer-safe exception/RTS messaging | Delivered |
| No internal event leakage | Delivered |
| DRIVER decision documented | Delivered |

### Out of Scope — Confirmed NOT Delivered

| Item | Status |
|------|--------|
| DRIVER web console | NOT implemented (documented decision) |
| Carrier credential write CRUD | NOT implemented (visibility only) |
| Carrier configuration write CRUD | NOT implemented (visibility only) |
| Provider catalog UI | NOT implemented |
| Native label PDF download | NOT implemented |
| Reconciliation worker | NOT implemented |
| Order FSM changes | NOT implemented |
| Inventory changes | NOT implemented |
| New migrations | NOT created |
| M7.3-C Returns | NOT started |

---

## 15. DRIVER Decision

```text
DRIVER remains mobile-only.
No B.6 DRIVER web console.
Web console deferred to future milestone.
```

The DRIVER role is seeded with focused permissions (`orders:read`, `fulfillment:shipments:read`, `fulfillment:shipments:pickup`, `fulfillment:shipments:deliver`, `fulfillment:proof:read`, `fulfillment:proof:write`). The mobile app (`driver_shipments_screen.dart`) provides the operational surface. No new backend endpoints are required for a future web console — the API already exists.

Full decision record: `SCS-M7.3-B.6-DRIVER-DECISION.md`.

---

## 16. Governance Synchronization

Four living source-of-truth documents reconciled:

| Document | Update |
|----------|--------|
| `SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html` | B.6 status → INDEPENDENTLY VERIFIED / CLOSED |
| `SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv` | B.6 features (F-056, F-059, F-060) → COMPLETE |
| `SCS-B2B-API-UI-PARITY-MATRIX.csv` | Tracking endpoint PARTIAL → ALIGNED; B.6 endpoints ALIGNED |
| `SCS-B2B-FRAMEWORK-ROADMAP.md` | B.6 → CLOSED / PASS |

Synchronized: feature completeness, API/UI parity, roadmap status, release status, residuals, verification evidence.

No unrelated future milestones marked complete. M7.3-C not marked complete or started.

---

## 17. Release Closure Checklist

```text
[x] B.6 implementation exists
[x] D-1 fixed
[x] D-2 fixed
[x] D-3 fixed
[x] Buyer projection leak fixed
[x] API runtime verified
[x] Admin runtime verified
[x] Merchant runtime verified
[x] Buyer runtime verified
[x] Playwright 5/5
[x] Tenant isolation verified
[x] Security verified
[x] State refresh verified
[x] Buyer API JSON verified
[x] TypeScript verified
[x] Builds verified
[x] B.6-specific tests verified
[x] Pre-existing Admin failures documented
[x] Residuals preserved
[x] DRIVER decision preserved
[x] Completeness report synchronized
[x] Feature matrix synchronized
[x] API/UI parity matrix synchronized
[x] Roadmap synchronized
[x] Release closure created
```

---

## 18. Release Decision

All release-critical gates have been independently verified and reconciled:

- Playwright 5/5: PASS
- API JSON buyer projection: PASS
- Tenant isolation: PASS
- Security: PASS
- D-1/D-2/D-3: FIXED
- Buyer projection leak: FIXED
- API: 88 files / 1634 tests PASS
- Web: 17 tests PASS
- Admin B.6 suite: PASS (13/13)
- TypeScript: PASS (all 3 apps)
- Build: PASS (277 files, 0 issues)
- 2 unrelated pre-existing Admin management failures documented

```text
========================================
M7.3-B.6
SHIP-OPS VISIBILITY
===================

IMPLEMENTATION:                  COMPLETE
INDEPENDENT RUNTIME VERIFICATION: PASS
RELEASE CLOSURE:                 CLOSED / PASS
========================================
```

---

## 19. Successor Milestone / Next Action

**M7.3-B.6 is complete.** The milestone sequence:

1. Implementation — COMPLETE
2. Initial Independent Runtime Verification — BLOCKED
3. D-1/D-2/D-3 Targeted Remediation — FAIL (buyer projection leak discovered)
4. Buyer Projection Remediation — PASS
5. Release Closure — CLOSED / PASS

**No production implementation changes were made during release closure.** This document is a governance artifact only.

**The next engineering step is:**

```text
FRESH M7.3-C ARCHITECTURE AUDIT
```

The B.6 release changes the repository baseline, so the previous M7.3-C audit/lock must NOT automatically be reused. A fresh architecture audit must establish that the M7.3-C design remains valid against the actual post-B.6 repository.

```text
B.6 Release Closure
        ↓
Fresh M7.3-C Architecture Audit
        ↓
M7.3-C Business Rules + Architecture Decision Lock
        ↓
M7.3-C Implementation
        ↓
Independent Runtime Verification
        ↓
M7.3-C Release Closure
```

**DO NOT IMPLEMENT M7.3-C YET.**

---

*No code was modified during release closure. This document is a governance artifact only.*
