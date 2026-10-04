# SCS-M7.3-C — CONCURRENCY REMEDIATION REPORT

| | |
|---|---|
| **Milestone** | M7.3-C — Returns (inventory return-to-stock) · targeted **concurrency remediation** |
| **Type** | Backend defect fix (`recordReturn` cap validation) + unit/PostgreSQL test extension + live re-probe |
| **Branch** | `develop` |
| **Baseline commit** | `229949f934f6bfe447d4bce600a84fcbfe4dc365` (M7.3-B.6 Ship-Ops console) |
| **Working HEAD** | `229949f` — M7.3-C changes (implementation + this remediation) are uncommitted in the working tree |
| **Specification** | `docs/production/SCS-M7.3-C-BUSINESS-RULES-ARCHITECTURE-LOCK.md` (LOCKED) |
| **Defect source** | `docs/production/SCS-M7.3-C-INDEPENDENT-RUNTIME-VERIFICATION.md` — verdict **BLOCKED** (CI-05 over-release) |
| **Date** | 2026-10-03 |
| **Status** | **FIXED (remediation)** — the concurrency defect no longer reproduces under focused unit, real-PostgreSQL integration and the live runtime probe. **This does NOT convert the prior Independent Runtime Verification to PASS.** |

> Remediation-phase artifact only. **No release closure was created. The completeness matrix, API/UI
> parity matrix and roadmap are NOT marked complete.** Per the remediation brief §20, the previous
> Independent Runtime Verification **remains BLOCKED and is NOT retroactively converted to PASS**; the
> next required gate is a **FULL RE-RUN** of M7.3-C Independent Runtime Verification. All command
> output below was freshly re-run in this remediation session and is embedded verbatim.

---

## 1. Objective

Remediate the **critical, deterministic inventory-concurrency defect** reproduced during the M7.3-C
Independent Runtime Verification (finding **CI-05** / BCF-004 / ACF-006 / ACF-008): concurrent partial
returns could together **release more than the original `RESERVE`**, corrupting inventory accounting.

Constraints honored (brief §1–§11): targeted remediation only — **lock first → recompute ledger →
validate cap → write**; do not weaken the cap (over-return → HTTP 409, zero mutation); preserve
idempotency (CI-06), deterministic row-lock order (CI-11, `inventoryItemId ASC`), movement semantics
(GOOD = `RELEASE` only; DAMAGED/DEFECTIVE/UNSALEABLE = `RELEASE` then `ADJUST`), cancellation-wins and
atomicity. **Do NOT modify `settleStockForStatus`.** No migration, no FSM state, no unrelated files.

---

## 2. Root cause

`recordReturn()` built the return ledger view **once at transaction start**, took the inventory-row
`SELECT … FOR UPDATE` locks **afterwards**, then validated the **cumulative return cap against that same
pre-lock snapshot**:

```text
const view = await this.buildReturnLedgerView(tx, orderId);   // ← pre-lock ledger snapshot
... FOR UPDATE locks on inventory_items ...                    // ← lock acquired AFTER the read
... cumulative cap computed from `view` ...                    // ← stale under READ COMMITTED
```

Under PostgreSQL **READ COMMITTED**, every concurrent transaction reads the ledger *before* any sibling
has committed, so each observes `returned = 0`. When they then release, their combined `RELEASE` exceeds
the reservation. The reproduced failure was:

```text
reserve = 10 · parallel requests = [3,4,5]
statuses = [200, 200, 200]   →   RELEASED = 12   (> 10)   →   qty_reserved driven below zero
```

---

## 3. Production change (the fix)

**File:** `apps/api/src/modules/orders/orders.service.ts` → `recordReturn()` **only.**

| Aspect | Before | After |
|---|---|---|
| Ledger view variable | `const view = …` (single pre-lock read) | `let view = …` (pre-lock read retained **only** for stable line → `inventoryItemId`/`warehouseId` resolution derived from `RESERVE`) |
| Post-lock re-read | *(absent)* | Added immediately **after** the `FOR UPDATE` lock loop and **before** idempotency + cap: `view = await this.buildReturnLedgerView(tx, orderId);` |
| Cap validation | computed from the **pre-lock** snapshot | computed from the **post-lock** snapshot |

```ts
// CI-05 concurrency refresh: the inventory-row FOR UPDATE locks above are now
// held. Under READ COMMITTED any prior concurrent return has already committed
// by the time this tx acquires the lock, so re-reading the ledger here yields a
// fresh snapshot that already includes those committed RELEASE movements. The
// cumulative cap below MUST be validated against this post-lock view — reusing
// the pre-lock snapshot lets parallel returns each observe returned=0 and
// together release beyond the reserved quantity (the reproduced over-release).
view = await this.buildReturnLedgerView(tx, orderId);
```

**Nothing else in the file was altered.** `git diff --numstat` for `orders.service.ts` is
`425 0` ( **+425 / −0 , purely additive** ): no existing line anywhere in the file — including
`settleStockForStatus` — was modified or deleted. (Pre-remediation the file showed `+413` in the
verification report §A.1; the +12 delta is exactly this fix.)

---

## 4. Concurrency model — LOCK → RECOMPUTE → CHECK → WRITE

1. **Deterministic lock ordering** (`FOR UPDATE`, `inventoryItemId ASC`) is unchanged (CI-11).
2. Acquiring an inventory-row lock forces any prior concurrent return to have **already committed**.
3. The **post-lock re-read** of `buildReturnLedgerView` therefore sees those committed `RELEASE` rows.
4. The **cumulative cap** (`reserved − already-returned`) is validated against the fresh view; excess is
   rejected with **HTTP 409** *before* any movement is written (cap NOT clamped/softened).
5. **Idempotency** (CI-06) is still evaluated *after* locks but *before* the cap, so identical replays are
   recognized and are not falsely rejected.
6. Movement write, `shipment_events.RETURN_PROCESSED` and the outbox row remain inside the same
   transaction (atomicity), unchanged.

---

## 5. Tests (freshly re-run this session)

| Area | Command | Verbatim result |
|---|---|---|
| M7.3-C unit + PostgreSQL | `pnpm exec vitest run src/__tests__/unit/orders/m73c-inventory-return.spec.ts src/__tests__/integration/m73c-inventory-return.postgres.spec.ts` | `Test Files  2 passed (2)` · `Tests  50 passed (50)` → **unit 26/26**, **PostgreSQL 24/24** |
| API typecheck | `pnpm exec tsc --noEmit` | `TSC Found 0 issues` (exit 0) |
| API build | `pnpm exec nest build` | `Successfully compiled: 279 files with swc` (exit 0) |

**Test additions (brief §12 / §13):**

- **Unit** `m73c-inventory-return.spec.ts` (424 lines, 26 cases): staged-select fixtures extended for the
  added second `buildReturnLedgerView` call, and a **discriminating test `4b`** — pre-lock return rows `[]`
  but post-lock return rows `[{inv-1, qty 5}]` with reserved 5 and request 3 → **MUST reject `/Over-return/`**.
  This assertion **fails on the old code and passes on the fixed code**.
- **PostgreSQL** `m73c-inventory-return.postgres.spec.ts` (547 lines, 24 cases): added helpers
  `releasedForOrder(orderId)` / `expectInventoryInvariant(variantId)` and genuine-concurrency cases
  **C-PG-22** (`[3,4,5]` vs reserve 10 → `released ≤ 10` and ≥ 1 conflict), **C-PG-23** (`[1,2,3,4,5,6]` vs 10),
  **C-PG-24** (repeat `[3,4,5]` ×5 — no intermittent over-release; given an explicit `120_000 ms` timeout
  because 5 real checkout+race iterations exceed the default 5 s).

Key PostgreSQL cases observed green: `C-PG-17` (failed write persists **no** movement/event/outbox),
`C-PG-10/11/15` (idempotent replay applies exactly once), `C-PG-12/13` (cancellation-wins), `C-PG-22/23/24`
(no over-release).

---

## 6. PostgreSQL concurrency regression (freshly re-run)

```text
pnpm exec vitest run \
  src/__tests__/integration/m73b1-cancellation-concurrency.postgres.spec.ts \
  src/__tests__/integration/m73b5-rts-reconciliation.postgres.spec.ts \
  src/__tests__/integration/m73b6-buyer-projection.postgres.spec.ts \
  src/__tests__/integration/m71-security-concurrency.postgres.spec.ts

 → Test Files  4 passed (4)
      Tests  67 passed (67)   Duration  179.69s
```

Notable green guards: `B5-PG-26` (no inventory mutation during RTS lifecycle), `B5-PG-35` / `CON-B1-01..04`
(cancellation wins the race), `INV-B1-01` (stock released exactly once), `INJ-B1-01/02` (outbox failure →
full rollback / atomic commit), `B5-PG-15/16` (RTS idempotency), plus M7.3-B.6 buyer projection and
M7.1 security-concurrency suites.

---

## 7. Runtime concurrency probe (live API + real PostgreSQL)

Real API (`node dist/main` on `:3000`, `/v1/readyz → 200 {database: up, redis: up}`) against PostgreSQL on
host `25433`. Isolated per-fixture warehouse + `inventory` reserve = 10; genuine concurrent distinct
`POST /shipments/:id/return`; each fixture self-cleaned. **Verbatim:**

```text
three[1] 3,4,5: reserve=10 requested=[3,4,5](12) statuses=[200,200,409] RELEASED=7 events=2 conflicts=1 reserved:10->3 avail=97 → PASS
three[2] 3,4,5: reserve=10 requested=[3,4,5](12) statuses=[200,200,409] RELEASED=7 events=2 conflicts=1 reserved:10->3 avail=97 → PASS
three[3] 3,4,5: reserve=10 requested=[3,4,5](12) statuses=[200,409,200] RELEASED=8 events=2 conflicts=1 reserved:10->2 avail=98 → PASS
six[1]  1..6: reserve=10 requested=[1,2,3,4,5,6](21) statuses=[200,200,200,200,409,409] RELEASED=10 events=4 conflicts=2 reserved:10->0 avail=100 → PASS
six[2]  1..6: reserve=10 requested=[1,2,3,4,5,6](21) statuses=[200,409,200,409,409,200] RELEASED=10 events=3 conflicts=3 reserved:10->0 avail=100 → PASS
six[3]  1..6: reserve=10 requested=[1,2,3,4,5,6](21) statuses=[409,200,200,409,200,409] RELEASED=10 events=3 conflicts=3 reserved:10->0 avail=100 → PASS

OVER-RELEASE ANYWHERE: false
ALL ATTEMPTS HOLD CI-05 (released<=10, >=1 conflict, invariants valid): true
```

- **3,4,5 vs reserve 10:** `RELEASED = 7 / 7 / 8 (≤ 10)`, ≥ 1 HTTP 409 every run, `qty_reserved 10 → 3/3/2`, no over-release.
- **1,2,3,4,5,6 vs reserve 10:** `RELEASED = 10 exactly`, 2–3 HTTP 409s, `qty_reserved 10 → 0`, no over-release.
- Winner order varies run-to-run (lock winner is non-deterministic); **the invariant is not**. The original
  failure (`released = 12`, all `200`) **does not reproduce**.

---

## 8. Post-fix database invariants (live `db:25433`, after all tests + probes)

```text
NEGATIVE_OR_INCONSISTENT_INVENTORY=0
CUMULATIVE_RELEASE_OVER_RESERVE_ORDERS=0
TEST_WAREHOUSE_RESIDUE=0
TEST_ORDER_RESIDUE=0
ALL_INVARIANTS_HOLD=true
```

GOOD returns leave `qty_on_hand` unchanged; non-sellable write-off (`ADJUST`) fires only after `RELEASE`;
rejected over-returns produce **no** movement / event / outbox. All temporary verification fixtures were
self-cleaned.

---

## 9. Non-green aggregate-mock entries — classified as non-regressions

Per §25 discipline, each aggregate-suite failure was **reproduced → localized → compared with the diff →
run in isolation → classified**. None has a code path through `orders.service.ts`.

| Entry | Aggregate behavior | Isolation result | Classification |
|---|---|---|---|
| Clean in-memory mock suite (`*.postgres` / `*.e2e` / `*-postgres` excluded) | `81/82 files`, `1401/1402 tests`; sole failure `unit/shipping/webhook-rate-limiting.spec.ts` | **18/18 PASS in isolation** | Cross-file isolation/timing flake (Vitest "unawaited assertion" on the `ThrottlerGuard` introspection test), carrier-throttler domain — unrelated |
| `catalog-governance-roundtrip.spec.ts` §29 | failed only in the loaded aggregate run ("No recognized worksheets", re-import 10≠0) | **30/30 PASS in isolation** | Excel catalog-import cross-file pollution — unrelated |
| 11 file-level failures in the *first* aggregate run | `Hook timed out in 180000 ms` / `Test timed out in 5000 ms` | — | Testcontainers/Docker **resource starvation** while multiple heavy suites + build ran concurrently — environmental, not logical |

---

## 10. Scope verification (brief §17 / §18)

- **Files changed by THIS remediation:** `apps/api/src/modules/orders/orders.service.ts` (the fix) +
  `apps/api/src/__tests__/unit/orders/m73c-inventory-return.spec.ts` +
  `apps/api/src/__tests__/integration/m73c-inventory-return.postgres.spec.ts`.
- **`settleStockForStatus` modified:** **NO** (`orders.service.ts` diff is `+425 / −0`, purely additive).
- **Migration introduced:** **NONE** (no `.sql`, `schema.ts` or migration file in the diff).
- **FSM state introduced:** **NONE.**
- **Unexpected files:** **NONE for this remediation.** The other working-tree entries (admin/web
  shipops + delivery pages, `shipment-operations.controller.ts`, `seed-pg.ts`, `phase3-security.e2e.spec.ts`,
  `seed-pg.postgres.spec.ts`, `apps/e2e/tests/m73c-return-flow.spec.ts`, and the M7.3-C governance docs) are the
  **pre-existing M7.3-C implementation baseline from prior sessions** layered on `229949f`; they were **not**
  touched by this concurrency correction.
- **Sandbox artifacts removed:** the concurrency probe, invariant-check script, API restart/find scripts and
  all captured logs were deleted, and the dev API process started for the probe was stopped.

---

## 11. Environment notes

- PostgreSQL docker `scs-postgres` published on **host `localhost:25433`** (db `scs_platform`, user `scs`);
  Redis on `6379`. The API resolves `DATABASE_URL`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` and `S3_*`
  from the **process environment**; the runtime probe process was launched with those exports so live
  JWT auth (HS256) verified correctly.
- Vitest config `apps/api/vitest.config.ts`; PostgreSQL specs use Testcontainers
  (`postgis/postgis:16-3.4`). Docker-daemon readiness was healthy for the targeted runs; contention under
  concurrent heavy suites produced the timeouts noted in §9.

---

## 12. Remaining gaps / next gate

- UI/Playwright categories were **NOT re-run** in this remediation (brief §16); they belong to the next full
  independent verification pass.
- Fixing the defect demonstrates the CI-05 invariant now holds under focused unit, real-PostgreSQL and the
  live runtime probe — **remediation evidence, not an independent verification verdict.**

---

## 13. Final status

```text
M7.3-C CONCURRENCY REMEDIATION COMPLETE

Status: FIXED (defect remediated; over-release no longer reproduces under unit / PostgreSQL / live probe)

The previous Independent Runtime Verification remains BLOCKED and is NOT retroactively converted to PASS.

Next required gate:
M7.3-C INDEPENDENT RUNTIME VERIFICATION — FULL RE-RUN
```

No Release Closure created · M7.3-C **not** marked complete in governance matrices · M7.3-D **not** started.
