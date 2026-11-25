## 25 November 2026 — continuation after protected database audit

Read `docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md`, `docs/remediation/RENDER-STAGING-READONLY-CHECK-2026-11-25.md`, and `docs/remediation/G-002-RLS-ARCHITECTURE-DESIGN.md` before any access-control or database change.

Latest branch head: `2e7ac31011eac303c45acadec4d839d02f63f2ec`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. Protected read-only audit run [#45590012595](https://github.com/nabeel2323/scs-platform/actions/runs/45590012595) succeeded on this exact SHA at 10:01 UTC. It used `STAGING_DATABASE_URL`, which is also the migration credential consumed by the release workflow. The observed migration/audit identity is login/effective role `postgres`, PostgreSQL 17.6, non-superuser but BYPASSRLS, CREATEROLE and CREATEDB. This confirms the staging migration credential identity; it does **not** prove the Render API's separate `DATABASE_URL` identity.

Live database facts rechecked after the workflow: 114 public table/partition relations (113 ordinary + 1 partitioned), plus one sequence; all public relations are owned by postgres; 0 RLS-enabled tables and 0 policies. Effective table privileges for anon/authenticated/service_role are SELECT/INSERT/UPDATE/DELETE = 0 on all 114, but TRUNCATE/MAINTAIN/REFERENCES/TRIGGER = 114 each. The postgres default ACL repeats these non-DML grants. The supabase_admin default ACL grants full DML and other privileges to API roles for objects created under that owner. Do not describe the existing relations as directly DML-exposed to anon/authenticated: direct catalog privilege checks do not support that claim. The excessive privileges/defaults and absence of RLS remain remediation items.

The live `public._migration_log` contains 69 migrations through `0069_organization_onboarding_permission.sql`; branch migrations 0070–0075 remain unapplied. Render's live API remains on `develop` SHA `f74eb588`, auto-deploy off, one instance. The API source branch already contains a non-secret startup identity diagnostic, but it is not deployed and no runtime identity log exists. Therefore the actual API role remains unknown.

User authorizes staging-database-only schema, privilege, default-ACL, RLS, migration and controlled fixture changes; no production database exists. This does not authorize Render service/environment changes, restart/deploy, worker activation, business workflows, production provisioning, or bypassing the protected staging approval. Do not apply migration 0070 or enable RLS yet: the API runtime identity and full non-owner transaction-context coverage remain unverified, and the proposed release workflow also seeds and deploys (it is not a migration-only dry run). Preserve existing data.

Next: obtain actual API runtime identity through a separately authorized deployment/diagnostic path; complete DB operation-to-context coverage and least-privilege role/policy design; reconcile postgres and supabase_admin default-ACL ownership; prepare a migration-only, rollback-reviewed staging execution path. Do not dispatch release.yml or change the database ad hoc.

---

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
