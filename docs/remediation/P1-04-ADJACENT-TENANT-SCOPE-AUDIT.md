# P1-04 — Adjacent Tenant-Scope Audit

**Date:** 18 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Audit branch:** `remediation/phase-0-1-tenant-security`  
**Source snapshot reviewed:** `22880da70299301470b0b18fd9b92526a51b683c`  
**Parent finding:** G-001 — merchant offer tenant authorization

## Purpose and method

This is a source-level audit of adjacent API routes that accept `storeId`, `orgId`, product IDs, warehouse IDs, price-list IDs, variant IDs or other tenant-owned object identifiers. The audit checks whether the authenticated caller is bound to the object's active organization and active store membership before the controller invokes a service.

This report distinguishes source-confirmed omissions from fixes already committed and items requiring additional contract review. It does not claim runtime exploitation or live staging reproduction.

## Findings

| Finding | Affected area / routes | Source evidence at reviewed snapshot | Result |
|---|---|---|---|
| G-024 | `POST/GET /merchant/requests`; admin approve/reject actor identity | `catalog.requests.controller.ts:36-47,64-81`; service persists `requestedBy` | Merchant request list/create accepted caller-supplied store scope without store membership. Requester/reviewer IDs were accepted from request bodies. **Fix committed**: store/org + active membership checks; actor IDs derived from JWT. |
| G-025 | `PATCH /stores/:id`; `POST/GET /stores/:storeId/warehouses`; `PATCH /warehouses/:id`; `POST /stores/:storeId/verify` | `merchant.controller.ts:125-150,213-218` | Active-org and permission guards did not bind the target store/warehouse to the caller's active store membership; warehouse list lacked a functional permission check. **Fix committed**: target-store membership checks; warehouse listing requires `merchant:stores:read`. |
| G-026 | Price-list and price-tier list/detail/create/update/delete/resolve routes | `pricing.controller.ts:17-97`; `pricing.service.ts:23-190` | Permission checks existed, but object-level store ownership was not enforced. Tier creation/update could pair a variant with another store's price list. **Fix committed**: store membership checks and variant/list store consistency checks. |
| G-027 | Store inventory, warehouse inventory, variant inventory, item movements, low-stock listing and stock mutations | `inventory.controller.ts`; `inventory.service.ts`; `common/tenant-scope.ts` | Source omission confirmed. **Fix verified in CI #554:** inventory HTTP routes forward authenticated caller context; warehouse, variant and inventory-item helpers enforce active organization + active store membership; inventory items must reference a variant and warehouse from the same store; unqualified low-stock reads are limited to active memberships in the caller's active organization. Added 14 focused regression tests. |
| G-028 | `GET /stores/:storeId/products`; `GET /products/:id`; product variants, variant matrix and media reads | `catalog.controller.ts`; `catalog.service.ts`; `buyer-api.ts:398-405` | Buyer API documentation said buyers had to request `ACTIVE`, but the API did not enforce it; detail, variants, matrix and media reads exposed non-deleted non-ACTIVE products. **Implemented; CI pending:** ACTIVE details are public to authenticated callers; non-ACTIVE details require owning-store active membership or privileged platform role. Store product and variant grids force ACTIVE-only product/active-variant results for non-members. Detail authorization runs before Redis cache lookup, and studio/public cache keys are separated to prevent inactive variant leakage; buyer detail and standalone variant reads filter inactive variants. Added 8 focused helper tests. |
| G-029 | `POST /stores/:storeId/products/bulk` | `catalog.controller.ts`; `catalog.service.ts` | Permission check existed, but the controller did not verify the caller's organization/store membership before bulk delete/archive/draft actions. **Implemented; CI pending:** controller now requires active organization ownership and active store membership before calling the bulk mutation service. Added 3 controller regression tests (active member allowed; same-org non-member and foreign-org caller denied before service invocation). |

## Changes committed

The following fixes and regression tests are committed on the remediation branch:

- **G-024:** commit `c48bb9d` (controller fix), `c0b8f0e` (security tests).
- **G-025:** commit `9511d5a` (controller fix), `f77f553` (security tests).
- **G-026:** commit `d83da11` (controller fix), `2b16c3e` (security tests).

- **G-027:** commits `ce6a0c4`, `cc7ddbb`, `8af101e`, `a79ad4f`, `a2f0814`, `ca4c637`, `f995157`, `2e45806` (inventory source, tests and supporting fixes).
- **G-028:** commits `d4ddaaa`, `527e21c`, `eac0817`, `904d20c`, `9432ad7`, `cc3aba6`, `09f57c6`, `f4127d6`, `3a05c00`, `44746ce` (publication-aware reads, cache separation, regression tests and formatting).
- **G-029:** commits `b8f240e`, `3e030bf` (bulk mutation membership guard and controller regression tests).

CI #554 completed successfully on G-027 code head `2e45806`; all jobs passed, including API unit/coverage and integration. G-028/G-029 are implemented with 11 focused tests, but current PR head `36ede62` (documentation-only commits after code head `44746ce`) has no associated GitHub Actions run/status.

## Remaining implementation order

1. **G-027 — closed:** CI #554 passed all jobs, including API unit/coverage and integration.
2. **G-028 — implemented, CI pending:** verify publication-aware product detail, store grid, variants, matrix and media read boundaries.
3. **G-029 — implemented, CI pending:** verify active store membership before bulk product mutation.
4. Re-run the authorization matrix for owner, staff, same-organization non-member, buyer, foreign merchant and privileged platform roles.
5. Continue G-002 runtime DB-role verification; live role evidence remains incomplete. Do not enable RLS or change live database privileges based on source assumptions.

## Safety boundary

No live database grants or policies were changed. No Render environment variables, deployment settings, staging records, protected workers, payment providers, shipping providers or customer notifications were modified or activated.
