# G-002 Physical Database Object Inventory — 22 November 2026

## Purpose and evidence boundary

This is a source-level inventory for objects not fully represented by the 99 Drizzle pgTable declarations. It reconciles the 19-November read-only catalog snapshot with migrations and the current migration/audit utilities. It does not claim a fresh live count and does not authorize any database mutation.

The detailed 19-November inventory counted 114 public ordinary/partitioned tables (PostgreSQL relkind r/p). The source reconciliation identifies 99 Drizzle table declarations plus 15 public relations without separate Drizzle declarations. A historical 116-table count remains unexplained; do not assume it represents the same relation-kind scope.

## Reconciliation of the 15 non-Drizzle public tables

| Physical relation | Count | Source of creation/management | Observed access and ownership |
|---|---:|---|---|
| public._migration_log | 1 | Created dynamically by apps/api/infra/drizzle/migrate-pg.ts and the local infra/drizzle/migrate.ts runner; not created by a numbered migration | Migration ledger only. migrate-pg reads it and inserts one row per applied migration while holding a session advisory lock; each migration and ledger insert share a transaction. No tenant owner fields or API business route. |
| public.backfill_errors | 1 | Created by infra/drizzle/migrations/0053_attribute_backfill.sql | Migration-only error/conflict audit. Migration 0053 inserts PRODUCT/VARIANT backfill failures; no Drizzle declaration, FK, org_id, store_id, user_id or application reader/writer was found in the inspected source tree. |
| public.analytics_events_default | 1 | Created/managed by pg_partman when migration 0013 calls partman.create_parent; migration comment explicitly says not to create it manually | Default partition of public.analytics_events. Direct partition access and partition-level RLS/privileges must be included in the protected catalog audit. |
| public.analytics_events_p20260101 through public.analytics_events_p20261201 | 12 | Monthly partitions created/managed by pg_partman from migration 0013 configuration | Child partitions of the Drizzle-modeled analytics_events parent. They are physical relations, not separate pgTable declarations. |

Arithmetic: 99 Drizzle declarations + 1 migration ledger + 1 backfill audit table + 13 analytics partitions = 114 public ordinary/partitioned tables in the 19-November snapshot.

## Object details

### _migration_log — migration principal

- The migration runner creates public._migration_log with name TEXT PRIMARY KEY and applied_at TIMESTAMPTZ NOT NULL DEFAULT now().
- migrate-pg.ts uses a dedicated Pool from DATABASE_URL, emits a non-secret session/effective role diagnostic, acquires a session-level advisory lock, reads the ledger and applies each pending migration plus ledger insert in one transaction.
- The 19-November verification recorded 69 rows and latest migration 0069_organization_onboarding_permission.sql. Migrations 0070 and 0071 were validated in isolated CI PostgreSQL but were not recorded in the shared ledger.
- No tenant predicate is appropriate for ordinary API requests. Treat the ledger as migration/operator-only; confirm the deployed migration identity separately from the API identity.

### backfill_errors — migration-only audit artifact

Migration 0053 creates the table with: id, migration, entity_type, entity_id, attribute_key, source_value, error_type, detail and created_at. It records unknown attribute definitions, invalid typed values, conflicts and conversion errors while converting legacy JSONB product/variant attributes into typed tables. entity_type is PRODUCT or VARIANT; entity_id points conceptually to products or product_variants, but the table declares no FK or tenant owner column.

No runtime API service or controller reference was found in the inspected source tree; GitHub code search returned no application-source reference. The only writer found is migration 0053. Until a supported operator reader is identified, classify this as SYSTEM/MIGRATION evidence, not a merchant or buyer resource. Keep source_value/detail internal and define retention/export access before exposing any reader.

### analytics_events — parent plus partition tree

- The parent is declared in apps/api/src/modules/audit/audit.schema.ts with id, event_type, user_id, org_id, session_id, properties, device and created_at; the composite primary key is (id, created_at).
- Migration 0002 initially created analytics_events and a temporary analytics_events_y2026m09 partition. Migration 0013 renamed the old table to analytics_events_legacy, created a new RANGE(created_at) partitioned parent, copied data and dropped the legacy table. The temporary y2026m09 child is therefore not expected in the final partition tree.
- Migration 0013 creates schema partman, installs pg_partman into that schema, calls partman.create_parent for public.analytics_events with monthly interval, start 2026-01-01 and premake 3, and configures 12-month retention with retention_keep_table=false and retention_keep_index=false. Migration 0018 repeats the retention configuration.
- The 19-November live inventory lists analytics_events_default plus p20260101 through p20261201. These 13 children account for 13 of the 15 non-Drizzle relations.
- AnalyticsController is class-protected by JwtAuthGuard. track and track/batch derive user_id and org_id from CurrentUser rather than request-body identity. analytics:read is assigned to platform ADMIN and SUPER_ADMIN roles, not merchant owner/staff; getEventCounts is global date aggregation, while userActivity filters to the current user. Internal domain writers still need explicit worker/system actor context.
- Do not assume parent-only RLS or grants cover direct child-table access. The read-only audit must report each partition's owner, RLS flags, policies, grants and parent relationship.

### Extension and system-schema objects

Migration 0013 installs pg_partman in schema partman. The extension's part_config and maintenance objects are not public application tables and are outside the 114 public-table count. The prior 19-November audit also found pg_trgm installed in public with 47 extension-owned objects; its owner is Supabase-managed supabase_admin. PostGIS and other installed extensions must be enumerated from the refreshed live extension inventory rather than assumed from source alone. Supabase auth/storage/realtime schemas are also outside the public table count.

## Read-only audit utility enhancement

apps/api/scripts/audit-db-access.ts now remains inside BEGIN READ ONLY and additionally reports:

- public relation counts grouped by relkind (ordinary tables, partitioned tables, views, materialized views, foreign tables and sequences);
- public relation names, owners, partition flags, RLS enabled/forced flags, per-relation policy counts, parent relations and extension membership;
- public partition parent/child hierarchy and partition bounds;
- safe summary metadata for _migration_log and backfill_errors when those tables exist (counts, latest migration/time, entity/error types only; no source_value/detail contents);
- all installed extension names, schemas, owners and extension-owned object counts, rather than pg_trgm alone.

The utility was not executed as part of this implementation. A future approved read-only run should preserve the JSON report as evidence and compare the public r/p count separately from views/sequences/indexes.

## The 114-versus-116 discrepancy

The 114 figure is supported by the detailed 19-November public r/p inventory and the source arithmetic above. The historical 116 figure appears in earlier ownership-matrix wording, but its relation-kind scope and source snapshot are not established. It may reflect a different snapshot or a different object-kind count; neither explanation is proven. The enhanced audit output is intended to distinguish those scopes on the next authorized read-only run. Do not edit the historical count into 114 or infer the missing two objects without evidence.

## Remaining verification gates

1. Run the enhanced audit only with an explicitly approved read-only connection; confirm the API and migration login/effective roles independently.
2. Reconcile exact current public r/p tables, views, sequences, extension-owned objects and partition hierarchy; explain any difference from 114 and 116.
3. Verify direct privileges and RLS/policy state on analytics_events parent and every child partition.
4. Confirm _migration_log access is limited to the migration principal and no runtime role can mutate it.
5. Confirm backfill_errors writer/reader/retention and whether any manual repair tool accesses it; preserve migration/operator-only access unless an explicit product requirement is approved.
6. Review pg_partman maintenance identity, retention job and partition creation/drop behavior; do not assume a cron job exists from migration comments.

## Explicit non-actions

No audit script, SQL query, migration, seed, reset, bootstrap, grant change, default-ACL change, RLS activation, staging deployment, worker or provider action was executed. No database policy is approved or ready to apply.
