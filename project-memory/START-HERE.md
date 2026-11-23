# SCS Platform — Project Memory: Start Here

> **Mandatory entry point for every new ChatGPT conversation about this repository.**
>
> Last reconciled: 23 November 2026  
> Repository: [nabeel2323/scs-platform](https://github.com/nabeel2323/scs-platform)  
> Current work branch: `remediation/phase-0-1-tenant-security`

## Purpose

This directory preserves durable project context so work can resume across separate ChatGPT conversations without relying on chat-history recall. It records the verified checkpoint, decisions, constraints, remaining work and exact next actions.

**The repository is the source of truth.** Always verify live GitHub state before acting. A timestamped checkpoint is historical evidence, not a substitute for checking the current branch, PR, commit and CI run.

## Read in this order

1. [CURRENT-STATE.md](./CURRENT-STATE.md) — current branch, PR, exact commit, latest known CI and next action.
2. [DECISIONS-AND-CONSTRAINTS.md](./DECISIONS-AND-CONSTRAINTS.md) — binding user preferences, architecture decisions and safety restrictions.
3. [IMPLEMENTATION-ROADMAP.md](./IMPLEMENTATION-ROADMAP.md) — phases, gates, dependencies and acceptance direction.
4. [OPEN-ISSUES.md](./OPEN-ISSUES.md) — unresolved work and blockers.
5. [RELEASE-AND-CI-STATUS.md](./RELEASE-AND-CI-STATUS.md) — CI evidence, skipped jobs and release restrictions.
6. [WORK-LOG.md](./WORK-LOG.md) — chronological handover history.

Then read the relevant authoritative technical documents linked below. Do not duplicate or override their detailed evidence in this summary.

## Authoritative project documents

- [Audit-driven remediation implementation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) — authoritative phases, findings, acceptance criteria and release gates.
- [Audit-driven implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md) — authoritative finding register, current progress and evidence log.
- [G-002 RLS architecture design](../docs/remediation/G-002-RLS-ARCHITECTURE-DESIGN.md) — read-only target database role model, transaction-bound tenant context, ownership classification and rollout gates.
- [G-002 database operation map](../docs/remediation/G-002-DATABASE-OPERATION-MAP-2026-11-22.md) — preliminary operation map covering 33 service files plus supporting outbox/worker/monitor/lease paths; raw SQL and actor handoffs are explicitly distinguished.
- [G-002 table ownership and predicate candidates](../docs/remediation/G-002-TABLE-OWNERSHIP-AND-PREDICATE-CANDIDATES-2026-11-22.md) — schema-backed candidate ownership paths for identity, store, catalog, order, financial, user-private and system rows; not an approved policy.
- [G-002 migration foreign-key crosswalk](../docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md) — migration-defined FKs, deferred relationships, non-FK org_id metadata, system-table scope and migration 0070/0071 boundaries.
- [G-002 supplemental audit note](../docs/remediation/G-002-ADDITIONAL-AUDIT-NOTE-2026-11-23.md) — preserves the user-uploaded 111-table/function/role/worker/OTP observations and explicitly reconciles them as unverified supplemental evidence against the 114/116-table history.
- [Remediation documentation directory](../docs/remediation/) — detailed audits, database access evidence and finding-specific records.
- [Implementation Completion Gap Register](./IMPLEMENTATION-GAP-REGISTER.md) — programme phases, evidence-backed implementation gaps, statuses and completion rules.
- [Whole-Product Implementation Inventory](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md) — source-backed repository/module/screen/API/database/worker inventory and confirmed UX/workflow gaps.
- [Repository README](../README.md) — architecture, development setup and documentation index.
- [PR #138](https://github.com/nabeel2323/scs-platform/pull/138) — active draft remediation PR.

## Mandatory new-session procedure

At the start of a new conversation:

1. Confirm this is **SCS Platform** in `nabeel2323/scs-platform`; do not confuse it with Homely or another project.
2. Read this directory and the relevant authoritative remediation documents.
3. Query GitHub for the active branch head, PR #138 state/head/base, recent commits and the latest CI run/checks. Never rely only on the recorded SHA or CI status below.
4. Compare live state with `CURRENT-STATE.md`; reconcile any drift before implementation.
5. Identify the highest-priority unfinished task and its dependencies. Continue autonomously without asking for approval for every small implementation step.
6. Follow the user's implementation-first programme: complete implementation and integration gaps before the consolidated full testing campaign.
7. During implementation, run only proportionate developer checks; add focused tests when needed for critical invariants or safe changes. Do not repeatedly run the full regression suite after each small enhancement.
8. Never knowingly leave a concrete security or correctness defect exploitable until the later test phase; fix it when discovered.
9. Group related implementation and documentation changes into cohesive commits where practical.
10. Do not claim implementation, tests, review, approval, deployment or database changes without direct evidence.

## Mandatory checkpoint update procedure

After each meaningful implementation group, and before ending a work session:

- Update [CURRENT-STATE.md](./CURRENT-STATE.md) with exact branch, commit, PR and verified CI state.
- Add a dated entry to [WORK-LOG.md](./WORK-LOG.md) with changes, tests, outcomes and links.
- Update [OPEN-ISSUES.md](./OPEN-ISSUES.md) and [IMPLEMENTATION-ROADMAP.md](./IMPLEMENTATION-ROADMAP.md) when status, dependencies or next actions change.
- Update [RELEASE-AND-CI-STATUS.md](./RELEASE-AND-CI-STATUS.md) with workflow number, run URL, exact SHA, job outcomes and skipped jobs.
- Record new binding decisions or approvals in [DECISIONS-AND-CONSTRAINTS.md](./DECISIONS-AND-CONSTRAINTS.md).
- Update the authoritative remediation plan/progress tracker alongside relevant code changes.
- Distinguish **implemented**, **automated-test verified**, **runtime verified**, **independently reviewed**, and **approved**. These are not interchangeable.

## User collaboration preferences

- The user expects ChatGPT to make repository changes directly, including commits and pushes when the GitHub connection permits; do not default to handing implementation to a coding agent.
- Proceed through logical implementation steps without asking for permission at every small step.
- Group related changes into fewer, cohesive commits where practical to reduce repeated validation overhead.
- Keep technical documentation synchronized with the actual implementation and verified behavior.
- Provide detailed, truthful status and exact evidence. Never report a skipped job as passed.
- A reviewer can be the user or a separately appointed qualified reviewer; the implementation author must not self-certify an independent security review.

## Current starting point

Live GitHub reconciliation on 23 November 2026 confirms repository `nabeel2323/scs-platform`, branch `remediation/phase-0-1-tenant-security`, and PR #138 OPEN / DRAFT / UNMERGED against `develop`. Latest implementation/test checkpoint before this memory synchronization is `b9f9728659e71d3788cc58aa2b5ad9df29ab9731` (FIN-019 settlement adjustment posting integrity; PostgreSQL scenarios FIN-DSH-34/35). Focused tests are added but not executed. CI #1437 tested earlier SHA `9dc7d04469180807e65053fe51819afffb3b78c0`: lint and TypeScript typecheck passed; Flutter analysis/tests passed; changed-file Prettier failed with 259 files needing formatting; Web/Admin/API/PostgreSQL/migration/boundary/build/contract/k6/staging release jobs were skipped. The current implementation head uses `[skip ci]`; no exact-head Actions run exists. Vercel Web/Admin rate-limit statuses are external preview-provider failures. Re-fetch live PR head/status before the next action.

### Exact stopping point

- UX-094 Mobile category permission/API contract alignment is implemented.
- UX-095 Web merchant route/action permission alignment and active-organization context invalidation is implemented.
- UX-096 Mobile route/action permission and organization-context transition alignment is implemented.
- G-036 realtime store/order room authorization is implemented in source; focused tests are pending execution and independent review.
- The Admin page-level route audit already covered all 56 Admin page files and generic ManagementPage configuration.
- UX-097 added handler-time permission rechecks for verification organization deactivate/reactivate, Organizations status toggle and update-request review, and dispute resolution.
- UX-098 added any-of navigation permission semantics, exposed Carrier & Recovery to either its read or recovery capability, and fixed Payments so a user with only `admin:payments:verify` can access the verification queue.
- UX-099 added action-specific permission callbacks to the shared Admin mutation helper; bound User status/membership, dispute, category, brand, offer governance, Carrier Recovery, shipment exception/RTS, inventory-return, carrier create/cancel/recovery and User Detail profile actions to their actual permissions. Focused tests were added for permission loss before dispatch; not executed.

### Latest CI correction state

CI #1395 failed on prior PR head `ff304ce6c0bcf63a654ff8fbd04130254cdb669e`:
- API TypeScript typecheck failed because validated Socket.IO regex capture groups were still typed as possibly undefined.
- Flutter analysis failed because a nullable profile role was passed to a non-null permission helper and a runtime-dependent EmptyState was declared const.

The API correction is `0d4644f634d65bd5fbe4fec818c6f8439023254e`; the Mobile correction is `5f08755ce69edfcbae5ca84462ffda245bfc1eb4`.

CI #1408 ran on `a76b0bef436af8bde2d9329b1cd6ee5980f593fc`: lint and TypeScript typecheck passed, and Flutter analyze/tests passed. The changed-file Prettier gate failed because 245 files in the cumulative PR diff were unformatted; all dependent Web/Admin, API unit, PostgreSQL integration, migration, boundary, build/container, contract and k6 jobs were skipped. UX-098/099 commits use `[skip ci]` and are not CI-verified. CI #1407 was superseded after a test type error; unsupported `ByRoleOptions.exact` assertions were corrected to anchored regex matchers.

### Supplemental G-002 evidence

The uploaded `Advanced UX Enhancement Prompt.txt` reports 111/111 tables with RLS disabled, 32 public functions with none SECURITY DEFINER, role BYPASSRLS distinctions, 55 FK constraints without covering indexes, OTP log observations, worker topology uncertainty and startup migration/seed behavior. It lacks observation timestamp, endpoint, query text, connection identity and relation-kind scope. It is preserved separately in `docs/remediation/G-002-ADDITIONAL-AUDIT-NOTE-2026-11-23.md`; its 111-table count is not reconciled with the detailed 114 and historical 116 counts. Do not treat it as new verified staging evidence.

### Remaining project gates

- G-001 remains PARTIAL pending independent security review and reviewer-directed remediation, if any.
- G-002 remains IN PROGRESS pending actual API/migration runtime identities, protected read-only staging catalog evidence, reconciliation of 111/114/116 counts and reviewed least-privilege/transaction-bound RLS design.
- G-036 remains IN PROGRESS pending exact-head verification and independent review.
- Phases 0–5 remain IN PROGRESS; Phase 6 consolidated verification is NOT STARTED.
- PR #138 must remain draft/open/unmerged. No merge, deployment, protected staging operation, shared database mutation, migration 0070/0071, grant/default-ACL change, RLS enablement, environment change or worker activation is authorized.

**Next implementation:** continue source-first financial and operational correctness audit beyond FIN-019, focusing on persisted state transitions, immutable history/outbox consistency, reconciliation and cross-ledger arithmetic. Do not repeat FIN-001–FIN-019 or the completed 56-page route audit / UX-097–UX-105 work. Keep the repository-locked Prettier pass and comprehensive test campaign grouped at the implementation-complete Phase 3 checkpoint; fix any concrete security/correctness defect immediately.

## Safety reminder

The restrictions in [DECISIONS-AND-CONSTRAINTS.md](./DECISIONS-AND-CONSTRAINTS.md) are mandatory. In particular, do not merge/deploy PR #138, bypass protected staging approval, modify shared database grants/default ACLs, apply migration 0070, enable RLS, change production/staging configuration, or activate workers without the explicitly required authorization.

## G-001 buyer projection and create-reference hardening — 21 November 2026

The buyer-facing product offer endpoint now returns an explicit allowlist of public commercial fields instead of full merchant-offer rows. It excludes merchant metadata, external references, proposer/reviewer identifiers and timestamps, review details, price-list IDs and warehouse IDs. The ranked buyer endpoint no longer returns the internal price-list reference.

Offer creation now enforces the same-store ownership invariant for optional price-list and warehouse references, matching the existing pricing-update behavior. Unit tests cover foreign-store denial, same-store acceptance and the public projection. PostgreSQL integration tests cover cross-store reference rejection without inserting an offer and verify that private offer fields are absent from buyer and ranked responses.

The implementation and documentation are synchronized. Exact-head CI #1268 on `b73f72e34406c1260f214610539139d0d096b2de` passed API unit/coverage and PostgreSQL integration, plus all other executable CI jobs. The current controller, service and PostgreSQL tests cover the recorded owner/staff, buyer, foreign-merchant, membership, store-visibility, governance-role, public-projection and same-store-reference cases. G-001 remains PARTIAL solely pending an independent security review and any reviewer-directed remediation. G-002 remains IN PROGRESS. No shared database, staging, migration, grants, RLS, deployment or worker changes were performed.

## CI #1259 regression analysis and correction — 21 November 2026

Exact-head CI #1259 exposed two defects. PostgreSQL rejected the correlated `EXISTS` predicate used by the buyer offer relational query because the outer `merchant_offers` reference was not valid in the generated query shape. The store-visibility predicate is being changed to an uncorrelated `store_id IN (SELECT id FROM stores WHERE status = 'ACTIVE')` subquery, preserving the visibility rule without the invalid outer reference. The catalog-offer unit harness also lacked `.limit()` on its selected-query branch, which broke tenant-membership tests; the harness now supports `.getSQL()`, `.limit()` and `.groupBy()` for the relevant query shapes.

CI #1259: lint/typecheck, formatting, mobile, Web/Admin, boundary lint and migration/read-only audit passed. API unit/coverage and PostgreSQL integration failed for the two issues above. The correction is committed with regression coverage; exact-head CI must pass before G-001 advances. No staging/database writes or deployment actions were performed.

## Latest continuation checkpoint — 22 November 2026

- PR #138 head 741a09f68721898a5bed6601bc3bc636867c78c2; exact-head CI [#44954371615](https://github.com/nabeel2323/scs-platform/actions/runs/44954371615) passed every executable job. k6 and protected staging release were skipped.
- PR #142 head dddff20c170737dc4694008bb807b2b90e177f77; exact-head CI [#44953735602](https://github.com/nabeel2323/scs-platform/actions/runs/44953735602) passed every executable job, including the new PostgreSQL identity integration test. k6 and protected staging release were skipped.
- Added G-002-TABLE-OWNERSHIP-MATRIX.md: 99 named tables exported by apps/api/src/drizzle/schema.ts, with candidate scopes. It is explicitly not the complete historical 116-table live inventory and not an approved policy matrix.
- Both PRs remain open, draft and unmerged. G-001 remains PARTIAL pending independent security review. G-002 remains IN PROGRESS; staging identities and refreshed protected read-only inventory remain unverified.
- No staging release, shared DB mutation, migration 0070, grants/default ACL changes, RLS enablement, worker activation or deployment.

## Implementation Completion Program — user-approved 22 November 2026

The user approved a revised project-wide sequence: (1) baseline/gap mapping, (2) implementation completion across backend, database/security, web, admin, mobile, POS/merchant, workflows, operations and documentation, (3) integration completion, (4) one comprehensive testing campaign, (5) stabilization of discovered defects, and (6) release readiness. The detailed programme and evidence-backed initial register are in [IMPLEMENTATION-GAP-REGISTER.md](./IMPLEMENTATION-GAP-REGISTER.md).

During implementation, keep checks lightweight and targeted rather than repeatedly running the full suite. Comprehensive unit/API/PostgreSQL/migration/tenant-security/concurrency/web-admin-mobile E2E/performance testing is reserved for the dedicated testing phase. This does not permit knowingly deferring a concrete security or correctness defect. Keep the existing G-001/G-002 review, staging, database and release gates intact.

Use the status vocabulary in the gap register: IMPLEMENTATION_PENDING, IMPLEMENTATION_IN_PROGRESS, IMPLEMENTED, INTEGRATION_PENDING, TESTING_PENDING, VERIFIED, BLOCKED and DEFERRED_BY_DECISION. Update this programme register and the authoritative finding tracker together when applicable.

## MAP-001 inventory checkpoint — 22 November 2026

The initial static whole-product inventory is recorded in [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md). It inspected the recursive Git tree and selected source files at branch head `2cca47aa34abd1a014ea16217cfee204c9e9f803`: 1,625 tracked files, 20 API modules, 49 web routes, 56 admin routes, 32 Flutter screens, 25 module schema files, 71 SQL migrations, 152 API unit test files and 82 API integration test files. This is not a complete route/permission/database ownership audit and not test verification.

Confirmed current-source UX candidates are now listed in the gap register: Admin order actions, refund approval UI, dashboard import/catalog-request widgets, flat 33-item admin navigation, Product Studio offer-step UX, mobile permission-level affordances, empty support-ticket module (scope decision needed), nearby-offers API/UI discrepancy, and the full Admin route permission audit. Older September UI audit statements were corrected where current source disproves them; see the inventory for details.

## MAP-001 documentation checkpoint and live CI reconciliation — 22 November 2026

- Current branch and PR #138 head: `7be3e2da3a26ab565f6c5dd391a9bba486d3bcae`; PR #138 remains open/draft/unmerged.
- The static inventory source inspected was commit `2cca47aa34abd1a014ea16217cfee204c9e9f803`; subsequent commits in this batch are project-memory/documentation updates only.
- GitHub Actions workflow-run lookup returned no run for exact head `7be3e2da3a26ab565f6c5dd391a9bba486d3bcae`; combined status returned no contexts. This documentation head is NOT CI-VERIFIED.
- The earlier source CI #44954371615 on `741a09f68721898a5bed6601bc3bc636867c78c2` and PR #142 CI #44953735602 on `dddff20c170737dc4694008bb807b2b90e177f77` remain historical exact-SHA evidence only.
- No application source was changed in this inventory batch. No tests, staging/database writes, migrations, grants, RLS changes, deployments or worker activations occurred.
- Next: complete API route-to-contract/permission mapping, admin/mobile route permission mapping, and worker/provider operation ownership; then implement the highest-priority confirmed UX gap in a cohesive batch.

## Latest continuation checkpoint — 22 November 2026

- Active repository: `nabeel2323/scs-platform`; branch `remediation/phase-0-1-tenant-security`.
- Latest implementation commit: `593bc1dfb0948a2b52d29731ab7037a1fa2c9dd1` (Admin refund request queue and approval UX). PR #138 is open/draft/unmerged at this head; PR #142 remains open/draft/unmerged at `dddff20c170737dc4694008bb807b2b90e177f77`.
- Added permission-guarded `GET /admin/refunds` (only REQUESTED, newest-first, limit 100), Admin Payments Refund Requests tab, explicit approval confirmation, API helper/type, and a controller delegation test. See UX-002 in [IMPLEMENTATION-GAP-REGISTER.md](./IMPLEMENTATION-GAP-REGISTER.md).
- Exact-head GitHub Actions lookup for `593bc1dfb0948a2b52d29731ab7037a1fa2c9dd1` returned no workflow run. Combined statuses show Vercel web/admin build-rate-limit failures only. The change is NOT CI-VERIFIED.
- Continue with MAP-001 route/permission/operation mapping, then admin order operations and remaining grouped UX gaps. Keep the full test campaign in Phase 3.
- No merge, deployment, staging write, live DB change, migration, grant/default-ACL change, RLS enablement, worker activation or release authorization.

## Latest implementation checkpoint — 22 November 2026

- PR #138 source head: `d4938bc9bdefd9d48d77b21ce5eb96973154c4ef`, open/draft/unmerged. PR #142 remains open/draft/unmerged at `dddff20c170737dc4694008bb807b2b90e177f77`.
- Implemented UX-001 Admin order cancellation using the existing `orders:cancel` permission and `POST /orders/:id/cancel` lifecycle; Admin order detail now provides canonical reason/notes, confirmation, feedback and refresh. ADMIN/SUPER_ADMIN permission grants were verified in `apps/api/src/common/database/rbac-seed.data.ts`. See gap register and work log.
- UX-002 Admin refund queue/approval tab was implemented in the preceding commits. Both items are IMPLEMENTED, not VERIFIED.
- Exact-head GitHub Actions lookup for `d4938bc9bdefd9d48d77b21ce5eb96973154c4ef` returned no workflow run. Combined statuses show only Vercel web/admin build-rate-limit failures. No application CI verification is claimed.
- Continue MAP-001 route/permission/operation mapping; then dashboard widgets/navigation and Product Studio improvements. Keep Phase 3 as the consolidated comprehensive test campaign.
- No merge, deploy, staging write, DB change, migration, grants/default-ACL change, RLS enablement, worker activation or release action.

## Latest continuation checkpoint — 22 November 2026

- PR #138 head: `c61b06241025b7ed5207f8ada533be120faadbec`, open/draft/unmerged. PR #142 remains open/draft/unmerged at `dddff20c170737dc4694008bb807b2b90e177f77`.
- Implemented UX-001 Admin order cancellation, UX-002 Admin refund request queue/approval, and UX-003 permission-aware dashboard catalog widgets. Corrected UX-009 catalog requests page permission from `catalog:categories:write` to the endpoint's canonical `catalog:requests:manage`. See gap register and work log.
- Exact-head GitHub Actions lookup for `c61b06241025b7ed5207f8ada533be120faadbec` returned no workflow run. Combined statuses show only Vercel web/admin build-rate-limit failures; no CI verification is claimed.
- Continue full Admin route permission mapping, navigation grouping, then Product Studio warehouse selector using existing store-scoped APIs. Phase 3 remains the consolidated comprehensive test campaign.
- No merge, deploy, staging write, DB change, migration, grant/default-ACL change, RLS enablement, worker activation or release action.

## Latest formatting checkpoint — 22 November 2026

- Formatting commit: `635ef98cccb7f9690410b56ed9caa631e92268a4`. A one-time self-removing formatter workflow ran repository-locked Prettier against the changed application and project-memory files, then removed its own workflow file. The formatter job succeeded; no temporary workflow remains.
- The formatter's push triggered a pull-request CI run on the preceding helper-workflow commit `c6d964ea1973e71ff292a0c30d2392ff74ec0ce1`; that is not exact-head verification of the formatted commit. Run a fresh CI check on the next branch head.
- PR #138 remains open/draft/unmerged; PR #142 remains open/draft/unmerged. No merge/deploy or database/staging gate changed.

## Exact-head CI checkpoint — 22 November 2026

- PR #138 head `10a890a3a69f7281b93f4a8e80b735f2228825cb` completed CI run #44961723564. Lint and TypeScript typecheck passed; Flutter analysis and tests passed. The changed-file Prettier gate failed on four handover documents. API unit/coverage, PostgreSQL integration, web/admin tests, migration, boundary lint, build and smoke jobs were skipped.
- Those four documents are being normalized with repository-locked Prettier 3.9.6. Require a fresh exact-head CI run after the formatter commit; do not treat this run as implementation verification.


## GitHub Actions budget — user instruction, 22 November 2026

The user reports that about 90% of the GitHub Actions minutes allowance is already consumed. Batch related source, focused tests, documentation and project-memory changes into cohesive commits; avoid per-change CI runs and repeated temporary formatter workflows; keep developer checks narrow and reserve the comprehensive campaign for the consolidated testing phase. Never disable required checks, bypass approvals or claim skipped jobs passed.

## Admin permission audit continuation checkpoint — 22 November 2026

- The live branch was reconciled at base head `cd1d7de837d3c519db4a249479effe65db5fce53`; PR #138 is open/draft/unmerged and targets `develop`.
- Latest associated workflow run #1336 / [run 44961921062](https://github.com/nabeel2323/scs-platform/actions/runs/44961921062) is `action_required` with no jobs exposed. The prior #1330 run failed the changed-file Prettier gate on four project-memory documents; downstream API/PostgreSQL/Web/Admin/build jobs were skipped. Vercel web/admin checks are external build-rate-limit failures.
- Reviewed all 56 Admin route page files plus `AuthGuard`, `useRequirePerms`, `ManagementPage`, `managementTables` and the relevant API permission declarations.
- Fixed two action-level UI permission gaps: `/calendar` holiday add/remove and `/returns/[id]` escalation resolution now require `admin:returns:write`. Added focused Admin component tests and `docs/admin-route-permission-matrix.md`.
- UX-009 is IMPLEMENTED at source level; full role/deep-link/action regression remains in Phase 3. UX-006 mobile permission affordances and remaining MAP-001 mapping remain outstanding.
- No database, staging, deployment, migration, grants, RLS, worker activation or release restrictions changed.


## Continuation checkpoint — 22 November 2026

- Repository: `nabeel2323/scs-platform`; branch: `remediation/phase-0-1-tenant-security`; PR #138 remains open and unmerged.
- Verified pre-change branch head: `06cd8fc1e56dc7ef64a141b97b594adc96ffbece`.
- Baseline CI #1337: changed-file formatting failed on nine PR files; the Flutter job passed; dependent checks were skipped. This is not a full green release gate.
- The mobile permission-parity implementation is grouped into one commit marked `[skip ci]` to preserve the user's remaining GitHub Actions minutes. The user reports 90% of the allowance consumed and explicitly requests grouped changes and one consolidated testing/fixing phase.
- Focused Flutter permission tests and the mobile route/action matrix are added. Test execution is intentionally deferred until the implementation batch is complete. Do not trigger CI for small follow-up edits.
- Outstanding RBAC policy issue: `identity:organizations:create` is checked by the organization creation flow but is absent from the inspected permission seed/default grants. Do not silently grant it before organization-type and creator-role semantics are reconciled.


## Mobile permission review refinements — 22 November 2026

A follow-up code review tightened Home discovery visibility, registration step guards, flat-variant/offer Add-to-Cart buttons, and the merchant low-stock KPI destination. The registration wizard now distinguishes organization creation from invitation-based joining and checks `merchant:stores:write` before store creation and verification submission. These refinements are grouped into one follow-up implementation commit; validation remains deferred to the consolidated phase.


## Registration active-organization correction — 22 November 2026

Merchant registration now persists the organization created or joined to secure storage and updates `activeOrgIdProvider` before refreshing `profileProvider`. This ensures the subsequent store-write check uses the newly selected organization's permissions rather than stale permissions from the previous/no active organization. Store and warehouse caches are invalidated after creation. The follow-up remains unvalidated until the consolidated test phase.


## RBAC seed reconciliation — 22 November 2026

Correction to the earlier onboarding-permission note: staging is not missing `identity:organizations:create`. The connected database migration log confirms `0069_organization_onboarding_permission.sql` was applied on 17 November 2026, and read-only SQL confirms the permission is assigned to BUYER, ADMIN, MERCHANT_OWNER, and SUPER_ADMIN. The defect was canonical seed drift: `apps/api/src/common/database/rbac-seed.data.ts` omitted the permission and its role grants. The seed and a real-seed regression test are now aligned with migration 0069. No staging database mutation was needed.


## Admin read-permission alignment — 22 November 2026

- Reconciled the live PR #138 head before implementation: `c660a9276da13a5df17af9161b3d5efc5d6ff0b3`; PR #138 remains open/draft/unmerged to `develop`.
- Fixed the commission reversal page: `admin:commission:read` is now enforced in the UI, the access-denied state is rendered, and unauthorized users do not trigger the reversal-list request.
- Fixed dashboard data authorization: KPI data is fetched/rendered only with `admin:kpis:read`; organization-update data is fetched/rendered only with `admin:users:read`. Existing import/catalog-request permissions remain independently enforced.
- Added focused Admin permission tests for denied and allowed commission access and dashboard KPI/organization data requests. Tests are intentionally not run yet; comprehensive validation remains consolidated in Phase 3.
- Updated the Admin route matrix and UX-003/UX-006 classifications. UX-006 mobile permission affordances are now classified IMPLEMENTED / NOT VERIFIED rather than pending.
- This group is committed as one `[skip ci]` commit to conserve the user's remaining GitHub Actions minutes. No permission grants, backend policies, database, staging, migrations, worker activation, deployment, merge or release action changed.
- Next implementation focus: finish MAP-001 API route-to-contract/client-consumer mapping and worker/provider activation ownership; then consolidate remaining integration work before Phase 3 testing.


## Cart API permission parity — 22 November 2026

- Source review found that `CartController` had JWT authentication and user-scoped service methods but did not enforce `orders:write` on mutations, unlike the mobile route policy and order checkout API.
- Added `PermissionsGuard` after `JwtAuthGuard` and `orders:write` metadata to add/update/remove/clear, validate/reprice and promo apply/remove. `GET /cart` remains an authenticated self-scoped read.
- Added a focused test for method permission metadata, guard registration, deny/allow behavior and the read-only cart exception. Execution is deferred to the consolidated Phase 3 campaign.
- Updated the API route matrix, mobile permission matrix and programme gap register. No role grant, database, migration, staging, deployment or worker change was needed.
- MAP-001 now has its first controller-level route/client/permission matrix. Exact call-site mapping, physical relation reconciliation and worker/provider activation mapping remain outstanding.


## Aramex provider registry wiring — 22 November 2026

- Source audit found a DI/registry mismatch: `AramexProvider` was a ShippingModule provider/export, but `ShippingService.onModuleInit` registered only `manual-driver`. The carrier worker resolves explicitly configured provider keys and otherwise uses `manual-driver` for shipment operations; `CarrierTrackingPoller` separately falls back to `aramex`.
- Fixed provider registration: preserve `manual-driver` as default and register injected Aramex as a non-default provider. The registration step performs no credential reads or external HTTP calls.
- Added a focused provider-registration test. Execution remains deferred to the consolidated Phase 3 campaign; no live carrier credentials or requests were used.
- Updated the outbox ownership map, API route matrix and gap register. Actual Aramex execution still requires valid store-scoped configuration and active encrypted organization credentials; no staging or production activation is claimed.


## Post-implementation source review — 22 November 2026

A static source pass after the grouped Admin permission and shipping-provider changes caught one remaining dashboard KPI loading reference that still used the removed shared `loading` state. It now uses `kpisLoading`; the two independently gated dashboard sections are also formatted as proper nested JSX. The new test mocks include the commission page's UI-kit imports, and the Aramex test uses a deliberate `unknown` cast for the lightweight provider stub. These corrections are source-reviewed only; test execution remains in Phase 3.


## API wrapper and worker activation mapping — 22 November 2026

- Extended docs/api-route-permission-matrix.md with source-confirmed wrapper symbols across Admin, Web and Mobile clients. Exact page/screen call-site tracing remains open; no nearby-offers wrapper exists in the inspected API clients.
- Corrected provider fallback semantics: shipment create/cancel/label operations default to manual-driver; the separate CarrierTrackingPoller defaults missing provider keys to aramex. The registry fix covers explicitly configured Aramex operations and tracking polls.
- Cross-checked worker startup/activation: P13 return-expiration is opt-in and disabled by default; P13Monitor is separate, read-only and always starts on API instances at the configured cadence; other in-process pollers start without the P13 gate and rely on their own claim/lease behavior.
- No worker was activated, no live credentials used, and no staging/production service was restarted or changed.


## Current handover checkpoint — 22 November 2026

- Repository: nabeel2323/scs-platform. Branch: remediation/phase-0-1-tenant-security. PR #138 is open, draft, unmerged and targets develop. Current branch/PR head: `b78ad3137ecc7820e8a4a0c3816a772bff764c3d` (security(staging): require explicit bootstrap target approval [skip ci]).
- PR #142 remains open/draft/unmerged at `dddff20c170737dc4694008bb807b2b90e177f77`; its earlier CI #1293 success is disposable-PostgreSQL diagnostic evidence only, not live staging identity evidence.
- Latest actual branch Actions run: [#1337](https://github.com/nabeel2323/scs-platform/actions/runs/44963271498) on `06cd8fc1e56dc7ef64a141b97b594adc96ffbece`. Flutter analysis/tests passed. API lint and typecheck steps passed (309 lint warnings, zero errors; 9 typecheck tasks successful), but changed-file Prettier failed on nine files; dependent API unit, PostgreSQL integration, Web/Admin, migration, build and smoke jobs were skipped. This run is not on current head.
- Current head `b78ad3137ecc7820e8a4a0c3816a772bff764c3d` has no GitHub Actions workflow run because implementation commits use [skip ci]. Current commit statuses: Vercel Admin FAILURE and Vercel Web FAILURE, both reporting the provider build-rate-limit/upgrade gate. These are preview-provider failures, not application test results.
- Completed source work: all 53 API service/worker candidates inspected (44 DB-operation paths, 9 database-independent helpers/providers); all 28 module controllers mapped to service callsites; four direct-DB controllers and six shared tenant-scope-helper controllers identified; CLI/migration/bootstrap paths documented; source-level physical object inventory reconciled; read-only audit utility enhanced; local M5/M6 and migration harness guards added; all five staging bootstrap scripts and the package sequence now have exact-target approval guards.
- Security fixes: local admin creation no longer embeds/logs a fixed password; destructive reset requires exact target and typed confirmation; M6 diagnostic redacts OTP; legacy carrier provider-only webhook rejects ambiguous credential matches.
- Next implementation task: complete method-level service-to-table ownership-predicate mapping, review worker/outbox and operator/system contexts, and decide whether obsolete UAT harnesses should be retired after final testing. Then use the enhanced audit only with explicit protected read-only authorization to verify live API/migration identities and resolve 114-versus-116.
- Do not implement a global request transaction interceptor or enable RLS until live identities, exact owner predicates, worker/system/audit/bootstrap contexts, nested transaction behavior and protected catalog evidence are independently established.
- The implementation-first decision remains active: continue grouped source/documentation implementation without waiting for Actions limits; defer the comprehensive test campaign until implementation and integration are ready. No merge, deployment, staging write, shared DB mutation, migration, grant/default-ACL change, RLS activation or worker activation is authorized.

## G-002 database access-path handover — 22 November 2026

A preliminary source inventory of all 53 API module service/worker/provider files plus shared database, audit middleware/service, guards and application bootstrap is now documented at docs/remediation/G-002-DATABASE-ACCESS-PATH-INVENTORY-2026-11-22.md. It confirms a singleton Drizzle handle, existing nested service transactions, asynchronous post-response audit writes, and workers/monitors outside HTTP request context. The inventory also records the separate development/test migration PoolClient path and the unverified live staging runtime role. Do not add a global request transaction or enable RLS until exact table/operation ownership, the 114-versus-116 relation count, worker/system context, audit context, nested transactions and live runtime/migration identities are proven.


## Latest build and verification status — 22 November 2026

Latest actual Actions run #1337 is on `06cd8fc1e56dc7ef64a141b97b594adc96ffbece`, not current head. Flutter passed; API lint/typecheck steps passed (309 lint warnings, zero errors; 9 typecheck tasks successful); changed-file Prettier failed on nine files, skipping dependent tests/build/migration jobs. Current head `b78ad3137ecc7820e8a4a0c3816a772bff764c3d` has no Actions run; Vercel Admin and Web both report FAILURE due to the provider build-rate-limit/upgrade gate. These are not application test results. Comprehensive testing remains deferred to the consolidated phase after implementation and integration.


## Latest continuation checkpoint — 22 November 2026

Current branch and PR #138 head: 9d3eaa8f961f2a718f1840b08c8e37dc113ea636. PR #138 remains open/draft/unmerged to develop.

Method-level predicate batches 1–3 are complete: Orders/Payments/Inventory; Catalog/Offers/Taxonomy; Pricing/Merchant/Store Membership. Batch 3 added service-level same-store validation for price-tier relationships, ACTIVE organization membership checks for merchant document/verification reads, and caller-context validation for document uploads and organization-scoped store/customer reads. Focused merchant/pricing tests were added but not run.

**Continue with Returns/Disputes/Reviews method-level mapping and implementation.** Then review carrier/shipping and worker/outbox/bootstrap/system contexts. Do not run tests or CI until the implementation groups are complete, per the implementation-first decision. Do not enable RLS or perform protected live DB actions.


## Latest continuation checkpoint — 22 November 2026

Current branch and PR #138 head: adbc386470e37329e8357be9908b4bfbe6c6fee0. PR #138 remains open/draft/unmerged to develop.

G-002 bounded method-level source mapping now covers Orders/Payments/Inventory; Catalog/Offers/Taxonomy; Pricing/Merchant/Store Membership; Returns/Disputes/Reviews/Financial Controls; Carrier/Shipping/Webhook; and Worker/Outbox/Bootstrap/Operator/System. PricingService variant-tier reads require storeId and enforce priceLists.storeId on all paths. Protected live identity/catalog evidence and the transaction-context/RLS architecture remain open. Do not add a global request transaction interceptor or enable RLS before those gates.

UX-012 is implemented in source: merchant mobile price-list/tier management and offer linkage. UX-013 is implemented in source: Admin order detail shows product/variant labels and SKU instead of only UUIDs. Focused tests were added but not executed; keep the consolidated testing phase at the end of implementation.

**Next implementation task:** continue the UX-010 source re-audit across remaining Admin, Web and Mobile screens. Record only concrete, source-confirmed gaps and fix safe items in grouped commits. UX-007 support-ticket scope and UX-008 geospatial/location policy remain blocked on product decisions. The generic OutboxDispatcher remains a log-only sink until an event-bus contract is approved.


## Latest continuation checkpoint — 22 November 2026 (supersedes older checkpoints above)

- Live branch before this memory refresh: `remediation/phase-0-1-tenant-security` at `7031cafcd94300421cf314aa6ac3ba3d3ef59651`. PR #138 is open, draft, unmerged and targets `develop`.
- Source implementation batches UX-015 through UX-021 are recorded in the gap register: Product Studio save-flow integrity; buyer web cart recovery; Admin returns read recovery; mobile cart mutation locking; Admin dispute/evidence retry; Admin user/merchant/organization detail retry; and the Admin dispute resolution workflow.
- Focused web/Admin/Flutter regression tests were added alongside those changes but have not been executed. The user explicitly wants implementation and integration completed before the consolidated test campaign.
- Exact-head Actions lookup: no workflow run. Combined Vercel Admin and Web statuses are failures due to “Deployment rate limited — retry in 24 hours.” Latest actual Actions run #44963271498 is on older SHA `06cd8fc1e56dc7ef64a141b97b594adc96ffbece`: Mobile passed; changed-file Prettier failed; API unit, Web/Admin, container, integration/PostgreSQL, migration, contract, boundary, k6, build and staging release jobs were skipped.
- G-001 remains PARTIAL pending independent review. G-002 remains IN PROGRESS pending protected live API/migration identity/catalog evidence, full operation ownership review and approved transaction-context/RLS design. No RLS or shared DB change is authorized.
- Next: continue UX-010 source re-audit across remaining Admin/Web/Mobile screens and implement only concrete, contract-backed gaps. Then complete integration, followed by one consolidated test/fix campaign.
- No merge, deployment, staging/shared DB write, migration, grants/default ACL change, RLS enablement, worker activation or external provider call.

## Latest continuation checkpoint — 22 November 2026 (UX-038 / UX-039)

- Repository: `nabeel2323/scs-platform`; work branch: `remediation/phase-0-1-tenant-security`; PR #138 remains open, draft, unmerged and targets `develop`. PR #142 remains a separate open/draft runtime-identity diagnostic PR.
- Implemented UX-038 Merchant Inventory variant-directory completeness/retry and UX-039 Merchant Import History store/job read recovery. Focused tests were added for pagination, partial variant failures, store lookup retry, failed import reads and no-store behavior. They have not been executed.
- Latest source implementation commit: `bac13a1bbe48a1aac6456a24e545ebf28cabdc7d`. The subsequent commits synchronize this checkpoint's project-memory documents; resolve the live documentation HEAD from GitHub at session start.
- Exact-head Actions lookup for the source commit returned no workflow run. Combined statuses show only Web/Admin Vercel failures pointing to the provider build-rate-limit page; these are not application test results. All new implementation/test/documentation commits use `[skip ci]` under the Actions-minute constraint.
- Continue UX-010 re-audit across the Merchant Import wizard, remaining inventory workflows, and remaining Admin/Mobile screens. Implement only concrete contract-backed gaps. Comprehensive testing remains deferred until implementation and integration are complete.
- No merge/deployment, staging/shared database write, migration, grants/default-ACL change, RLS enablement, worker activation, provider call or release authorization occurred.

## Latest continuation checkpoint — 22 November 2026 (UX-040 / UX-041)

- Implemented UX-040 Merchant Import Wizard store-discovery recovery and UX-041 import-processing lifecycle/outcome correctness. The wizard now distinguishes loading, store lookup failure and a true no-store state; polling starts after the process request succeeds, prevents overlapping/stale reads, stops on unmount, exposes status retry, and distinguishes COMPLETED/FAILED/CANCELLED outcomes.
- Focused tests were added in `merchant-import-wizard-store-recovery.test.tsx` and `import-job-outcome.test.ts`. They have not been executed.
- Latest source implementation commit: `f6e1779558b92861e4f8df110de7075f7ee3c1b6`. The following project-memory commits synchronize this checkpoint; resolve the live PR head from GitHub at session start.
- Continue UX-010 re-audit across remaining Merchant Inventory workflows, then remaining Admin and Mobile screens. Do not repeat UX-030–UX-041.
- PR #138 remains open/draft/unmerged to `develop`. Exact-head Actions lookup must be refreshed after docs sync; all commits use `[skip ci]`. No merge/deployment, staging/shared DB write, migration, grant/default-ACL change, RLS activation or worker activation occurred.

## Latest continuation checkpoint — 22 November 2026 (UX-042)

- Implemented UX-042 Merchant Warehouses store/list recovery: failed store lookup is distinct from no store and has Retry; warehouse-list failure is distinct from a successful empty directory and has Retry; stale reads are guarded and existing rows are retained during failed refreshes.
- Focused test added in `merchant-warehouses-recovery.test.tsx`; not executed.
- Latest source implementation commit: `7ce63c27b0920331d181edeb97d3b8d4e06f99d1`; focused test commit: `cfe53d1c7993025b9c578aab127a777624028c21`. The following project-memory commits synchronize the checkpoint; resolve the live PR head from GitHub at session start.
- Continue UX-010 source re-audit across remaining Admin and Mobile workflows. Merchant Inventory/Import History/Import Wizard/Warehouses slices UX-038–UX-042 are implemented; do not repeat them.
- PR #138 remains open/draft/unmerged to `develop`. All commits use `[skip ci]`; exact-head CI must be checked live. No merge/deployment, staging/shared DB write, migration, grant/default-ACL change, RLS activation or worker activation occurred.

## Latest continuation checkpoint — 22 November 2026 (UX-043)

- Implemented UX-043 Admin Dashboard independent read recovery. KPI, pending organization updates, Catalog Imports and Catalog Requests now have independent loading/error/retry states and request-version guards. Failed KPI reads show unavailable placeholders instead of zero defaults; failed list reads no longer appear empty; previously loaded data remains visible after refresh failures.
- Focused test added in `admin-dashboard-recovery.test.tsx`; not executed.
- Latest source implementation commit: `bd9b89160ce886944cebab227f4a568cdbdb363a`; focused test commit: `cf940371bc77f633cf61561eb443d2b53cab7d83`; source cleanup commit: `ac1373889556750a75c198741f9c2dec16f8db55`. The following project-memory commits synchronize this checkpoint; resolve the live PR head at session start.
- Continue UX-010 source re-audit across remaining Admin and Mobile workflows. Do not repeat UX-030–UX-043.
- PR #138 remains open/draft/unmerged to `develop`. All commits use `[skip ci]`; exact-head CI must be checked live. No merge/deployment, staging/shared DB write, migration, grant/default-ACL change, RLS activation or worker activation occurred.

## Latest continuation checkpoint — 22 November 2026 (UX-044)

- Implemented UX-044 on the dedicated Admin KPI Dashboard: retryable read failures, date-range request-version protection and stale-data preservation. Initial failure shows unavailable metrics instead of zero defaults; failed refresh retains the last successful dataset.
- Focused test added in `admin-kpi-recovery.test.tsx`; not executed.
- Latest source implementation commit: `daf42ad5a4d5d9323b08e89e0c1c0b1679ac0d0e`; focused test commit: `c794c3d03413bbf965696fe1f69f6c89069f9544`. The following project-memory commits synchronize this checkpoint; resolve the live PR head at session start.
- Next: continue UX-010 across remaining Admin workflows, beginning with independent Organizations list/update-request reads, then Mobile. Do not repeat UX-030–UX-044.
- PR #138 remains open/draft/unmerged to `develop`. All commits use `[skip ci]`; exact-head CI must be checked live. No merge/deployment, staging/shared DB write, migration, grant/default-ACL change, RLS activation or worker activation occurred.

## Latest continuation checkpoint — 22 November 2026 (UX-045)

- Implemented UX-045 Admin Organizations independent read recovery. Organization directory and update-request queue now load independently with separate loading/error/retry states and request-version guards; one failed endpoint no longer blocks the other or renders a false empty state.
- Focused test added in `admin-organizations-recovery.test.tsx`; not executed.
- Latest source implementation commit: `772586447312c7abe308c30b85e2e922c588708d`; focused test/mocking commit: `7650fd06cda30dce47dc332260d14dbb9825c7fe`. The following project-memory commits synchronize this checkpoint; resolve the live PR head at session start.
- Next: continue UX-010 across remaining Admin users/merchants workflows, then Mobile. Do not repeat UX-030–UX-045.
- PR #138 remains open/draft/unmerged to `develop`. All commits use `[skip ci]`; exact-head CI must be checked live. No merge/deployment, staging/shared DB write, migration, grant/default-ACL change, RLS activation or worker activation occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-078)

- Implemented Mobile Buyer Store Directory and Store Detail read recovery: explicit refresh/pull-to-refresh, same-screen stale-data preservation, retryable initial errors and truthful empty states.
- Store Detail now uses a dedicated buyer catalogue provider that preserves the existing ACTIVE-only product filter; merchant catalogue behavior is unchanged.
- Added four focused Flutter widget scenarios in `mobile/test/store_buyer_read_recovery_test.dart`. Tests have not been executed and remain pending the consolidated Phase 3 campaign.
- Source commits: provider `bbf78ff`, store list `aaf04f3` plus interpolation correction `83f68ab`, store detail `8876ecc`, focused tests `c9a9c3b`. All use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed; external Vercel preview limits are not application test evidence.
- Next: continue UX-010 source audit through remaining buyer-facing Mobile screens and remaining Web/Admin routes; implement only source-confirmed, contract-backed gaps. Keep Phase 3 consolidated testing deferred until implementation/integration completion.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-079)

- Implemented Mobile Buyer Order History read recovery: explicit refresh/pull-to-refresh, awaited provider refresh, last-successful list preservation, stale-data retry messaging and truthful initial error/empty states. Existing client-side order status filters remain applied to the retained list.
- Added three focused Flutter widget scenarios in `mobile/test/buyer_orders_read_recovery_test.dart`. Tests have not been executed and remain pending the consolidated Phase 3 campaign.
- Source commits: `0bdc925`, theme/empty-state cleanup `35ef98a`, collection syntax correction `fe218e8`, and assertion correction `b7bae42`. All use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed.
- Next: continue the buyer-facing Mobile source audit, especially Search request ordering and stale-result context, then remaining Web/Admin routes. Keep comprehensive testing deferred until implementation/integration completion.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-080)

- Implemented Mobile Search correctness: attribute facet selections now serialize to the existing API `attrFilters` query contract; request generations prevent stale query/filter/page responses from replacing current results; explicit Refresh search is available; same-query refresh preserves last successful results; failed different-query reads cannot display previous results as current or show a false no-results state.
- Added ApiService query serialization coverage and a Flutter widget test for out-of-order search responses. Tests have not been executed and remain pending Phase 3.
- Source commits: API client `69f1351`, request/facet implementation `c2e6ca8`, error empty-state correction `bce5cb2`, same-query refresh preservation `db83dd0`; tests `8a4bf1f` and `0b8fdfb`. All use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed.
- Next: continue the Mobile UX-010 source audit for remaining buyer discovery and product-detail flows, then re-audit remaining Web/Admin routes. Keep comprehensive testing deferred until implementation/integration completion.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-081)

- Implemented Mobile Product Detail stable reads and recovery. Product detail now uses an ID-keyed provider instead of recreating a FutureBuilder request on every PDP rebuild; explicit refresh/pull-to-refresh preserves last-successful product data and initial failures are retryable.
- Variant matrix, offer comparison and seller review failures now have visible retry states; matrix/offer request generations protect route reuse from late responses for a previous product.
- Added Flutter widget tests for product stale-data preservation, initial failure/retry and stable main-product request count. Tests have not been executed and remain pending Phase 3.
- Source commits: provider `57144ad`; product screen `420dae6`; seller-review retry `400b1ac`; focused tests `222a47f`. All use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed.
- Next: continue remaining buyer-facing Mobile screens and the Web/Admin route audit, implementing only source-confirmed contract-backed gaps.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-082)

- Implemented Mobile Notifications read/action recovery: realtime/manual refresh preserves the last successful inbox; explicit refresh and pull-to-refresh; stale-data retry notice; initial failure vs true empty inbox; per-notification mark-read progress/error feedback; guarded Mark All Read with success/failure feedback.
- Added Flutter widget tests for stale inbox preservation, initial failure/retry and mark-read action failure. Tests have not been executed and remain pending Phase 3.
- Source commit: `ae9f5c1`; focused tests: `e1bd420`. Both use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed.
- Next: continue buyer-facing Mobile workflow audit and then remaining Web/Admin route audit; implement only source-confirmed contract-backed gaps.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-083)

- Implemented Mobile Home discovery recovery for Categories, Popular Products and Suppliers: visible initial loading/errors, retry, stale-data preservation and per-section refresh recovery. Home pull-to-refresh now awaits all independent reads; explicit Refresh home action added.
- Unread notification badge no longer fabricates a zero count when the unread-count provider is loading or failed.
- Added Flutter widget tests for stale category preservation, initial failure/retry and unread-count failure behavior. Tests have not been executed and remain pending Phase 3.
- Source commit: `326e35b`; focused tests: `d317129`. Both use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed.
- Next: continue remaining Mobile buyer workflow reads/actions and then Web/Admin route audit, implementing only source-confirmed contract-backed gaps.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-084)

- Implemented Mobile Checkout idempotency-key payload alignment. Identical retries reuse the same key; changing payment method on the Review step now rotates the key so a different checkout payload cannot reuse the old request identity.
- Added `mobile/test/checkout_idempotency_key_test.dart` covering two identical failed retries followed by a payment-method change and a successful submission. Test has not been executed and remains pending Phase 3.
- Source commit: `8b4e033`; focused test commit `6adaa06` with mock-signature correction `515c8f8`. All use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed.
- Next: continue Mobile buyer workflow audit and then remaining Web/Admin route audit, implementing only source-confirmed contract-backed gaps.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-085)

- Implemented Mobile Merchant Dashboard identity/store recovery: profile and active storefront reads preserve last-successful data during refresh/reload failures; stale notices and retry; initial errors remain retryable. Explicit dashboard refresh and pull-to-refresh await profile, active-store and KPI reads independently.
- Existing KPI-specific stale/error recovery remains unchanged; dashboard hub list now supports pull-to-refresh even with short content.
- Added Flutter widget coverage for simultaneous profile/store refresh failures with stale content preservation. Test has not been executed and remains pending Phase 3.
- Source commit: `39deb8b`; focused test commit `3781af6`. Both use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed.
- Next: continue Mobile merchant operational screens, then remaining Web/Admin routes. Implement only source-confirmed contract-backed gaps.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest UX continuation checkpoint — 23 November 2026 (UX-086)

- Implemented Mobile Merchant Catalog recovery: active-store and product reads preserve last-successful data through refresh/reload failures; explicit refresh and pull-to-refresh await the correct current-store product read; stale notices/retry; initial errors remain separate from successful empty catalogues.
- Existing product search/status filters and create/delete permission gates are unchanged.
- Added Flutter widget tests for stale catalogue preservation, initial failure/retry and true-empty state. Tests have not been executed and remain pending Phase 3.
- Source commits: `4ef8813` and current-store refresh correction `7723fb7`; focused tests: `5484e8f`. All use `[skip ci]`.
- PR #138 remains open, draft and unmerged to `develop`. No exact-head Actions result is claimed.
- Next: continue remaining merchant operational screens and then Web/Admin routes; implement only source-confirmed contract-backed gaps.
- No merge, deployment, staging/shared database write, migration, grant/default-ACL change, RLS activation, worker activation or provider call occurred.


## Latest continuation checkpoint — 23 November 2026

- Live branch head: `89561501099a75f02d344eef97a373d861413c5a`; PR #138 is OPEN / DRAFT / UNMERGED to `develop`.
- No GitHub Actions run exists for the exact head. Vercel Web/Admin combined statuses are external build-rate-limit failures, not application test results. Focused tests are added but not executed.
- UX-095 Web merchant route/action permission alignment and G-036 realtime store/order room authorization are implemented in source. See [CURRENT-STATE.md](./CURRENT-STATE.md), [WORK-LOG.md](./WORK-LOG.md), [G-036 plan section](../docs/remediation/IMPLEMENTATION-PLAN.md) and [progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).
- No merge, deployment, staging operation, shared database change, migration, grants/default-ACL change, RLS enablement or worker activation occurred.
- **Next task:** finish the Mobile route-permission and organization-context transition audit following UX-094, then complete remaining Admin route/action permission mapping. Comprehensive testing remains deferred to the dedicated testing phase.


## Latest continuation checkpoint — 23 November 2026 (Mobile UX-096)

- Implementation checkpoint: `84d7f4d713902819b21b89a12074986b17781c48`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`.
- UX-096 completes the current Mobile route/action and organization-context source slice: offer read/create separation, driver assignment permission alignment, read-only offer controls, product/offer write-handler guards, and merchant-shell remount/reset on active-org or permission changes.
- Focused route and driver-assignment tests are added but not executed. No GitHub Actions run exists for the exact implementation checkpoint; Vercel Web/Admin failures are external build-rate-limit statuses.
- UX-095 Web merchant access alignment and G-036 realtime room authorization remain implemented but unverified as recorded in [CURRENT-STATE.md](./CURRENT-STATE.md).
- No merge, deployment, staging operation, shared database change, migration, grant/default-ACL change, RLS enablement or worker activation occurred.
- **Next task:** finish the remaining Admin route/action permission mapping. Keep comprehensive testing deferred to Phase 3.


## Latest continuation — 23 November 2026 (Admin UX-100)

- Implemented the missing approver-only settlement-adjustment Reject action with required reason and the API's exact `{ reason }` payload.
- Added focused rejection-flow and read-only visibility tests; not executed.
- Source commit: `14c8c5c`; focused test commit: `e471e6b`. All implementation/test commits use `[skip ci]`.
- Custom financial route/action permission mapping was compared with API controller decorators for reconciliation, settlement adjustments, settlements, payments and role permission updates. The reviewed permission predicates match the endpoint guards.
- PR #138 remains open/draft/unmerged. No exact-head Actions run or test pass is claimed.
- Next: continue direct custom mutation handler audit; batch comprehensive formatting and testing in Phase 3. No database, staging, migration, grants, RLS, worker or deployment action occurred.


## Latest continuation — 23 November 2026 (Admin UX-101)

- Added action-time permission checks to Product Type governance, Catalog Import Center, Attribute Management and Attribute Groups.
- Product Type Builder Publish no longer proceeds when saving dirty configuration fails; focused regression test added but not executed.
- Catalog Import Center upload/execute/retry actions are single-flight; permission and role enforcement in the API is unchanged.
- Source commits: `bbe5a72`, `9af0646`, `553cb25`, `8e795c3`; tests: `43c6e5e`, `997da23`, `3d59ae9`.
- PR #138 remains open/draft/unmerged; exact-head CI must be refreshed. No database, staging, migration, grants, RLS, worker or deployment action occurred.
- Next: continue the Admin operational UX/source audit beyond permission mapping; Phase 3 remains the consolidated formatter and test campaign.


## Latest continuation — 23 November 2026 (Admin UX-102)

- Shared ProductForm Save now checks `catalog:products:write` and prevents duplicate create/update dispatches; both route wrappers pass the capability.
- Source commit: `383ea13c589d9023aab24d3b2d15c5c0db2cd751`.
- CI #1417 passed lint/typecheck and Flutter analysis/tests; changed-file formatting failed across 251 files, and dependent Web/Admin test jobs were skipped. It predates UX-102.
- Next: continue Admin operational UX/source audit beyond permission mapping; Phase 3 remains the consolidated formatter/test campaign.


## Latest continuation — 23 November 2026 (Admin UX-103)

- Product Type list/filter and selected-schema reads now ignore stale responses; Product Type Builder schema/readiness reads are invalidated on route/access changes.
- Source commit: `892bb24f4522988c89dea507cb848d80fb4dbe2e`.
- CI #1419: lint/typecheck and Flutter analysis/tests passed; Prettier gate failed across 254 files; Web/Admin tests and dependent gates skipped.
- No focused UX-103 test was added. Comprehensive testing remains Phase 3.
- Next: continue Admin operational UX/source audit beyond permission mapping.


## Latest continuation — 23 November 2026 (Admin UX-104 / UX-105)

- Catalog Requests Approve/Reject now enforce the route capability at action time and prevent duplicate submissions. Tests added for approval single-flight and rejection payload.
- KPI and Data Quality protected reads now fail closed without their route permission; tests assert no unauthorized API request.
- Source/test commits: `00427e5f0cdd183aa7b8c910a93b8edd2e0d0723` and `8474b7acd264872a01d305bef515009eded104ed`.
- CI #1420/#1421: lint/typecheck and Flutter checks passed; formatting gate failed (254 / 255 files); Web/Admin tests and dependent gates skipped.
- Next: continue Admin operational UX/source audit beyond permission mapping; Phase 3 remains the consolidated formatter and test campaign.


## FIN-001 — Payment refund concurrency and idempotency — 23 November 2026

- `PaymentsService.approveRefund` now locks the payment row before applying a refund approval and recomputing the cumulative successful-refund total. This prevents concurrent partial approvals from leaving the payment in a stale `PARTIALLY_REFUNDED` state after the full confirmed amount has succeeded.
- `PaymentsService.requestRefund` returns the original refund for an identical caller-supplied idempotency key/payload, even after payment state changes; mismatched key reuse is rejected. Concurrent cross-payment key collisions are handled by a conflict-safe insert and verification lookup.
- Added PostgreSQL integration scenarios FIN-DSH-11 and FIN-DSH-12. Not executed; remain TESTING_PENDING.
- Source/test commit: `117614884ff1e0d50ca116f0b28f249fd83761c0`. No schema/migration/provider/gateway/payout changes.
- Next: continue source-first commercial/operational correctness audit; keep the consolidated test campaign in Phase 3.

### Latest continuation — FIN-002 settlement calculation idempotency

- The settlement calculation path previously allowed a second payable settlement to be created after the original settlement was marked PAID, because the partial unique index only covered active statuses.
- FIN-002 serializes settlement calculation on the payment row; active settlement retries return the existing row, and paid/adjustment history blocks a new payable calculation.
- FIN-DSH-13–15 cover concurrent calls, post-PAID recalculation and refusal to settle an unconfirmed payment; tests are added but not executed.
- Source/test commit: `60bf231f950dec8ede3c8945f76b22bc8e4b4451`.
- Next: continue source-first commercial/operational correctness audit, prioritizing remaining payment/settlement state transitions and persistence/event semantics. Do not expand gateway or payout scope.

### Latest continuation — FIN-002 settlement calculation — 23 November 2026

- Payment-row locking serializes settlement calculation against refund request/approval operations and concurrent settlement attempts.
- Existing active settlement retries return the current PENDING/CALCULATED/DUE row; recalculation after PAID/ADJUSTMENT history conflicts.
- Settlement calculation is blocked until the payment is CONFIRMED, CAPTURED, PARTIALLY_REFUNDED or REFUNDED.
- FIN-DSH-13/14/15 cover concurrent idempotency, post-PAID rejection and pre-confirmation denial. Tests are added but not executed.
- Source/test commit: `60bf231f950dec8ede3c8945f76b22bc8e4b4451`.
- Next: continue source-first financial correctness review. Keep automatic gateway/payout out of scope.

### FIN-003 — Minor-unit amount validation

- Verified bank-transfer amount, COD collected amount, refund amount and settlement confirmed amount must be positive safe integers in minor units.
- Added FIN-DSH-16 to reject fractional/zero inputs and confirm rejected verification/COD attempts leave payment state unchanged. Not executed.
- Source/test commit: `f554617c592ff57db296e0ca88614ac246468194`.
- No business rule was added for overpayment/underpayment or exact equality; no gateway/payout scope change.

### Latest financial correctness continuation — FIN-003

Positive safe-integer validation now covers verified payment amount, COD cash collected, refund request amount and settlement confirmed amount. No overpayment/underpayment or equality policy was introduced. FIN-DSH-16 is added but not executed. Source/test commit: `f554617c592ff57db296e0ca88614ac246468194`.

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


## FIN-009–FIN-013 financial audit continuation — 23 November 2026

- FIN-009: dispute resolution compare-and-set prevents duplicate resolution events/outbox messages; source/test `2b8e2fa7cf2aab87d4186153a61748bc82805c52`.
- FIN-010: return refund settlement adjustment serializes against mark-paid; source/test `a1dc7b2cf31c83f2a59c0a72f0056f4955fe7143`.
- FIN-011: return orphan-refund recovery validates the complete financial payload; source/test `72927529e64a719741b94b864f6adba7cafd4f0d`.
- FIN-012: settlement adjustment preserves original settlement currency; source/test `ba3318724c3080d4c29baee1c81e972262e14ac4`.
- FIN-013: payment expiry appends order cancellation history only when the conditional order update succeeds; source `028e30e9ebeb626b51b6d80bc28467c9c946c419`, regression `83550c34c7dc11492fc6e5c5fc6fcb418b79243c`.
- Additional payment confirmation fail-closed behavior for missing financial breakdown is in `cdb189e95dd7022793af33352a18c31f81117059`.
- FIN-DSH-11–28 are added but not executed. Keep all these items IMPLEMENTED / TESTING_PENDING until the consolidated PostgreSQL integration campaign passes.


### Latest financial correctness continuation — FIN-014 and FIN-015

- FIN-014 prorates order-level discounts over returned goods and preserves payment currency in both commission reversal and settlement adjustment ledgers. FIN-DSH-29 covers a partial discounted return. Source commits: 6221c9c10bba4652b19c1aeaca59a8d1c3d9c79d and 00da339e62dbeef87a55434b3ed5ea1a85cb6508.
- FIN-015 replaces unsafe Number multiplication in proportional commission reversal with exact BigInt arithmetic in both service paths. A unit regression proves a one-minor-unit floating-point over-reversal is avoided. Source commits: 917397ffd5491d6fe52a18063c0266e831b67c38, e2338cf1e50e825bd1c22becbeab0a6a4757a5e4, a596d49a752973cdc1b7039f3b325f0421252c9c; unit test: 4e67e5ef7541e87ef5d9698e3abad7529cd07219.
- Tests are added but not executed. No schema/migration, gateway, payout, staging, shared DB or deployment change. G-012 remains OPEN.


### FIN-016 — COD expiry protection

Stale-payment discovery excludes CASH_ON_DELIVERY, and expirePayment itself refuses to expire COD even if called directly. COD remains collectible at delivery regardless of the bank-transfer expiry window. FIN-DSH-30 covers a 365-day-old COD payment on a DELIVERED order and asserts payment status, order status and expiry events remain unchanged. Source commit 68b5251200f9f3765a0568b796db056a18cd878e; test commit 6ff2a4788c5f2a98c5866cfd0d321cea9948c4ac. Not executed.


## FIN-017 — Exact return refund allocation and payment-currency delivery adjustments — 23 November 2026

- **Finding:** return request calculations used floating-point discount/VAT ratios with `Math.round`, creating minor-unit precision risk for large values. Partial-return delivery-fee exception adjustments also hardcoded SYP despite the return's payment currency being available.
- **Implementation:** `roundProportionalMinorUnits` now performs validated half-up allocation using BigInt. Return line discounts, VAT and delivery-fee VAT use exact minor-unit arithmetic with safe-integer bounds. Delivery-fee exception adjustments inherit `payment.currency`.
- **Regression coverage:** FIN-DSH-31 verifies a partial return with products 3000, discount 600, tax 240 and delivery fee 450 yields refund 880 and a 495 USD delivery-fee adjustment. Unit tests cover half-up allocation and an intermediate product beyond safe Number precision. Tests added, not executed.
- **Source commit:** `122edb4bf1dc67ba01bfc33b97809cc037781f87`; unit/integration test commit: `e6823ee9b1c68f5b71229ffbda17c9f525b66565`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, provider, staging, shared DB or deployment behavior changed.


## FIN-017 — Exact return refund allocation and payment-currency delivery adjustments — 23 November 2026

- **Finding:** return request calculations used floating-point discount/VAT ratios with `Math.round`, creating minor-unit precision risk for large values. Partial-return delivery-fee exception adjustments also hardcoded SYP despite the return's payment currency being available.
- **Implementation:** `roundProportionalMinorUnits` now performs validated half-up allocation using BigInt. Return line discounts, VAT and delivery-fee VAT use exact minor-unit arithmetic with safe-integer bounds. Delivery-fee exception adjustments inherit `payment.currency`.
- **Regression coverage:** FIN-DSH-31 verifies a partial return with products 3000, discount 600, tax 240 and delivery fee 450 yields refund 880 and a 495 USD delivery-fee adjustment. Unit tests cover half-up allocation and an intermediate product beyond safe Number precision. Tests added, not executed.
- **Source commit:** `122edb4bf1dc67ba01bfc33b97809cc037781f87`; unit/integration test commit: `e6823ee9b1c68f5b71229ffbda17c9f525b66565`.
- **Status:** IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, provider, staging, shared DB or deployment behavior changed.


### FIN-017 and FIN-018 — Return workflow hardening

- FIN-017 replaces floating-point return refund calculations with BigInt-backed minor-unit allocations for gross, order discount, VAT and delivery fees, and preserves payment currency in delivery-fee adjustments. FIN-DSH-31 added; not executed.
- FIN-018 serializes return creation on the payment row and rechecks active-return, returned-quantity and refundable-amount invariants inside the transaction. FIN-DSH-32 proves two concurrent requests produce exactly one active return. Not executed.
- Source/test commits: FIN-017 `122edb4bf1dc67ba01bfc33b97809cc037781f87` / `e6823ee9b1c68f5b71229ffbda17c9f525b66565`; FIN-018 `8a8364899f08180da9213be4d897a65fac9a897d` / `705609fa2928d6e12e393b59bb990cfe0cf2343c`.
- PR #138 remains OPEN / DRAFT / UNMERGED. No exact-head Actions run. Tests await consolidated Phase 3.


## FIN-019 — Settlement adjustment posting integrity — 23 November 2026

- Settlement adjustment posting previously wrote `net_minor = -amount_minor` for every type, incorrectly treating a commission reversal (merchant credit) as a debit. It also allowed an approved adjustment to transition to POSTED without creating a settlement ledger row when no primary settlement existed.
- Posting now calculates the sign by adjustment type: COMMISSION_REVERSAL increases merchant net; refund, delivery-fee and balance-debit adjustments reduce it. Amounts must be positive safe integers in minor units.
- Posting locks the latest primary settlement row (PENDING/CALCULATED/DUE/PAID), serializing against settlement payment and other adjustment posts. If no primary settlement exists, posting conflicts and the adjustment remains APPROVED/unlinked.
- Added unit cases for credit/debit sign and PostgreSQL FIN-DSH-34/35 for commission reversal net and no-settlement posting rejection. Tests not executed.
- Source commits: `968fa110fb77efcc98c5a892c5ed69029347fc8e`, `b2f0dc49b85d65dac0eaf631bf6fab7beaba8cae`. Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, gateway, payout, staging, shared DB, grant/RLS, deployment or worker changes.


## FIN-019 test scenario numbering correction — 23 November 2026

The P13 PostgreSQL suite already used FIN-DSH-33 for return-request idempotent retry. The new settlement-adjustment cases are uniquely numbered FIN-DSH-34 (commission reversal credit sign) and FIN-DSH-35 (no primary settlement blocks posting). Test-only correction commit: `b9f9728659e71d3788cc58aa2b5ad9df29ab9731`. Tests remain unexecuted.


## Latest continuation checkpoint — 23 November 2026 (FIN-020)

- Active repository: `nabeel2323/scs-platform`; active branch: `remediation/phase-0-1-tenant-security`; PR #138 targets `develop` and remains OPEN / DRAFT / UNMERGED.
- Latest source-and-test commit: `ad478cc53ce40bec86172e881b4f14cea7e6dfac` (FIN-020).
- **FIN-020 — Reconciliation ledger correctness:** reconciliation now treats COMMISSION_REVERSAL adjustments as merchant credits, uses exact minor-unit arithmetic, sums commission reversals with BigInt, checks delivery-fee refund caps with the same half-up allocation as return posting, includes DELIVERY_FEE_REFUND records, and records refund-status mismatches as descriptions rather than values in BIGINT columns.
- Added unit regressions using production helpers and PostgreSQL FIN-DSH-36 using the disposable Testcontainers database. Tests have **not** been executed; status is IMPLEMENTED / TESTING_PENDING.
- Exact-head GitHub Actions lookup for the source/test commit returned no workflow runs. Its Vercel Web and Admin contexts were SUCCESS; these are preview-provider checks, not application test evidence. No test/CI verification is claimed.
- No schema/migration, shared database, staging, Render, environment, grant/default-ACL, RLS, worker, provider, gateway, automatic payout, deployment or merge action occurred.
- Existing gates remain: G-001 PARTIAL; G-002 IN PROGRESS and protected/read-only; G-036 IN PROGRESS; Phases 0–5 IN PROGRESS; Phase 6 not started. PR #138 stays draft/unmerged.
- **Next task FIN-021:** audit reconciliation-run versioning and failure semantics before modifying them: verify the intended direction of `superseded_by`, align unique-version scope with organization scope, handle concurrent version allocation, and prevent failed runs from leaving incomplete discrepancy records. Then continue the persisted financial history/outbox audit. Do not assume the semantics; inspect schema, migrations, callers and existing tests first.
- Follow the recorded implementation-first cadence: group related source/tests/docs, keep focused regressions pending the consolidated Phase 3 campaign, and do not use protected staging or shared DB for tests.


## Latest continuation checkpoint — 23 November 2026 (FIN-021)

- Live repository/branch: `nabeel2323/scs-platform`, `remediation/phase-0-1-tenant-security`; PR #138 remains OPEN / DRAFT / UNMERGED against `develop`.
- FIN-021 source/test/migration/runbook commit: `e2dcb43e37d2a67a72d0891c4c3519d19719b5ae`.
- Reconciliation version allocation now takes a PostgreSQL transaction-scoped advisory lock keyed by organization (or NULL/global scope), period and currency. The version read and insert occur under that lock.
- Run creation, all reconciliation checks, discrepancy inserts and COMPLETED transition are one transaction. On an execution error the transaction rolls back; a separate best-effort transaction writes a FAILED run with zero discrepancies and a generic execution-error summary.
- `superseded_by` now points from the prior run to its successor. Migration `0074_reconciliation_tenant_version_integrity.sql` repairs the old backward links and makes the unique index tenant-aware with NULLS NOT DISTINCT. The migration is source-only and has **not** been applied to any shared/staging database.
- Added PostgreSQL FIN-DSH-37 (same-tenant concurrent versions, independent tenant version 1, forward links) and FIN-DSH-38 (failed-run rollback and no partial discrepancies). Removed the old unit tests that only asserted hard-coded version arithmetic. Tests are added but not executed.
- Exact-head GitHub Actions lookup returned no run. Combined statuses: Vercel Web FAILURE due external build-rate-limit; Vercel Admin SUCCESS. Neither is API/PostgreSQL test evidence.
- No shared DB/staging write, migration execution, grant/default-ACL/RLS change, environment change, worker activation, provider/gateway/payout change, deployment or merge.
- Existing G-001 PARTIAL, G-002 IN PROGRESS/protected, G-036 IN PROGRESS; Phases 0–5 remain IN PROGRESS; Phase 6 NOT STARTED. PR #138 stays draft.
- **Next FIN-022:** audit immutable financial event/history and transactional outbox consistency across payment, settlement, refund, return, dispute and settlement-adjustment transitions. Inspect producers, transaction boundaries, event payloads, outbox deduplication/aggregate identity and consumer ownership before modifying; add focused PostgreSQL concurrency/rollback cases. Keep implementation-first cadence and the consolidated Phase 3 test campaign.


## Latest continuation checkpoint — 23 November 2026 (FIN-022)

- Live repository/branch: `nabeel2323/scs-platform`, `remediation/phase-0-1-tenant-security`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`.
- FIN-022 producer/outbox commits: `3784bca3dd9a21fa3123e555aebbdd13addfb21b`, `a77339ab1b50d881fc006a16b9613505458fcd27`, `ccde36322f9bcfd12f2de2bfad22390cd9b7f503`, `5d7eadf07e11801813a606dfeeda60b83c16eb19`, `e761195829d3fcd4bc2d9d0eecfd848188c32d53`.
- Added atomic outbox events for payment creation and CREATED → AWAITING_PAYMENT; dispute OPENED, EVIDENCE_SUBMITTED and RESPONSE_SUBMITTED transitions are now row-locked and transactionally persisted with immutable history and outbox records; settlement-adjustment creation now emits `settlement_adjustment.created` in the same transaction.
- Generic outbox dispatcher now claims pending non-carrier rows with `FOR UPDATE SKIP LOCKED`, a five-minute lease and worker ownership. Completion/failure updates are conditional on the lease owner. Raw SQL maps event columns to the camel-case shape consumed by dispatch.
- Added PostgreSQL FIN-DSH-39–42 and unit coverage for the outbox claim SQL/projection. Tests have **not** been executed. The dispatcher remains a logging implementation, not an external event-bus integration.
- Exact-head Actions: no workflow run. Vercel Web and Admin both FAILURE due external build-rate-limit. No application test result is claimed.
- No migration, shared/staging DB write, grant/RLS, worker activation, environment change, provider/gateway/payout, deployment or merge action.
- G-001 PARTIAL; G-002 IN PROGRESS/protected; G-036 IN PROGRESS; Phases 0–5 IN PROGRESS; Phase 6 NOT STARTED. PR #138 stays draft.
- **Next FIN-023:** close the remaining checkout/refund transaction-boundary audit. In particular, checkout commits order/payment creation before the BANK_TRANSFER post-commit order/payment status transitions; a swallowed transition failure can leave order PAYMENT_PENDING while payment remains CREATED. Inspect recovery/idempotency paths and add rollback/concurrency regressions before changing it. Also review dispute-refund recovery where refund request and dispute resolution intentionally span separate transactions. Keep the consolidated Phase 3 validation cadence.
