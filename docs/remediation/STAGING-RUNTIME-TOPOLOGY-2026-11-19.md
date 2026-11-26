# Staging Runtime Topology Verification — 19 November 2026

**Environment:** Render staging workspace for SCS  
**Method:** Read-only Render service metadata, application-log inspection and source review  
**Mutation performed:** None

## Render service configuration

The inspected workspace contains one web service, `scs-api-staging`:

| Setting                   | Observed value                              |
| ------------------------- | ------------------------------------------- |
| Source branch             | `develop`                                   |
| Auto-deploy               | Disabled                                    |
| Configured instance count | 1                                           |
| Region / plan             | Frankfurt / Free                            |
| Health check              | `/v1/readyz`                                |
| Build command             | Install dependencies, then build `@scs/api` |
| Start command             | `pnpm --filter @scs/api start:prod`         |

The start command does not run migrations or seeds. The repository release workflow separately runs `db:migrate`, the RBAC-only `db:seed`, verifies the migration ledger, and then deploys the same commit SHA.

No separate Render background-worker service or Render-managed PostgreSQL instance was present in the inspected workspace. The API connects to an external database using `DATABASE_URL`; environment values were not read. The remediation branch is not deployed: the service remains on `develop` and auto-deploy is disabled.

## Runtime worker registration

The 2026-11-19 02:51:19 UTC startup log sample from instance `srv-daklr78ae00c73bstr50-d4zbk` contains the following registrations:

| Component                | Runtime behavior                                  | Registration                 |
| ------------------------ | ------------------------------------------------- | ---------------------------- |
| `OutboxDispatcher`       | Polls every 1 second                              | Embedded in API process      |
| `ShippingCarrierWorker`  | Polls every 5 seconds                             | Embedded in API process      |
| `AutoCompleteWorker`     | Polls every 60 seconds                            | Embedded in API process      |
| `P13MonitorService`      | Scans every 60 seconds via log-only alert channel | Embedded in API process      |
| `ReturnExpirationWorker` | Disabled; `P13_WORKER_ENABLED` is unset           | No protected P13 return work |

The API module graph registers the outbox, orders, shipping, returns and operations modules. Their providers run in the same Nest application process. Repeated registrations across different Render instance IDs in the sampled logs are consistent with restarts; they do not establish simultaneous execution by multiple instances.

## Claiming, leases and side-effect boundaries

- **Shipping carrier worker:** atomically claims carrier events using `FOR UPDATE SKIP LOCKED`, records `locked_at/locked_by`, recovers stale carrier-only leases, and processes only the carrier event prefix. The generic dispatcher explicitly excludes `shipping.carrier.%`.
- **Auto-complete worker:** claims due delivered orders using `FOR UPDATE SKIP LOCKED`, persists a five-minute claim owner/lease, and calls an order completion path that fences the status update by current owner and unexpired lease.
- **P13 return-expiration worker:** is disabled in staging. If enabled, it must acquire/renew a durable lease with an epoch fence, check the durable pause control before business-state reads, and re-check fence and pause before each item. Its current business action is to escalate an overdue return to admin review. It does not approve, reject, refund, or terminally expire a return solely because the merchant SLA elapsed.
- **P13 monitor:** runs independently of the protected return worker and scans operational conditions. Runtime logs show the alert channel is `log-only`; no external webhook is configured.
- **Generic outbox dispatcher:** currently selects pending non-carrier events, logs the event, then marks it dispatched. It does not atomically claim rows. Because its current dispatch action is only a log statement and Render is configured for one API instance, this is not presently an external duplicate side effect. Do not horizontally scale the API or add side-effecting consumers to this dispatcher until atomic claiming/lease semantics and multi-instance tests are added.

## Safe activation boundary

The P13 return worker remains off by default. Source defaults are: worker disabled, expected holder count zero while disabled, 90-second lease TTL, 30-second heartbeat (clamped to no more than half the lease TTL), 45-second startup delay and 120-second poll cadence.

Before any staging/prod activation:

1. Select exactly one intended P13 holder and set the expected holder count explicitly.
2. Establish and verify the durable pause control before enabling the worker.
3. Configure `P13_OPS_ALERT_WEBHOOK_URL` and a matching signing secret of at least 32 characters. If the URL is present but the secret is missing/too short, the code fails closed to log-only; unsigned alerts are never sent.
4. Enable the worker only through an approved change, verify its lease holder/epoch and monitor status, then resume through the audited operations control.
5. Exercise a controlled, non-financial test return and verify the only automatic transition is escalation to admin review.

No worker flag, environment value, alert endpoint, secret, service setting, database row, migration, restart or deployment was changed during this review.
