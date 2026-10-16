# P13 Phase 4.1.4 — Full Migration Verification

| Field | Value |
|-------|-------|
| Phase | 4.1.4 — Priority 1 |
| Date | 2026-10-15 |
| Result | **PASS — 63/63 migrations applied, 0 failures** |

## 1. CI Image Build

### Dockerfile: `infra/deploy/ci-postgres.Dockerfile`
- Base: `postgres:16-bookworm`
- Adds: PGDG bookworm-pgdg repository
- Installs: `postgresql-16-postgis-3` (3.6.4), `postgresql-16-postgis-3-scripts`, `postgresql-16-partman` (5.5.0)
- Build time: ~445 seconds (network-dependent)
- Image tag: `scs-ci-postgres:16-partman`

### Build Evidence
```
#5 DONE 412.8s
=== Installed packages ===
ii  postgresql-16-partman              5.5.0-1.pgdg12+1
ii  postgresql-16-postgis-3            3.6.4+dfsg-2.pgdg12+1
ii  postgresql-16-postgis-3-scripts    3.6.4+dfsg-2.pgdg12+1
=== Extension control files ===
/usr/share/postgresql/16/extension/pg_partman.control
/usr/share/postgresql/16/extension/postgis.control
```

## 2. Full Migration Apply (63/63)

### Command
```powershell
powershell -ExecutionPolicy Bypass -File run_full_migrations.ps1
```
Target: `ci-full-migration-postgres` container from `scs-ci-postgres:16-partman`

### Results
```
APPLY: 0001_identity.sql ... OK
APPLY: 0002_platform.sql ... OK
...
APPLY: 0013_analytics.sql ... OK        ← requires pg_partman
...
APPLY: 0018_analytics_retention.sql ... OK  ← requires pg_partman
...
APPLY: 0063_phase4_operational_readiness.sql ... OK

Applied: 63 / 63
Failed: 0
```

### Post-Migration State
| Metric | Value |
|--------|-------|
| Total tables | 111 |
| Extensions loaded | pg_partman 5.5.0, pg_trgm 1.6, plpgsql 1.0 |
| Partitioned tables | analytics_events (range, 1 month) |
| pg_partman config | `public.analytics_events`, range, `1 mon` |

## 3. Partial Migration Test (postgis:16-3.4 without pg_partman)

### Command
Applied 61 migrations (skipping 0013, 0018) to `ci-migration-postgres` (postgis:16-3.4).

### Results
```
Applied: 61
Skipped: 2 (pg_partman)
Failed: 0
Tables: 98
```

### Failure Propagation Test
Migration 0013 applied to the postgis:16-3.4 container:
```
EXIT: 3
ERROR: extension "pg_partman" is not available
DETAIL: Could not open extension control file "/usr/share/postgresql/16/extension/pg_partman.control"
```
**Failure propagation confirmed**: migration exits non-zero, runner would halt.

## 4. CI Runner Update

### Before
```typescript
// migrate-pg.ts
const EXCLUDED = new Set(['0013_analytics.sql', '0018_analytics_retention.sql']);
.filter((f) => f.endsWith('.sql') && !EXCLUDED.has(f))
```

### After
```typescript
// Phase 4.1.4: CI image now includes pg_partman. All 63 migrations apply.
.filter((f) => f.endsWith('.sql'))
```

## 5. Verdict

| Check | Status |
|-------|--------|
| CI image builds with pg_partman | PASS |
| All 63 migrations apply cleanly | PASS |
| pg_partman partitioning configured | PASS |
| Failure propagation (missing ext) | PASS |
| CI runner no longer excludes | PASS |

**PASS** — Full migration chain is complete and enforcing.
