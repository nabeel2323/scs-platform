
## 25 November 2026 — checkout correction and staging access/worker audit

Orders checkout correction:
- Canonical products may have storeId=null; a selected active seller offer supplies the cart line store. Checkout now validates offer store/product and optional variant scope, while merchant-owned products must match the line store.
- Added regression coverage for product-level and variant-level seller offers, store mismatch, active-cart conversion CAS failure, and verified actor fixtures.
- Tests remain unexecuted; no formatter/lint/typecheck/E6/CI.

Read-only Supabase audit:
- 114 public table/partition relations, 0 RLS enabled, 0 policies.
- anon/authenticated: no SELECT/INSERT/UPDATE/DELETE on existing public relations, but TRUNCATE/MAINTAIN/REFERENCES/TRIGGER on all 114. service_role also has BYPASSRLS and those non-DML privileges. postgres owns all relations and has BYPASSRLS.
- postgres default ACL repeats anon/auth non-DML grants; supabase_admin default ACL grants full DML for objects it creates. postgres cannot SET ROLE to supabase_admin.
- 32 public functions, none SECURITY DEFINER; normalize_arabic mutable search_path; pg_trgm in public; 0 non-internal triggers.
- pg_partman 5.3.1 analytics_events retention 12 months, but no pg_cron extension/job, partman BGW config, or scheduled GitHub workflow found.
- Supabase advisors: 55 unindexed FKs, 271 unused indexes, 1 no-PK finding referencing a relation absent from live public catalog.

Migration boundary:
- Live ledger 69; develop has 69 migrations; remediation branch has 75 (0070–0075 pending).
- 0070 addresses anon/auth grants and normalize_arabic search_path, but supabase_admin default ACL remains an ownership question.
- No SQL writes, RLS/grant changes, migrations, seeds, or staging actions.

OTP source trace:
- deployed SHA 9f5bc397/develop OtpDeliveryService catch logs raw error.message; service also logs subject and errorReason. IdentityService/provider logs otherwise avoid OTP values.
- Prepared local patch with service-level log regression tests: /mnt/data/otp-log-redaction.patch. Not applied, committed, or deployed. Actual Render logs still need verification.

Worker/deployment source audit:
- OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker, P13MonitorService start in API process. ReturnExpirationWorker gated by P13_WORKER_ENABLED.
- Generic OutboxDispatcher marks non-shipping events dispatched after logging only; no event bus call.
- OrdersService.completeOrder emits realtime inside actor transaction.
- Render live service config/logs/flags and cron jobs not freshly verified. Release workflow is mutating; db-access-audit workflow is read-only and staging-protected.

## 25 November 2026 — Render runtime audit and OTP log redaction

Read-only Render inspection confirmed one Frankfurt `scs-api-staging` service on `develop`, auto-deploy disabled, one instance, and start command `pnpm --filter @scs/api start:prod`. The separate release workflow performs migrations, RBAC seed, and deployment. Logs show OutboxDispatcher polling registration (1s), AutoCompleteWorker registration (60s), and ReturnExpirationWorker disabled because `P13_WORKER_ENABLED` is unset. No separate Render worker/cron service or Render Workflow was found. No environment values, service configuration or secrets were changed.

Three historical OTP delivery success logs contained masked recipients plus provider message IDs and correlation IDs. The deployed SHA is still `f74eb588`; no runtime update occurred. Source commit `ed685b0d0c9a1dd8e28009fa8fc208b766540061` removes recipient, provider errorReason, provider message ID, correlation ID and raw exception information from OTP delivery logs. Direct service-level regression specs cover provider failure and thrown provider exceptions with synthetic secrets. Tests remain unexecuted.

The user explicitly authorized necessary staging database changes for the first production launch; no production DB is provisioned/deployed. No staging DB writes were made because actual API/migration identities and the `supabase_admin` default-ACL ownership path remain unverified.

CI #45586306936 was unintentionally triggered by the source commit (missing skip-CI marker): lint passed, typecheck failed with 250 diagnostic lines, Flutter passed, and downstream jobs were skipped. No rerun will occur during implementation. The diagnostics are recorded for the implementation backlog.

## 25 November 2026 — protected database audit completed

- User clarified that the connected Supabase project is the only current SCS database, the API connects to it, and no production database exists. User explicitly authorized necessary staging-only database schema, privilege, default-ACL, RLS, migration and controlled fixture/data changes. This does not authorize production provisioning, Render deployment/configuration changes, worker activation, business workflows or bypassing the protected staging approval.
- Read-only database audit workflow [#45590012595](https://github.com/nabeel2323/scs-platform/actions/runs/45590012595) passed on PR #138 head `2e7ac31011eac303c45acadec4d839d02f63f2ec`. It uses `STAGING_DATABASE_URL`, also used by the release migration runner. Observed identity: session/current role postgres, PostgreSQL 17.6, superuser=false, BYPASSRLS=true, CREATEROLE=true, CREATEDB=true. This establishes migration credential identity only.
- Live SQL recheck: migration ledger has 69 entries through 0069; 114 public table/partition relations plus one sequence, all owned by postgres; 0 RLS-enabled tables, 0 policies. anon/authenticated/service_role have no effective DML on current relations but retain TRUNCATE/MAINTAIN/REFERENCES/TRIGGER on all 114. postgres default ACL repeats non-DML grants; supabase_admin defaults include full DML and other privileges for objects created under that owner.
- Evidence correction: Supabase advisor wording suggested all rows were directly exposed to anon/authenticated, but direct effective privilege checks found SELECT/INSERT/UPDATE/DELETE = 0 across existing relations. Do not claim current direct table DML exposure; retain the excessive grants/default ACL and no-RLS findings.
- Render read-only inspection: one `scs-api-staging` service on develop, deployed SHA `f74eb588`, auto-deploy off, one instance. API runtime identity log absent; PR #138 already contains safe non-secret startup identity diagnostics but has not been deployed. Actual Render `DATABASE_URL` identity remains unknown.
- No database grants, default ACLs, policies, RLS, migrations, seeds or data were changed. Do not apply 0070 or enable RLS until API runtime identity, actor-context coverage and migration/rollback path are verified. Existing release workflow also seeds and deploys; do not dispatch it as a DB-only operation.
