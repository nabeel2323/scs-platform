# SCS-M7.3-B.6 — TARGETED REMEDIATION & RE-VERIFICATION REPORT

**Date:** 2026-10-03  
**Phase:** Targeted defect remediation (D-1/D-2/D-3) + live re-verification  
**Verdict:** **FAIL** — D-1/D-2/D-3 eliminated; fourth B.6 defect discovered (buyer projection leak)

---

## A. BASELINE

| Item | Value |
|------|-------|
| Branch | `develop` |
| HEAD | `d554fd7425664590bceed757facf9a293389f334` |
| B.6 working-tree state | Uncommitted changes (see §16 git report) |

---

## B. DEFECT REMEDIATION

### D-1 — Ship-Ops API Path Mismatch

**Root cause:** Shipping controllers hardcoded `v1/` prefix under URI versioning that already supplies `/v1`, resulting in `/v1/v1/shipments`.

**Files changed:**
- `apps/api/src/modules/shipping/shipment-operations.controller.ts` — `@Controller('v1/shipments')` → `@Controller('shipments')`
- `apps/api/src/modules/shipping/carrier-admin.controller.ts` — `@Controller('v1/carrier')` → `@Controller('carrier')`
- `apps/api/src/modules/shipping/carrier-webhook.controller.ts` — `@Controller('v1/webhooks/carrier')` → `@Controller('webhooks/carrier')`
- `apps/api/src/modules/shipping/shipping.controller.ts` — `@Controller('v1/shipping')` → `@Controller('shipping')`

**Remediation:** Removed `v1/` prefix from all four B.6 shipping controllers to align with the repository's established URI versioning convention (`main.ts` `enableVersioning({type:URI, defaultVersion:'1'})`).

**Targeted tests:**
- API boot route-map log confirms `{/shipments}`, `{/carrier}`, `{/webhooks/carrier}`, `{/shipping}` all `(version: 1)` — no `/v1/v1`.
- Live HTTP: `GET /v1/shipments` → 200, `GET /v1/v1/shipments` → 404.
- Live OpenAPI `/docs-json`: `/v1/shipments` present, `/v1/v1/shipments` absent.

**Live evidence:**
- Admin Ship Operations page loads shipment list (no "Cannot GET /v1/shipments" error).
- Playwright test 1 "admin views the shipment in the Ship-Ops console" **PASSED** (2.5s).

---

### D-2 — Shipment Search Returns HTTP 500

**Root cause:** `ilike(shipments.id, term)` applied to a PostgreSQL UUID column. PostgreSQL does not support `ILIKE` (`~~*`) on UUID.

**Files changed:**
- `apps/api/src/modules/shipping/shipment-operations.controller.ts` — search block now uses `sql\`${shipments.id}::text ilike ${term}\`` for the ID column (text cast), preserving `ilike()` for text columns (tracking, carrier-shipment, store name). Escaping preserved.

**Remediation:** Cast `shipments.id` to `text` before `ILIKE` pattern match. Other columns remain text-native.

**Targeted tests:**
- Created `apps/api/src/__tests__/integration/m73b6-shipment-search.postgres.spec.ts` (8 tests, real PostgreSQL via testcontainers):
  - Partial UUID search (8 chars) → 200, expected shipment returned.
  - Full UUID search → 200, exact match.
  - Tracking ID search → 200, correct rows.
  - Carrier shipment ID search → 200.
  - Store name search (case-insensitive) → 200.
  - Escape `%` wildcard → 200, total 0.
  - Tenant scoping (MERCHANT_OWNER sees only own org's shipments).
  - Root-cause guard (bare `id ILIKE` on UUID rejects, `id::text ILIKE` succeeds).
- All 8 tests **PASSED**.

**Live evidence:**
- `GET /v1/shipments?search=11111111` → 200, S1 returned.
- `GET /v1/shipments?search=GULF` → 200, S1 returned.
- `GET /v1/shipments?search=Baraka` → 200, S2 returned.
- `GET /v1/shipments?search=%` → 200, total 0 (escaping works).

---

### D-3 — Admin Permission Count Regression

**Root cause:** B.6 seed grants ADMIN `fulfillment:shipments:read` (ADMIN 45→46), but test assertions still expected 45.

**Files changed:**
- `apps/api/src/__tests__/integration/seed-pg.postgres.spec.ts` — `.toBe(45)` → `.toBe(46)` (line 144).
- `apps/api/src/__tests__/integration/phase3-security.e2e.spec.ts` — `ADMIN: 45` → `ADMIN: 46` in `EXPECTED_PERM_COUNTS` map (line 71).

**Remediation:** Updated both ADMIN permission-count assertions to 46. Verified other role counts unchanged (SUPER_ADMIN=69, MODERATOR=21, MERCHANT_OWNER=31).

**Targeted tests:**
- `seed-pg.postgres.spec.ts` (5 tests) — **PASSED**.
- `phase3-security.e2e.spec.ts` (47 tests) — **PASSED**.
- Total D-3 regression: 52 tests **PASSED**.

**Live evidence:**
- Minted ADMIN session: `perms=46`, `shipRead=True`.

---

## C. RUNTIME VERIFICATION

### Stack provisioning
- PostgreSQL :25433 (scs-postgres, seeded)
- Redis :6379, MinIO :9000, MailHog :1025/:8025
- API :3000 (PID 27516, `node dist/main`)
- Web :3100 (PID 24996, `pnpm dev`)
- Admin :3200 (PID 20392, `pnpm dev`)
- Real mock-OTP authentication (no bypass)
- Shipment fixtures: S1 (11111111, Gulf Tech, org 55c93c39=MERCHA), S2 (22222222, Al-Baraka, org dfecf4c6=MERCHB)

### API HTTP checks
- `GET /v1/shipments` → 200 (total=2)
- `GET /v1/v1/shipments` → 404 (D-1 fixed)
- `GET /v1/shipments/:id` → 200
- Search: partial UUID, tracking, store → all 200 with correct rows (D-2 fixed)
- OpenAPI `/docs-json`: `/v1/shipments` present, `/v1/v1` absent

### Tenant isolation
- Unauthenticated → 401
- Buyer → 403 (no `fulfillment:shipments:read`)
- MERCHA (org 55c93c39) → sees only S1
- MERCHB (org dfecf4c6) → sees only S2
- Cross-tenant detail (MERCHA accessing S2) → 400 (existing contract preserved)

### Security
- Authorization guards intact (ADMIN/MERCHANT_OWNER/MERCHANT_STAFF with `fulfillment:shipments:read/write`)
- Tenant scoping enforced at query level

### Admin browser
- Login → Ship Operations → All Shipments → list loads (no "Cannot GET" error)
- Search for "Gulf Tech" → isolates S1
- Shipment detail opens → Exceptions & RTS tab → Report exception (RECIPIENT_REFUSED) → OPEN state displayed
- Request RTS → "awaiting decision" → Approve RTS → "return in transit to sender" → Complete RTS → "RTS completed. No further action required."
- **Playwright tests 1-3 PASSED** (admin list, exception, RTS lifecycle)

### Merchant browser
- Login → Merchant Deliveries → list loads (Gulf Tech Electronics row visible)
- Click delivery link → detail loads → Overview heading visible → Tracking timeline visible
- **Playwright test 4 PASSED**

### Buyer browser
- Login → Order `/orders/aa765fd2-d8c8-45e1-8454-be3f0e15c40b` → order detail loads
- Buyer-safe note "This shipment has been returned to the seller." displayed (RTS_COMPLETED translation works)
- **DEFECT:** Event timeline shows raw internal RTS event types ("RTS_REQUESTED", "RTS_APPROVED", "RTS_COMPLETED") — these match the test's `/RTS_|carrier|reconcil/i` regex and violate §12 buyer projection requirements
- **Playwright test 5 FAILED** — buyer projection leak

### Playwright
- Suite: `apps/e2e/tests/ship-ops-flow.spec.ts` (5 tests, serial, `E2E_SHIPOPS=1`)
- Result: **4 passed, 1 failed** (28.0s)
- Tests executed (not skipped)
- Test 5 failure: buyer projection leaks internal RTS event type names

### State/refresh
- Admin mutation (Report exception) → backend state change (exception_status=OPEN) → UI reload → "OPEN" displayed
- Admin mutation (Request RTS) → backend state change (RTS_PENDING) → UI reload → "awaiting decision" displayed
- Admin mutation (Approve RTS) → backend state change (RTS_IN_PROGRESS) → UI reload → "return in transit to sender" displayed
- Admin mutation (Complete RTS) → backend state change (RTS_COMPLETED) → UI reload → "RTS completed" displayed
- No stale optimistic-only state observed

---

## D. REGRESSION

### API
- `tsc --noEmit` → exit 0
- `vitest run src/__tests__/unit` → 75 files, **1288 tests passed**
- D-2 regression spec (`m73b6-shipment-search.postgres.spec.ts`) → **8 tests passed**
- D-3 regression specs (`seed-pg.postgres.spec.ts` + `phase3-security.e2e.spec.ts`) → **52 tests passed**

### Admin
- `tsc --noEmit` → exit 0
- `vitest run` → 2 files: 1 passed (`shipops.test.tsx`, 21 tests), 1 failed (`management.test.tsx`, 2 failures)
- **Pre-existing failure:** `management.test.tsx` product-moderation tests (2 failures) — unrelated to D-1/D-2/D-3, no `apps/admin` source touched in this phase

### Web
- `tsc --noEmit` → exit 0
- `vitest run` → **14 tests passed**

### TypeScript
- API, Admin, Web all `tsc --noEmit` exit 0

### Builds
- `nest build` → 276 files, 0 issues

### Known pre-existing failures
- Admin `management.test.tsx` (2 product-moderation test failures) — unrelated to B.6

### Environment-only failures
- `bcrypt` module corrupt on first API boot — repaired via `pnpm install --force --frozen-lockfile` (environment artifact, not B.6 defect)

---

## E. GOVERNANCE SYNCHRONIZATION

**Not updated.** The living governance documents (`SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html`, `SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv`, `SCS-B2B-API-UI-PARITY-MATRIX.csv`, `SCS-B2B-FRAMEWORK-ROADMAP.md`) were NOT updated because runtime verification did not genuinely pass all required gates (buyer projection leak remains). Per §15: "If runtime verification genuinely passes all required gates, update the living documents to reflect the verified state... Never update them aspirationally."

---

## F. VERDICT

### **FAIL**

**Reason:** A real B.6 defect remains.

**Remaining defect:**
- **Buyer projection leak:** The buyer order detail page (`apps/web/src/app/orders/[id]/page.tsx` line 580) displays raw internal RTS event types ("RTS_REQUESTED", "RTS_APPROVED", "RTS_COMPLETED") in the tracking timeline. These are internal admin/carrier metadata that §12 requires to be filtered or translated into buyer-safe language. The `buyerDeliveryNote()` function correctly translates exception states, but the event timeline shows raw `eventType` values. This violates the buyer projection requirement: "Verify that buyer responses do not expose: carrierCreateStatus, recoveryStatus, reconciliation metadata, internal carrier failure information."

**D-1/D-2/D-3 status:** All three proven defects have been eliminated and live-proven.

**Playwright suite:** 4/5 tests pass. Test 5 correctly exposes the buyer projection leak.

**Scope note:** This buyer projection defect is outside the scope of D-1/D-2/D-3 (the three independently proven runtime defects assigned for remediation in this phase). Per §5/§19, this phase fixes only D-1/D-2/D-3. The buyer projection leak should be addressed in a separate remediation phase.

---

## §16. GIT REPORT

```text
Branch: develop
HEAD: d554fd7425664590bceed757facf9a293389f334

Modified files (tracked):
  apps/admin/src/components/AdminSidebar.tsx
  apps/api/infra/drizzle/seed-pg.ts
  apps/api/src/__tests__/integration/phase3-security.e2e.spec.ts
  apps/api/src/__tests__/integration/seed-pg.postgres.spec.ts
  apps/api/src/modules/orders/orders.service.ts
  apps/api/src/modules/shipping/carrier-admin.controller.ts
  apps/api/src/modules/shipping/carrier-webhook.controller.ts
  apps/api/src/modules/shipping/shipment-operations.controller.ts
  apps/api/src/modules/shipping/shipping.controller.ts
  apps/web/package.json
  apps/web/src/app/merchant/layout.tsx
  apps/web/src/app/orders/[id]/page.tsx
  apps/web/src/lib/buyer-api.ts
  docs/production/SCS-B2B-API-UI-PARITY-MATRIX.csv
  docs/production/SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv
  docs/production/SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html
  pnpm-lock.yaml

Untracked files:
  apps/admin/src/__tests__/shipops.test.tsx
  apps/admin/src/app/carrier/
  apps/admin/src/app/shipments/
  apps/admin/src/lib/shipops.ts
  apps/api/src/__tests__/integration/m73b6-shipment-search.postgres.spec.ts
  apps/e2e/
  apps/web/src/__tests__/
  apps/web/src/app/merchant/deliveries/
  apps/web/src/lib/shipops.ts
  apps/web/vitest.config.ts
  docs/production/SCS-M7.3-B.6-DRIVER-DECISION.md
  docs/production/SCS-M7.3-B.6-IMPLEMENTATION-REPORT.md
  docs/production/SCS-M7.3-B.6-INDEPENDENT-RUNTIME-VERIFICATION.md

Diff stat: 17 files changed, 459 insertions(+), 137 deletions(-)

Recent commits:
  d554fd7 (HEAD -> develop) docs(production): add SCS B2B API UI parity and feature completeness matrices
  5c6649d fix(tests): update OUT_FOR_DELIVERY cancel tests — B.5 now allows cancellation at this status
  f6b7b22 fix(api): allow cancellation of OUT_FOR_DELIVERY orders — B.5 requires cancellation wins over RTS
  a546522 fix(tests): B.5 postgres spec — fix cancelOrder arg order, LOST direct flow, audit trail event
  07ff0f9 fix(tests): B.5 postgres spec — separate SQL parameter types for exception_type/exception_notes
```

No release commit created. Working tree preserved per §16.

---

## §18. HARD STOP

**FAIL:** A real B.6 defect remains (buyer projection leak: internal RTS event types shown to buyer).

**Do NOT create Release Closure.**  
**Do NOT start M7.3-C.**

**Next phase:** Address the buyer projection leak in a separate remediation phase, then re-run live verification.

---

**Report produced:** 2026-10-03  
**Remediation agent:** Targeted defect remediation (D-1/D-2/D-3)  
**Verification method:** Actual live execution (API, Web, Admin, Playwright)
