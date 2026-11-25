# Render Staging Read-only Runtime Inspection — 25 November 2026

## Scope and authorization

The user confirmed the Render workspace for read-only inspection. This report records configuration and application-log observations only. No environment variable values were retrieved, changed, or exposed. No restart, deploy, worker activation, database write, business workflow, or protected GitHub workflow dispatch was performed.

## Service configuration

The workspace listed one service: `scs-api-staging`, a Render web service in Frankfurt.

- Repository: `nabeel2323/scs-platform`
- Configured branch: `develop`
- Auto-deploy: disabled (`autoDeploy=no`, trigger `off`)
- Instance count: 1
- Plan: Free
- Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @scs/api build`
- Start command: `pnpm --filter @scs/api start:prod`
- Health check: `/v1/readyz`
- Last live deployment observed: commit `f74eb588cc58fc99b105e749d39dbfbacb4f9775`, deployed successfully on 20 November 2026.

The configured start command does not run migrations or seeds. The separate `.github/workflows/release.yml` workflow is mutating: it applies migrations, runs the RBAC seed, verifies the migration ledger, deploys to Render, and checks readiness. Manual dispatch is not a dry run.

No separate Render worker or cron service was returned by the service inventory. Render Workflows inventory returned an empty list. This does not rule out an external scheduler outside the inspected Render workspace.

## Runtime log observations

The latest relevant startup logs inspected were from 24 November 2026:

- `OutboxDispatcher` registered with a one-second polling interval.
- `AutoCompleteWorker` registered with a 60-second polling interval.
- `ReturnExpirationWorker` explicitly logged that it was disabled because `P13_WORKER_ENABLED` was not set.
- No runtime database identity diagnostic was found in the inspected logs. The live deployment is on `develop` SHA `f74eb588`; identity diagnostics present on the remediation branch are not proven to be deployed.
- Three OTP delivery success log entries were found on 22–23 November. Recipients were masked, but provider message IDs and correlation IDs were logged. No matching `errorReason`, provider-error, or OTP delivery failure entries were found in the inspected window. This is limited log evidence, not proof that all failure paths are safe.

## Source remediation

Commit `ed685b0d0c9a1dd8e28009fa8fc208b766540061` on `remediation/phase-0-1-tenant-security` removes recipient subjects, provider-supplied error reasons, provider message IDs, correlation IDs, and raw exception details from OTP delivery log messages. Direct service-level regression specs cover provider failure and thrown provider exceptions, including synthetic OTP/recipient data.

The new source has not been deployed. Tests have not been executed. Runtime verification remains pending.

## Database and release implications

The connected staging database audit reports 69 applied migrations; `develop` has 69 migration files and the remediation branch has 75 (0070–0075 pending). Render's configured start command does not itself migrate or seed. The mutating release workflow is separate and must not be used as a read-only audit.

The protected `db-access-audit.yml` workflow is the next evidence source for actual API/migration database identities. It is read-only but uses the protected GitHub `staging` environment. It was not dispatched in this inspection. The API runtime role and migration role therefore remain unverified.

## Safety and production boundary

The user explicitly authorized necessary changes to the staging database to prepare the first production launch. No production database has been provisioned or deployed. This authorization does not authorize production database provisioning, a Render service deployment/configuration change, worker activation, business workflows, or bypassing the protected staging approval gate.

Before staging DDL, grant/default-ACL, RLS, or migration changes: establish the actual API and migration roles, reconcile object ownership/default ACLs, review the exact migration and rollback strategy, and use the controlled migration path. Do not enable RLS while the API role is a table owner or has `BYPASSRLS`.