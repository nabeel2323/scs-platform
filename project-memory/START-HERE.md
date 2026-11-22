# SCS Platform — Project Memory: Start Here

> **Mandatory entry point for every new ChatGPT conversation about this repository.**
>
> Last reconciled: 22 November 2026  
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

Live GitHub reconciliation on 22 November 2026 confirms branch `remediation/phase-0-1-tenant-security`, PR #138 open/draft/unmerged to `develop`. Latest source implementation commit: `c5b110fc41324251d24284809664c993b9212827`; latest focused test commit: `0bc00fa68f541ff74e86c68e0e1a70af20720d6d`. Project-memory and remediation progress documents are synchronized through UX-058; refresh the live ref after the next documentation update.

UX-046 Admin User Management is implemented: optional phone, independent organization/role lookup retry, org/role pair validation at UI and service boundaries, profile editing, membership management, confirmed status changes, and accurate per-role permission display. UX-047 Merchant Store Detail presents locale, popularity-badge visibility, logo/cover previews and address. UX-048 Roles List and UX-049 Audit Log have retryable, request-version-guarded reads. UX-050–UX-053 cover Category Detail, Product Type Detail, Catalog Import history and Analytics recovery. UX-054–UX-057 cover Commission Oversight, Offer KPI/Trend, Brand Management and Business Calendar. UX-058 covers Attribute Groups and Definitions retry, stale-response protection and successful-empty-only results. Focused Admin/API tests were added but not executed. All commits use `[skip ci]`; Vercel Web/Admin failures remain external build-rate-limit statuses, not application test results.

Continue UX-010 across remaining Admin operational routes and supporting detail views, then Mobile workflows. Do not repeat UX-030–UX-058. Keep comprehensive testing deferred until implementation/integration are complete. G-001 remains PARTIAL and G-002 IN PROGRESS. Preserve all merge/deployment/staging/shared-database/grant/RLS/worker restrictions.

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
