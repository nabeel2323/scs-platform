
## 25 November 2026 — staging access-control, OTP and worker audit

A read-only Supabase catalog/privilege audit found 114 public table/partition relations (113 ordinary + 1 partitioned), all with RLS disabled and zero policies. Existing effective grants: anon/authenticated have no SELECT/INSERT/UPDATE/DELETE on the 114 relations, but each has TRUNCATE, MAINTAIN, REFERENCES and TRIGGER on all 114. service_role has BYPASSRLS and the same non-DML privileges; postgres owns all public relations and has BYPASSRLS. authenticator can SET ROLE to anon/authenticated/service_role. Postgres default ACL reproduces the excessive anon/auth grants; supabase_admin default ACL additionally grants full DML for objects it creates. The Supabase SQL tool's current_user is postgres and is not proof of API runtime identity.

The live migration ledger has 69 entries and matches develop's 69 migration files; remediation branch has 75 files (0070–0075 pending). Migration 0070 addresses anon/auth current/default grants and normalize_arabic search_path but does not address supabase_admin defaults. No migration, grant, policy, RLS, or data changes were applied. Full details are in docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md.

OTP source trace: deployed SHA 9f5bc397/develop OtpDeliveryService logs raw provider exception.message, and also logs request.subject/result.errorReason. IdentityService and provider logger paths otherwise use masked values/no OTP. A local patch/test file is prepared at /mnt/data/otp-log-redaction.patch; not applied, committed or deployed. Fresh Render logs remain unverified.

Worker source inventory shows OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker and P13MonitorService start inside the API process; ReturnExpirationWorker is gated by P13_WORKER_ENABLED. OutboxDispatcher logs then marks non-shipping events dispatched without a real event-bus publish. Render runtime settings/flags and cron jobs require a fresh read-only check. Auto-complete currently emits realtime before actor transaction commit; follow-up needed.

Orders checkout now supports canonical products whose selected seller offer supplies store ownership, while validating product/offer/variant/store relationships and cart conversion CAS. Tests authored, not executed. No formatter/lint/typecheck/E6/CI.
