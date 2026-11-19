# Staging Runtime Topology Verification — 19 November 2026

**Environment:** Render staging workspace for SCS  
**Method:** Read-only Render service metadata and application-log inspection  
**Mutation performed:** None

## Render service configuration

The inspected workspace currently contains one web service, `scs-api-staging`:

| Setting | Observed value |
|---|---|
| Source branch | `develop` |
| Auto-deploy | Disabled |
| Instance count | 1 |
| Region / plan | Frankfurt / Free |
| Health check | `/v1/readyz` |
| Build command | Install dependencies, then build `@scs/api` |
| Start command | `pnpm --filter @scs/api start:prod` |

The start command does not run migrations or seeds. The repository release workflow separately runs `db:migrate`, the RBAC-only `db:seed`, verifies the migration ledger, and then deploys the same commit SHA.

No separate Render background-worker service or Render-managed PostgreSQL instance was present in the inspected workspace. The API connects to an external database using `DATABASE_URL`; the connector did not expose environment values, and none were read.

## Worker registration observed in Render logs

| Component | Observed runtime behavior |
|---|---|
| `OutboxDispatcher` | Registered; polls every 1 second |
| `ShippingCarrierWorker` | Registered; polls every 5 seconds |
| `P13MonitorService` | Scans every 60 seconds in log-only mode |
| `ReturnExpirationWorker` | Disabled because `P13_WORKER_ENABLED` is unset |
| P13 alert channel | Log-only; no webhook configured |

The outbox dispatcher and carrier worker are registered inside the API process, not in a separate worker service. The service currently reports one configured instance. Repeated registration messages across different instance IDs in the sampled logs are consistent with restarts; they do not establish simultaneous execution by multiple instances.

## Operational conclusions

1. Do not assume a Render restart or ordinary deploy applies migrations.
2. Use the controlled release workflow for staging migrations, RBAC seed, ledger verification and deployment. Its manual dispatch is a real release, not a dry run.
3. Do not enable protected P13 jobs until the worker flag, single-owner topology, pause/resume controls and alert webhook are configured and verified.
4. Keep outbox/carrier idempotency and lease/claim tests as required evidence while those workers remain embedded in the API process.
5. The remediation branch is not deployed: the service remains on `develop` and auto-deploy is disabled.

No service settings, environment variables, deployment, restart, migration, seed or worker flag were changed during this review.
