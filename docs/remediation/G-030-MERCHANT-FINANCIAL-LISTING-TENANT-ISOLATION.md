# G-030 — Merchant Payment and Settlement Listing Tenant Isolation

**Severity:** P0  
**Status:** CLOSED — CURRENT-HEAD CI VERIFIED  
**Date discovered:** 19 November 2026  
**Branch:** `remediation/phase-0-1-tenant-security`  
**Finding class:** Broken object-level authorization / cross-tenant financial data disclosure

## 1. Evidence and root cause

Source review found two merchant listing routes whose service calls did not carry the authenticated tenant context:

- `GET /v1/merchant/payments` called the general `listPayments({ storeId, status })` method. That method attempted to build order-level store/buyer filters, but the constructed `orderConditions` were never applied to the payment query. A missing store filter returned all payments; a supplied store filter also failed to constrain the final result.
- `GET /v1/merchant/settlements` called the general `listSettlements({ storeId, status })` method without the authenticated caller. Without a store filter, the method returned all settlements; with a caller-supplied store ID, it did not verify active organization ownership.

Both controller routes require `merchant:orders:read`. The seeded MERCHANT_OWNER and MERCHANT_STAFF roles receive this permission as an organization-wide read capability. The correct object-level boundary is the authenticated caller's active organization; `store_members` is not the intended authorization boundary for these financial read routes.

The source-level finding does not assert that a specific production user exploited the defect. No production payment/settlement rows were accessed or modified during this review.

## 2. Remediation

### API service

- Added `listMerchantPayments(caller, filters)`.
  - Requires an active organization for non-platform callers.
  - Requires an active organization and validates an explicitly requested store against that organization.
  - Joins payment records → orders → stores and filters by the authenticated active organization.
  - Applies optional store/status/payment-method filters in SQL.
- Added `listMerchantSettlements(caller, filters)`.
  - Requires an active organization for non-platform callers.
  - Requires an active organization and validates an explicitly requested store against that organization.
  - Joins settlement records → stores and filters by the authenticated active organization.
  - Applies optional store/status filters in SQL.
- Corrected the general `listPayments` store/buyer filter path by resolving matching order IDs and applying them to the payment query. Empty matches return an empty result, never an unfiltered list.
- Platform staff retain the documented privileged behavior; merchant routes no longer rely on that bypass for ordinary merchant callers.

### API controller

- `merchantListPayments` receives `@CurrentUser()`, builds the trusted `CallerContext` from JWT claims and calls `listMerchantPayments`.
- `merchantSettlements` passes the same trusted caller context to `listMerchantSettlements`.

## 3. Regression coverage

Added tests for:

- Two independent merchant organizations: merchant A sees only payment A and merchant B sees only payment B.
- A same-organization user with the merchant read permission but without a `store_members` row can read only their own organization's records; a foreign-organization store ID is denied.
- Merchant A cannot request merchant B's store ID.
- Merchant A and merchant B see only their own settlement rows.
- Admin/service store and buyer filters return only payments linked to matching orders.
- Controller methods forward the authenticated caller context and filters to the merchant-scoped service methods.

Test files:

- `apps/api/src/__tests__/integration/p311-tenant-isolation.postgres.spec.ts`
- `apps/api/src/__tests__/unit/payments/payments-controller-tenant-scope.spec.ts`

Implementation files:

- `apps/api/src/modules/payments/payments.service.ts`
- `apps/api/src/modules/payments/payments.controller.ts`

## 4. Verification evidence

- Current-head CI **#832** passed on `d965e73da727aa136fa4af859f7f423de04d00d7`.
- API unit tests and coverage gates passed.
- PostgreSQL integration tests passed, including the two-tenant G-030 regression fixture.
- Lint/typecheck, changed-file formatting, Flutter analysis/tests, E6 boundary lint, isolated full migration apply, web/admin tests, contract/codegen, production build and container build/smoke all passed.
- k6 smoke and staging release jobs were skipped by workflow conditions; this report does not claim performance or staging-release verification.
- No shared Supabase mutation, financial data write, staging deployment or production deployment was performed.

**Disposition:** G-030 is CLOSED for the code/test scope represented by CI #832. The broader Phase 6 release campaign and production authorization gates remain open.
