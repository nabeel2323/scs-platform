# SCS Platform — Implementation Roadmap

**Status source:** [Authoritative remediation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) and [progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).  
**Last checkpoint:** 23 November 2026.

This file is a compact navigation and sequencing view. The remediation plan owns phase definitions, finding scope, acceptance criteria and release gates. The progress tracker owns detailed finding status and evidence. Update this summary whenever those documents change.

## Programme direction

Stabilize the existing B2B marketplace rather than rewrite it. Close cross-merchant authorization and database access risks first, then finish commercial correctness, asynchronous reliability, client workflow parity and operational hardening. Run one coordinated full verification campaign only after the planned remediation is ready.

## Phase overview

| Phase | Focus                                                     | Checkpoint status | Main exit direction                                                                                      |
| ----: | --------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
|     0 | Baseline reconciliation and testability foundation        | IN PROGRESS       | Baseline, testability, safety and evidence discrepancies reconciled.                                     |
|     1 | Tenant security and database access safety                | IN PROGRESS       | P0 tenant boundary and DB access model verified; authorized limited staging testing only.                |
|     2 | Commercial correctness and checkout contract              | IN PROGRESS       | Seller/offer attribution, quantity, currency, payment, tax and fulfillment contracts are consistent.     |
|     3 | Event, worker and fulfillment reliability                 | IN PROGRESS       | Outbox ownership, durable claims, carrier workflows and operational controls verified.                   |
|     4 | Client workflow parity and truthful notifications         | IN PROGRESS       | Buyer, merchant and admin workflows are coherent across API, web and mobile; remaining UAT is evidenced. |
|     5 | Operational hardening, CI, data hygiene and documentation | IN PROGRESS       | Repeatable CI, deployment, recovery, security and documentation controls are ready.                      |
|     6 | Consolidated full verification and release decision       | NOT STARTED       | One controlled full test campaign and documented evidence-based go/no-go decision.                       |

## Priority sequence at this checkpoint

### 1. G-001 — P0 merchant offer authorization

Implemented in source and controller tests:

- Merchant mutation routes explicitly allow `MERCHANT_OWNER`, `MERCHANT_STAFF` and legacy `MERCHANT`.
- Create, propose, pricing update and withdrawal are covered by the explicit merchant-role gate in addition to permission and active store membership/organization checks.
- Platform-privileged roles must use the dedicated governance surface; governance reads require `catalog:offers:govern`.
- Regression tests cover supported merchant roles and denied buyer/finance/platform roles; governance-read permission tests cover ADMIN, MODERATOR, SYSTEM and SUPER_ADMIN.

Remaining:

- Exact-head CI #1268 passed on `b73f72e34406c1260f214610539139d0d096b2de`, including API unit/coverage and real PostgreSQL integration.
- The owner/staff/buyer/foreign-merchant/platform-admin matrix, membership revocation, DRAFT-store buyer exclusion, scope-first detail confidentiality, authenticated actor attribution, buyer allowlisting and same-store reference checks are implemented and CI-verified; see the G-001 review packet.
- Obtain independent security review. The implementation author must not label their own work independently reviewed.
- Record reviewer findings, remediate any issues and update the evidence register. Keep G-001 PARTIAL until the independent review is recorded.

### 2. G-002 — P1 database access and RLS

Continue evidence gathering and design only within authorized boundaries:

- Verify the actual API and migration runtime identities, not merely a management API identity.
- Obtain the protected read-only staging audit through the authorized `staging` environment approval.
- Review table-specific operation and row-ownership predicates, transaction-local tenant context feasibility, and a least-privilege access model. The 22-November source operation map covers 26 service files plus worker/system paths, and a separate schema-backed ownership candidate matrix is recorded; both remain preliminary and are not an approved RLS policy.
- Preserve the detailed schema coverage reconciliation and DB audit reports in `docs/remediation/`.

Do not make shared database changes as part of this work without explicit approval. G-002 remains IN PROGRESS until the evidence and design gates are satisfied.

### 3. Continue remaining findings and phases

Use the authoritative finding register to sequence G-007, G-010, G-012–G-015, G-018, G-020–G-022 and any other open/partial items. Do not silently change a finding status or product scope. Phase 6 remains unstarted until its entry criteria are met.

## Definition of done for an implementation group

- Code change matches the accepted scope and tenant/security constraints.
- Focused tests are added or updated and run.
- Relevant lint, typecheck, format and boundary checks pass.
- Relevant integration/migration/build checks are run where applicable.
- CI evidence references the exact commit SHA.
- Documentation and handover files match actual implementation and evidence.
- Deferred items, risks and approvals are explicit.
- No runtime, staging, production or database action is claimed without direct evidence and authorization.

## Release decision

A green PR CI run is not a staging approval, independent security review, release authorization or production go/no-go. Follow all release gates in the authoritative plan. PR #138 remains draft until the outstanding gates are explicitly satisfied.

### G-001 follow-up — 21 November 2026

The offer detail and merchant mutation paths now use the scope-first service boundary and normalize foreign/non-member identifiers to 404. Focused tests and exact-head CI are pending. Remaining: verify store lifecycle policy, complete analytics/trend and role matrix, and obtain independent security review.

The buyer offer list and ranked seller query now exclude offers from DRAFT stores while preserving merchant setup access. This addresses the inactive-store buyer visibility dimension; CI verification and the remaining role/analytics matrix are still open.

## G-001 buyer projection and create-reference hardening — 21 November 2026

The buyer-facing product offer endpoint now returns an explicit allowlist of public commercial fields instead of full merchant-offer rows. It excludes merchant metadata, external references, proposer/reviewer identifiers and timestamps, review details, price-list IDs and warehouse IDs. The ranked buyer endpoint no longer returns the internal price-list reference.

Offer creation now enforces the same-store ownership invariant for optional price-list and warehouse references, matching the existing pricing-update behavior. Unit tests cover foreign-store denial, same-store acceptance and the public projection. PostgreSQL integration tests cover cross-store reference rejection without inserting an offer and verify that private offer fields are absent from buyer and ranked responses.

The implementation and documentation are synchronized in this change. Exact-head CI must verify the resulting commit before G-001 status changes. G-001 remains PARTIAL pending full CI, remaining role/tenant acceptance and independent security review. G-002 remains IN PROGRESS. No shared database, staging, migration, grants, RLS, deployment or worker changes were performed.

### G-001 acceptance extension — buyer projection and same-store references

- [x] Explicit allowlist for buyer offer response fields; merchant-private fields are not serialized.
- [x] Ranked buyer response excludes internal price-list references.
- [x] Create-time price-list and warehouse ownership validation matches update-time enforcement.
- [x] Unit and PostgreSQL regression coverage added.
- [ ] Exact-head CI on the combined PR branch.
- [ ] Complete remaining tenant/role acceptance matrix and independent security review.

## CI #1259 regression analysis and correction — 21 November 2026

Exact-head CI #1259 exposed two defects. PostgreSQL rejected the correlated `EXISTS` predicate used by the buyer offer relational query because the outer `merchant_offers` reference was not valid in the generated query shape. The store-visibility predicate is being changed to an uncorrelated `store_id IN (SELECT id FROM stores WHERE status = 'ACTIVE')` subquery, preserving the visibility rule without the invalid outer reference. The catalog-offer unit harness also lacked `.limit()` on its selected-query branch, which broke tenant-membership tests; the harness now supports `.getSQL()`, `.limit()` and `.groupBy()` for the relevant query shapes.

CI #1259: lint/typecheck, formatting, mobile, Web/Admin, boundary lint and migration/read-only audit passed. API unit/coverage and PostgreSQL integration failed for the two issues above. The correction is committed with regression coverage; exact-head CI must pass before G-001 advances. No staging/database writes or deployment actions were performed.

## G-001 CI #1265 fixture correction — 21 November 2026

The latest exact-head CI exposed test-harness omissions rather than a production authorization defect: five PostgreSQL integration suites constructed Drizzle schema maps without `storeMembers`, while the production offer service now correctly requires an ACTIVE store membership. The grouped correction registers the model in each schema map and explicitly marks buyer-discovery stores ACTIVE. Preserve the guard and rerun full exact-head CI before advancing G-001. G-001 remains PARTIAL pending the full role/tenant acceptance matrix and independent review.

## G-001 — CI #1266 formatting-only blocker — 21 November 2026

The tenant-membership fixture correction is committed in `52336f7`, but CI #1266 stopped at changed-file Prettier. Lint/typecheck passed with zero errors and Flutter passed; dependent API, PostgreSQL, migration, Web/Admin, boundary, contract, container and build jobs were skipped. Format the nine flagged files using the repository-locked formatter, then obtain exact-head CI before claiming the fixture correction verified.

## G-001 exact-head verification — 21 November 2026

CI [#1268](https://github.com/nabeel2323/scs-platform/actions/runs/44907038784) passed all 10 executable jobs on exact head `b73f72e34406c1260f214610539139d0d096b2de`. API unit/coverage, real PostgreSQL integration, migration full-apply/read-only audit, Web/Admin, Flutter, E6 boundary lint, contract/codegen, build, container smoke and lint/typecheck/format all passed. k6 and protected staging release were skipped. Automated acceptance coverage is now verified; the remaining G-001 gate is an independent security review and reviewer-directed remediation, if any.

## G-001 INACTIVE-store buyer visibility — 21 November 2026

Added a disposable-PostgreSQL integration case proving an `INACTIVE` merchant store is excluded from both buyer product-offer list and ranked-offer results, while a separate ACTIVE store remains visible. The test restores the modified fixture in `finally` and does not define merchant-management permissions for inactive stores. Exact-head CI is pending; G-001 remains PARTIAL pending verification and independent security review.

## Latest execution checkpoint — 21 November 2026

## Latest verified checkpoint — 21 November 2026

- Branch: `remediation/phase-0-1-tenant-security`; source commit: `ffd3961c32164c2af00090b32dbafb06b997a581`.
- PR [#138](https://github.com/nabeel2323/scs-platform/pull/138) remains open, draft and unmerged; base `develop` is `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Exact-head [CI #1280](https://github.com/nabeel2323/scs-platform/actions/runs/44922582006) completed successfully on that SHA. All 10 executable jobs passed: lint/typecheck/changed-file formatting; Flutter analysis/tests; API unit/coverage; PostgreSQL integration; Web/Admin tests; E6 boundary lint; migration full apply and read-only access audit; container build/smoke; build; and contract/codegen. k6 and protected staging release were skipped.
- The PostgreSQL integration job executed `pnpm --filter @scs/api test:integration` against disposable PostgreSQL 16 and Redis services and passed. The `catalog-lifecycle.e2e.spec.ts` suite, including `hides buyer offers for an INACTIVE store`, is included in that integration test command. The test verifies both buyer list and ranked results exclude the INACTIVE store while the ACTIVE store remains visible, and restores the fixture in `finally`.
- G-001 remains PARTIAL only pending independent security review and disposition of reviewer findings. The review packet is prepared but is not itself an independent review.
- G-002 remains IN PROGRESS. Actual staging API/migration runtime identities and the protected read-only staging audit remain unverified. The connected Supabase Management API `postgres` identity is not a substitute.
- No staging deployment/write, shared database mutation, migration 0070, grants/default ACL change, RLS enablement, environment change or worker activation was performed.

### Next sequence

1. Complete independent G-001 review and disposition any findings; do not self-certify independence.
2. Continue G-002 read-only identity/access design. The next runtime evidence depends on the separately reviewed and approved runtime-identity diagnostic change and controlled release; do not deploy or trigger it from this remediation branch.
3. Preserve the staging/database restrictions and defer Phase 6 until all phase entry criteria are met.

## User-approved Implementation Completion Program — 22 November 2026

The project now follows an implementation-first sequence. See the [Implementation Completion Gap Register](./IMPLEMENTATION-GAP-REGISTER.md) for the evidence-backed initial gap list, status definitions and row-level acceptance requirements.

1. **Baseline and gap mapping:** inspect the actual source, modules, routes, screens, schemas, permissions, workflows, docs and audit evidence; record every confirmed gap without assuming historical findings remain unfixed.
2. **Implementation completion:** complete missing backend, database, security/tenant, web, admin, mobile, POS/merchant, operational and documentation behavior. Batch related changes into cohesive commits.
3. **Integration completion:** close API-contract-database-client-worker and cross-module wiring gaps.
4. **Comprehensive testing:** defer the broad coordinated unit/API/PostgreSQL/migration/security/tenant/concurrency/web-admin-mobile E2E/performance campaign until implementation and integration are ready.
5. **Stabilization:** fix issues revealed by the campaign and rerun the required affected/full suites.
6. **Release readiness:** independent review, authorized staging acceptance, migration/rollback/recovery, business sign-off and explicit go/no-go.

Lightweight developer checks continue during implementation; full regression is not run repeatedly after every small change. A concrete security or correctness defect found during implementation is fixed immediately, not deferred. The programme changes sequencing only: all existing G-001/G-002, protected staging, shared database, no-merge/no-deploy and release gates remain binding. Do not mark an item VERIFIED merely because it is IMPLEMENTED.

## MAP-001 source inventory — 22 November 2026

The first static inventory is documented in [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md). It establishes current API/web/admin/mobile/database/test/documentation surfaces and corrects several stale September UI audit claims. MAP-001 remains IN PROGRESS: the full route-to-contract/permission matrix, all physical database relation operation paths, and worker/provider ownership/activation matrix remain incomplete. Confirmed UI/workflow candidates are now tracked as UX-001–UX-009 in the programme register. Do not start broad regression testing; use targeted source checks during implementation and preserve Phase 3 for the consolidated test campaign.


## G-002 service and CLI access mapping — 22 November 2026

The service/worker source map now covers all 53 candidates (44 direct DB-operation paths and 9 database-independent helpers/providers). A separate CLI/bootstrap map records migration runners, startup migrations/seeds, RBAC/catalog/demo seeds, bootstrap token issuance/completion, staging provisioning, audit/reset tools and legacy UAT harnesses. Three script-safety fixes were grouped in commit `6b40d43fdfda45d59afaff7a7956c6be98039d0f`.

Next: map each API controller route to the exact service method and table/raw-SQL operations, then finish physical DB-object and ownership evidence. The 114-versus-116 relation discrepancy, deployed runtime identities and protected staging audit remain open. The implementation-first sequence continues; broad testing is reserved for the final consolidated phase.


## G-002 controller, CLI and physical database inventory checkpoint — 22 November 2026

Completed the source maps for 53 API service/worker candidates, 28 module controllers, direct controller DB access, shared tenant-scope helpers, CLI/migration/bootstrap paths and the 15 non-Drizzle public relations in the 19-November 114-table count. Added a legacy carrier webhook ambiguity fix and enhanced the read-only audit utility.

Next implementation is local-only hardening/retirement of legacy M5/M6 scripts, uniform target confirmation for staging bootstrap scripts, and method-level service-to-table ownership predicates. The live API/migration identities and 114-versus-116 relation count remain protected read-only evidence gates. No tests or Actions were run.


## G-002 operator script safety checkpoint — 22 November 2026

Completed shared local-only guard coverage for the legacy M5/M6 UAT scripts and migration harnesses, plus exact-target confirmation for all staging bootstrap scripts and the package preflight. No scripts were executed. Next: method-level service-to-table ownership predicates, worker/outbox/system context review, then protected live identity/catalog verification.


## 2026-11-22 — G-002 method-level predicate batch 3

- Implemented PricingService same-store validation for price list ↔ variant ↔ product relationships on tier create/update/delete, product-pricing reads and price resolution.
- Hardened MerchantService document listing/download and organization verification listing to require current ACTIVE organization membership, not merely an organization_members row.
- Hardened document upload at the service boundary: HTTP controller supplies CallerContext; service enforces activeOrg equality, ACTIVE org membership, store→org consistency and ACTIVE store membership for store-scoped documents.
- Added caller-context checks to organization-scoped store/customer reads.
- Added merchant/pricing tenant-scope regression specs; not run.
- No tests, CI, database connection/query/write, migration, grant/RLS change, staging/deployment, worker activation or provider call occurred.


## 2026-11-22 — G-002 method-level predicate batch 4

- Implemented return-inspection inventory scoping by order store and warehouse join.
- Hardened settlement adjustment target ownership and returnRequestId/subOrderId relationship checks; locked transitions and detail reads verify the actual target organization.
- Corrected reconciliation discrepancy resolution to use financialOrgScope and repeat orgId in the mutation predicate.
- Completed source review of dispute participant and review subject/order ownership boundaries.
- Added returns-inspection-inventory-scope.spec.ts, settlement-adjustment-tenant-scope.spec.ts and reconciliation-tenant-scope.spec.ts. Tests were not run.
- Next: carrier/shipping method-level review, then worker/outbox/bootstrap/system. No tests/CI, DB, migration, grant/RLS, staging/deployment or worker action occurred.


## 2026-11-22 — G-002 method-level predicate batch 5

- Implemented ACTIVE organization membership checks for shipping and carrier administration.
- Hardened carrier configuration resolution and removed Aramex cross-tenant credential fallback. Store-bound provider operations now use store-specific/org-default active credentials; platform-only credentials are used for unscoped address validation.
- Passed store context through tracking controller, worker, poller and reconciliation paths; validated outbox tenant metadata before external carrier side effects.
- Added shipping tenant-context regression coverage and updated worker label fixture. Tests not run.
- Next: worker/outbox/bootstrap/system source predicates and final raw DB object evidence. No tests/CI, DB, migration, grants/RLS, staging/deployment, worker activation or provider calls occurred.


## 2026-11-22 — G-002 worker/system/operator continuation

- Implemented return-expiration claim and escalation fencing at the transaction boundary, plus platform-only manual escalation.
- Added store/org consistency validation to pilot allowlist writes.
- Added expiry checks to all WorkerLeaseService ownership mutations and liveness checks.
- Added atomic P13 alert delivery claims with stale-claim recovery and migration 0073.
- Completed bounded source mapping of worker, outbox, bootstrap, audit and operator contexts. The generic outbox is still a log-only sink; external event-bus integration remains deferred.
- Added focused regression tests but did not execute them. Full test, CI and release gates remain consolidated at the end of implementation.


## 2026-11-22 — Mobile pricing, pricing tenant scope and Admin order presentation

- Implemented UX-012 mobile merchant pricing list/tier management and linked it to offer creation/detail.
- Enforced store-scoped variant-tier reads in PricingService for both direct variant pricing and internal price-list resolution.
- Implemented UX-013 Admin order item label enrichment and UI presentation.
- Added focused tests; did not execute them. Next implementation stream is the remaining UX-010 screen audit. Protected G-002 runtime identity/catalog and RLS gates remain open.


## 2026-11-22 — UX-015 Product Studio save-flow integrity

- Separated product/variant persistence at the Offer step from commercial-offer creation at final Review save.
- Blocked navigation after failed saves or while saving; added required store/title validation and in-flight button disablement.
- Added persisted-SKU checks so retries do not recreate variants already written by a partial save.
- Confirmed UX-005 warehouse selection was already implemented; corrected the stale whole-product inventory description. Focused helper tests added but not run.
- Next: continue UX-010 source re-audit across remaining Admin/Web/Mobile screens, recording only contract-backed gaps. Do not run the comprehensive suite until implementation/integration completion.


## 2026-11-22 — UX-016 buyer cart mutation recovery

- Cart quantity, remove and clear actions now use a shared mutation wrapper with visible errors, pending-state locking, refresh-on-success and guaranteed pending cleanup.
- Added accessible labels and progress feedback to cart controls; promo and checkout are blocked while a cart mutation is in flight.
- Cart load fallback preserves the last successful cart and exposes a retryable error rather than showing a false empty state.
- Focused tests added but not run. Continue the UX-010 Admin/Web/Mobile source audit; keep full testing consolidated after implementation/integration.


## 2026-11-22 — UX-017 Admin returns oversight recovery

- Added standardized retryable error/loading/not-found states to the Admin return detail page and retryable queue error handling.
- Protected the queue against out-of-order responses when status filters change or the screen unmounts.
- Made detail reload awaitable for the escalation resolution flow. Added focused tests for queue and detail retry recovery; not run.
- Continue UX-010 source re-audit across remaining Admin/Web/Mobile screens. Full test campaign remains at the end.


## 2026-11-22 — UX-018 Mobile cart mutation locking

- Added a shared in-flight lock for mobile cart quantity/remove actions and disable cart controls during item, promo or clear mutations.
- Added per-row busy feedback and optional enabled state to QuantityStepper; both +/- buttons and direct text input are disabled while busy.
- Failed quantity writes reset the local stepper from provider-backed cart data. Focused Flutter widget tests added but not run.
- Continue remaining UX-010 source audit and integration; consolidated test campaign remains deferred.


## 2026-11-22 — UX-019 Admin dispute read recovery

- Added retryable dispute detail and Events/Evidence errors, with separate request-version guards to ignore obsolete route/tab responses.
- The evidence timeline clears stale rows before a new fetch and cannot be repopulated by an obsolete request after leaving the tab.
- Added focused tests for both retry paths; not run. Continue remaining UX-010 source audit; comprehensive testing remains deferred.


## 2026-11-22 — UX-020 Admin user/merchant/organization detail recovery

- Added retryable detail loading for users, merchants and organizations with request-version guards against stale route responses.
- Isolated the user's effective-permission catalog load from the core user record. The user detail remains available when the permission catalog fails; the Permissions tab now has an independent retry state.
- Added focused tests for user, merchant and organization read recovery; not run. Continue remaining UX-010 source audit.


## 2026-11-22 — UX-021 Admin dispute resolution workflow

- Added a resolution form to Admin dispute detail, wired to the existing protected resolve endpoint. Required text, pending state, error/success feedback and final resolved-state rendering are included.
- The existing route permission and platform-admin service guard remain authoritative; no new refund contract was assumed.
- Added a focused component test; not run. Continue UX-010 source audit and implementation.


## 2026-11-22 — UX-022 Admin detail recovery expansion

- Added retryable primary reads and stale-response protection across attribute, brand, import-job, offer, order, role, variant, category and product-type detail screens.
- Fixed two misleading empty-state cases: import errors and offer inventory now show retryable read failures rather than “no errors”/“no inventory.”
- Role permission-save errors now stay in an inline action banner without hiding the role detail.
- Added focused tests for attribute/order retry and import errors-tab recovery; not run. Continue remaining UX-010 screen audit.


## 2026-11-22 — UX-023 ProductDetails merchant-offer read recovery

- Added retryable offer loading and stale-response protection to the Admin ProductDetails Offers tab. Errors and empty data are now distinct states.
- Added focused component test; not run. Continue remaining UX-010 source audit.


## 2026-11-22 — UX-024 Admin financial workflow recovery

- Added retryable read states and separate action-error feedback to payments, settlements, reconciliation and settlement-adjustment workflows.
- Added stale-request guards for payment tabs and settlement/reconciliation filters. Reconciliation run detail has its own retry action.
- Added focused tests for the four financial list recovery paths; not run. Continue UX-010 source audit.


## 2026-11-22 — UX-025 Product Studio existing-product update integrity

- Product Studio now updates previously created products on subsequent saves, carries the optimistic-lock `updatedAt` value and persists supported product type and canonical identifiers.
- The progress stepper can no longer jump over required sequential steps or bypass the Offer-step save guard; it is disabled during persistence.
- Added focused tests for stepper navigation and failed update transition. Not run. Continue UX-010 source audit.


## 2026-11-22 — UX-026 / UX-027 Product Studio canonical reuse and media persistence

- Corrected existing-canonical-product selection to reuse the selected canonical product rather than create a duplicate. Merchant workflow does not mutate shared identity, specifications, variants or media; those steps are read-only. Existing selected variant is passed to the offer create contract.
- Product Studio now attaches uploaded/linked media to merchant-owned products during save, with a pre-insert media read and URL deduplication to make partial retries safe.
- Added helper tests for canonical target precedence and media deduplication; not run. Continue UX-010 audit.


## 2026-11-22 — UX-027 Product Studio offer retry-safety continuation

- Scoped offer retry markers by store/product/variant; changing any dimension establishes a distinct target.
- Reconciled existing store offers before retrying a create after an uncertain response, comparing commercial terms and preventing the ordinary sequential retry from creating a duplicate. Nullable legacy prices safely do not match.
- Focused helper coverage added; tests remain unexecuted. This is not a server-side atomic idempotency guarantee for concurrent clients.

## 2026-11-22 — UX-028 mobile buyer return lifecycle parity

- Closed the source-level buyer returns parity gap between Web and Flutter using only the existing P13 contracts. Mobile now supports buyer-owned return creation, active-state visibility, cancellation and shipped confirmation.
- API authorization and lifecycle remain unchanged: the server owns buyer checks, payment/delivery/return-window eligibility, one-active-request and cumulative return quantities. No new RBAC permission or route was added.
- Added focused Flutter model/API contract tests in commit `d7ffc3339db78f16e0f8a9aa7cb551ea28fabdcf`; not executed. Continue UX-010 source re-audit and the remaining integration work; keep the consolidated test campaign at Phase 3.


## 2026-11-22 — UX-029 mobile buyer return detail/history parity

- Added full buyer return detail and lifecycle-event history to Flutter Order Detail via the existing buyer-authorized return-detail endpoint.
- Detail includes status, requested/actual refund, reason/description, tracking, inspection and merchant notes, returned item quantities/conditions, and ordered lifecycle events. Read failures can be retried.
- Extended DTO parsing and focused model/API tests; not executed. The existing route/permission model remains unchanged.


## 2026-11-22 — UX-030 Web buyer self-service recovery

- Added retryable read-failure handling to Notifications, Favorites, Saved Suppliers and Profile Sessions.
- Prevented failed list reads from being presented as successful empty states. Surfaced failed favorite/supplier removals and preserved affected rows. Corrected notification optimistic rollback to restore the original state.
- Added focused Web tests; not executed. Continue remaining UX-010 Web/Merchant route-to-contract and permission audit.


## 2026-11-22 — UX-031 Merchant Customers recovery

- Merchant Customers now distinguishes failed reads from a successful empty list, provides Retry, and preserves the last successful list after a failed manual/realtime refresh.
- Focused tests added but not executed. Continue UX-010 Web/Merchant audit; comprehensive tests remain Phase 3.


## 2026-11-22 — UX-032 Merchant Deliveries recovery

- Merchant Deliveries now exposes Retry on read failure and does not show a successful empty queue while the read has failed. Existing rows are preserved on refresh failure.
- Focused test added; not executed. Continue UX-010 Merchant/Web screen and permission audit; comprehensive tests remain Phase 3.

## 2026-11-22 — UX-033 / UX-034 Merchant Web implementation

- Merchant Returns now discovers stores through the authenticated store-list API, selects the first available store and supports store/status filtering. Store/list errors have retry paths and stale requests cannot overwrite newer selections.
- Merchant Return Detail now supports retry after a failed read.
- Merchant Organization auxiliary reads for verification history, update requests, stores, warehouses, roles and members now expose errors/retry. Last successful rows are retained where available; verified-org updates are disabled while pending-request state is unknown.
- Added focused Web tests for returns list/detail and organization recovery. Not run. Continue UX-010 audit and integration; Phase 3 remains the consolidated test campaign.

## 2026-11-22 — UX-035 / UX-036 Merchant Orders and Offers recovery

- Merchant Orders now exposes store-directory and order-list failures with Retry, shows loading state and suppresses “No orders yet” until a successful empty response. A missing accessible store clears stale store/order data.
- Merchant Offers now exposes store, offers, products, analytics and trend read failures with appropriate retry paths. Product selection/offer creation are disabled while products are unavailable; failed analytics no longer becomes zero sales in the UI or CSV.
- Focused tests added for Orders and Offers read recovery. Not run. Continue UX-010 across remaining merchant inventory/imports, Admin and Mobile workflows; Phase 3 remains the consolidated test campaign.

## 2026-11-22 — UX-037 Merchant Inventory movement-history recovery

- The stock movement-history dialog now distinguishes failed reads from a successful empty history and exposes Retry.
- Extracted `readInventoryHistory` into a small helper with focused success/failure tests. Not run.
- No API/permission/schema/DB change. Continue the remaining Merchant Inventory variant, import and workflow audit.

## UX-038 / UX-039 — Merchant Inventory and Import History recovery — 22 November 2026

Completed the source implementation for the next Merchant Web re-audit slice. Inventory variant lookup now treats product and variant reads as a complete directory operation, exposes Retry and prevents stale/partial results from appearing successful. Import History now exposes store discovery and job-read failures separately, distinguishes a true no-store state, retains last successful rows during refresh errors, and polls only while jobs are active without overlapping requests. Focused tests were added but not executed. Both items are IMPLEMENTED / TESTING_PENDING; continue the UX-010 audit across the import wizard and remaining Admin/Mobile workflows. The consolidated full test campaign remains deferred until implementation and integration completion.

## UX-040 / UX-041 — Merchant Import Wizard — 22 November 2026

Completed the Merchant Import Wizard source audit slice. Store discovery now has loading/error/retry/no-store states. Processing status polling starts after the process request succeeds, is generation-guarded and overlap-safe, is cancelled on unmount, exposes retry on read failure, and renders COMPLETED/FAILED/CANCELLED outcomes truthfully. Focused tests were added but not executed. Continue the UX-010 re-audit across remaining Merchant Inventory workflows, then Admin and Mobile. Keep the consolidated full test/fix campaign deferred until implementation and integration are complete.

## UX-042 — Merchant Warehouses — 22 November 2026

Completed the Merchant Warehouses source re-audit. Store discovery now distinguishes failed lookup from no store and exposes retry. Warehouse reads have their own loading/error/retry state, suppress false empty results, preserve prior rows after failed refreshes and ignore stale responses. Focused test added but not executed. Continue UX-010 source re-audit across remaining Admin and Mobile workflows; keep full testing deferred until implementation and integration are complete.

## UX-043 — Admin Dashboard — 22 November 2026

Completed the Admin Dashboard read-recovery slice. KPIs, pending organization updates, Catalog Imports and Catalog Requests now have independent retry/error/loading handling and stale-response guards. Failed KPI reads no longer display zero defaults; failed lists no longer masquerade as empty; last successful data is retained during refresh errors. Focused test added but not executed. Continue UX-010 audit across remaining Admin and Mobile workflows; keep full testing deferred until implementation and integration are complete.

## UX-044 — Admin KPI Dashboard — 22 November 2026

Completed the dedicated Admin KPI Dashboard recovery slice. KPI reads now have retryable errors, request-version guards and stale-data preservation. Initial failures show unavailable values instead of zero defaults; failed date-range refreshes retain the last successful dataset. Focused test added but not executed. Continue UX-010 across remaining Admin workflows (next: Organizations list/update-request read separation), then Mobile.

## UX-045 — Admin Organizations — 22 November 2026

Completed the Admin Organizations read-recovery slice. Organization directory and update-request queue now load independently, each with its own retry/error/loading state and request-version guard. A failure in one endpoint no longer blocks the other list or renders a false empty state; last successful rows remain visible during failed refreshes. Focused test added but not executed. Continue UX-010 across remaining Admin users/merchants workflows, then Mobile.

## UX-046 / UX-047 — Admin Users and Merchants — 22 November 2026

Completed the Admin Users/Merchants source audit slice. User creation now supports optional phone, exposes retryable organization/role lookups and enforces paired initial membership selection in both UI and service. User Detail now exposes audited profile editing, membership assignment/removal and confirmed suspension/deactivation. The permissions tab now shows configured permissions for each assigned role and no longer labels the global permission catalog as user-effective. Merchant Store Detail now presents locale, popularity-badge visibility, logo/cover previews and address data already supplied by the API. Focused Admin/API tests were added but not executed. Continue UX-010 across remaining Admin routes and then Mobile; keep comprehensive testing deferred until implementation/integration are complete.

## UX-048 / UX-049 — Admin Roles and Audit Log — 22 November 2026

Completed the Admin Roles/Audit Log source audit slice. Roles now has a retryable error state and request-version/unmount protection. Audit Log query requests are generation-guarded so stale filter responses cannot replace current results; its error state has an explicit retry action and successful prior rows remain visible during refresh failures. Focused tests were added but not executed. Continue UX-010 across remaining Admin routes and Mobile workflows; keep comprehensive testing deferred until implementation/integration are complete.

## UX-050–UX-053 — Admin Catalog and Analytics — 22 November 2026

Completed the next Admin source-audit slice. Category Detail's product-type, product and attribute-schema reads are retryable and generation-guarded; Attributes loads its own product-type dependency and refuses to present partial schema aggregation as complete. Product Type Detail no longer shows an empty Products tab after a failed read. Catalog Import Center now separates history-read errors from action errors and only renders a true empty history after successful reads. Analytics event/activity queries are independently generation-guarded and retryable. Focused tests were added but not executed. Continue UX-010 across remaining Admin operational/catalog routes and then Mobile; full validation remains deferred until implementation/integration are complete.

## UX-054–UX-057 — Admin finance, brands and calendar — 22 November 2026

Completed the next Admin source-audit slice. Commission Oversight status-filter reads are generation-guarded and retryable; failed reads no longer appear empty. Offer KPI/Trend filters are generation-guarded, retryable and no longer display fabricated zero/empty sales after failed initial reads. Brand Management has retryable reads and suppresses false empty results. Business Calendar has request lifecycle protection, retry and error-aware empty-state suppression across calendar/holiday/audit data. Focused tests were added but not executed. Continue UX-010 across remaining Admin operational workflows and then Mobile; comprehensive validation remains deferred until implementation/integration are complete.

## UX-058 — Admin Attribute Groups and Definitions — 22 November 2026

Completed the Admin attribute directory recovery slice. Attribute Groups and Attribute Definitions now use request-version guards and cleanup invalidation, expose accessible retryable errors and suppress empty result rows/counts after failed reads. Attribute Definitions filter responses cannot overwrite newer selections. Focused tests were added but not executed. Continue UX-010 across remaining Admin operational workflows and then Mobile; full testing remains deferred until implementation/integration are complete.

## 2026-11-23 — UX-087 / UX-088 Mobile merchant operational recovery

- Merchant Offer Detail now preserves last-successful offer and analytics values through refresh failures, provides retryable initial errors and keeps analytics/trend reads independent. Failed metrics remain unavailable rather than appearing as zero sales.
- Merchant Inventory now refreshes active store before store-scoped inventory/warehouse data, preserves last-successful store and inventory page, exposes independent warehouse retry, and supports pull-to-refresh even for a successful empty inventory.
- Focused Flutter tests were added for both slices; they have not been executed and remain TESTING_PENDING for Phase 3.
- No API, permission, offer lifecycle, pricing, stock mutation, warehouse transfer, database or migration behavior changed.
- Continue the source-first audit across remaining Mobile merchant operational routes, then Web/Admin route/action permission mapping. Keep Phase 3 as the consolidated full test campaign.

## 2026-11-23 — UX-089 / UX-090 Mobile Pricing and Customers

- Merchant Pricing list and detail now preserve last-successful price-list and tier data through refresh failures, expose retryable initial errors and await explicit/pull-to-refresh operations. Initial tier-read failure no longer displays a fabricated zero tier count.
- Merchant Customers now preserves the last successful directory and filtered statistics during refresh failures, supports awaited explicit/pull-to-refresh and distinguishes failed reads from successful empty/no-match results. Search and sort state are retained.
- Focused Flutter tests were added for both areas; they have not been executed and remain TESTING_PENDING for Phase 3.
- No API, permission, pricing, stock, customer, order, financial, database or migration behavior changed.
- Continue the Mobile merchant audit with Orders and store/profile route transitions, then remaining Web/Admin route/action permission mapping. Keep Phase 3 as the consolidated full test campaign.

## 2026-11-23 — UX-091 Mobile Merchant Orders refresh lifecycle

- Merchant Orders explicit refresh now resolves the active store and awaits the dependent order-list read without issuing a duplicate request.
- The order queue and successful empty state are always-scrollable and support pull-to-refresh. Last-successful rows remain visible during refresh/reload failures.
- Added three focused Flutter widget scenarios; not executed and remain TESTING_PENDING for Phase 3.
- No order transition, fulfillment, stock reservation, API, permission, database or migration behavior changed.
- Continue Mobile Store Profile and merchant route-transition audit, then remaining Web/Admin route/action permission mapping. Keep Phase 3 as the consolidated full test campaign.

## 2026-11-23 — UX-092 Mobile Store Profile and warehouse recovery

- Store Profile refresh now awaits the store-directory read and dependent active-store value before refreshing the current warehouse directory.
- Added pull-to-refresh for the full profile form, stale store preservation during refresh/reload failures, and independent retry/stale-data handling for warehouse reads. Successful empty warehouse results remain distinct from errors.
- Added three focused Flutter widget scenarios; not executed and remain TESTING_PENDING for Phase 3.
- No store update, warehouse creation, permission, API, database or migration behavior changed.
- Continue the remaining Mobile merchant route-transition audit, then Web/Admin route/action permission mapping. Keep Phase 3 as the consolidated full test campaign.

## 2026-11-23 — UX-093 Organization/session context invalidation

- Centralized invalidation of organization-scoped client reads and applied it to both organization-switch flows after the new token is persisted and installed.
- Active-store resolution now requires a match for the selected active organization; no fallback to a different organization's store.
- New login clears persisted active-org state and invalidates authenticated caches; logout clears in-memory identity/org context and authenticated reads.
- Added focused ProviderContainer tests for org-scoped invalidation, active-store org matching and session reset; not executed and remain TESTING_PENDING for Phase 3.
- This does not replace server-side tenant authorization and makes no API, permission, database, migration, RLS, worker or staging changes.
- Next: Mobile route permission and org-context transition audit, then Web/Admin route/action permission mapping. Keep Phase 3 as the consolidated full test campaign.


## UX-094 — Mobile merchant category permission/contract alignment — 23 November 2026

- Source audit confirmed `CatalogController` category create/update/delete operations require `catalog:categories:write` **and** platform role ADMIN/MODERATOR. The Mobile router's merchant-role gate excludes those platform roles from `/merchant/*`, while the merchant category screen previously displayed New/Edit/Delete controls to merchant owners/staff. Those controls could only fail at the API boundary.
- The merchant category directory now requires `catalog:categories:read`, the Home/Dashboard entry uses the same read permission, and merchant users see a read-only list with no mutation controls. A pure policy helper mirrors the API's ADMIN/MODERATOR + write-permission condition. No API role guard or permission grant was weakened.
- Focused route/helper tests were added in `mobile/test/route_permissions_test.dart`; not executed. Commits: `6741baf6f7d47c12ddc79d3ca1f4bbd3f110a39f`, `6f0659299c39952b0c8190a4a8dd520ccd3e3db9`, `bb2e4650534bae0b30bf112500db184c227ccba8`, `7b293273f4aba14429ed226932123678a0892c55`, route-matrix test `76b9b15dc1db37c67841d405b4a232f4731fc986`, and explanatory source comment `bd672f0b93de31d6bc669bb7785eeb70a345c302`.
- Client alignment is IMPLEMENTED / TESTING_PENDING. Actual merchant-owned category CRUD remains BLOCKED pending a product/API ownership decision: either implement store-scoped category ownership and membership authorization, or move category mutation to a dedicated platform-admin surface. Do not expose write controls until that decision and backend contract exist.
- No API, RBAC seed, role grant, schema, database, migration, RLS, worker, staging or deployment behavior changed.

### 4. UX-094 / UX-095 — client permission and organization-context alignment

- UX-094 Mobile merchant category permission/contract alignment is implemented; merchant-owned category CRUD remains blocked until the backend ownership contract is decided.
- UX-095 Web merchant route/action permission alignment is implemented: direct route guards, permission-filtered navigation/dashboard, operation-specific action controls, and workspace remount/stale-response protection on active organization or permission changes.
- UX-096 Mobile route/action permission and organization-context transition alignment is implemented: offer read/create separation, operation-specific driver assignment permission, read-only offer controls, and merchant-shell remount on organization/permission changes.
- G-036 server-side realtime room authorization is implemented in source with focused API gateway tests added. Store/order rooms now require tenant ownership, buyer ownership, driver assignment or platform-staff read permission as appropriate.
- Focused tests have been added but not executed; exact-head CI and independent review remain pending.

**Next implementation task:** finish the remaining Admin route/action permission mapping. Keep the comprehensive test campaign in Phase 3.


## FIN-001 — Refund approval concurrency and request idempotency — 23 November 2026

The P12 refund flow had a concrete concurrency gap: distinct partial refunds could be approved concurrently without locking their shared payment row. Both transactions could calculate from an incomplete aggregate and leave a fully refunded payment marked PARTIALLY_REFUNDED. The approval path now locks the payment row before changing refund status and computing the cumulative successful amount. Request idempotency now returns the existing refund for identical caller-supplied key/payload retries and rejects mismatched reuse; conflict-safe insertion handles concurrent cross-payment key collisions.

PostgreSQL regression cases FIN-DSH-11 and FIN-DSH-12 were added but have not been executed. Source/test commit: `117614884ff1e0d50ca116f0b28f249fd83761c0`. No schema, migration, provider, gateway, payout, staging or shared DB behavior changed. G-012 remains OPEN. Continue source-first commercial/operational correctness audit; keep full validation grouped in Phase 3.

## FIN-002 — Settlement calculation idempotency — 23 November 2026

A second payable settlement could be created if `calculateSettlement` was called again after the prior settlement reached PAID. The path now locks the payment row, reuses an existing PENDING/CALCULATED/DUE settlement for retries, and rejects recalculation after PAID/ADJUSTMENT history. FIN-DSH-13–15 cover concurrent calculation, post-PAID rejection and refusal to settle an unconfirmed payment; tests are added but not executed. The service now requires CONFIRMED, CAPTURED, PARTIALLY_REFUNDED or REFUNDED status before settlement calculation. Source/test commit: `60bf231f950dec8ede3c8945f76b22bc8e4b4451`. Status: IMPLEMENTED / TESTING_PENDING. No gateway/payout scope expansion.

## FIN-003 — Payment minor-unit amount validation — 23 November 2026

Manual payment verification, COD cash confirmation, refund requests and settlement confirmed amounts now require positive safe integers in minor units. This rejects zero, negative, fractional and unsafe-number values before financial writes. No maximum/equality rule was introduced for actual received amounts. FIN-DSH-16 covers invalid values and unchanged verification/COD payment states; test added but not executed. Source/test commit: `f554617c592ff57db296e0ca88614ac246468194`. Status: IMPLEMENTED / TESTING_PENDING.

## 2026-11-23 — FIN-004 / FIN-005 financial transition consistency

- FIN-004: settlement calculation now records `PAYMENT_SETTLEMENT_CALCULATED`; marking PAID locks the settlement and atomically writes PAID state, `PAYMENT_SETTLEMENT_PAID` history and `payment.settlement_paid` outbox event. FIN-DSH-13 and FIN-DSH-17 cover calculation and concurrent pay effects; not executed.
- FIN-005: COD cash confirmation now synchronizes `orders.payment_status` in the same transaction while preserving the order's fulfillment status. FIN-DSH-18 covers DELIVERED + CONFIRMED projection and payment history; not executed.
- Source/test commits: `50f544a98dc8d9b84d8a3709b250425df48c4d5a`, `def9131ba94699150cb896a23eb171eab0ae5a00`, `51d7d9c8a6a26450f9cbc1dd32d0a6779513acd9`.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, provider, automatic payout, staging, shared DB or deployment changes.

Next: continue source-first audit of payment/settlement transitions and persisted event/outbox semantics; retain the Phase 3 consolidated testing campaign.

## Financial correctness continuation FIN-004–FIN-013 — 23 November 2026

- FIN-004 settlement event consistency: calculation event corrected; PAID transition now atomically persists settlement state, immutable payment history and outbox event. Commits `50f544a98dc8d9b84d8a3709b250425df48c4d5a`, `def9131ba94699150cb896a23eb171eab0ae5a00`.
- FIN-005 COD order payment projection: payment_status synchronized without changing fulfillment state. Commit `51d7d9c8a6a26450f9cbc1dd32d0a6779513acd9`.
- FIN-006 dispute refund recovery validates full request identity before reusing an orphan refund. Commit `9899113a4f574d2733b957d2f1b489e35a71fe0f`.
- FIN-007 refund approval synchronizes the order payment projection. Commit `5b68edac4d148f68656b4331a9612cd1752eab3d`.
- FIN-008 return refund recovery validates full request identity. Commit `72927529e64a719741b94b864f6adba7cafd4f0d`.
- FIN-009 dispute resolution uses compare-and-set to prevent duplicate terminal events/outbox. Commit `2b8e2fa7cf2aab87d4186153a61748bc82805c52`.
- FIN-010 return refund adjustment serializes against settlement payment. Commit `a1dc7b2cf31c83f2a59c0a72f0056f4955fe7143`.
- FIN-011 settlement adjustment preserves original currency. Commit `ba3318724c3080d4c29baee1c81e972262e14ac4`.
- FIN-012 missing financial breakdown blocks manual/COD payment confirmation and rolls back. Commit `cdb189e95dd7022793af33352a18c31f81117059`.
- FIN-013 payment expiry records cancellation history only after the conditional order update succeeds. Source/test commits `028e30e9ebeb626b51b6d80bc28467c9c946c419`, `83550c34c7dc11492fc6e5c5fc6fcb418b79243c`.
- FIN-DSH-11–28 are added but not executed. Status for all is IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, automatic payout, staging, shared DB, grant/RLS, deployment or worker changes.


## FIN-014–FIN-015 — Commission reversal correctness — 23 November 2026

- FIN-014: return commission reversals now use the same order-level discount allocation basis as the original order and retain payment currency in the commission reversal and settlement adjustment ledgers. FIN-DSH-29 added; not executed.
- FIN-015: proportional commission reversal uses exact BigInt multiplication/division in both service paths; a unit regression covers a Number rounding case that overstates reversal by one minor unit. Added; not executed.
- FIN-014 source commits: 6221c9c10bba4652b19c1aeaca59a8d1c3d9c79d and 00da339e62dbeef87a55434b3ed5ea1a85cb6508. FIN-015 source commits: 917397ffd5491d6fe52a18063c0266e831b67c38, e2338cf1e50e825bd1c22becbeab0a6a4757a5e4, a596d49a752973cdc1b7039f3b325f0421252c9c; unit test commit 4e67e5ef7541e87ef5d9698e3abad7529cd07219.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, staging, shared DB or deployment changes. G-012 remains OPEN.

Next: continue financial/commercial source audit; then one consolidated formatter, API unit and PostgreSQL integration campaign in Phase 3.


## FIN-016 — COD payment expiry exclusion — 23 November 2026

COD is collected at delivery and must not be expired by the bank-transfer timeout. Both stale-payment candidate discovery and the expirePayment service boundary now exclude CASH_ON_DELIVERY. FIN-DSH-30 covers a stale COD payment attached to a DELIVERED order. Test added, not executed. Source commit 68b5251200f9f3765a0568b796db056a18cd878e; test commit 6ff2a4788c5f2a98c5866cfd0d321cea9948c4ac.

Next: continue financial lifecycle audit, then run the consolidated Phase 3 test campaign. G-012 manual-payment-only scope remains binding.


## FIN-017–FIN-018 — Return workflow correctness — 23 November 2026

- FIN-017: BigInt-backed minor-unit arithmetic now allocates order discount, VAT and full-return delivery fees without floating-point drift; delivery-fee exception adjustments preserve the original payment currency. FIN-DSH-31 added, not executed.
- FIN-018: payment-row locking and in-transaction rechecks serialize return creation, preserving one active return per sub-order and preventing stale quantity/refundable checks. FIN-DSH-32 added, not executed.
- Source/test commits: FIN-017 122edb4bf1dc67ba01bfc33b97809cc037781f87 / e6823ee9b1c68f5b71229ffbda17c9f525b66565; FIN-018 8a8364899f08180da9213be4d897a65fac9a897d / 705609fa2928d6e12e393b59bb990cfe0cf2343c.
- Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, staging, shared DB or deployment changes. G-012 remains OPEN.


## Financial correctness continuation — FIN-019 — 23 November 2026

Settlement-adjustment posting is hardened: commission reversal credits increase merchant net, refund/delivery-fee/balance-debit adjustments reduce net, amounts are positive safe integers, and posting locks a primary settlement row. An approved adjustment cannot transition to POSTED without a primary settlement ledger entry. FIN-DSH-34/35 and unit coverage are added but not executed.

**Next implementation:** continue source-first review beyond FIN-019, focusing on remaining settlement/reconciliation arithmetic, ledger projection consistency, immutable history and outbox semantics. Keep the comprehensive test campaign grouped in Phase 3 and preserve the manual-payment-only scope.


## Financial correctness continuation — FIN-019 — 23 November 2026

Settlement-adjustment posting is hardened: commission reversal credits increase merchant net, refund/delivery-fee/balance-debit adjustments reduce net, amounts are positive safe integers, and posting locks a primary settlement row. An approved adjustment cannot transition to POSTED without a primary settlement ledger entry. FIN-DSH-34/35 and unit coverage are added but not executed.

**Next implementation:** continue source-first review beyond FIN-019, focusing on remaining settlement/reconciliation arithmetic, ledger projection consistency, immutable history and outbox semantics. Keep the comprehensive test campaign grouped in Phase 3 and preserve the manual-payment-only scope.


## Financial correctness continuation — FIN-020 — 23 November 2026

FIN-020 implements reconciliation ledger correctness beyond FIN-019. Primary settlement commission remains a debit; positive commission reversals in ADJUSTMENT rows are credits. Commission reversal aggregates use safe BigInt arithmetic. Delivery-fee refund caps now use the return workflow's exact half-up allocation and include both delivery-fee exception/refund adjustment records. Refund-status mismatch evidence no longer attempts to populate BIGINT monetary columns with status strings. Unit tests and PostgreSQL FIN-DSH-36 are added but not run.

Source/test commit: `ad478cc53ce40bec86172e881b4f14cea7e6dfac`. Status: IMPLEMENTED / TESTING_PENDING. No schema, migration, shared database, staging, worker, gateway, payout, or deployment changes.

**Next implementation:** FIN-021 — inspect reconciliation run versioning, `superseded_by` semantics, organization-scoped uniqueness, concurrent version allocation and failed-run partial persistence. Verify the intended history contract and tests before modifying it. Keep the consolidated formatter/API/PostgreSQL/Web/Admin/mobile campaign grouped in Phase 3.


## Financial correctness continuation — FIN-021 — 23 November 2026

FIN-021 implements tenant-safe reconciliation version allocation, forward supersession links and failure-atomic result persistence. Advisory locks serialize same-tenant period/currency runs; migration 0074 makes the unique version index organization-scoped (including NULL/global uniqueness) and repairs legacy backward supersession links. Execution and discrepancy persistence are one transaction; failures roll back partial data and are recorded in a separate best-effort FAILED-run transaction. FIN-DSH-37/38 are added but not executed.

Commit: `e2dcb43e37d2a67a72d0891c4c3519d19719b5ae`. Status: IMPLEMENTED / TESTING_PENDING. Migration 0074 is committed but not applied to any shared/staging database.

**Next:** FIN-022 — audit immutable financial history and transactional outbox consistency across payment, settlement, refund, return, dispute and settlement-adjustment state transitions.


## Financial correctness continuation — FIN-022 — 23 November 2026

FIN-022 closes the audited payment/dispute/settlement-adjustment producer gaps: payment creation and awaiting-payment now emit transactional outbox events; dispute OPENED/evidence/response rows, history and outbox are committed atomically; settlement-adjustment creation emits an outbox event. Generic outbox polling now uses atomic `FOR UPDATE SKIP LOCKED` claiming with five-minute lease ownership and conditional completion/retry updates. FIN-DSH-39–42 and unit tests are added but not run. The dispatcher remains logging-only; no external event bus is wired.

Commits: `3784bca3dd9a21fa3123e555aebbdd13addfb21b`, `a77339ab1b50d881fc006a16b9613505458fcd27`, `ccde36322f9bcfd12f2de2bfad22390cd9b7f503`, `5d7eadf07e11801813a606dfeeda60b83c16eb19`, `e761195829d3fcd4bc2d9d0eecfd848188c32d53`. Status: IMPLEMENTED / TESTING_PENDING.

**Next:** FIN-023 — audit BANK_TRANSFER checkout's post-commit order/payment state transition and dispute-refund split transaction recovery.


## Financial correctness continuation — FIN-023 — 23 November 2026

FIN-023 closes two transaction-boundary defects. BANK_TRANSFER checkout now persists order PAYMENT_PENDING, payment AWAITING_PAYMENT, immutable histories and matching outbox messages in the original checkout transaction; no swallowed post-commit state mutation remains. Dispute resolution locks the dispute and creates/links the refund in the same transaction as payment history/outbox and dispute resolution history/outbox. Historical orphan-refund idempotency recovery is retained. FIN-DSH-43/44/45 added but not executed.

Commits: `a5fa4806e310159b6f2708d366764ffe4fa3892f`, `442b03a77e4645fba01b8f33d3d2351265365b9d`, `71c8acb5a890a8b7350915cc4eca80dd6104874c`. Status: IMPLEMENTED / TESTING_PENDING.

**Next:** FIN-024 — audit payment proof upload storage/DB transaction boundaries, orphan cleanup and retry/replacement safety.


## Financial correctness continuation — FIN-024 — 23 November 2026

Payment proof upload is now exposed as multipart through the API (10 MB/MIME allowlist), uses unique per-payment object keys and validates storage configuration. DB failure compensation verifies the payment row before deleting the new object; old managed proof is retired only after replacement commit; external URLs are never deleted. FIN-DSH-46/47 added but not executed. Residual: a process crash between upload and DB transaction can leave an orphan; cleanup failures intentionally preserve objects. Status: IMPLEMENTED / TESTING_PENDING_WITH_RESIDUAL.

Commits: `7f6e3a949975511b5be56470c0dd427dc92ba16d`, `41c8db370a30124e981c42c1e7d7b8487771e8ec`.

**Next:** FIN-025 — durable upload intent/recovery and bounded orphan cleanup with leases, retries and DB-reference checks.


### FIN-024 follow-up — 23 November 2026

Payment proof transition validation now occurs before upload, and uncertain putObject timeouts are compensated by checking/deleting the generated key when present. FIN-DSH-48 added. Latest commit: `847647c424097e5ace69236d0c3b4592f85d30e9`. Test not executed; process-crash orphan recovery remains FIN-025.


## Financial correctness continuation — FIN-025 — 23 November 2026

FIN-025 adds durable payment-proof object intents before storage upload. Payment row, event, outbox and COMMITTED intent state share one transaction; replaced managed proofs receive a durable cleanup intent in the same transaction. The cleanup method uses a 60-minute age threshold, SKIP LOCKED claims, five-minute fenced leases, global payment-row reference checks, exact-key HEAD/DELETE and bounded exponential retry. FIN-DSH-46–53 added/updated; tests not executed. Migration 0075 is source-only and the cleanup method is not scheduled or activated.

Commits: `a457d352d0ee71e6e020f164e838f5a02a81c512`, `ff67348b950b51a482fa4cf624549a146551c383`.

**Next:** FIN-026 — correct immutable payment-event actor attribution for payment verification and COD cash confirmation when an administrator or merchant may perform the action.

## Financial correctness continuation — FIN-026 — 23 November 2026

Payment verification, COD cash confirmation, and merchant-/buyer-side return transitions previously hardcoded actor classes even though privileged callers can perform these transitions. Events now record ADMIN for privileged callers and the appropriate MERCHANT/BUYER class otherwise. PostgreSQL FIN-DSH-54/55 cover payment and return overrides. No schema migration. Tests not executed.

Commit: `e5733dc4a403c15da27d9064aa8703a89f6ee7f4`.

**Next:** continue the source audit of payment/refund/settlement transitions for remaining audit-history or retry inconsistencies; keep the consolidated Phase 3 verification campaign pending until implementation is complete.


## Financial correctness continuation — FIN-027 — 23 November 2026

FIN-027 aligns return-side refundable-balance aggregation with PaymentsService: APPROVED refunds now reserve balance, and PostgreSQL SUM(bigint) is handled as exact numeric text/BigInt rather than a 32-bit cast. FIN-DSH-56 covers both regressions. Source/test commits: `6ae8aba762215f69f42e74e4608a4fa31a02543b` / `5b636df49155ea523bc730852ed900720a858a88`. Tests not executed; Phase 3 remains pending.


## Financial correctness continuation — FIN-028 — 23 November 2026

The admin-only settlement calculation event now records ADMIN rather than SYSTEM. FIN-DSH-57 verifies persisted actor ID/class. Source/test commits: `5a7dfd6ea67de61bb016cc7a7ef31749760955d8` / `05799cde897871ab9752af07bf70830ac834edbf`. Test remains pending Phase 3.


## Financial correctness continuation — FIN-029 — 23 November 2026

Payment verification now records matching authenticated ADMIN/MERCHANT actor identity in payment and order history. FIN-DSH-54 covers both. Source/test commits: `77c2caaa322836cc8e7d651f6577df715c5e3228` / `8fc1759a9e374f12513c82d301b2c9b934a98840`. Test pending Phase 3.


## Financial correctness continuation — FIN-030 — 23 November 2026

Refund reconciliation period scoping now follows the REFUNDED event timestamp rather than return-request creation time; legacy fallback is retained. FIN-DSH-58 covers the cross-period case. Source/test commits: `93a908d4627c804af5d12e20c6a1e7c2811524e9` / `5abae2018b9e6d6a43d5e3b90764ef80560b4ea0`. Test pending Phase 3.


## Financial correctness continuation — FIN-031 — 23 November 2026

Duplicate-refund reconciliation now uses in-period successful refund updates to select return requests, then counts all successful refunds for each return across periods. FIN-DSH-59 covers the cross-period duplicate case. Source/test commits: `6089a1fd821c35c0dcd9f0cde849e145326905e1` / `4bdd2935d48ea2c6ef3d633aa6af2f3fe39369ab`. Test pending Phase 3.


## FIN-032 — Settlement-adjustment accounting-period correctness — 23 November 2026

Reconciliation previously used adjustment creation time for POSTED-adjustment approval and delivery-fee-cap checks. This misattributed adjustments created in an earlier period but posted in the current period; delivery-fee-cap checks also included DRAFT and other unposted adjustments. Both checks now require status POSTED and use the adjustment transition timestamp (updated_at) as the accounting-period timestamp. PostgreSQL FIN-DSH-60 covers a prior-period-created adjustment posted in the current period and confirms that an unposted draft is excluded. Source commit: 0c65476d1135d18504ae910083299683fdb8d072; test commit: 39a8ee35e81e919601e49d0564fee023d5a39871. Test added, not executed.


## FIN-033 — Exact payment refund aggregate arithmetic — 23 November 2026

Three payment-side SUM(bigint) aggregates used for refund reservation, refund approval projection and settlement calculation were exposed as JavaScript numbers without an explicit precision guard. They now return PostgreSQL numeric text, convert through BigInt, and fail closed when negative or outside Number.MAX_SAFE_INTEGER. Unit coverage verifies totals above the 32-bit boundary, unsafe aggregate rejection and malformed/negative values. Source commit: 633d56a06e073ee416e5b7a989167ef5828f13d8; test commit: 115b0dab007e4071f6a32ee1e564427a86732249. Tests added, not executed.


## FIN-034 — Caller-owned refund transaction support — 23 November 2026

PaymentsService.requestRefund now accepts an optional caller-owned transaction client and reuses it rather than opening a nested transaction. This aligns the implementation with the existing dispute-resolution caller, which passes its transaction so refund creation, payment event/outbox, refund linkage and dispute resolution remain atomic. Existing PostgreSQL FIN-DSH-45 covers injected failure rollback; tests remain unexecuted. Source commit: 2c4b4538cc10e3d4e6217ca56967c89e52657fd8.


## FIN-035 — Atomic return-refund and return-ledger transition — 23 November 2026

Return refund creation previously committed the payment refund/event/outbox first, then linked the refund and advanced the return request in a second transaction. It now locks the payment and performs refund creation (reusing PaymentsService's caller-owned transaction), return linkage, REFUND_PENDING state/history and return outbox in one transaction. The existing idempotency recovery path remains for legacy split-transaction rows. PostgreSQL FIN-DSH-61 injects failure at return outbox persistence and asserts that refund, payment event/outbox and return changes all roll back. Source commit: e462c256be710a81e42b2f2d4093d4700abe1818; test commit: f5d38d5a4af42ec29fa38040d8ba184e5dcbcdff, with scoped outbox assertion correction 4ad18e1eab3495030c6fff719607b5101337edb4 and test index update ac266c2c365d23c3ef3e58032616bb118d037715. Tests not executed.


## FIN-036 — Return refund finalization lineage and amount integrity — 23 November 2026

Return finalization previously trusted the refund snapshot and checked only that its status was SUCCEEDED. It now locks payment → refund → return in one transaction, re-reads each ledger row, and requires consistent payment/return/refund IDs, order, buyer, currency, successful payment projection, and exact positive safe-integer refund amount before writing REFUNDED history, settlement/commission ledgers or outbox. This prevents a succeeded but mismatched refund from finalizing the return or creating downstream financial entries. PostgreSQL FIN-DSH-62 tampers with a succeeded refund amount and asserts the return remains REFUND_PENDING with no REFUNDED event/outbox or commission reversal. Source/test commit:  d84489f185cfc864074406f0c9029bc28f40dc94. Test added, not executed.

**Next:** continue the source-first payment/refund/settlement audit for remaining lifecycle retry and cross-ledger consistency gaps. Keep all new regression tests pending the consolidated Phase 3 campaign.

## FIN-037 — Failed return-refund state and retry parity — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** The REFUND_FAILED return transition now marks the linked payment refund FAILED, appends PAYMENT_REFUND_FAILED plus payment outbox, and persists return state/history/outbox in the same locked transaction. Retrying from REFUND_FAILED reopens the same refund as REQUESTED after a fresh remaining-balance check; no duplicate refund row is created. PostgreSQL FIN-DSH-63/64 added. Source/test commit: 7be49a0420432d4e31733b77ee2c3042e738d242.

## FIN-038 — Idempotent refund approval retry — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** approveRefund now treats an already-SUCCEEDED refund as an idempotent read-only success after taking the payment and refund locks. Retries do not append duplicate PAYMENT_REFUND_SUCCEEDED history or payment.refund_succeeded outbox messages. Other states remain fail-closed. FIN-DSH-65 added. Source/test commit: 89757383fd53dcb69d2c753f134aaf39d1b47bbc.

## FIN-039 — Idempotent settlement-paid retry — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** markSettlementPaid now returns an already-PAID settlement without a second history/outbox write when the supplied payment reference matches the committed reference. A different reference remains a conflict and cannot overwrite the recorded payout evidence. FIN-DSH-17 updated to cover concurrent retries and mismatched references. Source/test commit: 4020853e3a51386f56e57b41b501a3060f680e82.

## FIN-040 — Reconcile failed-refund and retry status parity — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Reconciliation now flags REFUND_FAILED returns unless the linked refund is FAILED, and REFUND_PENDING returns if the linked refund remains FAILED. Missing or dangling refund links are also reported. Period attribution uses the event matching the current return state and falls back to created_at for legacy rows without that event. FIN-DSH-66 covers both divergence directions. Source/test commit: 6a4e0edccab8cdd0dfa250fa3b950ab62a206a63.

**Next:** continue source-first auditing of settlement/refund/payment history and outbox parity. The consolidated Phase 3 campaign remains deferred until implementation is complete; no migration or shared/staging database action is authorized by these code-only changes.

### FIN-040 follow-up — latest current-state event period filter

The initial FIN-040 change was tightened to group by return and use MAX(created_at) for the event matching its current return status, with the created_at fallback only for legacy rows lacking that event. The period filter applies to that latest event, not any historical event for the same status. FIN-DSH-66 now verifies a prior-month transition is not misattributed after a later re-entry. Follow-up source/test commit: b63376cf26240d3dc21b6f26782158a09674c1c7.

## FIN-041 — settlement-adjustment posting replay and currency integrity

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** postAdjustment now supports safe replay after a committed POSTED transition by requiring the persisted ADJUSTMENT settlement row; it does not duplicate ledger/outbox writes. The row records adjustmentId, parentSettlementId and postedBy metadata, with a notes-based compatibility lookup for legacy posted rows. Posting now validates adjustment currency against the primary settlement and validates the primary settlement store against the sub-order. FIN-DSH-67 covers replay and mismatch rejection. Source/test commit: ad61d75b909341dd2936e03dbc592b0d244d9f72.

Next source audit: primary-settlement terminal-state interactions, adjustment ledger discoverability and reconciliation/outbox parity.

## FIN-042 — payout of posted adjustment ledgers

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** Settlement status contract now includes ADJUSTMENT and markSettlementPaid accepts posted adjustment rows. The existing row-locked transition persists the same payment history/outbox and preserves same-reference retry idempotency. FIN-DSH-68 covers payout and duplicate replay. Source/test commit: a6dc0c50ee83d1f397b982084e338b142d89b62e.

Next audit: adjustment listing/reconciliation and primary settlement recalculation must keep ADJUSTMENT rows distinct from the primary settlement.

## FIN-043 — primary settlement lookup isolation

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.** calculateSettlement excludes independent ADJUSTMENT ledger rows from its primary settlement lookup, using explicit adjustmentId metadata and a legacy notes-prefix fallback. FIN-DSH-68 verifies that a posted and paid adjustment does not replace the original primary settlement in a subsequent calculation. Source/test commit: 6e336fbbe6e71a0c21ee8e81150eadfd769cc6f0.

Next: audit settlement listing and reconciliation projections for primary versus adjustment ledger semantics.

### FIN-042/043 test assertion follow-up

FIN-DSH-68 now selects payment_record_id directly from the posted adjustment ledger row for its PAYMENT_SETTLEMENT_PAID history assertion; this is a test-only clarity correction. Commit: 74eef0fa36611dd7352436e8d2b7fd048ca7efc2. No behavior change. Test remains unexecuted.


## Live continuation — 23 November 2026 (FIN-044)

FIN-044 closes a follow-on adjustment-parent integrity gap: when a previous adjustment had been paid, its PAID status made it eligible for the next adjustment's parent lookup. Posting now excludes both metadata-linked adjustment rows and legacy rows identified by the stable notes prefix. Payout preserves that legacy marker. Admin settlement listing now explicitly filters/styles ADJUSTMENT and permits the standard Mark Paid action. FIN-DSH-68/69 and an Admin recovery test are added but not executed.

Next source-first work: inspect merchant settlement projections, admin reconciliation/report views and export/query surfaces for adjustment identity and correct accounting semantics. Continue implementation before the consolidated Phase 3 test campaign. PR #138 remains draft; no merge, deployment, migration or shared database operation is authorized.
