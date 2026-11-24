# SCS Platform — Project Memory: Start Here

> **Mandatory entry point for every new ChatGPT conversation about this repository.**
>
> Last reconciled: 24 November 2026  
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
- [G-002 migration object and operator access audit — 24 November 2026](../docs/remediation/G-002-MIGRATION-OBJECT-AND-OPERATOR-ACCESS-AUDIT-2026-11-24.md) — 75-migration SQL object review, pg_partman retention/scheduler gap, migration runner contracts, operator principals and guarded legacy verification scripts.
- [G-002 database operation map](../docs/remediation/G-002-DATABASE-OPERATION-MAP-2026-11-22.md) — source map covering 53 service/worker/provider candidates and 28 module controllers; raw SQL, actor handoffs and unverified runtime identities are distinguished.
- [G-002 table ownership and predicate candidates](../docs/remediation/G-002-TABLE-OWNERSHIP-AND-PREDICATE-CANDIDATES-2026-11-22.md) — schema-backed candidate ownership paths for identity, store, catalog, order, financial, user-private and system rows; not an approved policy.
- [G-002 migration foreign-key crosswalk](../docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md) — migration-defined FKs, deferred relationships, non-FK org_id metadata, system-table scope and migration 0070/0071 boundaries.
- [G-002 authenticated identity actor-context adoption](../docs/remediation/G-002-AUTHENTICATED-IDENTITY-ACTOR-CONTEXT-2026-11-24.md) — method boundaries and exclusions for credentials, account linking/unlinking and organization switching.
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
6. Follow the user's strict implementation-first instruction: finish planned implementation and cross-component integration before beginning the test phase.
7. **Do not execute tests or trigger test/CI workflows during implementation.** Test authoring and the consolidated unit/API/PostgreSQL/migration/security/tenant/concurrency/web-admin-mobile E2E/performance campaign belong after implementation and integration are complete. Do not spend Actions minutes on incremental validation.
8. Continue source-level review and implementation safeguards; immediately fix a concrete security or correctness defect discovered in the code. This does not authorize running the deferred test campaign.
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
- Group related implementation and documentation changes into fewer, cohesive commits where practical.
- The user explicitly directs that implementation and integration must be completed before tests are run; do not execute tests or CI during implementation, and do not ask for approval for routine implementation steps.
- Keep technical documentation synchronized with the actual implementation and verified behavior.
- Provide detailed, truthful status and exact evidence. Never report a skipped job as passed.
- A reviewer can be the user or a separately appointed qualified reviewer; the implementation author must not self-certify an independent security review.

## Current starting point

Live GitHub reconciliation for this continuation on 24 November 2026: repository `nabeel2323/scs-platform`; branch `remediation/phase-0-1-tenant-security`; PR #138 OPEN / DRAFT / UNMERGED to `develop`; exact PR head `92895859abe20f0132a3ae021c695898e0b9f051`. Compare reports 2,490 commits ahead / 0 behind. Exact-head Actions lookup returned zero workflow runs. Combined status has two Vercel Web/Admin PENDING contexts; these are external preview checks, not application test results. The PR API reports the current head directly; always re-query before the next session.

The prior implementation checkpoint remains the driver eligibility, carrier/webhook lineage, shipment/order/store and refund/payment/order consistency hardening, migration-runner fail-closed protections, and targeted Drizzle FK parity work. Commit `92895859abe20f0132a3ae021c695898e0b9f051` is the latest source/documentation checkpoint: three safe migration 0059 links were added to Drizzle; `refunds.dispute_id` was added to the crosswalk; two payment-owned links remain migration-only to avoid a module cycle. This continuation found and corrected additional Drizzle metadata gaps in migration 0059: three safe cross-module links are now represented with nullable `ON DELETE SET NULL` references (`return_requests.refund_id`, `return_request_items.inventory_item_id`, `disputes.return_request_id`). Two payment-owned links (`refunds.return_request_id`, `refunds.dispute_id`) remain intentionally migration-only because importing returns/support into payments would create a module initialization cycle. No SQL migration or database constraint was changed.

**Next:** complete the full table-by-table Drizzle/migration relationship comparison across all 100 schema declarations and 183 migration REFERENCES clauses, then continue operation-level ownership predicates, direct Pool/PoolClient and actor-context nesting review. The parity comparison remains partial until every edge is reconciled; do not claim full FK parity from this slice.

No tests, formatter, lint, typecheck, E6 or CI were run. Continue implementation/integration first. Keep PR #138 draft/open/unmerged. Do not merge/deploy, access or mutate shared/protected staging databases, apply migrations, change RLS/grants/default ACLs, alter protected environment configuration, or activate workers without the specific required authorization.

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

During implementation, do not execute test commands or trigger GitHub Actions/CI. Add or update test coverage when implementation requires it, but defer all test execution until implementation and cross-component integration are complete. Then run one consolidated unit/API/PostgreSQL/migration/tenant-security/concurrency/web-admin-mobile E2E/performance campaign. This does not permit knowingly deferring a concrete security or correctness defect. Keep the existing G-001/G-002 review, staging, database and release gates intact.

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

## Latest continuation checkpoint — 23 November 2026 (FIN-023)

- Active branch `remediation/phase-0-1-tenant-security`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. Current source/test HEAD: `71c8acb5a890a8b7350915cc4eca80dd6104874c`.
- BANK_TRANSFER checkout now commits the order transition to PAYMENT_PENDING, payment transition CREATED → AWAITING_PAYMENT, both immutable histories and all matching outbox events inside the original checkout transaction. The post-commit best-effort payment/order state mutation was removed; BANK_TRANSFER checkout fails closed if PaymentsService is unavailable.
- Dispute resolution now locks the dispute row and calls refund creation with the same transaction client. Refund row, payment event/outbox, refund-to-dispute link, dispute RESOLVED state, dispute event and resolution outbox commit or roll back together. Existing idempotent orphan-refund recovery remains supported for historical rows.
- Added PostgreSQL FIN-DSH-43/44 (bank-transfer success and outbox-failure rollback) and FIN-DSH-45 (refund + dispute resolution atomic rollback). Tests added but **not executed**.
- Exact-head GitHub Actions lookup returned no run. Vercel Web/Admin both FAILURE due external build-rate-limit. No application test result is claimed.
- No shared/staging DB write, migration, grant/RLS, worker activation, provider/gateway/payout, deployment or merge action. PR #138 remains draft.
- FIN-023 status: IMPLEMENTED / TESTING_PENDING. Existing G-001 PARTIAL; G-002 IN PROGRESS/protected; G-036 IN PROGRESS; Phases 0–5 IN PROGRESS; Phase 6 NOT STARTED.
- **Next FIN-024:** audit payment proof upload lifecycle: storage upload occurs before the payment proof DB transaction; inspect orphan cleanup on DB failure, retries, file replacement and authorization. Add storage/DB rollback tests and safe cleanup without deleting a previously committed proof.

## Latest continuation checkpoint — 23 November 2026 (FIN-024)

- Active branch `remediation/phase-0-1-tenant-security`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`. Current source/test HEAD: `41c8db370a30124e981c42c1e7d7b8487771e8ec`.
- Payment proof endpoint now accepts multipart `file` uploads (10 MB maximum; JPEG/PNG/WebP/PDF allowlist) as well as existing receipt URL/reference fields. Service validates storage configuration, size and MIME type, sanitizes extension, and writes to a per-payment generated key.
- If the DB transaction fails, cleanup first re-reads the payment row; it deletes the new upload only if no committed row references it. If verification fails, it deliberately leaves the object rather than risk deleting a committed proof. Existing proof is retained on failed replacement; a previous managed proof is retired only after a successful replacement commit. External URLs are never deleted.
- Added PostgreSQL FIN-DSH-46/47 for failed persistence cleanup and successful replacement ordering. Tests not executed.
- **Residual risk:** a process crash after S3 upload but before the DB transaction can leave an orphan object; a DB failure while verifying cleanup also intentionally leaves the new object. No durable upload-intent/sweeper is implemented yet. FIN-024 is IMPLEMENTED / TESTING_PENDING with this residual explicitly open.
- Exact-head GitHub Actions lookup returned no run. Vercel Web/Admin both FAILURE due external build-rate-limit; no application test result is claimed.
- No migration, shared/staging DB write, grant/RLS, worker activation, provider/gateway/payout, deployment or merge action. PR remains draft.
- **Next FIN-025:** design durable payment-proof upload intent/recovery and orphan cleanup that can survive process crashes and retries without deleting any key referenced by a committed payment row. Include cleanup lease/retry, age threshold and tests; do not add a broad bucket-list delete operation.

## FIN-024 follow-up — 23 November 2026

- Latest proof-upload source/test head: `847647c424097e5ace69236d0c3b4592f85d30e9`.
- Payment transition validation now occurs before object upload. If the object-store request times out after the server accepted the object, the service checks the unique generated key and compensates by deleting it when it exists. FIN-DSH-48 covers this uncertain-upload response case.
- FIN-DSH-46/47/48 are added but not executed. Residual process-crash window after upload but before DB transaction remains; FIN-025 must add durable upload-intent/recovery and bounded cleanup.

## Latest continuation checkpoint — 23 November 2026 (FIN-025)

- Active branch `remediation/phase-0-1-tenant-security`; PR #138 remains OPEN / DRAFT / UNMERGED to `develop`.
- FIN-021 reconciliation lifecycle implementation is committed. A follow-up source audit found Drizzle relational query accessors were being called on the transaction client; the implementation now uses transaction-compatible core selects. Commit: `1997ee604f58328faf580328817ec5b7b326fabf`. FIN-DSH-37/38 are added but not executed.
- FIN-025 adds durable payment-proof upload intents before object-store writes, a 30-minute upload lease, a 60-minute stale-age threshold, fenced SKIP LOCKED cleanup claims, payment-row reference checks across all payment records, transactional retirement intents for replaced managed proofs, object HEAD/DELETE handling, bounded retries and terminal failure state. The cleanup method is deliberately not scheduled or registered as an active worker.
- Migration 0075 is source-only and not applied. FIN-DSH-46–53 cover durable cleanup scheduling, successful commit, uncertain upload response, stale orphan cleanup, committed-reference preservation, retry backoff and concurrent claim exclusion. Tests are not executed.
- No bucket listing or broad delete is used. Cleanup touches only exact generated keys from durable intent rows.
- No shared/staging database write, migration execution, grants/RLS, worker activation, environment change, provider/gateway/payout, deployment or merge action. PR remains draft.
- **Next:** continue the FIN-025 source audit for lease fencing and crash windows, then review remaining payment/refund recovery gaps. Keep implementation and focused tests pending the single consolidated Phase 3 test campaign.

## FIN-025 follow-up — storage error classification — 23 November 2026

- Latest source correction commit: `ff67348b950b51a482fa4cf624549a146551c383`.
- S3-compatible not-found detection now checks HTTP 404 plus all provider error-name/code fields instead of letting a generic error name mask a provider `NotFound` code. Generic storage failures remain retryable and are never treated as proof that an object is absent.
- No tests were executed. Exact-head GitHub Actions lookup returned no run; Vercel Web/Admin statuses are external build-rate-limit failures.

## Latest continuation checkpoint — 23 November 2026 (FIN-026)

- Latest implementation commit: `e5733dc4a403c15da27d9064aa8703a89f6ee7f4`; branch remains `remediation/phase-0-1-tenant-security`; PR #138 remains open, draft and unmerged.
- FIN-025 is implemented: durable upload intents, atomic proof/payment/outbox commit, transactional retirement intent for previous managed proofs, global payment-row reference checks, exact-key cleanup, bounded retry and concurrent SKIP LOCKED claims. Migration 0075 remains source-only; cleanup method is not scheduled or activated.
- FIN-DSH-46–53 cover proof lifecycle and cleanup recovery; tests have not been executed.
- FIN-026 fixes payment event actor attribution for verifyPayment and confirmCash. FIN-DSH-54 covers merchant verification and admin COD confirmation; test not executed.
- No exact-head GitHub Actions run has been returned for the latest commit. Vercel Web/Admin failures are external build-rate-limit statuses.
- No shared/staging database write, migration execution, grants/RLS, worker activation, environment change, provider/gateway/payout, deployment or merge action.
- **Next:** continue source-auditing payment/refund/settlement event history and retry semantics. Keep the consolidated Phase 3 verification campaign pending until implementation is complete.

## FIN-026 follow-up — privileged return event attribution — 23 November 2026

- FIN-026 now also covers ReturnsService transitions. Privileged admin overrides of merchant-side and buyer-side actions record ADMIN; normal merchant and buyer actions retain MERCHANT/BUYER.
- PostgreSQL FIN-DSH-55 covers admin override of MERCHANT_APPROVED and CANCELLED. Test not executed.
- Latest implementation commit: `47de1df8637d3cdff03ac6a70184613978357120`.

## Latest continuation — FIN-032/033 — 23 November 2026

FIN-001–FIN-031 remain completed in source and must not be repeated. FIN-032 corrects settlement-adjustment reconciliation to use the POSTED transition timestamp and exclude unposted adjustments; FIN-DSH-60 is added. FIN-033 converts all three payment-side refund/settlement SUM(bigint) aggregates through exact PostgreSQL numeric text and BigInt with a safe-integer guard; unit coverage is added. Both findings are IMPLEMENTED / TESTING_PENDING.

**Next implementation:** continue source-first review of payment/refund retry contracts and cross-ledger state/event/outbox parity beyond FIN-033. Keep consolidated Phase 3 testing deferred until implementation and integration are complete.

## FIN-032/033 continuation checkpoint — 23 November 2026

- FIN-032 source: 0c65476d1135d18504ae910083299683fdb8d072; PostgreSQL regression FIN-DSH-60: 39a8ee35e81e919601e49d0564fee023d5a39871.
- FIN-033 source: 633d56a06e073ee416e5b7a989167ef5828f13d8; unit regression: 115b0dab007e4071f6a32ee1e564427a86732249.
- Current exact branch head before documentation: 115b0dab007e4071f6a32ee1e564427a86732249. No GitHub Actions workflow run is attached to this head; combined status contains only Vercel Web/Admin build-rate-limit failures. Tests have not been executed.
- PR #138 remains OPEN / DRAFT / UNMERGED. No migration, shared DB/staging operation, worker activation, deployment or merge.

## Latest continuation — FIN-032–035 — 23 November 2026

FIN-032 corrects adjustment reconciliation posting-period semantics; FIN-033 makes payment-side refund/settlement aggregates exact; FIN-034 restores caller-owned transaction support for PaymentsService.requestRefund; FIN-035 makes return-refund creation and the return state/history/outbox transition atomic. FIN-DSH-60/61 and focused aggregate unit coverage are added but not executed. Do not repeat FIN-001–FIN-035.

**Next:** continue payment/refund retry, idempotency and cross-ledger audit beyond FIN-035. Keep comprehensive Phase 3 tests deferred until implementation/integration is complete.

## FIN-034/035 continuation checkpoint — 23 November 2026

- FIN-034: requestRefund now reuses an optional caller-owned transaction; source commit 2c4b4538cc10e3d4e6217ca56967c89e52657fd8.
- FIN-035: return refund/payment and return ledgers now commit atomically; FIN-DSH-61 injects a return-outbox failure and verifies rollback. Source commit e462c256be710a81e42b2f2d4093d4700abe1818; test commits f5d38d5a4af42ec29fa38040d8ba184e5dcbcdff, 4ad18e1eab3495030c6fff719607b5101337edb4 and ac266c2c365d23c3ef3e58032616bb118d037715.
- FIN-001–FIN-035 are implemented in source; tests are pending consolidated Phase 3. Current branch head before docs: ac266c2c365d23c3ef3e58032616bb118d037715. No exact-head Actions run; Web/Admin statuses are external Vercel build-rate-limit failures.
- PR #138 remains OPEN / DRAFT / UNMERGED. No shared DB/staging operations, migrations, worker activation, deployment or merge.

## Exact latest branch checkpoint — 23 November 2026

Branch: remediation/phase-0-1-tenant-security. Exact HEAD: 56e583338bfe405009e74cab6630626108d5ec96. PR #138: OPEN / DRAFT / UNMERGED, head matches this SHA, base develop. Exact-head GitHub Actions workflow lookup returned no run. Combined status contains only Vercel Web/Admin build-rate-limit failures; these are external preview-provider statuses, not application tests. FIN-001–FIN-035 source changes are implemented; regression tests remain unexecuted pending consolidated Phase 3. No migration/shared DB/staging operation, grant/RLS change, worker activation, deployment or merge.

## Live continuation checkpoint — 23 November 2026

- Current source/test commit: d84489f185cfc864074406f0c9029bc28f40dc94 (FIN-036); PR #138 remains OPEN / DRAFT / UNMERGED against develop.
- FIN-001–FIN-035 are implemented; FIN-036 adds locked payment/refund/return lineage and exact amount validation before return finalization. FIN-DSH-62 is added but not executed.
- CI #1449 on prior memory head 3b87fc9985fcbb96081a5affccd303a598591cd9 failed API TypeScript typecheck. Lint and Flutter passed; dependent API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container, contract and k6 jobs were skipped. Vercel Web/Admin failures are external preview build-rate-limit statuses.
- Typecheck blockers were addressed in 8f4962a16b4e14ddd5af590377ca2686f9e90fe4 and a follow-up source correction in 988b2fcd468f38c70c0f8910534640e5f2ca6151 fixed malformed newline insertion and nullable orgId handling in both RUNNING/FAILED reconciliation inserts. FIN-036 source and regression test are in d84489f185cfc864074406f0c9029bc28f40dc94. These commits use [skip ci]; no exact-head verification is claimed.
- **Next:** continue source-first payment/refund/settlement lifecycle and cross-ledger audit beyond FIN-036. Do not repeat FIN-001–FIN-036. Consolidated Phase 3 testing remains deferred until implementation is complete.
- G-001 remains PARTIAL pending independent security review; G-002 remains IN PROGRESS pending protected runtime identity/catalog evidence and reviewed RLS design. PR #138 must remain draft and unmerged. No shared DB/staging writes, migrations, grants/default-ACL changes, RLS enablement, worker activation, deployment or merge.

## Latest continuation checkpoint — FIN-037 through FIN-040 — 23 November 2026

**Live workstream:** SCS Platform / Phase 0–1 tenant and financial correctness remediation. Re-read the live PR #138 and branch head before continuing; the checkpoint below records the latest implementation/test commits, not permission to merge or deploy.

- Repository: nabeel2323/scs-platform
- Working branch: remediation/phase-0-1-tenant-security
- PR: #138, against develop, still OPEN / DRAFT / UNMERGED at the last repository check
- Latest source/test commit in this batch: b63376cf26240d3dc21b6f26782158a09674c1c7
- FIN-037 source/test: 7be49a0420432d4e31733b77ee2c3042e738d242
- FIN-038 source/test: 89757383fd53dcb69d2c753f134aaf39d1b47bbc
- FIN-039 source/test: 4020853e3a51386f56e57b41b501a3060f680e82
- FIN-040 source/test: 6a4e0edccab8cdd0dfa250fa3b950ab62a206a63

### Completed in this continuation

FIN-037 synchronizes failed return-refund transitions across payment and return ledgers. The failure now marks the linked refund FAILED, appends PAYMENT_REFUND_FAILED and payment.refund_failed, and writes the return state/history/outbox in one payment → refund → return locked transaction. Retrying from REFUND_FAILED reopens the same logical refund row to REQUESTED only after the remaining refundable balance is revalidated; one refund row is retained. PostgreSQL FIN-DSH-63/64 cover failure/retry and transaction rollback.

FIN-038 makes approveRefund idempotent after a committed SUCCEEDED state. Concurrent retries return the existing result without duplicating payment history or outbox; FAILED and other invalid states remain conflicts. FIN-DSH-65 covers the concurrent duplicate command.

FIN-039 makes markSettlementPaid idempotent for a PAID settlement only when the submitted payment reference matches the committed reference. A mismatched reference remains a conflict. The existing FIN-DSH-17 concurrency test now expects both identical commands to succeed while persisting one event and one outbox message.

FIN-040 extends reconciliation to detect legacy cross-ledger divergence for both REFUND_FAILED returns linked to non-FAILED refunds and REFUND_PENDING returns linked to FAILED refunds. It uses the matching current-state event timestamp with a created_at fallback for legacy rows. FIN-DSH-66 covers both mismatch directions.

### Current verification and restrictions

All new regression tests are added but **not executed**. The source/test commits use [skip ci] under the recorded implementation-first cadence. Do not claim exact-head CI success. No migration, shared/staging database write, RLS/ACL change, background worker activation, provider call, deployment or merge was performed. Keep PR #138 draft until the recorded G-001/G-002 evidence gates and consolidated Phase 3 test campaign are complete.

**Next task:** continue a source-first audit of settlement/refund/payment event-history and transactional outbox parity, including legacy retry and adjustment paths. Keep implementation moving in grouped commits; defer the consolidated Phase 3 campaign until implementation is complete. Always recheck exact PR head and CI before the next change.

### FIN-040 follow-up — latest-event period attribution

The FIN-040 parity query was tightened after review: it now aggregates the **latest matching return-state event** and applies the accounting period filter to that event, with created_at fallback only when no matching state event exists. The FIN-DSH-66 regression now proves that an old REFUND_PENDING event from the prior month does not leak into that month's reconciliation after a later re-entry in the current month. Follow-up source/test commit: b63376cf26240d3dc21b6f26782158a09674c1c7.

**Latest source/test head:** b63376cf26240d3dc21b6f26782158a09674c1c7. The tests remain unexecuted under the deferred consolidated Phase 3 plan.

### FIN-041 — settlement-adjustment posting replay and currency integrity

**Status: IMPLEMENTED / TESTING_PENDING.** postAdjustment now treats a replay of a POSTED adjustment as an idempotent success only when its adjustment settlement ledger row exists. The ledger row stores adjustmentId, parentSettlementId and postedBy in metadata, and the lookup retains a notes-based compatibility path for existing posted rows. Posting also rejects an adjustment whose currency differs from the primary settlement and verifies the primary settlement store still matches the sub-order. FIN-DSH-67 covers same-adjustment replay, one ledger row/one outbox event, and currency mismatch rejection. Source/test commit: ad61d75b909341dd2936e03dbc592b0d244d9f72.

**Next source audit:** continue settlement adjustment lifecycle/outbox/reconciliation parity, including primary-settlement terminal-state interactions and adjustment ledger discoverability. Do not start consolidated Phase 3 tests until implementation audit is complete.

### FIN-042 — pay posted adjustment ledger rows

**Status: IMPLEMENTED / TESTING_PENDING.** The adjustment posting workflow creates a separate settlement ledger row with status ADJUSTMENT. The common markSettlementPaid path previously accepted only CALCULATED/DUE, so posted adjustment credits/debits could not be marked PAID through the audited payout flow. ADJUSTMENT is now an explicit settlement status and is accepted by the same row-locked payment transition, which persists PAYMENT_SETTLEMENT_PAID and payment.settlement_paid. Same-reference retries remain idempotent. FIN-DSH-68 added. Source/test commit: a6dc0c50ee83d1f397b982084e338b142d89b62e.

Next: continue source-first audit of settlement adjustment listing/reconciliation and verify adjustment rows remain separate from primary settlement calculation. Tests remain deferred to consolidated Phase 3.

### FIN-043 — primary settlement lookup excludes adjustment ledger rows

**Status: IMPLEMENTED / TESTING_PENDING.** After FIN-042 made posted adjustment rows payable, a paid adjustment could become the newest settlement row for its sub-order. calculateSettlement previously selected the newest row without distinguishing primary from adjustment ledgers, so a later calculation could return/conflict on the adjustment instead of resolving the primary settlement. The lookup now excludes rows carrying adjustmentId metadata and legacy rows with the stable posted-adjustment note prefix. FIN-DSH-68 now asserts that recalculation after an adjustment payout still resolves the original primary settlement. Source/test commit: 6e336fbbe6e71a0c21ee8e81150eadfd769cc6f0.

Next: audit settlement listing and reconciliation projections for primary versus adjustment rows; then finish source audit before consolidated Phase 3 tests.

### FIN-042/043 test assertion follow-up

FIN-DSH-68 now selects payment_record_id directly from the posted adjustment ledger row for its PAYMENT_SETTLEMENT_PAID history assertion; this is a test-only clarity correction. Commit: 74eef0fa36611dd7352436e8d2b7fd048ca7efc2. No behavior change. Test remains unexecuted.

## Live correction — 23 November 2026, financial continuation

This live checkpoint supersedes any older SHA or FIN-031 starting-point text retained in the historical checkpoint sections above. The branch currently contains FIN-041–FIN-043 and the subsequent adjustment-lineage/UI fixes; always refresh the live branch ref before acting.

- Live source checkpoint before this memory sync: `62bf7cf1991ff7974a8762c0e57eea148fcc53b4`; this source batch is followed by a documentation-only checkpoint commit.
- PR #138 remains OPEN / DRAFT / UNMERGED against `develop`.
- FIN-044 closes the follow-on issue where a paid adjustment could be selected as the parent of another adjustment. Both adjustment posting and primary settlement calculation now exclude metadata-linked and legacy notes-prefixed adjustment rows.
- Adjustment payout preserves the legacy notes marker so rows without metadata remain distinguishable after transition to PAID.
- Admin Settlements now has an ADJUSTMENT filter/status treatment and allows the existing Mark Paid action for ADJUSTMENT rows.
- FIN-DSH-68/69 extends PostgreSQL coverage for legacy marker retention and multiple adjustment parent linkage; Admin recovery coverage includes adjustment payout visibility. These tests are added, not executed.
- No exact-head Actions run is claimed. The previous Vercel contexts pointed to the external build-rate-limit page. All implementation commits in this batch use `[skip ci]` under the recorded consolidated-testing cadence.
- Next: continue source-first audit of merchant settlement projections, admin reconciliation/report exports and ledger visibility; then complete implementation audit before the consolidated Phase 3 test campaign.

## Live correction — 23 November 2026, FIN-045/046

This checkpoint supersedes earlier next-action notes that only called for a generic settlement-list audit. Current source commits after the FIN-044 checkpoint are:

- `23fc0f5f6cfd017c281e498a0843b11e82ca0a3e` — FIN-045: reconciliation determines adjustment accounting semantics from durable metadata/legacy marker, not mutable status. FIN-DSH-36 now pays the commission-reversal adjustment before reconciliation; unit coverage covers PAID adjustment and primary rows.
- `4615e05bb0c0df98ec2015387262a146bc13f6a4` — FIN-046: adds a read-only merchant Settlements page backed by the existing org/store-scoped merchant settlement endpoint; adds store/status filters, payout references and explicit ADJUSTMENT · PAID labeling. Admin settlement types/UI also label paid adjustments distinctly.
- `3373c36930744c911300699b770d05c4428a313c` — merchant page dependency and test fixture correction.
- Tests added/updated but not executed. Implementation commits use `[skip ci]`; no exact-head Actions pass is claimed.
- PR #138 remains OPEN / DRAFT / UNMERGED. No deployment, migration or shared database operation was performed.
- Next: continue source-first review of settlement listing limits, accounting exports and any aggregate financial KPIs that may include both primary and adjustment ledger rows. Preserve explicit adjustment identity and avoid double counting.

## Live continuation — 23 November 2026, settlement pagination

- Repository: nabeel2323/scs-platform; branch: remediation/phase-0-1-tenant-security; PR #138 remains OPEN / DRAFT / UNMERGED against develop.
- Source implementation commit: ee6bf2f84803f2eb1f80ae931d9415923a760ff3 — FIN-047 settlement history pagination. Admin and merchant settlement endpoints now accept validated limit/offset, default to 25 rows and cap each request at 100. Responses contain data, total, limit, and offset; ordering uses createdAt plus id for stable page boundaries. Merchant count and row queries share the same org/store/status scope.
- Admin and Merchant settlement screens now have Previous/Next controls and total/page indicators. Store/status filter changes reset the page; Admin moves back one page when marking the last visible row paid.
- Added API pagination parsing/service scope tests and Admin/Merchant page-navigation regression tests. These are added but NOT EXECUTED. No test, typecheck, build, or lint pass is claimed.
- Reporting audit found no settlement-ledger export consumer in the reviewed Admin/Analytics paths. Admin revenue KPI remains order-total sourced (orders.total_minor), so it is not a sum of primary plus adjustment settlement rows. Do not change KPI semantics without a product decision.
- [skip ci] was used under the existing consolidated-testing cadence. No exact-head Actions run is claimed; prior Vercel Web/Admin contexts were external build-rate-limit failures. Refresh status at the next session.
- No schema migration, shared/staging DB write, environment mutation, deployment, worker activation, RLS/ACL change, merge, or PR promotion occurred.
- Audit closure: inspected Admin/API/Web settlement consumers, the reconciliation consistency query and KPI/report surfaces. No settlement-ledger export consumer or primary-plus-adjustment aggregate was found. Reconciliation reads each settlement row for period/currency consistency rather than aggregating ledger totals; Admin revenue remains based on completed order totals grouped by currency. The settlement-adjustment approval queue is a separate workflow, not a settlement-history consumer.
- Verification result: CI #45245048568 on `d81f16cb2bab97c9896ead6ce7edb9bb8e92e63b` passed lint, typecheck and Flutter analyze/tests. The required `format:check:changed` step failed on 279 files and stopped downstream API coverage, PostgreSQL integration, Web/Admin, migration, boundary, contract and build jobs. Vercel Web passed; Vercel Admin is rate-limited. Do not claim the financial tests passed. Next: inspect the 279-file formatter list and resolve the formatting gate in a grouped cleanup without disabling required checks; then rerun one consolidated campaign. Keep PR #138 draft and do not merge/deploy until release gates pass.

## Historical checkpoint — before settlement pagination

## Final live checkpoint — 23 November 2026

Live branch/PR/CI reconciliation immediately before this documentation sync:

- Repository: `nabeel2323/scs-platform`
- Branch: `remediation/phase-0-1-tenant-security`
- Last verified branch head before this documentation-only sync: `615becfe8b1b9f14407e8872bb26a2e51ec790af`
- Latest source implementation commit: `3373c36930744c911300699b770d05c4428a313c`; FIN-045 source: `23fc0f5f6cfd017c281e498a0843b11e82ca0a3e`.
- PR #138: OPEN / DRAFT / UNMERGED, base `develop`.
- Exact-head workflow lookup: no GitHub Actions workflow run returned. Combined statuses: Vercel Web and Admin FAILURE, both linking to the provider build-rate-limit page. These are not application test results.
- All tests described in the FIN-044–046 continuation are added/updated but unexecuted. No CI pass is claimed. Implementation and docs commits use `[skip ci]` under the agreed consolidated-testing cadence.
- Next: audit the 100-row settlement listing cap, exports and any financial aggregates that could combine primary and adjustment ledger rows. Existing Admin revenue KPI is order-total sourced; it is not a settlement ledger sum. Keep PR draft and all shared/staging/deployment restrictions in force.

## Current exact source pointer

Newest implementation commit: ee6bf2f84803f2eb1f80ae931d9415923a760ff3. The following memory sync commit is documentation-only. Read the FIN-047 entry above before continuing.

## CI #45243772955 — first consolidated verification findings

- Exact head `c036e7a483f634c9fad537c50fc8fc9dddb851a0`; lint passed.
- Workspace typecheck failed on two legacy Admin test mocks still returning an array from `fetchAdminSettlements` and one `metadata.adjustmentId` index-signature access. The mocks now use the paginated response shape and the UI uses bracket notation.
- The earlier run #45243520666 on `86dbe607435d08f9e9ad483c1813ca52004df00a` was cancelled by the subsequent push after its lint failure on an invalid escaped template literal in the P13 financial-dispute PostgreSQL spec; that source syntax was corrected in `c036e7a`.
- No test suite result is claimed from #45243772955 until all jobs complete; exact-head rerun is required for the TypeScript fixes.

## Live continuation — FIN-047 verification follow-up (23 November 2026)

- Exact branch head: 3ef930973014bdb43e10a62c337a61831835c174; PR #138 remains OPEN / DRAFT / UNMERGED against develop. No merge or deployment.
- Formatting remediation: CI #45257284797 passed the changed-file Prettier gate, lint, and workspace typecheck. Flutter analyze and Flutter tests also passed. The broad formatting cleanup is grouped in 312e7d39044ea9ce412675a9bdbf68992776eec4; two remaining files were formatted in 11a6f5998fa6b21c70737a4a55a2b4e4a59f2a27. Temporary one-time formatting workflows were removed in b9926463886b778e87bde60895690e2d6dbad8b8.
- The consolidated CI run #45257284797 is still in progress at this checkpoint. Boundary Lint failed with 14 cross-module import violations against its 193-entry reviewed baseline (206 current violations); the same 14 findings were present on the preceding run. Migration Full Apply failed its read-only access audit because role scs_audit lacks SELECT permission on _migration_log. Neither failure was bypassed or baselined.
- Web test job failed with 9 unrelated existing tests across buyer self-service recovery, buyer route hydration, merchant returns, and product-studio progress/flow (6 failing files, 31 passing files; 212 tests passed, 9 failed). Merchant settlement recovery passed all 5 tests. The job stops at the Web suite, so Admin recovery tests have not yet run in this CI attempt.
- API pagination parser tests (15) and payment controller/tenant-scope tests (4) passed in CI #45250855722. The merchant settlement recovery suite passed 5/5. API coverage and PostgreSQL integration jobs in #45257284797 were still running at this checkpoint; do not claim them passed.
- The touched outbox-dispatcher test exposed a case-sensitive SQL assertion against PostgreSQL's uppercase NOT LIKE; corrected to compare lowercased SQL in commit 3ef930973014bdb43e10a62c337a61831835c174. The latest CI run is the exact-head recheck for this correction.
- FIN-047 remains IMPLEMENTED / TESTING_PENDING. Do not merge/deploy. No migration or shared/staging DB write, environment mutation, worker activation, RLS/ACL change, or production operation was performed.
- Next: finish collecting CI #45257284797 API coverage and PostgreSQL integration results; run the Admin settlement recovery tests independently because the Web suite currently fails before Admin is reached; then address the 14 modular-boundary violations and _migration_log audit grant through their proper owners/reviewed changes. Do not change test expectations or weaken gates to hide failures.

## Post-format continuation — 23 November 2026

PR #138 remains OPEN / DRAFT / UNMERGED on `remediation/phase-0-1-tenant-security`. Source/test checkpoint: `954200f9bf7866aa2f25d0585847a0c51eb19259`. Formatter commit: `4477ebd42ba46146b14df18094d025ab133c5d75`.

CI #45260954714 tested source checkpoint `954200f9bf7866aa2f25d0585847a0c51eb19259` and concluded FAILED at changed-file Prettier. Install, lint and workspace typecheck passed; Flutter analyze/tests passed. API unit/coverage, PostgreSQL integration, migration, boundary, contract, Web/Admin, build, container and k6 jobs were skipped behind the formatting gate. The failure is historical for that pre-format SHA; Prettier corrections were subsequently applied and checked in bot commit `4477ebd42ba46146b14df18094d025ab133c5d75`. No application-test result is claimed from #452609.

The formatter commit applies Prettier to the previously flagged source and handoff files. A new exact-head CI run is still required. FIN-047 stays IMPLEMENTED / TESTING_PENDING. Do not merge, deploy, change database grants/RLS, apply migrations or activate workers. The next work is to inspect the new CI, then resume the proper G-015 module-contract refactor and G-002 source evidence.

## Current handoff pointer — 23 November 2026

- Active PR: #138, OPEN / DRAFT / UNMERGED to `develop`.
- Branch: `remediation/phase-0-1-tenant-security`.
- Source/test correction checkpoint: `954200f9bf7866aa2f25d0585847a0c51eb19259`.
- Formatting commits: `4477ebd42ba46146b14df18094d025ab133c5d75` and `e663973d55d655b1a1a43439cbe728613e7f7f38`.
- CI #45262860596 tested the earlier documentation head `158a7d64a188ab98ebfa8248da1c964c2a5391d2`. The required Prettier gate failed on eight handoff files; lint and typecheck passed, Flutter passed, and all dependent application jobs were skipped. The second formatter pass corrected those files. Do not claim the earlier run as verification of the latest head.
- Next: inspect exact-head CI after this handoff update. FIN-047 remains IMPLEMENTED / TESTING_PENDING. The 14 G-015 boundary findings remain un-baselined. Preserve all G-002 database, staging and release restrictions.

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

1. Continue implementation and cross-component integration; do not run tests, formatter, lint, typecheck, E6 or CI during this phase.
2. Continue G-002 route/worker/system context coverage only after source review of guard ordering, nested transactions, detached async work, streaming, external I/O and module provider wiring. Keep the interceptor opt-in and controller/method scoped.
3. Close remaining implementation gaps and update the 193-entry baseline only if new source evidence justifies it; do not create schema re-export barrels.
4. Keep FIN-047 at IMPLEMENTED / TESTING_PENDING and other findings at their evidence-backed statuses. Begin the consolidated test/CI campaign only after implementation and cross-component integration are complete. G-001 independent review and G-036 focused security verification remain open; Phase 6 remains NOT STARTED.

No migration, database grant/default-ACL change, RLS enablement, shared/staging database write, deployment, worker activation, merge or release was performed. PR #138 remains draft and unmerged.


## Latest G-002 actor-context rollout — 24 November 2026

The live branch checkpoint at this update is `78d0475a7fcdbea6aca848a46236e5f536a4a796`. The opt-in DatabaseService actor-context primitive uses typed user/anonymous/worker/system/bootstrap/audit identities, transaction-local PostgreSQL GUCs, AsyncLocalStorage-backed Drizzle routing, same-actor nested reuse and an expired-scope fence. The interceptor is explicitly controller/method scoped, never global.

The reviewed route allowlist currently covers bounded JWT-protected Notifications, Pricing, Store Membership, Promotions, Reviews/Disputes, Inventory, Analytics, Catalog Offers/Requests/Taxonomy, selected Catalog and Admin read handlers, bounded Profile/device handlers, Cart, Returns and Organizations/Roles operations. Each additional route must be added only after reviewing the service call graph, transaction behavior, detached async work and external-I/O lifetime.

AuthController, credential setup/password-change Profile handlers, file/import/upload, main Orders/Payments, carrier/shipping, bootstrap, deferred audit writes, workers/schedulers, realtime sockets, CLI and migrations remain outside the first rollout pending explicit principal/transaction contracts. G-002 remains IN PROGRESS; no tests/CI, RLS, shared database changes, migrations, staging actions, deployment or worker activation occurred.

**Standing user instruction:** finish implementation and integration first; do not run tests or CI until that work is complete. Continue autonomously without asking for approval for routine steps.


## Latest G-002 Orders/Merchant context expansion — 24 November 2026

The current source checkpoint is `12ae73c7ddc6dd3e59485918ada316b7088cdd3b`. Orders uses user actor context for bounded master/sub-order reads, status history, tracking, order lists and driver shipment lists, checkout preview, reorder and DB-only lifecycle actions (accept, partial accept, item confirmation, status transition, prepare, ready, driver assignment, pickup, out-for-delivery, deliver and delivery confirmation). Reject/cancel and actual checkout remain excluded because they may invoke payment/refund/provider workflows.

Merchant uses actor context for bounded store/customer/warehouse/verification reads and store/warehouse/verification writes. Document listing/presign and file upload operations remain excluded until DB metadata access is separated from storage I/O.

ShippingCarrierWorker scopes its direct DB operations and supporting tenant/credential lookups to a worker actor; carrier API and object-storage operations remain outside the DB transaction. Carrier webhook processing is credential-scoped only after HMAC authentication. Realtime room authorization, bootstrap, deferred audit writes and the bounded worker set are also scoped.

**Standing user instruction:** finish implementation and integration first; do not run tests or CI until that work is complete.

## Identity session/device route reconciliation — 24 November 2026

A follow-up controller audit confirmed that ProfileController's session list, revoke-by-device, trusted-device list and trusted-device revoke handlers already carry `TenantDatabaseContextInterceptor`. The interceptor derives the actor from the verified JWT after guards and scopes the complete awaited handler. These routes were therefore already covered; no redundant service-level wrapper or controller signature change was added. Credential setup/change remain explicitly scoped inside IdentityService because those handlers intentionally stay outside the interceptor for bcrypt separation.

## Payments DB-only mutation route actor context — 24 November 2026

Source commit: `22f14b0e14bf8ca8ddd2eb578b59d3f3ae5f9b50`.

Added the verified user actor interceptor to four Payments POST handlers whose inspected service call graphs perform database transactions, append payment events and write outbox rows without calling payment/refund providers or object storage: COD cash confirmation, bank-transfer proof verification decision, settlement calculation and settlement-paid recording. Existing permission guards, service-level object/store authorization, row locks, optimistic state predicates and transactional outbox writes remain authoritative. The actor context wraps the complete awaited method; nested Drizzle transactions remain inside that scope.

Explicitly excluded: bank-transfer proof upload (object storage), refund request/approval/retry (refund lifecycle), payment-provider operations, checkout and order cancellation/rejection paths. The controller metadata test now covers 12 Payments routes (eight GET and four DB-only POST); it remains unexecuted.


## Latest continuation checkpoint — 24 November 2026

- Live repository: nabeel2323/scs-platform; active branch remediation/phase-0-1-tenant-security; PR #138 remains OPEN / DRAFT / UNMERGED against develop.
- Latest source/documentation implementation commit before this memory refresh: bccb8c569d122c7b1479881aa162fb428f264c4e. It adds verified-user actor context to the three DB-only Merchant document metadata handlers and adds an unexecuted controller-metadata regression spec.
- Merchant document registration and organization/store listing are now scoped. Upload/download presign handlers remain outside the request transaction because they call object storage; download presign also persists the generated URL and needs a separate DB/storage phase split.
- Exact-head GitHub Actions lookup for bccb8c569d122c7b1479881aa162fb428f264c4e returned zero workflow runs and zero status contexts. The commit uses [skip ci] as required during implementation. No tests, formatter, lint, typecheck or E6 were run.
- Next implementation slice: continue the source-level Orders reject/cancel/payment-provider boundary review. Keep refund/provider workflows outside DB actor transactions; split only proven DB-only phases and do not wrap a complete handler if it awaits or emits external effects before commit. Then complete Merchant presign metadata/storage separation and the G-002 ownership/runtime evidence matrix.
- All protected staging, shared database, migration, grants/default ACL, RLS, deployment, worker activation, no-merge and no-release restrictions remain unchanged.


## Live GitHub reconciliation — 24 November 2026, 09:45 UTC

The live PR #138 HEAD at this checkpoint is `2cff7c0f6604d6918b00efb190abd96d301149e1` on `remediation/phase-0-1-tenant-security`, OPEN / DRAFT / UNMERGED to `develop`. Exact-head GitHub Actions lookup returned zero workflow runs. Combined statuses show Vercel Web SUCCESS and Vercel Admin FAILURE with the provider build-rate-limit URL; these are preview statuses, not application-test evidence. The latest source implementation is `bccb8c569d122c7b1479881aa162fb428f264c4e`; `2cff7c0` is documentation-only. Query live GitHub again before the next implementation action.


## Latest implementation continuation — 24 November 2026

Latest source implementation checkpoint: `ff8e4aebee01631023fad76eec9a8d98c254108b` (formatting follow-up to `55910f043360b5e89103fd1ccbe5be6085a14e78`). The Orders cancellation DB-only phases now use service-level user actor contexts; realtime is emitted only after commit, and master-order recalculation/final read use a second context. Merchant document metadata source commit: `bccb8c569d122c7b1479881aa162fb428f264c4e`. Merchant rejection/refund and checkout remain excluded. Exact-head Actions lookup at this checkpoint returned zero workflow runs; Vercel Web/Admin both reported external build-rate-limit failures. No tests or quality gates were executed. Next: safely separate rejection/refund orchestration and Merchant download-presign metadata/storage phases; complete G-002 ownership/runtime evidence.


## Latest continuation — G-002 Orders rejection and Merchant document presign

The latest source group extends bounded actor-context rollout to merchant order rejection and document download presigning (commit 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1). The rejection transaction includes stock settlement, optimistic status flip, history and outbox; refund request persistence is a separate idempotent DB phase, with provider execution left to the worker. Document presigning uses short actor contexts before and after storage signing. Regression specs are authored but unexecuted. G-002 remains IN PROGRESS / NOT VERIFIED.


## Live GitHub reconciliation — 24 November 2026

- Repository: nabeel2323/scs-platform. Branch: remediation/phase-0-1-tenant-security.
- PR #138 is OPEN / DRAFT / UNMERGED against develop. Exact current HEAD: 84f57fd368ae0472251133adaa8029b01b777b49.
- Latest source implementation commit: 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1. Latest remediation-plan/progress and project-memory sync commit: 84f57fd368ae0472251133adaa8029b01b777b49.
- Exact-head GitHub Actions lookup returned zero workflow runs. Combined status reports Vercel Admin and Vercel Web FAILURE with the provider build-rate-limit URL. These are external preview-provider statuses, not application test outcomes.
- The latest source group scopes Orders rejection DB phases and Merchant document download-presign metadata phases; two regression specs are authored but unexecuted. No formatter, lint, typecheck, E6 or CI was run. G-002 remains IN PROGRESS / NOT VERIFIED.
- No merge, deployment, worker activation, RLS, migration, grant/default ACL change or shared/staging database action occurred. All standing restrictions remain in force.


## Refund-provider execution boundary correction — 24 November 2026

The merchant-rejection flow creates a refund REQUESTED row, payment event and outbox record only. Source inspection of OutboxDispatcher.dispatch confirms generic events are currently logged and marked dispatched; this does not invoke a payment-provider refund. Automatic refund-provider execution is not implemented by this slice and remains outside the approved scope (no automatic gateway/payout expansion or worker activation). The durable refund request is still available for the existing review/approval workflow. Merchant-initiated rejection refunds now attribute requestedBy/paymentEvents.actorId to the authenticated merchant; PaymentsService permits the special MERCHANT_REJECTION reason only when the caller has a MERCHANT_* role and assertOrderAccessible confirms the order is in the caller's active organization. The service no longer impersonates the buyer for audit attribution.


## Exact-head reconciliation — 24 November 2026 (latest continuation)

- Repository: nabeel2323/scs-platform; branch: remediation/phase-0-1-tenant-security.
- PR #138: OPEN / DRAFT / UNMERGED; base develop; exact branch/PR HEAD ec2998abb0ff5fbb9208d66558b4dde309f672bc.
- Source change group: 7e2b2509292cfbcfe6f1f12ebae8d2fad25f8cf1 (Orders rejection + Merchant download-presign); 733b0570c9ae4e94a9684ff28b30cbd3f77ec038 (merchant rejection refund actor attribution and special-reason authorization); df976de9db9c68c04885f106373c072334a9906b (outbox boundary comment). Regression specs were added/updated in the same group and remain unexecuted.
- Documentation/progress updates include 17dcad59ea2b8bf636eca43b58d0c0a98c452976, 84f57fd368ae0472251133adaa8029b01b777b49, fa06d4709367e29a256fa0373fa6fbc42361dac6 and 7663d692fd0f32a3760e07980b4a232e3ab900fb. Latest small test-fixture role correction is ec2998abb0ff5fbb9208d66558b4dde309f672bc.
- Exact-head GitHub Actions lookup: zero workflow runs. Exact-head combined status: zero status contexts. Prior source checkpoint 7663d69 showed Vercel Web/Admin build-rate-limit failures; those prior statuses are not current-head evidence.
- No tests, formatter, lint, typecheck, E6 or CI were run. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.
- Refund boundary: rejection creates a durable refund request/payment event/outbox record only. The generic OutboxDispatcher currently logs events and marks them dispatched; no payment-provider refund is executed by this path. Automatic provider execution remains outside the approved scope.
- No merge, deployment, worker activation, RLS, migration, grants/default ACLs or shared/staging database action occurred.


## 24 November 2026 — worker/socket actor-context map reconciliation

The G-002 method-level map was reconciled against current source. ReturnExpirationWorker, ShippingCarrierWorker and RealtimeGateway now have explicit actor-context adoption recorded; AutoCompleteWorker, OutboxDispatcher, AuditLogMiddleware and CarrierTrackingPoller are also source-reviewed. External carrier API, label HTTP and object-storage I/O remain outside actor transactions. This is source evidence only; the physical table/operation matrix, actual runtime identities and protected read-only catalog audit remain open.


## 24 November 2026 — G-002 Identity/Merchant table ownership detail

The G-002 ownership matrix now records schema-backed direct columns and declared parent paths for 11 Identity tables and five Merchant tables. It distinguishes the global RBAC reference tables, user-private session/device/audit rows, organization-owned stores, store-inherited warehouses, dual-parent documents/verification requests, and store/user membership relationships. The matrix remains candidate evidence only; live catalog constraints and per-operation policy readiness are not asserted.


## 24 November 2026 — G-002 Catalog table ownership detail

The table ownership matrix now includes schema-backed direct columns and declared parent paths for 24 Catalog/Search/Import tables. Shared/global taxonomy, nullable shared products, merchant offer ownership, child inheritance, user-owned bookmarks, merchant imports, platform catalog imports and mixed search query scope are explicitly distinguished. Multi-parent consistency checks remain required where composite FKs are absent. This remains source evidence, not policy approval.


## 24 November 2026 — G-002 Inventory/Pricing/Promotions/Orders/Shipment table detail

The ownership matrix now includes schema-backed direct columns and declared parent paths for 15 additional Inventory, Pricing, Promotions, Cart, Orders and Shipment tables. It records buyer/store participant visibility, warehouse inheritance, polymorphic references and multi-parent consistency requirements without promoting those to composite FKs.


## 24 November 2026 — full module-schema inventory reconciliation

The G-002 table matrix now includes all 100 `pgTable` declarations found across 25 module schema files. The current schema barrel exports 98; two catalog-import declarations are outside the barrel, and the previously omitted exported `payment_proof_upload_intents` table has been added. The old 99+15=114 relation split is historical, not a current source reconciliation. The protected catalog audit and separate 116 count remain open.


## 24 November 2026 — Payments proof upload actor-context continuation

Payments proof submission now uses short verified-user actor scopes around database-only phases, with object-storage operations outside transactions. Stale upload-intent cleanup uses a worker actor for claims and DB state transitions, with storage head/delete outside. The multipart route remains outside the request interceptor. Focused regression specs were authored but not executed; no cleanup scheduler was activated.


## 24 November 2026 — automatic CI exception recorded

Actions run #1474 (`45376045168`) was automatically triggered by the proof actor-context source commit and failed API Typecheck (Mobile Flutter Tests and API Lint succeeded). The new PaymentsService nullable actor/file/intent type errors were corrected in `fc2993290d4522d397ab56934e41103f8dd9d060`; other failures appeared in interceptor, identity, shipping worker and integration tests, with no baseline to classify them. Run #1475 (`45376830054`) was automatically triggered by the fix and was in progress at this checkpoint. No local tests/typecheck were run; no intentional CI dispatch or rerun is requested. The available GitHub connection does not expose cancellation.


## Final automatic CI result — 24 November 2026

Actions run #1475 (`45376830054`), on source commit `fc2993290d4522d397ab56934e41103f8dd9d060`, completed with Mobile Flutter Tests SUCCESS, API Lint SUCCESS and API Typecheck FAILURE. The typecheck no longer reported errors in `payments.service.ts`; the PaymentsService actor-role and async nullable-value issues from run #1474 were absent after the fix. Remaining reported failures were in `tenant-database-context.interceptor.ts`, `identity.service.ts`, `shipping-carrier.worker.ts`, integration specs (account-linking, device-trust, email-OTP, m723a1 concurrency, registration flows) and unit specs (token revocation and database authentication context). No baseline run was available to classify those as pre-existing.

Unit Tests + Coverage Gates, Integration Tests, Boundary Lint (E6), Container Build & Smoke Test, Web/Admin App Tests, Migration Full Apply, Build, Contract Spec & Codegen, k6 Smoke Test and Trigger Staging Release were SKIPPED. No backend unit/integration or release-gate success is claimed. The two automatic runs were not intentionally dispatched; no further CI rerun is requested. The available GitHub connector has no workflow-cancel action.


## 24 November 2026 — actor-context typecheck remediation

Source commit `c587ed46db9a4893f2fa0167a74e671bc9d3ae10` corrects the interceptor, IdentityService and ShippingCarrierWorker type errors recorded by automatic CI #1475, and updates the affected unit/integration fixtures to pass explicit actor claims and current constructor dependencies. The authentication-context mock transaction callback no longer self-references its own type. Tests and formatting were not run. Actions #1476 was unintentionally triggered by the PR push; no further CI run is intentionally requested. PR #138 remains OPEN / DRAFT / UNMERGED.

## 24 November 2026 — carrier recovery and worker lease actor-context checkpoint

CarrierReconciliationService now uses short worker actor transactions for its claim and persistence phases; carrier tracking/provider calls remain outside transactions. CarrierAdminController scopes recovery shipment reads, tenant/membership checks and recovery-state update under the verified admin actor, then performs external reconciliation after that scope closes. Its audit write uses a separate audit principal. The recovery queue read uses the verified user actor. WorkerLeaseService scopes lease operations under a worker principal and the runbook-only force-expire operation under a system principal. Regression coverage has been added but not executed.

Catalog Import and P13 monitor/alert/control/pilot actor-context adoption are implemented in source through `75890feeffcef6f0035238476dc9242958dd5ec5`. Next: reconcile remaining raw SQL/service/worker access paths, verify actor-scope nesting and callsites, and finish the physical table/operation/ownership-predicate matrix. Regression specs and the deferred verification campaign remain pending.

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

**Next work:** reconcile the complete G-002 operation inventory against all source callsites and exact table/ownership predicates; verify no actor-context switch occurs while a different actor transaction is active; reconcile the 100 current source declarations with the historical 114-relation snapshot (99 declarations + 15 non-Drizzle objects on 19 November) and the unresolved historical 116 count; do not treat source counts as live catalog evidence; validate migration-backed FKs and obtain protected read-only runtime catalog plus actual API/migration runtime identity evidence through the authorized process. Add/adjust regression specs after implementation/integration is complete, then run the consolidated verification campaign. G-001 independent review and G-036 verification remain open; Phase 6 remains NOT STARTED.


## 24 November 2026 — source schema declaration and runtime barrel reconciliation

- The current source contains 100 `pgTable` declarations across 25 module `*.schema.ts` files. `drizzle.config.ts` discovers the module schema glob, while `DatabaseService` constructs its runtime Drizzle instance from `apps/api/src/drizzle/schema.ts`.
- Before this correction, the runtime barrel re-exported only 98 declarations because `catalog-import.schema.ts` (the platform-level `catalog_imports` and `catalog_import_errors` tables) was omitted. Source commit `474ef450d98a62fe3b2f6b480a5dc4ea300d824d` adds the missing barrel export. The runtime schema barrel now includes all 100 source declarations.
- This fixes source/runtime schema discovery alignment only. It does not apply a migration or prove the physical existence of every declared table in any deployed database.
- Keep the 19-November protected catalog snapshot distinct: its 114 public ordinary/partitioned relations were reconciled at that time as 99 Drizzle declarations plus 15 non-Drizzle relations (the migration ledger, backfill audit table and 13 analytics partitions). The current 100-declaration source count is not a replacement live catalog count. Migration 0075's `payment_proof_upload_intents` source declaration must not be assumed present in shared/staging until an authorized live catalog audit confirms it.
- The historical 116 count remains unexplained. A fresh protected read-only catalog audit must compare current relkinds, partitions, extension/system objects and API/migration role visibility. No such query was run here.


## 24 November 2026 — Catalog Import/P13 operation map and schema barrel follow-up

- CatalogImportController passes verified `sub`, `role`, and `activeOrg` into upload, execute, retry, template and export operations. CatalogImportService scopes each DB-only phase to the caller; object storage and XLSX parsing/generation remain outside actor transactions. ExcelExecutor scopes each entity-type transaction. The platform import's `uploaded_by` is actor attribution, not a tenant owner; `catalog_import_errors` inherits its platform import parent through `import_id`.
- P13Monitor cross-tenant diagnostic reads use the dedicated worker principal `p13-monitor`; WorkerLeaseService retains its own worker identity. OpsAlert durable alert-state writes use the alert-service system principal when not already inside a verified actor scope; operator list/snapshot reads use the authenticated admin. OpsControl pause checks use a worker principal, admin control state/history/mutations use the verified admin, and platform audit writes use a separate audit principal. Pilot policy reads use the active verified actor or the explicit system policy principal; admin snapshots and writes use the verified admin and audit writes use the audit principal.
- P13 platform-control tables (`ops_alerts`, `ops_controls`, `ops_control_audit`, `p13_pilot_allowlist`, and `worker_leases`) are platform operational/control data. The pilot allowlist's `org_id`/`store_id` identify the configured target scope; they do not turn the control table into a merchant-owned tenant table.
- Source commit `474ef450d98a62fe3b2f6b480a5dc4ea300d824d` adds `catalog-import.schema.ts` to the runtime Drizzle schema barrel. The barrel now exports all 100 current `pgTable` declarations. This does not prove deployed table presence or apply migration 0075.
- Remaining source work is callsite/nesting audit across the full 53-file candidate set, carrier/bootstrap/CLI/audit middleware and raw SQL DB objects; exact operation predicates and FK evidence; and protected live API/migration identity plus relation-kind inventory. No RLS/grant/migration or shared/staging action is authorized by this source map.


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


## 24 November 2026 — latest live CI/status reconciliation

At the last live check, branch/PR head was `977e837e65fc6639f24610832962c20c766eb55d`. Exact-head Actions lookup was empty. Vercel Web and Admin contexts were FAILURE with “Deployment rate limited — retry in 24 hours.” This is an external preview-provider rate limit, not an application test result. PR #138 remained OPEN / DRAFT / UNMERGED to `develop`. Re-query live HEAD and statuses before continuing after this documentation note.


## 24 November 2026 — stale migration-ledger fail-closed correction

Source follow-up through `6f3327a2039c65fb0f9578202d4bd76c75e7b426` adds a second layer of migration consistency protection:

- Local `migrate.ts` and DatabaseService development bootstrap now refuse to proceed when pg_partman-dependent migrations 0013/0018 are already present in the ledger despite being excluded from the local image. They do not delete ledger rows or attempt automatic repair; the local DB may contain partial state and must be explicitly rebuilt/reconciled.
- The complete `migrate-pg.ts` runner now rejects impossible/stale analytics ledger states: 0018 without 0013, 0013 without the pg_partman extension/config row, or 0018 whose retention values do not match the migration.
- The disposable M7.3 runner refuses to continue if skipped pg_partman migrations already appear in its ledger.
- Local `migrate.ts` uses a unique per-process/per-file temp SQL path and cleans it up, avoiding concurrent runners overwriting the same temporary script.
- Disposable shell verification target guard now also checks `inet_server_addr()` is a Unix socket or loopback address, in addition to explicit test environment, exact DB/user, local PGHOST/PGHOSTADDR and no PGSERVICE redirection.

No database was inspected or repaired, and no tests/CI were run. These are source-level fail-closed checks only.


## 24 November 2026 — migration FK source scan completion

The 75-file numbered migration scan found 183 explicit REFERENCES clauses across 40 migration files; 35 files had none. The detailed migration/count/parent-table appendix is in `docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md`. This completes the static source-reference inventory, not live catalog verification. Remaining: reconcile with Drizzle declarations and protected staging pg_constraint evidence, then finish cross-column ownership consistency decisions (org/store, carrier config/credential/store, payment/refund/order/settlement, shipping driver/store, reconciliation parent/org). No database query was run.


## Latest continuation — financial ownership matrix — 24 November 2026

Latest source commits: `01b6e6c729c1a458f20aaeaed043df4c569119e4` and `fa2547997c4b4dad490b582f92c9a69b8c01ed8f`. These harden cross-column relationships for settlement adjustments and commission reversals; see the matching entry in [WORK-LOG.md](./WORK-LOG.md), [CURRENT-STATE.md](./CURRENT-STATE.md), and the authoritative [G-002 migration FK crosswalk](../docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md).

The next task is to inspect driver-profile/store-assignment organization consistency and reconciliation-run/discrepancy organization inheritance, then complete the remaining financial/shipping cross-column owner matrix. Regression cases are documented but not executed. Do not run tests or intentionally trigger CI until implementation/integration is complete; source pushes automatically queued CI #1503, which was IN_PROGRESS at last observation. All staging/database/RLS/grant/migration/deployment/worker/merge restrictions remain in force. PR #138 remains draft and unmerged.


## Latest source continuation — reconciliation and driver assignment — 24 November 2026

After the financial ownership commits `01b6e6c` and `fa25479`, commit `98843bf` hardens reconciliation organization scope: validates the requested organization exists, checks discrepancy child org against the parent run on reads, and verifies parent scope before resolving a discrepancy. See the G-002 migration FK crosswalk and latest work-log/progress entries.

The next task is to locate the actual consumer/write path for `driver_store_assignments` and `shipments.assigned_driver_id`; the inspected ShippingModule/ShipmentOperationsController does not expose assignment mutations. Do not invent a new endpoint before the full callsite inventory. Then complete remaining shipping/financial cross-column relationships and Drizzle/migration FK reconciliation. CI #1503 failed on the preceding source SHA; no tests/CI were intentionally run for `98843bf`, and follow-up docs/source commits use `[skip ci]`. G-002 remains NOT VERIFIED; all protected staging, shared DB, RLS/grant, migration, deployment, worker, merge and release gates remain binding.


## Latest source continuation — refund lineage — 24 November 2026

Source commit `e9bf293dbdb8bde8ab2a7a409d37c2b411ee5b5d` adds refund order/currency equality checks to approval and idempotent request recovery. Return-refund transitions already validate the full return/payment/order/refund/buyer/currency chain. See the latest G-002 migration FK crosswalk and progress tracker entries.

Next: locate the actual driver/store assignment consumer/write path, complete shipment/order and carrier/shipment cross-column checks, and reconcile Drizzle schema FKs with migrations. Regression cases remain pending; do not run tests or intentionally trigger CI before implementation/integration is complete. G-002 remains NOT VERIFIED and all existing staging/database/RLS/grant/migration/deployment/worker/merge restrictions remain binding.


## Latest source continuation — shipment order/store integrity — 24 November 2026

Commits `b1e5490`, `02edaa8` and `15d328c` enforce same-store order ownership at shipment creation, shipment detail authorization (including platform-privileged reads), and carrier worker processing before provider/storage side effects. The G-002 crosswalk and progress tracker document the exact invariant and regression cases.

Next: locate the actual driver/store assignment consumer/write path and continue the remaining carrier/webhook/shipment relationship audit, then reconcile Drizzle declarations against migrations. Regression tests remain pending and unexecuted; commits use `[skip ci]`. G-002 remains NOT VERIFIED. Preserve all protected staging/database/RLS/grant/migration/deployment/worker/merge restrictions.


## Latest continuation — shipment read paths — 24 November 2026

The shipment/order/store consistency review now covers creation, detail, carrier worker operations, shipment lists/counts, OrdersService exception/RTS access, order-based shipment lookup and driver shipment listing. Source commits include `c916acd` and `56d605a`; see the G-002 migration FK crosswalk and implementation progress tracker for exact behavior and regression cases.

Next: locate the actual driver-profile/store-assignment consumer/write path and complete the remaining carrier/webhook relationships, then reconcile Drizzle schema FKs with migrations. Regression coverage is documented but not executed. Do not run tests or intentionally trigger CI until implementation/integration is complete. G-002 remains NOT VERIFIED; all staging/database/RLS/grant/migration/deployment/worker/merge restrictions remain binding.


## Latest continuation — carrier recovery/webhook/tracking ownership — 24 November 2026

The latest G-002 pass closes additional shipment/order/store cross-column gaps: admin recovery checks the order/store relationship before privileged bypass; recovery queue joins orders; scheduled create/cancel reconciliation claim queries and direct entry points validate same-store ownership; webhook shipment resolution joins same-store orders; tracking poller filters and validates before provider/event/delivery-bridge effects. See the latest G-002 migration FK crosswalk and implementation progress tracker.

Source commits: `0581776`, `83a4073`, `2b2810e`, `5bbd35d`, `9c9d7f4`. Driver assignment table remains schema-only in the inspected ShippingModule; no assignment writer was found, and shipment assignedDriverId references users. Do not invent a new API. Next: finish Drizzle-to-migration FK reconciliation and establish whether driver_store_assignments is legacy/dead or has an external consumer. Regression cases are documented but not executed; commits use `[skip ci]`. G-002 remains NOT VERIFIED; preserve all protected staging/database/RLS/grant/migration/deployment/worker/merge restrictions.


## Latest continuation — webhook retry credential lineage — 24 November 2026

Commit `926c475` ensures every unprocessed credential-bound webhook event revalidates its credential, and an already-linked shipment's store organization must match that credential before processing. Unlinked legacy events without credential binding fail closed; already-linked legacy rows remain compatible with shipment/order/store validation. See G-002 migration FK crosswalk and implementation progress tracker.

Next: complete Drizzle-to-migration FK reconciliation and establish whether `driver_store_assignments` has an external consumer. Do not invent a driver API. Regression tests remain pending; commits use `[skip ci]`. G-002 remains NOT VERIFIED and all protected staging/database/RLS/grant/migration/deployment/worker/merge restrictions remain binding.


## 24 November 2026 — driver assignment eligibility continuation

The current Orders shipment-assignment route has been located and hardened. Driver eligibility now binds the user, active driver profile, DRIVER organization membership and store organization, while preserving migration 0041's unrestricted-within-org behavior when no explicit store rows exist. Regression source was added but not executed. See CURRENT-STATE, WORK-LOG, OPEN-ISSUES, IMPLEMENTATION-ROADMAP, IMPLEMENTATION-PROGRESS and the G-002 migration FK crosswalk for evidence and remaining work. G-002 remains NOT VERIFIED; all protected staging/database/RLS/grant/migration/deployment/worker/merge restrictions remain binding.


## Targeted FK parity continuation — 24 November 2026

The latest continuation added a typed Drizzle self-reference for migration 0062's `reconciliation_runs.superseded_by` FK and documented four migration-owned deferred links in the payment/return schemas. The exact targeted comparison is in `docs/remediation/G-002-MIGRATION-FOREIGN-KEY-CROSSWALK-2026-11-22.md`; implementation progress and handoff details are in CURRENT-STATE, OPEN-ISSUES and WORK-LOG.

Source commits: `b37f3386220b7148f2b326f9fd43b532b201a152`, `ef178d7af0d10b1ef80642aa5f6fe77b37cc55d4`, `e1d73e5270f8a815c537edf97f1ff8cc1d45fac4`. Crosswalk/progress/memory commits are recorded in the work log.

Live GitHub check immediately before this handoff sync: PR #138 is OPEN / DRAFT / UNMERGED to `develop`; branch `remediation/phase-0-1-tenant-security`; head `ba8b900ed03f9985f00f052e94724eb861c413f8`; zero exact-head Actions runs and zero status contexts. This head is a documentation checkpoint and remains unverified. The next task is full table-by-table Drizzle/migration FK reconciliation followed by the remaining ownership and actor-context source audit. Do not run tests/CI during implementation.


## Final live checkpoint — 24 November 2026

The latest verified PR #138 state immediately before this handoff note: OPEN / DRAFT / UNMERGED, base `develop`, branch `remediation/phase-0-1-tenant-security`, head `07eb6b7c60152ca72dd937bc0dd1251003fd583b`. Compare: 2,485 commits ahead / 0 behind. Exact-head Actions runs: none. Combined status: Vercel Web and Admin FAILURE due to provider build-rate limiting only; no application CI result. The next session must re-query live state because this handoff note itself is a documentation commit.

Targeted source changes in this session: reconciliation_runs.superseded_by now mirrors the migration self-FK in Drizzle; the four deferred cross-module/migration-owned FKs (refunds.return_request_id, return_requests.refund_id, return_request_items.inventory_item_id, disputes.return_request_id) are documented in their schema files. Five total omissions were recorded including the self-FK; only the self-FK was brought into Drizzle. This is not full schema parity completion. All tests and CI remain deferred.


## 24 November 2026 — complete source FK parity reconciliation

The G-002 static source comparison now covers all 25 module schema files / 100 `pgTable` declarations and 178 Drizzle `.references()` declarations. Reconciliation of the prior 183 SQL text matches identifies exactly three intentional migration-owned FKs: `products.product_type_id → product_types.id` (taxonomy → catalog dependency), `refunds.return_request_id → return_requests.id`, and `refunds.dispute_id → disputes.id` (payments → returns/support cycles). The other two text matches are not additional effective constraints: migration 0061's `ADD COLUMN IF NOT EXISTS ... REFERENCES` is a no-op after migration 0059 creates the column/FK, and migration 0070 contains the word REFERENCES only in a comment. Thus 183 text matches reconcile to 181 effective SQL FK declarations = 178 Drizzle references + 3 documented migration-owned links.

The three previously corrected links (`return_requests.refund_id`, `return_request_items.inventory_item_id`, `disputes.return_request_id`) and reconciliation self-FK are represented in Drizzle. No SQL migration, schema DDL, database or RLS/grant policy was changed. This is source evidence only; protected live catalog validation remains pending. G-002 remains IN_PROGRESS / NOT VERIFIED. Next: finish operation-level ownership predicates and direct DB/actor-context audit, then add regression coverage and run the consolidated verification after implementation/integration is complete.


## 24 November 2026 — Orders cancel/reject actor-context fail-closed correction

The `POST /orders/:id/cancel` and `POST /orders/:id/reject` routes intentionally use service-level actor boundaries rather than a blanket controller interceptor. The service scopes database-only work and keeps post-commit realtime emission outside the transaction; rejection also scopes its separate refund-persistence phase. A supplied caller object missing a non-empty `sub` or `role` previously fell through to unscoped DB work. Both helpers now fail closed with `ForbiddenException` before DB access; only an absent caller argument preserves the trusted internal-call path. Four unit regression cases cover missing subject/role for both operations. Tests remain unexecuted. Do not add a controller interceptor without re-reviewing the split side-effect boundaries.


## Catalog controller actor-context pass — database-only mutation routes (24 November 2026)

A route-to-service call-graph review found a set of database-only catalog mutations that had no controller interceptor and no service-level `withActorContext`. Added `TenantDatabaseContextInterceptor` to 23 verified DB-only mutation routes: category create/update/delete; brand create/update/deactivate; product create; product governance submit/withdraw/publish/unpublish; product/variant typed attribute writes; variant create/update and bulk operations; bulk product operations; media reorder/remove; import-job create/mapping/cancel/retry. Added a metadata regression spec asserting the interceptor is attached to every listed handler.

The request-wide interceptor was deliberately not added to mixed/long-running routes: product update/delete (cache invalidation, outbox/audit work), media add (storage-backed URL resolution), staged-row upload/processing/preview (Redis/object storage and chunk processing), and CSV error export. These require short service-level actor scopes around each DB phase; wrapping the entire request would hold a DB transaction open across external I/O or long-running processing. These mixed paths remain open follow-up work and must not be treated as actor-context complete.

No tests, formatter, lint, typecheck, E6 or CI were run. G-002 remains IN_PROGRESS / NOT VERIFIED.


## Catalog media mutation actor-context boundary — 24 November 2026

The mixed catalog media-add path now resolves the verified caller context in two bounded DB-only phases. The controller performs product edit authorization inside a user actor transaction. CatalogService.addMedia requires a non-empty authenticated subject and role, then scopes product lookup, variant-to-product ownership validation and the media-row insert in a second short user actor transaction. Media URL resolution remains after commit because it may call external storage; no DB transaction is held over that operation. The unit regression fixture now supplies a user actor and transaction mock. This test was not executed. Other mixed catalog/import paths remain open; this change does not mark the broader catalog actor-context audit complete.


## Catalog import upload and CSV staging actor-context boundary — 24 November 2026

The mixed catalog import upload and CSV staging routes now establish the authenticated user actor for their authorization reads and for each database-only service phase. `uploadImportFile` requires a caller actor, scopes the persisted-job lookup and final import-job metadata update, and leaves raw request-body reading, object-storage upload and XLSX parsing outside DB transactions. `stageImportRows` requires a caller actor, scopes its persisted-job lookup and READY-state update, and leaves Redis batch deletion/write/expiry/count operations outside DB transactions. The controller resolves the persisted job and verifies store organization/membership inside a short actor context before reading upload bytes or invoking Redis/storage work. The focused P10 upload test fixture now mocks the actor-context wrapper and passes a caller to each upload test.

Source commits: `b6dd8a7d731604be811301dd7168fc3faffde1b6` and `6e3b5a9716eeac514fd214dbc2561266f797993c`. No tests, formatter, lint, typecheck, E6 or CI were run. Preview, processing/worker, error-report export and other mixed catalog import paths remain open; this change does not mark the catalog actor-context audit or G-002 verified.


## Import preview validation DB scope refinement — 24 November 2026

Follow-up review confirmed `ImportValidationService.validateRows` performs database reads (catalog lookup/validation), not just in-memory validation. Its invocation is now inside the same short authenticated actor-context boundary; workbook parsing and Redis reads remain outside. Source commit: `9b6387597e8c02de076613b4f4a540a379362491`. Tests and CI remain deferred and G-002 remains NOT VERIFIED.

## 25 November 2026 — mixed Catalog product mutation actor scopes

The next mixed Catalog operations from the previous handoff are now implemented: PATCH /products/:id and DELETE /products/:id no longer rely on an unscoped database connection. The controller wraps the product-edit authorization lookup in a short verified-user actor context and forwards the verified JWT caller to CatalogService. CatalogService scopes product reads, identifier uniqueness checks, product-type validation, publish validation, update/delete writes, product-type-change and re-review transactions, outbox insertion, and final reads to short user actor contexts. Redis cache invalidation and audit recording happen after business DB scopes close; publication outbox insertion uses a separate short user actor scope.

The two routes intentionally remain without TenantDatabaseContextInterceptor: a request-wide transaction would span cache invalidation and other non-DB side effects. AuditService.record now uses a dedicated audit actor when invoked without an existing actor context, while preserving an already-active verified caller/worker transaction to avoid forbidden nested actor switching.

Regression coverage added:
- catalog-controller-actor-context.spec.ts asserts the mixed update/delete routes do not acquire the request-wide interceptor.
- catalog-product-mixed-actor-context.spec.ts covers user-scoped update/delete phases, external side-effect boundaries, publication outbox scoping and fail-closed missing caller identity.
- audit-service-actor-context.spec.ts covers the standalone audit principal and active-context reuse.

These tests are authored but NOT EXECUTED. Formatter, lint, typecheck, E6 and CI remain deferred under the implementation-first restriction. No RLS, grants, migration, shared/staging database, deployment, worker activation, merge or release action occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. The next task is to continue the operation-callsite and ownership-predicate audit, prioritizing other mixed catalog product/variant paths and any remaining root-pool DB calls.

## 25 November 2026 — Catalog import processing and error-report actor scopes

Completed the remaining mixed Catalog Import processing and CSV error-report paths. CatalogController now resolves the import job and verifies store organization/membership in a short verified-user actor context before calling the processing service. CatalogService requires the caller for processImportJob and getErrorReport. Processing scopes the job lookup, atomic job claim, default price-list access, chunk creation/listing, cancellation checks, each chunk claim + product/variant/price transaction, final job aggregation/status update, failure status update and final read. XLSX object storage reads/parsing and CSV Redis row reads remain outside DB actor transactions; Redis staged-row cleanup runs after the final DB scope. Error-report generation loads the job and chunk errors in one short actor scope and serializes CSV after that scope closes. The controller metadata regression spec asserts these mixed routes remain outside the request-wide interceptor.

Added catalog-import-processing-actor-context.spec.ts for process-level DB phases, fail-closed caller requirements, chunk transaction scope and error-report reads/CSV serialization. Tests remain authored but NOT EXECUTED. Formatter, lint, typecheck, E6 and CI remain deferred. No worker was added or activated; recoverStaleJobs remains a dormant/manual service method and was not enabled. No DB/RLS/grant/migration/staging/deployment/merge/release actions occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED.

Correction to the earlier continuation observation: full P13MonitorService review confirms its direct diagnostic SQL queries already call withMonitorActor; no P13 code change was required. The earlier note that the helper was unused was incorrect. Continue next with the remaining Catalog service callsite/root-pool audit and exact ownership predicates, then migration/FK and protected live identity/catalog evidence.

## 25 November 2026 — dormant Catalog import recovery actor

The dormant CatalogService.recoverStaleJobs maintenance entry point now uses a dedicated worker principal, catalog-import-recovery, for its stale-job scan and job/chunk state updates. This is a source-level boundary only: CatalogModule does not register a recovery worker or scheduler, and this change does not activate or schedule it. A regression spec covers the worker principal and the two stale-state writes. The controller metadata test description now covers all mixed Catalog routes, not only product mutations. Tests remain unexecuted; G-002 remains NOT VERIFIED.

## 25 November 2026 — Catalog product detail and media read boundaries

Completed another mixed Catalog read-path slice. GET /products/:id now runs assertProductReadable and canManageProductCatalog in a short verified-user actor context; CatalogService.getProductDetail requires the caller and keeps all product/store/media-row/variant/pricing/stock/attribute DB reads in one short user actor scope. Redis cache get/set and storage URL signing are outside that DB scope. GET /products/:productId/media now similarly scopes its authorization and media-row query, then resolves storage URLs after the DB scope closes. Both routes remain outside TenantDatabaseContextInterceptor.

Added catalog-media-read-actor-context.spec.ts to cover media-row scope, storage resolution outside the transaction, product detail DB reads, and Redis/storage operations outside actor scope. Controller metadata tests now include getProduct and listMedia. Tests remain unexecuted. Continue with the remaining Catalog root-pool and mixed operation inventory; G-002 remains NOT VERIFIED.

## 25 November 2026 — Redis-backed Search Facets actor scope

The GET /search/facets route no longer uses TenantDatabaseContextInterceptor across Redis cache I/O. SearchService.getFacetsCached now requires a verified user actor; cache get/set remains outside the DB transaction, and only the taxonomy/facet query runs in a short user actor context. Controller metadata coverage now includes getSearchFacets, and search-service.spec.ts adds regression coverage for Redis outside the actor scope, the scoped facet query and missing-actor rejection. Tests remain unexecuted. The other SearchService routes (search, top categories, popular brands) were reviewed; the latter two are DB-only, while search image signing uses the existing product-card resolver. Continue auditing remaining mixed Catalog/Search callsites.

## 25 November 2026 — Catalog ownership predicates and lifecycle concurrency

The Catalog root-pool/ownership continuation has advanced beyond the prior mixed-route slice. The main Catalog, taxonomy, offer and request controllers were re-reviewed for actor-context coverage. CatalogOfferController, CatalogRequestsController and CatalogTaxonomyController have controller-level TenantDatabaseContextInterceptor coverage; CatalogController DB-only reads use method-level coverage, while mixed detail/media/import/facet paths use explicit short actor scopes. PricingController and ReviewsController also establish actor contexts for their Catalog lookup-service consumers. Search facets now validate the caller before cache access and scope only the DB phase.

New source protections:
- Store-scoped category list/search surfaces require current organization and active store membership; default category listing and public category tree are platform-only and active-only. Inactive category detail is hidden unless the caller has category governance permission.
- Product create/update category references must point to an active global category or a category owned by the same store. Category parent creation/reparenting rejects inactive and foreign-store parents. Public category-product listing rejects tenant categories.
- Product types are global taxonomy: create/update, publish, duplicate and new-version paths reject tenant/inactive category bindings. Public type lists/details/schema/product lookups hide unpublished types and legacy tenant-bound category references; managers retain privileged inventory access.
- Public search facets use the v2 cache key, only active platform categories and published product types, and aggregate values only from ACTIVE, non-deleted products of the selected type/category.
- Merchant-offer lifecycle writes compare-and-set the previously read status and store owner; pricing writes additionally compare the prior updatedAt.
- Catalog request approval/rejection locks the pending request in an active user actor transaction and conditionally transitions only PENDING rows.
- Product update/type-change/delete/bulk mutations repeat the exact store and non-deleted predicates on writes. Product edit/read authorization is revalidated inside service actor scopes before writes, cache hits or media reads. Media deletion binds both media ID and parent product ID.

Regression specs added/extended across category visibility/ownership, taxonomy visibility and legacy category bindings, Search Facets, offer CAS, request review locking, product mutation owner predicates, media parent ownership, actor-context route metadata and existing optimistic-locking/type tests. They are authored but NOT EXECUTED. No formatter, lint, typecheck, E6 or CI was run.

Inspected branch head before this documentation update: 6a029779930bef12062d66af9eb7b8aa18ddf838. PR #138 remains open/draft/unmerged, target develop; branch comparison was 2,641 ahead / 0 behind. Exact-head combined status contains only Vercel Admin/Web failures linking to the external Vercel build-rate-limit page; GitHub Actions lookup returned no runs for this [skip ci] head. These are not application test results.

No RLS/grant/migration change, shared/staging DB operation, deployment, worker activation, environment/secret change, merge or release occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Continue with the remaining Catalog service/root-pool and cross-module caller inventory, then resume operation-specific ownership/FK and migration/operator evidence. Do not start quality gates until implementation/integration is complete.

## 25 November 2026 — Admin-to-Catalog mixed caller integration

The cross-module caller audit found that AdminService also delegates to CatalogService. Two admin routes were mixed DB/external-I/O operations and were corrected:
- PATCH /admin/products/:id previously retained TenantDatabaseContextInterceptor while delegating to CatalogService.updateProduct, whose cache/audit side effects must occur after short DB scopes. The route now forwards the verified admin JWT actor to AdminService.adminUpdateProduct and deliberately has no request-wide interceptor. CatalogService.updateProduct revalidates edit permission and owns its short actor DB phases.
- GET /admin/products/:id/media-previews previously read product/media/variant rows from the root pool and signed storage URLs in the same unscoped method. AdminService.productMediaPreviews now reads those rows in a short verified-user actor transaction and generates presigned URLs only after commit. The controller forwards the authenticated admin actor and does not install a request-wide interceptor.

Other inspected AdminService Catalog delegations (create product, variant detail/create/update/bulk, typed attribute reads/writes) remain on DB-only admin endpoints with TenantDatabaseContextInterceptor. reviewOrgUpdateRequest already uses an explicit user actor scope and sends notification after commit. CatalogUserActor is now exported for module-level caller contracts.

Added/updated admin service and controller regression specs for actor forwarding, mixed-route interceptor exclusions, product media DB scope and storage-after-commit behavior. Tests remain NOT EXECUTED. No formatter/lint/typecheck/E6/CI.

Exact inspected head before the next documentation refresh: 9364f7ae1e7c6dc5fc046ba231a188f1954a779d. PR #138 is open/draft/unmerged, base develop, head matches this SHA, mergeable=true; branch is 2,658 ahead and 0 behind develop. Exact-head Vercel Admin/Web statuses are FAILURE due to the external build-rate-limit page; GitHub Actions returned no runs for this [skip ci] head. Do not merge.

No shared/staging DB, RLS/grant/migration, deployment, worker activation, environment/secret change, merge or release occurred. G-002 remains IMPLEMENTATION_IN_PROGRESS / NOT VERIFIED. Continue remaining cross-module Catalog caller/root-pool audit and then the outstanding FK/migration/operator evidence.

## 25 November 2026 — Identity Profile Catalog caller boundaries

The cross-module audit found ProfileController uses CatalogService for favorites and saved suppliers. All six routes already had TenantDatabaseContextInterceptor; they now also forward the authenticated JWT actor into CatalogService, whose favorites/supplier methods establish/reuse a short user actor context and require userId to equal actor.sub. Favorite creation checks product readability; favorite listing revalidates each product before returning it and skips private/deleted products. Saved-supplier creation/listing now expose only ACTIVE + VERIFIED stores and return a public-safe projection (no orgId, address or metadata). Delete operations remain constrained by both userId and target ID.

Added/updated saved-supplier/favorites service tests and ProfileController actor-forwarding/interceptor metadata tests. Tests remain NOT EXECUTED. This closes the ProfileController caller path only; the broader cross-module inventory remains open.
