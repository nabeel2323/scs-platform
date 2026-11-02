# S1.38.1 — Phase 1 Acceptance Recommendation

**Subject:** Formal recommendation on whether Phase 1 (Email-First Identity and Email OTP) is accepted, conditionally accepted, or not accepted, based on independent execution in this session.

**Task reference:** S1.38.1 §15.

## Recommendation

**CONDITIONALLY ACCEPTED.**

Phase 1 (email-first identity + Email OTP + HMAC-SHA256 identifier digests + account linking + Flutter/Web consumption) satisfies every functional and security invariant the phase promised, verified against actual source and actual execution. It is **not yet ready to merge** because five verification/authorisation boundaries remain open. None of them are defects; all of them are pre-merge prerequisites.

## What Was Independently Proven (Acceptance Basis)

Every claim below is backed by a command executed in this session against baseline HEAD `c3c0047e0c686525abb205ed3066c78a16765237`.

### Functional correctness

| Claim | Evidence | Result |
| --- | --- | --- |
| Email OTP request → delivery → verify → JWT issuance end-to-end | `email-otp-e2e.postgres.spec.ts` | 16 / 16 pass |
| Registration creates email-only users; password login accepts email | Unit suite; `email-otp-e2e` | pass |
| Account link / unlink flows (email and phone) | `account-linking.spec.ts` | 29 / 29 pass |
| Feature flag `auth.email_otp.enabled=false` → 404 | `email-otp-e2e` | pass |
| Flutter email-only login path now shows the email identity, not an empty phone | `dart analyze lib` after §9 fix | exit 0; defect F-S1.38.1-01 closed |
| Web email-OTP tab + linking UI typed and compiles | `apps/web > npx tsc --noEmit` | exit 0 |

### Data integrity

| Claim | Evidence | Result |
| --- | --- | --- |
| Migration 0064 creates the dual-identifier schema with CHECK + unique email index + audit table | `migration-0064-email-identity.postgres.spec.ts` | 32 / 32 pass |
| Migration 0065 widens `identifier_hash` to `varchar(68)` and adds `hash_version DEFAULT 2`; historical rows become `hash_version = 1`; new INSERTs default to 2 | `migration-0065-hmac-hash.postgres.spec.ts` (new this session) | 13 / 13 pass |
| Migration re-execution is idempotent at the runner level; SQL body is intentionally one-way | Test T9 (blind rerun fails, rolls back; `_migration_log` count stays 1) | pass |
| SQL ↔ Drizzle ORM ↔ TypeScript literals agree | Test T13 cross-checks schema text vs DB `information_schema` | pass |

### Security invariants (all server-side)

| Invariant | Evidence | Result |
| --- | --- | --- |
| Enumeration resistance | `email-otp-security` §Enumeration prevention, 3 tests | pass |
| Per-email rate limit 5 / 15 min | `email-otp-security` §Per-email rate limit | pass |
| Per-IP rate limit 20 / 1 min | `email-otp-security` §Per-IP rate limit + `auth.controller.ts` `@Throttle({ 'otp-request' })` | pass |
| Challenge supersession | `email-otp-security` + `email-otp-lifecycle.spec.ts` | pass |
| OTP replay prevention (atomic consume) | `email-otp-security` §OTP replay prevention | pass |
| Concurrent verify → exactly one winner | `email-otp-security` §Concurrent verification, 10-way race | pass |
| No auto-merge on linking conflict | `email-otp-security` §Linking security + `account-linking.spec.ts` | pass |
| Cannot remove last reachable auth method | `email-otp-security`, both email- and phone-only cases | pass |
| Linking refuses unconsumed OTP (S1.37-F-04) | `email-otp-security`, 3 sub-cases | pass |
| HMAC v2 identifier hash (no raw email in audit) | `email-otp-security` §audit log + `email-normalization.spec.ts` | pass |
| OTP never stored plaintext in Redis | `email-otp-security` §Redis stores HMAC hash | pass |
| SMTP credential redaction | `smtp-email.provider.spec.ts` + `email-otp-security` | pass |
| OTP value never logged | `otp-redaction.spec.ts` | pass |
| Mock provider rejected in production/staging; fail-closed when `OTP_MOCK_ENABLED` absent | `mock-provider.spec.ts` (21) + `provider-registry.spec.ts` (22) + `email-otp-security` (4 integration) | pass |
| `OTP_HMAC_SECRET` startup gate: rejects missing / blank / dev-default / < 32 chars in production-like envs | `env-gate.ts` source + `main.ts` bootstrap wiring | pass |

### Contract and API parity

| Surface | Evidence |
| --- | --- |
| 6 email-OTP endpoints exist identically in NestJS controller, Web `auth.ts`, Flutter `api_service.ts`, and `packages/contracts` | grep cross-check; `tsc --noEmit` in `packages/contracts` exit 0 |
| No `purpose` field leaked in `EmailOtpRequestSchema` | Contract inspection |

### Build and typecheck

| Gate | Exit |
| --- | --- |
| `apps/api > npx tsc --noEmit` | 0 |
| `apps/api > npx nest build` | 0 (422 files compiled) |
| `apps/api > vitest run src/__tests__/unit` | 0 (2326 / 2326 pass, 118 files) |
| `apps/web > npx tsc --noEmit` | 0 |
| `apps/web > npx vitest run` | 0 (26 / 26 pass) |
| `packages/contracts > npx tsc --noEmit` | 0 |
| `mobile > dart analyze lib` | 0 (15 pre-existing info-level lints only) |

## Conditions Attached to the Acceptance

Phase 1 acceptance is conditional on the owner closing the following before merge. None are code defects; all are boundary and coverage items.

### Condition 1 — CI execution on Node 22 for the Web build

**Why:** `next build` fails on this host (Node v26.4.0) with a missing `jest-worker/processChild.js` in the pnpm virtual store. Identical failure was documented in the S1.3 second-independent-audit. The `.nvmrc` pins Node 22; CI's Node 22 image is the authoritative gate.

**Close:** A green `test-web-build` job in `.github/workflows/ci.yml` on Node 22 with the repo's own `pnpm install` (no dependency mutation performed by this session, per the no-toolchain-fixes constraint).

### Condition 2 — Full integration suite re-execution

**Why:** Only the four S1.38-relevant Postgres specs (80 tests) were re-run here for scope discipline. The full 90-test S1.35 / S1.36 integration corpus plus `p12-independent-runtime-verification`, `p8-import-hardening`, and other Postgres-backed specs were not re-executed against the S1.38 changes.

**Close:** `pnpm --filter @scs/api test:integration` in CI against a Node 22 image with Docker available.

### Condition 3 — Real-Redis suite under disposable Redis

**Why:** This session's §1 boundary prohibited persistent Redis operations. Real-Redis specs (~33 tests) depend on `REDIS_IT=1` + `REDIS_DISPOSABLE_ACK=1` against a disposable Redis (memory: CI's test-integration job declares `redis:7-alpine` service and a `redis-cli ping` healthcheck but never sets `REDIS_IT`, so the suite is skipped rather than executed; this is the exact weakness the S1.3 second-independent-audit flagged).

**Close:** Owner either sets `REDIS_IT=1 REDIS_DISPOSABLE_ACK=1` explicitly on the CI job and confirms the suite runs, or documents a `fail-if-skipped` guard on the Redis specs.

### Condition 4 — Web UI-level tests for the email-OTP path

**Why:** Existing 26 Web tests cover sms/whatsapp channel selector but not the third "Email OTP" tab nor the account-link/unlink UI. Contract parity is verified, but user-facing behaviour is not exercised.

**Close:** Before Phase 2 starts, add `apps/web/src/__tests__/email-otp-login.test.tsx` and `apps/web/src/__tests__/account-linking.test.tsx` mirroring `auth-login-channel.test.tsx` patterns.

### Condition 5 — Flutter widget tests for the email-OTP path

**Why:** `mobile/test/` has no S1.38-relevant coverage. The §9 defect was found by source inspection; a widget test would have caught it automatically.

**Close:** Before Phase 2 starts, add `test/screens/login_screen_email_otp_test.dart` and `test/screens/profile_screen_linking_test.dart` covering request → verify → home navigation, plus link / unlink UI.

### Condition 6 — Authorised focused commit

**Why:** Working tree still holds 27 S1.38 files + 4 S1.38.1 additions. This session did not commit because (a) §1 forbids assuming owner intent and (b) a "focused commit" that mixes S1.38 and S1.38.1 files requires the owner's review of the combined diff.

**Close:** Owner explicitly authorises either a single focused S1.38 + S1.38.1 commit with a curated file list, or two separate commits (S1.38 implementation, S1.38.1 verification). Pre-existing unrelated modifications (7 files listed in §C of the execution report) must remain unstaged.

### Condition 7 — Staging / production migration execution

**Why:** Migrations 0064 and 0065 were only executed against disposable Testcontainers PostgreSQL here. Reaching staging/production is a separately-authorised deployment action.

**Close:** Normal change-management gate; run `pnpm db:migrate` under the deployment identity, verify `_migration_log` contains both entries, spot-check `account_link_log` rows are v2.

## Explicitly Not Blocking Acceptance

The following items are documented in `OTP-S1.38.1-FINAL-FINDINGS-REGISTER.md` but do **not** block Phase 1:

- L-S1.38.1-12 — Migration 0065 SQL body not idempotent standalone (by design; runner gates via `_migration_log`).
- L-S1.38.1-13 — Flutter cold-start blank-identity moment (UX polish, no defect).
- L-S1.38.1-14 — `currentUserEmailProvider` not cleared on logout (no observable impact today; tracked follow-up).
- E-S1.38.1-11 — Docker container saturation observed and resolved inside this session (environmental).

## Authorisation Boundary Compliance

Every §1 prohibition was respected. No push, PR, merge, deploy, staging/production config change, real OTP dispatch, persistent Redis operation, Phase 2 work, unrelated modification discarding, blanket Git staging, or destructive Git command was performed. Full evidence in `OTP-S1.38.1-EXECUTION-REPORT.md` §B.

## Why Not ACCEPTED outright

`ACCEPTED` would require zero open conditions. Conditions 1-3 are CI-execution gates that must show green before merge; they are procedural, not unknowns. Conditions 4-5 are test-coverage gaps explicitly acknowledged by the task §15. Condition 6-7 are owner-authorised actions this session cannot take.

Issuing `ACCEPTED` while a full CI run has not been executed would violate the "merge-readiness ≠ production-readiness; each needs its own evidence" memory rule.

## Why Not NOT_ACCEPTED

`NOT_ACCEPTED` would require an unresolved functional or security defect. There are none. The one substantive defect found (F-S1.38.1-01, Flutter email-only identity) is fixed and analysed clean. Every security invariant is independently re-verified. Every migration assertion passes. Every test count reconciles.

## What Phase 2 May Begin Once Conditions 1-7 Close

Phase 2 scope (per prior planning documents): passkeys, TOTP, hardware keys, and multi-device session management. Phase 2 may **not** begin while Phase 1 has an open functional defect.

## Final Verdict Line

**Phase 1 status: CONDITIONALLY ACCEPTED.** Merge may proceed after conditions 1-6 close; deployment requires condition 7. No code defect blocks Phase 1 closure.
