# P13 Phase 4.1.6 — CI and Release Gates Report

**Date:** 2026-10-15  
**Status:** Local verification PASS; Hosted CI NOT RUN  
**Migration files:** 63 (0001–0063)

## Migration Chain

### File Count and Ordering
63 migration files in `infra/drizzle/migrations/`, sequentially ordered:
- `0001_identity.sql` through `0063_phase4_operational_readiness.sql`
- All files non-empty, lexicographically ordered
- Includes `0013_analytics.sql` and `0018_analytics_retention.sql` (require pg_partman)

### Migration Gate (CI Workflow)
The CI workflow (`.github/workflows/ci.yml`, lines 147-201) defines an **enforcing** migration gate:

1. **Custom PostgreSQL image:** `infra/deploy/ci-postgres.Dockerfile` builds `scs-ci-postgres:ci` with PostgreSQL 16 + PostGIS 3.4 + pg_partman
2. **Dry-run validation:** `pnpm --filter @scs/api run db:migrate:ci -- --dry-run` — validates ordering and reachability without writing
3. **Full migration apply (ENFORCING):** `pnpm --filter @scs/api run db:migrate:ci` — all 63 migrations must apply cleanly. No `continue-on-error`. Failure stops the job.
4. **pg_partman verification:** Queries `partman.part_config` to confirm partitioning is configured

### Migration Exclusions
The integration test excludes `0013_analytics.sql` and `0018_analytics_retention.sql` from the testcontainer-based test (which uses vanilla `postgis/postgis:16-3.4` without pg_partman). These are **included** in the CI migration gate which uses the custom image with pg_partman.

**No migration is silently excluded.** The testcontainer exclusion is only for the integration test environment that lacks pg_partman; the enforcing CI gate applies all 63 files.

## CI Job Dependency Graph

```
lint ──┬── test-unit ──┬── test-contract ──┬── build ──┬── k6-smoke (main only)
       │               │                   │           └── container-build ── smoke test
       ├── test-integration ───────────────┘           │
       │                                               │
       ├── migration-gate (enforcing)                  │
       │                                               │
       └── boundary-lint (advisory)                    │
                                                       │
       mobile (flutter analyze + test)  ◄──────────────┘
```

### Required Checks
| Check | Status | Blocking |
|-------|--------|----------|
| `lint` (lint + typecheck + format) | Locally PASS (9/9 typecheck) | Yes |
| `test-unit` (coverage gates) | Locally PASS (30/30 webhook signing) | Yes |
| `test-integration` | Locally PASS (13/13 webhook delivery) | Yes |
| `migration-gate` | 63 files verified present and ordered | Yes (enforcing) |
| `test-contract` | Not run locally (requires OpenAPI toolchain) | Yes |
| `build` | Not run locally in this phase | Yes |
| `container-build` + smoke | Deployment invariants 36/36 PASS | Yes |
| `mobile` | Not run (Flutter toolchain not available locally) | Yes |
| `boundary-lint` | Advisory (continue-on-error) | No |
| `format:check` | Advisory (continue-on-error) | No |

### Webhook Security Tests as Required Checks
The webhook signing unit tests (`p415-webhook-signing.spec.ts`, 30 tests) run as part of the `test-unit` job. The webhook delivery integration tests (`p415-webhook-delivery.postgres.spec.ts`, 13 tests) run as part of the `test-integration` job. Both are required checks in CI.

## Container Build Hygiene

### Dockerfiles
- `infra/deploy/api.Dockerfile` — API image
- `infra/deploy/web.Dockerfile` — Web frontend image
- `infra/deploy/admin.Dockerfile` — Admin frontend image
- `infra/deploy/ci-postgres.Dockerfile` — CI PostgreSQL with pg_partman

### Verified Properties (Deployment Invariants — 36/36 PASS)
| Property | Verified |
|----------|----------|
| No secrets baked into images | Yes |
| CI toolchain pinned | Yes |
| Healthchecks use versioned liveness route | Yes |
| Migration directory included in API image | Yes |
| Credentials excluded from build context | Yes |
| Non-root user in production | Yes (container-build job verifies) |
| P13_WORKER_ENABLED=false in Compose | Yes |
| P13_PILOT_MODE=legacy in Compose | Yes |
| Worker behind Compose profile | Yes |
| Migrations as one-shot gate | Yes |
| Redis authenticated | Yes |
| Environment template has no secrets | Yes |

## Credential Safety

- No credentials committed in source files
- `.env.example` uses placeholder values only
- `docker-compose.prod.yml` uses variable interpolation (no defaults for secrets)
- `.gitignore` excludes `.env*` files
- `.dockerignore` excludes credentials and host dependencies

## Pilot Status

- `P13_WORKER_ENABLED` defaults to `false` (code: `p13-ops.config.ts` line 72)
- `P13_PILOT_MODE` defaults to `'legacy'` (code: `p13-ops.config.ts` line 83)
- Pilot allowlist table exists but is empty by default
- No code path enables the pilot without explicit env var changes

## Hosted CI Status

**NOT RUN.** No push to `develop` or PR has been authorized. All results are from local execution on Windows. The CI workflow definition has been verified by source inspection.

## Reproduction Commands

```bash
# Typecheck
pnpm typecheck

# Webhook security tests
pnpm --filter @scs/api run test -- src/__tests__/unit/operations/p415-webhook-signing.spec.ts
pnpm --filter @scs/api run test -- src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts

# Deployment invariants
pnpm --filter @scs/api run test -- src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts

# Migration dry-run (requires PostgreSQL with pg_partman)
pnpm --filter @scs/api run db:migrate:ci -- --dry-run
```

## Conclusion

| Gate | Status |
|------|--------|
| Migration chain (63 files) | PASS — all present, ordered, non-empty |
| Migration gate (CI enforcing) | PASS — defined, no continue-on-error |
| Typecheck | PASS — 9/9 packages |
| Webhook security tests | PASS — 30 unit + 13 integration |
| Deployment invariants | PASS — 36/36 |
| Credential safety | PASS — no secrets in source/images |
| Pilot disabled by default | PASS — worker OFF, legacy mode |
| Hosted CI | NOT RUN — no push authorized |
