# Mobile route and action permission matrix

**Audit date:** 22 November 2026  
**Baseline:** `06cd8fc1e56dc7ef64a141b97b594adc96ffbece`

## Permission source

The API's `GET /v1/me` response already includes the active-organization `perms` array. Mobile now parses and retains that projection. Route guards and action controls use the same permission keys as the backend `PermissionsGuard`. The API remains authoritative; client checks do not replace server-side enforcement.

## Route and action map

| Screen / route | Route permission | Action-level permission |
|---|---|---|
| Login | Public authentication | None |
| Credential setup, password, sessions | Authenticated self-service | Account/session ownership remains server-side |
| Home | Authenticated | Merchant and driver launchers filtered by active-org permissions |
| Search | `catalog:products:read` | Add to Cart: `orders:write` |
| Store list/detail | `merchant:stores:read` | Save/favorite remains user-scoped |
| Product detail | `catalog:products:read` | Add to Cart: `orders:write` |
| Cart and checkout | `orders:write` | API also enforces `orders:write` |
| Orders list/detail | `orders:read` | Cancel: `orders:cancel`; delivery confirmation/reorder: `orders:write` |
| Notifications | Authenticated self-service | Device-token endpoints are caller-scoped |
| Merchant registration | Authenticated onboarding exception | Organization creation: `identity:organizations:create`; store creation: `merchant:stores:write` |
| Merchant dashboard | `merchant:stores:read` | Child destinations filtered individually |
| Merchant orders | `merchant:orders:read` | Accept/partial accept/reject/prepare/assign: `merchant:orders:write` |
| Merchant catalog | `catalog:products:read` | Create/edit: `merchant:products:write`; delete: `catalog:products:delete` |
| Product editor | `merchant:products:write` | Create/update uses the same permission |
| Category management | `catalog:categories:write` | Category mutations use the same permission |
| Merchant inventory | `merchant:inventory:read` | Stock adjustment/transfer/low-stock checks: `merchant:inventory:write` |
| Merchant store profile | `merchant:stores:read` | Store/warehouse mutation: `merchant:stores:write` |
| Merchant customers | `merchant:orders:read` | Read-only customer view |
| Merchant offers | `catalog:offers:write` | Create/update uses the same permission |
| Reviews/disputes | Authenticated and order-ownership scoped | API currently lacks a dedicated permission decorator; retain ownership/state validation |
| Organizations list/detail | Authenticated membership-scoped reads | Create: `identity:organizations:create`; update/add/remove members: `identity:organizations:write` |
| Driver shipments | `fulfillment:shipments:read` | Pickup: `fulfillment:shipments:pickup`; delivery: `fulfillment:shipments:deliver`; proof: `fulfillment:proof:write` |

## Implemented in this batch

- Parse `GET /v1/me.perms` in `UserProfile`; expose exact, any, and all permission helpers.
- Enforce route permissions for direct/deep links and show an Access Restricted screen with the missing permission.
- Refresh router redirects after profile and active-organization changes.
- Filter buyer bottom navigation, Home search/catalog/store discovery sections, merchant tabs, merchant launchers, and merchant dashboard destinations.
- Gate organization creation/edit/member management, merchant registration organization/store creation, driver pickup/delivery, buyer order cancellation/delivery confirmation/reorder, merchant order mutations, inventory mutations, catalog create/edit/delete, store/warehouse writes, and every Add to Cart affordance.
- Add focused Flutter tests for permission parsing and route-policy decisions.

## Outstanding policy and validation work

- `identity:organizations:create` is defined by migration `0069_organization_onboarding_permission.sql`, which staging records as applied on 17 November 2026. Read-only SQL confirms it is assigned to BUYER, ADMIN, MERCHANT_OWNER, and SUPER_ADMIN. The canonical `rbac-seed.data.ts` was out of sync; this commit aligns the seed and adds a regression test. No staging DDL or permission grant is required.
- Full deep-link, active-organization switching, role-switching, and mutation regression tests remain in the consolidated validation campaign.
- Baseline CI formatting already fails on nine changed PR files. Formatting and full validation are intentionally deferred until the implementation batch is complete, conserving the user's remaining GitHub Actions minutes.
