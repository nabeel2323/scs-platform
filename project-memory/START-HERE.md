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
- PR #154, `fix(orders): make order completion atomic`, branch `fix/order-completion-atomicity-2026-11-25`. It makes order/shipment/history/outbox/master-order writes atomic, records buyer confirmation in the same transaction, emits realtime only after commit, and removes the auto-complete worker's misleading updated_at mutation. It also locks the master-order row before reading its status. Latest implementation/test-fix head is recorded on the live PR; exact-head CI is pending after the test fixture correction.

PR #154 CI run #1525 failed because 23 tests across the orders and stock-settlement integration fixtures used transaction mocks without an `execute()` method. The implementation's SQL row lock is intentional; both fixtures now provide a no-op execute mock so the existing mocked DB contract reflects the transaction API. Re-run full CI on the corrected exact head before considering merge. The previous green run #1524 does not validate later commits.

## Next actions

1. Finish exact-head CI and review PR #154; keep it draft until all mandatory checks pass.
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
