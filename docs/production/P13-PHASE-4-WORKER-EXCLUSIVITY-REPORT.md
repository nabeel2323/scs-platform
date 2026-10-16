# P13 Phase 4 — Worker Exclusivity Report

**Mandate section:** §3 — worker exclusivity via a reliable mechanism, with at-most-one
protected P13 worker, recoverable ownership, stale-worker protection, observable heartbeats,
and fail-closed startup.

**Claim level achieved:** **implemented and runtime-verified against PostgreSQL.** Twelve
assertions (WX-01…WX-12) execute the real `WorkerLeaseService` and the real
`ReturnExpirationWorker` against the development PostgreSQL 16.4 instance.

---

## 1. Mechanism chosen

**Renewable database lease with a fencing epoch**, not an advisory lock.

Reasoning, in the order the mandate's constraints force it:

- `pg_advisory_lock` is session-scoped: ownership disappears when the connection pool recycles a
  session, and the API cannot express *which* connection must therefore stop writing. A lease row
  survives connection churn and is readable by an operator and by the monitor.
- Exclusivity must be checkable **at the moment of each write**, not only at startup. The
  monotonically increasing `epoch` is a fencing token: every mutating statement is conditioned on
  `epoch = $ownEpoch`, so a worker that lost ownership without noticing is rejected by the
  database rather than by its own belief.
- Ownership must not rest on an environment-variable count (§3 explicitly forbids that).
  `P13_WORKER_ENABLED` only decides whether an instance is *allowed* to contend for the lease;
  the lease decides who actually runs. `P13_WORKER_EXPECTED_COUNT` is used **solely** to raise a
  count-anomaly alert, never to grant or deny work.

Table (migration `0063_phase4_operational_readiness.sql`, schema
`apps/api/src/modules/operations/operations.schema.ts`):

```ts
export const workerLeases = pgTable('worker_leases', {
  leaseKey: varchar('lease_key', { length: 80 }).primaryKey(),
  holderId: varchar('holder_id', { length: 120 }),
  holderHost: varchar('holder_host', { length: 120 }),
  holderPid: integer('holder_pid'),
  /** Fencing token — incremented on every acquisition. */
  epoch: bigint('epoch', { mode: 'number' }).notNull().default(0),
  acquiredAt / heartbeatAt / expiresAt: timestamptz,
  pollFailures: integer .notNull().default(0),
  lastErrorCode, lastJobAt, lastJobSummary
});
```

`holderId` is `${hostname()}-${process.pid}-${randomUUID().slice(0,8)}` — unique per process
instance, so a restarted container cannot inherit the previous incarnation's identity.

---

## 2. Acquisition and fencing SQL (actual implementation)

Acquire — succeeds only if unheld, expired, or already ours (`worker-lease.service.ts` L107-134):

```sql
UPDATE worker_leases
SET holder_id = $holder, holder_host = $host, holder_pid = $pid,
    epoch = epoch + 1,
    acquired_at = now(), heartbeat_at = now(),
    expires_at = now() + make_interval(secs => $leaseTtlSeconds),
    poll_failures = 0, last_error_code = NULL, updated_at = now()
WHERE lease_key = $leaseKey
  AND (holder_id IS NULL OR expires_at IS NULL OR expires_at <= now() OR holder_id = $holder)
RETURNING epoch
```

No row returned ⇒ `HELD_BY_OTHER`, epoch `0`, caller stays `STANDBY`. The single UPDATE is
atomic under Postgres row locking, which is what makes the competing-worker race safe.

Renew + fence (used before every batch **and before every individual item**):

```sql
UPDATE worker_leases
SET heartbeat_at = now(), expires_at = now() + make_interval(secs => $ttl)
WHERE lease_key = $leaseKey AND holder_id = $holder AND epoch = $epoch
RETURNING lease_key
```

`recordPollFailure`, `recordPollSuccess` and `release` are all fenced with
`AND epoch = ${epoch}`, so a partitioned worker cannot even dirty the failure counter or clear a
newer holder's row.

---

## 3. Worker lifecycle (actual implementation)

`apps/api/src/modules/returns/return-expiration.worker.ts`:

| Phase | Behaviour | Fail-closed property |
|---|---|---|
| `onModuleInit` | If `workerEnabled` is false → state `DISABLED`, **no timer installed**, no lease touched | Default is disabled; `boolFalseDefault()` treats any unrecognised value as false |
| | If enabled → state `STANDBY`, first tick after `startupDelayMs` (default 45 s) | Boot initialisation cannot race the first cycle |
| `tick()` | epoch `0` → `tryAcquire`; else `renewAndFence` | Loss of fence ⇒ epoch reset to 0, state `STANDBY`, `p13.worker.ownership_lost` (WARN) raised |
| | `HELD_BY_OTHER` is treated as **expected steady state**, not a failure | Standbys do not inflate `poll_failures` |
| | `DB_ERROR` / missing row ⇒ recorded as a poll failure and alert-eligible | Exclusivity that cannot be established means no work |
| pause check | `controls.isPaused()` is read **before** any business read/write; an unreadable control is treated as paused **and** recorded as a poll failure | §5 fail-closed |
| cadence | Heartbeat every `heartbeatIntervalMs`, batch only when `now - lastRunAt >= pollIntervalMs` | Renewal and work are decoupled |
| `runBatch()` | Re-fences at batch start; per return, re-fences **and** re-checks pause before each mutation | A takeover lands between items, not only between batches |
| claim | `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING id` | Concurrent claims cannot double-process a row |
| work | `returnsService.escalateReturn(id)` only | Phase 2 semantics: SLA elapse escalates; it never approves, rejects, refunds or expires |
| `onModuleDestroy` | `stopTicking()` then `release(epoch)` if `HELD`/`HELD_PAUSED` | A restart does not strand the lease until TTL expiry |

`heartbeatIntervalMs` is clamped to at most half the lease TTL in `resolveP13OpsConfig()`
(L130-135), because a heartbeat cadence at or beyond the TTL would let the lease expire while the
holder is healthy — the exact condition that creates two self-believed owners.

---

## 4. Test evidence (freshly executed in this session)

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

(93 = 59 operational-readiness + 34 HTTP-authorization; the exclusivity subset is the twelve
WX cases below.) The six-spec cluster run in the same session:

```powershell
powershell -ExecutionPolicy Bypass -File .p4-cluster.ps1   # 6 P13/Phase-4 postgres specs
```

```text
EXITCODE=0
failed=0 total=142
```

### 4.1 What each assertion proves

| ID | Mandate requirement covered | Observed behaviour |
|---|---|---|
| WX-01 | observability of zero-worker state | lease row is unheld (`holder_id IS NULL`), epoch unchanged |
| WX-02 | single owner + fencing token | acquisition returns epoch > 0 and the row carries that holder |
| WX-03 | second worker cannot acquire | `HELD_BY_OTHER`, no work executed |
| WX-04 | ownership recovers after termination/host failure | after expiry a new holder takes over and the epoch **strictly increases** |
| WX-05 | stale worker cannot renew | `renewAndFence(oldEpoch)` returns false |
| WX-06 | **stale worker cannot modify state, even mid-batch** | per-item re-fence stops the batch; the remaining returns are untouched |
| WX-07 | competing workers racing an expired lease | concurrent `tryAcquire` calls produce exactly one owner (atomic UPDATE) |
| WX-08 | fail-closed startup on DB failure | `tryAcquire` against an `execute` that throws returns `acquired: false`, `reason: 'DB_ERROR'`, `epoch: 0` |
| WX-09 | disabled worker touches nothing | state `DISABLED`, tick `skipped: 'disabled'`, and `leaseRow().holder_id` is still `NULL` |
| WX-10 | standby instance is observable, not silently working | owner reports `acquired: true`; standby reports `executed: false, skipped: 'acquisition_failed', state: 'STANDBY'`; only one `ESCALATED` event per processed return |
| WX-11 | observable heartbeats + cycle outcome | `heartbeat_at`, `last_job_at`, `last_job_summary`, `poll_failures`, `last_error_code` all advance on the row |
| WX-12 | voluntary release / restart handover | release returns true, holder cleared, standby executes immediately; a stale release cannot clear the new holder's lease |

### 4.2 Zero / one / competing / stale / DB-failure coverage against §3's explicit list

| §3 required scenario | Assertion |
|---|---|
| zero enabled instances | WX-01, WX-09, and alert-3 path AL-04 |
| exactly one | WX-02, WX-11 |
| competing instances | WX-03, WX-07, WX-10 |
| stale/partitioned instance | WX-05, WX-06, WX-12 |
| database failure | WX-08 (acquisition), KS-03 (control read), AL-02 (fenced failure write rejected) |

---

## 5. Duplicate-financial-work analysis

The protected job performs exactly one state transition — `escalateReturn` — and no money
movement. Duplication is prevented at four independent layers:

1. lease epoch fencing (only one holder may run),
2. `FOR UPDATE SKIP LOCKED` on the claim (no two claims select the same row),
3. `escalateReturn`'s own status guard, whose `ConflictException` the worker records as
   `skipped` rather than an error (L348-351),
4. outbox event identity per escalation, asserted in WX-10 ("only one ESCALATED event exists per
   processed return").

Commission reversals and refunds are additionally idempotency-keyed in their own services
(`commission_reversal_duplicate_attempts_total` exists precisely to observe rejected duplicates,
and the monitor turns that counter into alert 6).

---

## 6. Honest limits of this verification

- **Multiple simultaneous live holders are observable only indirectly.** The lease makes two live
  holders impossible for the same key; a partition case is detected as the *losing* holder's
  `p13.worker.ownership_lost` event plus alert 3's live-holder count. There is no distributed
  clock here — detection relies on `expires_at` computed by PostgreSQL, which is the intended
  single time source.
- **Crash recovery latency is bounded by the lease TTL**, not by detection. Default
  `leaseTtlSeconds = 90`: a hard-killed holder leaves the lease stranded for up to 90 s. Graceful
  shutdown (WX-12) hands over immediately.
- **Verified on one host with one PostgreSQL.** WX-07 and WX-10 model multiple instances as
  multiple in-process workers with distinct holder ids against the same database, which is the
  correct mechanism under test but is not a multi-node deployment rehearsal. Genuine
  multi-replica rehearsal additionally requires the deployment artifact the repository does not
  yet contain (see the baseline report §3.5).
- No test in this phase starts a worker on a real production database; none was available and
  none was touched.

---

## 7. Files that implement this

| File | Role |
|---|---|
| `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` | `worker_leases` table |
| `apps/api/src/modules/operations/worker-lease.service.ts` | acquire / renew+fence / release / counters / read |
| `apps/api/src/modules/operations/p13-ops.config.ts` | all operational defaults, enable gate parsing, heartbeat clamp |
| `apps/api/src/modules/returns/return-expiration.worker.ts` | lifecycle state machine, per-item fencing, batch claim |
| `apps/api/src/modules/operations/operations.controller.ts` | `GET /v1/admin/ops/p13/status` exposes holder, epoch, heartbeat, `liveHolders`, `pollFailures` |
| `apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts` | WX-01…WX-12 |
