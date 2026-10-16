# P13 Phase 4 — Operations Runbook

**Mandate section:** §9 — configuration and pre-flight, worker count and heartbeat interpretation,
alert triage, failed refund / manual review, reversal and reconciliation incidents, tenant-isolation
incidents, outbox backlog and alert-delivery failure, pause/recovery/rollback, evidence collection,
and the conditions that prohibit pilot activation.

**Status of every command in this document.** Commands marked **[DEV-VERIFIED]** were executed
against this repository's development stack in the Phase 4 session and their output is quoted in the
reports. Commands marked **[PROD — NOT REHEARSED]** are the correct *shape* of the operation derived
from the code, but no production target exists in this repository (§2 finding: the only manifests are
`infra/docker-compose.dev.yml` and `infra/backup/`; **there is no Dockerfile and no production deploy
configuration in-repo**). Never run a `[PROD — NOT REHEARSED]` command against production as if it had
been validated here.

---

## 1. Configuration reference

All P13 operational settings are parsed in one place, `apps/api/src/modules/operations/p13-ops.config.ts`,
and **every default is the safe one**. `apps/api/.env` in this repository currently contains **no
`P13_` variable at all**, which is the fully-disabled state.

| Variable | Default | Effect |
|---|---|---|
| `P13_WORKER_ENABLED` | *off* — only `true`/`1`/`yes` enable it | Master switch for the protected job. Unset or unparseable ⇒ disabled. |
| `P13_WORKER_POLL_INTERVAL_MS` | `120000` | Tick cadence. Falls back to the legacy `RETURN_EXPIRATION_POLL_INTERVAL_MS`. |
| `P13_WORKER_LEASE_TTL_SECONDS` | `90` | How long a lease survives without a heartbeat. |
| `P13_WORKER_HEARTBEAT_INTERVAL_MS` | `30000` | Renewal cadence. **Clamped to ≤ 50 % of the TTL** in code, so a mis-set value cannot let two holders believe they own the lease. |
| `P13_WORKER_STARTUP_DELAY_MS` | `45000` | Delay before the first tick, so boot initialisation is not competing with work. |
| `P13_WORKER_ACQUIRE_RETRY_MS` | `20000` | Standby retry cadence after losing/handing over. |
| `P13_WORKER_EXPECTED_COUNT` | `1` | Drives the zero/multiple-enabled-instances alert. |
| `P13_MONITOR_INTERVAL_MS` | `60000` | Monitor scan cadence. |
| `P13_OPS_ALERT_WEBHOOK_URL` | *unset* ⇒ **log-only** | Alert sink. Empty is never a silent drop: alerts stay durable in `ops_alerts` with status `SUPPRESSED`. |
| `P13_ALERT_DELIVERY_TIMEOUT_MS` | `5000` | Sink call timeout. |
| `P13_ALERT_REPEAT_WINDOW_MS` | `900000` (15 min) | Re-notification window for an already-`SENT` dedup key. |
| `P13_PILOT_MODE` | `legacy` | `allowlist` turns pilot enforcement on. Anything unrecognised falls back to `legacy`. |
| `P13_ALERT_POLL_FAILURE_THRESHOLD` | `3` | Consecutive fenced poll failures before alert 1. |
| `P13_ALERT_HEARTBEAT_STALE_MS` | `300000` (5 min) | Alert 4 threshold. |
| `P13_ALERT_REQUESTED_STALE_MS` | `600000` (10 min) | Alert 2 grace past `expires_at`. |
| `P13_ALERT_REFUND_STUCK_MS` | `1800000` (30 min) | Alert 5 "stuck refund" threshold. |

Durable (database) switches, which do **not** require a redeploy:

| Control | Table | Read as |
|---|---|---|
| `p13.worker.paused` | `ops_controls` | `paused = true` stops new protected work. **Absent row ⇒ not paused.** |
| `p13.pilot.enabled` | `feature_flags` | Enabled row ⇒ pilot enforcement on. **Absent row ⇒ off.** |

### Pre-flight before any pilot activation

1. **[DEV-VERIFIED]** Confirm the durable state rather than inferring it from silence — an absent flag
   reads as off, and that is a *default*, not a *decision*:

   ```powershell
   docker exec scs-postgres psql -U scs -d scs_platform -tAc "select key, enabled, updated_by from feature_flags where key='p13.pilot.enabled'"
   docker exec scs-postgres psql -U scs -d scs_platform -tAc "select org_id, store_id, enabled, note from p13_pilot_allowlist order by org_id"
   docker exec scs-postgres psql -U scs -d scs_platform -tAc "select control_key, paused, reason, updated_by, updated_at from ops_controls"
   ```

   In this repository all three currently return **no rows**.

2. **[DEV-VERIFIED]** Confirm the migration chain is complete — Phase 4 tables must exist before the
   worker or the monitor can start, and both fail closed if they do not:

   ```powershell
   docker exec scs-postgres psql -U scs -d scs_platform -tAc "select count(*) from _migration_log"
   docker exec scs-postgres psql -U scs -d scs_platform -tAc "select name from _migration_log order by name desc limit 1"
   ```

3. Confirm `P13_WORKER_ENABLED` is **absent or false** until the exclusivity evidence below is
   reviewed. The worker starts only when explicitly enabled, and startup is fail-closed: if the lease
   table is unreadable the worker does not run work.
4. Confirm an alert sink is configured **or** accept that alerts are log-only (`channel: "log-only"`
   in the status snapshot). Do not treat "the application can construct an alert" as "the alert is
   operational".
5. Confirm exactly one instance is expected: `P13_WORKER_EXPECTED_COUNT` must match the deployment
   topology, and `liveHolders` (below) must be ≤ 1.

---

## 2. Worker ownership, epoch and heartbeat — how to read them

One endpoint answers "is the background pipeline healthy and who owns it":

```powershell
# [SHAPE VERIFIED BY TESTS] HA-06/HA-08 execute this exact route over HTTP against a real Nest
# app and a real PostgreSQL. The curl line itself was not run against a live dev server in this
# session, because no API process is running here; the token must carry `admin:returns:read`.
curl -H "Authorization: Bearer <admin-access-token>" http://localhost:3000/v1/admin/ops/p13/status
```

> Port: `main.ts` binds `PORT` → `API_PORT` → `3000`, and this repository's `apps/api/.env` sets
> `API_PORT=3000`. (The Phase 4 HTTP suite does not use a fixed port — it binds `listen(0)`.)

`worker` block:

| Field | Meaning | What to conclude |
|---|---|---|
| `holder`, `holderHost`, `holderPid` | The instance that currently owns `p13-return-expiration` | Cross-check against the instance you believe is running. `null` + `epoch` unchanged after `P13_WORKER_ENABLED=true` means the worker never acquired. |
| `epoch` | Monotonically increasing fencing token, **+1 per acquisition** | A rising epoch during a rolling restart is normal. A rising epoch *with no restart* means flapping ownership — treat as an incident. |
| `heartbeatAt` | Last renewal | Should be within `P13_WORKER_HEARTBEAT_INTERVAL_MS`. Older than `P13_ALERT_HEARTBEAT_STALE_MS` (5 min) must already have raised `p13.worker.heartbeat_stale`. |
| `expiresAt` | Lease expiry | If `expiresAt < now()` and `holder` is not the instance you expect, a standby may take over within one poll interval. |
| `liveHolders` | Count of leases whose heartbeat is fresh | **Must be 0 (nothing enabled) or exactly `P13_WORKER_EXPECTED_COUNT`.** Anything else must already have raised `p13.worker.count_anomaly`. |
| `pollFailures` | Consecutive failures **for this holder/epoch** | ≥ `P13_ALERT_POLL_FAILURE_THRESHOLD` (3) ⇒ alert 1. Resets on a successful fenced cycle. |
| `lastErrorCode` | Machine-readable last failure | `CONTROL_UNREADABLE` = the pause flag could not be read (the cycle was skipped, fail-closed). Anything else points at the DB or the escalation path. |
| `thisInstance` | This process's holder id | Compare with `holder` to learn whether *you* are talking to the owner or a standby. |
| `lastJobAt`, `lastJobSummary` | Last executed cycle and its counts (`processed`, `skipped`, …) | `skipped` counts are expected after a crash recovery — that is the fence refusing duplicate work, not a failure. |

`control` block: `{ controlKey, paused, reason, updatedBy, updatedAt }`. A `paused: true` with no
`reason` cannot exist — the service refuses it.

Number of enabled instances interpretation: the alert is computed from `liveHolders` compared against
`P13_WORKER_EXPECTED_COUNT`, **not** from an environment variable count, so a mis-declared topology
shows up as `count_anomaly` rather than as silent double-processing.

---

## 3. Alert triage

All alerts are rows in `ops_alerts`; `GET /v1/admin/ops/p13/alerts?limit=50` lists those in
`PENDING`, `SENT` or `FAILED` status ordered CRITICAL → WARN → INFO then most-recently-observed. The
on-demand equivalent of the periodic scan is `POST /v1/admin/ops/p13/scan` (read-only with respect to
business data).

State machine: `PENDING → SENT | FAILED | SUPPRESSED → RESOLVED`. `dedup_key` is **unique in the
database**, so a condition cannot fan out into an unbounded alert pile; repeats within
`P13_ALERT_REPEAT_WINDOW_MS` increment `suppressed_count` instead of creating rows.

| # | `condition_key` | Sev | First triage step |
|---|---|---|---|
| 1 | `p13.worker.poll_failures` | CRITICAL | Read `last_error_code` on the lease row; check DB reachability and connection pooling. The worker keeps failing closed — nothing is being half-processed. |
| 2 | `p13.return.escalation_overdue` | WARN | A return passed `expires_at` and is still `REQUESTED`. Verify the worker is enabled and holding the lease; a disabled worker with real traffic is the usual cause. |
| 3 | `p13.worker.count_anomaly` | CRITICAL | `liveHolders` ≠ expected. Zero ⇒ enablement/ownership failure. Two ⇒ **pause the worker immediately**, then find the second instance; do not rely on it being the old one. |
| 4 | `p13.worker.heartbeat_stale` | CRITICAL | Distinguish crashed holder (lease expired, a replacement has taken over — expect a new `epoch`) from a live-but-stalled holder (heartbeat old, `expires_at` not yet passed). |
| 5 | `p13.refund.failed` / `p13.refund.stuck` | CRITICAL / WARN | See §4. |
| 6 | `p13.commission.reversal_failed` / `reversal_error` / `reversal_duplicate_attempt` | CRITICAL / WARN | See §5. |
| 7 | `p13.financial.invariant_violation` | CRITICAL | See §5; treat as a stop-work condition until reconciled. |
| 8 | `p13.tenant.isolation_violation` / `p13.tenant.isolation_denial` | CRITICAL / WARN | See §6. |
| 9 | `p13.outbox.delivery_failed`, `p13.audit.write_failed` | CRITICAL | See §7. |
| 10 | `ops.alert.delivery_failed` | CRITICAL | **The monitoring system itself is failing.** See §7.2. |

Four more conditions are raised by their producers rather than by the scanner, so they can appear
between scans and will not be reproduced by `POST /scan`:

| `condition_key` | Sev | Raised by |
|---|---|---|
| `p13.worker.ownership_lost` | WARN | the worker, when a renewal finds its epoch fenced (L186, L243) — a takeover happened. Expect it during a rolling restart; treat an unexplained one as stop condition #1 |
| `p13.worker.control_changed` | WARN / INFO | `OpsControlService.setPaused` — WARN on pause, INFO on resume |
| `p13.pilot.flag_changed` | INFO | `PilotControlService.setFlag` |
| the pilot allowlist add/revoke mutations | INFO | `PilotControlService`, alongside their `audit_logs` rows |

`detail` is a sanitised projection: identifiers and counts only — never tokens, credentials, personal
data or request bodies. Read `resource_type` + `resource_id` to find the object, and `org_id` to scope
the blast radius.

---

## 4. A refund failed or is stuck

`REFUND_FAILED` is a real, durable state — the money did not move and the return is **not** closed.

```sql
-- [DEV-VERIFIED] column surface used by the monitor's own queries
SELECT rr.id, rr.status, rr.sub_order_id, rr.updated_at, o.org_id
FROM return_requests rr
JOIN orders o ON o.id = rr.sub_order_id
WHERE rr.status = 'REFUND_FAILED'
ORDER BY rr.updated_at;
```

Procedure:

1. Do **not** re-issue by editing rows. The transition guards in `ReturnsService` are the protection;
   a manual SQL status change bypasses them and destroys the audit story.
2. Confirm the cause from `ops_alerts.detail` and the API log lines around that return id.
3. Resolve the underlying provider/state problem.
4. Only then retry through the authenticated admin route with a token that holds the matching
   `admin:returns:*` permission, so the attempt is dual-approval-aware and audited.
5. Record the outcome in the alert row by letting the next scan resolve it — the scanner clears the
   condition when the state is no longer observed; do not hand-edit `ops_alerts.status`.

For a manual-review case that needs a financial correction rather than a retry, use a settlement
adjustment (`POST /v1/admin/settlement-adjustments`), never a direct refund call. Remember the Phase 4
finding: **adjustments stay blocked on FX** and posting returns 409 until an authoritative rate is
resolved. There is no admin UI for creating one (§6 of the security report).

---

## 5. Reversal and reconciliation incidents

Commission reversal failures surface as `p13.commission.reversal_failed` (a throw),
`…reversal_error` (a non-idempotency error) and `…reversal_duplicate_attempt` (an idempotency key
that already existed). The duplicate-attempt counter is **informational, not an outage**: it is the
idempotency guard doing its job under a retry.

```sql
-- [DEV-VERIFIED] table names present in the development database:
-- commission_reversals, reconciliation_runs, reconciliation_discrepancies, outbox_events
SELECT condition_key, severity, count(*) AS n, max(last_observed_at) AS latest
FROM ops_alerts
WHERE condition_key LIKE 'p13.commission.%'
GROUP BY condition_key, severity;
```

Financial-invariant violations (`p13.financial.invariant_violation`) are the ten `CHECK_NAMES` the
monitor asserts — including "posted adjustment with unresolved FX" and refund totals exceeding the
payable amount. On this alert:

1. **Pause P13 processing** (§8.1) — this is the one alert where stopping the worker is the default
   answer rather than an escalation.
2. Freeze reconciliation for the affected period.
3. Collect evidence (§9) for the specific `resource_id` before anyone "fixes" a row.
4. Never auto-reverse a reversal and never reverse a posted adjustment by SQL. Reversal
   idempotency, caps and transactional consistency are enforced in
   `commission-reversal.service.ts`; bypassing them with data edits is the incident escalating.

Reconciliation runs are organization-scoped end to end (HA-19), so state the org in every query and
every ticket.

---

## 6. Tenant-isolation incidents

Two distinct signals. Do not conflate them:

- **`p13.tenant.isolation_denial` (WARN)** — a request was *blocked*. Source: the in-process counters
  `financial_isolation_denials_total` (reason `missing_active_org`) and
  `pilot_eligibility_denials_total` (reason `not_enforced|missing_org_id|allowlist_unreadable|org_not_allowlisted|entry_disabled`). A denial is the control working; a *rising rate* is a token-minting or
  configuration problem.
- **`p13.tenant.isolation_violation` (CRITICAL)** — the monitor found cross-tenant *data*, i.e. the
  control failed. Treat as a security incident: preserve, do not remediate in place.

```sql
SELECT condition_key, severity, org_id, resource_type, resource_id, title, detail, first_observed_at
FROM ops_alerts
WHERE condition_key LIKE 'p13.tenant.%'
ORDER BY last_observed_at DESC;
```

Immediate actions for a violation: pause the worker, revoke the pilot allowlist entry that opened the
affected scope, capture the adjustment/return ids from `detail`, and pull the corresponding
`audit_logs` rows for those `resource_id`s before any further mutation. Note that authorization
denials are counted **per process**, so a denial spike spread over replicas will read lower than the
cluster total.

---

## 7. Outbox backlog and alert-delivery failure

### 7.1 Outbox

`p13.outbox.delivery_failed` fires on the `outbox_events` delivery failure surface. A backlog is not
always a failure — check age and state before escalating, and remember the dispatcher is a separate
polling component from the P13 worker: pausing P13 does **not** pause outbox dispatch.

### 7.2 Alert delivery — the alert about the alerts

`ops.alert.delivery_failed` is raised when a notification could not be handed to the sink, with
anti-recursion logging so a failing sink cannot generate an unbounded alert storm. Read the status
snapshot's `alerts.channel`:

```powershell
# [SHAPE VERIFIED BY TESTS] AL-23 asserts the snapshot rolls up status, counters and channel; the
# command itself targets a running server, which is not up in this session
# expected: "webhook" when P13_OPS_ALERT_WEBHOOK_URL is set, otherwise "log-only"
curl -s -H "Authorization: Bearer <admin-access-token>" http://localhost:3000/v1/admin/ops/p13/status | jq .alerts
```

`channel: "log-only"` is a **documented Phase 4 limitation, not an outage** — alerts remain durable in
`ops_alerts` and remain visible in `GET /alerts`, but nothing pages anyone. `status: 'SUPPRESSED'`
means exactly that: recorded, not delivered. If you configured a webhook and still see `log-only`,
the variable did not reach the process.

If the sink is failing: fix the sink, then confirm delivery by checking `delivered_at`,
`attempt_count` and `last_error` on the newest alert. Do not delete `ops_alerts` rows to "clear" the
queue — the unique `dedup_key` is what prevents an incident from producing hundreds of notifications.

---

## 8. Pause, resume, recovery and rollback

### 8.1 Pause (kill switch)

```powershell
# [SHAPE VERIFIED BY TESTS] HA-11/HA-12 execute this route over HTTP (403 without the key, 400
# without a reason, audited 2xx with both). Requires `admin:returns:write`.
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" `
  -d '{\"reason\":\"P13 incident <id>\"}' `
  http://localhost:3000/v1/admin/ops/p13/worker/pause
```

A **reason is mandatory** — the HTTP layer returns 400 `A reason is required to pause P13 processing`
and the service refuses an unexplained flip. Effects: no new protected jobs start; the lease is
**neither released nor re-epoch'd** (KS-02), so no competing replica can start work; items already
inside their own transaction complete. Worst-case latency is one heartbeat interval (default 30 s).

### 8.2 Resume

```powershell
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" `
  -d '{\"reason\":\"incident <id> resolved\"}' `
  http://localhost:3000/v1/admin/ops/p13/worker/resume
```

Resume is idempotent (KS-04): no duplicate escalation, no duplicate outbox event, no re-notification.
Already-processed returns read as `skipped` in `lastJobSummary`, which is the fence working.

### 8.3 Recovery after a crash

Do nothing manually. A replacement instance re-acquires at a higher `epoch` once the TTL (default
90 s) has passed; `FOR UPDATE SKIP LOCKED` plus the status guard inside `escalateReturn` make the
re-run safe (KS-09). A graceful restart releases the lease immediately (`onModuleDestroy`, KS-10).
Verify afterwards: `epoch` incremented by exactly the number of real ownership changes, `liveHolders`
= expected, `pollFailures` = 0.

### 8.4 Rollback levels

| Need | Action | Reversible | Rehearsed here? |
|---|---|---|---|
| Stop background work now | `POST …/worker/pause` | yes, `…/worker/resume` | **[DEV-VERIFIED]** |
| Close the pilot | disable `p13.pilot.enabled`, or revoke the allowlist entry | yes; durable records preserved (PL-05/PL-13/HA-32/HA-33) | **[DEV-VERIFIED]** |
| Remove Phase 4 code | revert the application changes; **leave migration 0063 in place** — its tables are additive and no column was dropped or retyped | yes | design only, **[PROD — NOT REHEARSED]** |
| Undo a financial effect | **not offered.** Nothing in the pause/pilot path reverses a refund, reversal or adjustment; that is deliberate (§5/§7) | — | — |

### 8.5 Host environment defect that can block a build (Windows)

If a build or test run fails with `Cannot find module 'react'`, `Cannot find module '../compiler'`,
or `pnpm store status` reports `ERR_PNPM_MODIFIED_DEPENDENCY`, this is **not** an application defect:
the pnpm virtual store has lost files. Follow
`docs/production/SCS-PNPM-WINDOWS-VIRTUAL-STORE-RECOVERY-RUNBOOK.md`:

```powershell
# [DEV-VERIFIED] REPAIR_EXIT=0; note that a plain `pnpm install` reports "Already up to date" and changes nothing
pnpm install --offline --force
pnpm store status
```

Do **not** delete `node_modules` or the lockfile, and do not "fix" the store by regathering the
lockfile. An `cpu-features` install error during the relink is optional and non-blocking.

---

## 9. Evidence collection

Every query below is read-only and safe to run during an incident, **and each one was executed
against the development database in this session** (`SQL*_EXIT=0` on all of them). Their current
output is also the evidence for §10 item 3 and the pre-flight in §1.1 — the Phase 4 control tables
exist, are seeded, and hold nothing:

```text
SELECT … FROM worker_leases;
       lease_key       | holder_id | holder_host | holder_pid | epoch | … | poll_failures
-----------------------+-----------+-------------+------------+-------+---+--------------
 p13-return-expiration |           |             |            |     0 | … |            0
(1 row)

SELECT … FROM ops_alerts ORDER BY last_observed_at DESC LIMIT 5;      → (0 rows)
SELECT … FROM ops_control_audit ORDER BY changed_at DESC;             → (0 rows)
SELECT … FROM settlement_adjustments ORDER BY created_at DESC LIMIT 5; → (0 rows)
```

```sql
-- Who owned the lease, when, and at which epoch
SELECT lease_key, holder_id, holder_host, holder_pid, epoch,
       acquired_at, heartbeat_at, expires_at,
       poll_failures, last_error_code, last_job_at, last_job_summary
FROM worker_leases;

-- Alert history for one condition, newest first
SELECT id, dedup_key, severity, status, title, detail,
       fire_count, suppressed_count, attempt_count,
       delivery_channel, last_error, org_id, resource_type, resource_id,
       first_observed_at, last_observed_at, delivered_at, resolved_at
FROM ops_alerts
WHERE condition_key = 'p13.worker.poll_failures'
ORDER BY last_observed_at DESC LIMIT 50;

-- Kill-switch trail: the current state and every change with its actor and reason
SELECT * FROM ops_controls;
SELECT control_key, paused, reason, actor_id, actor_kind, changed_at
FROM ops_control_audit ORDER BY changed_at DESC;

-- Pilot state: flags, allowlist, and the append-only mutation provenance
SELECT key, enabled, updated_by FROM feature_flags WHERE key = 'p13.pilot.enabled';
SELECT org_id, store_id, enabled, note, created_by, updated_at
FROM p13_pilot_allowlist ORDER BY org_id, store_id;

-- Adjustment / FX posture for a financial invariant investigation
-- (provenance of who approved lives in `approval_hash` and `audit_logs`, not in
--  per-stage columns on this table)
SELECT id, org_id, sub_order_id, return_request_id, adjustment_type, status, fx_status,
       fx_rate_source, fx_rate, requires_dual_approval, approval_hash,
       amount_minor, usd_equivalent_minor, currency, created_by, created_at, updated_at
FROM settlement_adjustments ORDER BY created_at DESC LIMIT 50;
```

Plus the application trails: `audit_logs` filtered by `resource_id` (and the Phase 4 action names
`p13.worker.pause`, `p13.worker.resume`, `p13.pilot.enable`, `p13.pilot.disable`,
`p13.pilot.allowlist.add`, `p13.pilot.allowlist.revoke`), and pino logs grepped for the holder id,
which is stable per process and appears in every lease line.

Collect **before** remediating. The unique `dedup_key` on `ops_alerts` means a re-run of the scanner
updates the existing row rather than preserving a second copy of the evidence.

---

## 10. Conditions that prohibit pilot activation

Any one of these is a stop condition; all are Phase 4 §10 items with a detection step that exists in
this repository.

| # | Condition | How to detect it |
|---|---|---|
| 1 | Worker exclusivity unverified in the target topology | `liveHolders` > 1, or `p13.worker.count_anomaly` present; all Phase 4 exclusivity evidence is **single-host** |
| 2 | No alert sink configured and no accepted log-only posture | `GET …/status` → `.alerts.channel = "log-only"` |
| 3 | Migration chain incomplete on the target | `select count(*) from _migration_log` < 63 / `0063` absent; worker and monitor fail closed |
| 4 | Any unresolved `p13.financial.invariant_violation` | `ops_alerts` where `condition_key = 'p13.financial.invariant_violation'` and status ≠ `RESOLVED` |
| 5 | Any unresolved `p13.tenant.isolation_violation` | same query, `condition_key = 'p13.tenant.isolation_violation'` |
| 6 | No authoritative FX source, and the pilot flow needs a postable adjustment | `settlement_adjustments.fx_status <> 'RESOLVED'`; posting returns 409 — this is correct behaviour, not a defect |
| 7 | Pause/resume not rehearsed on the target environment | §8 is dev-only evidence; there is **no production deploy configuration in this repository** to rehearse against |
| 8 | Rollback path unverified | §8.4 rows marked **[PROD — NOT REHEARSED]** |

Additionally, activation must not proceed if `p13.pilot.enabled`'s state is unknown rather than
deliberately set: absence reads as off, which is a default, not a decision.

---

## 11. What this runbook is not

It is not a deployment guide — the repository has no production manifest, no Dockerfile and no
observability stack configuration (`infra/` contains only the dev compose file and the backup
scripts). It documents the controls Phase 4 added, the fields those controls expose, and the
procedures that those fields support. Every `[PROD — NOT REHEARSED]` marker is a real gap in this
phase's evidence, not a formality.
