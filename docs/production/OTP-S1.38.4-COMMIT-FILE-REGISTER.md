# OTP-S1.38.4-COMMIT-FILE-REGISTER.md

**Task:** S1.38.4 — Phase 1 Release Preparation and Commit Readiness (§6 deliverable)  
**Date:** 2026-11-02  
**Branch:** feat/auth-email-otp-phase1  
**Baseline HEAD:** c3c0047e0c686525abb205ed3066c78a16765237  
**Index state at capture:** clean — 0 staged files  
**Status:** PROPOSAL ONLY. **No file was staged or committed by this session.**

---

## A. How to use this register

Every path below is listed exactly as Git reports it. Stage **only by explicit path** and never
with a blanket form:

```
# FORBIDDEN for this release (would sweep up .vitest-*.json, .m73b6-scratch/, .qoder/,
# .audit-scratch/, infra/audit/ and all P13 files - none of which are gitignored):
#   git add -A        git add .        git add --all        git commit -a

# REQUIRED form:
git add <exact-path> [<exact-path> ...]
```

Verification commands the owner should run **after** staging and **before** committing:

```
git diff --cached --name-only    # must equal the path lists below, byte-for-byte
git diff --cached --stat         # must equal the group totals in "Group totals"
git status --porcelain           # every remaining line must be an exclusion from section E
git diff --cached --name-only | Measure-Object -Line   # expect 77 once section E docs are added
```

---

## B. Files already in HEAD — do NOT re-stage

`git ls-files` proves these Phase 1 artifacts were committed in `5581e6a`
("feat(auth): S1.37 audited Phase 1 email-first identity and email OTP") and are unmodified in the
working tree. They are part of the release already and are correctly absent from `git status`:

| Path | Note |
|---|---|
| `infra/drizzle/migrations/0064_email_identity.sql` | migration 0064, tracked & clean |
| `apps/api/src/modules/identity/auth.controller.ts` | 6 email-OTP / linking endpoints |
| `apps/api/src/modules/notifications/providers/smtp-email.provider.ts` | Nodemailer provider |
| `apps/api/src/modules/notifications/providers/provider.interface.ts` | email channel types |
| `apps/api/src/modules/notifications/providers/provider.config.ts` | provider wiring |
| `apps/api/src/modules/notifications/otp-delivery.service.ts` | delivery dispatch |
| `apps/api/src/modules/notifications/notifications.module.ts` | module registration |
| `apps/api/src/common/env-gate.ts` | env gating helper |
| `apps/api/scripts/assert-redis-suite.mjs` | CI Redis gate |
| `apps/api/package.json`, `pnpm-lock.yaml` | `nodemailer` dependency |

**Consequence for the commit message:** this commit is the S1.38.x **delta on top of an already
committed Phase 1 base**, not the whole of Phase 1. The proposed messages in §D say so explicitly.

---

## C. Proposed Phase 1 commit file list (77 files)

### Group A — Phase 1 production code (23 tracked-modified)

#### A1. API / contracts / env template (9)

| # | Path | +/− | What changed |
|---|---|---|---|
| 1 | `.env.example` | +4 / −0 | adds `OTP_MOCK_ENABLED=true` with the F-10 opt-in comment block |
| 2 | `apps/api/src/common/utils/email-normalization.ts` | +40 / −3 | HMAC-SHA256 `hashIdentifier(identifier, secret, type)` with domain separation; `v2:` prefix; legacy `hashEmail` retained as v1 |
| 3 | `apps/api/src/modules/identity/dto/auth.dto.ts` | +2 / −14 | removes the 12-line `purpose` `@ApiPropertyOptional` block (closes F-10b); rewords `LinkEmailDto` docs |
| 4 | `apps/api/src/modules/identity/identity.schema.ts` | +7 / −5 | `identifierHash` `varchar(64)`→`varchar(68)`; adds `hashVersion: integer('hash_version').notNull().default(2)`; adds `integer` import |
| 5 | `apps/api/src/modules/identity/identity.service.ts` | +8 / −8 | all 8 audit/hash call sites migrated to `hashIdentifier(..., 'email'\|'phone')` |
| 6 | `apps/api/src/modules/merchant/merchant.service.ts` | +1 / −1 | `buyerPhone: string \| null` — required by nullable-phone schema |
| 7 | `apps/api/src/modules/notifications/provider-registry.service.ts` | +13 / −3 | F-10 fail-closed mock selection: requires `OTP_MOCK_ENABLED=true` **and** `NODE_ENV` ∈ {development, test}; refuses with a hard-boundary warning otherwise |
| 8 | `apps/api/src/modules/notifications/providers/mock.provider.ts` | +12 / −1 | mock provider guard + captured-output accessors for tests |
| 9 | `packages/contracts/src/index.ts` | +0 / −1 | deletes `purpose: z.string().max(32).optional()` from `EmailOtpRequestSchema` |

#### A2. Web production (7)

| # | Path | +/− | What changed |
|---|---|---|---|
| 10 | `apps/web/src/app/account/page.tsx` | +209 / −2 | email OTP state, linked-identifier panel, link/unlink actions |
| 11 | `apps/web/src/app/auth/login/page.tsx` | +123 / −3 | email-first login + OTP step, channel selector |
| 12 | `apps/web/src/app/merchant/organization/page.tsx` | +2 / −2 | `{user.phone || '—'}` nullable rendering |
| 13 | `apps/web/src/components/AuthCard.tsx` | +1 / −1 | `user.fullName \|\| user.phone \|\| user.email` identity fallback |
| 14 | `apps/web/src/components/Navbar.tsx` | +2 / −2 | same email-first identity fallback |
| 15 | `apps/web/src/lib/auth.ts` | +140 / −0 | `requestEmailOtp` / `verifyEmailOtp` / linking client functions |
| 16 | `apps/web/src/lib/buyer-api.ts` | +2 / −1 | `phone: string \| null` type alignment |

#### A3. Flutter production (7)

| # | Path | +/− | What changed |
|---|---|---|---|
| 17 | `mobile/lib/models/models.dart` | +13 / −5 | nullable phone, email fields on identity models |
| 18 | `mobile/lib/providers/providers.dart` | +23 / −0 | email OTP + linking providers, logout state cleanup |
| 19 | `mobile/lib/screens/auth/login_screen.dart` | +185 / −8 | email OTP request/verify UI flow |
| 20 | `mobile/lib/screens/home/home_screen.dart` | +10 / −2 | `displayIdentifier` = phone → email fallback |
| 21 | `mobile/lib/screens/merchant/merchant_registration_screen.dart` | +2 / −1 | `if (profile == null \|\| profile.phone == null)` nullable guard |
| 22 | `mobile/lib/screens/profile/profile_screen.dart` | +366 / −4 | account link/unlink UI, logout cleanup |
| 23 | `mobile/lib/services/api_service.dart` | +49 / −0 | email OTP + linking endpoints client |

**Group A total: 23 files, +1214 / −67.**

### Group B — Phase 1 tests, modified tracked files (9)

| # | Path | +/− | What changed |
|---|---|---|---|
| 24 | `apps/api/src/__tests__/integration/account-linking.postgres.spec.ts` | +4 / −3 | linking assertions aligned to `hashIdentifier` |
| 25 | `apps/api/src/__tests__/integration/email-otp-e2e.postgres.spec.ts` | +3 / −3 | e2e aligned to HMAC v2 |
| 26 | `apps/api/src/__tests__/integration/email-otp-security.postgres.spec.ts` | +33 / −7 | `identifier_hash` length 64→67 assertions; mock guard rewired to set/delete `OTP_MOCK_ENABLED` and expect `/REFUSED/` |
| 27 | `apps/api/src/__tests__/integration/migration-0064-email-identity.postgres.spec.ts` | +4 / −1 | adds `MIGRATION_0065` constant and co-exclusion so 0064 is tested in isolation — **couples to Group C** |
| 28 | `apps/api/src/__tests__/unit/identity/account-linking.spec.ts` | +3 / −3 | HMAC mock alignment |
| 29 | `apps/api/src/__tests__/unit/identity/auth-dto.spec.ts` | +7 / −6 | drops `purpose` assertions |
| 30 | `apps/api/src/__tests__/unit/identity/email-normalization.spec.ts` | +48 / −2 | `hashIdentifier` domain-separation / v2-prefix tests |
| 31 | `apps/api/src/__tests__/unit/notifications/mock-provider.spec.ts` | +36 / −12 | opt-in gate behaviour |
| 32 | `apps/api/src/__tests__/unit/notifications/provider-registry.spec.ts` | +81 / −2 | F-10 fail-closed matrix (8 cases) |

**Group B total: 9 files, +219 / −39.**

### Group B2 — Phase 1 tests, NEW untracked files (6)

| # | Path | Bytes | Note |
|---|---|---|---|
| 33 | `apps/api/src/__tests__/integration/migration-0065-hmac-hash.postgres.spec.ts` | 12,599 | 13 tests; reads the 0065 SQL (L122) and the Drizzle schema text (L296) as a SQL↔schema drift guard |
| 34 | `apps/web/src/__tests__/account-linking.test.tsx` | 19,087 | Web linking flow unit tests |
| 35 | `apps/web/src/__tests__/email-otp-login.test.tsx` | 14,042 | Web email OTP login tests |
| 36 | `mobile/test/screens/login_screen_email_otp_test.dart` | 13,958 | depends on file 38 |
| 37 | `mobile/test/screens/profile_screen_linking_test.dart` | 15,360 | depends on file 38 |
| 38 | `mobile/test/screens/widget_test_harness.dart` | 18,671 | **shared harness imported by 36 and 37** |

**Group B2 total: 6 files, 93,725 bytes.**

### Group C — migration 0065 (1)

| # | Path | Bytes | Note |
|---|---|---|---|
| 39 | `infra/drizzle/migrations/0065_hmac_identifier_hash.sql` | 1,467 | 3 steps: widen `identifier_hash` to `varchar(68)`; `ADD COLUMN hash_version integer NOT NULL DEFAULT 2`; `UPDATE … SET hash_version = 1` backfill. No `BEGIN`/`COMMIT` → complies with the runner transaction contract |

#### C.1 MANDATORY ATOMICITY RULES — hard blockers on partial staging

| Rule | Why | Verification source |
|---|---|---|
| **0065 SQL (39) ⇔ `identity.schema.ts` (4) must be in the same commit** | the tracked schema now declares `varchar(68)` + `hash_version`; without the SQL, CI and every deploy have schema/DB drift | `git diff HEAD -- apps/api/src/modules/identity/identity.schema.ts` |
| **0065 SQL (39) ⇔ `migration-0064` spec (27) must be in the same commit** | file 27 L34 hard-codes `const MIGRATION_0065 = '0065_hmac_identifier_hash.sql';` and L39 uses it in `alsoExclude`; if the SQL is missing, that **tracked** file references a file CI never receives | `.m73b6-scratch/s1384/risks.txt` |
| **0065 spec (33) ⇔ 0065 SQL (39)** | file 33 `fs.readFileSync(path.join(MIGRATIONS_DIR, MIGRATION_0065))` | `migration-0065-hmac-hash.postgres.spec.ts` L122 |
| **`widget_test_harness.dart` (38) ⇔ both Flutter screen tests (36, 37)** | 36 and 37 import the harness by relative path; committing tests without it fails `flutter test` on CI | `importclosure.cjs` output |

**Import-closure proof** — `node .m73b6-scratch/s1384/importclosure.cjs` (re-run this session, exit 0):

```
CLOSED: every relative import in the new Phase 1 test files resolves to a tracked or proposed-commit file.

--- existence check for referenced non-relative assets ---
infra/drizzle/migrations/0065_hmac_identifier_hash.sql: tracked=false exists=true
apps/api/scripts/assert-redis-suite.mjs: tracked=true exists=true
apps/api/scripts/check-redis.mjs: tracked=false exists=true
```

### Group D — S1.38.3 integration-gate stabilization, test-infra only (5)

No production behavior is changed by this group; each entry is a scoped timeout or a
timing-methodology fix that was required to get `test:integration` to exit 0.

| # | Path | +/− | Change |
|---|---|---|---|
| 40 | `apps/api/src/__tests__/integration/m73b4-delivery-exceptions.postgres.spec.ts` | +5 / −1 | F1: per-test `}, 30_000)` on B4-PG-03 with S1.38.3 rationale comment |
| 41 | `apps/api/src/__tests__/integration/p12-independent-runtime-verification.postgres.spec.ts` | +9 / −1 | F2: per-test 30 s on the §26 dynamic OrdersModule/PaymentsModule import |
| 42 | `apps/api/src/__tests__/integration/p8-import-hardening.postgres.spec.ts` | +3 / −1 | per-test `}, 30_000); // S1.15: …` on CT-10 50-iteration race loop |
| 43 | `apps/api/src/__tests__/unit/shipping/webhook-rate-limiting.spec.ts` | +4 / −1 | per-test `}, 15_000); // S1.6: …` |
| 44 | `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` | +24 / −6 | F3: bcrypt seed cost 10 → **12** to match `getUnknownUserPasswordHash()`, plus median-of-3 sampling for the enumeration-resistance ratio |

**Group D total: 5 files, +45 / −10.**

> Note on file 44: raising the seed cost to 12 makes the test's *timing methodology* sound but is
> load-sensitive; it is the artifact that produced the S1.38.3 1584/1584 exit-0 evidence and must
> therefore travel with the release, not be left behind.

### Group E — Phase 1 documentation (30 untracked + 3 new this session)

| # | Path |
|---|---|
| 45 | `docs/production/OTP-S1.33-STAGING-READINESS-REPORT.md` |
| 46 | `docs/production/OTP-S1.34-MULTI-CHANNEL-AUTH-ARCHITECTURE-ASSESSMENT.md` |
| 47 | `docs/production/OTP-S1.34-MULTI-CHANNEL-AUTH-IMPLEMENTATION-ROADMAP.md` |
| 48 | `docs/production/OTP-S1.34-MULTI-CHANNEL-AUTH-SECURITY-AND-RELEASE-GATES.md` |
| 49 | `docs/production/OTP-S1.34-MULTI-CHANNEL-AUTH-TARGET-ARCHITECTURE.md` |
| 50 | `docs/production/OTP-S1.34.1-CORRECTION-AND-APPROVAL-REPORT.md` |
| 51 | `docs/production/OTP-S1.38-EXECUTION-REPORT.md` |
| 52 | `docs/production/OTP-S1.38.1-EXECUTION-REPORT.md` |
| 53 | `docs/production/OTP-S1.38.1-FINAL-FINDINGS-REGISTER.md` |
| 54 | `docs/production/OTP-S1.38.1-FLUTTER-CLIENT-TEST-REPORT.md` |
| 55 | `docs/production/OTP-S1.38.1-INDEPENDENT-VERIFICATION-REPORT.md` |
| 56 | `docs/production/OTP-S1.38.1-MIGRATION-VERIFICATION-REPORT.md` |
| 57 | `docs/production/OTP-S1.38.1-PHASE-1-ACCEPTANCE-RECOMMENDATION.md` |
| 58 | `docs/production/OTP-S1.38.1-SECURITY-AND-CONCURRENCY-REPORT.md` |
| 59 | `docs/production/OTP-S1.38.1-WEB-CLIENT-TEST-REPORT.md` |
| 60 | `docs/production/OTP-S1.38.2-CI-VERIFICATION-REPORT.md` |
| 61 | `docs/production/OTP-S1.38.2-EXECUTION-REPORT.md` |
| 62 | `docs/production/OTP-S1.38.2-FINAL-FINDINGS-REGISTER.md` |
| 63 | `docs/production/OTP-S1.38.2-FLUTTER-TEST-REPORT.md` |
| 64 | `docs/production/OTP-S1.38.2-FULL-INTEGRATION-REPORT.md` |
| 65 | `docs/production/OTP-S1.38.2-PHASE-1-CLOSURE-RECOMMENDATION.md` |
| 66 | `docs/production/OTP-S1.38.2-REAL-REDIS-VERIFICATION.md` |
| 67 | `docs/production/OTP-S1.38.2-SECURITY-REGRESSION-REPORT.md` |
| 68 | `docs/production/OTP-S1.38.2-WEB-TEST-REPORT.md` |
| 69 | `docs/production/OTP-S1.38.3-EXECUTION-REPORT.md` |
| 70 | `docs/production/OTP-S1.38.3-FINAL-FINDINGS-REGISTER.md` |
| 71 | `docs/production/OTP-S1.38.3-FULL-VERIFICATION-REPORT.md` |
| 72 | `docs/production/OTP-S1.38.3-INTEGRATION-FAILURE-ANALYSIS.md` |
| 73 | `docs/production/OTP-S1.38.3-PHASE-1-CLOSURE-RECOMMENDATION.md` |
| 74 | `docs/production/OTP-S1.38.3-REPORT-RECONCILIATION.md` |
| 75–77 | `docs/production/OTP-S1.38.4-RELEASE-PREPARATION-REPORT.md`, `OTP-S1.38.4-COMMIT-FILE-REGISTER.md`, `OTP-S1.38.4-SECURITY-AND-CHANGESET-REVIEW.md` (this session) |

**Group E total: 33 files.**

> **Addendum note.** The S1.38.2 "append-only addenda" written during S1.38.3 live **inside** files
> 60–68 (those reports are themselves still untracked), so no additional modified-doc entry exists.
> `git status` shows **no `M` entry under `docs/production/OTP-*`**, which confirms this.

### Group totals

| Group | Files | Line delta (tracked part) | Byte size (new files) |
|---|---|---|---|
| A — production code | 23 | +1214 / −67 | — |
| B — Phase 1 tests, modified | 9 | +219 / −39 | — |
| D — gate stabilization | 5 | +45 / −10 | — |
| **Sub-total, tracked-modified in the commit** | **37** | **+1478 / −116** | — |
| B2 — Phase 1 tests, new | 6 | — | 93,717 |
| C — migration 0065 | 1 | — | 1,467 |
| E — documentation | 33 (30 untracked + 3 written by S1.38.4) | — | — |
| **Total commit set** | **77** | **+1478 / −116** | **95,184** |
| Unrelated (must NOT be staged) | 8 tracked-modified | +544 / −425 | — |
| **Cross-check vs `git diff --numstat HEAD`** | **45** | **+2022 / −541** ✓ | |

**Arithmetic and classification proof** — produced by
`node .m73b6-scratch/s1384/sums.cjs` (re-run this session, exit 0), which loads
`git diff --numstat HEAD` and validates the group assignment:

```
A {"n":23,"add":1214,"rem":67,"miss":[]}
B {"n":9,"add":219,"rem":39,"miss":[]}
D {"n":5,"add":45,"rem":10,"miss":[]}
U {"n":8,"add":544,"rem":425,"miss":[]}
ALL TRACKED-MODIFIED files=45 {"add":2022,"rem":541}
UNASSIGNED tracked-modified paths: NONE
overlap Phase1/unrelated: NONE
A+B+D count = 37, unrelated = 8, total = 45
```

`miss":[]` on all four groups means every path in this register exists in the real diff, and
`UNASSIGNED … NONE` means **no tracked-modified file is unclassified**. `overlap … NONE` means no
file is claimed by both the commit set and the exclusion list. Commit-set arithmetic:
`37 + 7 new + 33 docs = 77`, and `1478 + 544 = 2022`, `116 + 425 = 541` reconcile to the whole tree.

---

## D. Recommended commit grouping and proposed messages

Four commits keep the release reviewable and each independently revertable. Group E can be a
fifth docs-only commit if the owner prefers doc separation.

### Commit 1 — Phase 1 core (Groups A + B + C + B2 = 39 files)

Mandatory: `0065_hmac_identifier_hash.sql` travels with `identity.schema.ts` and both migration
specs (rules C.1).

```
feat(auth): S1.38 email-first identity hardening on the committed S1.37 Phase 1 base

Applies the S1.38 / S1.38.1 / S1.38.2 / S1.38.3 findings to the Phase 1 email-first
identity and email OTP flow that was committed in 5581e6a. This commit is the delta,
not the whole of Phase 1.

HMAC identifier hashing (closes F-10/F-10b hardening chain):
- email-normalization.ts: hashIdentifier(identifier, secret, type) with domain
  separation and an explicit v2: prefix; legacy unsalted SHA-256 retained as v1.
- identity.service.ts: all 8 audit call sites migrated (email_otp login, password
  OTP challenge, trusted-device login, link/unlink email, link/unlink phone).
- migration 0065_hmac_identifier_hash.sql: widens identifier_hash to varchar(68),
  adds hash_version (default 2) and backfills existing rows as v1. Ships atomically
  with identity.schema.ts so schema and DB cannot drift.

Fail-closed mock provider (closes F-10):
- provider-registry.service.ts: mock requires BOTH OTP_MOCK_ENABLED=true AND
  NODE_ENV in {development, test}. An absent NODE_ENV no longer defaults to
  development; a non-dev/test opt-in is refused with a hard-boundary warning.
- .env.example: documents the opt-in and states it must never be set in
  staging/production.

Nullable phone identity fallout:
- merchant.service.ts buyerPhone: string | null; web buyer-api.ts, AuthCard.tsx,
  Navbar.tsx, merchant/organization/page.tsx; Flutter models.dart, home_screen
  displayIdentifier fallback, merchant_registration_screen null guard.

Client flows:
- web: email OTP login + account link/unlink (login/page.tsx, account/page.tsx,
  lib/auth.ts).
- flutter: email OTP login, profile linking, logout state cleanup
  (login_screen.dart, profile_screen.dart, api_service.dart, providers.dart).

Contract:
- removes purpose from EmailOtpRequestSchema and auth.dto.ts. Because main.ts runs
  the global ValidationPipe with whitelist + forbidNonWhitelisted, clients still
  sending purpose now receive HTTP 400 instead of silent acceptance. Intentional
  closure of S1.37 finding F-10b.

Tests: 9 modified suites realigned, plus migration-0065-hmac-hash (13 tests),
2 web tests, 3 flutter screen tests incl. the shared widget_test_harness.dart.

Local verification evidence: S1.38.3 (integration 1584/1584 exit 0, unit 2326/2326,
real Redis 33/33, web 55/55, flutter 137/137, migrations 0064+0065 45/45).
Not executed against staging or production in this change.
```

### Commit 2 — test-infrastructure gate stabilization (Group D = 5 files)

```
test(api): S1.38.3 stabilize the integration gate to exit 0

Three timing defects prevented the canonical full integration command from exiting 0.
No production behavior changes.

- m73b4-delivery-exceptions B4-PG-03 and p12 §26 dynamic module import: explicit
  per-test 30,000 ms timeouts with rationale comments. Vitest's 5,000 ms default was
  exceeded by legitimate serial workload; the global testTimeout was deliberately
  NOT raised and no assertion was weakened.
- p8 CT-10 (50-iteration cancel-vs-processing race) and webhook-rate-limiting: the
  same scoped-timeout pattern, carrying the pre-existing S1.15 / S1.6 labels.
- password-login-regression: the enumeration-resistance ratio test seeded bcrypt at
  cost 10 while the production path hashes the dummy user at cost 12. Raised the seed
  to cost 12 and switched the ratio to median-of-3 sampling; a single sample reached
  ratio 4.67 under full-suite load despite the invariant holding.
```

### Commit 3 — Phase 1 documentation (Group E = 33 files)

```
docs(auth): S1.33–S1.38.4 Phase 1 email OTP verification and release evidence

Adds the S1.33 staging readiness, S1.34 multi-channel architecture assessment, and the
S1.38 / S1.38.1 / S1.38.2 / S1.38.3 / S1.38.4 execution, verification, findings,
migration, security, real-Redis, web, flutter, CI and closure reports.

S1.38.2 reports carry append-only S1.38.3 addenda correcting superseded statements; the
S1.38.3 REPORT-RECONCILIATION document records which earlier claims were withdrawn.
No source or migration file is modified by this commit.
```

### Commit-order constraint

Commit 1 **must precede or accompany** Commit 2 in any push, because S1.38.3's exit-0 evidence is
the combination of both; pushing Commit 1 alone reproduces the two timeout failures. Commit 3 is
independent.

---

## E. Files that must remain UNTOUCHED (do not stage)

### E.1 P13 OQ-04 Option C workstream — 45 paths

| Path(s) | Reason |
|---|---|
| `apps/api/src/modules/returns/commission-reversal.service.ts` (+157/−94) | P13 Phase A "OQ-04 Option C" finance logic. Every added-line grep hits `OQ-04`/`Option C`; zero email/OTP/identity hits. **HEAD still carries Option A** — mixing it into an auth commit would make an unauthorized financial-behavior change ride along |
| `apps/api/src/modules/returns/returns.service.ts` (+47/−7) | same workstream (ESCALATED + Option C adjustments) |
| `docs/production/P13-BUSINESS-APPROVAL-TRACKING-REGISTER-v2.xlsx` (binary) | P13 governance artifact; diff shows no line stats (binary) |
| `docs/production/P13-NEXT-STEP-STAKEHOLDER-COMMUNICATIONS.md` (+2/−0) | P13 governance |
| `docs/production/P13-PHASE-0-APPROVAL-AGENDA-v2.md` (+2/−0) | P13 governance |
| `docs/production/P13-PHASE-0-APPROVAL-EVIDENCE-INTAKE-AND-GATE-REASSESSMENT.md` (+5/−1) | P13 governance |
| `docs/production/P13-PHASE-4.1.17-GOVERNANCE-DECISION-REGISTER.md` (+9/−1) | P13 governance |
| 33 untracked `docs/production/P13-PHASE-A*.md` / `P13-D03-*` / `P13-GOVERNANCE-*` / `P13-STAKEHOLDER-*` | P13 evidence chain, separate approval track |
| `apps/api/src/__tests__/integration/p13a-oq04-option-c-commission.postgres.spec.ts` (11 tests) | P13 tests |
| `apps/api/src/__tests__/integration/p13a1-oq04-verification.postgres.spec.ts` (6) | P13 tests |
| `apps/api/src/__tests__/integration/p13a2-oq04-concurrency-workflow.postgres.spec.ts` (7) | P13 tests |
| `apps/api/src/__tests__/integration/p13a2-oq04-workflow.postgres.spec.ts` (2) | P13 tests |
| `apps/api/src/__tests__/integration/p13a3-oq04-reconciliation-audit.postgres.spec.ts` (12) | P13 tests |

**Governance note:** leaving these unstaged means P13 gate **G-03** stays only partially satisfied
on committed code (its commission-reversal leg exists only in the working tree). That is a
**separate owner decision** and must not be resolved silently inside a Phase 1 auth commit.

### E.2 SCS-OTP S1.x foundation / proxy / throttler — 44 paths

| Path(s) | Reason |
|---|---|
| `apps/api/src/__tests__/unit/common/proxy-trust-behavior.spec.ts` (8 tests) | S1.10 proxy-topology line, not email Phase 1 |
| `apps/api/src/__tests__/unit/common/proxy-topology-cloudflare-chain.spec.ts` (7) | ditto |
| `apps/api/src/__tests__/unit/common/redis-throttler-storage.spec.ts` (7) | S1.7/S1.4 throttling line |
| 37 untracked `docs/production/SCS-OTP-S1.*.md` + `SCS-OTP-SECURITY-REMEDIATION-REPORT.md` + `SCS-OTP-WHATSAPP-SMS-*.md` | the preceding S1.x WhatsApp/SMS OTP milestone and its own audit trail |
| `docs/production/SCS-STAGING-*.md` (3 files) | staging-infrastructure audit line |
| `infra/deploy/nginx.conf.template` | its own header states: *"NON-PRODUCTION TEMPLATE — SCS-OTP-S1.10 … NOT referenced from any Dockerfile, docker-compose file, or CI workflow … must not be activated in production"* |

### E.3 Generated / disposable / IDE artifacts — proposed exclusions

**Nothing was deleted.** These are proposed *exclusions from staging* only:

| Path | Classification | Reason for exclusion |
|---|---|---|
| `apps/api/.vitest-integration-results.json`, `.vitest-unit-results.json`, `.vitest-redis-results.json` | generated test output | `git check-ignore` confirms **not** ignored; Vitest `--outputFile` artifacts, overwritten by every run — commit history must not contain them |
| `.m73b6-scratch/` (48 entries + `s1384/`) | disposable session scratch | investigation scripts, logs, Redis `INFO`/`COMMANDSTATS` before/after dumps, commit-message drafts, `.tar` archive, per-file diffs |
| `.audit-scratch/` (118 files) | disposable audit scratch | P13 audit working dumps |
| `.qoder/` (4 files: `canvases/phase1-email-otp-completion.canvas.tsx` + `.status.json`, `plans/S1.2_*.md`, `plans/S1.35_*.md`) | IDE-local state | editor artifacts, not repository content |
| `infra/audit/p13a3-oq04-reconciliation-audit.sql` | P13 scratch SQL | P13 workstream, and unreviewed SQL does not belong in `infra/` |
| `docs/production/SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html` (+322/−322) | unrelated doc | B2B framework workstream, whole-file rewrite; also **still claims "Migrations 0001–0063; latest 0063"**, which contradicts 0064/0065 — correct it in its own workstream, do not smuggle it into this release |
| `apps/api/scripts/check-redis.mjs` | dead disposable probe script | `git grep` finds **no** caller; the S1.37 audit docs already label it "unused probe … referenced by nothing". Excluding it is safe. If the owner wants it retained, that is a separate chore commit |

### E.4 Files intentionally NOT in the register

| Path | Why absent |
|---|---|
| `apps/api/src/__tests__/integration/account-linking.spec.ts` | **does not exist** — referenced under that name in an older S1.35-era report; the real file is `account-linking.postgres.spec.ts` (entry 24). Recorded as a documentation inconsistency |
| `packages/contracts/openapi/openapi.json` | generated; `.gitignore` L65 excludes it and CI regenerates it via `pnpm contracts:build` + `pnpm contracts:generate` (`.github/workflows/ci.yml` L255-256) |

---

## F. Expected CI test counts after a Phase-1-only commit — READ BEFORE TRIAGING CI

`node .m73b6-scratch/s1384/closure.cjs` reconciled the S1.38.3 result JSONs against
`git ls-files`, exit 0:

```
===== INTEGRATION (apps/api/.vitest-integration-results.json) =====
totalFiles=81 totalTests=1584
UNTRACKED files contributing to this count: 6 files, 51 tests
    13  apps/api/src/__tests__/integration/migration-0065-hmac-hash.postgres.spec.ts
    12  apps/api/src/__tests__/integration/p13a3-oq04-reconciliation-audit.postgres.spec.ts
    11  apps/api/src/__tests__/integration/p13a-oq04-option-c-commission.postgres.spec.ts
     7  apps/api/src/__tests__/integration/p13a2-oq04-concurrency-workflow.postgres.spec.ts
     6  apps/api/src/__tests__/integration/p13a1-oq04-verification.postgres.spec.ts
     2  apps/api/src/__tests__/integration/p13a2-oq04-workflow.postgres.spec.ts
=> tracked-only subtotal: 1533 tests in 75 files

===== UNIT (apps/api/.vitest-unit-results.json) =====
totalFiles=118 totalTests=2326
UNTRACKED files contributing to this count: 3 files, 22 tests
     8  apps/api/src/__tests__/unit/common/proxy-trust-behavior.spec.ts
     7  apps/api/src/__tests__/unit/common/proxy-topology-cloudflare-chain.spec.ts
     7  apps/api/src/__tests__/unit/common/redis-throttler-storage.spec.ts
=> tracked-only subtotal: 2304 tests in 115 files
```

Derivation for the proposed commit set: the integration migration-0065 spec (13 tests) **is** in
the commit (Group B2), while the 5 P13 specs (38 tests) are **not**. Unit: all 3 proxy/throttler
orphans (22 tests) are **not**.

| Gate | S1.38.3 local (whole working tree) | Expected on CI (Phase-1-only commit) | Difference | Explanation |
|---|---|---|---|---|
| API integration files | 81 | **76** | −5 | 5 P13 `p13a*` specs excluded |
| API integration tests | 1584 | **1546** | −38 | same |
| API unit files | 118 | **115** | −3 | 3 `unit/common/proxy-*` / `redis-throttler-storage` specs excluded |
| API unit tests | 2326 | **2304** | −22 | same |
| Real Redis | 33 | 33 | 0 | no Redis-gated file excluded; `assert-redis-suite.mjs` gate unchanged |
| Web tests | 55 | ≥55 | +new | 2 new web test files added to the tracked set |
| Flutter tests | 137 | 137 | 0 | both new screen tests + harness included |

**A CI count below the S1.38.3 headline is expected and is NOT a regression.** Any number lower
than the right-hand column *is* a real signal and must be triaged.

## G. Staging-command sketch (illustrative; owner executes, not this session)

```
git add .env.example \
  apps/api/src/common/utils/email-normalization.ts \
  apps/api/src/modules/identity/dto/auth.dto.ts \
  apps/api/src/modules/identity/identity.schema.ts \
  apps/api/src/modules/identity/identity.service.ts \
  apps/api/src/modules/merchant/merchant.service.ts \
  apps/api/src/modules/notifications/provider-registry.service.ts \
  apps/api/src/modules/notifications/providers/mock.provider.ts \
  packages/contracts/src/index.ts \
  apps/web/src/app/account/page.tsx apps/web/src/app/auth/login/page.tsx \
  apps/web/src/app/merchant/organization/page.tsx \
  apps/web/src/components/AuthCard.tsx apps/web/src/components/Navbar.tsx \
  apps/web/src/lib/auth.ts apps/web/src/lib/buyer-api.ts \
  mobile/lib/models/models.dart mobile/lib/providers/providers.dart \
  mobile/lib/screens/auth/login_screen.dart mobile/lib/screens/home/home_screen.dart \
  mobile/lib/screens/merchant/merchant_registration_screen.dart \
  mobile/lib/screens/profile/profile_screen.dart mobile/lib/services/api_service.dart
# then the 9 modified + 6 new test files, the 0065 SQL, and finally `git diff --cached --name-only`
# must equal the Group A/B/B2/C union exactly.
```

## H. Open items the owner must decide before authorizing the commit

1. **Acknowledge R-1** (HTTP 400 for clients still sending `purpose`) — yes/no, and whether a
   deprecation window or release note is required.
2. Confirm Groups A+B+B2+C are staged **atomically** (rules in §C.1).
3. Accept the §F expected CI counts, or authorize committing the P13 / proxy orphan files
   separately so CI matches the S1.38.3 headline.
4. Decide whether `apps/api/scripts/check-redis.mjs` is deleted, kept as a chore commit, or left
   untracked.
5. Decide on a follow-up change adding `.gitignore` entries for `apps/api/.vitest-*.json`,
   `.m73b6-scratch/`, `.audit-scratch/`, `.qoder/`, `infra/audit/`, plus a `.gitattributes` to
   silence the 5 LF→CRLF warnings.
