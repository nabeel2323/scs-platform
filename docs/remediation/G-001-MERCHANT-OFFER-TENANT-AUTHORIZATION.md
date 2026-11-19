# G-001 — Merchant Offer Read Authorization Remediation

| Field | Value |
|---|---|
| Repository | `nabeel2323/scs-platform` |
| Base branch | `develop` |
| Remediation branch | `security/p0-merchant-offer-tenant-scope` |
| Finding | G-001 (P0) |
| Status | IMPLEMENTED — VERIFICATION PENDING |
| Scope | Merchant offer list, analytics and trend HTTP read endpoints |
| Database changes | None |
| Staging changes | None |

## 1. Finding reproduced in source

At the current `develop` baseline, `apps/api/src/modules/catalog/catalog.offer.controller.ts` exposed three authenticated read endpoints that accepted a caller-supplied `storeId` and passed it directly to the service:

- `GET /v1/merchant/offers`
- `GET /v1/merchant/offers/analytics`
- `GET /v1/merchant/offers/analytics/trend`

The handlers did not pass the authenticated caller into a tenant-scope check. The service then queried merchant offers and associated sales data by that store ID. This is the P0 cross-tenant read path described in the November readiness audit.

## 2. Implemented change

All three handlers now receive the authenticated `JwtPayload` and call one shared controller helper before invoking the offer service.

The helper performs both checks:

1. `assertStoreInOrg` — the requested store must belong to the caller's active organization.
2. `assertStoreMember` — the caller must have active membership in that store.

Both helpers are existing fail-closed controls from `apps/api/src/common/tenant-scope.ts`. The existing explicit platform-staff bypass semantics are preserved by those helpers. No new role bypass or alternate authorization rule was introduced.

When `storeId` is omitted, the endpoints continue returning an empty array and do not query the offer service.

## 3. Regression tests added

Added `apps/api/src/__tests__/unit/catalog-offer-tenant-authorization.spec.ts`.

The focused test suite covers each of the three endpoints for:

- Successful authorization: both organization scope and active store membership are checked before the service is called.
- Cross-organization denial: a rejected organization check prevents the service query.
- Missing active store membership: a rejected membership check prevents the service query.
- Missing `storeId`: no tenant lookup or offer-service query occurs.

**Execution status: NOT EXECUTED.** The GitHub file-edit integration used for this change does not provide a local checkout or test runner. The suite must run in CI or a checked-out development environment before this finding can be marked CLOSED.

Recommended focused verification:

```bash
pnpm --filter @scs/api exec vitest run src/__tests__/unit/catalog-offer-tenant-authorization.spec.ts
pnpm --filter @scs/api typecheck
pnpm --filter @scs/api lint
```

Then run the existing tenant-isolation integration suite and add/execute HTTP-level requests for merchant A against merchant B's store, plus owner, active store staff, inactive store member, buyer, and platform staff cases.

## 4. Explicitly not changed

- No Supabase schema, grants, RLS policies, database role, or migration was changed.
- No Render environment variable, deploy, restart, or worker flag was changed.
- No API database credential was read or exposed.
- No production or staging business data was created or modified.
- No claim is made that the P0 is fully closed before the focused test and HTTP-level verification pass.

## 5. Commits

- `1ad2e758661aa8d8baa6c12558eb9def11d9152a` — enforce tenant checks on merchant offer list, analytics and trend.
- `65ffec69c80d6f7471395d328f6db30ea77c39dd` — add focused regression tests.
- `d0b74304192f9da3fe24d5696d2be200f30c07a0` — update remediation progress tracker.

## 6. Next verification gate

1. Execute the focused test, API typecheck and lint.
2. Execute HTTP-level tenant-isolation tests against the three routes.
3. Independently review role bypass behavior and ensure ordinary buyers cannot access merchant-only reports.
4. Only then close G-001.
5. Continue G-002 with a complete table/sequence/function/default-privilege inventory and a least-privilege API database-role design. Do not enable RLS indiscriminately while the API appears to connect as the table-owning `postgres` role.
