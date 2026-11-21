# G-002 — Database Access and RLS Architecture Design

**Status:** PROPOSAL — read-only architecture review; not approved for deployment or shared-database mutation  
**Finding:** G-002 — RLS disabled and excessive client-role privileges  
**Repository:** `nabeel2323/scs-platform`  
**Reviewed source:** PR #138 branch `remediation/phase-0-1-tenant-security` and PR #142 branch `security/runtime-db-identity-diagnostics`  
**Last updated:** 22 November 2026

## 1. Executive decision

Do not enable RLS on the shared database yet.

The current API uses a process-wide `DatabaseService` with a shared `pg.Pool` and Drizzle handle. Tenant authorization is primarily enforced in application services through the verified JWT caller context and helpers in `apps/api/src/common/tenant-scope.ts`. The inspected Nest middleware wiring does not establish a request-scoped database transaction or transaction-local tenant context.

RLS policies that depend on a user or organization context would therefore not yet have a reliable context source for every SQL statement. Setting a session-level variable on a pooled connection would be unsafe because a later request could inherit stale tenant state. A partial conversion would also leave direct service queries and background workers outside the intended policy boundary.

The safe sequence is:

1. Verify the actual API and migration identities through the controlled release path.
2. Complete a table-by-table access and ownership inventory.
3. Implement a transaction-bound database context that every relevant query path uses.
4. Prove the context and policies using a non-owner, non-superuser, non-BYPASSRLS PostgreSQL role.
5. Roll out RLS in reviewed table groups only after independent review and explicit staging authorization.

This document records a proposed target architecture and current evidence. It does not authorize a deployment, grant change, RLS migration, or production/staging database mutation.

## 2. Evidence reviewed

### 2.1 API database access

- `DatabaseModule` is global and provides one `DatabaseService`.
- `DatabaseService` constructs a process-wide `pg.Pool` and Drizzle database handle.
- `app.module.ts` registers request-ID and audit middleware, but the inspected middleware does not open a database transaction or bind a transaction handle to the authenticated request.
- `tenant-scope.ts` implements application-level checks using `CallerContext` fields `sub`, `role` and `activeOrg`. It resolves ownership through organization, store, warehouse, product, variant, inventory and order relationships.
- The current model is direct API-to-PostgreSQL access. The API's JWT identity is managed by the SCS identity module; the reviewed code does not establish Supabase Auth `auth.uid()` as the API identity source.
- The source reviewed does not show a universal request-scoped transaction/context mechanism. This is a blocker to RLS activation, not proof that every query is currently tenant-unsafe; existing service guards and query predicates remain the first authorization layer.

### 2.2 Runtime identity diagnostics

PR #142 adds a non-secret identity query through the API's own pool. It reports login/effective role names, database name, elevated role flags and TLS state. Diagnostic failure is non-fatal and uses a fixed warning without printing connection details.

The PR #142 unit tests cover success, missing metadata and diagnostic failure. The PostgreSQL integration test added on 22 November exercises the query against a disposable PostgreSQL instance using distinct login and effective roles. The first exact-head CI run for this integration test is still in progress at this checkpoint; record its final result separately from live staging evidence.

The migration runner on PR #138 queries identity through the exact client that applies migrations. Its unit test covers metadata, no-row and query-failure behavior.

### 2.3 Read-only audit utility

The utility `apps/api/scripts/audit-db-access.ts` opens a transaction with `BEGIN READ ONLY` and reports role attributes, table/sequence/schema privileges, default ACLs, RLS coverage, function exposure, extension ownership and visible connection metadata. It does not read application rows or print the connection string.

PR #138 CI creates a separate `scs_audit` login with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE` and `NOINHERIT`, grants only database CONNECT, then runs the audit against disposable PostgreSQL 16. The job passed. The observed audit identity was `scs_audit`, with superuser/BYPASSRLS/role-creation/database-creation flags false. This demonstrates catalog inspection by a least-privilege audit login in CI; it is not evidence about the live Supabase or Render credentials.

The same CI migration job logged the migration runner identity as `scs` with superuser and BYPASSRLS privileges. That is the disposable CI migration fixture identity and must not be substituted for the staging migration identity.

### 2.4 Migration 0070

`infra/drizzle/migrations/0070_public_access_and_function_search_path_hardening.sql` revokes table and sequence privileges from `anon` and `authenticated`, adjusts default privileges for the role executing the migration, and pins `public.normalize_arabic(text)` to `pg_catalog`.

Migration 0070 deliberately does not enable RLS and does not change `service_role`. It is a separate privilege-hardening change. It must not be applied to a shared database until the actual migration owner and the expected default-ACL scope are verified.

## 3. Target database role model

The following is a proposed logical separation. Final role names, ownership and grants require the actual staging inventory and independent review.

- **Schema/migration owner:** owns application objects and applies reviewed DDL. It must not be the API runtime credential. Its login/role attributes and default-ACL scope must be explicit.
- **API runtime login:** a non-owner role with `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB` and `NOCREATEROLE`. It receives only the table, sequence and function privileges required by API behavior.
- **Worker identity:** preferably separated from the request-serving API identity if operational topology permits. If workers remain embedded in the API process, their database context and allowed operations must be explicit and independently tested.
- **Audit identity:** read-only catalog visibility sufficient to inspect security metadata, without application-row access or schema mutation. The CI `scs_audit` role is a test fixture, not a proposed production credential.
- **Supabase-managed roles:** `anon`, `authenticated`, `service_role`, `authenticator` and managed owner roles remain platform-managed. Do not change managed ownership or broad default ACLs without platform-owner approval.

The API should continue to authenticate users through the SCS identity/JWT model. Do not assume `auth.uid()` or PostgREST role switching is available to direct Drizzle connections.

## 4. Transaction-bound tenant context

### 4.1 Required behavior

For every authenticated HTTP operation that touches tenant-owned data:

1. Validate the SCS JWT and resolve `sub`, role and active organization server-side.
2. Begin a database transaction on one checked-out pool client.
3. Set transaction-local context using parameterized `set_config(name, value, true)` calls (or equivalent `SET LOCAL`). Candidate keys are `app.actor_id`, `app.actor_role`, `app.active_org_id` and `app.actor_kind`.
4. Execute every service query for that request through the same transaction-bound Drizzle handle.
5. Commit or roll back before releasing the client to the pool.

The third `set_config` argument must be `true`, so values are transaction-local and are automatically cleared by commit/rollback. Do not use session-level `SET` or `set_config(..., false)` for tenant identity.

A request-scoped object or AsyncLocalStorage may carry the transaction handle, but it is not sufficient by itself: services must actually use the transaction-bound handle rather than falling back to the global `DatabaseService.db`.

### 4.2 Non-HTTP execution paths

- Public/anonymous catalog reads need an explicit anonymous context with no actor or organization identity and narrowly defined public-read policies.
- Queue/outbox handlers, schedulers, webhooks and embedded workers need explicit service context and operation scopes. They must not inherit a previous HTTP request's tenant context.
- Audit middleware writes that happen after the response finishes must use a separate, explicitly scoped transaction. They must not depend on a request transaction that has already committed.
- Bootstrap and migration paths use their own reviewed identities and must not be routed through tenant-user policies by accident.

### 4.3 Failure behavior

- Missing actor/organization context must fail closed for tenant-owned rows.
- Context must be established after BEGIN and before the first application query.
- Any error must roll back and release the same client.
- Pool-reuse tests must prove that a transaction for Tenant A cannot leak context to the next transaction for Tenant B or an anonymous caller.
- No policy may trust client-supplied organization headers or an unverified JWT claim.

Custom GUCs are a useful defense against accidental query omissions, but values set by the API login can be changed by code running under that same login. RLS therefore complements, rather than replaces, SQL-injection prevention, parameterization, least privilege and application authorization.

## 5. Initial ownership classification

This is an initial module-level inventory based on the Drizzle schema and inspected tenant-scope helpers. It is not yet the complete 116-table access matrix. Each table still needs operation-by-operation route, worker and ownership-path evidence before a policy is approved.

- **Identity and organization:** `users`, `sessions`, `device_credentials`, `credential_audit_log`, `account_link_log`, `organizations`, `organization_members` and `organization_update_requests`. Candidate ownership is user ID or organization ID; authentication/session records are private to the subject user and platform security workflows.
- **Merchant and store:** `stores` are organization-owned; `warehouses`, `store_members`, shipping methods and delivery zones are store-owned; business documents and verification requests carry organization/store ownership and may contain restricted evidence.
- **Catalog and offers:** products and merchant offers are store-owned; variants and media inherit product ownership; import jobs are store-owned and chunks/errors inherit the import job. Categories, brands, product types, attribute definitions/options/groups and taxonomy mappings need an explicit shared-versus-store-owned decision; do not infer public writability from public read visibility.
- **Inventory and pricing:** inventory items inherit warehouse/store ownership; stock movements inherit inventory-item ownership. Price lists are store-owned and tiers inherit the price list. Promotions are store-owned; redemptions inherit promotion/order ownership and also reference the user.
- **Cart and orders:** carts are user-owned; cart items inherit cart ownership and are also bound to a store/offer. Master orders are buyer-owned; sub-orders are jointly visible to the buyer and the fulfilling store organization. Order items, financial breakdowns and status history inherit the parent order's access rules.
- **Payments and financial records:** payment records/refunds inherit order and buyer ownership; payment events inherit payment-record ownership. Settlement records are store/merchant financial records. Settlement adjustments, approvals, reconciliation runs and discrepancies require explicit organization, finance-role and dual-approval predicates.
- **Shipping and delivery:** shipments inherit order/store access; shipment events, labels and delivery proofs inherit shipment access. Driver profiles and carrier credentials/configuration have organization/store scope. Carrier webhook payloads and raw event data are operationally sensitive and should be worker/admin-only.
- **Reviews and support:** reviews have reviewer and subject visibility rules; disputes inherit order participants and resolution roles; conversations are participant-owned; messages inherit conversation membership.
- **Notifications and analytics:** notifications, preferences and device tokens are user-owned. Analytics events may be user- and organization-associated and require aggregation/privacy rules before buyer/merchant access.
- **Audit and operations:** audit logs inherit actor/organization and resource restrictions; outbox events and worker leases are operational service data; operations controls are platform-admin-only; organization-scoped alerts and pilot allowlists need separate admin/worker predicates.
- **Platform/system data:** RBAC roles/permissions, bootstrap authorizations, global feature flags, shared taxonomy and business calendars require explicit platform-admin/service policies. They must not be swept into a generic tenant policy.

## 6. Required table-by-table access matrix

For every physical table (including tables not exported through the Drizzle schema barrel), record:

- owning module and whether the table is application, platform, extension or migration/system data;
- direct owner columns and indirect foreign-key ownership path;
- every API route and service operation that reads, inserts, updates or deletes it;
- worker, webhook, scheduler, bootstrap and migration access paths;
- public/anonymous read requirements, if any;
- buyer, merchant-owner, merchant-staff, finance and platform-admin row predicates;
- whether a row is immutable/audited or contains secrets, payment, identity or operational payloads;
- foreign-key cascade behavior, views, functions, triggers, sequences and partition behavior;
- required SQL privileges separately from row policies;
- positive and negative PostgreSQL tests for every role and operation.

The final matrix must cover all 116 tables observed in the 19 November live inventory plus any additional tables discovered by the refreshed inventory. The 116 count is a historical live observation, not a current count guarantee.

## 7. Required isolated PostgreSQL acceptance tests

Before any staging RLS change, tests must use an API role that is not an owner and has no superuser or BYPASSRLS capability.

Required cases:

1. Tenant A can access its own organization/store rows and cannot read or mutate Tenant B rows.
2. A buyer can access only their own cart, orders, payment/return records and allowed public catalog rows.
3. Merchant owner/staff access is restricted by both organization and active store membership where the application model requires it.
4. Public reads expose only explicitly approved ACTIVE catalog/store projections.
5. Missing context, malformed context and unknown roles return no tenant-owned rows and cannot write them.
6. A transaction for Tenant A followed by Tenant B on a reused pool connection proves no context leakage.
7. Rollback and thrown exceptions clear transaction-local settings.
8. Worker, outbox, webhook, audit, bootstrap and migration paths have explicit operation-specific access.
9. Views, functions, sequences, partitions, default ACLs and foreign-key cascades do not bypass the intended policy.
10. Existing application integration suites pass with the non-owner API role and RLS enabled in the isolated test database.

## 8. Rollout gates

1. Complete and independently review the 116+ table operation/ownership matrix.
2. Obtain actual API and migration identity evidence through the protected release path. CI identities are not substitutes.
3. Implement and test the transaction-bound context mechanism without enabling RLS.
4. Prove application compatibility under the proposed non-owner API role and minimal grants.
5. Enable policies in isolated PostgreSQL and pass positive/negative role tests, pool-reuse tests and all API integration suites.
6. Review migration ordering, rollback/recovery, extension/function ownership and service-worker paths.
7. Obtain explicit staging authorization and a controlled maintenance/release window.
8. Apply only the reviewed migration set, verify access audit and application health, then decide whether to proceed to further table groups.

## 9. Current blockers and explicit non-actions

- PR #138 and PR #142 remain draft and unmerged.
- PR #138 CI proves the migration and audit workflow against disposable PostgreSQL only.
- PR #142 CI proves the API identity query and its unit/integration tests against disposable PostgreSQL only.
- The staging Render service remains on `develop` with auto-deploy disabled. No diagnostic startup output from the remediation branch exists in staging.
- The protected `workflow_dispatch` database audit is not available until the workflow revision is present on the default branch and the staging environment approval is granted.
- The connected Supabase Management API `postgres` identity is not the API or migration runtime identity.
- No staging deployment, environment change, shared database write, migration 0070 application, grant/default-ACL mutation, RLS enablement or worker activation is performed or authorized by this design.

## 10. Next implementation sequence

1. Finish PR #142's real-PostgreSQL identity query test and verify its exact-head CI.
2. Keep the API/migration identity diagnostics as separate evidence streams.
3. Expand the schema inventory into the required operation/ownership matrix, starting with identity, merchant/store, catalog/offers, inventory/pricing and orders/financial tables.
4. Design the transaction-bound Drizzle context and worker context contracts, then implement them behind tests before adding policies.
5. Obtain independent review of the role model, context mechanism and first policy group before any staging release or shared-database change.
