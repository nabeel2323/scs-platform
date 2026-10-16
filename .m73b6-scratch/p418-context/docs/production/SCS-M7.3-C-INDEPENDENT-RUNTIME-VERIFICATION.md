# SCS-M7.3-C — INDEPENDENT RUNTIME VERIFICATION

- **Gate:** M7.3-C Independent Runtime Verification (full re-run after CI-05 remediation)
- **Verification date/time:** 2026-10-03, execution window ≈ 20:30–23:59 (local)
- **Branch:** `develop`
- **Commit / authoritative baseline:** `229949f934f6bfe447d4bce600a84fcbfe4dc365` (HEAD == baseline, confirmed)
- **CURRENT VERIFICATION VERDICT:** **BLOCKED**

---

## 0. Verification status across the gate chain (history preserved — nothing erased)

```text
PREVIOUS VERIFICATION            (this document, 2026-10-03 earlier run)
    BLOCKED
    CI-05 concurrency over-release — concurrent DISTINCT POST /v1/shipments/:id/return
    requests each passed the cumulative cap against a pre-lock ledger snapshot and
    collectively RELEASEd more units than were ever RESERVED (released 12 and 21 vs
    reserve 10). Recorded in Part I below; UI/Playwright/regression categories were
    NOT RUN in that pass.

REMEDIATION                      (docs/production/SCS-M7.3-C-CONCURRENCY-REMEDIATION-REPORT.md)
    FIXED
    lock → recompute → cap → write. The volatile cumulative cap is now re-evaluated
    from a FRESH ledger view taken AFTER the inventory-row FOR UPDATE locks and
    BEFORE the write. Over-release re-probed during remediation: no longer reproducible.

CURRENT VERIFICATION             (this document, fresh full re-run)
    BLOCKED
    All API/inventory/concurrency/authorization/event/buyer-projection scenarios PASS
    (32/32 live-HTTP checks + 91 real-PostgreSQL regression tests). The UI acceptance
    category cannot pass as authored: delivered Playwright journeys 1 and 4 fail in every
    controlled execution (J1 10/10, J4 6/6 on pristine fixtures across two independent
    rounds) because of an unscoped, ambiguous locator in the delivered spec — defect
    VR-UI-01. Product behavior behind those journeys is verified correct by persisted DB
    evidence. No application-code defect was found in this gate; no application code was
    modified in this gate.
```

Governance: per §27 this gate stops at **BLOCKED**; per §29 no Release Closure, no
completeness/parity-matrix update, no M7.3-D start. Next gate = **TARGETED M7.3-C
REMEDIATION** (scope: the M7.3-C UI acceptance artifact, see §8).

---

## 1. Runtime environment (real, freshly provisioned)

| Item | Value / evidence |
| --- | --- |
| API | Real NestJS app on `http://localhost:3000`, global prefix `v1` (PID 35800, started by `apps/api/__start_api.ps1` process-env launcher — sandbox, removed after gate) |
| Readiness | `GET /v1/readyz` → `{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}},"error":{},"details":{"database":{"status":"up"},"redis":{"status":"up"}}}` ; `GET /v1/healthz` → `{"status":"ok",...}` |
| PostgreSQL | docker `scs-postgres`, `0.0.0.0:25433->5432/tcp` → host `localhost:25433`, db `scs_platform`, user `scs` |
| Redis | docker `scs-redis`, `0.0.0.0:6379->6379/tcp` |
| Auth | Real HS256 JWTs accepted by `JwtAuthGuard`; claims `{sub, activeOrg, role, perms[], sid, jti, iat, exp}`; permissions loaded from `permissions/role_permissions/roles` (70 seeded incl. `fulfillment:shipments:return`); enforced by real `PermissionsGuard` |
| Merchant web | `pnpm --filter @scs/web dev` → Next 14.2.35 `Ready in 5.1s` on `http://localhost:3100` (`/login` → 200) |
| Admin console | `pnpm --filter @scs/admin dev` → `Ready in 2.8s` on `http://localhost:3200` |
| Browser | Playwright 1.63 chromium, real browser execution (`apps/e2e`) |

No scenario below was derived from source inspection, unit tests, build success, `--list`,
or the remediation report. Every matrix row is fresh execution output from this session.

### 1.1 Commands actually executed (verbatim)

```text
node apps/api/__vr_http_matrix.cjs                      # live HTTP matrix + real concurrent HTTP (32 checks)
node apps/api/__vr_contract.cjs                         # §15 event/outbox/movement contract, §16 cross-tenant buyer
node apps/api/__vr_ui_seed.cjs                          # Playwright session-state + 5 pinned UI fixtures
powershell -File apps/api/__vr_pw_ev3.ps1               # per-journey Playwright, pristine fixture per run
powershell -File apps/api/__vr_pw_final.ps1             # full-suite Playwright + post-run DB evidence
node apps/api/__vr_ui_evidence.cjs                      # persisted evidence of the UI-driven return
pnpm vitest run src/__tests__/integration/m73c-inventory-return.postgres.spec.ts
           src/__tests__/integration/m73b5-rts-reconciliation.postgres.spec.ts
           src/__tests__/integration/m73b6-buyer-projection.postgres.spec.ts
           src/__tests__/integration/m73b1-cancellation-concurrency.postgres.spec.ts
           src/__tests__/integration/m71-security-concurrency.postgres.spec.ts   (from apps/api)
pnpm vitest run src/__tests__/unit/orders/m73c-inventory-return.spec.ts
pnpm --filter @scs/api|web|admin typecheck ; pnpm --filter @scs/api|web|admin build
node apps/api/__vr_gc.cjs                               # fixture garbage collection + final invariants
```

---

## 2. Scenario matrix — fresh execution results (live API + live PostgreSQL)

Harness output captured verbatim (`__vr_final_run.log`, **32/32 PASS, exit 0**):

```text
PASS  A1  RTS_COMPLETED eligible — status=200
PASS  A2  non-RTS_COMPLETED rejected — status=409
PASS  A3  LOST → 409, zero movement — status=409 released=0
PASS  A4  SUPER_ADMIN allowed — status=200
PASS  A4b MODERATOR allowed (cross-store) — status=200
PASS  A5  MERCHANT_OWNER own store — status=200 idempotent=false
PASS  A5b MERCHANT_STAFF own store — status=200
PASS  A6  DRIVER denied — status=403
PASS  A7  BUYER denied — status=403
PASS  A8  cross-tenant merchant denied — status=403
PASS  A9  missing fulfillment:shipments:return → 403 — status=403
PASS  GOOD  GOOD=RELEASE only (on_hand unchanged) — dRes=-4 dOnHand=0 dAvail=4
PASS  DAMAGED  DAMAGED=RELEASE then ADJUST (on_hand-N) — dRes=-5 dOnHand=-5 rel=5 adj=5
PASS  DEFECTIVE  DEFECTIVE write-off — dOnHand=-3 adj=3
PASS  UNSALEABLE  UNSALEABLE write-off — dOnHand=-3 adj=3
PASS  PARTIAL  sequential partial → cumulative cap → over-return 409 — p1=200 p2=200 p3=409 released=10
PASS  IDEM  identical retry applies exactly once — r1=200/idem=false r2=200/idem=true rel=4 ev=1
PASS  TAMPER  server-controlled/unknown/bad-condition → 400 zero rows — 400/400/400/400 rel=0
PASS  WH  per-line warehouse from RESERVE origin (two variants/warehouses) — status=200 … A.res=0 B.res=0
PASS  EVENT  success → 1 event + 1 outbox atomically — ev=1 ob=1
PASS  BUYER-PROJ  buyer tracking hides internal return — status=200 leaked=false
PASS  C1  concurrent distinct [3,4,5] vs reserve 10 — statuses=[200,200,409] released=7 conflicts=1 reserved:10->3
PASS  C2  concurrent distinct [1,2,3,4,5,6] vs reserve 10 — statuses=[200,200,200,200,409,409] released=10 conflicts=2 reserved:10->0
PASS  C3.1 … C3.5  (see §3)
PASS  C3  repeated [3,4,5] race x5 never over-releases — reps=5 allHeld=true
PASS  C4  concurrent identical applies exactly once — statuses=[200,200,200] released=4 events=1 outbox=1
PASS  C5  return vs cancellation race: no over-release / no negative — statuses=[200,403,200] released=6 reserved=4
PASS  INV  post-run DB invariants + zero fixture residue — NEGATIVE_OR_INCONSISTENT_INVENTORY=0 CUMULATIVE_RELEASE_OVER_RESERVE=0 TEST_RESIDUE=0

=== LIVE HTTP HARNESS: 32/32 PASS ===
```

Mapping to the required matrix:

| Brief § | Requirement | Fresh result | Status |
| --- | --- | --- | --- |
| 5/A1 | Only `RTS_COMPLETED` eligible | `GET /v1/shipments/:id/return-eligibility` 200 on RTS_COMPLETED | PASS |
| 5/A2 | Invalid states rejected | `RTS_IN_PROGRESS` return → 409 | PASS |
| 5/A3, 8 | LOST locked behavior | 409, `released=0`, `events=0` — reservation stays with cancellation | PASS |
| 5/A4 | Admin / SuperAdmin / Moderator cross-store | SUPER_ADMIN 200, MODERATOR 200 | PASS |
| 5/A5 | Merchant Owner/Staff own store only | 200 / 200 | PASS |
| 5/A6 | Driver denied | 403 + zero movement | PASS |
| 5/A7 | Buyer denied | 403 | PASS |
| 5/A8 | Cross-tenant/store rejected | other-org MERCHANT_OWNER → 403, `released=0` | PASS |
| 5/A9 | `fulfillment:shipments:return` enforced | same principal with `perms: []` → 403 | PASS |
| 6 | GOOD = RELEASE only | `dRes=-4 dOnHand=0 dAvail=4`, RELEASE=4, ADJUST=0 | PASS |
| 7 | DAMAGED/DEFECTIVE/UNSALEABLE = RELEASE then ADJUST-out | `dRes=-5 dOnHand=-5 rel=5 adj=5`; DEFECTIVE/UNSALEABLE `dOnHand=-3 adj=3`; persisted order RELEASE→ADJUST (see §5) | PASS |
| 9 | Partial, sequential cumulative cap, no clamping | 3 + 7 = 10 accepted (200/200), 11th unit → 409, `released=10`, `qty_reserved=0` | PASS |
| 10 | C1–C5 real parallel HTTP | see §3 | PASS |
| 11 | DB invariants | see §4 | PASS |
| 12 | Idempotency (first / retry / repeated / concurrent identical) | IDEM + C4; conflicting-payload-same-fingerprint is impossible by construction (§6) | PASS |
| 13 | Warehouse from original RESERVE | two-variant/two-warehouse fixture → both per-line origins drained (`A.res=0 B.res=0`) | PASS |
| 14 | movement+event+outbox atomic, incl. failure path | rejections write 0/0/0 (A3/A8/A9/TAMPER), success writes 1/1/1 (EVENT, C4); injected outbox/event failure → full rollback (C-PG-17, real PG) | PASS |
| 15 | Event contract + metadata | see §5 | PASS |
| 16 | Buyer projection / information boundary + cross-tenant buyer | see §5.2 | PASS |
| 17 | **Actual Playwright execution** | 5 journeys really executed in a browser; **journeys 1 and 4 FAIL as authored** | **FAIL → BLOCKED (VR-UI-01)** |
| 18 | Merchant UI (panel, qty entry, valid/partial/over/LOST surfaced, actions hidden from unauthorized) | panel + hint + submit + persisted exactly-once effect verified; acceptance assertion defective | PARTIAL — see §7 |
| 19 | Admin UI | J2 pass (record + all-returned state); J3 pass (LOST offers no control) | PASS |
| 20 | Buyer UI | J5 pass (no internal return detail) | PASS |
| 21 | Driver UI / denial | no driver return affordance exists anywhere (route + code search) and API denial 403 | PASS |
| 22 | Regressions B.1/B.5/B.6/M7.1 | 5 files / 91 tests passed | PASS |
| 23 | Typecheck / build | api/web/admin `tsc --noEmit` + builds all exit 0 | PASS |
| 24 | Working-tree / scope | unchanged application footprint; no code edited in this gate | PASS |

---

## 3. Concurrency evidence (real parallel HTTP, distinct fingerprints, persisted state)

Each scenario built an isolated fixture (reserve N on one inventory item) and fired
`Promise.all` real HTTP `POST /v1/shipments/:id/return` calls with distinct line
fingerprints, then read committed `stock_movements` / `inventory_items`.

```text
C1  reserve=10 requested=[3,4,5] (sum 12)
    statuses=[200,200,409] released=7 conflicts=1 reserved:10->3
C2  reserve=10 requested=[1,2,3,4,5,6] (sum 21)
    statuses=[200,200,200,200,409,409] released=10 conflicts=2 reserved:10->0
C3  repeated [3,4,5] race, 5 runs, each on a fresh fixture:
    C3.1 statuses=[200,200,409] released=7 conflicts=1 reserved:10->3
    C3.2 statuses=[200,409,200] released=8 conflicts=1 reserved:10->2
    C3.3 statuses=[200,200,409] released=7 conflicts=1 reserved:10->3
    C3.4 statuses=[200,200,409] released=7 conflicts=1 reserved:10->3
    C3.5 statuses=[409,200,200] released=9 conflicts=1 reserved:10->1
    → invariant `released <= reserved && conflicts >= 1 && qty_reserved >= 0` held 5/5.
      Winning order is non-deterministic (as the brief requires); the invariant is deterministic.
C4  concurrent IDENTICAL (same payload ⇒ same fingerprint), 3 parallel, reserve 10:
    statuses=[200,200,200] released=4 events=1 outbox=1   (exactly one logical return)
C5  return vs cancellation race (return 6 ∥ cancel ∥ return 6 against reserve 10):
    statuses=[200,403,200] released=6 reserved=4
    → no over-release (6 ≤ 10), no negative reservation, cancellation-wins ordering
      preserved by the row lock; the 403 is the loser whose order had already moved to
      CANCELLED for that actor path. Sequential cancellation-wins semantics (both orders)
      were additionally verified in the previous pass and remain covered by
      m73b1-cancellation-concurrency.postgres.spec.ts (14 tests, re-passed here).
```

**CI-05 regression verdict: the previously deterministic over-release is NOT reproducible.**
The same `[3,4,5]`-vs-10 and `[1..6]`-vs-10 races that produced `released=12` / `released=21`
in the blocked pass now produce at most `released=reserved` with guaranteed 409s.

Remediation code as found in the live service (`apps/api/src/modules/orders/orders.service.ts`,
read-only inspection — supporting context, not the basis of the verdict):

```text
2976  return this.db.db.transaction(async (tx) => {
2977    // 3/6. Authoritative ledger view inside the transaction. This pre-lock read is
2978    // used only to resolve each requested line → origin inventoryItemId/warehouseId
2979    // (stable, derived from RESERVE movements). The VOLATILE cumulative cap is
2980    // re-evaluated from a FRESH post-lock view below (CI-05 concurrency refresh).
```

---

## 4. Database invariants (§11) — real PostgreSQL queries

Harness `INV` check (post-run, after 32 scenarios incl. all races):

```text
NEGATIVE_OR_INCONSISTENT_INVENTORY=0
CUMULATIVE_RELEASE_OVER_RESERVE=0
TEST_RESIDUE=0
```

Query shapes used:

```sql
SELECT count(*)::int FROM inventory_items
 WHERE qty_on_hand<0 OR qty_reserved<0 OR qty_available<0
    OR qty_available <> (qty_on_hand - qty_reserved);

SELECT count(*)::int FROM (
  SELECT reference_id,
         sum(abs(quantity)) FILTER (WHERE movement_type='RELEASE' AND metadata->'return' IS NOT NULL) rel,
         sum(abs(quantity)) FILTER (WHERE movement_type='RESERVE') resv
    FROM stock_movements WHERE reference_type='ORDER' GROUP BY reference_id
) x WHERE rel > resv;

-- per-fixture: total return RELEASE <= original RESERVE and qty_reserved >= 0
-- (asserted inside every concurrency scenario, not only globally)
```

Final state after fixture GC (`node __vr_gc.cjs`, end of gate):

```text
POST-GC: {"wh":0,"ship":0,"return_mv":0,"bad_inv":0,"inv_total":13}
```

i.e. zero verification warehouses, zero verification shipments, zero residual return
movements, zero inconsistent inventory rows, seeded inventory back to its 13-row
baseline. No test residue was left in the runtime database.

---

## 5. Event contract, atomicity and buyer boundary (live)

Fresh live return (6 units DAMAGED) inspected in the persisted rows — `node __vr_contract.cjs`:

```text
RET status= 200
EVENT.metadata.return keys = ["lines","actorType","shipmentId","fingerprint"]
  line keys = ["quantity","condition","writtenOff","orderItemId","warehouseId","inventoryItemId"]
EVENT actorType= MERCHANT fingerprint= 8ad4d5c613ccd0c1…
OUTBOX keys = ["lines","orderId","storeId","shipmentId"] status= PENDING
  line keys = ["quantity","condition","orderItemId"]
MOVEMENT metadata.return keys (persisted order) =
  ["RELEASE:quantity","RELEASE:actorType","RELEASE:condition","RELEASE:shipmentId","RELEASE:writtenOff",
   "RELEASE:fingerprint","RELEASE:orderItemId","RELEASE:warehouseId","RELEASE:inventoryItemId",
   "ADJUST:quantity","ADJUST:actorType","ADJUST:condition","ADJUST:shipmentId","ADJUST:writtenOff",
   "ADJUST:fingerprint","ADJUST:orderItemId","ADJUST:warehouseId","ADJUST:inventoryItemId"]
RESIDUE after cleanup = 0
```

The persisted movement sequence is `RELEASE …` before `ADJUST …`, i.e. the mandatory
write-off ordering in §7 is satisfied at storage level, not just by response semantics.

### 5.1 Atomicity failure path

`m73c-inventory-return.postgres.spec.ts` **C-PG-17: a failed write transaction persists no
movement, event, or outbox** — passed against real PostgreSQL (testcontainers) in this gate;
the injected failure after the outbox write rolls the whole write set back. Rejections via
HTTP also persist 0/0/0 (A3, A8, A9, TAMPER rows verified in `stock_movements`).

### 5.2 Buyer information boundary (§16)

```text
BUYER-OWN tracking status= 200 leak= false
BUYER-FOREIGN tracking status= 400 body= {"status":400,"detail":"Cannot access tracking for another buyer's order", ...}
FOREIGN_SEES_ORDER_DATA= false
```

The owning buyer receives only the buyer-safe projection (no `RETURN_PROCESSED`,
no `return_processed`, no `inventoryItemId`, `fingerprint`, `warehouseId`); a foreign buyer
is denied and sees no order data.

### 5.3 Idempotency §12 item 5 — recorded as structurally inapplicable (not skipped silently)

`computeReturnFingerprint()` (`orders.service.ts:3153–3159`) hashes the normalized payload
(`orderItemId:quantity:condition` sorted), so a *different* payload can never carry the *same*
fingerprint; the "same fingerprint with conflicting payload" case cannot be constructed against
this implementation. Verified behaviorally instead: sequential identical retries (IDEM) and
concurrent identical requests (C4) apply exactly once.

---

## 6. Regression suites (§22) — fresh run in this gate

```text
 RUN  v2.1.9  C:/TAIF/scs-platform/apps/api
 ✓ src/__tests__/integration/m73b6-buyer-projection.postgres.spec.ts (3 tests) 106244ms
 ✓ src/__tests__/integration/m71-security-concurrency.postgres.spec.ts (15 tests) 136547ms
 ✓ src/__tests__/integration/m73c-inventory-return.postgres.spec.ts (24 tests) 186898ms
 ✓ src/__tests__/integration/m73b5-rts-reconciliation.postgres.spec.ts (35 tests) 193385ms
 ✓ src/__tests__/integration/m73b1-cancellation-concurrency.postgres.spec.ts (14 tests) 196150ms

 Test Files  5 passed (5)
      Tests  91 passed (91)
   Duration  230.85s
```

M7.3-C unit suite re-run fresh in this gate:

```text
 ✓ src/__tests__/unit/orders/m73c-inventory-return.spec.ts (26 tests)
 Test Files  1 passed (1)
      Tests  26 passed (26)
```

No pre-existing/unexplained failures; nothing was marked "expected failure".

---

## 7. Playwright — actual browser execution (§17), results and defect

### 7.1 Provisioning

- `node __vr_ui_seed.cjs` minted real 8-hour HS256 sessions and wrote Playwright
  `storageState` files (`apps/e2e/.vr-state/{merchant,admin,buyer}.json`) for
  MERCHANT_OWNER (Gulf org, DB-loaded perms), SUPER_ADMIN and BUYER; and built the five
  fixtures pinned by the spec (`VR-UI-*` warehouses, RTS_COMPLETED / LOST shipments,
  reserves 4/6/3/5/4, buyer fixture with a real API-committed return so a
  `RETURN_PROCESSED` event exists to hide).
- Env: `E2E_RETURN=1` + `E2E_STATE_*` + the five URL variables. No credentials or tokens
  were embedded in the spec; nothing in the spec was modified.
- Suite: `npx playwright test tests/m73c-return-flow.spec.ts --reporter=line` (Chromium,
  real browser). `--list` was never used as evidence.

### 7.2 Full-suite result (pristine fixtures, healthy apps)

```text
Running 5 tests using 1 worker
[1/5] … merchant records a GOOD return and sees confirmation
1) … merchant records a GOOD return and sees confirmation
    Error: expect(locator).toBeVisible() failed
    Locator: getByText(/Recorded return of \d+ unit\(s\)/)
    Expected: visible
    Error: strict mode violation: getByText(/Recorded return of \d+ unit\(s\)/) resolved to 2 elements:
        1) <div>Recorded return of 4 unit(s).</div> aka getByText('Recorded return of 4 unit(s).')
        2) <div>MERCHANT — Recorded return of 4 unit(s)</div> aka getByText('MERCHANT — Recorded return of')
    Call log:
      - Expect "toBeVisible" getByText(/Recorded return of \d+ unit\(s\)/) with timeout 15000ms
      - waiting for getByText(/Recorded return of \d+ unit\(s\)/)
      55 |     await expect(merchant.getByText(/Recorded return of \d+ unit\(s\)/)).toBeVisible({ timeout: 15_000 });
        at C:\TAIF\scs-platform\apps\e2e\tests\m73c-return-flow.spec.ts:55:74
    attachment #1: screenshot … test-results\m73c-return-flow-M7-3-C-In-38d59-eturn-and-sees-confirmation-ship-ops\test-failed-1.png
    Error Context: …\error-context.md
1 failed
4 did not run        (describe mode is 'serial', so journeys 2–5 were not reached)
```

Counts: **5 tests selected · 1 failed · 4 did not run · 0 passed** in the suite run;
screenshots + `error-context.md` captured by Playwright for the failure.

### 7.3 Per-journey matrix — each journey re-run on freshly seeded fixtures

`powershell -NoProfile -ExecutionPolicy Bypass -File apps/api/__vr_pw_ev3.ps1`
(re-seeds all five fixtures immediately before every single journey, so no journey inherits
another journey's mutation). The protocol was executed **twice, independently**
(`__vr_pw_perjourney.log`, `__vr_pw_perjourney2.log`) and reproduced identically:

| Journey | Spec line | Controlled runs (round 1 + round 2) | Result | Failure cause |
| --- | --- | --- | --- | --- |
| J1 merchant records a GOOD return | `:47` (assert `:55`) | 5 + 5 | **10 × FAIL (10/10)** | strict-mode violation, `getByText(/Recorded return of \d+ unit\(s\)/)` → 2 elements |
| J2 admin records a return (console) | `:60` | 1 + 1 | **PASS (2/2)** `4.5s` | — |
| J3 LOST shipment offers no return control | `:74` | 1 + 1 | **PASS (2/2)** `3.6s` | — |
| J4 merchant records a partial return | `:85` (assert `:97`) | 3 + 3 | **6 × FAIL (6/6)** | same unscoped locator (`/Recorded return of 1 unit\(s\)/` → 2 elements) |
| J5 buyer tracking hides internal return | `:104` | 1 + 1 | **PASS (2/2)** `4.1s` | — |

Isolated single-journey confirmations (extra runs after round 2): J4 passed **1** time when the
tracking timeline had not yet repainted at the moment the assertion polled, and J1 passed **1**
time in an earlier, environment-degraded full-suite run (§9, incidents 3 and 4). So the
merchant assertions are not reliably green under any condition — they fail whenever the
product correctly surfaces the recorded return in the timeline, and only pass when a repaint
loses the race.

Additional confirmations inside the failing runs (before the assertion aborts): the `Record return`
heading is present, the server-resolved-warehouse hint is present, `Submit return` is clickable,
the POST returns 200, and the return is actually recorded — see §7.4.

### 7.4 Persisted evidence that the merchant UI's return applied exactly once

`node __vr_ui_evidence.cjs` immediately after the full-suite run above (J1's own UI submit):

```text
J1 merchant fixture — inventory: {"qty_on_hand":100,"qty_reserved":0,"qty_available":100}
J1 return RELEASE units = 4 | RETURN_PROCESSED events = 1 | notes = ["Recorded return of 4 unit(s)"] | outbox = 1
```

Fixture reserved 4; after the browser-driven submit: `qty_reserved 4 → 0`, `RELEASE = 4`
(never more), exactly one `RETURN_PROCESSED` event and exactly one outbox row. The merchant
UI happy path therefore behaves per the locked contract; only the acceptance assertion fails.

Same evidence taken after an isolated J4 (partial) execution — `node __vr_j4_db.cjs`:

```text
J4 partial (reserve 6): inventory {"qty_reserved":5,"qty_on_hand":100,"qty_available":95}
  | return RELEASE = 1 | RETURN_PROCESSED events = 1 | outbox = 1
```

i.e. the UI-driven partial return released exactly one unit, the remaining 5 stayed reserved
and returnable, with a single event and a single outbox row — the J4 contract (`before - 1`)
is satisfied by the product even in runs where the J4 assertion fails.

### 7.5 UI-category summary (brief §18–§21)

| Category | Fresh evidence | Status |
| --- | --- | --- |
| Merchant UI §18 — eligible RTS shipment exposes return action; qty entry; valid return succeeds; LOST not returnable; unauthorized denied | heading+hint rendered and submit worked with exactly-once persistence (J1/J4 evidence above); `canRecordReturn` gated on `RTS_COMPLETED && exceptionType !== 'LOST'`; BUYER/DRIVER cannot call the endpoint at all (403) | **Behavior PASS; acceptance assertion FAILS (VR-UI-01)** |
| Merchant UI §18 — partial return remainder preserved | J4 performed the 1-unit return and the panel re-rendered the reduced balance before its ambiguous confirmation assertion failed on the same locator | Behavior PASS; assertion FAILS (same defect) |
| Admin UI §19 | J2 (record + "all reserved units … returned" state), J3 (LOST exposes no `Inventory return (record return)` section and no submit control) | **PASS** |
| Buyer UI §20 | J5 (`toHaveCount(0)` over `RETURN_PROCESSED|return processed|recorded return|write-off|inventoryItemId|fingerprint`) | **PASS** |
| Driver UI §21 | no driver-facing return affordance exists: route search in `apps/web` finds no driver page; repo-wide search for `return-eligibility` / `:id/return` callers matches only `apps/web/src/lib/shipops.ts` (merchant), `apps/admin/src/lib/shipops.ts` + admin shipment page, and the API controller; DRIVER principal is denied at the endpoint (A6, 403 + 0 rows) | **PASS** |

---

## 8. §27 defect report

```text
M7.3-C RUNTIME VERIFICATION: BLOCKED

Defect id:
  VR-UI-01 — M7.3-C acceptance-test artifact defect (delivered Playwright spec), NOT an
  application-behavior defect.

1. Exact failing scenario
   apps/e2e/tests/m73c-return-flow.spec.ts
     J1 "merchant records a GOOD return and sees confirmation" — assertion line 55 (failed 10/10 controlled runs)
     J4 "merchant records a partial return, remainder stays returnable" — assertion line 97 (failed 6/6 controlled runs)
   Executed via `npx playwright test tests/m73c-return-flow.spec.ts --reporter=line` against
   live web :3100 with a real merchant session and freshly seeded fixtures; two independent
   full protocol rounds reproduced the identical outcome, plus 2 failing full-suite executions.

2. Exact request/input
   Browser: GET /merchant/deliveries/<shipmentId> (fixture reserving 4 units, shipment
   status IN_TRANSIT / exception_status RTS_COMPLETED / exception_type DAMAGED), click
   "Submit return" with default quantity (all remaining) and condition GOOD. No API request
   was altered; the UI issued POST /v1/shipments/<id>/return {lines:[{orderItemId,quantity:4,
   condition:"GOOD"}]} and received HTTP 200.

3. Expected result (spec intent)
   Exactly one visible confirmation node matching /Recorded return of \d+ unit\(s\)/, then a
   reloaded panel showing the reduced remaining balance. For J4 additionally the first line's
   remaining cell == before - 1.

4. Actual result
   Playwright strict-mode violation — the unscoped page-level locator resolves to TWO visible
   elements:
     1) <div>Recorded return of 4 unit(s).</div>            (ReturnPanel result message)
     2) <div>MERCHANT — Recorded return of 4 unit(s)</div>  (tracking-timeline event note,
                                                             echoed after the panel reload)
   `expect(...).toBeVisible()` fails on multi-match; the journey can never pass as written
   once the timeline has re-rendered. Same root cause at J4 (quantity 1).

5. Persisted DB state (proves product correctness)
   J1 fixture: inventory_items {"qty_on_hand":100,"qty_reserved":0,"qty_available":100} (reserve 4 → 0)
     return RELEASE units = 4 | RETURN_PROCESSED events = 1 | notes = ["Recorded return of 4 unit(s)"] | outbox = 1
   J4 fixture: inventory_items {"qty_reserved":5,"qty_on_hand":100,"qty_available":95} (reserve 6 → 5)
     return RELEASE = 1 | RETURN_PROCESSED events = 1 | outbox = 1
   No over-release, no duplicate movement, no duplicate event/outbox; the partial remainder is
   preserved exactly as the journey intends.

6. Relevant logs / artifacts
   apps/api/__vr_pw_final_suite.log (full suite + DB evidence), apps/api/__vr_pw_perjourney.log
   (per-journey matrix), Playwright artifacts under apps/e2e/test-results/m73c-return-flow-…
   (test-failed-1.png, error-context.md) — generated artifacts removed after this gate.

7. Reproduction steps
   a) Start API :3000 (PG host 25433, Redis 6379), web :3100 (`pnpm --filter @scs/web dev`).
   b) Seed a Gulf-store shipment: RTS_COMPLETED, exception_type DAMAGED, one line reserving
      4 units; mint a MERCHANT_OWNER storageState.
   c) E2E_RETURN=1 E2E_STATE_MERCHANT=… E2E_MERCHANT_DELIVERY_URL=/merchant/deliveries/<id>
      npx playwright test tests/m73c-return-flow.spec.ts --reporter=line --grep "merchant records a GOOD return"
   → strict-mode violation at spec line 55 (reproduced 10/10 controlled runs).

8. Suspected root cause
   Test-artifact ambiguity: the delivered assertion targets the whole page
   (`merchant.getByText(/Recorded return of \d+ unit\(s\)/)`) while the product legitimately
   surfaces the same wording in two distinct, intended places — the ReturnPanel result string
   (apps/web/src/app/merchant/deliveries/[id]/page.tsx) and the ship-ops tracking timeline note
   rendered from the persisted RETURN_PROCESSED event (M7.3-B.6 visibility). Playwright's
   default strict mode rejects multi-match locators, so the assertion is unsatisfiable once the
   timeline has repainted. The outcome is race-governed, not quality-governed: the journey
   passes only when the confirmation poll wins before the timeline repaint (observed once for
   J4, once for J1 in a degraded environment) and fails when the product renders the complete,
   correct UI (10/10 for J1, 6/6 for J4). A genuinely correct UI actively breaks the assertion.

9. Smallest required remediation (NOT applied — verification-only gate)
   Scope the assertion in the delivered spec to the result surface, e.g.
     `await expect(merchant.getByRole('status').getByText(/Recorded return of \d+ unit\(s\)/)).toBeVisible()`
   or, minimally and without product change:
     `await expect(merchant.getByText(/Recorded return of \d+ unit\(s\)/).first()).toBeVisible()`
   plus an explicit negative assertion that the timeline entry exists (turning today's
   ambiguity into a real contract check). Apply the identical scoping at spec line 97 (J4).
   Alternative (if the team prefers product-side disambiguation): give the ReturnPanel result
   a distinct, test-addressable role/`data-testid` rather than changing the user-visible copy.
   No implementation file was changed in this gate.

10. Next gate
    TARGETED M7.3-C REMEDIATION — scope limited to the M7.3-C UI acceptance artifact
    (spec lines 55 and 97), followed by a full re-run of this Independent Runtime
    Verification gate (the API/concurrency/regression categories already pass and must be
    re-confirmed, not assumed).
```

---

## 9. Environmental incidents during this gate — classified per §26 (disclosed, not hidden)

All of the following were *execution-environment* problems, each re-run to completion after
repair, so no UI category is reported from a broken environment:

1. **Unmaterialized pnpm store** — `pnpm --filter @scs/admin dev` failed with
   `Cannot find module 'next/dist/pages/_app'`, and the PostgreSQL suites failed with
   `Cannot find module 'graceful-fs'`. Repaired with `pnpm install --force`
   (`ERR_PNPM_IGNORED_BUILDS` for `cpu-features` is a known, irrelevant optional build).
   Re-run: admin `Ready in 9.3s`; 5 PG files / 91 tests passed.
2. **Stale `.next` under a long-lived dev server** — the first full-suite run reported
   `Record return` heading not found; a Chromium probe showed
   `Cannot find module './vendor-chunks/next@14.2.35_…js'` served from `apps/web/.next`.
   Repaired by killing the web dev PID, deleting `apps/web/.next`, restarting `next dev -p 3100`.
3. **`next build` while dev servers were running** (build evidence for §23) invalidated the
   running bundles again, producing false "element(s) not found" failures for J2/J3/J4 in one
   intermediate Playwright run. Repaired by stopping both dev servers, deleting
   `apps/web/.next` + `apps/admin/.next`, restarting both, and re-running the whole Playwright
   evidence set (§7.2–§7.4 are from the repaired environment).
4. **Fixture reuse** — one intermediate run executed journeys 2–5 against fixtures already
   mutated by the suite run, producing spurious "panel already all-returned" failures; in that
   same degraded run journey 1 happened to pass (the confirmation poll beat the timeline
   repaint). That run was **discarded**; the authoritative protocol re-seeds every fixture
   before every single journey and was executed twice (§7.3).
5. **Harness/fixture corrections (this session, all in sandbox files — no product change):**
   ADJUST counters initially read 0 because write-off ADJUST rows carry only
   `metadata->'return'` (no `reference_type/reference_id`), so the probe was re-keyed on
   `metadata->'return'->>'shipmentId'`; a two-warehouse fixture initially reused one variant,
   which the product correctly aggregates onto a single reservation origin and rejected with a
   legitimate 409 `Over-return: requested 10, remaining returnable 5`, so the fixture was
   rebuilt with two distinct variants; `outbox_events` cleanup failed silently with
   `operator does not exist: uuid = text` until `aggregate_id::text` casting was added and
   cleanup errors were made loud; the residue counter needed `)::int` because `pg` returns
   `count(*)` as a string. After these corrections the harness reached 32/32.

Classification summary: the only **non-environmental** failure in this gate is VR-UI-01 (§8),
which is a defect in the delivered acceptance-test artifact. **No application functional,
security, tenant-isolation, concurrency or event-contract defect was found.**

---

## 10. Typecheck / build (§23) and working-tree scope (§24)

```text
pnpm --filter @scs/api   typecheck → tsc --noEmit                    exit 0
pnpm --filter @scs/web   typecheck → tsc --noEmit                    exit 0
pnpm --filter @scs/admin typecheck → tsc --noEmit                    exit 0
pnpm --filter @scs/api   build    → nest build: "TSC Found 0 issues", "Successfully compiled: 279 files with swc (598.25ms)"   exit 0
pnpm --filter @scs/web   build    → next build, route table emitted (/merchant/deliveries…, /orders/[id] dynamic)              exit 0
pnpm --filter @scs/admin build    → next build, route table emitted (/shipments, /shipments/[id] dynamic)                       exit 0
```

Supporting only — these do not establish runtime PASS.

```text
$ git rev-parse --abbrev-ref HEAD  → develop
$ git rev-parse HEAD               → 229949f934f6bfe447d4bce600a84fcbfe4dc365
$ git status --short  (FINAL state of this gate, all verification sandboxes removed)
 M apps/admin/src/app/shipments/[id]/page.tsx
 M apps/admin/src/lib/shipops.ts
 M apps/api/infra/drizzle/seed-pg.ts
 M apps/api/src/__tests__/integration/phase3-security.e2e.spec.ts
 M apps/api/src/__tests__/integration/seed-pg.postgres.spec.ts
 M apps/api/src/modules/orders/orders.service.ts
 M apps/api/src/modules/shipping/shipment-operations.controller.ts
 M apps/web/src/app/merchant/deliveries/[id]/page.tsx
 M apps/web/src/lib/shipops.ts
 M docs/production/SCS-M7.3-C-BUSINESS-RULES-ARCHITECTURE-LOCK.md
?? apps/api/src/__tests__/integration/m73c-inventory-return.postgres.spec.ts
?? apps/api/src/__tests__/unit/orders/m73c-inventory-return.spec.ts
?? apps/e2e/tests/m73c-return-flow.spec.ts
?? docs/production/SCS-M7.3-C-CONCURRENCY-REMEDIATION-REPORT.md
?? docs/production/SCS-M7.3-C-FRESH-ARCHITECTURE-AUDIT.md
?? docs/production/SCS-M7.3-C-IMPLEMENTATION-REPORT.md
?? docs/production/SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION.md

evidence of the CI-05 remediation in the tracked diff (delta vs the blocked pass, 413 → 425 lines):
$ git --no-pager diff -- apps/api/src/modules/orders/orders.service.ts
   …  // 3/6. Authoritative ledger view inside the transaction. This pre-lock read is
       used only to resolve each requested line → origin inventoryItemId/warehouseId
       (stable, derived from RESERVE movements). The VOLATILE cumulative cap is
       re-evaluated from a FRESH post-lock view below (CI-05 concurrency refresh).
```

Scope findings:

- The dirty tree is **only** the M7.3-C implementation + test + docs surface carried forward
  from the implementation and remediation gates. **No application file was created, edited or
  reverted during this verification gate** — the newest mtime among application sources is
  `orders.service.ts` 2026-10-03 20:01 (remediation gate), while every verification harness in
  this session was written 22:43 or later, all as `__vr_*` sandbox files.
- `pnpm-lock.yaml`, `package.json`, `turbo.json`, `tsconfig.base.json`: **unmodified**
  (`git status --short` on those paths returns nothing) despite `pnpm install --force`.
- Generated test artifacts were cleaned: `apps/e2e/.vr-state/`,
  `apps/e2e/__vr_ui_fixtures.json`, `apps/e2e/__vr_pw_debug.cjs`,
  `apps/e2e/test-results/m73c-return-flow-*/` removed and `apps/e2e/test-results/.last-run.json`
  restored (it was clean before this gate); all `apps/api/__vr_*` / `vr_*` scripts and runtime
  logs removed.
- Runtime processes started for verification (API `dist/main`, `next dev -p 3100`,
  `next dev -p 3200` and their pnpm wrappers) were stopped at end of gate; `node` process count
  is 0 and ports 3000/3100/3200 are free, so the next gate starts from a clean process state.
  Docker containers (`scs-postgres`, `scs-redis`) were left running as found.
- Database residue: zero (see §4 `POST-GC`).
- The repository was **not** reset and nothing in the implementation working tree was discarded.

---

## 11. Final verdict and next gate

```text
M7.3-C INDEPENDENT RUNTIME VERIFICATION — BLOCKED
```

| Category | Result |
| --- | --- |
| Eligibility / authorization (A1–A9) | PASS |
| Tenant / store isolation, permission enforcement | PASS |
| GOOD / DAMAGED / DEFECTIVE / UNSALEABLE / LOST semantics | PASS |
| Partial + sequential cumulative cap | PASS |
| Concurrency C1, C2, C3(×5), C4, C5 over real parallel HTTP | PASS — CI-05 over-release NOT reproducible |
| DB invariants (negative inventory, over-release, residue) | PASS |
| Idempotency | PASS |
| Warehouse resolution from original RESERVE | PASS |
| Transactional atomicity incl. injected failure | PASS |
| Event/outbox contract | PASS |
| Buyer projection + cross-tenant buyer denial | PASS |
| Regressions B.1 / B.5 / B.6 / M7.1 (91 tests) + M7.3-C unit (26) | PASS |
| Typecheck + build (api / web / admin) | PASS |
| Working-tree / scope | PASS |
| Admin UI (J2, J3) | PASS |
| Buyer UI (J5) | PASS |
| Driver UI denial / no accidental affordance (A6 + surface search) | PASS |
| **Merchant UI acceptance (J1, J4) — actual Playwright execution** | **FAIL — VR-UI-01 (defect in the delivered acceptance-test artifact; J1 10/10 and J4 6/6 controlled runs failed; product behavior verified correct by persisted state)** |

Because the milestone's own browser acceptance suite cannot pass as authored, this gate
cannot be certified PASS — even though every underlying M7.3-C behavior it is meant to prove
was independently verified correct against the live runtime.

```text
M7.3-C Independent Runtime Verification BLOCKED

Next gate:
Targeted remediation
  (scope: apps/e2e/tests/m73c-return-flow.spec.ts lines 55 and 97 — defect VR-UI-01;
   then re-run this Independent Runtime Verification gate in full)
```

Not performed in this gate, by instruction: no application-code patch, no Release Closure,
no completeness/feature-parity/API-UI-matrix or roadmap update, no M7.3-D start.

---

## Part I — Historical record: PREVIOUS verification (BLOCKED, preserved)

Retained from the earlier verification run of 2026-10-03 on the pre-remediation tree so the
blocked result is not erased.

- Runtime: real NestJS API `:3000` + real PostgreSQL host `25433` + real JWT/permission
  enforcement; `healthz`/`readyz` green. Web `:3100` / admin `:3200` and Playwright were
  **not executed** in that pass (§27 STOP after the critical defect), and were recorded as
  **NOT RUN**, never as PASS.
- Harness 1 (core): 16/16 PASS. Harness 2 (advanced): 9/10 PASS, single FAIL = `S15c`.
  Concurrency probe: `DETERMINISTIC OVER-RELEASE REPRODUCED: true`.
- Sequential semantics confirmed correct in that pass too (GOOD `dReserved=-4 dOnHand=0
  dAvail=4`; DAMAGED `rel=5 adj=5` with RELEASE before ADJUST; LOST 409 with zero rows;
  over-return 409; idempotent replay 200/`idempotent=true`; tampering 400/400/400;
  warehouse from RESERVE; BUYER/DRIVER/cross-tenant 403; admin/moderator allowed;
  `events=1 outbox=1` atomic; buyer projection `leaked=false`).

```text
PREVIOUS DEFECT (CI-05) — RESOLVED BY REMEDIATION, RE-TESTED IN THIS GATE (§3)

Defect: Cumulative return cap was not enforced under concurrent submissions. N parallel
  POST /v1/shipments/:id/return requests with genuinely distinct fingerprints each passed
  the cap check and collectively RELEASEd more units than were RESERVED.
Evidence (blocked pass):
  S15c: statuses=[200,200,200,200,200,200] success=6 conflict=0
        releasedUnits=21  events=6  dReserved=-21   (reserved=10)
  attempt1/2/3: reserve=10 requested=[3,4,5](12) → statuses=[200,200,200] RELEASED=12
        events=3 dReserved=-12  *** OVER-RELEASE (>10) ***
Root cause: orders.service.ts recordReturn() built the authoritative ledger view at
  transaction start (line 2978) BEFORE acquiring the inventory `FOR UPDATE` locks
  (3004–3011) and evaluated the cumulative cap (3036–3046) against that stale snapshot;
  under READ COMMITTED every concurrent transaction saw returned=0.
Remediation (see SCS-M7.3-C-CONCURRENCY-REMEDIATION-REPORT.md): FIXED — lock → recompute →
  cap → write; the volatile cap is re-evaluated from a fresh post-lock view.
Re-verified in THIS gate: C1 released=7 ≤ 10 with 1 conflict; C2 released=10 = reserve with
  2 conflicts; C3 5/5 races never over-released; C4 identical concurrent applied once;
  C5 return-vs-cancel no over-release, no negative reservation.
```

Prior categories that were NOT RUN and are now executed and recorded in this document:
merchant UI, admin UI, buyer UI, driver UI/authorization surface, live Playwright execution,
and the regression suites.
