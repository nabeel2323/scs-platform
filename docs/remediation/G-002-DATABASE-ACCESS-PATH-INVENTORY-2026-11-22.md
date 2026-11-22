# G-002 Database Access Path Inventory

**Audit date:** 22 November 2026  
**Branch:** remediation/phase-0-1-tenant-security  
**Source baseline:** d8f9941e9f517c93b9fbcb22bae1a1eeb384bce2  
**Status:** Preliminary static source inventory — not a complete runtime proof and not authorization to enable RLS.

## Purpose and safety boundary

This inventory supports the G-002 transaction-bound tenant-context design. It records the database access paths that must be accounted for before request-scoped context or RLS can be safely enabled. It does not change database roles, grants, default ACLs, schemas, migrations, policies, runtime secrets or worker activation.

The source audit reviewed all 53 TypeScript service/worker/provider files under apps/api/src/modules, plus DatabaseService, DatabaseModule, AuditService, AuditLogMiddleware, JwtAuthGuard, PermissionsGuard, AppModule and main.ts. The source review did not inspect a live database or staging environment.

## Confirmed source access paths

| Access path | Current implementation | RLS / transaction-context implication |
|---|---|---|
| HTTP module services | Services inject the singleton DatabaseService and issue Drizzle operations through DatabaseService.db (select/insert/update/delete and db.execute(sql...)). There is no request-bound AsyncLocalStorage transaction context in the reviewed common database path. | A transaction-local tenant setting cannot be assumed to exist for normal service queries. Every request operation must be routed through an explicit transaction-bound handle before RLS is enabled. |
| Service-level transactions | Explicit db.transaction calls exist in inventory, merchant, store membership, orders, payments, returns, business calendar, settlement adjustments, catalog-import execution and bootstrap flows. | A request-level transaction wrapper may create nested transactions/savepoints. Nested transaction semantics, transaction lifetime and rollback behavior must be proven before adoption. |
| Raw Drizzle SQL | Several modules use DatabaseService.db.execute(sql...). These remain Drizzle operations on the configured database handle, not independent authorization boundaries. | A future scoped handle must cover both query-builder and execute(sql...) calls; do not assume typed query-builder coverage is enough. |
| Audit middleware | AuditLogMiddleware records mutating HTTP requests asynchronously after response completion through AuditService.record. AuditService writes with DatabaseService.db and receives actor type, actor ID, org ID, IP and request metadata. | The audit write is outside the controller's service transaction and may run after its context is gone. It needs an explicit audit/system context and a deliberate decision about whether audit rows participate in or are independent from the request transaction. |
| Authentication and permission guards | JwtAuthGuard attaches the decoded JWT payload to request.user; PermissionsGuard reads permissions from that payload. The reviewed guards do not issue database queries. | Guards are not currently a database-query path that needs a tenant transaction. Any future DB-backed permission lookup would need explicit ordering/context design. |
| Background workers and monitors | AutoCompleteWorker, ReturnExpirationWorker, ShippingCarrierWorker, CarrierTrackingPoller, OutboxDispatcher, P13MonitorService, WorkerLeaseService and OpsAlertService use the shared DatabaseService handle outside normal HTTP request execution. | These must receive an explicit system/worker or tenant-scoped context. They cannot inherit a user request's AsyncLocalStorage context. The P13 return-expiration worker is opt-in; P13Monitor is separate and always runs; other in-process workers have their own startup/claim behavior. |
| Startup identity diagnostic | DatabaseService creates the runtime pg.Pool from the resolved DATABASE_URL and logs non-secret session_user/current_user, role privilege flags (including BYPASSRLS) and SSL state. | This is source-level diagnostic capability only. Actual staging API identity remains unverified until protected runtime evidence is collected. |
| Development migration and seed path | In development/test only, DatabaseService creates a separate bootstrap Pool and PoolClient using the same resolved connection string, applies SQL migrations and RBAC seed transactionally, then closes the bootstrap pool. Production/staging migration execution is a separate workflow path. | Runtime API and migration identities must remain distinct in protected environments. Do not infer production role separation from this development bootstrap code. |
| Direct pg PoolClient usage | Within the reviewed application source, raw pool/client queries are concentrated in DatabaseService startup identity and development migration/seed code. No direct new Pool/pool.query/client.query pattern was found in the reviewed module service/worker/provider set. | This is a bounded source finding, not proof that scripts, CLI tools, tests, connectors or future modules have no direct database paths. |

## Important transaction-context blockers

1. DatabaseService.db is a singleton NodePgDatabase property, not a request-aware getter. A request handler's user/org identity is not automatically bound to the connection executing a query.
2. Many service methods open their own transactions. Any outer request transaction must prove compatibility with nested Drizzle transactions/savepoints and existing transaction callbacks.
3. AuditLogMiddleware writes asynchronously after response completion. Its actor/org metadata is available, but it is not automatically inside a controller transaction.
4. Background workers, the outbox dispatcher, operations monitor, worker lease service and bootstrap paths need explicit system/worker/bootstrap identity. They must never inherit a stale or unrelated HTTP tenant context.
5. Raw Drizzle execute(sql...) calls must be covered by the same scoped transaction mechanism as typed query-builder calls.
6. The current source inventory does not prove that the staging API runtime role is non-superuser and NOBYPASSRLS. PR #142 adds diagnostics and passed disposable-PostgreSQL integration CI, but live staging identity is still unverified.
7. The last detailed public-schema inventory and schema coverage reconciliation total 114 relations; a separate 116-table summary count remains unexplained. Do not mark table coverage complete until a refreshed protected read-only catalog audit resolves the discrepancy.

## Required proof before implementation or RLS activation

- Finish the exact route/service-to-table operation map for every tenant-owned relation, including worker, audit, bootstrap, webhook and CLI paths.
- Reconcile the 114-versus-116 relation-count discrepancy from a protected read-only catalog snapshot. Include schemas, relkinds, partition parents/children, migration/system objects and extension-owned relations.
- Specify transaction-local setting names and semantics, including user ID, active organization, actor type, worker identity and bootstrap identity. Match them exactly to policy expressions.
- Prove request interceptor ordering after authentication/permission guards and before handlers; test errors, early returns, streaming responses, cancellation and response completion.
- Prove nested transaction/savepoint behavior for existing service transactions and ensure no fallback to an unscoped global Drizzle connection occurs inside a tenant request.
- Define separate worker/system context entry points and explicit tenant context for work items that belong to a store/org.
- Define audit middleware context and decide whether audit writes commit independently or with the request.
- Verify runtime API role is not superuser and has NOBYPASSRLS; verify migration role separately and ensure default privileges are correct.
- Add negative cross-tenant SELECT/INSERT/UPDATE/DELETE tests, same-user multi-org switch tests, worker isolation tests, audit attribution tests, rollback/concurrency tests and connection-pool reuse tests.
- Obtain independent security review and explicit protected staging authorization before applying policies or changing role configuration.

## Current decision

Do not add a global request transaction interceptor, enable RLS, alter role grants/default ACLs, apply migrations 0070/0071, change DATABASE_URL, or activate workers as part of this preliminary inventory. The next implementation task is to complete the operation/ownership and runtime access-path proof, then implement the scoped context behind a feature-controlled, fail-closed boundary with dedicated tests.
