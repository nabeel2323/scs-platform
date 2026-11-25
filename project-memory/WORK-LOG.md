
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