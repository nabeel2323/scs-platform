# P13 Phase 4.1.13 — Regression and Security Report

**Phase:** 4.1.13 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

All commands were executed fresh in this session; exit codes captured explicitly.

---

## 1. Integration Suites (all six, sequential)

| Command | Result | Exit |
|---------|--------|------|
| `pnpm exec vitest run src/__tests__/integration/p4-operational-readiness.postgres.spec.ts -t "AL-17"` (apps/api) | 4 passed \| 58 name-filtered (62) | 0 |
| `pnpm exec vitest run src/__tests__/integration/p4-operational-readiness.postgres.spec.ts` | **62 passed (62)** | 0 |
| `pnpm exec vitest run --no-file-parallelism p13-financial-dispute p13-returns p311-concurrency p4-http-authorization p415-webhook-delivery` (5 files) | **92 passed (92), 5 files passed** | 0 |

**Six-suite total: 154 passed, 0 failed, 0 skipped.** Phase 4.1.12 baseline was 150 passed / 1 failed (AL-17) / 0 skipped — this phase resolves AL-17 and adds 3 new fail-closed tests (AL-17a/b/c). Zero unexplained failures. All tenant-isolation and HTTP-authorization suites are untouched and green (p4-http-authorization 34/34 within the 92).

## 2. P13 Unit Tests

`pnpm exec vitest run src/__tests__/unit/returns src/__tests__/unit/operations src/__tests__/unit/deployment src/__tests__/unit/config/env-gate.spec.ts` → **10 files, 289/289 passed, exit 0** (complete superset of the 4.1.12 nine-file set: all six returns specs incl. the modified settlement-adjustment spec, webhook-signing, signing-exception, deployment-invariants, plus env-gate). The specifically mandated deployment-invariants and webhook-signing tests are green within this run.

## 3. Contracts, Typecheck, Lint, Build

| Check | Command | Result | Exit |
|-------|---------|--------|------|
| Contracts build | `pnpm --filter @scs/contracts run build` | tsc clean | 0 |
| Typecheck | `pnpm typecheck` | 9/9 turbo tasks (8 cached) | 0 |
| Lint | `pnpm lint` | 5/5 tasks; log: **0 error-lines / 296 warning-lines** (unchanged from 4.1.12; eslint exit 0 = zero errors) | 0 |
| Full build | `pnpm build` — attempt 1 | **FAILED**: `@scs/web` + `@scs/admin` — `Cannot find module 'next/dist/compiled/jest-worker/processChild.js'` in the `next@14.2.35` pnpm virtual store | 1 |
| Full build — repair | `pnpm install --force --offline` | relink 53.7 s (cpu-features optional-native failure = known-ignorable) | 0 |
| Full build — attempt 2 | `pnpm build` | **6/6 tasks (3 cached)**, `@scs/api` swc 367 files; two Windows path-length WARNINGs during `.next/standalone` linking are non-fatal | 0 |

**Classification of the attempt-1 failure:** host-environment defect, not a source defect — the documented Windows pnpm virtual-store pitfall (Phase 4.1.8/4.1.12 precedent); `pnpm typecheck` (9/9) and the API production build stayed green throughout. The authoritative Linux arbitration of the build remains the hosted `build` + `container-build` jobs, which are NOT RUN.

## 4. Fresh Migration & Idempotency

**Not re-run — condition not met, by design.** Phase 4.1.13 changed one test spec and added reports; no migration file and no database-related source was modified. The Phase 4.1.12 evidence stands: 63/63 fresh apply + idempotent re-run, both exit 0, on a genuinely fresh database, plus the missing-extension fail-closed proof (exit 1 at 0013).

## 5. Security Review of the Change

- **Secret scan** of `p4-operational-readiness.postgres.spec.ts` (patterns: AWS keys, `sk-`/`ghp_` tokens, private-key blocks, `password=`, credentialed postgres/redis URLs, non-loopback URLs): **0 hits**. The only declared secret-like value is `P4_TEST_SINK_SECRET`, an explicitly labelled 45-char test fixture bound to the in-process loopback receiver — not a credential, present only in the spec.
- **Receiver security properties**: byte-fidelity check (signed bytes = wire bytes), HMAC-SHA256 over `${timestamp}.${rawBody}` with constant-time comparison (shared `verifySignature`), 300 s freshness, 401 on every violation, zero secret logging.
- **No test weakening**: no assertion removed or loosened; zero `.skip`/`skipIf`/`todo` introduced; `continue-on-error` added nowhere; AL-18/19/20/21 byte-identical; the no-receiver fail-closed path (AL-19 `SUPPRESSED`) still passes.
- **Production defaults intact**: worker disabled, pilot `legacy`, allowlist empty, external webhook delivery disabled (config defaults + `.env.production.example` untouched); no production webhook receiver was created or claimed — the receiver is disposable CI/test-only.
- **Preserved fail-closed behavior**: AL-17a proves URL-without-secret fails closed at config init; AL-17b proves post-init corruption cannot produce an unsigned request.

## 6. Status Summary

| Gate | Status |
|------|--------|
| AL-17 signed round trip + 3 negative tests | **PASS** |
| Six P13 integration suites (154/154, 0 skipped) | **PASS** |
| P13 unit subset (289/289, 10 files) | **PASS** |
| Contracts / typecheck / lint | **PASS** |
| Full Turbo build | **PASS** after host-environment relink (attempt-1 failure classified, documented) |
| Migration + idempotency | **NOT REQUIRED** — no migration/DB source changed; 4.1.12 evidence stands |
| Hosted CI / container-build (Linux) | **NOT RUN** |
| **FAIL / BLOCKED** | **none** |
