# OTP-S1.38.4-RELEASE-PREPARATION-REPORT.md

**Task:** S1.38.4 — Phase 1 Release Preparation and Commit Readiness  
**Date:** 2026-11-02  
**Branch:** feat/auth-email-otp-phase1  
**Baseline HEAD:** c3c0047e0c686525abb205ed3066c78a16765237  
**Prior Session:** S1.38.3 (Integration Gate Remediation & Final Phase 1 Verification — CONDITIONALLY ACCEPTED)  
**Companion reports:** `OTP-S1.38.4-COMMIT-FILE-REGISTER.md`, `OTP-S1.38.4-SECURITY-AND-CHANGESET-REVIEW.md`

---

## A. Objective

Determine whether the accumulated S1.38 / S1.38.1 / S1.38.2 / S1.38.3 working tree is safe for
the owner to commit as the Phase 1 Email-First Identity and Email OTP release change set, and
produce an exact, path-level commit register with grouping, messages, and residual risks.

S1.38.3 verification is the accepted local test evidence. **No test suite was re-run in this session.**

## B. Execution Boundaries Observed

| Boundary | Status | Evidence |
|---|---|---|
| Do NOT rerun the full API unit suite | ✓ Respected | No `test:unit` / `test:coverage` command invoked |
| Do NOT rerun the full API integration suite | ✓ Respected | No `test:integration` command invoked |
| Do NOT rerun Web or Flutter suites | ✓ Respected | No `vitest`/`next test`/`flutter test` invoked |
| Do NOT perform another broad testing cycle | ✓ Respected | Only read-only Git/file inspection |
| Do NOT commit or push | ✓ Respected | Index remains clean (see §D) |
| Do NOT create a PR or merge | ✓ Respected | No PR/merge tooling used |
| Do NOT deploy | ✓ Respected | No deploy command |
| Do NOT execute staging/production migrations | ✓ Respected | 0064/0065 verified by source reading only |
| Do NOT modify secrets or environment configuration | ✓ Respected | `.env*` files read-only; `.env.example` unmodified this session |
| Do NOT send real OTP messages | ✓ Respected | No provider invocation |
| Do NOT start Phase 2 | ✓ Respected | No new implementation |
| Do NOT discard/overwrite/reset/clean unrelated changes | ✓ Respected | No `checkout`/`restore`/`reset`/`clean` executed |
| Do NOT use blanket Git staging | ✓ Respected | No `git add` executed at all |
| Deliverables must be real inspected evidence | ✓ Satisfied | Every claim below carries a command, file path, or line reference |

**Net effect on the repository:** the only files created by this session are the three
`docs/production/OTP-S1.38.4-*.md` deliverables and read-only scratch artifacts under
`.m73b6-scratch/s1384/`. No tracked file was modified.

## C. Commands Executed (all read-only)

| # | Command / script | Purpose | Exit |
|---|---|---|---|
| 1 | `git rev-parse --abbrev-ref HEAD` | branch capture | 0 |
| 2 | `git rev-parse HEAD` | head capture | 0 |
| 3 | `git status --porcelain` (via `.m73b6-scratch/s1384/capture.ps1`) | full status, 230 entries | 0 |
| 4 | `git diff --name-only --cached` | staged-file enumeration | 0 (empty) |
| 5 | `git log --oneline -n 6` | commit history | 0 |
| 6 | `git log --oneline origin/develop..HEAD` | commits ahead of base | 0 |
| 7 | `git ls-files` (via `baseline2.ps1`) | tracked vs untracked adjudication | 0 |
| 8 | `git diff --stat HEAD` / `git diff --numstat HEAD` | change magnitude, 45 files | 0 |
| 9 | `git diff HEAD -- <path>` × 45 (via `diffs.ps1`) | per-file diff content | 0 |
| 10 | `git check-ignore -v` on `.env*`, `.vitest-*.json`, scratch dirs | hygiene adjudication | 0 |
| 11 | `git grep` for `purpose`, `check-redis`, `OTP_MOCK_ENABLED` | coupling / dead-code probes | 0 |
| 12 | `.m73b6-scratch/s1384/hygiene.ps1` | env-file + diff-size ranking | 0 |
| 13 | `.m73b6-scratch/s1384/checks.ps1` | migrations inventory, 0064/0065 content | 0 |
| 14 | `.m73b6-scratch/s1384/risks.ps1` | ValidationPipe flags, 0065 references | 0 |
| 15 | `.m73b6-scratch/s1384/ci-risk.ps1` | openapi.json CI lifecycle, contract gate | 0 |
| 16 | `.m73b6-scratch/s1384/scan.ps1` | secrets / debug-code / skipped-test scan | 0 |
| 17 | `.m73b6-scratch/s1384/final-checks.ps1` | migration ordering + runner contract | 0 |
| 18 | `.m73b6-scratch/s1384/uiscope.ps1`, `docs.ps1` | UI diff on-scope check, doc grouping | 0 |
| 19 | `node .m73b6-scratch/s1384/closure.cjs` | test-count reconciliation vs S1.38.3 | 0 |
| 20 | `node .m73b6-scratch/s1384/importclosure.cjs` | transitive import closure of new Phase 1 tests | 0 |
| 21 | `.m73b6-scratch/s1384/token.ps1` | decode the tracked root JWT (`test-token.txt`) and check expiry | 0 |
| 22 | `.m73b6-scratch/s1384/rootjunk.ps1`, `rootjunk2.ps1` | tracked root-level generated artifacts; tracked-vs-untracked split of `.m73b6-scratch/` | 0 |
| 23 | `node .m73b6-scratch/s1384/sums.cjs` | validates the register's group assignment: `UNASSIGNED tracked-modified paths: NONE`, `overlap Phase1/unrelated: NONE` | 0 |

Inspection artifacts retained at `c:\TAIF\scs-platform\.m73b6-scratch\s1384\` (do not commit).

## D. Working-Tree Baseline (§2)

| Item | Value |
|---|---|
| Branch | `feat/auth-email-otp-phase1` |
| HEAD | `c3c0047e0c686525abb205ed3066c78a16765237` |
| Staged files | **0** — the index is identical to HEAD |
| Unstaged tracked-modified files | **45** |
| Untracked entries at capture | **185** (now 188 after this session wrote its 3 deliverables) |
| Total `git status --porcelain` lines | **230** at capture; **233** at close-out |
| Ignored files touched | none reported by `git status` (ignored set verified separately) |

The untracked entry count is inflated because `.m73b6-scratch/` is **partly tracked** (1,277 files
committed by earlier phases — see R-11), so Git cannot collapse it into a single `??` line and instead
lists ~48 individual entries.

Commits ahead of `origin/develop` (5):

```
c3c0047 docs(auth): S1.37 correct a brittle count claim caught by re-measurement
4e2a420 docs(auth): S1.37 self-review of the deliverables and teardown evidence
53ccdd6 docs(auth): S1.37 close-out - post-commit re-verification and audit state
00f59de docs(auth): S1.37 Phase 1 audit deliverables and S1.35 withdrawal
5581e6a feat(auth): S1.37 audited Phase 1 email-first identity and email OTP
```

### D.1 Critical structural finding — Phase 1 is already partly committed

`git ls-files` proves the **core Phase 1 production files are already tracked and unmodified**
because they were committed in `5581e6a`. They therefore do **not** appear in `git status`:

| Already-committed Phase 1 file | Status |
|---|---|
| `infra/drizzle/migrations/0064_email_identity.sql` | tracked, unmodified |
| `apps/api/src/modules/notifications/providers/smtp-email.provider.ts` | tracked, unmodified |
| `apps/api/src/modules/notifications/providers/mock.provider.ts` interface siblings | tracked (see register) |
| `apps/api/src/modules/identity/auth.controller.ts` | tracked, unmodified |
| `apps/api/src/common/env-gate.ts` | tracked, unmodified |
| `apps/api/scripts/assert-redis-suite.mjs` | tracked, unmodified |
| `apps/api/src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts` | tracked, **modified** (0065 hook) |
| `apps/api/src/__tests__/integration/email-otp-e2e.postgres.spec.ts` | tracked, **modified** |

**Consequence:** the "Phase 1 commit" the owner is being asked to authorize is **not** the whole
of Phase 1 — it is the S1.38.x delta on top of an already-committed S1.37 Phase 1 base. This is
the correct structure and must be stated in the commit message so the release history is honest.

### D.2 Line-of-business composition of the delta

`git diff --stat HEAD` → **45 files, +2022 / −541**.

Accumulated in the working tree are **four distinct workstreams**, only two of which are Phase 1:

| Workstream | Files | Phase 1? |
|---|---|---|
| S1.38.x Email-First Identity / Email OTP | 23 prod + 9 tests + 1 SQL + 6 new tests + 30 docs | **Yes** |
| S1.38.3 integration-gate stabilization (test-infra only) | 5 spec files | **Yes — release-supporting** |
| P13 OQ-04 Option C commission reversal | 2 prod + 5 docs + 33 docs + 5 specs | **No** |
| SCS-OTP S1.x foundation / proxy / throttler / staging | 3 specs + 37 docs + 3 docs + nginx template | **No** |
| B2B framework completeness report | 1 html (322/322 rewritten) | **No** |
| IDE / scratch / generated test output | `.m73b6-scratch/`, `.audit-scratch/`, `.qoder/`, `infra/audit/`, `.vitest-*.json` | **No** |

## E. Change-Set Review Summary (§3)

Full findings are in `OTP-S1.38.4-SECURITY-AND-CHANGESET-REVIEW.md`. Coverage by required area:

| §3 Required area | Verified files | Verdict |
|---|---|---|
| Email-first identity, nullable phone | `identity.schema.ts` (+7/−5), `merchant.service.ts` (+1/−1), `buyer-api.ts`, `models.dart` | Complete |
| Email OTP request & verification | `auth.dto.ts` (+2/−14), `identity.service.ts` (+8/−8), `packages/contracts/src/index.ts` (−1) | Complete, 1 breaking-change risk |
| OTP challenge lifecycle & security | `email-otp-security.postgres.spec.ts` (+33/−7) | Complete |
| SMTP provider + test-only mock provider | `mock.provider.ts` (+12/−1), `provider-registry.service.ts` (+13/−3), `.env.example` (+4) | Complete, fail-closed |
| Account linking / unlinking | `account-linking.postgres.spec.ts`, `account-linking.spec.ts`, `account/page.tsx` (+209/−2) | Complete |
| HMAC identifier hashing + migration 0065 | `email-normalization.ts` (+40/−3), `0065_hmac_identifier_hash.sql` (new), `identity.schema.ts` | Complete |
| Migration 0064 | tracked & unmodified since `5581e6a`; spec modified to co-exclude 0065 | Complete |
| Web email OTP + linking flows | `login/page.tsx` (+123/−3), `lib/auth.ts` (+140/−0), `AuthCard.tsx`, `Navbar.tsx`, `merchant/organization/page.tsx` | Complete |
| Flutter email OTP, profile linking, logout cleanup | `login_screen.dart` (+185/−8), `profile_screen.dart` (+366/−4), `api_service.dart` (+49/−0), `providers.dart` (+23/−0), `home_screen.dart`, `merchant_registration_screen.dart` | Complete |
| Tests and test-harness changes | 9 modified + 6 new Phase 1 test files + 5 gate-stabilization specs | Complete |
| Production docs & historical report addenda | 30 untracked OTP-S1.33…S1.38.3 docs; addenda already inside the S1.38.2 files | Complete |

**Accidental / unexpected production changes:** none found. Every production-code delta in the
working tree was traced to a Phase 1 requirement or to the P13 workstream. Notably,
`apps/api/src/modules/merchant/merchant.service.ts` (+1/−1, `buyerPhone: string | null`) looks
out-of-scope by filename but **is** mandatory Phase 1 fallout of the nullable-phone schema, and
`mobile/lib/screens/merchant/merchant_registration_screen.dart` (+2/−1, `profile.phone == null`
guard) likewise. These are Phase 1, not accidental edits.

**Incomplete implementation:** none. All 8 `hashEmail()` call sites in `identity.service.ts` were
migrated to `hashIdentifier(x, this.hmacSecret, 'email'|'phone')` — no residual unsalted-hash call
site remains in that file.

**Inconsistent documentation:** 2 instances (see security report §F):
`docs/production/SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html` still asserts "latest migration 0063"
while being modified in this tree, and an older report references a nonexistent
`account-linking.spec.ts` integration path.

## F. Migration Review (§5)

| Check | Result | Evidence |
|---|---|---|
| 0064 present | ✓ | `infra/drizzle/migrations/0064_email_identity.sql`, tracked, content unchanged since `5581e6a` |
| 0065 present | ✓ | `infra/drizzle/migrations/0065_hmac_identifier_hash.sql`, 1,467 bytes, **untracked** |
| Numeric ordering | ✓ | 0060, 0061, 0062, 0063, 0064, 0065 — no gap, no collision |
| Lexicographic ordering at runtime | ✓ | `apps/api/infra/drizzle/migrate.ts` L121-123 and `migrate-pg.ts` L42-44 both do `.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()`; zero-padded 4-digit prefixes make lexicographic == numeric, so 0065 provably applies **after** 0064 |
| Transaction contract compliance | ✓ | 0065 contains **no** `BEGIN`/`COMMIT`. Both runners wrap `BEGIN → file → INSERT INTO _migration_log → COMMIT`; 0064's header documents this rule explicitly |
| EXCLUDED-list interaction | ✓ | Both runners exclude only `0013_analytics.sql` and `0018_analytics_retention.sql`; neither 0064 nor 0065 is excluded |
| Release-set membership | ✓ | 0064 already in HEAD; **0065 must be added** — see mandatory-atomicity rule in the register |
| Manifest/index file to update | n/a | No migration manifest exists in the repo; ordering is purely filename-driven |
| Executed against staging/production | ✗ Not executed | Prohibited by §1; verification was source-reading only |

0065 content verified as three steps: widen `identifier_hash` `varchar(64)` → `varchar(68)`;
`ALTER TABLE account_link_log ADD COLUMN hash_version integer NOT NULL DEFAULT 2`; then
`UPDATE account_link_log SET hash_version = 1` to backfill existing rows as legacy v1 hashes.
The file documents its `ACCESS EXCLUSIVE` lock implication and its rollback notes.

## G. Commit Readiness Position (§6)

The full register is in `OTP-S1.38.4-COMMIT-FILE-REGISTER.md`. Summary:

| Group | Files | Disposition |
|---|---|---|
| A — Phase 1 production code | 23 | commit |
| B — Phase 1 tests (modified) | 9 | commit |
| B2 — Phase 1 tests (new, untracked) | 6 | commit |
| C — migration 0065 (new, untracked) | 1 | commit — atomically with A |
| D — S1.38.3 gate stabilization (test-infra) | 5 | commit, separate commit |
| E — Phase 1 docs (30 untracked + 3 this session) | 33 | commit |
| **Total proposed Phase 1 commit set** | **77** | 37 tracked-modified + 7 new code/test/SQL + 33 docs |
| Unrelated — must remain untouched | 8 tracked-modified (2 P13 production + 5 P13 docs + 1 B2B html) + ~148 untracked entries | **do not stage** |

The 45 tracked-modified files partition exactly: 23 (A) + 9 (B) + 5 (D) = 37 Phase 1 or
Phase-1-supporting, and 8 unrelated. `23 + 9 + 5 + 8 = 45` ✓ — machine-verified by
`node .m73b6-scratch/s1384/sums.cjs`, which reported `UNASSIGNED tracked-modified paths: NONE` and
`overlap Phase1/unrelated: NONE`, so no modified file is left unclassified and none is claimed by
both the commit set and the exclusion list.

## H. Outstanding Release Risks

| ID | Risk | Severity | Disposition |
|---|---|---|---|
| R-1 | Removing `purpose` from `EmailOtpRequestSchema`/`Auth.dto` combined with the global `ValidationPipe` `whitelist: true, forbidNonWhitelisted: true` (`apps/api/src/main.ts` L100-101) converts any client still POSTing `purpose` from "silently ignored" into **HTTP 400** | Medium — breaking behavior change | Owner must explicitly acknowledge; this closes S1.37 finding F-10b, so it is intentional, but it is not covered by any CI assertion |
| R-2 | Committing `identity.schema.ts` (`length: 68`, `hashVersion`) **without** the untracked `0065_hmac_identifier_hash.sql` leaves CI and every deploy with a schema that does not match the DB | High — avoidable by staging rule | Register §C states the mandatory-atomicity rule |
| R-3 | The tracked-modified `migration-0064` spec references `MIGRATION_0065 = '0065_hmac_identifier_hash.sql'` (L34, L39). If 0065 is excluded from the commit, that tracked file reads a file CI never receives | High | Resolved by R-2 rule |
| R-4 | The two new Flutter screen tests import the also-untracked `mobile/test/screens/widget_test_harness.dart`; committing tests without the harness breaks `flutter test` on CI | Medium | Register groups them in one commit; `importclosure.cjs` proves the closure is complete |
| R-5 | Excluding P13 + proxy/throttler orphan specs means **CI test counts will not equal the S1.38.3 headline numbers** | Medium — misread as regression | Expected-value table in the register: CI integration **76 files / 1546 tests**, CI unit **115 files / 2304 tests** |
| R-6 | `apps/api/.vitest-integration-results.json`, `.vitest-unit-results.json`, `.vitest-redis-results.json`, `.m73b6-scratch/`, `.audit-scratch/`, `.qoder/`, `infra/audit/` are untracked **and not covered by `.gitignore`** (`git check-ignore -v` confirms) | Medium — hygiene | Any `git add -A`/`git add .` would commit them; `git add -A` is prohibited by §1 and the register gives explicit per-path staging |
| R-7 | No `.gitattributes` exists; Git emits 5 LF→CRLF warnings (`auth-dto.spec.ts`, `auth.dto.ts`, `identity.schema.ts`, `login/page.tsx`, `AuthCard.tsx`) | Low | Recommend a separate follow-up change, not part of this release |
| R-8 | `.env.example` L19-20 carry pre-existing literal dev MinIO values (`S3_ACCESS_KEY=scs_minio`, `S3_SECRET_KEY=scs_minio_2026`) | Low for this milestone — **not introduced by S1.38** | Flag to owner as a separate hardening item |
| R-9 | Modified `SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html` still claims migrations are "0001–0063; latest 0063" (`<td>Migrations</td><td>0001–0063; latest <code>0063_phase4_operational_readiness.sql</code>`) | Low — documentation inconsistency, unrelated file | Leave untouched in this commit; correct in the B2B workstream |
| R-10 | A **real JWT is committed** at the repo root: `test-token.txt` (1,499 chars, HS256, `role=MERCHANT_OWNER`, real-looking `sub`/`activeOrg`/`sid`/`jti`), added by `e3dcc66`. It **expired 2026-10-07 15:33 UTC**, so there is no live exposure, and the file is clean in the working tree so it cannot enter this commit | Medium — **pre-existing**, not introduced by S1.38 | Separate chore: remove the file and verify/rotate the dev JWT signing secret. Removal is proven safe: the only tracked reference (`p41-deployment-invariants.spec.ts` L297) asserts a `.dockerignore` **string**, not the file's existence |
| R-11 | `git ls-files -- .m73b6-scratch` returns **1,277 already-tracked files**, including a full repository snapshot `.m73b6-scratch/p418-context/` that carries its own `.env.example`, `.gitignore` and `ci.yml` | Medium — **pre-existing** structural hygiene | Follow-up `git rm -r --cached .m73b6-scratch` + `.gitignore`. Note for planning: adding an ignore rule **alone will not untrack them** |

## I. Testing Policy Compliance (§7)

S1.38.3 numbers are accepted as authoritative and were **not** re-derived:

| Gate | S1.38.3 accepted evidence | Re-run in S1.38.4? |
|---|---|---|
| API integration | 1584 / 1584, exit 0 | No |
| API unit | 2326 / 2326 | No |
| Real Redis | 33 / 33 | No |
| Web | 55 / 55 | No |
| Flutter | 137 / 137 | No |
| Migrations 0064/0065 | 45 / 45 | No |

No **new defect** requiring a further test cycle was identified by inspection. R-1 is a
behavioral acknowledgement requiring owner sign-off, not a test gap; R-2…R-6 are staging-policy
risks that are fully addressable without running anything. Accordingly, **no authorization for
another substantial test cycle is requested.**

The only evidence-related caveat is arithmetic, not quality: the S1.38.3 headline counts include
9 untracked files from two non-Phase-1 workstreams (51 integration + 22 unit tests). See R-5.

## J. Deliverables Produced (§8)

1. `docs/production/OTP-S1.38.4-RELEASE-PREPARATION-REPORT.md` — this document
2. `docs/production/OTP-S1.38.4-COMMIT-FILE-REGISTER.md` — exact path-level staging register
3. `docs/production/OTP-S1.38.4-SECURITY-AND-CHANGESET-REVIEW.md` — security + diff review findings

## K. Final Verdict (§9)

# CONDITIONALLY READY — SPECIFIC ITEMS REQUIRE REVIEW

The Phase 1 implementation itself is complete, in-scope, secret-free, and debug-free across all
45 tracked diffs and all 6 new Phase 1 test files. Both candidate CI breakers were cleared
(generated `openapi.json` is gitignored and CI-regenerated; `OTP_MOCK_ENABLED` is self-provisioned
by tests, so CI needs no new environment variable). The verdict is conditional on exactly three
items, none of which requires new code:

1. **R-1** — owner must acknowledge the `purpose`-field removal as an intentional breaking change.
2. **R-2 / R-3 / R-4** — owner must stage the mandatory-atomicity pairs listed in the register.
3. **R-5 / R-6** — owner must accept the expected CI counts (1546 integration / 2304 unit) and
   stage by explicit path only, never `git add -A`.

**None of the conditions is a defect in the Phase 1 implementation.** R-10 and R-11 are
pre-existing repository-hygiene findings (a committed-but-expired JWT and 1,277 tracked scratch
files) surfaced by the §4 scan; they are unrelated to this milestone, cannot enter this commit
because both files are clean in the working tree, and are recorded for the owner's backlog rather
than raised as blockers.

## L. Explicit Non-Claims

This session did **not** commit, push, open a PR, merge, run remote CI, deploy, or execute any
migration against staging or production. All staging and commit actions in the register are
**proposals awaiting owner authorization**.
