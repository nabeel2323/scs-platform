# P13 Phase 4 — Kill Switch, Pause and Recovery Report

**Mandate section:** §5 — pause/kill switch, in-flight atomicity, idempotent resume, durable
recovery evidence, preservation of unrelated functionality, and the guarantee that configuration
cannot bypass exclusivity or financial authorization.

**Claim level achieved:** **implemented and runtime-verified.** Ten assertions (KS-01…KS-10)
execute the real worker, real `OpsControlService` and real PostgreSQL; four HTTP assertions
(HA-11, HA-12, HA-06…HA-09) drive the same control through the authenticated API.

---

## 1. The control

One durable row, one key: `p13.worker.paused` (`P13_PAUSE_CONTROL_KEY`) in `ops_controls`, with an
append-only `ops_control_audit` companion. Deliberately **not** an environment variable: a kill
switch that requires a redeploy or a restart cannot stop a worker that is already running, and a
process-local flag cannot be seen by the other replicas.

```ts
opsControls      : control_key PK, paused bool, reason varchar(300), updated_by uuid, updated_at
opsControlAudit  : id, control_key, paused, reason, actor_id, actor_kind ('ADMIN'|'SYSTEM'), changed_at
```

The worker reads it through `OpsControlService.isPaused()` at two points per cycle: once before
any business read/write, and again **before each individual return** inside the batch
(`return-expiration.worker.ts` L298-300). A pause therefore lands between items, not only between
batches.

---

## 2. Pause semantics as implemented

| Property | Implementation | Evidence |
|---|---|---|
| Pause prevents **new** protected jobs | `tick()` returns `{executed: false, skipped: 'paused'}` before `runBatch()` | KS-01 |
| Pause does **not** touch ownership | the lease is neither released nor re-epoch'd by pausing, so the holder keeps its fence and no other replica can start a competing batch | KS-02 |
| In-flight transactions stay atomic | pause is checked *between* items; each item's work is one service call inside its own transaction, and a pause mid-batch simply stops taking new items | KS-01, KS-09, WX-06 |
| Unreadable control fails closed | `isPaused()` does **not** swallow a DB error; the worker catches it, records a fenced poll failure (`last_error_code='CONTROL_UNREADABLE'`) and skips the cycle | KS-03 |
| A missing control row reads as *not paused* | `row?.paused === true` — absence is not an outage; unrelated work continues | KS-08 |
| An unexplained pause is refused | `setPaused()` throws `'Pausing P13 background processing requires a reason'` when `paused && !reason`; the HTTP layer additionally returns 400 `A reason is required to pause P13 processing` | KS-07, HA-11 |
| Every flip is durably audited | one transaction writes the control row **and** the `ops_control_audit` row; a platform `audit_logs` entry (`p13.worker.pause` / `p13.worker.resume`) and an `ops_alerts` row (`p13.worker.control_changed`, WARN/INFO) follow | KS-06, HA-12 |
| Resume is idempotent | a second resume with the same state produces no duplicate escalation, no duplicate outbox event, and no re-notification outside the dedup window | KS-04 |
| Recovery after a crash does not duplicate work | a replacement holder re-acquires at a higher epoch and re-runs the claim; `FOR UPDATE SKIP LOCKED` plus `escalateReturn`'s status guard make the already-processed return a `skipped`, not a second `ESCALATED` | KS-09 |
| Restart does not strand the lease | `onModuleDestroy()` releases voluntarily | KS-10 |

---

## 3. What the kill switch deliberately does **not** do

These are §5/§7 requirements expressed as absences, and each is pinned by a test rather than by
review:

1. **It never reverses a financial transaction.** Nothing in `OpsControlService` or the pause path
   touches refunds, reversals, adjustments or settlement records. KS-05 asserts the corollary from
   the other side: a merchant-SLA elapse alone escalates — it does not approve, reject, refund or
   expire.
2. **It cannot be flipped silently.** A reason is mandatory (KS-07), the actor is recorded, the
   change is audited on two trails, and an alert is raised.
3. **It grants nothing.** HA-12 shows pausing over HTTP leaves no approval or refund side effect,
   and HA-09 shows that the role which holds financial approval rights (`FINANCE`) has *no* access
   to worker or pilot control at all.
4. **Configuration cannot bypass exclusivity or financial authorization.** The pause control is
   checked after the fence, and the fence is checked before every write; RBAC decisions are made by
   the guards before any of this code runs. There is no environment variable, control row, or pilot
   setting that turns off the lease check or the permission check. KS-02 and WX-05/WX-06 are the
   executable form of that claim.
5. **Unrelated API functionality is preserved.** The control is scoped to one key and one job.
   KS-08 pins that a missing row does not stop work, and the 142-test cluster (which includes
   non-P13 return, refund, adjustment and dispute flows) passes with the control in place.

---

## 4. Rollback story

Phase 4 adds tables, one module, one gated worker and one flag. Nothing mutates existing financial
rows. Therefore:

- **Operational rollback (no deploy):** `POST /v1/admin/ops/p13/worker/pause` stops the protected
  job; `POST …/worker/resume` restarts it. Both are reversible, audited, and take effect on the
  next heartbeat tick (default 30 s) rather than requiring a restart.
- **Pilot rollback:** disable the flag or revoke the allowlist entry; existing durable records are
  preserved (PL-05, PL-13, HA-32, HA-33).
- **Code rollback:** removing the Phase 4 module leaves the Phase 3 behaviour intact, provided
  migration 0063 is left in place (its tables are additive; no column was dropped or retyped).

The Phase 4 mandate's stop condition "no production rollback rehearsal" is respected: the above is
the designed path, verified against the development database, and **has not been exercised against
production**.

---

## 5. Test evidence (freshly executed in this session)

```powershell
cd c:\TAIF\scs-platform\apps\api
npx vitest run src/__tests__/integration/p4-operational-readiness.postgres.spec.ts `
  src/__tests__/integration/p4-http-authorization.postgres.spec.ts `
  --no-file-parallelism --reporter=json --outputFile=../../p4-spec-final.json
```

```text
REPAIR_EXIT=0
TEST_EXIT=0
failed=0 total=93
```

The §5 subset, all `[PASSED]` in the JSON output:

```text
KS-01 pausing prevents new protected jobs from starting
KS-02 pausing never releases or re-epochs the lease
KS-03 an unreadable pause control fails closed and counts as a poll failure
KS-04 resume is idempotent — no duplicate escalation, event or outbox emission
KS-05 a SLA elapse alone escalates — it never approves, rejects, refunds or expires
KS-06 recovery leaves durable audit evidence for both pause and resume
KS-07 an unexplained pause is refused — the kill switch cannot be flipped silently
KS-08 a missing control row reads as not-paused, and unrelated work continues
KS-09 after a holder crash, a replacement recovers the work without duplication
KS-10 onModuleDestroy releases ownership so a restart does not strand the lease
```

Control-plane authorization over HTTP is proven separately in the security suite (§8.2):
HA-06 every operations route requires its permission key; HA-07 the required keys are exactly the
two audited returns keys; HA-09 FINANCE holds financial approval rights but no worker/pilot
control; HA-11 validation happens **after** authorization and denial leaves no state; HA-12 pausing
over HTTP is audited and cannot approve or refund anything.

---

## 6. Limitations

- Pause is checked at the worker's heartbeat cadence (default 30 s), so worst-case a pause takes
  one heartbeat interval to land. Items already inside their own transaction complete; that is the
  atomicity the mandate asks for.
- There is a single control key. A per-organization or per-job pause would need a new key
  vocabulary; nothing in the schema prevents it, but nothing uses it today.
- `ops_controls` has no row until the first flip. KS-08 documents that this reads as *not paused*,
  which is the correct default for a system whose worker is additionally disabled by
  `P13_WORKER_ENABLED`. An operator who wants "paused" to be the pre-pilot resting state must set
  it explicitly — the runbook includes that as a pre-flight step.
- The INFO/WARN `p13.worker.control_changed` alert inherits the delivery limitation in the
  monitoring report: with no sink configured it is durable but `SUPPRESSED`, i.e. log-only.

---

## 7. Files

| File | Role |
|---|---|
| `apps/api/src/modules/operations/ops-control.service.ts` | read/state/setPaused/history, reason requirement, dual audit |
| `apps/api/src/modules/operations/operations.schema.ts` | `ops_controls`, `ops_control_audit` |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | pause check before batch and before each item |
| `apps/api/src/modules/operations/operations.controller.ts` | `POST worker/pause`, `POST worker/resume`, `GET controls/history` |
| `apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts` | KS-01…KS-10 |
