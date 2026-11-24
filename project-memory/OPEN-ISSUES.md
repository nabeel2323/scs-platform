# SCS Platform — Open Issues and Next Work

**Last reconciled:** 24 November 2026  
**Authoritative detail:** [Implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## Immediate blockers and high-priority work

### G-002 latest continuation — migration objects and operator access — 24 November 2026

Carrier credential/configuration and webhook paths remain scoped. This continuation reconciles 75 numbered migration files and direct migration/seed/bootstrap/CLI paths.

Implemented:
- Centralized local pg_partman migration exclusions shared by manual Docker migration and DatabaseService development startup; complete DATABASE_URL migration path remains unchanged.
- Advisory lock and in-transaction ledger recheck for local migration runner; shared session lock for API development startup.
- Transaction-local system/bootstrap/audit principals for RBAC/catalog seeds, development seed, staging bootstrap scripts, local admin creation and read-only database audit.
- Staging merchant diagnostic now requires exact staging database approval and uses a read-only bootstrap actor scope.
- Legacy disposable migration verification scripts require explicit test target confirmation and local PG connection; legacy migration runners now apply atomically with advisory locking.
- Read-only audit now enumerates non-system functions/triggers, partman retention config and cron maintenance jobs where accessible.
- Corrected RBAC seed mapping total double count.

Remaining:
1. Verify whether an external scheduler actually invokes pg_partman maintenance. Migration 0013's cron.schedule example is commented out; no repository scheduler configuration was found.
2. Verify actual API/migration login roles and protected read-only catalog evidence through authorized staging only.
3. Complete exact ownership predicates, migration FK crosswalk and actor-context nesting/reuse audit.
4. Reconcile 114/116 relation history from a fresh catalog snapshot.

Source checkpoint `48b22ded255f514f4ccec55d58a604a1c41e7b8f`. No test, CI, migration, seed, reset, bootstrap, database audit, RLS/grant change, staging access, deployment, worker activation or merge was performed. G-002 remains NOT VERIFIED.

### G-002 continuation — 22 November 2026

The source operation map now covers 26 service files plus supporting outbox, carrier, tracking, reconciliation, operations-control and worker paths. A separate schema review records candidate owner paths and principal classes across the major tenant, buyer/order, financial, user-private and system tables. These documents are source-only evidence, not an approved policy. Still open: complete the remaining import-executor/carrier recovery/bootstrap/migration/CLI paths; verify FK constraints and plain UUID relationships against migrations/catalog; map exact read/insert/update/delete predicates and route principals; obtain actual API/migration runtime identities and the protected read-only staging catalog snapshot; resolve 114-versus-116. A user-uploaded supplemental note reports 111/111 tables with RLS disabled and 32 public functions with none SECURITY DEFINER, but it lacks timestamp, endpoint, query, connection identity and relation-kind scope. Preserve it as supplemental evidence only; do not substitute 111 for the detailed 114 or historical 116 counts. See [G-002 supplemental audit note](../docs/remediation/G-002-ADDITIONAL-AUDIT-NOTE-2026-11-23.md). No shared database changes, migration, grants, RLS, deployment or worker activation are authorized.

### G-001 — P0 merchant offer authorization

**Status: PARTIAL — do not close yet.**

Implemented:

- Merchant mutation role gate for `MERCHANT_OWNER`, `MERCHANT_STAFF` and legacy `MERCHANT`.
- Explicit denial of BUYER, FINANCE and platform roles on merchant mutation routes, even where permissions may otherwise be present.
- Governance-read permission checks for ADMIN, MODERATOR, SYSTEM and SUPER_ADMIN.
- Controller-level positive/negative role regression coverage.

Verified in exact-head CI #1280 on source SHA `ffd3961c32164c2af00090b32dbafb06b997a581`:

- API unit/coverage and real PostgreSQL integration passed, together with every other executable CI job.
- Controller/service/PostgreSQL tests cover supported merchant roles, buyer denial from merchant surfaces, foreign-organization and same-organization non-member confidentiality, missing active organization, revoked membership, DRAFT- and INACTIVE-store buyer exclusion, governance-permission reads, authenticated actor attribution, buyer-field allowlisting and same-store price-list/warehouse references.
- Evidence map and review checklist: [G-001 Independent Security Review Packet](../docs/remediation/G-001-INDEPENDENT-SECURITY-REVIEW-PACKET.md).

Remaining:

- Obtain independent security review from the user or a separately appointed qualified reviewer; the implementation author cannot self-certify it.
- Record reviewer findings, remediate any issues, and attach the review outcome to the authoritative tracker.
- Do not infer a SUSPENDED-store policy beyond the explicit ACTIVE-only buyer visibility predicate.

The implementation author must not mark their own work independently reviewed.

### G-036 — P1 realtime store/order room authorization

**Status: IN PROGRESS — source remediation implemented; focused tests added, not executed.**

The realtime gateway previously accepted arbitrary authenticated joins to `org:{storeId}` and `order:{orderId}` rooms. The server now requires:

- `org:{storeId}`: existing store, `merchant:orders:read`, active-organization ownership and active store membership; platform staff require `orders:read`.
- `order:{id}`: buyer ownership with `orders:read`, merchant membership with `merchant:orders:read`, assigned shipment with `fulfillment:shipments:read`, or platform-staff `orders:read`.
- `user:{id}`: the authenticated user's own room only.

UUID validation and lookup failures fail closed. Focused gateway tests cover merchant, buyer/master-order, driver and platform paths. The Web realtime client also avoids subscribing without merchant order-read permission. Exact-head CI and independent security review remain pending; do not close G-036 yet.

No shared database, RLS, grants, migration, staging or deployment changes were made.

### G-002 — P1 database access and RLS

**Status: IN PROGRESS.**

Remaining:

- Actual API and migration runtime identity evidence from authorized staging execution.
- Protected read-only staging audit, with authorized approval of the `staging` environment.
- Exact per-table operation/row-ownership predicate review and transaction-local tenant-context feasibility.
- Reviewed least-privilege/RLS design and explicit authorization before any shared database mutation.

Do not enable RLS, apply migration 0070, change grants/default ACLs or alter Supabase-managed ownership as part of unapproved work.

## Other tracked unresolved findings

The additional P1 realtime room authorization finding G-036 is tracked above; the full 36-finding register remains authoritative.

The following are navigation-level reminders, not a replacement for the full finding register:

- **G-007:** full buyer journey, per-suborder order detail and tracking UAT remains in Phase 6.
- **G-010:** real Aramex sandbox verification remains unavailable.
- **G-012:** automatic gateway/payout is a product-scope decision; do not expand scope silently.
- **G-013:** foreign-key index candidates need representative workload evidence before DDL.
- **G-014:** effective branch protection remains unverified due repository access limitations; requires repository administrator evidence.
- **G-015:** boundary regression gates exist; legacy boundary violations remain tracked.
- **G-018:** permanent documentation/readiness coverage continues to be reconciled.
- **G-020:** migration is CI-verified but has not been applied to the shared database.
- **G-021/G-022:** retain the open/blocked states and dependencies exactly as recorded in the authoritative tracker; do not infer closure.

For exact statuses, priorities, evidence and dependencies, consult the 36-row register in [IMPLEMENTATION-PROGRESS.md](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## CI and formatting follow-up

- CI #1176 failed only at the changed-file Prettier gate on the controller test and progress tracker.
- Lint had zero errors (311 warnings), TypeScript typecheck succeeded and Flutter analysis/tests passed.
- API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped due to the lint job failure.
- Formatting correction is complete: formatter run #14 passed and the temporary workflow removed itself. CI #1180 on app-authored checkpoint f7f3ff6837f67f17cc00d5129a20f50e608bf3b6 failed the changed-file Prettier gate on three Markdown files. Lint/typecheck and Flutter passed; dependent jobs were skipped. Formatter run #15 completed successfully and formatted the three files. The helper workflow removed itself in cleanup commit 2d416c99700de8b511a7c376085a107cc24a854c and is absent from the final tree. CI #1183 on cleanup commit has action_required with no jobs; CI #1182 is on the pre-format commit. A fresh exact-head CI run is required.

## Next action order

1. Standardize or retire the remaining legacy M5/M6 UAT and migration harness scripts. Keep them local-only; remove fixed credentials and arbitrary DATABASE_URL overrides, and add explicit environment/confirmation guards.
2. Add a uniform staging target/approval guard to all bootstrap-staging platform/merchant/store/staff/RBAC scripts before any future invocation.
3. Complete method-level service-to-table ownership-predicate mapping, including the four direct-DB controllers, shared tenant-scope helpers, provider/webhook, bootstrap, worker and operator contexts.
4. Use the enhanced audit-db-access utility only after explicit protected read-only authorization to verify live API/migration identities, public relation-kind counts, partition RLS/privileges and the 111-versus-114-versus-116 discrepancy. Do not apply RLS or change grants before this evidence and independent review.
5. Keep PR #138 draft/unmerged. Defer comprehensive unit/API/PostgreSQL/migration/security/tenant/concurrency/E2E/performance tests until implementation and integration are complete; do not consume repeated Actions runs during implementation.

## G-001 confidentiality follow-up — 21 November 2026

The merchant detail and mutation paths now normalize unknown, foreign-organization and same-organization non-member offer IDs to the same 404 response after scope checks. The focused tests and exact-head CI are not yet verified. Remaining acceptance work includes the store lifecycle/inactive-store policy, complete analytics/trend matrix and independent review.

### G-001 inactive-store buyer visibility — 21 November 2026

Buyer product offer lists and ranked seller results now require an ACTIVE owning store. DRAFT stores can still manage offers, but buyers cannot discover those offers before activation. Unit coverage is added; exact-head CI remains pending.

### G-001 live continuation — 21 November 2026

Controller regression coverage now includes foreign-organization offer-list denial, missing-active-organization denial, and revoked/inactive-membership denial on analytics, with assertions that the offer service is not called. The source test increment is committed, but exact-head GitHub Actions verification is pending. Vercel web/admin status contexts currently fail due to external build-rate limits and are not application test results. Continue remaining store lifecycle/service acceptance; G-001 remains PARTIAL and PR #138 remains draft.

### G-001 store lifecycle and tenant-denial matrix follow-up — 21 November 2026

The controller suite now explicitly denies foreign-organization offer-list access, missing-active-organization reads, and revoked/inactive-member analytics access before calling the offer service. It also confirms active members retain merchant offer-management access for DRAFT stores, while buyer discovery remains limited to ACTIVE stores. No SUSPENDED-store behavior was inferred. Exact-head CI and remaining service/HTTP acceptance evidence are pending; G-001 remains PARTIAL.

### G-001 PostgreSQL buyer-visibility fixture correction — 21 November 2026

Catalog lifecycle integration stores are now explicitly ACTIVE for buyer-discovery scenarios, avoiding accidental dependence on the schema's DRAFT default. A real PostgreSQL regression transitions one merchant store to DRAFT and verifies exclusion from both buyer offer list and ranked results while preserving the other ACTIVE store, then restores status. Exact-head CI is pending; this is not yet verified evidence.

### G-001 PostgreSQL detail confidentiality and revoked membership

The disposable PostgreSQL catalog lifecycle suite now tests scope-first merchant offer detail against a foreign-organization merchant and a same-organization non-member, expecting the same not-found class. It also revokes an active store membership, verifies detail access is denied, and restores the fixture. The suite additionally verifies DRAFT stores are excluded from both buyer offer list and ranked results. Exact-head CI is pending; G-001 remains PARTIAL.

### G-001 merchant-staff service acceptance

The PostgreSQL catalog lifecycle suite now exercises an active store MEMBER under a `MERCHANT_STAFF` caller context and confirms offer-detail access succeeds. The temporary membership is deactivated in `finally`. This complements controller tests for all supported merchant roles; exact-head API/PostgreSQL CI and independent security review remain pending.

## G-001 buyer projection and create-reference hardening — 21 November 2026

The buyer-facing product offer endpoint now returns an explicit allowlist of public commercial fields instead of full merchant-offer rows. It excludes merchant metadata, external references, proposer/reviewer identifiers and timestamps, review details, price-list IDs and warehouse IDs. The ranked buyer endpoint no longer returns the internal price-list reference.

Offer creation now enforces the same-store ownership invariant for optional price-list and warehouse references, matching the existing pricing-update behavior. Unit tests cover foreign-store denial, same-store acceptance and the public projection. PostgreSQL integration tests cover cross-store reference rejection without inserting an offer and verify that private offer fields are absent from buyer and ranked responses.

The implementation and documentation are synchronized in this change. Exact-head CI must verify the resulting commit before G-001 status changes. G-001 remains PARTIAL pending full CI, remaining role/tenant acceptance and independent security review. G-002 remains IN PROGRESS. No shared database, staging, migration, grants, RLS, deployment or worker changes were performed.

**Next action:** verify exact-head CI for this change. If green, continue the remaining tenant/role matrix and prepare independent security review; do not authorize staging/business testing while G-002 remains open.

## CI #1259 regression analysis and correction — 21 November 2026

Exact-head CI #1259 exposed two defects. PostgreSQL rejected the correlated `EXISTS` predicate used by the buyer offer relational query because the outer `merchant_offers` reference was not valid in the generated query shape. The store-visibility predicate is being changed to an uncorrelated `store_id IN (SELECT id FROM stores WHERE status = 'ACTIVE')` subquery, preserving the visibility rule without the invalid outer reference. The catalog-offer unit harness also lacked `.limit()` on its selected-query branch, which broke tenant-membership tests; the harness now supports `.getSQL()`, `.limit()` and `.groupBy()` for the relevant query shapes.

CI #1259: lint/typecheck, formatting, mobile, Web/Admin, boundary lint and migration/read-only audit passed. API unit/coverage and PostgreSQL integration failed for the two issues above. The correction is committed with regression coverage; exact-head CI must pass before G-001 advances. No staging/database writes or deployment actions were performed.

**Next action:** verify the corrected store-visibility query and tenant-membership test harness on the next exact-head CI run. If green, complete the remaining G-001 acceptance matrix and independent security review; keep G-002 read-only until its runtime access model is verified.

## Latest exact-head CI regression — 21 November 2026

CI #1265 on `36399ce6704b0774f0ebb0f670a3e7d735b19295` passed lint/typecheck/formatting, Flutter, E6, migration full apply/read-only audit and Web/Admin tests, but failed API unit/coverage and PostgreSQL integration. Five PostgreSQL test suites had explicit Drizzle schema maps without `storeMembers`; the resulting undefined membership query caused offer creation failures and Phase 4 downstream cart/checkout failures. Buyer discovery fixtures also need ACTIVE stores under the new G-001 visibility rule. A grouped test-only correction is being applied; production authorization is not being relaxed. Exact-head CI is still required.

G-001 remains PARTIAL pending verified acceptance evidence and independent security review. G-002 remains IN PROGRESS. Keep PR #138 draft and preserve every staging/database/deployment restriction.

## CI #1266 formatting gate — 21 November 2026

CI #1266 on `52336f751dc2558b10834940034833b4573c5ca4` passed Flutter and lint/typecheck with zero errors, but failed Prettier on nine changed files. API unit/coverage, PostgreSQL integration and all dependent gates were skipped; this run provides no test verification for the fixture correction. Apply the repository-locked formatter and rerun exact-head CI. The production authorization code remains unchanged.

## Exact-head CI #1268 — 21 November 2026

CI [#1268](https://github.com/nabeel2323/scs-platform/actions/runs/44907038784) passed all 10 executable jobs on current branch head `b73f72e34406c1260f214610539139d0d096b2de`. API unit/coverage and PostgreSQL integration both passed, verifying the previously corrected tenant-membership test fixtures. k6 and protected staging release were skipped. G-001 remains PARTIAL only pending independent security review; G-002 remains IN PROGRESS with actual staging API/migration identities, protected read-only staging audit and reviewed least-privilege/RLS design still outstanding.

## G-001 INACTIVE-store visibility regression — CI pending

The PostgreSQL lifecycle suite now includes an explicit `INACTIVE` store scenario for both buyer list and ranked-offer endpoints, with fixture restoration in `finally`. CI #1271 passed all 10 executable jobs on the prior formatted commit but predates this test. CI #1272 on the test commit failed only Prettier, skipping API/integration jobs. Formatter workflow run [#2](https://github.com/nabeel2323/scs-platform/actions/runs/44922086383) succeeded and pushed formatted docs at `cba6fb76ede53efefc2683c3372df1fdb7e6e1a4`; CI #1273 returned `action_required` with zero jobs. Exact-head API/PostgreSQL verification of this test remains outstanding.

**Next action:** obtain a normal exact-head CI run for the formatted branch commit. Do not mark the INACTIVE-store test verified until API unit/coverage and disposable-PostgreSQL integration have actually run and passed. Keep G-001 PARTIAL pending that evidence and independent review; keep G-002 within the read-only/authorized boundary.

**Latest verification:** CI #1275 passed lint/typecheck and Flutter analysis/tests but failed Prettier on five Markdown files. API unit/coverage and PostgreSQL integration were skipped, so the INACTIVE-store regression remains unverified. Format the five files with the repository-locked tool and rerun exact-head CI before closing this acceptance item.

## Latest verification update — 21 November 2026

## Latest verified checkpoint — 21 November 2026

- Branch: `remediation/phase-0-1-tenant-security`; source commit: `ffd3961c32164c2af00090b32dbafb06b997a581`.
- PR [#138](https://github.com/nabeel2323/scs-platform/pull/138) remains open, draft and unmerged; base `develop` is `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Exact-head [CI #1280](https://github.com/nabeel2323/scs-platform/actions/runs/44922582006) completed successfully on that SHA. All 10 executable jobs passed: lint/typecheck/changed-file formatting; Flutter analysis/tests; API unit/coverage; PostgreSQL integration; Web/Admin tests; E6 boundary lint; migration full apply and read-only access audit; container build/smoke; build; and contract/codegen. k6 and protected staging release were skipped.
- The PostgreSQL integration job executed `pnpm --filter @scs/api test:integration` against disposable PostgreSQL 16 and Redis services and passed. The `catalog-lifecycle.e2e.spec.ts` suite, including `hides buyer offers for an INACTIVE store`, is included in that integration test command. The test verifies both buyer list and ranked results exclude the INACTIVE store while the ACTIVE store remains visible, and restores the fixture in `finally`.
- G-001 remains PARTIAL only pending independent security review and disposition of reviewer findings. The review packet is prepared but is not itself an independent review.
- G-002 remains IN PROGRESS. Actual staging API/migration runtime identities and the protected read-only staging audit remain unverified. The connected Supabase Management API `postgres` identity is not a substitute.
- No staging deployment/write, shared database mutation, migration 0070, grants/default ACL change, RLS enablement, environment change or worker activation was performed.

### Remaining work order

1. Independent G-001 security review and reviewer-directed remediation, if any.
2. G-002 actual API/migration runtime identity evidence through the authorized release process; protected read-only staging audit; reviewed per-table least-privilege/RLS design.
3. Continue the remaining finding register in priority order. Keep PR #138 draft and do not make shared database or staging changes.

## G-002 architecture and CI evidence update — 22 November 2026

PR #138 CI [#44948332893](https://github.com/nabeel2323/scs-platform/actions/runs/44948332893) passed the migration full-apply and read-only database-access audit jobs. The CI workflow created a distinct `scs_audit` login with no elevated role flags and only database CONNECT, then ran the audit utility successfully against disposable PostgreSQL 16. The migration runner reported the disposable fixture identity as `scs` with superuser/BYPASSRLS privileges; this is not the live staging migration identity.

PR #142 CI [#44948310469](https://github.com/nabeel2323/scs-platform/actions/runs/44948310469) passed all 10 executable jobs on its then-current source SHA. A follow-up PostgreSQL integration test now exercises the API identity SQL with distinct login/effective roles on a non-owner, non-superuser, non-BYPASSRLS login. Exact-head CI [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) is still running on `dddff20c170737dc4694008bb807b2b90e177f77`; do not claim that added integration test as verified until the run completes successfully.

The G-002 design note [G-002-RLS-ARCHITECTURE-DESIGN.md](../docs/remediation/G-002-RLS-ARCHITECTURE-DESIGN.md) records the transaction-context blocker and proposed sequence. The API currently exposes a process-wide Drizzle pool and service-layer tenant checks; the inspected middleware does not provide a request-bound transaction context. Before RLS, every tenant-aware request must establish transaction-local actor/organization context and route all service queries through the same transaction handle. Workers, webhooks, audit writes and bootstrap paths need explicit contexts too.

No staging identity has been observed. The staging audit workflow remains gated on the workflow revision being present on the default branch and protected staging approval. No staging deployment, shared database mutation, migration 0070, grant/default-ACL change, RLS enablement or worker activation occurred.

## G-002 current blockers — 22 November 2026

- Exact-head PR #138 CI [#44954371615](https://github.com/nabeel2323/scs-platform/actions/runs/44954371615) passed all executable jobs on 741a09f68721898a5bed6601bc3bc636867c78c2. Exact-head PR #142 CI [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) passed all executable jobs on dddff20c170737dc4694008bb807b2b90e177f77, including the new disposable-PostgreSQL identity test. k6 and protected staging release were skipped.
- The new G-002-TABLE-OWNERSHIP-MATRIX.md enumerates 99 Drizzle-exported tables with candidate scope only. It is not the complete 116-table live inventory; exact owner columns/FKs, operation mapping and raw-SQL-only objects remain open work.
- Live API/migration identities and refreshed protected read-only staging audit remain unverified. Keep both PRs draft/unmerged; do not apply migration 0070, alter grants/default ACLs, enable RLS, activate workers or deploy without independent review and explicit authorization.

## Implementation Completion Program — approved 22 November 2026

The immediate programme task is to complete the repository-wide implementation-gap mapping before selecting the next code batch. The [Implementation Completion Gap Register](./IMPLEMENTATION-GAP-REGISTER.md) now records the initial evidence-backed workstreams and the requirements for adding new gaps.

### Programme priorities

1. Finish the whole-product inventory across API/backend, DB/schema/migrations, permissions/tenant boundaries, buyer/merchant web, admin, Flutter, POS/merchant journeys, workers/providers, cross-module workflows and permanent documentation.
2. For each confirmed gap, record exact source paths/symbols/routes/screens, current behavior, required behavior, priority, dependencies and acceptance criteria. Verify whether historical UX/audit issues are already fixed before reopening them.
3. Complete implementation and cross-component integration in cohesive batches. Keep developer checks targeted; do not repeatedly run the full regression suite during every enhancement.
4. Reserve the comprehensive unit/API/PostgreSQL/migration/security/tenant/concurrency/E2E/performance campaign for the dedicated testing phase after implementation and integration are ready.
5. Fix any concrete security/correctness defect immediately when discovered. The later testing phase is not permission to leave known unsafe behavior in place.

### Existing non-negotiable blockers remain

- G-001 remains PARTIAL until a qualified independent review and disposition are recorded.
- G-002 remains IN PROGRESS until actual runtime identity evidence, protected read-only staging audit, complete operation/ownership matrix and reviewed design gates are satisfied.
- PR #138 and PR #142 remain draft/unmerged. No staging deployment, shared DB mutation, migration 0070, grants/default-ACL change, RLS enablement or worker activation is authorized by the programme decision.
- Product-scope decisions such as automatic gateway/payout remain explicit decisions, not implementation assumptions.

## Whole-product inventory findings — 22 November 2026

See [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md) for source paths and qualifications. The following current-source items are now tracked as UX-001–UX-009 in the programme gap register:

- Admin order list/detail lacks an explicit, confirmed admin operational action workflow despite backend order cancellation API support; define the intended state/permission contract before adding controls.
- Admin payments UI provides payment verification/list views but no refund-approval workflow was found, while the API exposes an admin refund approval endpoint.
- Admin dashboard currently surfaces KPIs and pending organization updates, not recent catalog imports or pending catalog requests.
- Admin sidebar has 33 flat navigation entries.
- Merchant Product Studio StepOffer has a raw warehouse-ID field rather than a store-scoped selector.
- Mobile route guards enforce merchant/driver roles, but granular permission-level UI affordances are not mapped.
- SupportModule is empty; basic support-ticket scope needs a product decision.
- The old nearby-offers audit claim cannot be confirmed in the inspected current catalog/offer controllers; reconcile API/contract first.
- Complete route-level permission audit across all admin pages; do not repeat the older blanket assertion because generic ManagementPage has a configured permission gate.

These are implementation candidates, not automatically verified defects or permission to expand future-phase scope.

## G-002 migration crosswalk — 22 November 2026

Migration-source FK evidence now covers core identity/store/catalog/inventory/cart/order/offer/shipping plus payment/return/financial/carrier/operations paths. Important remaining blockers are still open: verify deployed constraints and all relation objects from a refreshed protected read-only catalog snapshot; validate application-maintained org_id fields added in migration 0062; resolve cross-parent consistency where no composite FK exists; verify live API/migration DB identities; and reconcile 114-versus-116. No live DB changes or RLS activation.

## G-002 service and CLI mapping update — 22 November 2026

The operation map now inspects all 53 API service/worker/poller/dispatcher/executor candidates, with 44 DB-operation paths and 9 database-independent helper/provider files. A separate CLI map covers migration/seed/bootstrap/reset/UAT access. Three script-safety corrections were implemented: local admin creation no longer contains or prints a fixed password; reset-pg requires explicit target/typed confirmation and staging approval; M6 environment check uses environment credentials and redacts OTP output.

Remaining work is not closed: complete route-to-service-method-to-table mapping, guard or retire legacy M5/M6 utilities, add uniform staging bootstrap target confirmation, map remaining raw-SQL and physical database objects, and obtain the protected 114-versus-116 catalog evidence. No tests or CI were run, and no staging/shared DB action occurred.

## G-002 physical inventory and controller map update — 22 November 2026

The source-level physical inventory now reconciles the 19-November 114 public r/p count to 99 Drizzle declarations plus _migration_log, backfill_errors and 13 analytics_events partitions. The read-only audit utility now reports relation kinds and partition/policy metadata, but has not been run. The historical 116 count remains unresolved.

The controller-to-service callsite map covers all 28 module controllers. A legacy carrier webhook ambiguity was fixed by rejecting provider-only callbacks when multiple active credentials exist; focused tests are committed but not run.

Remaining implementation: guard or retire legacy M5/M6 scripts, add target confirmation to staging bootstrap scripts, and complete method-level owner predicates. Live API/migration identities and protected catalog evidence remain gated. No tests, CI, staging or shared DB actions occurred.

## G-002 UAT/staging safety update — 22 November 2026

Legacy M5/M6 UAT scripts and both JavaScript migration harnesses now fail closed unless explicitly in development/test with SCS_UAT_CONFIRM=true; DB/API/Redis targets must be local where supplied. The five staging bootstrap scripts and package sequence now require exact staging environment/database/approval confirmation before writes. Unit tests were added but not run. Remaining source work is method-level ownership-predicate mapping and worker/outbox/system context review; live identities and 114-versus-116 remain protected read-only gates.

## G-002 method-level ownership predicate batch 3 — 22 November 2026

Implemented the Pricing/Merchant/Store Membership source batch. PricingService now verifies variant → product → store equality with the owning price list for tier creation, update, removal and resolution. Merchant document listing/download and organization verification listing now require current ACTIVE organization membership; upload requires caller activeOrg equality and validates the optional store's org and ACTIVE store membership. Organization-scoped store/customer reads receive caller context and revalidate membership.

Added focused merchant/pricing tenant-scope specs, not run. The method-level map and gap register are synchronized. Next: Returns/Disputes/Reviews, then carrier/shipping, then worker/outbox/bootstrap/system. No tests/CI, live DB, migration, grant/RLS, staging, deployment or worker action occurred.

## G-002 method-level predicate batch 4 — 22 November 2026

Returns/Disputes/Reviews and financial-control services are now mapped. Fixed cross-store inventory restoration in return inspection; settlement adjustment target org/return-request relationships; and the reconciliation discrepancy endpoint's missing financialOrgScope call plus missing tenant predicate on the UPDATE. Focused tests were added but not run. Next: carrier/shipping, then worker/outbox/bootstrap/system. No tests/CI or live DB/staging actions occurred.

## G-002 method-level predicate batch 5 — 22 November 2026

Carrier/shipping review found and fixed an Aramex credential fallback that could select an arbitrary active credential across organizations. Store-bound tracking/rating/location calls now require store context and resolve only the store's org configuration; unscoped address validation is restricted to PLATFORM credentials. Carrier configuration resolution verifies store and linked credential organization. Shipping/carrier management now checks ACTIVE organization membership; shipment operations and outbox worker verify store/org context; webhook retry requires an active credential. Tests added/updated but not run. Next: worker/outbox/bootstrap/system method-level predicates and protected DB evidence. No worker activation or provider call occurred.

## G-002 worker/system/operator source review — 22 November 2026

The bounded source review now covers return-expiration and auto-completion workers, shipping carrier worker/poller/reconciliation paths, WorkerLeaseService, OpsControlService, P13MonitorService, OpsAlertService, PilotControlService, BootstrapService, AuditService/AuditLogMiddleware and OutboxDispatcher.

Corrections committed:

- ReturnExpirationWorker's lease fence is validated and locked in the claim and escalation mutation transactions.
- WorkerLeaseService no longer allows an expired holder to renew, appear live, record poll success/failure or release the expired lease.
- PilotControlService rejects non-existent organizations and store IDs that do not belong to the target organization.
- OpsAlertService uses an atomic SENDING delivery claim and stale-claim recovery across API instances; migration 0073 updates the open-alert index.

Focused tests were added but not run. Generic OutboxDispatcher currently logs and marks events dispatched; it does not publish to a real event bus. This remains a known functional limitation, not a verified delivery integration. No RLS or DB grants are approved. Live runtime identity/catalog evidence and final testing remain open.

## UX-012/UX-013 and PricingService store-scope follow-up — 22 November 2026

- Mobile merchant price-list and quantity-tier management is implemented in source and linked into merchant offer creation/detail. Focused route/API tests are added but unexecuted.
- Admin order detail now returns and displays product/variant titles and SKU rather than only IDs.
- PricingService variant-tier reads now fail closed without storeId and filter through priceLists.storeId, including the internal product-pricing resolver.
- Next: continue UX-010 re-audit for other concrete, source-confirmed Admin/Web/Mobile gaps. G-002 live identity/catalog evidence and transaction-context/RLS design remain protected gates; no global interceptor, RLS or grants are authorized.

## UX-015 Product Studio save-flow correction — 22 November 2026

- Fixed a concrete wizard correctness defect: Offer-step navigation previously advanced even when the product save returned null, and the intermediate save created the offer before the final Review save ran the same routine again.
- Product/variant persistence is now a separate intermediate operation; final Review creates the offer once. Failed or incomplete saves block navigation. Variant retry skips already-persisted SKUs.
- Added focused tests, not executed. UX-005's warehouse selector was already implemented; stale raw-ID inventory wording is corrected.
- Remaining: continue UX-010 Admin/Web/Mobile re-audit; keep protected G-002 identity/catalog/RLS gates and consolidated test/release campaign open.

## UX-016 buyer cart mutation recovery — 22 November 2026

- Cart quantity/remove/clear requests previously had no local error handling or in-flight lock. Cart read failure could fall through to cart=null and render the empty state.
- Added recoverable mutation feedback and action serialization; failed reads now preserve prior cart data and show a retry action. Focused helper tests added but not executed.
- Next: continue UX-010 source audit on Admin/Web/Mobile screens and integrate remaining workflow gaps. Comprehensive tests remain deferred.

## UX-017 Admin returns oversight recovery — 22 November 2026

- Admin returns list/detail previously had non-retryable read errors; list filter requests could race and overwrite newer data.
- Added shared retryable error states, detail loading/empty states and request-version protection. The return detail reload now resolves asynchronously for the escalation workflow.
- Added focused tests, not executed. Continue remaining UX-010 source audit and implementation; comprehensive test campaign remains deferred.

## UX-018 Mobile cart mutation locking — 22 November 2026

- Mobile cart quantity/remove requests could overlap and the quantity stepper stayed editable during pending writes. Failed quantity writes could leave optimistic text in the field.
- Added shared mutation locking, busy-row feedback, disabled quantity editor and provider-backed reset on failure. Added Flutter widget tests, not executed.
- Continue remaining Admin/Web/Mobile source audit; full test campaign remains deferred.

## UX-019 Admin dispute and evidence timeline recovery — 22 November 2026

- Dispute detail and Events/Evidence read failures previously had no retry controls, and obsolete requests could update the view after navigation.
- Added shared retryable error states, request-version guards and stale evidence clearing. Focused tests added, not executed.
- Continue remaining UX-010 Admin/Web/Mobile source audit and integration; full test campaign remains deferred.

## UX-020 Admin identity/organization detail recovery — 22 November 2026

- User, merchant and organization details previously had non-retryable read failures and no stale-response guard.
- Added retryable error states and request-version protection; user permission catalog failures are isolated to the Permissions tab.
- Added focused tests, not executed. Continue UX-010 re-audit; full tests remain deferred.

## UX-021 Admin dispute resolution workflow — 22 November 2026

- Admin dispute detail previously had no way to invoke the existing resolve API. Added a required resolution form, pending/error/success feedback and resolved-state display using the existing `PATCH /v1/disputes/:id/resolve` contract.
- Service-level platform-admin authorization remains in place; UI does not introduce unsupported refund fields. Focused test added, not executed.
- Continue remaining UX-010 audit; comprehensive test campaign remains deferred.

## Live open-work checkpoint — 22 November 2026

- PR #138 is open/draft/unmerged at `7031cafcd94300421cf314aa6ac3ba3d3ef59651` before the current memory refresh. No exact-head Actions run exists; Vercel Admin/Web are rate-limited failures. The last actual run #44963271498 on older `06cd8fc...` failed changed-file Prettier and skipped dependent tests/build/migration jobs.
- UX-015–UX-021 are implemented in source with focused tests added but not executed. Continue UX-010 re-audit on remaining Admin/Web/Mobile screens and implement confirmed gaps; do not begin the comprehensive suite yet.
- G-001 independent security review and G-002 protected live identity/catalog/operation ownership/transaction-context design remain open. Do not enable RLS or alter shared DB grants/ACLs.
- UX-007 support-ticket scope and UX-008 geospatial/location policy remain blocked on product decisions. OutboxDispatcher remains log-only pending event-bus contract.
- Phase 3 full test campaign and Phase 4 stabilization are still pending.

## UX-022 Admin detail recovery expansion — 22 November 2026

- Remaining Admin catalog/order/role detail screens now have retryable primary read states; import errors and offer inventory tabs distinguish read failures from empty results.
- Role permission-save errors are isolated to the detail page rather than replacing it. Focused tests added but not executed.
- Continue remaining UX-010 Admin/Web/Mobile audit; consolidated tests remain deferred.

## UX-023 Admin ProductDetails offers recovery — 22 November 2026

- Product detail offers read now has a retryable error state and loading state; only a successful empty response renders the empty-offers message. Added request-version protection and a focused test, not executed.
- Continue remaining UX-010 audit; full test campaign remains deferred.

## UX-024 Admin financial read recovery — 22 November 2026

- Payments, Settlements, Reconciliation and Settlement Adjustments now show retryable read failures separately from mutation errors. Empty financial queues are only shown after a successful read.
- Added stale-request protection for tabs/filters and retryable reconciliation run detail. Four focused tests added, not executed.
- Continue UX-010 audit and integration; comprehensive test campaign remains deferred.

## UX-025 Product Studio update/identifier integrity — 22 November 2026

- Existing Product Studio products now receive PATCH updates on later saves, using optimistic-lock `updatedAt`; create/update payloads persist productTypeId and GTIN/EAN/MPN. Save validates store/title.
- Progress navigation is sequential and uses the same save guard; no direct jump can bypass Offer-step persistence.
- Focused tests added, not executed. Full test campaign remains deferred.

## UX-026 / UX-027 Product Studio canonical and media integrity — 22 November 2026

- Existing canonical product selection now reuses the canonical ID and cannot mutate shared identity/specifications/media from the merchant workflow. Variant selection is propagated to the offer API.
- Uploaded media is now attached to merchant-owned products with retry-safe URL deduplication; canonical media is untouched. Focused tests added, not executed.
- Comprehensive test campaign remains deferred.

## UX-027 / UX-028 current UX continuation — 22 November 2026

- UX-027's latest Product Studio source work scopes retry identity to store/product/variant and reconciles existing store offers after uncertain creates; nullable existing prices are handled safely. Helper tests are added but not executed.
- UX-028 mobile buyer returns parity has been implemented in source: Flutter now uses existing buyer return endpoints and mirrors Web reason/quantity collection plus buyer cancel/ship transitions. Model/API tests are added but not executed.
- Continue the UX-010 cross-screen audit and integration mapping. The whole-product test campaign remains deferred until the implementation batch is complete.

## UX-028 exact implementation checkpoint — 22 November 2026

Flutter buyer-return parity is committed as `d7ffc3339db78f16e0f8a9aa7cb551ea28fabdcf`. Focused DTO/API tests were added but not executed; continue the remaining UX-010 source audit and implementation/integration phase before the consolidated test campaign.

## UX-029 — mobile return detail/history parity — 22 November 2026

Source gap: Web's buyer return-detail page presents refund, item, inspection/merchant-note and event-history details, while Flutter initially exposed only a summary. Implemented a retryable detail sheet within the existing Order Detail route using the current owner-authorized endpoint. Focused DTO assertions were added but not executed. No route or permission expansion is required.

## UX-030 — Web buyer self-service recovery — 22 November 2026

The Web Notifications, Favorites, Saved Suppliers and Profile Sessions pages previously hid some read failures or could misreport an empty result. Source implementation `b310f4da3ccda31f7a8c815f1d99ed1977329ad6` adds retryable error states; removal failures remain visible and do not remove rows; notification optimistic-read rollback restores its original state. Focused tests are added but not executed. Continue remaining UX-010 Web/Merchant route audit; do not begin the consolidated test campaign until implementation/integration are complete.

## UX-031 — Merchant Customers read recovery — 22 November 2026

Merchant Customers previously swallowed list-read failures and could show a false empty directory. Source commit `18fe161297b3302c94c2a9df3a0dc24c68b4fbf8` adds a retryable error and preserves previously loaded customers on refresh failure. Focused tests are added but not executed. Continue the remaining UX-010 Web/Merchant screen and permission-affordance audit.

## UX-032 — Merchant Deliveries read recovery — 22 November 2026

Merchant Deliveries previously had no retry action and could show “No deliveries yet” after a failed list read. Source commit `b09dde7d7bd7de9c73f86b8dc5eb6b11271b3d81` adds retry and keeps the empty state distinct from read failure. Focused test added but not executed. Continue the UX-010 Merchant/Web audit.

## UX-033 / UX-034 — Merchant Web workflow recovery — 22 November 2026

UX-033 replaces the manual Merchant Returns Store ID field with the authenticated store directory, supports store/status filtering, and adds retryable store/list/detail reads. Existing API guards remain unchanged (`merchant:orders:read` for listing and `merchant:orders:write` for transitions). Focused tests are added but not executed.

UX-034 makes Merchant Organization verification, update-request, store, warehouse, role and member read failures visible and retryable. Last successful auxiliary data is retained on failed refresh; verified-org updates are blocked while pending-request state is unknown. Focused tests are added but not executed. Continue UX-010 audit; comprehensive testing remains deferred.

## UX-035 / UX-036 — Merchant Orders and Offers read recovery — 22 November 2026

UX-035 corrects the Merchant Orders initial store-directory failure path, adds queue retry/loading feedback, and suppresses the false empty-order state after failed reads. It clears stale order/store data when no accessible store remains. Focused tests are added but not executed.

UX-036 makes Merchant Offers store discovery, offer-list, product-directory, analytics and trend failures explicit and retryable. Failed analytics no longer reports zero sales in the table or CSV, and failed trend reads no longer claim there were no sales. Focused tests are added but not executed. Continue UX-010 audit; comprehensive validation remains deferred.

## UX-037 — Merchant Inventory movement-history read recovery — 22 November 2026

The Inventory movement-history dialog previously swallowed API errors and displayed the same empty state used for a successful response with no movements. It now distinguishes read failure, exposes Retry and uses a small tested read helper. Focused helper tests are added but not executed. Continue UX-010 audit across inventory variant lookup, imports and other remaining workflows.

## UX-038 / UX-039 — Merchant Inventory and Import History recovery — 22 November 2026

The remaining Merchant Inventory and Import History audit found two concrete read-state defects. UX-038's per-product variant lookup silently converted failed variant requests into empty arrays, producing an incomplete picker without an error. UX-039's store lookup swallowed errors and import-job failures could render alongside or as a successful empty history. Both are now implemented with explicit retry/error handling, request guards and focused tests. The new tests have not been executed; both items remain TESTING_PENDING until the consolidated Phase 3 campaign. No API, permission, schema, database, staging, worker or deployment changes were made.

## UX-040 / UX-041 — Merchant Import Wizard — 22 November 2026

The remaining Merchant Import Wizard audit found swallowed store-directory errors and a process/poll lifecycle race. A failed store lookup was indistinguishable from no store and had no retry. The polling interval could race the process response, ignore status-read errors indefinitely, survive component unmount, and display FAILED jobs as successful completion. Both items are implemented with focused tests added but not executed. They remain TESTING_PENDING for the consolidated test campaign. No API, permission, schema, database, queue or worker behavior changed.

## UX-042 — Merchant Warehouses — 22 November 2026

The Merchant Warehouses page conflated failed store lookup with no store and failed warehouse-list reads with a successful empty directory. Both reads now have explicit loading/error/retry handling; the warehouse empty state appears only after a successful empty response. A focused test was added but not executed. UX-042 remains TESTING_PENDING for the consolidated test campaign. No API, permission, schema or database behavior changed.

## UX-043 — Admin Dashboard — 22 November 2026

Admin Dashboard KPI and organization-update reads previously swallowed failures, and Catalog Imports/Requests shared one error state. The dashboard now has independent retryable reads, suppresses false empty states, shows KPI values as unavailable instead of zero after failed reads, and retains last successful data during failed refreshes. Focused test added but not executed. UX-043 remains TESTING_PENDING for the consolidated campaign. No API or permission change.

## UX-044 — Admin KPI Dashboard — 22 November 2026

The dedicated KPI Dashboard silently swallowed read failures, offered no retry and allowed overlapping date-range reads to race. It now has explicit retryable errors, request-version protection and stale-data preservation; initial failures show unavailable metrics rather than zero defaults. Focused test added but not executed. UX-044 remains TESTING_PENDING for the consolidated campaign. No API or permission change.

## UX-045 — Admin Organizations — 22 November 2026

The Organizations page previously coupled the directory and update-request queue through one `Promise.all`; a single failure blocked both and could render false empty states. These reads are now independent with retryable errors, request-version guards and successful-empty-only rendering. Focused test added but not executed. UX-045 remains TESTING_PENDING for the consolidated campaign. No API or permission change.

## UX-046 — Admin User Management — 22 November 2026

The Admin User workflows had several correctness and discoverability gaps: phone was incorrectly required, organization/role lookup failures were hidden, partial initial memberships were silently ignored by the service, the dedicated detail route lacked profile and membership controls, and the permissions tab misrepresented the global catalog as user-effective permissions. These are now corrected using existing endpoints plus a service-level org/role-pair invariant. Focused Admin/API tests were added but not executed. UX-046 remains TESTING_PENDING for the consolidated Phase 3 campaign; no schema, migration or new permission change.

## UX-047 — Admin Merchant Store Detail — 22 November 2026

The existing store detail response included branding, address, locale and popularity-badge visibility, but the Admin detail view did not present most of those fields. The detail page now displays them using the existing endpoint. A focused test was added but not executed. UX-047 remains TESTING_PENDING; no API/permission/schema/database change.

## UX-048 — Admin Roles List — 22 November 2026

The Roles list previously showed a terminal read error without a retry action and had no stale-response/unmount protection. It now exposes retry and request-version guards. Focused test added but not executed. UX-048 remains TESTING_PENDING; no API or permission change.

## UX-049 — Admin Audit Log — 22 November 2026

Audit Log filter requests could overlap and older responses could overwrite newer filter results. The page now guards all result/error/loading updates by request version, invalidates pending requests during cleanup and exposes Retry audit log on failures while retaining last successful rows. Focused race/retry test added but not executed. UX-049 remains TESTING_PENDING; no API or permission change.

## UX-050 — Admin Category Detail — 22 November 2026

Category Detail previously swallowed failures in linked product-type, products and attribute-schema reads, allowing partial/empty panels to masquerade as complete. The Attributes tab also depended on the Product Types tab having been visited first. These reads now have retryable independent error states and request guards; attribute aggregation is complete-or-error. Focused test added but not executed. UX-050 remains TESTING_PENDING.

## UX-051 — Admin Product Type Detail — 22 November 2026

Product Type Detail's Products tab swallowed failures and displayed “No products.” It now has a retryable error state, successful-empty-only presentation and request cleanup guards. Focused test added but not executed. UX-051 remains TESTING_PENDING.

## UX-052 — Admin Catalog Import Center — 22 November 2026

Catalog Import Center conflated failed history reads with an empty import history and offered Dismiss instead of retry. It now has a separate retryable history error, preserves last successful rows and guards stale responses. Focused test added but not executed. UX-052 remains TESTING_PENDING.

## UX-053 — Admin Analytics — 22 November 2026

Analytics date/limit requests could race and stale results could overwrite newer filters. Event/activity reads now have independent request-version guards, cleanup invalidation and direct retry actions. Focused test added but not executed. UX-053 remains TESTING_PENDING.

## UX-054 — Admin Commission Oversight — 22 November 2026

Commission reversal status-filter requests could race; errors could coexist with a false empty state. The page now has request-version guards, retry and successful-empty-only rendering. Focused test added but not executed. UX-054 remains TESTING_PENDING.

## UX-055 — Admin Offer KPI and Trend — 22 November 2026

Offer KPI/Trend filters could race, errors had no direct retry, and failed initial reads could display zero/empty sales. The pages now guard request generations, expose retry and distinguish unavailable data from successful empty results. Focused tests added but not executed. UX-055 remains TESTING_PENDING.

## UX-056 — Admin Brands — 22 November 2026

Brand directory read failures lacked retry and could render “No brands found.” The page now has retry, request-version protection and successful-empty-only rendering. Focused test added but not executed. UX-056 remains TESTING_PENDING.

## UX-057 — Admin Business Calendar — 22 November 2026

Business Calendar read failures lacked retry and could be mistaken for no configured calendar; dependent holiday/audit empty states were also ambiguous. The page now guards requests, exposes retry and suppresses false empty states. Focused test added but not executed. UX-057 remains TESTING_PENDING.

## UX-058 — Admin Attribute Groups and Definitions — 22 November 2026

Attribute Groups/Definitions previously showed empty result states/counts after failed reads despite a visible error; Attribute Definitions also lacked stale-response protection across filters. Both pages now guard requests, expose accessible retryable errors and suppress false empty results. Focused tests added but not executed. UX-058 remains TESTING_PENDING; no API/permission/schema/database change.

## UX-087 / UX-088 — Mobile Merchant Offer Detail and Inventory — 23 November 2026

Both Mobile Merchant Offer Detail and Inventory read-recovery slices are implemented. Offer Detail preserves last-successful offer/analytics data, exposes retry and does not equate failed analytics with zero sales. Inventory preserves the active store and last successful inventory page, refreshes inventory/warehouse reads independently, and exposes retry for warehouse lookup failures. Focused Flutter tests were added for both areas but have not been executed; both remain TESTING_PENDING for the consolidated Phase 3 campaign. No API, permission, financial, offer lifecycle, stock mutation, warehouse transfer, database or migration behavior changed.

**Next implementation:** continue the remaining Mobile merchant operational screens (pricing, customers, orders and store/profile workflows) with a source-first audit, then complete the outstanding Web/Admin route and action permission mapping. Do not reopen UX-078–UX-088 without new source evidence.

## UX-089 / UX-090 — Mobile Merchant Pricing and Customers — 23 November 2026

Mobile Pricing list/detail and Merchant Customers read-recovery work is implemented. Pricing now retains last-successful price lists and quantity tiers, exposes retry, awaits refresh, and avoids reporting a failed initial tier read as zero. Customers retains the last successful directory and derived statistics, exposes retry, and supports pull-to-refresh without losing search/sort state. Focused Flutter tests were added but have not been executed; both remain TESTING_PENDING for Phase 3. No API, permission, pricing/stock mutation, customer/order/financial, database or migration behavior changed.

**Next implementation:** continue the remaining Mobile merchant workflow audit (especially Merchant Orders and store/profile route transitions), then complete the outstanding Web/Admin route and action permission mapping. Do not reopen UX-078–UX-090 without new source evidence.

## UX-091 — Mobile Merchant Orders refresh lifecycle — 23 November 2026

The Merchant Orders queue now awaits active-store/order refresh, supports pull-to-refresh, preserves the last successful queue during refresh/reload failures and keeps a successful empty order history refreshable. Existing order action permission checks, confirmation steps, idempotency and fulfillment behavior are unchanged. Three focused Flutter widget scenarios were added but have not been executed; UX-091 remains TESTING_PENDING for Phase 3. No API, order transition, stock reservation, fulfillment, database or migration behavior changed.

**Next implementation:** continue the source-first audit of Mobile Store Profile and remaining merchant route transitions, then complete the outstanding Web/Admin route and action permission mapping. Do not reopen UX-078–UX-091 without new source evidence.

## UX-092 — Mobile Merchant Store Profile and warehouse recovery — 23 November 2026

Mobile Store Profile now awaits its store-directory/active-store/warehouse refresh chain, supports pull-to-refresh, preserves last-successful store details during refresh failures and provides independent warehouse retry/stale-data handling. Three focused Flutter widget scenarios were added but have not been executed; UX-092 remains TESTING_PENDING for Phase 3. Store update and warehouse creation behavior, permissions and API contracts are unchanged.

**Next implementation:** finish the remaining Mobile merchant route-transition/source audit, then complete the outstanding Web/Admin route and action permission mapping. Do not reopen UX-078–UX-092 without new source evidence.

## UX-093 — Organization and authenticated-session context invalidation — 23 November 2026

Organization switching now invalidates merchant/store-scoped client caches in both switch entry points; active-store resolution filters against the selected organization and never falls back across orgs. Login clears the persisted previous active-org selection and resets authenticated caches; logout clears in-memory identity and authenticated caches in addition to stored tokens. Focused ProviderContainer tests were added but have not been executed; UX-093 remains TESTING_PENDING for Phase 3. This is client cache/context correctness, not a replacement for backend tenant authorization. No API, permission, database, migration, RLS, worker or staging changes occurred.

**Next implementation:** finish the Mobile route permission and organization-context transition audit (including route guards and remaining route refresh semantics), then complete the outstanding Web/Admin route and action permission mapping. Do not reopen UX-078–UX-093 without new source evidence.

## API typecheck correction batch — 23 November 2026

The API TypeScript diagnostics exposed by CI #1380 have source/test corrections committed on PR #138. The fixes cover explicit P13 escalation authority in integration tests, the worker's fenced-lease outcome union, the Admin order-item product join, two test fixture typings/contracts, and authoritative order → store organization resolution for settlement adjustments. This work is **IMPLEMENTED / NOT VERIFIED**: no typecheck or tests were run after the correction batch, and the current head has no CI run because the commits use `[skip ci]`. Keep the consolidated Phase 3 validation gate. Do not treat CI #1380 as passing or as verification of the corrective commits.

**Next implementation:** continue the Mobile route permission and organization-context transition audit, then complete remaining Web/Admin route/action permission mapping.

## UX-094 — Mobile category directory/API permission mismatch — 23 November 2026

The merchant category directory is now read-only for merchant roles and requires `catalog:categories:read`; the Home/Dashboard entry uses the same permission. New/Edit/Delete controls are hidden because the API currently restricts category mutations to ADMIN/MODERATOR with `catalog:categories:write`, while the router excludes those roles from the merchant route. Focused policy tests now cover the category rule/helper and a 13-route merchant deep-link permission matrix; they were added but not executed. Client alignment is IMPLEMENTED / TESTING_PENDING.

**Still blocked:** choose whether merchant-owned categories should be supported with store-scoped ownership + active membership enforcement in the API, or whether category CRUD belongs exclusively on a platform-admin route. Do not weaken API role guards or restore merchant write controls before that decision.

**Next implementation:** finish the Mobile route permission and org-context transition audit, then Web/Admin route/action permission mapping.

## Current client implementation continuation — 23 November 2026

- UX-094 Mobile merchant category permission/contract alignment is implemented; actual merchant-owned category CRUD remains blocked pending an API/product ownership decision.
- UX-095 Web merchant route/action permission alignment and active-organization context invalidation is implemented; focused tests are added but not executed.
- UX-096 Mobile route/action permission and organization-context transition alignment is implemented; focused route and driver-assignment tests are added but not executed.
- G-036 realtime store/order room authorization is implemented in source with focused gateway tests added but not executed.
- **Next:** finish the remaining Admin route/action permission mapping. Comprehensive testing remains deferred to the consolidated testing phase.

## UX-100 — Admin settlement adjustment rejection action — 23 November 2026

The Admin settlement-adjustment page now exposes the existing API rejection operation for pending-approval adjustments. Only users with `admin:adjustments:approve` see the Reject action; submission requires a reason and sends the API's `{ reason }` payload. This closes a UI workflow omission without changing backend permission or financial transition logic. Focused tests cover the rejection request and read-only visibility but have not been executed; UX-100 remains IMPLEMENTED / TESTING_PENDING for Phase 3.

**Next implementation:** continue the remaining Admin custom action-handler audit, especially direct mutation handlers outside the shared `useAdminMutation` path. Do not repeat the completed 56-page route audit or UX-097–UX-100.

## UX-101 — Catalog governance action guards and Product Type publish correctness — 23 November 2026

Product Type list/create/category-update and Builder save/publish handlers now recheck `catalog:product-types:manage`; the Builder does not publish when saving dirty configuration fails. Catalog Import Center gates its reads and import/report/template/export actions on `catalog:imports:manage`, with single-flight upload/execute/retry. Attribute and Attribute Group mutation forms recheck `catalog:attributes:manage`. A focused test covers failed Product Type Builder save preventing Publish; it has not been executed. UX-101 remains IMPLEMENTED / TESTING_PENDING for Phase 3.

**Next implementation:** continue the remaining Admin operational UX/source audit beyond permission mapping. Do not repeat UX-097–UX-101.

## UX-102 — Product editor action-time permission guard — 23 November 2026

The shared ProductForm used by Admin product create/edit routes now receives and rechecks `catalog:products:write` at Save dispatch and prevents duplicate create/update submissions with a ref-backed guard. The API continues enforcing the same permission. No ProductForm-specific test was added; UX-102 remains IMPLEMENTED / TESTING_PENDING for Phase 3.

**Next implementation:** continue the remaining Admin operational UX/source audit beyond permission mapping. Do not repeat UX-097–UX-102.

## UX-103 — Product Type stale-response suppression — 23 November 2026

Product Type list/filter and selected-schema reads now use request-version guards so stale responses cannot overwrite the current selection. Product Type Builder schema/attribute/readiness loads invalidate stale requests on route-ID or access changes. No focused regression test was added. CI #1419 passed lint/typecheck and Flutter analysis/tests but failed the accumulated Prettier gate (254 files); Web/Admin tests and dependent gates were skipped. UX-103 remains IMPLEMENTED / TESTING_PENDING for Phase 3.

**Next implementation:** continue the remaining Admin operational UX/source audit beyond permission mapping. Do not repeat UX-097–UX-103.

## UX-104 — Catalog Requests action guards — 23 November 2026

Catalog Requests Approve/Reject now recheck `catalog:requests:manage` at dispatch and prevent duplicate submissions. RejectDialog receives the permission capability and requires a reason. Tests cover approval single-flight and rejection payload/reviewer identity; they have not been executed. UX-104 remains IMPLEMENTED / TESTING_PENDING.

## UX-105 — Dashboard protected-read gating — 23 November 2026

Data Quality and KPI Dashboard now check their respective route permissions before starting initial reads or retries, and invalidate stale requests on access changes. Tests assert unauthorized users do not trigger the protected API reads; they have not been executed. UX-105 remains IMPLEMENTED / TESTING_PENDING.

**Next implementation:** continue the remaining Admin operational UX/source audit beyond permission mapping. Do not repeat UX-097–UX-105.

## FIN-001 — Refund approval serialization and idempotency — 23 November 2026

Source implementation is complete at `117614884ff1e0d50ca116f0b28f249fd83761c0`. Refund approvals now serialize on the payment row before recalculating the successful refund total; identical request retries reuse the existing refund by idempotency key, and mismatched key reuse conflicts. PostgreSQL regression scenarios FIN-DSH-11/12 were added but not executed. This is IMPLEMENTED / TESTING_PENDING, not verified. G-012 remains OPEN and unchanged: no automatic gateway or payout scope was introduced.

### FIN-002 — Settlement calculation idempotency

**Status: IMPLEMENTED / TESTING_PENDING.** The settlement calculation now locks the payment row and reuses an existing active settlement instead of creating a duplicate. If a settlement has reached PAID or an adjustment record exists, recalculation is rejected and the explicit settlement-adjustment workflow remains required. PostgreSQL scenarios FIN-DSH-13–15 are added but not executed. The service also refuses settlement calculation until payment is CONFIRMED, CAPTURED, PARTIALLY_REFUNDED or REFUNDED. No schema/migration or payout behavior changed.

Next: continue source-first review of payment and settlement transitions; keep automatic gateway/payout scope unchanged.

### FIN-003 — Minor-unit amount validation

**Status: IMPLEMENTED / TESTING_PENDING.** Manual payment verification, COD cash confirmation, refund requests and settlement confirmed amounts now require positive safe integers in minor units. This prevents zero, negative, fractional and unsafe-number values from entering financial records. No new maximum/equality rule was added for received amounts. FIN-DSH-16 covers invalid values and unchanged payment state; not executed.

## FIN-004 — Settlement lifecycle event consistency — 23 November 2026

- Settlement calculation previously wrote the unrelated `PAYMENT_REFUND_SUCCEEDED` payment-history event; marking a settlement PAID emitted neither immutable payment history nor an outbox event.
- Calculation now writes `PAYMENT_SETTLEMENT_CALCULATED`. `markSettlementPaid` locks the settlement row and atomically validates CALCULATED/DUE, updates PAID, appends `PAYMENT_SETTLEMENT_PAID` with actor/amount/reference metadata, and publishes `payment.settlement_paid`.
- FIN-DSH-13 asserts one calculation history event and one outbox event. FIN-DSH-17 races two pay attempts and asserts exactly one winner, one PAID history event and one outbox event. Tests not executed.
- Source commit: `50f544a98dc8d9b84d8a3709b250425df48c4d5a`; focused test commit: `def9131ba94699150cb896a23eb171eab0ae5a00`.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway/provider/automatic payout, staging, shared database or deployment change. G-012 remains OPEN.

## FIN-005 — COD order payment projection consistency — 23 November 2026

- COD cash confirmation previously updated `payment_records.status` but left the denormalized `orders.payment_status` stale. COD orders may already be DELIVERED before cash collection, so the fix updates only `payment_status` and does not rewind the fulfillment/order status.
- The order projection update is in the same transaction as the payment transition, payment event and outbox event.
- FIN-DSH-18 verifies the payment is CONFIRMED, order status remains DELIVERED, order payment_status becomes CONFIRMED, and one PAYMENT_CONFIRMED event is persisted. Not executed.
- Source/test commit: `51d7d9c8a6a26450f9cbc1dd32d0a6779513acd9`.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration or staging/shared database/deployment action.

**Next:** continue source-first audit of financial state transitions and their event/outbox semantics. Do not expand automatic gateway or payout scope.

## FIN-006 — Dispute refund idempotency payload integrity — 23 November 2026

FIN-006 is IMPLEMENTED / TESTING_PENDING. The dispute-resolution recovery path now reuses an orphan refund only when payment/order, amount, reason, requester, currency and dispute link match the retry. FIN-DSH-20 adds PostgreSQL cases for amount and reason mismatch; tests not executed. Source/test commit: `9899113a4f574d2733b957d2f1b489e35a71fe0f`. No schema, migration, provider, payout, staging or shared database changes.

**Next:** continue source-first financial and operational correctness review; keep the full test campaign grouped in Phase 3.

## FIN-007 — Refund approval order payment projection — 23 November 2026

FIN-007 is IMPLEMENTED / TESTING_PENDING. Refund approval now updates the denormalized order payment state atomically with the payment/refund transition, while preserving order fulfillment state. FIN-DSH-21/22 add PostgreSQL coverage for partial/full refunds; tests not executed. Source/test commit: `5b68edac4d148f68656b4331a9612cd1752eab3d`. No schema, migration, provider, payout, staging or shared DB changes.

## FIN-008 — Return refund idempotency payload integrity — 23 November 2026

FIN-008 is IMPLEMENTED / TESTING_PENDING. Return orphan-refund recovery now reuses a refund only when payment/sub-order, amount, reason, buyer/requester, currency and return link match. FIN-DSH-24/25 add PostgreSQL amount/reason mismatch cases; tests not executed. Source/test commit: `72927529e64a719741b94b864f6adba7cafd4f0d`. No schema, migration, provider, payout, staging or shared database changes.

## 2026-11-23 — FIN-009 through FIN-013 and payment expiry history guard

- FIN-009: dispute resolution now uses compare-and-set to prevent duplicate RESOLVED events/outbox messages; commit `2b8e2fa7cf2aab87d4186153a61748bc82805c52`.
- FIN-010: return refund settlement adjustment locks the settlement row and serializes against mark-paid; commit `a1dc7b2cf31c83f2a59c0a72f0056f4955fe7143`.
- FIN-011: return orphan-refund recovery validates payment/sub-order, amount, reason, buyer, currency and return linkage; commit `72927529e64a719741b94b864f6adba7cafd4f0d`.
- FIN-012: post-refund settlement adjustment preserves original settlement currency; commit `ba3318724c3080d4c29baee1c81e972262e14ac4`.
- FIN-013: payment expiration appends order cancellation history only when the conditional order update succeeds; source `028e30e9ebeb626b51b6d80bc28467c9c946c419`, test `83550c34c7dc11492fc6e5c5fc6fcb418b79243c`.
- FIN-DSH-11–28 added but not executed. All remain IMPLEMENTED / TESTING_PENDING.
- CI #1427: lint/typecheck and Flutter passed; changed-file Prettier failed (258 files); dependent API/Web/Admin/PostgreSQL/build/release jobs skipped. CI #1429 was cancelled. CI #1434 must be checked at its exact SHA.
- No schema/migration, gateway/provider/automatic payout, staging/shared DB, grants/RLS, deployment or worker changes.

**Next implementation:** continue the source-first financial and operational correctness audit beyond FIN-013. FIN-DSH-11–28 remain unexecuted; consolidate formatting and full API/PostgreSQL/Web/Admin/mobile validation in Phase 3 after implementation gaps are complete.

## FIN-014 — Discount-adjusted commission reversal and currency integrity

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Return commission reversal now allocates order-level discounts proportionally over returned goods and preserves the original payment currency in the commission reversal and settlement adjustment records. PostgreSQL FIN-DSH-29 covers a partial discounted return and verifies both ledgers. Test not executed. Source commits: 6221c9c10bba4652b19c1aeaca59a8d1c3d9c79d and 00da339e62dbeef87a55434b3ed5ea1a85cb6508.

## FIN-015 — Exact commission reversal arithmetic

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Proportional commission reversal now uses a shared BigInt helper in both return settlement adjustment and commission reversal posting. It avoids Number precision loss when individually safe integer amounts multiply to a product above Number.MAX_SAFE_INTEGER. A unit regression demonstrates the one-minor-unit error prevented. Test not executed. Source commits: 917397ffd5491d6fe52a18063c0266e831b67c38, e2338cf1e50e825bd1c22becbeab0a6a4757a5e4, a596d49a752973cdc1b7039f3b325f0421252c9c; test commit: 4e67e5ef7541e87ef5d9698e3abad7529cd07219.

Next: continue the source-first financial and commercial correctness audit, especially settlement/reversal reconciliation and persisted financial event consistency. Keep all automated validation grouped in Phase 3; do not expand automatic gateway or payout scope.

## FIN-016 — COD excluded from stale-payment expiry

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Stale-payment reconciliation previously selected every AWAITING_PAYMENT/AWAITING_VERIFICATION record, including CASH_ON_DELIVERY. Because COD is collected at delivery, it must not expire after the bank-transfer payment window. The candidate query now excludes COD and expirePayment independently rejects direct COD expiry. FIN-DSH-30 covers a stale COD payment on a DELIVERED order, unchanged payment/order state and absence of PAYMENT_EXPIRED events. Source commit 68b5251200f9f3765a0568b796db056a18cd878e; test commit 6ff2a4788c5f2a98c5866cfd0d321cea9948c4ac. Test not executed.

Next: continue the source-first payment and return lifecycle audit; keep Phase 3 formatter and full API/PostgreSQL verification grouped. Do not introduce gateways or automated payouts.

## FIN-017 — Exact return refund allocation and delivery-fee currency

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Return refund amounts previously used floating-point ratios for discounts and VAT, and delivery-fee exception adjustments hardcoded SYP. The return financial helper now uses BigInt-backed proportional minor-unit rounding, validates safe integer inputs, and preserves the payment currency in delivery-fee adjustments. FIN-DSH-31 covers a partial return and currency consistency. Source 122edb4bf1dc67ba01bfc33b97809cc037781f87; test e6823ee9b1c68f5b71229ffbda17c9f525b66565. Not executed.

## FIN-018 — Concurrent return creation serialization

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Return creation checked active returns, cumulative quantities and refundable amount outside the transaction; concurrent requests could both pass and create active requests. It now locks the payment row and rechecks eligibility, active return, returned quantity and refundable balance before insert. FIN-DSH-32 holds the payment lock while two return requests race and asserts exactly one active request commits. Source 8a8364899f08180da9213be4d897a65fac9a897d; test 705609fa2928d6e12e393b59bb990cfe0cf2343c. Not executed.

Next: continue the source-first returns/payment lifecycle audit. Keep the full formatter, API unit and PostgreSQL verification grouped in Phase 3; do not expand gateway or automatic payout scope.

## FIN-019 — Settlement adjustment posting integrity

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Posting a COMMISSION_REVERSAL previously wrote a negative settlement net despite representing a merchant credit. Posting could also mark an adjustment POSTED without a primary settlement ledger row. The service now applies type-specific sign semantics, validates positive safe-integer minor-unit amounts, locks the primary settlement row, and rejects posting until that ledger exists. FIN-DSH-33 verifies positive commission-reversal net; FIN-DSH-34 verifies an approved adjustment remains unposted/unlinked when no settlement exists. Unit cases cover credit/debit signs. Tests not executed.

Source commits: `968fa110fb77efcc98c5a892c5ed69029347fc8e`, `b2f0dc49b85d65dac0eaf631bf6fab7beaba8cae`. No schema/migration or automatic gateway/payout scope change.

**Next:** continue source-first financial and operational correctness review beyond FIN-019. Keep the consolidated formatter/API/PostgreSQL/Web/Admin/mobile campaign grouped in Phase 3; preserve the G-012 manual-payment-only scope.

## FIN-019 scenario IDs

Settlement-adjustment regression cases are FIN-DSH-34 (commission reversal positive net) and FIN-DSH-35 (posting blocked without a primary settlement); FIN-DSH-33 remains the pre-existing return-idempotency case. Tests are added, not executed. Continue source-first financial correctness review beyond FIN-019; preserve consolidated Phase 3 validation and the G-012 manual-payment-only scope.

## FIN-020 — Reconciliation arithmetic and discrepancy persistence

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** The reconciliation path previously recalculated every settlement row with primary-settlement signs, misclassifying positive commission-reversal credits in `ADJUSTMENT` rows. It also attempted to store refund-status text in BIGINT monetary discrepancy columns, used Number aggregation for reversal totals, and used floating-point delivery-fee VAT caps that did not match the return writer.

The implementation is in `ad478cc53ce40bec86172e881b4f14cea7e6dfac`. It applies row-status-aware ledger signs, BigInt-safe reversal aggregation, the shared half-up delivery-fee allocator, covers both delivery-fee refund adjustment types, validates source minor-unit values, and keeps refund status evidence non-monetary. Unit tests and PostgreSQL FIN-DSH-36 are added but **not executed**. No schema/migration or shared DB/staging mutation.

**Next:** FIN-021 audit reconciliation run version allocation, `superseded_by` direction, concurrent execution, and failure/partial-record handling. Verify the intended semantics before changing persisted history.

## FIN-021 — Reconciliation run lifecycle integrity

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Reconciliation version allocation was an unlocked read-then-insert and its unique index omitted organization scope. The service wrote `superseded_by` on the new run to point backward, and run/discrepancy writes were not atomic.

Implementation commit: `e2dcb43e37d2a67a72d0891c4c3519d19719b5ae`. The service now serializes versions using a tenant/period/currency advisory lock; makes run creation, checks, discrepancies and completion transactional; rolls back all partial state on failure; and best-effort persists a clean FAILED run. Supersession links now point predecessor-to-successor. Migration 0074 repairs historical links and adds tenant-aware uniqueness with NULLS NOT DISTINCT. FIN-DSH-37/38 added; tests not executed. Migration is not applied to shared/staging.

**Remaining:** validate migration and integration scenarios in the consolidated Phase 3 campaign; inspect existing historical data assumptions in isolated CI; preserve all live database and staging restrictions.

**Next:** FIN-022 immutable financial event/history and transactional outbox consistency audit across payment, settlement, refund, return, dispute and settlement-adjustment transitions.

## FIN-022 — Financial history/outbox consistency

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** The audit found missing outbox messages for payment creation and the CREATED → AWAITING_PAYMENT transition, non-transactional dispute open/evidence/response history writes, missing dispute evidence/response outbox events, missing settlement-adjustment creation notification, and a generic outbox poller that did not claim rows across instances.

The changes add transactional producer/history/outbox parity for those paths and an atomic `FOR UPDATE SKIP LOCKED` dispatcher claim with five-minute leases and owner-conditional finalization. PostgreSQL FIN-DSH-39–42 and unit coverage are committed in `3784bca3dd9a21fa3123e555aebbdd13addfb21b`, `a77339ab1b50d881fc006a16b9613505458fcd27`, `ccde36322f9bcfd12f2de2bfad22390cd9b7f503`, `5d7eadf07e11801813a606dfeeda60b83c16eb19`, `e761195829d3fcd4bc2d9d0eecfd848188c32d53`. Tests not executed. The dispatcher remains logging-only; no external event bus integration is claimed.

**Next:** FIN-023 — inspect BANK_TRANSFER checkout's post-commit order/payment state transition and dispute-refund split transaction recovery. Confirm idempotency and crash/retry behavior before refactoring.

## FIN-023 — Checkout and dispute-refund atomicity

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** BANK_TRANSFER checkout previously committed the order/payment creation, then changed order and payment states in best-effort post-commit operations; a failure could leave PAYMENT_PENDING order with CREATED payment. Dispute refund creation and dispute resolution also used separate transactions, allowing an orphan refund if the final dispute/outbox write failed.

Implementation commits: `a5fa4806e310159b6f2708d366764ffe4fa3892f`, `442b03a77e4645fba01b8f33d3d2351265365b9d`, `71c8acb5a890a8b7350915cc4eca80dd6104874c`. BANK_TRANSFER state/history/outbox now commit with checkout. Dispute resolution locks the dispute and calls requestRefund using the same transaction client; refund/payment event/outbox and dispute state/history/outbox commit or roll back together. Legacy orphan-refund idempotency recovery remains supported. FIN-DSH-43/44/45 added; tests not executed.

**Next:** FIN-024 — audit payment proof storage upload versus DB transaction failure, orphan cleanup, retry and replacement semantics. Cleanup must never delete a previously committed proof.

## FIN-024 — Payment proof upload lifecycle

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** The payment proof API accepts bounded multipart uploads while retaining receipt URL/reference compatibility. FIN-025 closes the process-crash orphan window with durable per-object intents, atomic payment/event/outbox commit, and bounded exact-key cleanup. Previous managed proofs are retired through a cleanup intent created in the same transaction as the replacement; external URLs are never deleted.

Commits: `7f6e3a949975511b5be56470c0dd427dc92ba16d`, `41c8db370a30124e981c42c1e7d7b8487771e8ec`, `a457d352d0ee71e6e020f164e838f5a02a81c512`. FIN-DSH-46–53 cover failed/uncertain uploads, replacement lifecycle, stale cleanup, global payment-reference preservation, retries, concurrency and retired-proof recovery. Tests not executed; migration 0075 is source-only and cleanup is not scheduled or activated.

**Remaining gate:** execute isolated migration and PostgreSQL scenarios during the consolidated Phase 3 campaign. Do not activate a cleanup worker or run migration 0075 against a shared database under the current restrictions.

### FIN-024 follow-up — uncertain upload response

FIN-024 moved payment transition validation ahead of storage writes. FIN-DSH-48 now verifies that an uncertain putObject response leaves a durable cleanup intent; FIN-025 provides the bounded recovery path. Test not executed.

## FIN-025 — Durable payment-proof upload recovery

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Every generated object key is recorded before upload. Payment row, immutable event, outbox event and new proof intent commit atomically. Replaced managed proofs receive cleanup intents in the same transaction. The callable cleanup method claims only stale intents with SKIP LOCKED and fenced leases, checks all payment rows for references, HEADs/DELETEs only the exact recorded key, and applies bounded exponential retry with terminal FAILED state.

Migration 0075 is source-only. The cleanup method is not registered with a scheduler, worker or route and has not been activated. FIN-DSH-46–53 are added/updated but not executed. No bucket listing or broad deletion is used.

**Next:** FIN-026 — audit and correct payment event actor attribution where both administrators and merchant users are authorized to perform the same financial transition.

## FIN-026 — Payment event actor attribution

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Payment verification, COD cash confirmation, and privileged return transitions now persist ADMIN versus MERCHANT/BUYER based on the authenticated caller, rather than hardcoding the nominal role. FIN-DSH-54 verifies merchant verification and administrator cash confirmation; FIN-DSH-55 verifies administrator overrides of merchant-side and buyer-side return transitions.

No migration is required. Tests remain pending the consolidated Phase 3 campaign.

## FIN-027 — Return refund balance aggregation

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Return-side refund aggregation now includes APPROVED reservations and avoids PostgreSQL 32-bit SUM(bigint) overflow using exact BigInt handling. FIN-DSH-56 is added but not executed. CI #1446 syntax blockers in the returns and settlement-adjustment services were corrected; no exact-head CI rerun has been performed.

**Remaining:** run FIN-DSH-56 and review other refund/reconciliation aggregate consumers during the consolidated Phase 3 campaign. Do not apply migrations or change shared database state.

## FIN-028 — Settlement calculation actor attribution

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Admin-only settlement calculation now records ADMIN rather than SYSTEM in immutable payment event history. FIN-DSH-57 is added but not executed. No migration is required. Execute the regression during the consolidated Phase 3 campaign and continue reviewing the remaining payment/refund/reconciliation event producers.

## FIN-029 — Payment confirmation order-history actor parity

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Payment verification's linked order status history now records the authenticated ADMIN/MERCHANT actor class instead of SYSTEM. FIN-DSH-54 asserts both ledger entries. Test remains unexecuted pending Phase 3.

## FIN-030 — Refund-completion period attribution

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Reconciliation now uses the REFUNDED event timestamp for missing-refund and commission-reversal checks, with a compatibility fallback for legacy rows lacking that event. FIN-DSH-58 is added but not executed. Review remaining reconciliation checks for source-event time semantics during continued implementation.

## FIN-031 — Cross-period duplicate refund detection

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Duplicate-refund reconciliation now selects returns by in-period successful refund updates and counts all successful refunds across periods. FIN-DSH-59 is added but not executed. Review remaining reconciliation checks for accounting-period attribution during continued implementation.

## FIN-032 — Settlement-adjustment accounting-period correctness — 23 November 2026

Reconciliation previously used adjustment creation time for POSTED-adjustment approval and delivery-fee-cap checks. This misattributed adjustments created in an earlier period but posted in the current period; delivery-fee-cap checks also included DRAFT and other unposted adjustments. Both checks now require status POSTED and use the adjustment transition timestamp (updated_at) as the accounting-period timestamp. PostgreSQL FIN-DSH-60 covers a prior-period-created adjustment posted in the current period and confirms that an unposted draft is excluded. Source commit: 0c65476d1135d18504ae910083299683fdb8d072; test commit: 39a8ee35e81e919601e49d0564fee023d5a39871. Test added, not executed.

## FIN-033 — Exact payment refund aggregate arithmetic — 23 November 2026

Three payment-side SUM(bigint) aggregates used for refund reservation, refund approval projection and settlement calculation were exposed as JavaScript numbers without an explicit precision guard. They now return PostgreSQL numeric text, convert through BigInt, and fail closed when negative or outside Number.MAX_SAFE_INTEGER. Unit coverage verifies totals above the 32-bit boundary, unsafe aggregate rejection and malformed/negative values. Source commit: 633d56a06e073ee416e5b7a989167ef5828f13d8; test commit: 115b0dab007e4071f6a32ee1e564427a86732249. Tests added, not executed.

## FIN-034 — Caller-owned refund transaction support — 23 November 2026

PaymentsService.requestRefund now accepts an optional caller-owned transaction client and reuses it rather than opening a nested transaction. This aligns the implementation with the existing dispute-resolution caller, which passes its transaction so refund creation, payment event/outbox, refund linkage and dispute resolution remain atomic. Existing PostgreSQL FIN-DSH-45 covers injected failure rollback; tests remain unexecuted. Source commit: 2c4b4538cc10e3d4e6217ca56967c89e52657fd8.

## FIN-035 — Atomic return-refund and return-ledger transition — 23 November 2026

Return refund creation previously committed the payment refund/event/outbox first, then linked the refund and advanced the return request in a second transaction. It now locks the payment and performs refund creation (reusing PaymentsService's caller-owned transaction), return linkage, REFUND_PENDING state/history and return outbox in one transaction. The existing idempotency recovery path remains for legacy split-transaction rows. PostgreSQL FIN-DSH-61 injects failure at return outbox persistence and asserts that refund, payment event/outbox and return changes all roll back. Source commit: e462c256be710a81e42b2f2d4093d4700abe1818; test commit: f5d38d5a4af42ec29fa38040d8ba184e5dcbcdff, with scoped outbox assertion correction 4ad18e1eab3495030c6fff719607b5101337edb4 and test index update ac266c2c365d23c3ef3e58032616bb118d037715. Tests not executed.

## FIN-036 — Return refund finalization lineage and amount integrity

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Return finalization now locks payment, refund and return rows in one transaction and verifies exact ledger lineage, succeeded payment/refund state, currency, buyer/order association and exact positive safe-integer amount before any downstream settlement, commission, history or outbox write. FIN-DSH-62 covers a succeeded refund whose amount no longer matches the return request; it must fail closed without finalizing the return. Test added, not executed. Source/test commit: d84489f185cfc864074406f0c9029bc28f40dc94.

**Next:** continue the source-first audit of payment/refund/settlement lifecycle retries and cross-ledger consistency beyond FIN-036. Consolidated Phase 3 remains deferred until implementation is complete.

## FIN-037 — Failed return-refund state and retry parity

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** The REFUND_FAILED transition now synchronizes the linked payment refund to FAILED, writes PAYMENT_REFUND_FAILED and payment.refund_failed, and commits the payment and return ledgers with their history/outbox in one transaction. The retry path reopens the same logical refund row as REQUESTED only after verifying the return is REFUND_FAILED and checking remaining refundable balance. FIN-DSH-63/64 added. Source/test commit: 7be49a0420432d4e31733b77ee2c3042e738d242.

## FIN-038 — Idempotent refund approval retry

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Duplicate approval after a committed SUCCEEDED transition now returns the existing result without repeating event or outbox writes. FIN-DSH-65 added. Source/test commit: 89757383fd53dcb69d2c753f134aaf39d1b47bbc.

## FIN-039 — Idempotent settlement-paid retry

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** A matching payment-reference retry after PAID returns the existing settlement; a different reference conflicts and cannot rewrite the payout record. FIN-DSH-17 updated. Source/test commit: 4020853e3a51386f56e57b41b501a3060f680e82.

## FIN-040 — Failed refund state reconciliation

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** The reconciler now checks REFUND_FAILED → FAILED and prevents REFUND_PENDING → FAILED mismatches, reports missing/dangling linked refunds, and attributes findings to the current transition timestamp with a legacy created_at fallback. FIN-DSH-66 covers both legacy divergence directions. Source/test commit: 6a4e0edccab8cdd0dfa250fa3b950ab62a206a63.

**Remaining programme gate:** FIN-DSH-63–66 are added but not executed. Run the full consolidated Phase 3 PostgreSQL/unit/security campaign only after the remaining source implementation audit is complete. Keep PR #138 draft/unmerged and do not apply migrations or modify shared/staging state.

### FIN-040 period attribution correction

The reconciliation query now uses the latest event matching the current return status, so repeated REFUND_PENDING/REFUND_FAILED transitions are attributed to the period of the latest transition. FIN-DSH-66 verifies a prior-period event does not leak into a later retry state. Source/test follow-up: b63376cf26240d3dc21b6f26782158a09674c1c7. Execution remains pending.

## FIN-041 — settlement-adjustment posting replay and currency integrity

**Status: IMPLEMENTED / TESTING_PENDING.** POSTED adjustment retries now verify the durable ADJUSTMENT ledger row and return idempotently without duplicate event/ledger writes. New adjustment rows carry explicit adjustmentId, parentSettlementId and postedBy metadata; legacy rows use the stable notes prefix as a compatibility lookup. Currency mismatch and sub-order/store mismatch fail closed. FIN-DSH-67 added. Commit: ad61d75b909341dd2936e03dbc592b0d244d9f72. Tests not executed; include in consolidated Phase 3 campaign.

Remaining source audit: inspect adjustment ledger retrieval and reconciliation linkage, and behavior against PAID/terminal primary settlements.

## FIN-042 — payout of posted adjustment ledgers

**Status: IMPLEMENTED / TESTING_PENDING.** Added ADJUSTMENT to settlement statuses and enabled markSettlementPaid to transition posted adjustment ledger rows to PAID with normal payment history/outbox and same-reference retry idempotency. FIN-DSH-68 added. Commit: a6dc0c50ee83d1f397b982084e338b142d89b62e. Test not executed. Continue audit of adjustment listing/reconciliation and primary-settlement calculation filtering.

## FIN-043 — primary settlement lookup isolation

**Status: IMPLEMENTED / TESTING_PENDING.** Primary settlement lookup now excludes metadata-linked adjustment ledger rows and legacy rows with the stable posted-adjustment note prefix. FIN-DSH-68 verifies the primary settlement remains the result after adjustment payout. Commit: 6e336fbbe6e71a0c21ee8e81150eadfd769cc6f0. Test not executed; include in consolidated Phase 3.

### FIN-042/043 test assertion follow-up

FIN-DSH-68 now selects payment_record_id directly from the posted adjustment ledger row for its PAYMENT_SETTLEMENT_PAID history assertion; this is a test-only clarity correction. Commit: 74eef0fa36611dd7352436e8d2b7fd048ca7efc2. No behavior change. Test remains unexecuted.

## FIN-044 — adjustment parent isolation and payout visibility — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** The adjustment posting parent lookup now excludes metadata-linked adjustment ledger rows and legacy rows with the stable `Posted adjustment ` notes prefix, even after those rows transition to PAID. Adjustment payout preserves the legacy marker. Admin Settlements now filters/styles ADJUSTMENT and enables Mark Paid for that status. FIN-DSH-68/69 covers legacy marker preservation and second-adjustment parent linkage; Admin recovery coverage verifies adjustment payout UI. Commits: `233e49a12352a4e157f455040a2bdcc4c16c1828`, `62bf7cf1991ff7974a8762c0e57eea148fcc53b4`. Tests not executed.

Remaining source audit: verify merchant settlement projection, reconciliation reporting and exports include adjustment rows distinctly and do not double-count primary plus adjustment amounts. Then complete the source audit before the consolidated Phase 3 test campaign.

## FIN-045 — Paid adjustment reconciliation semantics — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Settlement reconciliation now identifies adjustment ledger rows using `metadata.adjustmentId` or the legacy posted-adjustment notes prefix. It no longer treats PAID adjustment rows as primary settlements for commission sign calculation. FIN-DSH-36 now pays a commission-reversal adjustment before running reconciliation; unit coverage includes paid adjustments and paid primary settlements. Source commit: `23fc0f5f6cfd017c281e498a0843b11e82ca0a3e`. Tests not executed.

## FIN-046 — Merchant settlement visibility — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Added a read-only merchant Settlements page backed by the existing org/store-scoped merchant endpoint. It provides store/status filters, gross/refund/commission/fee/net amounts, payout references, and explicit ADJUSTMENT · PAID labels using durable adjustment identity. Added merchant navigation/dashboard/route permission coverage and read-recovery tests; Admin Settlements also distinguishes paid adjustment rows. Source commits: `4615e05bb0c0df98ec2015387262a146bc13f6a4`, `3373c36930744c911300699b770d05c4428a313c`. Tests not executed.

Remaining audit: verify settlement listing limits, financial exports and aggregate KPI/report queries do not double-count primary and adjustment ledger rows. Keep PR #138 draft/unmerged and defer the consolidated Phase 3 test campaign until the implementation audit is complete.

## Remaining settlement projection audit — 23 November 2026

The merchant and Admin settlement screens now expose adjustment rows and distinguish paid adjustments. The underlying list services still return at most 100 rows per request and do not yet expose offset/cursor pagination. Before deciding whether pagination or export work is required, inspect real product requirements and all settlement consumers; do not silently change report definitions or add an automatic payout scope. Admin revenue KPI aggregation is based on orders.total_minor, not settlement_records. Next audit: confirm whether any export or finance report aggregates the settlement ledger, and ensure primary plus adjustment rows are not double-counted.

## FIN-047 — Settlement history pagination — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Removed the silent 100-row ceiling from Admin and Merchant settlement history by introducing bounded offset pagination (default 25, maximum 100), total counts, stable createdAt/id ordering and consistent merchant org/store/status scope for rows and counts. Both UIs now expose page navigation and total counts. Added controller/service pagination tests and Admin/Merchant UI paging tests. Source commit: `ee6bf2f84803f2eb1f80ae931d9415923a760ff3`. Tests and typechecks are not executed.

**Audit complete:** inspected Admin/API/Web settlement consumers, Admin KPI/report routes and the reconciliation consistency query. No settlement-ledger export consumer or aggregate summing primary plus adjustment rows was found. Reconciliation reads each period/currency settlement row to validate its net formula; it does not produce an aggregated ledger total. Admin revenue remains based on completed order totals grouped by currency. The settlement-adjustment approval queue is a separate workflow, not a settlement-history consumer. No report-definition change is justified.

**Verification result:** CI #45245048568 passed lint/typecheck and Flutter analyze/tests. The changed-file Prettier check failed on 279 files and blocked API coverage, PostgreSQL integration, Web/Admin tests, migration, boundary, contract and build jobs. The Admin CI command now includes `admin-settlements-recovery.test.tsx` and `admin-settlement-adjustments-recovery.test.tsx`, but they did not execute. Vercel Web passed; Admin preview failed due provider rate limit. Next: resolve the required formatting gate without disabling it, then rerun the consolidated Phase 3 campaign. Keep PR #138 draft/unmerged and preserve all release/database restrictions.

## Live continuation — FIN-047 verification follow-up (23 November 2026)

- Exact branch head: 3ef930973014bdb43e10a62c337a61831835c174; PR #138 remains OPEN / DRAFT / UNMERGED against develop. No merge or deployment.
- Formatting remediation: CI #45257284797 passed the changed-file Prettier gate, lint, and workspace typecheck. Flutter analyze and Flutter tests also passed. The broad formatting cleanup is grouped in 312e7d39044ea9ce412675a9bdbf68992776eec4; two remaining files were formatted in 11a6f5998fa6b21c70737a4a55a2b4e4a59f2a27. Temporary one-time formatting workflows were removed in b9926463886b778e87bde60895690e2d6dbad8b8.
- The consolidated CI run #45257284797 is still in progress at this checkpoint. Boundary Lint failed with 14 cross-module import violations against its 193-entry reviewed baseline (206 current violations); the same 14 findings were present on the preceding run. Migration Full Apply failed its read-only access audit because role scs_audit lacks SELECT permission on _migration_log. Neither failure was bypassed or baselined.
- Web test job failed with 9 unrelated existing tests across buyer self-service recovery, buyer route hydration, merchant returns, and product-studio progress/flow (6 failing files, 31 passing files; 212 tests passed, 9 failed). Merchant settlement recovery passed all 5 tests. The job stops at the Web suite, so Admin recovery tests have not yet run in this CI attempt.
- API pagination parser tests (15) and payment controller/tenant-scope tests (4) passed in CI #45250855722. The merchant settlement recovery suite passed 5/5. API coverage and PostgreSQL integration jobs in #45257284797 were still running at this checkpoint; do not claim them passed.
- The touched outbox-dispatcher test exposed a case-sensitive SQL assertion against PostgreSQL's uppercase NOT LIKE; corrected to compare lowercased SQL in commit 3ef930973014bdb43e10a62c337a61831835c174. The latest CI run is the exact-head recheck for this correction.
- FIN-047 remains IMPLEMENTED / TESTING_PENDING. Do not merge/deploy. No migration or shared/staging DB write, environment mutation, worker activation, RLS/ACL change, or production operation was performed.
- Next: finish collecting CI #45257284797 API coverage and PostgreSQL integration results; run the Admin settlement recovery tests independently because the Web suite currently fails before Admin is reached; then address the 14 modular-boundary violations and _migration_log audit grant through their proper owners/reviewed changes. Do not change test expectations or weaken gates to hide failures.

## Live continuation — 23 November 2026

- **FIN-047:** pagination and consumer audit are implemented. Tests remain TESTING_PENDING until exact-head verification. CI #45257284797 was a failed broad verification attempt, not a FIN-047 pass.
- **Read-only DB audit:** corrected at source checkpoint `954200f` to check SELECT capability before reading `_migration_log` and `backfill_errors`. No SELECT grant should be added to the least-privilege audit login. Await CI #45260954714.
- **Carrier tests:** two unit fixtures now include `stores.findFirst` returning the owning organization; unit and PostgreSQL tenant assertions match the production store-mismatch diagnostic. Await CI #45260954714.
- **Outbox test:** now inspects the literal carrier exclusion in generated SQL; await CI.
- **Admin finance tests:** the workflow runs focused Admin suites after dependency installation/contracts build regardless of the Web test outcome. The Web failure remains fatal to the overall job.
- **G-015 boundary debt:** 14 new violations remain against the 193-entry reviewed baseline. Resolve through injected contracts and ownership boundaries; do not add them to the baseline or evade the rule with schema re-export barrels.
- **Broad regression debt:** 9 Web tests, 89 API coverage tests and 41 PostgreSQL integration assertions failed on CI #45257284797. This run included 1,599/1,706 integration tests passed and 4,634 API tests passed (with 176 skipped).
- **Next:** inspect CI #45260954714 against exact source SHA `954200f`; address directly attributable failures, then resume G-015 and G-002 source mapping. G-001 independent review, G-036 verification and Phase 6 remain open.
- PR #138 remains OPEN / DRAFT / UNMERGED. No merge, deployment, protected staging audit, shared database mutation, migration, grant/default-ACL change, RLS or worker activation is authorized.

## Post-format continuation — 23 November 2026

- CI #45260954714 stopped at Prettier on source checkpoint `954200f`; lint/typecheck and Flutter passed, but application tests and downstream gates were skipped.
- Formatting was subsequently corrected in bot commit `4477ebd42ba46146b14df18094d025ab133c5d75`. Await exact-head CI for that commit and the handoff sync.
- FIN-047 remains IMPLEMENTED / TESTING_PENDING. Do not promote to tested until API pagination, merchant tenant scope, Admin recovery and Merchant recovery are verified.
- G-015 retains 14 new module-boundary violations. Refactor through injected contracts; do not edit the reviewed baseline or add schema re-export workarounds.
- After exact-head CI, triage the broad Web/API/PostgreSQL baseline failures by domain. G-002, G-001 independent review, G-036 verification and Phase 6 remain open.
- PR #138 remains OPEN / DRAFT / UNMERGED. No protected staging audit, deployment, shared database mutation, migration, grant, RLS or worker activation is authorized.

## 23 November 2026 — service-boundary implementation checkpoint

**Active PR:** #138, OPEN / DRAFT / UNMERGED to `develop`.
**Branch:** `remediation/phase-0-1-tenant-security`.
**Implementation checkpoint:** `0a023175ea5cfd7bd24c4fb36ee8c0b32f531adb`.

### Work completed in this continuation

- FIN-047 settlement pagination remains implemented: bounded page size, stable ordering, total count, matching merchant row/count scope, and Admin/Merchant page navigation. Consumer audit found no settlement export or aggregate that double-counts primary and adjustment rows.
- The least-privilege DB audit now checks effective SELECT permission with `has_table_privilege` before reading `_migration_log` or `backfill_errors`. It reports existence/permission and null row summaries when SELECT is absent. No privilege was granted.
- Carrier worker test fixtures now include the owning-store lookup required by the unchanged production tenant guard. PostgreSQL tenant assertions match the guard's actual rejection. The outbox test checks its carrier exclusion SQL literal in generated SQL. CI allows the focused Admin recovery tests to run after Web failure (install/contracts must succeed); Web failure remains fatal.
- G-015 service-boundary work now removes direct schema imports in four consuming areas:
  - Pricing consumes Catalog's variant pricing lookup contract for ownership and tier enrichment.
  - Operations Pilot Control consumes Identity and Merchant public services for organization/store validation.
  - Reviews consumes Orders' order/line projection and Catalog's product/variant predicate.
  - Realtime consumes Orders' order-room/driver assignment lookup and Merchant's canonical store resolver. Store membership and organization checks remain enforced.
- Added focused tests for Catalog pricing and review lookups, Pricing fixtures, Operations allowlist tenant rules, Orders realtime access, Reviews subject scope, and Realtime room authorization. Updated affected PostgreSQL integration fixtures to match the new Pilot Control service dependencies.
- Do not claim the E6 boundary count has fallen by a specific amount until the boundary job runs; it was skipped in the latest run. The original 14 new violations remain un-baselined in the reviewed register pending exact E6 evidence.

### Latest verification evidence

CI #45266315504 tested implementation checkpoint `0a023175ea5cfd7bd24c4fb36ee8c0b32f531adb` and concluded FAILED at the changed-file Prettier gate. Lint and TypeScript typecheck completed without errors; the mobile Flutter analyze/tests passed. Seven files need formatting:
`apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts`,
`apps/api/src/__tests__/unit/operations/pilot-control-public-contract.spec.ts`,
`apps/api/src/modules/catalog/catalog-pricing-lookup.service.ts`,
`apps/api/src/modules/catalog/catalog-review-lookup.service.ts`,
`apps/api/src/modules/orders/order-realtime-access.service.ts`,
`apps/api/src/modules/orders/orders.module.ts`,
and `apps/api/src/modules/orders/orders.service.ts`.
API unit/coverage, PostgreSQL integration, migration full apply, E6 boundary lint, Web/Admin, build, contract generation and k6 were skipped behind the formatting gate. No application-test pass is claimed for these changes.

External Vercel preview statuses continue to report the provider build-rate limit; those are not application test results.

### Next actions and restrictions

1. Format the entire changed source/test/memory set once, run Prettier check, and trigger one exact-head consolidated CI verification.
2. Inspect the exact E6 boundary results and address any remaining direct schema coupling through module-owned service contracts. Do not edit the 193-entry reviewed baseline or create schema re-export barrels.
3. Keep FIN-047 at IMPLEMENTED / TESTING_PENDING until the API pagination/tenant tests, Admin recovery and Merchant recovery tests pass.
4. Continue G-002 source evidence and actual FK/method-predicate mapping. Protected staging/runtime identity inspection remains unavailable without authorization. G-001 independent review and G-036 focused security verification remain open; Phase 6 remains NOT STARTED.

No migration, database grant/default-ACL change, RLS enablement, shared/staging database write, deployment, worker activation, merge or release was performed. PR #138 remains draft and unmerged.

## 24 November 2026 — residual Returns and Shipping module-boundary refactor

- Source commit: `93844d781ff50cd3ba325c0d9e3ffe209bc128cc` — [PR #138](https://github.com/nabeel2323/scs-platform/pull/138), still OPEN / DRAFT / UNMERGED against `develop`.
- Moved the P13 return-expiration lease key into a common worker constant and the raw SQL `readRows` accessor into a common database helper. ReturnsService and ReturnExpirationWorker now consume those common contracts; the Operations configuration retains its compatibility export.
- Added IdentityService's PLATFORM-organization lookup and MerchantService's system-only store ownership/store-ID projections. Aramex uses the Identity contract; the shipping worker and authenticated webhook routing use the Merchant contract.
- Moved carrier shipment matching into an OrdersService query contract. The lookup remains constrained to the provider, external carrier reference, and store IDs for the authenticated credential organization, and is capped at two rows so ambiguous references fail closed.
- Replaced direct Returns/Shipping imports of Operations helpers and Identity/Merchant/Orders schemas with common or module-owned contracts. Added/updated focused tests for the query predicate, credential/provider mismatch, empty tenant store set, ambiguous shipment references, pre-auth routing, Identity lookup, Merchant store scope, and worker outbox ownership.
- **Verification:** tests were added/updated but were not executed. No formatter, lint, typecheck, E6 or broad CI run has been executed for this commit. GitHub Actions reports zero runs for this exact SHA because the commit uses `[skip ci]`. Vercel Web and Admin status contexts are SUCCESS, but these are preview statuses, not application-test evidence.
- G-015 remains PARTIAL until the exact-head boundary check verifies that the residual unbaselined imports are gone. The 193-entry legacy baseline was not changed. G-001 independent review, G-002 runtime identity/transaction-context/policy gates, G-036 verification, and Phase 6 remain open.
- No shared database, Supabase grants/RLS, migration, Render configuration, staging, external carrier, SMS/OTP, deployment, or worker activation action occurred.

**Next:** run formatting and focused API typecheck/unit suites plus E6 boundary lint for this commit, then continue the remaining implementation-first gaps. Keep the full regression/migration campaign grouped at the planned Phase 3 checkpoint; do not merge or deploy PR #138.


## 24 November 2026 — implementation-first sequencing reaffirmed

The user explicitly instructed that implementation must be completed before tests are run, and that routine steps should proceed autonomously without repeated approval requests. During implementation, do not execute test commands or trigger GitHub Actions/CI. Finish cross-module integration first, then run the consolidated verification campaign. Continue source review and fix concrete security/correctness defects immediately. Group related changes and synchronize project memory. This sequencing does not waive independent review, protected staging, shared database, no-merge/no-deploy or release restrictions.


## G-002 scoped actor-context rollout — 24 November 2026

The opt-in actor-context foundation now routes opted-in `DatabaseService.db` calls through a transaction-bound Drizzle handle and transaction-local PostgreSQL settings. It supports typed user/anonymous/worker/system/bootstrap/audit principals, same-actor nested reuse, and a closed-scope fence against detached async work.

Bounded controller adoption now covers Notifications, Pricing, Store Membership, Promotions, Reviews, Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Admin reads, Cart, Returns, Organizations and Roles. The interceptor remains explicitly scoped; there is no global request transaction.

G-002 remains IN PROGRESS. Uncovered paths include Auth/Profile, file/import/upload, main Orders/Payments, shipping/carrier webhooks, bootstrap, deferred audit writes, workers/schedulers, realtime sockets, CLI and migration execution. Continue only after each path's principal, nested transaction, streaming, external-I/O and detached-work behavior is reviewed. Carrier context must follow credential authentication. Live runtime identity, protected catalog inventory, complete operation predicates and independent review remain outstanding. No RLS/shared database change is authorized.

**Next:** finish the remaining safe bounded HTTP integrations, then implement explicit worker/webhook/bootstrap/audit context contracts and complete the operation/ownership matrix. Do not run tests or CI until implementation and integration are complete.


## G-002 Orders and Merchant endpoint adoption — 24 November 2026

Orders actor-context coverage now includes bounded authenticated read routes, checkout preview, reorder and DB-only lifecycle operations. Reject/refund, cancel/payment and actual checkout execution remain excluded pending explicit payment/provider boundary design.

Merchant actor-context coverage includes bounded store/customer/warehouse/verification reads and DB-only store/warehouse/verification writes. Document listing/presign and upload/storage routes remain excluded until their DB metadata and storage phases are separated.

## G-002 authenticated Identity/Profile DB-only adoption — 24 November 2026

**Implemented in source; not verified.** Source commit `fe98b12f1f0ad9c6a24a48f02ceb5201c4cf3d4f` adds explicit actor contexts to credential setup/change, OTP-proven email/phone linking, identifier unlinking and authenticated organization switching. Verified JWT claims are forwarded from AuthController/ProfileController. Password and OTP/provider/Redis/JWT work remains outside the DB transaction. Password change atomically persists the password, credential audit, trusted-device revocation and session revocation; external/general audit logging is separated under an audit actor.

Focused tests were added/updated in the controller, account-linking, email-OTP error coverage and organization N+1 suites, plus a new credential-context service spec. Commit `c8405a33388731095ef08b64d744a36d7b079cd3` then corrected the spec's chainable Drizzle query mock. They were **not run** under the implementation-first instruction.

**Next:** safely resolve the database principal for pre-authentication OTP/email-OTP login, password login, refresh-token rotation and logout before adding any actor context. Do not trust unverified request claims or wrap Redis/provider/bcrypt/JWT operations. Keep G-002 IN PROGRESS / NOT VERIFIED; runtime identity, protected read-only catalog evidence, complete ownership predicates and the 114/116 reconciliation remain open.

## G-002 pre-authentication identity principal — initial source slice, 24 November 2026

Source commit `4e9e04757e0ab5f6b3c7ac924240216de0b39d0f` introduces an operation-scoped authentication actor with no user/role/org/worker identity and five fixed purpose labels. Initial phone OTP/email OTP/password account lookups and refresh/logout session lookups now run in this context.

**Remaining:** scope post-proof account creation and session/device-credential DB work under a verified user actor; split Redis/bcrypt/provider/rate-limit/JWT work outside. Review refresh-token rotation/reuse race conditions and make session rotation atomic. Logout should perform owner-bound session and enrolled-device revocation in one user transaction after the initial token lookup. Future RLS policies must allow only minimum operation-specific reads. No tests/CI run; G-002 remains NOT VERIFIED.

## G-002 identity/session post-proof DB scopes — 24 November 2026

Source commits `5a6eba900eabe021352a0f7f3307bddaeb2d6333` and `b939a335a5bc126241131ab48bb03c9ed3cfaea6` extend auth actor scopes through OTP account creation/claims and session/device credential issuance; password-login trusted-device/session operations; refresh rotation/reuse; and logout. External Redis, rate-limit, bcrypt, provider and JWT operations remain outside transactions.

**Remaining:** scope authenticated device credential listing/revocation, session listing and revoke-by-device under verified user actor contexts. Audit all remaining IdentityService controller call sites. Tests remain unexecuted; G-002 remains NOT VERIFIED.

## G-002 Payments read-route actor context — 24 November 2026

Commit `7f56e5185cf1a7c7b6954845ca9151aac83c5ac6` adds the opt-in user actor interceptor to eight DB-only Payments GET handlers, preserving existing permission/object-level checks. Write/payment-provider/refund/upload paths remain excluded pending explicit DB/external-I/O separation. Regression metadata coverage was added but not run.

## Identity session/device route reconciliation — 24 November 2026

A follow-up controller audit confirmed that ProfileController's session list, revoke-by-device, trusted-device list and trusted-device revoke handlers already carry `TenantDatabaseContextInterceptor`. The interceptor derives the actor from the verified JWT after guards and scopes the complete awaited handler. These routes were therefore already covered; no redundant service-level wrapper or controller signature change was added. Credential setup/change remain explicitly scoped inside IdentityService because those handlers intentionally stay outside the interceptor for bcrypt separation.
**Next:** continue method-level Payments write review and separate DB-only operations from payment/refund/provider/file-storage side effects; then Merchant document metadata. Eight DB-only Payments GET routes now use the user actor.

## Payments DB-only mutation route actor context — 24 November 2026

Source commit: `22f14b0e14bf8ca8ddd2eb578b59d3f3ae5f9b50`.

Added the verified user actor interceptor to four Payments POST handlers whose inspected service call graphs perform database transactions, append payment events and write outbox rows without calling payment/refund providers or object storage: COD cash confirmation, bank-transfer proof verification decision, settlement calculation and settlement-paid recording. Existing permission guards, service-level object/store authorization, row locks, optimistic state predicates and transactional outbox writes remain authoritative. The actor context wraps the complete awaited method; nested Drizzle transactions remain inside that scope.

Explicitly excluded: bank-transfer proof upload (object storage), refund request/approval/retry (refund lifecycle), payment-provider operations, checkout and order cancellation/rejection paths. The controller metadata test now covers 12 Payments routes (eight GET and four DB-only POST); it remains unexecuted.
**Next:** continue the remaining Orders lifecycle/payment-provider split and Merchant document metadata/storage separation.


## G-002 — Merchant document metadata actor-context slice — 24 November 2026

Implemented in commit `bccb8c569d122c7b1479881aa162fb428f264c4e`: document registration after upload, organization document listing and store document listing now use the verified-user actor context. Presign upload/download handlers remain excluded because they perform object-storage signing; the download path also updates the metadata row and must be split into short DB phases around storage I/O before adoption. A controller metadata test asserts the scoped/excluded route set but remains unexecuted.

**Next:** continue source-level Orders reject/cancel/payment-provider boundary review. Keep refund/provider calls outside DB actor transactions; only scope a proven DB-only phase, and do not wrap a full handler across external I/O or pre-commit realtime effects. Then finish Merchant presign phase separation and the G-002 ownership/runtime evidence matrix. G-002 remains IN PROGRESS / NOT VERIFIED.


## G-002 Orders rejection and Merchant document download-presign phases — 24 November 2026

- Merchant rejection uses the verified merchant actor for order authorization, optional SUBMITTED auto-advance, inventory settlement, optimistic REJECTED status transition, history and rejection outbox insertion. Inventory settlement receives the caller transaction, so stock movement and order status/history/outbox commit or roll back together.
- Refund-request creation runs only after rejection commits. It is a DB-only refund-record/event/outbox operation; the current generic outbox dispatcher only logs this event; no payment-provider refund is executed by this path. The rejection refund key is stable (reject-refund:<orderId>) rather than time-based, so retries reuse the same request. Failure remains non-fatal and logged.
- Master-order recalculation and final order read run in a separate short verified-user actor context. No request-wide interceptor was added to the rejection route.
- Merchant document download presigning uses one short actor context for document/membership reads, calls object storage with no DB transaction open, then uses a second short actor context to persist the signed URL. Both admin-reviewer and merchant-member routes pass verified JWT identity. Upload presigning remains storage-only; registration/listing retain their existing scoped handlers.
- Added Orders rejection and Merchant presign actor-context regression specs. They are authored but not executed under the implementation-first restriction.
- No tests, formatter, lint, typecheck, E6 or CI were run. No RLS, migration, grants/default ACLs, shared/staging DB writes, deployment, worker activation, merge or release occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## Refund-provider execution boundary correction — 24 November 2026

The merchant-rejection flow creates a refund REQUESTED row, payment event and outbox record only. Source inspection of OutboxDispatcher.dispatch confirms generic events are currently logged and marked dispatched; this does not invoke a payment-provider refund. Automatic refund-provider execution is not implemented by this slice and remains outside the approved scope (no automatic gateway/payout expansion or worker activation). The durable refund request is still available for the existing review/approval workflow. Merchant-initiated rejection refunds now attribute requestedBy/paymentEvents.actorId to the authenticated merchant; PaymentsService permits the special MERCHANT_REJECTION reason only when the caller has a MERCHANT_* role and assertOrderAccessible confirms the order is in the caller's active organization. The service no longer impersonates the buyer for audit attribution.


## G-002 source-schema inventory correction — 24 November 2026

A fresh source comparison corrected the earlier 99-table ownership inventory. The 25 module `*.schema.ts` files contain 100 `pgTable` declarations. The `drizzle/schema.ts` barrel exports 98; `catalog_imports` and `catalog_import_errors` are declared in `catalog-import.schema.ts` but not re-exported. The prior 99-row matrix included those two non-barrel tables and omitted the exported `payment_proof_upload_intents`; the matrix now contains all 100 source declarations and direct-column/FK candidates.

This means the historical 99 Drizzle + 15 other = 114 relation decomposition is no longer supported by current source counts. The 114 relation report is still a historical catalog snapshot; 116 remains unresolved. No current live relation total or two-object delta is asserted. A protected read-only catalog audit and independent API/migration role evidence are still required.

The G-002 ownership matrix is now schema-column complete across the 100 source declarations, but not operation/policy complete. Exact per-operation predicates, raw SQL/object/privilege coverage, independent review (G-001), runtime identity evidence, G-036 verification and protected catalog review remain open. Do not run tests/CI until implementation and integration are complete; no DB/RLS/migration/grant/staging/deployment action was taken.


## G-002 automatic CI exception — 24 November 2026

The proof actor-context source commit unintentionally triggered Actions run #1474 (`45376045168`): Mobile Flutter Tests and API Lint succeeded; API Typecheck failed. It reported new PaymentsService type errors and additional errors in interceptor, identity, shipping worker and integration tests. The PaymentsService-specific errors were corrected in commit `fc2993290d4522d397ab56934e41103f8dd9d060`; no local test/typecheck was run. Run #1475 (`45376830054`) was automatically triggered by the fix and remained in progress at this checkpoint. No cancel action was available. Do not intentionally rerun CI before the implementation/integration gate is reached.


## Final automatic CI result — 24 November 2026

Actions run #1475 (`45376830054`), on source commit `fc2993290d4522d397ab56934e41103f8dd9d060`, completed with Mobile Flutter Tests SUCCESS, API Lint SUCCESS and API Typecheck FAILURE. The typecheck no longer reported errors in `payments.service.ts`; the PaymentsService actor-role and async nullable-value issues from run #1474 were absent after the fix. Remaining reported failures were in `tenant-database-context.interceptor.ts`, `identity.service.ts`, `shipping-carrier.worker.ts`, integration specs (account-linking, device-trust, email-OTP, m723a1 concurrency, registration flows) and unit specs (token revocation and database authentication context). No baseline run was available to classify those as pre-existing.

Unit Tests + Coverage Gates, Integration Tests, Boundary Lint (E6), Container Build & Smoke Test, Web/Admin App Tests, Migration Full Apply, Build, Contract Spec & Codegen, k6 Smoke Test and Trigger Staging Release were SKIPPED. No backend unit/integration or release-gate success is claimed. The two automatic runs were not intentionally dispatched; no further CI rerun is requested. The available GitHub connector has no workflow-cancel action.


## G-002 actor-context typecheck correction — 24 November 2026

The source corrections and test-fixture signature alignment are committed in `c587ed46db9a4893f2fa0167a74e671bc9d3ae10`. They address the concrete API typecheck diagnostics from automatic run #1475: narrowed JWT claims in the deferred interceptor, nullable passwordHash captured across the transaction closure, missing validated organization return in ShippingCarrierWorker, outdated IdentityService actor arguments in account-link/device-trust/registration fixtures, changed switchOrg argument order, expanded carrier-worker constructor dependencies, and a self-referential mock transaction annotation. These specs remain unexecuted.

Automatic run #1476 (`45385046873`) was unintentionally triggered by the PR push. It was not intentionally dispatched; no additional CI/test run is requested during implementation. Remaining G-002 work is the operation/principal map, migration-backed FK verification, and authorized runtime/catalog evidence.


## G-002 carrier recovery and worker lease actor-context adoption — 24 November 2026

- CarrierReconciliationService now scopes create/cancel claim UPDATE...RETURNING operations and durable shipment/outbox transitions under a unique process worker principal. Retry outbox intent and shipment retry state commit together in one worker transaction. Carrier tracking/provider calls remain outside actor contexts.
- CarrierAdminController recoverShipment performs shipment lookup, store-to-organization membership authorization, ADMIN_TRIGGERED state update and authoritative re-read in one verified user actor transaction. It then invokes the reconciliation engine outside that transaction and records audit under a separate audit principal. The recovery queue read also uses a verified user actor.
- WorkerLeaseService uses a worker actor for lease-row creation, acquisition, renewal, heartbeat/failure updates, release and reads. Runbook-only forceExpire uses a distinct system actor.
- Regression specs were added/updated in m73b333-indeterminate-reconciliation, carrier-admin-recovery-queue-scope and worker-lease-expiry-fencing. They remain unexecuted.
- Remaining: CatalogImportService/ExcelExecutor phase separation; P13Monitor/OpsAlert/OpsControl/PilotControl principal separation; migration/runtime catalog evidence.

## 24 November 2026 — latest automatic CI result and fixture correction

Run #1478 (45386103613) on source commit 98161b3f2e49b4b16af3d0fe6c98c5a8074a441f completed FAILURE. API lint succeeded; API typecheck reported only three diagnostics in worker-lease-expiry-fencing.spec.ts: withActorContext was not bound in the third test, and its callback context parameter was consequently implicit any. Mobile Flutter Tests succeeded. Format check and all downstream unit/coverage, integration, E6, build, contract, k6, container and staging jobs were skipped. Source fixture correction commit 5de17d1880aa645a2efeccaf98eba959c6da7c8e binds the helper in that test. It contains [skip ci]; no rerun is requested, so the correction is not yet typecheck-verified.

Exact current head 5de17d1880aa645a2efeccaf98eba959c6da7c8e has zero GitHub Actions runs. Vercel Web/Admin contexts are FAILURE because the preview provider rate-limited deployments. PR #138 remains OPEN / DRAFT / UNMERGED.

## 24 November 2026 — Catalog Import read-only/report actor-context slice

CatalogImportController list, detail and errors routes now use TenantDatabaseContextInterceptor after the class-level JWT, permission and role guards. Preview is intentionally excluded because it reads only the in-memory plan cache. Upload, execute and retry are intentionally excluded because they combine object-storage/workbook processing with multiple DB phases. The report route passes verified JWT sub/role/activeOrg to CatalogImportService; persisted errors are fetched in a short user actor context, then the XLSX workbook is generated after the DB scope closes. Regression metadata coverage was added for route interceptor selection; no test was run.

Catalog Import upload, validation, execution, retry, template dropdown reads and export source queries now use explicit caller actor scopes with storage/workbook work outside DB transactions. Next P13 operational services remain: P13Monitor, OpsAlert, OpsControl and PilotControl principal separation.

## G-002 — Catalog Import actor-context phase separation — 24 November 2026

**Source implementation checkpoint:** `ff83be282b9f36c1153271e612e5686bbee33931` (source files: CatalogImportController, CatalogImportService, ExcelExecutorService and TemplateGeneratorService).

- The controller now forwards verified JWT `sub`, `role` and `activeOrg` into upload, execute, retry, template download and catalog export operations. Existing list/detail/errors routes retain the post-guard verified-user interceptor; preview remains in-memory only.
- Upload performs object-storage put before opening a short user actor scope for the import-row insert. Auto-validation then passes the same verified caller through each phase.
- Validation scopes job/status reads and writes, existing-catalog snapshots, reference resolution, plan/refs persistence and error persistence to short user actor transactions. Storage download, byte collection, XLSX parsing, validation, planning and cache mutation remain outside DB transactions.
- Execution scopes import status/counter updates, publishability DB reads, error/plan persistence and audit persistence. The audit record uses a separate audit principal. ExcelExecutorService establishes a verified user actor for each of its 12 ordered entity-type transactions; combination-key updates use a separate short user actor scope. Existing per-entity transaction/savepoint and dependency behavior is retained.
- Retry resolves the job under the caller actor, then reuses caller-aware validation and execution. Failure-path plan snapshot persistence is also actor-scoped.
- Template dropdown source rows are loaded under one short actor scope; template workbook creation and XLSX serialization occur after it closes. Catalog export scopes each independent source query and performs workbook row generation/serialization outside those query scopes.
- Object storage and workbook parsing/generation are not wrapped in actor transactions. No request-wide transaction was added.
- This is source implementation only. No tests, formatter, lint, typecheck, E6 or CI were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. No RLS, migration, grants/default ACLs, shared/staging database actions, deployment, worker activation, merge or release occurred.

**Remaining G-002 work:** P13Monitor/OpsAlert/OpsControl/PilotControl worker/system/operator principal separation; remaining source-backed raw SQL/function/trigger/partition/bootstrap/CLI/helper access paths and exact per-operation predicates; migration-backed FK validation; protected read-only catalog and actual API/migration runtime identity evidence through the authorized process. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## G-002 — P13 monitor, alert, ops-control and pilot-control principals — 24 November 2026

**Source implementation checkpoint:** P13 source slice completed through `c80af8cddb3a65814a20304f53b49f400f8c416d`.

- P13Monitor's raw SQL reads now execute under a dedicated worker principal (`p13-monitor`). Worker-lease reads continue through WorkerLeaseService's own worker principal. Findings collection remains read-only; alert raise/resolve work begins after those short read scopes close.
- OpsAlertService's durable alert-state DB phases use the platform alert-service system principal when no caller context is active. Operator-facing list/snapshot reads use the verified admin user. Atomic claim/update statements remain individually scoped; webhook delivery stays outside the alert-service's short DB scopes.
- OpsControlService checks the pause flag under a worker principal. Admin state/history reads and pause/resume mutations use verified caller claims; the durable control row and append-only control audit row remain in one caller-bound transaction. Platform AuditService writes use a separate audit principal, and alert delivery follows after those DB scopes close.
- PilotControlService policy flag/allowlist reads reuse an already-active verified caller/worker context, otherwise use a dedicated system policy reader. Admin snapshots and configuration mutations use verified caller claims; platform audit writes use a separate audit principal. Organization/store ownership validation calls remain outside the local write transaction.
- OperationsController now forwards authenticated JWT `sub`, `role` and `activeOrg` to the control, alert and pilot services. No new RBAC permissions or role changes were introduced.
- This is source implementation only. No tests, formatter, lint, typecheck, E6 or CI were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. No RLS, migration, grants/default ACLs, shared/staging database actions, deployment, worker activation, merge or release occurred.

**Next G-002 work:** complete callsite and operation-map reconciliation for P13 and the other raw SQL/service/worker paths; verify actor scopes are never switched while another actor transaction is active; finish the physical table/operation/ownership-predicate matrix and exact FK evidence; obtain protected read-only runtime catalog and API/migration identity evidence through the authorized process. Regression specs are still required before the deferred verification campaign. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## G-002 — Catalog Import and P13 actor-context adoption consolidated — 24 November 2026

**Latest source implementation checkpoint:** `75890feeffcef6f0035238476dc9242958dd5ec5`.

The Catalog Import source slice and P13 operational principal slice are now implemented together:
- Catalog Import upload/validate/execute/retry, executor entity-type transactions, report errors, template dropdown queries and export source queries use verified caller actor scopes. Object storage, XLSX parsing, workbook construction and serialization remain outside DB actor transactions. Failure-path plan persistence and audit writes use the appropriate user/audit principal.
- P13Monitor raw SQL reads use a worker principal; WorkerLeaseService retains its own worker scope. OpsAlert durable alert-state DB phases use a system service principal when no caller context is already active; operator list/snapshot reads use the authenticated admin actor. Webhook delivery remains outside the alert service's short DB scopes.
- OpsControl pause checks use a worker principal; admin state/history/pause/resume use the verified caller, with the control row and append-only control audit in one transaction and a separate audit principal for AuditService.
- Pilot policy reads use the current verified actor when nested or a system policy principal otherwise. Admin snapshots and writes use the verified caller; organization/store ownership validation reads are also caller-scoped; AuditService writes use a separate audit principal.
- Helper wrappers now await PromiseLike/Drizzle query thenables before leaving the actor context.
- The implementation does not activate workers, change RLS/grants/migrations, or access shared/staging data. No tests, formatter, lint, typecheck or E6 were intentionally run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

**Automatic CI note:** GitHub automatically queued PR CI run #1499 (run ID 45394547128) after the source push. It was PENDING at the last check; no workflow was intentionally dispatched. Vercel Web/Admin contexts remained FAILURE due to the external build-rate limit. Check the run's eventual result before starting the deferred verification campaign.

**Next work:** reconcile the complete G-002 operation inventory against all source callsites and exact table/ownership predicates; verify no actor-context switch occurs while a different actor transaction is active; finish the 99 Drizzle-exported / 114 detailed public relation / unresolved 116 historical count reconciliation; validate migration-backed FKs and obtain protected read-only runtime catalog plus actual API/migration runtime identity evidence through the authorized process. Add/adjust regression specs after implementation/integration is complete, then run the consolidated verification campaign. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## 24 November 2026 — source schema declaration and runtime barrel reconciliation

- The current source contains 100 `pgTable` declarations across 25 module `*.schema.ts` files. `drizzle.config.ts` discovers the module schema glob, while `DatabaseService` constructs its runtime Drizzle instance from `apps/api/src/drizzle/schema.ts`.
- Before this correction, the runtime barrel re-exported only 98 declarations because `catalog-import.schema.ts` (the platform-level `catalog_imports` and `catalog_import_errors` tables) was omitted. Source commit `474ef450d98a62fe3b2f6b480a5dc4ea300d824d` adds the missing barrel export. The runtime schema barrel now includes all 100 source declarations.
- This fixes source/runtime schema discovery alignment only. It does not apply a migration or prove the physical existence of every declared table in any deployed database.
- Keep the 19-November protected catalog snapshot distinct: its 114 public ordinary/partitioned relations were reconciled at that time as 99 Drizzle declarations plus 15 non-Drizzle relations (the migration ledger, backfill audit table and 13 analytics partitions). The current 100-declaration source count is not a replacement live catalog count. Migration 0075's `payment_proof_upload_intents` source declaration must not be assumed present in shared/staging until an authorized live catalog audit confirms it.
- The historical 116 count remains unexplained. A fresh protected read-only catalog audit must compare current relkinds, partitions, extension/system objects and API/migration role visibility. No such query was run here.


## 24 November 2026 — actor-context nesting correction and final source checkpoint

**Latest source checkpoint:** `0f3c180f5af389cb363e8919982af371dc178f16`.

- Source callsite review found that ReturnExpirationWorker already holds its lease-fenced worker actor when it calls `OpsControlService.isPaused()`. OpsControl now reuses the active actor context instead of attempting to switch to a second worker ID. This avoids the explicit actor-switch rejection in DatabaseService while preserving the worker's existing lease fence.
- P13Monitor's read helper likewise reuses an already-active verified actor context when nested and creates its dedicated `p13-monitor` worker context only when no actor context exists. Pilot policy and OpsAlert system helpers already follow the same reuse-before-create rule.
- Catalog Import resolver reads and CatalogTaxonomyService publishability checks are executed inside the caller's actor scope. The publishability validator's legacy natural-code-to-UUID correction is a DB write and therefore remains inside that same caller scope.
- Runtime schema barrel completeness correction `474ef450d98a62fe3b2f6b480a5dc4ea300d824d` includes the catalog-import schema; current source and runtime barrel both enumerate 100 declarations. The 114 public r/p count is a historical 19-November catalog snapshot (99 declarations + 15 non-Drizzle objects), not a current live count; 116 remains a separate unexplained historical count. No protected live catalog audit was run.
- No tests, formatter, lint, typecheck or E6 were intentionally run. No merge/deploy, worker activation, migration, RLS/grant/default-ACL change or shared/staging DB access occurred. Automatic CI run #1499 was queued on the prior source checkpoint and must not be treated as exact-head verification.

**Next task:** continue the source callsite and ownership-predicate audit across carrier credential lifecycle/retry/recovery, audit middleware, migration/bootstrap/CLI paths and raw database functions/triggers/partitions. Add targeted regression specs for actor reuse, worker nesting, caller-scope boundaries and the schema-barrel completeness correction after implementation/integration is complete. Then finish FK evidence and protected read-only API/migration identity/catalog verification.


## 24 November 2026 — CI failure triage and fixture compatibility correction

- Automatic PR CI run [#1499](https://github.com/nabeel2323/scs-platform/actions/runs/45394547128), on the earlier source checkpoint `75890feeffcef6f0035238476dc9242958dd5ec5`, completed with **API Lint PASS / API TypeScript typecheck FAIL**. The typecheck errors were due to test fixtures still calling the new caller-required APIs with legacy signatures, plus a stale `actorId` reference in PilotControl's flag log message. Vercel Web/Admin contexts also failed on the external build-rate-limit page.
- Corrected the PilotControl caller attribution reference. Updated Catalog Import executor/template tests to pass a verified caller; integration harnesses now use the real DatabaseService actor-context implementation. Updated executor unit doubles to expose the scoped-context hook. Updated P13 operational-readiness and PilotControl tests to pass caller contexts and use the real DB actor-context wrapper where PostgreSQL is involved.
- These are test-source/fixture corrections only. They have **not** been executed and no new typecheck was run. Do not treat CI #1499 as verification of the corrected test fixtures.
- Latest implementation/test commit: `4950e66507efebca8fbc7d910d65ae717f360732`. Exact-head Actions lookup returned zero workflow runs. Exact-head combined status contains only Vercel Web/Admin failures targeting the provider build-rate-limit page; these are not application test results. Commits use `[skip ci]` under the implementation-first verification restriction.
- PR #138 remains OPEN / DRAFT / UNMERGED. No merge, deployment, worker activation, migration, RLS/grant/default-ACL change, shared/staging DB access or provider call occurred.

**Next:** complete the remaining source callsite/ownership-predicate inventory, then run the consolidated typecheck/unit/PostgreSQL/E6 verification campaign only after implementation and integration are complete. Resolve any newly exposed failures before considering G-002 verified. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## 24 November 2026 — next G-002 source task

Continue the migration/CLI/raw database object audit. Review SQL function/trigger/partition creation and maintenance, direct Pool/PoolClient scripts, and operation ownership predicates. Keep runtime identity and live catalog evidence gated to the authorized read-only staging process. Add remaining actor-context regression coverage only after source integration is complete; do not run the verification campaign during implementation.


## 24 November 2026 — caller-role typecheck correction

The source correction `4d3488d7017439c1e756df4a595873dc9d590455` rejects missing/blank caller roles before carrier user actor creation and checks organization membership before encryption, then revalidates inside the insert transaction. It addresses the exact type error from run #1501 but has not been re-run. Exact-head CI is empty because the correction commit uses `[skip ci]`; no verification pass is claimed.


## 24 November 2026 — stale migration-ledger fail-closed correction

Source follow-up through `6f3327a2039c65fb0f9578202d4bd76c75e7b426` adds a second layer of migration consistency protection:

- Local `migrate.ts` and DatabaseService development bootstrap now refuse to proceed when pg_partman-dependent migrations 0013/0018 are already present in the ledger despite being excluded from the local image. They do not delete ledger rows or attempt automatic repair; the local DB may contain partial state and must be explicitly rebuilt/reconciled.
- The complete `migrate-pg.ts` runner now rejects impossible/stale analytics ledger states: 0018 without 0013, 0013 without the pg_partman extension/config row, or 0018 whose retention values do not match the migration.
- The disposable M7.3 runner refuses to continue if skipped pg_partman migrations already appear in its ledger.
- Local `migrate.ts` uses a unique per-process/per-file temp SQL path and cleans it up, avoiding concurrent runners overwriting the same temporary script.
- Disposable shell verification target guard now also checks `inet_server_addr()` is a Unix socket or loopback address, in addition to explicit test environment, exact DB/user, local PGHOST/PGHOSTADDR and no PGSERVICE redirection.

No database was inspected or repaired, and no tests/CI were run. These are source-level fail-closed checks only.


## 24 November 2026 — latest live source and CI checkpoint

**Current branch/PR head:** `bb193c7b52ed83bc6c0a6f72ce1a24ba4dcdd926` (documentation-only checkpoint). **Latest source implementation checkpoint:** `f21dbe4aca75ba04e9173b1fc28a9591829af554`. PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. Exact-head GitHub Actions lookup returned zero workflow runs. Vercel Web and Admin both report FAILURE: “Deployment rate limited — retry in 24 hours.” No tests, formatter, lint, typecheck, E6 or CI were intentionally run.

The latest source correction additionally rejects stale pg_partman migration ledger entries, validates analytics retention state in the complete migration runner, isolates local migration temp files per process/file, and makes the disposable M7.3 runner stop on the first failed migration. No DB action was run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## 24 November 2026 — migration FK source scan completion

The 75-file numbered migration scan found 183 explicit REFERENCES clauses across 40 migration files; 35 files had none. The detailed migration/count/parent-table appendix is in `docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md`. This completes the static source-reference inventory, not live catalog verification. Remaining: reconcile with Drizzle declarations and protected staging pg_constraint evidence, then finish cross-column ownership consistency decisions (org/store, carrier config/credential/store, payment/refund/order/settlement, shipping driver/store, reconciliation parent/org). No database query was run.


## G-002 — remaining cross-column ownership and evidence gaps (24 November 2026)

**Implemented source hardening:** settlement adjustments now derive organization from the sub-order's store, validate optional return-parent consistency, and validate settlement-payment/order consistency before posting. Commission reversals validate return-payment/order, return-item/order, organization and exact settlement payment/store relationships. See commits `01b6e6c729c1a458f20aaeaed043df4c569119e4` and `fa2547997c4b4dad490b582f92c9a69b8c01ed8f` and the updated migration FK crosswalk.

**Still open:**
- Driver-profile/store-assignment organization consistency.
- Reconciliation-run/discrepancy organization inheritance and scope.
- Remaining carrier/shipment, payment/refund/order/settlement cross-column relationships.
- Full Drizzle-to-migration FK reconciliation and protected read-only staging `pg_constraint` evidence.
- Actual API/migration runtime identities, external pg_partman scheduler owner/target, and the 114/116 live relation-count discrepancy.
- Regression specs and the consolidated verification campaign (deferred until implementation/integration completion).

No live database evidence or policy approval is implied by the source review. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## G-002 — remaining cross-column ownership and evidence gaps (24 November 2026)

**Implemented source hardening:** settlement adjustments now derive organization from the sub-order's store, validate optional return-parent consistency, and validate settlement-payment/order consistency before posting. Commission reversals validate return-payment/order, return-item/order, organization and exact settlement payment/store relationships. See commits `01b6e6c729c1a458f20aaeaed043df4c569119e4` and `fa2547997c4b4dad490b582f92c9a69b8c01ed8f` and the updated migration FK crosswalk.

**Still open:**
- Driver-profile/store-assignment organization consistency.
- Reconciliation-run/discrepancy organization inheritance and scope.
- Remaining carrier/shipment, payment/refund/order/settlement cross-column relationships.
- Full Drizzle-to-migration FK reconciliation and protected read-only staging `pg_constraint` evidence.
- Actual API/migration runtime identities, external pg_partman scheduler owner/target, and the 114/116 live relation-count discrepancy.
- Regression specs and the consolidated verification campaign (deferred until implementation/integration completion).

No live database evidence or policy approval is implied by the source review. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## G-002 — reconciliation and driver assignment follow-up (24 November 2026)

**Implemented:** reconciliation now verifies a supplied non-null organization exists, checks every discrepancy child has the same `org_id` as its parent run before returning the run, and verifies the parent-run scope before discrepancy resolution. Source commit: `98843bfe455667f7a96d7cbdd6dfb2253ce2af0f`.

**Driver assignment remains unresolved:** `driver_profiles.org_id` and `driver_store_assignments.store_id` have separate FKs without a same-organization constraint. The inspected ShippingModule/ShipmentOperationsController does not expose an assignment mutation path; shipment `assigned_driver_id` references users rather than driver profiles. Locate all consumers and any write path before adding guards or changing the model.

Regression coverage for the financial and reconciliation checks remains pending and unexecuted. Live `pg_constraint`, runtime identities and database state remain unverified. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.


## G-002 — refund/payment/order consistency follow-up (24 November 2026)

Commit `e9bf293dbdb8bde8ab2a7a409d37c2b411ee5b5d` adds missing refund order/currency equality checks to approval and both idempotent request recovery paths. The return-refund path already checks return/payment/order/refund/buyer/currency lineage under locks. Remaining cross-column checks and regression cases are documented in the G-002 migration FK crosswalk; tests remain pending and unexecuted.


## G-002 — shipment order/store consistency follow-up (24 November 2026)

Commits `b1e5490`, `02edaa8` and `15d328c` now enforce `orders.store_id = shipments.store_id` at shipment creation, shipment detail authorization (including platform-privileged reads), and carrier worker processing before provider/storage effects. Regression cases are documented in the G-002 crosswalk but remain unexecuted. Other carrier/shipment relationships and the driver assignment consumer remain open.


## G-002 — shipment read-path completeness follow-up (24 November 2026)

Commit `56d605a7377c49766b990abfc023e6ae4a5cea1d` adds same-store order validation to OrdersService exception/RTS access, order-based shipment lookup and driver shipment listing. Commit `c916acd0a8b156affeda50e98dbc88acab2f39bc` filters malformed shipment/order pairs from shipment list and count queries. Regression cases are documented in the G-002 crosswalk and remain unexecuted. Driver-profile/store-assignment consumers and other carrier/webhook relationships remain open.


## G-002 — carrier recovery and driver assignment follow-up (24 November 2026)

Carrier admin recovery, recovery queue, scheduled create/cancel reconciliation, webhook shipment resolution and tracking polling now enforce the shipment/order/store same-merchant relationship. See source commits `0581776`, `83a4073`, `2b2810e`, `5bbd35d` and `9c9d7f4` and the updated migration FK crosswalk.

Driver assignment remains unresolved at the model/consumer level: driver_store_assignments has separate driver-profile and store FKs without a same-org constraint, but no writer/controller/runtime consumer was found in the inspected ShippingModule; shipments.assigned_driver_id points to users. Do not add a speculative endpoint or change the FK model. Establish whether the assignment table is legacy/dead or used outside the inspected module.

Regression tests remain pending/unexecuted. Drizzle-to-migration reconciliation, protected live catalog evidence, runtime identities, scheduler ownership and independent review remain open. G-002 is NOT VERIFIED.
