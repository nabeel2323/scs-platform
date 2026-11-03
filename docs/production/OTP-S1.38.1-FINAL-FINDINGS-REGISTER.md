# S1.38.1 — Final Findings Register

**Subject:** Consolidated register of every finding opened, closed, or inherited across S1.35 → S1.38, verified by independent execution in this session (S1.38.1).

Every entry below was either (a) re-measured against HEAD `c3c0047e0c686525abb205ed3066c78a16765237` this session, or (b) explicitly classified as environmental / out-of-scope for this session.

## Legend

- **ID** — stable identifier. `F-` = defect, `G-` = gap, `E-` = environmental, `L-` = limitation.
- **Origin** — the phase that surfaced the finding.
- **Status** — `CLOSED` (fixed this session), `VERIFIED` (independently reproduced this session), `OPEN` (requires owner action), `ENVIRONMENTAL` (outside code scope).
- **Evidence** — where the proof lives (report + test name).

## Findings

### F-S1.38.1-01 — Flutter email-only login misrepresented phone identity — CLOSED

| Field | Value |
| --- | --- |
| Origin | S1.38 §I.4, escalated during S1.38.1 §9 |
| Class | Defect (state model incorrect) |
| Impact | Both email-OTP and password-login paths called `_completeLogin(tokens, '')`, which wrote `currentUserPhoneProvider = ''`. `home_screen.dart:35` read the provider and rendered `Text('')` as an empty subtitle plus `avatarLetter = '?'` because `phone.isEmpty`. No token/session/navigation defect, but the identity model was misrepresented as "phone account with an empty phone" — exactly the pattern S1.38.1 §9 forbids. |
| Fix | Added `currentUserEmailProvider` (`StateProvider<String?>`, null default) in `providers.dart`; refactored `_completeLogin` signature to named `{String? phone, String? email}`; updated 3 callsites (password, phone-OTP, email-OTP); `home_screen.dart` computes `displayIdentifier = phone.isNotEmpty ? phone : (email ?? profile?.email ?? '')` with matching avatar-letter fallback. No fake phone value is written on email-only paths. |
| Verification | `dart analyze lib` exit 0; 15 pre-existing info-level lints unchanged; no new errors or warnings; contract parity with API and Web re-verified by grep. |
| Evidence | `docs/production/OTP-S1.38.1-FLUTTER-CLIENT-TEST-REPORT.md`; files `mobile/lib/providers/providers.dart`, `mobile/lib/screens/auth/login_screen.dart`, `mobile/lib/screens/home/home_screen.dart`. |

### F-S1.38.1-02 — Migration 0065 was never executed against a real database in S1.38 — CLOSED

| Field | Value |
| --- | --- |
| Origin | S1.38 §H limitation ("not executed against live database") |
| Class | Verification gap |
| Impact | S1.38 shipped `0065_hmac_identifier_hash.sql` with only source inspection; no assertion proven that `varchar(68)` widening, `hash_version DEFAULT 2`, and `UPDATE ... = 1` backfill work correctly through the real runner's `BEGIN → SQL → INSERT _migration_log → COMMIT` contract. |
| Fix | Authored `apps/api/src/__tests__/integration/migration-0065-hmac-hash.postgres.spec.ts` (313 lines, 13 tests) against `postgres:16-alpine` via `@testcontainers/postgresql`. |
| Verification | 13/13 pass. Tests cover: file exists; no embedded txn control; pre-0065 state `varchar(64)` and `hash_version` absent; clean apply through the runner contract; `varchar(68)`; `integer NOT NULL DEFAULT 2`; historical rows backfilled to 1; new INSERT gets DEFAULT 2; blind rerun fails and rolls back (log count stays 1); mid-migration failure leaves no partial ALTER; FK/index preserved; v1 and v2 rows distinguishable; ORM↔DB schema metadata parity. |
| Evidence | `docs/production/OTP-S1.38.1-MIGRATION-VERIFICATION-REPORT.md`. |

### F-S1.38.1-03 — Silent literal-consistency risk between SQL ↔ ORM ↔ TypeScript — VERIFIED

| Field | Value |
| --- | --- |
| Origin | Memory pattern "misspelled literal branch and unused parameter survive passing tests in SQL artifacts"; surfaced in S1.38.1 §4. |
| Class | Regression guard |
| Concern | If `varchar(68)` in `0065_hmac_identifier_hash.sql` drifts from `length: 68` in `identity.schema.ts`, or if `DEFAULT 2` drifts from `.default(2)`, TypeScript still compiles and tests still pass because neither artefact references the other. |
| Fix | Test T13 in `migration-0065-hmac-hash.postgres.spec.ts` reads the schema text and asserts the literals are present, plus queries the live DB `information_schema.columns` for `character_maximum_length` and `column_default`. Cross-check verifies `IDENTIFIER_HASH_VERSION` is exported (not hard-coded) and `hashIdentifier()` builds the `v2:` prefix via interpolation. Legacy `hashEmail()` has zero production callers (grep). |
| Evidence | `OTP-S1.38.1-MIGRATION-VERIFICATION-REPORT.md` §"Cross-File Literal-Consistency Check"; `OTP-S1.38.1-EXECUTION-REPORT.md` §E.§5. |

### F-S1.38.1-04 — S1.38 report cited three inconsistent test counts (75, 128, 133) for the same suite — VERIFIED

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §3 mandate: reconcile all S1.38 test-count claims. |
| Class | Reporting accuracy |
| Findings | Re-measurement against HEAD `c3c0047e` yielded 5-file focused total = **133 tests / 133 pass**. Only the "133" figure in S1.38 matches reality; the "75" and "128" figures are not reproducible. Full API unit run = **2326 / 2326** (118 files), which supersedes S1.38's 2205 figure (S1.38 was citing a pre-S1.38 baseline). |
| Evidence | `OTP-S1.38.1-EXECUTION-REPORT.md` §D; `OTP-S1.38.1-INDEPENDENT-VERIFICATION-REPORT.md`. |

### G-S1.38.1-05 — Web email-OTP UI path has no dedicated component test — OPEN

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §8 |
| Class | Verification gap |
| Impact | Existing 26 tests in `apps/web/src/__tests__/` cover the sms/whatsapp OTP selector and unrelated flows. No RTL test exercises the third "Email OTP" tab in `apps/web/src/app/auth/login/page.tsx` or the link/unlink paths in `apps/web/src/app/account/page.tsx`. |
| Owner action | Add `apps/web/src/__tests__/email-otp-login.test.tsx` and `apps/web/src/__tests__/account-linking.test.tsx` before Phase 2. |
| Evidence | `OTP-S1.38.1-WEB-CLIENT-TEST-REPORT.md` §"Outstanding Web Verification Gaps". |

### G-S1.38.1-06 — Flutter widget tests for email-OTP and linking absent — OPEN

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §9 |
| Class | Verification gap |
| Impact | `mobile/test/` contains no coverage for the email OTP tab or the profile linking UI. `flutter test` was not executed because no S1.38-relevant tests exist. |
| Owner action | Author `test/screens/login_screen_email_otp_test.dart` and `test/screens/profile_screen_linking_test.dart` before Phase 2. |
| Evidence | `OTP-S1.38.1-FLUTTER-CLIENT-TEST-REPORT.md` §"Outstanding Flutter Verification Gaps". |

### G-S1.38.1-07 — S1.38.1 did not re-execute the full 90-test S1.35/S1.36 integration suite — OPEN

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §7 scope choice |
| Class | Verification scope limit |
| Impact | Only the four S1.38-relevant Postgres specs (80 tests) were re-run. The rest of the integration suite (`p12-independent-runtime-verification`, `p8-import-hardening`, etc.) was not re-executed this session. |
| Owner action | `pnpm --filter @scs/api test:integration` in CI before merge. |
| Evidence | `OTP-S1.38.1-EXECUTION-REPORT.md` §I limitation 2. |

### G-S1.38.1-08 — Real-Redis suite not re-executed — OPEN (by boundary)

| Field | Value |
| --- | --- |
| Origin | §1 boundary: no persistent Redis operations. |
| Class | Verification scope limit |
| Impact | `otp-redis-lua.real.spec.ts` and related real-Redis specs (4 files, ~33 tests) depend on `REDIS_IT=1` + `REDIS_DISPOSABLE_ACK=1` against a disposable Redis. Not executed here. |
| Owner action | CI job with `REDIS_IT=1 REDIS_DISPOSABLE_ACK=1 REDIS_URL=...` and a `redis:7-alpine` service (already declared in `.github/workflows/ci.yml` test-integration). |
| Evidence | `OTP-S1.38.1-EXECUTION-REPORT.md` §I limitation 3. |

### G-S1.38.1-09 — Changes remain uncommitted — OPEN (by boundary)

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §12 |
| Class | Authorisation boundary |
| Impact | Working tree contains S1.38 implementation changes (27 files) plus S1.38.1 additions (1 spec, 3 Flutter files, 8 reports). Committing would mix two review scopes; a single focused commit is technically safe but requires explicit owner authorisation per §1's "do not assume owner intent" rule and the permanent "no destructive Git or blanket staging" memory constraint. |
| Owner action | Review §12 inventory; either authorise one focused S1.38+S1.38.1 commit or split into two commits. |
| Evidence | `OTP-S1.38.1-EXECUTION-REPORT.md` §E.§12. |

### E-S1.38.1-10 — `next build` environmental failure on host Node v26.4.0 — ENVIRONMENTAL

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §8 |
| Class | Environmental (not a code defect) |
| Symptom | `apps/web > npx next build` exits 1 with `Cannot find module .../next@14.2.35__react@18.3.1/.../dist/compiled/jest-worker/processChild.js`. |
| Root cause | Host runs Node v26.4.0; `.nvmrc` pins Node 22. The pnpm virtual-store entry for next@14.2.35 is incomplete for this Node major. |
| Same class as | Documented in the S1.3 second-independent-audit memory: "dependencies were not repaired; recorded as NOT VERIFIED rather than contradicting the report's success". |
| Owner action | Verify via CI on Node 22. No dependency mutation performed here (respecting "no unrelated modification" boundary). |
| Evidence | `OTP-S1.38.1-WEB-CLIENT-TEST-REPORT.md` §"Production Build Attempt". |

### E-S1.38.1-11 — Testcontainers startup race produced 16/16 skips in the first combined run — ENVIRONMENTAL, RESOLVED

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §7 |
| Class | Environmental (Docker resource exhaustion) |
| Symptom | First combined run of the 4 Postgres specs showed `email-otp-e2e` as 16/16 skipped with no source diff. |
| Root cause | ~23 stale `postgres:16-alpine` and `postgis/postgis:16-3.4` containers from prior sessions were saturating Docker resources. Matches the memory pattern "Testcontainers startup-race false failures". |
| Fix | Verified none of the containers carried a compose label (no dev DB touched); `docker stop` all matching-ancestor containers; `docker container prune -f`. Re-run alone: `email-otp-e2e` 16/16 pass. Re-run combined: 80/80 pass. |
| Classification | Environmental artifact; not a regression in code. |
| Evidence | `OTP-S1.38.1-EXECUTION-REPORT.md` §E.§7. |

### L-S1.38.1-12 — Migration 0065 SQL body not idempotent standalone — DOCUMENTED DESIGN

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §4 analysis |
| Class | Design limitation (acceptable) |
| Detail | Running the 0065 SQL twice against the same schema fails (`column "hash_version" of relation "account_link_log" already exists`). This is by design because the repo's runner (`migrate-pg.ts` and `DatabaseService.onModuleInit`) gates execution through `_migration_log`. |
| Verification | Test T9 confirms a blind rerun fails and correctly rolls back (log count stays 1; data unchanged). |
| Owner action | None required; on-call runbook should note the one-way semantics. No `0065_down.sql` exists (matches the repo's forward-only policy). |

### L-S1.38.1-13 — Flutter cold-start shows blank identity before profile fetch — DOCUMENTED UX

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §9 follow-up |
| Class | UX consideration (not a defect) |
| Detail | `currentUserEmailProvider` is `null` at cold start until `fetchProfile()` resolves. `home_screen.dart` falls back through `phone → email → profile?.email → ''`. There is a brief moment when the subtitle and avatar are blank. |
| Owner action | Optional: persist `currentUserEmailProvider` alongside `scs_last_email` in SharedPreferences for smoother cold start. Not blocking. |

### L-S1.38.1-14 — Logout does not clear `currentUserEmailProvider` — DOCUMENTED FOLLOW-UP

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §9 grep audit |
| Class | Verification observation |
| Detail | Both `currentUserPhoneProvider` and `currentUserEmailProvider` are set at login; the current code does not reset them at logout. Because the users navigating away are typically routed to `/login` which does not read either provider, there is no visible defect today, but a shared device could observe stale state after session end. |
| Owner action | Add a `_clearLoginIdentity()` helper writing `''` / `null` to both providers on logout. Not blocking Phase 1 acceptance. |

### L-S1.38.1-15 — Real staging/production migration execution unauthorised — DOCUMENTED BOUNDARY

| Field | Value |
| --- | --- |
| Origin | S1.38.1 §1 boundaries |
| Class | Authorisation boundary |
| Detail | This session only applied migrations 0064 and 0065 to disposable Testcontainers PostgreSQL. Executing them against staging/production databases is a separately-authorised deployment action. |
| Owner action | Schedule the deployment run through the normal change-management gate after Phase 1 acceptance. |

## Inherited from S1.38 (reaffirmed, not new)

The following S1.38 findings remain in their documented state; this session did not re-open them:

| ID | Claim | Status after S1.38.1 |
| --- | --- | --- |
| S1.38 §H | Migration 0065 not executed against live DB | **CLOSED** (F-S1.38.1-02) |
| S1.38 §I.4 | Flutter `_completeLogin` cosmetic issue | **CLOSED** and reclassified as non-cosmetic (F-S1.38.1-01) |
| S1.38 §I.4 | S1.38 report cited inconsistent test counts | **VERIFIED** as 133 (F-S1.38.1-04) |
| S1.38 §F-10 | Mock provider production/staging rejection | **VERIFIED** — 4 integration + 21 unit tests |
| S1.37-F-04 | Linking without consumed OTP | **VERIFIED** — 3 sub-case integration test in `email-otp-security` |

## Summary Count

| Category | Count |
| --- | --- |
| New defects discovered and closed this session | 1 (F-S1.38.1-01) |
| Verification gaps closed this session | 2 (F-S1.38.1-02, F-S1.38.1-03) |
| Reporting accuracy corrections | 1 (F-S1.38.1-04) |
| Open gaps requiring owner action | 5 (G-05..G-09) |
| Environmental issues (not code) | 2 (E-10, E-11) |
| Documented limitations / design observations | 4 (L-12..L-15) |

**No unresolved functional defect remains in the Phase 1 email-OTP scope.** The five OPEN items (G-05..G-09) are verification-coverage and authorisation boundaries, not defects.
