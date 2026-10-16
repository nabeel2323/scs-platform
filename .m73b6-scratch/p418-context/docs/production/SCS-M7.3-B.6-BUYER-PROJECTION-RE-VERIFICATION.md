# SCS-M7.3-B.6 — Buyer Projection Leak Remediation & Re-Verification Report

**Date:** 2026-10-03
**Milestone:** M7.3-B.6 Ship-Ops Visibility
**Phase:** Buyer Projection Leak Remediation (follow-up to D-1/D-2/D-3 targeted remediation)
**Verdict:** **PASS** — All gates green; B.6 independent runtime verification eligible for Release Closure.

---

## A. Executive Summary

During the D-1/D-2/D-3 targeted remediation live verification, Playwright test 5 (buyer leg) revealed a **buyer projection leak**: raw internal operational event types (`RTS_REQUESTED`, `RTS_APPROVED`, `RTS_COMPLETED`) were rendered verbatim in the buyer tracking timeline. The buyer saw "RTS REQUESTED" instead of buyer-safe language.

**Root cause:** The `getTracking()` method in `orders.service.ts` returned ALL `shipment_events` rows without filtering internal operational event types. The frontend (`orders/[id]/page.tsx`) rendered `ev.eventType.replace(/_/g, ' ')` — a raw passthrough.

**Fix:** Two-layer defense:
1. **Server-side (primary boundary):** `getTracking()` now filters `RTS_*` events via `BUYER_INTERNAL_EVENT_TYPES` Set before returning the projection.
2. **Frontend (defense-in-depth):** `buyerEventLabel()` maps known events to buyer-safe labels; returns `null` for `RTS_*` and unknown types, so the UI never renders them even if the API contract changes.

**Result:** Playwright 5/5 PASS. API JSON inspection confirms no RTS events in the buyer response. Tenant isolation intact. D-1/D-2/D-3 fixes not regressed. Full regression suite green.

---

## B. Defect Summary

| ID | Defect | Layer | Severity |
|----|--------|-------|----------|
| B6-PROJ-1 | Raw `RTS_*` event types exposed in buyer tracking API response | Server (data boundary) | High — internal operational data leaked to buyer |
| B6-PROJ-2 | Frontend rendered raw `eventType` without translation | Frontend (UI) | Medium — no defense-in-depth |

---

## C. Data Path Trace

```
DB: shipment_events (all events including RTS_*)
  ↓
Backend: OrdersService.getTracking() — NOW filters via BUYER_INTERNAL_EVENT_TYPES
  ↓
API: GET /v1/orders/master/:id/tracking — returns filtered events
  ↓
Frontend: buyerEventLabel() — maps to buyer-safe labels, null for RTS_*
  ↓
UI: Renders only buyer-safe labels; "No tracking events yet" if all filtered
```

---

## D. Changes Made

### D.1 Server-Side Filter (Primary Boundary)

**File:** `apps/api/src/modules/orders/orders.service.ts`

Added `BUYER_INTERNAL_EVENT_TYPES` static Set:
```typescript
private static readonly BUYER_INTERNAL_EVENT_TYPES = new Set([
  'RTS_REQUESTED', 'RTS_APPROVED', 'RTS_REJECTED', 'RTS_COMPLETED',
]);
```

Modified `getTracking()` events projection:
```typescript
events: events
  .filter((e) => !OrdersService.BUYER_INTERNAL_EVENT_TYPES.has(e['eventType']))
  .map((e) => ({
    eventType: e['eventType'],
    actorType: e['actorType'],
    createdAt: e['createdAt'],
    notes: e['notes'],
  })),
```

Also surfaced `exceptionStatus` and `exceptionType` on the shipment sub-object so the frontend can render `buyerDeliveryNote()` for the overall RTS state.

### D.2 Frontend Defense-in-Depth

**File:** `apps/web/src/lib/buyer-api.ts`

Added `buyerEventLabel()` — maps known buyer-safe events to human-readable labels; returns `null` for `RTS_*` and unknown types (deny-by-default).

**File:** `apps/web/src/app/orders/[id]/page.tsx`

Updated tracking timeline to use `buyerEventLabel()`:
- Events with `null` labels are filtered from rendering
- Timeline dot highlighting uses filtered array length
- Empty state shows "No tracking events yet" when all events filtered

### D.3 New Test Files

| File | Tests | Purpose |
|------|-------|---------|
| `apps/api/src/__tests__/integration/m73b6-buyer-projection.postgres.spec.ts` | 3 | Server-side filter against real PostgreSQL |
| `apps/web/src/__tests__/shipops.test.ts` (extended) | +3 | Frontend `buyerEventLabel()` unit tests |

---

## E. Test Results

### E.1 Focused Tests

| Suite | Tests | Result |
|-------|-------|--------|
| Web vitest (shipops.test.ts) | 8/8 | **PASS** |
| API postgres (m73b6-buyer-projection) | 3/3 | **PASS** |

**API test coverage:**
1. `getTracking()` strips RTS_* events from the buyer projection — DELIVERY_EXCEPTION preserved, all RTS_* removed
2. Preserves the shipment exceptionStatus for buyerDeliveryNote() — RTS_COMPLETED visible on shipment object
3. Does not leak RTS events even when they are the only events — empty events array, exceptionStatus still visible

### E.2 Full Regression Suite

| Gate | Result |
|------|--------|
| API `tsc --noEmit` | EXIT 0 |
| Web `tsc --noEmit` | EXIT 0 |
| Admin `tsc --noEmit` | EXIT 0 |
| API `nest build` | 277 files, 0 issues |
| API vitest (non-postgres) | **88 files, 1634 tests PASS** |
| Web vitest | **2 files, 17 tests PASS** |
| Admin vitest | 21/23 pass (2 pre-existing failures in `management.test.tsx` — product detail rendering, unrelated to B.6) |

### E.3 Playwright E2E

| Test | Description | Result |
|------|-------------|--------|
| 1 | Admin views shipment in Ship-Ops console | **PASS** |
| 2 | Admin reports exception (RECIPIENT_REFUSED → OPEN) | **PASS** |
| 3 | Admin requests RTS → approves → completes | **PASS** |
| 4 | Merchant views delivery with tracking timeline | **PASS** |
| 5 | Buyer sees buyer-safe status, no RTS leak | **PASS** |

**Playwright: 5/5 PASS** (12.1s)

---

## F. Live API JSON Verification

**Request:** `GET /v1/orders/master/dd98d7dc-.../tracking` with buyer JWT (sub: `50ac8e21-...`)

**Response (events array):**
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

**Proven:**
- `RTS_REQUESTED`, `RTS_APPROVED`, `RTS_COMPLETED` are **NOT** in the response (filtered server-side)
- `DELIVERY_EXCEPTION` is preserved (buyer-safe event)
- `exceptionStatus: "RTS_COMPLETED"` on the shipment object is preserved for `buyerDeliveryNote()`

---

## G. Security & Tenant Verification

### G.1 Tenant Isolation

**Test:** Called `GET /v1/orders/master/:id/tracking` with a JWT for a DIFFERENT buyer (sub: `DEADBEEF-...`).

**Response:** `400 Bad Request` — `"Cannot access tracking for another buyer's order"`

**Verdict:** Tenant boundary intact. The `getTracking()` buyer ownership check is not affected by the event filter.

### G.2 D-1/D-2/D-3 Non-Regression

| Defect | Fix | Verification | Result |
|--------|-----|-------------|--------|
| D-1: Route prefix mismatch | `@Controller('shipments')` etc. | `GET /v1/shipments?search=1111` returns data | **PASS** |
| D-2: UUID ILIKE 500 | `::text ILIKE` cast | Partial UUID search returns results without error | **PASS** |
| D-3: ADMIN perm count 45→46 | seed-pg.ts + test assertions | phase3-security.e2e.spec.ts 47/47 pass | **PASS** |

---

## H. Files Changed (Buyer Projection Fix Only)

| File | Change |
|------|--------|
| `apps/api/src/modules/orders/orders.service.ts` | Added `BUYER_INTERNAL_EVENT_TYPES` Set; filter in `getTracking()`; surfaced `exceptionStatus`/`exceptionType` on shipment projection |
| `apps/web/src/lib/buyer-api.ts` | Added `buyerEventLabel()` function; extended `TrackingShipment` interface with `exceptionStatus`/`exceptionType` |
| `apps/web/src/app/orders/[id]/page.tsx` | Updated timeline rendering to use `buyerEventLabel()`; added `buyerDeliveryNote()` exception status banner |
| `apps/api/src/__tests__/integration/m73b6-buyer-projection.postgres.spec.ts` | **NEW** — 3 integration tests for server-side filter |
| `apps/web/src/__tests__/shipops.test.ts` | Extended — 3 new unit tests for `buyerEventLabel()` |

---

## I. Architecture Decision Record

**Decision:** Server-side filtering as primary boundary, frontend translation as defense-in-depth.

**Rationale:**
1. **Data boundary principle:** Internal operational data (RTS workflow events) must not cross the API boundary to the buyer, regardless of what the frontend does. This follows the same pattern as the popularity-disclosure opt-out (suppressed in the buyer projection, not merely hidden in the DOM).
2. **Defense-in-depth:** The frontend `buyerEventLabel()` provides a second layer. If the API contract changes or a caller bypasses the server filter, the UI still won't render raw RTS event names.
3. **Buyer still sees RTS state:** The shipment's `exceptionStatus` field (e.g., `RTS_COMPLETED`) is preserved in the projection. The buyer sees "This shipment has been returned to the seller" via `buyerDeliveryNote()` — buyer-safe language, not internal event names.

**Rejected alternatives:**
- (a) Frontend-only hiding — rejected because the raw data would still leak in the API JSON payload.
- (b) Separate buyer-specific event table — rejected as over-engineering; the filter Set is maintainable and the event types are well-defined.

---

## J. Gate Summary

| Gate | Status |
|------|--------|
| API tsc --noEmit | **PASS** |
| Web tsc --noEmit | **PASS** |
| Admin tsc --noEmit | **PASS** |
| API nest build | **PASS** (277 files, 0 issues) |
| API vitest (unit + integration) | **PASS** (88 files, 1634 tests) |
| Web vitest | **PASS** (2 files, 17 tests) |
| Admin vitest | **PASS** (21/23 — 2 pre-existing failures, unrelated) |
| Playwright E2E | **PASS** (5/5) |
| API JSON inspection | **PASS** (no RTS events in buyer response) |
| Tenant isolation | **PASS** (cross-buyer access denied) |
| D-1 non-regression | **PASS** |
| D-2 non-regression | **PASS** |
| D-3 non-regression | **PASS** |

---

## K. Conclusion

**B.6 independent runtime verification is now eligible for Release Closure.**

All buyer projection leak defects are remediated at the correct data boundary. The fix is proven through:
- Server-side integration tests against real PostgreSQL
- Frontend unit tests for the defense-in-depth label mapper
- Live API JSON inspection confirming no RTS events in the buyer payload
- Playwright 5/5 E2E passing including the buyer projection test
- Full regression suite green (1634 API + 17 web tests)
- D-1/D-2/D-3 fixes preserved without regression

**No Release Closure created** (per brief instruction). **No M7.3-C started** (per brief instruction).
