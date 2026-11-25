
## 25 November 2026 — live staging access/OTP/worker audit checkpoint

Read the full report `docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md` before making RLS, grants, migration, OTP logging, or worker changes. The connected Supabase database has 114 public table/partition relations, all RLS disabled and no policies. `anon`/`authenticated` have no DML on existing tables but have TRUNCATE and MAINTAIN on all 114; the postgres default ACL reproduces those privileges. `supabase_admin` default ACLs additionally grant full DML to anon/authenticated/service_role for objects it creates. `postgres` owns all public tables and BYPASSRLS; the actual API runtime role is not yet confirmed.

The live migration ledger is 69 and matches `develop`; remediation branch has six unapplied migrations (0070–0075). Do not run release.yml or apply migrations during this audit. The protected read-only `db-access-audit.yml` workflow is the next evidence source for actual API/migration identities.

OTP trace found a raw provider exception-message log in deployed SHA 9f5bc397/develop OtpDeliveryService. A local patch with redaction and service-level regression tests is at `/mnt/data/otp-log-redaction.patch`; it is not applied/committed/deployed. Current remediation branch sanitizes exception class but still logs caller subject/provider errorReason.

Workers are registered inside the API process: OutboxDispatcher, ShippingCarrierWorker, CarrierTrackingPoller, CarrierReconciliationService, AutoCompleteWorker, P13MonitorService; ReturnExpirationWorker is gated by P13_WORKER_ENABLED. Render runtime configuration/logs have not been freshly checked. Ask the user to confirm the listed Render workspace before inspecting it. Do not activate workers or business workflows.

Orders checkout was corrected to support canonical products with merchant seller offers and to preserve store/offer/variant ownership validation. New tests are authored but unexecuted. No quality gates were run.
