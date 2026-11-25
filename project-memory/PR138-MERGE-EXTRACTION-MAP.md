# PR #138 — Merge and Extraction Map

**Checkpoint:** 25 November 2026  
**Repository:** `nabeel2323/scs-platform`  
**Source PR:** #138, `remediation/phase-0-1-tenant-security`  
**Policy:** Preserve the source history; do not merge this PR wholesale.

## 1. Current shape and risk

The current PR snapshot has 1,927 changed paths, 103,324 additions and 414,491 deletions. The PR is OPEN / DRAFT / UNMERGED, reports `mergeable=false`, and its comparison to current `develop` is 2,742 commits ahead / 3 behind. The PR base recorded in its metadata is older than current develop.

Changed-path inventory:
- 1,277 paths under `.m73b6-scratch/`.
- Three additional scratch PostgreSQL suites under `apps/api/src/__tests__/scratch/`.
- 650 remaining paths outside `.m73b6-scratch/`.
- Main non-scratch groups: `apps/api` 331, `apps/admin` 87, `apps/web` 72, `mobile/lib` 38, `mobile/test` 31, `docs/remediation` 34, `infra/drizzle` 15.
- The changed-file inventory contains a token-named path whose current-branch content lookup did not resolve. Its status is unresolved; do not print, copy or extract any token-like artifact.

The scratch snapshot and any generated/test-only material are not release candidates. Do not delete them from the preserved source branch; exclude them from extraction unless a specific test is independently reviewed and deliberately moved into a supported test location.

## 2. Confirmed overlap with other open PRs

Counts are path intersections between each PR's changed-file list and PR #138's changed-file list at this checkpoint.

| PR | Changed files | Shared paths with #138 | Integration treatment |
|---|---:|---:|---|
| #144 | 7 | 7 | Reconcile entirely against #138; do not merge both copies blindly |
| #153 | 10 | 6 | Prefer the focused outbox/dispatcher PR after exact-head CI and independent review; remove/supersede duplicate paths in #138 extraction |
| #154 | 13 | 9 | Prefer the focused order auto-completion PR after exact-head CI and independent review; later combine its lease behavior with G-002 worker context |
| #151 | 12 | 5 | Reconcile P6 test/runtime paths and keep scratch suites out of release |
| #150 | 2 | 1 | Reconcile shared code before integration |
| #156 | 3 | 1 | Reconcile credential/log-redaction overlap; require security review and explicit follow-up decision |
| #155 | 1 | 0 | Independent staging-access documentation; retain as a separate evidence item |
| #145 | — | 0 same-path | Distinct migration filename but migration-number collision at 0070; resolve ordering/content before either migration is promoted |

The overlap counts are not a merge authorization. Review the actual diff, dependencies, migrations and acceptance evidence for every shared path.

## 3. Proposed bounded extraction groups

After the focused PRs above are resolved and `develop` is refreshed, extract only the remaining, non-duplicated changes into a small number of workstream PRs:

1. **Database security and tenant context:** DatabaseService actor-context primitive, scoped interceptor/adoption, explicit user/worker/system/bootstrap/audit/anonymous principals, operation/ownership matrix, migration/operator boundaries and G-002 documentation.
2. **Commerce and financial correctness:** order lifecycle, checkout, payments/refunds/settlements, inventory, returns and shipment state transitions. Keep payment and settlement scope decisions intact.
3. **Workers and external integrations:** outbox ownership, carrier processing/reconciliation/webhooks, auto-completion, return expiration, operational controls/alerts and notification reliability. Keep provider I/O outside database actor transactions.
4. **Client workflow parity:** only the remaining reviewed Admin, Web and Flutter/API contract changes, with permission, empty/error/loading and state-transition behavior mapped to backend contracts.

The exact path manifest must be generated from the refreshed PR diff after #153/#154/#156 and other overlaps are reconciled. Do not assume the current path counts equal the final extraction size.

## 4. Required integration order

1. Keep PR #138 and its preservation ref intact; do not rebase or force-push the original source branch.
2. Finish exact-head CI and independent review for focused PRs. PR #154's newly added PostgreSQL lease tests require the current exact-head run; its earlier green run does not validate the new tests.
3. Merge only reviewed focused PRs into `develop`, one dependency-safe batch at a time. Reconcile #145's migration 0070 collision before migration promotion.
4. Refresh `develop`; regenerate the PR #138 changed-file list and overlap matrix against the new base.
5. Create clean branches from current `develop` for the four extraction groups. Cherry-pick only when commit boundaries are clean; otherwise apply selected, reviewed file changes while retaining the source PR and commit references in the manifest.
6. Run targeted/local checks during implementation and one consolidated CI per completed workstream PR. Do not run CI for every small edit.
7. After all extraction PRs are merged, run one consolidated `develop` release-candidate CI and resolve the separate `main`/`develop` history divergence before release promotion.

## 5. Explicit non-actions and release gates

- No wholesale merge of PR #138.
- No deletion, rewrite or reset of the original PR #138 branch or its preservation ref.
- No extraction of scratch artifacts or token-like files.
- No migration, RLS enablement, grant/default-ACL change, shared/staging database write, Render configuration change, worker activation, credential rotation or deployment without the separately required authorization.
- CI success is not independent security approval, live staging identity evidence, production acceptance or release approval.
