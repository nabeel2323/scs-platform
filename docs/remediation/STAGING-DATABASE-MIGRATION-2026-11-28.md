# Staging database migration reconciliation — 28 November 2026

## Environment and authorization

- Environment: SCS Platform staging database, Supabase project `SCS-PlatForm`, ref `wplsxxevoevzqbgtpctw`, region `eu-west-1`, PostgreSQL 17.6.1.166.
- The user confirmed that no production database exists yet and explicitly authorized changes to the staging database to improve migration cleanliness and readiness for the future production database.
- This report documents staging-only changes. No production database was created or modified. No application deployment, worker activation, provider call, or staging release was performed.
- No backup/restore operation was performed in this batch; the independent staging backup strategy remains deferred from the earlier project decision. The migrations' affected webhook and reconciliation tables had zero rows, and no business records were deleted or reset. Do not perform future destructive staging operations until a backup/restore path is established.
- The Supabase MCP SQL session reported `session_user=current_user=postgres`, with `rolbypassrls=true`, `rolsuper=false`, `rolcreaterole=true`, `rolcreatedb=true`. This proves the MCP session identity only; the Render API runtime connection identity and the deployed migration-runner connection identity still require separate verification.
- Staging migration tracking is the application's `public._migration_log`; Supabase-native `list_migrations` currently reports no Supabase CLI migration history. Do not introduce a second competing ledger without a deliberate migration-system decision.

## Before-state

- Application migration ledger: 71 entries, from `0001_identity.sql` through `0071_auto_complete_claim_leases.sql`.
- Repository migration directory: 77 SQL migrations; six migrations (0072–0077) were pending in staging.
- Public application tables: 114; all owned by `postgres`.
- RLS was disabled on all 114 public tables before the batch.
- `anon` and `authenticated` had no CRUD privileges on existing public tables; their schema USAGE remained granted. PostgreSQL default ACLs nevertheless retained non-CRUD privileges for these API roles.
- `pg_trgm` is installed in `public`, owned by `supabase_admin`; moving it is not included in this batch.
- Analytics partitioning was healthy: `pg_partman` 5.3.1 installed, monthly `analytics_events` parent configured for 12-month retention, and retention flags matched migration 0018.
- Reconciliation preflight found zero dangling references, scope mismatches, invalid version orderings, branching histories, or duplicate version tuples.
- The staging tables `carrier_webhook_events`, `carrier_credentials`, `shipments`, `reconciliation_runs`, and `payment_records` had zero rows. `ops_alerts` had one RESOLVED row.

## Applied batch

Applied migrations 0072–0077 from the current `develop` source in one transaction, protected by the repository's migration advisory-lock key (`0x534353, 1`). Each migration was followed by its exact filename being inserted into `public._migration_log` in the same transaction.

| Migration | Result |
|---|---|
| 0072 carrier webhook credential scoping | Added nullable credential FK, credential-scoped deduplication and lookup index. Existing webhook table was empty. |
| 0073 ops alert delivery claim | Rebuilt `idx_ops_alerts_open` to include `SENDING`; the existing alert was RESOLVED and unaffected. |
| 0074 reconciliation tenant/version integrity | Passed all fail-closed preflight checks; installed NULLS NOT DISTINCT organization-scoped version uniqueness and supporting index. Reconciliation history was empty. |
| 0075 payment proof upload intents | Created durable upload-intent table, lease-pair check, recovery indexes and payment receipt lookup index. |
| 0076 public API role privilege hardening | Revoked all table/sequence privileges from `anon` and `authenticated` and removed their PostgreSQL-owner default table/sequence privileges. Did not enable RLS or alter the server runtime role. |
| 0077 legacy carrier webhook manual review | Added quarantine behavior for credential-less historical shipment links; there were no such rows to update. |

## After-state verification

- `public._migration_log`: 77 entries, first `0001_identity.sql`, last `0077_carrier_webhook_legacy_manual_review.sql`.
- `carrier_webhook_events.credential_id` exists and its FK references `carrier_credentials(id)` with `ON DELETE RESTRICT`.
- Credential-scoped unique deduplication index and credential lookup index exist; the old global provider/event unique index is gone.
- `ops_alerts.idx_ops_alerts_open` now includes PENDING, SENDING, SENT and FAILED.
- `reconciliation_runs.idx_reconciliation_runs_unique_version` is unique across period, currency, version and organization, with `NULLS NOT DISTINCT`.
- `payment_proof_upload_intents` exists with primary key, unique storage key, payment FK, lease-pair check and recovery indexes.
- No unbound webhook rows with a shipment link remain.
- `anon` and `authenticated` have no SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges on public tables after the batch.
- RLS remains disabled on all 115 public tables. This is intentional for now: do not enable RLS wholesale until the application runtime is moved off the observed BYPASSRLS-capable `postgres` identity and the per-table actor/tenant policies and integration tests are verified.
- `service_role` retains its existing non-CRUD TRUNCATE/REFERENCES/TRIGGER privileges; it was intentionally not modified by 0076. Review separately if service_role is part of the app access path.
- Post-migration Supabase advisors: no security/health findings other than the existing `pg_trgm`-in-public warning; performance advisor reports 55 unindexed foreign keys, one partman template table without a primary key, and 275 unused indexes. Do not mass-create/drop indexes based solely on this snapshot; use workload and FK-delete/update evidence.

## Additional runtime identity evidence\n\n- The application runtime identity guard rejects production-like sessions with superuser, BYPASSRLS, CREATEROLE, CREATEDB, public table/schema ownership or unverified TLS. The actor-context transaction primitive and controller interceptor are explicitly opt-in, not global; a complete route/callsite audit is still required before RLS or runtime-role changes.\n- Supabase logs for the inspected 24-hour window showed the MCP management connection (`postgres`, application_name `mgmt-api`) and one platform `supabase_admin` connection, but no identifiable Render API service connection. The actual deployed API and migration-runner identities therefore remain unverified.\n- The Supabase project reports PostgreSQL 17.6.1.166; review the current 17.11 minor security fixes and plan an upgrade window with downtime/reindex assessment. Do not trigger an upgrade blindly.\n\n## Remaining database readiness work

1. Verify the actual Render `scs-api-staging` runtime and deployed migration-runner identities and TLS state; the MCP session identity is not proof of either.
2. Design and validate a least-privilege runtime role with actor-context/RLS-compatible ownership, grants and default ACLs. Do not switch the live API role until the full access matrix and rollback path pass.
3. Finish G-002 raw SQL/function/trigger/partition ownership audit and FK-to-tenant crosswalk.
4. Resolve `pg_trgm` schema placement with its `supabase_admin` owner constraint; do not attempt ownership or extension DDL through an unqualified role.
5. Review the 55 unindexed FKs against query patterns and cascades, then add only justified indexes in versioned migrations.
6. Plan a supported Supabase PostgreSQL minor-version upgrade window; current observed version is 17.6.1.166. Do not trigger an upgrade without downtime/reindex assessment.
7. Run a consolidated exact-head CI campaign after the grouped source changes. The latest CI run described below is pre-staging-batch evidence, not a CI validation of the manual staging operation.

## CI context

- Develop run `46085878528` (CI #1723), on source head `4c5c755571385b346902c74c9f4f0578f48d9433`, completed all mandatory jobs successfully, including full migration apply, API unit/integration, web/admin, lint/typecheck, mobile, E6, contract/codegen, build and container smoke. k6 and staging-release jobs were skipped.
- This CI run validates the repository migration set in disposable CI PostgreSQL, not the manual staging operation.
- No staging release or application deployment was triggered by this database migration batch.

## Operational boundaries

- Staging database changes and forward migrations are authorized by the user for readiness work, provided changes are source-reviewed and preflighted.
- There is no production database. Do not create or modify a production database, or claim production verification.
- Preserve staging data; no reset/truncate/demo seeding was performed.
- Do not enable RLS globally or switch runtime DB identities until the full actor-context/grant matrix is proven.
- No Render service changes, deploys/restarts, worker activation, external provider calls, or staging/production release were performed.
