# SCS Platform — Whole-Product Implementation Inventory

**Inventory date:** 22 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Inspected source head:** `2cca47aa34abd1a014ea16217cfee204c9e9f803`  
**Purpose:** Source-backed baseline for MAP-001 in the [Implementation Completion Gap Register](./IMPLEMENTATION-GAP-REGISTER.md).

## 1. Evidence method and limits

This is a static repository inventory of the recursive Git tree and selected source files at the exact inspected head. Counts below are file/path counts, not a statement of feature completeness, runtime availability, deployment state or test pass rate. Feature classifications are supported by the cited source paths. The older UI capability audit is dated 25 September 2026 and the completion report is also dated 25 September; treat them as historical input and revalidate their open/closed labels against current source before acting.

No code, staging configuration, live database, grants, migrations, workers or deployment were changed during this inventory. No comprehensive tests were run. The current documentation head has no associated GitHub Actions workflow run; Vercel web/admin status contexts point to the external build-rate-limit page and do not establish application test failure or success.

## 2. Repository and application topology

The inspected recursive tree contains **1,625 tracked files** (tree response was not truncated).

| Surface            |                                         Current source inventory | Main paths                                                             |
| ------------------ | ---------------------------------------------------------------: | ---------------------------------------------------------------------- |
| API                | 20 NestJS modules; 28 module controllers; 25 module schema files | `apps/api/src/modules/`, `apps/api/src/app.module.ts`                  |
| Buyer/merchant web |                                 49 Next.js App Router page files | `apps/web/src/app/`                                                    |
| Admin console      |                                 56 Next.js App Router page files | `apps/admin/src/app/`                                                  |
| Flutter mobile     |                          32 screen files; 3 declared app flavors | `mobile/lib/screens/`, `mobile/lib/core/app_flavor.dart`               |
| Shared packages    |                  4 packages: contracts, env, event-types, ui-kit | `packages/`                                                            |
| Database           |               71 SQL migration files; 25 API module schema files | `infra/drizzle/migrations/`, `apps/api/src/modules/*/*.schema.ts`      |
| API tests          |                   152 unit test files; 82 integration test files | `apps/api/src/__tests__/unit/`, `apps/api/src/__tests__/integration/`  |
| Client tests       |    18 web test files; 15 admin test files; 10 Flutter test files | `apps/web/src/__tests__/`, `apps/admin/src/__tests__/`, `mobile/test/` |
| Browser E2E        |                                          2 Playwright test files | `apps/e2e/tests/`                                                      |
| Documentation      |                     509 Markdown and 25 HTML files under `docs/` | `docs/`                                                                |

### 2.1 API bounded contexts

The 20 source module directories are:

`admin`, `analytics`, `audit`, `catalog`, `catalog-import`, `identity`, `inventory`, `merchant`, `notifications`, `operations`, `orders`, `payments`, `pricing`, `promotions`, `realtime`, `returns`, `reviews`, `shipping`, `support`, and `system`.

Selected module/controller evidence:

- Identity and organization: `apps/api/src/modules/identity/{auth,organizations,profile}.controller.ts`.
- Merchant/store/membership: `apps/api/src/modules/merchant/merchant.controller.ts`, `store-membership.controller.ts`.
- Catalog, taxonomy, canonical products, offers and import: `apps/api/src/modules/catalog/`, `apps/api/src/modules/catalog-import/`.
- Inventory/pricing/promotions: corresponding module controllers and services under `apps/api/src/modules/{inventory,pricing,promotions}/`.
- Cart/orders: `apps/api/src/modules/orders/{cart,orders}.controller.ts`.
- Payments and refunds: `apps/api/src/modules/payments/payments.controller.ts`.
- Returns/settlement/reconciliation: `apps/api/src/modules/returns/`.
- Shipping/carriers/webhooks/recovery: `apps/api/src/modules/shipping/`.
- Reviews/disputes: `apps/api/src/modules/reviews/{reviews,disputes}.controller.ts`.
- Admin/analytics/audit/operations/bootstrap: corresponding module directories.

**Important observed exception:** `apps/api/src/modules/support/support.module.ts` is currently an empty Nest module (`@Module({})`). No support ticket controller/service was found in the module directory. The existing disputes implementation is under `reviews`; it should not be mistaken for a full ticketing workflow.

The `app.module.ts` imports the SupportModule, but importing an empty module does not implement support-ticket behavior. The separate Ads bounded context described for a later product phase is not present as an API module in this tree.

### 2.2 API and shared contracts

- Drizzle schema barrel: `apps/api/src/drizzle/schema.ts`, re-exporting 25 module schema files.
- Shared Zod/OpenAPI contracts: `packages/contracts/src/index.ts` and `packages/contracts/src/statuses.ts`; generation scripts produce OpenAPI, TypeScript and Dart clients.
- Other shared packages: `packages/env`, `packages/event-types`, `packages/ui-kit`.
- API infrastructure: `apps/api/src/common/database`, `common/redis`, `common/storage`, `common/outbox`, `common/tenant-scope.ts`.
- Migrations: `infra/drizzle/migrations/`; the tree contains 71 `.sql` files. This count does not say they have been applied to a shared database.

### 2.3 Background processing and integrations

Source includes the outbox dispatcher, durable worker lease/operations controls, order auto-completion worker, return-expiration worker, carrier worker, carrier tracking poller, carrier retry/circuit-breaker/reconciliation, carrier webhook security, Aramex provider, payment provider registry and OTP delivery/provider registry. Evidence paths include:

- `apps/api/src/common/outbox/outbox-dispatcher.service.ts`
- `apps/api/src/modules/operations/{worker-lease.service.ts,p13-monitor.service.ts,ops-control.service.ts}`
- `apps/api/src/modules/orders/auto-complete.worker.ts`
- `apps/api/src/modules/returns/return-expiration.worker.ts`
- `apps/api/src/modules/shipping/{shipping-carrier.worker.ts,carrier-tracking-poller.ts,aramex/}`
- `apps/api/src/modules/payments/payments.provider-registry.ts`
- `apps/api/src/modules/notifications/{otp-delivery.service.ts,provider-registry.service.ts,providers/}`

The source topology and the Render staging topology are separate questions. The recorded staging topology describes one API service and no separate worker service; do not infer worker activation or live execution from provider registration alone. See `docs/remediation/STAGING-RUNTIME-TOPOLOGY-2026-11-19.md`. No worker was activated as part of this inventory.

## 3. Client surface inventory

### 3.1 Buyer and merchant web

The 49 page files cover buyer discovery/search, product detail and offer comparison, compare, cart, checkout, orders/order detail, stores/store detail, favorites/saved suppliers, notifications, reviews/returns, account/security sessions/credentials, and merchant workflows for catalog/product studio, offers, inventory, pricing, promotions, orders, customers, members, stores/organization, imports, shipping/deliveries and returns.

Representative source paths:

- Buyer discovery and purchase: `apps/web/src/app/{page.tsx,search/,products/[id]/,compare/,cart/,checkout/,orders/}`.
- Merchant workspace: `apps/web/src/app/merchant/`, including `product-studio/`, `offers/`, `inventory/`, `pricing/`, `promotions/`, `orders/`, `imports/`, `deliveries/`, and `returns/`.
- API clients: `apps/web/src/lib/{api.ts,buyer-api.ts,auth.ts,realtime.ts}`.
- Shared components: `apps/web/src/components/`.

The existing buyer and merchant journeys are materially broader than the early September planning scaffold. Do not reopen completed promotions/dispute UI work merely because the 25-September audit originally listed those gaps.

### 3.2 Admin console

The 56 page files cover dashboard, users, roles, orders, merchants, organizations, verification, catalog taxonomy/product/variant management, offers/governance, catalog imports, data quality, disputes, audit, analytics, payments, settlements, returns, commission, adjustments, reconciliation, shipments, carrier operations, calendar and account security.

Representative source paths:

- Dashboard: `apps/admin/src/app/page.tsx`.
- Order list/detail: `apps/admin/src/app/orders/page.tsx`, `orders/[id]/page.tsx`.
- Payments: `apps/admin/src/app/payments/page.tsx`.
- Catalog and import: `apps/admin/src/app/{products,categories,brands,attributes,product-types,catalog-import}/`.
- Shared list management: `apps/admin/src/components/ManagementPage.tsx`, `apps/admin/src/lib/management-tables.ts`.
- Sidebar: `apps/admin/src/components/AdminSidebar.tsx`.
- Detail component system: `apps/admin/src/components/detail/`.

The admin sidebar currently declares **33 flat navigation entries** in one array. The generic `ManagementPage` applies `useRequirePerms([config.permission])` for its configured entities; therefore the historical claim that generic list pages have no route-level permission check is not accurate for pages using this component. A full custom-page/detail-route permission audit remains necessary before closing the broader route-gating question.

### 3.3 Flutter mobile

The 32 screen files include authentication/security, buyer home/search/stores/products/cart/checkout/orders/notifications/profile/organizations/reviews, merchant dashboard/catalog/product editing/categories/customers/offers/inventory/orders/store profile, and driver shipments.

- Router: `mobile/lib/router/router.dart`.
- Flavor configuration: `mobile/lib/core/app_flavor.dart`.
- App entry: `mobile/lib/main.dart`.
- API/auth core: `mobile/packages/mobile-core/lib/`.

The current `AppFlavor` enum declares **retail, wholesale and driver**. The September UX plan proposed a fourth consumer flavor as an improvement and places the consumer journey in a later B2C phase. Treat consumer flavor as future-phase scope unless a current product decision brings it forward.

The router does enforce role-level redirects for merchant and driver paths. The older UI audit statement that all mobile screens are reachable by any authenticated user is too broad. Fine-grained per-permission filtering and action visibility are not established by this role-level redirect; keep that as a separate UX/authorization-parity assessment. Backend authorization remains authoritative.

## 4. Current source-confirmed UX and workflow gaps

These items are based on current source inspection, not simply copied from the September audit. Statuses here are implementation classifications, not test verification.

| ID     | Confirmed area                            | Current source evidence                                                                                                                                                                                                                                                                                         | Gap / acceptance direction                                                                                                                                                                                                                                                                                             | Priority | Programme status           |
| ------ | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| UX-001 | Admin order operations                    | `apps/admin/src/app/orders/page.tsx` is a thin wrapper over generic `ManagementPage`; `orders/[id]/page.tsx` presents order detail and history. API exposes `POST /orders/:id/cancel` behind `orders:cancel`, but AdminController order routes shown are read/list/detail.                                      | Decide which privileged admin order operations are intended; surface only supported, state-valid actions with reason capture, permission checks, confirmation, audit feedback and idempotent error handling. Do not expose merchant/buyer actions as admin actions without an explicit service authorization contract. | P1       | IMPLEMENTATION_PENDING     |
| UX-002 | Admin refund approval                     | `apps/api/src/modules/payments/payments.controller.ts` exposes `POST /admin/refunds/:id/approve` with `admin:refunds:approve`; `apps/admin/src/app/payments/page.tsx` currently has payment list/verification/stale views and verification actions, with no refund-approval workflow found in inspected source. | Add a dedicated refund queue/detail/action flow only after mapping refund state, approval policy, reason, audit and API response contract.                                                                                                                                                                             | P1       | IMPLEMENTATION_PENDING     |
| UX-003 | Admin dashboard operational widgets       | `apps/admin/src/app/page.tsx` loads KPIs and pending organization updates. It does not load recent catalog import jobs or pending catalog requests. Dedicated import/request pages exist.                                                                                                                       | Add actionable pending-import and catalog-request summaries with permission-aware links, useful empty/error/loading states and bounded queries.                                                                                                                                                                        | P2       | IMPLEMENTATION_PENDING     |
| UX-004 | Admin navigation information architecture | `apps/admin/src/components/AdminSidebar.tsx` defines 33 entries as a flat array and renders the filtered items as a single navigation list.                                                                                                                                                                     | Group navigation into coherent areas (Overview, Identity, Catalog, Commerce, Fulfillment, Finance, Insights, System); preserve permission filtering, active-route behavior and responsive/collapsed states.                                                                                                            | P2       | IMPLEMENTATION_PENDING     |
| UX-005 | Merchant Product Studio offer step | `apps/web/src/app/merchant/product-studio/steps/StepOffer.tsx` now loads the selected store's warehouses through `fetchWarehouses(storeId)` and offers only ACTIVE warehouse choices; the old raw warehouse-ID input is no longer present. Currency, base price, MOQ, lead time and price preview are present. | The warehouse selector and fetch/error states are implemented; validate them in Phase 3. Product Studio save sequencing and partial-save retry correctness are tracked separately as UX-015. | P2 | IMPLEMENTED | Reuses the existing store-scoped warehouse API and `Warehouse` contract; no new commercial behavior. |
| UX-006 | Mobile permission-level affordances       | `mobile/lib/router/router.dart` redirects non-merchants away from merchant routes and non-drivers away from driver routes, but the inspected router does not apply granular permission checks to individual screens/actions.                                                                                    | Map mobile capabilities to the canonical permission contract; hide/disable unauthorized actions and routes consistently while retaining backend enforcement and safe deep-link denial.                                                                                                                                 | P2       | IMPLEMENTATION_PENDING     |
| UX-007 | Support-ticket capability                 | `apps/api/src/modules/support/support.module.ts` is empty; no ticket controller/service was found in its module. Disputes are implemented separately in `modules/reviews`.                                                                                                                                      | Decide whether basic support tickets remain in the agreed product scope; if yes, define ticket lifecycle, ownership, roles, attachments/evidence, notifications and UI/API contracts before implementation.                                                                                                            | P2       | BLOCKED                    |
| UX-008 | Nearby-offers audit discrepancy           | The September audit claims `GET /offers/nearby` exists. The currently inspected catalog and offer controllers expose product offers, ranked offers, merchant offers and governance actions, but no nearby route.                                                                                                | Reconcile the historical API claim against the complete controller tree and current contract before treating this as a frontend-only gap. Location permission/geospatial UX is a product/privacy decision.                                                                                                             | P2       | IMPLEMENTATION_PENDING     |
| UX-009 | Custom admin page permission coverage     | The September audit says several custom pages rely only on sidebar filtering/server 403. Current generic `ManagementPage` does enforce its configured permission, and inspected custom pages such as audit, analytics, payments and order detail call `useRequirePerms`.                                        | Complete a route-by-route audit of all 56 admin page files, including deep links, nested detail/edit routes and action-level permission checks; correct stale claims only after the full matrix is recorded.                                                                                                           | P1       | IMPLEMENTATION_IN_PROGRESS |

### 4.1 Historical UI audit corrections

Source documents:

- `docs/ui-capability-audit.md` — generated 25 September 2026.
- `docs/ui-capability-completion-report.md` — generated 25 September 2026.

Corrections supported by current source:

1. The earlier report's Admin Audit page stub was replaced; current `apps/admin/src/app/audit/page.tsx` is a dedicated 270-line viewer and uses `useRequirePerms(['admin:audit:read'])`.
2. The Admin Analytics page exists as a 220-line events/activity view and uses `analytics:read`.
3. Merchant promotions page exists (`apps/web/src/app/merchant/promotions/page.tsx`).
4. Buyer order detail includes dispute creation/evidence workflow code in `apps/web/src/app/orders/[id]/page.tsx`.
5. Admin dispute detail, category detail and offer detail routes exist; confirm their current tab behavior before making further UI changes.
6. Admin payment list/verification UI exists; the old permission table's blanket claim that `payments:read` has no UI is obsolete. Refund approval remains a separate candidate gap.
7. Generic admin list pages using `ManagementPage` have a config-driven permission check; do not count these as unguarded solely because the individual page wrapper does not call the hook.
8. Mobile merchant and driver routes have role-level redirects; the historical claim that all such screens are freely reachable is overstated.

The old report's remaining S3/S4 items are candidates, not confirmed gaps, until rechecked against the current source. In particular, the historical raw warehouse-ID issue in StepOffer is already corrected in source: it now uses a store-scoped active-warehouse selector. Do not re-open UX-005; the separate save/step-transition defect is tracked as UX-015.

## 5. Product-plan scope reconciliation

The September [Implementation & UX Plan](../Smart_Commerce_Platform_Implementation_and_UX_Plan.md) defines a staged roadmap:

- Current B2B marketplace foundations: identity, organizations, merchant/store onboarding, catalog, variants/offers, inventory, pricing, promotions, cart/orders, notifications, reviews/disputes, admin and basic support.
- Delivery/tracking, payments/settlement, B2C consumer journeys, advertising/merchant analytics and AI/optimization are staged later product phases in that plan.
- The current repository has meaningful delivery, payments, returns, settlement and analytics implementations. Their existence does not itself move every future-phase product commitment to release scope.
- A dedicated Ads module and consumer flavor are not present in the current source inventory; both are future-phase scope in the plan, not automatically P0/P1 missing implementation.
- Support tickets require a scope decision because the plan mentions basic support while the current SupportModule is empty and disputes are implemented in a different bounded context.

Do not silently expand automatic gateway/payout, ads, AI, consumer or other phase-gated scope. Preserve the explicit product decisions in the remediation plan and decision log.

## 6. Database and security evidence boundaries

The source inventory identifies 25 schema files and 71 SQL migration files. The G-002 reconciliation documents 99 Drizzle-exported tables against a historical live relation inventory of 114, with 15 relations outside the Drizzle model export. The uploaded file named `Advanced UX Enhancement Prompt.txt` contains a read-only audit note stating 111/111 tables had RLS disabled, while the November project reports describe 114 public relations in an earlier audit. These counts are not reconciled by this static source inventory and must not be combined into one current live count.

The uploaded audit note also records 32 public functions with no `SECURITY DEFINER`, no `BYPASSRLS` on anon/authenticated, service_role with `BYPASSRLS`, and 55 FK constraints without covering indexes. Treat those as the uploaded note's stated observations, not newly verified live facts. No SQL in that note was applied.

For G-002, continue to prohibit shared database grants/privileges/default-ACL/ownership changes, migration 0070 application, live RLS activation and unapproved staging access. The current table ownership matrix remains a candidate classification, not an approved policy specification.

## 7. Priority order after MAP-001

1. Complete the remaining route-to-permission matrix for Admin and mobile; fix any concrete authorization defect immediately.
2. Admin refund request queue is implemented. Admin order cancellation is now surfaced through the existing state-guarded endpoint and `orders:cancel` permission. Other admin order operations still require a separate product/state-machine review.
3. Improve the Admin dashboard operational widgets and navigation grouping in one cohesive admin UX batch.
4. Improve the Merchant Product Studio offer step using existing store/warehouse and offer APIs; avoid inventing new commercial behavior.
5. Resolve Support ticket scope and nearby-offer API discrepancy as explicit product/API decisions.
6. Continue G-001/G-002 evidence and design tasks within existing safety gates; do not activate workers or alter shared database state.

## 8. Next MAP-001 completion criteria

MAP-001 is complete only when:

- All API controllers/routes are mapped to client consumers and canonical permission requirements.
- All 49 web and 56 admin page files are mapped to user journeys, APIs, permissions and UI state handling.
- All 32 mobile screens/routes are mapped to roles/permissions and API operations.
- All 99 Drizzle tables and 114+ physical relations are reconciled with owners, operation paths and scope (the live inventory requires authorized read-only evidence).
- All worker/webhook/scheduler/provider integrations are mapped to owners, activation controls, retries, observability and operational boundaries.
- Product phase scope and user decisions are reconciled; missing vs deferred vs blocked is explicit.
- Documentation links and acceptance criteria are maintained in the gap register.

This document is a first static inventory checkpoint, not a claim that every route, operation or physical database relation has already been fully reconciled.

## Admin navigation structure update — 22 November 2026

The Admin sidebar has 32 destinations grouped by operational domain: Overview, Platform Management, Orders & Fulfillment, Catalog, Finance, Analytics & Governance, and Account. Grouping preserves all destinations, permission checks, active matching, collapsed tooltips and mobile overlay behavior. The Requests destination uses the endpoint's canonical `catalog:requests:manage` permission.


## Admin route permission audit — 22 November 2026

Completed a source-level review of all 56 `apps/admin/src/app/**/page.tsx` files, the root `AuthGuard`, `useRequirePerms`, generic `ManagementPage`, and `managementTables` permission configuration. The complete route/action map is maintained in [Admin Route and Action Permission Matrix](../docs/admin-route-permission-matrix.md). Two UI action-gating gaps were found and corrected: calendar holiday add/remove and escalated-return resolution now require `admin:returns:write`, matching existing API guards. Focused Admin component tests were added. This is not a claim that every API endpoint, role combination, or deep-link workflow has completed Phase 3 verification.

The next mapping priority is the 32 mobile screens/routes and their granular permission/action affordances; then finish web route-to-API and worker/provider operation ownership mapping.


## Mobile authorization inventory — 22 November 2026

| Surface | Permission behavior added | Validation state |
|---|---|---|
| Profile model | Parse `GET /v1/me.perms`; exact/any/all helpers | Tests added; execution pending |
| Router/deep links | Active-org route policy; Access Restricted page; refresh on profile/org change | Tests added; execution pending |
| Buyer shell/Home | Search, Cart, Orders, merchant/driver launchers filtered by grants | Implementation added |
| Merchant shell/dashboard | Dashboard, orders, catalog, inventory and child destinations filtered | Implementation added |
| Organization screens | Create/edit/add/remove member actions require organization permissions | Implementation added |
| Driver shipments | Pickup and delivery require their specific shipment permissions | Implementation added |
| Buyer order detail | Cancel, delivery confirmation and reorder require order permissions | Implementation added |
| Merchant order/inventory/catalog/store | Mutating actions gated by merchant write/delete permissions | Implementation added |
| Product/search/home cart actions | Add to Cart requires `orders:write` | Implementation added |

API guards remain authoritative. Client-side checks improve navigation and affordances but do not replace backend authorization. Full validation is deferred to the consolidated final phase to conserve Actions minutes.


### Mobile authorization review refinement — 22 November 2026

- Home search, category/product discovery, and supplier sections are now individually filtered by catalog/store read permissions.
- Flat variant and offer Add-to-Cart buttons are disabled without `orders:write` in addition to the mutation-handler guard.
- Merchant registration checks `identity:organizations:create` before organization creation, preserves invitation joining, and checks `merchant:stores:write` before store creation and verification submission.
- Merchant low-stock KPI navigation is hidden without `merchant:inventory:read`.
- Full Flutter and backend validation remains deferred to the single consolidated validation phase.


### Registration organization-context consistency — 22 November 2026

- Merchant registration now writes the created/joined organization ID to secure storage and `activeOrgIdProvider` before reloading the profile permission projection.
- Store creation checks now use the newly active organization's grants rather than stale profile state.
- Store/warehouse providers are invalidated after registration mutations.
- Merchant dashboard onboarding text distinguishes organization creation from invitation-based joining.


### Organization onboarding seed consistency — 22 November 2026

- Staging `public._migration_log` confirms `0069_organization_onboarding_permission.sql` was applied on 17 November 2026.
- Read-only SQL confirms `identity:organizations:create` is assigned to BUYER, ADMIN, MERCHANT_OWNER, and SUPER_ADMIN.
- Canonical `rbac-seed.data.ts` now mirrors the migration's permission definition and role grants; `merchant-rbac.spec.ts` asserts the real seed matrix.
- No staging database mutation or new migration was needed.


## 22 November 2026 — current-head UX re-audit addendum

- Merchant mobile now has a dedicated Pricing dashboard entry, store-scoped price-list CRUD (create/update/activate), quantity-tier CRUD and product/variant selection. Offer creation can attach a price list and verifies that a tier covers the selected variant and MOQ; offer details link back to the list. See mobile/lib/screens/merchant/merchant_pricing_screen.dart and price_list_detail_screen.dart.
- Admin order detail previously rendered productId and variantId as truncated UUIDs. AdminService now joins product title, variant title and SKU; Admin UI displays these values with ID fallback. Buyer and merchant mobile/web order detail already render item title/SKU as strings; no JSON/attribute serialization path was found in the inspected detail screens.
- Focused tests added; not run. This addendum is source inspection, not a visual/device test.


## 22 November 2026 — offers-only search filter

- Added a server-backed hasOffers=true search filter that restricts results to products with at least one ACTIVE merchant offer. The predicate is applied consistently to empty-query, full-text/trigram and exact SKU/barcode paths.
- Added an Offers-only filter to web search (URL-persisted) and the mobile search filter sheet. Product cards continue to show active offer count and lowest offer price; cart line price remains the effective server-resolved item price.
- Added SearchService regression tests for empty query, full-text query and exact-SKU fast-path filtering. Not executed.


## 22 November 2026 — Product Studio save-flow correction (UX-015)

- Source review found that the Offer-step Next action ignored the nullable result of `handleSaveProduct` and always advanced, even when persistence failed. It also invoked the same save routine that created the offer, while the final Review action invoked it again; the flow could create duplicate offers.
- Product Studio now uses a product-only intermediate save and creates the commercial offer only on the final Review action. The transition is blocked for missing store/title, failed persistence or an in-flight save. The Next button is disabled while saving.
- Variant retries re-read existing product variants and skip already-persisted SKUs, avoiding duplicate variants after a partial failure. The saved dirty-state baseline reflects the actual wizard state.
- Added focused tests for the transition helper; not executed. This is source-level implementation evidence, not browser/device verification.


## 22 November 2026 — buyer cart mutation recovery (UX-016)

- Source review found cart quantity/remove/clear handlers had no local error handling or in-flight lock. Failed validation plus failed fallback reads set cart=null, which could misrepresent an unavailable cart as empty.
- Added a shared cart mutation helper with error feedback, pending-state cleanup and refresh-on-success. Cart actions are serialized; controls expose accessible labels and progress states. Promo/checkout actions are disabled while a mutation is in flight.
- Cart reads now preserve the last successful cart and show a retryable load error when both validation and fallback reads fail. Focused helper tests were added but not run.


## 22 November 2026 — Admin returns oversight recovery (UX-017)

- The returns queue previously rendered a bare error and could fall through to the empty-queue message; requests started by rapidly changing status filters could resolve out of order and overwrite the latest queue.
- Added a retryable shared AdminErrorState, explicit error branch, request-version protection and cleanup on filter change/unmount.
- Return detail now uses shared loading/error/not-found states with a retry action. The load callback is awaitable, so the escalation resolution flow waits for the refreshed return read.
- Added two focused component tests for queue and detail recovery. Not executed; no browser/CI verification yet.


## 22 November 2026 — Mobile cart mutation locking (UX-018)

- Mobile cart item quantity/remove operations previously had no shared in-flight lock. QuantityStepper allowed direct text entry and repeated ± actions while a request was pending.
- Added a shared cart-action lock, row-specific progress indicator and disabled item/promo/clear controls while a mutation is active. QuantityStepper now supports an optional enabled flag that disables both buttons and text entry.
- Failed quantity updates invalidate cart data and recreate the stepper from provider state to avoid displaying an unaccepted optimistic value.
- Added Flutter widget tests for disabled and default-enabled QuantityStepper behavior. Not executed; no device/CI validation.


## 22 November 2026 — Admin dispute timeline recovery (UX-019)

- Dispute detail errors previously had no retry action; Events/Evidence errors were rendered as plain text with no recovery. Async reads were not guarded against stale responses after route/tab changes.
- Added retryable shared error states and request-version guards for both dispute detail and events. The events list is cleared at the start of a new request so old evidence is not shown alongside a failed refresh.
- Added focused tests for detail and events retry behavior. Not executed; no browser/CI validation.


## 22 November 2026 — Admin identity/organization detail recovery (UX-020)

- User, merchant and organization detail pages previously displayed non-retryable read errors and did not guard against stale request completions.
- Added retryable shared error states and request-version protection. User detail now isolates the permission catalog read from the core user detail so permission-service failure does not hide user identity; the Permissions tab can retry independently.
- Added focused component tests for user, merchant and organization detail retry behavior. Not executed.


## 22 November 2026 — Admin dispute resolution workflow (UX-021)

- The Admin dispute detail screen previously showed the dispute and event timeline but exposed no action to resolve it, despite the existing `support:disputes:resolve` API route.
- Added a required resolution text form for unresolved disputes. It calls the existing `PATCH /v1/disputes/:id/resolve` contract, displays pending/error/success states, reloads after success and renders the stored resolution for already resolved/closed disputes.
- The API permission guard and platform-admin service check remain authoritative. The UI only sends the currently supported `{ resolution }` field; no unsupported refund parameters were added.
- Added a focused component test. Not executed.


## 22 November 2026 — Admin catalog/order/role detail recovery (UX-022)

- Extended retryable read handling to attributes, brands, catalog import, offers, orders, roles, variants, categories and product types. Main request paths clear stale errors and ignore out-of-date responses where version guards were added.
- The Catalog Import Errors tab and Offer Inventory tab now show explicit retryable errors instead of silently presenting failed reads as empty lists/no inventory.
- Role permission-save failures are isolated to an inline action error and no longer hide the role detail. The UI copy now correctly states that permission selections require an explicit save.
- Added focused tests for attribute, order and import-error-tab recovery. Not executed.


## 22 November 2026 — Admin product detail offers recovery (UX-023)

- ProductDetails merchant-offer data previously loaded once with no retry; a failed request could be displayed together with the empty-offers state.
- Added an awaitable offer loader with request-version protection, loading skeleton, retryable error state and a true-empty state only after a successful response.
- Added a focused component test for offer-read failure and retry. Not executed.


## 22 November 2026 — Admin financial workflow read recovery (UX-024)

- Payments, Settlements, Reconciliation and Settlement Adjustments now distinguish load errors from action errors. Financial list read failures expose Retry and no longer masquerade as empty data.
- Added request-version protection to payment tabs, settlement status filters, reconciliation run history and settlement-adjustment filters. Reconciliation selected-run detail has its own retryable error state.
- Mutation failures remain inline action errors; successful actions reload the authoritative list/detail state. No finance API contracts or financial side effects were changed.
- Added four focused Admin tests for read failure/retry on payment queue, settlements, reconciliation and settlement adjustments. Not executed.


## 22 November 2026 — Product Studio persistence completion (UX-015 / UX-025)

- Progress navigation now allows only the previous/completed steps and the next sequential step. The Offer → Media stepper click uses the same save gate as Next, and the entire stepper is disabled during save, preventing direct navigation from bypassing product persistence.
- Existing Product Studio products are now updated on subsequent saves rather than silently skipping identity edits. The product's `updatedAt` is retained and sent for optimistic locking.
- Create/update payloads include the supported productTypeId, GTIN, EAN and MPN fields. Store/title are validated in the save routine as well as the step transition helper.
- Added a progress-indicator widget test and an existing-product update-failure regression case. Tests not executed.


## 22 November 2026 — Product Studio canonical reuse and media persistence (UX-026 / UX-027)

- Existing canonical product selection now wins over stale wizard product IDs. Product Studio reuses the shared product, does not create or update it, and skips canonical attribute/variant/media writes. Shared identity/specification/media steps are read-only in this path.
- Selected existing variant IDs are passed to the merchant-offer create API. The offer-creation marker is reset when canonical selection changes.
- Uploaded Product Studio media is now attached to merchant-owned products through product-media records during save. Existing media URLs are re-read and deduplicated before inserts so retries after partial failure are safe.
- Added unit tests for canonical target selection and media deduplication/empty selection. Not executed.


## 22 November 2026 — UX-027 Product Studio offer retry reconciliation

The live branch advanced after the prior inventory checkpoint with three focused Product Studio fixes: store/product/variant-scoped retry markers, pre-create reconciliation against existing store offers after a possibly lost create response, and safe handling of nullable existing-offer prices. The changes prevent same-session retries from blindly recreating an offer when the first write committed, and surface a conflict when the existing offer has different commercial terms. The focused helper tests are present but not executed. This is a client-side reconciliation path; it does not establish a server-side atomic idempotency guarantee for concurrent clients.

## 22 November 2026 — UX-028 mobile buyer return lifecycle parity

The cross-client source audit found a concrete workflow discrepancy: `apps/web/src/app/orders/[id]/page.tsx` and `apps/web/src/lib/buyer-api.ts` exposed buyer return creation and lifecycle operations, backed by `apps/api/src/modules/returns/returns.controller.ts` and `ReturnsService`; Flutter's `OrderDetailScreen` and `ApiService` had no equivalent.

Implemented in this batch:

- `mobile/lib/screens/orders/order_detail_screen.dart` now renders a buyer-owned return section on DELIVERED/COMPLETED sub-orders, with the same PRODUCT_NOT_AS_DESCRIBED, CUSTOMER_REQUEST and OTHER reason vocabulary and bounded per-item quantity inputs used by Web.
- Existing REQUESTED / MERCHANT_APPROVED / later states are surfaced; the buyer can cancel only in REQUESTED or MERCHANT_APPROVED and can mark shipped only in MERCHANT_APPROVED, matching the service transition map.
- `mobile/lib/services/api_service.dart` now wraps the existing buyer return list/detail/create/cancel/shipped routes. `mobile/lib/models/models.dart` parses both list responses (without item/event relations) and detail/mutation responses (with relations).
- The create flow reconciles a failed/uncertain response by refreshing the caller-scoped list; it does not blindly repeat a write. API owner, payment, return-window, active-request and cumulative-quantity rules remain server-enforced.
- Added `mobile/test/returns_api_test.dart` for DTO parsing and endpoint/body contracts. Source implementation commit: `d7ffc3339db78f16e0f8a9aa7cb551ea28fabdcf`. Tests are pending the consolidated Phase 3 campaign; source implementation is not yet test-verified.

No database, API contract, route permission, worker, staging or deployment changes were made.


## 22 November 2026 — UX-029 mobile return detail/history parity

Web's `apps/web/src/app/returns/[id]/page.tsx` displays complete buyer return details and the lifecycle-event timeline. Flutter's initial buyer-return parity work displayed only a summary, although the existing `GET /v1/returns/:id` already returns detail, item and event records after buyer ownership authorization. The mobile Order Detail now opens a retryable sheet containing refund values, notes, returned item quantities/conditions and chronological event history. No separate route, permission or API change was required. DTO parsing and focused tests were extended; not executed.


## 22 November 2026 — Web buyer self-service recovery (UX-030)

Source audit of the Web buyer account surfaces found that Notifications, Favorites and Saved Suppliers swallowed list-fetch errors and rendered empty states, making network/API failure indistinguishable from a genuinely empty list. Favorite/supplier removal failures were also swallowed. Profile Sessions showed an initial error but no retry and could still display “No active sessions” after a failed fetch. These states are now explicit and retryable. Removal failures remain visible and preserve the affected row. Notification optimistic read rollback now restores the original `readAt` and `status`. Focused tests added; not executed.


## 22 November 2026 — UX-031 Merchant Customers read recovery

The Merchant Customers page previously swallowed initial and refresh failures and showed an empty directory as though the read had succeeded. It now surfaces a retryable read error, preserves the last successful rows when a refresh fails, and renders “No customers yet” only after a successful empty response. Focused tests added; not executed.


## 22 November 2026 — UX-032 Merchant Deliveries read recovery

The Merchant Deliveries queue now offers Retry on list-read failure and does not present “No deliveries yet” after a failed request. Existing rows remain available if a later refresh fails. Focused test added; not executed.

## 22 November 2026 — UX-033 / UX-034 Merchant Web implementation audit

- `apps/web/src/app/merchant/returns/page.tsx` previously required a manually typed store ID. It now loads the signed-in merchant's available stores through `fetchMyStores`, selects the first by default and supports store/status filters. Store-directory and return-list reads have retryable error states and stale-request protection.
- `apps/web/src/app/merchant/returns/[id]/page.tsx` now exposes Retry after a failed detail read.
- The API route remains protected by `merchant:orders:read` and requires `storeId`; return mutations continue to require `merchant:orders:write`. No server permission or ownership logic changed.
- `apps/web/src/app/merchant/organization/page.tsx` now surfaces retryable failures for verification history, update-request history, store information, warehouses, roles and members. Existing auxiliary data is retained during failed refreshes; verified-organization update submission is blocked when pending-request state is unknown.
- Focused tests: `merchant-returns-recovery.test.tsx`, `merchant-return-detail-recovery.test.tsx`, `merchant-organization-recovery.test.tsx`. Not executed.

## 22 November 2026 — UX-035 / UX-036 Merchant Orders and Offers

- `apps/web/src/app/merchant/orders/page.tsx` now exposes store-directory and order-list read failures with Retry, shows queue loading, and suppresses the false empty-order state until a successful empty response. If no accessible store remains, stale store/order selection is cleared. Buyer-name enrichment remains best-effort by design and falls back to buyer IDs.
- `apps/web/src/app/merchant/offers/page.tsx` now exposes retryable store, offers-list, product-directory, analytics and trend failures. Product selection/offer creation are disabled while the product directory is unavailable. Failed analytics no longer appears as zero orders/units/revenue in the table or CSV; trend failures no longer appear as an empty sales range.
- Focused tests: `merchant-orders-recovery.test.tsx` and `merchant-offers-recovery.test.tsx`. Not executed. No API, permission, schema, DB or migration change.

## 22 November 2026 — UX-037 Merchant Inventory movement-history recovery

- `apps/web/src/app/merchant/inventory/page.tsx` no longer converts a failed `fetchInventoryMovements` request into a successful empty history. The dialog shows a retryable error; “No movements recorded yet” is shown only after a successful empty response.
- Extracted `readInventoryHistory` into `apps/web/src/lib/inventory-history.ts`.
- Added `apps/web/src/__tests__/inventory-history-recovery.test.ts` for successful and failed reads. Not executed. No API, permission, schema or DB changes.
