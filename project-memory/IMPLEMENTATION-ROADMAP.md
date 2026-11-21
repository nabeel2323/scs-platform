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

- Exact-head CI for scope-first offer confidentiality and ACTIVE-store buyer visibility, then complete the remaining tenant/role acceptance matrix.
- Complete owner/staff/buyer/foreign-merchant/platform-admin acceptance evidence, including service-level tenant ownership and active membership.
- Independent security review. The implementation author must not label their own work independently reviewed.
- Record reviewer findings, remediate any issues, and update the evidence register. Keep G-001 PARTIAL until then.

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
