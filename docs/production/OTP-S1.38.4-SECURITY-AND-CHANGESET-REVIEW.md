# OTP-S1.38.4-SECURITY-AND-CHANGESET-REVIEW.md

**Task:** S1.38.4 — Phase 1 Release Preparation and Commit Readiness (§3 / §4 / §5 deliverable)  
**Date:** 2026-11-02  
**Branch:** feat/auth-email-otp-phase1  
**Baseline HEAD:** c3c0047e0c686525abb205ed3066c78a16765237  
**Scope reviewed:** 45 tracked-modified files (+2022 / −541), 185 untracked entries, 7 new Phase 1 files, migrations 0064 & 0065  
**Method:** read-only inspection. No test was executed. No file was deleted, staged, or modified.

---

## A. Inspection Instruments

| Instrument | Output retained | Covered §|
|---|---|---|
| `.m73b6-scratch/s1384/diffs.ps1` → 45 per-file `.diff` files | `.m73b6-scratch/s1384/diffs/` | §3 |
| `.m73b6-scratch/s1384/scan.ps1` | `scan.txt` | §4 secrets / debug / disabled tests |
| `.m73b6-scratch/s1384/hygiene.ps1` | `hygiene.txt` | §4 env files, generated files, diff ranking |
| `.m73b6-scratch/s1384/checks.ps1` | `checks.txt` | §4 dotenv inventory, §5 migration content |
| `.m73b6-scratch/s1384/risks.ps1` | `risks.txt` | §3 breaking-change + coupling analysis |
| `.m73b6-scratch/s1384/ci-risk.ps1` | `ci-risk.txt` | §4 generated-file lifecycle, CI gates |
| `.m73b6-scratch/s1384/final-checks.ps1` | `final-checks.txt` | §5 migration ordering & runner contract |
| `.m73b6-scratch/s1384/uiscope.ps1`, `docs.ps1` | `docs.txt` | §3 scope-adherence of UI + docs |
| `node .m73b6-scratch/s1384/closure.cjs` | `closure-out.txt` | §4 test-count attribution |
| `node .m73b6-scratch/s1384/importclosure.cjs` | `importclosure-out.txt` | §4 CI self-containment proof |

## B. Change-Set Review by Required Area (§3)

### B.1 Email-first identity and nullable phone identity

| File | Δ | Finding |
|---|---|---|
| `apps/api/src/modules/identity/identity.schema.ts` | +7/−5 | `identifierHash: varchar('identifier_hash', { length: 64 })` → `{ length: 68 }`; adds `hashVersion: integer('hash_version').notNull().default(2)`; adds the `integer` import. Matches 0065 exactly |
| `apps/api/src/modules/merchant/merchant.service.ts` | +1/−1 | `buyerPhone: string` → `buyerPhone: string \| null` |
| `apps/web/src/lib/buyer-api.ts` | +2/−1 | phone typed nullable |
| `apps/web/src/components/AuthCard.tsx` | +1/−1 | `user.fullName \|\| user.phone \|\| user.email` |
| `apps/web/src/components/Navbar.tsx` | +2/−2 | same fallback chain |
| `apps/web/src/app/merchant/organization/page.tsx` | +2/−2 | `{user.phone \|\| '—'}` |
| `mobile/lib/models/models.dart` | +13/−5 | nullable phone + email on identity models |
| `mobile/lib/screens/home/home_screen.dart` | +10/−2 | `final displayIdentifier = phone.isNotEmpty ? phone : (email ?? profile?.email ?? '');` |
| `mobile/lib/screens/merchant/merchant_registration_screen.dart` | +2/−1 | `if (profile == null \|\| profile.phone == null)` |

**Verdict: complete and internally consistent.** Two files (`merchant.service.ts`,
`merchant_registration_screen.dart`) look off-topic by name but are **required** nullable-phone
fallout, not accidental edits — see §C.

### B.2 Email OTP request and verification

| File | Δ | Finding |
|---|---|---|
| `packages/contracts/src/index.ts` | +0/−1 | **`purpose` removed** from `EmailOtpRequestSchema` (the only change in the file) |
| `apps/api/src/modules/identity/dto/auth.dto.ts` | +2/−14 | **`purpose` property block removed** (12 lines: `@ApiPropertyOptional`, `@IsOptional`, `@IsString`, `@MaxLength(32)`); `LinkEmailDto` doc reworded, closing F-10b |
| `apps/api/src/__tests__/unit/identity/auth-dto.spec.ts` | +7/−6 | DTO assertions aligned |

**Finding SEC-1 (Medium — breaking behavior change).** `apps/api/src/main.ts` L100-101 configures
the global `ValidationPipe` with:

```
whitelist: true,
forbidNonWhitelisted: true,
```

Previously `purpose` was declared, so a client POSTing it was **accepted and ignored** (the deleted
`@ApiPropertyOptional` description literally said *"Informational only: the field is accepted and
ignored … (S1.37 open finding F-10b)"*). After this change, the same request is a non-whitelisted
property → **HTTP 400**. This is the intended closure of F-10b, but it is a live API contract
change that no test in the repository asserts. `git grep` confirms **no first-party client sends
`purpose`** (web, flutter, and contracts are all clean), so the blast radius is external/legacy
callers only. **Requires explicit owner acknowledgement.**

### B.3 OTP challenge lifecycle and security

`apps/api/src/__tests__/integration/email-otp-security.postgres.spec.ts` (+33/−7):

- `identifier_hash` length assertions moved 64 → **67** with a comment (correct: `v2:` + 64 hex =
  67 chars, fitting the `varchar(68)` column).
- Mock-provider guard tests rewired to **set and restore** `process.env['OTP_MOCK_ENABLED']` and to
  expect `/REFUSED/`.

**Verdict: complete.** Finding: the assertion length 67 vs column length 68 is deliberate headroom
(`v2:` + 64 = 67 ≤ 68); the 0065 spec's schema-drift check covers it.

### B.4 SMTP provider and test-only mock provider

| File | Δ | Finding |
|---|---|---|
| `apps/api/src/modules/notifications/provider-registry.service.ts` | +13/−3 | F-10 fail-closed gate (verbatim below) |
| `apps/api/src/modules/notifications/providers/mock.provider.ts` | +12/−1 | `logger.log('MockOtpProvider initialized (development/test with explicit opt-in only)')` + test accessors |
| `.env.example` | +4/0 | documents `OTP_MOCK_ENABLED=true`, states *"NEVER set in staging/production"* |

Actual diff of the security boundary:

```diff
-    const nodeEnv = (process.env['NODE_ENV'] || 'development').trim().toLowerCase();
-    if (nodeEnv === 'development' || nodeEnv === 'test') {
+    // F-10 (S1.38): fail-closed mock provider selection.
+    // Mock requires BOTH a non-production NODE_ENV AND explicit OTP_MOCK_ENABLED=true.
+    // An absent or blank NODE_ENV no longer defaults to 'development' — it fails closed.
+    const nodeEnv = process.env['NODE_ENV']?.trim().toLowerCase();
+    const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
+    const mockOptIn = (process.env['OTP_MOCK_ENABLED'] || '').trim().toLowerCase() === 'true';
+
+    if (isDevOrTest && mockOptIn) {
       …
+    } else if (mockOptIn && !isDevOrTest) {
+      this.logger.warn(
+        `OTP_MOCK_ENABLED=true is set but NODE_ENV="${nodeEnv || 'unset'}" is not development/test. ` +
+        'Mock provider refused — this is a hard security boundary.',
+      );
```

**Security assessment: strict improvement.** Two independent conditions must hold, and the
previously dangerous default (`NODE_ENV` unset ⇒ treated as `development`) is removed. The
`smtp-email.provider.ts` file itself is **unmodified** (committed at `5581e6a`), so no SMTP
credential handling changed in this delta.

**Finding SEC-2 (Cleared).** `OTP_MOCK_ENABLED` is a new required env var for dev/test. Verified
**no CI environment dependency**: `git grep` shows `mock-provider.spec.ts`,
`provider-registry.spec.ts`, and `email-otp-security.postgres.spec.ts` each set/delete
`process.env['OTP_MOCK_ENABLED']` inside the test body and restore it afterwards. CI passes without
adding the variable to `.github/workflows/ci.yml`.

### B.5 Account linking and unlinking

`account-linking.postgres.spec.ts` (+4/−3), `account-linking.spec.ts` (+3/−3),
`account/page.tsx` (+209/−2), `profile_screen.dart` (+366/−4), `lib/auth.ts` (+140/−0).
All deltas align assertions and clients to `hashIdentifier`; no linking **rule** changed
(conflict detection and last-auth-method prevention remain as committed in `5581e6a`).

**Verdict: complete.**

### B.6 HMAC identifier hashing

`apps/api/src/common/utils/email-normalization.ts` (+40/−3) adds:

```ts
export function hashIdentifier(
  identifier: string,
  secret: string,
  type: 'email' | 'phone',
): string
```

producing `v2:` + HMAC-SHA256 over `"${type}:${identifier}"`. The legacy unsalted `hashEmail` is
**retained** with an explicit comment limiting it to backward-compatible audit metadata.

`apps/api/src/modules/identity/identity.service.ts` (+8/−8) — 8 call sites migrated:
`email_otp` login, password OTP challenge, password trusted-device login, LINK EMAIL, LINK PHONE,
UNLINK EMAIL, UNLINK PHONE, plus the import line. **No residual `hashEmail(` call site** remains in
the identity paths that write `identifier_hash`.

**Finding — migration-data note (Low).** Rows written before 0065 carry unsalted SHA-256 hashes.
0065 backfills `hash_version = 1` for all existing `account_link_log` rows rather than re-hashing,
which is the correct choice (a v1 hash cannot be recovered from a one-way hash). The trade-off —
**v1 rows remain exposed to offline rainbow-table attack if the DB leaks** — is inherent to
one-way hashing and is a documented, accepted consequence, not a defect in this change.

### B.7 Migrations 0064 and 0065

See §E. **Verdict: present, correctly ordered, contract-compliant, and 0065 is in the release set.**

### B.8 Web email OTP and account-linking flows

`login/page.tsx` (+123/−3) adds `type LoginMode = 'password' | 'otp' | 'email-otp'` and the OTP
step; `lib/auth.ts` (+140/−0) adds `requestEmailOtp` / `verifyEmailOtp` / linking clients and
`hydrateUserFromProfile(session.accessToken)`; `account/page.tsx` (+209/−2) adds the linking panel.

Scope-adherence scan (`uiscope.ps1`): every UI delta file returns **zero** hits for
`invoice|commission|shipment|cart|catalog|settle|return` while producing 29–111 hits for
email/OTP/link/identity terms. **No unrelated-domain logic leaked into the UI files.**

### B.9 Flutter email OTP, profile linking, logout cleanup

`login_screen.dart` +185/−8, `profile_screen.dart` +366/−4, `api_service.dart` +49/−0,
`providers.dart` +23/−0 (includes logout state cleanup), plus the two nullable-phone guards in §B.1.
New tests: `login_screen_email_otp_test.dart`, `profile_screen_linking_test.dart`, and the shared
`widget_test_harness.dart` (18,671 bytes).

**Finding HYGIENE-5 (Medium — staging).** The harness is untracked and imported by both new tests.
Committing the tests without it breaks `flutter test` on CI. Register rule C.1 binds them together;
`importclosure.cjs` confirms the closure.

### B.10 Tests and test-harness changes

| File | Nature | Classification |
|---|---|---|
| `m73b4-delivery-exceptions.postgres.spec.ts` +5/−1 | `}, 30_000)` on B4-PG-03, S1.38.3 comment | Phase-1-supporting test-infra |
| `p12-independent-runtime-verification.postgres.spec.ts` +9/−1 | scoped timeout on §26 dynamic import | Phase-1-supporting test-infra |
| `p8-import-hardening.postgres.spec.ts` +3/−1 | `}, 30_000); // S1.15: …` | pre-existing label, Phase-1-supporting |
| `webhook-rate-limiting.spec.ts` +4/−1 | `}, 15_000); // S1.6: …` | pre-existing label, Phase-1-supporting |
| `password-login-regression.postgres.spec.ts` +24/−6 | bcrypt seed cost 10→12 + median-of-3 | Phase-1-supporting, methodology fix |

**No global `testTimeout` was raised and no assertion was weakened** — consistent with the accepted
S1.14/S1.15 remediation pattern for this repository.

**Positive security note on file 5 (password-login-regression).** The fix is security-*correcting*:
the enumeration-resistance test previously seeded at cost 10 while production hashes the dummy user
at cost 12, i.e. the test compared unequal work. Matching the cost makes the invariant
meaningfully testable. The new comments record the measured ratio 4.67 that motivated it.

### B.11 Production documentation and historical report addenda

Untracked docs grouped by series (`docs.ps1`):

| Series | Count | Phase 1? |
|---|---|---|
| `OTP-S1.33…OTP-S1.38.3` | **30** | Yes |
| `P13-*` (untracked) | 33 | No |
| `SCS-OTP-S1.x` / `SCS-OTP-*` | 37 | No |
| `SCS-STAGING-*` | 3 | No |
| `SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html` | 1 (modified) | No |

The S1.38.3 append-only addenda to S1.38.2 reports live **inside** the still-untracked S1.38.2
files, which is why `git status` shows no `M` entry for any `docs/production/OTP-*` path.
**Consistent.**

**Finding DOC-1 (Low — documentation inconsistency, unrelated file).** The *modified* B2B report
adds this row verbatim:

```
<tr><td>Migrations</td><td>0001–0063; latest <code>0063_phase4_operational_readiness.sql</code>.
File inventory only; applied staging migrations [REQUIRES VERIFICATION].</td>…
```

That is stale: `infra/drizzle/migrations/` contains 0064 and 0065. Because the file is a
whole-file rewrite (+322/−322) belonging to the B2B workstream, it is **excluded** from the Phase 1
commit and the inconsistency is handed back to its own workstream rather than silently fixed here.

**Finding DOC-2 (Low).** An older S1.35-era report references
`apps/api/src/__tests__/integration/account-linking.spec.ts`, which **does not exist**; the real
file is `account-linking.postgres.spec.ts`. Cosmetic citation error in historical text only.

## C. Accidental and Out-of-Scope Changes (§3 final question)

### C.1 Production files in the tree that are NOT Phase 1

| File | Δ | Owner workstream | Evidence |
|---|---|---|---|
| `apps/api/src/modules/returns/commission-reversal.service.ts` | +157/−94 | P13 OQ-04 Option C | every added-line grep hit is `OQ-04` / `Option C` / lock-order prose; **zero** email/OTP/identity hits |
| `apps/api/src/modules/returns/returns.service.ts` | +47/−7 | P13 OQ-04 Option C | same |

These two are the **only** production-code files in the working tree with no Phase 1 justification.
They must remain unstaged. Note the governance consequence recorded in the register §E.1: HEAD still
carries the Option A reversal logic, so P13 gate G-03's commission-reversal leg stays uncommitted —
a **separate owner decision**, not something to resolve inside an auth commit.

### C.2 Files that look out of scope but are in scope

`merchant.service.ts`, `merchant_registration_screen.dart`, `home_screen.dart`, `AuthCard.tsx`,
`Navbar.tsx`, `merchant/organization/page.tsx`, `buyer-api.ts` — all nullable-identity fallout.
**Retained in the Phase 1 commit.**

### C.3 Incomplete implementation

None found. The HMAC migration is complete at all 8 service call sites and both schema fields
match 0065. The mock opt-in gate is implemented in the registry **and** documented in
`.env.example` **and** tested in 8 registry cases + 3 mock-provider cases.

## D. Security and Repository Hygiene (§4)

### D.1 Secrets, passwords, tokens, SMTP credentials, private keys

`scan.ps1` Section B searched all 45 diffs for added assignments to
`secret|password|key|token`. **Every hit is a test fixture or a prose comment. No real credential,
SMTP password, API key, or private key is introduced.** Enumerated:

| Location | Literal | Assessment |
|---|---|---|
| `apps/api/src/__tests__/integration/account-linking.postgres.spec.ts` | `const HMAC_SECRET = 'dev-hmac-secret-change-me-in-production-64chars-minimum!!';` | test-only fixture; self-describing placeholder; identical string already committed in `.env.example` |
| `apps/api/src/__tests__/unit/identity/email-normalization.spec.ts` | `const TEST_HMAC_SECRET = 'test-secret-at-least-32-characters-long!!';`, `'secret-one-at-least-32-characters!!'`, `'secret-two-at-least-32-characters!!'` | test-only; deliberately distinct secrets to prove key sensitivity |
| `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` | `'AnyPassword123!'`, `'WrongPassword123!'`, `bcrypt.hash(phoneUser.password, 12)` | test seed passwords |
| `apps/api/src/__tests__/integration/email-otp-e2e.postgres.spec.ts` | `hashIdentifier('linktest@example.com', HMAC_SECRET, 'email')` | test fixture identity |
| `apps/api/src/common/utils/email-normalization.ts` | `secret: string,` (parameter) + doc prose | no embedded value |

**Finding SEC-3 (Low — pre-existing, NOT introduced by S1.38).** `.env.example` L19-20 carry
literal dev MinIO values:

```
S3_ACCESS_KEY=scs_minio
S3_SECRET_KEY=scs_minio_2026
```

`git diff HEAD -- .env.example` shows this milestone added **only** the 4 `OTP_MOCK_ENABLED` lines
at L46-50 — the S3 values are pre-existing committed content. Flagged for the owner as a separate
hardening item; **no change proposed here** because §1 forbids modifying environment
configuration.

`.env.example` also carries `OTP_HMAC_SECRET=dev-hmac-secret-change-me-in-production-64chars-minimum!!`
(pre-existing, immediately above the added block) with a comment instructing operators to generate a
unique secret. `infra/deploy/.env.production.example` uses `__REPLACE_ME__` placeholders throughout
— **correct**.

**Finding SEC-4 (Medium — PRE-EXISTING, not introduced by S1.38; no Phase 1 impact).** A real JWT
is committed at the repository root:

| Attribute | Value |
|---|---|
| Path | `test-token.txt` (repo root, **tracked**, 1,499 chars, 3 segments) |
| Introduced by | `e3dcc66` — *"test(data): add sample product data files for testing"* |
| Header | `alg=HS256`, `typ=JWT` |
| Payload claims | `sub=df4c5e84-…`, `activeOrg=55c93c39-…`, `sid=470a0c5f-…`, `jti=5d7d82f0-…`, `role=MERCHANT_OWNER`, `perms=[…]` |
| `iat` / `exp` | 2026-10-07 15:18:05 UTC / **2026-10-07 15:33:05 UTC** |
| Status at inspection | **expired** (now = 2026-11-01 22:01 UTC) ⇒ not a live credential |
| Working-tree state | clean — `git status --porcelain -- test-token.txt` returns nothing, so it **cannot** enter the Phase 1 commit |

Assessment: the token is time-boxed and dead, so there is **no active exposure**. It is nevertheless
a hygiene defect for two reasons: (a) it leaks real-looking account / organization / session
identifiers into the repository history, and (b) it demonstrates that the environment's JWT signing
secret was the committed `.env.example` dev value (SEC-3) at generation time.

Removal safety verified: the only tracked code reference is
`apps/api/src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts` L287-301, which asserts
that **`.dockerignore` contains the string** `'test-token.txt'` (L297) — it does **not** read or
require the file. `.dockerignore` L77 already excludes it. Deleting the file therefore does not
break that test, but removal is a **separate chore commit**, not part of this release (§1 forbids
modifying or deleting artifacts here).

**Other pre-existing tracked root artifacts** (all clean, none enter this commit): `b1-build-output.txt`,
`b1-full-unit-output.txt`, `b1-unit-test-output.txt`, `b1-tsc-output.txt`, `b1-pg-test-output{,2,3,4,5}.txt`,
`b1-migration-test.js`, `b2-cors.json`, `p41-p4suites.json`, `test-errors.xlsx`, `test-valid.csv`,
`test-valid.xlsx`, `.p41-net-probe.mjs` (added by `0671976` *"feat(network): add **temporary** Phase 4.1
npm registry reachability probe"* — `git grep` finds **no** reference to it in any `.ts`, `.yml`, `.json`
or `.dockerignore`). These are committed build/test logs and a temporary probe — i.e. exactly the
class §4 asks about, but they are historical and outside this delta.

### D.2 Real environment files

`git check-ignore -v` results:

| Path | Ignored by | Verdict |
|---|---|---|
| `.env` | `.gitignore` L13 | ✓ safe |
| `.env.local` | `.gitignore` L20 (`.env.*`) | ✓ safe |
| `.env.development` | `.gitignore` L20 | ✓ safe |
| `.env.production` | `.gitignore` L20 | ✓ safe |
| `apps/api/.env` | `.gitignore` L20 | ✓ safe |
| `.env.example` | negated by L21 `!.env.example` | tracked **template**, intentional |
| `infra/deploy/.env.production.example` | negated by L22 `!.env.*.example` | tracked **template**, intentional |

`git ls-files` returns **only those two `*.example` files** as tracked env-ish content (plus copies
buried in `.m73b6-scratch/p418-context/`, which are excluded). **No real env file is at risk of
being committed.** §1 boundary respected — nothing was modified.

### D.3 Temporary logs and test outputs

| Path | Status | Action |
|---|---|---|
| `apps/api/.vitest-integration-results.json` | untracked, **NOT gitignored** | propose exclusion |
| `apps/api/.vitest-unit-results.json` | untracked, **NOT gitignored** | propose exclusion |
| `apps/api/.vitest-redis-results.json` | untracked, **NOT gitignored** | propose exclusion |
| `.m73b6-scratch/` (~48 entries here, `s1384/` incl.) | **partly tracked (1,277 files), partly untracked; NOT gitignored** | propose exclusion of the untracked remainder |
| `.audit-scratch/` (118 files) | untracked, **NOT gitignored** | propose exclusion |
| `.qoder/` (4 files: 2 canvases + 2 plans) | untracked, **NOT gitignored** | propose exclusion |
| `infra/audit/p13a3-oq04-reconciliation-audit.sql` | untracked, **NOT gitignored** | propose exclusion (P13) |
| `b1-*.log/.txt`, `p41-*.log`, `test-*.csv/.xlsx`, `test-token.txt` (repo root) | **do not appear in `git status`** | verified already ignored or removed — no action |

**Finding HYGIENE-1 (Medium).** The five groups above are untracked **and uncovered by
`.gitignore`**, so a `git add -A` would commit them. The task's own prohibition on blanket staging
is therefore *load-bearing*, not merely precautionary. Recommendation (follow-up change, not part
of this release): add `.vitest-*-results.json`, `.m73b6-scratch/`, `.audit-scratch/`, `.qoder/`,
`infra/audit/` to `.gitignore`.

**Finding HYGIENE-3 (Medium — PRE-EXISTING, structural).** `git ls-files -- .m73b6-scratch` returns
**1,277 tracked files** — the scratch directory is *already committed*, including a full repository
snapshot under `.m73b6-scratch/p418-context/` that contains its own copies of `.env.example`,
`.gitignore`, `.dockerignore`, `.nvmrc`, `apps/api/src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts`
and `.github/workflows/ci.yml`. It also contains `p418-archive.tar` and `*.err` / `*.json` CI dumps.

Consequences the owner must know before acting on HYGIENE-1:

1. Adding `.m73b6-scratch/` to `.gitignore` will **not** untrack those 1,277 files — Git ignore rules
   do not apply to already-tracked paths. An explicit `git rm -r --cached .m73b6-scratch` (owner
   decision, **not performed here**, and destructive-adjacent so excluded by §1) would be required.
2. The nested `.m73b6-scratch/p418-context/.env.example` is a **tracked second env template**. It is
   a stale copy, not a secret, but it will confuse any secret-scanning or env-audit tooling.
3. Because the directory is partly tracked and partly untracked, `git status` prints ~48 individual
   `??` entries for it instead of one collapsed entry — which is precisely why the untracked inventory
   in §D of the release report is 185 lines long and easy to sweep into a commit by accident.

The same partially-tracked pattern applies to nothing else: `.audit-scratch/` (118 files), `.qoder/`
(4 files) and `infra/audit/` (1 file) are **wholly untracked**, so they are trivially excluded.

### D.4 Disposable database or Redis artifacts

No dump file, no `*.rdb`, no `appendonly.aof`, no disposable-container compose file appears in the
working tree. Redis evidence from S1.38.2/S1.38.3 lives in `.m73b6-scratch/`
(`p4122-*`, `p4130-*`, `p4140-*` `cmdstats`/`info` before/after dumps) and is excluded under D.3.
`infra/audit/p13a3-oq04-reconciliation-audit.sql` is a P13 audit query dump, excluded.
**Verdict: clean.**

### D.5 Generated files that should not be committed

| Artifact | Verdict |
|---|---|
| `packages/contracts/openapi/openapi.json` | **correctly gitignored** (`.gitignore` L65) and **regenerated in CI** (`.github/workflows/ci.yml` L255-256 run `pnpm contracts:build` then `pnpm contracts:generate`). Not in `git status` ✓ |
| `dist/`, `node_modules/`, `coverage/` | gitignored ✓ |
| `.turbo/cache/*` | present on disk, absent from `git status` → ignored ✓ |
| `.pnpm-store/` | ignored ✓ |

**Finding CI-1 (Cleared).** Because `openapi.json` is generated, the removal of `purpose` from
`EmailOtpRequestSchema` cannot cause an OpenAPI drift failure. Confirmed by reading the gate:
`pnpm contracts:generate`'s structural assertion checks **path names** (including the 6 email routes)
and **component schema names** (`EmailOtpRequest`, …) — it does **not** assert the property set.
`apps/api/src/__tests__/unit/contracts-phase1.openapi.spec.ts` likewise asserts routes + 401/429
responses only. **CI-safe.**

### D.6 Debug code and temporary workarounds

`scan.ps1` Section A searched all added lines for `console.log`, `debugger`, `.only(`, `.skip(`,
`describe.skip`, `it.skip`, `test.skip`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`,
`TODO`, `FIXME`, `HACK`.

**Result: zero hits.** Section C (disabled/skipped tests) likewise returned only prose sentences
containing the word "only" (e.g. *"MockOtpProvider initialized (development/test with explicit
opt-in only)"*, *"activates mock ONLY when NODE_ENV=test AND OTP_MOCK_ENABLED=true"*) — **no test
suppression of any kind**.

Scoped per-test timeouts in Group D are the repository's accepted, evidence-justified remediation
pattern, **not** a temporary workaround: all iterations and assertions were preserved and no global
timeout was changed.

### D.7 CI self-containment of the new test files

Verified by `node .m73b6-scratch/s1384/importclosure.cjs` against `git ls-files` ∪ proposed-new set:

```
CLOSED: every relative import in the new Phase 1 test files resolves to a tracked or proposed-commit file.

--- existence check for referenced non-relative assets ---
infra/drizzle/migrations/0065_hmac_identifier_hash.sql: tracked=false exists=true
apps/api/scripts/assert-redis-suite.mjs: tracked=true exists=true
apps/api/scripts/check-redis.mjs: tracked=false exists=true
```

The two `tracked=false exists=true` lines are the **entire** remaining gap and both are addressed by
the register (0065 SQL is added; `check-redis.mjs` is excluded because no code references it —
`git grep` finds only two S1.37 audit documents describing it as an *"unused probe … referenced by
nothing"*).

### D.8 Cross-file coupling that dictates staging atomicity

| Coupling | Direction | Severity |
|---|---|---|
| tracked-modified `migration-0064-email-identity.postgres.spec.ts` L34 `const MIGRATION_0065 = '0065_hmac_identifier_hash.sql';`, L39 `alsoExclude` | tracked → **untracked** | High — must co-stage the SQL |
| untracked `migration-0065-hmac-hash.postgres.spec.ts` L122 `fs.readFileSync(… MIGRATION_0065)` and L296 Drizzle-schema text drift guard | untracked → SQL + tracked schema | High |
| `identity.schema.ts` (`length: 68`, `hash_version` default 2) ↔ 0065 SQL | code ↔ DDL | High |
| `login_screen_email_otp_test.dart` / `profile_screen_linking_test.dart` → `widget_test_harness.dart` | tracked-after-commit → untracked | Medium |

### D.9 Line-ending hygiene

**Finding HYGIENE-2 (Low).** No `.gitattributes` exists in the repository (`Test-Path .gitattributes`
= False), so Git emits 5 `warning: in the working copy of '<file>', LF will be replaced by CRLF the
next time Git touches it` messages — for `auth-dto.spec.ts`, `auth.dto.ts`, `identity.schema.ts`,
`apps/web/src/app/auth/login/page.tsx`, `AuthCard.tsx`. Cosmetic only (no content change), but it
will recur on every diff. Recommend a `.gitattributes` follow-up, kept out of this release.

## E. Migration Review (§5)

| Check | Result | Evidence |
|---|---|---|
| 0064 present | ✓ | `infra/drizzle/migrations/0064_email_identity.sql` — tracked, unmodified since `5581e6a` |
| 0065 present | ✓ | `infra/drizzle/migrations/0065_hmac_identifier_hash.sql` — 1,467 bytes, **untracked** |
| Prefix sequence | ✓ | directory listing shows 0060…0065 contiguous, zero-padded, no duplicate number |
| Runtime ordering is deterministic | ✓ | `apps/api/infra/drizzle/migrate.ts` L121-123 and `apps/api/infra/drizzle/migrate-pg.ts` L42-44 both use `.readdirSync(MIGRATIONS_DIR).filter(…endsWith('.sql')).sort()`; with fixed-width numeric prefixes lexicographic order equals numeric order ⇒ **0065 provably applies after 0064** |
| Transaction contract | ✓ | 0065 contains **no** `BEGIN` and **no** `COMMIT`. Both runners wrap each file as `BEGIN → execute file → INSERT INTO _migration_log → COMMIT`, and 0064's header states in writing that a migration file *"MUST NOT contain its own BEGIN/COMMIT"*. 0065 complies |
| EXCLUDED set | ✓ | both runners exclude only `0013_analytics.sql` and `0018_analytics_retention.sql`; neither 0064 nor 0065 is excluded |
| Release-set membership | ✓ (conditional) | 0064 already in HEAD; 0065 **must** be added, atomically with `identity.schema.ts` — see §D.8 |
| Manifest to update | n/a | no migration manifest/index file exists in the repo |
| Executed against staging/production | ✗ | prohibited by §1; verification was source-reading only |

**0065 content (verified statement by statement):**

1. `ALTER TABLE … ALTER COLUMN identifier_hash TYPE varchar(68)` — widening, non-destructive.
2. `ALTER TABLE account_link_log ADD COLUMN hash_version integer NOT NULL DEFAULT 2`.
3. `UPDATE account_link_log SET hash_version = 1;` — backfill marking pre-existing rows as legacy.

The file records its own `ACCESS EXCLUSIVE` lock implication and rollback notes. **Operational
note for the owner:** step 1 rewrites the column type, so on a populated production table the
`ALTER` takes an `ACCESS EXCLUSIVE` lock. It is safe on staging/production only with a maintenance
window or after verifying the row count — this is a deploy-planning item, not a code defect, and it
is **out of scope for this commit** because §1 forbids executing the migration.

## F. Findings Register

| ID | Severity | Finding | Recommended action | Blocks commit? |
|---|---|---|---|---|
| SEC-1 | Medium | `purpose` removed while `main.ts` runs `whitelist + forbidNonWhitelisted` ⇒ HTTP 400 for clients still sending it | Owner acknowledgement + release note | **Condition** |
| SEC-2 | — | `OTP_MOCK_ENABLED` needs no CI env change (tests self-provision) | None | No |
| SEC-3 | Low | `.env.example` L19-20 pre-existing dev MinIO values | Separate hardening item; **do not touch in this commit** (§1) | No |
| HYGIENE-1 | Medium | `.vitest-*.json`, `.m73b6-scratch/`, `.audit-scratch/`, `.qoder/`, `infra/audit/` are untracked but **not gitignored** | Explicit-path staging; `.gitignore` follow-up | **Condition** |
| HYGIENE-2 | Low | no `.gitattributes`; 5 LF→CRLF warnings | Follow-up change | No |
| HYGIENE-5 | Medium | `widget_test_harness.dart` untracked and imported by both new Flutter tests | Co-stage (register rule C.1) | **Condition** |
| COUPLE-1 | High | tracked 0064 spec + `identity.schema.ts` depend on untracked 0065 SQL | Co-stage (register rule C.1) | **Condition** |
| RISK-1 | Medium | CI test counts will read 1546/76 integration and 2304/115 unit, not the S1.38.3 headline | Pre-announce expected numbers | **Condition** |
| DOC-1 | Low | modified B2B report still claims "0001–0063; latest 0063" | Correct in the B2B workstream; exclude file from this commit | No |
| DOC-2 | Low | historical doc cites nonexistent `account-linking.spec.ts` | Correct in a docs chore | No |
| OOS-1 | — | `commission-reversal.service.ts` + `returns.service.ts` are P13, not Phase 1 | Leave untouched | No |
| SEC-4 | Medium | **pre-existing** tracked JWT at `test-token.txt` (expired 2026-10-07, `role=MERCHANT_OWNER`, real-looking `sub`/`activeOrg`/`sid`/`jti`), committed in `e3dcc66` | Separate chore: `git rm` + rotate/verify the dev JWT secret. File is clean so it cannot enter this commit | No |
| HYGIENE-3 | Medium | **pre-existing**: 1,277 files under `.m73b6-scratch/` are already tracked, incl. a whole repo snapshot `p418-context/` with its own `.env.example` | Follow-up `git rm -r --cached` + `.gitignore`; note that ignore alone will not untrack them | No |
| DEAD-1 | Low | `apps/api/scripts/check-redis.mjs` unreferenced probe | Exclude from release; owner decides delete vs. chore | No |
| DEAD-2 | Low | temporary probe committed at the repo root as `.p41-net-probe.mjs` (added by `0671976`, whose own message calls it *"temporary"*), referenced by no `.ts`/`.yml`/`.json`/`.dockerignore` | Separate cleanup | No |

## G. What Was NOT Found (negative assurance)

- No secret, token, API key, SMTP password, or private key **added by this change set**. (Two
  pre-existing tracked artifacts were discovered and are reported as SEC-3 / SEC-4; neither is
  modified in the working tree, so neither can enter the Phase 1 commit.)
- No real `.env` file at risk of being committed — all five are gitignored.
- No debug statements, `console.log`, `debugger`, `@ts-ignore`, `eslint-disable`, TODO/FIXME/HACK
  markers added.
- No skipped or focused (`.only`) tests.
- No global timeout increase, no assertion deletion, no weakened security invariant.
- No generated artifact (`openapi.json`, `dist/`, `coverage/`, `.turbo/`) staged or stage-able.
- No Phase 2 code present in the tree.
- No production-code change outside Phase 1 other than the two identified P13 files.

## H. Verdict Contribution (§9)

§3, §4 and §5 are **satisfied with conditions**. The implementation is complete, in-scope, and
secret- and debug-free across every added line; migrations are correctly ordered and
contract-compliant; both candidate CI breakers (`openapi.json` drift, `OTP_MOCK_ENABLED`) are
cleared with evidence. Conditions SEC-1, HYGIENE-1, HYGIENE-5, COUPLE-1 and RISK-1 must be handled
by explicit owner acknowledgement and by per-path staging. The pre-existing findings (SEC-3, SEC-4,
HYGIENE-3, DEAD-1, DEAD-2, DOC-1, DOC-2) do **not** block this release but do belong on the owner's
hygiene backlog. This drives the overall verdict in the release-preparation report to:

**CONDITIONALLY READY — SPECIFIC ITEMS REQUIRE REVIEW**

No commit, push, PR, remote CI run, merge, deployment, or migration execution has occurred.
