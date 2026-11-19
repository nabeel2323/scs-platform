# SCS Platform — Audit-Driven Remediation & Testability Implementation Plan

| Field                    | Value                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| Document type            | Authoritative remediation implementation plan                                                            |
| Version                  | 1.0                                                                                                      |
| Created                  | 18 November 2026                                                                                         |
| Baseline                 | Comprehensive readiness audit dated 18 November 2026                                                     |
| Repository               | `nabeel2323/scs-platform`                                                                                |
| Baseline branch / commit | `develop` / `9f5bc397467dc92cdc8debd54797b6d730659c36`                                                   |
| Runtime evidence         | Render staging addendum, 18 November 2026                                                                |
| Status                   | IN PROGRESS — P0/P1 remediation is underway on PR #138                                                   |
| Companion                | [Implementation Progress Tracker](./IMPLEMENTATION-PROGRESS.md)                                          |
| Active branch / PR       | `remediation/phase-0-1-tenant-security` / [PR #138](https://github.com/nabeel2323/scs-platform/pull/138) |
| Supersedes               | Remediation sequencing only; historical milestone records remain intact                                  |

> **Purpose.** Close the evidenced readiness gaps in the order that makes the platform safe and practical to test as early as possible. Keep implementation moving with small automated checks, avoid repeated manual end-to-end testing after every fix, and perform one comprehensive release-candidate test campaign after all planned remediation is complete.
>
> **Execution snapshot — 19 November 2026:** CI #714 passed every executed GitHub Actions job on current PR head `5b0670a327a70f553e69175ec2d0a6e981244039`: lint/typecheck/format, Flutter analysis/tests, API unit/coverage (4,452 passed; 110 skipped across 227 files), API integration, boundary lint E6, full migration apply on isolated CI PostgreSQL, web/admin tests, contract/codegen, production build and container build/smoke. k6 smoke and staging release were skipped by workflow conditions; no deployment occurred. G-011 remains CLOSED from CI #647; G-028 remains CLOSED from CI #647; G-029 remains CLOSED from CI #592. G-003, G-004, G-005 and G-008 are CLOSED with CI evidence. G-006 implementation is CI-verified from CI #703, with explicit stale-offer/concurrency acceptance review still open. G-007 mobile checkout implementation is CI-verified by CI #711; full journey UAT remains reserved for Phase 6. G-002 remains partial pending effective API/migration DB-role verification. No live database migration, staging write or deployment was performed.

---

## 1. Executive direction

The current codebase contains substantial marketplace functionality across the NestJS API, buyer/merchant web application, admin console, Flutter mobile application, PostgreSQL/Supabase and Render staging. The November audit nevertheless concludes **NOT READY** for production.

The remediation programme is not a rewrite and does not restart the old Phase 0–7 product roadmap. It is a focused stabilization and release-readiness programme against the current codebase and the 22 findings in the audit register.

### 1.1 Primary outcomes

1. Close the P0 cross-merchant authorization vulnerability and establish a verified database access model.
2. Make core commercial data truthful: the seller/offer displayed is the seller/offer added to cart; quantity rules are enforced; currencies and tax are represented correctly; unsupported payment methods are rejected.
3. Make asynchronous order/shipping/return processing reliable and observable, including explicit worker ownership, leases, alerting and safe activation.
4. Make buyer, merchant and admin workflows coherent across web, mobile and API for the agreed release scope.
5. Establish repeatable deployment, migration, recovery, CI and documentation controls.
6. After all fixes are integrated, execute one coordinated full test campaign against a controlled staging release candidate and make a documented go/no-go decision.

### 1.2 Testing philosophy — fast feedback, one full campaign

The user does not want to spend time manually retesting the whole platform after each fix. The programme therefore uses three deliberately different levels:

| Level                            | When                                                                                | Required activity                                                                                                                                              | Manual user effort                                      |
| -------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A — change-local checks          | During each implementation task                                                     | Focused unit tests, affected integration tests, type-check/build/lint as applicable, migration validation                                                      | None expected                                           |
| B — integration checkpoints      | At phase boundaries and dependency handoffs                                         | Automated API/database/worker contract checks; one staging health/readiness check when a deployment is authorized                                              | Only if a product decision or access approval is needed |
| C — comprehensive final campaign | Once, after all planned fixes are implemented and merged into the release candidate | Full automated suites, browser journeys, mobile integration, tenant isolation, concurrency, migration/recovery, provider sandbox, performance and business UAT | One consolidated review of results and exceptions       |

**Important:** “One full test at the end” does not mean shipping untested changes. Each fix must have a narrow automated regression check that proves the defect it changes is corrected. We will not ask the user to repeat long manual test scripts for every individual fix. Full journey testing is intentionally consolidated into the final campaign.

No phase is considered complete merely because code was changed or a build is green. It must satisfy its written acceptance criteria and attach evidence to the progress tracker.

---

## 2. Baseline and evidence rules

### 2.1 Audited gap register

The authoritative starting gap IDs are those in the November comprehensive readiness audit:

| ID    | Priority | Area                              | Finding                                                                                                                                              |
| ----- | -------: | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-001 |       P0 | Security                          | Merchant offer list/analytics lack tenant authorization                                                                                              |
| G-002 |       P1 | Database/security                 | RLS disabled on public tables; excessive anon/auth grants                                                                                            |
| G-003 |       P1 | Shipping/reliability              | Generic outbox dispatcher competes with carrier worker                                                                                               |
| G-004 |       P1 | Catalog/commerce                  | Search card displays lowest offer but adds owning store without offerId                                                                              |
| G-005 |       P1 | Checkout/finance                  | Web checkout combines different currencies into one SAR-formatted estimate                                                                           |
| G-006 |       P1 | Catalog/commerce                  | Offer orderIncrement is persisted but not enforced                                                                                                   |
| G-007 |       P1 | Mobile/checkout                   | Mobile checkout omits per-store shipping and payment selection; VAT disclosure conflicts with API                                                    |
| G-008 |       P1 | Payments                          | API accepts DIGITAL but registry has only manual provider                                                                                            |
| G-009 |       P2 | Notifications                     | General SMS, FCM and WhatsApp channels are stubs but mark SENT                                                                                       |
| G-010 |       P2 | Shipping                          | Carrier label event handler is a no-op                                                                                                               |
| G-011 |       P2 | Orders/workers                    | AutoCompleteWorker claim does not remove row from eligibility                                                                                        |
| G-012 |       P2 | Payments/finance                  | Payments are manual; no automatic gateway or payout transfer                                                                                         |
| G-013 |       P2 | Database/performance              | 55 foreign-key constraints lack covering indexes                                                                                                     |
| G-014 |       P2 | CI/CD                             | develop branch is unprotected; no repository rulesets                                                                                                |
| G-015 |       P2 | CI/CD                             | Formatting and boundary lint are non-blocking/miswired                                                                                               |
| G-016 |       P2 | Repository hygiene                | Large tracked .m73b6-scratch context tree                                                                                                            |
| G-017 |       P2 | Repository hygiene/security       | JWT-shaped test artifact committed twice                                                                                                             |
| G-018 |       P2 | Documentation                     | Architecture and readiness documentation has mixed-age baselines                                                                                     |
| G-019 |       P2 | Mobile/promotions                 | Applied promo cannot be removed from mobile cart                                                                                                     |
| G-020 |       P2 | Database/security                 | normalize_arabic has mutable search_path                                                                                                             |
| G-021 |       P3 | Procurement                       | Formal RFQ / quotation / purchase-order workflow absent                                                                                              |
| G-022 |       P3 | Database                          | pg_trgm extension installed in public schema                                                                                                         |
| G-023 |       P1 | Merchant onboarding               | Store creation omits initial OWNER store_members row, locking the creator out of store membership administration and store-scoped workflows          |
| G-024 |       P1 | Catalog requests/security         | Merchant catalog request reads/writes are not consistently scoped to active store membership; requester/reviewer identities are client-controlled    |
| G-025 |       P1 | Merchant store/warehouse security | Store and warehouse endpoints do not consistently bind the target object to the caller's active store membership                                     |
| G-026 |       P1 | Pricing/security                  | Price-list and tier endpoints lack object-level store authorization and can mix variants with another store's price list                             |
| G-027 |       P1 | Inventory/security                | Inventory routes enforce organization scope in several paths but omit active store membership; low-stock listing spans all stores in an organization |
| G-028 |       P1 | Catalog/public-read boundary      | Buyer-facing product reads can return non-ACTIVE products unless the client voluntarily supplies an ACTIVE filter                                    |
| G-029 |       P1 | Catalog mutation/security         | Bulk product actions accept a caller-supplied storeId without verifying active membership in that store                                              |

The audit classifies the register as 1 P0, 7 P1, 12 P2 and 2 P3 findings. These IDs are stable references; if implementation discovers a wider root cause, record linked sub-findings rather than silently rewriting the original finding.

### 2.2 Runtime evidence that changes the order

The Render staging addendum observed:

- `scs-api-staging` is live on `develop`, but auto-deploy is disabled. New commits do not automatically reach staging.
- Health checks for `/v1/readyz` returned HTTP 200 after deployment.
- OTP email is the permitted channel; Resend is configured. Historical provider sample showed 12 accepted sends and 3 SMTP timeouts; provider acceptance does not prove inbox delivery.
- No plaintext OTP was identified in the bounded provider-log sample reviewed. Source comments/tests include redaction protections, but all possible logging paths are not forensically cleared.
- OutboxDispatcher and ShippingCarrierWorker both register in the API process. The source-level event ownership conflict remains open.
- ReturnExpirationWorker explicitly did not start protected P13 jobs because `P13_WORKER_ENABLED` was not set, as inferred from startup logs. The exact environment value was not inspected.
- A prior critical P13 worker-count anomaly was logged while no alert sink was configured.
- No authenticated buyer/merchant transaction, cross-tenant exploit test, or external provider dashboard verification was performed. A backup/restore drill is intentionally outside the current development-remediation scope per user direction.

These observations make worker ownership, deployment safety and a controlled staging test harness prerequisites. Do not infer that the service is safe for business writes merely because readiness is green.

### 2.3 Database and OTP evidence qualifications

- The audit report and subsequent database-check note report different public-table counts (114 vs 111). Reconcile against the live schema snapshot and migration ledger before writing a grant/RLS migration.
- The database note reports no `SECURITY DEFINER` functions and no `BYPASSRLS` on anon/authenticated roles; the service role is privileged as expected in some Supabase architectures. This does not eliminate the need to establish the API's actual database identity and least-privilege contract.
- A project note records an earlier plaintext-OTP concern, while the latest bounded Render investigation found no plaintext OTP in the sampled provider logs. Treat this as a **verification requirement**, not a proven current leak or a proven complete fix. Inspect all logging and exception paths, retain redaction tests, and never generate OTP test traffic against production.

### 2.4 Evidence labels

Use these labels in every phase report:

- **SOURCE VERIFIED** — current code/schema/config inspected.
- **TEST VERIFIED** — named automated test executed and result recorded.
- **STAGING VERIFIED** — authorized staging behavior observed against the stated deployment SHA.
- **PROVIDER VERIFIED** — provider sandbox/dashboard evidence proves the provider operation; accepted API request alone is not delivery.
- **NOT VERIFIED** — no adequate evidence; never convert absence of an error into success.
- **BLOCKED** — dependency, authorization, decision or environment prevents completion.

All evidence must identify branch/commit, command or test name, environment, date/time and result. Redact secrets, customer data, OTPs and tokens.

### 2.5 Initial baseline reconciliation — 18 November 2026

- Current `develop` HEAD at the start of implementation: `3f7268dbc75828190f16165ca7e8dd4e315c421c`.
- Compared with audited source baseline `9f5bc397467dc92cdc8debd54797b6d730659c36`, `develop` is 7 commits ahead and 0 behind. The comparison shows only README, the audit report and the two remediation documents changed; no application source files changed after the audit baseline. The audited code findings therefore remain the correct starting source snapshot, subject to revalidation during each fix.
- New implementation branch: `remediation/phase-0-1-tenant-security`, created from the current `develop` head.
- Supabase project inspected: `SCS-PlatForm` (`wplsxxevoevzqbgtpctw`), PostgreSQL 17.6.1.166, region `eu-west-1`, status ACTIVE_HEALTHY.
- Live public-schema inventory: **114/114 tables owned by postgres; 0/114 have RLS enabled**.
- Effective table privileges: `anon` and `authenticated` have **zero SELECT/INSERT/UPDATE/DELETE privileges on all 114 tables**. They do, however, each hold `TRUNCATE`, `REFERENCES` and `TRIGGER` on all 114 tables (684 grant rows combined). `service_role` has the same three privileges, but no DML privileges in this inventory.
- Default privileges for objects created by `postgres` in `public` also grant `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` to `anon`, `authenticated` and `service_role` on future tables created by that role. This means the excessive grants can recur on future tables created by that role. A separate default ACL owned by `supabase_admin` grants all table privileges to the API roles; do not alter that Supabase-managed ACL until object ownership and migration execution paths are fully understood.
- The application database service uses `DATABASE_URL` through node-postgres/Drizzle, not a Supabase client SDK. The live `pg_stat_activity` sample did not show a clearly identifiable active Render API session, so the actual deployed API database username remains **NOT VERIFIED**. Do not assume it from the sample.
- The custom application migration runner uses `public._migration_log`: 69 migration rows were present, latest applied at `2026-11-17 16:07:23 UTC`. Supabase's `list_migrations` returned an empty list, so it is not the authoritative migration ledger for this application.
- `public.normalize_arabic(text)` is owned by postgres, is not SECURITY DEFINER, and has no function-level `search_path` configuration. Supabase Security Advisor reports `function_search_path_mutable`.
- `pg_trgm` is installed in `public`; Supabase Security Advisor reports `extension_in_public`.
- G-001 is reproduced in source: the three merchant offer list/analytics controller routes accept caller-supplied `storeId` and query the service without forwarding or validating the authenticated caller. Their service methods query the supplied store directly.
- **New finding G-023 (P1):** `MerchantService.createStore` inserted the store and emitted an outbox event but did not insert an initial `store_members` OWNER row. The normal membership-management endpoints require an existing active OWNER/ADMIN membership, so a newly created store could be locked out of self-service member administration until a platform administrator intervened. Migration 0054 only backfills stores that existed when it ran. The remediation now inserts the store, ACTIVE OWNER membership and creation outbox event in one transaction; focused tests passed in CI run #536.
- **G-003 consumer collision:** `OutboxDispatcher` excludes `shipping.carrier.%`; `ShippingCarrierWorker` claims only that prefix with `FOR UPDATE SKIP LOCKED`; stale-lease recovery is carrier-prefix scoped; unsupported carrier event types retry/dead-letter rather than being acknowledged. The persisted-event PostgreSQL integration test invokes both production pollers and verifies disjoint carrier/non-carrier ownership. This proof and the worker retry tests passed CI #687; G-003 is CLOSED. See [OUTBOX-EVENT-OWNERSHIP-MAP.md](./OUTBOX-EVENT-OWNERSHIP-MAP.md).
- Current API scripts include root `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm boundary-lint`; API scripts include `pnpm --filter @scs/api test:unit`, `test:integration`, `typecheck`, `build`. CI run #536 passed all jobs, including API unit/coverage, integration, migration assertions, web/admin, Flutter, build and container smoke. Formatting remains advisory (`continue-on-error: true`). The E6 job was corrected to invoke the actual root `pnpm boundary-lint` command; it remains advisory until known boundary violations are resolved.

These are live read-only observations, not a migration or configuration change. The exact API DB role, complete schema-to-route access matrix, and the Supabase-managed default ACL implications remain open verification items.

---

## 3. Sequencing strategy and dependency graph

The implementation order is based on four questions:

1. What could expose another tenant's data or corrupt business/financial state?
2. What must be reliable before realistic buyer/merchant test flows can run?
3. What can be implemented in parallel without destabilizing shared foundations?
4. What is genuinely required for the agreed first release versus a later product expansion?

### 3.1 Phase sequence

| Order | Phase                                                   | Priority              | Main outcome                                                                                | Blocks                                 |
| ----: | ------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
|     0 | Baseline reconciliation & testability foundation        | Critical prerequisite | Reproducible local/test environment, safe staging procedure, reliable evidence baseline     | All implementation phases              |
|     1 | Tenant security & database access safety                | P0/P1                 | Secure merchant data boundaries and verified DB role/grant model                            | Any authenticated business testing     |
|     2 | Commercial correctness & checkout contract              | P1                    | Correct seller attribution, quantity, currency, payment-method and tax/fulfillment behavior | Buyer/merchant transaction testing     |
|     3 | Event, worker & fulfillment reliability                 | P1/P2                 | No lost carrier events, durable worker claims, safe P13 activation and alerting             | Shipping/returns/order lifecycle tests |
|     4 | Client workflow parity & truthful notifications         | P2                    | Web/mobile/API parity for agreed buyer/merchant flows; no false delivery states             | Complete user-journey testing          |
|     5 | Operational hardening, CI, data hygiene & documentation | P2/P3                 | Safe releases, recovery evidence, blocking quality gates and maintainable docs              | Final release candidate                |
|     6 | Consolidated full verification & release decision       | Release gate          | One comprehensive test campaign and evidence-based go/no-go                                 | Production authorization               |

### 3.2 Critical dependency graph

```text
Phase 0 — Baseline + test harness + deployment safety
                         |
                         v
Phase 1 — Tenant authorization + DB access model
                         |
                         v
Phase 2 — Seller/offer + quantity + currency + payment/tax correctness
                         |
             +-----------+-----------+
             |                       |
             v                       v
Phase 3 — Outbox/workers       Phase 4 — Web/mobile parity
             |                       |
             +-----------+-----------+
                         |
                         v
Phase 5 — CI/operations/docs/recovery hardening
                         |
                         v
Phase 6 — Full release-candidate verification
```

Phase 3 and non-conflicting Phase 4 tasks may proceed in parallel after Phase 2's shared contracts are agreed. Do not parallelize competing changes to the same order/checkout contract, outbox schema, worker lease model or database permission model without an explicit owner and integration plan.

---

## 4. Phase 0 — Baseline reconciliation & testability foundation

**Priority:** Critical prerequisite  
**Purpose:** Establish a safe, repeatable way to implement and later test fixes without repeatedly asking the user to troubleshoot the environment.

### Work packages

**0.1 Reconcile the current repository baseline**

- Record current `develop` HEAD and compare it with the audit commit `9f5bc397...`.
- Re-check whether the 22 findings still reproduce on current HEAD before editing each affected area.
- Identify existing fixes, later regressions, duplicate work and migrations already applied.
- Reconcile the older September implementation documents with the November audit. Preserve historical milestone evidence; mark obsolete status claims as historical, not current readiness.
- Record exact app/package commands from the current manifests rather than assuming the old plan's commands remain accurate.

**0.2 Establish a test execution matrix**

- Inventory existing API unit/integration tests, web/admin tests, Flutter tests, database migration tests, CI workflows and staging smoke checks.
- Identify which suites require Docker/Testcontainers, Supabase, secrets, provider sandboxes or device/emulator infrastructure.
- Create a deterministic test-data strategy with isolated buyer, merchant A, merchant B, merchant staff, admin and unauthorized identities.
- Ensure tests use generated credentials/tokens and never commit real or reusable tokens.
- Define the final full-suite command set and expected reports now, but defer the full campaign to Phase 6.

**0.3 Establish staging/deployment safety**

- Document the current Render service, branch, deploy SHA, health endpoint, auto-deploy-disabled behavior and manual deploy approval requirement.
- Verify startup migration and seed behavior from source and logs. Do not trigger a deployment during this phase without explicit authorization.
- Define pre-deploy checks: pending migration list, migration lock/compatibility review, deploy SHA, readiness and rollback/forward-fix procedure. Backup/restore exercises are deferred and are not a prerequisite for this development-remediation cycle.
- Define how workers are disabled/enabled safely per environment. Do not turn on P13 or other financial workers just to make a test pass.
- Add a runbook for test data creation/cleanup and a hard separation between staging and production.

**0.4 Focused security evidence preparation**

- Inventory all route-level tenant guards and database connection roles used by the API.
- Trace OTP generation, persistence, delivery and every logger/exception path. Do not send OTPs in this phase.
- Capture baseline DB schema/table count, grants, RLS flags, policies, functions, extensions and migration ledger.

### Acceptance criteria

- Current baseline commit and all known findings are reconciled into the tracker.
- Test matrix lists executable commands, prerequisites and owners for API, web, admin, mobile and DB.
- Safe staging/deploy/migration procedure is documented.
- Test identities and fixtures are isolated and repeatable.
- Backup/restore drill remains deferred until a separate pre-production decision.
- Database and OTP evidence discrepancies are explicitly resolved or recorded as blockers.
- No production data writes, staging business transactions, worker activation or deploy is performed as part of read-only discovery.

### Deliverables

- Baseline reconciliation note.
- Test matrix and final campaign manifest.
- Staging deployment/migration runbook (excluding backup/restore exercise, deferred).
- Security and database access inventory.

---

## 5. Phase 1 — Tenant security & database access safety

**Priority:** P0 / P1  
**Release significance:** This phase establishes the minimum safe platform boundary for authenticated testing.

### 1.1 Close G-001 — merchant offer authorization (P0)

- Trace `GET /v1/merchant/offers`, `/analytics`, `/analytics/trend` and every related controller/service/query.
- Derive store/organization scope from authenticated membership, not a caller-supplied store ID alone.
- Verify owner, manager/staff roles, active organization, revoked membership, inactive store and admin exception behavior.
- Apply consistent object-level authorization to list, detail, analytics, exports and mutations where relevant.
- Avoid leaking whether a foreign store or offer exists; choose consistent 403/404 behavior based on the established API policy.
- Audit adjacent `storeId`/`orgId` read endpoints for the same pattern; add linked findings for newly discovered omissions.

**Acceptance:** foreign merchant IDs cannot return offer, pricing, sales or analytics data; authorized merchant access remains functional; route-level tests cover owner, staff, same-tenant unauthorized role, buyer, foreign merchant and admin policy.

### 1.2 Close G-002 — database privileges and RLS architecture

- Identify the exact runtime DB role used by the API, migrations, admin tools and any client-side Supabase access.
- Classify every table: server-private, tenant-scoped, public-read, intentionally client-accessible, audit/financial sensitive, queue/system.
- Reconcile 111 vs 114 table counts against the current live schema and migration ledger.
- Inventory table, sequence, schema, function and default privileges for anon/authenticated/service roles.
- Remove only privileges proven unnecessary and compatible with the actual API connection model.
- Design table-specific RLS policies only for tables accessed through roles subject to RLS. Do not blindly enable RLS on every table or accidentally block the backend.
- Ensure service-role credentials remain server-only and never appear in web/mobile bundles.
- Add negative tests for direct client access where supported, and HTTP-level tenant tests for API-mediated access.
- Include rollback/forward-fix strategy and staging verification before production migration.

**Acceptance:** least-privilege matrix reviewed; no unintended client privilege remains; RLS is enabled/policy-tested where required by the access architecture; backend paths continue to work; cross-tenant reads/writes are denied at the appropriate layer.

### 1.3 Close G-020 — normalize_arabic search_path

- Inspect function owner, schema, callers, extension dependencies and privileges.
- Set a safe explicit search_path or schema-qualify references in a reviewed migration.
- Verify behavior and function resolution under the real application roles.

**Acceptance:** function cannot be redirected through an attacker-controlled schema; Arabic search normalization regression tests pass.

### 1.4 OTP logging and secret hygiene safeguard

- Resolve the earlier OTP plaintext report against current source and a bounded authorized staging log sample.
- Redact OTP values, full email/phone identifiers, authorization headers, cookies and provider secrets on both success and failure/exception paths.
- Confirm error serialization does not leak provider payloads or verification secrets.
- Keep explicit tests that fail if OTP values or sensitive identifiers are logged.
- Do not include real OTPs, bearer tokens or API keys in evidence.

**Acceptance:** source and tests demonstrate redaction across all identified paths; a bounded staging check finds no sensitive values in relevant logs. If evidence is unavailable, mark NOT VERIFIED.

### 1.5 Close G-023 — create the initial store owner atomically

- On successful store creation, insert the store, its creator's ACTIVE OWNER row in `store_members`, and the `merchant.store.created` outbox event in one database transaction.
- Preserve the existing organization membership check and generated store identity.
- Ensure outbox failure aborts the transaction so no partially created store or missing owner relationship remains.
- Add regression tests proving the owner row is written for the same store and that the outbox event uses the same transaction.

**Acceptance:** every newly created store has exactly one active OWNER membership for its creator; the owner can use store-scoped merchant routes and manage store members; the store, owner row and outbox event are atomic.

### 1.6 Adjacent tenant-scope findings discovered during P1-04

The source audit linked to G-001 identified additional object-level authorization gaps. The detailed endpoint inventory and evidence are recorded in [P1-04 Adjacent Tenant-Scope Audit](./P1-04-ADJACENT-TENANT-SCOPE-AUDIT.md).

- **G-024 — Catalog requests:** scope merchant request listing and creation to the authenticated user's active store membership. Derive requester and reviewer identities from the JWT, never from request bodies.
- **G-025 — Store/warehouse management:** check both active-organization ownership and active store membership before store updates, warehouse creation/listing/updates, and store verification submission.
- **G-026 — Pricing:** scope price-list and tier reads/writes to the owning store; verify that a tier's variant belongs to the same store as its price list.
- **G-027 — Inventory:** extend store-membership checks through warehouse, variant and inventory-item access paths; restrict unqualified low-stock reads to stores where the caller is an active member.
- **G-028 — Product read boundary:** preserve buyer access to ACTIVE products while requiring owning-store membership for non-ACTIVE product details, variants, media and variant matrices. Store grids, canonical category listings/counts, identifier matching and canonical selector search must enforce ACTIVE + platform-level canonical scope server-side; do not rely on client-supplied filters.
- **G-029 — Bulk catalog mutation:** require active store membership before bulk delete/archive/draft operations.

**Implementation status:** G-024–G-026 passed focused unit/coverage CI #551; G-027 passed all jobs in CI #554. G-028 passed 19 focused publication-boundary tests and full applicable API suites in CI #647; G-029 passed its focused tests in CI #592. G-003 production-poller ownership integration and worker refinements passed CI #687. No staging deploy or live database migration has been performed.

### 1.7 Close G-030 — merchant payment and settlement listing tenant isolation (P0)

A source audit found that merchant payment and settlement listing routes did not enforce the authenticated caller's active organization scope. The previous `listPayments` implementation built store/buyer order filters but failed to apply them to the payment query, and merchant routes called unscoped list methods without passing caller context.

- Add dedicated merchant listing service methods that join payments/settlements through orders and stores, constrained to the caller's active organization. The seeded MERCHANT_OWNER and MERCHANT_STAFF roles have organization-wide `merchant:orders:read`; store_members is not the authorization boundary for this read capability.
- A caller-supplied `storeId` narrows the active-organization scope and must belong to that organization; it never grants cross-organization access.
- Pass the verified JWT caller context from both merchant controller routes.
- Correct the admin/service `listPayments` store/buyer filter path so matching order IDs are applied to the payment query.
- Add two-tenant PostgreSQL integration coverage for merchant A/B, same-org non-member, foreign store ID and admin filters, plus controller tests proving caller context is forwarded.

**Acceptance:** merchant A cannot list merchant B payments or settlements; same-organization users with the seeded merchant read permission remain scoped to their organization even without a store_members row; missing active organization is denied; foreign store IDs are denied; platform staff behavior remains intentional; store/buyer filters return only matching payments. Full CI and the real PostgreSQL integration suite must pass before closure.

**Current implementation state:** service/controller changes and PostgreSQL/controller regression tests are committed on the remediation branch; latest-head CI is pending. Do not treat this P0 as closed until the integration and unit suites pass.

### Phase 1 exit gate — AUTHORIZED BUSINESS TESTING

Only after the P0 is closed, G-023 is fixed, the DB access model is verified, and the test identities/fixtures are ready may controlled staging buyer/merchant write tests be considered. This is permission to begin limited testing, not production approval.

---

## 6. Phase 2 — Commercial correctness & checkout contract

**Priority:** P1  
**Purpose:** Make prices, seller identity, quantity, currency, payment method and tax/fulfillment terms consistent between the API and all clients.

### 2.1 Close G-004 — search offer attribution

- Establish one authoritative offer identity in search result DTOs.
- Display the seller/offer whose price is shown.
- Add to cart using that exact offer/store reference, or require explicit seller selection on product detail.
- Prevent fallback to a different store while retaining the displayed lowest price.
- Keep API validation authoritative; UI values are never trusted for price.

**Acceptance:** search display seller/offer, cart seller/offer, price snapshot and checkout seller are identical for selected line; tests include multiple sellers and stale/inactive offers.

### 2.2 Close G-006 — MOQ and orderIncrement

- **Business rule agreed:** a quantity is valid when `quantity >= MOQ` and `(quantity - MOQ) % orderIncrement === 0`; MOQ is the first permitted quantity and increments are measured from MOQ, not from zero.
- **Implemented on the remediation branch:** shared quantity validation is enforced for cart add/batch add, quantity updates, cart validation and checkout. Selected-offer price resolution also rejects quantities that violate the offer terms, preventing a pricing-path bypass.
- Checkout re-reads and locks the authoritative offer/variant terms inside its transaction before final validation; the cart update path rejects negative, fractional, non-finite and unsafe-integer quantities, while zero remains the explicit remove operation.
- Web and mobile quantity controls expose the MOQ/increment step. The product-card pricing response now exposes the selected offer's `orderIncrement`.
- Focused regression coverage was added for pricing rejection, invalid cart quantity updates and zero-as-remove semantics. Full CI #703 passed on commit `8b77243c3fc015bf19f66d0cd71b613398311a70`, including API unit/coverage, integration, lint/typecheck, web/admin, Flutter, migration apply, contract/codegen, build and container smoke.
- **Stale-term/lock regression coverage added:** unit tests simulate MOQ and orderIncrement changes after cart creation, verify checkout re-reads the updated offer inside its transaction using `FOR UPDATE`, and confirm rejection occurs before order insertion.
- **Remaining acceptance review:** this is a deterministic race-window/locking test, not a real multi-connection PostgreSQL contention test. Keep full competing cart-update/checkout concurrency stress verification in Phase 6 before claiming production concurrency proof.
- Validation currently uses the service's request-validation errors; do not describe them as a stable machine-readable error-code contract until that is explicitly implemented and tested.

**Acceptance:** valid/invalid MOQ boundaries and increment steps; authoritative offer-term changes after cart creation; checkout transaction re-read/locking; deterministic race-window regression test; full concurrent DB contention verification in Phase 6; consistent web/mobile controls.

### 2.3 Close G-005 — mixed-currency checkout

- **Implemented and verified in CI #687:** checkout groups item line totals by normalized currency and adds only the selected shipping method's fee in that method's own currency.
- Pickup adds no delivery fee. Missing item/shipping currencies mark the estimate incomplete; the UI does not silently fall back to SAR.
- A single estimated total is displayed only when all amounts have one known currency; mixed currencies are displayed as separate subtotals, without an invented FX conversion.
- Five focused tests cover same-currency totals, mixed supplier currencies, shipping-method currency, missing currency and pickup behavior.

**Acceptance:** two or more currencies never produce a misleading single total; same-currency totals remain correct; no unknown currency is silently formatted as SAR. Web/admin tests and lint/typecheck passed CI #687.

### 2.4 Close G-008 — unsupported DIGITAL payment

- **Implemented — CI verification pending:** define `SUPPORTED_PAYMENT_METHODS` from the actually registered manual-verification provider (`BANK_TRANSFER`, `CASH_ON_DELIVERY`, `VOUCHER`). Keep `DIGITAL` in the persisted `PAYMENT_METHODS` vocabulary only for historical rows and the existing database CHECK constraint.
- Reject unsupported methods in `OrdersService.checkout` before opening the order transaction, and repeat the guard in `PaymentsService.createPaymentInTransaction` before resolving a provider or inserting payment records.
- Buyer web/mobile choices remain aligned with the supported manual methods; the web DIGITAL option is disabled and mobile does not offer it.
- No migration is needed: the database constraint may continue to read historical DIGITAL values, while the API rejects new DIGITAL payment attempts.
- **Verified in CI #714:** focused tests prove DIGITAL remains only in persisted historical vocabulary, is absent from the supported whitelist, checkout rejects it before transaction entry, and PaymentsService rejects it before provider resolution/payment writes. Web disables the option and mobile omits it.
- If gateway scope is later approved, treat it as a separate architecture project: intent/auth/capture, signed webhooks, idempotency, reconciliation, refunds, failure recovery and provider sandbox verification.

**Acceptance — CLOSED in CI #714:** unsupported methods fail explicitly at checkout and payment-record creation; checkout does not start its transaction for DIGITAL, and PaymentsService does not resolve a provider or write a payment record. Existing DIGITAL rows remain readable under the persisted enum/check constraint.

### 2.5 Close the commercial portion of G-007 — mobile checkout contract

- **Implemented and CI-verified in CI #711:** mobile requests a shipping estimate per supplier, requires an explicit delivery/pickup selection per supplier, and submits the chosen supported payment method with checkout.
- Added `POST /v1/checkout/preview`, which reuses the backend checkout financial calculation for promotion discounts, authoritative shipping fees and configured VAT. Checkout revalidates and recalculates the totals before persistence; the preview is explicitly an estimate, not a reservation or payment.
- The shipping estimate response now exposes each method's actual `fulfillmentMethod`, so clients do not infer platform/merchant delivery from the method's display type.
- Mobile and web review screens display supplier-level item subtotal, discount, delivery fee, VAT and tax-inclusive total from the same API response. Order confirmation displays the persisted delivery and VAT values. Web's former VAT disclosure that omitted tax from the displayed totals was removed.
- When delivery estimates are unavailable, mobile/web preserve pickup as a safe option; delivery choices are shown only when the address is eligible.
- API client tests cover shipping estimate, preview payload and checkout selections; API preview tests cover server VAT/totals and missing per-store selection. CI #711 passed all executed jobs.
- **Remaining Phase 6 validation:** run the full browser/mobile buyer journey and verify order detail/tracking per-suborder fulfillment. Do not mark the full Phase 4 finding closed solely from component/unit CI.

**Acceptance:** mobile request and review screen reflect the exact choices and totals persisted by the API; no contradictory VAT disclosure; final server recalculation remains authoritative; Phase 6 journey UAT confirms order detail/tracking parity.

### Phase 2 exit gate

API contract, generated clients and web/mobile commercial calculations agree. Targeted tests cover each corrected rule. No full browser/mobile journey campaign yet.

---

## 7. Phase 3 — Event, worker & fulfillment reliability

**Priority:** P1 / P2  
**Purpose:** Prevent silent event loss, duplicate side effects and disabled/unguarded lifecycle jobs.

### 3.1 Close G-003 — outbox consumer ownership

- Define exactly one authoritative consumer/dispatcher for each event type.
- **Implemented:** generic dispatcher query excludes `shipping.carrier.%`; dedicated worker claims only that prefix with `FOR UPDATE SKIP LOCKED`; stale-lease recovery is scoped to the same prefix; unknown carrier events fail into retry/dead-letter handling.
- Source-level event family ownership map is documented in [OUTBOX-EVENT-OWNERSHIP-MAP.md](./OUTBOX-EVENT-OWNERSHIP-MAP.md). It distinguishes the generic log sink from domain side effects.
- Generic-dispatcher exclusion, carrier-only claim and stale-lease recovery, and unsupported-event retry behavior passed CI #687.
- PostgreSQL Testcontainers integration proof invokes both production pollers against persisted carrier/non-carrier events and verifies the generic dispatcher leaves carrier events pending while the carrier worker claims and retries the unsupported carrier event without acknowledging it.
- The claim-row SQL aliases explicitly map snake_case database fields to the camelCase properties consumed by the worker; the integration test verifies the real event type reaches retry classification.
- Preserve at-least-once delivery with idempotent consumers and durable state transitions.
- Add observability for pending age, attempts, terminal failures and queue lag.

**Acceptance:** integration test inserts representative event classes and proves exclusive poller ownership; carrier events cannot be acknowledged by the generic dispatcher; retry/dead-letter behavior is deterministic. This ownership acceptance is verified by CI #687. Provider label generation remains G-010 and is not closed by this finding.

### 3.2 Close G-010 — carrier label handler

- Connect worker handler to the existing provider label-generation implementation.
- Persist provider response, label reference/object metadata, tracking reference and shipment state atomically where possible.
- Handle provider timeout, duplicate event, retry and terminal failure safely.
- Verify sandbox behavior only with approved credentials; no live shipment should be created without explicit authorization.

**Acceptance:** successful label path, timeout/retry, duplicate delivery and terminal failure tests pass; provider evidence is clearly labeled sandbox/live.

### 3.3 Close G-011 — durable AutoCompleteWorker claim

- Replace timestamp-only claim behavior with a durable lease/processing state or atomic claim token.
- Define lease owner, expiry, heartbeat/reclaim and idempotent completion behavior.
- Test two or more worker instances racing with buyer confirmation and order status changes.

**Acceptance:** one logical completion; no duplicate financial/notification side effects; expired leases recover; worker concurrency tests pass.

### 3.4 P13 worker activation and alerting

- Inspect worker registration, feature/env flags, lease-holder model, expected holder count and deployment topology.
- Determine whether P13 workers should run inside the API process or as a separate worker service. Do not assume one Render instance proves correct topology.
- Define explicit staging and production activation values through reviewed configuration, not ad hoc changes.
- Configure a real alert sink and test delivery for worker-count anomalies, stale leases, queue backlog and repeated job failure.
- Keep protected financial/return jobs disabled until schema, idempotency, lease and alert gates are verified.
- Document startup logs and health/metrics that prove the intended worker topology.

**Acceptance:** expected holder count is explained and observed; alerts reach a tested sink; P13 jobs run only when intentionally enabled; multi-instance lease tests pass.

### Phase 3 exit gate

Carrier, outbox and order-worker processing are proven with automated integration/concurrency tests. No unresolved event ownership ambiguity. Protected P13 jobs have a documented and verified activation plan.

---

## 8. Phase 4 — Client workflow parity & truthful notifications

**Priority:** P2  
**Purpose:** Complete the agreed user-facing workflow without promising behavior the backend does not deliver.

### 4.1 Complete G-007 mobile parity

- **Implementation complete — CI #711 passed:** mobile collects per-supplier shipping/pickup choices, sends the selected payment method, and displays server-calculated supplier totals including discounts, delivery fees and VAT.
- Added API-backed checkout preview using the same pricing/financial helper as order creation; final checkout recalculates mutable terms before persisting.
- Added actual `fulfillmentMethod` to shipping estimate results and aligned web/mobile behavior, including pickup fallback when delivery estimates are unavailable.
- Mobile API tests cover estimate, preview and checkout request payloads. Flutter analysis/tests, API unit/coverage, API integration, web/admin, build, contract/codegen, migration and container smoke all passed CI #711.
- **Phase 6 UAT remains:** verify complete buyer journey, per-suborder order details and tracking; verify stale fee/method changes are communicated correctly.

### 4.2 Close G-019 — remove applied promotion on mobile

- Expose the supported remove-promotion operation in mobile client/UI.
- Keep cart recalculation authoritative on the API.
- Handle expired/invalid promo, partial cart changes and network retry.

### 4.3 Close G-009 — truthful notification status

- Keep in-app notification path distinct from external provider channels.
- For SMS, FCM and WhatsApp, either implement a real provider adapter with delivery-state semantics, retry/backoff and receipts, or mark the channel unavailable/not configured. Never mark a simulated provider operation SENT.
- Define what SENT, ACCEPTED, DELIVERED, FAILED and NOT_CONFIGURED mean.
- Add provider sandbox tests and ensure provider acceptance is not represented as inbox/device delivery.

### 4.4 Admin and merchant workflow verification

- Inspect all in-scope admin list/detail/create/edit/archive/review actions and ensure permissions match the API.
- Fix only gaps that prevent the agreed pilot workflows; create separate findings for additional missing screens.
- Verify error, empty, loading, permission-denied and destructive-action states.
- Keep UI work aligned with the existing design system and accessibility/RTL requirements.

### Phase 4 exit gate

The agreed buyer and merchant operations are supported across API/web/mobile with truthful status and error behavior. Automated focused tests pass; full journey UAT remains reserved for Phase 6.

---

## 9. Phase 5 — Operational hardening, CI, data hygiene & documentation

**Priority:** P2 / P3  
**Purpose:** Make the final release reproducible, reviewable and recoverable.

### 5.1 Close G-014 — branch protection

- Add repository rulesets/protection for develop and release branches.
- Require PR review and mandatory relevant CI checks; block force-push/deletion.
- Confirm branch policy does not prevent authorized emergency recovery.

### 5.2 Close G-015 — blocking quality gates

- **Implemented (awaiting latest-head CI):** boundary-lint workflow invokes the actual root `pnpm boundary-lint` script rather than API ESLint.
- Remove `continue-on-error` from formatting and architecture checks after existing violations are addressed.
- Ensure CI reports the real command, scope and exit code.
- Keep fast affected-package checks on PRs; schedule/trigger full suites at the release candidate.

### 5.3 Close G-016 and G-017 — repository hygiene

- Classify the tracked `.m73b6-scratch` tree and determine which artifacts are legitimate audit evidence.
- Scan for secrets, tokens, customer data and duplicated source snapshots.
- Remove unnecessary tracked artifacts and add ignore rules.
- Verify JWT-shaped test artifact provenance; remove it and duplicates if not required. If any real credential was ever exposed, rotate/revoke through the proper owner process.
- Do not rewrite shared history without an agreed repository recovery procedure.

### 5.4 Close G-018 — documentation baseline

- Mark old September roadmap statuses as historical.
- Keep this remediation plan and progress tracker authoritative for current gap closure.
- Update API, admin, merchant, buyer, mobile, deployment, migration, permissions, worker, backup/restore and troubleshooting docs alongside relevant implementation.
- Documentation must describe implemented and verified behavior, include version/commit metadata and avoid aspirational claims.

### 5.5 Close G-013 — FK indexes

- Use workload evidence, query plans and lock/maintenance cost to prioritize the 55 unindexed foreign keys.
- Add only justified indexes, preferably in safe batches/concurrent index strategy where supported by the migration system.
- Measure before/after plans and ensure migration rollback/forward-fix strategy.

### 5.6 Close G-022 — extension schema

- Review `pg_trgm` schema placement, dependencies, function/operator resolution and Supabase migration conventions.
- Move/relocate only if supported and safe; schema-qualify references and test search behavior.
- Do not make a cosmetic schema move that breaks operator lookup.

### 5.7 Payments scope decision (G-012)

- Record whether the first release explicitly supports manual bank transfer/COD/voucher only, or requires a digital gateway.
- For a manual-payment pilot, document operational controls, reconciliation, refund approval, settlement and payout responsibilities; label automated money movement as out of scope.
- Do not implement a gateway implicitly inside a defect fix. A gateway requires separate product/provider/security approval and its own plan.

### 5.8 Procurement scope decision (G-021)

- Obtain a business decision whether RFQ, quotation, negotiation, purchase order approvals and credit terms are required for the intended release.
- If required, create a separate bounded project plan and architecture audit; do not mix it into stabilization unless it blocks the agreed launch.
- If deferred, mark explicitly DEFERRED with rationale and roadmap owner.

### 5.9 Backup/restore and deployment controls

- Backup/restore proof and restore drills are deferred by user direction and are not a current Phase 5 exit condition.
- Document migration ordering, seed behavior, startup behavior, rollback/forward-fix, worker activation and health checks.
- Verify deployment SHA and readiness after an authorized staging deployment.
- Confirm alerting, log retention, secret rotation ownership and incident runbooks.

### Phase 5 exit gate

Quality gates are meaningful and blocking; repository hygiene decisions are evidenced; documentation is current; deploy/migration behavior is documented; P2/P3 deferrals have explicit owners and rationale. Backup/restore drills remain deferred.

---

## 10. Phase 6 — Consolidated full verification & release decision

**Start condition:** All implementation phases 0–5 are complete or have explicitly approved deferrals; code is merged to a single release-candidate commit; staging is provisioned and safe; required test credentials/providers are available; migrations are reviewed; worker topology is intentional.

This is the **one comprehensive platform test campaign**. It is not run repeatedly after every small fix.

### 6.1 Test campaign scope

1. **Repository and build:** clean install, generated contracts, type-check, lint, format, boundary checks, production builds for API/web/admin and Flutter analyze/build.
2. **Database:** fresh migration from empty DB, upgrade from representative prior schema, constraints/indexes/policies/grants, seed repeatability, rollback/forward-fix procedure.
3. **Security:** authentication/session/OTP redaction, RBAC, object-level authorization, cross-tenant negative matrix, direct DB/client access model, admin privilege boundaries, secret scanning.
4. **Buyer journey:** registration/login, organization selection, search, offer selection, cart, quantity validation, promotion apply/remove, per-store shipping, payment method, tax/currency review, checkout, order detail, status/notification and cancellation/return as in scope.
5. **Merchant journey:** onboarding, verification, product/offer management, quantity/pricing, inventory, order acceptance/rejection, fulfillment, analytics and membership permissions.
6. **Admin journey:** users/organizations, merchant verification, catalog moderation, orders, payment verification/refunds/settlements, disputes/returns, operational queues and audit history.
7. **Workers/concurrency:** outbox ownership, retry/dead-letter, carrier label/tracking, order auto-complete, return expiration, lease expiry/reclaim, multi-instance races and idempotency.
8. **External integrations:** OTP email, approved notification providers, carrier sandbox, payment sandbox only if in scope. Record provider acceptance separately from final delivery/settlement.
9. **Mobile:** supported flavors, auth persistence, cart/checkout parity, offline/retry behavior, order status, promo removal, accessibility and RTL.
10. **Performance/reliability:** k6 scenarios for readiness/auth/search/cart/checkout/order reads; error rate, p95 latency, saturation and queue lag thresholds defined before run.
11. **Recovery:** migration recovery, secret rotation procedure, rollback/forward-fix and alert delivery. Backup restore testing is deferred and not part of this campaign.

### 6.2 Test data and safety

- Use isolated synthetic accounts, organizations, stores, products and payment references.
- Include at least two independent merchants and buyer organizations to prove tenant boundaries.
- Never use real payment capture, live shipment creation or customer notifications without explicit approval.
- Ensure cleanup is scoped to generated test records and cannot touch production data.
- Capture evidence with sensitive values redacted.

### 6.3 Release gates

| Gate                          | Required result                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| P0 security                   | PASS; no known cross-tenant data access                                                            |
| P1 correctness                | PASS or explicit product-approved release restriction; no misleading totals or unsupported methods |
| Database access               | PASS; role/grant/RLS design verified against actual access paths                                   |
| Migration safety              | PASS; clean and upgrade paths verified                                                             |
| Worker/event reliability      | PASS; ownership, idempotency, leases and alerts verified                                           |
| Buyer/merchant/admin journeys | PASS for agreed in-scope scenarios                                                                 |
| Mobile parity                 | PASS for supported release scope                                                                   |
| External providers            | PASS in sandbox or explicitly disabled and truthfully represented                                  |
| CI/repository controls        | PASS; required checks block merge                                                                  |
| Backup/restore                | DEFERRED BY USER DIRECTION; excluded from this release campaign                                    |
| Performance                   | PASS against pre-agreed thresholds                                                                 |
| Documentation                 | PASS; user/admin/deployment/troubleshooting docs match tested behavior                             |

**Go/no-go rule:** any P0 failure, tenant-isolation failure, data corruption, financial inconsistency, lost order/carrier event, unsafe migration, or inability to restore is NO-GO. P1/P2/P3 items may only be deferred with explicit scope, risk, owner and mitigation; a deferral must not conceal a security or financial correctness failure.

### 6.4 Final deliverables

- Full test campaign report with command-by-command results and commit SHA.
- Buyer, merchant and admin UAT result summary.
- Tenant-isolation and concurrency evidence.
- Migration and deployment evidence; backup/restore evidence is deferred.
- Provider sandbox evidence and explicit non-configured channels.
- Updated gap register: CLOSED / PARTIAL / DEFERRED / NOT APPLICABLE, each with evidence.
- Final release recommendation: GO / CONDITIONAL GO / NO-GO.

---

## 11. Cross-phase engineering rules

1. **No speculative fixes.** Re-read current code and reproduce the finding on the active branch before implementation.
2. **One root cause at a time.** Keep changes small enough to review; avoid broad refactors unless required by the accepted design.
3. **Contract-first for shared behavior.** API schema, generated clients, web and mobile must move together when public contracts change.
4. **Migrations are deliberate.** Review schema diff, lock impact, existing data, compatibility, deployment ordering and recovery.
5. **Authorization is server-side.** UI hiding is not a security control.
6. **Money is never guessed.** Minor units are not added across currencies; payment status must reflect actual provider/manual evidence.
7. **Workers must be idempotent.** Every queue consumer needs ownership, claim/lease, retry and terminal-state semantics.
8. **No false success states.** A log line, HTTP 200, provider acceptance or build success does not prove a business workflow completed.
9. **No live side effects without approval.** Deploys, environment changes, production migrations, payment capture, shipments, customer notifications and data writes require the relevant authorization.
10. **Documentation is part of Definition of Done.** Update both living documents and the relevant user/technical guide in the same implementation task.
11. **Preserve audit history.** Do not rewrite old reports or historical milestones to make the new plan appear complete.
12. **Record every deferral.** Include reason, risk, mitigation, owner/decision and target milestone.

---

## 12. Definition of Done for each remediation item

A finding can be marked **CLOSED** only when all applicable conditions are met:

- [ ] Finding reproduced or revalidated on the active baseline.
- [ ] Root cause and chosen design documented.
- [ ] Code/schema/config change implemented and reviewed.
- [ ] Focused regression test added and executed.
- [ ] Affected package type-check/build/lint passes as applicable.
- [ ] Migration is validated and safe if schema changed.
- [ ] Authorization, idempotency, concurrency and failure paths tested where relevant.
- [ ] API contracts and generated clients updated where relevant.
- [ ] Relevant user/admin/operations documentation updated.
- [ ] Evidence recorded in the progress tracker with commit SHA and test output reference.
- [ ] No unapproved staging/production side effect occurred.

If any condition is not met, use PARTIAL, BLOCKED or NOT VERIFIED rather than CLOSED.

---

## 13. Living-document maintenance protocol

These two files are the authoritative working references for this remediation programme:

- `docs/remediation/IMPLEMENTATION-PLAN.md`
- `docs/remediation/IMPLEMENTATION-PROGRESS.md`

**Update automatically as part of implementation work, without asking the user for permission to maintain the documents:**

1. Before starting a phase, update the tracker with the selected phase, scope, dependencies and baseline commit.
2. When a task starts, record IN PROGRESS, task ID, branch/commit and expected evidence.
3. When code changes, update the plan only if scope/dependencies/acceptance criteria genuinely changed; update the tracker with files, migration IDs and focused tests.
4. When a task finishes, record exact test command/results, commit SHA, evidence links and any remaining risk. Never mark complete based only on an implementation report.
5. At each phase boundary, update phase status, acceptance checklist, outstanding blockers and next recommended task.
6. If a new finding is discovered, append it to the tracker and link it to the nearest original gap ID; update this plan only if sequencing or release scope changes.
7. Before a full test campaign, freeze the release-candidate SHA and update the test manifest.
8. After the final campaign, update both files with final evidence and release decision.

**Authority and sync:** the copies committed in this Git repository are the canonical source of truth because they can be versioned with the code and updated in the same commits. Any Library copy is a convenience snapshot and must not be treated as automatically synchronized with GitHub. In future implementation turns, read the current repository versions first and commit updates to these paths as part of the work; do not rely on stale chat summaries.

---

## 14. Current recommendation

Continue with the explicit G-006 stale-offer/concurrency acceptance review before closing G-006. G-008 is CLOSED with CI #714 evidence. G-007 implementation is CI-verified; its full journey UAT remains in Phase 6. G-002 effective database-role/access-path verification remains a pre-production gate; do not apply migration 0070, change grants or enable RLS until the access model is verified. Keep full manual journey testing consolidated in Phase 6.

**Current overall status: IN PROGRESS.** CI #711 passed every executed job on `347289796961a8f80368e20a0fa7fa33d7a8c999`: API unit/coverage (4,444 passed; 110 skipped), API integration, web/admin, lint/typecheck/format, Flutter, boundary lint, isolated full migration apply, contract/codegen, production build and container smoke. k6 smoke and staging release were skipped. G-003, G-004 and G-005 are CLOSED with CI evidence; G-011, G-028 and G-029 remain closed on their prior verified runs. G-006 implementation is CI-verified but its explicit stale-offer/concurrency acceptance review remains open. G-007 implementation is CI-verified; full journey UAT is reserved for Phase 6. G-002 remains partial pending actual API/migration role verification; G-008 is CLOSED with CI #714 evidence. No staging/production deployment or live database migration has been performed.

---

## 14. Execution update — 19 November 2026

This section supplements the original plan without rewriting historical audit findings or acceptance criteria.

### Verified since the plan was opened

- CI #718 passed all 10 executed jobs on `783c03814d1527184c0eb69c2df1c396944056cc`. k6 smoke and staging release were skipped; this is CI evidence only, not staging or production release evidence.
- G-006 is CLOSED. The changed-offer-term test and the true PostgreSQL two-session offer-row contention test passed in CI #718. The test holds a seller MOQ update uncommitted, confirms buyer checkout waits on the row lock, commits the seller edit, verifies checkout re-reads the changed terms and creates no invalid order, then restores the fixture terms.
- The OTP timeout/redaction regression suite also passed in CI #718; the broader forensic review of all provider/logging paths remains a Phase 0 task.

### G-002 database evidence update

- A 19-Nov read-only recheck found 114 public tables with RLS enabled/forced on 0.
- Effective privileges across those 114 tables show anon/authenticated/service_role have no SELECT/INSERT/UPDATE/DELETE, but each has TRUNCATE/REFERENCES/TRIGGER/MAINTAIN. The Security Advisor's critical RLS-disabled finding remains valid; its generic assertion of unrestricted read/write is broader than the effective DML grants observed in this snapshot.
- `postgres` default ACLs repeat non-DML grants for anon/authenticated/service_role. `supabase_admin` default ACLs include broader DML grants and must not be changed without a separate ownership/platform review.
- The SQL inspection connection is `postgres`; this does not prove the Render API or staging migration role. No attributable SCS API connection appeared in the observed `pg_stat_activity` sample.
- The custom application migration ledger remains at 69 entries through 0069. Migration 0070 and 0071 have not been applied to the shared database.
- The API uses a direct node-postgres/Drizzle pool from `DATABASE_URL`; the staging release workflow maps `STAGING_DATABASE_URL` into that variable for the migration runner. The exact login/effective roles remain a required verification.

### Added read-only verification capability

- `apps/api/scripts/audit-db-access.ts` and `pnpm --filter @scs/api db:audit-access` report the login/effective role, role attributes, table and sequence privileges, schema access, RLS coverage, default ACLs and public function exposure. The utility does not read application rows, print DSNs or mutate the database.
- `.github/workflows/db-access-audit.yml` is a manual staging-environment workflow. It runs only the read-only audit; it does not migrate, deploy, or write application data. GitHub requires a `workflow_dispatch` workflow to exist on the repository default branch before it can be dispatched; once promoted there, it checks out `develop` for the audit code.
- Full evidence is recorded in [DB-ACCESS-VERIFICATION-2026-11-19.md](./DB-ACCESS-VERIFICATION-2026-11-19.md).

### Revised immediate sequence

1. Validate the new utility/workflow in CI and make the workflow available from the default branch through the normal review/merge path.
2. Run the read-only audit against the configured staging migration connection and record the effective role without exposing its DSN.
3. Obtain equivalent runtime identity evidence for the Render API process without printing or retrieving environment-variable values.
4. Complete table-by-table access classification and the full grants/default-ACL/function/view/sequence inventory.
5. Design and test the least-privilege API/migration role contract, including owner/BYPASSRLS behavior and compatibility with direct Drizzle access.
6. Add isolated role-switching and cross-tenant database negative tests before preparing any staged grant/RLS migration.
7. Continue remaining Phase 0–5 work packages; run the consolidated Phase 6 campaign only after implementation and documented deferrals are ready.

**Safety boundary remains unchanged:** no live grant changes, RLS enablement, migration application, Render configuration change, worker activation, or deployment is authorized by this implementation update.

---

## 15. Execution update — G-009 truthful notification states

The general notification dispatcher previously returned fabricated provider IDs and marked SMS, FCM/PUSH and WhatsApp rows as SENT despite placeholder implementations. This has been corrected using the explicitly permitted NOT_CONFIGURED behavior in the Phase 4 acceptance criteria:

- SMS primary/fallback stubs no longer simulate success; notification rows are marked NOT_CONFIGURED with `SMS_PROVIDER_NOT_CONFIGURED`.
- PUSH no longer returns a fabricated FCM ID; rows are marked NOT_CONFIGURED with `PUSH_NO_ACTIVE_DEVICE_TOKEN` or `PUSH_PROVIDER_NOT_CONFIGURED`.
- WhatsApp no longer marks placeholder sends SENT; rows are marked NOT_CONFIGURED with `WHATSAPP_PROVIDER_NOT_CONFIGURED`.
- IN_APP remains persisted and available through the in-app API. Its SENT state means the notification item was persisted; realtime delivery remains best-effort and is not proof of device receipt.
- Four focused unit regression tests were added for SMS, push with/without active tokens, and WhatsApp. Provider sandbox/retry testing remains partial until a real provider adapter and approved sandbox credentials exist.
- Notification provider-selection and troubleshooting documentation now distinguish OTP provider configuration from general outbound notification adapters.

CI verification is pending on the current PR head. No external notification provider was invoked, no customer notification was sent, and no provider credentials were changed.

---

## 17. Execution update — G-010 carrier label persistence

The shipping.carrier.label worker previously logged that label generation was not implemented and then allowed the outbox event to be acknowledged. It now invokes the registered provider's generateLabel operation, fails closed for missing/unsupported providers, validates the returned URL with the provider-specific HTTPS/host/DNS SSRF allowlist, rejects redirects, applies a bounded timeout and 10 MiB size limit, verifies PDF content type/signature, and stores the PDF in the private S3 uploads bucket. The outbox event UUID is reused as the S3 object key suffix and shipment_labels primary key so retries do not create duplicate rows or objects. Shipment label list/detail read models include short-lived presigned download URLs for managed labels. Four mocked unit tests cover success, SSRF rejection, idempotency and invalid PDF payloads. Real Aramex sandbox verification remains unavailable pending authorized credentials; no live shipment or provider call was made. CI verification is pending.

The label request is reachable through authenticated `POST /v1/shipments/:id/labels` (permission `fulfillment:labels:write`). The route checks tenant ownership, requires an existing carrier shipment and a provider with label capability, serializes concurrent requests by locking the shipment row, and returns an existing active label or pending request rather than enqueueing duplicates. The worker uses the outbox event UUID for retry-idempotent S3 and database persistence. The route does not call the carrier synchronously.

### CI #729 correction

The first attempt to include the new read-only audit utility in API typecheck used a broad scripts glob and exposed unrelated pre-existing M5/M6 manual-tooling type errors. The tsconfig now includes only `scripts/audit-db-access.ts`; the manual tools remain outside the production API typecheck scope. CI #729's Flutter analyze/tests passed; the API typecheck failure prevented the remaining dependent test jobs from running. Re-run full CI after this correction before treating G-009/G-010 as verified.

---

## 18. Execution update — G-019 mobile promotion removal

The mobile cart previously allowed a buyer to apply a promotion but offered no way to remove it. Added authenticated DELETE /v1/cart/promo, which clears both promoCode and the resolved promotionId on the caller's active cart and returns refreshed cart state. Flutter ApiService and the cart screen expose a busy-safe Remove action with error feedback. Backend and mobile API regression tests were added. CI verification is pending. No live cart or promotion was modified.

---

## 19. Phase 0 testability and deployment documentation update

Added three living remediation artifacts:

- [TEST-CAMPAIGN-MANIFEST.md](./TEST-CAMPAIGN-MANIFEST.md) records exact root/API/web/admin/mobile/contract/container/E2E/k6/migration commands, prerequisites, CI gate behavior, the Phase 6 sequence and the shared-database safety restrictions.
- [SYNTHETIC-TEST-IDENTITY-MATRIX.md](./SYNTHETIC-TEST-IDENTITY-MATRIX.md) defines the two-buyer/two-merchant tenant matrix, owner/staff/admin/moderator/suspended/inactive/unauthenticated identities, minimum fixture data and negative authorization cases. A shared fixture factory and cross-suite adoption remain required before P0-05 can be closed.
- [DEPLOYMENT-MIGRATION-RUNBOOK.md](../deployment/REMEDIATION-DEPLOYMENT-AND-MIGRATION-RUNBOOK.md) documents API startup behavior, the advisory-locked migration runner, transactional migration ledger, RBAC-only idempotent seed, release workflow, manual-dispatch mutation warning, Render exact-SHA deployment and forward-fix policy.

P0-03 is complete because the audit-baseline comparison found no code fixes hidden in the seven intervening commits (documentation only). P0-04, P0-06 and P0-08 are complete by source review/documentation. P0-05 remains partial until reusable fixture factories are adopted. P0-07 remains partial until the current Render workspace/service configuration is rechecked; the documented auto-deploy-disabled observation is historical, not a fresh live assertion.

---

## 20. G-016/G-017 repository artifact cleanup

Removed the 1,277-file `.m73b6-scratch` tree (approximately 37.9 MB), its 19.1 MB P4.18 archive and duplicated context, plus the root `test-token.txt`. Added ignore rules to prevent reintroduction. A targeted scan of visible text artifacts found only localhost/CI PostgreSQL URLs and an expired short-lived HS256 test JWT; no private-key, AWS access-key or GitHub-token pattern was found. The token contained no signing secret and is expired, so secret rotation is not indicated. The GitHub connector could not independently extract the binary tar contents; current-tree artifacts are removed, but historical Git objects remain. No history rewrite was performed.

### G-015 boundary-lint execution correction

The E6 checker had not actually executed: the root script invoked missing `ts-node`, and its module-root path was wrong. The command now uses the API workspace's installed `tsx`, and the checker resolves `apps/api/src/modules`. Keep the CI step advisory until the corrected checker reports zero violations and remaining cross-module imports are remediated; only then make the job blocking.

---

## 21. Phase 5 operational-hardening status — 19 November 2026

- Repository formatting is configured as a blocking CI gate after passing CI #738.
- The E6 boundary checker is now correctly invoked with the API workspace's `tsx`; a reviewed 193-entry legacy baseline blocks new cross-module imports. Three PR-introduced violations were fixed through public module APIs. The remaining 193 imports are tracked debt, not claimed as compliant.
- The 1,277-file / approximately 37.9 MB `.m73b6-scratch` tree and expired JWT test artifact were removed from the current tree; history remains unchanged.
- G-014 branch protection remains blocked by repository-admin access. G-018 documentation reconciliation is partial. G-013 has 71 current FK-index candidates versus the earlier 55 count; no blanket indexes will be added. G-022 has a relocatable `pg_trgm` extension and five dependent GIN indexes; actual API/migration roles must be confirmed before any relocation.
- Payment-gateway and RFQ/quotation/PO scope decisions remain open; current recommendation is manual payment verification for this release and defer RFQ/PO to a separate milestone. Backup/restore remains deferred by user direction until pre-production review.

---

## 22. G-013 foreign-key index review — 19 November 2026

The read-only live inventory reports 71 foreign-key constraints without a matching valid leading-column index, compared with the earlier advisor count of 55. Only four candidate tables have non-zero estimated rows (sessions 19, device_credentials 6, role_permissions 4, organization_members 3); all are small. Cumulative scan counters on currently empty tables do not justify index creation. The current pg_stat_statements sample does not identify representative high-volume application joins. No indexes were added. Defer DDL until representative staging data is loaded and exact query plans demonstrate a benefit, then measure read gains and write/storage overhead. See `FOREIGN-KEY-INDEX-REVIEW-2026-11-19.md`.

---

## 23. G-022 pg_trgm relocation review — 19 November 2026

The extension is relocatable, but it is owned by the Supabase-managed `supabase_admin` superuser. The connected `postgres` role is not a member and cannot `SET ROLE` to the owner. Five application GIN indexes use `gin_trgm_ops`, and catalog search calls `similarity()` without schema qualification. Although the `extensions` schema exists and the current `postgres` search_path includes it, the Render API/migration role is not verified. Do not change extension ownership or attempt relocation from the current connection. Require a Supabase owner-supported path, isolated migration test, and runtime role/search_path confirmation. See `PG-TRGM-RELOCATION-REVIEW-2026-11-19.md`.

---

## 24. Database ACL and search-path reconciliation — 19 November 2026

The latest read-only catalog review found no direct table grants to the PUBLIC pseudo-role across the 114 public tables and no PUBLIC default-ACL grants. The explicit client-role grants remain excessive: anon, authenticated and service_role have no table CRUD, but retain TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on all 114 tables. Migration 0070 is CI-verified but not applied to the shared database. `normalize_arabic(text)` remains unpinned live; it is not SECURITY DEFINER and its body uses pg_catalog built-ins only. G-020 therefore remains partial until the controlled migration is applied.

The `pg_trgm` extension is relocatable but owned by Supabase-managed `supabase_admin`; the connected `postgres` role cannot assume that owner. Five application GIN indexes use `gin_trgm_ops`, and catalog search calls `similarity()` unqualified. G-022 is blocked until an owner-supported relocation path and actual API/migration search paths are verified. No live database changes were made.

---

## 25. Worker topology and protected-job review — 19 November 2026

Read-only Render metadata confirms one API web service, one configured instance, no dedicated worker service, and auto-deploy disabled. Runtime logs show OutboxDispatcher (1s), ShippingCarrierWorker (5s), AutoCompleteWorker (60s), and P13Monitor (60s, log-only) embedded in the API process. ReturnExpirationWorker is disabled because `P13_WORKER_ENABLED` is unset.

Source review confirms carrier events and auto-complete orders use atomic database claims; P13 return expiration additionally requires explicit enablement, a durable epoch-fenced lease and a readable/unpaused control before work, and rechecks ownership/pause before each item. Its only automatic business action is escalation to admin review, not approval, rejection, refund or terminal expiry. The P13 monitor has no external alert webhook; safe activation remains blocked pending a signed sink and a deliberate single-holder rollout.

The generic OutboxDispatcher currently logs and marks non-carrier events dispatched without an atomic claim. That is not an external side effect today, but it is a horizontal-scaling constraint: do not scale the API beyond one instance or add side-effecting consumers to this dispatcher until atomic claim/lease semantics and multi-instance tests exist. No runtime or database changes were made. See `STAGING-RUNTIME-TOPOLOGY-2026-11-19.md`.

---

## 26. Reusable synthetic tenant fixture foundation

P0-05 now has a shared PostgreSQL identity fixture factory at `apps/api/src/__tests__/helpers/tenant-fixtures.ts`. It creates two organizations, two buyers, two merchant owners, two active stores and their owner memberships in one transaction using fresh UUIDs and synthetic phone identifiers. P311 financial tenant isolation, P4 HTTP authorization and Phase 1 marketplace integration suites now consume this common identity graph while retaining their domain-specific order, financial, catalog and warehouse fixtures. The helper is restricted to disposable integration-test databases; no shared Supabase data is used. CI verification is pending.

---

## 27. Current-head CI verification — 19 November 2026

CI #762 passed all 10 executable jobs on PR #138 head `f8a765d0a70a9f110b7a5408d869a1424d8382b1`: lint/typecheck/changed-file formatting, Flutter analyze/tests, API unit/coverage, API PostgreSQL integration, web/admin tests, E6 boundary lint, isolated migration full apply with public-schema privilege and function-search_path assertions, contract/codegen, production build, and container build/smoke. k6 smoke and staging release were skipped. P0-05 synthetic two-tenant fixture adoption and G-006 two-session offer-lock contention/cleanup are verified by this run. No shared Supabase mutation or staging deployment occurred. G-002 remains blocked on actual Render API/migration DB role evidence and table classification.

## 28. G-002 live inventory and access-intent classification — 19 November 2026

A fresh read-only Supabase catalog review was completed after the current-head CI investigation. The resulting 114-relation inventory is recorded in [DATABASE-TABLE-ACCESS-CLASSIFICATION-2026-11-19.md](./DATABASE-TABLE-ACCESS-CLASSIFICATION-2026-11-19.md).

Evidence from the connected project:

- 114 public table relations: 1 partitioned analytics parent, 12 monthly partitions, 1 default partition and 100 ordinary tables.
- RLS enabled: 0; RLS forced: 0; public policies in `pg_policies`: 0.
- No public views, materialized views or foreign tables were returned by the inspected relation inventory.
- Effective `anon`, `authenticated` and `service_role` privileges show zero SELECT/INSERT/UPDATE/DELETE across all 114 relations, but all three retain TRUNCATE/REFERENCES/TRIGGER/MAINTAIN across all 114.
- `authenticator` is a member of `anon`, `authenticated` and `service_role`. The PostgREST role-switching path therefore remains relevant even though the login identity differs.
- The connected inspection session is `postgres` with BYPASSRLS. This does not identify the Render API or migration role.
- No row-level policies currently exist. The API's source-level access path is direct node-postgres/Drizzle, with tenant enforcement in application services and controllers.

The table-by-table domain and access-intent inventory is complete. It is not yet a row-policy design: exact tenant ownership predicates, exposed Data API schema configuration and all service/query paths still need review. Buyer-facing catalog visibility remains an API-level contract, not a direct table grant.

**Architecture gate:** do not blindly enable RLS. A BYPASSRLS runtime role would bypass the policies; a non-BYPASSRLS role would be denied by default with zero policies. A correct tenant-aware RLS design requires trusted transaction-local request context, complete transaction coverage across the shared Drizzle pool, safe reset on connection reuse, and explicit treatment of background workers and system jobs. The actual Render API and migration roles remain unverified. The GitHub connector available in this session does not expose workflow-dispatch, and the Render connector does not reveal environment-variable values or usernames. Do not reveal or retrieve DSNs.

**Updated work-package state:**

- P1-06: PARTIAL — source connection paths and read-only audit utility verified; actual API and migration role identities remain unverified.
- P1-07: PARTIAL — all 114 relations inventoried and domain/access intent classified; exact row ownership/policy predicates remain open.
- P1-08: PARTIAL — effective table grants and role memberships refreshed; full function/default-ACL/sequence/schema matrix remains open.
- P1-09: BLOCKED — least-privilege/RLS design must wait for actual roles and transaction-scoped tenant-context feasibility.
- P1-10: PARTIAL — isolated migration validation only; no shared-database migration or grant change.

No live database mutation, migration, grant change, RLS change, Render configuration change, worker activation or deployment was performed.

## 29. RLS architecture proposal and release-gate reconciliation — 19 November 2026

Added [G-002 RLS Architecture Proposal](./G-002-RLS-ARCHITECTURE-PROPOSAL.md) after the fresh live inventory. It records the current direct Drizzle access model, target role separation, transaction-local tenant-context candidate, worker requirements, policy families, risks of blanket RLS and the isolated-test sequence. This is a design proposal only; no production SQL or executable RLS policy was generated.

The staging read-only database audit workflow was updated to support a push trigger on the remediation branch, using the exact branch commit and the existing `staging` GitHub environment. The attempted run did not execute its job (the job remained waiting/approval-gated and the run concluded failure). Do not bypass environment protection. The API/migration usernames remain unverified; P1-06 and P1-09 remain blocked.

The Phase 6 release-gate table previously contradicted the explicit Phase 5 and test-campaign statements deferring backup/restore drills by user direction. The gate is now consistently marked **DEFERRED BY USER DIRECTION** and excluded from this campaign. No backup/restore claim is made.

G-010 received additional focused regression coverage for HTTP 5xx retry classification, HTTP 4xx terminal classification and abort-driven download timeout, supplementing success, SSRF, duplicate, PDF validation and storage-failure tests. The expanded tests await latest-head CI; no real Aramex sandbox request was made.

## 30. Documentation readiness reconciliation — 19 November 2026

The G-018 review identified legacy documents that could be mistaken for current release certification. Added current-readiness notices to the User Guide, Developer Guide and Testing Guide. The Testing Guide's statement that all Phase 1 P0/P1 gaps were closed and that the platform was ready for pilot was replaced with the verified current state: PR #138 remains draft, G-002 is a pre-production gate, and Phase 6 has not started.

Also:

- Marked the 25-Sep Capability Matrix as a historical, non-recertified baseline; its checkmarks are not current release evidence.
- Updated the pilot Go/No-Go checklist to state that backup/restore drills are deferred by user direction and excluded from the current campaign.
- Marked SLO values as proposed targets rather than measured production SLOs; noted that Kubernetes/pod metrics must be adapted to the currently observed Render topology.
- Added operational safety warnings to the playbooks so their SQL and business-side-effect steps are not interpreted as permission to mutate the shared database or trigger live workflows.

G-018 remains **PARTIAL**. This is a targeted correction of the most misleading readiness claims, not a complete audit of all 533 files under `docs/`. Remaining API/admin/merchant/buyer/mobile/permissions/worker/troubleshooting guides must be reconciled with current routes and verified behavior in their owning implementation work packages.

## 31. Newly discovered P0 — G-030 merchant financial listing isolation

The ongoing financial-service source review found a tenant-isolation defect in `GET /v1/merchant/payments` and `GET /v1/merchant/settlements`. Merchant routes called list methods without authenticated caller context; the payment list's store/buyer filter construction was not applied to the final query. Treat this as a P0 release gate, not a documentation-only issue.

The remediation branch now:

- passes the authenticated JWT caller context into dedicated merchant listing methods;
- scopes payment rows through payment → order → store → active organization;
- scopes settlement rows through settlement → store → active organization;
- validates explicit store IDs against organization ownership;
- applies admin store/buyer filters to matching payment order IDs;
- adds two-tenant PostgreSQL tests and controller forwarding tests.

**Status:** implementation committed; current-head CI pending. P0 remains open until test evidence is green.

## 32. Current-head verification and G-030 closure — 19 November 2026

Current branch head `d965e73da727aa136fa4af859f7f423de04d00d7` passed CI run **#832**. The following executable jobs completed successfully: lint/typecheck and changed-file formatting, Flutter analysis/tests, API unit/coverage, PostgreSQL integration, E6 boundary lint, web/admin tests, isolated full migration apply, contract/codegen, build, and container build/smoke. The k6 smoke and staging release jobs were skipped by workflow conditions and are not claimed as passed.

**G-030 is CLOSED for implementation and automated regression coverage.** The dedicated merchant payment and settlement listing paths now bind records to the authenticated active organization, validate explicit store filters, preserve the seeded organization-wide merchant read permission, and have two-tenant PostgreSQL and controller tests. See [the G-030 evidence report](./G-030-MERCHANT-FINANCIAL-LISTING-TENANT-ISOLATION.md).

**G-010 timeout regression is test-harness verified** in the same current-head CI: the expected 15-second timeout rejection is observed before fake timers advance, and the complete API unit/coverage job passed. The production worker change remains subject to its own operational/activation criteria in Phase 3; this does not close the wider P13 worker activation gate.

The one-time progress formatter workflow has been deleted. No formatter automation with repository write permission remains.

### Phase 5 control evidence and remaining limitations

- A read of repository rulesets returned an empty list. The branch-protection endpoint for `develop` returned HTTP 403 (resource not accessible to this integration). Therefore G-014 remains **UNVERIFIED/OPEN**; do not infer that branch protection is absent or present from the inaccessible endpoint.
- No shared database role/grant change or RLS enablement has been performed. G-002 remains **BLOCKED** pending a verified effective API/migration role inventory and an approved tenant-isolation architecture.
- The full release campaign remains pending: k6/performance, staging release and safe staging E2E were not executed by CI #832.
- No production deployment, shared-database migration, staging write or financial-data mutation was performed.

The next execution order is: complete the evidence-based G-002 role/access review without changing grants; resolve G-014 through an authorized repository administrator or an available read-only policy view; continue the remaining Phase 3/4/5 findings with focused regression tests; then run the consolidated Phase 6 campaign only after the prerequisite release gates are met.

## 33. Current-head CI #843 and expanded G-002 ACL investigation — 19 November 2026

CI run #843 passed all 10 executable jobs on branch head 58053f61e9d3679e81b999e2a9f24f4c8ad4f5ab. Lint/typecheck/format, Flutter, API unit/coverage, PostgreSQL integration, web/admin, E6 boundary lint, isolated full migration apply, contract/codegen, build and container smoke all passed. k6 and staging release were skipped.

A fresh read-only Supabase MCP inspection of the SCS-PlatForm PostgreSQL 17.6 project added important G-002 evidence:

- 114/114 public tables have RLS disabled.
- aclexplode confirms direct MAINTAIN, REFERENCES, TRIGGER and TRUNCATE grants to anon, authenticated and service_role on all 114 tables; effective SELECT/INSERT/UPDATE/DELETE counts remain zero for these three roles.
- postgres-owned public-table default ACLs repeat those four grants for future objects created by postgres. Supabase-managed supabase_admin defaults are separate and must not be modified as part of this remediation.
- authenticator can SET ROLE to anon/authenticated/service_role, but INHERIT is false on each membership edge. The MCP inspection connection is postgres with BYPASSRLS and is not proof of the Render API or migration identity.
- No direct table ACL grants to PUBLIC were found. The findings are excessive direct grants and default-ACL recurrence; no specific public HTTP exploit path has been demonstrated.

The read-only audit utility was enhanced to emit direct table/sequence ACL grants to the API roles, include authenticator in the privilege inventory and report transitive role-membership edges correctly. The previous recursive report query only joined root-to-first-edge and could omit deeper memberships; the corrected recursive query was separately executed against the live catalog and returned the expected transitive graph.

The standalone read-only GitHub audit run #3 failed on a push event before producing usable database identity evidence. It must not be treated as an audit success. No attempt was made to bypass the staging environment approval gate. The API/migration DATABASE_URL identities remain unverified.

**Current status:** G-030 remains closed by CI #832; G-010 timeout test remains verified by CI #832 and CI #843. G-002 remains blocked pending API/migration role proof and a reviewed ACL/RLS plan. The latest audit-script changes and evidence-document updates require a fresh CI run. No shared database grants, defaults, RLS policies, migrations, staging data or deployment settings were changed.

## 34. Phase 0/3 source review — OTP log redaction and worker activation boundaries — 19 November 2026

### OTP logging source review

Reviewed the current branch's IdentityService, OtpDeliveryService and Resend, SMTP, Twilio and WhatsApp providers. The inspected code paths do not log the OTP value. IdentityService logs masked phone/email identifiers; OtpDeliveryService receives a masked subject from the public phone/email entry points; the providers log masked recipients or stable provider error classes/codes rather than raw provider exception messages or response bodies. The internal mock delivery path is only used by test/dev injection and also receives a masked subject from the email OTP path.

Existing regression coverage includes `otp-redaction.spec.ts`, `otp-security-remediation.spec.ts` and `otp-delivery-providers.spec.ts`, which assert that OTP values and full recipient identifiers do not appear in captured logs. This closes the source-code review for the currently inspected paths, not the earlier Render runtime finding. The deployed service version and fresh post-fix runtime logs have not been verified; no live OTP was sent as part of this review.

### Worker registration and P13 safety defaults

Source inspection confirms `OrdersModule`, `ShippingModule`, `ReturnsModule` and `OperationsModule` are imported by AppModule. AutoCompleteWorker and ShippingCarrierWorker are registered in their domain modules and start polling inside each API process after their startup delays. AutoComplete uses durable order claims; the carrier worker uses row-lock/lease-based event claims. Their multi-instance correctness remains dependent on the corresponding database concurrency tests and runtime replica configuration.

ReturnExpirationWorker is registered through ReturnsModule but remains OFF unless `P13_WORKER_ENABLED` is explicitly truthy. `resolveP13OpsConfig` defaults expected P13 workers to zero while disabled, pilot mode to legacy, and the alert sink to log-only when no webhook is configured. A configured webhook is disabled unless a signing secret of at least 32 characters is present. P13MonitorService is separate from the protected worker: it starts on every API instance and scans on the configured cadence (default 60 seconds), with database alert deduplication.

These defaults prevent accidental activation of protected return/refund work, but they do not prove the deployed environment's flags, actual replica count or alert delivery. The earlier Render inspection showed one API service and no separate worker service; that topology and current environment values have not been reverified in this execution. Do not enable P13 or change Render configuration until the expected holder count, pilot allowlist, signed alert sink and staging verification are approved.

### Current acceptance status

- OTP: source-level redaction review and existing regression tests are present; runtime log verification remains OPEN.
- AutoComplete/carrier workers: source registration and durable claim boundaries are implemented; CI evidence exists for their focused ownership/concurrency cases. Staging topology and operational alerts remain OPEN.
- P13 protected return worker: safe default OFF and unit coverage for expected worker count exist; real alert delivery and explicit activation remain DEFERRED pending approved staging configuration.
- No provider request, staging write, Render environment change, worker activation or deployment was performed.