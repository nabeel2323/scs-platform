# G-002 direct PostgreSQL entrypoint audit — 28 November 2026

**Reviewed ref:** `develop` at `5356cd182cb41fc8f2266a0b75eb60056c43675d`  
**Audit branch:** `docs/g002-postgres-entrypoint-audit-20261128`  
**Scope:** source-level review of identified API PostgreSQL connection entrypoints and their immediate identity/actor helpers. No database connection was opened and no script was executed.

## Executive result

The API runtime pool has a stronger production identity/TLS startup gate than several standalone CLI entrypoints. The five staging bootstrap scripts share a fail-closed target/role/TLS guard and establish a bootstrap actor. By contrast, the standalone platform and catalog seeders accept an optional CA file and do not show the same staging target/role guard at their CLI boundary. The migration runner also treats its identity query as diagnostic/non-fatal and configures TLS only when a CA file is supplied.

These are **source-level hardening gaps / assurance differences**, not proof that a particular connection is currently insecure: the effective TLS behavior can also depend on the PostgreSQL connection URL and runtime environment. No credentials, connection strings, or database state were inspected.

## Entrypoint matrix

| Entrypoint | Connection / scope | Target and identity controls | TLS behavior | Actor context / disposition |
|---|---|---|---|---|
| `DatabaseService.onModuleInit` | Runtime `Pool` used by API | Resolves runtime URL and runs `logRuntimeDatabaseIdentity`; production-like identity failures are fatal | Verified TLS required for deployed/production-like runtime; mounted CA is verified | Runtime pool; reference implementation for production identity assurance |
| `DatabaseService.runDevMigrationsAndSeed` | Separate bootstrap `Pool` + `PoolClient` | Development/test bootstrap path; inspect environment gate before treating as a deployed entrypoint | Uses configured CA when supplied | Establishes system actor before RBAC seed; separate from API request pool |
| `infra/drizzle/migrate-pg.ts` | Standalone `Pool` + session `PoolClient`; advisory lock held over ledger/apply sequence | Reads migration identity via `readMigrationDatabaseIdentity`, but catches diagnostic failures and continues with identity unverified | CA-based verified TLS only when `PGSSLROOTCERT` is supplied | Migration operations are privileged DDL; no tenant actor context is established by the reviewed runner |
| `infra/drizzle/seed-pg.ts` | Standalone `Pool` + client | Requires `DATABASE_URL`; no equivalent exact-environment/database/role preflight found at CLI entrypoint | `PGSSLROOTCERT` optional; if present, CA verification enabled | Sets operator system actor for seed transaction; target restrictions are not equivalent to staging bootstrap guard |
| `infra/drizzle/seed-catalog.ts` | Standalone `Pool` + client | Requires `DATABASE_URL`; no equivalent exact-environment/database/role preflight found at CLI entrypoint | `PGSSLROOTCERT` optional; if present, CA verification enabled | Sets operator system actor for seed transaction; profile defaults to production data profile |
| `infra/drizzle/reset-pg.ts` | Destructive standalone `Client` | Requires explicit environment, exact database, exact destructive confirmation; staging has a second separate approval; dev/test restricted to local hosts | Requires `PGSSLROOTCERT` and verifies CA | Destructive path with strong explicit target guard; never execute as part of this audit |
| `bootstrap-staging-platform.ts` | Standalone `Client` | Shared staging preflight verifies exact database, staging approval, non-privileged/non-owning role and matching session/effective user | Requires CA and verifies TLS | Establishes bootstrap actor |
| `bootstrap-staging-rbac.ts` | Standalone `Pool` + client | Same shared staging preflight; actor is re-established for verification scope | Requires CA and verifies TLS | Establishes bootstrap actor; no execution performed |
| `bootstrap-staging-merchant.ts` | Standalone `Pool` + client | Same shared staging preflight | Requires CA and verifies TLS | Establishes bootstrap actor |
| `bootstrap-staging-staff.ts` | Standalone `Pool` + client | Same shared staging preflight | Requires CA and verifies TLS | Establishes bootstrap actor |
| `bootstrap-staging-store.ts` | Standalone `Pool` + client | Same shared staging preflight | Requires CA and verifies TLS | Establishes bootstrap actor |
| `scripts/audit-db-access.ts` | Read-only transaction through standalone `Pool` | Requires `DATABASE_URL`; reports effective/login role and privilege inventory | CA verification when `PGSSLROOTCERT` supplied; absent CA does not itself force verified TLS in this script | Begins `READ ONLY`, sets audit actor; does not read application rows |
| `scripts/create-admin-user.ts` | Standalone `Pool` + client | Explicit development/test environment and local database restrictions in helper; must retain local-only boundary | Reviewed CLI pool does not configure CA | Establishes bootstrap actor; local-only utility, not a staging bootstrap |
| `src/scripts/bootstrap-issue-token.ts` | Source file uses bootstrap token workflow; direct PostgreSQL client/pool ownership must be confirmed from imports and delegated service path | Not classified as a direct pool until helper/import chain is traced | Not classified | Follow-up item; avoid double-counting indirect use of DatabaseService |

## Shared staging bootstrap guard

`scripts/staging-bootstrap-safety.ts` requires:
- `SCS_ENVIRONMENT=staging`;
- `SCS_STAGING_BOOTSTRAP_CONFIRM=true`;
- an exact `SCS_STAGING_BOOTSTRAP_DATABASE`;
- `SCS_STAGING_BOOTSTRAP_APPROVAL=I_APPROVE_STAGING_BOOTSTRAP:<database>`;
- connected database equality with the named target;
- session and effective user equality;
- neither role is superuser, BYPASSRLS, CREATEROLE or CREATEDB;
- the effective role owns neither public tables nor the public schema;
- verified TLS as reported by `pg_stat_ssl`.

The five staging bootstrap scripts call this preflight before writes and establish a dedicated bootstrap actor. This is materially stronger than the standalone seed CLI preflight found in the reviewed source.

## Confirmed follow-up findings

1. **Migration identity is currently advisory.** `migrate-pg.ts` catches failures from `readMigrationDatabaseIdentity`, logs that identity remains unverified, then continues to acquire the migration lock and apply pending SQL. A separate migration credential can therefore proceed without successful identity diagnostics. The runner's CA configuration is conditional on `PGSSLROOTCERT`; the API runtime's production-like TLS gate is stronger.
2. **Seed CLIs lack the staging target guard.** `seed-pg.ts` and `seed-catalog.ts` require only `DATABASE_URL` at the CLI boundary, make the CA optional, and proceed to connect and seed. Both set an operator actor for their seed operations, which is useful audit attribution but is not a substitute for target/role/TLS validation.
3. **The audit CLI has a similar optional-CA posture.** Its transaction is read-only and actor-attributed, but the script itself does not force verified TLS when no CA path is configured.
4. **Do not homogenize all tools blindly.** The reset utility, staging bootstrap utilities, local admin utility, development bootstrap and production migration runner have different intended authority and target restrictions. Hardening should use explicit purpose-specific policies, not a single permissive shared bypass.
5. **Entrypoint inventory still needs a repository-wide import/call-graph pass.** In particular, trace `bootstrap-issue-token.ts`, all `pg.Client`/`pg.Pool` constructions outside the listed paths, scripts under alternate packages, and test-only helpers before declaring exhaustiveness.

## Outbox caller audit status

The current `OutboxDispatcher` is a transactional writer only. It intentionally has no poller and does not mark generic events `DISPATCHED`; non-carrier events remain pending until a real consumer exists. Carrier events remain owned by `ShippingCarrierWorker`.

A source scan identified publisher callsites in orders, returns, commission reversal, settlement adjustments, payments, disputes/reviews, inventory, merchant/store membership and catalog. The presence of `publish()` alone does not prove the active actor context or transaction nesting. In particular, inspect the enclosing controller/service call chain and the exact use of `DatabaseService.withActorContext` for inventory stock adjustments/transfers and low-stock publication, merchant verification submission, review creation, and commission reversal. Confirm whether each operation passes its transaction client or relies on an already active actor transaction. Do not add context wrappers based only on this partial scan.

No generic notification consumer should be introduced as part of this audit: event ownership, payload contracts, tenant/recipient resolution, idempotency, durable leases, retries and dead-letter behavior must be designed and tested first.

## Next work

1. Finish the repository-wide direct `Client`/`Pool` and helper/import inventory, including all bootstrap scripts and the API bootstrap token utility.
2. Trace every production `OutboxDispatcher.publish()` call through its caller chain and classify: exact actor kind/org, active transaction reuse, explicit transaction-client propagation, and tenant/store attribution.
3. Reconcile the result with migration 0001–0077 object ownership, FK/tenant predicates, functions, triggers, partitions, grants and default ACL inventory.
4. Prepare one bounded source/test PR for proven gaps only. Prefer tests that prove the policy and fail-closed behavior; do not execute seed/migration/reset/bootstrap scripts against any shared database.
5. Run one consolidated exact-head CI for the completed source/test batch. Keep staging release, DB writes, migrations, grant/default-ACL/RLS changes, Render mutations, deployments, provider calls, credential changes and worker activation on hold.

## Safety and evidence boundary

This is a read-only source audit. No database connection was opened. No migration, seed, reset, bootstrap or audit script was run. No staging/shared database, Render service, provider, credential, grant, default ACL, RLS policy, worker, deployment or release was changed. CI success is not authorization for any of those operations.


## Additional verified entrypoints (follow-up pass)

The wider tree review found three more direct PostgreSQL tools that must be included in the operational inventory:

- `src/scripts/bootstrap-issue-token.ts` creates a direct `pg.Client`. It requires an explicit `SCS_ENVIRONMENT`, never infers the environment from the URL, requires `--confirm-production` for production, enforces verified TLS for production-like environments (system trust store or supplied CA), checks session/effective role equality, rejects superuser/BYPASSRLS/CREATEROLE/CREATEDB and public-table/schema ownership, and sets a bootstrap actor in its transaction. This is materially stronger than the seed CLI boundary; retain its separate one-time bootstrap purpose and do not treat the existence of the token flow as routine application runtime.
- `check-staging-merchant-bootstrap.ts` creates a direct `pg.Pool`, requires a CA file, invokes the same staging target/role/ownership/TLS preflight, then runs a `READ ONLY` transaction under bootstrap actor context. Classify it as a guarded staging verification tool, not one of the five mutating staging bootstrap scripts.
- `scripts/verify-migration-ledger.mjs` creates a direct `pg.Pool`, requires `DATABASE_URL`, and makes CA verification conditional on `PGSSLROOTCERT`. It reads migration ledger state but has no explicit environment/target identity preflight or operator actor context in the reviewed file. Its release-pipeline caller/environment must be checked before assigning a final risk classification.

The direct-connection source set also includes `create-admin-user.ts` (development/test-only, local-target restriction; no TLS option on its pool) and `audit-db-access.ts` (read-only transaction, audit actor, optional CA). Do not count helper files that accept a `PoolClient`—for example `migration-lock.ts` and `migration-identity.ts`—as new connection constructors.

**Inventory status remains provisional:** the repository tree contains 648 API source files; this pass inspected known database/bootstrap/migration/seed scripts and targeted connection constructors, but has not yet exhaustively searched every source blob for dynamic imports or indirect connection factories. The report must not be represented as a complete proof until that scan and the outbox caller-chain review finish.


## Outbox caller-chain spot checks — verified controller actor scopes

A follow-up caller-chain inspection resolved several candidates from the initial publisher scan. These are **not confirmed actor-context gaps**:

- `InventoryController` has class-level `@UseInterceptors(TenantDatabaseContextInterceptor)`. Its stock adjust, transfer, and low-stock endpoints therefore execute within the authenticated user actor transaction. `InventoryService.adjustStock` and `transferStock` use the context-bound `DatabaseService.db`; their nested Drizzle transactions remain under the active request actor context, and post-inner-transaction outbox writes still occur before the outer interceptor transaction commits.
- `MerchantController.submitVerification` explicitly applies `TenantDatabaseContextInterceptor` to the endpoint (along with permission and active-org guards). The verification insert/update and outbox publish therefore inherit the authenticated user context.
- `ReviewsController` has class-level `TenantDatabaseContextInterceptor`; review persistence, trust recomputation and `review.created` publish execute under the request actor scope.
- `ReturnsController` has class-level `TenantDatabaseContextInterceptor`. Its settlement-adjustment admin endpoint and return lifecycle handlers inherit the authenticated actor scope. In the refund-finalization path, `processCommissionReversal` is called with the caller's transaction client, and the subsequent `return.refunded` outbox event uses the same transaction client. `SettlementAdjustmentService.createAdjustment` likewise passes its transaction client to `outbox.publish`.

The interceptor implementation explicitly wraps the full awaited HTTP handler in `DatabaseService.withActorContext`, and the `DatabaseService.db` getter resolves to that transaction-bound Drizzle handle while the async actor scope is active. Nested calls with the same actor reuse the active transaction; actor switching fails closed.

This spot check closes these specific candidate callsites only. It does **not** establish that every production publisher is safe: remaining publishers must be traced to their controller/interceptor or explicit worker/system context, with special attention to scheduled jobs, event listeners, callbacks detached from request lifetime, and direct service invocations that bypass HTTP controllers.


## Migration crosswalk continuity check — 28 November 2026

The existing `docs/remediation/G-002-MIGRATION-OBJECT-CROSSWALK.md` already contains a source review of the complete numbered migration set. I compared the Git tree blob identities for every numbered SQL migration at that document's recorded baseline (`c37c4d94f728b2806e7efb59d0380adb24472597`) with current `develop` (`5356cd182cb41fc8f2266a0b75eb60056c43675d`):

- Both refs contain exactly 77 numbered migration files, `0001` through `0077`, with no numbering gaps.
- No numbered migration file was added, removed or changed between those two refs (77 matching paths and blob SHAs).
- Therefore the existing 77-migration source crosswalk remains applicable to the current `develop` migration files. This does not validate live database state, migration ledger state, physical object ownership, or runtime grants/ACLs; those remain separate live-catalog questions and were not queried.
- Do not repeat the full 77-file static review unless a migration changes. Focus follow-up effort on reconciling the existing object/FK map with the source-level operation predicates and the direct entrypoint findings above.


## Payment refund endpoint actor-context gap — 28 November 2026

A focused pass over the payment publisher paths found two direct HTTP routes that were not covered by the tenant database interceptor and whose service methods do not establish an equivalent actor scope themselves:

- `POST /v1/payments/:id/refund` in `apps/api/src/modules/payments/payments.controller.ts` called `PaymentsService.requestRefund` without `TenantDatabaseContextInterceptor`. The service reads the payment/order, opens or reuses a transaction, inserts the refund and payment event, and writes `payment.refund_requested` through `OutboxDispatcher.publish`; it does not call `runWithUserActor` or `withActorContext` on this direct route.
- `POST /v1/admin/refunds/:id/approve` likewise lacked the interceptor. `PaymentsService.approveRefund` checks the caller's privileged role and atomically updates refund/payment/order state, inserts the payment event and writes `payment.refund_succeeded`, but does not establish its own actor context.

The fact that these methods pass a transaction client to `OutboxDispatcher.publish` preserves write atomicity; it does not establish PostgreSQL transaction-local actor settings. The correction is to apply the existing `TenantDatabaseContextInterceptor` at both controller methods, so the full awaited handler—including service reads, nested transaction work and outbox insertion—runs under the authenticated user actor. This is consistent with the adjacent payment verification/settlement routes.

Existing internal call paths remain compatible: merchant-rejection refund creation from `OrdersService.rejectOrder` already runs inside `runAsCaller`, and return-driven refund creation is invoked through `ReturnsController`'s class-level interceptor. `DatabaseService.withActorContext` reuses an identical nested actor and rejects actor switching, so the added route scope does not require a second actor transaction in those paths.

A focused controller metadata regression test is included with the source correction. This finding is an actor-attribution/context gap; it is not presented as proof of a cross-tenant exploit. Other non-HTTP payment paths (including the un-routed `expirePayment` method) remain subject to caller-graph verification; no worker or scheduler is activated by this audit.


## Additional direct PostgreSQL entrypoints found by path-targeted follow-up — 28 November 2026

The follow-up enumerated the current API tree (648 source files) and inspected additional operational scripts whose names indicate database, migration, bootstrap, check or UAT responsibilities. This is a targeted path/content pass, not an exhaustive blob scan of every source file.

| Entrypoint | Connection and target boundary | Operation / actor finding |
|---|---|---|
| `b1-migration-test.js` | Three `pg.Pool` instances; fixed `localhost:15432`; requires `SCS_ENVIRONMENT=development|test` and `SCS_UAT_CONFIRM=true` | Destructive disposable migration harness: drops/creates local test databases and applies migrations. It is not a staging tool; do not run during audit |
| `p311-migration-verify.js` | `pg.Pool`; fixed `localhost:25433` and `scs_p311_verify`; same development/test + UAT confirmation gate | Applies migration chain and verifies constraints/idempotency on its dedicated local verification database; no staging target |
| `scripts/m5-uat-run.ts`, `m5-uat-verification.ts` | Direct `pg.Pool`; `assertLocalUatExecution` checks development/test, explicit confirmation, and local DB/API hosts | Manual API UAT flows with direct DB inspection; do not run outside disposable local/test environment |
| `scripts/m6-uat-run.ts` | Direct `pg.Pool`; hard-coded localhost DB/API/Redis targets; same local UAT confirmation helper | Mutating multi-merchant UAT flow; local-only guard is present; not run |
| `check-merchant-rbac.ts` | Direct `pg.Pool`; requires `DATABASE_URL` and CA file, configures certificate verification; no explicit environment/database/role preflight | SELECT-only role/permission diagnostic; no transaction actor context. Avoid pointing it at shared or production-like targets without an explicit operational gate |
| `check-staging-users.ts` | Direct `pg.Pool`; requires `DATABASE_URL` and CA file, configures certificate verification; no explicit staging/database/role preflight | SELECT-only but returns user phone, email and full name to console; no actor context. This is a sensitive manual diagnostic and should receive a read-only exact-staging target guard and output minimization before any shared staging use |
| `scripts/verify-staging-bootstrap-target.ts` | Direct `pg.Client`; requires `DATABASE_URL` and CA file; calls the shared fail-closed staging bootstrap target guard | Read-only preflight; exact staging/database/role/ownership/TLS validation is inherited from the helper; no writes |

These additions correct the earlier operational-entrypoint list, but they do not close the repository-wide inventory. The API tree has 648 source files; a full scan of every source blob and indirect/dynamic connection factory remains outstanding. The two ad hoc check scripts above are not evidence of an application runtime bypass: they are standalone manual diagnostics. The staging-user diagnostic is nevertheless too permissive for sensitive PII output and is recorded as a follow-up hardening candidate; no script was executed.


## Outbox publisher caller-chain pass — 28 November 2026

A further source pass traced the current `OutboxDispatcher.publish` callsites in catalog/product governance, inventory, merchant/store membership, returns/financial helpers, reviews and disputes to their controller or nested-service boundaries:

| Publisher area | Verified caller boundary | Finding |
|---|---|---|
| `CatalogService` product publication | Catalog publish/update handlers apply `TenantDatabaseContextInterceptor`; selected service paths additionally call `withUserActorContext` explicitly | Reviewed publication writes are actor-scoped; no missing scope found in these paths |
| `ProductGovernanceService` | Submit/withdraw/publish/unpublish/moderation handlers in `CatalogController` apply the tenant interceptor; service publishes with the supplied transaction client | Actor context comes from the awaited controller scope and event write is transaction-bound |
| `InventoryService` | `InventoryController` has class-level tenant interceptor, including the low-stock notification route | Reviewed adjust/transfer/low-stock publishes run inside the authenticated request actor context; no scheduler caller was established in this pass |
| `MerchantService` | Store creation and verification routes in `MerchantController` apply the tenant interceptor | Store creation passes the transaction client; verification uses the context-bound DatabaseService handle |
| `StoreMembershipService` | `StoreMembershipController` has class-level tenant interceptor | Membership events pass the transaction client where transactionally coupled; request actor scope covers the service |
| `ReturnsService`, `CommissionReversalService`, `SettlementAdjustmentService` | `ReturnsController` has class-level tenant interceptor; commission reversal and settlement adjustment helpers are invoked within the return workflow's active actor scope | Reviewed return/financial events retain the caller context; transaction-client propagation is used on the inspected transition paths |
| `ReviewsService` and `DisputesService` | Both controllers have class-level tenant interceptor | Reviewed event writes are request actor-scoped |
| `PaymentsService` refund paths | The buyer refund-request and admin refund-approval endpoints are corrected on PR #181; both now apply the tenant interceptor | Focused metadata tests included; exact source/test head passed CI #1753 |

This remains a bounded callsite review, not a claim that every `publish` call across all 648 API files has been exhaustively enumerated. The dispatcher itself remains intentionally non-polling: `publish` creates PENDING intent only; no generic consumer/ack/retry adapter was introduced. Continue checking direct service invocations, detached callbacks and worker/scheduled paths before closing the inventory. Do not add a generic consumer as part of this audit.


## Read-only staging user diagnostic hardening — 28 November 2026

The manual `apps/api/check-staging-users.ts` diagnostic has now been hardened in this audit branch:

- Added a purpose-specific `staging-read-only-audit-safety.ts` guard. It requires `SCS_ENVIRONMENT=staging`, an exact `SCS_STAGING_READ_ONLY_AUDIT_DATABASE`, and matching `SCS_STAGING_READ_ONLY_AUDIT_APPROVAL=I_APPROVE_STAGING_READ_ONLY_AUDIT:<database>`.
- Before reading application rows, it verifies the connected database, equality of session/effective roles, rejects superuser/BYPASSRLS/CREATEROLE/CREATEDB and public table/schema ownership, and requires `pg_stat_ssl.ssl = true`. The script separately requires `PGSSLROOTCERT` and uses `rejectUnauthorized: true`.
- The diagnostic now starts an explicit `BEGIN READ ONLY` transaction and sets a transaction-local `audit` actor. Output is aggregate user counts by status and role only; phone, email, full name, organization names and individual user rows are no longer selected or printed.
- Added focused guard tests for environment/approval/target mismatch, privileged roles, ownership, TLS, successful restricted identity and audit actor attribution.

The change is source-only. No database connection or diagnostic execution was performed. The new tests are authored but have not yet been executed; exact-head validation remains pending. The separate bootstrap safety contract was not weakened or reused for read-only auditing.


## Exact-head source checkpoint — 28 November 2026, 21:22 UTC

- PR #181 current head after the staging diagnostic hardening batch: `803ce6fe9f5a13c31e62429297b5b89a52e15a9c`; base `develop` remains `5356cd182cb41fc8f2266a0b75eb60056c43675d`. Exact compare: 38 commits ahead, 0 behind, nine changed paths. PR #181 remains open, non-draft, and GitHub reports mergeable=true; it is not merged.
- New source files: `apps/api/scripts/staging-read-only-audit-safety.ts` and `.spec.ts`. Updated `apps/api/check-staging-users.ts` to use the purpose-specific exact-target guard, verified CA TLS, restricted role identity, explicit `BEGIN READ ONLY`, transaction-local audit actor context and aggregate-only output. Connection cleanup and rollback are guarded if pool connection acquisition fails.
- The guard tests cover non-staging environment, exact database/approval, wrong target, role switching, privileged roles, ownership, TLS, successful restricted identity and audit actor setup. These tests have **not** been executed. No exact-head GitHub Actions run is associated with `803ce6f`; do not treat CI #1753 as validation of these later additions.
- CI #1753 / run `46163157475` remains successful for all 10 mandatory jobs on earlier source/test head `f6be9ca18157c391842b55168616975c10f3b67e`; k6 and staging-release jobs were skipped. The latest source head reports only the two external Vercel free-plan preview rate-limit failures. Do not retry previews or start duplicate CI runs.
- PR description now records the new scope and explicitly marks exact-head validation pending. Keep PR #181 unmerged until the new source/test batch has one consolidated exact-head CI and the separate staging-release authorization gate is resolved. No reviewers requested.
- PR #138 remains open/draft/unmerged and untouched at `81f30f5c30654b233ef373c15fd3f2cb867aba01`; its preservation branch remains protected. PR #175 remains separate.
- No database connection or script execution, staging/shared DB write, migration, seed/reset/bootstrap, grants/default ACL/RLS change, Render mutation, deployment, provider call, credential change, worker activation or release occurred.


## CI #1758 completion — 28 November 2026

- Rechecked workflow run `46175778823` against the source/test head `803ce6fe9f5a13c31e62429297b5b89a52e15a9c`: completed SUCCESS. All 10 mandatory jobs passed, including `pnpm --filter @scs/api test:coverage`, integration tests, lint/typecheck/format, migration full apply on disposable CI PostgreSQL, boundary lint, web/admin tests, container smoke, contract/codegen and build. k6 Smoke and Trigger Staging Release were skipped.
- This run validates the new read-only audit safety spec and updated diagnostic on that source/test head. It does not prove a live staging target or authorize a release. No database connection or staging script execution occurred.
- PR #181 latest fetched metadata: head `ab21cdd8fca01e6e5bb29a0f8a61f71863fb3587`, 43 commits, nine changed files, open/non-draft/unmerged, mergeable=true. Base remains `develop` at `5356cd182cb41fc8f2266a0b75eb60056c43675d`. Keep merge gated by the separate staging-release authorization.
- PR #138 remains protected and untouched. Direct PostgreSQL constructor inventory and OutboxDispatcher caller graph remain provisional; continue targeted source review without repeated CI.
