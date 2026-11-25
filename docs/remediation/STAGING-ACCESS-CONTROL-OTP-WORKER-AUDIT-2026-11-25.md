# Staging Access-Control, OTP Logging, Worker and Release Audit — 25 November 2026

## Scope and safety boundary

This is a read-only audit of the connected Supabase project and source code at the `develop` and `remediation/phase-0-1-tenant-security` refs. The database catalog and advisor queries were executed through the connected Supabase integration. No SQL write, DDL, RLS enablement, grant/revoke, migration, seed, deployment, worker activation, secret/environment change, or business workflow was performed.

The SQL integration reports `current_user = postgres`. That is the management/audit connection identity, **not proof of the API runtime identity**. The current `pg_stat_activity` snapshot did not show a distinct application session. The API runtime role and migration runner role therefore remain unverified until the protected audit workflow or Render startup logs are inspected.

## 1. Live database access-control inventory

### Relations and RLS

The live `public` schema contains:

- 113 ordinary table relations (`relkind = r`)
- 1 partitioned table (`relkind = p`)
- 1 sequence
- 114 table/partition relations in total
- 0 RLS-enabled relations
- 0 RLS policies

The earlier uploaded report referred to 111 tables. The latest live catalog query returns 114 table/partition relations; use the live result as the current count and reconcile the three-relation difference against the earlier snapshot.

### Effective table privileges

The following effective privileges were checked across all 114 public table/partition relations:

| Role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE | MAINTAIN | REFERENCES | TRIGGER |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| anon | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| authenticated | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| service_role | 0 | 0 | 0 | 0 | 114 | 114 | 114 | 114 |
| authenticator | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| postgres | 114 | 114 | 114 | 114 | 114 | 114 | 114 | 114 |

The absence of ordinary DML grants to `anon` and `authenticated` means the current state does not demonstrate direct PostgREST table reads/writes for those roles. It does **not** make the current grants acceptable: both roles have TRUNCATE and MAINTAIN across every public table. TRUNCATE is a destructive database privilege; MAINTAIN is also broader than an ordinary API role should need. These grants should be revoked by the reviewed hardening migration, not by ad-hoc SQL during this audit.

`authenticator` has no direct table privileges, but role membership metadata shows it can SET ROLE to `anon`, `authenticated`, and `service_role`. This is the expected PostgREST role-switching path, so the effective privileges of those target roles remain relevant.

Role attributes:
- `anon` and `authenticated`: no BYPASSRLS.
- `service_role`: BYPASSRLS is enabled; treat as server-only.
- `postgres`: BYPASSRLS is enabled and it owns all 114 public table/partition relations.
- `supabase_admin`: superuser.

The `public` schema grants USAGE to the API roles; `anon`, `authenticated`, and `service_role` do not have CREATE on the schema. The one public sequence does not grant USAGE/SELECT/UPDATE to those API roles.

### Existing and default ACLs

Existing public table ACLs expose MAINTAIN, REFERENCES, TRIGGER, and TRUNCATE to `anon`, `authenticated`, and `service_role`; no SELECT/INSERT/UPDATE/DELETE grants were found for those roles on the current relations.

Default privileges explain how these grants can recur:
- Default ACLs for owner `postgres` grant MAINTAIN, REFERENCES, TRIGGER, and TRUNCATE to `anon`, `authenticated`, and `service_role`.
- Default ACLs for owner `supabase_admin` grant full table DML plus MAINTAIN, REFERENCES, TRIGGER, and TRUNCATE to those same roles.
- `postgres` is not a member of `supabase_admin` and cannot SET ROLE to it; `supabase_admin` is a member of `postgres`.

Migration `0070_public_access_and_function_search_path_hardening.sql` revokes the broad current/default privileges from `anon` and `authenticated` for the migration execution role. It does not alter `supabase_admin` default ACLs. The latter must be assessed against actual object-creation ownership; do not assume the migration runner can change another role's defaults.

### Functions, triggers, views, extensions

- 32 functions are present in `public`; none is SECURITY DEFINER.
- The functions are executable by PUBLIC, `anon`, and `authenticated`. Most are `pg_trgm` extension functions; `public.normalize_arabic(text)` is the application function flagged for mutable search_path.
- 0 non-internal triggers were found on public relations.
- No public views or materialized views were found.
- `pg_trgm` is installed in `public`, which the Supabase security advisor flags.
- `normalize_arabic(text)` has a mutable search_path, also flagged by the security advisor. Migration 0070 pins it to `pg_catalog`; that migration is not yet applied.

### Partition maintenance

`pg_partman` 5.3.1 is installed in schema `partman`. Its only configured parent is `public.analytics_events`, range-partitioned monthly on `created_at`, premake 3, retention 12 months, `automatic_maintenance = on`.

No maintenance scheduler was evidenced:
- `pg_cron` is not installed in this database and `cron.job` is absent.
- `pg_partman_bgw` settings are not configured.
- No scheduled GitHub workflow invoking partman maintenance was found.
- A Render cron job or external scheduler has not been checked yet.

The retention setting alone does not prove that maintenance runs. Verify Render cron jobs/external scheduling before claiming retention is operational.

### Advisors

The current Supabase security advisor reports:
- `function_search_path_mutable`: `public.normalize_arabic`.
- `extension_in_public`: `pg_trgm`.

The performance advisor reports 55 unindexed foreign keys and 271 unused-index findings. It also reports one no-primary-key finding for `template_public_analytics_events`, but that relation was not present in the live `public` catalog query; treat that one finding as stale/unreconciled. No index or constraint changes were made.

## 2. Migration state and RLS dependency

The live `_migration_log` contains 69 applied migrations and ends at `0069_organization_onboarding_permission.sql`.

- `develop` contains 69 migration files and ends at 0069; the live ledger matches that branch's migration count.
- The remediation branch contains 75 migration files, 0070–0075 are not applied to this database.
- 0070 is the public access/function search-path hardening migration.
- 0071–0075 include additional auto-complete, carrier credential, operations alert, reconciliation integrity, and payment-proof changes.

Do not run the release workflow as an audit. Its manual `workflow_dispatch` path is a real staging release: it runs `db:migrate`, `db:seed`, verifies the migration ledger, deploys the selected SHA to Render, and checks readiness. There is no dry-run mode.

The separate `db-access-audit.yml` workflow on `develop` is read-only, uses the protected `staging` environment and staging database secrets, and runs `pnpm db:audit-access`. It is the appropriate next evidence source for the actual staging connection identity, subject to the environment's approval gate. It has not been dispatched in this session.

## 3. API and migration connection model

Source review confirms `DatabaseService` creates a node-postgres pool from `DATABASE_URL`; it does not use the Supabase JS client/service-role key as its main database adapter. Startup logs a database identity fingerprint. The migration runner uses `STAGING_DATABASE_URL` in the release workflow and also reports connection identity.

The current SQL integration's `postgres` identity cannot be substituted for either runtime identity. The API runtime may use a BYPASSRLS/table-owner role; if so, enabling RLS alone would not protect tenant data. Before RLS design, capture the actual API `session_user`, `current_user`, role flags, schema/table privileges, and migration runner identity from the protected audit workflow or Render logs.

The last repository deployment runbook observation says the Render API start command is `pnpm --filter @scs/api start:prod` and migrations/seeds are performed by the separate release workflow. The uploaded investigation note says the configured startup command runs migrations and RBAC seed. These statements conflict and require a fresh read-only Render service configuration/log check; neither is treated as current fact until verified.

## 4. OTP logging trace

Source review was performed against the last documented deployed SHA `9f5bc397`, current `develop`, and the remediation branch.

Findings:
- IdentityService's OTP-related application logs use masked phone/email values; no OTP value was found in those logger calls.
- Provider implementations do not log the OTP payload. The mock provider stores its test code but does not log the value.
- AuditLogMiddleware does not log/persist the request body. The current pino-http setup does not serialize request bodies by default; its redaction list covers authorization/cookie headers.
- The deployed SHA `9f5bc397` and current `develop` OtpDeliveryService catch logs raw `error.message`. A provider exception may contain request payload/recipient details; this is a concrete sensitive-data logging vector, although the exact Render log line has not been verified.
- OtpDeliveryService also logs caller-supplied `request.subject` and provider-supplied `result.errorReason`. Normal callers mask the subject, but the service should not trust those fields as safe log strings.
- The remediation branch already sanitizes the unexpected exception to a stable error class, but it still logs subject/errorReason.

A local patch artifact was prepared at `/mnt/data/otp-log-redaction.patch`. It removes subject/errorReason/raw provider exception content from service logs and adds service-level regression tests for success, provider errorReason, and thrown exceptions containing OTP/email/phone values. It has **not** been applied to the repository, committed, or deployed. No OTP tests were executed. Fresh Render log verification remains pending.

## 5. Worker activation and deployment safety

The source `AppModule` imports Orders, Shipping, Outbox, Operations, and Returns modules. Their providers therefore start in the API process when that application version is deployed; a separate Render worker service is not required for these in-process timers.

Source-level worker inventory:
- `OutboxDispatcher`: starts after 5 seconds, polls every second. It excludes shipping carrier events; for other event types it currently logs the event and marks it dispatched rather than publishing to a real event bus. This is a delivery-completeness gap to resolve before relying on the generic outbox for notifications/integrations.
- `ShippingCarrierWorker`: starts after 8 seconds and polls every 5 seconds for shipping carrier events. It performs provider-facing shipping operations.
- `CarrierTrackingPoller`: starts after 15 seconds and polls tracking on a 10-minute cadence.
- `CarrierReconciliationService`: starts after 20/25 seconds and runs carrier reconciliation/retry cycles on a 10-minute cadence.
- `AutoCompleteWorker`: starts after 30 seconds and polls on a default 60-second cadence; it can complete eligible orders. It has an interval setting but no general worker-enable flag.
- `P13MonitorService`: starts periodic monitoring at a 60-second cadence.
- `ReturnExpirationWorker`: opt-in through `P13_WORKER_ENABLED`; it uses worker lease/pause controls. Its live Render environment value has not been checked.

Carrier poller/reconciliation and carrier worker database phases use worker actor contexts/claiming; external carrier calls occur outside those short database phases. Auto-complete invokes order completion under a worker actor context. `OrdersService.completeOrder` emits a realtime event while its actor transaction is still active (also reachable from the request-wide confirm-delivery path); this can notify clients before the transaction commits and needs a follow-up after the access audit.

The last documented Render observation was one API service and no separate worker service, but Render has not been freshly inspected in this session. Do not infer live worker activation or environment flags from source registration alone.

## 6. Orders checkout continuation

The remediation branch now corrects checkout ownership validation for the marketplace's canonical-product model:
- A canonical product may have `storeId = null`; its selected active seller offer supplies the cart line store.
- The offer must belong to the cart line store and product, and a variant-scoped offer must match the cart line variant.
- A merchant-owned product must match the cart line store; a product without an offer must have its own matching store.

Regression specs were added for product-level and variant-level seller offers, product-store mismatch, cart-conversion compare-and-set failure, and checkout actor fixtures. They remain unexecuted. No formatter, lint, typecheck, E6, or CI was run.

## 7. Current checkpoint and next actions

At the code checkpoint before this audit documentation commit:
- Branch `remediation/phase-0-1-tenant-security`, head `64235d8a9a0c8d2030eea2bca861caa9981e365f).
- PR #138 remains open, draft, unmerged, targeting `develop`; branch comparison was 2,711 ahead / 0 behind.
- Vercel Admin and Web statuses were success on that inspected head; GitHub Actions workflow-run lookup returned no runs for the `[skip ci]` head.
- No RLS/grant/policy/migration/shared-database/staging/deployment/worker/secret action occurred.

Next:
1. Confirm permission to inspect the listed Render workspace read-only; verify current service, deployed SHA, start command, environment flags, logs, and any cron jobs.
2. Obtain the protected `db-access-audit.yml` report so the actual API/migration role identities are known.
3. Reconcile the 0070 hardening scope, including the `supabase_admin` default ACL question, before applying any grant changes.
4. Finalize the tenant RLS design only after the API role is confirmed to be non-owner and non-BYPASSRLS (or after a least-privilege runtime-role migration plan is approved).
5. Keep the OTP patch local until the user asks to apply/commit it; verify the exact Render log evidence first.
6. Do not dispatch `release.yml`, apply migrations, enable RLS, revoke grants, activate ReturnExpirationWorker, or run business workflows as part of this audit.
