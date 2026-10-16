# P13 Phase 4 — Final Pilot Readiness Report

**Mandate sections:** §10 (mandatory stop conditions), §11 (report set), §12 (verdict).
**Baseline at authoring time:** branch `develop`, HEAD `ed6c30f 2026-10-14 test(migrations): verify
existence of migration 0062`. All Phase 4 work is **uncommitted** and lives in the working tree.

## Verdict (§12)

> # **PASS WITH DOCUMENTED LIMITATIONS**

Phase 4 delivered the operational controls §3–§6 require and proved them at runtime against real
PostgreSQL and a real Nest HTTP application: **93 freshly executed assertions across the two new
integration suites, all passing**, plus a 142-assertion six-spec cross-suite cluster and a full
regression with every failure classified. No pilot was activated, nothing was deployed, no production
flag or financial record was changed, and the 30-day
observation period was not started (§1 boundaries respected — see §2).

The verdict is not `PASS` because eight stop conditions remain genuinely unmet *for a production
pilot* (§6), chiefly that this repository contains **no production deployment configuration at all**,
so no control could be rehearsed against the target topology. The verdict is not `BLOCKED` because
**every limitation is either a documented absence of a production target, or a defect that was found,
fixed and re-verified in this phase** — and the system's resting state is fail-closed on all three
switches, so no unverified control is currently in a position to move money.

Per the mandate's warning that "a critical security or financial-control failure must not be
downgraded to a minor limitation": the three financial-control failures Phase 4 discovered are
reported as **defects found and remediated** (§5), not as limitations, and each carries a pinning test
(`HA-26`, `HA-28`, `HA-34`).

---

## 1. Evidence produced — the §11 report set

| # | Report | Mandate section | Claim level |
|---|---|---|---|
| 1 | `P13-PHASE-4-BASELINE-AND-GAP-ANALYSIS.md` | §2 | measured from the live repo and DB |
| 2 | `P13-PHASE-4-WORKER-EXCLUSIVITY-REPORT.md` | §3 | implemented + runtime-verified (WX-01…WX-12) |
| 3 | `P13-PHASE-4-MONITORING-AND-ALERTING-REPORT.md` | §4 | implemented + runtime-verified (AL-01…AL-24) |
| 4 | `P13-PHASE-4-KILL-SWITCH-AND-RECOVERY-REPORT.md` | §5 | implemented + runtime-verified (KS-01…KS-10) |
| 5 | `P13-PHASE-4-PILOT-CONTROLS-REPORT.md` | §6 | implemented, default-disabled, verified (PL-01…PL-13) |
| 6 | `P13-PHASE-4-HTTP-AUTHORIZATION-AND-SECURITY-REPORT.md` | §8 | implemented + runtime-verified (HA-01…HA-34) |
| 7 | `P13-PHASE-4-OPERATIONS-RUNBOOK.md` | §9 | procedures; each step labelled by how far it is evidenced |
| 8 | this report | §10–§12 | consolidated |

All eight are in `scs-platform/docs/production/`.

---

## 2. Scope discipline — what did **not** happen

| §1 prohibition | Status | How it is verifiable |
|---|---|---|
| No production deployment | **held** | no production manifest/Dockerfile exists in-repo; `git status` shows only local working-tree changes |
| No pilot activation | **held** | `feature_flags` has **no row** for `p13.pilot.enabled`; `p13_pilot_allowlist` has **0 rows**; `P13_PILOT_MODE` unset ⇒ `legacy` |
| No production worker enablement | **held** | `apps/api/.env` contains **no `P13_` variable**; `worker_leases` shows `holder_id IS NULL, epoch = 0, poll_failures = 0` — the protected job has never been acquired in this environment |
| No production flag/financial changes | **held** | `ops_controls` and `ops_control_audit` have 0 rows; `settlement_adjustments` has 0 rows in the development database |
| No 30-day observation start | **held** | no observation window was opened; the monitor is code + tests only |

The database queries backing this table were executed during this session (see the runbook §9 output;
all `SQL*_EXIT=0`).

---

## 3. Changed files

### 3.1 New operational module — `apps/api/src/modules/operations/` (11 files, 2,449 lines)

| File | Lines | Responsibility |
|---|---|---|
| `p13-ops.config.ts` | 138 | every env var, fail-closed default, heartbeat clamp |
| `operations.schema.ts` | 106 | `worker_leases`, `ops_alerts`, `ops_controls`, `ops_control_audit`, `p13_pilot_allowlist` |
| `worker-lease.service.ts` | 321 | atomic acquisition, epoch fencing, renewal, release, live-holder counts |
| `ops-alert.service.ts` | 420 | alert state machine, DB-enforced dedup, sink delivery, `SUPPRESSED` fallback |
| `p13-monitor.service.ts` | 589 | the ten §4 conditions, `scan()`, invariant checks |
| `ops-control.service.ts` | 181 | pause/resume kill switch, reason requirement, dual audit |
| `pilot-control.service.ts` | 299 | enforcement switch, eligibility decision table, allowlist mutation + audit |
| `ops-counters.ts` | 88 | nine dependency-free in-process alert inputs |
| `operations.controller.ts` | 200 | 10 admin routes on two existing permission keys |
| `operations.module.ts` | 36 | wiring |
| `raw-result.ts` | 71 | shared defensive row-reading helper |

### 3.2 Migration — `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` (176 lines)

Additive only: the five Phase 4 tables, their indexes, the seeded `p13-return-expiration` lease row,
`feature_flags` provenance columns, and a correction to the 0062 `_migration_log` entry. No column was
dropped or retyped, which is what makes the code-rollback path in the runbook §8.4 safe.

### 3.3 Production code modified — 12 files, +522 / −86 (tracked, verified with `git diff --stat`)

| File | Δ | Why |
|---|---|---|
| `apps/api/src/modules/returns/return-expiration.worker.ts` | 390 | env gate, lease acquisition, per-item epoch fence, pause checks, heartbeat, failure recording |
| `apps/api/src/modules/returns/settlement-adjustment.service.ts` | 38 | D-1 `fx_status` value, D-2 allow-listed posting guard, D-3 dead-code response ×3 |
| `apps/api/src/modules/returns/returns.service.ts` | 36 | pilot gate placement (step 1b), org lookup for the gate |
| `apps/api/src/modules/returns/returns.controller.ts` | 34 | 11 financial routes switched to `financialOrgScope()` |
| `apps/api/src/common/tenant-scope.ts` | 31 | `financialOrgScope()` — missing-active-org fail-open closed, denial counted |
| `apps/api/src/modules/returns/commission-reversal.service.ts` | 32 | duplicate-attempt and failure counters; reversal telemetry |
| `apps/api/src/modules/audit/audit.service.ts` + `audit.schema.ts` | 16 | audit-write failure counter + durability columns |
| `apps/api/src/modules/returns/returns.module.ts` | 5 | import `OperationsModule` |
| `apps/api/src/app.module.ts` | 4 | register `OperationsModule` |
| `apps/api/src/drizzle/schema.ts` | 1 | export the operations schema into the app-wide map |
| `apps/admin/src/app/settlement-adjustments/page.tsx` | 21 | `canPostFx()` allow-list, `FAILED` filter, corrected FX banner copy |

### 3.4 Tests — new 2 files, 2,316 lines; modified 4

New: `p4-operational-readiness.postgres.spec.ts` (1,111 lines, 59 assertions) and
`p4-http-authorization.postgres.spec.ts` (1,205 lines, 34 assertions).
Modified: `unit/returns/settlement-adjustment.spec.ts` (+63, expectations aligned with the corrected
FX vocabulary), and three Postgres specs whose migration-count/latest-migration pins had to move from
0062 to 0063 (`p13-returns`, `p13-financial-dispute`, `p311-concurrency`).

---

## 4. Verification summary — every number below is a re-run in this session

| Check | Command | Result |
|---|---|---|
| API typecheck | `pnpm --filter @scs/api typecheck` | `TSC_API_EXIT=0` |
| Monorepo typecheck | `pnpm typecheck` | `Tasks: 9 successful, 9 total` · `TYPECHECK_EXIT=0` |
| Phase 4 specs (consolidated) | `npx vitest run p4-operational-readiness p4-http-authorization --no-file-parallelism` | `failed=0 total=93` · `TEST_EXIT=0` |
| Phase 4 HTTP spec alone | same, single file | `failed=0 total=34` |
| Phase 4 operational spec alone | same, single file | `failed=0 total=59` |
| Cross-suite cluster (6 specs incl. `p13-returns`, `p13-financial-dispute`, `p311-concurrency`, `p311-tenant-isolation`) | serialized | `failed=0 total=142` · `EXITCODE=0` |
| API unit suite | `pnpm --filter @scs/api test:unit` | `1820 passed / 2 failed / 1822` → both re-run isolated `failed=0 total=74`, `EXITCODE=0` ⇒ contention flakes |
| contracts build | `pnpm --filter @scs/contracts build` | exit 0 |
| api build | `pnpm --filter @scs/api build` | exit 0 |
| **admin build (Windows)** | `pnpm --filter @scs/admin build` after store relink | `ADMIN_EXIT=0`, `BUILD_ID=WDJLNRiLYNBj7fZ98TrQt`, `/settlement-adjustments` in the route table |
| **web build (Windows)** | `pnpm --filter @scs/web build` after store relink | `WEB_EXIT=0` |
| Store integrity after build | `pnpm store status` | `STORE_EXIT=0` for this run (see limitation L-3) |
| Migration chain | `select count(*) from _migration_log` | 63 rows, latest `0063_phase4_operational_readiness.sql` |
| Resting state | `worker_leases`, `ops_controls`, `ops_alerts`, `p13_pilot_allowlist`, `settlement_adjustments` | lease unheld `epoch=0`; 0 rows in the other four |

The two unit failures were classified as flakes by the procedure the mandate requires ("separating
real failures from known env issues/flakes"): both are `Error: Test timed out in 5000ms` in
`unit/shipping/m723b1-carrier-foundation-hardening.spec.ts:370` and
`unit/shipping/webhook-rate-limiting.spec.ts:200`, recorded while a turbo typecheck was competing for
CPU, and both pass in isolation.

**Retention note.** The vitest JSON reports and build logs that produced these numbers were written to
scratch paths (`scs-platform/p4-*.json`, `p4-*.log`) and were **deleted at closure**, deliberately: a
phase deliverable is a report, not a log dump. The decisive lines are quoted in this report set, and
every one of them can be regenerated with the command shown in the same row — the Postgres specs need
only Docker running, and the build rows need a store relink first (runbook §8.5).

---

## 5. §7 financial safeguards — confirmed against the code and the tests

| §7 requirement | Implementation | Evidence |
|---|---|---|
| SLA elapse alone must never approve/reject/refund/expire | the worker calls `escalateReturn` and nothing else | KS-05, WX-06 |
| Merchant SLA = 72 elapsed hours | `expires_at` computed on elapsed hours | Phase 3 suites + `p311-*` |
| Admin review = 3 business days on the UTC business calendar | `BusinessCalendarService`, asserted against holiday rows | Phase 3 + AL-03 boundary cases |
| Refund completion precedes `REFUNDED` | state guards in `ReturnsService`; `REFUND_FAILED` is a real terminal-for-review state | AL-07, runbook §4 |
| Reversals idempotent, capped, transactionally consistent | idempotency key + cap inside one transaction; duplicate attempt is counted, not executed twice | AL-09, AL-10 |
| Dual approval + self-approval protection | `requires_dual_approval`, approver ≠ submitter | HA-27 |
| **Adjustments without authoritative FX stay blocked** | `fx_status = 'BLOCKED'` on create; posting allow-listed to `RESOLVED`/`NOT_REQUIRED`; monitor invariant flags `POSTED` + blocked FX | **D-1/D-2 fixes**, HA-28, HA-34, AL-12 |
| No fictional provider or rate | no rate constant, no provider stub anywhere in the diff; `fx_rate_source` stays NULL | D-1 review + AL-12 |

The FX block is now enforced on **both** sides of the boundary: the API refuses to post (409) and the
monitor alerts if a posted row is nevertheless found with unresolved FX. Before Phase 4 neither was
true.

---

## 6. §10 — the eight mandatory stop conditions

Each row states the condition, the concrete detection step, and **why pilot activation is currently
blocked by it**. All eight are live; none is closed by this phase.

| # | Stop condition | Detection | Why activation stays blocked today |
|---|---|---|---|
| 1 | **Worker exclusivity not verified in the target topology** | `GET /v1/admin/ops/p13/status` → `worker.liveHolders`; alert `p13.worker.count_anomaly` | WX-01…WX-12 prove the lease and fence on **one host against one Postgres**. Multi-host failover, clock skew and connection-pool exhaustion are untested; there is no target to test them on |
| 2 | **No confirmed alert destination** | `status.alerts.channel` (`webhook` vs `log-only`) | No sink is configured here, so delivery is proven only against a test server (`AL-17`/`AL-18`). In this environment alerts are durable but **nobody is paged** |
| 3 | **Migration chain not verified on the target** | `select count(*) from _migration_log`; latest must be ≥ `0063` | Verified only against a disposable testcontainers database and this dev DB (63/63). Nothing has been applied to a production database because no production database is defined in-repo |
| 4 | **Any unresolved financial-invariant violation** | `ops_alerts WHERE condition_key='p13.financial.invariant_violation' AND status <> 'RESOLVED'` | Currently 0 rows, which is *vacuously* clean — the tables are empty. The condition can only be evaluated as genuinely clear after real traffic exists |
| 5 | **Any unresolved tenant-isolation violation** | same query on `p13.tenant.isolation_violation` | Same vacuity caveat as #4. Denials (`isolation_denial`) are proven by HA-17/AL-14; the *absence* of violations in an empty database is not evidence |
| 6 | **No authoritative FX source** | `settlement_adjustments.fx_status`; posting returns 409 | Structural, not a bug: no rate provider exists. Any pilot flow that needs a **postable** adjustment cannot complete. A pilot must be scoped to flows that never require FX posting |
| 7 | **Pause/recovery not rehearsed on the target** | runbook §8 commands executed against the real deployment | `ops_control_audit` has 0 rows: the kill switch has never been flipped anywhere durable. Evidence is `KS-01…KS-10` in-process |
| 8 | **Rollback not rehearsed; no deploy configuration exists** | repo inspection: `infra/` contains `docker-compose.dev.yml` + `backup/` only; no Dockerfile, no k8s/Helm/terraform, no alerting stack | This is the binding condition. Without a deployment definition there is no target whose rollback can be rehearsed, and no way to set `P13_WORKER_ENABLED` "in production" at all |

Three additional activation preconditions that the operator must satisfy rather than detect:
`P13_WORKER_EXPECTED_COUNT` must match the real topology; `P13_WORKER_ENABLED=true` must be set on
exactly the intended instance; and the flag/allowlist state must be a **recorded decision**, not an
inferred default (an absent `p13.pilot.enabled` row reads as off, which is a default, not a decision —
see the pilot report §7.3).

---

## 7. Unresolved issues and limitations

Labelled honestly. `SEC/FIN` = security or financial control, `OPS` = operational readiness,
`ENV` = host/environment, `DOC` = documentation-only gap.

| ID | Class | Severity | Statement |
|---|---|---|---|
| L-1 | OPS | High | **No production deployment configuration exists in the repository.** Nothing in Phase 4 can be rehearsed against a real target; all evidence is dev/testcontainers. This is stop condition #8 and the main reason the verdict is not `PASS`. |
| L-2 | SEC/FIN | High, by design | **No authoritative FX source.** Adjustments remain unpostable. Mitigated (fail-closed on both API and monitor), but it constrains what a pilot may include. |
| L-3 | ENV | Medium | **The pnpm virtual store on this Windows host intermittently loses files.** Reproduced three times during Phase 4, reproducibly around a Next.js build; repaired each time with `pnpm install --offline --force` per the pre-existing repo runbook. Not a repository defect; a full parallel `pnpm build` here is not trustworthy evidence, whereas a per-app build after a relink is. CI's Linux `build` job is the authority. |
| L-4 | OPS | Medium | **Alert delivery defaults to log-only.** AL-19 proves nothing is silently dropped, but "the alert exists in `ops_alerts`" ≠ "an operator was notified". The mandate's own warning against reporting a constructible alert as operational applies here. |
| L-5 | OPS | Medium | **Counters are in-process and reset on restart.** The nine `ops-counters.ts` names feed alerts 8 and 6; a denial spike spread across replicas reads lower than the cluster total, and post-restart history is lost. Durable anything-that-matters goes to `ops_alerts`; this is a known fidelity limit, not a bug. |
| L-6 | OPS | Low | **Crash recovery is TTL-bounded (default 90 s).** Ownership transfers only after the lease expires; during that window no worker runs. Chosen deliberately over an unproven push mechanism, and observable via `heartbeat_stale`. |
| L-7 | DOC | Low | **No admin UI to create a settlement adjustment or to resolve FX.** API-only (§6 of the security report). Not required for a pilot, but an operator has no click-path for a manual correction. |
| L-8 | DOC | Low | **Alert 2 is implemented as "escalation overdue"**, i.e. `REQUESTED` past `expires_at` plus a configurable 10-minute grace, rather than as a bare "REQUESTED beyond 10 minutes". Rationale documented in the monitoring report; it is a deliberate interpretation of §4 that an operator should know about. |
| L-9 | OPS | Low | **A delivery-fee-exception adjustment failure is swallowed** in `returns.service.ts` (logs and returns null). Left as found — re-plumbing it would widen Phase 4's blast radius. It is now *visible* through alert 5/7 paths but not through the buyer's response. |
| L-10 | DOC | Low | **`isEnforced()` + `evaluate()` add two reads per return creation** while enforcement is on. Correct, unmeasured under load. |

None of L-1…L-10 is a demonstrated security hole or a demonstrated financial-control failure in the
*current* (all-switches-off) state. The ones that would have been exactly that — D-1, D-2, D-3 — are
fixed and pinned by tests.

---

## 8. What must happen before a pilot is activated

Ordered; each step produces evidence that a later step can check.

1. Stand up a production deployment definition (image/manifest/env source). Resolves L-1's premise.
2. Apply migrations through 0063 to the target database; record the `_migration_log` count.
3. Configure `P13_OPS_ALERT_WEBHOOK_URL` and prove delivery with a real notification. Closes L-4,
   clears stop condition #2.
4. Set `P13_WORKER_ENABLED=true` on exactly one instance, `P13_WORKER_EXPECTED_COUNT` accordingly.
5. Exercise the runbook against the target: read `status`, force `POST /scan`, pause, resume, and
   confirm `ops_control_audit` rows plus the two `p13.worker.control_changed` alerts appear. Clears
   stop condition #7 with real rows instead of empty tables.
6. Kill or restart the holder and observe `epoch` increase, `liveHolders` returning to 1, and no
   duplicate escalation in `lastJobSummary`. Clears stop condition #1.
7. Decide and record the FX position (stop condition #6): either exclude FX-dependent flows from the
   pilot, or integrate an authoritative rate.
8. Only then make the pilot decision: set `p13.pilot.enabled` (or `P13_PILOT_MODE=allowlist`) and add
   the named allowlist entries through the audited routes.
9. Open the observation window. Phase 4 does not open it.

---

## 9. §12 verdict rationale

**PASS WITH DOCUMENTED LIMITATIONS.**

Satisfied: §3 exclusivity (12 assertions incl. stale-holder and DB-failure paths), §4 all ten alert
classes (24 assertions, real sink delivery proven both ways), §5 kill switch and idempotent recovery
(10 assertions), §6 pilot allowlist controls (13 + 5 HTTP assertions, default-disabled and verified
off in the environment), §7 safeguards re-confirmed with the FX block now genuinely enforced, §8 admin
build verified on Windows after the documented environment repair plus 34 HTTP authorization
assertions that found and fixed three production defects, §9 runbook authored with every step labelled
by its evidence level.

Why not `PASS`: stop conditions #1, #3, #7 and #8 cannot be closed from this repository as it stands,
because there is no production target — and #2 and #6 remain open by configuration, not by code.

Why not `BLOCKED`: nothing that exists is unsafe. The controls fail closed, the worker is off, the
pilot is off, no alert has ever fired in anger, and the three genuine financial-control defects this
phase uncovered were repaired and pinned. A `BLOCKED` verdict would misrepresent the state: it would
read as "the controls do not work", when the accurate statement is "the controls work and there is
nothing production-shaped here to activate them against."
