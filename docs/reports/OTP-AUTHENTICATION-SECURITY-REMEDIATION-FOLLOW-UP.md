# OTP Security Remediation — Follow-Up on Findings B1, B5, B6 (and D4)

**Report version:** v1.0
**Date:** 2026-11-07
**Repository:** `nabeel2323/scs-platform`
**Branch:** `feature/otp-auth-security-hardening` (no PR opened — see §5.4)
**Verified starting SHA:** `2437936a629277a93b81a892ad4f579342fd9afb`
**Branch point (baseline `develop`):** `02b59d43f4421b1317eea6493e79cf9ebe066eb7`
**Commits produced by this pass:**

| SHA | Content |
|---|---|
| `5d360b48b5bea78a2862a36a9965d30e78165549` | Implementation + tests + comment-only migration edits (B1, B5, B6) — 8 files, 783 insertions / 63 deletions |
| `601fc92d0b3f5424e91c29fd229b4a467147eab8` | Documentation corrections (D1–D7) in ADR-0004, the target-architecture doc and the remediation report — 3 files, 313 insertions / 97 deletions |
| *this report's commit* | Added by the commit that follows `601fc92d`, and pushed as the branch head. A document cannot contain its own hash, so the final SHA is read with `git rev-parse HEAD` on `origin/feature/otp-auth-security-hardening`; both SHAs above are its ancestors and are verifiable with `git merge-base --is-ancestor`. |

**Source of findings:** `docs/reports/OTP-AUTHENTICATION-SECURITY-INDEPENDENT-VERIFICATION.md` — blocking findings **B1** (red container suites, failures F1–F6), **B5** (password change did not revoke device trust, reported as D3), **B6** (logout did not revoke when nothing was presented, reported as D2); documentation findings **D1–D7**; usability finding **D4**.

**Scope discipline.** Implementation and evidence only. **Nothing was merged, deployed, published or activated.** No Render/Vercel/Supabase setting was read for change or modified; migration `0066` was **not** applied to staging or production; no Twilio/SMTP/WhatsApp credential was created, enabled or exercised; no OTP message was sent; no credential was reset; no force-push.

---

## 0. Method and evidence classes

Same conventions as the two reports this one follows:

| Tag | Meaning |
|---|---|
| `[CODE]` | Read from source on this branch at the SHA above; `file:line` given. |
| `[TEST]` | Executed locally in this session; exact command and count in §5. |
| `[INF]` | Inference from code plus observed behaviour; chain spelled out. |
| `[NV]` | Not verifiable with the access available in this session. |

Two rules enforced. A control no test executes is described as *implemented*, never as *verified*. And nothing in this report contains a secret, credential, digest, OTP code, phone number, email address or token value.

**A change of habit worth naming.** v1.0 of the remediation report claimed the container suites were not run because "Docker is unavailable", and pointed at hosted CI for the proof. Docker *was* available. The suites were run, they were red, and pointing at a pipeline that cannot trigger for this branch would have left the change permanently unproven. Everything labelled runtime proof below is a command that was actually run in this session, with its output transcribed.

---

## 1. Executive summary and verdicts

| Dimension | Verdict | Basis |
|---|---|---|
| **B1 — the two PostgreSQL suites fail** | **Resolved.** The first run reproduced exactly the 6 failures the verification report predicted (3 in each file). All six are fixed and both files are green: **41 + 24 = 65 cases passed, 0 failed.** | `[TEST]` §5.1 |
| **B5 — password change left a trusted browser OTP-exempt** | **Resolved.** A successful change revokes every live credential for the account (`PASSWORD_CHANGE`), audits the count, and yields `{clear: true}` to the browser. A failed change revokes nothing. | `[CODE]` §3.1, `[TEST]` 5 container cases |
| **B6 — logout did not de-trust when nothing was presented** | **Resolved.** Logout now acts on two independent paths: the presented credential *and* the credential the closing session earned, via `created_by_session` maintained as a live anchor. | `[CODE]` §3.2, `[TEST]` 8 container cases |
| **Inherited session semantics / contradictory comment** | **Comment corrected, behaviour unchanged, and now pinned by test.** No unrelated session semantics were silently altered. | `[CODE]` §3.3 |
| **D4 — live credentials accumulate per browser** | **Not fixed — deliberately.** No reliable server-side browser identity exists in the current model; documented with four rejected strategies and a proposed separate ADR. | §4 |
| **D1–D3, D5–D7 documentation defects** | **Corrected**, in place, with the superseded wording shown as corrected rather than deleted. | §8 |
| **Regression** | **No regression observed.** Unit 2553, web 72, Flutter 158, typecheck, build, lint all green; admin shows only the 2 pre-existing failures, re-isolated at this SHA. | `[TEST]` §5 |
| **Hosted CI for this SHA** | **Does not exist and is not claimed.** `ci.yml` triggers only on `main`/`develop`. | §5.4 |
| **Staging readiness** | **NOT ready.** Two owner-prerequisites remain unfixed and one is new and blocking: the third-party-cookie question (§7 risk 1) and provider configuration (§7 risk 2). | §11 |

---

## 2. What was wrong before this pass, in the words of the evidence

The verification report's own runtime transcript is the starting point, quoted rather than paraphrased:

```
Test Files  2 failed (2)
  Tests  6 failed | 46 passed (52)      Duration 33.39s
```

and the two lifecycle gaps were structural, not cosmetic:

- **D3/B5** — `changePassword` updated the hash, audited `PASSWORD_CHANGE`, revoked sessions, and touched `device_credentials` not at all. Because `loginWithPassword` consults only the presented credential, the moment the *new* password was known a previously trusted browser logged in with no second factor. The incident sequence: device compromise → victim resets password → attacker's trusted browser is still exempt. That was the one unmitigated real-world sequence in the branch.
- **D2/B6** — `revokePresentedCredential` returns early when nothing is presented, so a logout carrying no cookie ended the session and left the exemption live. `created_by_session` existed precisely to prevent that, and `logout()` had the session row in hand and ignored it.

Both were described as closed in v1.0. They were not.

---

## 3. Implementation

### 3.1 B5 — password change revokes device trust

`apps/api/src/modules/identity/identity.service.ts:2162-2260` (`changePassword`). After the hash is written and the per-credential audit logged:

- `revokeAllDeviceCredentials(userId, 'PASSWORD_CHANGE')` (`:1707-1730`) revokes **every** live credential for the account. The method's signature gained the reason union (`ROTATION_REUSE | MANUAL | SESSION_REVOKED | PASSWORD_CHANGE`) and its docstring now names both callers and the rule they share: *the OTP exemption must not outlive the authentication that earned it*.
- When `revokedCount > 0`, one `auth.device_trust_revoked` audit event is written with `metadata: { revokedCount, reason }` — and nothing else. A test asserts the serialized entry contains no credential, no digest and no device label.
- Ordering matters and is commented at the call site: revocation happens only after the current-password check and the strength check have passed, so **a failed change revokes nothing** (wrong current password, policy-rejected new password, unknown user — all throw above the revocation).
- The login response carries `{ clear: true }` to the browser (`:1996` on the next untrusted login path, and `:1854` when the ceiling has passed), so a browser cannot keep presenting a credential the server already killed.
- Revocation is account-wide on purpose. It is the one response that does not depend on where an anchor points, which is why it is also the recommended containment action for a suspected copied credential.

### 3.2 B6 — session-anchored logout revocation

`logout()` (`identity.service.ts:961-990`) now revokes through **both** paths and reports a cookie clear if either fired:

```ts
const anchored = session
  ? (await this.revokeCredentialsBySession(session.id, session.userId)) > 0
  : false;
const cleared =
  (await this.revokePresentedCredential(presentedCredential, session?.userId ?? null, 'LOGOUT')) || anchored;
return { success: true, deviceTrust: cleared ? { clear: true } : undefined };
```

- **Path 1 — presented credential.** Unchanged behaviour for the clients that do send cookie + proof header today. Requirement 10 preserved.
- **Path 2 — `revokeCredentialsBySession(sessionId, userId, 'LOGOUT')`** (`:1796-1820`): `UPDATE device_credentials SET revoked_at, revoked_reason WHERE created_by_session = sessionId AND user_id = userId AND revoked_at IS NULL`. Nothing in the predicate is client-influenced — the session id comes from the row this request's own refresh-token digest resolved, and the write is bound to that session's user. So it can only ever touch a credential this account earned through this session; unrelated devices belonging to the same user are untouched, which is a required property and is tested.
- **The anchor is maintained, not frozen.** A session id changes on every rotation, so a pointer set only at enrolment would be stale within minutes. `anchorCredentialToSession` (`:1767-1790`) moves `created_by_session` whenever a trusted credential is re-earned: in `refreshToken` when `trust.status === 'trusted'` (`:920`), and in `loginWithPassword` immediately after the trusted session row is inserted (`:2044`). It is a no-op when nothing was presented, and it is scoped by `credentialHash` **and** `userId`, so it cannot move another account's row.
- **Why not derive lineage instead?** `sessions.replaced_by` is declared in the schema and **written by nothing in `apps/api/src`** (checked, not assumed). Reconstructing "which session did this credential earn" at logout time is therefore impossible today; that is the reason the link is maintained eagerly, and the reason it is recorded as a limitation (§7 risk 8).

### 3.3 The inherited session logic and its contradictory comment

The task said to inspect it, correct the comment if wrong, and not silently change unrelated session semantics. What was found:

- The comment claimed *"keep current device if specified"*. The code beneath it, byte-identical to baseline (`git show 02b59d43:…identity.service.ts:1685-1693`), does something different: when `deviceId` is present it revokes **every** session carrying that `deviceId` — including the caller's own — and when absent it calls `revokeChain(userId)`. The comment described the opposite of the behaviour.
- **The comment was corrected; the behaviour was not changed.** The asymmetry it creates against the new credential revocation — credentials revoked account-wide, sessions only for the named device — is recorded in the code comment and in ADR-0004 rather than silently fixed, because closing it is a session-semantics change outside these findings.
- **The behaviour is now pinned by test**, using session ids rather than counts, including which of the caller's own sessions survive. A future edit that changes it fails loudly instead of quietly.

### 3.4 B1 — the transport convention split, resolved toward the implementation

`DeviceTrustTransportInstruction` (`device-trust-cookie.ts:297-306`) declares exactly three shapes: install (`{credential, maxAgeSeconds}`), clear (`{clear: true}`), or say nothing (`undefined`). The fourth, `keep?: boolean`, documented as "present a live credential but do not touch the cookie", was **removed rather than implemented**: `applyDeviceTrustCookie` never read it, no call site ever set it, and on the wire "leave the cookie alone" is indistinguishable from no instruction at all. The live case actually needs a **re-issue**, because re-setting `Max-Age` from the remaining ceiling is what keeps the browser's expiry in step with the server-side slide. `password-login-regression` was updated to assert that re-issue; the stale expectation was not allowed to dictate the implementation, and the security behaviour was not weakened to satisfy it.

### 3.5 B1 — timestamp typing, proven by experiment rather than inference

F1–F3 were `TypeError: ….expires_at.getTime is not a function` in three lifecycle assertions about expiry, durable revocation and ceiling clamping. Root cause, established by direct experiment: under vitest/vite-node a raw `pool.query('SELECT *')` hydrates `timestamptz` as a **string**, while reads through drizzle hydrate a `Date`; a plain `node` + `pg` 8.23.0 process against the same container returned `Date` for every row. The fix is explicit conversion in the test helper (`asDate`, applied to the timestamp columns by `withDateColumns`), **not** reliance on runner coercion: an unparseable value throws rather than silently comparing garbage, so the three assertions keep their original strength.

### 3.6 B1 — F5 and F6, reconciled without losing the guarded property

- **F5** — the pre-existing audit test looked for an `auth.login` row that this branch renamed to `auth.otp_challenge` (`identity.service.ts:1983`) for the "correct password, untrusted device" case. The test now asserts the row that is actually written **and still asserts the property it was written to protect**: the identifier appears only as a keyed hash, never in clear. So hash-only-as-keyed-hash has runtime coverage again, and the rename's monitoring consequence is documented (§6, §7 risk 6) rather than left silent.
- **F6** — the email-normalization case asserted an `accessToken` on an untrusted device, but the designed fail-closed answer is `accessToken: ''` with `requiresOtp: true`. The case now asserts the intended response **and keeps** the normalization assertion, so email case/trim handling on the password path is proven end-to-end again.

---

## 4. D4 — credential accumulation: documented, deliberately not fixed

The instruction was explicit: implement only if the existing device/session model provides a reliable way to identify the same physical browser, and do not use the old client-generated UUID as proof of identity or trust. It does not.

| Candidate key | Why it is not reliable |
|---|---|
| `sessions.device_id` | The client-generated `localStorage` UUID. Using it as an identity claim re-imports audit finding S-1 through the side door — it is exactly the value whose copyability this branch exists to remove. |
| `sessions.device` (user-agent string) | Trivially spoofable, changes on every browser release, identical across every tab of one browser and often across a whole fleet of devices. |
| Source IP / TLS session | Shared by entire populations, rotates constantly, and unusable behind the proxy topology this deployment has (`TRUST_PROXY` is already a risk item). |
| "Revoke the oldest when a fifth appears" | Silently revokes a legitimate device the user still holds. A phone idle for 29 days loses trust while a second browser enrolled an hour ago keeps it — and the account owner has no signal for which of five indistinguishable rows is the laptop they stopped using. Revocation must be explainable. |

So the outcome is: the limitation is **written down** — a "Known limitation: one browser can hold more than one live credential" section in ADR-0004, plus §7 risk 7 here — with the proposed fix recorded as a **separate ADR**: a server-issued persistent *browser instance id*, minted as an `HttpOnly` cookie unrelated to trust, used only as a dedupe key so enrolment replaces the live row for that browser instead of adding one. That is a schema change, a cookie-surface change and a client-visible behaviour change, so bolting it onto a lifecycle fix would be exactly the weak workaround the instruction forbids.

What the interface does expose today, and what the interim mitigations are:

- `listDeviceCredentials` (`identity.service.ts:1732-1755`) returns per-row id, label, `createdAt`, `lastUsedAt`, `expiresAt` and `hardExpiresAt` — useful timestamps, no digest or digest prefix. A user with two browsers sees two distinguishable rows; a user with one browser used over three months may see several rows with the same label and different last-used times. Honest, not yet good.
- Mitigations that already work: `PASSWORD_CHANGE` revokes everything (§3.1), the device list revokes one named row (`MANUAL`, `:1658-1690`), and refresh-token reuse wipes the account's whole set (`ROTATION_REUSE`, `:872`).

---

## 5. Exact commands and results

Every command below was run in this session from `C:\TAIF\scs-platform`. Exit codes were captured to a file and grepped rather than inferred from a pipeline's tail, because a piped command masks the real status.

### 5.1 PostgreSQL integration (the two suites)

```
npx vitest run src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts \
               src/__tests__/integration/password-login-regression.postgres.spec.ts
→ Test Files  2 passed (2)
  Tests  65 passed (65)        Duration 32.30s        vitest_exit=0
```

| File | Cases | Result |
|---|---|---|
| `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts` | **41** (was 28; +8 logout-anchor, +5 password-change) | passed |
| `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` | **24** | passed |
| **Total** | **65 passed, 0 failed** | green |

Both run against Testcontainers `postgres:16-alpine` with the whole root `infra/drizzle/migrations` directory applied in sorted order, so `0066` executes through the same path the release scripts use.

**Intermediate runs, because the path to green was not a straight line.** After adding the B5 cases, four failed with `expected [Function] to throw … but got 'Current password is incorrect'`. Cause: my own tests mutate the single `users` row pair created in `beforeAll`, so later tests were no longer testing revocation at all. Fixed properly — `beforeEach` restores a `sharedPasswordHash` captured in `beforeAll`, with a comment explaining why sessions deliberately accumulate but passwords must not. Weakening the assertions would have made the suite green while proving nothing.

A second defect was timing-related and real: an assertion that `last_used_at` advanced could compare a host-generated `Date` against a DB `DEFAULT now()` value from a container whose clock sat ~5 ms ahead of the Windows host. The test now pins the baseline from the host clock before validating and asserts strict advance. That is a harness lesson worth recording for the next container test anyone writes here.

### 5.2 API unit, typecheck, build, lint

| Command | Result |
|---|---|
| `pnpm --filter @scs/api test:unit` | **127 files, 2553 tests passed, 0 failed** (45.70 s), exit 0 |
| `pnpm --filter @scs/api typecheck` (`tsc --noEmit`) | **0 errors**, exit 0 |
| `pnpm --filter @scs/api build` | **Successfully compiled: 435 files**; `TSC Found 0 issues`, exit 0 |
| `pnpm --filter @scs/api lint` | **0 errors, 313 warnings**, exit 0 — the same repo-wide pre-existing count as v1.0 |
| `npx eslint` over the 7 touched API files | **0 errors, 5 warnings**, all pre-existing: `identity.service.ts:32` `hashEmail`, `:41` `featureFlags`; `password-login-regression…spec.ts:36:10` `users`, `:36:17` `sessions`, `:37:10` `eq` |

**The 5 warnings were checked against baseline, not assumed.** `git show HEAD:…password-login-regression.postgres.spec.ts | npx eslint --stdin --stdin-filename src/…` reports the identical three warnings at the identical positions, so this pass introduced **zero** new lint findings. The three unused imports are pre-existing in that spec (`users`/`sessions` appear only inside SQL string literals); leaving them alone is outside this pass's scope, and removing them would be an unrelated change.

### 5.3 Clients

| Command | Result |
|---|---|
| `pnpm --filter @scs/web test` | **7 files, 72 passed, 0 failed**, exit 0 |
| `pnpm --filter @scs/admin test` | **3 files, 39 tests: 37 passed, 2 failed**, exit 1 |
| `cd mobile && flutter test` | **158 tests passed**, exit 0 |

The 2 admin failures are the same two `src/__tests__/management.test.tsx` cases (product-moderation keyboard navigation / "Complete description") that v1.0 isolated as pre-existing: re-running that file with the **baseline** `vitest.config.ts` and with the current config gives `2 failed | 8 passed (10)` both times. Nothing in this pass touches admin, and the failures are reported rather than deleted. `[TEST]`

Contracts typecheck/build, web lint, admin lint, `flutter analyze` and the six-file API subset run were not repeated in this pass: contracts, web, admin and mobile code are untouched by these commits (the client files are unchanged since the first remediation pass, whose results are recorded in §8.1 of the remediation report).

### 5.4 Hosted CI — none exists, and why

`.github/workflows/ci.yml:12-16` triggers only on `push`/`pull_request` targeting `main` or `develop`. Pushing `feature/otp-auth-security-hardening` therefore produces **zero** workflow runs, and there is no PR for this branch. **No hosted CI result is claimed for `2437936`, for `5d360b4`, for the docs commit, or for this report's commit.** Obtaining one requires opening a PR against `develop` — an owner action, deliberately not taken here.

This matters for one specific reason: `pnpm-lock.yaml` is unchanged from baseline, so CI would resolve the same vitest and `pg` versions — which is exactly why F1–F3 *would* have reproduced there. The fix is now in the test helper, so CI should be green on those cases too, but that is a prediction, and predictions are not evidence.

---

## 6. Test coverage added or corrected (what the assertions actually prove)

**Logout — the five required cases, plus three more (§3.2 above; the suite block starts at `device-trust-lifecycle.postgres.spec.ts:817`).**

1. Logout **with** a valid credential presented → revoked, `validateDeviceCredential` answers `revoked`, and the next password login is met with `requiresOtp` and `{clear: true}` — i.e. **a revoked credential cannot re-establish trust**.
2. Logout **without** any credential → the session-anchored path still revokes it. This is the D2 gap, closed.
3. Logout **with the cookie attached but no proof header** → the test first proves `readPresentedDeviceCredential(req)` returns `null` (the CSRF gate is what makes the header necessary), then proves the anchored path de-trusts anyway.
4. Logout while an **unrelated device** credential exists → the unrelated credential stays live and its session stays unrevoked; the anchor is not an account-wide sweep. Presenting *another device's* credential, by contrast, revokes both rows — because path 1 must keep honouring requirement 10 — and the rationale is written at the test.
5. **Repeated logout** → idempotent: one revoked row, unchanged `revoked_at` value, still `revoked` on validation.
   6. The anchor survives refresh rotation and a trusted re-login.
   7. A credential minted by `issueDeviceCredential` with **no** anchor is still de-trusted, because the trusted login moved the anchor onto the caller's own session.
   8. A logout that presents nothing and owns nothing yields `deviceTrust === undefined` — no spurious cookie-clear header.

**Password change — the five required cases (§3.1).** Revokes all of the account's live credentials with reason `PASSWORD_CHANGE` while a second account's credential stays live; both of the owner's browsers are then challenged with `requiresOtp` + `{clear: true}`; a wrong current password and a policy-rejected new password revoke nothing and trust survives; the `auth.device_trust_revoked` event carries `{revokedCount, reason}` with no credential/digest/label in the serialized entry, alongside the per-credential `PASSWORD_CHANGE` audit row; session behaviour is pinned by session id; and re-enrolment after the change produces a different live credential while the old one stays revoked.

**Transport (F4).** Both integration specs now assert the same instruction shapes, and the removed `keep` field is asserted to be *not* emitted.

**Pre-existing suites that had to be reconciled, not deleted:** `device-trust-cookie.spec.ts` (44) and `auth.controller.spec.ts` (38) updated for the instruction-type change; `password-login-regression.postgres.spec.ts` (24) for F4/F5/F6; the raw-row timestamp helper for F1–F3.

---

## 7. Remaining risks and limitations

1. **The cross-site cookie question is unresolved and is now the blocking one.** `[NV]` On the real staging topology — Vercel frontends, Render API, with `*.vercel.app` and `*.onrender.com` both being Public Suffix List entries — each host is its own *site*, so `scs_device_trust` is a **third-party cookie** and Safari ITP is expected to refuse to store it. No real browser was exercised in this session. If that reproduces, `SameSite=None; Secure` is not sufficient and device trust silently never engages (every login asks for OTP — the safe direction, but not the product). Fixing it means either aligning the staging origins under one registrable domain or a first-party credential path.
2. **No delivery provider is configured.** `[NV]` Provider-first, then this code — with no provider, the first password login from every previously "trusted" browser fails closed. Doubly relevant now that a password change also de-trusts.
3. **Hosted CI does not exist for any SHA of this branch** (§5.4). Local container green proves Postgres semantics; it proves nothing about the pipeline, the runner image or CI dependency resolution.
4. **Anchor follows whoever presents credential + tokens.** An attacker holding both a copied credential and live tokens re-anchors it to their own session, so their logout revokes their credential, not the victim's original. Not a bypass — presenting the credential already requires having it, and they need valid tokens for every request that matters, so the credential adds nothing to their power. The robust containment is account-wide revocation (B5 or the device list). Recorded because the asymmetry reads as a hole if left unstated.
5. **Session vs credential revocation asymmetry in `changePassword`** (§3.3): credentials all devices, sessions only the named device. Deliberately left as-is to avoid an unrequested session-semantics change; closing it is a decision for the security owner.
6. **`auth.login` → `auth.otp_challenge` rename has monitoring consequences** (`identity.service.ts:1983`, `actorType: 'SYSTEM'`). Saved searches, dashboards and alert rules keyed on `auth.login` will under-count password attempts from deployment, and role-keyed alerts will not see the challenge rows. The test now covers the property; nobody has updated an alert rule, because none is observable from here.
7. **D4 unfixed**: live credentials accumulate per browser; the device list can show several indistinguishable rows for one physical browser. Interim mitigations exist (§4); the real fix needs its own ADR.
8. **`sessions.replaced_by` is declared but written by nothing.** If a future change starts writing it, the two mechanisms must be reconciled rather than allowed to disagree; today only the anchor is load-bearing.
9. **Mobile does not participate in device trust** (no cookie jar, `mobile/lib/services/api_service.dart:85`), so the S-1 convenience win is web/admin-only. `[NV]` — no device or emulator run in this session.
10. **Throttle storage is per-IP and shared until `TRUST_PROXY` is set correctly** — then every client shares one bucket, which throttles legitimate logins too. Pre-existing for the OTP profiles, newly relevant to `device-check`.
11. **Out-of-scope observation, recorded not fixed:** `verifyOtp` writes a normalized phone number in plaintext into `auth.login` audit metadata (`identity.service.ts:396`), whereas the device-check and credential paths hash their identifier. Pre-existing, untouched by this branch, not one of the findings.
12. **Lifetimes are judgement calls:** 30 d sliding / 90 d absolute (`identity.service.ts:69-70`) are code constants with no product requirement behind the numbers.
13. **The 2 admin `management.test.tsx` failures remain**, isolated as pre-existing and left failing (§5.3).

---

## 8. Documentation updates

| Document | What changed |
|---|---|
| `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md` | Bumped to **v1.1** with an amendment table that shows each falsified v1.0 claim, its status, and what replaced it — corrected in place rather than silently rewritten. New §3.4 (password-change revocation), §3.5 (session-anchored logout), §6.1 (comment-only migration edits and why they are safe), §8.3/§8.3.1 (the red first run, F1–F6 mapped and resolved, the 65-case green result, and the absence of hosted CI), §8.2 fourth test matrix. §1 verdicts, §3.1 requirement table, §3.2 lifecycle (five → **seven** revocation paths; two logout paths), §4 refs, §7.1 files, §8.1 two-column results, §9 risks (1 rewritten, 3/11/12/13/14/15 added), §10 steps 6–8, §11 acceptance mapping and §12 all corrected. Every `file:line` citation shifted by the code changes was re-verified against the current source. |
| `docs/architecture/ADR-0004-SERVER-ISSUED-DEVICE-TRUST-CREDENTIAL.md` | Status now names this report. Revocation table: logout's two paths, a `Password changed` row, an anchor-movement row, plus prose on why logout needs both paths and the credential/session asymmetry. Transport paragraph documents the three instruction shapes and why `keep` was removed rather than implemented. New **"Known limitation: one browser can hold more than one live credential (finding D4)"** with the four rejected strategies, what `listDeviceCredentials` exposes, and the proposed separate ADR. **D1** — the fabricated S-1 test name replaced with the real one. **D7** — the "## Verification" section rewritten with measured numbers (41 + 24 = 65 passed locally) and an explicit statement that a feature-branch push produces no CI runs, so no hosted CI success is claimed. |
| `docs/production/OTP-S1.34-MULTI-CHANNEL-AUTH-TARGET-ARCHITECTURE.md` | Endpoint table: `/v1/auth/logout` row now describes both revocation paths; new `/v1/me/credentials/change-password` row records the credential-revocation effect and that a failed change revokes nothing. |
| `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-UP.md` | This document (new). |
| `infra/drizzle/migrations/0066_device_trust_credential.sql` | Comments only (see §9). |

---

## 9. Migration changes

**None in DDL.** `0066_device_trust_credential.sql` gained two comment expansions — the `created_by_session` security-property bullet and column note (it is now a live anchor, not passive provenance), and the `revoked_reason` list, which now names `PASSWORD_CHANGE` and explains every value. Line numbers in the file shifted (`:87-138` → `:89-154`; the file is 180 lines), which is the only "change" this pass made to it.

Why that is safe, checked rather than assumed: the file is `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, so re-running it is a no-op; and the migration ledger stores **filenames only** — `_migration_log (name, applied_at)` at `apps/api/infra/drizzle/migrate.ts:105-107`, `:71` and `migrate-pg.ts:59-62`, `:99` — with no content hash stored or compared anywhere in the runners or the release workflow, so a comment edit cannot invalidate a recorded migration.

`revoked_reason` is deliberately an unconstrained `VARCHAR(32)` (`:137`), which is what let `PASSWORD_CHANGE` be added with **no migration at all**. The trade-off is recorded: nothing at the database layer rejects a typo'd reason, so the set is enforced by the call sites and by a container test that asserts the reason string rather than merely that `revoked_at` is set.

**Status unchanged: migration `0066` has not been applied to staging or production, and was not applied anywhere in this session.** It is exercised only against throwaway Testcontainers databases. Rollback remains `DROP TABLE IF EXISTS public.device_credentials;` (documented in the file header at `:73-79`); the old `device_trust` table stays in place and unread, so an emergency revert is a code redeploy, not a data repair.

---

## 10. Files changed by this pass

| File | + / − | Purpose |
|---|---|---|
| `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts` | 482 / 14 | F1–F3 helper typing, 8 logout-anchor cases, 5 password-change cases, clock-pinning repair, `beforeEach` password restore |
| `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` | 79 / 20 | F4 transport expectation, F5 audit action, F6 requiresOtp response |
| `apps/api/src/modules/identity/identity.service.ts` | 173 / 13 | B5 revocation, B6 two-path logout, `anchorCredentialToSession`, `revokeCredentialsBySession`, corrected `changePassword`/`setupCredentials` comments |
| `apps/api/src/common/auth/device-trust-cookie.ts` | 10 / 3 | `keep` removed from the instruction type; docblock explains why |
| `apps/api/src/modules/identity/identity.schema.ts` | 8 / 2 | `createdBySession` and `revokedReason` docstrings |
| `apps/api/src/__tests__/unit/common/device-trust-cookie.spec.ts` | 4 / 2 | instruction-shape expectations |
| `apps/api/src/__tests__/unit/identity/auth.controller.spec.ts` | 4 / 2 | instruction-shape expectations |
| `infra/drizzle/migrations/0066_device_trust_credential.sql` | 23 / 7 | **comments only** (§9) |
| `docs/architecture/ADR-0004-SERVER-ISSUED-DEVICE-TRUST-CREDENTIAL.md` | 121 / 25 | D1–D7 corrections, D4 limitation section, measured verification |
| `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md` | 190 / 71 | v1.1 amendment and corrections |
| `docs/production/OTP-S1.34-MULTI-CHANNEL-AUTH-TARGET-ARCHITECTURE.md` | 2 / 1 | endpoint rows for logout and change-password |
| `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-UP.md` | new | this report |

Unrelated working-tree changes — `apps/api/src/modules/returns/commission-reversal.service.ts`, `returns.service.ts`, the `P13-*` documents, `SCS-B2B-FRAMEWORK-COMPLETENESS-REPORT.html`, and the `.audit-scratch/` / `.m73b6-scratch/` directories — were **not staged, not committed, not reverted and not stashed**. The staged file list for each commit is in the commit records.

---

## 11. Explicit readiness recommendation

**Ready: the branch is ready for review as a code change against `develop`.**

- B1 is resolved with measured evidence: 65 container cases green, unit 2553 green, typecheck and build clean, no new lint findings, no test deleted or weakened to get there.
- B5 and B6 are closed in the implementation and — the part that matters — closed by tests that run against real Postgres, including the containment properties they were added for (a revoked credential cannot re-establish trust; an unrelated device is untouched).
- D4 is documented honestly with a proposed follow-up rather than papered over.
- The documentation defects (D1–D7) are corrected in place, and the single worst one — a claim of CI evidence for a pipeline that cannot trigger — is replaced by what actually happened.

**Not ready: staging preparation.** Do not deploy or activate this branch yet, and do not treat local green as sufficient. Three things stand in front of it, in order:

1. **Answer the third-party-cookie question with a real browser** (§7 risk 1). This is not a nicety: if the credential cannot be stored across the staging origins, device trust never engages and the whole S-1 convenience benefit is absent in staging, while every login pays an OTP. The fix may be a topology decision, not a code decision.
2. **Configure a real OTP delivery provider, then set `TRUST_PROXY`** (§7 risks 2 and 10) — provider first, code second, or the first login from every previously trusted browser fails closed.
3. **Open a PR against `develop` so a hosted CI run exists for the final SHA, and read it** (§5.4) — not to merge, to obtain the evidence that does not currently exist.

Then the remaining steps in §10 of the remediation report apply unchanged (apply `0066` via the normal database-release path, set the cookie configuration deliberately, confirm the boot gate did not trip, announce the one-time re-verification, and re-test the admin defect that started all of this with a provider deliberately left unconfigured).

**One sentence for the decision-maker:** the security mechanism is now correct and demonstrated against a real database, the two revocation gaps that made it partly theoretical are closed, and what remains unproven is the deployment environment it has to live in — the browser cookie behaviour on the actual staging domains, and a CI run that this branch cannot yet cause.
