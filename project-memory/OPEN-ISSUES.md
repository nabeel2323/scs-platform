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
