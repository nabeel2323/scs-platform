# ADR-0004 — Server-Issued Device Trust Credential

## Status

Accepted — OTP authentication security remediation (audit findings S-1, S-2)
Branch: `feature/otp-auth-security-hardening`, baseline `02b59d43`
Implementation report: `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md`
Follow-up (findings B1, B5, B6 from the independent verification):
`docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-UP.md`

This ADR describes the design as it now stands on the branch, including the two
lifecycle gaps the independent verification found (logout not de-trusting through
the session, password change leaving exemptions alive) and the transport field
that turned out to be unread by the code it documented.

## Context

"Remember this device" lets a browser that has already passed a second factor
log in with a password alone. Before this change the trust decision rested on a
value the **client** supplied:

```
localStorage UUID  →  X-Device-Id header  →  sessions.device_id
                                                ↓
                              checkDeviceTrust(userId, deviceId)
                                    trusted ⇒ skip OTP
```

`device_id` is unvalidated client input of variable length with no issuance
event, no expiry, and no revocation state. Anyone who obtains a trusted
browser's localStorage value can replay it from any other browser, indefinitely,
and the server has no way to distinguish the original holder from the copier —
the two requests are indistinguishable. Copying one string permanently bypasses
OTP for that account.

That is finding **S-1**. Finding **S-2** is adjacent: `POST
/v1/auth/login/device-check` answered unauthenticated callers with
`{canAutoLogin, requiresOtp, hasPassword}`, which confirmed account existence,
whether a password was set, and whether a device was trusted — an enumeration
oracle that also revealed which accounts were password-only.

## Decision

Trust is anchored on a **cryptographically random, opaque credential that only
the server issues, only the server validates, and only the browser holds in a
HttpOnly cookie**.

| Element | Decision | Reference |
|---|---|---|
| Secret | `crypto.randomBytes(32)` → base64url (43 chars, 256-bit) | `identity.service.ts:73,1559-1561`, `issueDeviceCredential` at `:1555` |
| Storage | `public.device_credentials` holds only the SHA-256 digest, `char(64)` | `infra/drizzle/migrations/0066_device_trust_credential.sql` |
| Transport | `scs_device_trust` cookie: `HttpOnly`, host-only, `Path=/`, `Secure`, `SameSite` | `common/auth/device-trust-cookie.ts:41,239-295` |
| CSRF proof | `x-device-trust: 1` header must accompany the cookie | `device-trust-cookie.ts:47-50,198-217` |
| Lifetime | 30-day sliding horizon, 90-day absolute ceiling, both enforced | `identity.service.ts:68-71`, `:1563-1565`, `:1630-1638` |
| Binding | `user_id` (with `ON DELETE CASCADE`) + `created_by_session` (`ON DELETE SET NULL`), the latter maintained as a **live** session anchor (see Revocation) | migration 0066, `identity.schema.ts:165-177` |
| Revocation | durable `revoked_at` + `revoked_reason` (`LOGOUT`, `MANUAL`, `SESSION_REVOKED`, `ROTATION_REUSE`, `PASSWORD_CHANGE`, `EXPIRED`) | `identity.service.ts:1636,1658,1707,1796,1822,2224,2384` |

The validation function returns a six-value status
(`absent | unknown | trusted | revoked | expired | user_mismatch`,
`identity.service.ts:91-105`). Every non-`trusted` value collapses to the same
observable outcome for the caller — "OTP required" — and the reason is used only
for logging, the device list, and reuse detection.

## Why a new table

`sessions.device_id` cannot be reused as the trust key: it is client-chosen, of
variable length, and written by every login path including ones that never
passed a second factor. Keeping it as the key would preserve the exact weakness.
A trust anchor needs issuance, ownership, expiry and revocation state, which is
a table. The migration header records this reasoning so the next reader does not
try to collapse it back into `sessions`.

The old field survives for provenance only. `X-Device-Id` is still accepted and
still recorded, and it grants nothing: `loginWithPassword` evaluates trust from
the presented credential (`identity.service.ts:1870`), never from the header.

## Why the digest, not the secret

`credential_hash` stores SHA-256 of the secret. The check constraint
`credential_hash::text ~ '^[0-9a-f]{64}$'` makes a plaintext insert a database
error rather than a code-review finding. A read of the table therefore yields
material that cannot be replayed: the cookie value is not derivable from the
digest, and the digest is high-entropy, so it is not reversible by guessing.

SHA-256 (not bcrypt/argon) is correct here because the input is 256 bits of
uniform randomness — the cost function protects low-entropy secrets, and there is
no low-entropy secret to protect. Validation is a single indexed lookup, so the
comparison is exact-match on the digest rather than a slow hash verification.

## CSRF: the part a cookie-based design must answer

`HttpOnly` protects the credential from page script (XSS cannot exfiltrate it),
but it does **not** protect against CSRF: a cross-site form POST or fetch causes
the browser to attach the cookie anyway. Because Vercel-hosted frontends and the
Render-hosted API are different *sites*, the deployed cookie needs
`SameSite=None; Secure`, which explicitly permits that cross-site attachment.
So the design carries the CSRF control in the request itself:

1. Trust is evaluated only when the cookie **and** the `x-device-trust: 1`
   header arrive together (`readPresentedDeviceCredential`,
   `device-trust-cookie.ts:210-232`). Missing proof ⇒ `'absent'` ⇒ OTP.
2. `x-device-trust` is not a CORS-safelisted header, so a cross-origin page
   cannot set it without a preflight.
3. The preflight is answered by the `API_CORS_ORIGINS` allowlist
   (`main.ts:78-100`), which rejects origins that are not our own frontends.
4. An attacker who controls a *subdomain* still cannot read the cookie: it is
   host-only (no `Domain` attribute), so a sibling subdomain never receives it.

The net effect is that trust requires a request that only our own JavaScript,
served from an allowlisted origin, can make. This is the same pattern as the
"custom header" CSRF defense, adapted to a cross-site topology.

`SameSite` and `Secure` are resolved and **validated at boot**: an unknown
`SameSite` value, `SameSite=None` without `Secure`, or `Secure=false` outside
`development`/`test` aborts startup with the offending variable named
(`device-trust-cookie.ts:103-167`, called from `main.ts:43`). A misconfiguration
fails as a crash, not as a silently weaker cookie.

## Revocation semantics (the "clearly defined behaviour" requirement)

| Event | Credential effect | Session effect |
|---|---|---|
| Logout (`/v1/auth/logout`) | revoked `LOGOUT` by **two** paths — the credential presented *and* the credential the closing session enrolled (`:961`, `:1796`, `:1822`); cookie cleared if either fired | revoked |
| Password changed (`/v1/me/credentials/change-password`) | **every** live credential for the account revoked `PASSWORD_CHANGE` (`:2224`), audited when the count is non-zero; a failed change revokes nothing | unchanged from baseline: the `deviceId` named by the request has its sessions revoked, others survive; with no `deviceId`, every session is revoked |
| Refresh-token reuse detected | revoked `ROTATION_REUSE` for the whole user (`:871-872`) | entire chain revoked |
| Sessions revoked by device | that device's credentials revoked `SESSION_REVOKED` (`:2384`) | those sessions revoked |
| Refresh rotation / trusted password login | anchor moves to the new session (`:1767`); trust itself is untouched and slid | new session row created, old one revoked |
| Session row deleted | `created_by_session → NULL`, credential row survives for audit | — |
| Admin/user revokes one device | revoked `MANUAL`, scoped to the caller (`:1658`) | — |
| Sliding horizon or ceiling passes | validated as `expired`, then durably revoked `EXPIRED` (`:1636`), cookie cleared | — |
| Credential presented, user mismatch | never trusted, row untouched | — |

Two properties are worth naming explicitly, because they are the ones that break
in simpler designs:

- **Revocation cannot be raced by re-insertion.** A revoked row stays in the
  table, so the `UNIQUE` digest index keeps rejecting that value.
- **De-trust follows the session that earned it.** `created_by_session` gives
  session revocation a path to the device, which the old model lacked entirely.
  That path only holds if the link is *maintained*: rotation and trusted logins
  replace the session row, so `anchorCredentialToSession` (`:1767`) moves the
  anchor to the browser's live session. It is a lookup key for de-trust, not a
  proof of trust — `validateDeviceCredential` never reads it, so moving it
  grants nothing. Where a credential was minted without an anchor (the direct
  `issueDeviceCredential` path), logout falls back to the presented-credential
  path, exactly as before.

Logout therefore has two independent ways to end trust, and needs both. Presenting
requires the cookie *and* the proof header; a request carrying only its refresh
token used to close the session and leave the exemption sitting in that browser
profile — the shared-profile case requirement 10 exists for.

Password change is account-wide on purpose and is the one response that does not
depend on where an anchor points: if a credential is suspected copied, changing
the password kills every exemption the account holds. Note the asymmetry this
leaves with the inherited session logic — credentials are revoked for all devices,
sessions only for the device named in the request. Changing that is a session-
semantics change, so it is recorded rather than silently made.

A trusted login or refresh does **not** re-mint the credential. No new secret is
needed — the browser already holds one that just validated — and minting one per
login would pile up live rows for a single physical device. `keepTrustedCredential`
(`:1848`) instead returns the same value with its remaining *absolute* lifetime so
the cookie's `Max-Age` tracks the ceiling rather than the sliding horizon, clamped
at it. The transport instruction (`device-trust-cookie.ts:297-306`, docblock at
`:289-296`) therefore has
exactly three shapes: install a credential (`{credential, maxAgeSeconds}`), remove
one (`{clear: true}`), or say nothing. An earlier `{keep: true}` shape was
documented and asserted by tests but never read by `applyDeviceTrustCookie`; it has
been removed rather than implemented, because a no-op instruction and no
instruction are the same thing on the wire.

## Consequences

**Positive**

- A copied `deviceId` no longer buys anything; the acceptance criterion for S-1
  is a test, not a claim — `device-trust-lifecycle.postgres.spec.ts`, "does not
  let a copied client-side deviceId carry trust it once had", which logs in with
  the same account, the same password and the same `deviceId` but without the
  credential, and is challenged for OTP.
- A stolen database dump yields digests, not credentials.
- Cross-user reuse is structurally impossible (`UNIQUE` digest ⇒ at most one row
  ⇒ one owner) and additionally checked at validation time (`user_mismatch`).
- Trust always expires: continuous use cannot make OTP-free login permanent.
- `device-check` no longer answers questions at all, so the enumeration oracle is
  gone rather than rate-limited.

**Negative / costs**

- **Every existing browser becomes untrusted once.** Migration 0066 deliberately
  performs no backfill: converting historical `sessions.device_id` values would
  carry the weakness forward and silently mark unknown devices trusted. After
  this migration each device completes OTP once to re-enrol. **Therefore real OTP
  delivery must be configured before it is applied anywhere.** (See the
  remediation report, "Staging activation prerequisites".)
- A new table and a new cookie surface appear in the auth path; the API refuses
  to start without the table, so rollback means deploying the previous build at
  the same time.
- Cookie-bearing flows now require CORS `credentials: true`, which is why the
  origin list must stay an explicit allowlist — `*` is not an option.
- The Flutter client cannot rely on this path: a mobile HTTP client has no
  browser cookie jar semantics that match this design, so the app keeps
  OTP-per-login and does not receive or present the credential. That limitation
  is documented, not papered over.

**Non-change recorded for honesty**

IP-based throttling was **not** added to `POST /v1/auth/login/password`. It
already has per-account lockout and per-IP coverage from the global throttler,
and behind a shared proxy a per-IP limit punishes every user of that egress
address — including the 404/429 UX of an entire office NAT. The S-2 fix targets
disclosure, not that endpoint's budget.

## Known limitation: one browser can hold more than one live credential (finding D4)

Nothing in the current model identifies *the same physical browser* across
enrolments, so a device that completes OTP repeatedly accumulates live credential
rows — one per OTP verification, each with its own 30/90-day clock. Four things
were considered, and none is safe enough to implement inside this ADR:

| Strategy | Why it is not adopted here |
|---|---|
| Deduplicate on the client-supplied `deviceId` | That value is exactly what S-1 removed as a trust input. Using it as a *identity* key would re-grant the copier's power: whoever pastes the UUID also inherits the dedupe target, and can pin or clear another browser's credential by naming it. |
| Deduplicate on the cookie value | A browser that enrols twice receives a *new* secret each time; the old row is simply no longer presented. There is no stable server-visible handle in the request to match on. |
| Cap live credentials per account (e.g. keep the newest N) | Silently revokes a legitimate device the user still holds — a phone that has not been used in 29 days loses trust while a second browser that enrolled an hour ago keeps it. Revocation must be a decision someone can explain, and the account owner has no signal for "which of these five rows is the laptop I stopped using". |
| Deduplicate on the session anchor | `created_by_session` names a session, and sessions are replaced on every rotation, so it distinguishes sessions rather than browsers. |

What is in place instead, and what the management surface needs:
`listDeviceCredentials` (`identity.service.ts:1732`) already exposes
`deviceLabel`, `createdAt`, `lastUsedAt`, `expiresAt` and `hardExpiresAt` per row,
which is enough for a person to recognise devices by platform and by when they
were last seen. The label comes from `deviceInfo.platform` at enrolment
(`web` / `ios` / `android`) and is display-only, never a security input. A browser
holding two rows will show two entries with the same label and different last-used
times, which is honest but not yet a good interface.

**Proposed follow-up (separate ADR).** Distinguish browsers from sessions with a
server-issued, persistent *browser instance id* — minted as an `HttpOnly` cookie
alongside the credential, unrelated to trust, and used as the dedupe key: enrolment
replaces the live row for that instance instead of adding one. That gives a real
"this browser" identity the client cannot forge or choose, which is the
prerequisite for both dedupe and a defensible per-account cap. It is a schema and
cookie-surface change and a client-visible behaviour change, so it belongs in its
own decision record and its own rollout, not in a lifecycle fix.

**Interim mitigation that already exists.** An account can revoke any or all of
its devices — one at a time from the device list (`MANUAL`), per device
(`SESSION_REVOKED`), or all at once by changing the password (`PASSWORD_CHANGE`) —
and a forgotten credential cannot outlive its 90-day ceiling.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Keep the client UUID, add a server-side "trusted" flag | The copyable secret is the defect; a flag on `sessions` does not make the value non-forgeable. |
| HMAC the client UUID with a server secret | Deterministic function of client input: the copier presents a valid MAC for the same UUID. Trust would still be derivable from something the client chose. |
| Signed, stateless token in the cookie (JWT-like) | No revocation path without a denylist, and a denylist is a table again. Sliding expiry plus "revoked today" cannot be expressed statelessly. |
| Store the credential in `localStorage`, send as a header | Removes the cookie/CSRF question but restores the original failure mode: script-readable, copyable, exfiltratable by XSS. |
| Reuse `sessions.device_id` as the key | Unvalidated, variable-length, no issuance event; keeps S-1 alive. |
| `SameSite=Lax` in staging/production | Our frontends and the API are different *sites* when deployed, so a Lax cookie is not attached to the API's cross-site POSTs; the credential would never arrive and every login would demand OTP. |

## Verification

The runtime behaviour asserted above is covered on two axes, and — unlike the
first pass of this change — both have been executed against the real
dependencies rather than only reasoned about.

Container axis. `apps/api/src/__tests__/integration/device-trust-lifecycle.
postgres.spec.ts` (**41 cases**) and `apps/api/src/__tests__/integration/
password-login-regression.postgres.spec.ts` (**24 cases**) run against a
Testcontainers `postgres:16-alpine` database with the whole root
`infra/drizzle/migrations` directory applied in sorted order, so migration
`0066` is exercised through the same path the release scripts use. On this
machine Docker is available and the suite was run: **2 files passed, 65 tests
passed, 0 failed**. That covers the `CHECK` refusals, the UNIQUE digest index,
`ON DELETE CASCADE`/`SET NULL`, the sliding-window `UPDATE`s, the session
anchor, `PASSWORD_CHANGE` revocation and the logout paths — previously
design-only claims.

Transport axis. `apps/api/src/__tests__/unit/common/device-trust-cookie.spec.ts`
(**44 cases**) pins the cookie serialization, the proof-header gate and the
boot-time refusals; `pnpm --filter @scs/api test:unit` reports **127 files,
2553 tests passed** with the same code.

Hosted CI. Feature-branch pushes produce **no** workflow run: `.github/
workflows/ci.yml` triggers only on `push`/`pull_request` to `main` or
`develop`, so until this branch opens a PR against one of those, there is no
hosted CI evidence for any SHA of it and none is claimed here. The container
numbers above are local Docker runs, which is a different thing; see
`docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-FOLLOW-UP.md` for the
full command list and for which claims still lack a hosted-CI run.
