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

Live GitHub reconciliation on 22 November 2026 confirms branch `remediation/phase-0-1-tenant-security` at `7be3e2da3a26ab565f6c5dd391a9bba486d3bcae` after inventory documentation updates. The current documentation checkpoint has no associated workflow run or combined status and is NOT CI-VERIFIED. The earlier PR #138 source SHA `741a09f68721898a5bed6601bc3bc636867c78c2` passed exact-head CI #44954371615 across all executable jobs; k6 and protected staging release were skipped. PR #142 source SHA `dddff20c170737dc4694008bb807b2b90e177f77` passed CI #44953735602, including its disposable PostgreSQL identity test; k6 and protected staging release were skipped. Treat these as historical exact-SHA evidence only. PR #138 and PR #142 remain open/draft/unmerged. G-001 remains PARTIAL pending independent security review; G-002 remains IN PROGRESS pending actual staging identity evidence, refreshed protected audit and reviewed access design.

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
