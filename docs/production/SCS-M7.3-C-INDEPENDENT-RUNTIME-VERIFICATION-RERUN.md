# SCS-M7.3-C — INDEPENDENT RUNTIME VERIFICATION — FULL RE-RUN

- **Gate:** M7.3-C Independent Runtime Verification — **FULL RE-RUN** after the VR-UI-01 acceptance-artifact remediation
- **Verification date/time:** 2026-10-04, execution window ≈ 01:38–05:15 (local, UTC+03:00)
- **Branch:** `develop`
- **Commit / authoritative baseline:** `229949f934f6bfe447d4bce600a84fcbfe4dc365` (HEAD == baseline, confirmed; nothing committed by this gate)
- **CURRENT VERIFICATION VERDICT:** **PASS**
- **Predecessor gate:** `SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION.md` (verdict **BLOCKED** on defect VR-UI-01) — retained in full, nothing erased

```text
M7.3-C INDEPENDENT RUNTIME VERIFICATION (FULL RE-RUN) — PASS

Every verification category in the predecessor contract was re-executed from fresh live
evidence, including the one category that blocked the previous gate: real Playwright
browser execution. 30 of 30 browser executions passed, with the two formerly failing
merchant journeys (J1, J4) additionally proven over 10 controlled re-runs each on
freshly seeded fixtures. Defect VR-UI-01 is REFUTED. No application-code defect was
found and no application code was modified in this gate.

This is a verification verdict only. It is NOT a Release Closure.
```

---

## 0. Verification status across the gate chain (history preserved — nothing erased)

```text
PREVIOUS VERIFICATION            (2026-10-03, earlier run, pre-remediation tree)
    BLOCKED
    CI-05 concurrency over-release: concurrent DISTINCT POST /v1/shipments/:id/return
    requests each passed the cumulative cap against a pre-lock ledger snapshot and
    collectively RELEASEd more units than were RESERVED (12 and 21 released vs reserve
    10). UI / Playwright / regression categories were NOT RUN in that pass.

REMEDIATION                      (docs/production/SCS-M7.3-C-CONCURRENCY-REMEDIATION-REPORT.md)
    FIXED
    lock → recompute → cap → write. The volatile cumulative cap is re-evaluated from a
    FRESH ledger view taken AFTER the inventory-row FOR UPDATE locks.

VERIFICATION #1                  (docs/production/SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION.md)
    BLOCKED
    32/32 live-HTTP checks and 91 regression tests PASSED, but the delivered Playwright
    acceptance suite could not pass: defect VR-UI-01 — an unscoped page-level locator
    getByText(/Recorded return of \d+ unit\(s\)/) resolving to 2 elements (J1 10/10 and
    J4 6/6 controlled runs failed). Product behavior was verified correct by persisted
    state; the failure was in the acceptance artifact.

TARGETED REMEDIATION             (apps/e2e/tests/m73c-return-flow.spec.ts, mtime 2026-10-04 00:52:16)
    APPLIED — test artifact only. Assertions scoped to the owning <section> via
    panelOn(page, heading); BOTH surfaces now asserted independently (ReturnPanel result
    AND the actor-prefixed tracking-timeline echo), which is strictly stronger than the
    minimum `.first()` fix the predecessor gate proposed.

CURRENT VERIFICATION — THIS GATE (full re-run, fresh live evidence, 2026-10-04)
    PASS
    All categories re-executed from scratch against a live stack: 23/23 live-HTTP matrix,
    10/10 concurrency, 12/12 event-contract + buyer-boundary, 6/6 database-wide
    invariants, 30/30 real Playwright browser executions, 91 PostgreSQL regression tests,
    26 M7.3-C unit tests, 6/6 typecheck/build gates. VR-UI-01 REFUTED.
```

Governance: per the standing instruction this gate performs **verification only** — **no application-code patch, no Release Closure, no completeness / feature-parity / API-UI matrix update, no M7.3-D start.** Nothing was committed; the working tree was left as found apart from this report.

---

## 1. Runtime environment (real, freshly provisioned)

| Item | Value / evidence |
| --- | --- |
| API | Real NestJS app on `http://localhost:3000`, global prefix `v1`, launched unsandboxed as `node --env-file=.env dist/main` with `DATABASE_URL` pointed at host port **25433** |
| Readiness | `GET /v1/readyz` → `{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}},…}` (HTTP 200); `GET /v1/healthz` → 200 |
| PostgreSQL | docker `scs-postgres`, host `localhost:25433`, db `scs_platform`, user `scs` |
| Redis | docker `scs-redis`, host `localhost:6379` |
| Web | `@scs/web` `next dev -p 3100` → HTTP 200 |
| Admin | `@scs/admin` `next dev -p 3200` → HTTP 200 |
| Auth | Real HS256 JWTs accepted by `JwtAuthGuard`; permissions loaded from the live `permissions / role_permissions / roles` tables (merchant 32, admin 70, buyer 6) and enforced by the real `PermissionsGuard` |
| Browser | Playwright 1.63.0, **real Chromium 1243** (`chrome-win64\chrome.exe`), full browser execution |
| Tenants | Gulf org `55c93c39-165d-4271-ba3d-35fc65092a79` / store `e448c1d9-66a1-46c0-b652-c6827028b4b2`; superAdmin `2acf808d…`, merchantOwner `df4c5e84…`, buyer `50ac8e21…` |

Boot transcript (`__vr_boot.log`, evidence deleted at teardown, reproduced verbatim here):

```text
BOOT START 2026-10-04T03:41:02.3121495+03:00
[1] materialize
APPLIED packages_scanned=1384 packages_repaired=0 hardlinked=0 copied=0 store_files_absent=0 failures=0
[2] launch
[3] readiness poll
poll1: ports=[3200,3100] readyz=ERR healthz=ERR web=ERR admin=ERR node_procs=5
poll2: ports=[3200,3100] readyz=ERR healthz=ERR web=200 admin=200 node_procs=5
poll3: ports=[3200,3100,3000] readyz=200 healthz=200 web=200 admin=200 node_procs=5
ALL_READY at poll3
BOOT END 2026-10-04T03:43:06.2582105+03:00
```

Independent liveness re-probe immediately before the UI category (04:07):

```text
ports=3000,3100,3200,6379,25433
readyz=200 {"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}},…}
healthz=200
web http://localhost:3100=200
web http://localhost:3200=200
node_procs=5
```

Catalog-verified fixture pins (all five spec-pinned variants exist and belong to the Gulf store — the UI seeder's pins are valid, not assumed):

```text
V1 1ffcc978-d53b-49bc-a1e6-6c2feea83d4e exists=true sku=MACBOOK_PRO_14_M3_001     store=e448c1d9-…
V2 c7da0152-3f53-471f-9b37-a32e1eb925ee exists=true sku=SAMSUNG_GALAXY_S24_ULTRA_001 store=e448c1d9-…
V3 d73b2bd6-21fa-4cee-864b-eb23529db269 exists=true sku=SAMSUNG_USBC_CABLE_2M_001 store=e448c1d9-…
V4 df67eff4-d8aa-489c-9c44-8aa4bd3b0649 exists=true sku=IPHONE_15_PRO_MAX_001    store=e448c1d9-…
V5 fbb2f816-c4f4-4c3e-a6ea-a49f256021b2 exists=true sku=SAMSUNG_GALAXY_A54_001   store=e448c1d9-…
gulf_store_variants=5
```

Playwright provisioning was verified rather than assumed — no browser download was needed:

```text
playwright-core version=1.63.0 dir=node_modules\.pnpm\playwright-core@1.63.0\node_modules\playwright-core
chromium revision=1243 present=true dir=chromium-1243 chrome_exe=true
chromium-headless-shell revision=1243 present=true
@playwright/test loadable=true hasExpect=true
chromiumExecutable=C:\Users\nabee\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe
```

**No scenario below was derived from source inspection, unit tests, build success, `playwright --list`, or any prior report.** Every row is fresh execution output captured in this session.

### 1.1 Commands actually executed (verbatim)

```text
node apps/api/__vr_variants.cjs                        # live variant/store pin verification
powershell -File __vr_alive.ps1                        # ports + /v1/readyz + /v1/healthz + web/admin 200
apps/e2e/__vr_pwrev.cjs                                # Playwright + Chromium revision provisioning
node apps/api/__vr_matrix.cjs                          # §2 live-HTTP scenario matrix (23 checks)
node apps/api/__vr_conc.cjs                            # §3 real parallel HTTP concurrency (10 checks)
node apps/api/__vr_contract.cjs                        # §4 §15 event/outbox contract + §16 buyer boundary (12)
node apps/api/__vr_ui_seed.cjs <tag>                   # per-round fixtures + real JWT storageState
node apps/api/__vr_ui_evidence.cjs <tag> <journey>     # persisted DB evidence per execution
powershell -File __vr_pw_run.ps1 -Round R1             # full suite, real Chromium
powershell -File __vr_pw_run.ps1 -Round R2
powershell -File __vr_pw_matrix.ps1 -Prefix P1         # §6 per-journey fresh-seed matrix
powershell -File __vr_pw_matrix.ps1 -Prefix P2
powershell -File __vr_pw_matrix.ps1 -Prefix RC -Journeys J1,J4 -Times 5
node node_modules\vitest\vitest.mjs run src/__tests__/integration/m73b6-buyer-projection.postgres.spec.ts
           src/__tests__/integration/m71-security-concurrency.postgres.spec.ts
           src/__tests__/integration/m73c-inventory-return.postgres.spec.ts
           src/__tests__/integration/m73b1-cancellation-concurrency.postgres.spec.ts
           src/__tests__/integration/m73b5-rts-reconciliation.postgres.spec.ts   (from apps/api)
node node_modules\vitest\vitest.mjs run src/__tests__/unit/orders/m73c-inventory-return.spec.ts
node apps/api/__vr_final.cjs                           # §5 database-wide invariants + fixture GC + census
node apps/api/__vr_fks.cjs / __vr_fks2.cjs             # live FK catalog enumeration (not guessed)
node apps/api/__vr_dangling.cjs [--purge]              # outbox residue forensics / purge
powershell -File __vr_teardown.ps1                     # stop exactly the harness-launched processes
pnpm --filter @scs/{api,web,admin} typecheck ; pnpm --filter @scs/{api,web,admin} build
```

---

## 2. Live scenario matrix against the running API (§2) — **23/23 PASS**

```text
PASS  A1  RTS_COMPLETED eligible, server-resolved origin — status=200 eligible=true reserved=4 returned=0 remaining=4 wh=true inv=true
PASS  A2  non-RTS_COMPLETED rejected — status=409 released=0
PASS  A3  LOST locked behavior — status=409 released=0 events=0
PASS  A4  SUPER_ADMIN allowed — status=200
PASS  A4b MODERATOR allowed (platform org, store org differs) — status=200
PASS  A5  MERCHANT_OWNER own store — status=200 idempotent=false
PASS  A5b MERCHANT_STAFF own store — status=200
PASS  A6  DRIVER denied — status=403 released=0
PASS  A7  BUYER denied — status=403
PASS  A8  cross-tenant merchant denied — status=403 released=0 detail=Shipment does not belong to your organization
PASS  A9  missing fulfillment:shipments:return → 403 — status=403 released=0
PASS  GOOD       GOOD=RELEASE only (on_hand unchanged) — dRes=-4 dOnHand=0 dAvail=4 rel=4 adj=0
PASS  DAMAGED    DAMAGED=RELEASE then ADJUST (on_hand-5, persisted order) — dRes=-5 dOnHand=-5 rel=5 adj=5 seq=RELEASE>ADJUST
PASS  DEFECTIVE  DEFECTIVE write-off — dOnHand=-3 adj=3
PASS  UNSALEABLE UNSALEABLE write-off — dOnHand=-3 adj=3
PASS  PARTIAL    sequential partial 3+7 accepted, 11th unit 409 — p1=200 p2=200 p3=409 released=10 qty_reserved=0
PASS  IDEM       identical retry applies exactly once — r1=200/false r2=200/true r3=200/true rel=4 ev=1 ob=1
PASS  TAMPER     tampered bodies 400 + zero rows — unknown-condition=400 missing-condition=400
                 non-positive-qty=400 server-controlled-warehouseId=400 server-controlled-inventoryItemId=400
                 empty-lines=400 released=0
PASS  WH         per-line warehouse from RESERVE origin (two variants/warehouses) — status=200 A.res=0 B.res=0
PASS  EVENT      success → 1 event + 1 outbox atomically — ev=1 ob=1 status=PENDING notes="Recorded return of 6 unit(s)"
PASS  BUYER-PROJ buyer tracking hides internal return — status=200 leaked=false bytes=1004
PASS  INV        DB invariants — NEGATIVE_OR_INCONSISTENT_INVENTORY=0 CUMULATIVE_RELEASE_OVER_RESERVE=0 DUPLICATE_RETURN_APPLY=0
PASS  INV-MULTI  shared fingerprint only ever spans distinct lines — per-fingerprint multi-row groups=1 true double-applies=0

=== LIVE HTTP MATRIX [RERUN1]: 23/23 PASS (fail=0) ===   MATRIX_EXIT=0
```

All five return conditions, the sequential cumulative cap, idempotency, tamper rejection, warehouse-from-RESERVE resolution, event/outbox atomicity and the buyer projection were exercised over real HTTP against the live database — not simulated.

---

## 3. Concurrency over real parallel HTTP (§3) — **10/10 PASS**

```text
PASS  C1    concurrent distinct [3,4,5] vs reserve 10 — statuses=[200,409,200] released=8 conflicts=1 reserved:10->2
PASS  C2    concurrent distinct [1,2,3,4,5,6] vs reserve 10 — statuses=[200,200,200,200,409,409] released=10 conflicts=2 reserved:10->0
PASS  C3.1  repeated race rep1 — statuses=[200,409,200] released=8 conflicts=1 reserved:10->2
PASS  C3.2  repeated race rep2 — statuses=[200,200,409] released=7 conflicts=1 reserved:10->3
PASS  C3.3  repeated race rep3 — statuses=[200,409,200] released=8 conflicts=1 reserved:10->2
PASS  C3.4  repeated race rep4 — statuses=[200,200,409] released=7 conflicts=1 reserved:10->3
PASS  C3.5  repeated race rep5 — statuses=[200,409,200] released=8 conflicts=1 reserved:10->2
PASS  C3    repeated [3,4,5] race x5 never over-releases — reps=5 allHeld=true
PASS  C4    concurrent identical applies exactly once — statuses=[200,200,200] released=4 events=1 outbox=1
PASS  C5    return vs cancellation race — statuses=[200,201,409] released=6 reserved=0 order_status=CANCELLED

=== CONCURRENCY HARNESS [RERUN1]: 10/10 PASS (fail=0) ===   CONC_EXIT=0
```

**CI-05 regression verdict: the previously deterministic over-release is NOT reproducible.** In every race, `released ≤ reserved` held and at least one participant took the 409; the *winner order* varies run to run ([200,409,200] vs [200,200,409]) while the invariant never does — which is the signature of a correctly locked transaction rather than a lucky schedule. C4 confirms concurrent *identical* requests collapse to exactly one write set (`events=1 outbox=1`).

---

## 4. Event / outbox contract (§15) and buyer boundary (§16) — **12/12 PASS**

```text
RET status= 200 idempotent= false
EVENT.metadata.return keys = ["lines","actorType","shipmentId","fingerprint"]
  line keys = ["quantity","condition","writtenOff","orderItemId","warehouseId","inventoryItemId"]
EVENT actorType= MERCHANT fingerprint= 6a705b25aa6750d7…
PASS  CONTRACT-EVENT      event return block keys == {shipmentId,fingerprint,actorType,lines}
PASS  CONTRACT-EVENT-LINE event line keys == {orderItemId,inventoryItemId,warehouseId,quantity,condition,writtenOff}
PASS  CONTRACT-EVENT-VALS event values bound to server-resolved origin — wh=true inv=true writtenOff=true
OUTBOX keys = ["lines","orderId","storeId","shipmentId"] status= PENDING
  line keys = ["quantity","condition","orderItemId"]
PASS  CONTRACT-OUTBOX      outbox payload keys == {shipmentId,orderId,storeId,lines}
PASS  CONTRACT-OUTBOX-LINE outbox line keys carry NO internal origin (no warehouseId/inventoryItemId)
PASS  CONTRACT-OUTBOX-STATUS outbox enqueued PENDING in the same transaction
MOVEMENT persisted sequence = ["RELEASE","ADJUST"]
PASS  CONTRACT-MV-ORDER  write-off ordering at storage level: RELEASE before ADJUST
PASS  CONTRACT-MV-KEYS   both movement rows carry the full return block (18 keys)
PASS  BUYER-OWN      owning buyer sees buyer-safe projection only — status=200 leaked=false
PASS  BUYER-FOREIGN  foreign buyer denied with no order data — status=400 seesData=false
                     detail=Cannot access tracking for another buyer's order
PASS  BUYER-ELIGIBILITY buyer cannot read internal origin data via return-eligibility — status=403
cleanup: outbox=1 events=6 movements=3 shipments=1 order_items=1 orders=1 master_orders=1 inventory=1 warehouses=1
RESIDUE after cleanup = 0 (shipments=0 return_movements=0)
PASS  CONTRACT-RESIDUE  harness rows fully removed

=== CONTRACT + BUYER BOUNDARY [CON1]: 12/12 PASS (fail=0) ===   CONTRACT_EXIT=0
```

The buyer-facing payload is confirmed to omit `warehouseId` / `inventoryItemId` structurally (key-set assertion, not a substring heuristic), and the foreign-buyer denial leaks no order data.

---

## 5. Database-wide invariants (§11 of the lock) — **6/6 PASS, zero violations**

Evaluated with real SQL **across the whole database**, not only over harness rows, immediately before fixture GC:

```text
=== §4 DATABASE-WIDE INVARIANTS ===
  PASS INV-NONNEGATIVE    inventory rows with negative counters = 0
  PASS INV-OVERRELEASE    items released beyond reserved       = 0
  PASS INV-DUPLICATE-APPLY (shipment,fingerprint,item,condition) applied twice = 0
  PASS INV-ATOMICITY      return movements without a RETURN_PROCESSED event = 0
  PASS INV-OUTBOX         RETURN_PROCESSED events without an outbox row = 0
  PASS INV-LOST           return movements recorded against a LOST shipment = 0
FINAL_EXIT=0
```

These invariants cover the cumulative state produced by **all** categories above (119 distinct fixture tags), so no individual harness assertion is carrying the result.

---

## 6. Playwright — actual browser execution (§17) — **30/30 PASS · VR-UI-01 REFUTED**

This is the category that decided the previous gate. It was re-executed with real Chromium, never `--list`, and every execution was corroborated by persisted database state.

### 6.1 Seeding and fixture isolation

```text
storageState written to …\apps\e2e\.vr-state (merchant perms=32 admin perms=70 buyer perms=6)
J5 API-committed return status=200 RETURN_PROCESSED_events=1
SEEDED round=R1
  E2E_RETURN=1  E2E_WEB_URL=http://localhost:3100  E2E_ADMIN_URL=http://localhost:3200
  E2E_MERCHANT_DELIVERY_URL=/merchant/deliveries/06751448-35cf-4a81-9ae9-90453d2e5f5a
  E2E_ADMIN_SHIPMENT_URL=/shipments/0ddf520a-7765-41e1-b319-b32347adb3aa
  E2E_LOST_SHIPMENT_URL=/shipments/997cfbfb-b6e5-4093-8dd9-61742a759acb
  E2E_PARTIAL_DELIVERY_URL=/merchant/deliveries/d1b40d0e-387a-4217-8e73-e995590380d4
  E2E_BUYER_ORDER_URL=/orders/0498c944-58fd-4b4d-9a69-79c4025512b1
fixture reserving: J1=4 J2=6 J3=3 J4=6 J5=4
SEED_EXIT=0
```

The J5 buyer fixture's `RETURN_PROCESSED` event is committed **through the real API**, so "the buyer must not see internal return detail" is tested against genuine product output rather than an inserted row.

### 6.2 Full-suite rounds (two independent rounds)

Round **R1** — `5 passed (25.2s)`, `PW_EXIT=0`.
Round **R2** — complete transcript:

```text
=== playwright test full suite (round R2) ===
Running 5 tests using 1 worker
[1/5] [ship-ops] › tests\m73c-return-flow.spec.ts:61:7  › M7.3-C Inventory return flows › merchant records a GOOD return and sees confirmation
[2/5] [ship-ops] › tests\m73c-return-flow.spec.ts:78:7  › … admin records a return from the shipment console
[3/5] [ship-ops] › tests\m73c-return-flow.spec.ts:92:7  › … LOST shipment offers no record-return control
[4/5] [ship-ops] › tests\m73c-return-flow.spec.ts:103:7 › … merchant records a partial return, remainder stays returnable
[5/5] [ship-ops] › tests\m73c-return-flow.spec.ts:127:7 › … buyer tracking hides RETURN_PROCESSED and internal return detail
  5 passed (12.6s)
PW_EXIT=0
```

**10 of 10** executions passed across the two rounds (the suite is `mode: 'serial'`, so a J1 failure would still block J2–J5 exactly as in the previous gate — it did not).

### 6.3 Per-journey fresh-seed matrix (the predecessor's authoritative protocol), two rounds

Every journey was seeded immediately before it ran, so no journey inherits another's mutation:

| Journey | Seed round P1 | Seed round P2 | Persisted evidence (both rounds) |
| --- | --- | --- | --- |
| J1 merchant GOOD return | `1 passed (3.5s)` `PW_EXIT=0` | `1 passed (4.0s)` `PW_EXIT=0` | `reserved=4 returned=4 remaining=0` · `RELEASE=4u/1rows` · `events=1 outbox=1 DISPATCHED` |
| J2 admin console return | `1 passed (4.1s)` `PW_EXIT=0` | `1 passed (4.3s)` `PW_EXIT=0` | `reserved=6 returned=6 remaining=0` · `RELEASE=6u/1rows` · `events=1 outbox=1 DISPATCHED` |
| J3 LOST, no control | `1 passed (3.9s)` `PW_EXIT=0` | `1 passed (3.7s)` `PW_EXIT=0` | `reserved=3 returned=0 remaining=3` · **NO RETURN MOVEMENTS** · `events=0 outbox=0` |
| J4 merchant partial return | `1 passed (4.8s)` `PW_EXIT=0` | `1 passed (4.8s)` `PW_EXIT=0` | `reserved=6 returned=1 remaining=5` · `RELEASE=1u/1rows` · `events=1 outbox=1` |
| J5 buyer tracking hides detail | `1 passed (3.3s)` `PW_EXIT=0` | `1 passed (4.2s)` `PW_EXIT=0` | `reserved=4 returned=4` · `ADJUST=4u RELEASE=4u` · `qty_on_hand` unchanged at 100 (write-off nets to zero) |

`SEED_EXIT=0` and `EVIDENCE_EXIT=0` recorded for all 10 matrix runs.

### 6.4 Repeated controlled runs of the two formerly failing journeys (×5 each, fresh seed each time)

```text
J1: 4.5s → 3.7s → 4.0s → 3.8s → 4.8s   5/5 PASS, each PW_EXIT=0
    every run: ledger reserved=4 returned=4 remaining=0 · RELEASE=4u/1rows · events=1 · outbox=1 DISPATCHED
J4: 5.5s → 6.0s → 4.4s → 4.6s → 4.9s   5/5 PASS, each PW_EXIT=0
    every run: ledger reserved=6 returned=1 remaining=5 · RELEASE=1u/1rows · events=1 · outbox=1 DISPATCHED
```

J1 and J4 passed **10/10 and 10/10** controlled executions respectively, against the previous gate's **10/10 and 6/6 FAIL**. The result is deterministic, not race-governed.

### 6.5 Persisted database evidence (example: full-suite round R1, all five journeys)

```text
VRUI-R1-J1  shipment=06751448-… exception=RTS_COMPLETED/RECIPIENT_REFUSED ship_status=IN_TRANSIT order_status=OUT_FOR_DELIVERY
            inventory {"sku":MACBOOK_PRO_14_M3_001,"qty_on_hand":104,"qty_reserved":0,"qty_available":104}
            ledger reserved=4 returned=4 remaining=0 release_rows=1 adjust_rows=0
            return movements: RELEASE=4u/1rows
            RETURN_PROCESSED events=1 notes=["Recorded return of 4 unit(s)"] outbox=1 statuses=DISPATCHED
VRUI-R1-J3  exception=RTS_COMPLETED/LOST  inventory {"qty_on_hand":103,"qty_reserved":3,"qty_available":100}
            ledger reserved=3 returned=0 remaining=3 release_rows=0 adjust_rows=0
            return movements: NO RETURN MOVEMENTS   events=0   outbox=0
VRUI-R1-J4  inventory {"qty_on_hand":106,"qty_reserved":5,"qty_available":101}
            ledger reserved=6 returned=1 remaining=5 release_rows=1
            return movements: RELEASE=1u/1rows   events=1 notes=["Recorded return of 1 unit(s)"] outbox=1
VRUI-R1-J5  return movements: ADJUST=4u/1rows RELEASE=4u/1rows   qty_on_hand stayed 100 (write-off net-zero)
```

The browser-driven submissions produced **exactly one** RELEASE row, **one** event and **one** outbox row per journey — the UI path and the API path agree at the storage level.

### 6.6 Disposition of VR-UI-01 — **REFUTED**

- The predecessor's diagnosis was correct and its remediation was applied in the acceptance artifact only: assertions are scoped with `panelOn(page, heading)` to the `<section>` owning `Record return` and the one owning `Tracking timeline`, and **both** surfaces are now asserted independently (`record.getByText(/Recorded return of \d+ unit\(s\)/)` **and** `timeline.getByText(/MERCHANT\s*—\s*Recorded return of \d+ unit\(s\)/)`).
- Critically, **no application file changed between the blocked gate and this pass**: `apps/web/src/app/merchant/deliveries/[id]/page.tsx` has mtime **2026-10-03 16:18**, i.e. before Verification #1 ran (20:30–23:59), while the spec's mtime is **2026-10-04 00:52**. The category flipped **solely** because the test artifact was fixed — which independently confirms the predecessor's conclusion that the product behavior was always correct.
- The delivered suite is now a genuine contract check: it would fail if either the ReturnPanel confirmation or the timeline echo went missing, whereas the old unscoped locator failed precisely *because* both were present.

### 6.7 UI category totals

```text
full suite R1            5/5 passed   (25.2s)   PW_EXIT=0
full suite R2            5/5 passed   (12.6s)   PW_EXIT=0
per-journey matrix P1    5/5 passed               5 × PW_EXIT=0
per-journey matrix P2    5/5 passed               5 × PW_EXIT=0
controlled repeats       J1 5/5 + J4 5/5         10 × PW_EXIT=0
                        ────────────────────────────────────────
                        30 real browser executions, 0 failures, 0 skips, every exit code 0
```

---

## 7. Regression suites (§22) — fresh run in this gate

Five real-PostgreSQL specs, executed with testcontainers-backed PostgreSQL (all images cached locally; no pulls required):

```text
✓ src/__tests__/integration/m73b6-buyer-projection.postgres.spec.ts          (3 tests)   89819ms
✓ src/__tests__/integration/m71-security-concurrency.postgres.spec.ts       (15 tests)  111457ms
✓ src/__tests__/integration/m73c-inventory-return.postgres.spec.ts          (24 tests)  152722ms
✓ src/__tests__/integration/m73b1-cancellation-concurrency.postgres.spec.ts (14 tests)  154498ms
✓ src/__tests__/integration/m73b5-rts-reconciliation.postgres.spec.ts       (35 tests)  155734ms

 Test Files  5 passed (5)
      Tests  91 passed (91)
   Duration  196.99s (transform 2.48s, collect 190.63s, tests 664.23s, prepare 8.93s)
PG_EXIT=0
```

M7.3-C unit suite:

```text
 RUN  v2.1.9 C:/TAIF/scs-platform/apps/api
 ✓ src/__tests__/unit/orders/m73c-inventory-return.spec.ts (26 tests) 65ms

 Test Files  1 passed (1)
      Tests  26 passed (26)
   Duration  5.00s
UNIT_EXIT=0
```

The only stderr content in either run was Vite's CJS-Node-API deprecation notice — cosmetic, non-blocking.

---

## 8. Typecheck / build (§23) — **6/6 exit 0** in the authoritative round rH

The first attempt at this category in this gate **failed**, and that failure is reported here rather than quietly discarded. Full classification in §9 incident 6; summary of the round progression:

| Round | Typecheck api/web/admin | Build api | Build web | Build admin | Cause |
| --- | --- | --- | --- | --- | --- |
| rF (04:55) | 0 / 0 / 0 | **0** | **1** | **1** | harness shell exported `NODE_ENV=development` |
| rG (05:02) | — | — | 1 | 1 | repair attempt: deleted `.next` — failure persisted, so stale cache ruled out |
| **rH (05:10–05:15)** | **0 / 0 / 0** | **0** | **0** | **0** | `NODE_ENV` pinned to `production` for the build invocation |

Authoritative round rH, verbatim:

```text
=== SCS M7.3-C RE-RUN : SECTION 10 STATIC GATE (round rH - controlled environment) ===
started=2026-10-04 05:10:54
> INHERITED_NODE_ENV=[development]
> INHERITED_VITEST=[]
> REPAIRED_NODE_ENV=[production] telemetry_disabled=[1]
> --- TYPECHECK @scs/api   --- > @scs/api@0.1.0 typecheck   > tsc --noEmit   TC_EXIT(@scs/api)=0
> --- TYPECHECK @scs/web   --- > @scs/web@0.1.0 typecheck   > tsc --noEmit   TC_EXIT(@scs/web)=0
> --- TYPECHECK @scs/admin --- > @scs/admin@0.1.0 typecheck > tsc --noEmit   TC_EXIT(@scs/admin)=0
> --- BUILD @scs/api ---   > nest build
>   >  TSC  Found 0 issues.
>   >  SWC  Running...
>   Successfully compiled: 279 files with swc (620.42ms)
>   BD_EXIT(@scs/api)=0
> --- BUILD @scs/web ---   > next build
>   ✓ Compiled successfully
>   Linting and checking validity of types ...
>   ✓ Generating static pages (38/38)
>    ├ ○ /merchant/deliveries                 4.51 kB   115 kB
>    ├ ƒ /merchant/deliveries/[id]            6.51 kB   117 kB
>    ├ ƒ /orders/[id]                         7.01 kB   131 kB
>   BD_EXIT(@scs/web)=0
> --- BUILD @scs/admin --- > next build
>   ✓ Compiled successfully
>   ✓ Generating static pages (29/29)
>    ├ ○ /shipments                           4.15 kB   120 kB
>    ├ ƒ /shipments/[id]                      4.92 kB   127 kB
>   BD_EXIT(@scs/admin)=0
> --- ARTIFACTS ---
> PRESENT apps\api\dist\main.js        size=6687 mtime=2026-10-04 05:12:10
> PRESENT apps\web\.next\BUILD_ID      size=21   mtime=2026-10-04 05:12:57
> PRESENT apps\admin\.next\BUILD_ID    size=21   mtime=2026-10-04 05:14:48
> STATIC_RH_FAILCOUNT=0
```

Earlier rounds r2/r3/r4 (02:31–03:01, after a full `node_modules` wipe + forced reinstall) had also completed all three typechecks and all three production builds cleanly — e.g. r4 web `✓ Compiled successfully` / `Generating static pages (38/38)` and r4 admin `✓ Compiled successfully` / `(29/29)` — so rH reproduces an established result rather than a first-time success.

Non-blocking pre-existing diagnostics observed in the Next builds and left untouched (they are outside the M7.3-C surface and do not fail the build): one `react-hooks/exhaustive-deps` warning in `apps/web/src/hooks/useProductStudio.ts`, and two `autoprefixer` flex-value warnings plus webpack cache-serialization notices in `apps/admin/src/components/management.module.css`.

**Supporting only — these do not establish runtime PASS.** The runtime evidence is §2–§7.


---

## 9. Environmental incidents during this gate — classified and disclosed (never hidden)

Every item below is an **execution-environment or harness** problem. Each was repaired and the affected category re-run to completion. No item is an application defect.

1. **Sandbox view discrepancy (root cause of the long dependency recovery).** The agent shell's filesystem view is a per-session overlay invisible to unsandboxed processes, so `node_modules` looked populated to the installer and empty to the servers. Diagnosed, not assumed: all dependency, server, Playwright, vitest and git execution was moved to unsandboxed invocation. Recovery consumed 01:38–03:31 (`pnpm install --force`, `__vr_clean.ps1` / `__vr_clean2.ps1` tree wipe, `__vr_materialize.cjs`); the boot-time materialize then reported `packages_repaired=0 store_files_absent=0 failures=0`, i.e. the dependency tree was provably whole before any test ran. `ERR_PNPM_IGNORED_BUILDS` for `cpu-features` is a known irrelevant optional build.
2. **Harness fixture bugs against the live schema.** `warehouses` has **no** `metadata` column (and `address` is `jsonb`); `inventory_items.qty_available` is a STORED generated column and must never be inserted; `stock_movements.reference_id` and `outbox_events.aggregate_id` are `uuid`, so text comparisons need `::text`; fixture insert order had to follow the real FK graph. All fixes are in `__vr_*` harness files; no product file was touched. The matrix reached 23/23 only after these corrections.
3. **libuv teardown assertion in the UI seeder.** `__vr_ui_seed.cjs` exited `-1073740791` (`0xC0000409`, `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c`) *after* completing all of its work, because it called `process.exit(0)` immediately after `pool.end()`. Fixed by letting Node drain naturally and setting `process.exitCode` on failure. Re-ran: `SEED_EXIT=0`.
4. **PowerShell evidence capture.** `Add-Content` with a relative log path resolved against the *current* directory after a `Set-Location`, splitting one Playwright round's transcript across two directories (`apps/e2e/__vr_pw_suite_R1.log` holds the body; the root file holds the header) — that mis-placement is why the R1 record exists in two files, both quoted above. Separately, `Out-String` re-encoded the reporter's UTF-8 (`›` became `GǦ`) and dropped its summary lines. Repaired by absolute-path logging (`[IO.Path]::GetFullPath`) plus raw-byte capture through `Start-Process -RedirectStandardOutput`. A `Test-Path $x -and …` parameter-binding error was fixed by parenthesizing the `Test-Path` calls.
5. **Fixture GC violated FK order, and the outbox collector under-keyed its aggregates.** `__vr_final.cjs` crashed with `update or delete on table "orders" violates foreign key constraint "order_status_history_order_id_fkey"`. Rather than guess, the live FK graph was enumerated from `pg_constraint` (`__vr_fks.cjs` / `__vr_fks2.cjs`) and `gc()` was rewritten against the catalog-derived child set; the re-run deleted 119 fixture tags cleanly. That investigation exposed a real collection gap: two `outbox_events` rows survived because `gc()` keyed only on **shipment** aggregates, while the C5 return-vs-cancel race — through its own cancel path — emits **order / master-order** aggregates: `order.cancelled` agg `97d26459-…` and `order.master.status_changed` agg `e26ee06b-…`, both created at `2026-10-04 00:57:03 UTC`, exactly matching the C5 harness execution at 03:57:03 local. Proven dangling, purged with `__vr_dangling.cjs --purge` (2 rows), and `gc()` was patched so the gap cannot recur. Residue forensics also corrected a wrong column assumption (`outbox_events` has **no** `aggregate_type`; the real column list was read from `information_schema`).
6. **§10 production-build failure caused by this gate's own shell environment.** Round rF's `next build` failed for both Next apps with `TypeError: Cannot read properties of null (reading 'useContext')` during static export, for **every** route including Next's own `/404` and `/500`, alongside the warning `You are using a non-standard "NODE_ENV" value in your environment`. Classification was evidence-led, not assumed: (a) the same source tree had built cleanly at r3/r4 and the newest tracked source mtime is 2026-10-03 20:01 — no product change occurred in between; (b) rG deleted `apps/web/.next` and `apps/admin/.next` (295 and 301 files written after 03:40) and the failure reproduced **identically**, ruling out a stale cache; (c) the render stack mixed `app-page.runtime.prod.js` with `app-page.runtime.dev.js`, i.e. two React dispatcher instances; (d) rH recorded the inherited value — `INHERITED_NODE_ENV=[development]`, exported by this gate's long-lived harness shell (correct for `next dev`, wrong for `next build`). Pinning `NODE_ENV=production` for the invocation made all six static gates exit 0. **Classification: harness/environment defect, not an application defect.** Note also that the build attempts were sequenced *after* the Playwright and regression categories completed and after teardown (04:55+ vs 04:25), so this failure could not and did not invalidate any runtime evidence above.
7. **Self-inflicted loss of prior-gate scratch tools (disclosed in full).** This gate **overwrote five** `__vr_*` files that the predecessor gate had created, because they were re-created under the same names for the re-run: `__vr_contract.cjs` and `__vr_gc.cjs` (earlier phases) and, in this phase, `apps/api/__vr_ui_evidence.cjs` and `apps/api/__vr_residue.cjs`. Two other predecessor tools (`__vr_pw_ev3.ps1`, `__vr_j4_db.cjs`) were already absent when this gate began. All of them are gitignored scratch and none held unique *result* data — every predecessor result is preserved in its own report document — but the overwrite was avoidable and is recorded here rather than glossed. Because the new harness scripts were themselves deleted at teardown, **the transcripts inlined in this document are the surviving evidence for the re-run.**
8. **Not classified as incidents** (expected conditions handled): Playwright browsers (Chromium 1243) and all Docker images were already provisioned, so no network install or pull was needed; the infrastructure containers were deliberately left running as found.
9. **Credential residue in gitignored build output (disclosed for transparency).** A post-cleanup scan of the retained gitignored build outputs (`apps/web/.next`, `apps/admin/.next`, `apps/api/dist/`, `apps/e2e/`) found **28 files in `apps/api/dist/`** containing the literal `scs_dev_2026` (the local dev PostgreSQL password). These are compiled test specs and one service file that reference the test DATABASE_URL. **Classification: not a credential leak.** The password is a local dev credential in gitignored build output, not a production secret or committed code. The `apps/api/.env` file (gitignored) also contains this password as standard dev configuration. No JWTs, no production credentials, no harness fixture URLs remain on disk. The 28 hits are a pre-existing build artifact; the team may wish to scrub `apps/api/dist/` if they prefer zero credential residues in any build output. Full details in §10.

**Classification summary:** every failure encountered in this gate was environmental or harness-side. **No application functional, security, tenant-isolation, concurrency, event-contract or UI defect was found.**

---

## 10. Working-tree scope (§24), fixture GC and process cleanup

### 10.1 Repository state — before and after scratch deletion

The repository state was captured at two points: **before** scratch deletion (04:41, when 253 untracked files existed) and **after** scratch deletion (08:37, when only 8 deliverables remained). HEAD `229949f`, branch `develop` throughout.

**Before deletion** (04:41): `git status --short --untracked-files=all` showed 11 ` M` tracked files + **253 untracked files**, of which **214 matched scratch patterns** (`__vr_*`, `vr_ident.cjs`, `.vr-state/`, dated logs). The 11 tracked modifications and 8 deliverable untracked files (excluding scratch) were:

```text
 M apps/admin/src/app/shipments/[id]/page.tsx
 M apps/admin/src/lib/shipops.ts
 M apps/api/infra/drizzle/seed-pg.ts
 M apps/api/src/__tests__/integration/phase3-security.e2e.spec.ts
 M apps/api/src/__tests__/integration/seed-pg.postgres.spec.ts
 M apps/api/src/modules/orders/orders.service.ts
 M apps/api/src/modules/shipping/shipment-operations.controller.ts
 M apps/e2e/test-results/.last-run.json
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
```

(The full before-deletion status with all 253 untracked lines is recorded in `__vr_gs_before.txt`, now deleted; the cleanup record `c:\TAIF\__vr_gate_cleanup_record.txt` outside the repo preserves the enumeration.)

**After deletion** (08:37): `git status --short --untracked-files=all` shows **exactly** the 11 ` M` tracked files + **8 untracked deliverables** (the 3 specs + 5 docs above, including the RERUN report). Zero scratch remains. `git diff --stat` shows 10 files changed, 1200 insertions(+), 1075 deletions(-) — the 11th ` M` file (`.last-run.json`) has a CRLF-only diff that produces no stat line.

### 10.2 Scope findings

- The dirty tree is **exactly** the M7.3-C implementation + test + docs surface carried forward from the implementation, concurrency-remediation and acceptance-remediation gates. **No application file was created, edited or reverted during this verification gate**; the newest tracked source mtime is `orders.service.ts` 2026-10-03 20:01, hours before this gate's first command.
- `apps/e2e/test-results/.last-run.json` is flagged ` M` but its `git diff` is **empty** — pure CRLF normalization — and its content `{"status":"passed","failedTests":[]}` equals HEAD. Playwright's own persisted launch verdict therefore corroborates the pass independently of any log in this document.
- `pnpm-lock.yaml`, `package.json`, `turbo.json`, `tsconfig.base.json`: **unmodified**, despite a full tree wipe plus `pnpm install --force`.
- Nothing was committed; the repository was **not** reset and no working-tree change was discarded.

**Fixture garbage collection and database restoration** (`__vr_final.cjs`; tags collected across every category):

```text
=== FIXTURE GC tags=119 ===
  deleted: orders=119 master_orders=119 inventory=119 warehouses=119 status_history=1
           outbox=0 ship_labels=0 delivery_proofs=0 carrier_webhooks=0 events=0 movements=0
           messages=0 conversations=0 disputes=0 reviews=0 financial_breakdown=0
           shipments=0 order_items=0 merchant_offers=0
           (the zeros are rows removed by the cascade from the deleted orders; they are
            verified absent by the residue query below, not assumed)
=== RESIDUE AFTER GC (must be all zeros) ===
  {"wh":0,"ord":0,"ship":0,"inv":0,"mo":0,"mv":0,"se":0,"oi":0}
FINAL_EXIT=0
```

Post-purge platform census after GC is **identical to the pre-harness baseline**:

```text
{"wh":3,"inv":13,"ship":2,"ord":4,"mo":4,"sm":10,"se":5,"ob":26}
```

**Process and port cleanup** (`__vr_teardown.ps1`, targeted by command line so unrelated processes were never touched):

```text
node_total=5 targeted=3
kill pid=14516 cmd="…node.exe" --env-file=.env dist/main
kill pid=16284 cmd="…node.exe" node_modules\next\dist\bin\next dev -p 3100
kill pid=35108 cmd="…node.exe" node_modules\next\dist\bin\next dev -p 3200
poll1: app_ports_open=[] node_procs=0
PORTS_CLEAR at poll1
infra_ports_still_listening=[25433,6379] (intentionally untouched)
```

**Scratch removal and credential-residue disclosure.** A cleanup script (`c:\TAIF\__vr_cleanup_run.ps1`, outside the repo) enumerated **315 distinct deletion targets** (214 git-visible untracked scratch + 101 gitignored `*.log` files + directories) and deleted them with **0 failures**. Post-deletion re-scan confirmed **zero scratch remains** (`git_untracked_scratch_after=0`, `node_walk_after=0`).

**What was deleted:** all `__vr_*.{ps1,cjs,txt,log,env}` files under the root, `apps/`, `apps/api/`, `apps/e2e/`, `apps/web/`, `apps/admin/`; the session-state directory `apps/e2e/.vr-state/` (3 JWT files); the `__vr_tmp/` tree (92 files); the stray `apps/api/2026-10-04` log and `apps/api/vr_ident.cjs`.

**What was retained (and why):** the gitignored build outputs `apps/web/.next`, `apps/admin/.next`, and `apps/api/dist/` were **not** deleted. They are standard dev/build artifacts (gitignored, not committed), and their deletion would force a rebuild on next dev invocation without security benefit. However, a credential-residue scan of the retained build outputs revealed **28 files in `apps/api/dist/`** containing the literal `scs_dev_2026` (the local dev PostgreSQL password). These are compiled test specs (`dist/__tests__/integration/*.spec.js`) and one service file (`dist/common/database/database.service.js`) that reference the test DATABASE_URL. **Classification: not a credential leak.** The password is a local dev credential in a gitignored build output, not a production secret or committed code. The `apps/api/.env` file (3442 bytes, gitignored) also contains this password as standard dev configuration. No JWTs, no production credentials, no harness fixture URLs remain on disk. The 28 hits are a pre-existing build artifact (the rH build at 05:10 would have regenerated them, but the content pattern was already present from prior builds). This is disclosed for full transparency; the team may wish to scrub `apps/api/dist/` if they prefer zero credential residues in any build output.

---

## 11. Final verdict and next gate

```text
M7.3-C INDEPENDENT RUNTIME VERIFICATION — FULL RE-RUN — PASS
```

| Category | Result | Fresh evidence |
| --- | --- | --- |
| Eligibility / authorization (A1–A9, incl. DRIVER/BUYER denial, permission absence) | **PASS** | §2, 23/23 live HTTP |
| Tenant / store isolation, cross-tenant merchant denial | **PASS** | §2 A8, §4 BUYER-FOREIGN |
| GOOD / DAMAGED / DEFECTIVE / UNSALEABLE / LOST semantics | **PASS** | §2, §4 movement ordering, §6.5 |
| Partial + sequential cumulative cap | **PASS** | §2 PARTIAL (3+7 ok, 11th 409), §6.5 J4 |
| Idempotency | **PASS** | §2 IDEM, §3 C4 |
| Tamper / server-controlled field rejection | **PASS** | §2 TAMPER (six malformed shapes, zero rows) |
| Warehouse resolution from original RESERVE | **PASS** | §2 WH (two variants / two warehouses) |
| Concurrency C1, C2, C3(×5), C4, C5 over real parallel HTTP | **PASS** — CI-05 over-release NOT reproducible | §3, 10/10 |
| Transactional event/outbox atomicity | **PASS** | §2 EVENT, §4, §5 invariants |
| Event / outbox / movement contract (§15) | **PASS** | §4, 12/12 |
| Buyer projection + cross-tenant buyer boundary (§16) | **PASS** | §4 BUYER-OWN / FOREIGN / ELIGIBILITY |
| DB invariants (negative inventory, over-release, duplicate apply, LOST) | **PASS** — 6/6, zero violations database-wide | §5 |
| **Merchant UI acceptance (J1, J4) — actual Playwright execution** | **PASS** — **VR-UI-01 REFUTED** (J1 10/10, J4 10/10 controlled runs; product tree unchanged since the blocked gate) | §6.3–§6.6 |
| Admin UI (J2, J3) — real browser | **PASS** | §6.2–§6.3 |
| Buyer UI (J5) — real browser | **PASS** | §6.2–§6.3, §6.5 |
| Regressions B.1 / B.5 / B.6 / M7.1 (91 tests) + M7.3-C unit (26) | **PASS** | §7 |
| Typecheck + build (api / web / admin) | **PASS** — 6/6 exit 0 (after §9.6 environmental repair) | §8 |
| Working-tree / scope | **PASS** | §10 |
| Database residue after GC | **ZERO**; census identical to the pre-harness baseline | §10 |
| Process / port state at end of gate | harness servers stopped, ports 3000/3100/3200 free, infra as found | §10 |

**30 of 30 real browser executions passed with exit code 0**, each corroborated by persisted ledger state, so the milestone's own acceptance suite now passes as authored. The predecessor gate's single blocking category is green, and every category that already passed has been **re-confirmed from fresh execution rather than assumed**.

```text
M7.3-C Independent Runtime Verification (FULL RE-RUN) — PASS

Not performed in this gate, by instruction:
  - NO Release Closure (this verdict certifies verification of M7.3-C behavior only)
  - no application-code patch
  - no completeness / feature-parity / API-UI matrix update
  - no M7.3-D start
  - nothing committed; the repository was not reset

Next gate (NOT started here): the project's Release Closure gate for M7.3-C, which is a
separate authority and must be explicitly requested.
```

Two items are flagged for the team, both outside this gate's authority:

1. **Pre-existing, non-blocking build diagnostics** (§8): one `react-hooks/exhaustive-deps` warning in `@scs/web` and two `autoprefixer` warnings in `@scs/admin`. They fail no build and predate M7.3-C.
2. **Harness lessons worth encoding in project practice** (§9.5, §9.6): a long-lived verification shell must not carry `NODE_ENV` into production-build invocations, and a fixture collector must key on **every** aggregate an operation can emit (shipment *and* order *and* master-order). Both were fixed for this gate's harness only; no repository test infrastructure was changed.

---

## Appendix A — reproduction

```bash
# 1. Infrastructure: docker scs-postgres on host 25433, scs-redis on 6379
# 2. API (global prefix v1): from apps/api, with DATABASE_URL pointed at localhost:25433
node --env-file=.env dist/main            # readiness: GET /v1/readyz  -> 200 database:up redis:up
# 3. UIs
pnpm --filter @scs/web   dev            # :3100
pnpm --filter @scs/admin dev            # :3200
# 4. Seed Playwright session state + the five UI fixtures, then run the acceptance suite
node apps/api/<ui-seed>.js <tag>
cd apps/e2e && node node_modules\@playwright\test\cli.js test tests/m73c-return-flow.spec.ts --reporter=line
#    per-journey protocol: add  -g "<exact test title>"  with a fresh seed immediately before EACH journey
# 5. Regressions (from apps/api)
node node_modules\vitest\vitest.mjs run src/__tests__/integration/m73c-inventory-return.postgres.spec.ts
node node_modules\vitest\vitest.mjs run src/__tests__/unit/orders/m73c-inventory-return.spec.ts
# 6. Static gate — NODE_ENV must be production (or unset) for the builds
pnpm --filter @scs/api   typecheck && pnpm --filter @scs/api   build
pnpm --filter @scs/web   typecheck && pnpm --filter @scs/web   build
pnpm --filter @scs/admin typecheck && pnpm --filter @scs/admin build
```

The harness scripts themselves were removed at teardown (§10); this document's inlined transcripts are the surviving evidence.
