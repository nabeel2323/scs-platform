# PR #138 live reconciliation ledger — 26 November 2026

## Verified repository checkpoint

- PR #138: OPEN / DRAFT / UNMERGED; base `develop`; GitHub reports `mergeable=false`.
- Source branch: `remediation/phase-0-1-tenant-security`.
- Exact source head: `b72f8ceb8add10276ce81be19d5ee61bf3e1b90c`.
- `develop`: `fde20420bbb759d2e562f9ff747c9e824ac58e25`.
- Merge base: `f74eb588cc58fc99b105e749d39dbfbacb4f9775`.
- Compare: source branch 2,784 commits ahead and 3 behind `develop`; compare reports divergence.
- PR diff metadata: 1,934 paths, 104,368 additions, 414,508 deletions.
- Changed-path inventory: 1,934 total; 1,280 scratch paths (1,277 under `.m73b6-scratch/` plus 3 under `apps/api/src/__tests__/scratch/`); 654 non-scratch paths.
- Preservation branch `preservation/pr138-remediation-2026-11-25` is currently identical to source head `b72f8ceb8add10276ce81be19d5ee61bf3e1b90c` (compare: identical, 0 ahead / 0 behind).
- Exact-head Actions lookup returned no workflow runs. Combined status only has Vercel Web/Admin build-rate-limit failures; these are not application CI. Source remains NOT CI-VERIFIED.
- No merge, deploy, database write, migration, grant/default-ACL/RLS change, worker activation or provider side effect occurred.

## Develop-only delta: mandatory reconciliation before extraction

Comparing merge base `f74eb588cc58fc99b105e749d39dbfbacb4f9775` to `develop` confirms 3 develop-only commits affecting these 8 paths:

| Path | Develop state | PR #138 state | Required disposition |
|---|---|---|---|
| `apps/api/src/common/database/runtime-database-identity.ts` | Added | Missing | Retain develop helper; adapt PR #138 DatabaseService to call it. |
| `apps/api/src/__tests__/unit/common/runtime-database-identity.spec.ts` | Added | Missing | Retain and run with consolidated database workstream. |
| `apps/api/src/__tests__/integration/runtime-database-identity.postgres.spec.ts` | Added | Missing | Retain; this is the real PostgreSQL login/effective-role diagnostic regression. |
| `apps/api/src/common/database/database.service.ts` | Modified | Modified differently | Manual three-way reconciliation required. PR #138 contains actor-context transaction primitive, secure-runtime checks and migration/operator work; develop imports the extracted identity helper. Do not overwrite either version. |
| `apps/api/src/common/outbox/outbox-dispatcher.service.ts` | Modified | Modified differently | Manual reconciliation required. Develop excludes carrier-owned events; PR #138 adds worker actor context/claim ownership. Also reconcile with focused PR #153, which corrects false delivery acknowledgement. |
| `apps/api/src/__tests__/unit/outbox/outbox-dispatcher-ownership.spec.ts` | Added | Missing | Retain; reconcile its expectations with canonical dispatcher and #153. |
| `apps/api/src/modules/notifications/otp-delivery.service.ts` | Modified | Same blob as PR #138 | No source conflict; retain current develop version. |
| `apps/api/src/__tests__/unit/identity/otp-delivery-log-redaction.spec.ts` | Added | Same blob as PR #138 | No source conflict; retain current develop version. |

### Initial code-level findings

1. **DatabaseService:** PR #138's version is 582 lines and contains the opt-in AsyncLocalStorage actor-context transaction primitive, plus additional secure-runtime and migration/operator logic. Develop's version is 225 lines and factors runtime identity SQL/logging into the new helper. The correct result is a deliberate composition: preserve the PR actor-context and fail-closed runtime behavior while using the develop helper and its tests. Inspect the entire init/shutdown/migration paths before editing; this table is not permission to copy one whole file over the other.
2. **OutboxDispatcher:** PR #138 adds a worker identity and wraps claim/success/failure DB operations in worker actor context. Develop's implementation adds explicit exclusion of `shipping.carrier.%` events from the generic dispatcher. The focused #153 workstream must be inspected before selecting the canonical event delivery/acknowledgement/retry implementation. Do not retain log-only “success” semantics.
3. **OTP:** the two relevant source/test files are byte-identical between develop and PR #138; do not duplicate or re-edit them.

## Focused PR overlap snapshot (rechecked 26 November)

| PR | Current head | State | Mergeable | Reconciliation |
|---|---|---|---|---|
| #139 | `37e10b95eebb6aff4354354dff554ba9e62967f1` | Open draft | No | Tenant-read overlap; reconcile with #144 and G-001 source. |
| #144 | `3a1d5682b51209b94735ec0136c1f0c737610be7` | Open draft | Yes | All 7 changed paths intersect #138; do not merge/extract duplicate implementations blindly. |
| #145 | `b3625d390f30794d331c8d74d6f5b3b8a828b058` | Open draft | Yes | Distinct migration 0070 filename/content collision. |
| #150 | `ad057b638e8dac7904d3d97036e22ce1c185537a` | Open draft | Yes | Reconcile notification provider truthfulness; one shared path. |
| #151 | `671f9e30d9c75cc515541d16149da4b4af0e74e6` | Open draft | Yes | Reconcile five shared paths; keep scratch suites excluded. |
| #153 | `5294698d8db78e21df972e8ce6213f21237789fa` | Open draft | Yes | Canonical outbox delivery/acknowledgement behavior; six shared paths. |
| #154 | `e421e21b1e66386a9d0c259fb83c99f1a05272cb` | Open draft | Yes | Canonical order-completion lease and worker context; nine shared paths; exact-head CI must be rechecked. |
| #156 | `e158c505f8f4758cce4e825cf4ea2dae52051ba4` | Open draft | Yes | Reconcile HTTP credential redaction; one shared path. |

## Migration dependency block

PR #138 contains migrations 0070–0075:
- `0070_public_access_and_function_search_path_hardening.sql`
- `0071_auto_complete_claim_leases.sql`
- `0072_carrier_webhook_credential_scoping.sql`
- `0073_ops_alert_delivery_claim.sql`
- `0074_reconciliation_tenant_version_integrity.sql`
- `0075_payment_proof_upload_intents.sql`

Do not extract/apply this sequence yet. Migration 0070 collides with PR #145's distinct function-local search_path hardening. Migration 0071 overlaps PR #154's order auto-completion lease. Review all six as one ordered dependency set, compare the migration ledger and role/default-ACL ownership assumptions, then produce an explicit migration disposition and rollback plan. Never renumber ad hoc.

## Next execution batch

1. Reconcile the 8 develop-only paths into the preserved source understanding; use develop's identity helper and tests as canonical evidence, not as a replacement for PR #138 actor-context behavior.
2. Inspect #153/#154 diffs and exact-head CI before selecting canonical outbox and order-worker implementations.
3. Inspect the complete DatabaseService init, actor context, migration/operator identity and shutdown paths; create a clean bounded G-002 integration branch from refreshed develop only after the full source/test/dependency manifest is defined.
4. Build a path-level extraction manifest for the remaining 654 non-scratch paths, grouped by database security, commerce correctness, workers/integrations and client workflow parity.
5. Keep all 1,280 scratch paths and unresolved token-like artifacts out of release extraction. Preserve original PR/evidence.
6. Run one consolidated CI campaign after each bounded workstream is complete; do not run CI for small edits.

## Safety and evidence

- This ledger is a source reconciliation record, not a claim that code was integrated, tested, reviewed, deployed or approved.
- PR #138 remains draft and unmerged. Keep its source and preservation refs intact.
- Keep independent security review and staging/database/migration/RLS/worker/deployment gates in force.


## Reconciliation implementation update — 26 November 2026

A first develop-only delta has now been composed into the preserved PR #138 source branch without rebasing or replacing its actor-context implementation:

- Added `apps/api/src/common/database/runtime-database-identity.ts` and the develop-side unit/PostgreSQL tests to the PR #138 branch.
- Critical review found that develop's original helper query omitted `owns_public_tables` and `owns_public_schema`, even though PR #138's fail-closed startup guard checks both. The helper has been extended to query and return both ownership flags. This prevents the refactor from silently weakening the production startup guard.
- `logRuntimeDatabaseIdentity` now returns the identity or `null`; it remains non-throwing and redacts connection errors. The production-like startup gate in DatabaseService remains authoritative and refuses startup when the identity is unavailable or unsafe.
- DatabaseService now uses the shared helper/query while preserving the PR #138 checks for session/effective role mismatch, superuser, BYPASSRLS, CREATEROLE, CREATEDB, public table/schema ownership and verified TLS.
- Unit and PostgreSQL integration fixtures now assert ownership flags and the helper's return contract.

Commits on `remediation/phase-0-1-tenant-security`:
- `87b274f34c68a8068959dd9caf2900372d7353c7` — add shared runtime identity helper with ownership checks.
- `c1039fcb59fe14769e89708d9876e9016fd2894c` — extend unit tests for identity result/null behavior.
- `deaf43df388d75a334c51c798116849237797b72` — extend PostgreSQL login/effective-role and ownership assertions.
- `3f09bb084542431d1ab87345110ac973fe072691` — compose shared helper into DatabaseService while retaining strict startup checks.

**Verification:** no test runner, formatter, typecheck, build or CI was run; this source change is NOT TESTED / NOT CI-VERIFIED. All four commits use `[skip ci]` in keeping with the agreed CI budget. The preservation branch was fast-forwarded from `dc6bf34b33851af5b542a44774a3fd0434e4e606` to `3f09bb084542431d1ab87345110ac973fe072691` using expected-SHA protection.

## Outbox canonicalization finding

PR #153 head `5294698d8db78e21df972e8ce6213f21237789fa` uses the safer current behavior: it disables the generic placeholder poller and leaves events PENDING because no generic delivery adapter exists. Its test explicitly asserts that no timer/poller starts and that writes remain PENDING. Therefore, do not extract PR #138's log-only poller/worker-claim loop as the canonical generic outbox implementation. Retain the worker actor-context design as a future integration requirement for a real adapter, and reconcile it with PR #153 and carrier-worker ownership before enabling any polling. PR #154 remains the separate auto-completion lease workstream.
