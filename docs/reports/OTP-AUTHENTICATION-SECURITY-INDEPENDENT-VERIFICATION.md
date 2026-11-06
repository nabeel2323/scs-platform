# Independent Verification — OTP Authentication Security Remediation

| Field | Value |
|---|---|
| Verification date | 2026-11-06 / 07 (UTC+03 shell clock; commands timestamped in Appendix A) |
| Branch under review | `feature/otp-auth-security-hardening` |
| Branch HEAD SHA (verified identical locally and on `origin`) | `2437936a629277a93b81a892ad4f579342fd9afb` |
| Implementation commit | `0730a9e` (`fix(auth): make device trust server-issued, close the device-check oracle, and stop claiming undelivered OTPs`) |
| Baseline commit | `02b59d43f4421b1317eea6493e79cf9ebe066eb7` (merge of PR #106) |
| Documents reviewed | `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md`, `docs/architecture/ADR-0004-SERVER-ISSUED-DEVICE-TRUST-CREDENTIAL.md` |
| Change surface | 41 files (`git diff --name-only 02b59d43..HEAD`), API + contracts + web/admin/mobile clients + migration 0066 + docs |
| Verdict | **NOT READY FOR STAGING PREPARATION** |

This report is independent verification. Every claim below is either a command that was executed in this session with its recorded output, a `file:line` citation from the code, or a cited external source. Design intent is never presented as runtime proof, and where an objective could not be satisfied the gap is stated as a gap.

---

## 1. Verdict

**NOT READY FOR STAGING PREPARATION.**

Three findings are individually sufficient to withhold the verdict:

1. **The behaviour that S-1 depends on is not covered by a passing test.** The two Testcontainers suites were executed in this session against a real PostgreSQL 16 container: `6 failed | 46 passed (52)` across 2 files. Three failures are test-harness type handling, and three are real expectation/behaviour drift that the branch did not reconcile (`§3`, `§4`).
2. **No CI evidence exists for the exact SHA, and none can exist in the branch's current form.** `github.com/nabeel2323/scs-platform` reports `total_count: 0` workflow runs for `2437936…`, for `0730a9e`, and for the branch ref; there is no open PR. `.github/workflows/ci.yml:12-16` triggers only on `push`/`pull_request` targeting `main` or `develop`, so feature-branch pushes produce no runs at all.
3. **The cross-site cookie cannot be stored in every target browser.** On the staging topology the credential is a third-party cookie, because `vercel.app` and `onrender.com` are both Public Suffix List entries. Safari/ITP blocks third-party cookies by default in exactly the `fetch()` path this design uses, so on Safari the credential is never stored and device trust silently never happens. The remediation report and ADR-0004 analyse `SameSite=None` only as a CSRF exposure and never as a storability question (`§5`).

Two security-positive statements can be made without qualification: the S-1 core property (a copied `deviceId` buys nothing) holds in code and was observed at runtime, and the S-2 enumeration oracle is closed. Neither is sufficient for staging preparation while the items above are open.

---

## 2. Evidence provenance — what was actually executed

| # | What ran | How | Result |
|---|---|---|---|
| E1 | Branch/remote/PR/CI state | GitHub REST (read-only), `git ls-remote` | `§3` |
| E2 | `device-trust-lifecycle.postgres.spec.ts` + `password-login-regression.postgres.spec.ts` | `npx vitest run <both specs> --no-file-parallelism`, real Testcontainers `postgres:16-alpine` | 52 tests: **46 passed, 6 failed** in 33.39 s |
| E3 | API unit suite | `pnpm --filter @scs/api test:unit` | 127 files, **2553 passed, 0 failed** (50.01 s) |
| E4 | API typecheck / build | `pnpm --filter @scs/api typecheck`, `… build` | exit 0 / `TSC Found 0 issues`, 435 files compiled |
| E5 | Web client suite | `pnpm --filter @scs/web test` | 7 files, **72 passed** |
| E6 | Admin client suite | `pnpm --filter @scs/admin test` | 3 files, 39 tests: **37 passed, 2 failed** |
| E7 | Mobile suite + CI-scoped analyse | `cd mobile && flutter test`; `flutter analyze --no-fatal-infos lib test` | **158 passed**; analyse exit 0 (15 info-level) |
| E8 | Migration 0066 DDL semantics | direct `node` + `pg` 8.23.0 against a container; full ordered migration apply | all statements apply cleanly; `CHECK`/`UNIQUE`/FK refusals observed (`§4.3`) |
| E9 | Cookie attribute behaviour in real browsers | two-site loopback harness, verbatim production attribute strings | Chrome 156, Edge 156, Firefox 159, Chromium 150 (`§5.2`) |
| E10 | Deployed staging behaviour (read-only) | `curl` + in-browser `fetch` against `scs-api-staging.onrender.com` | pre-remediation build confirmed (`§5.3`) |
| — | Safari / WebKit | **not executable on this host** (Windows; no Safari, and an iOS Simulator needs macOS/Xcode) | documentation-derived, flagged (`§5.4`) |

No merge, deploy, provider configuration, migration application to a shared environment, OTP transmission, or credential reset occurred. Appendix A records the raw output lines behind E2–E10.

---

## 3. Git, PR and CI verification

### 3.1 Branch state — verified

```
$ git rev-parse --abbrev-ref HEAD   → feature/otp-auth-security-hardening
$ git rev-parse HEAD                → 2437936a629277a93b81a892ad4f579342fd9afb
$ git ls-remote origin refs/heads/feature/otp-auth-security-hardening
                                    → 2437936a629277a93b81a892ad4f579342fd9afb
```

Local HEAD and the remote branch tip are the same commit, so the SHA under review is the SHA that would be merged. `main` and `develop` were not touched by this work.

### 3.2 Pull request state — no PR exists

```
GET /repos/nabeel2323/scs-platform/pulls?state=open   → []
```

The highest-numbered PR in the repository is #106, whose merge commit *is* the baseline `02b59d43`. Consequence: the review surface for this change has never been opened, and every CI objective in the task statement depends on an artefact that does not exist.

### 3.3 CI state — zero runs for the SHA, the implementation commit, and the branch

```
GET /repos/…/actions/runs?head_sha=2437936a…   → total_count 0
GET /repos/…/actions/runs?head_sha=0730a9e…    → total_count 0
GET /repos/…/actions/runs?branch=feature/otp-auth-security-hardening → total_count 0
GET /repos/…/commits/2437936a…/check-runs      → total_count 1
        Vercel Preview Comments  completed  success
```

The only check attached to the SHA is a Vercel bot comment check. It is not a build, not a test, and carries no security signal. **The objective "verify all required GitHub Actions runs against that exact SHA" cannot be satisfied — there are no runs to verify.** This is structural, not a transient gap: `.github/workflows/ci.yml:12-16` restricts `push` and `pull_request` to `branches: [main, develop]`, so pushing this branch can never produce a run; a `pull_request` against `develop` would.

### 3.4 Job-level reference — what "green" looks like at the baseline

The baseline commit `02b59d43` has a completed run, used here only as the comparison point: [run 42001570625 (run #432)](https://github.com/nabeel2323/scs-platform/actions/runs/42001570625), `conclusion: success`.

| Job | Conclusion |
|---|---|
| Lint & Typecheck | success |
| Unit Tests + Coverage Gates | success |
| **Integration Tests** | **success** (`Run pnpm --filter @scs/api test:integration`) |
| Migration Full Apply | success |
| Boundary Lint (E6) | success |
| Contract Spec & Codegen | success |
| Mobile (flutter analyze · test) | success |
| Build | success |
| Container Build & Smoke Test | success |
| k6 Smoke Test | skipped |

### 3.5 Did the two named specs actually execute? Yes — and they are not green

Compilation and collection are not proof, so the specs were run for real in this session (E2) against a Testcontainers `postgres:16-alpine`, the same image the spec requests at `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts:125`, and the same code path CI uses (`apps/api/package.json:15`, `ci.yml:175-187` which additionally provides `postgis/postgis:16-3.4` and `redis:7-alpine` services).

```
Test Files  2 failed (2)
     Tests  6 failed | 46 passed (52)
  Duration  33.39s

src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts   (28 tests | 3 failed) 10323ms
src/__tests__/integration/password-login-regression.postgres.spec.ts (24 tests | 3 failed) 14059ms
```

Runtime observations captured in the same run, useful as positive evidence:

```
WARN [IdentityService] Rejected a device-trust credential presented by a different account
     (credential 62fbeb9d-2537-416e-90a9-f16fe44202fd is not bound to the authenticating user)
WARN [IdentityService] Device-check limit reached for identifier v2:f723c944…
```

The cross-user refusal fires and names a row UUID rather than the secret or its digest; the S-2 per-identifier budget engages. Neither was previously evidenced outside a test assertion.

The six failures, mapped and attributed:

| # | Spec / test | Error | Attribution |
|---|---|---|---|
| F1 | device-trust `:301` "rejects another account's credential and cannot consume its slide" | `TypeError: after.expires_at.getTime is not a function` (`spec:311`) | Test-harness typing, **new test file** |
| F2 | device-trust `:324` "expires with the sliding horizon and revokes it durably (requirement 7)" | same class, `(intermediate value).expires_at.getTime` (`spec:336`) | Test-harness typing, **new test file** |
| F3 | device-trust `:349` "slides the horizon on validated use but never past the ceiling" | `TypeError: slid.expires_at.getTime` (`spec:356`) | Test-harness typing, **new test file** |
| F4 | password-login `:162` "issues a JWT pair when the account presents its own credential" | `expected { …(2) } to deeply equal { keep: true }`; received `{credential: "f7z5tc_4j52tcaOuzG1FXbFDTEUTlJ29fzg6BU4ZdvY", maxAgeSeconds: 7775999}` (assertion at `:180`) | **Convention split between two specs by the same author** — new test (absent at baseline) |
| F5 | password-login `:493` "audit records the address as a hash, never in clear (S1.37-F-13)" | `expected undefined to be defined` | **Behaviour change not reconciled** — test body byte-identical to baseline (lines 376/402 there) |
| F6 | password-login `:519` "accepts a case-variant and padded address for the same account (S1.37-F-08)" | `expected '' to be truthy` (`accessToken` empty) | **Intended new behaviour, stale expectation** — test body byte-identical to baseline |

Root cause of F1–F3, established by direct experiment rather than inference: the helper reads with a raw `pool.query('SELECT * …')`, and under vitest/vite-node the `timestamptz` column hydrates as a **string**; reads through drizzle hydrate a **Date**. A plain `node` + `pg` 8.23.0 process against the same container returned `object Date` for every row (E8), so this is a module-loading artefact of the test runner, not a product defect and not a database defect. `pnpm-lock.yaml` is unchanged from baseline, so hosted CI resolves identical vitest/pg versions — **F1–F3 are expected to reproduce in hosted CI** (stated as reasoned prediction, not as an observed CI result).

F5 and F6 are more consequential than the typing failures, because they show the branch changed observable behaviour without reconciling the pre-existing suite:

- F5: a correct password from an untrusted device now records `action: 'auth.otp_challenge'` (`identity.service.ts:1876`) and never `action: 'auth.login'`; the trusted branch records `auth.login` with `trustedDevice: true` (`identity.service.ts:1939`). The hash-the-address property the test protects does still hold — the `otp_challenge` row carries `emailHash` (`:1878`) — but the test's premise ("this attempt produces an `auth.login` row") no longer holds, and **the property has lost its runtime coverage**. Any dashboard or runbook keyed on `auth.login` for password attempts will under-count once this deploys.
- F6: `loginWithPassword` on an untrusted device returns `accessToken: ''` (`identity.service.ts:1884`). That is the designed fail-closed outcome and matches the report's "every existing browser becomes untrusted once", but the pre-existing normalisation test still asserts a token, so email case/trim handling on the login path is no longer proven end-to-end.

---

## 4. Trusted-device implementation review

### 4.1 Requirement-by-requirement verdicts

| Requirement | Verdict | Evidence |
|---|---|---|
| Credential generation and entropy | **MET** | `crypto.randomBytes(32)` → base64url 43 chars, `DEVICE_CREDENTIAL_BYTES = 32` (`identity.service.ts:73`, `:1526-1558`); shape validated against `/^[A-Za-z0-9_-]{43}$/` (`device-trust-cookie.ts:41`); uniqueness asserted by test `device-trust-lifecycle…spec.ts:211` and observed in E2 (43-char secret `f7z5tc_…` in the F4 diff output). 256-bit uniform, not UUIDv4. |
| Digest storage | **MET, and runtime-proved here** | Only `sha256(secret)` hex is persisted (`identity.service.ts:1536`); `CHECK (credential_hash::text ~ '^[0-9a-f]{64}$')` (`infra/drizzle/migrations/0066_device_trust_credential.sql:137`) was exercised by direct insert of a plaintext-shaped value, which the database rejected (E8). |
| User binding | **MET** | `user_id` FK `ON DELETE CASCADE` (`migration 0066`), `created_by_session` `ON DELETE SET NULL`; ownership compared at validation (`identity.service.ts:1570-1625`) → `user_mismatch`, row untouched; live WARN observed in E2. |
| Expiration and sliding expiry | **MET in code; durably proven here, not by the branch's suite** | 30-day slide / 90-day ceiling constants (`identity.service.ts:67-68`); `expiresAt = min(now + slide, hardExpiresAt)` (`:1570-1625`); expiry writes `revokedReason = 'EXPIRED'` durably (`:1607`); `CHECK (expires_at <= hard_expires_at)` (`migration 0066:125`) enforced by the server when a violating row was written (E8). The three tests that would normally prove slide/clamp/durable-expiry are F1–F3, so this row rests on E8, not on the branch's own green tests. |
| Revocation paths | **PARTIAL** | LOGOUT / MANUAL / SESSION_REVOKED / ROTATION_REUSE / EXPIRED all exist (`identity.service.ts:955`, `:1635`, `:2224`, `:871-872`, `:1607`). **`PASSWORD_CHANGE` is absent** (see 4.2 D3) and logout revokes only on presentation (D2). |
| Logout | **MET for the browser flow that presents the credential; gap otherwise** | `logout()` → session revoke then `revokePresentedCredential()` (`identity.service.ts:938-961`); early return when nothing is presented (`:1715-1733`). Both web and admin send `credentials:'include'` plus the proof header on logout (`apps/web/src/lib/auth.ts:105-117,384`; `apps/admin/src/lib/auth.ts:49-61,315`), so the real flow does revoke. Test `…spec.ts:522` "ends the trust it created on logout (requirement 10)" passed in E2. |
| Refresh-token rotation and reuse | **MET** | Rotation preserves trust; reuse revokes the whole chain *and* every credential for the account (`identity.service.ts:862-872`, `revokeAllDeviceCredentials(…, 'ROTATION_REUSE')`), with `UNIQUE` digest preventing replay of any revoked value. Tests at `…spec.ts:572` and `:604` passed in E2. |
| Cross-user replay prevention | **MET** | `UNIQUE` index on `credential_hash` (`migration 0066:148-150`) makes one digest owned by at most one row; validation additionally compares `row.userId !== userId` → `user_mismatch` and does not touch the foreign row. Proven structurally by `…spec.ts:235` (passed) and by E8 (duplicate digest insert rejected). Note F1 was *intended* to prove "cannot consume its slide" and is red; E8 covers that property through the production read path instead. |
| Cookie issuance and clearing | **MET** | `buildDeviceTrustCookie` / `buildClearDeviceTrustCookie` (`device-trust-cookie.ts:265`, `:279`), host-only, `Path=/`, `HttpOnly` always, `Max-Age` from remaining ceiling and `Max-Age=0` to clear; applied by `applyDeviceTrustCookie` (`:316`). Boot-time validation refuses an unknown `SameSite`, `None` without `Secure`, and `Secure=false` outside dev/test (`:103-167`, called from `main.ts:43`). |
| CSRF proof-header enforcement | **MET in code, and correctly integrated** | Trust evaluated only when cookie **and** `x-device-trust: 1` arrive together (`device-trust-cookie.ts:47-50`, `:198-232`); missing proof ⇒ `absent` ⇒ OTP. Header added to `main.ts` CORS `allowedHeaders` alongside the origin allowlist. All 44 transport-layer unit cases passed inside E3. |
| S-2 enumeration oracle | **MET** | `device-check` returns a constant, `auth.device_check` audit keyed on the hashed identifier (`identity.service.ts:2161`), budget warn observed in E2; deployed staging still returns the old shape (`§5.3`), i.e. the fix is real but not yet live. |

### 4.2 Discrepancies between implementation, ADR-0004 and the remediation report

**D1 — ADR cites a test that does not exist.** `ADR-0004:142-143` states the S-1 acceptance criterion "is a test, not the claim" and names `"a copied deviceId without the credential still requires OTP"`. No test with that name exists anywhere (`grep` over `apps/api/src/__tests__/integration/` → no match). The nearest real test is `device-trust-lifecycle.postgres.spec.ts:672` "does not let a copied client-side deviceId carry trust it once had". The intent is covered; the citation is wrong, which is exactly the kind of defect that makes a future reader trust a claim that was never verified.

**D2 — The revocation table overstates logout.** `ADR-0004:116` promises "Logout (`/v1/auth/logout`) → revoked `LOGOUT`, cookie cleared". `revokePresentedCredential` returns immediately when no credential was presented (`identity.service.ts:1715-1733`), so a logout that presents nothing leaves the credential **live and trusted**. `device_credentials.created_by_session` exists precisely to close that hole — the ADR itself says "De-trust follows the session that earned it" (`ADR-0004:129`) — but `logout()` has the session row in hand and does not use it. Both clients happen to present the credential today, so this is a latent gap rather than a live break; it becomes live for any client that omits the header, and for a browser whose proof header is rejected by a CORS change.

**D3 — Password change does not revoke device trust, and neither document says so.** `identity.service.ts:2039-2100` updates the hash, audits `PASSWORD_CHANGE`, revokes sessions, and touches `device_credentials` **not at all**. Consequence: the moment the new password is known, a previously trusted browser logs in with the new password and **no second factor**, because `loginWithPassword` consults only the presented credential (`:1841`). The ADR's revocation table has no row for it. This is the one place where a real-world incident sequence is unmitigated: device compromise → password reset by the victim → attacker still bypasses OTP. Attribution matters: the surrounding session-revocation logic is byte-identical to baseline (`git show 02b59d43:apps/api/src/modules/identity/identity.service.ts:1685-1693`), including its comment "keep current device if specified" which contradicts the code beneath it; that comment/code contradiction and the deviceId-scoped session revoke are **pre-existing**, whereas the missing credential revocation is a **gap created by omission in the new mechanism**.

**D4 — Live credentials accumulate without a cap.** Every completed second factor mints a fresh row (`identity.service.ts:402-405`, `:830-833`) with no per-device dedupe, no per-account cap, and no revocation of the predecessor. The implementation's own rationale comment for not minting on trusted logins acknowledges the hazard ("it would also pile up live rows for one physical device", `identity.service.ts:1948-1951`) and the test file worries about a row "trusted forever" (`device-trust-lifecycle…spec.ts:309`), yet nothing bounds the OTP-login path. Practical effects: the "Trusted devices" list fills with indistinguishable rows per browser, and manual revocation becomes a guess. Not mentioned in the ADR or the report.

**D5 — Two specs encode two different transport conventions, and one of them is dead code.** `DeviceTrustTransportInstruction` declares `keep?: boolean` documented as "Present a live credential but do not touch the cookie" (`device-trust-cookie.ts:288-296`), but `applyDeviceTrustCookie` (`:316-330`) never reads `trust.keep`. `keepTrustedCredential` emits `{credential, maxAgeSeconds}` (`identity.service.ts:1741-1751`), which `password-login-regression…spec.ts` expects and `device-trust-lifecycle…spec.ts` does not — F4. The implementation's choice is the better one (re-setting the cookie is what slides the browser's `Max-Age`; `{keep:true}` would be a no-op), so the correct fix is to drop the `keep` field and the expectation that relies on it. As committed, the suite is red and the type advertises a capability nothing implements.

**D6 — Audit-action drift is undocumented.** See F5. `identity.service.ts:1876` replaced a `auth.login` record with `auth.otp_challenge` for the "correct password, untrusted device" case, and does so with `actorType: 'SYSTEM'` rather than the user's role. Neither document mentions the change of action name or actor type, which is what an investigator or alert rule keys on.

**D7 — Two sentences of ADR-0004 are falsified by §3.** `ADR-0004:196` says the container suite "needs Docker and is evidenced through hosted CI, not locally." Both halves are now false: it was run locally, and no hosted CI exists for the SHA. `ADR-0004:47` "30-day sliding horizon, 90-day absolute ceiling, both enforced" is true of the code but its proving tests are F1–F3, so as a documentation claim it is currently supported by E8, not by the branch's tests.

**D8 — The cross-site question is treated only as CSRF, never as storability.** The report's cookie section (`OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md:107-114`) and `ADR-0004:74-100` correctly reason about `SameSite=None`, the proof header and the CORS allowlist, and correctly reject `SameSite=Lax` because "the cookie would never arrive". They do not consider that the cookie may never be **stored** (Safari ITP), nor that Incognito Chrome and "block all third-party cookies" Firefox users sit in the same class, nor that Edge's Balanced tracking prevention applies tracker-list heuristics. This is the §3 objective of the task ("Do not assume that successful CORS preflight proves cookie compatibility") and it is the single largest unaddressed risk in the design.

**D9 — The report's admin-failure isolation was corroborated by a different method.** `OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md:220` proves the two admin failures are pre-existing by re-running with the baseline `vitest.config.ts`. This verification instead established that the failing file and all six modules it imports are byte-identical to baseline (they are absent from the 41-file branch diff) and that the only branch change in that package, the `@/` alias in `apps/admin/vitest.config.ts`, cannot affect them since none of the six imports use the alias. Same conclusion, independent route; noted so the evidence chain is not double-counted.

---

## 5. Browser cookie compatibility on the actual staging topology

### 5.1 Topology and how the browsers compute "site"

Staging is a Vercel-hosted admin/web frontend calling a Render-hosted API (`apps/admin/src/lib/auth.ts`, `apps/web/src/lib/auth.ts` `API_URL`; the API's own allowlist at `apps/api/src/main.ts:78-100`). Both observed hosts resolve their site boundary through the Public Suffix List: `vercel.app` and `onrender.com` are both listed suffixes, therefore `scs-platform-admin.vercel.app` and `scs-api-staging.onrender.com` are each their own registrable domain, therefore they are **different sites**, therefore any cookie the API sets while the page is on the frontend is a **third-party cookie** in the browser's own classification. `SameSite` is computed on *site* (scheme included, port ignored) — not on origin — so a `SameSite=None; Secure` cookie is required just to be eligible for transport, which the design does correctly (`ADR-0004:74-100`).

One structural corollary is favourable and worth recording: because each `*.onrender.com` host is its own registrable domain, a sibling subdomain cannot plant or read the credential — the host-only, no-`Domain` attribute plus PSL listing makes subdomain cookie injection impossible here, exactly as `ADR-0004:100` claims.

### 5.2 Real-browser execution (automation-free path included)

A two-site loopback harness was used with the **production attribute strings taken verbatim** from `serializeDeviceTrustCookie`/`buildDeviceTrustCookie`:

```
scs_device_trust=<value>; Path=/; SameSite=None; Secure; HttpOnly; Max-Age=7776000     (production)
… SameSite=Lax …                                                                        (control)
… SameSite=None; Secure; Partitioned …                                                  (CHIPS)
__Host-scs_device_trust=…; Path=/; SameSite=None; Secure; HttpOnly …                    (prefix)
```

Frontend page at `http://localhost:4181`, API at `http://127.0.0.1:4180` — different sites, and no TLS certificate theatre was needed because `Secure` is honoured for loopback by all tested engines. Two delivery paths were tested: JS `fetch(credentials:'include')`, and a **JS-free `<img>` subresource** whose received `Cookie:` header the API logged, so the result does not depend on automation or on `fetch` semantics.

Observed server-side log line (JS-free path):

```
PIXEL tag=img-after-set cookieNames=["scs_device_trust","scs_device_trust_chips","__Host-scs_device_trust"]
      secFetchSite=cross-site  hasProduction=true  hasLax=false  hasChips=true  hasHost=true
```

Results, all default profiles, no flags:

| Engine | `SameSite=None; Secure; HttpOnly` stored & re-sent cross-site | `SameSite=Lax` sent | `Partitioned` (CHIPS) | `__Host-` |
|---|---|---|---|---|
| Chrome 156.0.8078.80 | **yes** | no | yes | yes |
| Edge 156.0.4314.58 | **yes** | no | yes | yes |
| Firefox 159.0.1 | **yes** (in a per-site partition) | no | yes | yes |
| Chromium 150.0.7871.114 (Qoder embedded) | **yes** | no | yes | yes |
| Safari / WebKit | **not testable on this host** | — | — | — |

The `Lax` row is the empirical confirmation of the report's premise that `Lax` would leave every login demanding a second factor; it is now measured rather than argued.

**What this proves and what it does not.** It proves the wire format, attribute combination and site computation behave as the design intends in four real engines, without automation interference. It does **not** prove the deployed staging pair works, because the credential is never issued there yet (`§5.3`). It also does not prove Safari behaviour. One methodological caveat: loopback hosts are treated as trustworthy origins, so `Secure` cookies are accepted over plain `http://127.0.0.1` — that exception exists only for loopback, and it does not substitute for TLS verification on a real deployment (the report's own proxy/`X-Forwarded-Proto` activation step, `OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md:114`, remains open).

### 5.3 The deployed staging environment still runs the pre-remediation build (read-only probes)

```
POST https://scs-api-staging.onrender.com/v1/auth/login/device-check
  {"email":"iv-probe-nonexistent@example.invalid","deviceId":"iv-probe-…"}
→ 201  {"canAutoLogin":false,"requiresOtp":true,"hasPassword":false}
→ no Set-Cookie header

OPTIONS https://scs-api-staging.onrender.com/v1/auth/login/password
        Origin: https://scs-platform-admin.vercel.app
        Access-Control-Request-Headers: content-type,x-device-trust
→ 204  access-control-allow-headers: Content-Type,Authorization,Idempotency-Key,If-Match,X-Device-Id
```

Two conclusions. First, the S-2 oracle is still open **in production-shaped reality**: the deployed endpoint still answers account-existence/password-set questions; the branch closes it in code only. Second, and immediately actionable: the deployed CORS allowlist does not admit `x-device-trust`, so a browser request that carries the proof header fails at the preflight — reproduced from a live page as `TypeError: Failed to fetch`. **Deploy order is therefore a hard constraint: API before clients.** If the web/admin clients ship first, every auth call they make (`trustRequest` attaches the header to login, refresh, logout and OTP verify — `apps/web/src/lib/auth.ts:299,345,384,467,623`; `apps/admin/src/lib/auth.ts:232,279,315,370`) breaks, not merely device trust.

Consequently, "actual deployed-browser verification" of the credential remains **open** and cannot be closed inside the restrictions of this task (no deploy, no Render/Vercel settings changes, no migration application).

### 5.4 Per-engine privacy policy findings (external sources; Safari is the decisive one)

- **Safari/WebKit — the design does not work here.** ITP "blocks all third-party cookies … disallow a third party to set new cookies unless it already has cookies", and to use cookies as third party "the domain first has to become first-party", which happens only through a top-level navigation or the Storage Access API — never through `fetch()`. Webkit explicitly includes script-initiated XHR/fetch responses in the block. The API host is never first-party in this topology and no Storage Access API prompt exists in the clients. **Outcome: the credential is never stored; device trust never engages; every login on Safari demands a second factor.** Note the failure is *fail-closed* — no security weakening — but it silently converts S-1 from a security improvement plus convenience into a pure cost (OTP volume) for that user population, and it means an enrolled-but-never-persisted credential is minted on each OTP login, aggravating D4. ([Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/), [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/))
- **Chrome/Edge — default OK, settings-dependent.** Google reversed the phase-out and confirmed it "will maintain our current approach to offering users third-party cookie choice" and "will not be rolling out a new standalone prompt"; MDN states Chrome "doesn't block third-party cookies by default, only in Incognito mode, or when users explicitly set it to block". Incognito and enterprise policy are therefore the failure populations. Edge shares the Chromium stack but adds list-based enforcement (Balanced is default and blocks storage/cookie access for domains on Disconnect tracker lists). ([Next steps for Privacy Sandbox](https://privacysandbox.google.com/blog/privacy-sandbox-next-steps), [MDN third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies), [Edge tracking prevention](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/tracking-prevention))
- **Firefox — works, but partitioned by default.** Standard ETP enables Total Cookie Protection: "This gives third-party cookies a separate cookie jar per site", applied to every embedded third-party resource whether or not it is a tracker; cookies are isolated, not blocked. So the credential works from that frontend and is invisible from any other top-level site, and a user selecting "block all third-party cookies" loses it. (Mozilla's support pages are JS-gated; wording came via search excerpts and should be re-verified in-product.) ([State partitioning](https://hacks.mozilla.org/2021/02/introducing-state-partitioning/), [Firefox tracking protection](https://support.mozilla.org/en-US/kb/third-party-cookies-firefox-tracking-protection))
- **CHIPS (`Partitioned`) — partial and unstable.** Requires `Secure` and `SameSite=None`, keyed to the top-level registrable domain; newly Baseline since December 2025. Safari added it in 18.4, **disabled it in 18.5**, and re-shipped it in 26.2 (December 2025) — so a large installed Safari base lacks it. Firefox gains nothing from it because it partitions everything by default. It would rescue *some* Safari users, not the population. ([CHIPS](https://github.com/privacycg/CHIPS), [MDN partitioned cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies/Partitioned_cookies), [WebKit features 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/), [Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/))

### 5.5 Required architectural alternative

The existing topology **cannot** reliably support the cookie. Two alternatives preserve every security control (HttpOnly, host-only, server-issued, revocable) without weakening anything; "silently weakening" would be dropping `Secure`, falling back to `localStorage`, or trusting `deviceId` again, none of which is proposed.

**Option A — make the API same-origin by reverse proxy at the frontend edge (recommended).** A Vercel path rewrite `/api/:path*` → `https://scs-api-staging.onrender.com/:path*` forwards "without changing the URL in the browser", so the browser sees one origin: the cookie becomes same-origin and first-party, `SameSite=Lax` or `Strict` works, CORS disappears, and the proof-header mechanism stays as belt-and-braces. Two conditions: the cookie must stay host-only (it already is — no `Domain` attribute) and its `Path` must match the rewritten prefix; and rewrite caching must be disabled via `x-vercel-enable-rewrite-caching: 0`, because projects created after 2026-04-06 honour upstream `Cache-Control` — a cached authenticated response would leak one user's `Set-Cookie` to another, which is a serious new risk if overlooked. ([Vercel rewrites](https://vercel.com/docs/routing/rewrites))

**Option B — custom domains on one registrable domain.** `app.<company>` + `api.<company>` makes the cookie **same-site and first-party** for every browser's blocking rules, while remaining cross-origin, so explicit CORS with `Access-Control-Allow-Credentials: true` and an allowlisted `x-device-trust` must stay. Render supports custom domains with automatic TLS and keeps the `onrender.com` subdomain. ([Render custom domains](https://render.com/docs/custom-domains), [MDN SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite), [MDN site glossary](https://developer.mozilla.org/en-US/docs/Glossary/Site))

**Option C — CHIPS as an interim hardening only.** Add `Partitioned` on the cross-site path and accept that Safari coverage is version-dependent. This narrows the gap, it does not close it.

**Recommendation:** decide A or B **before** staging preparation, because migration 0066 plus first-run enrolment is what generates OTP volume, and enrolling credentials into browsers that cannot store them spends SMS/email quota for zero security or convenience gain. Mobile is unaffected either way and already excluded by design (`mobile/lib/services/api_service.dart:85`; `OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md:244`).

---

## 6. Regression verification matrix

Every flow named in the task, with what was executed here. "New" means introduced by this branch; "baseline" means the pre-existing suite.

| Flow | Evidence | Result |
|---|---|---|
| Admin login | `apps/admin/src/__tests__/auth-login-otp-delivery.test.tsx` (16 cases, new) inside E6 | **pass** — including "advances to code entry only when the provider confirmed delivery" |
| OTP request and verification | web 72 cases (E5) incl. `login-device-trust` 10, `email-otp-login` 15, `auth-login-channel` 9; API unit 2553 (E3); Flutter 158 (E7) | **pass** |
| Failed delivery handling | `otp-delivery-classifier` 7 (web) + Flutter "delivery outcomes are reported as what they are" group (E7) | **pass** — unconfigured/rejected/uncertain are distinguished and never claim delivery |
| Trusted-device login | `device-trust-lifecycle` 28 + `password-login-regression` trusted-device group | **RED** — F1, F2, F3 (harness typing), F4 (convention split) |
| Device revocation | `…spec.ts:373` scope-to-caller, `:401` bulk live-only, `:439` session-linked de-trust, `:462` neighbour unaffected, `:552` cross-account refusal | **pass** in E2 |
| Web login | E5 7 files / 72 cases | **pass** |
| Flutter login | E7 158 cases; `flutter analyze --no-fatal-infos lib test` exit 0 | **pass** (15 info-level items, non-fatal under CI's own flags) |
| Device-check response and throttling | S-2 code path + `ip-throttling.spec.ts` (23) + `device-trust-cookie.spec.ts` (44) inside E3; live warn in E2; deployed shape probed in E8/E10 | **pass in code**; **not live** on staging |
| Password logins unaffected by device trust removal | F5, F6 | **RED** — two pre-existing tests invalidated by the behaviour change and not updated |
| Migration apply | E8: full ordered apply of `infra/drizzle/migrations`, 0066 included | **pass** |
| API compile | E4 typecheck + build | **pass** |

Failure ledger — new vs baseline:

| Failure | New or baseline? | How established |
|---|---|---|
| F1, F2, F3 | **New** (new spec file) | File absent at baseline (`git ls-tree 02b59d43`) |
| F4 | **New** (new test, new mechanism) | Same |
| F5, F6 | **New failures of baseline tests** | Bodies byte-identical to baseline lines 376/402; baseline run #432 Integration Tests = success |
| Admin ×2 (`management.test.tsx`: "reuses details in full-page and dialog modes", "uses displayed IDs for shortcuts, suspends in dialogs, and clears paging selection") | **Baseline** | The file and its 6 imported modules are outside the 41-file branch diff; the failing assertions target product-moderation copy/behaviour with no auth dependency; corroborates the report's own isolation at `…REPORT.md:220` |
| Flutter full-package `flutter analyze` 5 warnings in `packages/api_client` (unused imports/param in generated code) | **Baseline, out of CI scope** | None are in branch-touched files; CI invokes `flutter analyze --no-fatal-infos lib test` (`ci.yml:433`) plus a separate `packages/mobile-core` pass (`ci.yml:438`) |

---

## 7. Remaining blockers and required actions

Blocking for staging preparation:

1. **B1 — Make the container suite green.** F1–F3 need the specs' raw-row helper to stop depending on runner-side timestamp typing (read through drizzle, or parse explicitly). F4 needs one convention: implement D5's cleanup (delete the unread `keep` field, align `device-trust-lifecycle`'s expectation with `{credential, maxAgeSeconds}`). F5/F6 need their expectations updated to the intended new behaviour **and** must keep asserting the underlying properties (hashed identifier on the `auth.otp_challenge` row; normalisation still honoured, via the OTP-required response). Do not close this by deleting assertions.
2. **B2 — Produce CI evidence for an exact SHA.** Open the PR against `develop` and record the run URL, job-level conclusions and test totals for that head. Feature-branch pushes will never generate runs (`ci.yml:12-16`); this is also the only route to the runtime proof ADR-0004 currently claims from CI.
3. **B3 — Resolve the third-party-cookie topology before any enrolment happens** (§5.5). Until Option A or B is chosen and deployed, the credential is un-storable in Safari and in Incognito/3P-blocked sessions on the rest.
4. **B4 — Enforce deploy order and CORS.** API first; `x-device-trust` must be in the deployed `access-control-allow-headers` before any client sends it (currently absent on staging, where such a request fails with `Failed to fetch`).
5. **B5 — Close the password-change revocation gap (D3)** with a credential revocation in `changePassword`, and add the ADR table row. Consider also correcting the inherited deviceId-scoped session revoke and its contradicting comment.
6. **B6 — Make logout revocation session-anchored (D2)** via `created_by_session`, so it does not depend on the client presenting the credential.
7. **B7 — OTP delivery configuration remains a hard prerequisite** (inherited from `…REPORT.md`, "Staging activation prerequisites"): migration 0066 deliberately does not backfill, so applying it untrusts every device at once. With B3 unresolved, that re-enrolment also spends delivery quota on browsers that will never store the result.

Non-blocking, fix alongside: D1 (wrong test citation in ADR), D4 (per-account live-credential cap and device labelling so the revocation UI is usable), D6 (document the `auth.login` → `auth.otp_challenge` drift for whoever owns alerting), D7 (correct the two ADR sentences that §3 falsified), D8 (add the storability analysis to the ADR), and the `passwordSetAt`/comment contradiction in D3's inherited block.

---

## 8. Recommendation

**NOT READY FOR STAGING PREPARATION.**

Separate verdicts by dimension, since the task asked for them rather than a blended score:

| Dimension | Verdict |
|---|---|
| S-1 core security property (client-chosen identifier cannot buy trust) | **MET** — code + runtime observation |
| S-2 enumeration oracle closed | **MET in code**, not live |
| CSRF / transport hardening of the credential | **MET** — cookie + proof header, boot-time refusals, 44 unit cases |
| Database schema and constraints | **MET** — full ordered apply plus `CHECK`/`UNIQUE`/FK refusals observed here |
| Test evidence for the new behaviour | **NOT MET** — 6 of 52 container cases red; CI evidence absent by construction |
| Revocation completeness | **NOT MET** — password change and un-presented logout leave trust live |
| Deployed browser compatibility | **NOT MET** — un-storable in Safari on the current topology; deployed verification impossible without a deploy |
| Regression safety of existing flows | **CONDITIONAL** — all suites pass except the two password-login tests the branch invalidated; admin failures are baseline |
| Documentation accuracy | **NOT MET** — 9 discrepancies (D1–D9), two of them claims the verification falsified |

The design is sound and the risky direction of failure was correctly chosen: the implementation fails toward "require a second factor", never toward "skip it". The blockers are not design flaws; they are an unreconciled test suite, a missing CI record, an unaddressed browser-policy dependency, and two revocation paths that were left open. B1, B2 and B3 are the minimum to convert this into a staging-ready change.

---

## 9. Restriction compliance

| Restriction | Status |
|---|---|
| Do not merge | Complied — no merge; branch HEAD unchanged at `2437936a` |
| Do not deploy | Complied — read-only HTTP probes only (§5.3) |
| Do not modify Render, Vercel or Supabase settings | Complied — no console/API writes; external behaviour observed via public endpoints |
| Do not configure delivery providers | Complied — provider activity in E2 is the in-test stub (`OTP delivered via sms to ***0001`) |
| Do not apply migration 0066 to staging or production | Complied — applied only to a throwaway local container (E8) |
| Do not send real OTP messages | Complied — none sent to any address or number |
| Do not reset credentials | Complied — password changes touched only synthetic test users in throwaway databases |
| Preserve unrelated changes | Complied — nothing stashed, reverted or committed beyond this report; pre-existing `apps/api/src/modules/returns/*` and `docs/production/*` modifications and untracked scratch directories are untouched |
| Do not claim tests passed without execution evidence | Complied — every pass/fail row is a command executed in this session (§2, Appendix A); predictions are labelled as predictions |
| Verification artefact cleanup | Scratch cookie harness terminated; ports 4180/4181 free; probe `iv-pg` container removed; temporary probe spec deleted and absent from `git status` |

---

## Appendix A — commands and recorded output

```bash
# E1 state
git rev-parse HEAD                                        # 2437936a629277a93b81a892ad4f579342fd9afb
git ls-remote origin refs/heads/feature/otp-auth-security-hardening
curl -s …/pulls?state=open                                # []
curl -s …/actions/runs?head_sha=2437936a…                 # total_count 0
curl -s …/actions/runs?branch=feature/otp-auth-security-hardening   # total_count 0
curl -s …/commits/2437936a…/check-runs                     # Vercel Preview Comments success

# E2 container suites  (apps/api)
npx vitest run src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts \
                src/__tests__/integration/password-login-regression.postgres.spec.ts \
                --no-file-parallelism
#  Test Files  2 failed (2)          Tests  6 failed | 46 passed (52)   Duration 33.39s
#  device-trust-lifecycle (28 tests | 3 failed) 10323ms
#  password-login-regression (24 tests | 3 failed) 14059ms

# E3–E4
pnpm --filter @scs/api test:unit    # 127 files, 2553 passed, 50.01s
pnpm --filter @scs/api typecheck    # exit 0
pnpm --filter @scs/api build        # TSC Found 0 issues; 435 files compiled

# E5–E7
pnpm --filter @scs/web test         # 7 files / 72 passed
pnpm --filter @scs/admin test       # 3 files / 39 tests: 37 passed, 2 failed
cd mobile && flutter test           # 158 passed
cd mobile && flutter analyze --no-fatal-infos lib test   # 15 issues, all info; exit 0

# E10 deployed behaviour
curl -X POST https://scs-api-staging.onrender.com/v1/auth/login/device-check \
     -H 'Content-Type: application/json' --data-binary @synthetic.json
# 201 {"canAutoLogin":false,"requiresOtp":true,"hasPassword":false}   (no Set-Cookie)
curl -i -X OPTIONS https://scs-api-staging.onrender.com/v1/auth/login/password \
     -H 'Origin: https://scs-platform-admin.vercel.app' \
     -H 'Access-Control-Request-Method: POST' \
     -H 'Access-Control-Request-Headers: content-type,x-device-trust'
# 204 access-control-allow-headers: Content-Type,Authorization,Idempotency-Key,If-Match,X-Device-Id
```

Browser and DDL harnesses (E8, E9) ran from `C:/Users/nabee/AppData/Local/Temp/` as scratch processes outside the repository; the cookie harness log excerpt is quoted in §5.2 and the harness was terminated after the run.

## Appendix B — external sources

- [Tracking Prevention in WebKit](https://webkit.org/tracking-prevention/) — ITP blocks all third-party cookies; first-party status is a prerequisite.
- [Full Third-Party Cookie Blocking and More](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) — Safari 13.1+ blocks script-initiated (XHR/fetch) third-party cookies across the board.
- [Next steps for Privacy Sandbox and tracking protections in Chrome](https://privacysandbox.google.com/blog/privacy-sandbox-next-steps) — phase-out reversed; current approach retained; Incognito blocks third-party cookies.
- [MDN: Third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies) — per-engine default state; Firefox Total Cookie Protection "separate cookie jar per site".
- [Introducing State Partitioning](https://hacks.mozilla.org/2021/02/introducing-state-partitioning/) — isolation applies to every embedded third-party resource, whether or not a tracker.
- [Tracking prevention in Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/tracking-prevention) — Balanced default blocks storage/cookies for list-enumerated trackers.
- [CHIPS](https://github.com/privacycg/CHIPS) and [MDN: Partitioned cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies/Partitioned_cookies) — `Secure` mandatory, partition key from the top-level registrable domain.
- [WebKit Features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/), [Safari 26.2](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/), [bug 292975](https://bugs.webkit.org/show_bug.cgi?id=292975) — CHIPS added, disabled, re-shipped.
- [MDN: Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) and [MDN: SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite) — `__Host-`/`__Secure-` prefix rules; site-vs-origin computation.
- [MDN: Site (glossary)](https://developer.mozilla.org/en-US/docs/Glossary/Site), [web.dev: SameSite explained](https://web.dev/articles/samesite-cookies-explained) — PSL-driven site boundaries.
- [Vercel: Rewrites](https://vercel.com/docs/routing/rewrites) — destination rewrites act as a reverse proxy without changing the browser URL; rewrite-caching caveat.
- [Render: Custom Domains](https://render.com/docs/custom-domains) — custom domain support with automatic TLS.
