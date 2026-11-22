# SCS Platform — Implementation Roadmap

**Status source:** [Authoritative remediation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) and [progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).  
**Last checkpoint:** 22 November 2026.

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
