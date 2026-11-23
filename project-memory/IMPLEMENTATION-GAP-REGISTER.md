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

| Phase                        | Objective                                                                                                                                               | Exit condition                                                                                       | Status                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| 0. Baseline and gap mapping  | Reconcile requirements, existing modules, source, docs, PRs and known audit findings into one evidence-backed register                                  | Every in-scope area is mapped; each gap has priority, owner/dependency and acceptance criteria       | IMPLEMENTATION_IN_PROGRESS |
| 1. Implementation completion | Finish outstanding backend, database, security, web, admin, mobile, POS/merchant, workflows and operational/documentation behavior                      | All agreed in-scope implementation rows are IMPLEMENTED or explicitly DEFERRED/BLOCKED with decision | IMPLEMENTATION_PENDING     |
| 2. Integration completion    | Connect API/contracts/database/UI/mobile/workers and cross-module workflows; resolve contract and lifecycle gaps                                        | End-to-end paths are wired; integration rows are IMPLEMENTED                                         | IMPLEMENTATION_PENDING     |
| 3. Comprehensive testing     | Run one coordinated full test campaign: unit, API, PostgreSQL/migrations, tenant isolation, security, concurrency, web/admin/mobile E2E and performance | Full test matrix has exact-SHA evidence; defects are logged with reproducible cases                  | TESTING_PENDING            |
| 4. Stabilization             | Fix defects found in Phase 3, tune UX/performance/reliability, rerun affected and full required suites                                                  | No unresolved release-blocking defects; documentation and evidence match final behavior              | IMPLEMENTATION_PENDING     |
| 5. Release readiness         | Independent security review, authorized staging acceptance, migration/rollback/recovery evidence, business sign-off and go/no-go                        | All release gates are explicitly approved; no implicit authorization                                 | IMPLEMENTATION_PENDING     |

The existing audit remediation phases and G-001–G-036 finding register remain authoritative for their own scope. This programme overlays sequencing; it does not erase finding history or waive security/release gates.

## Initial implementation-gap register

| ID       | Area / deliverable                                | Evidence-backed current state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Remaining gap / acceptance direction                                                                                                                                                                                                                                            | Priority | Status                     | Dependencies / guardrails                                                                                                                                             |
| -------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAP-001  | Whole-product implementation inventory            | Static tree and selected source inspection completed at `2cca47a`; 1,625 files, 20 API modules, 49 web routes, 56 admin routes, 32 Flutter screens, 25 schema files, 71 SQL migrations and client/API test inventory recorded in [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md)                                                                                                                                                                                                                                             | Complete route-to-contract/permission matrices, all 99 Drizzle tables vs 114+ physical relations, and full worker/provider integration mapping; revalidate historical UI audit items                                                                                            | P0       | IMPLEMENTATION_IN_PROGRESS | Static inventory only; live DB counts differ across source notes; no current-head CI run                                                                              |
| SEC-001  | G-001 merchant offer authorization                | Controller/service/PostgreSQL acceptance cases are recorded; exact-head CI #44954371615 passed all executable jobs on PR #138 head 741a09f…                                                                                                                                                                                                                                                                                                                                                                                                                           | Keep security review and reviewer-finding disposition as a distinct gate; implement any concrete findings. Do not self-certify independent review                                                                                                                               | P0       | IMPLEMENTED                | Independent review is not complete; CI #44954371615 is exact-SHA evidence only                                                                                        |
| SEC-002  | G-036 realtime store/order room authorization     | The gateway authenticated sockets but previously allowed arbitrary authenticated joins to store and order rooms.                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Enforce permission plus store membership/active-org, buyer ownership, assigned-driver or platform-staff authorization; fail closed. Focused tests added but not executed.                                                                                                       | P1       | IMPLEMENTATION_IN_PROGRESS | Exact-head CI and independent review pending; no shared DB or staging change                                                                                          |
| DB-001   | G-002 runtime identity and DB access baseline     | PR #142 adds API runtime identity diagnostics; real-PostgreSQL distinct login/effective-role test passed in CI #44953735602 on dddff20…; PR #138 CI #44954371615 passed its disposable DB audit                                                                                                                                                                                                                                                                                                                                                                       | Obtain actual API and migration identities through separately authorized staging path; complete refreshed live inventory and per-operation/ownership matrix                                                                                                                     | P1       | IMPLEMENTATION_PENDING     | PRs #138/#142 remain draft; no staging release or shared DB mutation                                                                                                  |
| DB-002   | Transaction-bound tenant database context         | G-002 architecture design identifies global Drizzle pool and no universal request-bound transaction/context as blockers                                                                                                                                                                                                                                                                                                                                                                                                                                               | Design and implement request/worker-scoped transaction handle propagation; use transaction-local context; prove no global-handle fallbacks in covered paths and pool-reuse isolation                                                                                            | P1       | IMPLEMENTATION_PENDING     | No session-level tenant GUC; no RLS enablement or shared DB changes                                                                                                   |
| DB-003   | Complete DB operation/ownership inventory         | Candidate matrix enumerates 99 Drizzle-exported tables; source mapping covers all 53 API service/worker/poller/dispatcher/executor candidates, module controllers, CLI/migration/bootstrap paths and physical DB objects. Method-level predicates now cover Orders/Payments/Inventory, Catalog/Offers/Taxonomy, Pricing/Merchant/Store Membership, Returns/Disputes/Reviews/Financial Controls, Carrier/Shipping/Webhook, and Worker/Outbox/Bootstrap/Operator/System. PricingService variant-tier reads now require storeId and join priceLists for store isolation. | Static source mapping is complete for the bounded G-002 service families. Obtain protected live API/migration identity evidence, reconcile 114-vs-116 physical relations, and complete the transaction-context/RLS architecture review without enabling RLS or changing grants. | P1       | IMPLEMENTATION_IN_PROGRESS | Static source evidence only; candidate scopes are not approved RLS policy; deployed identities and protected catalog still require authorized read-only verification. |
| COMM-001 | Commercial correctness findings                   | Remediation tracker records closed and open G-003–G-036 work, including currency, MOQ, payment, attribution, shipping and financial boundaries                                                                                                                                                                                                                                                                                                                                                                                                                        | Reconcile each remaining/partial finding with actual implementation; finish missing behavior and integration without reopening closed work absent evidence                                                                                                                      | P1       | IMPLEMENTATION_PENDING     | Use authoritative finding register; do not silently expand gateway/payout scope                                                                                       |
| FLOW-001 | Buyer/merchant/admin workflow parity              | API, web, admin and Flutter applications exist; audit tracker identifies remaining UAT/integration work including G-007                                                                                                                                                                                                                                                                                                                                                                                                                                               | Map each critical journey across API, web, admin and mobile; complete missing order/suborder, checkout, tracking, returns and support workflow connections                                                                                                                      | P1       | IMPLEMENTATION_PENDING     | Full buyer journey UAT belongs to Phase 3 unless needed for safe implementation                                                                                       |
| OPS-001  | Notifications, workers and fulfillment operations | Audit tracker records durable lease/worker and truthful notification remediation; carrier sandbox verification remains open                                                                                                                                                                                                                                                                                                                                                                                                                                           | Map provider configuration, failure states, retry/lease ownership, monitoring, worker activation controls and carrier integration boundaries; implement missing safe behavior                                                                                                   | P1       | IMPLEMENTATION_PENDING     | No real provider sends, worker activation or staging writes without authorization                                                                                     |
| UX-010   | Web/admin/mobile UX completeness                  | Known audit context includes admin detail views, marketplace offer/pricing visibility, cart feedback and variant display issues; current complete inventory is not yet evidenced                                                                                                                                                                                                                                                                                                                                                                                      | Re-audit each screen against backend contracts, permissions, loading/empty/error states, responsive behavior and accessibility; add concrete gaps with screen/source references                                                                                                 | P1       | IMPLEMENTATION_PENDING     | Do not claim these historical issues remain unfixed until source review                                                                                               |
| DATA-001 | Database migrations, indexes and data lifecycle   | Migration and schema changes have CI/disposable DB evidence; live DB changes are separately gated                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Map pending schema/data lifecycle work, migration ordering, constraints, FK indexes and rollback strategy; implement only evidence-supported DDL                                                                                                                                | P1       | IMPLEMENTATION_PENDING     | No shared DB migration/grant/default-ACL/RLS changes                                                                                                                  |
| DOC-001  | Implementation-accurate documentation             | Project memory and remediation plan/progress tracker exist                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Map install/configuration, user/admin/merchant/accountant, permissions, workflows, API, operations, deployment, troubleshooting and release docs; update with each implementation group                                                                                         | P1       | IMPLEMENTATION_IN_PROGRESS | Docs must describe observed code, not planned behavior                                                                                                                |
| PERF-001 | Performance and reliability readiness             | k6 and staging performance campaign have not been executed in the recorded CI checkpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Identify code-level performance gaps during implementation; defer consolidated load/stress/soak verification to Phase 3                                                                                                                                                         | P2       | TESTING_PENDING            | No unsupported performance claims                                                                                                                                     |

## Source-confirmed UX and workflow gaps — 22 November 2026

The static source inventory identified the following concrete candidates. See [WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md](./WHOLE-PRODUCT-IMPLEMENTATION-INVENTORY.md) for the source paths, qualifications and historical audit corrections.

| ID      | Area / deliverable                        | Evidence-backed current state                                                                                                                                                                                                                                                                                                                                                                                                   | Remaining gap / acceptance direction                                                                                                                                                                                                                             | Priority | Status                 | Dependencies / guardrails                                                                                                                                                         |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-001  | Admin order operations UX                 | Admin order list remains a generic `ManagementPage`; detail now exposes cancellation only to callers with `orders:cancel` and only for backend-supported cancellable states. Existing `POST /orders/:id/cancel` validates the canonical reason set, requires notes for OTHER, checks object access, performs optimistic status locking and transactionally synchronizes inventory, shipment/exception state, history and outbox | Cancellation UX is implemented with reason/notes, explicit confirmation, pending/error/success feedback and detail refresh. Broader admin operations remain out of scope until their state transitions and service authorization are mapped. Validate in Phase 3 | P1       | IMPLEMENTED            | ADMIN and SUPER_ADMIN receive `orders:cancel` in `rbac-seed.data.ts`; backend remains authoritative; no new transition behavior introduced                                        |
| UX-002  | Admin refund approval UX                  | Admin API now exposes permission-guarded `GET /admin/refunds` for REQUESTED refunds and existing guarded `POST /admin/refunds/:id/approve`; Admin Payments adds a Refund Requests tab with order/payment references, amount/currency, reason, request time and explicit confirmation                                                                                                                                            | Queue and approval UI are implemented against the existing REQUESTED → SUCCEEDED transition; verify API/UI behavior in Phase 3 and review pre-existing approval transaction semantics separately                                                                 | P1       | IMPLEMENTED            | `admin:refunds:approve` gates queue visibility and approval; approval does not imply gateway payout                                                                               |
| UX-003  | Admin dashboard operations widgets        | Dashboard independently gates KPI requests/rendering by `admin:kpis:read`, organization-update requests/rendering by `admin:users:read`, recent imports by `catalog:imports:manage`, and catalog requests by `catalog:requests:manage`; each section has loading/empty/error behavior where applicable                                                                                                                          | Validate role/permission visibility, no-request behavior for unauthorized users, and API failure states in Phase 3                                                                                                                                               | P2       | IMPLEMENTED            | Existing APIs and backend guards reused; focused dashboard permission tests added; no permission grants changed                                                                   |
| UX-004  | Admin navigation information architecture | Admin sidebar now groups its 32 existing destinations under Overview, Platform Management, Orders & Fulfillment, Catalog, Finance, Analytics & Governance, and Account. Existing route URLs, active matching, permission filtering, collapsed tooltips, mobile overlay and logout behavior are preserved. Requests now uses `catalog:requests:manage` consistently with its API/page guard                                      | Verify desktop/mobile/collapsed rendering and role-specific group visibility in Phase 3                                                                                                                                                                          | P2       | IMPLEMENTED            | Group headings hide in collapsed mode and become separators; no route was added or removed                                                                                        |
| UX-005  | Merchant Product Studio offer step        | StepOffer now fetches warehouses for the selected store through the existing store-scoped `GET /stores/:storeId/warehouses` API and replaces raw warehouse-ID entry with an active-warehouse selector. Base price/MOQ now have required integer/minimum constraints; lead-time is a nonnegative integer                                                                                                                         | Verify warehouse fetch/permission/error states and submit compatibility in Phase 3; preserve a warning for previously selected warehouses that are no longer active                                                                                              | P2       | IMPLEMENTED            | Reuses existing warehouse API and `Warehouse` contract; no new commercial fields or backend behavior                                                                              |
| UX-006  | Mobile permission-level affordances       | Mobile parses active-organization permissions, guards deep links, refreshes after profile/org changes, filters buyer/merchant navigation and Home sections, and gates organization, store, driver, order, inventory, catalog and cart actions                                                                                                                                                                                   | Consolidated Flutter/API role-switch, deep-link and mutation regression remains in Phase 3                                                                                                                                                                       | P2       | IMPLEMENTED            | See `docs/mobile-route-permission-matrix.md`; API guards remain authoritative; focused tests added but not executed                                                               |
| UX-007  | Support ticket capability                 | `apps/api/src/modules/support/support.module.ts` is empty; no ticket controller/service found                                                                                                                                                                                                                                                                                                                                   | Decide whether basic ticketing is in current scope; if yes define lifecycle, ownership, attachments, notifications and UI/API contract                                                                                                                           | P2       | BLOCKED                | Product scope decision required; disputes are separate in reviews module                                                                                                          |
| UX-008  | Nearby-offers API/UI discrepancy          | `GET /offers/nearby` exists in `promotions.controller.ts`, but `PromotionsService.listNearbyOffers` currently ignores `lat`, `lng` and `radiusKm` and returns all active promotions up to the limit; no matching wrapper was found in the inspected web/mobile API clients or Home/Search entry pages                                                                                                                           | Decide whether true geospatial filtering and a buyer-facing consumer are in scope; if so define location/privacy behavior and supported PostGIS fallback before implementing. Do not label global promotions as nearby                                           | P2       | IMPLEMENTATION_PENDING | API route existence is confirmed; geospatial behavior and client integration remain incomplete; no DB extension or location policy change                                         |
| UX-009  | Admin route permission coverage           | All 56 Admin page files and the shared ManagementPage permission configuration have been mapped in `docs/admin-route-permission-matrix.md`. Two action-level mismatches were corrected: business-calendar holiday writes and escalated-return resolution now require `admin:returns:write`; the catalog requests page remains aligned to `catalog:requests:manage`.                                                             | Complete consolidated role/deep-link/action verification in Phase 3; continue route-to-API mapping beyond the Admin page surface                                                                                                                                 | P1       | IMPLEMENTED            | Source-level route map and focused component tests added; API guards remain authoritative; no broad backend permission change                                                     |
| API-001 | Cart mutation permission enforcement      | `CartController` previously had only `JwtAuthGuard` on the class; all cart writes, validation/repricing and promo-code mutations lacked the canonical `orders:write` permission despite buyer/merchant role grants and mobile route policy                                                                                                                                                                                      | Require `orders:write` for every cart mutation endpoint while retaining authenticated self-scoped `GET /cart`; add guard/metadata regression tests                                                                                                               | P1       | IMPLEMENTED            | `PermissionsGuard` is now class-registered and mutation methods declare `orders:write`; BUYER already has the permission; no role grant or migration changed                      |
| API-002 | Aramex provider registry activation       | `AramexProvider` was listed in `ShippingModule` DI providers but never registered in `ShippingProviderRegistry`; explicitly configured Aramex shipment operations and `CarrierTrackingPoller`'s `aramex` fallback could not resolve the adapter                                                                                                                                                                                 | Register Aramex as a non-default provider while preserving `manual-driver` as the default for ordinary shipment operations; verify registry resolution with a focused test; do not call the external provider during startup                                     | P1       | IMPLEMENTED            | `ShippingService.onModuleInit` registers injected Aramex; store config and active encrypted credentials remain required for actual operations; no credential or deployment change |

| FIN-001 | Payment refund concurrency and idempotency | `PaymentsService.approveRefund` previously read payment state outside its transaction and did not lock the payment row while aggregating successful refunds; concurrent approvals of separate partial refunds could leave a fully refunded payment marked `PARTIALLY_REFUNDED`. `requestRefund` also relied on the unique key index but did not return the existing refund on an identical retry. | Serialize approvals on the payment row used by refund requests; identical idempotency-key/payload retries return the original refund; mismatched key reuse conflicts. PostgreSQL regression coverage added as FIN-DSH-11/12. | P1 | IMPLEMENTED / TESTING_PENDING | Existing schema/index only; no migration or payment-scope expansion; consolidated Phase 3 PostgreSQL validation pending |
| FIN-002 | Settlement calculation idempotency | `PaymentsService.calculateSettlement` previously always inserted a new settlement. The partial unique index protects only PENDING/CALCULATED/DUE rows, so a repeated calculation after the original reached PAID could create another payable settlement for the same sub-order/payment. | Serialize on the payment row; require a confirmed/captured/refunded payment state; return an existing active settlement for retries; reject new calculation after PAID/ADJUSTMENT history and require the explicit adjustment workflow. PostgreSQL regression scenarios FIN-DSH-13–15 added. | P1 | IMPLEMENTED / TESTING_PENDING | Existing schema/index only; tests await consolidated Phase 3 PostgreSQL campaign; no automatic payout scope |
| FIN-003 | Payment minor-unit amount validation | `PaymentsService.verifyPayment`, `confirmCash`, `requestRefund` and settlement calculation accepted unvalidated JS numbers; zero/negative/fractional/unsafe values could reach financial state changes or BIGINT persistence. | Require positive safe integers in minor units at each service boundary; reject invalid values before transactions/state changes. FIN-DSH-16 adds PostgreSQL regression coverage for fractional/zero values and unchanged payment state. | P1 | IMPLEMENTED / TESTING_PENDING | No new upper-bound/equality rule; tests await consolidated Phase 3 PostgreSQL campaign; no gateway/payout scope |
| API-003 | Canonical merchant read-permission alignment | CatalogController and StoreMembershipController referenced `merchant:products:read`, which is absent from the canonical permission list and every seeded role; the affected read routes were therefore denied even to valid merchant members | Use existing seeded `catalog:products:read` for product/import reads and `merchant:stores:read` for store-member listing; grant store-read to MERCHANT_STAFF; retain service-level store/org/member checks; add focused guard/seed tests | P1 | IMPLEMENTED | No new permission key; focused tests added but not executed; documented in `docs/api-route-permission-matrix.md` |

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

## UX-009 Admin route permission audit — 22 November 2026

All 56 Admin `page.tsx` route files were reviewed against the shared `ManagementPage`/`managementTables` configuration and the inspected API permission declarations. The resulting route/action map is `docs/admin-route-permission-matrix.md`. Two concrete UI mismatches were corrected in the same implementation group: `/calendar` exposed holiday add/remove controls to read-only users, and `/returns/[id]` exposed escalation resolution to users without `admin:returns:write`. Both backend endpoints already enforced the write permission; this batch aligns the UI and adds focused component coverage. UX-009 is IMPLEMENTED at source level; role/deep-link/action regression remains in Phase 3.

## UX-011 — Mobile active-organization permission parity (22 November 2026)

**Status:** Implementation added; consolidated validation pending.

Mobile now retains the `perms` array returned by `GET /v1/me`. A route policy checks direct/deep links against the active organization's grants and displays an Access Restricted screen when a route permission is missing. The router refreshes after profile and active-organization changes.

Navigation and mutation affordances are filtered by permission: buyer Search/Cart/Orders tabs; merchant Dashboard/Orders/Catalog/Inventory tabs; Home merchant/driver launchers; organization create/edit/member management; driver pickup/delivery; buyer order cancellation/delivery confirmation/reorder; merchant order mutations; inventory adjustment/transfer/low-stock checks; catalog create/edit/delete/offer/category links; store profile/warehouse writes; and Add to Cart controls.

Focused tests cover permission parsing and route policy. Their execution, deep-link tests, active-organization switching, role switching, and mutation regression tests remain in the consolidated validation campaign.

**RBAC follow-up:** Migration 0069 already defines and grants `identity:organizations:create`; staging confirms it was applied on 17 November 2026 and assigned to BUYER, ADMIN, MERCHANT_OWNER, and SUPER_ADMIN. The canonical seed was stale and is now aligned with that existing policy. No new migration or staging grant is required.

### UX-011 review refinement

Follow-up review additionally hides Home search/catalog/store discovery sections without the corresponding read permissions, disables all flat-variant and offer Add-to-Cart buttons without `orders:write`, guards merchant registration organization/store writes, and hides the merchant low-stock KPI destination without `merchant:inventory:read`. Consolidated test execution remains pending.

### Registration active-organization consistency

The merchant registration wizard now persists the created/joined organization as active and reloads `GET /v1/me` before the store-write step. Store/warehouse caches are invalidated after creation. This closes the stale-active-organization permission check; integration validation remains pending.

### RBAC seed drift correction — 22 November 2026

Staging migration log and permission-role joins confirm migration 0069 is applied and the intended onboarding grants exist. The canonical seed omission is corrected in source and covered by a regression test. The previous open item about deciding whether BUYER should receive create permission is closed; the existing migration already records that decision.

## UX-003 and UX-010 permission-state follow-up — 22 November 2026

A current-source review found two Admin read paths whose UI had imported the permission hook but did not enforce it: the commission reversal page ignored `admin:commission:read`, and the dashboard fetched KPI and organization-update data unconditionally. The commission page now denies unauthorized users before loading data. Dashboard KPI and organization-update requests and sections are independently gated by `admin:kpis:read` and `admin:users:read`. Focused tests assert both visibility and absence of unauthorized requests. These are source-level implementation changes; comprehensive execution remains Phase 3.

## API-001 — Cart mutation permission parity — 22 November 2026

The cart controller previously applied JWT authentication but no `orders:write` permission to cart mutations. The cart service already scopes every operation to the authenticated user's cart and enforces server-side offer/price validation; the missing layer was the canonical permission check. The controller now registers `PermissionsGuard` after `JwtAuthGuard` and requires `orders:write` for add/update/remove/clear, validate/reprice, and promo apply/remove. Read-only `GET /cart` remains authenticated and self-scoped. The BUYER role already has `orders:write`; no grant, migration or client contract change was needed. A focused metadata/guard regression suite is added but not executed.

## API-002 — Aramex registry wiring — 22 November 2026

The carrier module registered `AramexProvider` with Nest but `ShippingService.onModuleInit` registered only `ManualDeliveryProvider` in the runtime registry. The carrier worker resolves explicitly configured provider keys through the registry and otherwise defaults shipment create/cancel/label operations to `manual-driver`; the separate `CarrierTrackingPoller` defaults a missing key to `aramex`. Aramex-configured operations and tracking polls could not resolve the provider. The service now registers Aramex as non-default while retaining `manual-driver` as default. No credentials are loaded and no HTTP call is made during registration. A focused provider-registration test is added but not executed.

## G-002 source inventory continuation — 22 November 2026

The operation map now covers all 53 API service/worker/poller/dispatcher/executor candidates at source head 06c5f25f1e0a967129ddae8b94b33e060f2e9691: 44 files contain direct DB operations represented in the map and 9 are database-independent helpers/providers. A separate CLI/bootstrap access map records migration runners, runtime startup migration/seed behavior, RBAC/catalog/demo seeds, one-time bootstrap, staging provisioning, audit/reset utilities and legacy UAT harnesses.

Three concrete script-safety issues were corrected in source: the local admin helper no longer embeds or prints a fixed SUPER_ADMIN password and now requires a local development/test target plus explicit opt-in; the PostgreSQL reset helper requires an exact target database and typed confirmation, with a second staging approval; and the M6 environment check no longer embeds credentials or prints OTP values/raw verification responses. No script was executed and no test was run.

DB-003 remains IMPLEMENTATION_IN_PROGRESS. Exact route-to-operation predicates, remaining legacy UAT-script guards/retirement, staging bootstrap target confirmation, deployed API/migration identities and the protected 114-versus-116 catalog reconciliation remain open. This is not authorization to enable RLS or change database privileges.

## G-002 controller callsite and webhook routing update — 22 November 2026

Added docs/remediation/G-002-CONTROLLER-TO-SERVICE-CALL-MAP-2026-11-22.md for all 28 module controllers. It links controller methods to service callsites, identifies four controllers with direct DatabaseService queries, six controllers that call shared tenant-scope helpers, and the provider/webhook/shipment/bootstrap/operator context boundaries.

A multi-tenant webhook ambiguity was corrected: the legacy providerKey-only callback now rejects when more than one active credential exists for that provider; the tenant-specific providerKey+webhookToken route remains exact. Focused tests were added but not executed. This prevents findFirst from silently selecting a credential belonging to an arbitrary organization.

DB-003 remains IMPLEMENTATION_IN_PROGRESS. Physical DB-object inventory, exact service-method predicates, legacy UAT script guards/retirement, uniform staging bootstrap target confirmation, deployed API/migration identities and the protected 114-versus-116 relation reconciliation remain open. No webhook, database, worker, staging or test action was executed.

## G-002 physical object inventory and audit tooling — 22 November 2026

Added docs/remediation/G-002-PHYSICAL-DATABASE-OBJECT-INVENTORY-2026-11-22.md. Source evidence reconciles the 19-November 114 public ordinary/partitioned tables as 99 Drizzle declarations plus 15 non-Drizzle relations: _migration_log, backfill_errors and 13 analytics_events partitions. backfill_errors is created and written by migration 0053 only in the inspected source; no API reader/writer or tenant owner fields were found. analytics_events parent/partition creation, retention and controller identity scope are documented. The historical 116 count remains unresolved.

Extended apps/api/scripts/audit-db-access.ts (still BEGIN READ ONLY) to enumerate public relation kinds, names, owners, RLS/policy state, parent/child partition bounds, extension membership and safe summary metadata for _migration_log/backfill_errors. All installed extensions are listed rather than only pg_trgm. The audit utility was not run.

DB-003 remains IMPLEMENTATION_IN_PROGRESS until an authorized read-only live run verifies the current relation-kind counts, partition privileges/policies, actual API/migration identities, and the 114-versus-116 discrepancy. No live query, migration, grant, RLS change or staging action occurred.

## G-002 CLI safety guard completion — 22 November 2026

The shared local UAT guard is now applied to 11 M5/M6 TypeScript scripts plus the independently guarded M6 environment check, and to both JavaScript migration harnesses. It requires SCS_ENVIRONMENT=development|test, SCS_UAT_CONFIRM=true and local DB/API/Redis targets where supplied. The local API's underlying DATABASE_URL remains an operator precondition.

All five staging bootstrap scripts now require SCS_ENVIRONMENT=staging, explicit confirmation, exact SCS_STAGING_BOOTSTRAP_DATABASE and a second target-specific approval value. The db:bootstrap:staging package sequence runs the read-only target preflight before RBAC seed/bootstrap writes. No script was executed.

## G-002 method-level predicate batch 1 — 22 November 2026

Mapped OrdersService, PaymentsService and InventoryService method groups to table operations and caller predicates. The map distinguishes buyer, merchant organization, active store membership, assigned driver, platform-admin and system/worker contexts, and records the unscoped internal lookup helpers that controller paths wrap.

Fixed InventoryService.transferStock so the source warehouse, destination warehouse and product variant must belong to the same store for user and system callers. Added a focused regression test; not run. Remaining method-level mapping covers catalog/offer/taxonomy, pricing/merchant/store membership, returns/disputes/reviews, carrier/shipping and worker/outbox/bootstrap contexts. No tests or CI were run.

## G-002 method-level predicate batch 2 — Catalog family — 22 November 2026

Mapped CatalogService, CatalogOfferService, ProductGovernanceService and CatalogTaxonomyService. Fixed four defects: variant attribute GET did not bind variantId to authorized productId; addMedia accepted a variant from another product; legacy updateVariant UPDATE omitted productId; createOffer could reference another store's private product. Added three focused regression test files (controller variant-attribute, service media-variant and offer product-scope) plus the prior inventory transfer test. None were run. Remaining service batches: Pricing/Merchant/StoreMembership; Returns/Disputes/Reviews; carrier/shipping; worker/outbox/bootstrap/system contexts.

## G-002 method-level predicate batch 3 — Pricing, Merchant and Store Membership — 22 November 2026

Mapped PricingService, MerchantService and StoreMembershipService to their table operations, caller predicates and controller/service boundaries. Fixed three classes of tenant-boundary defects: pricing tier methods now enforce variant → product → price-list store equality at the service boundary; merchant document listing/download and organization verification listing now require ACTIVE organization membership; document upload now validates caller activeOrg, ACTIVE organization membership, optional store/org consistency and ACTIVE store membership. Organization-scoped store/customer reads now revalidate caller context.

Added focused unit specs for pricing same-store checks and merchant inactive-membership/document-upload checks. Tests are not run. Remaining method-level mapping covers Returns/Disputes/Reviews, carrier/shipping and worker/outbox/bootstrap/system contexts. Service methods still using controller preflight and singleton-helper transaction windows remain explicit design follow-ups; no RLS policy is approved.

## G-002 method-level predicate batch 4 — Returns, Disputes, Reviews and Financial Controls — 22 November 2026

Completed method-level review and targeted corrections. Return inspection inventory candidates are now scoped to warehouses belonging to the return's order store. Settlement adjustment creation validates the actual organization derived from the target sub-order/store and validates returnRequestId → subOrderId; locked transitions and detail reads revalidate the stored org label. Reconciliation discrepancy resolution now uses financialOrgScope and repeats orgId in the UPDATE predicate. Disputes participant checks and Reviews order/subject ownership were reviewed; no new code fix was required. Focused regression specs were added but not run. Remaining method-level families: carrier/shipping and worker/outbox/bootstrap/system. RLS and live DB evidence remain protected gates.

## G-002 method-level predicate batch 5 — Carrier, Shipping, Webhook and Outbox — 22 November 2026

Completed carrier/shipping source review and corrections. Added ACTIVE organization membership checks to shipping, carrier credentials/configuration, shipment operations and recovery routes. Carrier config resolution now verifies store→org and credential→same org/active. Removed Aramex's arbitrary global merchant-credential fallback; store-bound provider calls resolve the store's own configured active credential, while unscoped address validation uses only a PLATFORM credential. Tracking call sites now pass storeId. Worker event metadata is checked against shipment→store→org before provider side effects; inactive webhook credentials are rejected. Focused specs were added/updated but not run. Remaining: worker/outbox/bootstrap/system method predicates, internal caller/transaction propagation, and protected live identity/catalog evidence. No RLS policy is approved.

## G-002 method-level ownership predicate batch 6 — worker/system contexts — 22 November 2026

Closed two source-level correctness gaps found during worker/system context review: ReturnExpirationWorker now carries its lease fence into the actual claim and escalation transactions, and PilotControlService refuses inconsistent store/org allowlist entries. The worker's platform/manual escalation path is independently role-checked. Focused regression tests were added but intentionally not executed. Live runtime identities, protected catalog evidence, RLS design/review and all external release gates remain open.

## G-002 / P13 operational alert delivery ownership — 22 November 2026

The P13 monitor runs on each API instance, so deduplication must cover delivery ownership as well as row uniqueness. Fixed the ON CONFLICT DO NOTHING path to inspect RETURNING and added an atomic SENDING claim with stale-claim recovery. This prevents concurrent monitor instances from delivering the same PENDING/FAILED alert simultaneously and makes abandoned claims recoverable. Added migration 0073 for the operator open-alert index and focused tests; not executed or applied.

## G-002 worker/system/operator context — 22 November 2026

Completed the bounded source review and corrected four concrete gaps: return-expiration lease validation at claim and mutation boundaries; expired worker leases cannot renew or write poll state; pilot allowlist store/org references are verified; and concurrent P13 monitors now coordinate alert delivery through an atomic SENDING claim with stale-claim recovery. Migration 0073 is committed but not applied. Regression tests were added but not executed.

Deferred/remaining:

- OutboxDispatcher is still a log-only sink; a real broker/event bus and delivery contract require an explicit architecture decision.
- Worker/system source review does not substitute for live API/migration role identity evidence or protected catalog inspection.
- Transaction-context propagation, shared singleton helper transaction windows and RLS policy design remain architecture review items; no global interceptor/RLS/grant was implemented.
- Consolidated test/CI/release gate remains open.

| UX-012 | Mobile merchant pricing management and offer linkage | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Merchant mobile had only read-only price-list/tier fetch methods and no pricing route or dashboard entry; offer creation omitted the API-supported priceListId field. Added list/tier CRUD screens, route permission, dashboard entry, price-list selection during offer creation, and linked-price-list navigation from offer detail. |

| UX-013 | Admin order detail product/variant labels | P2 | IMPLEMENTED IN SOURCE — NOT TESTED | Admin order detail previously showed product and variant UUIDs only. AdminService now joins product/variant labels and the Admin UI displays product title, variant title and SKU with UUID fallback. Route permission remains admin:orders:read. |

| UX-014 | Buyer search offers-only filter | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Search result cards already displayed active offer counts and lowest offer price, but there was no server-backed offers-only filter. Added hasOffers=true to API search, with the predicate applied to empty, full-text and exact-SKU paths; added web and mobile filters. |
| UX-015 | Product Studio save and step-transition integrity | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Offer-step navigation previously advanced after failed saves, including progress-stepper clicks; intermediate saves could create offers twice and partial variant retries could duplicate SKUs. Added sequential step navigation, save gating, product-only intermediate persistence, final-review offer creation guard and persisted-SKU rechecks. |
| UX-016 | Buyer cart mutation feedback and recovery | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Cart quantity/remove/clear handlers previously allowed rejected requests to escape without user feedback or pending-state protection; failed validation and fallback reads could be rendered as an empty cart. Added a shared mutation wrapper, action locking, accessible pending labels, error display and retry while preserving the last loaded cart. |
| UX-017 | Admin returns queue/detail read recovery | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Admin return list/detail pages used plain, non-retryable error text; the list could show a stale empty state after failure and overlapping filter requests could overwrite newer results. Added standardized retryable error/loading/empty states, request-version protection and focused recovery tests. |
| UX-018 | Mobile cart line-action concurrency and quantity recovery | P2 | IMPLEMENTED IN SOURCE — NOT TESTED | Mobile cart quantity/remove actions could be triggered repeatedly while requests were pending; the quantity stepper remained editable during mutations and a rejected optimistic text entry could remain visible. Added a shared item-action lock, per-row busy feedback, disabled quantity editor and failure reset. |
| UX-019 | Admin dispute and evidence timeline read recovery | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Dispute detail and Events/Evidence tabs used non-retryable errors; stale requests could update the screen after a tab or route change. Added retryable shared error states, request-version protection and focused recovery tests. |
| UX-020 | Admin user, merchant and organization detail read recovery | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | User/merchant/organization detail reads used non-retryable errors and lacked stale-response protection. Added retryable detail states, request-version guards, and independent permission-catalog retry for user detail. |
| UX-021 | Admin dispute resolution workflow | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Dispute detail exposed overview/events but no resolution form despite the protected resolve API and route permission. Added a required resolution form, guarded PATCH action, progress/error/success feedback and resolved-state rendering. |
| UX-022 | Admin catalog, offer, order and role detail read recovery | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Several Admin detail pages had non-retryable read failures; the import Errors tab and offer Inventory tab silently converted failed reads into empty states; role permission-save errors replaced the whole detail page. Added retryable loads, stale-request guards, explicit tab errors and isolated role mutation feedback. |
| UX-023 | Admin product detail merchant-offer read recovery | P2 | IMPLEMENTED IN SOURCE — NOT TESTED | ProductDetails fetched merchant offers once without retry and displayed a plain error above an empty-state table. Added request-version guarded reload, loading skeleton, explicit retryable error and true-empty state. |
| UX-024 | Admin financial list read/action error separation | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Payments, settlements, reconciliation and settlement-adjustment list reads had no retry; read and action errors shared state, sometimes hiding financial context or presenting failed reads as empty. Added separate load/detail/action errors, retry controls, stale-request protection and recovery tests. |
| UX-025 | Product Studio existing-product updates and canonical identifiers | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Product Studio created a product only once and later saves did not update edits made after navigating back. The create payload also omitted supported GTIN/EAN/MPN/productTypeId fields. Added updateProduct with optimistic updatedAt, identifier/product-type persistence on create/update, and save identity validation. |
| UX-027 | Product Studio uploaded media persistence and retry idempotency | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Product Studio uploaded media objects to storage but did not create product-media records, leaving uploaded images unattached. Added final-save media persistence with existing-media recheck so retries after partial failure do not duplicate records. |
| UX-026 | Product Studio canonical product reuse and ownership boundary | P1 | IMPLEMENTED IN SOURCE — NOT TESTED | Selecting an existing canonical product still entered the create path, risking duplicate products; the selected variant was not attached to the offer and shared identity/specification/media could be edited from the merchant workflow. Added canonical-ID precedence, product/variant reuse, variant-scoped offers and read-only shared catalog steps. |

## UX-015 — Product Studio save and step-transition integrity — 22 November 2026

- The Offer → Media transition now requires a store and nonblank product title, waits for the product-only save, and advances only when a product ID is returned. A failed save leaves the user on the Offer step with the existing error message visible.
- The intermediate save creates the product, attributes and missing variants but does not create the commercial offer. The final Review action creates the offer once, preventing the previous Offer-step save + Review save double-creation path.
- Before retrying variant creation, the hook reloads persisted variants and skips SKUs already created by a partially completed save. The dirty-state baseline now reflects the actual saved wizard state, and the save callback tracks its brand/offer state dependencies.
- Next is disabled while a save is in progress. Focused helper tests cover failed-save blocking, required identity, successful advance, in-flight blocking and already-created product behavior. Tests have not been executed; the comprehensive campaign remains deferred.

## UX-016 — Buyer cart mutation feedback and recovery — 22 November 2026

- Quantity, remove and clear actions now run through a shared mutation helper that reports API errors, serializes concurrent cart mutations, refreshes after success and always releases the pending state.
- Quantity controls and remove actions expose accessible labels; pending quantity/remove/clear operations show progress feedback. Promo application and checkout navigation are blocked while another cart mutation is in flight.
- Cart loading falls back from validation to the plain cart read, clears stale validation warnings on fallback, preserves the last successfully loaded cart if both reads fail, and shows an explicit retryable error rather than falsely presenting an empty cart.
- Added focused tests for successful refresh, mutation failure feedback and pending-state cleanup. Tests have not been executed; comprehensive validation remains deferred.

## UX-017 — Admin returns queue/detail read recovery — 22 November 2026

- The Admin returns queue now clears prior errors on retry, shows a shared retryable error state instead of an empty table on failure, and ignores obsolete responses after filter changes/unmounts through a request-version guard.
- Return detail now uses the shared loading skeleton, retryable error state and explicit not-found state. Its load callback is awaitable so the resolution workflow waits for the updated return read before leaving its submission path.
- Added focused Admin tests for queue and detail error → retry → success behavior. Tests have not been executed; consolidated validation remains deferred.

## UX-018 — Mobile cart line-action concurrency and quantity recovery — 22 November 2026

- Mobile cart quantity updates and item removal now share an in-flight lock, preventing overlapping line mutations. The active row displays progress and all cart mutations are disabled while an item/promo/clear action is pending.
- QuantityStepper now accepts an optional enabled flag (default remains enabled for existing callers) and disables both increment/decrement controls and direct text entry when the cart is busy.
- A failed quantity mutation invalidates cart data and recreates the stepper from the last provider value so an optimistic text entry is not left looking accepted.
- Added Flutter widget tests for disabled and default-enabled QuantityStepper behavior. Tests have not been executed.

## UX-019 — Admin dispute and evidence timeline read recovery — 22 November 2026

- Dispute detail reads now use an awaitable retry callback, clear prior errors, and ignore obsolete responses after route/permission changes or unmounts.
- Events/Evidence reads now have their own request-version guard, clear stale timeline entries before a new request, and expose the shared retryable error state. Obsolete requests cannot repopulate the timeline after leaving the tab.
- Added focused Admin tests for detail retry and Events/Evidence retry. Tests have not been executed.

## UX-020 — Admin user, merchant and organization detail read recovery — 22 November 2026

- User, merchant and organization detail pages now use awaitable load callbacks, clear prior errors, and ignore obsolete responses after route/permission changes or unmounts.
- User detail separates the primary user read from the effective-permission catalog read: a permissions outage no longer hides otherwise available user details, and the Permissions tab has its own retryable error state.
- Merchant and organization detail errors now expose the shared retry action. Added focused Admin tests for all three detail recovery paths. Tests have not been executed.

## UX-021 — Admin dispute resolution workflow — 22 November 2026

- The Admin dispute detail page now exposes a Resolution section for disputes that are not already RESOLVED/CLOSED. It requires a nonblank resolution explanation (maximum 4,000 characters) and calls the existing `PATCH /v1/disputes/:id/resolve` contract with `{ resolution }`.
- The submit action is disabled for empty input or while in flight, shows progress and API errors, reloads the dispute after success, and displays the stored resolution for resolved/closed disputes instead of an editable form.
- The API permission `support:disputes:resolve` and service-level platform-admin check remain authoritative; this UI does not bypass either. No refund amount/return link fields were invented because the current controller contract exposes only the resolution text.
- Added a focused Admin component test for the protected resolution request. Tests have not been executed.

## UX-022 — Admin catalog, offer, order and role detail read recovery — 22 November 2026

- Attribute, brand, import-job, offer, order, role, variant, category and product-type detail pages now expose retryable primary-read errors. The main loaders use request-version guards where refactored so obsolete requests cannot overwrite current route data.
- Catalog-import Errors and Offer Inventory tabs now distinguish a failed read from a genuinely empty result and expose their own retry actions. Previously, import errors could appear as “No errors” after a failed request, and inventory failures looked like no inventory.
- Role permission update errors are now isolated as an inline action error; they no longer replace/hide the loaded role detail. Copy was corrected to match the explicit Save Permissions action.
- Added focused Admin tests for attribute retry, order retry and import-error-tab retry. Tests have not been executed.

## UX-023 — Admin product detail merchant-offer read recovery — 22 November 2026

- ProductDetails now loads merchant offers through an awaitable callback with request-version protection. Retry clears stale error/data, shows a loading skeleton and ignores obsolete completions after product changes/unmount.
- A failed offers read now displays the shared retryable error state; only a successful empty response displays “No merchant offers yet.”
- Added a focused ProductDetails component test for failed offer read → retry → empty-success state. Test has not been executed.

## UX-024 — Admin financial list read/action error separation — 22 November 2026

- Payments and Settlements now separate list-read errors from mutation errors, expose a Retry action for failed reads, and hide empty states while a read is unavailable. Request-version guards prevent older tab/filter responses from overwriting current data.
- Reconciliation now separates run-list, selected-run detail and action errors. Both list and detail reads can be retried; run-list requests are guarded against stale responses. Run/resolve failures remain action errors and do not replace read state.
- Settlement Adjustments now separates list-read and workflow-action errors, exposes Retry, ignores stale filter responses and hides the no-adjustments state after a failed read.
- Added focused Admin tests for payment queue, settlements, reconciliation and settlement-adjustment read failure → retry → successful empty results. Tests have not been executed.

## UX-025 — Product Studio existing-product updates and canonical identifiers — 22 November 2026

- Product Studio now creates the product once and calls the existing `updateProduct` API on subsequent saves, so identity edits made after navigating back are persisted rather than silently ignored.
- The wizard stores the product `updatedAt` returned by create/update and sends it on later PATCH requests to preserve the API's optimistic-concurrency contract.
- Create/update payloads now include product type and canonical GTIN/EAN/MPN fields supported by the API contract. The save routine validates store and title even when invoked from final Review.
- Added a focused transition regression case for failed updates of an already-created product. Tests have not been executed.

## UX-026 — Product Studio canonical product reuse and ownership boundary — 22 November 2026

- Selecting an existing canonical product now takes precedence over any stale wizard product ID. The merchant workflow reuses that canonical product rather than creating a duplicate or PATCHing shared catalog data.
- Shared identity, specification and media steps are read-only for canonical products. Existing product selection resets stale wizard-owned product/variant/media state. The selected existing variant is passed to the merchant-offer create request when one is chosen; product-level offers remain supported when no variant is selected.
- The hook clears the offer-creation retry marker when the selected canonical product changes, preventing a prior target's idempotency marker from suppressing a new offer.
- Added unit coverage for canonical target precedence. Tests not executed.

## UX-027 — Product Studio uploaded media persistence and retry idempotency — 22 November 2026

- Product Studio now creates product-media records for uploaded/linked media during final save using the existing `fetchProductMedia` and `addMedia` API contracts.
- Before insertion it re-reads the product's media and skips already-persisted URLs. A retry after partial failure therefore does not create duplicate media records.
- Media is persisted only for merchant-owned products; canonical product media remains untouched. Added unit coverage for deduplication and empty-media no-op. Tests not executed.

## UX-027 retry-safety continuation — 22 November 2026

The three source commits `d65b1eaf3f2098167c1c404fc7f96f54716d9af4`, `43d38171ad8315d1f3662db4f2ac8528db0c7bb0` and `9ce77fe3076adeafd58c26cb898bb1c5722d3baf` complete the documented Product Studio retry-safety increment: retry identity is store/product/variant scoped, uncertain create responses are reconciled with existing store offers, and a nullable legacy price cannot falsely match a desired priced offer. These source changes have focused unit coverage, not executed. This is a client retry-reconciliation safeguard, not a claim of server-side atomic idempotency across concurrent clients.

## UX-028 — Mobile buyer return lifecycle parity — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Source audit confirmed the buyer order-detail flow on Web could create a P13 return, while Flutter exposed no return action or buyer return API methods.
- Flutter now exposes the same three reason values and order-item quantity selection, but only to the authenticated buyer who owns the loaded sub-order and only for DELIVERED/COMPLETED orders.
- The mobile client uses existing `GET /v1/returns/my`, `GET /v1/returns/:id`, `POST /v1/returns`, `POST /v1/returns/:id/cancel` and `POST /v1/returns/:id/shipped` contracts. It displays active return status and supports buyer cancel and shipped transitions at the states already allowed by the service.
- Create timeouts reconcile through the buyer-scoped return list before any further action; the UI never blindly retries a possibly committed create. The API remains authoritative for ownership, payment/return-window eligibility, one-active-request and cumulative item quantities.
- Added model/API contract tests in `mobile/test/returns_api_test.dart`; implementation commit `d7ffc3339db78f16e0f8a9aa7cb551ea28fabdcf`. They have not been executed. No new route, permission key, API behavior, schema or migration was introduced.

## UX-029 — Mobile buyer return detail and lifecycle-event parity — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Web `apps/web/src/app/returns/[id]/page.tsx` presents buyer return details, requested/actual refund, inspection and merchant notes, item details and ordered lifecycle events.
- Mobile initially exposed a summary despite the existing buyer-authorized `GET /v1/returns/:id` contract returning the full request, return items and events.
- Flutter now opens a retryable detail sheet from active and most-recent terminal return summaries on the existing Order Detail screen. It displays status, reason/description, requested and actual refund, tracking, inspection condition/notes, merchant notes, item quantities/conditions and chronological event history.
- Extended `ReturnRequest` parsing and focused assertions in `mobile/test/returns_api_test.dart`. Tests have not been executed.
- No new API, route, permission, schema or database behavior was introduced. API ownership/detail authorization is unchanged.

## UX-030 — Web buyer self-service read and action recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Source inspection found Notifications, Favorites and Saved Suppliers silently swallowed initial read failures, then rendered the same empty state used for a successful empty response. Their remove/read mutations also swallowed errors.
- Profile Sessions already retained an error message but offered no retry and could display the empty-session message after a failed initial read.
- Implemented explicit retryable read errors on all four pages. A failed read no longer becomes a false empty result. Favorite/supplier remove failures are shown while preserving the row; action buttons show a pending state. Notification mark-read failure restores the original `readAt` and `status` after its optimistic update and surfaces the failure.
- Added focused tests for read failure/retry across all four pages and failed favorite removal. Tests have not been executed.
- No API, permission, route, schema, migration or database changes.

## UX-031 — Web Merchant Customers read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Source audit found `apps/web/src/app/merchant/customers/page.tsx` silently swallowed `fetchMerchantCustomers` failures and rendered “No customers yet,” conflating service/network failure with a successful empty customer directory. Manual/realtime refresh failures were equally silent.
- Added a distinct read-error state with Retry. Failed refreshes preserve the last successful customer rows; only a successful empty response renders the empty-directory state.
- Added focused tests for initial read failure/retry and stale-data preservation after a failed refresh. Tests have not been executed.
- No API, permission, route, schema, migration or database change.

## UX-032 — Web Merchant Deliveries read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Source inspection found the Merchant Deliveries queue displayed an error message but offered no retry; when no rows were loaded it could also render “No deliveries yet” beside a failed request.
- Reused the existing shared `ErrorBanner` with Retry and suppressed the empty queue state while a read error is active. The existing load routine retains the last successful rows if a refresh fails.
- Added a focused Web test for initial failure/retry. Not executed.
- No API, permission, route, schema, migration or database change.

## UX-033 — Web Merchant Returns store selection and recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Replaced the manually typed Store ID with the authenticated store directory, selecting the first available store by default and allowing store switching.
- Added retryable store-directory and return-list errors, status filtering, successful-empty-only rendering and stale-request cancellation/version protection.
- Added retry to Merchant Return Detail.
- Existing API contracts remain authoritative: list requires `merchant:orders:read` and storeId; return transitions require `merchant:orders:write`. No API permission or server authorization was weakened.
- Added focused list/detail recovery tests. Not executed.

## UX-034 — Merchant Organization auxiliary read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Replaced silent catches with independent retryable states for verification history, update-request history, store information, warehouses and organization roles; member reads now expose Retry.
- Last successful auxiliary data is retained on refresh failure. A failed update-request read blocks verified-organization change submission until pending-request state is known.
- Role loading exposes retry and stops automatic retries after failure. Primary profile/organization read failure no longer appears as “No organization yet.”
- Added focused organization recovery tests. Not executed. No API, route, permission, schema or database changes.

## UX-035 — Merchant Orders store/queue read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- The initial store-directory failure was swallowed and could leave the page presenting a false empty order queue. The queue also lacked a retry action and did not render its loading state.
- Store discovery now has an explicit error/retry path; order reads have Retry; loading is visible; the “No orders yet” state appears only after a successful empty read.
- Retrying an order read reuses the selected store. If no accessible store remains, stale store/order selection is cleared.
- Buyer-name enrichment remains intentionally best-effort and degrades to the buyer ID; it does not block order visibility.
- Added `merchant-orders-recovery.test.tsx`. Not executed. No API permission or transition behavior changed.

## UX-036 — Merchant Offers list and analytics read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Store discovery failures previously left the offers list loading indefinitely; an empty accessible-store list also had no distinct state.
- Offer-list, product-directory and analytics reads now have separate error/retry handling. Product selection and offer creation are blocked while the product directory is unavailable.
- Failed analytics no longer silently becomes zero orders/units/revenue in the table or CSV; unavailable values are shown blank in CSV and as an em dash in the table. Trend failures have Retry and no longer render “No sales in this range.”
- Successful empty responses remain distinct from failed reads. No API, permission, schema or DB behavior changed.
- Added `merchant-offers-recovery.test.tsx`. Not executed.

## UX-037 — Merchant Inventory movement-history read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- The stock movement-history dialog swallowed read failures and cleared movements, then rendered “No movements recorded yet,” conflating an unavailable history with a successful empty history.
- Extracted the history read into `apps/web/src/lib/inventory-history.ts`, returning an explicit error alongside movements. The dialog now shows the error and a Retry action; only a successful empty response renders the empty-history message.
- Added `inventory-history-recovery.test.ts` for success/empty versus failed-read distinction. Not executed. No API, permission, schema or DB change.

## UX-038 — Merchant Inventory variant-directory completeness and retry — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- The variant picker loaded products and their variants in two phases, but each product's variant request used `.catch(() => [])`. A partial API failure therefore appeared as a successful but incomplete variant directory, potentially hiding selectable SKUs.
- Extracted the paginated read into `apps/web/src/lib/merchant-inventory-variants.ts`. Any product-page or variant request failure now fails the read visibly instead of silently dropping one product's variants.
- The Inventory dialog clears stale picker data while loading, ignores obsolete requests after store changes/unmount, and offers an explicit Retry variants action. Opening the dialog no longer clears a failed-read state and turns it into a false empty result.
- Added `merchant-inventory-variants.test.ts` for pagination, a genuine empty product directory, and partial variant-request failure. Tests have not been executed. No API, permission, schema or database behavior changed.

## UX-039 — Merchant Import History store and job read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Store discovery failures were swallowed, leaving Import History without a retry path and potentially loading indefinitely. A merchant with no store also had no explicit onboarding state.
- Store discovery now has independent loading/error/retry/no-store states. A successful empty store directory renders an onboarding prompt and does not expose an import action that cannot succeed.
- Import-job reads now distinguish failed reads from a successful empty history, preserve existing rows during refresh failures, and provide Retry. Polling runs only while a known job is active and avoids overlapping requests; request identity guards prevent stale responses from replacing current state.
- Added `merchant-import-history-recovery.test.tsx` for store lookup retry, failed job read/retry, and the no-store state. Tests have not been executed. No API, permission, schema or database behavior changed.

## UX-040 — Merchant Import Wizard store discovery recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- The Import Wizard silently swallowed `fetchMyStores` failures. The upload step displayed “No store found” for both an actual empty directory and a failed request, offered no retry, and left the next action disabled without explaining how to recover.
- Store discovery now has independent loading, retryable error and true no-store states. A successful empty directory offers the existing store-onboarding route; a failed read offers Retry store lookup. The import action remains disabled until a store is actually resolved.
- Added `merchant-import-wizard-store-recovery.test.tsx` for failed lookup/retry and a successful empty directory. Tests have not been executed. No API, permission, schema or database behavior changed.

## UX-041 — Merchant Import Wizard processing lifecycle and outcome correctness — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- The status poll started before the process request completed, allowing a fast terminal poll to set the review step and then be overwritten by a later progress-step update. Poll errors were silently ignored, polling was not cleaned up on unmount, and every terminal job with stats was rendered as “Import Complete”, including FAILED jobs.
- Processing now starts polling only after the process request succeeds. Polling is generation-guarded, prevents overlapping reads, is cancelled on unmount, surfaces status-read errors with a retry action, and cannot apply stale responses after a terminal state.
- Terminal outcomes are classified explicitly: only COMPLETED is success; FAILED and CANCELLED have distinct result states. Partial counters remain visible for failed/cancelled jobs without presenting them as successful completion.
- Added `import-job-outcome.ts` and `import-job-outcome.test.ts` for terminal-state classification. Tests have not been executed. No API, permission, schema, queue, worker or database behavior changed.

## UX-042 — Merchant Warehouses store and directory read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Store-directory errors were caught and stored in the generic error state, but the page then rendered the same “No store found” onboarding state as a successful empty store list. There was no store lookup retry.
- Warehouse-list failures used the generic action error state and still rendered “No warehouses yet,” conflating failed reads with successful empty directories. There was no retry action or independent list loading state.
- Store discovery now has explicit loading/error/retry/no-store states. Warehouse reads have independent loading/error/retry handling, request-version protection and a successful-empty-only state. Existing rows are retained if a later refresh fails.
- Added `merchant-warehouses-recovery.test.tsx` for store lookup retry, warehouse list retry/empty-state suppression and the true no-store state. Tests have not been executed. No API, permission, schema or database behavior changed.

## UX-043 — Admin Dashboard independent read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Dashboard KPI and pending-organization-update requests silently swallowed failures, leaving zero/default KPI values or a false “No pending update requests” state. Catalog Imports and Catalog Requests shared one error/loading state, so one failure could obscure the other and both widgets could show false empty results.
- Added independent loaders, error states, retry actions and request-version guards for KPIs, organization updates, catalog imports and catalog requests. A failed KPI read now displays an unavailable placeholder rather than fabricated zero values; previously loaded KPI/list data remains visible during failed refreshes.
- Each catalog widget now reports its own error and suppresses its empty state only when its own read failed. The other widget remains independently usable.
- Added `admin-dashboard-recovery.test.tsx` covering independent failures, retry and empty-state suppression. Tests have not been executed. No API, permission or backend behavior changed.

## UX-044 — Admin KPI Dashboard read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- The dedicated Admin KPI Dashboard silently swallowed `fetchKpis` failures. The page showed a generic failure message but had no retry action, and overlapping date-range requests could complete out of order.
- Added explicit retryable error state and request-version protection. A failed refresh preserves the last successful KPI dataset and displays an error warning; an initial failure shows unavailable data rather than fabricated values and offers Retry KPIs. The period subtitle distinguishes an unavailable period from an active load.
- Added `admin-kpi-recovery.test.tsx` for initial failure/retry and suppression of fake zero values. Tests have not been executed. No API, permission or backend behavior changed.

## UX-045 — Admin Organizations independent list/update-request recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- The Organizations page loaded the organization directory and organization-update review queue through one `Promise.all`. Failure of either request prevented both datasets from loading, and the shared error state allowed a failed directory read to appear as an empty list.
- Split organization and update-request reads into independent loaders with separate loading/error/retry states and request-version guards. Each list now suppresses its empty state only when its own read failed; a successful list remains usable if the other endpoint fails. Last successful rows remain visible after failed refreshes.
- Added `admin-organizations-recovery.test.tsx` for independent failure, retry and empty-state suppression. Tests have not been executed. No API, permission or backend behavior changed.

## UX-046 — Admin User Management lifecycle completeness — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- The Create User form marked phone required although the API DTO and service allow it to be omitted. Organization and role lookups silently converted failures into empty arrays, and the UI allowed an organization or role to be selected independently even though the service only creates a membership when both are present.
- The form now treats phone as optional, loads organizations and roles independently with visible retryable errors, and requires the initial organization/role pair to be both selected or both omitted. The API service now rejects incomplete pairs with `BadRequestException` instead of silently creating an unassigned user; unit tests cover both partial-pair directions.
- The dedicated User Detail page now exposes profile editing through the existing audited `PATCH /admin/users/:id/profile` contract, membership assignment/removal through the existing `admin:users:write` actions, and status controls with explicit confirmation for suspension/deactivation.
- The former “Effective Permissions” tab incorrectly called `GET /admin/permissions`, which returns the global permission catalog. It now shows permissions configured on each membership's role via the existing `GET /admin/roles/:id` contract and explicitly states that this is not a live authorization decision.
- Added focused tests: `admin-create-user-recovery.test.tsx`, `admin-user-role-permissions.test.tsx`, and API `admin-user-creation.spec.ts` additions. Tests have not been executed. No new endpoint, permission, schema, migration or database behavior was introduced.

## UX-047 — Admin Merchant Store Detail completeness — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- The existing store detail API already returned logo/cover URLs, address, locale and the popularity-badge visibility setting, but the detail page omitted most of that operational context.
- The overview now displays locale and popularity-badge visibility, a dedicated branding section with logo/cover previews, and a structured store-address section. The technical tab now labels the identifier as Store ID and includes organization/store identifiers.
- Added `admin-merchant-detail.test.tsx` against the existing `GET /admin/merchants/:id` contract. Test has not been executed. No API, permission, schema, migration or database change.

## UX-048 — Admin Roles List retry and request lifecycle — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- The Roles list displayed a terminal error with no retry action and did not guard the read against stale completions/unmount.
- Added a reusable load callback, Retry action through the existing detail error component, and request-version protection. Tests have not been executed.
- Added `admin-roles-recovery.test.tsx`. No API, permission, schema or database change.

## UX-049 — Admin Audit Log query ordering and recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Audit Log filter changes can issue overlapping requests. Responses were applied without request identity checks, so an older filter response could overwrite a newer result. The error banner had no direct retry action, although the page Refresh control could repeat the read.
- Added request-version guards for result, total, error and loading updates, including invalidation on effect cleanup/unmount. The error banner now exposes an explicit Retry audit log action. Last successful rows remain visible while a refresh is in progress or fails.
- Added `admin-audit-race.test.tsx` for out-of-order responses and failed-read retry. Tests have not been executed. No API, permission, schema or database change.

## UX-050 — Admin Category Detail auxiliary read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Category Detail swallowed failures from linked product-type, direct/descendant product and per-product-type attribute-schema reads. Those failures could render incomplete/empty panels as though the data were successfully empty; the Attributes tab could also be opened before its linked product-type list had been loaded.
- Added independent loading/error/retry states and request-version guards for the auxiliary reads. The Attributes tab now loads its linked product types itself and treats schema collection as a complete operation; a partial schema response is not presented as a complete attribute union. Empty states are rendered only after successful reads.
- Added `admin-category-detail-recovery.test.tsx` for failed product read, empty-state suppression and retry. Test not executed. No API, permission, schema or database change.

## UX-051 — Admin Product Type Detail product read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Product Type Detail swallowed failures from its Products tab request and displayed “No products” as though the read had succeeded.
- Added a distinct retryable product-read error state, successful-empty-only rendering, request-version protection and cleanup on tab change/unmount. Last successful rows remain available during a failed refresh.
- Added `admin-product-type-products-recovery.test.tsx`. Test not executed. No API, permission, schema or database change.

## UX-052 — Admin Catalog Import history read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Catalog Import Center used the generic action error for import-list failures, offered only Dismiss, and still rendered “No imports yet” after a failed history read. Concurrent refreshes had no request identity guard.
- Added a separate import-history error state, explicit Retry imports action, successful-empty-only rendering, stale-row preservation and request-version/unmount protection. Upload/execute/report errors remain separate action feedback.
- Added `admin-catalog-import-recovery.test.tsx`. Test not executed. No API, permission, schema or database change.

## UX-053 — Admin Analytics request ordering and recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Analytics date-range and activity-limit changes could overlap, and older responses could overwrite newer results. Error messages had no direct retry action.
- Added independent request-version guards for event counts and activity, cleanup invalidation on tab/filter changes and unmount, explicit Retry events/Retry activity actions, and non-mutating event sorting. Failed refreshes retain last successful data.
- Added `admin-analytics-race.test.tsx` for out-of-order date-range results and retry. Test not executed. No API, permission, schema or database change.

## UX-054 — Admin Commission Oversight read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Commission reversal reads had no request ordering guard; overlapping status-filter reads could overwrite newer results. Failed reads showed the error and also rendered “No commission reversals found.”
- Added request-version protection, unmount/filter invalidation, explicit Retry commission reversals, and successful-empty-only rendering. Last successful rows remain visible during failed refreshes.
- Added `admin-commission-recovery.test.tsx`. Test not executed. No API, permission, schema or database change.

## UX-055 — Admin Offer KPI and Trend read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Offer KPI and Trend filter requests could overlap and older responses could replace newer results. Errors had no direct retry. Offer KPI showed a fabricated zero count when no response had loaded, and both tables could display “No offer-backed sales” after a failed initial read.
- Added request-version guards, cleanup invalidation, retry actions and successful-empty-only table states. Offer KPI now shows an unavailable placeholder until data exists; Trend labels an unavailable period accurately. Last successful data remains visible on refresh failure.
- Added `admin-offer-kpis-recovery.test.tsx` and `admin-offer-trend-recovery.test.tsx`. Tests not executed. No API, permission, schema or database change.

## UX-056 — Admin Brands list recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Brand list failures were visible but had no direct retry action, and the table could still render “No brands found.” Filter changes had no request-version guard.
- Added Retry brands, request-version/unmount protection and suppression of the empty state after a failed initial read. Last successful brands remain visible during failed refreshes.
- Added `admin-brands-recovery.test.tsx`. Test not executed. No API, permission, schema or database change.

## UX-057 — Admin Business Calendar read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Calendar configuration, holiday and audit reads were coupled. A failed initial calendar read could also render “No business calendar configured”; failures had no retry action. Holiday/audit empty states could be misleading after a failed dependent read, and requests had no stale-response guard.
- Added request-version protection, explicit Retry calendar, error-aware suppression of the no-calendar/empty holiday/empty audit states, and cleanup invalidation. Calendar list, holidays and audit still use the existing endpoints; no new API contract.
- Added `admin-calendar-recovery.test.tsx`. Test not executed. No API, permission, schema or database change.

## UX-058 — Admin Attribute Groups and Definitions read recovery — 22 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Attribute Groups and Attribute Definitions already exposed retry buttons, but their failed reads could still render empty result rows/counts. Attribute Definitions also issued overlapping filter requests without guarding stale completion.
- Added request-version guards and cleanup invalidation to both pages, role-aware read guards, explicit alert semantics, and suppression of empty-result rows/counts after failures. Last successful data remains visible during failed refreshes.
- Added `admin-attribute-groups-recovery.test.tsx` and `admin-attributes-recovery.test.tsx`. Tests not executed. No API, permission, schema or database change.

## UX-078 — Mobile Buyer Store read recovery — 23 November 2026

Source-confirmed gap closed in implementation: buyer Store Directory lacked stale-data-safe refresh and Store Detail used a FutureBuilder without retry/refresh. Both now preserve last successful data, expose retry and explicit refresh/pull-to-refresh, and distinguish initial read failure from successful empty results. The Store Detail provider retains the ACTIVE-only buyer catalogue contract. Focused Flutter tests are added but remain TESTING_PENDING. No API, permission, database, migration, staging or provider behavior changed.

## UX-079 — Mobile Buyer Order History recovery — 23 November 2026

Source-confirmed gap closed in implementation: buyer order history did not preserve the previous list during refresh, pull-to-refresh did not await the provider, and refresh failure was not distinguished from current results. The screen now retains last-successful data, preserves the selected filter, exposes retry and refresh, and keeps initial failure separate from a successful empty history. Focused Flutter tests are added but remain TESTING_PENDING. No order/payment/fulfillment/API/database behavior changed.

## UX-080 — Mobile Search facets and request ordering — 23 November 2026

Source-confirmed gaps closed in implementation: selected attribute facet values were not sent to the existing API `attrFilters` parameter, and overlapping search requests could complete out of order. Mobile now serializes the supported filter contract, guards requests by generation and search key, preserves matching results during refresh, and avoids showing old-query results as current. Focused API-client and widget tests are added but remain TESTING_PENDING. No backend route/SQL/database change.

## UX-081 — Mobile Product Detail stable reads — 23 November 2026

Source-confirmed gap closed in implementation: the Product Detail inline FutureBuilder recreated the main product request on each stateful rebuild; initial product failure lacked retry/refresh; auxiliary variant/offer/review failures were hidden. A stable product-ID provider, stale-data-safe refresh, retryable initial and auxiliary reads, and route-reuse request guards are implemented. Focused Flutter tests are added but remain TESTING_PENDING. No backend/API route/database behavior changed.

## UX-082 — Mobile Notifications recovery — 23 November 2026

Source-confirmed gaps closed in implementation: notification refresh/realtime invalidation discarded the last successful inbox; individual mark-read failures escaped without user feedback. The screen now preserves stale data through refresh failure, exposes retry/refresh, distinguishes initial error from empty inbox, and guards individual/Mark All Read actions with progress and feedback. Focused Flutter tests are added but remain TESTING_PENDING. Realtime and notification API contracts unchanged.

## UX-083 — Mobile Home discovery recovery — 23 November 2026

Source-confirmed gaps closed in implementation: Home discovery sections silently disappeared on initial read errors, refresh returned before providers completed, and unread-count failure was represented as zero. Categories, Popular Products and Suppliers now have explicit loading/error/retry and stale-data handling; home refresh awaits independent reads; unread count remains unknown until successfully loaded. Focused Flutter tests are added but remain TESTING_PENDING. No API/permission/role/database behavior changed.

## UX-084 — Mobile Checkout idempotency key lifecycle — 23 November 2026

Source-confirmed correctness gap closed in implementation: changing payment method after preview altered the checkout payload but reused the previous idempotency key. The key now rotates on payment-method changes and remains stable for identical retries. Focused Flutter test is added but remains TESTING_PENDING. No backend idempotency/API/database behavior changed.

## UX-085 — Mobile Merchant Dashboard recovery — 23 November 2026

Source-confirmed gaps closed in implementation: dashboard refresh returned before independent reads completed, and profile/active-store refresh failures did not preserve last-successful context. The dashboard now has stale-safe profile/store reads, retry, awaited independent refresh and pull-to-refresh. Focused Flutter test is added but remains TESTING_PENDING. Existing KPI recovery and permission gating are unchanged.

## UX-086 — Mobile Merchant Catalog recovery — 23 November 2026

Source-confirmed gaps closed in implementation: product pull-to-refresh invalidated without awaiting; active-store/product reads did not preserve stale data on refresh failure; initial errors and successful empty catalogues needed explicit separation. The screen now awaits current-store refresh, preserves last-successful product rows and filters, and exposes retry. Focused Flutter tests are added but remain TESTING_PENDING. Permission gates and catalog API contract unchanged.

## UX-087 — Mobile Merchant Offer Detail recovery — 23 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- The offer detail screen now preserves the last successful offer and metrics during failed refreshes, exposes retry for initial offer errors, and keeps analytics/trend reads independent from the primary offer read.
- Analytics failures are presented as unavailable rather than being interpreted as zero sales; trend data is refreshed with the selected offer/date configuration.
- Added focused Flutter widget coverage for stale offer/analytics preservation and initial failure/retry. Test commit: `910466470d28c7d1eec08c80db47a74b6727f3bc`. Not executed. No API, permission, pricing or offer lifecycle contract changed.

## UX-088 — Mobile Merchant Inventory read recovery — 23 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Active-store refresh now precedes inventory/warehouse refresh; failed store refreshes retain the last successful store. Inventory and warehouse reads have independent retry/error states.
- Failed inventory refreshes preserve the last successful page; empty inventory remains pull-to-refreshable and appears only after a successful response. Warehouse lookup failures are explicit and explain that transfer actions depend on a successfully loaded directory.
- Added Flutter widget coverage for stale inventory preservation, warehouse retry and initial store lookup recovery. Source commit: `df5a171762a5f6a5b365a13f491a975d4c6e9aa8`; test commit: `fe508b0d30c791fb7597ec7f1c95d6b6968461b4`. Not executed. No API, permission, stock mutation, warehouse transfer, database or migration behavior changed.

## UX-089 — Mobile Merchant Pricing list and detail recovery — 23 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Pricing list and Price List Detail now preserve last-successful price-list/tier data through refresh failures, expose retryable initial errors and await explicit/pull-to-refresh operations.
- Store, price-list, detail and tier reads remain independent. A failed initial tier read is shown as unavailable rather than a fabricated zero tier count; successful empty list/tier states remain scrollable and refreshable.
- Four focused Flutter widget scenarios were added. Source commits: `9b0393a`, `3b76bf4`, `0fd2622`, `fd3b94b`; test commits: `2f112e9`, `a03c23f`. Not executed. No pricing API, commercial, permission, database or migration behavior changed.

## UX-090 — Mobile Merchant Customers read recovery — 23 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P2.**

- Customer directory now preserves last-successful rows and derived statistics during refresh failures, supports awaited explicit/pull-to-refresh, exposes retryable initial errors and distinguishes successful empty/no-match states from failures.
- Search and sort behavior and the existing customer API contract are unchanged.
- Focused Flutter widget tests cover stale data/statistics and initial failure/retry. Source commit: `b279c263`; test commit: `3f3b0f6`. Not executed. No API, permission, order, financial, database or migration behavior changed.

## UX-091 — Mobile Merchant Orders refresh lifecycle — 23 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- The merchant order queue already retained last-successful rows on refresh failure, but explicit refresh did not await the active-store/order dependency and no pull-to-refresh was available. A successful empty queue was not scrollable.
- Refresh now awaits active-store resolution and the dependent order read without a duplicate request. The queue and successful empty state are always-scrollable and wrapped in RefreshIndicator; stale data/error messaging remains intact.
- Three focused Flutter widget scenarios cover stale order preservation, initial error/retry and pull-to-refresh failure while the queue is successfully empty. Source commits: `da19ca1`, `9ecce8a`; test commits: `112bf00`, `b8c7b1c`. Not executed. No order transition, fulfillment, stock reservation, API, permission, database or migration behavior changed.

## UX-092 — Mobile Merchant Store Profile and warehouse recovery — 23 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1.**

- Store Profile refresh now awaits the organization store-directory read and the dependent active-store value before refreshing the current store's warehouse directory. The profile form supports pull-to-refresh and preserves last-successful store details during refresh/reload failure.
- Warehouse directory failures now have retry and stale-data handling; the successful empty state is shown only after a successful read.
- Three focused Flutter widget scenarios cover stale store preservation, warehouse retry and initial store lookup recovery. Source commit: `bfb820e`; test commit: `90b2b6b`. Not executed. No store update, warehouse creation, permission, API, database or migration behavior changed.

## UX-093 — Organization and authenticated-session context invalidation — 23 November 2026

**Status: IMPLEMENTED — TESTING_PENDING. Priority: P1 / tenant-context correctness.**

- Organization switching now invalidates the complete organization-scoped client read cache after the new access token is persisted/installed and the active organization is updated. Both the Organizations list and Organization Detail switch flows use the shared invalidation helper.
- Active-store resolution is explicitly filtered by the selected active organization and returns null if no store belongs to that organization; it never falls back to the first store from another org.
- New login clears the persisted active organization before saving the new user's token, resets in-memory phone/email/org identity, and invalidates authenticated reads. Logout resets the same identity and authenticated cache set; AuthStorage logout already clears the persisted org id.
- Focused ProviderContainer tests cover active-store org matching, organization-scoped invalidation while preserving buyer-order cache on org-only switch, and session reset invalidating user-level data. Source commits include `b49424e`, `3f4a6a3`, `1f29e7c`, `cd04739`, `fc1f22a`, `b416041`; test commits `a0f308c` / `d0d0b26`. Not executed.
- No API/backend authorization, permission, DB, migration, RLS, worker or staging behavior changed.

## UX-094 — Mobile merchant category permission/contract alignment — 23 November 2026

- Source audit confirmed `CatalogController` category create/update/delete operations require `catalog:categories:write` **and** platform role ADMIN/MODERATOR. The Mobile router's merchant-role gate excludes those platform roles from `/merchant/*`, while the merchant category screen previously displayed New/Edit/Delete controls to merchant owners/staff. Those controls could only fail at the API boundary.
- The merchant category directory now requires `catalog:categories:read`, the Home/Dashboard entry uses the same read permission, and merchant users see a read-only list with no mutation controls. A pure policy helper mirrors the API's ADMIN/MODERATOR + write-permission condition. No API role guard or permission grant was weakened.
- Focused route/helper tests were added in `mobile/test/route_permissions_test.dart`; not executed. Commits: `6741baf6f7d47c12ddc79d3ca1f4bbd3f110a39f`, `6f0659299c39952b0c8190a4a8dd520ccd3e3db9`, `bb2e4650534bae0b30bf112500db184c227ccba8`, `7b293273f4aba14429ed226932123678a0892c55`, route-matrix test `76b9b15dc1db37c67841d405b4a232f4731fc986`, and explanatory source comment `bd672f0b93de31d6bc669bb7785eeb70a345c302`.
- Client alignment is IMPLEMENTED / TESTING_PENDING. Actual merchant-owned category CRUD remains BLOCKED pending a product/API ownership decision: either implement store-scoped category ownership and membership authorization, or move category mutation to a dedicated platform-admin surface. Do not expose write controls until that decision and backend contract exist.
- No API, RBAC seed, role grant, schema, database, migration, RLS, worker, staging or deployment behavior changed.

## UX-095 — Web merchant route/action permissions and active-organization context — 23 November 2026

- Added a shared merchant route-permission map used by the navigation and direct-route guard. Authenticated onboarding paths remain available without merchant-role gating; the merchant dashboard requires `merchant:stores:read`. Product Studio, import, offer creation, promotions and catalog-request routes require their write permissions.
- Dashboard cards and navigation items are filtered by the active user's permission projection. The merchant workspace subtree is keyed by active organization, role and sorted permissions so organization/permission changes unmount old page state and in-flight work.
- Merchant catalog mutation/export controls require `merchant:products:write`; category-request links require `catalog:offers:write`. Order and return mutations require `merchant:orders:write`; driver assignment requires `fulfillment:shipments:assign`. Store and warehouse actions use reactive `merchant:stores:write`; organization/member/document actions use `identity:organizations:write`, while store-profile fields use `merchant:stores:write`.
- Dashboard profile/store reads now refresh on active-organization changes with request-version protection. Merchant store, warehouse, organization, orders and catalog loaders also clear or guard stale responses. The Web realtime client subscribes only with `merchant:orders:read`; server-side room authorization is tracked separately as G-036.
- Focused tests were added/updated for route rules, dashboard access, merchant order/warehouse/organization page auth fixtures and G-036 realtime room authorization. Tests have **not been executed**; the current branch head has no GitHub Actions run.
- Client permission gating does not replace backend authorization. Existing API guards remain authoritative. No merge, deployment, staging write, shared DB change, migration, grants/default-ACL change, RLS enablement or worker activation was performed.

**Status:** IMPLEMENTED / TESTING_PENDING. Continue the Mobile route-permission and organization-context transition audit next, then finish remaining Admin route/action mapping.

## UX-096 — Mobile route/action permissions and organization-context transition — 23 November 2026

- Corrected Mobile offer routing: the offers list/detail use `merchant:stores:read`; only `/merchant/offers/new` requires `catalog:offers:write`. The Offers directory remains visible to read-only merchants; the create FAB/empty-state action, offer lifecycle actions and submit handler require the write grant.
- Catalog shortcuts to Offers and Categories now use their respective read permissions; the Mobile dashboard Offers card uses `merchant:stores:read`.
- Driver assignment from the Merchant Orders screen now requires `fulfillment:shipments:assign`, matching the API controller, rather than the unrelated `merchant:orders:write`. Order lifecycle changes remain guarded by `merchant:orders:write`. Product save and offer creation handlers also fail closed without their write grants.
- Merchant shell listens to active organization changes, resets the selected tab and keys the tab subtree by active organization, role and permission signature. It shows a loading state while the refreshed profile/permission projection is loading, preventing stale tabs and local page state from surviving an organization/permission transition.
- Existing organization switch flows were verified in source: the new token is saved and installed before active-org state changes; organization-scoped providers are invalidated and the router refreshes. Existing provider-invalidation coverage remains in place.
- Focused tests added/updated: route-permission matrix for offer read/create separation; positive/negative driver-assignment permission widget tests; existing organization-scope invalidation test. Tests have **not been executed**.
- No API business behavior, schema, migration, database grants, staging data, worker configuration or deployment changed.

**Status:** IMPLEMENTED / TESTING_PENDING. Next: complete remaining Admin route/action permission mapping; comprehensive testing remains deferred to Phase 3.

## UX-097 — Admin action-handler permission rechecks — 23 November 2026

- Continued the Admin route/action source audit after UX-095/096. The page-level matrix already covered all 56 Admin page files; this follow-up inspected action execution paths against the existing permission projection and API controller contracts.
- Found UI-only permission gates on verification organization deactivate/reactivate, Organizations status toggle and update-request review, and dispute resolution. A pending confirmation or event callback could still invoke its handler after the permission projection changed.
- Added fail-closed handler-time checks: `admin:users:write` for verification/organization status and organization update-request review, and `support:disputes:resolve` for dispute resolution. Organization handlers also reject duplicate work while an action is in flight.
- Focused tests added in `apps/admin/src/__tests__/verification-org-status-permissions.test.tsx` and `apps/admin/src/__tests__/admin-organization-action-permissions.test.tsx`. They simulate permission loss while a confirmation dialog remains open. Tests have not been executed.
- Source commits: `112cee3`, `94f86da`, `41fca82`; tests: `c0aa312`, `856d527`. Status: IMPLEMENTED / TESTING_PENDING, not test-verified or CI-verified. Existing API guards remain authoritative; no permission grants or API contracts changed.

**Next:** continue remaining Admin custom route/action-to-controller mapping, avoiding repetition of the 56-page route audit and these UX-097 handlers. Comprehensive validation remains deferred to Phase 3.

## UX-098 — Admin capability-aware navigation and Payments access — 23 November 2026

- **Carrier & Recovery navigation:** the route accepts either `admin:carrier:read` or `admin:shipping:recovery`; the sidebar previously required only the former. Navigation now supports explicit all-of and any-of permission requirements, and Carrier & Recovery is visible to either authorized capability.
- **Payments route:** the page already modeled separate read, payment-verification and refund-approval capabilities, but the page access gate/data loader omitted verification-only access. The route now admits a user with any one of `admin:payments:read`, `admin:payments:verify` or `admin:refunds:approve`; each tab/data read remains gated by its specific permission.
- Added helper tests for all-of/any-of navigation rules and a page regression test for a verification-only payment operator. Tests have not been executed.
- Source commits: `07ff19c`, `f303153`, `14214f0`; focused tests: `d504ace`, `89624f6`.
- Status: IMPLEMENTED / TESTING_PENDING. No API permission grants, RBAC seed, controller decorators, database or migration changes.

**Next:** continue remaining Admin custom route/action-to-controller mapping. Do not repeat the 56-page route audit or UX-097/098 changes. Full verification remains deferred to Phase 3.

## UX-099 — Shared Admin mutation permission rechecks — 23 November 2026

- Extended the shared `useAdminMutation` helper with an action-specific permission callback checked immediately before the API request, in addition to its existing single-flight guard.
- Bound User status/membership, dispute, category, brand and offer-governance mutations to their matching permission hooks. Carrier recovery is bound to `admin:shipping:recovery`; shipment exception/RTS, inventory return and carrier write/recovery actions use their distinct permission conditions. User Detail profile save rechecks `admin:users:write`.
- Added a focused hook-backed test for permission loss before mutation dispatch. Test not executed.
- Source commits: `262f2d1`, `d52acd6`, `93ec686`, `20447d2`, `bed844f`, `9313b85`, `5ea1145`, `91d69e4`; tests: `046160d`, `57d3a25`.
- Status: IMPLEMENTED / TESTING_PENDING. API permissions remain authoritative; no grants, route contracts or backend logic changed.

**Next:** finish the remaining Admin custom route/action-to-controller mapping and confirm all shared mutation call sites pass the correct permission predicate. Comprehensive validation remains deferred to Phase 3.

## FIN-001 — Refund approval serialization and request idempotency — 23 November 2026

**Status: IMPLEMENTED / TESTING_PENDING. Priority: P1.**

- `PaymentsService.approveRefund` now acquires the payment row with `FOR UPDATE` before changing refund status or calculating the cumulative successful amount. Distinct partial-refund approvals for the same payment therefore serialize and the final payment status is derived from the complete committed refund total.
- `requestRefund` checks a supplied idempotency key under the payment lock before refundable-state validation. An identical retry returns the original refund even after the first request was approved; reuse with a different payment, amount, reason or requester returns a conflict. A conflict-safe insert plus lookup handles a concurrent key collision across payment rows.
- Added PostgreSQL integration scenarios FIN-DSH-11 (two concurrent partial approvals reach `REFUNDED` when their sum equals the confirmed amount) and FIN-DSH-12 (concurrent identical requests create one refund; mismatched key reuse is rejected).
- Source/test commit: `117614884ff1e0d50ca116f0b28f249fd83761c0`. Tests have not been executed. No schema, migration, API shape, provider, payout or payment-scope change was made.
- Keep G-012 OPEN: this fix does not introduce an automatic gateway or merchant payout.

## FIN-002 — Settlement calculation idempotency — 23 November 2026

- Source/test commit: `60bf231f950dec8ede3c8945f76b22bc8e4b4451`.
- `calculateSettlement` locks the payment row, reads refund totals under that lock, returns an existing PENDING/CALCULATED/DUE settlement for retries, and rejects recalculation after PAID/ADJUSTMENT history exists.
- Added PostgreSQL cases FIN-DSH-13–15 for concurrent calculation idempotency, post-PAID rejection and pre-confirmation denial, and rejection before payment confirmation. Not executed.
- No migration/schema change. IMPLEMENTED / TESTING_PENDING.

## FIN-003 — Payment minor-unit amount validation — 23 November 2026

- Source/test commit: `f554617c592ff57db296e0ca88614ac246468194`.
- Shared positive-safe-integer validation now covers verified amounts, COD cash collected, refund requests and settlement confirmed amounts.
- FIN-DSH-16 covers invalid values and verifies rejected verification/COD attempts do not change payment status. Not executed.
- No new maximum/equality rule or payment-scope expansion.

## FIN-004 — Settlement lifecycle event consistency — 23 November 2026

Settlement calculation now writes `PAYMENT_SETTLEMENT_CALCULATED` rather than the unrelated refund-success event. Marking PAID now locks the settlement row and atomically updates the settlement, appends `PAYMENT_SETTLEMENT_PAID` history with actor/amount/reference metadata, and writes `payment.settlement_paid` to the transactional outbox. FIN-DSH-13 asserts calculation history/outbox; FIN-DSH-17 verifies concurrent pay attempts yield one winner and one history/outbox pair. Not executed.

## FIN-005 — COD order payment projection consistency — 23 November 2026

COD cash confirmation now synchronizes the denormalized `orders.payment_status` to CONFIRMED in the same transaction as the payment transition, while preserving fulfillment/order status (for example DELIVERED). FIN-DSH-18 verifies order/payment projection and payment event. Not executed.

Source/test commits: `50f544a98dc8d9b84d8a3709b250425df48c4d5a`, `def9131ba94699150cb896a23eb171eab0ae5a00`, `51d7d9c8a6a26450f9cbc1dd32d0a6779513acd9`. Status: IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, automatic payout, staging, shared DB or deployment changes.

| FIN-006 | Dispute refund idempotency payload integrity | `DisputesService.resolveDispute` reused an existing deterministic refund key without verifying that the existing financial request matched the retry. | Only recover an orphan refund when payment/order, amount, reason, requester, currency and dispute link match; otherwise conflict before linking refund or resolving dispute. FIN-DSH-20 adds PostgreSQL amount/reason mismatch cases. | P1 | IMPLEMENTED / TESTING_PENDING | Source/test commit `9899113a4f574d2733b957d2f1b489e35a71fe0f`; PostgreSQL cases await Phase 3. No schema change. |

| FIN-007 | Refund approval order payment projection | `PaymentsService.approveRefund` changed `payment_records.status` without synchronizing the corresponding denormalized `orders.payment_status`. | Update the order payment projection atomically with refund approval while preserving order fulfillment status. FIN-DSH-21/22 cover partial/full refund projections. | P1 | IMPLEMENTED / TESTING_PENDING | Source/test commit `5b68edac4d148f68656b4331a9612cd1752eab3d`; PostgreSQL cases await Phase 3. No schema change. |

| FIN-008 | Return refund idempotency payload integrity | `ReturnsService.createRefundRequest` reused a refund by deterministic return key without verifying that the existing financial request matched the return retry. | Only recover an orphan refund when payment/sub-order, amount, reason, buyer, currency and return link match; otherwise conflict before linking refund or advancing return status. FIN-DSH-24/25 cover amount/reason mismatch. | P1 | IMPLEMENTED / TESTING_PENDING | Source/test commit `72927529e64a719741b94b864f6adba7cafd4f0d`; PostgreSQL cases await Phase 3. No schema change. |

## Financial correctness continuation FIN-004–FIN-013 — 23 November 2026

- FIN-004 settlement event consistency: calculation event corrected; PAID transition now atomically persists settlement state, immutable payment history and outbox event. Commits `50f544a98dc8d9b84d8a3709b250425df48c4d5a`, `def9131ba94699150cb896a23eb171eab0ae5a00`.
- FIN-005 COD order payment projection: payment_status synchronized without changing fulfillment state. Commit `51d7d9c8a6a26450f9cbc1dd32d0a6779513acd9`.
- FIN-006 dispute refund recovery validates full request identity before reusing an orphan refund. Commit `9899113a4f574d2733b957d2f1b489e35a71fe0f`.
- FIN-007 refund approval synchronizes the order payment projection. Commit `5b68edac4d148f68656b4331a9612cd1752eab3d`.
- FIN-008 return refund recovery validates full request identity. Commit `72927529e64a719741b94b864f6adba7cafd4f0d`.
- FIN-009 dispute resolution uses compare-and-set to prevent duplicate terminal events/outbox. Commit `2b8e2fa7cf2aab87d4186153a61748bc82805c52`.
- FIN-010 return refund adjustment serializes against settlement payment. Commit `a1dc7b2cf31c83f2a59c0a72f0056f4955fe7143`.
- FIN-011 settlement adjustment preserves original currency. Commit `ba3318724c3080d4c29baee1c81e972262e14ac4`.
- FIN-012 missing financial breakdown blocks manual/COD payment confirmation and rolls back. Commit `cdb189e95dd7022793af33352a18c31f81117059`.
- FIN-013 payment expiry records cancellation history only after the conditional order update succeeds. Source/test commits `028e30e9ebeb626b51b6d80bc28467c9c946c419`, `83550c34c7dc11492fc6e5c5fc6fcb418b79243c`.
- FIN-DSH-11–28 are added but not executed. Status for all is IMPLEMENTED / TESTING_PENDING. No schema/migration, provider, gateway, automatic payout, staging, shared DB, grant/RLS, deployment or worker changes.

| FIN-014 | Discount-adjusted commission reversal and currency integrity | Return commission reversal did not allocate order-level discounts proportionally and the reversal ledger/settlement adjustment currency path was not consistently sourced from the payment. | Allocate discounts against returned goods using persisted order financials; explicitly propagate original payment currency to both ledgers. FIN-DSH-29. | P1 | IMPLEMENTED / TESTING_PENDING | Source commits 6221c9c10bba4652b19c1aeaca59a8d1c3d9c79d and 00da339e62dbeef87a55434b3ed5ea1a85cb6508; PostgreSQL test pending Phase 3. No schema change. |
| FIN-015 | Commission reversal precision | Proportional reversal multiplied safe-integer Number values before division; their product could exceed Number.MAX_SAFE_INTEGER and round the result by a minor unit. | Use a shared BigInt cumulative-target helper in both return adjustment and commission reversal services; validate safe integer inputs and cap at remaining commission. Unit regression added. | P1 | IMPLEMENTED / TESTING_PENDING | Source commits 917397ffd5491d6fe52a18063c0266e831b67c38, e2338cf1e50e825bd1c22becbeab0a6a4757a5e4, a596d49a752973cdc1b7039f3b325f0421252c9c; unit test 4e67e5ef7541e87ef5d9698e3abad7529cd07219 pending. No schema change. |

| FIN-016 | COD payment incorrectly included in stale-payment expiry | getStalePayments selected all stale AWAITING_PAYMENT rows, and expirePayment accepted COD directly; COD collection is due at delivery and must not expire on the bank-transfer timeout. | Exclude CASH_ON_DELIVERY from stale candidates and add a direct service-level guard. FIN-DSH-30 asserts no expiry candidate, no payment event and unchanged delivered-order/payment states. | P1 | IMPLEMENTED / TESTING_PENDING | Source 68b5251200f9f3765a0568b796db056a18cd878e; PostgreSQL test 6ff2a4788c5f2a98c5866cfd0d321cea9948c4ac pending Phase 3. No schema change. |

| FIN-017 | Return refund allocation precision and delivery-fee currency | Return line discounts/VAT used floating-point ratios; delivery-fee exception adjustments hardcoded SYP instead of the original payment currency. | Use BigInt-backed proportional minor-unit rounding for line discount/VAT and delivery-fee tax; persist payment currency for the adjustment. FIN-DSH-31. | P1 | IMPLEMENTED / TESTING_PENDING | Source 122edb4bf1dc67ba01bfc33b97809cc037781f87; PostgreSQL test e6823ee9b1c68f5b71229ffbda17c9f525b66565 pending Phase 3. No schema change. |
| FIN-018 | Concurrent return creation race | Active-return, cumulative returned quantity and refundable amount were checked before the insert transaction; concurrent requests could both pass stale reads. | Lock payment row and recheck eligibility, active return, returned quantities and remaining refundable amount inside the transaction. FIN-DSH-32. | P1 | IMPLEMENTED / TESTING_PENDING | Source 8a8364899f08180da9213be4d897a65fac9a897d; PostgreSQL test 705609fa2928d6e12e393b59bb990cfe0cf2343c pending Phase 3. No schema change. |

## FIN-019 — Settlement adjustment posting integrity — 23 November 2026

| ID      | Area / deliverable                      | Evidence-backed current state                                                                                                                        | Remaining gap / acceptance direction                                                                                                                                                                                                                    | Priority | Status                        | Dependencies / guardrails                                                                                |
| ------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| FIN-019 | Settlement adjustment posting integrity | Posting previously recorded commission reversals as negative merchant net and could mark adjustments POSTED without a primary settlement ledger row. | Apply type-specific credit/debit signs, validate positive safe-integer minor-unit amounts, lock the primary settlement during posting, and keep approved adjustments unposted until a primary settlement exists. FIN-DSH-34/35 and unit coverage added. | P1       | IMPLEMENTED / TESTING_PENDING | Tests not executed; no schema/migration or shared DB changes; manual-payment-only scope remains binding. |

## FIN-019 — Settlement adjustment posting integrity — 23 November 2026

| ID      | Area / deliverable                      | Evidence-backed current state                                                                                                                        | Remaining gap / acceptance direction                                                                                                                                                                                                                    | Priority | Status                        | Dependencies / guardrails                                                                                |
| ------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| FIN-019 | Settlement adjustment posting integrity | Posting previously recorded commission reversals as negative merchant net and could mark adjustments POSTED without a primary settlement ledger row. | Apply type-specific credit/debit signs, validate positive safe-integer minor-unit amounts, lock the primary settlement during posting, and keep approved adjustments unposted until a primary settlement exists. FIN-DSH-34/35 and unit coverage added. | P1       | IMPLEMENTED / TESTING_PENDING | Tests not executed; no schema/migration or shared DB changes; manual-payment-only scope remains binding. |

## FIN-020 — Reconciliation correctness — 23 November 2026

| ID      | Area / deliverable                                               | Evidence-backed current state                                                                                                                                                                                                                        | Remaining gap / acceptance direction                                                                                                                | Priority | Status                        | Dependencies / guardrails                                                                                                                              |
| ------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FIN-020 | Settlement/reconciliation arithmetic and discrepancy persistence | Reconciliation now uses adjustment-aware commission signs, BigInt reversal totals, the return workflow's half-up delivery-fee allocation and non-monetary refund-status mismatch evidence. Unit regressions and PostgreSQL FIN-DSH-36 are committed. | Execute the focused and consolidated Phase 3 tests, resolve any failures, and independently review reconciliation run versioning/history semantics. | P1       | IMPLEMENTED / TESTING_PENDING | Source/test commit `ad478cc53ce40bec86172e881b4f14cea7e6dfac`; no migration/shared DB changes. Keep PR #138 draft; preserve manual-payment-only scope. |

## FIN-021 — Reconciliation run lifecycle integrity — 23 November 2026

| ID      | Area / deliverable                                                        | Evidence-backed current state                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Remaining gap / acceptance direction                                                                                                            | Priority | Status                        | Dependencies / guardrails                                                                                                                                             |
| ------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIN-021 | Tenant-safe reconciliation versioning, supersession and failure atomicity | Advisory lock serializes versions by tenant/period/currency; transaction covers run/check/discrepancy/completion; failures roll back and are best-effort recorded as FAILED; predecessor-to-successor links; migration 0074 repairs legacy links and adds organization-aware unique index. Follow-up runtime audit replaced transaction-incompatible Drizzle relational accessors with core selects (commit `1997ee604f58328faf580328817ec5b7b326fabf`). PostgreSQL FIN-DSH-37/38 added. | Run migration and PostgreSQL scenarios in isolated CI, review legacy link conversion and verify no partial records under DB/statement failures. | P1       | IMPLEMENTED / TESTING_PENDING | Commit `e2dcb43e37d2a67a72d0891c4c3519d19719b5ae`; migration not applied to shared/staging; PR #138 stays draft; preserve G-002 and manual-payment-only restrictions. |

## FIN-022 — Financial history and outbox consistency — 23 November 2026

| ID      | Area / deliverable                                                              | Evidence-backed current state                                                                                                                                                                                                                                                                                                                                           | Remaining gap / acceptance direction                                                                                                                                                                                                    | Priority | Status                        | Dependencies / guardrails                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIN-022 | Payment/dispute/settlement-adjustment history and generic outbox delivery claim | Payment create/awaiting and dispute open/evidence/response now emit outbox events atomically with immutable history/state; settlement-adjustment creation emits its event in its insert transaction. Generic dispatcher claims pending rows using SKIP LOCKED and five-minute worker leases; final updates require lease ownership. FIN-DSH-39–42 and unit tests added. | Run unit/PostgreSQL tests in consolidated Phase 3; verify lease expiry/reclaim under process crash and retry behavior. Audit the remaining BANK_TRANSFER checkout post-commit transition and dispute-refund recovery split transaction. | P1       | IMPLEMENTED / TESTING_PENDING | Commits `3784bca3dd9a21fa3123e555aebbdd13addfb21b` through `e761195829d3fcd4bc2d9d0eecfd848188c32d53`; no migration/shared DB changes; outbox remains logging-only; PR #138 stays draft. |

## FIN-023 — Checkout and dispute-refund atomicity — 23 November 2026

| ID      | Area / deliverable                                               | Evidence-backed current state                                                                                                                                                                                       | Remaining gap / acceptance direction                                                                                                     | Priority | Status                        | Dependencies / guardrails                                                                                                                           |
| ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIN-023 | BANK_TRANSFER checkout and dispute-refund transaction boundaries | Order/payment states, histories and outbox now commit with checkout; dispute refund request, payment event/outbox, refund link and dispute resolution/history/outbox share one transaction. FIN-DSH-43/44/45 added. | Run PostgreSQL tests; inspect legacy orphan refund recovery under concurrent retries and audit payment proof storage/DB failure cleanup. | P1       | IMPLEMENTED / TESTING_PENDING | Commits `a5fa4806e310159b6f2708d366764ffe4fa3892f` through `71c8acb5a890a8b7350915cc4eca80dd6104874c`; no shared DB changes; PR #138 remains draft. |

## FIN-024 — Payment proof upload lifecycle — 23 November 2026

| ID      | Area / deliverable                                                | Evidence-backed current state                                                                                                                                                                                                             | Remaining gap / acceptance direction                                                                                                        | Priority | Status                                      | Dependencies / guardrails                                                                                                                               |
| ------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIN-024 | Multipart payment proof storage and safe replacement/compensation | API accepts bounded multipart files; service validates storage config/MIME/size, uses per-payment keys, deletes unreferenced new objects after caught DB failure, and retires prior managed proof only after commit. FIN-DSH-46/47 added. | Add durable upload-intent and crash recovery/orphan sweeper with bounded lease/retry and payment-row reference checks; validate in Phase 3. | P1       | IMPLEMENTED / TESTING_PENDING_WITH_RESIDUAL | Commits `7f6e3a949975511b5be56470c0dd427dc92ba16d`, `41c8db370a30124e981c42c1e7d7b8487771e8ec`; no migration/shared DB change yet; PR #138 stays draft. |

### FIN-024 follow-up — 23 November 2026

| ID      | Additional evidence                                                                                                           | Remaining gap                                                                           | Status                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| FIN-024 | Transition validation precedes upload; uncertain putObject timeout checks/deletes the unique generated key. FIN-DSH-48 added. | Durable process-crash upload intent/recovery and bounded orphan cleanup remain FIN-025. | IMPLEMENTED / TESTING_PENDING_WITH_RESIDUAL |

## FIN-025 — Durable payment-proof upload recovery — 23 November 2026

| ID      | Area / deliverable                                                | Evidence-backed current state                                                                                                                                                                                                                                                                                                                                                                                       | Remaining gap / acceptance direction                                                                                                                                                                                                                  | Priority | Status                        | Dependencies / guardrails                                                                                                                   |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| FIN-025 | Crash-safe payment proof upload intent and bounded orphan cleanup | Migration 0075 and Drizzle intent table persist every generated key before upload; payment row/event/outbox/intent commit atomically; replaced managed proofs receive a cleanup intent in the same transaction; stale cleanup claims with SKIP LOCKED and lease fencing, checks all payment-row references before exact-key deletion, and retries with bounded backoff. FIN-DSH-49–53 added; FIN-DSH-46/48 updated. | Execute isolated migration and PostgreSQL tests in the consolidated Phase 3 campaign; add/approve a future scheduler/worker only through the existing activation gate; review lease-duration and S3 not-found behavior against the deployed provider. | P1       | IMPLEMENTED / TESTING_PENDING | Migration 0075 not applied; cleanup method not scheduled/activated; no bucket listing; no shared/staging DB changes; PR #138 remains draft. |

## FIN-026 — Payment event actor attribution — 23 November 2026

| ID      | Area / deliverable                                                       | Evidence-backed current state                                                                                                                                                                                                                                                                      | Remaining gap / acceptance direction                                                                                                   | Priority | Status                        | Dependencies / guardrails                                  |
| ------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| FIN-026 | Accurate actor class on payment verification and COD confirmation events | verifyPayment, confirmCash and privileged returns transitions now set actor_type from authenticated caller class (ADMIN versus MERCHANT/BUYER), matching the authorization contract. PostgreSQL FIN-DSH-54/55 cover merchant verification, admin COD confirmation and privileged return overrides. | Execute the PostgreSQL regression in the consolidated Phase 3 campaign and review other payment-event producers for the same mismatch. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared DB changes; PR #138 remains draft. |

## FIN-027 — Return refund balance aggregation — 23 November 2026

| ID      | Area / deliverable                                        | Evidence-backed current state                                                                                                                                                                                                                                   | Remaining gap / acceptance direction                                                                                                                                               | Priority | Status                        | Dependencies / guardrails                                  |
| ------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| FIN-027 | Return-side refund cap parity and BIGINT-safe aggregation | Return refund aggregation now counts APPROVED alongside REQUESTED/PROCESSING/SUCCEEDED and uses exact PostgreSQL numeric text + BigInt rather than a 32-bit integer cast. FIN-DSH-56 covers approved-balance reservation and a total above the 32-bit boundary. | Execute FIN-DSH-56 in the consolidated Phase 3 PostgreSQL campaign and review the remaining refund/reconciliation aggregate consumers for matching status and precision semantics. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared DB changes; PR #138 remains draft. |

## FIN-028 — Settlement calculation actor attribution — 23 November 2026

| ID      | Area / deliverable                                          | Evidence-backed current state                                                                                                                                 | Remaining gap / acceptance direction                                                                                                  | Priority | Status                        | Dependencies / guardrails                                  |
| ------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| FIN-028 | Accurate actor class on admin settlement calculation events | Admin-only settlement calculation now records ADMIN in immutable payment history rather than SYSTEM. PostgreSQL FIN-DSH-57 verifies actor ID and actor class. | Execute FIN-DSH-57 in consolidated Phase 3 and continue auditing remaining financial event producers for actor/history/outbox parity. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared DB changes; PR #138 remains draft. |

## FIN-029 — Payment confirmation order-history actor parity — 23 November 2026

| ID      | Area / deliverable                    | Evidence-backed current state                                                                                                                            | Remaining gap / acceptance direction                                                              | Priority | Status                        | Dependencies / guardrails                                  |
| ------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| FIN-029 | Payment/order event actor consistency | verifyPayment now persists the same authenticated ADMIN/MERCHANT actor ID/class in payment_events and order_status_history. FIN-DSH-54 covers both rows. | Execute FIN-DSH-54 in consolidated Phase 3 and continue auditing other payment/order event pairs. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared DB changes; PR #138 remains draft. |

## FIN-030 — Refund-completion period attribution — 23 November 2026

| ID      | Area / deliverable                                    | Evidence-backed current state                                                                                                                                                                                                               | Remaining gap / acceptance direction                                                                                           | Priority | Status                        | Dependencies / guardrails                                  |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------- | ---------------------------------------------------------- |
| FIN-030 | Reconciliation period attribution for returns/refunds | Missing-refund and commission-reversal checks now use the REFUNDED event timestamp, with a created_at fallback for legacy rows lacking that event. FIN-DSH-58 covers a return created in a prior period and refunded in the current period. | Execute FIN-DSH-58 and review remaining reconciliation checks for use of source-event time versus aggregate-row creation time. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared DB changes; PR #138 remains draft. |

## FIN-031 — Cross-period duplicate refund detection — 23 November 2026

| ID      | Area / deliverable                      | Evidence-backed current state                                                                                                                                                                                     | Remaining gap / acceptance direction                                                              | Priority | Status                        | Dependencies / guardrails                                  |
| ------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| FIN-031 | Cross-period duplicate refund detection | Reconciliation identifies returns with at least one SUCCEEDED refund updated in-period and counts all SUCCEEDED refunds across periods. FIN-DSH-59 covers a prior-period duplicate and current-period completion. | Execute FIN-DSH-59 in consolidated Phase 3 and continue reconciliation period/source-time review. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared DB changes; PR #138 remains draft. |

## FIN-032 — Settlement-adjustment accounting-period correctness — 23 November 2026

Reconciliation previously used adjustment creation time for POSTED-adjustment approval and delivery-fee-cap checks. This misattributed adjustments created in an earlier period but posted in the current period; delivery-fee-cap checks also included DRAFT and other unposted adjustments. Both checks now require status POSTED and use the adjustment transition timestamp (updated_at) as the accounting-period timestamp. PostgreSQL FIN-DSH-60 covers a prior-period-created adjustment posted in the current period and confirms that an unposted draft is excluded. Source commit: 0c65476d1135d18504ae910083299683fdb8d072; test commit: 39a8ee35e81e919601e49d0564fee023d5a39871. Test added, not executed.

## FIN-033 — Exact payment refund aggregate arithmetic — 23 November 2026

Three payment-side SUM(bigint) aggregates used for refund reservation, refund approval projection and settlement calculation were exposed as JavaScript numbers without an explicit precision guard. They now return PostgreSQL numeric text, convert through BigInt, and fail closed when negative or outside Number.MAX_SAFE_INTEGER. Unit coverage verifies totals above the 32-bit boundary, unsafe aggregate rejection and malformed/negative values. Source commit: 633d56a06e073ee416e5b7a989167ef5828f13d8; test commit: 115b0dab007e4071f6a32ee1e564427a86732249. Tests added, not executed.

## FIN-034 — Caller-owned refund transaction support — 23 November 2026

PaymentsService.requestRefund now accepts an optional caller-owned transaction client and reuses it rather than opening a nested transaction. This aligns the implementation with the existing dispute-resolution caller, which passes its transaction so refund creation, payment event/outbox, refund linkage and dispute resolution remain atomic. Existing PostgreSQL FIN-DSH-45 covers injected failure rollback; tests remain unexecuted. Source commit: 2c4b4538cc10e3d4e6217ca56967c89e52657fd8.

## FIN-035 — Atomic return-refund and return-ledger transition — 23 November 2026

Return refund creation previously committed the payment refund/event/outbox first, then linked the refund and advanced the return request in a second transaction. It now locks the payment and performs refund creation (reusing PaymentsService's caller-owned transaction), return linkage, REFUND_PENDING state/history and return outbox in one transaction. The existing idempotency recovery path remains for legacy split-transaction rows. PostgreSQL FIN-DSH-61 injects failure at return outbox persistence and asserts that refund, payment event/outbox and return changes all roll back. Source commit: e462c256be710a81e42b2f2d4093d4700abe1818; test commit: f5d38d5a4af42ec29fa38040d8ba184e5dcbcdff, with scoped outbox assertion correction 4ad18e1eab3495030c6fff719607b5101337edb4 and test index update ac266c2c365d23c3ef3e58032616bb118d037715. Tests not executed.

## FIN-036 — Return refund finalization lineage and amount integrity — 23 November 2026

| ID      | Area / deliverable                                              | Evidence-backed current state                                                                                                                                                                                           | Remaining gap / acceptance direction                         | Priority | Status                        | Dependencies / guardrails                                          |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------- | ----------------------------- | ------------------------------------------------------------------ |
| FIN-036 | Atomic return finalization across payment/refund/return ledgers | Payment, refund and return are locked in a consistent order; exact lineage, succeeded states, currency, buyer/order linkage and safe amount equality are verified before downstream financial writes. FIN-DSH-62 added. | Execute the regression in the consolidated Phase 3 campaign. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared/staging DB changes; PR #138 remains draft. |

## FIN-037 — Failed return-refund status and retry parity — 23 November 2026

| ID      | Area / deliverable                                                     | Evidence-backed current state                                                                                                                                                                                                                                                                                 | Remaining gap / acceptance direction                                                                                                                 | Priority | Status                        | Dependencies / guardrails                                          |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------ |
| FIN-037 | Atomic failed-refund state, payment event/outbox and return transition | The linked refund changes to FAILED; PAYMENT_REFUND_FAILED and payment.refund_failed are written with REFUND_FAILED return history/outbox in one payment → refund → return locked transaction. Retry reopens the same row to REQUESTED only after checking remaining refundable balance. FIN-DSH-63/64 added. | Execute FIN-DSH-63/64 in the consolidated Phase 3 campaign; confirm existing production rows that already diverged remain visible to reconciliation. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared/staging DB changes; PR #138 remains draft. |

## FIN-038 — Refund approval retry idempotency — 23 November 2026

| ID      | Area / deliverable                               | Evidence-backed current state                                                                                                                                             | Remaining gap / acceptance direction                                                                               | Priority | Status                        | Dependencies / guardrails                                          |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------- | ------------------------------------------------------------------ |
| FIN-038 | Idempotent replay of a committed refund approval | A repeat approval of an already-SUCCEEDED refund returns the persisted result under payment/refund locks without duplicating payment history or outbox. FIN-DSH-65 added. | Execute the concurrent duplicate-approval regression and retain conflict behavior for failed/non-requested states. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared/staging DB changes; PR #138 remains draft. |

## FIN-039 — Settlement-paid retry idempotency — 23 November 2026

| ID      | Area / deliverable                 | Evidence-backed current state                                                                                                                                                            | Remaining gap / acceptance direction                                                                 | Priority | Status                        | Dependencies / guardrails                                          |
| ------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------ |
| FIN-039 | Idempotent settlement paid command | Same-reference retries after PAID return the stored settlement without additional PAYMENT_SETTLEMENT_PAID or outbox rows; a different payment reference is rejected. FIN-DSH-17 updated. | Execute concurrent same-reference retry and mismatched-reference assertions in consolidated Phase 3. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared/staging DB changes; PR #138 remains draft. |

## FIN-040 — Failed-refund/retry reconciliation parity — 23 November 2026

| ID      | Area / deliverable                                                            | Evidence-backed current state                                                                                                                                                                                                                                      | Remaining gap / acceptance direction                                                                                                                | Priority | Status                        | Dependencies / guardrails                                          |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------ |
| FIN-040 | Detect current return/refund state divergence after failed or retried refunds | Reconciliation reports REFUND_FAILED paired with a non-FAILED refund and REFUND_PENDING paired with FAILED; missing/dangling linked refunds are reported and current-state event timestamps drive period attribution with a created_at fallback. FIN-DSH-66 added. | Execute both legacy divergence scenarios in the consolidated Phase 3 run; no automatic repair or financial mutation is performed by reconciliation. | P1       | IMPLEMENTED / TESTING_PENDING | No migration; no shared/staging DB changes; PR #138 remains draft. |

### FIN-040 correction — latest current-state event period attribution

| ID       | Correction                                   | Evidence-backed current state                                                                                                                                                                                                                                                                       | Remaining gate                   | Priority | Status                        |
| -------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------- | ----------------------------- |
| FIN-040A | Latest matching transition determines period | Reconciliation groups by return/current status, uses MAX(event.created_at), and applies the period filter to the latest matching event; created_at is fallback only for legacy rows without a matching event. FIN-DSH-66 verifies an older prior-month event is not counted after a later re-entry. | Execute in consolidated Phase 3. | P1       | IMPLEMENTED / TESTING_PENDING |

Follow-up source/test commit: b63376cf26240d3dc21b6f26782158a09674c1c7.

## FIN-041 — settlement-adjustment posting replay and currency integrity

| ID      | Area / deliverable                                                | Evidence-backed current state                                                                                                                                                                                                                                                                                                                                | Remaining gate                                                                                               | Priority | Status                        |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------- |
| FIN-041 | Safe replay and primary-ledger consistency for posted adjustments | Already-POSTED retries require a durable ADJUSTMENT settlement row and do not duplicate ledger/outbox writes. New adjustment rows carry adjustmentId, parentSettlementId and postedBy metadata; legacy notes-prefix lookup is retained. Posting rejects currency mismatch and verifies the primary settlement store matches the sub-order. FIN-DSH-67 added. | Execute FIN-DSH-67 in consolidated Phase 3 and continue audit of adjustment ledger retrieval/reconciliation. | P1       | IMPLEMENTED / TESTING_PENDING |

Source/test commit: ad61d75b909341dd2936e03dbc592b0d244d9f72.

## FIN-042 — payout of posted adjustment ledgers

| ID      | Area / deliverable                                              | Evidence-backed current state                                                                                                                                                                                    | Remaining gate                                                                                                          | Priority | Status                        |
| ------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- |
| FIN-042 | Complete payout lifecycle for posted adjustment settlement rows | ADJUSTMENT is included in the settlement status contract and markSettlementPaid can transition it to PAID using the normal payment event/outbox path; same-reference retry remains idempotent. FIN-DSH-68 added. | Execute in consolidated Phase 3 and verify list/reconciliation behavior and primary settlement recalculation isolation. | P1       | IMPLEMENTED / TESTING_PENDING |

Source/test commit: a6dc0c50ee83d1f397b982084e338b142d89b62e.

## FIN-043 — primary settlement lookup isolation

| ID      | Area / deliverable                                          | Evidence-backed current state                                                                                                                                                           | Remaining gate                                                                       | Priority | Status                        |
| ------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------- | ----------------------------- |
| FIN-043 | Distinguish primary settlements from adjustment payout rows | calculateSettlement filters out adjustment rows using adjustmentId metadata and a legacy notes-prefix fallback; FIN-DSH-68 asserts primary settlement identity after adjustment payout. | Execute in consolidated Phase 3 and review list/reconciliation projection semantics. | P1       | IMPLEMENTED / TESTING_PENDING |

Source/test commit: 6e336fbbe6e71a0c21ee8e81150eadfd769cc6f0.

### FIN-042/043 test assertion follow-up

FIN-DSH-68 now selects payment_record_id directly from the posted adjustment ledger row for its PAYMENT_SETTLEMENT_PAID history assertion; this is a test-only clarity correction. Commit: 74eef0fa36611dd7352436e8d2b7fd048ca7efc2. No behavior change. Test remains unexecuted.

## FIN-044 — Adjustment parent isolation and payout visibility — 23 November 2026

| ID      | Area / deliverable                                                                                    | Evidence-backed current state                                                                                                                                                                                                                                                                      | Remaining gap / acceptance direction                                                                                                                             | Priority | Status                        | Dependencies / guardrails                                         |
| ------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ----------------------------------------------------------------- |
| FIN-044 | Keep adjustment payout rows separate from primary settlement lineage and expose their payout workflow | Parent selection excludes new metadata-linked adjustment rows and legacy notes-prefixed rows even after PAID; adjustment payout preserves the legacy marker; Admin Settlements includes ADJUSTMENT filter, status treatment and Mark Paid action. FIN-DSH-68/69 and Admin recovery coverage added. | Execute in consolidated Phase 3; inspect merchant projections and reconciliation/report/export surfaces for distinct adjustment identity and no double counting. | P1       | IMPLEMENTED / TESTING_PENDING | No migration or shared/staging DB changes; PR #138 remains draft. |

## FIN-045 — Paid adjustment reconciliation semantics — 23 November 2026

| ID      | Area / deliverable                               | Evidence-backed current state                                                                                                                                                                                                    | Remaining gap / acceptance direction                                                                | Priority | Status                        | Dependencies / guardrails                                         |
| ------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ----------------------------------------------------------------- |
| FIN-045 | Preserve adjustment accounting sign after payout | Reconciliation identifies adjustment rows through adjustmentId metadata or the legacy posted-adjustment notes prefix; commission reversal remains a credit after status transitions to PAID. FIN-DSH-36 and unit cases extended. | Execute paid/unpaid adjustment and primary settlement reconciliation cases in consolidated Phase 3. | P1       | IMPLEMENTED / TESTING_PENDING | No migration or shared/staging DB changes; PR #138 remains draft. |

## FIN-046 — Merchant settlement visibility — 23 November 2026

| ID      | Area / deliverable                                           | Evidence-backed current state                                                                                                                                                                                                                          | Remaining gap / acceptance direction                                                                                                                    | Priority | Status                        | Dependencies / guardrails                                                                       |
| ------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| FIN-046 | Read-only merchant view of settlement and adjustment history | Merchant Settlements page consumes the existing organization/store-scoped endpoint; store/status filters, financial amounts, payout reference and ADJUSTMENT · PAID identity are surfaced. Navigation/route permission and Admin/merchant tests added. | Execute merchant store/organization isolation and recovery tests in consolidated Phase 3; verify exports and aggregate KPI queries do not double count. | P1       | IMPLEMENTED / TESTING_PENDING | No new API privilege or payout mutation; no migration/shared DB changes; PR #138 remains draft. |

## FIN-047 — Settlement history pagination and consumer audit — 23 November 2026

| ID      | Area / deliverable                                                            | Evidence-backed current state                                                                                                                                                                                                                                                                                                                                       | Remaining gap / acceptance direction                                                                                                                                                                             | Priority | Status                        | Dependencies / guardrails                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIN-047 | Bounded Admin/Merchant settlement history with complete source consumer audit | Admin and Merchant list endpoints return `{ data, total, limit, offset }`, default 25/max 100, validate offsets, order by createdAt/id and keep merchant count/page predicates identical. Both UIs expose page navigation. Admin/API/Web consumers and KPI/reconciliation surfaces were reviewed; no settlement export or primary-plus-adjustment aggregate exists. | Resolve the 279-file changed-file Prettier failure, then execute API parser/controller/service, merchant tenant scope, Admin/Merchant pagination and adjustment recovery regressions in consolidated Phase 3 CI. | P1       | IMPLEMENTED / TESTING_PENDING | Lint/typecheck and Flutter pass; API/Web/Admin tests are skipped behind the required formatter gate. Do not disable checks; no migration/shared DB changes; PR #138 remains draft. |

## Live continuation — FIN-047 verification follow-up (23 November 2026)

- Exact branch head: 3ef930973014bdb43e10a62c337a61831835c174; PR #138 remains OPEN / DRAFT / UNMERGED against develop. No merge or deployment.
- Formatting remediation: CI #45257284797 passed the changed-file Prettier gate, lint, and workspace typecheck. Flutter analyze and Flutter tests also passed. The broad formatting cleanup is grouped in 312e7d39044ea9ce412675a9bdbf68992776eec4; two remaining files were formatted in 11a6f5998fa6b21c70737a4a55a2b4e4a59f2a27. Temporary one-time formatting workflows were removed in b9926463886b778e87bde60895690e2d6dbad8b8.
- The consolidated CI run #45257284797 is still in progress at this checkpoint. Boundary Lint failed with 14 cross-module import violations against its 193-entry reviewed baseline (206 current violations); the same 14 findings were present on the preceding run. Migration Full Apply failed its read-only access audit because role scs_audit lacks SELECT permission on _migration_log. Neither failure was bypassed or baselined.
- Web test job failed with 9 unrelated existing tests across buyer self-service recovery, buyer route hydration, merchant returns, and product-studio progress/flow (6 failing files, 31 passing files; 212 tests passed, 9 failed). Merchant settlement recovery passed all 5 tests. The job stops at the Web suite, so Admin recovery tests have not yet run in this CI attempt.
- API pagination parser tests (15) and payment controller/tenant-scope tests (4) passed in CI #45250855722. The merchant settlement recovery suite passed 5/5. API coverage and PostgreSQL integration jobs in #45257284797 were still running at this checkpoint; do not claim them passed.
- The touched outbox-dispatcher test exposed a case-sensitive SQL assertion against PostgreSQL's uppercase NOT LIKE; corrected to compare lowercased SQL in commit 3ef930973014bdb43e10a62c337a61831835c174. The latest CI run is the exact-head recheck for this correction.
- FIN-047 remains IMPLEMENTED / TESTING_PENDING. Do not merge/deploy. No migration or shared/staging DB write, environment mutation, worker activation, RLS/ACL change, or production operation was performed.
- Next: finish collecting CI #45257284797 API coverage and PostgreSQL integration results; run the Admin settlement recovery tests independently because the Web suite currently fails before Admin is reached; then address the 14 modular-boundary violations and _migration_log audit grant through their proper owners/reviewed changes. Do not change test expectations or weaken gates to hide failures.

## Verification status update — 23 November 2026

CI #45260954714 stopped at the changed-file Prettier gate; lint/typecheck and Flutter passed, but API, PostgreSQL, migration, boundary and Web/Admin jobs were skipped. Formatting was subsequently corrected in commit `4477ebd42ba46146b14df18094d025ab133c5d75`. Exact-head verification remains pending. FIN-047 remains IMPLEMENTED / TESTING_PENDING; the 14 G-015 module-boundary findings remain open.
