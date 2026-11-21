# SCS Platform — Implementation Roadmap

**Status source:** [Authoritative remediation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) and [progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).  
**Last checkpoint:** 21 November 2026.

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
- Review table-specific operation and row-ownership predicates, transaction-local tenant context feasibility, and a least-privilege access model.
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
