
## 25 November 2026 — staging access/OTP/worker audit open items

1. **API runtime identity is still unknown.** DatabaseService uses DATABASE_URL directly; the Supabase SQL tool ran as postgres, and pg_stat_activity did not show an app session. Obtain the protected db-access-audit.yml output or Render startup log identity before RLS design. If runtime uses postgres/service_role/table-owner/BYPASSRLS, RLS alone is ineffective.
2. **Public ACLs require hardening.** 114 public table/partition relations have RLS off and no policies. anon/authenticated lack DML but have TRUNCATE/MAINTAIN/REFERENCES/TRIGGER on all 114. postgres default ACL repeats those grants; supabase_admin default ACL additionally grants full DML for objects it creates. 0070 revokes anon/auth for current migration role but leaves the supabase_admin default ACL question unresolved. No grants were changed.
3. **Six migrations pending on remediation branch.** Live DB/develop are at 0069; remediation branch has 0070–0075. Do not apply them outside the protected release process.
4. **OTP logging.** Source remediation is committed at `ed685b0d0c9a1dd8e28009fa8fc208b766540061`: delivery logs no longer include subject, provider errorReason, message ID, correlation ID or raw exception message; direct provider failure/exception specs are authored but unexecuted. Render's older deployed SHA `f74eb588` is not updated, so runtime verification remains pending.
5. **Worker activation.** OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker and P13MonitorService start inside API process. ReturnExpirationWorker is gated by P13_WORKER_ENABLED. Confirm live Render flags/instance count/cron jobs before any workflow.
6. **Outbox delivery gap.** OutboxDispatcher marks non-shipping events dispatched after logging only; no real event bus is called. Realtime order completion is emitted inside the actor transaction. Review before relying on these events.
7. **Partman maintenance.** pg_partman 5.3.1 retention is configured for analytics_events (12 months) but no pg_cron extension/job, partman background worker config, or scheduled GitHub workflow was found. Check Render cron/external scheduler.
8. **Advisor findings.** 55 unindexed FKs and 271 unused-index findings; one no-PK advisor finding references a relation absent from live public catalog. No index changes made.
9. **Render facts reconciled.** Read-only inspection confirms the live start command is `pnpm --filter @scs/api start:prod`; it does not run migrations/seeds. The separate release workflow performs migrations, RBAC seed, and deployment. Auto-deploy is off; one instance is configured. OutboxDispatcher and AutoCompleteWorker register; ReturnExpirationWorker is disabled. No separate worker/cron service or Render Workflow was found. Actual DB identity and external scheduler remain unverified.

## 25 November 2026 — current continuation state

- User explicitly authorized staging-only database changes to prepare the first production launch; no production DB exists/deployed. Actual API/migration roles must be identified before RLS/grant changes.
- Render read-only inspection completed; see `docs/remediation/RENDER-STAGING-READONLY-CHECK-2026-11-25.md`.
- OTP log redaction source committed at `ed685b0d0c9a1dd8e28009fa8fc208b766540061`; direct failure/exception tests authored, not executed/deployed.
- Protected read-only `db-access-audit.yml` workflow not dispatched. Do not dispatch/approve it without explicit authorization for that protected workflow.
- OutboxDispatcher still marks generic non-shipping events dispatched after logging only; AutoCompleteWorker is registered in staging. Review event delivery and worker safety before launch.
- Latest exact-head CI #45586306936 was unintentionally triggered: lint passed, typecheck failed (250 TypeScript diagnostic lines across tests and source), Flutter passed, all downstream jobs skipped. Do not rerun during implementation.

## 25 November 2026 — update after successful protected audit

- **Migration/audit identity now confirmed:** workflow [#45590012595](https://github.com/nabeel2323/scs-platform/actions/runs/45590012595) used `STAGING_DATABASE_URL` and reported session/effective role `postgres` with BYPASSRLS, CREATEROLE and CREATEDB. The release workflow uses this same secret for migrations. This confirms the migration credential, not Render's separate API `DATABASE_URL`.
- **API runtime identity remains unknown:** the deployed Render API is still SHA `f74eb588`; the startup identity diagnostic exists on PR #138 but has not been deployed. No matching runtime log exists. A separately authorized staging deploy/diagnostic is needed before RLS design.
- **Privilege facts refined:** anon/authenticated/service_role have zero effective SELECT/INSERT/UPDATE/DELETE on current public relations, but retain TRUNCATE/MAINTAIN/REFERENCES/TRIGGER on all 114. postgres default ACL repeats those grants. supabase_admin defaults grant full DML and other privileges for objects created under that owner. Do not repeat the advisor's broad "all rows readable/writable" message as a proven fact for existing tables; direct catalog checks contradict that specific claim.
- **RLS remains disabled:** 114 public table/partition relations, 0 RLS enabled, 0 policies. Do not enable RLS until actual API role and all direct query/worker/bootstrap contexts are accounted for.
- **Migration state:** live ledger 69 through 0069; PR #138 has 0070–0075 pending. No database writes were performed. Do not apply 0070 ad hoc or dispatch release.yml (it migrates, seeds and deploys).
