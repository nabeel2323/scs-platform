# SCS Platform — Open Issues and Next Work

**Last reconciled:** 22 November 2026  
**Authoritative detail:** [Implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## Immediate blockers and high-priority work

### G-002 continuation — 22 November 2026

The source operation map now covers 26 service files plus supporting outbox, carrier, tracking, reconciliation, operations-control and worker paths. A separate schema review records candidate owner paths and principal classes across the major tenant, buyer/order, financial, user-private and system tables. These documents are source-only evidence, not an approved policy. Still open: complete the remaining import-executor/carrier recovery/bootstrap/migration/CLI paths; verify FK constraints and plain UUID relationships against migrations/catalog; map exact read/insert/update/delete predicates and route principals; obtain actual API/migration runtime identities and the protected read-only staging catalog snapshot; resolve 114-versus-116. No shared database changes, migration, grants, RLS, deployment or worker activation are authorized.



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

### G-002 — P1 database access and RLS

**Status: IN PROGRESS.**

Remaining:

- Actual API and migration runtime identity evidence from authorized staging execution.
- Protected read-only staging audit, with authorized approval of the `staging` environment.
- Exact per-table operation/row-ownership predicate review and transaction-local tenant-context feasibility.
- Reviewed least-privilege/RLS design and explicit authorization before any shared database mutation.

Do not enable RLS, apply migration 0070, change grants/default ACLs or alter Supabase-managed ownership as part of unapproved work.

## Other tracked unresolved findings

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

For exact statuses, priorities, evidence and dependencies, consult the 35-row register in [IMPLEMENTATION-PROGRESS.md](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## CI and formatting follow-up

- CI #1176 failed only at the changed-file Prettier gate on the controller test and progress tracker.
- Lint had zero errors (311 warnings), TypeScript typecheck succeeded and Flutter analysis/tests passed.
- API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped due to the lint job failure.
- Formatting correction is complete: formatter run #14 passed and the temporary workflow removed itself. CI #1180 on app-authored checkpoint f7f3ff6837f67f17cc00d5129a20f50e608bf3b6 failed the changed-file Prettier gate on three Markdown files. Lint/typecheck and Flutter passed; dependent jobs were skipped. Formatter run #15 completed successfully and formatted the three files. The helper workflow removed itself in cleanup commit 2d416c99700de8b511a7c376085a107cc24a854c and is absent from the final tree. CI #1183 on cleanup commit has action_required with no jobs; CI #1182 is on the pre-format commit. A fresh exact-head CI run is required.

## Next action order

1. Standardize or retire the remaining legacy M5/M6 UAT and migration harness scripts. Keep them local-only; remove fixed credentials and arbitrary DATABASE_URL overrides, and add explicit environment/confirmation guards.
2. Add a uniform staging target/approval guard to all bootstrap-staging platform/merchant/store/staff/RBAC scripts before any future invocation.
3. Complete method-level service-to-table ownership-predicate mapping, including the four direct-DB controllers, shared tenant-scope helpers, provider/webhook, bootstrap, worker and operator contexts.
4. Use the enhanced audit-db-access utility only after explicit protected read-only authorization to verify live API/migration identities, public relation-kind counts, partition RLS/privileges and the 114-versus-116 discrepancy. Do not apply RLS or change grants before this evidence and independent review.
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
