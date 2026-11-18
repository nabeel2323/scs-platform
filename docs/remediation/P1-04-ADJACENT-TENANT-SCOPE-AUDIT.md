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
| G-027 | Store inventory, warehouse inventory, variant inventory, item movements, low-stock listing and stock mutations | `inventory.controller.ts:22-67,100-171`; `inventory.service.ts:63-115,145-149,184-190,271-430` | Several paths enforce organization scope only. Store membership is not consistently enforced; unqualified low-stock reads include warehouses across the active organization, not only stores where the caller is an active member. **Open.** |
| G-028 | `GET /stores/:storeId/products`; `GET /products/:id`; product variants, variant matrix and media reads | `catalog.controller.ts:215-236,419-438,539-540,570-572`; `catalog.service.ts:1040-1046,1177-1234,2069-2082,2263-2304`; `buyer-api.ts:398-405` | Buyer API documentation says buyers must request `ACTIVE` explicitly, but the API does not enforce the filter. Product detail lookup returns any non-deleted product, regardless of publication status. Merchant and buyer read contracts need to be enforced server-side. **Open.** |
| G-029 | `POST /stores/:storeId/products/bulk` | `catalog.controller.ts:515-522`; `catalog.service.ts:1773-1803` | Permission check existed, but the controller did not verify the caller's organization/store membership before bulk delete/archive/draft actions. **Open.** |

## Changes committed

The following fixes and regression tests are committed on the remediation branch:

- **G-024:** commit `c48bb9d` (controller fix), `c0b8f0e` (security tests).
- **G-025:** commit `9511d5a` (controller fix), `f77f553` (security tests).
- **G-026:** commit `d83da11` (controller fix), `2b16c3e` (security tests).

All checks remain subject to latest-head CI. At the time this report was updated, CI run #551 on `2b16c3e9` had passed lint/typecheck, mobile, web/admin, E6 and migration checks; API coverage and integration checks were still running.

## Remaining implementation order

1. G-027 — extend active store membership through inventory controller/service access paths, including low-stock queries.
2. G-028 — enforce the buyer `ACTIVE` product boundary and allow non-ACTIVE product data only to authorized active store members.
3. G-029 — require store membership before bulk product mutation.
4. Re-run the authorization matrix for owner, staff, same-organization non-member, buyer, foreign merchant and privileged platform roles.
5. Continue G-002 runtime DB-role verification separately. Do not enable RLS or change live database privileges based on source assumptions.

## Safety boundary

No live database grants or policies were changed. No Render environment variables, deployment settings, staging records, protected workers, payment providers, shipping providers or customer notifications were modified or activated.
