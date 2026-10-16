# P13 Phase 4.1.12 — Baseline Report

**Phase:** 4.1.12 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

---

## 1. Baseline Verification

**Command:** `git branch --show-current; git log -1 --format="%h %s"; git status --porcelain | Measure-Object -Line`

| Field | Expected (from 4.1.11) | Actual | Match |
|-------|------------------------|--------|-------|
| Branch | develop | develop | YES |
| HEAD | ed6c30f | ed6c30f — "test(migrations): verify existence of migration 0062" | YES |
| Modified tracked | 25 | 25 (999 insertions, 160 deletions) | YES |
| Untracked | ~90 | 98 porcelain lines | GROWN (see §2) |
| Status lines | 115 | 123 | GROWN |

**Differences from the Phase 4.1.11 baseline:** +8 porcelain lines, all from the 8 Phase 4.1.11 reports created in `docs/production/` during that phase. No source code changed. No tracked file was added, deleted, or further modified. Working-tree diff remains exactly 999+/160-.

---

## 2. Porcelain-Line vs File-Count Reconciliation

`git status --porcelain` collapses untracked directories into a single line. The 98 lines decompose as:

| Category | Porcelain lines | Actual files |
|----------|-----------------|--------------|
| Modified tracked | 25 | 25 |
| `docs/production/` P13 reports (untracked) | 82 | 82 |
| Untracked source/infra (RC-relevant) | ~27 | 27 |
| Untracked scratch probes | ~5 | 5 |
| `.m73b6-scratch/` (collapsed) | 1 | **1,269** |

`git ls-files --others --exclude-standard .m73b6-scratch` counts **1,264 files** (1,260 in `p418-context/`, a full repository snapshot from Phase 4.1.8, plus `Dockerfile.p416ci`, `p418-archive.tar`, 2 injected files), plus 5 session artifacts from this phase (audit diff, integration log, migration log, 2 verification scripts).

**Consequence:** `git add -A` would stage ~1,380 files. It is prohibited (per spec) and unnecessary — see the Release Candidate Manifest for the exact per-path staging list.

---

## 3. Environment Drift Within This Session

One mid-session environment repair was required (documented in the Verification Reconciliation report):

- The Windows pnpm virtual-store corruption recurred (`es-module-lexer` missing from `vite-node@2.1.9`), breaking vitest startup.
- Repaired with `pnpm install --force --offline` (1m 7.6s relink; the `cpu-features` optional-native failure is the known-ignorable one).
- After the relink, the Turbo build that failed 4/6 in Phase 4.1.11 now passes **6/6** (4 cached, 2 executed, exit 0).

---

## 4. Preservation Confirmation

- No `git reset`, `git clean`, checkout, rebase, or stash was executed.
- No tracked file was reverted, overwritten, or restored.
- No commit, push, PR, merge, deploy, or pilot activation occurred.
- The only new files this session created are the 6 Phase 4.1.12 reports and 5 scratch verification artifacts under `.m73b6-scratch/` (excluded from the release candidate).

---

## 5. Status

**PASS** — Baseline matches Phase 4.1.11 with only additive report files. Repository preserved intact.
