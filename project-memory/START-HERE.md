# SCS Platform — Start Here

**Last updated:** 27 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Active integration PR:** [#170 — Bulk PR #138 remediation extraction](https://github.com/nabeel2323/scs-platform/pull/170)  
**Protected remediation source:** [#138 — Phase 0–1 tenant/security remediation](https://github.com/nabeel2323/scs-platform/pull/138)

## Read these documents first

1. [PR #138 integration checkpoint](../docs/remediation/PR138-INTEGRATION-CHECKPOINT.md) — branch, reconciliation decisions, validation status and safety gates.
2. [Implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md) — authoritative task-level remediation and evidence log.
3. [Implementation plan](../docs/remediation/IMPLEMENTATION-PLAN.md) — phase order, acceptance criteria and release gates.
4. [README](../README.md) — repository structure and commands.

The newest dated entries in the checkpoint and progress tracker override older historical entries.

## Current integration state — 27 November 2026

- PR #170 is **OPEN / DRAFT / UNMERGED**, targeting `develop`.
- Integration branch: `integration/pr138-bulk-remediation-2026-11-26`.
- Read the exact current head, base SHA, changed-file count and mergeability from live PR #170 metadata; do not hard-code a branch SHA in this handoff.
- The integration branch is based on `develop` at `118174a644a197d72a033c22f0ee5af430617f44` and is 0 commits behind that base. Use the live PR comparison for its current ahead count.
- GitHub's mergeable flag can change as metadata recalculates. It is not test evidence or merge authorization.
- PR #138 remains **OPEN / DRAFT / UNMERGED** with 1,943 changed files. Its source and preservation refs remain identical at `81f30f5c30654b233ef373c15fd3f2cb867aba01`. It is recovery/source material only; never merge it wholesale.

## Verification and immediate work

- Exact-head CI #1659 (run ID `45914688537`) ran on older code head `a39acd446767d071eea2b175d1341897c9c6b3e4`. Lint/typecheck, Flutter, Web/Admin, migration full apply and E6 passed; API integration and Unit/Coverage failed. It does not validate later commits.
- Follow-up API fixture and identity/security corrections have been committed but remain unverified. The latest shipping fixture pass adds a narrow `assertDriverEligibleForStore` test collaborator to the M7.3-B.4 delivery-exception and M7.3-B.5 RTS PostgreSQL suites; production fail-closed behavior is unchanged.
- No workflow run is associated with the current integration head. Vercel checks are failing on the free-plan daily deployment quota and are not application CI. Do not trigger extra Vercel builds.
- Continue source-reviewed, grouped repairs for remaining API unit/integration failures. Re-check current source before editing any historical failure. Run one consolidated exact-head mandatory CI campaign only after concrete mismatches are resolved; do not run CI per file or per small fix.

## Operating decisions and safety boundaries

- Preserve PR #138 and its synchronized preservation branch. Never close, delete, reset, force-push, destructively rebase, or merge PR #138 wholesale.
- Extract only reviewed, bounded, non-conflicting changes into PR #170; preserve newer `develop` behavior and reconcile migrations deliberately.
- Batch related implementation and test changes. Use focused checks where available, then one consolidated exact-head CI campaign.
- Do not request GitHub reviewers.
- Keep PR #170 draft/unmerged until mandatory exact-head CI passes and the user separately authorizes the staging-release/migration step.
- Keep the staging-release safety hold disabled.
- No staging/production DB writes, migrations, RLS/grant/default-ACL changes, provider calls, worker activation, Render changes, deployments, restarts or releases without separate authorization.
- Keep this file, the integration checkpoint, progress tracker and PR description synchronized after meaningful grouped work.


## Latest continuation update — 27 November 2026 (buyer confirmation atomicity + API fixture batch)

- Production fix `3aa3358e5d213876988bcfe4f20930237873b2b5`: buyer confirmation timestamp now commits in the same transaction as order completion, with a `buyerConfirmedAt IS NULL` compare-and-set and idempotent concurrent-loser handling.
- Grouped test fixture corrections:
  - `3151fc2f460a72fc0b1ef720360618c6093f4e2c` — privileged RTS admin fixture retains valid shipment/store lineage while testing cross-org bypass.
  - `574f3a4626c7a2ebd6cfc19a509d1790ad988320` — ReturnsService worker escalation mock follows `db.db.transaction` and provides result projection queries.
  - `0b1ec543232310f6c333b17bd03ae5a895135446` — DisputesService authorization tests provide transaction/locking mocks.
  - `358ac213c1f632340336c542e9b6361040e60621` — Catalog saved-favorites fixture supports `where().limit(1)`.
- Tracker/checkpoint updated in commits `103d7140f0594e6fc50546923647045103eff98f` and `e4f1124472ef9e70fae072def2e08af620e6a560`.
- All changes are UNVERIFIED: no local runner or exact-head CI has executed them. Historical CI #1659 still identifies carrier reconciliation mutex tests B34-PG-10/11, shipping/carrier tenant-context mocks, catalog publication visibility assertions, orders checkout fixtures, P4.1.8 signing-exception mock, and other payment/returns/admin assertions. Re-check each against current source before changing; some may have been superseded.
- Next task: source-review B34-PG-10/11 carrier reconciliation mutex separation and the remaining current unit fixture failures. Group related fixes, do not weaken tenant/actor guards, and run only one consolidated exact-head CI after the batch is complete.
