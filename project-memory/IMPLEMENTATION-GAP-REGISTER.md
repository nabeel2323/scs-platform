# SCS Platform — Implementation Completion Gap Register

**Programme:** Implementation Completion Program  
**Created:** 22 November 2026  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Authority:** This register sequences implementation work; the audit finding definitions, acceptance criteria and evidence remain in [the remediation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) and [progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## Operating rule

Complete the planned implementation and integration work before starting the consolidated full regression campaign. Keep only proportionate developer checks during implementation. Add focused tests with new behavior where they protect a critical invariant or are needed to make the change safe; do not repeatedly run the entire suite after each small enhancement. No known security defect may be knowingly left exploitable until the later test phase. Existing CI evidence remains historical and exact-SHA-specific.

This is an initial evidence-based register, not a claim that every product feature has already been audited. The first programme task is to map the actual repository/API/web/admin/mobile/database surfaces against the product requirements, authoritative audit and existing implementation. Add rows only with repository evidence and explicit acceptance criteria.

## Status vocabulary

- `IMPLEMENTATION_PENDING` — required behavior is not implemented or not yet assessed.
- `IMPLEMENTATION_IN_PROGRESS` — implementation work is active.
- `IMPLEMENTED` — code/configuration/docs are present; this does not mean tested.
- `INTEGRATION_PENDING` — related components/contracts/workflows still need to be connected.
- `TESTING_PENDING` — comprehensive validation is deliberately queued for the dedicated testing phase.
- `VERIFIED` — required tests/evidence passed on the exact source revision.
- `BLOCKED` — a named external decision, authorization, dependency or environment prevents progress.
- `DEFERRED_BY_DECISION` — explicitly outside the agreed product scope; record the decision and revisit trigger.

Statuses are per deliverable. Do not use IMPLEMENTED, VERIFIED, runtime-verified, independently-reviewed, approved or released interchangeably.

## Programme phases

| Phase | Objective | Exit condition | Status |
|---|---|---|---|
| 0. Baseline and gap mapping | Reconcile requirements, existing modules, source, docs, PRs and known audit findings into one evidence-backed register | Every in-scope area is mapped; each gap has priority, owner/dependency and acceptance criteria | IMPLEMENTATION_IN_PROGRESS |
| 1. Implementation completion | Finish outstanding backend, database, security, web, admin, mobile, POS/merchant, workflows and operational/documentation behavior | All agreed in-scope implementation rows are IMPLEMENTED or explicitly DEFERRED/BLOCKED with decision | IMPLEMENTATION_PENDING |
| 2. Integration completion | Connect API/contracts/database/UI/mobile/workers and cross-module workflows; resolve contract and lifecycle gaps | End-to-end paths are wired; integration rows are IMPLEMENTED | IMPLEMENTATION_PENDING |
| 3. Comprehensive testing | Run one coordinated full test campaign: unit, API, PostgreSQL/migrations, tenant isolation, security, concurrency, web/admin/mobile E2E and performance | Full test matrix has exact-SHA evidence; defects are logged with reproducible cases | TESTING_PENDING |
| 4. Stabilization | Fix defects found in Phase 3, tune UX/performance/reliability, rerun affected and full required suites | No unresolved release-blocking defects; documentation and evidence match final behavior | IMPLEMENTATION_PENDING |
| 5. Release readiness | Independent security review, authorized staging acceptance, migration/rollback/recovery evidence, business sign-off and go/no-go | All release gates are explicitly approved; no implicit authorization | IMPLEMENTATION_PENDING |

The existing audit remediation phases and G-001–G-035 finding register remain authoritative for their own scope. This programme overlays sequencing; it does not erase finding history or waive security/release gates.

## Initial implementation-gap register

| ID | Area / deliverable | Evidence-backed current state | Remaining gap / acceptance direction | Priority | Status | Dependencies / guardrails |
|---|---|---|---|---|---|---|
| MAP-001 | Whole-product implementation inventory | Static tree and selected source inspection completed at `2cca47a`; 1,625 files, 20 API modules, 49 web routes, 56 admin routes, 32 Flutter screens, 25 schema files, 71 SQL migrations and client/API test inventory recorded in [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md) | Complete route-to-contract/permission matrices, all 99 Drizzle tables vs 114+ physical relations, and full worker/provider integration mapping; revalidate historical UI audit items | P0 | IMPLEMENTATION_IN_PROGRESS | Static inventory only; live DB counts differ across source notes; no current-head CI run |
| SEC-001 | G-001 merchant offer authorization | Controller/service/PostgreSQL acceptance cases are recorded; exact-head CI #44954371615 passed all executable jobs on PR #138 head 741a09f… | Keep security review and reviewer-finding disposition as a distinct gate; implement any concrete findings. Do not self-certify independent review | P0 | IMPLEMENTED | Independent review is not complete; CI #44954371615 is exact-SHA evidence only |
| DB-001 | G-002 runtime identity and DB access baseline | PR #142 adds API runtime identity diagnostics; real-PostgreSQL distinct login/effective-role test passed in CI #44953735602 on dddff20…; PR #138 CI #44954371615 passed its disposable DB audit | Obtain actual API and migration identities through separately authorized staging path; complete refreshed live inventory and per-operation/ownership matrix | P1 | IMPLEMENTATION_PENDING | PRs #138/#142 remain draft; no staging release or shared DB mutation |
| DB-002 | Transaction-bound tenant database context | G-002 architecture design identifies global Drizzle pool and no universal request-bound transaction/context as blockers | Design and implement request/worker-scoped transaction handle propagation; use transaction-local context; prove no global-handle fallbacks in covered paths and pool-reuse isolation | P1 | IMPLEMENTATION_PENDING | No session-level tenant GUC; no RLS enablement or shared DB changes |
| DB-003 | Complete DB operation/ownership inventory | Current candidate matrix enumerates 99 Drizzle-exported tables; it is not complete against historical 116-table live inventory | Reconcile all physical tables, views/functions/sequences, HTTP/service/worker/webhook/audit/bootstrap/migration operations, FK ownership and role predicates | P1 | IMPLEMENTATION_IN_PROGRESS | Candidate scopes are not approved policy; requires source + authorized refreshed inventory |
| COMM-001 | Commercial correctness findings | Remediation tracker records closed and open G-003–G-035 work, including currency, MOQ, payment, attribution, shipping and financial boundaries | Reconcile each remaining/partial finding with actual implementation; finish missing behavior and integration without reopening closed work absent evidence | P1 | IMPLEMENTATION_PENDING | Use authoritative finding register; do not silently expand gateway/payout scope |
| FLOW-001 | Buyer/merchant/admin workflow parity | API, web, admin and Flutter applications exist; audit tracker identifies remaining UAT/integration work including G-007 | Map each critical journey across API, web, admin and mobile; complete missing order/suborder, checkout, tracking, returns and support workflow connections | P1 | IMPLEMENTATION_PENDING | Full buyer journey UAT belongs to Phase 3 unless needed for safe implementation |
| OPS-001 | Notifications, workers and fulfillment operations | Audit tracker records durable lease/worker and truthful notification remediation; carrier sandbox verification remains open | Map provider configuration, failure states, retry/lease ownership, monitoring, worker activation controls and carrier integration boundaries; implement missing safe behavior | P1 | IMPLEMENTATION_PENDING | No real provider sends, worker activation or staging writes without authorization |
| UX-010 | Web/admin/mobile UX completeness | Known audit context includes admin detail views, marketplace offer/pricing visibility, cart feedback and variant display issues; current complete inventory is not yet evidenced | Re-audit each screen against backend contracts, permissions, loading/empty/error states, responsive behavior and accessibility; add concrete gaps with screen/source references | P1 | IMPLEMENTATION_PENDING | Do not claim these historical issues remain unfixed until source review |
| DATA-001 | Database migrations, indexes and data lifecycle | Migration and schema changes have CI/disposable DB evidence; live DB changes are separately gated | Map pending schema/data lifecycle work, migration ordering, constraints, FK indexes and rollback strategy; implement only evidence-supported DDL | P1 | IMPLEMENTATION_PENDING | No shared DB migration/grant/default-ACL/RLS changes |
| DOC-001 | Implementation-accurate documentation | Project memory and remediation plan/progress tracker exist | Map install/configuration, user/admin/merchant/accountant, permissions, workflows, API, operations, deployment, troubleshooting and release docs; update with each implementation group | P1 | IMPLEMENTATION_IN_PROGRESS | Docs must describe observed code, not planned behavior |
| PERF-001 | Performance and reliability readiness | k6 and staging performance campaign have not been executed in the recorded CI checkpoints | Identify code-level performance gaps during implementation; defer consolidated load/stress/soak verification to Phase 3 | P2 | TESTING_PENDING | No unsupported performance claims |

## Source-confirmed UX and workflow gaps — 22 November 2026

The static source inventory identified the following concrete candidates. See [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md) for the source paths, qualifications and historical audit corrections.

| ID | Area / deliverable | Evidence-backed current state | Remaining gap / acceptance direction | Priority | Status | Dependencies / guardrails |
|---|---|---|---|---|---|---|
| UX-001 | Admin order operations UX | Admin order list remains a generic `ManagementPage`; detail now exposes cancellation only to callers with `orders:cancel` and only for backend-supported cancellable states. Existing `POST /orders/:id/cancel` validates the canonical reason set, requires notes for OTHER, checks object access, performs optimistic status locking and transactionally synchronizes inventory, shipment/exception state, history and outbox | Cancellation UX is implemented with reason/notes, explicit confirmation, pending/error/success feedback and detail refresh. Broader admin operations remain out of scope until their state transitions and service authorization are mapped. Validate in Phase 3 | P1 | IMPLEMENTED | ADMIN and SUPER_ADMIN receive `orders:cancel` in `rbac-seed.data.ts`; backend remains authoritative; no new transition behavior introduced |
| UX-002 | Admin refund approval UX | Admin API now exposes permission-guarded `GET /admin/refunds` for REQUESTED refunds and existing guarded `POST /admin/refunds/:id/approve`; Admin Payments adds a Refund Requests tab with order/payment references, amount/currency, reason, request time and explicit confirmation | Queue and approval UI are implemented against the existing REQUESTED → SUCCEEDED transition; verify API/UI behavior in Phase 3 and review pre-existing approval transaction semantics separately | P1 | IMPLEMENTED | `admin:refunds:approve` gates queue visibility and approval; approval does not imply gateway payout |
| UX-003 | Admin dashboard operations widgets | Dashboard now loads recent catalog imports only for `catalog:imports:manage` users and pending catalog requests only for `catalog:requests:manage` users; both widgets have loading/empty/error handling and links to their existing workspaces | Validate role/permission visibility and API failure states in Phase 3; keep import data hidden from roles without import-management access | P2 | IMPLEMENTED | Existing APIs and screens reused; import endpoint additionally requires ADMIN/SUPER_ADMIN role |
| UX-004 | Admin navigation information architecture | Admin sidebar now groups its 32 existing destinations under Overview, Platform Management, Orders & Fulfillment, Catalog, Finance, Analytics & Governance, and Account. Existing route URLs, active matching, permission filtering, collapsed tooltips, mobile overlay and logout behavior are preserved. Requests now uses `catalog:requests:manage` consistently with its API/page guard | Verify desktop/mobile/collapsed rendering and role-specific group visibility in Phase 3 | P2 | IMPLEMENTED | Group headings hide in collapsed mode and become separators; no route was added or removed |
| UX-005 | Merchant Product Studio offer step | StepOffer now fetches warehouses for the selected store through the existing store-scoped `GET /stores/:storeId/warehouses` API and replaces raw warehouse-ID entry with an active-warehouse selector. Base price/MOQ now have required integer/minimum constraints; lead-time is a nonnegative integer | Verify warehouse fetch/permission/error states and submit compatibility in Phase 3; preserve a warning for previously selected warehouses that are no longer active | P2 | IMPLEMENTED | Reuses existing warehouse API and `Warehouse` contract; no new commercial fields or backend behavior |
| UX-006 | Mobile permission-level affordances | Router enforces merchant/driver role redirects but not granular per-permission route/action visibility | Map canonical permissions to mobile screens/actions and add consistent client affordances; backend remains authoritative | P2 | IMPLEMENTATION_PENDING | Existing role-level guards must be retained |
| UX-007 | Support ticket capability | `apps/api/src/modules/support/support.module.ts` is empty; no ticket controller/service found | Decide whether basic ticketing is in current scope; if yes define lifecycle, ownership, attachments, notifications and UI/API contract | P2 | BLOCKED | Product scope decision required; disputes are separate in reviews module |
| UX-008 | Nearby-offers API/UI discrepancy | September UI audit claims `GET /offers/nearby`; inspected catalog/offer controllers expose no nearby route | Reconcile historical API claim against full route tree/contracts before deciding whether API or UI is missing | P2 | IMPLEMENTATION_PENDING | Location privacy/geospatial product decision; do not assume endpoint exists |
| UX-009 | Admin route permission coverage | Generic ManagementPage applies config permission checks; inspected custom pages audit/analytics/payments/order detail also use `useRequirePerms`. The catalog requests page previously required `catalog:categories:write` while its API controller requires `catalog:requests:manage`; page guard is now aligned with the canonical endpoint permission | Finish route-by-route audit across all 56 admin pages and nested routes; retain the corrected catalog-request guard and verify all action-level checks | P1 | IMPLEMENTATION_IN_PROGRESS | Do not label all generic list wrappers unguarded; deep links and action checks still need review |

## Required fields for every newly discovered gap

Every additional row must include: unique ID; module/surface; exact source evidence (paths, symbols, routes/screens/schema); current behavior; required behavior; priority and business/security impact; status; dependencies; acceptance criteria; implementation commit/PR; focused development check (if any); comprehensive Phase 3 test reference; documentation affected; and any authorization/safety gate.

## Completion rules

1. Do not repeat work already implemented and verified on the current source head.
2. Distinguish missing implementation from missing integration, missing evidence, external blockers and explicit product decisions.
3. Prefer cohesive implementation batches and commits across related API/UI/database/docs work.
4. Keep developer checks narrow and fast; schedule broad regression for Phase 3.
5. Immediately fix a concrete security/correctness defect discovered during implementation; do not knowingly defer it to Phase 3.
6. Update this register, project memory, authoritative remediation tracker and user-facing docs as relevant work completes.
7. Never merge, deploy, run live migrations, change shared grants/default ACLs, enable RLS, activate workers or perform staging writes without the recorded authorization.
