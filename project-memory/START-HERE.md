## 25 November 2026 — current continuation checkpoint

Read `docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md` and `docs/remediation/RENDER-STAGING-READONLY-CHECK-2026-11-25.md` before database or worker changes.

Current branch: `remediation/phase-0-1-tenant-security`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. Source commit `ed685b0d0c9a1dd8e28009fa8fc208b766540061` applies OTP delivery log redaction and adds direct provider failure/exception regression specs. Tests remain unexecuted; no deployment occurred.

The user explicitly authorizes necessary staging database schema, privilege, default-ACL, RLS, migration, and controlled test-fixture/data changes to prepare the first production launch. **No production database has been provisioned or deployed.** This does not authorize production DB provisioning, Render service/environment changes, restarts, worker activation, business workflows, or bypassing protected GitHub staging approval. Establish API and migration identities and review rollback safety before staging DB writes.

Render read-only inspection is complete: one Frankfurt `scs-api-staging` service, branch develop, auto-deploy disabled, one instance, start command `pnpm --filter @scs/api start:prod`, last live SHA `f74eb588`. OutboxDispatcher and AutoCompleteWorker register; ReturnExpirationWorker is disabled because P13_WORKER_ENABLED is unset. No separate worker/cron service or Render Workflow was found. Runtime DB identity is not present in the inspected logs.

Three older OTP success logs contained masked recipient plus provider message ID/correlation ID; the remediation removes these. The source is not deployed/runtime-verified.

Next: obtain protected read-only `db-access-audit.yml` evidence for API/migration role identities; reconcile migration 0070 and both postgres/supabase_admin default ACL ownership; design least-privilege runtime role and table-specific tenant policies; then prepare a reviewed staging migration/rollback sequence. Continue the implementation backlog from exact-head typecheck evidence without rerunning tests or CI until implementation is complete.

Previous audit checkpoint follows as historical context.


## 25 November 2026 — live staging access/OTP/worker audit checkpoint

Read the full report `docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md` before making RLS, grants, migration, OTP logging, or worker changes. The connected Supabase database has 114 public table/partition relations, all RLS disabled and no policies. `anon`/`authenticated` have no DML on existing tables but have TRUNCATE and MAINTAIN on all 114; the postgres default ACL reproduces those privileges. `supabase_admin` default ACLs additionally grant full DML to anon/authenticated/service_role for objects it creates. `postgres` owns all public tables and BYPASSRLS; the actual API runtime role is not yet confirmed.

The live migration ledger is 69 and matches `develop`; remediation branch has six unapplied migrations (0070–0075). Do not run release.yml or apply migrations during this audit. The protected read-only `db-access-audit.yml` workflow is the next evidence source for actual API/migration identities.

OTP trace found a raw provider exception-message log in deployed SHA 9f5bc397/develop OtpDeliveryService. A local patch with redaction and service-level regression tests is at `/mnt/data/otp-log-redaction.patch`; it is not applied/committed/deployed. Current remediation branch sanitizes exception class but still logs caller subject/provider errorReason.

Workers are registered inside the API process: OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker, P13MonitorService; ReturnExpirationWorker is gated by P13_WORKER_ENABLED. Render runtime configuration/logs have not been freshly checked. Ask the user to confirm the listed Render workspace before inspecting it. Do not activate workers or business workflows.

Orders checkout was corrected to support canonical products with merchant seller offers and to preserve store/offer/variant ownership validation. New tests are authored but unexecuted. No quality gates were run.
