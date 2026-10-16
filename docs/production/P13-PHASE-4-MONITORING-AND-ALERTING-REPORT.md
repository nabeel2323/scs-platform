# P13 Phase 4 — Monitoring and Alerting Report

**Mandate section:** §4 — monitoring and alerting reusing the existing stack, covering ten
specified alert classes, each with trigger + window, severity + deduplication, sanitized
identifiers, destination with delivery confirmation, escalation/recovery, and automated tests.

**Claim level achieved:** **implemented and runtime-verified.** Twenty-four assertions
(AL-01…AL-24) drive the real `P13MonitorService` and `OpsAlertService` against PostgreSQL, and
alert delivery is confirmed against a real HTTP sink rather than an assumed one.

---

## 1. Architecture — reuse, not a new stack

```
P13MonitorService (interval scan, every P13_MONITOR_INTERVAL_MS = 60 s default)
        │  collectFindings()  →  read-only evaluation of the ten conditions
        ▼
OpsAlertService.raise(finding)
        │  INSERT … ON CONFLICT (dedup_key) — one durable row per condition+resource
        ▼
delivery: webhook POST if P13_OPS_ALERT_WEBHOOK_URL is set, else log-only
        │
        ▼
ops_alerts row status: PENDING → SENT | FAILED | SUPPRESSED → RESOLVED
```

What is reused rather than added:

- **The same PostgreSQL instance** is the alert record store (`ops_alerts`). No new daemon, no
  new queue.
- **The same process heartbeat plumbing** as the worker lease (`worker_leases.poll_failures`,
  `last_error_code`, `heartbeat_at`) supplies alert inputs 1, 3 and 4.
- **The existing pino/`Logger`** is the last-resort channel, so a condition is never silently
  dropped when no sink is configured.
- **`ops-counters.ts`**, a process-local registry added in this phase, is the input for
  counter-shaped conditions (refund operation failures, reversal duplicates, isolation denials,
  audit write failures, alert-delivery attempts). It is deliberately *not* a metrics endpoint —
  see §6 limitation 3.

The monitor is registered on **every** API instance (`onModuleInit` starts the interval), which is
safe and intended: dedup is enforced by the `dedup_key` unique constraint in the database, so N
monitors still produce one notification per condition per resource.

---

## 2. The ten alert classes

Severity vocabulary is `CRITICAL | WARN`. Window means the observation rule that must hold before
the condition fires. Sanitization rule applied everywhere: identifiers are UUIDs and status
strings; **no monetary amount, no customer value, no webhook URL** is ever written to `detail`, a
title, or a log line (`ops-alert.service.ts` header: "The webhook URL itself is never written to a
log line or into `detail`"; alert 5's detail carries ids and status only).

| # | §4 required class | `condition_key` | Trigger + window | Severity | Dedup key | Test |
|---|---|---|---|---|---|---|
| 1 | three consecutive worker polling failures | `p13.worker.poll_failures` | `worker_leases.poll_failures >= 3` (`P13_ALERT_POLL_FAILURE_THRESHOLD`) | CRITICAL | `p13.worker.poll_failures:<lease_key>` | AL-01, AL-24 |
| 2 | return stuck in `REQUESTED` beyond its expected time | `p13.return.escalation_overdue` | `status='REQUESTED' AND expires_at < now() - 10 min` grace (`P13_ALERT_REQUESTED_STALE_MS`), i.e. merchant SLA elapsed *and* the escalation did not land | WARN | condition + `return_request` id | AL-03 |
| 3 | zero or multiple worker-enabled instances | `p13.worker.count_anomaly` | live-holder count for the lease key ≠ `P13_WORKER_EXPECTED_COUNT` (a key with no lease row counts as zero) | CRITICAL | `p13.worker.count_anomaly:<lease_key>` | AL-04, AL-05 |
| 4 | worker heartbeat missing > 5 minutes | `p13.worker.heartbeat_stale` | `holder_id IS NOT NULL AND (heartbeat_at IS NULL OR heartbeat_at < now() - 5 min)` | CRITICAL | `p13.worker.heartbeat_stale:<lease_key>` | AL-06 |
| 5 | failed / pending / manual-review refunds | `p13.refund.failed`, `p13.refund.stuck`, `p13.refund.manual_review`, `p13.refund.operation_failed` | `refunds.status='FAILED'` (CRITICAL); `REQUESTED/PROCESSING/APPROVED` older than 30 min (WARN); `return_requests.status='REFUND_FAILED'` (CRITICAL, the manual-review queue); in-process refund operation failures counter (CRITICAL) | mixed | condition + resource id | AL-07, AL-08 |
| 6 | commission reversal failures or duplicate attempts | `p13.commission.reversal_failed`, `p13.commission.reversal_error`, `p13.commission.reversal_duplicate_attempt` | `commission_reversals.status='FAILED'` (CRITICAL); counter `commission_reversal_failures_total` (CRITICAL); counter `commission_reversal_duplicate_attempts_total` (WARN — a rejected duplicate is evidence of a retry storm, not of money loss) | mixed | condition + resource id, or condition only for process counters | AL-09 |
| 7 | totals violating authoritative financial invariants | `p13.financial.invariant_violation` | three SQL invariants: Σ`reversal_minor` > original commission for a return; Σ`refunds.amount_minor` (in-flight or succeeded) > captured payment; a `POSTED` adjustment whose `fx_status IN ('BLOCKED','PENDING_REVIEW')` | CRITICAL | violation type + resource id | AL-10, AL-11, AL-12 |
| 8 | tenant-isolation violations / unauthorized financial operations | `p13.tenant.isolation_violation`, `p13.tenant.isolation_denial` | `settlement_adjustments.org_id ≠ owning store's org_id`; `commission_reversals.org_id ≠ owning store's org_id` (both CRITICAL); plus in-process `financial_isolation_denials_total` (WARN) so a denied attempt is visible even though it changed nothing | mixed | condition + resource id | AL-13, AL-14 |
| 9 | critical audit or outbox delivery failures | `p13.outbox.delivery_failed`, `p13.audit.write_failed` | `outbox_events.status IN ('FAILED','DEAD_LETTER')` restricted to the P13 event-type prefixes (CRITICAL); counter `audit_write_failures_total` (CRITICAL — durable trail at risk) | CRITICAL | condition + outbox id / condition only for the counter | AL-15, AL-16 |
| 10 | critical monitoring / alert-delivery failure | `ops.alert.delivery_failed` | any `ops_alerts` row with `status='FAILED'`, grouped per `condition_key`; the recursion case (the delivery-failure alert itself undeliverable) is logged, not re-raised | CRITICAL | condition + blocked condition key | AL-17, AL-18, AL-19 |

Supporting, not one of the ten: `p13.worker.ownership_lost` (WARN) is raised by the worker and by
`runBatch()` the moment its fence check fails. It is the observable half of §3's partition
detection. The three control-plane conditions are likewise producer-raised rather than scan-raised:
`p13.worker.control_changed` (WARN/INFO from `OpsControlService.setPaused`), `p13.pilot.flag_changed`
(INFO from `PilotControlService.setFlag`) and the pilot allowlist add/revoke mutations — so a
configuration flip is visible in `ops_alerts` at the moment it happens, without waiting for a scan.

### 2.1 One deliberate interpretation to record

§4 phrased class 2 as "REQUESTED beyond 10 minutes". Taken literally, that alerts on every
return inside its normal 72-hour merchant SLA — i.e. a permanent alert under healthy load. The
implementation therefore fires when a return is **10 minutes past its own escalation deadline**
(`expires_at`), which is the failure the clause is protecting against: the SLA elapsed and the
escalation that the worker owns did not happen. The condition key
(`p13.return.escalation_overdue`) states this reading in the name, and the grace is configurable
via `P13_ALERT_REQUESTED_STALE_MS`. This is a documented deviation, not a silent narrowing.

---

## 3. Deduplication, escalation and recovery semantics

Implemented in `ops-alert.service.ts`; state machine as written in its header:

```
PENDING ──sink 2xx──▶ SENT
        └─sink error─▶ FAILED   (re-attempted on the next scan)
SENT ──condition recurs inside the repeat window──▶ suppressed_count++
no sink configured ─▶ SUPPRESSED (logged, never silently dropped)
```

- **Dedup identity:** `deriveDedupKey()` = `conditionKey:resourceType:resourceId` (falling back to
  condition key alone, or an explicit key where the resource is a non-UUID job name such as the
  lease key). A unique index on `dedup_key` makes this a database property, not an application
  best-effort: two monitors racing produce one row.
- **Repeat window:** a still-open `SENT` alert that re-fires inside `P13_ALERT_REPEAT_WINDOW_MS`
  (default 15 min) increments `fire_count`/`suppressed_count` and does **not** re-notify. Outside
  the window it is re-notified.
- **Recovery:** `scan()` computes `clears` for conditions no longer present and calls
  `resolve(dedupKey)`, setting `status='RESOLVED', resolved_at=now()`. A later recurrence therefore
  reopens as a *new* incident rather than being suppressed by the old one — and a `RESOLVED` row
  whose condition recurs *immediately* is re-opened to `PENDING` (`recursedAfterResolve`).
- **Attempt accounting:** `attempt_count` and `last_error` are retained per row, so an operator can
  see delivery attempts without log access.
- **Snapshot:** `alert snapshot` = status roll-up + `opsCounterSnapshot()` + `channel`, exposed at
  `GET /v1/admin/ops/p13/status` and `GET /v1/admin/ops/p13/alerts?limit=` (AL-23).

---

## 4. Destination and delivery confirmation

`raise()` performs the POST itself and records the outcome on the row — the mandate's requirement
that an alert be "operational", not merely constructible:

| Sink state | Behaviour | Status written | Test |
|---|---|---|---|
| `P13_OPS_ALERT_WEBHOOK_URL` set, sink answers 2xx | delivered, `delivered_at` stamped, `delivery_channel='webhook'` | `SENT` | AL-17 (delivery confirmed end-to-end against a **real local HTTP server**) |
| sink errors / times out (`P13_ALERT_DELIVERY_TIMEOUT_MS`, default 5 s) | row kept for retry on the next scan; a `ops.alert.delivery_failed` alert is raised for the blocked condition | `FAILED` | AL-18 |
| no sink configured | the row is still durable, and the alert is emitted through the logger | `SUPPRESSED` | AL-19 |

AL-18 also asserts the anti-recursion rule: when the delivery-failure alert cannot itself be
delivered, the monitor logs instead of raising forever.

---

## 5. Automated test evidence (freshly executed)

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

The 24 §4 assertions, all `[PASSED]` in the same JSON output:

```text
AL-01  (alert 1): three consecutive worker polling failures raise a CRITICAL alert
AL-02  a fenced failure write is rejected, so a stale worker cannot poison the counter
AL-03  (alert 2): a return past its merchant SLA is escalation-overdue; a healthy one is not
AL-04  (alert 3): zero live holders is a CRITICAL count anomaly
AL-05  exactly one live holder clears the count anomaly
AL-06  (alert 4): a heartbeat older than five minutes is CRITICAL
AL-07  (alert 5): failed, stuck and manual-review refunds are each detected
AL-08  refund alert detail carries no monetary amount (sensitive data excluded)
AL-09  (alert 6): reversal FAILED rows and duplicate-attempt counters both alert
AL-10  (alert 7): over-reversal beyond the original commission is an invariant violation
AL-11  (alert 7): refunds exceeding the captured payment is an invariant violation
AL-12  (alert 7): a POSTED adjustment whose FX is still blocked is an invariant violation
AL-13  (alert 8): an adjustment scoped to a non-owning organization is a tenant-isolation violation
AL-14  (alert 8): object-level isolation denials are surfaced as a WARN alert
AL-15  (alert 9): a FAILED/DEAD_LETTER P13 outbox event is CRITICAL
AL-16  (alert 9): an audit write failure raises a CRITICAL durability alert
AL-17  (alert 10): delivery is confirmed end-to-end against a real sink
AL-18  (alert 10): a dead sink marks the alert FAILED and raises the delivery-failure alert
AL-19  with no sink configured nothing is silently dropped — the row is durable and SUPPRESSED
AL-20  deduplication collapses repeats into one row per condition per resource
AL-21  a cleared condition resolves, and a recurrence reopens as a new incident
AL-22  scan() reports every check it ran and is read-only for business data
AL-23  alert snapshot rolls up status, counters and channel
AL-24  (alert 1, worker producer): the worker raises on its own at the third failure
```

AL-22 is the completeness guard: `scan()` returns `checksRun` containing all ten check names
(`worker.poll_failures`, `return.escalation_overdue`, `worker.count_anomaly`,
`worker.heartbeat_stale`, `refund.failed_or_stuck`, `commission.reversal_integrity`,
`financial.invariants`, `tenant.isolation`, `outbox_and_audit_durability`, `alert_delivery`), so a
future check that stops running fails a test instead of silently disappearing.

Two further alert-adjacent properties are pinned over HTTP in the security suite: HA-17 proves the
`financial_isolation_denials_total` counter that feeds alert 8 actually advances through the real
authorization path, and HA-12 proves the pause control is audited and cannot approve or refund.

---

## 6. Limitations, stated plainly

1. **Alert delivery default is log-only.** With no webhook configured the row is durable and
   `SUPPRESSED`, and the operator's channel is the application log. This is the single most
   important pilot prerequisite: alert *generation* is proven; alert *reaching a human* requires
   `P13_OPS_ALERT_WEBHOOK_URL`, which is unset everywhere in this repository today.
2. **In-process counters reset on restart.** Alerts 5/6/8/9 partly consume `ops-counters.ts`
   values that live in process memory. A condition that occurs and then the pod restarts within one
   scan interval would be missed; the durable-table-based conditions (1,2,3,4,7,8-first-halves,
   9-outbox, 10) are not affected. Durable counters are a deliberate follow-up, not a Phase 4
   claim.
3. **No metrics endpoint.** `opsCounterSnapshot()` is surfaced through the authenticated status
   route, not a scraper-friendly `/metrics`. Adding one would change the HTTP surface without a
   reviewable need in this phase.
4. **Scan interval bounds detection latency** to at most `P13_MONITOR_INTERVAL_MS` (60 s default)
   plus the window each condition defines.
5. **No real paging/escalation policy engine.** "Escalation" here is severity + durable row + retry
   until delivered + reopen-on-recurrence. Routing CRITICAL to a pager is the sink's job and is not
   configured in this repository.

---

## 7. Files

| File | Role |
|---|---|
| `apps/api/src/modules/operations/p13-monitor.service.ts` | ten-condition evaluation, `scan()`, `checksRun` |
| `apps/api/src/modules/operations/ops-alert.service.ts` | dedup, delivery, resolve, snapshot |
| `apps/api/src/modules/operations/ops-counters.ts` | process-local counter registry + sanitization contract |
| `apps/api/src/modules/operations/operations.schema.ts` | `ops_alerts` table |
| `infra/drizzle/migrations/0063_phase4_operational_readiness.sql` | `ops_alerts` + unique `dedup_key` |
| `apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts` | AL-01…AL-24 |
