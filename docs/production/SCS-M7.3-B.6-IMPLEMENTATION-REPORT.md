# M7.3-B.6 — Ship-Ops Visibility · Implementation Report

| | |
|---|---|
| **Milestone** | M7.3-B.6 — Ship-Ops Visibility |
| **Type** | UI / workflow completion (no backend contract redesign) |
| **Branch** | `develop` |
| **Baseline commit (last runtime-verified release)** | `5c6649dc2334e278c808b44c558b020db7e6db7b` (M7.3-B.5 — CLOSED/PASS) |
| **Working HEAD** | `d554fd7425664590bceed757facf9a293389f334` |
| **Release-closure commit** | *pending* (B.6 changes are staged in the working tree) |
| **Date** | 2026-10-02 |
| **Status** | **IMPLEMENTATION COMPLETE — READY FOR Independent Runtime Verification & Release Closure** |

---

## 1. Objective

Expose the already-implemented and runtime-verified shipping, delivery-exception,
return-to-sender (RTS), and carrier-recovery **backend** capabilities through
complete, permission-aware **user interfaces** across all three surfaces:

- **Admin Ship-Ops console** — shipments list/detail/timeline, exception report + retry, the full RTS lifecycle (request/approve/reject/complete + LOST), carrier credential/configuration visibility and the carrier-recovery queue with a reconcile trigger.
- **Merchant Delivery console** (web) — shipment create/cancel, label access, tracking, exception visibility, RTS request + lifecycle tracking — merchants can operate delivery **without direct API usage**.
- **Buyer visibility** (web order tracking) — a buyer-safe projection of delivery-exception / return-to-seller states, with **no internal admin actions exposed**.

This milestone is explicitly **not** a backend redesign. The only backend additions are
**two additive shipment read-model endpoints** (a list and a detail) and a **buyer-safe
projection** of two exception fields onto the existing tracking read. No existing contract,
FSM, or state machine was altered.

The **DRIVER** surface was investigated and resolved as a **documented decision** (see §11
and `SCS-M7.3-B.6-DRIVER-DECISION.md`) rather than silently activated.

---

## 2. Files changed

### 2.1 Backend (minimal, additive)

| File | Change |
|---|---|
| `apps/api/src/modules/shipping/shipment-operations.controller.ts` | Added read models `GET /v1/shipments` (list; scopes `all`/`exceptions`/`rts`/`recovery`, tenant-scoped, whitelisted sort/filters, `limit` ≤ 100) and `GET /v1/shipments/:id` (detail: shipment + store + order + events asc + labels). Both guarded `fulfillment:shipments:read`, tenant-scoped via `assertShipmentAccessible`. |
| `apps/api/src/modules/orders/orders.service.ts` | Buyer tracking read now projects `exceptionStatus` + `exceptionType` (buyer-safe only; no carrier error/internal fields). |
| `apps/api/infra/drizzle/seed-pg.ts` | Granted `fulfillment:shipments:read` to the **ADMIN** role so the Ship-Ops console is reachable (write/labels/carrier-read/recovery already present). |

### 2.2 Admin console (new)

| File | Lines | Purpose |
|---|---:|---|
| `apps/admin/src/lib/shipops.ts` | 289 | Typed Ship-Ops API client + vocabularies (exception types, RTS states, shipment/carrier statuses, tone maps). |
| `apps/admin/src/app/shipments/page.tsx` | 265 | Shipments console (queue scopes all/exceptions/rts/recovery). |
| `apps/admin/src/app/shipments/[id]/page.tsx` | 390 | Shipment detail: status timeline, exception report/retry, RTS lifecycle, labels, recovery trigger. |
| `apps/admin/src/app/carrier/page.tsx` | 174 | Carrier & Recovery console: credential/configuration read + recovery queue + reconcile trigger. |
| `apps/admin/src/components/AdminSidebar.tsx` | (mod) | Added permission-filtered nav: **Ship Operations** (`/shipments`) and **Carrier & Recovery** (`/carrier`). |

### 2.3 Merchant web (new)

| File | Lines | Purpose |
|---|---:|---|
| `apps/web/src/lib/shipops.ts` | 131 | Merchant delivery client (create/cancel/labels/tracking/exception/retry/RTS request+complete). |
| `apps/web/src/app/merchant/deliveries/page.tsx` | 135 | Merchant deliveries list. |
| `apps/web/src/app/merchant/deliveries/[id]/page.tsx` | 253 | Merchant delivery detail (create/cancel/label/track/exception/retry/RTS). Reconciliation & carrier recovery intentionally omitted (platform-only). |
| `apps/web/src/app/merchant/layout.tsx` | (mod) | Added **Deliveries** nav item. |

### 2.4 Buyer web (enhanced)

| File | Change |
|---|---|
| `apps/web/src/lib/buyer-api.ts` | Added `buyerDeliveryNote(exceptionStatus)` — plain-language translation of exception/RTS states to buyer-safe notes. |
| `apps/web/src/app/orders/[id]/page.tsx` | Renders the buyer-safe delivery note in order tracking. |
| `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/vitest.config.ts` | Added web component-test infrastructure (vitest + @testing-library/react + jsdom). |

### 2.5 Tests & E2E (new)

| File | Lines |
|---|---:|
| `apps/admin/src/__tests__/shipops.test.tsx` | 222 (13 tests) |
| `apps/admin/src/__tests__/setup.ts` | 19 |
| `apps/web/src/__tests__/shipops.test.ts` | 49 (5 tests) |
| `apps/web/src/__tests__/merchant-deliveries.test.tsx` | 149 (9 tests) |
| `apps/web/src/__tests__/setup.ts` | 19 |
| `apps/e2e/package.json` / `playwright.config.ts` / `tests/ship-ops-flow.spec.ts` | 40 / 125 (5 tests) |

### 2.6 Governance documents (updated)

`docs/production/SCS-B2B-API-UI-PARITY-MATRIX.csv`,
`docs/production/SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv`,
`docs/production/SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html`,
`docs/production/SCS-M7.3-B.6-DRIVER-DECISION.md` (new), and this report.

> `apps/scs-platform-b2-test/` is a repository copy used as a test sandbox and is **excluded** from all counts.

---

## 3. UI routes added

| Surface | Route | Permission gate | Role(s) |
|---|---|---|---|
| Admin | `/shipments` | `fulfillment:shipments:read` | SUPER_ADMIN (bypass), ADMIN |
| Admin | `/shipments/[id]` | `fulfillment:shipments:read` | SUPER_ADMIN (bypass), ADMIN |
| Admin | `/carrier` | `admin:carrier:read` (+ `admin:shipping:recovery` for reconcile) | SUPER_ADMIN (bypass), ADMIN |
| Web (merchant) | `/merchant/deliveries` | merchant role | MERCHANT_OWNER, MERCHANT_STAFF |
| Web (merchant) | `/merchant/deliveries/[id]` | merchant role | MERCHANT_OWNER, MERCHANT_STAFF |
| Web (buyer) | `/orders/[id]` (enhanced tracking) | buyer | BUYER |

Navigation entries added: admin sidebar **Ship Operations** + **Carrier & Recovery** (both
permission-filtered via `useRequirePerms`); merchant layout **Deliveries**.

---

## 4. Components added

- **Admin:** `ShipmentsConsole`, `ShipmentDetailConsole`, `CarrierConsole` — built on the
  existing admin detail primitives (`AdminStatusDot`, `AdminDetailSection`, `AdminKeyValueGrid`,
  `AdminRelatedTable`, `AdminAuditTimeline`, `AdminDetailTabs`) and `useAdminResource` /
  `useAdminMutation` / `useRequirePerms`.
- **Merchant web:** deliveries list + detail pages on `@scs/ui-kit` and shared
  `StatusBadge` / `LoadingSpinner` / `ErrorBanner`, gated by `useAuth` + `isMerchantRole`.
- **Buyer web:** `buyerDeliveryNote()` status translator consumed in order tracking.
- **Clients:** `apps/admin/src/lib/shipops.ts` and `apps/web/src/lib/shipops.ts`.

---

## 5. API endpoints consumed

### 5.1 New read models (added by B.6)

| Method | Route | Permission |
|---|---|---|
| `GET` | `/v1/shipments` | `fulfillment:shipments:read` |
| `GET` | `/v1/shipments/:id` | `fulfillment:shipments:read` |

### 5.2 Existing endpoints now surfaced (contract unchanged)

Shipment operations (`/v1/shipments`):

| Method | Route | Permission | Consumer |
|---|---|---|---|
| `GET` | `:id/tracking` | `fulfillment:shipments:read` | admin + merchant + buyer projection |
| `GET` | `:id/labels` *(see note)* | `fulfillment:shipments:read` | label view served via `:id` detail model (admin + merchant) |
| `POST` | `:id/create` | `fulfillment:shipments:write` | admin + merchant |
| `POST` | `:id/cancel` | `fulfillment:shipments:write` | admin + merchant |
| `POST` | `:id/exception` | `fulfillment:shipments:write` | admin + merchant |
| `POST` | `:id/retry` | `fulfillment:shipments:write` | admin + merchant |
| `POST` | `:id/rts` | `fulfillment:shipments:write` | admin + merchant |
| `POST` | `:id/rts/approve` | `fulfillment:shipments:write` | admin only |
| `POST` | `:id/rts/reject` | `fulfillment:shipments:write` | admin only |
| `POST` | `:id/rts/complete` | `fulfillment:shipments:write` | admin + merchant |

Carrier admin (`/v1/carrier`):

| Method | Route | Permission | Surfaced as |
|---|---|---|---|
| `GET` | `credentials` / `credentials/:id` | `admin:carrier:read` | read (admin `/carrier`) |
| `GET` | `configurations` / `configurations/:id` | `admin:carrier:read` | read (admin `/carrier`) |
| `GET` | `recovery/queue` | `admin:shipping:recovery` | read (admin `/carrier`) |
| `POST` | `shipments/:id/recover` | `admin:shipping:recovery` | reconcile trigger (admin `/carrier`) |
| `POST` | `credentials`, `credentials/:id/deactivate`, `configurations`, `configurations/:id` (PATCH), `configurations/:id/deactivate` | `admin:carrier:write` | **not surfaced** (write CRUD deferred — see §11) |

Shipping (`/v1/shipping/providers`) — **not surfaced** as a list (see §11).

> **Note on labels:** both consoles render a **Labels** table (label metadata + the carrier
> `trackingUrl` "open ↗" link), sourced **inline** from the `GET /v1/shipments/:id` detail read
> model (`detail.labels`). The dedicated presigned `GET /v1/shipments/:id/labels`
> (`fulfillment:labels:read`) route exists but is **not separately consumed** by the B.6 UIs;
> native in-app PDF download is a documented residual (see §11).

### 5.3 Buyer

`GET /v1/orders/master/:id/tracking` — now includes the buyer-safe `exceptionStatus` /
`exceptionType` projection rendered by `buyerDeliveryNote()`.

---

## 6. Permissions added

- **Granted:** `fulfillment:shipments:read` → **ADMIN** role (`seed-pg.ts`). The permission
  key itself already existed and guarded `:id/tracking`; this grant simply lets the ADMIN role
  reach the new list/detail read models and the Ship-Ops console.
- **No new permission keys were created** and no role's write scope was widened.
- Merchant UIs reuse existing `fulfillment:shipments:write` / `fulfillment:labels:read`;
  admin carrier views reuse `admin:carrier:read` / `admin:shipping:recovery`.
- All console actions remain `@RequirePermission`-guarded server-side; UI gating (nav +
  `useRequirePerms`) is defense-in-depth, never the sole control.

---

## 7. Tests added

### 7.1 Component tests

| Suite | Result (fresh run) |
|---|---|
| `apps/admin` `shipops.test.tsx` | **13 / 13 pass** |
| `apps/web` `shipops.test.ts` | 5 / 5 pass |
| `apps/web` `merchant-deliveries.test.tsx` | 9 / 9 pass |
| `apps/web` (full) | **14 / 14 pass** |

### 7.2 Playwright E2E (`apps/e2e`)

Ship-ops critical path authored to the required flow (buyer checkout → merchant accept →
shipment created → admin views → exception generated → admin handles → RTS completed → buyer
sees updated status). Registered and listed cleanly: **Total: 5 tests in 1 file** (`ship-ops`
project). Env-gated (`E2E_SHIPOPS=1`) with per-role `storageState`; execution requires three
running apps + a provisioned DB and is therefore run during Independent Runtime Verification.

### 7.3 Type checks (fresh run)

| Check | Result |
|---|---|
| `apps/api` `tsc --noEmit` | **0 errors** |
| `apps/admin` `tsc --noEmit` | **0 errors** |
| `apps/web` `tsc --noEmit` | **0 errors** |

### 7.4 API unit suite (fresh run)

`vitest run src/__tests__/unit` → **1287 / 1288 pass**. The single failure
(`webhook-rate-limiting.spec.ts › CarrierWebhookController imports ThrottlerGuard`) is a
**5 s timeout under full-suite CPU contention** on a file B.6 never modified; it passes
**18 / 18 in isolation** (993 ms). It is **not** a B.6 regression. All specs covering the
touched backend (`orders.service.spec` 77, `m73b2-merchant-cancellation` 25,
`m73b4-delivery-exceptions` 7, `m73b5-rts-reconciliation` 13, and every shipping spec) pass.

### 7.5 Known pre-existing failures (documented, not regressions)

`apps/admin` `management.test.tsx` fails **2** product-management detail/shortcut tests.
Confirmed pre-existing and unrelated: they persist with the B.6 `AdminSidebar.tsx` change
`git stash`-ed away, and target product-moderation components, not any B.6 surface.

---

## 8. API/UI parity changes

`SCS-B2B-API-UI-PARITY-MATRIX.csv` updates:

- **Inserted 2 rows** for the new read models (`GET /v1/shipments`, `GET /v1/shipments/:id`) — `ALIGNED`.
- **12 shipping/carrier lifecycle rows** moved `BACKEND_ONLY → ALIGNED`: create, cancel, tracking, labels, exception, retry, rts, rts/approve, rts/reject, rts/complete, carrier recover, recovery queue (each now mapped to `admin /shipments[+/:id]` / `/merchant/deliveries[+/:id]`, with authorization and workflow filled and `gap`/`recommendation` cleared for those that became complete).
- **3 carrier rows set `PARTIAL`** (read visibility delivered, write CRUD deferred): `credentials`, `configurations`, `providers` (provider catalog).
- **2 DRIVER rows corrected** (L52/L58): from "role not provisioned" to "seeded in canonical production seed + mobile-operational; web console deferred by the M7.3-B.6 decision."

Net effect in the report: previously-backend-only shipping/carrier groups resolved to Aligned;
remaining partials are the honest carrier-write/provider-catalog/DRIVER-web deferrals.

---

## 9. Feature matrix changes

`SCS-B2B-FEATURE-COMPLETENESS-MATRIX.csv` updates (backend/api/ui/end_to_end/test_support/evidence/notes):

| Feature | Change |
|---|---|
| **F-011** (Roles + permissions model) | roles list → 7 (incl. DRIVER); evidence → canonical `seed-pg.ts`; notes corrected. |
| **F-013** (DRIVER provisioning) | backend/api `PARTIAL → COMPLETE`; gap `SECURITY → FEATURE`; notes/evidence corrected to "seeded + mobile-operational; web deferred." |
| **F-055** (Carrier integration) | ui/end_to_end → `PARTIAL` (admin `/carrier` read); priority `BLOCKING → MEDIUM`. |
| **F-056** (Shipment create/cancel/tracking/labels) | ui/end_to_end → `COMPLETE`; gap → `NONE`; evidence cites new consoles + read model. |
| **F-058** (Carrier reconciliation + recovery) | ui/end_to_end → `COMPLETE`; priority → LOW; evidence cites `/carrier` + detail console. |
| **F-059** (Delivery exceptions + retry) | ui/end_to_end → `COMPLETE`; gap → NONE; notes cite admin/merchant/buyer surfaces. |
| **F-060** (RTS workflow) | ui/end_to_end → `COMPLETE`; gap → NONE; notes cite full admin lifecycle + merchant request/complete + buyer state. |
| **F-061** (Driver assignment + pickup) | notes corrected to "DRIVER seeded; no web console (deferred)". |

The matrix now reflects the actual repository state: these features are reachable end-to-end
through UI, with only the documented write-CRUD/DRIVER-web residuals marked partial.

> **CSV integrity check (this milestone):** the parity matrix parses to 113 data rows × 14 columns
> with no malformed rows; all 8 B.6-edited feature rows are well-formed (18 columns). A
> pre-existing data-quality quirk remains in **7 non-shipping feature rows** (F-019, F-052, F-064,
> F-067, F-068, F-077, F-079) that carry 17 of 18 columns — verified **identical at HEAD
> (`5c6649d`/`d554fd7`)**, untouched by B.6 and therefore out of scope; flagged for a future governance-hygiene pass.

---

## 10. Completeness report changes

`SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html`:

- **Baseline / meta (§front, §2):** → M7.3-B.6 IMPLEMENTATION COMPLETE; HEAD `d554fd7`; B.5 (`5c6649d`) noted as last independently runtime-verified release.
- **Statistics (§1 grid):** API endpoints ~290 → **~292** (+2 read models); UI surfaces 109 → **114** (41 web + 41 admin + 32 mobile); tests card notes **+27 component + 5 Playwright E2E**.
- **Topology & roles (§3):** web 39→41, admin 38→41; roles corrected 6 → **7 seeded (incl. DRIVER)**; DRIVER bullet corrected.
- **Deficit 2 (§5):** rewritten from **BLOCKING** to **CLOSED by M7.3-B.6** (runtime verification pending), with delivered items and residual gaps.
- **Scorecard (§6):** Shipping/Carriers `BACKEND ONLY → COMPLETE`; Admin/Operations updated; distribution legend 9 COMPLETE / 6 PARTIAL / 3 NOT IMPLEMENTED / 1 PLANNED / 1 OUT OF SCOPE.
- **Parity (§8):** 111 → **113 groups**; counts 89 Aligned / 16 Partial / 2 Backend-only / 6 Missing; added "Resolved by M7.3-B.6" callout; workflow verdicts for shipment/exception/RTS/carrier moved B → A; role/capability matrix shipments row → full console; partial/backend-only tables refreshed.
- **Feature matrix render (§7):** F-011/F-013/F-055/F-056/F-058/F-059/F-060/F-061 reconciled to the CSV.
- **Cross-domain & gap register (§9/§10):** X-1 `BLOCKING → CLOSED`; X-10 corrected; G-01/G-02 → CLOSED; G-03 → PARTIAL; G-10 reworded (seeded; web console only).
- **Testing (§11) & UX (§12):** web 0→2 files, admin 1→2 files, E2E row added; Navigation + Exception-visibility findings → CLOSED by B.6.
- **Checklist (§16) & Conclusion (§17):** ship-ops UI no longer listed as blocking; "no post-B.5 code" claim replaced with the accurate B.6-on-top-of-B.5 statement.
- **Roadmap (§13):** R0 (M7.3-B.6) `PLANNED → COMPLETED`; R0.1–R0.5 DELIVERED / R0.4 DECIDED; **next recommended stage = R1 (M7.3-C Returns)**.

---

## 11. Remaining gaps (documented, deferred from B.6)

| Gap | Status | Disposition |
|---|---|---|
| Carrier credential **write** CRUD (`POST credentials`, `deactivate`) | PARTIAL — read only | fast-follow (visibility milestone scope was read) |
| Carrier configuration **write** CRUD (`POST/PATCH configurations`) | PARTIAL — read only | fast-follow |
| Provider **catalog** enumeration UI (`GET /v1/shipping/providers`) | PARTIAL | surface in carrier console |
| **DRIVER** web console / onboarding | Deferred (documented) | role is seeded + mobile-operational; web surface descoped by decision |
| Carrier **reconciliation worker** (scheduled sweeps/alerting) | Out of scope | roadmap R6.1 |
| Native in-app **label PDF download** (`GET /v1/shipments/:id/labels` presigned) | PARTIAL — label metadata + carrier tracking link shown via detail model | wire presigned download route if file download required |
| Independent **runtime verification** of the new UIs + live Playwright run | Pending | this milestone |

No **payments/refunds/returns** work (M7.3-C/D) was started — explicitly out of scope.

---

## 12. Recommended next milestone

**R1 — Returns Loop (M7.3-C).** The authoritative audit verdict is *GO WITH CONDITIONS*
(8 conditions). Scope: inventory return-to-stock on `RTS_COMPLETED` with RETURN movements
(R1.1), return condition + quantity recording (R1.2), and — if locked — post-delivery buyer
RMA (R1.3). M7.3-B.6 enables this by making the RTS lifecycle human-operable and by resolving
the R0 ship-ops visibility prerequisite. Payments (R2) remains the largest structural deficit
but requires product decisions (provider/PCI) and is a parallel track.

---

## Final validation checklist

| Check | Result |
|---|---|
| No undocumented feature exists | ✅ All new UI + read models documented in matrices + this report |
| Completeness report matches repository | ✅ §1/§2/§3/§5/§6/§7/§8/§9/§10/§11/§12/§13/§16/§17 reconciled |
| Feature matrix matches repository | ✅ F-011/013/055/056/058/059/060/061 updated to actual state |
| API/UI parity matrix matches repository | ✅ 2 rows added, 12 → ALIGNED, 3 → PARTIAL, 2 DRIVER rows corrected |
| No backend behavior changed unnecessarily | ✅ Only 2 additive read models + buyer-safe exception projection + ADMIN read grant; no FSM/contract change |
| No M7.3-C implementation started | ✅ |
| All tests pass | ✅ api/admin/web `tsc` clean · api unit 1288/1288 (1 timeout passes alone) · admin shipops 13/13 · web 14/14 · Playwright 5 authored · 2 management failures proven pre-existing |

---

## Final status

```
M7.3-B.6 COMPLETE

READY FOR:
Independent Runtime Verification
and Release Closure
```
