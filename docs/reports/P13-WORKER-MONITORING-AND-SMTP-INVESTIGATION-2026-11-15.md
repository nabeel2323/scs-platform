# P13 Worker Monitoring and SMTP Investigation

**Date:** 2026-11-15  
**Branch:** `integration/pr-122-develop-into-main-2026-11-16`  
**Base:** `main` + `develop`  
**Scope:** Preserve the P13 worker-count monitoring correction from PR #114 and the read-only SMTP timeout investigation while integrating the Resend email provider and the existing mainline changes.

## Executive summary

The deployed P13 worker is intentionally opt-in. The configuration default was `P13_WORKER_ENABLED=false`, while the expected worker count independently defaulted to `1`. The monitor therefore raised a CRITICAL zero-worker alert even though no worker was expected to run.

The remediation makes the default expected count depend on worker enablement:

- Worker disabled, no explicit expected count: expected count is `0`.
- Worker enabled, no explicit expected count: expected count is `1`.
- Explicit positive `P13_WORKER_EXPECTED_COUNT`: preserved, including on an API instance that does not host the worker. This supports a separately hosted worker process.
- When expected count is zero, the monitor emits no count anomaly and resolves prior count-anomaly alerts for known lease keys, including the P13 return-expiration lease.

The existing worker opt-in, lease acquisition, fencing, heartbeat, pause control, and return-processing behavior are unchanged.

## Live evidence

Read-only inspection of the shared Supabase database found:

| Item | Observed value |
|---|---:|
| Rows in `worker_leases` | 0 |
| Expected live holders in the old configuration | 1 |
| Actual live holders | 0 |
| P13 count-anomaly alert status | `SUPPRESSED` |
| Alert fire count | 156 |
| Suppressed repeats | 155 |
| Alert delivery channel | `log-only` |

The monitor's alert is persisted, but external delivery is not configured. No database rows were changed during this investigation.

## Implementation

1. `resolveP13OpsConfig()` now defaults `expectedWorkerCount` to zero when the worker is disabled and one when it is enabled.
2. An explicit `P13_WORKER_EXPECTED_COUNT` remains authoritative. This is important when the API process is not itself the worker host but is expected to monitor a worker running elsewhere.
3. Worker-count evaluation was extracted into `worker-count-monitor.ts` so the enabled, disabled, missing-lease, healthy-lease, and explicit-count cases can be tested without a database.
4. When no worker is expected, known count-anomaly keys are returned as clears. The monitor's existing resolution path then closes the stale alert on its next scan after this code is deployed.

## Regression coverage

Added `p419-worker-count-monitor.spec.ts` covering:

- Disabled worker defaults to zero expected holders.
- Enabled worker defaults to one expected holder.
- Explicit expected count is preserved for a separately hosted worker.
- No anomaly is raised when zero workers are expected, and the old alert key is cleared.
- A missing lease is CRITICAL when one worker is expected.
- A live expected lease clears the anomaly.
- An explicit expected count greater than the live holder count remains a CRITICAL mismatch.

Hosted CI is the authoritative execution gate for this PR. Results must be recorded after GitHub Actions completes; this report does not claim tests passed before that run.

## SMTP timeout investigation

Render application logs contain two SMTP timeout events:

| UTC timestamp | Evidence |
|---|---|
| 2026-11-10 16:04:34 | SMTP timeout for a masked Gmail recipient |
| 2026-11-13 11:30:48 | SMTP timeout; an OTP send began at 11:30:38 and timed out approximately 10 seconds later |

The same Render log history subsequently reports the SMTP provider configured for `smtp.gmail.com:587` with authentication, including on November 14 and November 15.

Source inspection confirms:

- Nodemailer connection, greeting, and socket timeouts are each bounded at 10 seconds.
- `ETIMEDOUT` and `ESOCKETTIMEDOUT` are classified as `SMTP_TIMEOUT`.
- The result is non-retryable and has `deliveryOutcome: 'unknown'`.

**No automatic retry was added.** A timeout can occur after the SMTP server has accepted the message but before the client receives confirmation. Retrying could send duplicate OTP messages. The logs do not identify which SMTP stage timed out, and they do not establish a current persistent failure. No SMTP credentials, provider settings, timeout values, or delivery policies were changed.

If timeouts recur, the next diagnostic should correlate the delivery correlation ID with the provider's activity logs and inspect the connection/greeting/socket stage using redacted diagnostics. Do not expose SMTP credentials or OTP contents in logs.

## Safety and deployment boundaries

- No Supabase data or schema changes were made during the investigation.
- No Render environment-variable or service changes were made during the investigation.
- No SMTP credentials or delivery tests were used.
- No API deployment was triggered by the investigation.
- No changes were made to worker enablement, pilot mode, or financial workflows.
- The earlier backport to `develop` did not itself deploy the API or mutate the shared Supabase database. Its release note warned that merging to `develop` triggers the configured staging release workflow, including migrations, RBAC seeding, and Render deployment, against an environment sharing the Supabase database.
- This integration commit only combines repository content. Any subsequent deployment is governed by the workflow for the target branch and must be treated as a live operation with the appropriate release authorization.
- The existing suppressed alert remains in the shared database until the corrected monitor runs after deployment; this report does not mutate it directly.

## Integration and release gate

- [ ] Focused P13 worker-count unit test passes in GitHub Actions.
- [ ] API typecheck and build pass.
- [ ] Full required repository CI checks pass.
- [ ] Review confirms explicit expected-count override behavior is preserved.
- [ ] Resend provider and OTP regression tests pass.
- [ ] After a separately authorized API deployment, verify the stale count-anomaly alert is resolved by the monitor's normal scan.
