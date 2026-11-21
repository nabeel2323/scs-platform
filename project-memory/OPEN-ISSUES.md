# SCS Platform — Open Issues and Next Work

**Last reconciled:** 21 November 2026  
**Authoritative detail:** [Implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## Immediate blockers and high-priority work

### G-001 — P0 merchant offer authorization

**Status: PARTIAL — do not close yet.**

Implemented:

- Merchant mutation role gate for `MERCHANT_OWNER`, `MERCHANT_STAFF` and legacy `MERCHANT`.
- Explicit denial of BUYER, FINANCE and platform roles on merchant mutation routes, even where permissions may otherwise be present.
- Governance-read permission checks for ADMIN, MODERATOR, SYSTEM and SUPER_ADMIN.
- Controller-level positive/negative role regression coverage.

Verified in CI #1268 on exact head `b73f72e34406c1260f214610539139d0d096b2de`:

- API unit/coverage and real PostgreSQL integration passed, together with every other executable CI job.
- Controller/service/PostgreSQL tests cover supported merchant roles, buyer denial from merchant surfaces, foreign-organization and same-organization non-member confidentiality, missing active organization, revoked membership, DRAFT-store buyer exclusion, governance-permission reads, authenticated actor attribution, buyer-field allowlisting and same-store price-list/warehouse references.
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

1. Obtain independent security review of G-001 using the review packet; record reviewer identity, date, scope, findings and disposition. Keep G-001 PARTIAL until this is complete.
2. Continue G-002 read-only identity/schema/access design evidence; wait for authorized protected staging audit and do not mutate shared DB state.
3. Keep PR #138 draft and all release/database restrictions intact.

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

The PostgreSQL lifecycle suite now includes an explicit `INACTIVE` store scenario for both buyer list and ranked-offer endpoints, with fixture restoration in `finally`. This is source implementation only until the exact-head PostgreSQL integration job passes. CI #1268 verified the preceding implementation; CI #1269 was a Prettier-only failure, and CI #1271 returned `action_required` with no jobs after the formatter bot push. A fresh user-authored commit is being used to obtain exact-head verification.
