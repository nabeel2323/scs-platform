# Admin route and action permission matrix

**Audit date:** 22 November 2026  
**Repository branch inspected:** `remediation/phase-0-1-tenant-security`  
**Source checkpoint:** `8e795c3eee12d42938d525f2aaf2894b3b47e382`  
**Scope:** all 56 `apps/admin/src/app/**/page.tsx` files in the inspected Git tree.

This is a source-level UI permission inventory, not a replacement for API authorization. The Admin root layout wraps the application in `AuthGuard`; page-level permissions are checked with `useRequirePerms`, and generic list routes use the permission in `managementTables` through `ManagementPage`. The backend `PermissionsGuard` remains authoritative.

## Route matrix

| Route | Read / entry permission | Additional action permission or behavior |
|---|---|---|
| `/account` | AuthGuard; self-account surface | No separate route RBAC hook observed |
| `/analytics` | `analytics:read` | Read-only analytics surface |
| `/attribute-groups`, `/attributes`, `/attributes/[id]` | `catalog:attributes:manage` | Create/update controls remain within the same permission |
| `/audit` | `admin:audit:read` | Read-only audit viewer |
| `/auth/login` | Public authentication entry | Exempt from authenticated route RBAC |
| `/bootstrap` | Dedicated initial-setup flow | No `useRequirePerms` hook; setup flow is a separate trust boundary |
| `/brands`, `/brands/[id]` | `catalog:brands:manage` | Brand management surface |
| `/calendar` | `admin:returns:read` | Add/remove holidays require `admin:returns:write` |
| `/carrier` | `admin:carrier:read` for configuration reads; `admin:shipping:recovery` for recovery queue | Recovery action is hidden unless recovery permission is present; no credential/configuration write UI was found |
| `/catalog-import`, `/catalog-import/[id]` | `catalog:imports:manage` | Import pipeline actions remain under import-management access |
| `/categories`, `/categories/[id]` | `catalog:categories:write` | Category management surface |
| `/commission` | `admin:commission:read` | Reversal list request and page content are blocked when permission is missing; read-only commission view |
| `/data-quality` | `catalog:product-types:manage` | Product-type data-quality surface |
| `/disputes`, `/disputes/[id]` | `support:disputes:resolve` | Generic list and detail share the dispute-resolution permission; detail submit handler rechecks permission |
| `/kpis`, `/offers-kpis`, `/offers-trend` | `admin:kpis:read` | Read-only KPI/trend surfaces |
| `/merchants`, `/merchants/[id]` | `admin:merchants:read` | Merchant inspection |
| `/offers`, `/offers/[id]` | `catalog:offers:govern` | Offer governance |
| `/orders` | `admin:orders:read` | Generic order monitor |
| `/orders/[id]` | `admin:orders:read` | Cancellation additionally requires `orders:cancel` |
| `/organizations`, `/organizations/[id]` | `admin:users:read` | Organization deactivation/reactivation and update-request review require `admin:users:write`; async confirmation handlers recheck permission before mutation |
| `/` | AuthGuard; KPI data requires `admin:kpis:read`; organization-update data requires `admin:users:read` | Catalog import widget: `catalog:imports:manage`; catalog request widget: `catalog:requests:manage`; each data request and widget is independently gated |
| `/payments` | `admin:payments:read` | Verification queue: `admin:payments:verify`; refund queue/approval: `admin:refunds:approve` |
| `/product-types`, `/product-types/[id]` | `catalog:product-types:manage` | Product-type management |
| `/products` | `admin:merchants:read` | Generic moderation list; create action requires `catalog:products:write` |
| `/products/[id]` | `admin:merchants:read` | Edit: `catalog:products:write`; moderation: `admin:products:moderate` |
| `/products/new`, `/products/[id]/edit`, `/products/[id]/variants/new` | `catalog:products:write` | Product/variant create and edit |
| `/reconciliation` | `admin:reconciliation:read` | Run reconciliation and resolve discrepancies require `admin:reconciliation:write` |
| `/requests` | `catalog:requests:manage` | Corrected to match the API's canonical permission |
| `/returns` | `admin:returns:read` | Read-only return list |
| `/returns/[id]` | `admin:returns:read` | Escalation resolution requires `admin:returns:write` |
| `/roles`, `/roles/[id]` | `admin:users:read` | Role permission changes require `admin:roles:write` |
| `/settlement-adjustments` | `admin:adjustments:read` | Create/submit: `admin:adjustments:write`; approve/reject/post: `admin:adjustments:approve` |
| `/settlements` | `admin:settlements:read` | Mutations require `admin:settlements:write` |
| `/shipments`, `/shipments/[id]` | `fulfillment:shipments:read` | Exception/RTS actions: `fulfillment:shipments:write`; carrier recovery: `admin:shipping:recovery` |
| `/users`, `/users/[id]` | `admin:users:read` | User creation and privileged user actions require `admin:users:write` |
| `/variants/[id]`, `/variants/[id]/edit` | `catalog:products:write` | Variant inspection/edit route remains in the product-write surface |
| `/verification`, `/verification/[id]` | `merchant:verification:review` | Organization deactivation/reactivation additionally requires `admin:users:write`; async handlers recheck permission before mutation |

## Findings corrected in this implementation batch

1. **Business calendar holiday mutation:** the page previously required only `admin:returns:read` while rendering Add/Remove controls for endpoints protected by `admin:returns:write`. The controls are now hidden for read-only users, mutation handlers fail closed without write access, and the page explains the required permission.
2. **Escalated return resolution:** the detail page previously rendered the resolution form and entry link for any `admin:returns:read` user, although `POST /admin/returns/:id/resolve` requires `admin:returns:write`. The form/link are now write-gated, the submit handler independently checks the permission, and read-only users receive an explanatory note.

## Verification and remaining work

- The API controller declares `admin:returns:write` for return resolution and business-calendar mutations; the existing RBAC permission catalog includes that permission.
- Focused Admin component tests cover read-only and write-authorized behavior for both pages.
- This source audit covers all 56 Admin page files and the generic `ManagementPage` configuration. It does not claim every API route or every backend operation has been exhaustively reconciled.
- Comprehensive role-by-role/deep-link/action verification remains in the consolidated Phase 3 testing campaign.
- Next mapping work: remaining Admin custom route/action-to-controller permission semantics, remaining web route-to-API mapping, and worker/provider ownership.


## Dashboard and commission read-gate correction — 22 November 2026

The dashboard now calls `GET /admin/kpis` only for users with `admin:kpis:read` and calls `GET /admin/org-update-requests` only for users with `admin:users:read`. The corresponding dashboard sections are independently hidden without those permissions, and organization updates have an explicit loading state.

The commission reversal page now renders the shared access-denied state and does not request `GET /admin/commission-reversals` unless `admin:commission:read` is present. These client checks mirror existing API guards; no backend permission or role grant changed.

Focused regression coverage is added in `apps/admin/src/__tests__/dashboard-permissions.test.tsx`. Execution remains deferred to the consolidated Phase 3 campaign.


## Admin action-handler permission rechecks — UX-097 — 23 November 2026

A follow-up source audit checked mutation handlers, not only visible controls. Verification organization deactivate/reactivate, Organizations status toggle and update-request review, and dispute resolution now recheck their required permission inside the async handler immediately before the mutation. Organization actions also reject duplicate in-flight execution. This prevents a stale confirmation dialog from retaining the ability to submit after the active permission projection changes.

Focused tests were added in `apps/admin/src/__tests__/verification-org-status-permissions.test.tsx` and `apps/admin/src/__tests__/admin-organization-action-permissions.test.tsx`. They have not been executed and remain in the consolidated Phase 3 campaign. Existing API permission guards are unchanged and authoritative.


## Capability-aware navigation and Payments access — UX-098 — 23 November 2026

The shared sidebar now supports both all-of and any-of permission rules. Carrier & Recovery is visible when the caller has either `admin:carrier:read` or `admin:shipping:recovery`, matching the route's existing OR gate. Payments is visible when the caller has any of `admin:payments:read`, `admin:payments:verify` or `admin:refunds:approve`.

The Payments route now admits verification-only users and loads the Verification Queue with `admin:payments:verify`. All Payments and Stale/Expiring remain restricted to `admin:payments:read`; Refund Requests remain restricted to `admin:refunds:approve`. A caller without any of these capabilities receives AccessDenied. Focused helper and page tests were added but not executed. No API/RBAC grants changed.


## Shared Admin mutation permission rechecks — UX-099 — 23 November 2026

The shared `useAdminMutation` helper now accepts an action-specific permission predicate and evaluates it immediately before dispatch. User status/membership, dispute, category, brand and offer governance actions use their corresponding permission hook. Carrier recovery queue actions receive and recheck `admin:shipping:recovery`; shipment exception/RTS, inventory return, carrier create/cancel and recovery actions are bound to their distinct permission conditions. User Detail profile save also rechecks `admin:users:write`.

A focused test verifies the shared mutation does not dispatch after permission loss and does dispatch when authorized. It has not been executed. This is client-side defense in depth; API controller authorization remains authoritative.


## Custom financial action mapping and settlement rejection — 23 November 2026

A source-level comparison of the remaining custom financial pages with their API controller decorators confirmed these action contracts:

- Reconciliation run and discrepancy resolution use `admin:reconciliation:write`, matching the controller's `POST /admin/reconciliation/run` and `POST /admin/reconciliation/discrepancies/:id/resolve` guards.
- Settlement adjustment submit uses `admin:adjustments:write`; approve, reject and post use `admin:adjustments:approve`.
- Settlement payment marking uses `admin:settlements:write`.
- Role permission updates use `admin:roles:write`.
- Payment verification and refund approval use `admin:payments:verify` and `admin:refunds:approve` respectively.
- Return resolution and business-calendar holiday mutations use `admin:returns:write`; shipment exception/RTS and carrier recovery use their separate `fulfillment:shipments:write` and `admin:shipping:recovery` permissions.

**Gap corrected:** the API exposed `POST /admin/settlement-adjustments/:id/reject` with the `admin:adjustments:approve` guard, but the Admin adjustment detail list did not offer a rejection action. The page now provides an approver-only rejection form requiring a reason and submits the exact controller payload. Read-only users do not see Approve or Reject.

Focused tests were added to `apps/admin/src/__tests__/admin-settlement-adjustments-recovery.test.tsx` for rejection payload/flow and read-only visibility. They have not been executed; comprehensive validation remains in Phase 3. No API permissions, role grants or financial service behavior changed.


## Direct custom mutation and shared-helper audit — 23 November 2026

The follow-up source audit covered the custom direct mutation handlers for payments/refunds, business-calendar holidays, reconciliation, settlement adjustments, settlements, role permission updates, return resolution, order cancellation, verification review/organization status, and product moderation. Their UI permission predicates correspond to the relevant API controller decorators. No additional permission-key mismatch was found in these inspected handlers.

The shared `useAdminMutation` call sites reviewed in `EntityActions.tsx`, the Carrier Recovery table and Shipment Detail supply action-specific permission predicates; mixed carrier create/cancel/recovery actions use per-call overrides so write and recovery capabilities are not conflated. API authorization remains authoritative.

The one missing custom financial action was the settlement-adjustment Reject workflow, now implemented as documented above. Focused tests remain pending Phase 3; this is a source audit, not runtime or automated-test verification.


## Catalog governance direct-action guards and publish correctness — UX-101 — 23 November 2026

- Product Type list/create/detail handlers now recheck `catalog:product-types:manage` before publish, create and category-update mutations. Publish operations are single-flight and show pending state.
- Product Type Builder Save/Publish handlers recheck the same permission, prevent overlapping save/publish requests, and Publish now stops if saving dirty attributes or variant dimensions fails. Product-type product reads also stop when access is absent.
- Catalog Import Center now gates initial history reads, upload, execute, retry, error inspection, template/report downloads and export on `catalog:imports:manage`. Upload/execute/retry are single-flight. The API continues to enforce both permission and ADMIN/SUPER_ADMIN role.
- Attribute and Attribute Group forms now receive and recheck `catalog:attributes:manage` at create/update/deactivate/option/group mutation boundaries; mutation controls are disabled when the capability is absent.
- Focused regression coverage in `admin-product-type-products-recovery.test.tsx` proves a failed dirty-configuration save does not call Publish. Tests have not been executed; the full campaign remains deferred to Phase 3.
- Source commits: `bbe5a72`, `9af0646`, `553cb25`, `8e795c3`; test commits: `43c6e5e`, `997da23`, `3d59ae9`.
- Status: **IMPLEMENTED / TESTING_PENDING**, not test-verified or CI-verified.


## Product editor action-time permission guard — UX-102 — 23 November 2026

The shared ProductForm used by the Admin create and edit routes now receives the route's `catalog:products:write` capability, checks it immediately before Save dispatch, and uses an in-flight ref to prevent duplicate create/update submissions. The Save control is disabled when the capability is absent. The matching API routes are `POST/PATCH /admin/products` and `PUT /admin/products/:id/attribute-values`, all guarded by `catalog:products:write`.

This is a client-side action-boundary hardening; the backend permission checks remain authoritative. No test was added specifically for ProductForm; comprehensive testing is deferred to Phase 3.


## Product Type request-race hardening — UX-103 — 23 November 2026

Product Type list/filter reads and selected-schema reads now use independent request-version guards. A slower response for an earlier category/status filter or previously selected Product Type can no longer overwrite the current selection. The Product Type Builder's main schema/attribute/readiness load now also invalidates stale requests on route-ID or permission changes, including stale readiness results and loading-state updates.

This is client-side stale-response suppression only; no API or database behavior changed. No focused test was added. The source was included in CI #1419: lint and typecheck passed, Flutter analysis/tests passed, but changed-file formatting failed across 254 files. Web/Admin tests and dependent gates were skipped.
