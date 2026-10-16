# Phase 4.1.14 - exact staging groups A-L from
# P13-PHASE-4.1.13-UPDATED-RELEASE-CANDIDATE-MANIFEST.md section 10.
# Never `git add -A` / `git add .`. Never stage .m73b6-scratch/, test-token.txt, or probes.
Set-Location C:\TAIF\scs-platform

# A. Root config, CI, Docker gate
git add -- .gitignore .nvmrc .dockerignore .github/workflows/ci.yml

# B. Admin UI fix
git add -- apps/admin/src/app/settlement-adjustments/page.tsx

# C. Migration runners
git add -- apps/api/infra/drizzle/migrate.ts apps/api/infra/drizzle/migrate-pg.ts

# D. API core
git add -- apps/api/src/app.module.ts apps/api/src/main.ts apps/api/src/drizzle/schema.ts
git add -- apps/api/src/common/database/database.service.ts apps/api/src/common/redis/redis.service.ts apps/api/src/common/tenant-scope.ts
git add -- apps/api/src/config/env-gate.ts

# E. Audit module
git add -- apps/api/src/modules/audit/audit.schema.ts apps/api/src/modules/audit/audit.service.ts

# F. Returns module (6 modified)
git add -- apps/api/src/modules/returns/commission-reversal.service.ts apps/api/src/modules/returns/return-expiration.worker.ts apps/api/src/modules/returns/returns.controller.ts apps/api/src/modules/returns/returns.module.ts apps/api/src/modules/returns/returns.service.ts apps/api/src/modules/returns/settlement-adjustment.service.ts

# G. Operations module (directory verified: exactly 12 files)
git add -- apps/api/src/modules/operations

# H. Tests - modified (4)
git add -- apps/api/src/__tests__/unit/returns/settlement-adjustment.spec.ts apps/api/src/__tests__/integration/p13-financial-dispute.postgres.spec.ts apps/api/src/__tests__/integration/p13-returns.postgres.spec.ts apps/api/src/__tests__/integration/p311-concurrency.postgres.spec.ts

# I. Tests - new (3 files + 2 verified directories)
git add -- apps/api/src/__tests__/integration/p4-http-authorization.postgres.spec.ts apps/api/src/__tests__/integration/p4-operational-readiness.postgres.spec.ts apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts
git add -- apps/api/src/__tests__/unit/deployment apps/api/src/__tests__/unit/operations

# J. Migration 0063
git add -- infra/drizzle/migrations/0063_phase4_operational_readiness.sql

# K. Deployment (directory verified: exactly 6 files) + compose
git add -- infra/deploy infra/docker-compose.prod.yml

# L. Phase reports (94 at execution time)
git add -- "docs/production/P13-PHASE-4-*.md" "docs/production/P13-PHASE-4.1-*.md" "docs/production/P13-PHASE-4.1.*.md"

$staged = @(git diff --cached --name-only)
"STAGED_COUNT=$($staged.Count)"
