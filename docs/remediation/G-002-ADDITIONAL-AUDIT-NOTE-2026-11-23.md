# G-002 — Supplemental read-only audit note received 23 November 2026

**Source:** user-uploaded `Advanced UX Enhancement Prompt.txt`  
**Date received:** 23 November 2026  
**Observation timestamp:** not supplied  
**Database endpoint, query text, connection identity and exact object scope:** not supplied

## Reported observations

The uploaded note reports the following checks against a connected project:

- RLS disabled on 111 of 111 tables.
- 32 public-schema functions found; none marked `SECURITY DEFINER`.
- `anon` and `authenticated` do not have `BYPASSRLS`; `service_role` does.
- Supabase Performance Advisor reports 55 foreign-key constraints without covering indexes.
- An earlier Render log investigation found OTP verification codes in plaintext. The note says the source cause and fix still need to be established.
- Render showed one API service and no separate worker service in the inspected workspace. The note correctly does not infer whether workers run inside the API process.
- The configured startup command reportedly runs migrations and RBAC seed before API startup; logs reportedly showed 63 migrations applied and the seed completed.
- The note explicitly states that no SQL mutation, privilege modification, code change, service restart, deployment or test-record creation was performed.

## Reconciliation against existing project evidence

This note is preserved as **supplemental reported evidence**, not as a replacement for the dated read-only reports, because its query text, timestamp, connection role, database endpoint and relation-kind scope are not included.

| Topic | Existing recorded evidence | Supplemental note | Disposition |
|---|---|---|---|
| Public table count | 19-November read-only inventory: 114 public ordinary/partitioned tables (relkind r/p); source reconciliation: 99 Drizzle declarations + 15 non-Drizzle/partition relations. Historical 116 count remains unresolved. | 111 of 111 tables | **Unreconciled.** Do not infer the missing/excluded objects or replace 114/116. A refreshed protected read-only catalog audit must use explicit schema and relkind filters and identify the audit role. |
| RLS | 19-November snapshot: 0 of 114 enabled/forced. | 0 of 111 enabled | Directionally consistent; exact scope/snapshot remains unknown. |
| Function security | 19-November report found 0 `SECURITY DEFINER` functions in the inspected public schema. | 32 functions; none `SECURITY DEFINER` | Potentially consistent, but function count and schema scope must be rechecked together. |
| Role flags | Existing report: `anon` and `authenticated` NOLOGIN without BYPASSRLS; `service_role` NOLOGIN with BYPASSRLS; inspection connection `postgres` itself had BYPASSRLS. | Same client-role BYPASSRLS distinction | Consistent at summary level. Does not establish actual API or migration runtime identity. |
| FK indexes | G-013 tracks 55 FK constraints without covering indexes. | Same count | Consistent as a reported performance finding; no index DDL is authorized without workload evidence. |
| OTP logging | Existing project notes distinguish source-level redaction review from the missing post-fix staging runtime exercise. | Earlier Render logs reportedly showed plaintext OTPs; source cause/fix not established in this note. | Keep runtime finding open. Reconcile the note with current source history; do not claim a deployed fix from a source-only review. |
| Workers/startup | Existing source and Render inventory says a separate worker service was not observed; embedded-worker activation and startup migration/seed effects require source/runtime inspection. | Same caveat; startup command reportedly applies migrations and RBAC seed, 63 migrations in logs. | Consistent warning. Do not restart, deploy, activate workers or trigger startup operations as part of this audit. |

## Required next evidence

1. Re-run a read-only catalog inventory only through the approved protected staging workflow, with explicit schema, relation-kind, partition and extension-object scope.
2. Record the actual audit login/effective role and distinguish it from API runtime and migration runtime identities.
3. Reconcile 111, 114 and historical 116 counts from one timestamped catalog result; include the exact relation list and relkind counts.
4. Reconcile the 32-function inventory with the existing 0-`SECURITY DEFINER` report using the same schema scope and explicit function flags.
5. Keep the 55-FK-index issue as a workload-evidence follow-up; do not add indexes based solely on the advisor count.
6. Continue OTP source and log-redaction review, but do not claim runtime verification until a separately authorized staging deployment and fresh log review.
7. Trace worker registration and startup migration/seed paths without executing them.

## Safety boundary

This note does not authorize SQL changes, grants/default-ACL changes, migration 0070/0071, RLS enablement, Supabase extension ownership changes, staging writes, environment changes, service restart, deployment, worker activation or test-record creation. Preserve the existing protected staging approval and no-merge/no-deploy restrictions.
