# SCS Platform — Open Issues and Next Work

**Last reconciled:** 21 November 2026  
**Authoritative detail:** [Implementation progress tracker](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## Immediate blockers and high-priority work

### G-001 — P0 merchant offer authorization

**Status: PARTIAL — do not close yet.**

Implemented:

- Merchant mutation role gate for `MERCHANT_OWNER`, `MERCHANT_STAFF` and legacy `MERCHANT`.
- Explicit denial of BUYER, FINANCE and platform roles on merchant mutation routes, even where permissions may otherwise be present.
- Governance-read permission checks for ADMIN, MODERATOR, SYSTEM and SUPER_ADMIN.
- Controller-level positive/negative role regression coverage.

Remaining:

- Correct current formatting failures and obtain a fresh exact-head CI result.
- Complete owner/staff/buyer/foreign-merchant/platform-admin acceptance matrix across controller and service boundaries.
- Verify organization ownership, active store membership, actor attribution and unauthorized detail/analytics disclosure behavior.
- Obtain independent security review from the user or a separately appointed qualified reviewer.
- Record review findings, remediate them and attach evidence to the authoritative tracker.

The implementation author must not mark their own work independently reviewed.

### G-002 — P1 database access and RLS

**Status: IN PROGRESS.**

Remaining:

- Actual API and migration runtime identity evidence from authorized staging execution.
- Protected read-only staging audit, with authorized approval of the `staging` environment.
- Exact per-table operation/row-ownership predicate review and transaction-local tenant-context feasibility.
- Reviewed least-privilege/RLS design and explicit authorization before any shared database mutation.

Do not enable RLS, apply migration 0070, change grants/default ACLs or alter Supabase-managed ownership as part of unapproved work.

## Other tracked unresolved findings

The following are navigation-level reminders, not a replacement for the full finding register:

- **G-007:** full buyer journey, per-suborder order detail and tracking UAT remains in Phase 6.
- **G-010:** real Aramex sandbox verification remains unavailable.
- **G-012:** automatic gateway/payout is a product-scope decision; do not expand scope silently.
- **G-013:** foreign-key index candidates need representative workload evidence before DDL.
- **G-014:** effective branch protection remains unverified due repository access limitations; requires repository administrator evidence.
- **G-015:** boundary regression gates exist; legacy boundary violations remain tracked.
- **G-018:** permanent documentation/readiness coverage continues to be reconciled.
- **G-020:** migration is CI-verified but has not been applied to the shared database.
- **G-021/G-022:** retain the open/blocked states and dependencies exactly as recorded in the authoritative tracker; do not infer closure.

For exact statuses, priorities, evidence and dependencies, consult the 35-row register in [IMPLEMENTATION-PROGRESS.md](../docs/remediation/IMPLEMENTATION-PROGRESS.md).

## CI and formatting follow-up

- CI #1176 failed only at the changed-file Prettier gate on the controller test and progress tracker.
- Lint had zero errors (311 warnings), TypeScript typecheck succeeded and Flutter analysis/tests passed.
- API unit/coverage, PostgreSQL integration, migration, Web/Admin, boundary, build/container and contract jobs were skipped due to the lint job failure.
- Formatting correction is now complete: formatter run #14 passed and the temporary workflow removed itself. CI #1179 on the formatter cleanup commit has action_required with no jobs, while #1178 is tied to the pre-format commit. Trigger/observe a fresh full CI run on the next app-authored checkpoint commit.

## Next action order

1. Complete formatting and commit the handover system plus tracker reconciliation as one grouped change where practical.
2. Confirm the temporary formatting helper workflow (if used) is absent from the final branch tree.
3. Inspect fresh exact-head CI; fix any failures in grouped changes.
4. Continue G-001 tenant/role acceptance coverage and prepare independent-review package.
5. Continue G-002 read-only identity/schema/access design evidence only; wait for authorized protected staging audit.
6. Keep the PR draft and all release/database restrictions intact.
