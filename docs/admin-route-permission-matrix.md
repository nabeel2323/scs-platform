# Admin route and action permission matrix

**Audit date:** 22 November 2026  
**Repository branch inspected:** `remediation/phase-0-1-tenant-security`  
**Source checkpoint:** `cd1d7de837d3c519db4a249479effe65db5fce53`  
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
| `/commission` | `admin:commission:read` | Read-only commission view |
| `/data-quality` | `catalog:product-types:manage` | Product-type data-quality surface |
| `/disputes`, `/disputes/[id]` | `support:disputes:resolve` | Generic list and detail share the dispute-resolution permission |
| `/kpis`, `/offers-kpis`, `/offers-trend` | `admin:kpis:read` | Read-only KPI/trend surfaces |
| `/merchants`, `/merchants/[id]` | `admin:merchants:read` | Merchant inspection |
| `/offers`, `/offers/[id]` | `catalog:offers:govern` | Offer governance |
| `/orders` | `admin:orders:read` | Generic order monitor |
| `/orders/[id]` | `admin:orders:read` | Cancellation additionally requires `orders:cancel` |
| `/organizations`, `/organizations/[id]` | `admin:users:read` | Organization deactivation/reactivation and update-request review require `admin:users:write` |
| `/` | AuthGuard; widget-level checks | Catalog import widget: `catalog:imports:manage`; catalog request widget: `catalog:requests:manage` |
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
| `/verification`, `/verification/[id]` | `merchant:verification:review` | Organization deactivation/reactivation additionally requires `admin:users:write` |

## Findings corrected in this implementation batch

1. **Business calendar holiday mutation:** the page previously required only `admin:returns:read` while rendering Add/Remove controls for endpoints protected by `admin:returns:write`. The controls are now hidden for read-only users, mutation handlers fail closed without write access, and the page explains the required permission.
2. **Escalated return resolution:** the detail page previously rendered the resolution form and entry link for any `admin:returns:read` user, although `POST /admin/returns/:id/resolve` requires `admin:returns:write`. The form/link are now write-gated, the submit handler independently checks the permission, and read-only users receive an explanatory note.

## Verification and remaining work

- The API controller declares `admin:returns:write` for return resolution and business-calendar mutations; the existing RBAC permission catalog includes that permission.
- Focused Admin component tests cover read-only and write-authorized behavior for both pages.
- This source audit covers all 56 Admin page files and the generic `ManagementPage` configuration. It does not claim every API route or every backend operation has been exhaustively reconciled.
- Comprehensive role-by-role/deep-link/action verification remains in the consolidated Phase 3 testing campaign.
- Next mapping work: mobile screen/action permission affordances, remaining web route-to-API mapping, and worker/provider ownership.
