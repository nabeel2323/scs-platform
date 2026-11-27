# SCS Platform — Start Here

**Last updated:** 27 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Active integration PR:** [#170 — Bulk PR #138 remediation extraction](https://github.com/nabeel2323/scs-platform/pull/170)  
**Protected remediation source:** [#138 — Phase 0–1 tenant/security remediation](https://github.com/nabeel2323/scs-platform/pull/138)

## Read these documents first

1. [PR #138 integration checkpoint](../docs/remediation/PR138-INTEGRATION-CHECKPOINT.md) — current branch, reconciliation decisions, validation status and safety gates.
2. [Implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md) — authoritative task-level remediation and evidence log.
3. [Implementation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) — phase order, acceptance criteria and final release gates.
4. [README](../README.md) — repository structure, commands and documentation entry points.

The progress tracker and integration checkpoint are authoritative for the current handoff. Older historical checkpoint entries are retained as history; always follow the newest dated entry.

## Current integration state

- PR #170 is **OPEN / DRAFT / UNMERGED**, targeting `develop`.
- Integration branch: `integration/pr138-bulk-remediation-2026-11-26`.
- Latest branch head: `a5aa7a66f66ddbd9337af6c857f69de0ccae42d4`.
- PR #170 contains 628 changed files and is 112 commits ahead / 0 behind `develop`.
- GitHub reports mergeable, but this is not test evidence and does not authorize merge.
- PR #138 remains **OPEN / DRAFT / UNMERGED** with 1,943 changed files. It is preservation/source material only and must never be merged wholesale.
- PR #138 source branch `remediation/phase-0-1-tenant-security` and preservation branch `preservation/pr138-remediation-2026-11-25` were verified identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`.

## Latest CI and implementation checkpoint

- Exact-head CI #1659 (run ID `45914688537`) tested code head `a39acd446767d071eea2b175d1341897c9c6b3e4`.
- Passed: Lint & Typecheck, Flutter, Web/Admin tests, Migration Full Apply and E6 Boundary Lint.
- Failed: API Integration Tests and Unit Tests + Coverage. Build, Contract/Codegen, Container Smoke, k6 and staging release were skipped.
- Follow-up test-fixture corrections were committed:
  - `2b9cc406aafd36c0414399bbce21663a377c3f35` — place `withActorContext` on the DatabaseService wrapper in OrdersService unit fixtures.
  - `526cf957bf4b1810737021681546408a31e9a96b` — pass explicit CallerContext to transaction-lifecycle accept/partial-accept operations.
  - `00375d43f5f206f1d5807eb089fabd5fc7aff6a5` — align checkout MOQ fixtures with the authoritative merchant-offer snapshot.
- Tracker/checkpoint documentation was synchronized in commits `eaed255885c98d0bb0ccec7edb3adc99c8e14631` and `a5aa7a66f66ddbd9337af6c857f69de0ccae42d4`.
- No exact-head CI run exists for the latest branch head. These follow-up changes remain **VERIFICATION_PENDING**. Do not treat CI #1659 as validating them.
- Continue source-reviewed, grouped repairs for the remaining API integration/unit failures. Run one consolidated exact-head mandatory CI campaign only after concrete mismatches are resolved. Do not run CI per file or per small fix.

## Operating decisions and safety boundaries

- Preserve PR #138 and its synchronized preservation branch. Never close, delete, reset, force-push, destructively rebase, or merge PR #138 wholesale.
- Extract only reviewed, bounded, non-conflicting changes into PR #170; preserve newer `develop` behavior and reconcile migrations deliberately.
- Batch related implementation and test changes. Use focused local checks where available, then one consolidated exact-head CI campaign.
- Do not request GitHub reviewers.
- Do not merge PR #170 until mandatory exact-head CI passes and the user separately authorizes the staging-release/migration step.
- Keep the staging-release safety hold disabled.
- No staging/production DB writes, migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts or releases without separate authorization.
- Keep this file, the integration checkpoint, tracker and PR description synchronized after meaningful grouped work.

## Immediate next task

Continue reviewing CI #1659's API integration and Unit/Coverage failures against the latest source. Fix remaining actor-context/tenant fixtures and genuine behavior regressions without weakening authorization or tenant boundaries. Keep all changes grouped and unverified until a new exact-head CI run completes.
