# OTP-S1.38.3-FINAL-FINDINGS-REGISTER.md

**Task:** S1.38.3 §14/§15 — Consolidated Findings
**Date:** 2026-11-02
**Severity scale:** Critical / High / Medium / Low / Info. "Blocking" = blocks the Phase 1 release gate as defined by §12 acceptance criteria.

---

## A. Findings Closed in S1.38.3

| ID | Severity | Category | Finding | Resolution | Blocking now? |
|---|---|---|---|---|---|
| F-S1.38.3-01 | Medium | Test-harness | `m73b4` B4-PG-03 (8 sequential full order lifecycles ≈ 6.3–8s) ran under the Vitest default 5s per-test timeout → integration exit 1. | Measured duration (6,328ms isolated), added evidence-based 30s per-test timeout. All 8 exception assertions preserved; no coverage reduction. | No |
| F-S1.38.3-02 | Medium | Test-harness / environment | `p12` OrdersModule dynamic import (full NestJS module-graph closure) exceeded 60s under serial-suite resource contention (52s measured mid-run; 10.6s clean). Not an architecture defect — dependency graph is finite and correct. | Timeout raised 60s→120s with documented worst-case margin. Architectural assertion unchanged: still loads the real module graph, no mocks, no source-text substitution. | No |
| F-S1.38.3-03 | Medium | Test-harness defect (was mislabeled "flaky" in S1.38.2) | `password-login-regression` bcrypt timing test seeded passwords at cost 10 while production `getUnknownUserPasswordHash()` uses cost 12; the unknown-user path was legitimately ~4.2× slower, breaching the <4.0 enumeration-resistance ratio. | Seed cost aligned to 12 (matches production), median-of-3 sampling per path, 30s test timeout. Security assertion preserved and now deterministic. | No |
| F-S1.38.3-04 | Low | Reporting | Six internal contradictions across the nine S1.38.2 reports (integration PASS vs exit 1; pending unit suite vs claimed 2326; 33-skip run presented as verified; mixed test counts). | Append-only "S1.38.2.1 Revision Addendum (2026-11-02)" applied to 4 reports; single authoritative table in `OTP-S1.38.3-REPORT-RECONCILIATION.md` §3. | No |
| F-S1.38.3-05 | Low | Environment/toolchain | `pnpm --filter @scs/web build` failed with `Cannot find module next/dist/bin/next` — empty `next` entry in the pnpm virtual store (host-level store corruption, documented project repair). | `pnpm install --force` restored the store entry; build then exit 0 under Node 22.23.4. No source or lockfile semantics changed. | No |

## B. Informational Items (not defects, not blocking)

| ID | Item | Disposition |
|---|---|---|
| I-1 | GitHub Actions execution not verified — push/PR prohibited by §2, so only workflow **configuration** is verified. | Requires owner action post-authorization: push branch, confirm one all-green CI run. |
| I-2 | All S1.38–S1.38.3 work is uncommitted in the working tree (baseline HEAD c3c0047). Local commit requires separate explicit authorization per §2. | Owner decision. |
| I-3 | `flutter analyze` reports 15 pre-existing **info**-level style issues (0 errors/warnings). | Out of scope; harmless. |
| I-4 | Host default Node 26 remains incompatible with the pnpm store layout; `.nvmrc` pins Node 22 and all gates were run under 22.23.4. | Pre-existing, documented since S1.3. |
| I-5 | Full serial integration wall time ≈ 50–60 min on this host (Testcontainers per spec). | Infrastructure/toolchain characteristic; CI parallelizes services differently. |
| I-6 | A transitional `RedisThrottlerStorageService ... failing closed: Connection is closed` ERROR line appears in the log at suite teardown (Redis container shutdown racing a lingering app). No test failure resulted; behavior is the intended fail-closed default. | Harness shutdown-order artifact; could be smoothed in a future harness sprint. |

## C. Security Invariant Re-verification (§9/§12-15)

| Invariant | Method | Result |
|---|---|---|
| HMAC domain separation (`email:` vs `phone:`) | Source review of `hashIdentifier` + 0065/linking specs | ✓ intact |
| `v2:` version prefix; historical SHA-256 rows stay v1 | 0065 forward-only migration spec (13 tests) | ✓ intact |
| `OTP_HMAC_SECRET` fail-closed, no fallback | Source review `resolveOtpHmacSecret`; env-gate unit suite | ✓ intact |
| Audit records never contain raw identifiers | Call-site sweep in `identity.service.ts` + redaction specs | ✓ intact |
| Enumeration resistance (timing) | F3 fix strengthens rather than weakens the test | ✓ intact |
| Mock provider production rejection; SMTP credential redaction; OTP log redaction | Existing suites within 1584-run | ✓ pass |

## D. Classification Summary (per §14 requirement)

- **Actual product defects remaining: 0.**
- **Test-harness defects remaining: 0** (three found and fixed with evidence).
- **Infrastructure/toolchain limitations:** I-4, I-5, I-6 — none block the gate.
- **Unrelated repository failures:** none observed in this session's runs.
- **Reporting-process defects:** fixed via addenda (F-S1.38.3-04); process lesson recorded — a gate label must never contradict the recorded exit code of the canonical command.
