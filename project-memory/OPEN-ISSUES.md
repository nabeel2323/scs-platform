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

- Verify scope-first offer confidentiality and ACTIVE-store buyer visibility with focused tests and exact-head CI.
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
- Formatting correction is complete: formatter run #14 passed and the temporary workflow removed itself. CI #1180 on app-authored checkpoint f7f3ff6837f67f17cc00d5129a20f50e608bf3b6 failed the changed-file Prettier gate on three Markdown files. Lint/typecheck and Flutter passed; dependent jobs were skipped. Formatter run #15 completed successfully and formatted the three files. The helper workflow removed itself in cleanup commit 2d416c99700de8b511a7c376085a107cc24a854c and is absent from the final tree. CI #1183 on cleanup commit has action_required with no jobs; CI #1182 is on the pre-format commit. A fresh exact-head CI run is required.

## Next action order

1. Verify the new scope-first offer confidentiality changes with focused API tests and exact-head CI.
2. Complete the remaining G-001 acceptance matrix, including owner/staff, revoked membership, store lifecycle, buyer, foreign merchant, analytics/trend and privileged-admin behavior.
3. Prepare the independent security-review package; keep G-001 PARTIAL until review evidence is recorded.
4. Continue G-002 only within the documented read-only database-evidence boundary.
5. Continue G-002 read-only identity/schema/access design evidence only; wait for authorized protected staging audit.
6. Keep the PR draft and all release/database restrictions intact.


## G-001 confidentiality follow-up — 21 November 2026

The merchant detail and mutation paths now normalize unknown, foreign-organization and same-organization non-member offer IDs to the same 404 response after scope checks. The focused tests and exact-head CI are not yet verified. Remaining acceptance work includes the store lifecycle/inactive-store policy, complete analytics/trend matrix and independent review.


### G-001 inactive-store buyer visibility — 21 November 2026

Buyer product offer lists and ranked seller results now require an ACTIVE owning store. DRAFT stores can still manage offers, but buyers cannot discover those offers before activation. Unit coverage is added; exact-head CI remains pending.


### G-001 live continuation — 21 November 2026

Controller regression coverage now includes foreign-organization offer-list denial, missing-active-organization denial, and revoked/inactive-membership denial on analytics, with assertions that the offer service is not called. The source test increment is committed, but exact-head GitHub Actions verification is pending. Vercel web/admin status contexts currently fail due to external build-rate limits and are not application test results. Continue remaining store lifecycle/service acceptance; G-001 remains PARTIAL and PR #138 remains draft.


### G-001 store lifecycle and tenant-denial matrix follow-up — 21 November 2026

The controller suite now explicitly denies foreign-organization offer-list access, missing-active-organization reads, and revoked/inactive-member analytics access before calling the offer service. It also confirms active members retain merchant offer-management access for DRAFT stores, while buyer discovery remains limited to ACTIVE stores. No SUSPENDED-store behavior was inferred. Exact-head CI and remaining service/HTTP acceptance evidence are pending; G-001 remains PARTIAL.


### G-001 PostgreSQL buyer-visibility fixture correction — 21 November 2026

Catalog lifecycle integration stores are now explicitly ACTIVE for buyer-discovery scenarios, avoiding accidental dependence on the schema's DRAFT default. A real PostgreSQL regression transitions one merchant store to DRAFT and verifies exclusion from both buyer offer list and ranked results while preserving the other ACTIVE store, then restores status. Exact-head CI is pending; this is not yet verified evidence.
