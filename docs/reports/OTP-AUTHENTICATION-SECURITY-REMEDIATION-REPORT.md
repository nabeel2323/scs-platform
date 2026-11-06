# OTP Authentication Security Remediation — S-1, S-2 and the Admin Delivery Defect

**Report version:** v1.0
**Date:** 2026-11-07
**Repository:** `nabeel2323/scs-platform`
**Branch:** `feature/otp-auth-security-hardening`
**Baseline (branch point):** `develop` = `02b59d43f4421b1317eea6493e79cf9ebe066eb7`
**Source of findings:** `docs/reports/OTP-IMPLEMENTATION-AND-STAGING-READINESS-AUDIT.md` (branch `audit/otp-staging-readiness-2026-11-06`), §8 findings **S-1**, **S-2** and the §1/§10 item *"the admin Phone-OTP tab discards the API's `success:false` result and advances to the code-entry step anyway"* (`apps/admin/src/app/auth/login/page.tsx:95-96` at baseline).

**Scope of this change.** Code and documentation only, on a dedicated feature branch. **Nothing was merged, deployed or published. No Twilio/SMTP/WhatsApp credential was created, changed or enabled. No Render or Vercel setting was touched. No administrator credential was reset. No production or staging data was modified. Migration `0066` was written and tested against a throwaway database, and was NOT applied to staging or production.**

---

## 0. Method and evidence classes

Same conventions as the audit that produced these findings:

| Tag | Meaning |
|---|---|
| `[CODE]` | Read from source on this branch; `file:line` given. |
| `[TEST]` | Executed locally in this session; command and count in §8. |
| `[CI-REQUIRED]` | Authored and passing locally only where Docker is available; **not executed here** — hosted CI must run it. Never presented as runtime proof. |
| `[INF]` | Inference from code plus observed behaviour; chain spelled out. |
| `[NV]` | Not verifiable with the access available. |

Two rules were enforced. First, a control that no test executes is described as *implemented*, never as *verified*. Second, no secret, OTP code, phone number, email address, digest or token value appears in this report; where presence matters, only the name is given.

---

## 1. Executive summary and verdicts

All three defects are remediated in code, with tests behind each. The behavioural proof for S-1 and S-2 runs at unit/contract level in this session; the parts that only a real Postgres can prove — constraints, indexes, cascade and sliding-window semantics — are authored but were **not** executed here, because Docker is unavailable on this machine (§8.3).

| Dimension | Verdict | Basis |
|---|---|---|
| **S-1 — client UUID as second-factor bypass** | **Remediated.** Trust now requires a server-minted 256-bit credential presented in a `Secure HttpOnly` cookie plus a same-origin proof header; the `deviceId` in the request no longer influences any trust decision. | `[CODE]` §3, `[TEST]` §8.1 (44 + 38 + 15 unit specs), `[CI-REQUIRED]` §8.3 (28 lifecycle cases) |
| **S-2 — unauthenticated, unthrottled, disclosing `device-check`** | **Remediated.** Response collapsed to the constant `{checked:true}`, guarded by a named `device-check` throttler plus a per-identifier budget, identifier normalized through the shared rule, audit writes a keyed hash only. | `[CODE]` §4, `[TEST]` §8.1/§8.2 |
| **Admin OTP silent success** | **Remediated.** The admin tab advances to code entry only on an accepted delivery; uncertainty and unavailability get distinct copy, an in-flight guard stops duplicate sends, and the retry affordance obeys the API's own `Retry-After`. | `[CODE]` §5, `[TEST]` §8.2 (16 cases) |
| **Delivery honesty across all clients** | **Remediated in the shared contract.** One classifier (`@scs/contracts`) plus a Dart mirror now reads the provider vocabulary; no client writes "code sent" on an unconfirmed send. | `[TEST]` §8.2 (6 + Flutter cases) |
| **Authentication regression** | **No regression observed.** Full API unit suite green; web green; admin failures proven pre-existing; Flutter green; typecheck/build clean. | `[TEST]` §8.1, §8.4 |
| **Runtime proof against a real database** | **NOT obtained in this session.** Docker is unavailable locally, so the two Testcontainers specs were not executed here. | §8.3 |
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
| 1. A client UUID alone must never establish trust | `loginWithPassword` decides trust **only** from `validateDeviceCredential`; `deviceId` is written to the session row as provenance for `revoke-by-device` and consulted nowhere else | `[CODE]` `apps/api/src/modules/identity/identity.service.ts:1838-1842` (with the comment at `:1753-1762`), `:1776-1783` |
| 2. Server generates and validates the credential | `crypto.randomBytes(32)` → base64url; validation is a digest lookup, never a client-supplied match | `[CODE]` `identity.service.ts:1526-1557`, `:1570-1625` |
| 3. Opaque credential in a Secure HttpOnly cookie with SameSite and expiry | `scs_device_trust`, host-only path, `HttpOnly`, `SameSite` from config, `Max-Age` = remaining hard ceiling | `[CODE]` `apps/api/src/common/auth/device-trust-cookie.ts:41`, `:229-283`; applied at `auth.controller.ts:87-95` |
| 4. Only a hash stored server-side | `credential_hash = SHA-256(secret)`, plus a DB `CHECK` that the column really is 64 lowercase hex | `[CODE]` `identity.service.ts:2507` (`hashToken`), `infra/drizzle/migrations/0066_device_trust_credential.sql:137` |
| 5. Bound to user and lifecycle | `user_id NOT NULL … ON DELETE CASCADE`; `created_by_session → sessions ON DELETE SET NULL`; owner mismatch is its own status | `[CODE]` migration `:92`, `:106`; `identity.service.ts:1588-1596` |
| 6. Revoked credentials establish nothing | `if (row.revokedAt) return {status:'revoked'}` before any slide; callers branch only on `'trusted'` | `[CODE]` `identity.service.ts:1598`, `:91-105` |
| 7. Expiration enforced | sliding 30 d, hard 90 d; past either ⇒ durable `revoked_at` with reason `EXPIRED`; slides clamp at the ceiling | `[CODE]` `identity.service.ts:67-68`, `:1600-1620`; migration `CHECK (expires_at <= hard_expires_at)` `:125` |
| 8. No cross-user reuse | UNIQUE digest index ⇒ at most one owner; a digest owned by another account returns `user_mismatch` and is never trusted | `[CODE]` migration `:148-150`, `identity.service.ts:1588-1596` |
| 9. Existing login/refresh security preserved | `loginWithPassword` keeps the 5/900 s per-email cap, the unknown-user/no-password/wrong-password invariant, and the OTP-required branch; refresh keeps rotation + reuse detection, which now also revokes the account's device credentials | `[TEST]` `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` `[CI-REQUIRED]`; `[CODE]` `identity.service.ts:862-872`, `:913`, `:1741-1751` |
| 10. Logout and revocation have defined behaviour | Logout revokes the session **and** the presented credential and clears the cookie; `revoke-by-device` de-trusts too; the user-facing device list can remove a single device; refresh-token reuse wipes every credential for that account | `[CODE]` `identity.service.ts:941-961`, `:1629-1661`, `:1670-1690`; `auth.controller.ts:238-253`; `profile.controller.ts:181-198` |
| No silent retention of the old localStorage UUID | The old `checkDeviceTrust` path is deleted; the client UUID is still *sent* (the API accepts it as provenance) but there is no code path in which it grants trust, and no fallback that would honour it if the cookie is missing | `[CODE]` `identity.service.ts:1841-1842`, `device-trust-cookie.ts:210-221` |

### 3.2 Trusted-device lifecycle (what actually happens, in order)

1. **Mint** — only after a second factor is satisfied. `verifyOtp` (phone) and `verifyEmailOtp` call `issueDeviceCredential(userId, {sessionId, label})` (`identity.service.ts:402`, `:830`). A password login that merely *looks* familiar mints nothing.
2. **Transit** — the secret leaves the process exactly once, in a `Set-Cookie` header. `transportDeviceTrust` **deletes** `deviceTrust` from the service result before the body is serialized (`auth.controller.ts:87-95`), so the value cannot appear in JSON, in an audit row, or in any log; pino additionally redacts `cookie`/`set-cookie` (`main.ts:114-120`).
3. **Present** — the browser attaches it automatically; the API reads it only through `readPresentedDeviceCredential`, which returns `null` unless the same-origin proof header is also present and the value matches `/^[A-Za-z0-9_-]{43}$/` (`device-trust-cookie.ts:58`, `:198-221`).
4. **Validate / slide** — digest lookup → owner check → revocation check → expiry check (durable) → slide `expires_at` to `min(now+30d, hard_expires_at)` and stamp `last_used_at` (`identity.service.ts:1570-1625`). On a trusted refresh the cookie's `Max-Age` is rewritten to the *remaining* ceiling so client and server agree (`:913`, `:1741-1751`).
5. **Revoke** — five entry points, each with an explicit reason written to the row: `LOGOUT` (`:955-961`), `MANUAL` (device list, `:1629-1661`), `SESSION_REVOKED` (revoke-by-device / revoke-all-sessions), `ROTATION_REUSE` (refresh-token reuse detection wipes the account's whole set, `:872`), `EXPIRED` (`:1607`). Rows are retained (not deleted) so the UNIQUE digest index keeps rejecting a dead value.
6. **Disappear** — `buildClearDeviceTrustCookie` emits the same name/attributes with `Max-Age=0` (`device-trust-cookie.ts:279-286`), and the login path clears a stale cookie when a rejected presentation arrives (`identity.service.ts:1886-1889`), so a browser does not keep re-presenting something already dead.

### 3.3 Cookie and CSRF design

The credential is a **cookie that authorises the omission of a second factor**, which is the most dangerous kind of cookie. The design is therefore explicit about the cross-site question. `apps/api/src/common/auth/device-trust-cookie.ts:1-40` records it in full; the shape is:

- **Deployment is cross-origin** — the API and the web/admin apps run on different hosts (`main.ts:78-95` allowlist, `credentials: true`). That rules out the cheap answer: `SameSite=Lax` would mean the cookie is never sent on a cross-site `POST`, i.e. nobody would ever be trusted. The working configuration is `SameSite=None; Secure`, which *is* the setting under which a malicious third-party page can make the browser attach the cookie.
- **So the cookie is not treated as authorisation by itself.** Every request that wants device trust must also send `x-device-trust: 1`. A cross-site form or `fetch` from an attacker origin cannot set that header without a CORS preflight, and the preflight only succeeds for origins on the explicit allowlist (`main.ts:78-95`, which is why `DEVICE_TRUST_PROOF_HEADER` is in `allowedHeaders` at `:93`). Cookie + no header ⇒ read as `absent` ⇒ OTP required (`device-trust-cookie.ts:198-221`).
- **The failure is in the safe direction on every axis.** Missing header, malformed value, unknown digest, wrong owner, revoked row, expired row — all six collapse into the same observable outcome: *this device needs a second factor* (`identity.service.ts:1570-1600`). None of them is distinguishable to the caller, so the endpoint is not an oracle.
- **Configuration errors abort boot rather than weaken the cookie.** `resolveDeviceTrustCookieConfig` (`device-trust-cookie.ts:103-167`, called from `main.ts:43`) throws on an unrecognised `SameSite`/`Secure` value and specifically on `SameSite=None` without `Secure` — a cookie browsers silently discard, which would look like "trust never works" rather than a misconfiguration. `SameSite` is emitted with the canonical capitalisation from the RFC examples (`:229-236`) so an inspected header matches the documented configuration without relying on parser leniency.

**Trade-off recorded honestly.** `SameSite=None` requires `Secure`, which requires TLS termination that presents the right protocol to the API; behind a proxy that hides `Forwarded`/`X-Forwarded-Proto`, a `Secure` cookie can be re-set by the browser but not re-read over plain HTTP. That is why the boot-time combination check exists, and why §10 makes proxy/TLS verification an activation step rather than an afterthought.

---

## 4. S-2 — The device-check contract

| Aspect | Baseline | Now | Evidence |
|---|---|---|---|
| Response body | `{canAutoLogin, requiresOtp, hasPassword}` | `{checked: true}` — a literal; one value for every address, authenticated or not, existing or not | `[CODE]` `identity.service.ts:2140-2177`; contract `packages/contracts/src/index.ts:237-257` (`DeviceCheckResponseSchema`, `checked: z.literal(true)`) |
| Throttling | none (no global `APP_GUARD`, no `@Throttle`) | `@UseGuards(ThrottlerGuard)` + `@Throttle({'device-check': {}})` on the route (`auth.controller.ts:303-305`) with a named profile defaulting to **10 requests / 60 s per IP**, tunable via `DEVICE_CHECK_THROTTLE_LIMIT` / `DEVICE_CHECK_THROTTLE_TTL_MS` (`app.module.ts:71-77`) | `[CODE]`, `[TEST]` `ip-throttling.spec.ts` (5 cases) |
| Second budget | none | per-identifier `device_check` 20 / 900 s (`identity.service.ts:82-83`) — deliberately **log-only**, because a per-identifier 429 on a constant-response endpoint would create a *difference* an enumerator could read (an address that throttles is an address that exists) while the per-IP guard already bounds cost | `[CODE]` `identity.service.ts:2147-2157` |
| Identifier handling | raw email | `normalizeEmail(rawEmail)` — the same rule as every other auth path, so `A@B.com` and `a@b.com` cannot be separated into different buckets | `[CODE]` `identity.service.ts:2141` |
| Validation | ad hoc | `DeviceCheckDto`: `@IsEmail()` + `@MaxLength(254)`; `deviceId` retained (the global `forbidNonWhitelisted` pipe means deleting it would break older mobile builds) but documented and treated as **ignored** | `[CODE]` `apps/api/src/modules/identity/dto/auth.dto.ts:136-151` |
| Logging | raw value reachable | audit action `auth.device_check` with `metadata.emailHash = hashIdentifier(...)`; the caller's `deviceId` is not recorded at all, because under S-1 it drives no decision | `[CODE]` `identity.service.ts:2159-2171` |
| Client impact | awaited and discarded by both web and admin | unchanged — both already ignored the payload, so the login flow behaves identically; `checkDeviceLogin` remains exported so no stale build 404s | `[CODE]` `apps/web/src/lib/auth.ts:431-448`, `apps/admin/src/lib/auth.ts:335-341`; `[TEST]` `apps/web/src/__tests__/login-device-trust.test.tsx` asserts no mount-time probe remains |

**Why the disclosure stopped mattering.** Device trust moved from "the caller tells us `deviceId`" to "the browser presents a server-issued credential", so the pre-flight had no role left to play; deleting its fields cost no functionality. That is the argument for collapsing rather than authenticating the endpoint, and it is written next to the code so the next reader does not re-add the fields `[CODE: identity.service.ts:2118-2139]`.

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

**`infra/drizzle/migrations/0066_device_trust_credential.sql`** — `public.device_credentials` (`:87-138`):

| Element | Purpose |
|---|---|
| `credential_hash text NOT NULL` + `CHECK (credential_hash::text ~ '^[0-9a-f]{64}$')` (`:137`) | Only a SHA-256 hex digest can ever be stored; a plaintext value fails the insert rather than silently existing. |
| `CREATE UNIQUE INDEX device_credentials_credential_hash_uq` (`:148-150`) | One digest resolves to at most one account (requirement 8). A unique **index**, not a `UNIQUE` constraint on `text`, is used deliberately: the surrounding comment explains the `char(64)` padding pitfall the constraint form invites. |
| `user_id … REFERENCES users(id) ON DELETE CASCADE` (`:92`) | Trust cannot outlive the account. |
| `created_by_session … REFERENCES sessions(id) ON DELETE SET NULL` (`:106`) | The credential records which session's authentication enrolled it; deleting the session must not orphan or destroy the trust silently. |
| `CHECK (expires_at <= hard_expires_at)` (`:125`) | A bug cannot produce a credential whose sliding horizon outlives its ceiling. |
| `CHECK (revoked_at IS NOT NULL OR revoked_reason IS NULL)` (`:129`) | A revoked row always says why; a live row never carries a stray reason. |
| Three secondary indexes (`:152-163`) | user-active listing, session lookup, expiry sweep. |
| **No backfill** | Deliberate: copying existing `device_trust` rows into the new table would have imported the very weakness being removed. Trust restarts empty and is re-earned by a real second factor. |
| Idempotent, additive, and reversible | `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` only; nothing is dropped, no existing table is touched, so the rollback is `DROP TABLE public.device_credentials;` (documented in the file header at `:71-77`). The old `device_trust` table is left in place and unread, so an emergency revert is a code redeploy, not a data repair. |

Drizzle schema parity is maintained in `apps/api/src/modules/identity/identity.schema.ts:156-184` so the ORM's queries and the migration describe the same constraints, and `device-trust-lifecycle.postgres.spec.ts` applies the whole root `infra/drizzle/migrations` directory in sorted order, so 0066 is executed by the same path the release scripts use rather than by a hand-copied DDL string.

**Status: NOT applied anywhere.** No staging or production database was touched. The DDL and its constraints are exercised only by `device-trust-lifecycle.postgres.spec.ts` against a throwaway Testcontainers database `[CI-REQUIRED]`.

---

## 7. Files changed

Implementation (S-1): `apps/api/src/common/auth/device-trust-cookie.ts` (new), `apps/api/src/modules/identity/identity.service.ts`, `identity.schema.ts`, `auth.controller.ts`, `profile.controller.ts`, `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/modules/identity/dto/auth.dto.ts`, `infra/drizzle/migrations/0066_device_trust_credential.sql` (new).

Contract: `packages/contracts/src/index.ts`, `packages/contracts/scripts/generate-openapi.ts` (published OpenAPI now registers `DeviceCheckResponse` (`generate-openapi.ts:77`), documents the device-check 200 as a constant acknowledgement (`:285`), and carries `otpDelivery` on `login/password`).

Clients: `apps/admin/src/app/auth/login/page.tsx`, `apps/admin/src/lib/auth.ts`, `apps/admin/vitest.config.ts` (`@/` alias so the alias-written screen is testable), `apps/web/src/app/auth/login/page.tsx`, `apps/web/src/lib/auth.ts`, `mobile/lib/models/models.dart`, `mobile/lib/services/api_service.dart`, `mobile/lib/screens/auth/login_screen.dart`, `mobile/lib/screens/profile/profile_screen.dart`.

Tests: new `apps/api/src/__tests__/unit/common/device-trust-cookie.spec.ts`, `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts`, `apps/admin/src/__tests__/auth-login-otp-delivery.test.tsx`, `apps/web/src/__tests__/login-device-trust.test.tsx`, `apps/web/src/__tests__/otp-delivery-classifier.test.ts`; extended `auth.controller.spec.ts`, `auth-dto.spec.ts`, `profile.controller.spec.ts`, `ip-throttling.spec.ts`, `contracts-phase1.openapi.spec.ts`, `password-login-regression.postgres.spec.ts`, `apps/web/src/__tests__/auth-login-channel.test.tsx`, `apps/web/src/__tests__/email-otp-login.test.tsx`, `mobile/test/auth_models_test.dart`, `mobile/test/screens/login_screen_email_otp_test.dart`, `mobile/test/screens/profile_screen_linking_test.dart`, `mobile/test/screens/widget_test_harness.dart`.

Docs: `docs/architecture/ADR-0004-SERVER-ISSUED-DEVICE-TRUST-CREDENTIAL.md` (new), `docs/production/OTP-S1.34-MULTI-CHANNEL-AUTH-TARGET-ARCHITECTURE.md` (amended, with an amendment header and the changed endpoint rows), `.env.example` (new device-trust and device-check blocks), this report.

Unrelated working-tree changes (returns module, P13 documents, scratch directories, other branches' specs) were **left untouched and are not part of these commits**.

---

## 8. Tests and exact results

### 8.1 Executed locally — the numbers as reported by the runners

| Command | Result |
|---|---|
| `pnpm --filter @scs/api test:unit` | **127 files, 2553 tests passed, 0 failed** (69.3 s) |
| `npx vitest run` over the six touched API specs | **234 passed**: `device-trust-cookie.spec.ts` 44, `contracts-phase1.openapi.spec.ts` 77, `auth.controller.spec.ts` 38, `auth-dto.spec.ts` 37, `ip-throttling.spec.ts` 23, `profile.controller.spec.ts` 15 |
| `pnpm --filter @scs/api typecheck` (`tsc --noEmit`) | **0 errors** |
| `pnpm --filter @scs/api build` | **435 files compiled; `TSC Found 0 issues`** |
| `pnpm --filter @scs/api lint` | **0 errors, 313 warnings.** Re-running ESLint over only the seven touched API files yields **two** warnings, both unused imports (`identity.service.ts:32` `hashEmail`, `:41` `featureFlags`) that exist verbatim at baseline (`git show HEAD:apps/api/src/modules/identity/identity.service.ts` lines 31 and 40); the new `device-trust-cookie.ts` is clean. The 313 is the repo-wide pre-existing count, not this change's — it was not re-measured at `02b59d4` in this session |
| `pnpm --filter @scs/contracts typecheck` / `build` | both clean |
| `pnpm --filter @scs/web test` | **7 files, 72 passed, 0 failed** — includes the 10 new device-trust cases and 6 classifier cases |
| `pnpm --filter @scs/web lint` | 2 warnings, both pre-existing and in files this change does not touch (`src/app/merchant/returns/[id]/page.tsx:44`, `src/hooks/useProductStudio.ts:262`) |
| `pnpm --filter @scs/admin test` | **3 files, 39 tests: 37 passed, 2 failed.** All 16 new `auth-login-otp-delivery.test.tsx` cases pass |
| `pnpm --filter @scs/admin lint` | **no warnings or errors** |
| `cd mobile && flutter test` | **158 tests passed** |
| `cd mobile && flutter analyze` | **0 errors; 20 info/warning issues.** The two in files this change touches (`lib/screens/auth/login_screen.dart:564,566`, `lib/screens/profile/profile_screen.dart:209`) are `prefer_const_constructors` on copy that exists verbatim at baseline (`git show HEAD:…:509` / `:176`); the rest are generated `packages/api_client` noise |

**The 2 admin failures are pre-existing and were isolated, not assumed.** Both are in `src/__tests__/management.test.tsx` (product-moderation keyboard navigation / "Complete description"), which this change does not touch. Re-running that file with the **baseline** `vitest.config.ts` (`git show HEAD:apps/admin/vitest.config.ts`, i.e. without the `@/` alias I added) and with the current config produces the identical result: `2 failed | 8 passed (10)` both times. `[TEST]`

### 8.2 What the new tests actually assert (three matrices)

**Trusted devices.** Cookie module: name/attribute serialization, host-only path, `Max-Age` from remaining ceiling vs `Max-Age=0` clear, the `43`-char pattern, `HttpOnly` always, the canonical `SameSite` spellings, and the four boot-time refusals: an unrecognised `SameSite` value, a non-boolean `Secure` value, `SameSite=None` without `Secure`, and `Secure=false` outside a local environment — plus the parser's case/whitespace tolerance (`device-trust-cookie.ts:103-167`). Service/controller (unit, with the real DI graph): a login carrying **only** a `deviceId` gets `requiresOtp`; a live credential gets a session and no OTP; a revoked one does not; an expired one does not and is durably revoked; a digest owned by another account yields `user_mismatch` and is not trusted; a request without `x-device-trust: 1` is treated as presenting nothing even though the cookie is attached (**the CSRF case**); a well-formed-but-unknown value is indistinguishable from a revoked one in the response; refresh preserves trust and slides `Max-Age`; refresh-token reuse revokes every credential for the account and the next login needs the second factor; logout clears the cookie and the row; `DELETE /v1/me/trusted-devices/:id` removes exactly one device, 400s on a non-UUID, and removes nothing for another account's id; the device list exposes no digest or digest prefix.

**Device-check.** Contract: the response schema is exactly `{checked:true}` and the published OpenAPI document describes that constant acknowledgement rather than the old three-field body (`contracts-phase1.openapi.spec.ts`, 77 cases across the whole contract). DTO: a missing or malformed email is a 400 before any lookup; an email over 254 chars, a `deviceId` over 128 chars and a non-string `deviceId` are rejected; an email-only body is accepted with `deviceId` optional, and a legacy `deviceId` string is still accepted so deployed mobile builds do not start failing — the service ignores the value; and a caller-supplied trust claim (`trusted`, `hasPassword`) or any extra field is rejected by the whitelist. Throttling/non-disclosure (`ip-throttling.spec.ts`, 5 new cases run in a **separate Nest application** whose only low profile is `device-check`: `default` 100/60 s + `device-check` 3/60 s — necessary because every profile declared in `ThrottlerModule.forRoot` applies to every route, so adding a low `device-check` limit to the shared OTP harness would have shrunk the OTP budgets instead of testing this one — documented in the file): 3 calls pass and the 4th is 429 with the service method invoked exactly 3 times (no lookup happens behind the guard); cycling the address does not reset the per-IP budget; the body is byte-identical for every address; the throttled answer contains no `trusted|hasPassword|canAutoLogin|requiresOtp` token; `Object.keys(body)` is exactly `['checked']`.

**Admin OTP interface.** For each outcome — `accepted`, provider-unconfigured (both name families), definite rejection, timeout/uncertain, a missing `otpDelivery` field, HTTP 429 mid-flight, a network error, and a concurrent double-submit — the test drives the real component and asserts the stage it lands on, the copy it shows, whether "Code sent" is present, whether the wire status string leaked, and whether the retry affordance is enabled. The password-with-OTP branch is covered too, since it now carries `otpDelivery`.

### 8.3 Not executed in this session (be precise about it)

`apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.spec.ts` (**28 cases**) and `apps/api/src/__tests__/integration/password-login-regression.postgres.spec.ts` (**24 cases**) require Testcontainers. Docker is unavailable on this machine (`Cannot connect to the Docker daemon`), so they were **not run here**; they compile, typecheck and are collected, and they will run in hosted CI. Until that run is green, the assertions that depend on real Postgres semantics — the `CHECK` refusals, the UNIQUE digest index under concurrency, `ON DELETE CASCADE`/`SET NULL` behaviour, and the sliding-window `UPDATE`s — are **design + code evidence, not runtime evidence**. That gap is deliberately the first item in §9.

### 8.4 Regression surface considered and re-verified

`contracts-phase1.openapi.spec.ts` (77) guards the published contract; `auth-dto.spec.ts` (37) guards request validation; `profile.controller.spec.ts` (15) covers the device-management endpoints; `ip-throttling.spec.ts` (23) re-covers the OTP profiles that the new profile could have disturbed; web `email-otp-login` (15) and `auth-login-channel` re-cover the flows whose fixtures had to change shape when `device-check` stopped returning `{trusted:false}`. Flutter's 158 and web's 72 are the client-side regression net.

---

## 9. Remaining risks and limitations

1. **No container-executed proof yet (§8.3).** Highest-priority open item; hosted CI on the PR is the only way to close it.
2. **Every device becomes untrusted once.** After deploy, all previously "trusted" browsers need a real OTP. Without a configured provider, password login from an untrusted device fails closed with the existing audit-visible message. Rollout order matters: **provider first, then this code.**
3. **Mobile deliberately does not participate in device trust.** The Dart client runs no cookie jar, which is stated in the code at `mobile/lib/services/api_service.dart:85`, so the server-issued `HttpOnly` credential is never presented and mobile always completes password + OTP. That is the safe side of the failure: mobile cannot be exempted by a copied identifier. It also means the convenience win of S-1 is web/admin-only today; a mobile design would need platform secure storage (Keychain/Keystore) plus a non-cookie credential path, which is out of scope here and not claimed. `[NV]` — no device or emulator run was performed in this session.
4. **`otpEmail` is dropped by the web/mobile password path.** `identity.service.ts:1897` returns a **masked** `otpEmail` for an email-only account, but `apps/web/src/lib/auth.ts:492` only reads `otpPhone ?? ''`, and the Dart model only carries `otpPhone` (`mobile/lib/models/models.dart:1088`), so an email-only user is sent to a code-entry screen with an empty destination. Pre-existing, outside these three findings, unchanged by this branch, and it does not weaken anything — it is a UX gap. Recorded so nobody discovers it as a surprise during activation.
5. **Admin has no email-OTP tab.** The phone-preferring fallback (`identity.service.ts:1850-1861`) can put an admin into the OTP-required branch with only email delivery available; the new copy says so plainly instead of pretending a code is coming, but the tab itself is still missing.
6. **Throttle storage is per-IP and shared with `TRUST_PROXY`.** The `device-check` profile is only meaningful per-client once `TRUST_PROXY` is set correctly (audit S-4); with the proxy hop unset on Render, every client shares one bucket, which now throttles *legitimate* logins too. Same caveat applies to the pre-existing OTP profiles.
7. **No provider-side delivery receipt exists** (audit S-10). "Accepted" is the strongest statement any client may make, by contract and by test.
8. **Sliding vs absolute lifetime is a judgement call, not a proof.** 30 d/90 d (`identity.service.ts:67-68`) are code constants with no product requirement behind the numbers; if the security owner wants different values they are one-line changes plus test updates.
9. **Deliberate non-change.** I considered adding IP throttling to `POST /v1/auth/login/password` itself and rejected it: that route already has a per-identifier 5/900 s cap, throttling it per IP behind a mis-set proxy would lock real users out of their own accounts, and it is not one of the three findings. Stated so it is not mistaken for an oversight.
10. **CSRF protection is header-presence, not a token.** It relies on the CORS allowlist staying tight (`main.ts:78-95`). If that allowlist ever grows to a wildcard, the proof-header argument weakens; the tests pin the header name into `allowedHeaders` so a silent removal fails loudly, but a *broadening* of origins is an operator action outside this code.

---

## 10. Prerequisites before this can be activated in staging

Ordered; steps 1-2 must precede the deploy of this branch, not follow it.

1. **Configure at least one real OTP delivery provider** (Twilio SMS is the only channel the admin UI can complete end-to-end today) — out of scope here by instruction, and explicitly **not** done in this session.
2. **Set `TRUST_PROXY` correctly** on the API (a hop count or explicit proxy CIDRs), so the new `device-check` profile and the existing OTP profiles are per-client.
3. **Apply migration `0066`** via the existing database-release path, in a maintenance-window sense only: it is additive and idempotent. Rollback is `DROP TABLE public.device_credentials;`. Keep the old `device_trust` table (unread) so the revert path stays cheap.
4. **Set the cookie configuration deliberately, not by default:** `DEVICE_TRUST_COOKIE_SAME_SITE=none`, `DEVICE_TRUST_COOKIE_SECURE=true` for the current cross-origin staging topology; `DEVICE_CHECK_THROTTLE_LIMIT` / `_TTL_MS` if 10/60 s per IP is wrong for the expected admin population (`.env.example` documents both blocks and notes the 30/90-day lifetimes are code constants).
5. **Confirm the boot-time gate did not trip** — the service refusing to start with a bad cookie combination is the intended failure mode, not a bug to suppress.
6. **Announce the one-time re-verification:** every existing user's next password login will require an OTP. Expect a spike in OTP requests and check the throttle budgets against it.
7. **Verify on a real browser:** set a `Secure` cookie across origins, send the proof header, log in password-only from a trusted device, then confirm the device appears in `/v1/me/trusted-devices` and that removing it forces a second factor again.
8. **Run the container suites in CI and read the results** (§8.3). Do not treat local unit green as proof of the DB-level constraints.
9. **Re-test the admin defect that started this:** with a provider deliberately left unconfigured, the admin Phone-OTP tab must say nothing was sent and must not advance.

---

## 11. Acceptance-criteria mapping (task §7)

| Criterion | State | How it is demonstrated |
|---|---|---|
| Copied UUID cannot bypass OTP | **Met** | `[CODE]` `identity.service.ts:1838-1842` (no `deviceId` read in the trust decision); `[TEST]` unit case "login carrying only a deviceId gets requiresOtp"; CSRF-axis case "cookie attached, proof header absent ⇒ second factor" |
| Revoked credential cannot re-establish trust | **Met** (unit) / **pending CI** (real DB) | `[CODE]` `identity.service.ts:1598`; `[TEST]` logout, device-list removal, revoke-by-device, rotation-reuse cases |
| Server-issued secure storage | **Met** | `[CODE]` `device-trust-cookie.ts:41`, `:229-283`, `auth.controller.ts:87-95`; digest-only storage + DB `CHECK` |
| Device-check non-disclosing and rate-limited | **Met** | `[CODE]` `identity.service.ts:2140`, `auth.controller.ts:303-305`; `[TEST]` constant-body, key-set, throttled-body and 429 cases |
| Admin UI handles failed delivery | **Met** | `[TEST]` 16 cases, one per outcome |
| Relevant tests + typecheck + lint + build pass | **Met locally, with two disclosures** — 2 pre-existing admin failures (§8.1) and the container suites not executed here (§8.3) | §8 tables |
| Documentation updated | **Met** | ADR-0004, target-architecture amendment, `.env.example`, this report |
| No deployment, merge or infra change | **Met** | §12 |

---

## 12. Confirmation of what was not done

No merge, no PR approval action, no deployment, no publication. No Render or Vercel setting was read for the purpose of change, and nothing in either platform's configuration, environment, or secrets was modified. No Twilio, SMTP or WhatsApp credential was created, enabled, tested against a live provider, or sent a message. No administrator or user password was reset. No database outside a throwaway test container was altered, and migration `0066` was **not** applied to staging or production. No unrelated working-tree change was committed, reverted, or stashed.

*Prepared on `feature/otp-auth-security-hardening` from baseline `02b59d4`. Commits and CI evidence are recorded in the PR.*
