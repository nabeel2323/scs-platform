# Mainline Integration and Legacy Branch Disposition

**Review date:** 2026-11-15  
**Repository:** `nabeel2323/scs-platform`  
**Base:** `main` at the start of this review  
**Purpose:** Record branch ancestry, preserve selected historical OTP verification evidence, and document why stale deployment configuration was not imported.

> This is a repository-history and documentation consolidation record. It does not authorize deployment, database changes, migration execution, OTP delivery, infrastructure changes, or production rollout.

## 1. Main/develop ancestry

At review time, GitHub comparison showed:

- `main` was 97 commits ahead of `develop`.
- `develop` was 0 commits ahead of `main`.
- The latest mainline integration commit was `8e69319`, the merge commit for PR #112 from `develop`.

Therefore, the attempted `develop -> main` integration was already represented in main. A second merge of develop into main was unnecessary. This does not mean every feature branch has been integrated.

## 2. Branches with unique commits

The following branches had commits not reachable from main at the time of comparison:

| Branch | Ahead of main | Behind main | Observed changed paths | Disposition |
|---|---:|---:|---|---|
| `feat/otp-foundation` | 10 | 168 | OTP foundation, Redis/Lua, provider and test code | Do not merge wholesale. Its earlier SMS/WhatsApp scope is superseded by the later email-only policy recorded in PR #107. Retain as historical branch unless a specific non-superseded change is independently identified. |
| `feat/auth-email-otp-phase1` | 2 | 153 | Ten S1.40/S1.41 production documents | Preserve selected S1.41 verification and safety reports in the archive directory with a historical-use warning. Do not import the old operational runbooks as current instructions. |
| `audit/otp-staging-readiness-2026-11-06` | 1 | 121 | OTP implementation/staging-readiness audit | Do not merge as current guidance. It describes the earlier multi-channel OTP architecture and predates later OTP/security/bootstrap changes. |
| `feature/buyer-staging-deployment-remediation` | 1 | 107 | Buyer Vercel config and six staging reports | Do not merge the old Vercel config as-is. Preserve its findings as historical context only; current project configuration and runtime state must be the source of truth. |

These are branch-ancestry facts, not a recommendation to merge every unique commit. The branches are substantially behind main and require selective review.

## 3. Selected S1.41 historical records preserved

Four reports from `feat/auth-email-otp-phase1` were copied to `docs/archive/otp-phase1/`:

1. `OTP-S1.41-DOCUMENTATION-REMEDIATION-REPORT.md`
2. `OTP-S1.41-FINAL-VERIFICATION-REPORT.md`
3. `OTP-S1.41-MIGRATION-AND-ROLLBACK-SAFETY-REVIEW.md`
4. `OTP-S1.41-SMOKE-TEST-SEQUENCE-VERIFICATION.md`

Each archived report has a warning stating that it describes the 2026-11-03 implementation/deployment state and is not a current operating procedure. The reports preserve historical findings including the corrected account-linking OTP sequence, safer smoke-test cleanup, soft-rollback-first guidance, and the distinction between migration 0064 and 0065 idempotency.

The six S1.40 operational documents were deliberately not copied into current production documentation. Their environment, migration, provider, and staging instructions belong to an earlier deployment state and should not be followed without revalidation.

## 4. Buyer Vercel configuration disposition

The legacy branch adds `apps/web/vercel.json`. Its build-time configuration hard-codes:

- `NEXT_PUBLIC_API_URL=https://scs-api-staging.onrender.com`
- `NEXT_PUBLIC_WS_URL=wss://scs-api-staging.onrender.com`

The file also introduces project-level build/output and security-header settings. The current main branch does not contain this file at that path, and the active Vercel projects have their own project configuration/deployment settings. Copying the historical file into main could override or conflict with those settings, particularly the API URL. Therefore it was not imported.

The old buyer staging reports also describe a CORS state observed on 2026-11-08. That finding must be checked against current API configuration and current browser origins before being treated as an active defect.

## 5. CI deployment-invariants test command

The CI workflow previously invoked the API test script with an extra argument separator:

```bash
pnpm --filter @scs/api run test -- --no-file-parallelism src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
```

The workflow comment says this step is intended to run only the named deployment-invariants spec. The command has been changed to invoke Vitest directly in the API package:

```bash
pnpm --filter @scs/api exec vitest run --no-file-parallelism src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
```

This avoids forwarding an extra `--` through the package script. The focused test has not been executed by this documentation/contents-API change; the pull-request CI run must verify it. The earlier Reaper error in workflow run #446 should not be considered resolved until the new focused job passes.

## 6. Fully integrated branches

The following branches compared with zero commits ahead of main at review time, so they require no merge:

- `feature/automated-release-pipeline-v2.1`
- `feature/otp-auth-security-hardening`
- `feature/super-admin-bootstrap`
- `feature/ui-driven-super-admin-bootstrap`
- `fix/react-hydration-phase-1`
- `phase-4/staging-recovery-hardening`
- `security/remove-otp-log`

Archiving or deleting these branch refs is a separate repository-maintenance decision and is not part of this change.

## 7. Explicitly not performed

- No merge into `main` or `develop`.
- No deletion or archival of Git branches.
- No Vercel or Render settings changed.
- No database, migration ledger, feature flag, or application data changed.
- No OTP email/SMS/WhatsApp sent.
- No deployment triggered manually.

## 8. Review acceptance criteria

- [ ] CI runs only `p41-deployment-invariants.spec.ts` in the dedicated deployment-invariants step.
- [ ] The dedicated test passes without collecting the unrelated Testcontainers integration suite.
- [ ] All other required PR checks pass.
- [ ] Archived S1.41 records remain clearly marked historical.
- [ ] No legacy buyer Vercel configuration is imported.
- [ ] A reviewer approves the PR before it is merged.

**Status:** Prepared for pull-request review; CI verification pending.
