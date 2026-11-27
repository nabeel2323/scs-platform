# SCS Platform — Test Campaign Manifest

**Owner:** Remediation lead / repository maintainer  
**Status:** Working manifest for Phases 0–6  
**Repository:** `nabeel2323/scs-platform`  
**Working branch:** `remediation/phase-0-1-tenant-security`  
**Environment rule:** Do not run write-oriented tests against the shared Supabase database. Use ephemeral CI PostgreSQL/Testcontainers or an explicitly isolated test database.

## 1. Local repository gates

Run from the repository root after `pnpm install --frozen-lockfile`.

| Command                   | Purpose                              | Notes                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm lint`               | ESLint across workspace packages     | Required CI gate                                                                                                                                                                                                                           |
| `pnpm typecheck`          | TypeScript checks across workspace   | Required CI gate                                                                                                                                                                                                                           |
| `pnpm build`              | Workspace production build           | Required CI gate                                                                                                                                                                                                                           |
| `pnpm format:check`       | Full-repository Prettier validation  | Advisory outside the PR workflow; the PR workflow runs blocking `pnpm format:check:changed` on all PR-changed files. CI #45245048568 reported 279 files and stopped downstream jobs; resolve this debt without disabling the required gate |
| `pnpm boundary-lint`      | Modular-monolith E6 boundary checker | Advisory in CI while known cross-module import debt remains                                                                                                                                                                                |
| `pnpm contracts:build`    | Build API contract package           | Required before web/admin contract tests                                                                                                                                                                                                   |
| `pnpm contracts:generate` | Generate TypeScript API client       | Contract drift guard runs in CI                                                                                                                                                                                                            |

## 2. API tests

Run from repository root:

- `pnpm --filter @scs/api test:coverage` — full Vitest suite with v8 coverage gates.
- `pnpm --filter @scs/api test:unit` — unit specs only.
- `pnpm --filter @scs/api test:integration` — integration specs with no file parallelism and Redis-suite assertion.
- `pnpm --filter @scs/api db:migrate:ci` — migration runner; only against an isolated disposable database.

**Important CI behavior:** the API Vitest coverage configuration includes `src/__tests__/**/*.spec.ts`, so self-provisioning Testcontainers/PostgreSQL integration specs also contribute to coverage. The separate integration job uses PostGIS/PostgreSQL and Redis service containers. The Redis-specific suite is gated by `REDIS_IT=1`; do not assume it ran when the variable was absent.

The migration-full-apply job uses isolated CI PostgreSQL. It is not evidence that migrations were applied to the shared Supabase database.

## 3. Web, admin and mobile

| Surface               | Command                                                                                                                                                                                                                                                                                                                                                                                                              | CI behavior / prerequisites                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Web                   | `pnpm --filter @scs/web test`                                                                                                                                                                                                                                                                                                                                                                                        | Full Vitest suite; contract package built first                                                                           |
| Admin                 | `pnpm --filter @scs/admin test -- src/__tests__/hydration-document-root.test.tsx src/__tests__/global-styles.test.tsx src/__tests__/sidebar-styles.test.tsx src/__tests__/hydration-admin-clock.test.tsx src/__tests__/hydration-admin-session.test.tsx src/__tests__/hydration-admin-perms.test.tsx src/__tests__/admin-settlements-recovery.test.tsx src/__tests__/admin-settlement-adjustments-recovery.test.tsx` | CI currently runs this focused set; two unrelated management tests were baseline failures and remain tracked              |
| Flutter               | `cd mobile && flutter pub get && flutter analyze && flutter test`                                                                                                                                                                                                                                                                                                                                                    | CI runs Flutter analyze and tests; mobile device/provider UAT is separate                                                 |
| Flutter release build | `cd mobile && flutter build appbundle`                                                                                                                                                                                                                                                                                                                                                                               | Run only for the explicitly selected release flavor/signing configuration; signing secrets are not part of ordinary PR CI |

## 4. Contract, container and end-to-end tests

- Contract generation/drift: `pnpm contracts:build`, `pnpm contracts:generate`, then CI's controller/OpenAPI/generated-client drift guard.
- Container smoke: CI builds the API image, starts disposable PostgreSQL/Redis, starts the API with safe defaults, checks health endpoints, P13 configuration and non-root execution.
- Playwright E2E: `pnpm --filter @scs/e2e test`; ship-ops focused suite: `pnpm --filter @scs/e2e test:shipops`. Requires the explicitly provisioned E2E target, browser dependencies, synthetic identities and safe test data. Never point write journeys at the shared Supabase database.
- k6: `BASE_URL=<isolated-test-target> k6 run infra/load/smoke.js`. Current thresholds are p95 below 400 ms and failed-request rate below 1%. The current smoke script also posts to `/v1/auth/otp/request`; verify the test identity and suppress/contain external delivery before running against any non-disposable target.

## 5. Migration and deployment checks

- Migration syntax/full apply: CI's isolated PostgreSQL migration job; it applies the full migration set and asserts public privilege/search_path invariants.
- Read-only live role inspection: `pnpm --filter @scs/api db:audit-access` with a controlled `DATABASE_URL`; it prints role/grant metadata only and does not read application rows or mutate the database.
- Staging release: the reusable `.github/workflows/release.yml` workflow is invoked by CI only after the mandatory `develop` gates pass. It performs real migrations, RBAC seed, ledger verification, Render deployment and health checks. Manual dispatch is also a real mutating release, not a dry run.

## 6. Final Phase 6 campaign order

1. Freeze a release-candidate SHA and confirm the database target is isolated from the shared development database.
2. Clean install, lint, typecheck, boundary/format review, API/web/admin/mobile builds.
3. Fresh-database full migration and representative upgrade migration; inspect grants, RLS, constraints, indexes and migration ledger.
4. Tenant security negative matrix with two buyers and two merchants; test direct API object access and database role boundaries.
5. Buyer, merchant, admin and operations journeys using synthetic identities.
6. Worker/outbox, idempotency, lease expiry/reclaim, multi-instance race and protected financial-job tests.
7. External provider sandboxes only: OTP/email, carrier label/tracking and payment sandbox if explicitly in scope. Record provider acceptance separately from final delivery/settlement.
8. Mobile checkout/order detail/tracking, RTL, accessibility and retry/offline cases.
9. k6 performance/reliability with thresholds frozen before the run.
10. Migration recovery and documented forward-fix; final evidence report and GO/CONDITIONAL GO/NO-GO decision.

## 7. Safety and release constraints

- Use synthetic accounts, organizations, stores, products, offers, payment references and shipment fixtures only.
- No real payment capture, live shipment/label creation, customer OTP/notification, refund, settlement or financial write without explicit release authorization.
- The connected Supabase database is shared across branches. Do not run destructive or write-oriented E2E tests against it.
- The live database's RLS/grant remediation remains gated on actual API and migration role verification.
- Backup/restore exercise P0-12 is deferred by explicit user direction for this development remediation cycle. The original plan still lists restore evidence as a pre-production release gate; it must be revisited before a final GO decision.
- CI green is not deployment authorization. PR jobs skip k6 and staging release; the release workflow mutates the database and deploys.

## 8. Current limitations

- Vercel web/admin preview checks recently reported account build-rate-limit failures; these are not successful frontend builds.
- The staging audit workflow is manually dispatchable only after it exists on the repository default branch; it checks out `develop` for the audit utility.
- Provider sandbox credentials and a separate isolated staging database are not confirmed by this manifest.

### FIN-047 financial UI coverage

The Admin CI job also runs `admin-settlements-recovery.test.tsx` and `admin-settlement-adjustments-recovery.test.tsx`. The broader Admin management suite remains outside this focused CI command because its two documented baseline failures are unrelated; this does not exclude settlement pagination and adjustment recovery regressions.

### Current PR formatter gate — 23 November 2026

The PR workflow's `pnpm format:check:changed` step is blocking (despite the separate full-repository `format:check` being described as advisory). Exact-head CI #45245048568 reported 279 changed files with formatting differences; because the step runs inside the Lint & Typecheck job, API/Web/Admin and integration tests were skipped. Do not assume the Admin or Merchant settlement regressions passed. Do not disable the check; the formatting debt must be resolved in a grouped cleanup before the consolidated test campaign can continue.
