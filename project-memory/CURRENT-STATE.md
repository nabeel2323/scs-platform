
## 25 November 2026 — staging access-control, OTP and worker audit

A read-only Supabase catalog/privilege audit found 114 public table/partition relations (113 ordinary + 1 partitioned), all with RLS disabled and zero policies. Existing effective grants: anon/authenticated have no SELECT/INSERT/UPDATE/DELETE on the 114 relations, but each has TRUNCATE, MAINTAIN, REFERENCES and TRIGGER on all 114. service_role has BYPASSRLS and the same non-DML privileges; postgres owns all public relations and has BYPASSRLS. authenticator can SET ROLE to anon/authenticated/service_role. Postgres default ACL reproduces the excessive anon/auth grants; supabase_admin default ACL additionally grants full DML for objects it creates. The Supabase SQL tool's current_user is postgres and is not proof of API runtime identity.

The live migration ledger has 69 entries and matches develop's 69 migration files; remediation branch has 75 files (0070–0075 pending). Migration 0070 addresses anon/auth current/default grants and normalize_arabic search_path but does not address supabase_admin defaults. No migration, grant, policy, RLS, or data changes were applied. Full details are in docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md.

OTP source trace: deployed SHA 9f5bc397/develop OtpDeliveryService logs raw provider exception.message, and also logs request.subject/result.errorReason. IdentityService and provider logger paths otherwise use masked values/no OTP. A local patch/test file is prepared at /mnt/data/otp-log-redaction.patch; not applied, committed or deployed. Fresh Render logs remain unverified.

Worker source inventory shows OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker and P13MonitorService start inside the API process; ReturnExpirationWorker is gated by P13_WORKER_ENABLED. OutboxDispatcher logs then marks non-shipping events dispatched without a real event-bus publish. Render runtime settings/flags and cron jobs require a fresh read-only check. Auto-complete currently emits realtime before actor transaction commit; follow-up needed.

Orders checkout now supports canonical products whose selected seller offer supplies store ownership, while validating product/offer/variant/store relationships and cart conversion CAS. Tests authored, not executed. No formatter/lint/typecheck/E6/CI.

## 25 November 2026 — continuation update

Read-only Render inspection confirms one Frankfurt web service on develop with auto-deploy disabled and start command `pnpm --filter @scs/api start:prod`; migrations/seeds are performed only by the separate mutating release workflow. The live SHA is `f74eb588`. OutboxDispatcher and AutoCompleteWorker register; ReturnExpirationWorker is disabled because `P13_WORKER_ENABLED` is unset. No separate Render worker/cron service or Render Workflow was found. No runtime DB identity was logged.

OTP delivery logs on 22–23 November showed masked recipients but included provider message IDs and correlation IDs. Source commit `ed685b0d0c9a1dd8e28009fa8fc208b766540061` removes these identifiers and provider error text from OTP logs and adds direct provider failure/exception regression specs. Tests remain unexecuted and the source is not deployed.

The user explicitly authorizes staging database changes needed for first production launch; no production database has been provisioned/deployed. API and migration runtime identities are still unknown, so no RLS/grant/default-ACL/migration change has yet been applied. The protected read-only database audit remains the next evidence gate.

## 25 November 2026 — protected audit result (10:01 UTC)

Protected read-only workflow [#45590012595](https://github.com/nabeel2323/scs-platform/actions/runs/45590012595) passed on branch head `2e7ac31011eac303c45acadec4d839d02f63f2ec`. The workflow connects through `STAGING_DATABASE_URL`, also used by the release migration runner. Its exact login/effective identity is `postgres` on PostgreSQL 17.6; superuser=false, BYPASSRLS=true, CREATEROLE=true, CREATEDB=true. Treat this as the staging migration credential identity, not proof of the Render API runtime identity.

The live database recheck confirms 114 public table/partition relations plus one sequence, all owned by postgres; RLS enabled=0 and policies=0. anon/authenticated/service_role have no effective SELECT/INSERT/UPDATE/DELETE on the existing 114 relations, but each has TRUNCATE/MAINTAIN/REFERENCES/TRIGGER on all 114. postgres default ACLs reproduce those non-DML grants. supabase_admin default ACLs additionally grant full DML and other privileges to anon/authenticated/service_role for future objects it creates. Direct catalog checks therefore do not support saying existing application tables are currently directly readable/writable through anon/authenticated; the excessive privileges/default ACLs and missing RLS remain critical defense-in-depth findings.

The live `public._migration_log` has 69 applied migrations through `0069_organization_onboarding_permission.sql`; migrations 0070–0075 on PR #138 remain pending. Migration 0070 revokes anon/authenticated privileges and pins `normalize_arabic` search_path, but does not address supabase_admin defaults or service_role. No database changes were made.

Render inspection reconfirms the API is on `develop` SHA `f74eb588`, auto-deploy disabled, one instance. Runtime identity diagnostics exist in PR #138 source but are not deployed; no API runtime identity log was found. Actual API `DATABASE_URL` role remains unknown. PR #138 remains draft/open/unmerged. Do not enable RLS or apply 0070 until API runtime identity, transaction-bound context coverage, and a reviewed migration/rollback plan are complete. The user authorizes staging DB changes but not Render deployment/configuration changes or bypassing the protected staging gate.
