## 25 November 2026 — continuation update (latest source commit b535140b3d88711457aedd204594c2ba7e56d3a9)

- PR #154 remains OPEN / DRAFT / UNMERGED against develop. Its previous exact-head CI run #1548 passed on source head cd1735c0cad7c36f6f6096cec6b719844c09b0d5; the newly authored PostgreSQL concurrency tests are not included in that CI result.
- Added two real PostgreSQL integration scenarios to m73a-delivery-completion.postgres.spec.ts: (1) two independent AutoCompleteWorker instances concurrently claim one due order and exactly one persists ownership; (2) a simulated crashed worker's expired lease is reclaimed by another worker, the stale owner is rejected by completeOrder, and the new owner completes while the lease fields are cleared.
- New source/test commit: b535140b3d88711457aedd204594c2ba7e56d3a9. Commit uses [skip ci] intentionally so this related implementation/documentation batch can be completed before one consolidated verification run. Tests have NOT been executed; no exact-head CI result exists for b535140 yet.
- PR #154's reviewer-identified concurrency gap is now addressed in test source, pending full CI and independent review. Keep PR draft until both are complete.
- PR #138 audit: current PR head 16846152af71524f29047b704159f52ab0d73e75, OPEN / DRAFT / UNMERGED, 1,927 changed files (1,277 under .m73b6-scratch, plus a root test-token.txt path). It is 3 commits behind develop and the branch comparison reports 2,742 commits ahead; no CI Actions run is associated with the current head. The preservation ref preservation/pr138-remediation-2026-11-25 is 22 commits behind the current PR branch, so the earlier “exact-head preservation” note is stale. Do not merge either ref wholesale, do not expose or copy token-like artifacts, and reconcile the refs before any extraction.
- PR #153 exact-head Actions run #1523 passed, but independent review remains outstanding. Its discussion also records a mismatch between the PR head and the named branch ref; reconcile before any write or merge.
- PR #155 exact-head run #1547 passed. PR #156 exact-head run #1541 passed. Both remain drafts pending independent review and their documented follow-up decisions. PR #152 is already merged; do not repeat OTP-provider log redaction.
- main and develop remain diverged: last comparison showed 11 commits unique to develop and 4 unique to main. Release promotion remains blocked pending an explicit integration/reconciliation plan.
- No merge, shared/staging database write, migration, grant/RLS/role/default-ACL change, Render setting change, restart, worker activation, credential rotation, deployment, or business workflow occurred.
- CI policy reaffirmed: author and review related source/tests first; use local/targeted checks where available; batch docs with the implementation; use [skip ci] during the implementation batch; run one consolidated full CI on the resulting exact head. Never count skipped jobs as passes.

# SCS Platform — Start Here

**Last updated:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Default branch:** `main`  
**Development branch:** `develop`

## Read first

1. [Current state](./CURRENT-STATE.md)
2. [Decisions and constraints](./DECISIONS-AND-CONSTRAINTS.md)
3. [Work log](./WORK-LOG.md)
4. [Audit-driven remediation plan](../docs/remediation/IMPLEMENTATION-PLAN.md)
5. [Audit-driven implementation progress](../docs/remediation/IMPLEMENTATION-PROGRESS.md)
6. [Outbox dispatch safety](../docs/remediation/OUTBOX-DISPATCH-SAFETY-2026-11-25.md)
7. [Outbox event ownership inventory](../docs/remediation/OUTBOX-EVENT-OWNERSHIP-INVENTORY.md)
8. [Order completion atomicity](../docs/remediation/ORDER-COMPLETION-ATOMICITY-2026-11-25.md)

The detailed remediation and product gap registers on the audit branch remain historical/source evidence. Do not merge PR #138 wholesale to obtain those documents; it is intentionally a large draft branch and must be split into bounded changes.

## Verified repository baseline

- `develop`: `fde20420bbb759d2e562f9ff747c9e824ac58e25` — PR #147 merge, 25 November 2026.
- Latest develop CI at that baseline: run #1509 passed on that exact SHA.
- `main` was last verified at `d3f4aefc41b37ad82f0aeb2eb78121342455eb21`; it has diverged from develop and needs a deliberate integration plan.
- PR #142 (runtime database identity diagnostics), PR #152 (OTP log redaction), and PR #147 (carrier outbox ownership) are merged to develop.
- PR #138 remains **OPEN / DRAFT / UNMERGED**. Never merge it as a single unit.

## Current continuation

Two bounded implementation PRs are in progress:

- PR #153, `fix(outbox): stop acknowledging events without delivery`, branch `fix/outbox-placeholder-dispatch-safety-2026-11-25`. Exact head `5294698d8db78e21df972e8ce6213f21237789fa`; CI run #1523 passed. Generic non-carrier event delivery is still NOT IMPLEMENTED; generic log-only acknowledgement is disabled and new non-carrier events remain PENDING. Vercel preview checks are blocked by the provider's build-rate-limit quota.
- PR #154, `fix(orders): make order completion atomic`, branch `fix/order-completion-atomicity-2026-11-25`. It makes order/shipment/history/outbox/master-order writes atomic, records buyer confirmation in the same transaction, emits realtime only after commit, and locks the master-order row before reading its status. Its durable-lease follow-up claims due orders atomically with a five-minute worker owner lease, fences completion by owner/expiry inside the transaction, and conditionally releases only the current worker's claim. Migration 0071 adds lease columns/index without changing grants or RLS. Latest head is `9f7ec7682739a852eeb46f78867f032ecb2f6e26`. CI #1530 failed on preceding head `97cf7b1fb7f8da59ecae0e991e6f2a4ff4c3b5cf` due two test issues (unit mock evaluation timing and missing integration lease fixture); both fixes are committed. No exact-head Actions run is currently visible; do not claim green CI.

PR #154 CI run #1525 failed because 23 tests across the orders and stock-settlement integration fixtures used transaction mocks without an `execute()` method. The implementation's SQL row lock is intentional; both fixtures now provide a no-op execute mock so the existing mocked DB contract reflects the transaction API. Re-run full CI on the corrected exact head before considering merge. The previous green run #1524 does not validate later commits.

## Next actions

1. Trigger/obtain full exact-head CI for PR #154 head `9f7ec7682739a852eeb46f78867f032ecb2f6e26`; inspect all jobs and keep it draft until all mandatory checks pass.
2. PR #153 has passed exact-head CI but still needs independent review before merge.
3. Merge PR #153 into develop only after review/required approvals; then rebase and revalidate PR #154 against the updated develop.
4. Reconcile overlapping PRs #150/#146 (notifications) and #144/#139 (merchant offer tenant scope); do not merge both sides blindly.
5. Resolve migration-number collision between PR #145 and PR #138 before either migration is integrated.
6. Refresh stale branches #151/#150/#149/#148/#145/#144/#143 against develop and rerun CI after conflict/scope review.
7. Keep PR #138 as a source of individually reviewed work only. It is thousands of commits ahead and overlaps multiple bounded PRs.
8. Reconcile develop/main deliberately; they have diverged (11 commits unique to develop and 4 unique to main at the last comparison).

## Important safety gates

- Do not merge PR #138 wholesale.
- Do not treat source changes, authored tests, green CI, staging observations, independent review, approval and deployment as interchangeable evidence.
- Do not deploy or change Render configuration/environment, restart services, activate workers, or run business workflows without separate explicit authorization.
- Do not run the mutating release workflow as a substitute for a database-only operation.
- Do not change shared database grants/default ACLs, ownership, migrations or RLS ad hoc. The recorded staging-only database authorization is conditional on verified API/migration identities, complete access-context coverage, ownership reconciliation and a reviewed migration/rollback path.
- Do not enable RLS while the API role is a table owner or has `BYPASSRLS`; do not apply migration 0070 until its role/default-ACL assumptions are reviewed.
- No production database has been provisioned or deployed.
- Never expose credentials, connection strings, OTPs or customer secrets.

## Latest update — 25 November 2026, 20:30 local

PR #154 durable-lease implementation passed CI #1533 on exact head `d496b0616c9a0cdde2bd891ca47167d9b9dfbabc`. The substantive jobs listed in the PR work log passed; k6 smoke and staging release were skipped, and Vercel preview builds were blocked by provider quota.

A follow-up code review found and fixed the buyer-confirmation/auto-completion race: if auto-completion wins after the buyer endpoint's initial DELIVERED read, the endpoint now re-reads state and returns idempotent success only if the order is COMPLETED. Regression coverage was added. The new latest head is `9efc30a7a3c0f841890a1d0bae839590cf58f8f3`; CI must run again on this exact head before PR #154 can advance. Keep it draft pending exact-head CI and independent review.

## Current handoff — 25 November 2026

- PR #154 latest head `68fb028f15d688a033c10d82b0343cbf35bdae68`; exact-head CI run #1537 passed all substantive jobs. k6 smoke and staging release were skipped. PR remains draft pending independent review.
- PR #153 outbox delivery safety remains open/draft. Exact-head CI #1523 passed; staging runtime evidence confirms the deployed generic log-only dispatcher still falsely marks non-carrier events DISPATCHED.
- PR #155 is the read-only staging security audit report. Latest head `a311162e8fcbf0cc8f15c36cb023007892e57666`; CI #1542 is in progress.
- PR #156 is the HTTP request/response log-redaction fix. Latest head `e158c505f8f4758cce4e825cf4ea2dae52051ba4`; CI #1541 is pending/in progress.
- PR #145 contains narrow `normalize_arabic` search_path hardening migration 0070; the staging ledger remains at 0069 and the broader conflicting PR #138 migration must not be merged.
- Do not merge, deploy, restart services, activate workers, rotate credentials, change grants/RLS/roles, or run migrations without the applicable review and explicit authorization.


## PR #138 preservation and consolidation guard — 25 November 2026

- PR #138 remains **OPEN / DRAFT / UNMERGED** at source head `14f9871d40b2e6e88c1cffe480c3751e9393c597` (1,909 changed files; mergeable=false). Its complete remediation tree, commit history, tests, migrations, runbooks, registers and project-memory evidence are retained. Do not close, delete, reset, force-push, destructively rebase, or wholesale-merge it.
- Created a second preservation ref `preservation/pr138-remediation-2026-11-25` at that exact SHA. The original PR branch was not modified.
- PR #138 contains much more than auto-completion leases: tenant authorization and G-001/G-023–G-035 remediation, database/migration identity and access-control work, security audit/runbooks, worker/carrier hardening, tests and remediation evidence. Treat its full tree as retained source material. No item is discarded or considered integrated merely because a bounded PR overlaps it.
- Integrate PR #138 only through a file-by-file reconciliation matrix against current `develop` and all bounded PRs. Extract reviewed, self-contained slices into clean branches; retain the original branch and preservation ref. Record each slice as integrated, deferred, superseded or blocked. Resolve migration-number collisions (including 0070/0071) against the current migration ledger and every pending PR before creating any migration.
- PR #154's durable lease overlaps the lease already present in PR #138. Both implement five-minute owner/timestamp claims, but PR #138 uses `DatabaseService.withActorContext` and updates business `orders.updated_at` on claim/release; PR #154 is compatible with current `develop` and avoids those business timestamp writes. Select and validate exactly one canonical implementation for eventual integration; never merge both copies. Preserve all unrelated PR #138 remediation.
- Preservation ref creation does not merge code or authorize migrations, database changes, deployment, worker activation or release.

## Latest exact-head verification — PR #154

- Latest PR #154 head before this handoff update: `619bf6d5684b9774be5e0dc25972b3aaa53d0f24`.
- CI run #1543 (run ID `45669741152`) passed all 10 substantive jobs: mobile analysis/tests, lint/typecheck/format, migration full apply, web/admin tests, unit/coverage, E6 boundary lint, integration tests, build, container build/smoke, and contract/codegen. k6 smoke and staging release were skipped; neither is claimed as passed.
- PR #154 remains draft pending independent review. No merge, staging DB write/migration, Render change, worker activation, deployment or restart occurred.
