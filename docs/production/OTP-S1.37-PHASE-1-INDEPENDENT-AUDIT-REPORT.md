# OTP-S1.37 Phase 1 — Independent Audit Report

- **Document ID:** OTP-S1.37-PHASE-1-INDEPENDENT-AUDIT-REPORT
- **Sprint:** S1.37 — Phase 1 Independent Audit, Corrections and Final Acceptance
- **Audited artefact:** S1.35–S1.36 _Phase 1 — Email-First Identity and Email OTP_
- **Audit date:** 2026-10-31
- **Auditor:** independent engineering audit (agent-executed, evidence-backed)
- **Reports issued under this audit:**
  1. this document (findings + remediation + acceptance matrix)
  2. [`OTP-S1.37-PHASE-1-FINAL-VERIFICATION-REPORT.md`](./OTP-S1.37-PHASE-1-FINAL-VERIFICATION-REPORT.md) (test evidence, reconciled totals)
  3. [`OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md`](./OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md) (corrected runbook)
- **Superseded documents:** `OTP-S1.35-PHASE-1-VERIFICATION-REPORT.md`,
  `OTP-S1.35-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md` (retained as the historical record;
  both carry a supersession banner pointing here)

> **Scope guard.** This audit covers Phase 1 only. No TOTP, recovery-code, passkey or other
> future authentication work was designed, implemented or claimed. Nothing in this document
> certifies Phase 2 readiness.

---

## 1. Mandate and method

The assignment required an _independent_ audit: start from the repository, not from the
implementation report; verify every claim against source, migration and executed tests; correct
verified defects; re-run affected tests; and produce evidence-backed deliverables.

Method actually followed:

| Phase               | What was done                                                                                                                                    | How claims were checked                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1. Repository state | `git rev-parse`, `git status --porcelain`, `git log`, branch/remote comparison                                                                   | direct Git output                                                       |
| 2. Source audit     | full read of the Phase 1 surface: service, controller, DTOs, schema, providers, registry, Lua scripts, migration, contracts, generated artifacts | code read, not report read                                              |
| 3. Migration        | 0064 analysed against the _actual_ runner (`migrate.ts`, `migrate-pg.ts`), then executed on disposable PostgreSQL 16                             | psql transaction logs, exit codes, `pg_indexes`, `pg_get_constraintdef` |
| 4. Evidence         | every reported test total re-measured by running the suites                                                                                      | Vitest output, JSON reporter, exit codes, wall-clock                    |
| 5. Runbook          | claim-by-claim re-derivation of the v1.0 runbook                                                                                                 | disposable DB probes R1a–R5                                             |
| 6. Re-verification  | after each remediation, re-ran typecheck, lint, affected unit files, affected integration files, contract pipeline                               | command output with exit codes                                          |

**Standing rules honoured:** no destructive Git operation, no blanket staging, no push, no PR,
no merge, no deployment, no staging/production access, no real SMTP/SMS/WhatsApp traffic,
no persistent/shared Redis, disposable PostgreSQL and Redis only.

---

## 2. Repository state verified (Section 1 of the mandate)

| Item                                | Verified value                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Working directory                   | `c:\TAIF\scs-platform`                                                                                                     |
| Branch                              | `feat/auth-email-otp-phase1`                                                                                               |
| `HEAD` at audit start (baseline)    | `2abb53881c87724c338e2a2a94b8e9be78e70c23`                                                                                 |
| Baseline relationship to `develop`  | `HEAD` **is** `origin/develop`; `git rev-parse origin/develop` returns the same SHA — the branch has no commits of its own |
| Staged changes at audit start       | 0                                                                                                                          |
| Working-tree entries at audit start | 209 (`git status --porcelain` line count)                                                                                  |
| Destructive operations used         | none                                                                                                                       |

### 2.1 The one fact that changes how every other report must be read

The S1.35 implementation report presents _"Implementation branch: `feat/auth-email-otp-phase1`,
baseline `2abb538`"_ as though the implementation were committed on that branch. **It is not.**
At the start of this audit the branch pointer and `origin/develop` were the same commit, and the
entire Phase 1 implementation existed only as uncommitted working-tree content (tracked
modifications plus untracked new files).

Consequences, all of which are material and none of which were previously documented:

1. **No commit SHA can be quoted as "the audited code".** An uncommitted tree has no identity;
   any file can change between two commands without leaving evidence.
2. **CI has never run the Phase 1 code.** Every "all gates pass" claim in the S1.35 documents is
   a _local_ claim about a tree that the pipeline never received.
3. **A commit made naively would have been internally inconsistent.** Six pre-existing spec files
   and one test helper are _dependencies_ of the Phase 1 code without being Phase 1 features (see
   §3.2). Committing "only the new Phase 1 files" reproduces exactly the class of failure already
   recorded in this repository's history (locally green, CI red on `MODULE_NOT_FOUND`).
4. **The evidence chain itself was never committed.** `git status --porcelain -- docs/production`
   reports 85 untracked entries, of which **46 are `OTP-S1.*` sprint documents** — every report from
   S1.2 through S1.35, including the runbooks and the "human review handoff" and "release readiness"
   records. No prior sprint's verification claim can be reproduced from Git history, because neither
   the code nor the report that described it was ever in a commit. This is registered as **F-20**.

**Remediation (F-01):** the Phase 1 change set is now committed locally as
`5581e6a46d4705c21a97cc941a696896f8f7973e` (51 paths, each staged explicitly by name; 9 523 insertions, 176 deletions), with the
documentation set following in a separate documentation-only commit. `git diff HEAD --name-only`
over those 51 paths returns no files, so the tested tree and the committed tree are identical, and
the commit's own file list was verified to contain every import target (§4.7 of the Final
Verification Report). No push was performed and none is authorized.

---

## 3. Files reviewed and changed

### 3.1 Reviewed (read in full or in the relevant sections)

**Production code (17):**
`apps/api/src/modules/identity/identity.service.ts`,
`auth.controller.ts`, `dto/auth.dto.ts`, `identity.schema.ts`, `identity.module.ts`,
`apps/api/src/common/utils/email-normalization.ts`,
`apps/api/src/modules/notifications/otp-delivery.service.ts`,
`notifications.module.ts`, `notifications.service.ts`,
`providers/provider.interface.ts`, `providers/provider.config.ts`,
`providers/smtp-email.provider.ts`, `providers/mock.provider.ts`,
`providers/twilio-sms.provider.ts`, `providers/whatsapp.provider.ts`,
`provider-registry.service.ts`,
`apps/api/src/modules/redis/redis.service.ts` (Lua constants).

**Migration tooling (3):**
`infra/drizzle/migrations/0064_email_identity.sql`,
`apps/api/infra/drizzle/migrate.ts`, `apps/api/infra/drizzle/migrate-pg.ts`.

**Contracts and clients (3):**
`packages/contracts/src/index.ts`, `packages/contracts/scripts/generate-openapi.ts`,
`packages/contracts/scripts/generate-ts-client.ts`; generated `openapi.json` and `api.d.ts`
inspected after regeneration.

**Runtime configuration and CI (5):**
`.github/workflows/ci.yml`, `apps/api/package.json`, `apps/api/vitest.config.ts`,
`apps/api/scripts/assert-redis-suite.mjs`, `.env.example`, `infra/deploy/api.Dockerfile`.

**Web client (1):** `apps/web/src/lib/auth.ts`.

**Documentation (4):** `OTP-S1.35-PHASE-1-IMPLEMENTATION-REPORT.md`,
`OTP-S1.35-PHASE-1-VERIFICATION-REPORT.md`,
`OTP-S1.35-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md`,
`OTP-S1.34-MULTI-CHANNEL-AUTH-SECURITY-AND-RELEASE-GATES.md` (for the criteria the audit
matrix is measured against).

**Tests (all Phase 1 suites, plus the regression suites they touch)** — 16 unit specs,
7 Phase 1 integration specs, plus `otp-redis-lua.real.spec.ts`.

### 3.2 Changed by this audit

| File                                                                  | Change                                                                                                                                                                                                | Finding                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `infra/drizzle/migrations/0064_email_identity.sql`                    | rewritten as rev.2                                                                                                                                                                                    | F-02, F-07, F-08, F-11 |
| `apps/api/src/modules/identity/identity.service.ts`                   | shared OTP consumption gate; proof-of-control on both link paths; constraint-error translation; flag-aware enumeration; dead-code removal                                                             | F-03, F-04, F-05, F-11 |
| `apps/api/src/modules/identity/auth.controller.ts`                    | `link-phone` forwards `dto.otp`; timing floor applied to both email OTP routes                                                                                                                        | F-05, F-14             |
| `apps/api/src/modules/identity/dto/auth.dto.ts`                       | `LinkPhoneDto.otp` required; `purpose` wording corrected                                                                                                                                              | F-05, F-10b            |
| `packages/contracts/src/index.ts`                                     | `AccountLinkPhoneSchema` requires `otp`                                                                                                                                                               | F-05, F-09             |
| `packages/contracts/scripts/generate-openapi.ts`                      | six Phase 1 routes and schemas added to the contract surface; link-phone description corrected                                                                                                        | F-09                   |
| `apps/api/src/__tests__/unit/contracts-phase1.openapi.spec.ts`        | **created** — three-surface drift guard                                                                                                                                                               | F-09                   |
| `apps/api/src/__tests__/unit/identity/*.spec.ts` (8 files)            | gap tests added (enumeration, flag gating, proof of control, timing, concurrency, redaction)                                                                                                          | F-03…F-14              |
| `apps/api/src/__tests__/integration/*.postgres.spec.ts` (7 files)     | gap tests added; `issuePhoneOtp` / `injectKnownPhoneOtp` helpers                                                                                                                                      | F-04, F-05, F-11       |
| `.github/workflows/ci.yml`                                            | drift-guard step added to the contract job                                                                                                                                                            | F-09                   |
| `apps/web/src/lib/auth.ts`                                            | `AuthUser.phone` made nullable to match `UserProfileSchema`                                                                                                                                           | F-16                   |
| `docs/production/OTP-S1.35-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md` | **rewritten as an 110-line withdrawal notice** — the unsafe procedure was deleted rather than warned about, so §2 lists each withdrawn claim and §3 lists each withdrawn command                      | F-02…F-08, F-18        |
| `docs/production/OTP-S1.35-PHASE-1-VERIFICATION-REPORT.md`            | supersession banner added; §10 conclusion annotated in place with the specific claims the audit withdrew ("Approve for staging deployment" included). Body retained verbatim as the historical record | F-01, F-04…F-06, F-18  |
| `docs/production/OTP-S1.35-PHASE-1-IMPLEMENTATION-REPORT.md`          | supersession banner added; body retained as the historical record                                                                                                                                     | F-01                   |
| `docs/production/OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md` | **created** — corrected runbook, C-1…C-15                                                                                                                                                             | F-02…F-08, F-11        |
| `docs/production/OTP-S1.37-PHASE-1-INDEPENDENT-AUDIT-REPORT.md`       | **created** (this document)                                                                                                                                                                           | —                      |
| `docs/production/OTP-S1.37-PHASE-1-FINAL-VERIFICATION-REPORT.md`      | **created** — reconciled evidence                                                                                                                                                                     | F-18 evidence          |

### 3.3 Dependency files that are not "Phase 1 features" but must be in the commit

These are the files whose omission historically turns a locally-green branch red in CI. They are
staged with the Phase 1 change set for exactly that reason, and the audit records why:

| File                                                                                                                                                                                                                                                                      | Why it belongs to the commit                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/__tests__/unit/helpers/mock-redis.ts`                                                                                                                                                                                                                       | imported by 12 Phase 1 specs (6 unit `identity/*`, 6 `integration/*.postgres`); untracked before this audit                                                                        |
| `apps/api/src/__tests__/unit/identity/identity.sessions.spec.ts`, `identity.add-org-member.spec.ts`, `identity.deactivate-org.spec.ts`, `identity.n-plus-one.spec.ts`, `identity.org-update-request.spec.ts`, `apps/api/src/__tests__/unit/auth/token-revocation.spec.ts` | `IdentityService` gained a required `ProviderRegistryService` constructor parameter; these six specs construct it directly and do not compile/typecheck without the extra argument |
| `apps/api/package.json`, `pnpm-lock.yaml`                                                                                                                                                                                                                                 | `nodemailer` runtime dependency and `@types/nodemailer`                                                                                                                            |
| `apps/api/src/modules/notifications/notifications.service.ts`, `providers/twilio-sms.provider.ts`, `providers/whatsapp.provider.ts`                                                                                                                                       | `OtpDeliveryRequest` → `ChallengeDeliveryRequest` generalization and the email-only-user phone guard; without them the notifications module does not typecheck                     |

Excluded deliberately (pre-existing, unrelated working-tree changes preserved untouched):
`p8-import-hardening.postgres.spec.ts`, `p12-independent-runtime-verification.postgres.spec.ts`,
`webhook-rate-limiting.spec.ts`, the merchant/returns/commission-reversal services, all
`P13-*` / `SCS-*` documents, `*.xlsx`, `*.html`, the proxy/redis-throttler specs,
`apps/api/scripts/check-redis.mjs` (referenced by nothing), `infra/audit/`, `nginx.conf.template`,
`.m73b6-scratch/`, `.qoder/`, `.audit-scratch/`, and `apps/api/.vitest-integration-results.json`.

Because eight of the excluded spec files were **untracked**, they contribute tests to the local
numbers that a clean CI checkout of the commit will not see: the effect is quantified exactly in the
Final Verification Report §3.1 (local 3 878 → expected on the commit 3 818, with no Phase 1 test
lost), which is why the audit reports both figures instead of one.

> **F-19 caveat recorded here for honesty:** the two P8/P12 spec files carry pre-existing timeout
> adjustments (`30_000` ms) that were present in the working tree during every verification run in
> this audit but are **not** part of the committed tree. A clean checkout of the audited commit
> therefore runs those two long-running suites under the default 5 s per-test timeout, where they
> were previously observed to exceed it (S1.13/S1.15 records). This is a CI-fidelity risk that the
> owner must resolve by committing those two files in whatever change set owns them; it is not a
> Phase 1 defect and Phase 1 code does not depend on them.

---

## 4. Findings register

Severity scale: **CRITICAL** = blocks acceptance on its own; **HIGH** = security or data-integrity
defect; **MEDIUM** = correctness/contract exposure with a workaround; **LOW** = hygiene or
disclosure. Status is as of the audited final commit.

| ID    | Severity       | Area                 | Finding                                                                                                                                                                                                                                     | Status                                                                                                                             |
| ----- | -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| F-01  | **CRITICAL**   | Repository           | The implementation was never committed; branch `HEAD` equalled `origin/develop`, so no audited SHA existed and CI had never seen the code                                                                                                   | **FIXED** — locally committed with explicit path staging (§3.2/§3.3); no push                                                      |
| F-02  | **HIGH**       | Migration            | rev.1 embedded its own `BEGIN;`/`COMMIT;`, which broke the runner's single-transaction contract: the runner's `COMMIT` became a no-op warning and a mid-file failure left earlier statements permanently committed                          | **FIXED** — rev.2 has no transaction control; verified abort-atomicity probe R4                                                    |
| F-03  | **HIGH**       | Enumeration          | Password login for an email-only account path leaked account existence through response shape and error text                                                                                                                                | **FIXED** — uniform shape + shared timing floor; regression tests added                                                            |
| F-04  | **HIGH**       | Account linking      | `linkEmailToAccount` attached an address to an account with **no proof of mailbox control** — any authenticated user could claim any email address                                                                                          | **FIXED** — requires and consumes a live email OTP before any write                                                                |
| F-05  | **HIGH**       | Account linking      | `linkPhoneToAccount` had the same gap for phone numbers; the docblock openly stated that no proof of control was required                                                                                                                   | **FIXED** — requires and consumes a live phone OTP; the verification gate is now shared with login so the two cannot drift         |
| F-06  | **HIGH**       | Feature flag         | The flag gated only the two `otp/email/*` routes; all four `account/*` routes ignored it, so the documented kill switch could not disable account linking                                                                                   | **FIXED** — all six Phase 1 routes return 404 when `auth.email_otp.enabled` is off                                                 |
| F-07  | **MEDIUM**     | Migration            | `CHECK (phone IS NOT NULL OR email IS NOT NULL)` is satisfied by `email = ''`, producing an account with no usable identifier                                                                                                               | **FIXED** — `... OR (email IS NOT NULL AND BTRIM(email) <> '')`; probes R3                                                         |
| F-08  | **MEDIUM**     | Migration            | Unique index on `LOWER(email)` allowed a `' a@x.com'`/`'a@x.com'` pair that `normalizeEmail()` treats as one identity; preflight used the same weak predicate                                                                               | **FIXED** — index and preflight both use `LOWER(BTRIM(email))`, blank-excluded; probes R3/R4b                                      |
| F-09  | **MEDIUM**     | Contract             | Six shipped routes and six component schemas were absent from the OpenAPI document, the generated TypeScript client, and the hand-maintained CI structural gate — the gate could not fail for paths it never listed                         | **FIXED** — contract regenerated; new three-surface drift guard added to CI                                                        |
| F-10  | **MEDIUM**     | Provider isolation   | `ProviderRegistryService` defaults `NODE_ENV` to `'development'` when the variable is unset, so the mock provider is created and email OTPs are routed to an in-process store instead of failing                                            | **OPEN** — see §5.1                                                                                                                |
| F-10b | **MEDIUM/LOW** | OTP semantics        | `EmailOtpRequestDto.purpose` was documented as selecting an intent but is never used: the challenge is keyed on the normalized identifier only, so any issued code redeems for any email-identity operation                                 | **OPEN** — misleading wording removed from DTO/OpenAPI; real intent separation is a design decision, not a defect patch (see §5.2) |
| F-11  | **MEDIUM**     | Concurrency          | A unique violation escaping the pre-check surfaced as HTTP 500 instead of 409 on the link paths; the optimistic guard used a plain equality predicate that mis-handles `NULL`                                                               | **FIXED** — `IS NOT DISTINCT FROM` guard plus constraint translation (23505 → 409, 23514 → 400)                                    |
| F-12  | **LOW**        | Account unlinking    | "Cannot remove the last auth method" checks _identifier presence_, not _usable authentication factor_. An account whose phone exists but whose SMS/WhatsApp channel is unconfigured is still considered protected when its email is removed | **RETAINED + DOCUMENTED** — see §5.3                                                                                               |
| F-13  | **MEDIUM**     | Redaction            | Link/unlink audit rows must carry a digest, never the raw identifier                                                                                                                                                                        | **FIXED** — verified by integration assertions on `account_link_log`                                                               |
| F-14  | **MEDIUM**     | Enumeration/timing   | Email OTP responses returned immediately on the "unknown email" branch, so response time alone distinguished the two cases                                                                                                                  | **FIXED** — `EMAIL_OTP_MIN_RESPONSE_MS = 250` floor applied on both outcomes in the controller                                     |
| F-15  | **LOW**        | Registration         | Email-only registration path could produce a user without a usable identifier under blank-email input                                                                                                                                       | **FIXED**                                                                                                                          |
| F-16  | **MEDIUM**     | Web client           | `apps/web/src/lib/auth.ts` declared `AuthUser.phone: string` while `UserProfileSchema` became `nullable()` in Phase 1 — an email-only account would violate the client type                                                                 | **FIXED** — `phone: string \| null` with a doc comment explaining the provenance                                                   |
| F-17  | **MEDIUM**     | Integration coverage | No client (web or mobile) calls any of the six Phase 1 endpoints; the Dart client generator leg of the contract check could not be executed in this environment                                                                             | **OPEN** — see §5.4                                                                                                                |
| F-18  | **LOW**        | Hygiene/CI           | `pnpm format:check` fails repo-wide (`EXIT=2`); root `pnpm build` fails for `@scs/admin`/`@scs/web` in this workspace; `boundary-lint` and `generate:dart` are unrunnable here                                                              | **OPEN** — see §5.5                                                                                                                |
| F-19  | **LOW/MEDIUM** | Audit privacy        | `identifier_hash` is an **unsalted, deterministic** SHA-256 of the normalized identifier. Email addresses are low-entropy, so any holder of `account_link_log` can recover addresses by dictionary hashing                                  | **OPEN** — see §5.6                                                                                                                |
| F-20  | **HIGH**       | Process/evidence     | 46 `OTP-S1.*` sprint documents and the entire Phase 1 implementation were untracked; no committed evidence existed for any prior sprint claim, so the audit trail was not reproducible from Git                                             | **PARTIALLY REMEDIATED** — see §5.7                                                                                                |

Fixed: 13. Retained with documented rationale: 1. Open: 5 (F-10, F-10b, F-17, F-18, F-19).
Partially remediated: 1 (F-20 — the six Phase 1 documents are committed here; ~40 older sprint
documents are not).

---

## 5. Open findings — evidence, impact and the exact action required

### 5.1 F-10 — mock provider fail-open on unset `NODE_ENV` (MEDIUM)

Evidence:

```ts
// apps/api/src/modules/notifications/provider-registry.service.ts:62
const nodeEnv = (process.env['NODE_ENV'] || 'development').trim().toLowerCase();
if (nodeEnv === 'development' || nodeEnv === 'test') {
  this.mockProvider = new MockOtpProvider(); // …
}
```

```ts
// identity.service.ts:454-471 — the mock wins unconditionally when present
const mockProvider = this.providerRegistry.getMockProvider();
if (mockProvider) {
  deliveryResult = await this.otpDeliveryService.deliverToTestChannel({ channel: 'mock', … });
} else {
  deliveryResult = await this.otpDeliveryService.deliverEmailOtp(email, otp, challengeId);
}
```

The second guard, `MockOtpProvider`'s own constructor (`providers/mock.provider.ts:41-51`), calls
`isProductionLikeEnv(nodeEnv)`, which is false for an unset value — so both layers agree that
"unset" means "not production".

Impact: a process started without `NODE_ENV` accepts an email OTP request, stores the code in an
in-memory map reachable through `getMockProvider().getLastOtp()`, and sends nothing. The user
never receives the code, and anyone able to inspect process state or a debug endpoint that reads
the mock store can. It is _not_ remotely reachable on its own.

Mitigating facts verified during the audit: `infra/deploy/api.Dockerfile:68` sets
`ENV NODE_ENV=production`, and `.env`, `.env.development`, `.env.local`, `.env.example` all set
`NODE_ENV=development`. The containerised deploy path is therefore covered; the exposure is
limited to bare `node dist/main.js` runs, and the registry's `try/catch` correctly degrades to
"no mock, real SMTP" when the provider throws.

Why it was not patched in this audit: making the default fail-closed changes control flow in the
delivery path that every Phase 1 test depends on, and it interacts with `@nestjs/config` load
order (whether `.env` is applied before the registry constructs). That is a design decision with
a deployment-consequence, not a mechanical fix, and it was reached after the final verification
runs had begun. Silently flipping it would have traded a documented MEDIUM for undocumented
behaviour change.

**Exact action required:** change the registry to treat an absent/blank `NODE_ENV` as
production-like (fail closed), or require an explicit `OTP_MOCK_ENABLED=true` opt-in; add a unit
test pinning "unset `NODE_ENV` ⇒ `getMockProvider()` returns `null`"; re-run
`pnpm --filter @scs/api test:unit` and the notification integration suites.

### 5.2 F-10b — `purpose` provides no intent separation (MEDIUM/LOW)

Verified: the string `purpose` appears nowhere in `identity.service.ts`. The challenge key is
`otp:email:{normalizedEmail}` for every email-identity operation. So a code issued with
`purpose: "login"` redeems for linking, and vice versa. The phone challenge namespace (`otp:{phone}`)
is shared between login and registration for the same reason.

Audit decision: the Phase 1 acceptance criteria never required intent separation, and the
implementation report's claim was that `purpose` was "accepted" — literally true. The _misleading_
half (the wording implying intent binding) has been removed from the DTO, the OpenAPI description
and the generated doc, and the behaviour is now stated in the API contract itself. Introducing a
purpose-scoped challenge key is a real change (key namespace, rate-limit dimensions, supersession
semantics, migration of clients) and belongs to a design decision, not to this audit.

**Exact action required:** product/architecture decision — either remove `purpose` from the public
contract, or specify purpose-scoped challenge keys and implement them with tests. Until then no
client may rely on `purpose`.

### 5.3 F-12 — last-authentication-method guard checks identifiers, not factors (LOW)

`unlinkEmailFromAccount` refuses when `!user.phone`; `unlinkPhoneFromAccount` refuses when
`!user.email`. Identifier presence is a proxy for "can still sign in" that holds for phone OTP and
password login, but not when the surviving channel's provider is unconfigured, and not for an
account with a null `password_hash` whose only working method is email OTP.

Retained because the alternative (reading provider configuration inside an identity write path)
couples availability state to data integrity and would make the guard flaky during provider
outages — the same reason the criterion is phrased in identity terms. Documented in the runbook
§9.2 limitations list.

**Exact action required:** if the owner wants a true factor guard, it needs a per-account
"usable methods" derivation with its own acceptance criteria; out of scope for Phase 1.

### 5.4 F-17 — zero client integration for the Phase 1 surface (MEDIUM)

Verified by searching the web and mobile sources: no call site exists for
`/v1/auth/otp/email/request`, `/otp/email/verify`, `/account/link-email`, `/account/link-phone`,
`/account/unlink-email`, `/account/unlink-phone`. `apps/web/src/lib/auth.ts` was corrected for
type-level consistency (F-16) but gained no new capability. Consequently: the endpoints are proven
correct at the HTTP/service boundary and are proven reachable through the generated TypeScript
client's _types_, but no shipped client exercises them end to end. The Dart generator
(`generate:dart`) could not be executed here because `java` is absent, so the mobile client leg is
**source-verified only, never generated or compiled**.

**Exact action required:** implement the email OTP and linking flows in `apps/web` (and the Flutter
app), or record explicitly that Phase 1 ships server-side capability only and no user-facing
behaviour changes. Then re-run the contract generation including the Dart leg in an environment
with a JDK.

### 5.5 F-18 — repository hygiene gates red beyond Phase 1's control (LOW)

Measured in this workspace:

| Gate                               | Result     | Notes                                                                                                                                                                                 |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`                | `EXIT=2`   | repo-wide pre-existing failure; `**/*.{ts,tsx,js,jsx,json,md,yaml,yml}` — many files outside Phase 1                                                                                  |
| root `pnpm build` (turbo)          | `EXIT=1`   | `@scs/admin` / `@scs/web` fail with `Cannot find module 'react'` / `'next'` — a damaged pnpm store from an aborted install earlier in this session's history; `@scs/api` builds clean |
| `pnpm --filter @scs/api build`     | `EXIT=0`   | 421 files compiled                                                                                                                                                                    |
| `packages/contracts generate:dart` | unrunnable | no `java` on PATH                                                                                                                                                                     |
| `boundary-lint`                    | unrunnable | `ts-node` not installed in this workspace                                                                                                                                             |

The four documents created by this audit and the drift-guard spec were formatted with Prettier
before commit, and no Phase 1 edit introduced a new formatting offender. A full-repository
`format:check` green state is **not** claimed and cannot be claimed at this commit.

**Exact action required:** a dedicated repository-wide formatting pass in its own commit (it will
touch hundreds of unrelated files, which is why it is not folded into Phase 1); repair the web/admin
dependency store; add a JDK and `ts-node` to the scanning environment or gate those steps in CI.

### 5.6 F-19 — unsalted deterministic identifier digest in the audit log (LOW/MEDIUM)

`hashEmail()` is `SHA-256(normalized_identifier)`, with no salt and no key, used as
`account_link_log.identifier_hash` for both EMAIL and PHONE rows. Emails and phone numbers are
low-entropy namespaces; an attacker with read access to the audit table recovers the plaintext in
seconds by hashing a candidate list. This weakens the "no raw PII in audit" claim to "PII protected
only against trivial string search".

Verified as a _Phase 1 introduction_: `account_link_log` is created by migration 0064 and the
hashing call sites are all new. The same helper is reused elsewhere, so a fix has a scope wider
than one line.

Not remediated in this audit because the correct design is a keyed digest (HMAC-SHA256 with a
server-side secret, per-table key) which changes stored values and therefore needs a forward
migration, a key-management decision and a re-baseline of existing rows.

**Exact action required:** decide the digest scheme; author migration 0065 to add a keyed hash
column (or replace the existing one), backfill deterministically, update the four audit write
sites and the assertions in `account-linking.postgres.spec.ts`, `email-otp-e2e.postgres.spec.ts`,
`email-otp-security.postgres.spec.ts`, `account-linking.spec.ts`.

### 5.7 F-20 — the audit trail itself had never been committed (HIGH, process)

`git status --porcelain -- docs/production` at audit start reported 85 untracked files, including 46
`OTP-S1.*` documents: every verification report, security audit, CI-remediation record, release
readiness report, staging readiness report, human-review handoff, decision memo and runbook produced
by sprints S1.2 through S1.35. The Phase 1 implementation itself was in the same state (F-01).

Why this is a finding and not a curiosity: those documents make claims of the form "gate X passed at
commit Y". With neither the code nor the document in Git, claim, evidence and commit cannot be
aligned after the fact, so a later reviewer (or an auditor) has nothing to verify against. It is
also how F-01 stayed invisible for two sprints: a report that says "implementation branch:
`feat/auth-email-otp-phase1`" reads as though a branch existed, when it was only a name pointing at
`origin/develop`.

**Remediation performed here:** the six Phase 1 documents (3 × S1.35, 3 × S1.37) are part of this
change set, and the code they describe is committed alongside them, so from this point forward the
Phase 1 claim and its evidence share one commit identity.

**Exact action required (not authorized in this assignment):** commit the remaining ~40 OTP and P13
sprint documents in change sets owned by their own workstreams, and add a repository rule (or CI
check) that fails a sprint whose report is still `??` when its code is committed. Deciding whether
the older sprints' documents should be committed as-is or withdrawn the way S1.35's were is an owner
decision, not an audit conclusion.

---

## 6. Remediation detail for the HIGH findings

### 6.1 F-04 / F-05 — one consumption gate for every identity write

Before this audit, `verifyOtp` (phone login), `verifyEmailOtp` (email login/register),
`linkEmailToAccount` and `linkPhoneToAccount` implemented _four copies_ of "look up the challenge,
compare the HMAC, atomically consume it, clear the rate counters" — and the two linking copies
omitted it entirely. The F-04 fix added an email-only helper, which is how the duplication got
worse before it got better.

The audit replaced the family with a single private gate keyed by a target descriptor:

```ts
private async consumeOtpChallenge(
  target: { challengeKey: string; requestKey: string; failureKey: string;
            masked: string; label: 'email' | 'phone' },
  otp: string,
): Promise<void>
```

`consumeEmailChallenge(rawEmail, otp)` and `consumePhoneChallenge(rawPhone, otp)` are thin
wrappers that normalize the identifier and build the descriptor. `verifyOtp` and
`verifyEmailOtp` now delegate their steps 1–5 to it, and both link methods call it as step 1,
_before_ any read of the target user or write of the identifier. Because the code is consumed,
a code spent on linking cannot subsequently be spent on login, and the reverse.

Behavioural consequences that clients must absorb (both recorded in the runbook):

- `POST /v1/auth/account/link-phone` now requires `otp` (6 digits) in addition to `phone`.
  Old clients posting `{phone}` alone receive **400** from the DTO validation layer.
- The phone challenge window is `OTP_CHALLENGE_TTL` = 90 s; the email window is
  `EMAIL_OTP_CHALLENGE_TTL` = 300 s.
- A link attempt against a number/address with no live challenge returns **401**
  ("OTP expired or not found"), matching the login path's wording.

### 6.2 F-06 — flag coverage

All six Phase 1 routes are checked against `auth.email_otp.enabled` and return 404 when disabled,
including the four `account/*` routes that shipped ungated. Verified by `auth.controller.spec.ts`
("auth.email_otp.enabled kill switch") and by the drift-guard suite's route table.

### 6.3 F-03 / F-14 — enumeration and timing

Existing and non-existing addresses produce the same response shape and status, and both branches
pass through the 250 ms floor implemented as `withOtpTimingFloor` in the controller. Password
login against an email-only account returns the same shape as the phone path. Covered by
`email-enumeration.spec.ts`, `auth.controller.spec.ts` (timing floor) and
`email-otp-security.postgres.spec.ts`.

### 6.4 F-09 — the drift guard, and why the previous "gate" was not one

The CI structural gate maintained a **hand-written list** of expected paths. Six routes shipped and
the gate stayed green because a missing entry cannot fail a check that never lists it. The audit
added `contracts-phase1.openapi.spec.ts`, which reconciles three surfaces mechanically — the route
table `AuthController` actually declares, the generated `openapi.json`, and the generated
`api.d.ts` — and wired it into the contract job after the generators run. It is 58 assertions over
paths, operations, component schemas, required fields and status codes.

---

## 7. Migration 0064 — the seven mandated questions, answered

Full operational detail lives in the runbook §4–§8; the direct answers:

| #   | Question                                                                             | Answer (verified)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Is 0064 genuinely safe to rerun, or is the runbook's idempotency claim inaccurate?   | **Both, and the claim was inaccurate.** The _file body_ is idempotent (bare rerun: `EXIT=0`, no-ops). A _blind rerun through the runner wrapper_ inserts a duplicate `_migration_log.name` primary key, exits non-zero (`EXIT=3`) and rolls back — no damage, but not "safe to rerun" as advertised. The normal operator rerun is a clean no-op because the runner skips recorded files. Runbook §4 now distinguishes the three cases. |
| 2   | Is the CHECK constraint creation protected against duplicate execution?              | **Yes, and additionally against definition drift.** rev.2 wraps it in a `DO` block that compares `pg_get_constraintdef` and only recreates when the stored predicate is not the rev.2 one. `ALTER TABLE … ADD CONSTRAINT IF NOT EXISTS` does not exist in PostgreSQL, so a naive guard would have silently kept the weak rev.1 predicate.                                                                                              |
| 3   | Is the unique index created concurrently or with ordinary `CREATE UNIQUE INDEX`?     | **Ordinary.** `CREATE INDEX CONCURRENTLY` is illegal inside the runner's transaction. The v1.0 runbook's claim that Drizzle used a concurrent pattern internally was false. The index build takes `ACCESS EXCLUSIVE` on `users`, bounded by `SET LOCAL lock_timeout = '5s'`.                                                                                                                                                           |
| 4   | Is the migration executed transactionally, and what lock behaviour actually applies? | **Single transaction, owned by the runner** (`BEGIN;` + file + `_migration_log` insert + `COMMIT;`, `psql -v ON_ERROR_STOP=1`). `DROP NOT NULL` and `ADD CONSTRAINT … CHECK` (which validates every existing row) both take `ACCESS EXCLUSIVE`; writers and readers of `users` block for that window; the statement self-aborts at 5 s and the transaction rolls back. No _planned_ downtime, but "no lock impact" is false.           |
| 5   | Can empty-string emails violate the intended identity rules?                         | **Yes in rev.1; no in rev.2.** rev.1's `CHECK` accepted `phone NULL, email ''` — an account with no usable identifier. rev.2 excludes blank/whitespace-only emails from both the CHECK and the partial unique index. Probes R3 in runbook §11.                                                                                                                                                                                         |
| 6   | Does duplicate-email preflight handle the normalization the application uses?        | **No in rev.1; yes in rev.2.** The application compares `trim().toLowerCase()`; rev.1's preflight used `LOWER(email)` only, so `' dup@x.com'`/`'dup@x.com'` passed preflight and then violated the index. rev.2 preflights `LOWER(BTRIM(email))` and adds an orphan-identifier preflight. Probe R4b demonstrates the gap and its closure.                                                                                              |
| 7   | Does the migration preserve existing users, sessions, memberships and relationships? | **Yes.** Probe R1b: seeded users keep exact `id`, `phone`, `email` after apply; no `DELETE`/`UPDATE` of user rows exists in the file; FK-bearing tables (`sessions`, `organization_members`, …) are untouched; `account_link_log` is additive with `ON DELETE CASCADE`.                                                                                                                                                                |

Tested on disposable PostgreSQL only — one throwaway `docker run --rm postgres:16-alpine`
(`audit-pg-0064`, removed at the end of the audit) and Testcontainers
`postgres:16-alpine` inside `migration-0064-email-identity.postgres.spec.ts` (32 tests).
Fresh apply, existing-data apply, duplicate rejection, blank-email rejection, abort atomicity,
rev.1→rev.2 reconciliation and rerun semantics were all executed. **Nothing was run against
staging or production.**

---

## 8. Runbook corrections (Section 5 of the mandate)

`OTP-S1.37-PHASE-1-MIGRATION-AND-ROLLBACK-RUNBOOK.md` supersedes the v1.0 runbook and carries a
claim-by-claim correction table (C-1 … C-15). The corrections demanded by the mandate:

| Mandate item                                     | Corrected as                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration idempotency description                | C-1 → runbook §4 separates "file body idempotent", "wrapper rerun fails on `_migration_log` PK and rolls back", "runner skips recorded files"       |
| Index creation and locking claims                | C-2 → §5.2/§5.3: ordinary `CREATE UNIQUE INDEX` under `ACCESS EXCLUSIVE`; `CONCURRENTLY` explicitly withdrawn as illegal in-transaction             |
| Transaction behaviour                            | C-3 → §5.1: runner owns `BEGIN`/`COMMIT`; the file must not contain transaction control                                                             |
| Preflight and post-migration checks              | C-6, C-7, C-8 → §7 (six pre-flight checks, both on `LOWER(BTRIM(email))`) and §8 (post-flight probes reading `pg_indexes` / `pg_get_constraintdef`) |
| Health checks using phone numbers or credentials | C-11 → §8.9 replaces them with non-delivering checks (H1…H5); no dialable number, no credential literal, no invented route                          |
| Date and version history                         | C-14 → §13 change log: v1.0 2025-01-19 (wrong), v2.0 and v2.1 both 2026-10-31                                                                       |
| Any claim unsupported by the implementation      | C-4, C-5, C-9, C-10, C-12, C-13, C-15                                                                                                               |

Two audit-time additions: **H5**, a check that `account/link-phone` refuses without a live
challenge (`401`, never `200`), and the behaviour note explaining that `otp` is now mandatory on
that route. Every command that touches a provider or sends traffic is marked
disposable-test-only; none was executed against real infrastructure.

---

## 9. Acceptance matrix — all 28 Phase 1 criteria re-adjudicated

The S1.35 verification report claimed 28/28 PASS. Each criterion was re-tested against the audited
source. Status vocabulary: **VERIFIED-LOCAL** (executed here, disposable infra), **CORRECTED**
(claim was wrong or unproven; fixed and then verified), **OPEN** (not met or not provable here).

| AC  | Criterion                                                  | S1.35 claim   | Audit result                    | Evidence in this audit                                                            |
| --- | ---------------------------------------------------------- | ------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Enumeration-safe response                                  | PASS          | **VERIFIED-LOCAL**              | `email-enumeration.spec.ts`; `email-otp-security` #1–3                            |
| 2   | Email verify → JWT for existing user                       | PASS          | **VERIFIED-LOCAL**              | `email-otp-e2e` #10; `email-otp-lifecycle` #12                                    |
| 3   | Email verify → creates user for new email                  | PASS          | **VERIFIED-LOCAL**              | `registration-flows` #1–2                                                         |
| 4   | 300 s TTL for email challenges                             | PASS          | **VERIFIED-LOCAL**              | `EMAIL_OTP_CHALLENGE_TTL = 300`; lifecycle #3                                     |
| 5   | Per-email rate limit (5 / 15 min)                          | PASS          | **VERIFIED-LOCAL**              | `otp:req:email:*` counters; security #4                                           |
| 6   | Per-IP rate limit (20 / 60 s)                              | PASS          | **VERIFIED-LOCAL**              | `ip-throttling.spec.ts`; security #5                                              |
| 7   | Challenge supersession                                     | PASS          | **VERIFIED-LOCAL**              | `CREATE_CHALLENGE` overwrite; security #6                                         |
| 8   | Replay prevention (atomic consume)                         | PASS          | **VERIFIED-LOCAL**              | `VERIFY_AND_CONSUME` Lua; security #7; real Redis #1–12                           |
| 9   | Concurrent verify — exactly one success                    | PASS          | **VERIFIED-LOCAL**              | `otp-concurrency.spec.ts`; security #8                                            |
| 10  | Linking conflict detection, no auto-merge                  | PASS          | **CORRECTED**                   | F-04/F-05 added proof of control; `account-linking` unit #1–16, integration #1–16 |
| 11  | Cannot unlink the last auth method                         | PASS          | **VERIFIED-LOCAL, with caveat** | guard verified; F-12 documents that it tests identifiers, not factors             |
| 12  | Hashed identifiers in audit                                | PASS          | **VERIFIED-LOCAL, with caveat** | `account-linking.postgres` #166/287; F-19 documents the unsalted digest           |
| 13  | Feature flag gates the endpoints                           | PASS          | **CORRECTED**                   | F-06: `account/*` was ungated; now all six routes 404                             |
| 14  | Mock rejected in production                                | PASS          | **PARTLY — OPEN**               | guard verified for `production`/`staging`; F-10 fail-open on unset `NODE_ENV`     |
| 15  | Mock excluded from public channels                         | PASS          | **VERIFIED-LOCAL**              | `provider-registry.spec.ts` #5                                                    |
| 16  | No OTP/PII in logs                                         | PASS          | **VERIFIED-LOCAL**              | `otp-redaction.spec.ts`; security #12–14                                          |
| 17  | Migration applies on a fresh DB                            | PASS          | **VERIFIED-LOCAL**              | `migration-0064` #1–6; probe R1a                                                  |
| 18  | Migration preserves data                                   | PASS          | **VERIFIED-LOCAL**              | `migration-0064` #7–10; probe R1b                                                 |
| 19  | CHECK constraint enforced                                  | PASS          | **CORRECTED**                   | F-07: rev.1 predicate bypassed by `''`; probes R3                                 |
| 20  | Case-insensitive unique index                              | PASS          | **CORRECTED**                   | F-08: now case **and** whitespace insensitive, blank-excluding                    |
| 21  | Duplicate-email preflight                                  | PASS          | **CORRECTED**                   | F-08: preflight normalization matched to the app; probe R4/R4b                    |
| 22  | Forward-fix policy (never restore NOT NULL)                | PASS          | **VERIFIED-LOCAL**              | `migration-0064` #17                                                              |
| 23  | Phone OTP backward compatibility                           | PASS          | **VERIFIED-LOCAL**              | `phone-otp-regression` 11 tests, unchanged count after the F-05 refactor          |
| 24  | Password login regression (phone-only / email-only / dual) | PASS          | **CORRECTED + VERIFIED-LOCAL**  | F-03; `password-login-regression` 17 tests                                        |
| 25  | Email-only registration                                    | PASS          | **VERIFIED-LOCAL**              | `registration-flows` #1–2                                                         |
| 26  | Dual-identifier linking                                    | PASS          | **CORRECTED**                   | requires proof of control on both directions now                                  |
| 27  | SMTP credential redaction                                  | PASS          | **VERIFIED-LOCAL**              | `smtp-provider.spec.ts` #14–15                                                    |
| 28  | "Full regression passes"                                   | PASS at 2 205 | **RE-MEASURED**                 | totals were mis-summed (double count); corrected in the Final Verification Report |

**Matrix outcome:** 17 criteria verified unchanged, 7 corrected during this audit and then
verified (AC-10, AC-13, AC-19, AC-20, AC-21, AC-24, AC-26), 2 verified with documented caveats
(AC-11 last-auth guard tests identifiers rather than factors; AC-12 audit hashing is unsalted),
1 only partly met (AC-14), and 1 re-measured (AC-28). No criterion was found outright false
without also being fixed, and no security requirement was lowered to make a test pass — three
criteria's claims were _strengthened_ beyond what the original tests proved (AC-10, AC-13, AC-26).

---

## 10. Distinction between locally verified and unverified behaviour

**Verified by execution in this audit:** service-level and HTTP-level behaviour of all six Phase 1
routes; OTP challenge create/expire/supersede/consume against a mocked Redis **and** against a real
disposable Redis (12 Lua tests); duplicate/blank-email behaviour and atomic rollback of migration
0064 on disposable PostgreSQL 16; contract generation for OpenAPI + TypeScript.

**Never tested, and not claimed:** delivery through a real SMTP server, real Twilio SMS, real
WhatsApp Business API; bounce/complaint handling; inbox placement; behaviour under production-scale
`users` table size (the lock and index-build timings were measured on a 2-row table only); any
staging or production infrastructure; the Flutter/Dart generated client; multi-instance behaviour
behind a real load balancer (only simulated in unit tests); client-side flows (F-17); observability
in a real metrics pipeline.

The audit therefore makes **no** production-readiness or staging-readiness claim. Local green plus
disposable-infrastructure green is the strongest statement this evidence supports.

---

## 11. Verdict input

The verdict is issued in §9 of the Final Verification Report. In summary: Phase 1's server-side
behaviour is now materially safer than when the audit began (five HIGH defects corrected: F-01,
F-02, F-04, F-05, F-06), its migration is transactionally honest and its contract surface is
mechanically guarded — but five findings remain open (F-10, F-10b, F-17, F-18, F-19), three of which
(F-10, F-17, F-19) touch security boundaries or shipped capability that local tests cannot close,
and F-20 is only partially remediated. The verdict is **NOT COMPLETE — BLOCKED**, itemized in the
Final Verification Report.
