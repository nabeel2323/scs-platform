# G-001 — Merchant Offer Read Authorization Remediation

| Field | Value |
|---|---|
| Repository | `nabeel2323/scs-platform` |
| Base branch | `develop` |
| Remediation branch | `security/p0-merchant-offer-tenant-scope` |
| Finding | G-001 (P0) |
| Status | READY FOR INDEPENDENT REVIEW |
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

**Execution status: PASSED IN CI.** CI run #966 executed the API unit/coverage and integration jobs successfully on HEAD `0bb652d77eb30fbc3e0de5dbd68d4fc54d45f68f`.

- Controller unit regression suite: 10 tests passed.
- HTTP authorization regression suite: 19 tests passed across the three merchant read routes.
- API unit/coverage job: 213 test files passed, 6 skipped; 4,359 tests passed, 110 skipped.
- API integration job: `pnpm --filter @scs/api test:integration` passed. This runs the full `src/__tests__/integration` directory, including the real-PostgreSQL catalog lifecycle test and its store membership assertions.
- Repository-wide lint, typecheck, formatting, boundary lint, migration full apply, web/admin tests, Flutter analysis/tests, build and container smoke test all passed.

The first expanded PostgreSQL fixture attempt failed because it used unsupported store role `STAFF`. The fixture was corrected to the migration-defined `MEMBER` value in commit `0bb652d`; the corrected full integration job passed in CI #966.

Exact workflow evidence: [CI #966](https://github.com/nabeel2323/scs-platform/actions/runs/44622530364). Staging release and k6 smoke jobs were skipped by workflow policy; no staging deployment was performed.

## 4. Explicitly not changed

- No Supabase schema, grants, RLS policies, database role, or migration was changed.
- No Render environment variable, deploy, restart, or worker flag was changed.
- No API database credential was read or exposed.
- No production or staging business data was created or modified.
- No claim is made that the P0 is fully closed before the focused test and HTTP-level verification pass.

## 5. Commits

- `1ad2e758661aa8d8baa6c12558eb9def11d9152a` — enforce tenant checks on merchant offer list, analytics and trend.
- `65ffec69c80d6f7471395d328f6db30ea77c39dd` — add focused controller regression tests.
- `09f617d2a0cba0fbcc1e0369e8d6ed49ee09b85e` — make NestJS controller dependencies explicit for runtime/test injection.
- `0f45e7f2b8eb8ca59b3bd73108e72a120f32a7d5` — add active store-staff HTTP authorization coverage.
- `9dd0b00d6a975541507d8b666373157e7207a1eb` — add real-PostgreSQL store membership assertions and fixtures.
- `0bb652d77eb30fbc3e0de5dbd68d4fc54d45f68f` — correct the PostgreSQL fixture role to the migration-supported `MEMBER` value.
- Documentation evidence update — pending commit.

## 6. Review findings and remaining gate

The implementation review confirms:

1. Each of the three merchant read handlers returns early when `storeId` is absent, otherwise invokes organization ownership validation followed by active store membership validation before calling its offer service method.
2. Both checks receive caller identity projected from the authenticated JWT (`sub`, `role`, `activeOrg`).
3. The database-backed helper queries `store_members` for the exact store, user and `ACTIVE` status. The migration constrains membership roles to `OWNER`, `ADMIN`, and `MEMBER`.
4. The existing platform-staff bypass policy is preserved, not expanded by this remediation. The shared helper currently recognizes `SUPER_ADMIN`, `ADMIN`, `MODERATOR`, and `SYSTEM`; ordinary merchant, staff and buyer identities do not receive that bypass.
5. Service calls are suppressed on denied HTTP requests in the regression matrix.

**Remaining gate:** obtain a second-party security review of the shared privileged-role bypass and route coverage, then record the reviewer and outcome. G-001 is therefore `READY FOR INDEPENDENT REVIEW`, not CLOSED.

After the second-party review, close G-001 only if the reviewer accepts the bypass semantics and the complete acceptance criteria. Continue G-002 with a complete table/sequence/function/default-privilege inventory and a least-privilege API database-role design. Do not enable RLS indiscriminately while the API appears to connect as the table-owning `postgres` role.
