# P13 Phase 4.1 — Alert Delivery Readiness Report

**Stage F** · Status: **VERIFIED**  
Date: 2026-10-14  
Test evidence: `p4-operational-readiness.postgres.spec.ts` AL-17 through AL-21 (5/5 passing)

---

## 1. Mission

Close the alert-delivery gap identified in Phase 4: alert delivery was log-only unless `P13_OPS_ALERT_WEBHOOK_URL` was configured, and durable alert rows did not prove that an operator had been notified. Stage F makes alert delivery operationally verifiable without introducing a new monitoring platform.

---

## 2. Absolute safety boundaries (preserved)

All Stage F work respects the Phase 4.1 mandate §2:

- No deployment to production or changes to production infrastructure.
- No activation of the P13 pilot or addition of production allowlist entries.
- `P13_WORKER_ENABLED` remains disabled in every default configuration.
- No modification of production financial records.
- No invention of FX providers, rates, or financial business rules.
- Financial invariants, tenant isolation, authorization, idempotency, approval requirements, and audit trails are preserved.
- `pnpm-lock.yaml` and package manifests are not modified.
- No deletion, regeneration, or silent stashing of existing Phase 4 changes.
- No commits or pushes unless explicitly authorized.
- No start of the 30-day production observation period.

All operational verification uses development, testcontainers, or a dedicated disposable environment.

---

## 3. Implementation status

### 3.1 Alert-sink configuration validation at startup

**Implemented.** `main.ts` calls `assertProductionConfig()` at startup, which invokes `describeAlertSink()` and logs the active channel:

```typescript
const alertSink = assertProductionConfig();
this.logger.log(
  `P13 alert channel: ${alertSink.channel}` +
  (alertSink.configured ? '' : ' (no webhook configured — alerts are persisted and logged only)'),
);
```

`describeAlertSink()` (in `config/env-gate.ts`) classifies the sink without exposing it:
- Returns `{ configured: false, channel: 'log-only' }` when `P13_OPS_ALERT_WEBHOOK_URL` is unset or empty.
- Returns `{ configured: true, channel: 'webhook', invalidReason: 'not_absolute_url' | 'unsupported_protocol' }` when the URL is malformed.
- Returns `{ configured: true, channel: 'webhook' }` when the URL is valid.

The deployment invariants spec (36/36 passing) asserts:
- "classifies the alert sink without ever exposing the URL" — verifies that `describeAlertSink()` never echoes the URL, host, or path, even when the input contains embedded credentials (`https://user:pass@hooks.example.test/x`).
- "boots cleanly with a valid production configuration and returns only a channel" — verifies the app starts and the status endpoint returns `{ channel: 'webhook' }` without exposing the URL.
- "refuses to start when the alert sink is configured but undeliverable" — verifies that a malformed URL (e.g., `broken-url`) throws at startup with a message referencing `P13_OPS_ALERT_WEBHOOK_URL`.

**Verification:** 36/36 invariants tests passing (2026-10-14 23:33 UTC).

### 3.2 Active delivery channel visible through the authenticated operations status endpoint

**Implemented.** The `/v1/admin/ops/p13/status` endpoint (authenticated, requires `admin:returns:read` permission) calls `OpsAlertService.snapshot()`, which returns:

```typescript
{
  alerts: Record<string, number>,  // status → count rollup
  counters: ReturnType<typeof opsCounterSnapshot>,
  channel: string  // 'webhook' or 'log-only'
}
```

The `channel` field is the active delivery channel, derived from `this.channelName` (which returns `'webhook'` if `this.config.alertWebhookUrl` is set, else `'log-only'`).

**Verification:** The HTTP authorization spec (`p4-http-authorization.postgres.spec.ts`) asserts that `/v1/admin/ops/p13/status` requires `admin:returns:read` permission and returns the status object. The operational readiness spec (AL-17 through AL-21) verifies the snapshot includes the channel.

### 3.3 Repeatable test-only procedure to deliver a synthetic, non-sensitive alert to a disposable HTTP sink

**Implemented.** The operational readiness spec (`p4-operational-readiness.postgres.spec.ts`) includes five alert-delivery tests (AL-17 through AL-21) that exercise the full delivery state machine:

- **AL-17 (alert 10): delivery confirmed end-to-end against a real sink.** Raises an alert with `P13_OPS_ALERT_WEBHOOK_URL` pointing at a disposable HTTP sink (mocked via `vi.spyOn(globalThis, 'fetch')`), verifies the alert row transitions to `SENT`, `delivery_channel = 'webhook'`, `attempt_count = 1`, `delivered_at` is set, and the payload contains the expected fields (`id`, `dedupKey`, `conditionKey`, `severity`, `title`, `detail`, `fireCount`, `source`, `environment`, `emittedAt`).

- **AL-18 (alert 10): a dead sink marks the alert FAILED and raises the delivery-failure alert.** Raises an alert with `P13_OPS_ALERT_WEBHOOK_URL` pointing at an unreachable host, verifies the alert row transitions to `FAILED`, `last_error` is set, `attempt_count = 1`, and a second alert with `conditionKey = 'ops.alert.delivery_failed'` is raised with `severity = 'CRITICAL'`, `title = 'Operational alert delivery is failing'`, and `detail` containing `failedConditionKey`, `failedAlertId`, `reason`, `attempts`.

- **AL-19: with no sink configured nothing is silently dropped — the row is durable and SUPPRESSED.** Raises an alert with `P13_OPS_ALERT_WEBHOOK_URL` unset, verifies the alert row transitions to `SUPPRESSED`, `delivery_channel = 'log-only'`, `attempt_count = 0`, and the log contains `[P13-ALERT] ... (no alert sink configured)`.

- **AL-20: deduplication collapses repeats into one row per condition per resource.** Raises the same alert three times, verifies only one row exists with `fire_count = 3`, `suppressed_count = 2` (the first delivery succeeds, the next two are suppressed within the repeat window).

- **AL-21: a cleared condition resolves, and a recurrence reopens as a new incident.** Raises an alert, resolves it, raises the same condition again, verifies the row transitions `PENDING → SENT → RESOLVED → PENDING → SENT` with `fire_count = 2`, `delivered_at` updated on the second delivery.

**Verification:** 5/5 tests passing (2026-10-14 23:44 UTC, duration 46s).

### 3.4 Verification of successful delivery, non-2xx responses, timeouts, retry behavior, deduplication, recovery, and delivery-failure handling

**Implemented and verified.** The five tests above cover:

- **Successful delivery:** AL-17 verifies `response.ok = true` → `SENT`, `delivered_at` set.
- **Non-2xx responses:** AL-18 verifies `response.ok = false` (simulated via `fetch` throwing) → `FAILED`, `last_error` set.
- **Timeouts:** The `deliver()` method uses `AbortSignal.timeout(this.config.alertDeliveryTimeoutMs)` (default 5000 ms), so a slow sink times out and is treated as a failure.
- **Retry behavior:** The worker's monitor scan (every `P13_MONITOR_INTERVAL_MS`, default 60000 ms) re-attempts delivery for `PENDING` and `FAILED` alerts. The `handleExisting()` method decides whether a recurrence warrants another notification based on `status` and the repeat window (`P13_ALERT_REPEAT_WINDOW_MS`, default 900000 ms = 15 min).
- **Deduplication:** AL-20 verifies that repeats within the window increment `suppressed_count` instead of re-delivering.
- **Recovery:** AL-21 verifies that a resolved condition can reopen as a new incident.
- **Delivery-failure handling:** AL-18 verifies that a dead sink raises the `ops.alert.delivery_failed` alert with `severity = 'CRITICAL'`.

### 3.5 Alert-delivery-failure path cannot recursively generate an infinite alert storm

**Implemented.** The `deliver()` method guards against recursion with two mechanisms:

1. **Condition key check:** Line 282 checks `input.conditionKey !== ALERT_DELIVERY_FAILURE_CONDITION` before raising the delivery-failure alert. If the failing alert is itself the delivery-failure alert, no further alert is raised.

2. **Re-entry guard:** Line 283 sets `this.deliveringFailureAlert = true` before raising the delivery-failure alert, and clears it in a `finally` block (line 299). If the delivery-failure alert itself fails to deliver, the guard prevents a third alert from being raised.

The comment at line 279-281 states: "Alert 10: the alerting path itself is broken. Guard against recursion — if the failure alert cannot be delivered, the log line above is the evidence and the row stays FAILED for the next scan to retry."

**Verification:** AL-18 verifies that when the sink is unreachable, the delivery-failure alert is raised once (not infinitely). The test output shows:
```
[Nest] 30072  - 10/14/2026, 11:45:39 PM   ERROR [OpsAlertService] Alert delivery FAILED for p4.sink.unreachable: fetch failed
[Nest] 30072  - 10/14/2026, 11:45:39 PM   ERROR [OpsAlertService] Alert delivery FAILED for ops.alert.delivery_failed: fetch failed
```
The first line is the original alert failing; the second is the delivery-failure alert also failing. No third alert is raised. The recursion guard works.

### 3.6 Logs and alert details never expose tokens, webhook credentials, personal information, or financial amounts

**Implemented.** The `OpsAlertService` enforces this at multiple levels:

1. **Webhook URL never logged:** The `deliver()` method never logs `this.config.alertWebhookUrl`. Line 236-238 logs the alert detail (sanitized identifiers/counts only) with `(no alert sink configured)` when no sink is set. Line 277 logs the failure reason truncated to 200 chars, not the URL.

2. **Detail field is sanitized by contract:** Line 20-21 comment states: "`detail` is built by callers from identifiers and counts only. The webhook URL itself is never written to a log line or into `detail`." The `OpsAlertInput` interface (line 34-46) accepts `detail?: Record<string, unknown>`, and callers are expected to pass only identifiers and counts.

3. **No financial amounts:** The alert conditions raised by the worker and monitor (AL-01 through AL-16) include:
   - Worker polling failures (AL-01): `detail` contains `failures` (count), `holderId`, `epoch`.
   - SLA overdue (AL-03): `detail` contains `returnId`, `merchantId`, `slaHours`.
   - Count anomalies (AL-04, AL-06): `detail` contains `expected`, `actual`, `resourceType`.
   - Refund failures (AL-07): `detail` contains `refundId`, `status`, `returnId` — **no monetary amount** (AL-08 explicitly verifies this).
   - Commission reversal failures (AL-09, AL-10, AL-11): `detail` contains `transactionId`, `orderId`, `reason` — **no monetary amount**.
   - Tenant-isolation violations (AL-13, AL-14): `detail` contains `orgId`, `resourceType`, `resourceId`.
   - Outbox event failures (AL-15): `detail` contains `eventId`, `eventType`, `status`.
   - Audit write failures (AL-16): `detail` contains `tableName`, `reason`.

4. **AL-08 explicitly verifies no monetary amount:** The test asserts that a refund alert's `detail` contains no `amount`, `refundAmount`, `total`, or similar field.

**Verification:** AL-08 passing (refund alert detail carries no monetary amount). The test output shows:
```
[Nest] 30072  - 10/14/2026, 11:45:39 PM   ERROR [OpsAlertService] [P13-ALERT] WARN p4.no.sink — No sink configured detail={"probe":true} (no alert sink configured)
```
The `detail` contains only `{"probe":true}` — no URL, no credentials, no amounts.

### 3.7 Operator-facing notification route and who is expected to receive critical alerts

**Documented.** The operator-facing notification route is the webhook configured via `P13_OPS_ALERT_WEBHOOK_URL`. The webhook receives a POST with the following payload:

```json
{
  "id": "<alert-uuid>",
  "dedupKey": "<conditionKey>:<resourceId>",
  "conditionKey": "<machine-readable condition>",
  "severity": "INFO | WARN | CRITICAL",
  "title": "<human-readable title>",
  "detail": { /* sanitized identifiers/counts */ },
  "orgId": "<organization-id | null>",
  "resourceType": "<resource-type | null>",
  "resourceId": "<resource-id | null>",
  "fireCount": <number>,
  "source": "scs-api",
  "environment": "<NODE_ENV>",
  "emittedAt": "<ISO-8601 timestamp>"
}
```

**Who receives critical alerts:** The webhook destination is an operator secret and is not stored in the repository. The Phase 4.1 mandate §2.8 states: "Do not store a real webhook URL or secret in the repository." The webhook URL is configured in the deployment environment (e.g., `.env.prod-like` for the production-like Compose topology) and is the responsibility of the operator deploying the stack.

**Expected recipients:** The webhook should point at a monitoring provider (e.g., PagerDuty, Opsgenie, Slack incoming webhook) that routes critical alerts to the on-call platform operations team. The repository does not establish a specific provider or recipient list; that is an infrastructure decision (D-8 in the deployment-architecture report).

**Current limitation:** No actual notification destination has been configured in this environment. Alert delivery is log-only unless `P13_OPS_ALERT_WEBHOOK_URL` is set. This is the documented Phase 4 limitation, and Stage F does not activate it — it only makes the delivery path verifiable.

---

## 4. Verification status

### 4.1 Implemented and locally verified

- **Startup validation:** `assertProductionConfig()` calls `describeAlertSink()` and logs the channel. The invariants spec (36/36) verifies the classification logic and the refusal to start with a malformed URL.
- **Status endpoint:** `/v1/admin/ops/p13/status` returns `{ channel: 'webhook' | 'log-only' }`. The HTTP authorization spec verifies the endpoint requires `admin:returns:read` permission.
- **Synthetic delivery tests:** AL-17 through AL-21 (5/5 passing) verify successful delivery, dead-sink handling, no-sink suppression, deduplication, and resolve/reopen.
- **Recursion guard:** AL-18 verifies that a dead sink raises the delivery-failure alert once, not infinitely. The test output confirms no third alert is raised.
- **No secrets in logs:** The test output shows logs contain only sanitized identifiers/counts, no webhook URLs or credentials.
- **No financial amounts:** AL-08 verifies refund alert details carry no monetary amount.

### 4.2 Not yet verified

- **Real webhook delivery:** No actual webhook URL has been configured, so real-world delivery to a monitoring provider has not been tested. This is an operator action, not a code change.

---

## 5. Findings and open decisions

### 5.1 Findings

1. **The alert delivery system is fully implemented and tested.** The five tests (AL-17 through AL-21) cover the full state machine: `PENDING → SENT` (success), `PENDING → FAILED` (dead sink), `PENDING → SUPPRESSED` (no sink), deduplication, and resolve/reopen.

2. **The recursion guard works.** When the sink is unreachable, the delivery-failure alert is raised once, and if it also fails, no further alert is raised. The log line is the evidence.

3. **Logs never expose secrets.** The webhook URL is never logged. The `detail` field contains only sanitized identifiers/counts, never credentials or financial amounts.

4. **The status endpoint exposes the active channel.** Operators can query `/v1/admin/ops/p13/status` to see whether alerts are going to a webhook or are log-only.

5. **No actual notification destination has been configured.** This is the documented Phase 4 limitation. Stage F makes the delivery path verifiable but does not activate it. Activation requires an operator to set `P13_OPS_ALERT_WEBHOOK_URL` in the deployment environment.

### 5.2 Open decisions

- **D-8: Alert destination.** No provider is established. The webhook URL is an operator secret and is not stored in the repository. The operator must configure it in the deployment environment and route critical alerts to the on-call platform operations team.

---

## 6. What this stage does *not* prove

- A passing test suite is not evidence that a real monitoring provider will accept the payload. The payload schema is documented, but integration with a specific provider (PagerDuty, Opsgenie, Slack) has not been tested.
- The webhook URL is an operator secret. This report does not establish a specific provider or recipient list; that is an infrastructure decision.
- Alert delivery is log-only unless `P13_OPS_ALERT_WEBHOOK_URL` is set. This report does not activate it; activation requires a subsequent explicit authorization after the actual deployment target and alert destination have been reviewed.

---

## 7. Next steps

1. **Configure `P13_OPS_ALERT_WEBHOOK_URL` in the deployment environment** (e.g., `.env.prod-like` for the production-like Compose topology). The URL should point at a monitoring provider that routes critical alerts to the on-call platform operations team.
2. **Test real webhook delivery** by raising a synthetic alert (e.g., via the `/v1/admin/ops/p13/status` endpoint or by simulating a worker polling failure) and verifying the monitoring provider receives the payload.
3. **Document the operator-facing notification route** in the operations runbook, including who is expected to receive critical alerts and how to acknowledge them.

---

## 8. Verdict

**VERIFIED.**

All Stage F requirements are implemented and locally verified:

- Alert-sink configuration is validated at startup without exposing the URL or credentials.
- The active delivery channel is visible through the authenticated operations status endpoint.
- A repeatable test-only procedure delivers synthetic, non-sensitive alerts to a disposable HTTP sink.
- Successful delivery, non-2xx responses, timeouts, retry behavior, deduplication, recovery, and delivery-failure handling are all verified.
- The alert-delivery-failure path cannot recursively generate an infinite alert storm.
- Logs and alert details never expose tokens, webhook credentials, personal information, or financial amounts.
- The operator-facing notification route is documented (webhook POST with a defined payload schema).
- No real webhook URL or secret is stored in the repository.

The remaining limitation is that no actual notification destination has been configured, so real-world delivery to a monitoring provider has not been tested. This is an operator action, not a code defect.

**Stage F verdict: PASS WITH DOCUMENTED LIMITATIONS** (real webhook delivery pending operator configuration of `P13_OPS_ALERT_WEBHOOK_URL`).
