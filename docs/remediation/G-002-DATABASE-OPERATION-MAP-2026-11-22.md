
## 25 November 2026 — live Supabase access-control evidence

A read-only catalog/privilege audit on the connected Supabase project found 114 public table/partition relations (113 ordinary + 1 partitioned), 0 with RLS enabled, and 0 policies. Effective privileges across all 114:
- anon/authenticated: SELECT/INSERT/UPDATE/DELETE = 0; TRUNCATE/MAINTAIN/REFERENCES/TRIGGER = 114 each.
- service_role: SELECT/INSERT/UPDATE/DELETE = 0; TRUNCATE/MAINTAIN/REFERENCES/TRIGGER = 114 each; BYPASSRLS enabled.
- postgres: full table privileges across all 114; BYPASSRLS enabled and owner of all public relations.
- authenticator has no direct table privileges but can SET ROLE to anon/authenticated/service_role.

Default ACLs:
- postgres default ACL grants anon/authenticated/service_role MAINTAIN, REFERENCES, TRIGGER and TRUNCATE.
- supabase_admin default ACL grants those roles full DML plus those privileges for objects it creates. postgres cannot SET ROLE to supabase_admin.
Migration 0070 revokes current/default privileges for anon/authenticated for the migration execution role, but does not change supabase_admin defaults. Verify object creation ownership and migration role before applying.

Other evidence: 32 public functions, no SECURITY DEFINER; no public non-internal triggers or views; pg_trgm is in public; normalize_arabic has mutable search_path. pg_partman 5.3.1 retains analytics_events for 12 months, but pg_cron is not installed, cron.job is absent, and partman BGW is not configured. No scheduled GitHub workflow invoking maintenance was found. Supabase advisors report 55 unindexed FKs and 271 unused indexes; one no-PK finding refers to a relation absent from the live catalog.

The audit connection's current_user was postgres; this is not the API runtime role. DatabaseService uses DATABASE_URL directly. The actual API and migration roles remain unknown pending the protected db-access-audit workflow/Render startup logs. Do not enable RLS until a non-owner, non-BYPASSRLS API role is confirmed or a least-privilege role migration plan is approved.

See docs/remediation/STAGING-ACCESS-CONTROL-OTP-WORKER-AUDIT-2026-11-25.md for the complete source, OTP, worker, release, and open-question inventory.
