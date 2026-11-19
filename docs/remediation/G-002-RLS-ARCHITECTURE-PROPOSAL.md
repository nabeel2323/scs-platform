# G-002 Database Access and Tenant-Aware RLS Architecture Proposal

**Repository:** `nabeel2323/scs-platform`  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Status:** DESIGN PROPOSAL — NOT APPROVED FOR MIGRATION  
**Evidence date:** 19 November 2026  
**Related findings:** G-002, G-020, G-022  
**Live database changes:** None

## 1. Decision summary

The current platform uses a NestJS API with direct node-postgres/Drizzle access. Web and mobile clients use the SCS API rather than querying application tables through Supabase JS. Tenant authorization currently lives in API guards, controllers and service-level ownership helpers.

The connected Supabase inspection session is `postgres` with `BYPASSRLS`; it is not evidence of the API or migration login. The Render connector does not expose environment-variable values or usernames. Therefore the effective API and migration identities are still unknown.

**Do not apply migration 0070/0071 to the shared database, enable RLS, alter grants, change extension ownership or deploy this proposal.**

The correct architecture is not a blanket RLS toggle. It is a verified split between:

- a migration owner used only by reviewed migration jobs;
- a least-privilege API runtime identity;
- optionally a separate worker identity if worker query patterns and operational constraints justify it;
- no direct browser/mobile CRUD access to the application tables.

## 2. Current verified baseline

- 114 public relations: one partitioned analytics parent, 12 monthly partitions, one default partition and 100 ordinary tables.
- RLS enabled/forced: 0/0.
- Public RLS policies: 0.
- Public views/materialized views/foreign tables in the inspected relation inventory: 0.
- `anon`, `authenticated`, `service_role`: no effective SELECT/INSERT/UPDATE/DELETE on the 114 relations; each retains TRUNCATE/REFERENCES/TRIGGER/MAINTAIN on all 114.
- `authenticator` is a member of anon, authenticated and service_role.
- `postgres` has LOGIN and BYPASSRLS; `service_role` is NOLOGIN and BYPASSRLS; `authenticator` is LOGIN without BYPASSRLS.
- No direct table grants to PUBLIC and no PUBLIC default-ACL grants were found in the previous catalog review.
- Supabase-managed `supabase_admin` owns separate broad default ACLs and owns `pg_trgm`; do not alter those through the current connection.
- The API source constructs a node-postgres Pool from `DATABASE_URL` and wraps it with Drizzle. The migration runner uses `DATABASE_URL`; the staging release workflow maps `STAGING_DATABASE_URL` to that variable.
- The current Render staging service is on `develop`, auto-deploy is disabled, and the service connector does not reveal the database username.

See:

- [Database table access classification](./DATABASE-TABLE-ACCESS-CLASSIFICATION-2026-11-19.md)
- [Database access verification](./DB-ACCESS-VERIFICATION-2026-11-19.md)
- [Implementation plan](./IMPLEMENTATION-PLAN.md)

## 3. Target role separation

| Identity                  | Purpose                                               | Required posture                                                                                                   | Prohibited use                     |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Migration owner           | Apply reviewed schema/ACL migrations                  | Object ownership or narrowly granted DDL; secret restricted to release workflow; no app traffic                    | API request handling               |
| API runtime               | Serve authenticated SCS API requests                  | No superuser; preferably no BYPASSRLS after tenant context is proven; only required table/sequence/function grants | Browser/mobile clients; schema DDL |
| Worker runtime (optional) | Outbox, carrier, reconciliation and lifecycle workers | Separate credential only if worker isolation and rollout are operationally supportable; narrowly scoped grants     | Public clients                     |
| Supabase Data API roles   | PostgREST/client-facing access                        | No direct application table CRUD unless a separately approved client use case and matching policies exist          | SCS business workflows             |
| Inspection/admin identity | Read-only audits and controlled administration        | Separate human/admin access, audited and time-bound                                                                | Runtime API or routine migrations  |

Do not create or grant roles until the actual existing role identities, ownership, Supabase-managed role constraints and connection-pool behavior have been reviewed.

## 4. Tenant-aware RLS design candidate

A true RLS design for the direct Drizzle API requires trusted request context to be attached to every query in the transaction that executes it.

Candidate transaction-local context:

- `app.actor_kind`: `user` or `system`.
- `app.user_id`: verified SCS user UUID from the authenticated request.
- `app.active_org_id`: verified active organization UUID after membership validation.
- `app.role`: server-derived platform/application role; never copied from user-editable metadata.
- `app.request_id`: correlation ID for audit/debugging.

Policies must read context using safe missing-value behavior, for example `current_setting('app.user_id', true)`. Missing or malformed context must deny access, not widen it. Do not use `auth.uid()` unless the product intentionally migrates its identity and authorization system to Supabase Auth.

### 4.1 Context lifecycle

1. Authenticate the SCS JWT/session and validate user status.
2. Resolve active organization and membership from trusted database records.
3. Begin a transaction on one checked-out pool connection.
4. Set context with transaction-local `set_config(..., true)` or equivalent parameterized `SET LOCAL`; never use session-level `SET` on a pooled connection.
5. Execute all request database operations through the same transaction-bound Drizzle client.
6. Commit/rollback and release the connection; local settings disappear with the transaction.
7. Prove connection reuse cannot retain one request's identity for the next request.

The current services use the shared `DatabaseService.db` surface. A request-scoped transaction/AsyncLocalStorage adapter may be feasible, but this must be proven by inventorying every DB access path and testing controllers, interceptors, guards, exception handling, streaming endpoints and nested transactions. Do not start the refactor until compatibility is demonstrated.

### 4.2 Background workers

Workers do not have an end-user JWT. They need an explicit system actor context with a worker identity and narrow capabilities. Policies must distinguish:

- tenant work items whose event carries a verified organization/store owner;
- system tables such as outbox events and worker leases;
- operational financial jobs with explicit claim/lease ownership and audit requirements.

Do not simply give every worker BYPASSRLS. If a separate worker identity is selected, test its allowed tables and operations independently. Never infer tenant scope solely from an untrusted event payload; load and verify the authoritative row relationship.

### 4.3 Table policy families

The 114-relation inventory identifies domain families, but the exact row predicates remain to be derived from the Drizzle schema, foreign keys and service query paths. Candidate policy families are:

- identity/session/device credentials: user ownership; sensitive credential/audit records restricted to authentication services and platform security roles;
- organization/store/warehouse: active organization membership plus active store membership;
- catalog: public API-visible state is ACTIVE/PUBLISHED only; non-public states require owning-store membership or platform moderation role;
- inventory/pricing/offers: warehouse/store/org chain and active membership;
- cart/favorites/search preferences: buyer ownership;
- orders/shipments/returns: buyer ownership or fulfilling store organization plus explicit staff/driver/operations role;
- payments/settlements/refunds/disputes: immutable financial scope, explicit approvals and audit access;
- messaging/notifications: participant or user ownership;
- outbox/leases/ops controls/audit: worker or platform operations role only;
- analytics: scoped aggregate/report access; raw events remain internal.

These are families, not executable policy SQL. Every table needs an explicit ownership path, operation matrix and test before migration generation.

## 5. Why blanket RLS is unsafe

- If the API runtime role has BYPASSRLS, enabling RLS does not constrain API queries.
- If the API runtime role is subject to RLS and has no matching policies, ordinary queries are denied.
- Policies based only on `auth.uid()` do not represent SCS's custom JWT/session and organization membership.
- Session-level custom GUCs can leak identity between pooled connections.
- A worker without end-user context can fail or be accidentally granted broad tenant access.
- RLS on a parent partition does not remove the need to inspect partition access and partition-specific policy behavior.
- Supabase-managed default ACLs/extension ownership must not be modified as if they were application-owned objects.

## 6. Required implementation and verification sequence

| Step | Deliverable                                                                            | Exit evidence                                                |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| A    | Capture API runtime `current_user` and `session_user` without printing DSNs            | Read-only API-side diagnostic or trusted startup audit       |
| B    | Capture migration workflow role using staging secret                                   | Read-only CI audit artifact; no secret output                |
| C    | Reconcile API/migration role memberships, ownership, BYPASSRLS, grants and search_path | Reviewed role/access matrix                                  |
| D    | Inventory every DB access path, raw SQL call, nested transaction and worker            | Source audit with explicit exceptions                        |
| E    | Build exact per-table tenant ownership and operation matrix                            | 114 relations classified with row predicate and caller class |
| F    | Prototype transaction-local context on isolated PostgreSQL                             | Pool reuse, concurrent request, exception and rollback tests |
| G    | Implement dedicated runtime/migration identities in isolated environment               | Least-privilege grants and migration owner proof             |
| H    | Implement table-specific policies in an isolated migration                             | API regression suite and two-tenant negative matrix          |
| I    | Validate fresh install and representative upgrade                                      | Isolated migration apply and rollback/forward-fix evidence   |
| J    | Obtain approved staging maintenance window                                             | Explicit deployment approval; verify before/after access     |
| K    | Production release decision                                                            | Phase 6 gates and explicit go/no-go                          |

## 7. Test matrix

At minimum, test:

- buyer A cannot read/write buyer B carts, favorites, notifications, messages, orders or returns;
- merchant A cannot read/write merchant B stores, warehouses, inventory, products, offers, prices, imports or analytics;
- a same-organization user without active store membership is denied store-private data;
- platform staff role exceptions match the documented authorization model and cannot be spoofed by request payloads;
- missing user/org context returns no rows or a clear denial;
- a pooled connection used by user A cannot expose A's context to user B;
- concurrent A/B requests on a pool of size 1 and larger cannot cross-contaminate context;
- rollback/exception and nested transaction paths clear context;
- background worker can process only its intended event/table set;
- Data API roles cannot CRUD application tables directly;
- migration role can apply DDL but is never used for request traffic;
- runtime role cannot perform DDL or create roles;
- no role receives accidental TRUNCATE/MAINTAIN or broad default privileges.

## 8. Current blocker and safe next action

The read-only audit utility and workflow exist. A push-triggered read-only audit was attempted from the remediation branch, but the GitHub environment job remained in a waiting/approval state and did not execute. The connector cannot approve environment protection or dispatch workflows. Do not bypass that control.

The Render connector also omits environment variable values and usernames. Do not retrieve or print a connection string. The current Supabase MCP identity is administrative and cannot substitute for the API identity.

**Next safe action:** obtain the staging environment's authorized approval for the read-only GitHub audit, then capture the actual Render API role through a controlled API-side diagnostic or trusted runtime telemetry. Until both identities are proven, P1-06/P1-09 remain blocked and no RLS/grant migration is authorized.

## 9. Decision status

- P1-06: PARTIAL — source-level paths known; effective API/migration identities not yet captured.
- P1-07: PARTIAL — full live inventory/domain access-intent classification complete; per-table row ownership predicates remain open.
- P1-08: PARTIAL — table grants and role memberships rechecked; remaining ACL/function/schema/default-ACL review continues.
- P1-09: BLOCKED — this document is a proposal, not an approved executable design.
- P1-10: PARTIAL — isolated migration validation only; no shared-database changes.

No live database mutation, migration, grant change, RLS enablement, extension relocation, Render configuration change or deployment was performed.

## 10. Expanded live ACL and role-chain evidence — 19 November 2026

A fresh read-only query against the connected SCS-PlatForm PostgreSQL 17.6 database confirms explicit MAINTAIN, REFERENCES, TRIGGER and TRUNCATE ACL entries for anon, authenticated and service_role on all 114 public tables. None of these roles has effective SELECT/INSERT/UPDATE/DELETE on those 114 tables in the inspected snapshot. The grants are not inherited through PUBLIC.

The postgres default ACL for public tables repeats those four privileges for the same three roles on future tables created by postgres. The Supabase-managed supabase_admin default ACL is separate and contains broader DML defaults; do not change it as part of this application remediation.

authenticator can SET ROLE to anon, authenticated and service_role, but does not inherit their privileges automatically (SET=true, INHERIT=false for each membership). The live MCP connection itself is postgres with BYPASSRLS and is not evidence of the Render API or migration identity.

Migration 0070 revokes all table/sequence privileges and future defaults for anon/authenticated for the role executing the migration. It does not revoke service_role. This is consistent with treating service_role as server-only, but its current direct grants should remain explicitly reviewed in the final access matrix. Do not apply migration 0070 to the shared database until the actual migration owner is confirmed.

These results strengthen the case for least-privilege ACL cleanup but do not establish that PostgREST exposes TRUNCATE/MAINTAIN operations or that the SCS API uses these roles. RLS remains disabled on all 114 public tables. No database change was made.