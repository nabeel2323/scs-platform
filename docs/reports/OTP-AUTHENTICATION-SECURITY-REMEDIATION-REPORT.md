# OTP Authentication Security Remediation — S-1, S-2 and the Admin Delivery Defect

**Report version:** v1.1 (amended — see immediately below)
**Date:** 2026-11-07
**Repository:** `nabeel2323/scs-platform`
**Branch:** `feature/otp-auth-security-hardening`
**Baseline (branch point):** `develop` = `02b59d43f4421b1317eea6493e79cf9ebe066eb7`
**Source of findings:** `docs/reports/OTP-IMPLEMENTATION-AND-STAGING-READINESS-AUDIT.md` (branch `audit/otp-staging-readiness-2026-11-06`), §8 findings **S-1**, **S-2** and the §1/§10 item *"the admin Phone-OTP tab discards the API's `success:false` result and advances to the code-entry step anyway"* (`apps/admin/src/app/auth/login/page.tsx:95-96` at baseline).

> ## v1.1 amendment — what changed in v1.0 of this report was wrong
>
> v1.0 was written when the two Testcontainers suites had not been executed. An
> independent verification pass (`docs/reports/OTP-AUTHENTICATION-SECURITY-
> INDEPENDENT-VERIFICATION.md`, findings **D1–D7** and **F1–F6**) ran them, found
> **6 failing cases**, and identified two real security-lifecycle gaps that this
> report had described as closed. Those are now fixed and the claims below are
> corrected. The authoritative record of the fixes, their tests and their measured
> results is **`docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-
> UP.md`**; this document stays the description of the S-1/S-2/admin change, with
> its false statements repaired rather than deleted, so the correction is
> auditable.
>
> | v1.0 claim | Status in v1.1 | What replaced it |
> |---|---|---|
> | §1/§8.3: "Docker is unavailable on this machine", container suites "**NOT** executed here", "they will run in hosted CI" | **False on both halves.** | Both suites run locally against Testcontainers: **65 cases passed** (§8.3). And no hosted CI run exists for this branch's SHA at all — `ci.yml` triggers only on `main`/`develop` (§8.3). |
> | §3.2 step 5: "**five** entry points" for revocation, logout covered by `:955-961` | **Understated and partly wrong.** | **Seven** revocation paths incl. `PASSWORD_CHANGE` and a second, session-anchored logout path (`identity.service.ts:961-983`, `:1796-1826`). |
> | §11: "Revoked credential cannot re-establish trust — **Met**" | **Met only after the fix.** D2 showed a logout presenting no cookie left the credential live. | Session anchor (`created_by_session`) is now maintained by rotation and trusted login and drives logout de-trust (B6). |
> | Implied: password change de-trusts a device | **Was false (D3).** A compromised device stayed OTP-exempt through the victim's own password reset. | `changePassword` now revokes every credential for the account with reason `PASSWORD_CHANGE` (B5). |
> | §3.2 step 4 / `DeviceTrustTransportInstruction`: `{keep:true}` means "present but don't touch" | **Dead code and a false advertisement (D5).** | The field is deleted; three instruction shapes remain, and both integration specs now assert the transport they share (§3.2 step 4). |
> | Silent on the `auth.login` → `auth.otp_challenge` action rename (D6) | **Documented now**, with its monitoring consequence. | §3.2 step 1 note and §9 risk 11. |
> | ADR-0004 promised "Logout → revoked `LOGOUT`" and cited a test that does not exist (D1, D2, D7) | **Corrected in ADR-0004.** | Real test name, honest revocation table, measured verification section. |
> | Silent on live-credential accumulation (D4) | **Not fixed — documented as a limitation with a rejected-strategy table and a proposed separate ADR.** | §9 risk 12; ADR-0004 "Known limitation". |

**Scope of this change.** Code and documentation only, on a dedicated feature branch. **Nothing was merged, deployed or published. No Twilio/SMTP/WhatsApp credential was created, changed or enabled. No Render or Vercel setting was touched. No administrator credential was reset. No production or staging data was modified. Migration `0066` was written and tested against a throwaway database, and was NOT applied to staging or production.** The v1.1 follow-up changed only comments in that migration file — no DDL, so no checksum or re-application concern.

---

## 0. Method and evidence classes

Same conventions as the audit that produced these findings:

| Tag | Meaning |
|---|---|
| `[CODE]` | Read from source on this branch; `file:line` given. |
| `[TEST]` | Executed locally in this session; command and count in §8. |
| `[CI-REQUIRED]` | In v1.0 this meant "authored but not executed here". **Superseded for the two container suites**: they were executed locally against Testcontainers in the follow-up pass and are tagged `[TEST]` below. The tag still applies to anything requiring a hosted workflow, which does not exist for this branch (§8.3). |
| `[INF]` | Inference from code plus observed behaviour; chain spelled out. |
| `[NV]` | Not verifiable with the access available. |

Two rules were enforced. First, a control that no test executes is described as *implemented*, never as *verified*. Second, no secret, OTP code, phone number, email address, digest or token value appears in this report; where presence matters, only the name is given.

---

## 1. Executive summary and verdicts

All three defects are remediated in code, with tests behind each. The parts that only a real Postgres can prove — constraints, indexes, cascade and sliding-window semantics — **have now been executed** against a Testcontainers database: `device-trust-lifecycle.postgres.spec.ts` (41 cases) and `password-login-regression.postgres.spec.ts` (24 cases) report **65 passed, 0 failed** (§8.3). Two lifecycle gaps that v1.0 described as closed were found open by independent verification and are fixed here: password change did not revoke device trust (**D3/B5**), and logout presenting no cookie did not de-trust the credential it had just ended (**D2/B6**). What remains unproven is not the database behaviour but the *hosted* pipeline: there is no CI run for this branch's SHA (§8.3), and no real browser has exercised the cross-site cookie (§9 risk 3, §10 step 7).

| Dimension | Verdict | Basis |
|---|---|---|
| **S-1 — client UUID as second-factor bypass** | **Remediated.** Trust now requires a server-minted 256-bit credential presented in a `Secure HttpOnly` cookie plus a same-origin proof header; the `deviceId` in the request no longer influences any trust decision. | `[CODE]` §3, `[TEST]` §8.1 (44 + 38 + 15 unit specs), `[TEST]` §8.3 (41 lifecycle cases against a real container) |
| **S-2 — unauthenticated, unthrottled, disclosing `device-check`** | **Remediated.** Response collapsed to the constant `{checked:true}`, guarded by a named `device-check` throttler plus a per-identifier budget, identifier normalized through the shared rule, audit writes a keyed hash only. | `[CODE]` §4, `[TEST]` §8.1/§8.2 |
| **Admin OTP silent success** | **Remediated.** The admin tab advances to code entry only on an accepted delivery; uncertainty and unavailability get distinct copy, an in-flight guard stops duplicate sends, and the retry affordance obeys the API's own `Retry-After`. | `[CODE]` §5, `[TEST]` §8.2 (16 cases) |
| **Delivery honesty across all clients** | **Remediated in the shared contract.** One classifier (`@scs/contracts`) plus a Dart mirror now reads the provider vocabulary; no client writes "code sent" on an unconfirmed send. | `[TEST]` §8.2 (6 + Flutter cases) |
| **Trust revoked when the password changes (D3)** | **Remediated in the follow-up.** Every credential for the account is revoked with reason `PASSWORD_CHANGE`, an audit event records the count, a failed change revokes nothing, and the previously trusted browser is met with `requiresOtp` plus a cookie clear. | `[CODE]` `identity.service.ts:2162`, `[TEST]` §8.3 (5 cases) |
| **Trust revoked by logout with no cookie presented (D2)** | **Remediated in the follow-up.** `created_by_session` is kept as a live anchor — carried forward by refresh rotation and trusted password login — and logout de-trusts the anchored credential whatever the request presents. | `[CODE]` `identity.service.ts:961-983`, `:1767-1826`, `[TEST]` §8.3 (8 cases) |
| **Live-credential accumulation (D4)** | **Not fixed — documented limitation.** No safe dedupe exists without a new server-issued browser identity; four candidate strategies were rejected on security grounds and a separate ADR is proposed. | §9 risk 12; ADR-0004 "Known limitation" |
| **Authentication regression** | **No regression observed.** Full API unit suite green; web green; admin failures proven pre-existing; Flutter green; typecheck/build clean. | `[TEST]` §8.1, §8.4 |
| **Runtime proof against a real database** | **OBTAINED locally** — 65 container cases passed on this machine (§8.3). The v1.0 sentence "Docker is unavailable on this machine" was wrong as applied to the follow-up pass. | §8.3 |
| **Hosted CI for this SHA** | **NOT obtained, and unobtainable without a PR.** `.github/workflows/ci.yml` triggers only on `main`/`develop`, so a feature-branch push produces zero runs. No CI success is claimed. | §8.3 |
| **Staging activation** | **NOT ready — and out of scope by instruction.** Provider configuration, `TRUST_PROXY`, migration application and the first-login UX consequence remain owner actions. | §9, §10 |

**The one operational consequence to read before merging.** Server-issued trust starts empty: every browser and device that was previously "trusted" by a `localStorage` UUID is now untrusted, so the next password login from each one requires an OTP. Until a real delivery provider is configured (§10 step 1), those logins fail closed with *"OTP delivery is currently unavailable"*. That is the correct security behaviour and it is exactly the audit's S-1 fix working as designed — but it means **this branch must not be activated in staging before SMS/email delivery is provisioned.**

---

## 2. What was wrong, in one paragraph each

**S-1 (High).** `checkDeviceTrust` matched `(userId, deviceId)` and a 30-day `created_at`, and ignored `revoked_at` by explicit comment; `deviceId` was an unauthenticated UUID that the browser generated, kept in `localStorage`, and echoed back in the body and `X-Device-Id`. Revocation therefore could not remove trust, and **a stolen password plus a copied `deviceId` produced a full session with no second factor** — the exemption travelled with the identifier instead of with the device `[CODE: baseline identity.service.ts:1549-1567, 1767-1777; apps/admin/src/lib/auth.ts:305-316]`.

**S-2 (High).** `POST /v1/auth/login/device-check` answered `{canAutoLogin, requiresOtp, hasPassword}` to an unauthenticated caller, with no throttler on the route and none registered globally, and it read the **raw** email where every other auth path normalizes. That is a free account-enumeration oracle (`hasPassword:false` separated "no such account" from "account without a password") and a trusted-device pairing oracle `[CODE: baseline auth.controller.ts:177-180, identity.service.ts:1717-1741]`.

**Admin silent success (user-visible defect).** `handleRequestOtp` awaited `requestOtp(phone)` and moved to the verify stage without reading the result, so a provider rejection looked like a slow send: the operator sat waiting for a code that was never dispatched `[CODE: baseline apps/admin/src/app/auth/login/page.tsx:95-96]`.

---

## 3. S-1 — Server-issued device trust

### 3.1 Architecture

```
Browser                          API                                   Postgres
  │  POST /v1/auth/login/password │                                     │
  │  {email,password,deviceId}    │                                     │
  │  Cookie: scs_device_trust ────┤ (1) readPresentedDeviceCredential   │
  │  x-device-trust: 1 ───────────┤     cookie AND proof header, else   │
  │                               │     treated as nothing presented    │
  │                               ├─(2) validateDeviceCredential ──────►│ SELECT by SHA-256 digest
  │                               │◄──── status: trusted|revoked|…      │  + slide / clamp / expire
  │                               │                                     │
  │                 [trusted]─────┤ issue JWT pair; cookie kept in sync │
  │                 [not trusted]─┤ requiresOtp:true, OTP requested     │
  │                               │                                     │
  │  POST /v1/auth/otp/verify ────┤ (3) second factor satisfied ───────►│ INSERT digest (0066)
  │ ◄─── Set-Cookie scs_device_trust   credential minted, secret ONLY in │
  │      HttpOnly; Secure; SameSite=None; Max-Age=90d    the header      │
```

Every element of the requirement list maps to a specific place in the code:

| Requirement (task §2) | Implementation | Evidence |
|---|---|---|
| 1. A client UUID alone must never establish trust | `loginWithPassword` decides trust **only** from `validateDeviceCredential`; `deviceId` is written to the session row as provenance for `revoke-by-device` and consulted nowhere else | `[CODE]` `apps/api/src/modules/identity/identity.service.ts:1945-1949` (the comment states the rule at `:1945-1947`), session write at `:2030-2036`, anchor move at `:2044` |
| 2. Server generates and validates the credential | `crypto.randomBytes(32)` → base64url; validation is a digest lookup, never a client-supplied match | `[CODE]` `identity.service.ts:1555-1590`, `:1599-1651` |
| 3. Opaque credential in a Secure HttpOnly cookie with SameSite and expiry | `scs_device_trust`, host-only path, `HttpOnly`, `SameSite` from config, `Max-Age` = remaining hard ceiling | `[CODE]` `apps/api/src/common/auth/device-trust-cookie.ts:41`, `:265-286`, applied at `:323`; `auth.controller.ts:86-95` |
| 4. Only a hash stored server-side | `credential_hash = SHA-256(secret)`, plus a DB `CHECK` that the column really is 64 lowercase hex | `[CODE]` `identity.service.ts:2667` (`hashToken`), `infra/drizzle/migrations/0066_device_trust_credential.sql:153` |
| 5. Bound to user and lifecycle | `user_id NOT NULL … ON DELETE CASCADE`; `created_by_session → sessions ON DELETE SET NULL`, kept current as the logout anchor (§3.5); owner mismatch is its own status | `[CODE]` migration `:93`, `:111`; `identity.service.ts:1621-1624`, `:1767-1790` |
| 6. Revoked credentials establish nothing | `if (row.revokedAt) return {status:'revoked'}` before any slide; callers branch only on `'trusted'` | `[CODE]` `identity.service.ts:1627`, `:91-105` |
| 7. Expiration enforced | sliding 30 d, hard 90 d; past either ⇒ durable `revoked_at` with reason `EXPIRED`; slides clamp at the ceiling | `[CODE]` `identity.service.ts:67-70`, `:1630-1650`; migration `CHECK (expires_at <= hard_expires_at)` `:141` |
| 8. No cross-user reuse | UNIQUE digest index ⇒ at most one owner; a digest owned by another account returns `user_mismatch` and is never trusted | `[CODE]` migration `:164-165`, `identity.service.ts:1613-1624` |
| 9. Existing login/refresh security preserved | `loginWithPassword` keeps the 5/900 s per-email cap, the unknown-user/no-password/wrong-password invariant, and the OTP-required branch; refresh keeps rotation + reuse detection, which now also revokes the account's device credentials | `[TEST]` `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` (24 cases, executed — §8.3); `[CODE]` `identity.service.ts:868-873`, `:926`, `:1848-1866` |
| 10. Logout and revocation have defined behaviour | Logout de-trusts through **two** paths — the presented credential and the session anchor — and clears the cookie whenever either removed something; `revoke-by-device` de-trusts too; the user-facing device list can remove a single device; refresh-token reuse wipes every credential for that account; **a password change now wipes them too** (§3.4) | `[CODE]` `identity.service.ts:961-990`, `:1658-1690`, `:1796-1820`, `:2226`; `auth.controller.ts:238-253`; `profile.controller.ts:181-198` |
| No silent retention of the old localStorage UUID | The old `checkDeviceTrust` path is deleted; the client UUID is still *sent* (the API accepts it as provenance) but there is no code path in which it grants trust, and no fallback that would honour it if the cookie is missing | `[CODE]` `identity.service.ts:1946-1949`, `device-trust-cookie.ts:210-221` |

### 3.2 Trusted-device lifecycle (what actually happens, in order)

1. **Mint** — only after a second factor is satisfied. `verifyOtp` (phone) and `verifyEmailOtp` call `issueDeviceCredential(userId, {sessionId, label})` (`identity.service.ts:402`, `:830`). A password login that merely *looks* familiar mints nothing.
2. **Transit** — the secret leaves the process exactly once, in a `Set-Cookie` header. `transportDeviceTrust` **deletes** `deviceTrust` from the service result before the body is serialized (`auth.controller.ts:87-95`), so the value cannot appear in JSON, in an audit row, or in any log; pino additionally redacts `cookie`/`set-cookie` (`main.ts:114-120`).
3. **Present** — the browser attaches it automatically; the API reads it only through `readPresentedDeviceCredential`, which returns `null` unless the same-origin proof header is also present and the value matches `/^[A-Za-z0-9_-]{43}$/` (`device-trust-cookie.ts:58`, `:198-221`).
4. **Validate / slide** — digest lookup → owner check → revocation check → expiry check (durable) → slide `expires_at` to `min(now+30d, hard_expires_at)` and stamp `last_used_at` (`identity.service.ts:1599-1650`). On a trusted refresh the cookie's `Max-Age` is rewritten to the *remaining* ceiling so client and server agree (`:913`, `:1848-1866`). The service returns one of exactly three transport instructions — mint (`{credential, maxAgeSeconds}`), re-set (`{credential, maxAgeSeconds}` from `keepTrustedCredential`) or clear (`{clear: true}`) — and **both** integration specs assert that shared shape. v1.0 also declared a fourth instruction, `keep?: boolean` ("present a live credential but do not touch the cookie"), which `applyDeviceTrustCookie` never read: a field advertising a capability nothing implemented, and the reason the two specs disagreed (finding **D5/F4**). It is deleted, not implemented, because re-setting the cookie *is* the behaviour that slides the browser's `Max-Age`; a no-op would have left a live credential with a stale expiry date.
5. **Revoke** — **seven** entry points (v1.0 said five; the two missing ones are the two gaps the verification pass found), each with an explicit reason written to the row: `LOGOUT` via **either** the presented credential **or** the session anchor (`:961-990`, `:1796-1820`), `MANUAL` (device list, `:1658-1690`), `SESSION_REVOKED` (revoke-by-device, `:2384`), `ROTATION_REUSE` (refresh-token reuse detection wipes the account's whole set, `:872`), `PASSWORD_CHANGE` (`:2226`, added in the follow-up — see §3.4) and `EXPIRED`, which is written by the validation path itself rather than by a caller (`:1636`). Rows are retained (not deleted) so the UNIQUE digest index keeps rejecting a dead value.
6. **Disappear** — `buildClearDeviceTrustCookie` emits the same name/attributes with `Max-Age=0` (`device-trust-cookie.ts:279-286`), and the login path clears a stale cookie when a rejected presentation arrives (`identity.service.ts:1996`), so a browser does not keep re-presenting something already dead. Every path that de-trusts now yields `{clear: true}`, so a browser cannot hold a cookie the server has already rejected — including after a password change (§3.4) and after an anchored logout (§3.5).

**Audit-action drift, stated plainly (finding D6).** For "correct password but the device is not trusted", the branch replaced the baseline's `auth.login` record with `auth.otp_challenge` (`identity.service.ts:1983`) and writes it with `actorType: 'SYSTEM'` rather than the user's role, because the decision is made before a session (and therefore before role claims) exist. That is defensible in itself but changes what an investigator greps for: an event that used to appear under `auth.login` now appears under `auth.otp_challenge`, and role-keyed alerts will not see it. Any saved search, dashboard or alert rule on `auth.login` needs re-checking at activation (§10 step 6). Recorded as risk 11.

### 3.3 Cookie and CSRF design

The credential is a **cookie that authorises the omission of a second factor**, which is the most dangerous kind of cookie. The design is therefore explicit about the cross-site question. `apps/api/src/common/auth/device-trust-cookie.ts:1-40` records it in full; the shape is:

- **Deployment is cross-origin** — the API and the web/admin apps run on different hosts (`main.ts:78-95` allowlist, `credentials: true`). That rules out the cheap answer: `SameSite=Lax` would mean the cookie is never sent on a cross-site `POST`, i.e. nobody would ever be trusted. The working configuration is `SameSite=None; Secure`, which *is* the setting under which a malicious third-party page can make the browser attach the cookie.
- **So the cookie is not treated as authorisation by itself.** Every request that wants device trust must also send `x-device-trust: 1`. A cross-site form or `fetch` from an attacker origin cannot set that header without a CORS preflight, and the preflight only succeeds for origins on the explicit allowlist (`main.ts:78-95`, which is why `DEVICE_TRUST_PROOF_HEADER` is in `allowedHeaders` at `:93`). Cookie + no header ⇒ read as `absent` ⇒ OTP required (`device-trust-cookie.ts:198-221`).
- **The failure is in the safe direction on every axis.** Missing header, malformed value, unknown digest, wrong owner, revoked row, expired row — all six collapse into the same observable outcome: *this device needs a second factor* (`identity.service.ts:1599-1630`). None of them is distinguishable to the caller, so the endpoint is not an oracle.
- **Configuration errors abort boot rather than weaken the cookie.** `resolveDeviceTrustCookieConfig` (`device-trust-cookie.ts:103-167`, called from `main.ts:43`) throws on an unrecognised `SameSite`/`Secure` value and specifically on `SameSite=None` without `Secure` — a cookie browsers silently discard, which would look like "trust never works" rather than a misconfiguration. `SameSite` is emitted with the canonical capitalisation from the RFC examples (`:229-236`) so an inspected header matches the documented configuration without relying on parser leniency.

**Trade-off recorded honestly.** `SameSite=None` requires `Secure`, which requires TLS termination that presents the right protocol to the API; behind a proxy that hides `Forwarded`/`X-Forwarded-Proto`, a `Secure` cookie can be re-set by the browser but not re-read over plain HTTP. That is why the boot-time combination check exists, and why §10 makes proxy/TLS verification an activation step rather than an afterthought. **And see §9 risk 3: the verification pass concluded that on the actual staging domains this cookie is a third-party cookie, so the configuration above is not yet known to work in staging on any browser, and is expected to fail on Safari.** That is an open question about the deployment, not a change to this design.

### 3.4 Password change revokes device trust (finding D3 — follow-up workstream B5)

v1.0 left this unaddressed and, worse, let it read as though the mechanism covered it. It did not: `changePassword` updated the hash, audited `PASSWORD_CHANGE`, revoked sessions, and touched `device_credentials` **not at all**. Since `loginWithPassword` consults only the presented credential, the moment the new password was known a previously trusted browser logged in with **no second factor** — the incident sequence being device compromise → victim resets the password → attacker's trusted browser is still exempt.

`identity.service.ts:2162-2260` now, on a *successful* change: revokes every live credential for the account with reason `PASSWORD_CHANGE` via `revokeAllDeviceCredentials(userId, 'PASSWORD_CHANGE')` (`:1707-1730`), and — only when `revokedCount > 0` — writes an `auth.device_trust_revoked` audit event carrying `{revokedCount, reason}` and nothing else. No credential, no digest, no device label reaches the audit row; a test asserts the serialized entry contains none of those tokens.

Boundary conditions the tests pin down: a **failed** change (wrong current password, or a new password rejected by the policy) revokes nothing and the next login from a trusted device is still trusted — revocation is a consequence of the credential actually changing, not of an attempt. The per-credential `credential_audit_log` row for `PASSWORD_CHANGE` still gets written with the `deviceId` provenance. Other accounts' credentials are untouched.

**Session semantics deliberately unchanged.** The surrounding session-revocation logic is byte-identical to baseline (`git show 02b59d43:apps/api/src/modules/identity/identity.service.ts:1685-1693`), and the task said not to silently change unrelated session behaviour. What was wrong there was the **comment**, which claimed "keep current device if specified" above code that does the opposite when `deviceId` is present: it revokes *every* session carrying that `deviceId`, not all-but-the-current, and with no `deviceId` it falls through to `revokeChain(userId)`. The comment now describes what the code does, and a test pins the behaviour by session id — including which of the caller's own sessions survive — so a future edit that changes it fails loudly instead of quietly. That is a documentation correction plus regression cover, not a behaviour change.

### 3.5 Logout follows the session anchor, not just the cookie (finding D2 — follow-up workstream B6)

v1.0 claimed logout revoked "the session **and** the presented credential". Only the second half was true. `revokePresentedCredential` returns early when nothing is presented, so a logout whose request carried no cookie — or whose proof header was stripped by a CORS change — left the credential **live and trusted** while ending the session it had earned. `device_credentials.created_by_session` existed exactly to prevent that, and `logout()` had the session row in hand and ignored it.

`logout()` (`:961-990`) now revokes through **both** paths and returns `{clear: true}` if either of them removed anything:
- **Path 1 — presented credential**, unchanged behaviour for the clients that do send the cookie plus header today.
- **Path 2 — session anchor**: `revokeCredentialsBySession(sessionId, userId, 'LOGOUT')` (`:1796-1820`) matches `created_by_session = session.id AND user_id = session.userId AND revoked_at IS NULL`, so it can only ever touch a credential this account earned through this session.

Path 2 is worthless unless the anchor stays current, because a session id changes on every refresh rotation. So `anchorCredentialToSession` (`:1767-1790`) moves the anchor to the new session whenever a trusted credential is *re-earned* — in `refreshToken` when the status is `trusted`, and in `loginWithPassword` right after the trusted session row is inserted. Two consequences are documented rather than hidden: the anchor follows whoever presents credential + valid tokens (so a copied pair *does* move it, and the robust answer to a suspected copy remains account-wide revocation — `PASSWORD_CHANGE` or the device list), and `sessions.replaced_by`, which the schema declares, is **never written anywhere**, which is precisely why lineage cannot be reconstructed at logout time and cannot be relied on instead of the anchor.

The five required cases are covered as integration tests against the real database (§8.3): logout with a valid credential presented; logout with no credential; logout with the cookie attached but the proof header absent (which first asserts `readPresentedDeviceCredential` yields `null`, i.e. the CSRF gate really is what makes the header necessary); logout while an unrelated device's credential exists (it stays live and its session stays unrevoked — the anchor is not an account-wide sweep, and unrelated devices belonging to the same user are not revoked); and repeated logout, which is idempotent — one `revoked_at`, unchanged value, and `validateDeviceCredential` still answers `revoked`. Plus the negative control that matters: a revoked credential cannot re-establish trust on the next login, which is met with `requiresOtp` and a cookie clear.

---

## 4. S-2 — The device-check contract

| Aspect | Baseline | Now | Evidence |
|---|---|---|---|
| Response body | `{canAutoLogin, requiresOtp, hasPassword}` | `{checked: true}` — a literal; one value for every address, authenticated or not, existing or not | `[CODE]` `identity.service.ts:2300-2332`; contract `packages/contracts/src/index.ts:237-257` (`DeviceCheckResponseSchema`, `checked: z.literal(true)`) |
| Throttling | none (no global `APP_GUARD`, no `@Throttle`) | `@UseGuards(ThrottlerGuard)` + `@Throttle({'device-check': {}})` on the route (`auth.controller.ts:303-305`) with a named profile defaulting to **10 requests / 60 s per IP**, tunable via `DEVICE_CHECK_THROTTLE_LIMIT` / `DEVICE_CHECK_THROTTLE_TTL_MS` (`app.module.ts:71-77`) | `[CODE]`, `[TEST]` `ip-throttling.spec.ts` (5 cases) |
| Second budget | none | per-identifier `device_check` 20 / 900 s (`identity.service.ts:82-83`) — deliberately **log-only**, because a per-identifier 429 on a constant-response endpoint would create a *difference* an enumerator could read (an address that throttles is an address that exists) while the per-IP guard already bounds cost | `[CODE]` `identity.service.ts:2305-2317` |
| Identifier handling | raw email | `normalizeEmail(rawEmail)` — the same rule as every other auth path, so `A@B.com` and `a@b.com` cannot be separated into different buckets | `[CODE]` `identity.service.ts:2301` |
| Validation | ad hoc | `DeviceCheckDto`: `@IsEmail()` + `@MaxLength(254)`; `deviceId` retained (the global `forbidNonWhitelisted` pipe means deleting it would break older mobile builds) but documented and treated as **ignored** | `[CODE]` `apps/api/src/modules/identity/dto/auth.dto.ts:136-151` |
| Logging | raw value reachable | audit action `auth.device_check` with `metadata.emailHash = hashIdentifier(...)`; the caller's `deviceId` is not recorded at all, because under S-1 it drives no decision | `[CODE]` `identity.service.ts:2319-2331` |
| Client impact | awaited and discarded by both web and admin | unchanged — both already ignored the payload, so the login flow behaves identically; `checkDeviceLogin` remains exported so no stale build 404s | `[CODE]` `apps/web/src/lib/auth.ts:431-448`, `apps/admin/src/lib/auth.ts:335-341`; `[TEST]` `apps/web/src/__tests__/login-device-trust.test.tsx` asserts no mount-time probe remains |

**Why the disclosure stopped mattering.** Device trust moved from "the caller tells us `deviceId`" to "the browser presents a server-issued credential", so the pre-flight had no role left to play; deleting its fields cost no functionality. That is the argument for collapsing rather than authenticating the endpoint, and it is written next to the code so the next reader does not re-add the fields `[CODE: identity.service.ts:2277-2299]`.

---

## 5. Delivery honesty — admin OTP UI and the clients

### 5.1 The shared rule

`classifyOtpDelivery()` in `@scs/contracts` is the single reading of the delivery vocabulary: `delivered` | `uncertain` | `unavailable` | `rejected` (`packages/contracts/src/index.ts:93-120`). It matches the router's channel-keyed `'<CHANNEL>_PROVIDER_NOT_CONFIGURED'` family, the providers' own `'<PROVIDER>_NOT_CONFIGURED'` family (by suffix), `UNKNOWN_CHANNEL`, `DELIVERY_TIMEOUT`, `DELIVERY_ERROR`, `possiblyDelivered`, and everything else as a definite rejection. Dart mirrors the same rules in `mobile/lib/models/models.dart` (`outcome` getter) because the two runtimes share no code.

Two notes for the reviewer, because they are the kind of detail that gets smoothed over:

- **The suffix family is defensive, not a proven live bug.** `OtpDeliveryService.deliverChallenge` pre-checks `provider.isConfigured()` and returns the *channel-keyed* name before a provider can emit its own (`apps/api/src/modules/notifications/otp-delivery.service.ts:145-154`), so `TWILIO_NOT_CONFIGURED` is unreachable on today's router. My first cut of the classifier matched only `_PROVIDER_NOT_CONFIGURED`, which was **narrower than the client behaviour it replaced** (the previous web code used `includes('NOT_CONFIGURED')`); the fix restores parity and hardens the naming. Reported as hardening, not as a discovered defect.
- **`DELIVERY_ERROR` is uncertain, not rejected.** The delivery service sets `deliveryOutcome:'unknown'` for the exception path (`otp-delivery.service.ts:172-181`), and "transport failed, outcome unknown" must not be rendered as "nothing was sent" — the code may still arrive.

### 5.2 Admin login (finding in scope)

`apps/admin/src/app/auth/login/page.tsx:150-180`: `handleRequestOtp` classifies the **body** and advances to code entry **only** for `delivered`. The other three outcomes stay on the request step with distinct operator language (`deliveryMessage`, `:34-45`) — e.g. *"OTP delivery isn't configured in this environment, so nothing was sent to +966 5XX XXX XXXX. Sign in with email and password, or ask the platform team to enable the SMS provider."* Details:

- **No false claim.** The "Code sent" string is reachable only from the accepted branch (`:382-385`); uncertainty renders as "Delivery status uncertain" and never as a promise. An absent `otpDelivery` field is treated as unconfirmed.
- **Duplicate in-flight requests are prevented** by an `otpInFlight` ref guard (`:152-153`) rather than by optimistic UI state, so a slow provider cannot be stacked.
- **Retry obeys the rate limit.** A 429 is parsed into `{limit, remaining, retryAfterSeconds}` from either the headers or the body extensions (`apps/admin/src/lib/auth.ts:81-101`), the retry affordance is disabled while `lockoutRemaining > 0`, and the message quotes the server's own window (`:297`). Retrying a *rejected* send is allowed — the API decides whether to answer 429.
- **Password and trusted-device flows preserved.** The password branch only gained a note about whether the accompanying OTP actually went out (`:129-131`); trusted-device logins still skip OTP entirely, now on the strength of the cookie, and the admin app sends `credentials:'include'` + the proof header through one helper so no call can forget either (`apps/admin/src/lib/auth.ts:49-60`).
- **No internal vocabulary leaks.** Tests assert that `SMS_PROVIDER_NOT_CONFIGURED` and `TWILIO_NOT_CONFIGURED` never appear in the rendered DOM, and that no phone/email/token value is echoed (`apps/admin/src/__tests__/auth-login-otp-delivery.test.tsx`).

### 5.3 Web and mobile

The web login page uses the same classifier for both its OTP tabs and for the `requiresOtp` branch of password login (`apps/web/src/app/auth/login/page.tsx:171`, `:224`, and `:124-131`), so an untrusted device sees *"New device detected. Enter the OTP sent to your phone to continue."* only when the send was accepted, and *"This device needs a second factor. We could not confirm the code was delivered, but you can enter it if it arrives."* otherwise. The Dart client mirrors both outcomes (`mobile/lib/screens/auth/login_screen.dart:187`, `:492`). Mobile keeps sending its stored UUID — harmless now, and still needed as session provenance — and reads `outcome` instead of the status line.

---

## 6. Schema change and migration

A new table was genuinely required: the old model had a `device_trust` row keyed by a client-chosen identifier, and there is no column on an existing table that can hold "a server-minted secret this browser presents, with its own revocation state and two lifetimes" without either reusing the client identifier or overloading the session row.

**`infra/drizzle/migrations/0066_device_trust_credential.sql`** — `public.device_credentials` (`:89-154`; the file is 180 lines and its line numbers grew in the follow-up pass because only *comments* were added, see §6.1):

| Element | Purpose |
|---|---|
| `credential_hash CHAR(64) NOT NULL` + `CHECK (credential_hash::text ~ '^[0-9a-f]{64}$')` (`:98`, `:153`) | Only a SHA-256 hex digest can ever be stored; a plaintext value fails the insert rather than silently existing. |
| `CREATE UNIQUE INDEX device_credentials_credential_hash_uq` (`:164-165`) | One digest resolves to at most one account (requirement 8). A unique **index**, not a `UNIQUE` constraint on `text`, is used deliberately: the surrounding comment explains the `char(64)` padding pitfall the constraint form invites. |
| `user_id … REFERENCES users(id) ON DELETE CASCADE` (`:93`) | Trust cannot outlive the account. |
| `created_by_session … REFERENCES sessions(id) ON DELETE SET NULL` (`:111`) | The credential records which session's authentication enrolled it, and the application now *keeps* that pointer current (§3.5) so logout can find the credential even when the browser presents no cookie. Deleting the session must not orphan or destroy the trust silently. |
| `CHECK (expires_at <= hard_expires_at)` (`:141`) | A bug cannot produce a credential whose sliding horizon outlives its ceiling. |
| `CHECK (revoked_at IS NOT NULL OR revoked_reason IS NULL)` (`:145`) | A revoked row always says why; a live row never carries a stray reason. |
| Three secondary indexes (`:168-176`) | user-active listing, session lookup (`:174-176`, partial on `created_by_session IS NOT NULL`), expiry sweep. |
| **No backfill** | Deliberate: copying existing `device_trust` rows into the new table would have imported the very weakness being removed. Trust restarts empty and is re-earned by a real second factor. |
| Idempotent, additive, and reversible | `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` only; nothing is dropped, no existing table is touched, so the rollback is `DROP TABLE public.device_credentials;` (documented in the file header at `:73-79`). The old `device_trust` table is left in place and unread, so an emergency revert is a code redeploy, not a data repair. |

Drizzle schema parity is maintained in `apps/api/src/modules/identity/identity.schema.ts:156-190` so the ORM's queries and the migration describe the same constraints, and `device-trust-lifecycle.postgres.spec.ts` applies the whole root `infra/drizzle/migrations` directory in sorted order, so 0066 is executed by the same path the release scripts use rather than by a hand-copied DDL string.

**`revoked_reason` is deliberately an unconstrained `VARCHAR(32)`, not an enum or a `CHECK`ed list.** The seven values the code writes are `LOGOUT`, `MANUAL`, `SESSION_REVOKED`, `ROTATION_REUSE`, `PASSWORD_CHANGE`, `EXPIRED` — but adding a reason (as the follow-up pass did with `PASSWORD_CHANGE`) is therefore a one-line code change, not a schema migration. The trade-off is recorded: nothing at the database layer rejects a typo'd reason, so the set is enforced by the call sites and by `device-trust-lifecycle.postgres.spec.ts`, which asserts the reason string rather than merely that `revoked_at` is set.

### 6.1 Migration changes in the follow-up pass: comments only

The B5/B6 work changed **no DDL** in `0066_device_trust_credential.sql`. It expanded two comment blocks — the `created_by_session` security-property bullet (`:30-…`) and column note, and the `revoked_reason` list, which now names `PASSWORD_CHANGE` and explains each value — because the previous wording described the anchor as a passive provenance field when it is now load-bearing for logout. Line numbers in this section therefore shifted (`:87-138` → `:89-154`), which is the only kind of "migration change" this pass made.

Two facts make that safe, and both were checked rather than assumed. First, the file is applied by `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS`, so re-running it against a database that already has the table is a no-op. Second, **this repository's migration ledger records filenames only — there is no checksum mechanism to invalidate.** The runners create `_migration_log (name TEXT, applied_at TIMESTAMPTZ DEFAULT now())` and insert `file` after execution (`apps/api/infra/drizzle/migrate.ts:71`, `:105-107`; `apps/api/infra/drizzle/migrate-pg.ts:59-62`, `:99`), and no hash of file content is stored or compared anywhere in `apps/api/infra/drizzle/` or the release workflow. So editing a comment cannot make a recorded migration fail re-verification. Nothing about the applied-schema state of staging or production changed, because migration 0066 has still not been applied anywhere (status below).

**Status: NOT applied anywhere.** No staging or production database was touched. The DDL and its constraints are exercised only by `device-trust-lifecycle.postgres.spec.ts` against a throwaway Testcontainers database — **and that execution has now happened on this machine**, together with the other container suite: 65 cases passed, 0 failed (§8.3). `[TEST]`

---

## 7. Files changed

Implementation (S-1): `apps/api/src/common/auth/device-trust-cookie.ts` (new), `apps/api/src/modules/identity/identity.service.ts`, `identity.schema.ts`, `auth.controller.ts`, `profile.controller.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/modules/identity/dto/auth.dto.ts`, `infra/drizzle/migrations/0066_device_trust_credential.sql` (new).

Contract: `packages/contracts/src/index.ts`, `packages/contracts/scripts/generate-openapi.ts` (published OpenAPI now registers `DeviceCheckResponse` (`generate-openapi.ts:77`), documents the device-check 200 as a constant acknowledgement (`:285`), and carries `otpDelivery` on `login/password`).

Clients: `apps/admin/src/app/auth/login/page.tsx`, `apps/admin/src/lib/auth.ts`, `apps/admin/vitest.config.ts` (`@/` alias so the alias-written screen is testable), `apps/web/src/app/auth/login/page.tsx`, `apps/web/src/lib/auth.ts`, `mobile/lib/models/models.dart`, `mobile/lib/services/api_service.dart`, `mobile/lib/screens/auth/login_screen.dart`, `mobile/lib/screens/profile/profile_screen.dart`.

Tests: new `apps/api/src/__tests__/unit/common/device-trust-cookie.spec.ts`, `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts`, `apps/admin/src/__tests__/auth-login-otp-delivery.test.tsx`, `apps/web/src/__tests__/login-device-trust.test.tsx`, `apps/web/src/__tests__/otp-delivery-classifier.test.ts`; extended `auth.controller.spec.ts`, `auth-dto.spec.ts`, `profile.controller.spec.ts`, `ip-throttling.spec.ts`, `contracts-phase1.openapi.spec.ts`, `password-login-regression.postgres.spec.ts`, `apps/web/src/__tests__/auth-login-channel.test.tsx`, `apps/web/src/__tests__/email-otp-login.test.tsx`, `mobile/test/auth_models_test.dart`, `mobile/test/screens/login_screen_email_otp_test.dart`, `mobile/test/screens/profile_screen_linking_test.dart`, `mobile/test/screens/widget_test_harness.dart`.

Docs: `docs/architecture/ADR-0004-SERVER-ISSUED-DEVICE-TRUST-CREDENTIAL.md` (new), `docs/production/OTP-S1.34-MULTI-CHANNEL-AUTH-TARGET-ARCHITECTURE.md` (amended, with an amendment header and the changed endpoint rows), `.env.example` (new device-trust and device-check blocks), this report.

Unrelated working-tree changes (returns module, P13 documents, scratch directories, other branches' specs) were **left untouched and are not part of these commits**.

### 7.1 Additional files changed by the follow-up pass (findings B1/B5/B6, D1–D7)

Implementation: `apps/api/src/modules/identity/identity.service.ts` (password-change revocation, session-anchored logout revocation, `anchorCredentialToSession`, `revokeCredentialsBySession`, the corrected `setupCredentials` and `changePassword` comments), `identity.schema.ts` (two docstrings), `apps/api/src/common/auth/device-trust-cookie.ts` (`DeviceTrustTransportInstruction` lost the unread `keep` field).

Migration: `infra/drizzle/migrations/0066_device_trust_credential.sql` — **comments only**, no DDL (§6.1).

Tests: `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts` (28 → **41** cases: raw-row timestamp handling, the shared transport shape, the eight logout-anchor cases, the five password-change cases), `password-login-regression.postgres.spec.ts` (24 cases, transport + audit + normalization expectations reconciled), `apps/api/src/__tests__/unit/common/device-trust-cookie.spec.ts`, `apps/api/src/__tests__/unit/identity/auth.controller.spec.ts`.

Docs: `docs/architecture/ADR-0004-SERVER-ISSUED-DEVICE-TRUST-CREDENTIAL.md` (revocation table, transport shapes, D4 limitation section, measured verification section, corrected test citation), this report (v1.1 amendment and the corrections above), and the new `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-UP.md`.

---

## 8. Tests and exact results

### 8.1 Executed locally — the numbers as reported by the runners

The left column is v1.0's first-pass run; the right column is the **follow-up re-run** after B1/B5/B6, on the same machine. Both are recorded because they differ, and the differences are all accounted for in §8.3.

| Command | First-pass result (v1.0) | Follow-up re-run (v1.1) |
|---|---|---|
| `pnpm --filter @scs/api test:unit` | **127 files, 2553 tests passed, 0 failed** (69.3 s) | **127 files, 2553 tests passed, 0 failed** (45.7 s) — unchanged |
| `npx vitest run` over the six touched API specs | **234 passed**: `device-trust-cookie.spec.ts` 44, `contracts-phase1.openapi.spec.ts` 77, `auth.controller.spec.ts` 38, `auth-dto.spec.ts` 37, `ip-throttling.spec.ts` 23, `profile.controller.spec.ts` 15 | Not re-run as a six-file subset; the full unit suite above covers all of them at the same totals |
| **`npx vitest run` over the two Testcontainers specs** | **not executed** ("Docker is unavailable") | **2 files passed, 65 tests passed, 0 failed** (32.3 s) — see §8.3 |
| `pnpm --filter @scs/api typecheck` (`tsc --noEmit`) | **0 errors** | **0 errors** (exit 0) |
| `pnpm --filter @scs/api build` | **435 files compiled; `TSC Found 0 issues`** | **435 files compiled; `TSC Found 0 issues`** (exit 0) |
| `pnpm --filter @scs/api lint` | **0 errors, 313 warnings.** Re-running ESLint over only the seven touched API files yields **two** warnings, both unused imports (`identity.service.ts:32` `hashEmail`, `:41` `featureFlags`) that exist verbatim at baseline (`git show HEAD:apps/api/src/modules/identity/identity.service.ts` lines 31 and 40); the new `device-trust-cookie.ts` is clean. The 313 is the repo-wide pre-existing count, not this change's — it was not re-measured at `02b59d4` in this session | **0 errors, 313 warnings** (exit 0) — identical count; no new warning introduced by the follow-up edits |
| `pnpm --filter @scs/contracts typecheck` / `build` | both clean | not re-run (contracts untouched by the follow-up pass) |
| `pnpm --filter @scs/web test` | **7 files, 72 passed, 0 failed** — includes the 10 new device-trust cases and 6 classifier cases | **7 files, 72 passed, 0 failed** (exit 0) — unchanged |
| `pnpm --filter @scs/web lint` | 2 warnings, both pre-existing and in files this change does not touch (`src/app/merchant/returns/[id]/page.tsx:44`, `src/hooks/useProductStudio.ts:262`) | not re-run (web untouched by the follow-up pass) |
| `pnpm --filter @scs/admin test` | **3 files, 39 tests: 37 passed, 2 failed.** All 16 new `auth-login-otp-delivery.test.tsx` cases pass | **3 files, 39 tests: 37 passed, 2 failed** — the *same* two `management.test.tsx` cases, byte-identical to the isolated baseline below |
| `pnpm --filter @scs/admin lint` | **no warnings or errors** | not re-run (admin untouched by the follow-up pass) |
| `cd mobile && flutter test` | **158 tests passed** | **158 tests passed** (exit 0) — unchanged |
| `cd mobile && flutter analyze` | **0 errors; 20 info/warning issues.** The two in files this change touches (`lib/screens/auth/login_screen.dart:564,566`, `lib/screens/profile/profile_screen.dart:209`) are `prefer_const_constructors` on copy that exists verbatim at baseline (`git show HEAD:…:509` / `:176`); the rest are generated `packages/api_client` noise | not re-run (mobile untouched by the follow-up pass) |

**The 2 admin failures are pre-existing and were isolated, not assumed.** Both are in `src/__tests__/management.test.tsx` (product-moderation keyboard navigation / "Complete description"), which this change does not touch. Re-running that file with the **baseline** `vitest.config.ts` (`git show HEAD:apps/admin/vitest.config.ts`, i.e. without the `@/` alias I added) and with the current config produces the identical result: `2 failed | 8 passed (10)` both times. `[TEST]`

### 8.2 What the new tests actually assert (four matrices)

**Trusted devices.** Cookie module: name/attribute serialization, host-only path, `Max-Age` from remaining ceiling vs `Max-Age=0` clear, the `43`-char pattern, `HttpOnly` always, the canonical `SameSite` spellings, and the four boot-time refusals: an unrecognised `SameSite` value, a non-boolean `Secure` value, `SameSite=None` without `Secure`, and `Secure=false` outside a local environment — plus the parser's case/whitespace tolerance (`device-trust-cookie.ts:103-167`). Service/controller (unit, with the real DI graph): a login carrying **only** a `deviceId` gets `requiresOtp`; a live credential gets a session and no OTP; a revoked one does not; an expired one does not and is durably revoked; a digest owned by another account yields `user_mismatch` and is not trusted; a request without `x-device-trust: 1` is treated as presenting nothing even though the cookie is attached (**the CSRF case**); a well-formed-but-unknown value is indistinguishable from a revoked one in the response; refresh preserves trust and slides `Max-Age`; refresh-token reuse revokes every credential for the account and the next login needs the second factor; logout clears the cookie and the row; `DELETE /v1/me/trusted-devices/:id` removes exactly one device, 400s on a non-UUID, and removes nothing for another account's id; the device list exposes no digest or digest prefix.

**Device-check.** Contract: the response schema is exactly `{checked:true}` and the published OpenAPI document describes that constant acknowledgement rather than the old three-field body (`contracts-phase1.openapi.spec.ts`, 77 cases across the whole contract). DTO: a missing or malformed email is a 400 before any lookup; an email over 254 chars, a `deviceId` over 128 chars and a non-string `deviceId` are rejected; an email-only body is accepted with `deviceId` optional, and a legacy `deviceId` string is still accepted so deployed mobile builds do not start failing — the service ignores the value; and a caller-supplied trust claim (`trusted`, `hasPassword`) or any extra field is rejected by the whitelist. Throttling/non-disclosure (`ip-throttling.spec.ts`, 5 new cases run in a **separate Nest application** whose only low profile is `device-check`: `default` 100/60 s + `device-check` 3/60 s — necessary because every profile declared in `ThrottlerModule.forRoot` applies to every route, so adding a low `device-check` limit to the shared OTP harness would have shrunk the OTP budgets instead of testing this one — documented in the file): 3 calls pass and the 4th is 429 with the service method invoked exactly 3 times (no lookup happens behind the guard); cycling the address does not reset the per-IP budget; the body is byte-identical for every address; the throttled answer contains no `trusted|hasPassword|canAutoLogin|requiresOtp` token; `Object.keys(body)` is exactly `['checked']`.

**Admin OTP interface.** For each outcome — `accepted`, provider-unconfigured (both name families), definite rejection, timeout/uncertain, a missing `otpDelivery` field, HTTP 429 mid-flight, a network error, and a concurrent double-submit — the test drives the real component and asserts the stage it lands on, the copy it shows, whether "Code sent" is present, whether the wire status string leaked, and whether the retry affordance is enabled. The password-with-OTP branch is covered too, since it now carries `otpDelivery`.

**Password change and logout, against the real database (added by the follow-up pass; 13 cases).** For **B5**: changing the password revokes every live credential for that account with reason `PASSWORD_CHANGE` while a second account's credential stays live; both of the owner's browsers are then met with `requiresOtp` **and** a `{clear: true}` cookie instruction, so neither keeps a dead credential; a change with the wrong current password, and one rejected by the length policy, revoke nothing and trust survives; the audit trail records `{revokedCount, reason}` and the serialized entry contains no credential, digest or device label, alongside the per-credential `PASSWORD_CHANGE` row; session behaviour is pinned **by session id**, so the pre-existing `deviceId`-scoped revoke and the `revokeChain` fallback cannot silently change; and re-enrolling after a change mints a *different* live credential while the old one stays revoked. For **B6**: logout de-trusts when the request presents nothing (the D2 gap), when it presents the cookie without the proof header — first proving `readPresentedDeviceCredential` returns `null`, which is the CSRF gate doing its job — and when anchor and presented credential are the same row, which yields exactly **one** revocation; the anchor still points at a live credential after refresh rotation and after a trusted re-login; an unrelated device is untouched in both its credential and its session; presenting *another* device's credential revokes both, with the rationale documented at the test; repeated logout is idempotent (`revoked_at` value unchanged, one revoked row) and the credential still validates as `revoked`, i.e. **a revoked credential cannot re-establish trust**; and a credential issued without an anchor is still de-trusted, because the trusted login moved the anchor onto the caller's own session.

### 8.3 The container suites: what v1.0 said, what actually happened, and the current numbers

**v1.0's sentence "Docker is unavailable on this machine (`Cannot connect to the Docker daemon`), so they were not run here … they will run in hosted CI" was false in its second half, and the follow-up pass falsified the first.** Docker is available on this machine; the suites were run; and the first run was **red**:

```
npx vitest run src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts \
               src/__tests__/integration/password-login-regression.postgres.spec.ts
→ Test Files  2 failed (2)
  Tests  6 failed | 46 passed (52)      Duration 33.39s
  device-trust-lifecycle (28 tests | 3 failed) 10323ms
  password-login-regression (24 tests | 3 failed) 14059ms
```

Independent verification mapped the six failures (F1–F6) and attributed them precisely, and that attribution — not a guess — is what the fixes were driven by:

| # | Failure | Attribution | Resolution |
|---|---|---|---|
| F1–F3 | `TypeError: ….expires_at.getTime is not a function` on three lifecycle cases that assert expiry, durable revocation and ceiling clamping | **Test-harness typing, not product behaviour.** A raw `pool.query('SELECT *')` hydrates `timestamptz` as a *string* under vitest/vite-node, while drizzle reads yield `Date`. A plain `node` + `pg` 8.23.0 process against the same container returned `Date` for every row, which is why `pnpm-lock.yaml` being unchanged does **not** make these "expected to pass in CI" — they were expected to reproduce, and they did. | Fixed **in the test helper** with explicit conversion (`asDate`, applied to the timestamp columns by `withDateColumns`) rather than by leaning on runner coercion: an unparseable value throws instead of silently comparing garbage. The three assertions keep their original strength. |
| F4 | `expected {credential, maxAgeSeconds} to deeply equal {keep: true}` — the two specs asserted opposite transport shapes for the same trusted login | **Convention split between two specs by the same author**, and the type advertised a `keep` capability `applyDeviceTrustCookie` never read (§3.2 step 4). | Resolved **toward the implementation**, not toward the stale assertion: the `keep` field is deleted from `DeviceTrustTransportInstruction` and `password-login-regression` now asserts the re-set that really happens. Both specs assert one shared convention, so the suite tests the actual cookie transport instead of two fictional ones. |
| F5 | `expected undefined to be defined` — the pre-existing audit test looked for an `auth.login` row that this branch renamed | **Behaviour change not reconciled**, and the property genuinely lost runtime coverage. | The test now asserts the `auth.otp_challenge` row that is actually written (`identity.service.ts:1983`) **and still asserts the protected property**: the address appears only as a keyed hash, never in clear. The rename and its monitoring consequence are documented (§3.2 note, risk 11) rather than left silent. |
| F6 | `expected '' to be truthy` — the email-normalization case asserted an `accessToken` on an untrusted device | **Intended new behaviour, stale expectation**: `accessToken: ''` is the designed fail-closed answer (§9 risk 2). | The case now asserts the intended response (`requiresOtp: true`, empty token) **and keeps** the normalization assertion it was written for, so email case/trim handling on the password path is proven again end-to-end. |

**No test was deleted, and no assertion was weakened to reach green.** Every F1–F6 fix either repairs the harness's reading of a row or replaces a stale expectation with the behaviour the design chose and then proves the security property that expectation was standing guard over.

### 8.3.1 Current container results (the numbers, as reported)

```
npx vitest run src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts \
               src/__tests__/integration/password-login-regression.postgres.spec.ts
→ Test Files  2 passed (2)
  Tests  65 passed (65)        Duration 32.30s        exit 0
  device-trust-lifecycle.postgres.spec.ts      41 tests
  password-login-regression.postgres.spec.ts   24 tests
```

The count rose from 52 to 65 because the follow-up pass added 13 cases, not because anything was skipped: **8** for session-anchored logout (§3.5) and **5** for password-change revocation (§3.4). What this now proves at runtime, rather than as design intent: the `CHECK` refusals, the UNIQUE digest index, `ON DELETE CASCADE`/`SET NULL`, the sliding-window and ceiling-clamping `UPDATE`s, `PASSWORD_CHANGE` revocation across two browsers with another account unaffected, a failed change revoking nothing, and the anchor surviving rotation so logout de-trusts with no cookie presented.

**Hosted CI is still not available for this branch, and that is a separate gap.** `.github/workflows/ci.yml` triggers only on `push`/`pull_request` targeting `main` or `develop`, so pushing `feature/otp-auth-security-hardening` produces **zero** workflow runs. There is therefore **no hosted CI evidence for any SHA of this branch, and none is claimed** — including for the commit that closes these six failures. Getting it means opening a PR against `develop`, which is an owner action (§10 step 8) and is not performed here. Local container green is real evidence about Postgres semantics; it is not evidence about the pipeline, the runner image, or the resolved dependency set under CI conditions.

### 8.4 Regression surface considered and re-verified

`contracts-phase1.openapi.spec.ts` (77) guards the published contract; `auth-dto.spec.ts` (37) guards request validation; `profile.controller.spec.ts` (15) covers the device-management endpoints; `ip-throttling.spec.ts` (23) re-covers the OTP profiles that the new profile could have disturbed; web `email-otp-login` (15) and `auth-login-channel` re-cover the flows whose fixtures had to change shape when `device-check` stopped returning `{trusted:false}`. Flutter's 158 and web's 72 are the client-side regression net.

---

## 9. Remaining risks and limitations

1. **~~No container-executed proof yet~~ — CLOSED locally, still open for hosted CI.** The 65 container cases now pass on this machine (§8.3.1), so the Postgres-level constraints, cascades and lifecycle semantics have runtime evidence. What remains is pipeline evidence: `.github/workflows/ci.yml` triggers only on `main`/`develop`, so this branch has **no hosted CI run for any SHA** and none is claimed (§10 step 8). Two distinct gaps — do not let the local green stand in for the hosted one.
2. **Every device becomes untrusted once.** After deploy, all previously "trusted" browsers need a real OTP. Without a configured provider, password login from an untrusted device fails closed with the existing audit-visible message. Rollout order matters: **provider first, then this code.** Now doubly so: a password change also revokes trust (§3.4), so help-desk volume after activation will include "I changed my password and now it wants an OTP" — which is the intended behaviour and should be in the script, not treated as a regression.
3. **Mobile deliberately does not participate in device trust.** The Dart client runs no cookie jar, which is stated in the code at `mobile/lib/services/api_service.dart:85`, so the server-issued `HttpOnly` credential is never presented and mobile always completes password + OTP. That is the safe side of the failure: mobile cannot be exempted by a copied identifier. It also means the convenience win of S-1 is web/admin-only today; a mobile design would need platform secure storage (Keychain/Keystore) plus a non-cookie credential path, which is out of scope here and not claimed. `[NV]` — no device or emulator run was performed in this session. **Also `[NV]`, and this is the sharpest remaining unknown:** the independent verification pass concluded that on the real staging topology — Vercel frontends, Render API, `*.vercel.app` and `*.onrender.com` both being Public Suffix List entries — each host is its own *site*, so the credential is a **third-party cookie**, and Safari ITP is expected to refuse to store it. No real browser was exercised here, so the configuration in §10 step 4 has not been shown to work in staging at all, on any browser.
4. **`otpEmail` is dropped by the web/mobile password path.** `identity.service.ts:2004` returns a **masked** `otpEmail` for an email-only account, but `apps/web/src/lib/auth.ts:492` only reads `otpPhone ?? ''`, and the Dart model only carries `otpPhone` (`mobile/lib/models/models.dart:1088`), so an email-only user is sent to a code-entry screen with an empty destination. Pre-existing, outside these three findings, unchanged by this branch, and it does not weaken anything — it is a UX gap. Recorded so nobody discovers it as a surprise during activation.
5. **Admin has no email-OTP tab.** The phone-preferring fallback (`identity.service.ts:1953-1961`) can put an admin into the OTP-required branch with only email delivery available; the new copy says so plainly instead of pretending a code is coming, but the tab itself is still missing.
6. **Throttle storage is per-IP and shared with `TRUST_PROXY`.** The `device-check` profile is only meaningful per-client once `TRUST_PROXY` is set correctly (audit S-4); with the proxy hop unset on Render, every client shares one bucket, which now throttles *legitimate* logins too. Same caveat applies to the pre-existing OTP profiles.
7. **No provider-side delivery receipt exists** (audit S-10). "Accepted" is the strongest statement any client may make, by contract and by test.
8. **Sliding vs absolute lifetime is a judgement call, not a proof.** 30 d/90 d (`identity.service.ts:67-70`) are code constants with no product requirement behind the numbers; if the security owner wants different values they are one-line changes plus test updates.
9. **Deliberate non-change.** I considered adding IP throttling to `POST /v1/auth/login/password` itself and rejected it: that route already has a per-identifier 5/900 s cap, throttling it per IP behind a mis-set proxy would lock real users out of their own accounts, and it is not one of the three findings. Stated so it is not mistaken for an oversight.
10. **CSRF protection is header-presence, not a token.** It relies on the CORS allowlist staying tight (`main.ts:78-95`). If that allowlist ever grows to a wildcard, the proof-header argument weakens; the tests pin the header name into `allowedHeaders` so a silent removal fails loudly, but a *broadening* of origins is an operator action outside this code.
11. **The `auth.login` → `auth.otp_challenge` rename has monitoring consequences (D6, documented rather than fixed).** For a correct password from an untrusted device, the audit action is now `auth.otp_challenge` with `actorType: 'SYSTEM'` (`identity.service.ts:1983`); the trusted branch keeps `auth.login` with `trustedDevice: true`. Saved searches, dashboards and alert rules keyed on `auth.login` will under-count password attempts from the moment this deploys, and role-keyed alerts will not see the challenge rows at all. The tests now assert the row that is actually written, so the hash-the-address property is covered — but nobody has updated an alert rule, because none is observable from here.
12. **Live credentials accumulate without a cap (D4 — documented limitation, deliberately NOT fixed).** Every completed second factor mints a fresh row (`identity.service.ts:402`, `:830`) with no per-device dedupe and no per-account ceiling, so one browser used over three months can hold several live rows that the "Trusted devices" list shows as indistinguishable labels, which makes manual revocation a guess. The task allowed fixing this **only** if the existing device/session model gives a reliable way to identify the same physical browser, and it does not: `sessions.device_id` is the client-chosen UUID whose use as an identity claim is the S-1 defect itself, and the other session fields (`device` = user-agent string) are trivially spoofable and change on every browser update. Four candidate strategies were examined and rejected on security grounds in ADR-0004's "Known limitation" section — including the tempting "revoke the oldest when a fifth appears", which silently locks a legitimate user out of a device they are holding. The proposed fix is a **separate ADR** for a server-issued persistent *browser instance id* — an `HttpOnly` cookie unrelated to trust, minted at first contact, used only as a dedupe key — because that is a schema change, a cookie-surface change and a client-visible behaviour change, and bolting it onto a lifecycle fix is exactly the kind of weak workaround the instruction forbids. Interim mitigation that does exist: `PASSWORD_CHANGE` revokes everything (§3.4), the device list can remove a named row, and rotation reuse wipes the account's set.
13. **The session anchor follows whoever presents credential + tokens (new, from B6).** `anchorCredentialToSession` moves `created_by_session` on a trusted refresh and a trusted password login, which is what makes logout able to find the credential at all (§3.5). The consequence is that an attacker who has *both* a copied credential and live tokens re-anchors it to their own session — so their logout revokes their own credential, not the victim's original one. This is not a bypass: presenting the credential still requires having it, and they already need valid tokens for every request that matters, so the credential adds nothing to their power. The robust response to a suspected copy remains account-wide revocation — password change, device-list removal, or revoke-all-sessions — and that is what §3.4 and the device list provide. Recorded because it is the kind of asymmetry that reads as a hole if left unstated.
14. **`sessions.replaced_by` exists in the schema and is written by nothing.** The lineage column that would have let logout reconstruct "which session did this credential earn" is declared but never populated anywhere in `apps/api/src`. That is why the anchor is maintained eagerly instead of derived at logout. If a future change starts writing it, the two mechanisms must be reconciled rather than allowed to disagree; today only the anchor is load-bearing.
15. **Out-of-scope observation: `verifyOtp` writes a normalized phone number in plaintext into audit metadata** (`identity.service.ts:396`, `metadata: { method: 'otp', phone: normalizedPhone, … }`), whereas `device-check` and the credential paths hash their identifier. Pre-existing, unchanged by this branch, not one of the three findings, and it does not touch device trust. Recorded because it sits next to code this task did touch and a later reader may assume it was reviewed here. It was noted, not fixed.

---

## 10. Prerequisites before this can be activated in staging

Ordered; steps 1-2 must precede the deploy of this branch, not follow it.

1. **Configure at least one real OTP delivery provider** (Twilio SMS is the only channel the admin UI can complete end-to-end today) — out of scope here by instruction, and explicitly **not** done in this session.
2. **Set `TRUST_PROXY` correctly** on the API (a hop count or explicit proxy CIDRs), so the new `device-check` profile and the existing OTP profiles are per-client.
3. **Apply migration `0066`** via the existing database-release path, in a maintenance-window sense only: it is additive and idempotent. Rollback is `DROP TABLE public.device_credentials;`. Keep the old `device_trust` table (unread) so the revert path stays cheap.
4. **Set the cookie configuration deliberately, not by default:** `DEVICE_TRUST_COOKIE_SAME_SITE=none`, `DEVICE_TRUST_COOKIE_SECURE=true` for the current cross-origin staging topology; `DEVICE_CHECK_THROTTLE_LIMIT` / `_TTL_MS` if 10/60 s per IP is wrong for the expected admin population (`.env.example` documents both blocks and notes the 30/90-day lifetimes are code constants).
5. **Confirm the boot-time gate did not trip** — the service refusing to start with a bad cookie combination is the intended failure mode, not a bug to suppress.
6. **Announce the one-time re-verification:** every existing user's next password login will require an OTP. Expect a spike in OTP requests and check the throttle budgets against it. Re-check any saved search, dashboard or alert rule keyed on `auth.login`, which now misses the untrusted-device branch (`auth.otp_challenge`, risk 11).
7. **Verify on a real browser — and treat this as the gating step, not a formality.** Set a `Secure` cookie across the actual staging origins, send the proof header, log in password-only from a trusted device, then confirm the device appears in `/v1/me/trusted-devices` and that removing it forces a second factor again. Add the two lifecycle checks the follow-up pass introduced: change the password and confirm the *same* browser is asked for an OTP without a reload trick, and log out from a browser whose proof header is blocked to confirm the credential is still de-trusted server-side. **The independent verification pass concluded that on the current Vercel + Render topology — both `*.vercel.app` and `*.onrender.com` being Public Suffix List entries, so each host is its own site — the credential is a third-party cookie and Safari is expected to refuse to store it.** If that reproduces, either the staging origins move onto domains that share a registrable domain, or device trust needs a first-party path; `SameSite=Lax` is not an answer here (§3.3).
8. **Open a PR against `develop` so a hosted CI run exists, then read it.** Not to merge — to obtain evidence. A push to `feature/otp-auth-security-hardening` produces zero runs because `ci.yml` triggers only on `main`/`develop` (§8.3.1). The container suites pass locally, so this step is no longer about discovering whether the DDL works; it is about the pipeline, the runner image and the dependency resolution under CI, none of which local Docker proves. Do not treat the local green as a hosted-CI result, and do not state that CI passed until a run for the exact SHA is green.
9. **Re-test the admin defect that started this:** with a provider deliberately left unconfigured, the admin Phone-OTP tab must say nothing was sent and must not advance.

---

## 11. Acceptance-criteria mapping (task §7)

| Criterion | State | How it is demonstrated |
|---|---|---|
| Copied UUID cannot bypass OTP | **Met** | `[CODE]` `identity.service.ts:1945-1949` (no `deviceId` read in the trust decision); `[TEST]` unit case "login carrying only a deviceId gets requiresOtp"; CSRF-axis case "cookie attached, proof header absent ⇒ second factor"; container case "does not let a copied client-side deviceId carry trust it once had" (§8.3.1) |
| Revoked credential cannot re-establish trust | **Met — now including real-DB proof.** v1.0 marked this "pending CI"; the container cases exist and pass. | `[CODE]` `identity.service.ts:1627`; `[TEST]` logout, device-list removal, revoke-by-device, rotation-reuse, **password-change** and **repeated-logout** cases against Postgres (§8.2, §8.3.1) |
| Server-issued secure storage | **Met** | `[CODE]` `device-trust-cookie.ts:41`, `:265-286`, `:323`; `auth.controller.ts:86-95`; digest-only storage + DB `CHECK` at migration `:153`, executed in the container suite |
| Device-check non-disclosing and rate-limited | **Met** | `[CODE]` `identity.service.ts:2300-2332`, `auth.controller.ts:303-306`; `[TEST]` constant-body, key-set, throttled-body and 429 cases |
| Password change de-trusts a previously trusted device (added by the follow-up pass) | **Met** | `[CODE]` `identity.service.ts:2226` (`PASSWORD_CHANGE`); `[TEST]` 5 container cases incl. failed-change-revokes-nothing and cross-account isolation (§3.4, §8.2) |
| Logout de-trusts even when the browser presents nothing (added by the follow-up pass) | **Met** | `[CODE]` `identity.service.ts:961-990` + `:1796-1820`; `[TEST]` 8 container cases incl. "cookie without proof header" and "unrelated device untouched" (§3.5, §8.2) |
| Admin UI handles failed delivery | **Met** | `[TEST]` 16 cases, one per outcome |
| Relevant tests + typecheck + lint + build pass | **Met, with three disclosures** — 2 pre-existing admin failures (§8.1), the container suites' first run being red and the six failures mapped and fixed rather than deleted (§8.3), and **no hosted CI run existing for this SHA at all** (§8.3.1) | §8 tables |
| Documentation updated | **Met** | ADR-0004 (revocation table, transport shapes, D4 limitation, measured verification), this report v1.1, target-architecture amendment, `.env.example`, `OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-UP.md` |
| No deployment, merge or infra change | **Met** | §12 |

---

## 12. Confirmation of what was not done

No merge, no PR approval action, no deployment, no publication. No Render or Vercel setting was read for the purpose of change, and nothing in either platform's configuration, environment, or secrets was modified. No Twilio, SMTP or WhatsApp credential was created, enabled, tested against a live provider, or sent a message. No administrator or user password was reset. No database outside a throwaway test container was altered, and migration `0066` was **not** applied to staging or production. No unrelated working-tree change was committed, reverted, or stashed.

The follow-up pass additionally did **not**: open a PR (it cannot produce hosted CI evidence, so claiming one would be false); force-push; delete or skip a failing test to reach green — the six container failures were fixed in the harness or reconciled to the intended behaviour, and the two admin `management.test.tsx` failures were left failing because they are pre-existing and outside this change; fix D4 with a weak dedupe heuristic; change session-revocation semantics in `changePassword`; configure a delivery provider; or verify the cookie in a real browser.

*Prepared on `feature/otp-auth-security-hardening` from baseline `02b59d4`. The follow-up pass starts from the verified SHA `2437936a629277a93b81a892ad4f579342fd9afb`; commits are recorded in `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-UP.md`, not in a PR, because no PR exists for this branch.*
