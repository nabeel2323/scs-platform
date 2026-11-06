# ADR-0004 — Server-Issued Device Trust Credential

## Status

Accepted — OTP authentication security remediation (audit findings S-1, S-2)
Branch: `feature/otp-auth-security-hardening`, baseline `02b59d43`
Implementation report: `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md`

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
| Secret | `crypto.randomBytes(32)` → base64url (43 chars, 256-bit) | `identity.service.ts:73,1531`, `issueDeviceCredential` at `:1526` |
| Storage | `public.device_credentials` holds only the SHA-256 digest, `char(64)` | `infra/drizzle/migrations/0066_device_trust_credential.sql` |
| Transport | `scs_device_trust` cookie: `HttpOnly`, host-only, `Path=/`, `Secure`, `SameSite` | `common/auth/device-trust-cookie.ts:41,239-277` |
| CSRF proof | `x-device-trust: 1` header must accompany the cookie | `device-trust-cookie.ts:47-50,198-232` |
| Lifetime | 30-day sliding horizon, 90-day absolute ceiling, both enforced | `identity.service.ts:67-68`, `:1536`, `:1607` |
| Binding | `user_id` (with `ON DELETE CASCADE`) + `created_by_session` (`ON DELETE SET NULL`) | migration 0066 |
| Revocation | durable `revoked_at` + `revoked_reason` (`LOGOUT`, `MANUAL`, `SESSION_REVOKED`, `ROTATION_REUSE`, `EXPIRED`) | `identity.service.ts:1607,1635,1672,1718,2224` |

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
the presented credential (`identity.service.ts:1841`), never from the header.

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
| Logout (`/v1/auth/logout`) | revoked `LOGOUT`, cookie cleared (`identity.service.ts:958`) | revoked |
| Refresh-token reuse detected | revoked `ROTATION_REUSE` for the whole user (`:871-872`) | entire chain revoked |
| Sessions revoked by device | that device's credentials revoked `SESSION_REVOKED` (`:2224`) | those sessions revoked |
| Session row deleted | `created_by_session → NULL`, credential row survives for audit | — |
| Admin/user revokes one device | revoked `MANUAL`, scoped to the caller (`:1635`) | — |
| Sliding horizon or ceiling passes | validated as `expired`, then durably revoked `EXPIRED` (`:1607`), cookie cleared | — |
| Credential presented, user mismatch | never trusted, row untouched | — |

Two properties are worth naming explicitly, because they are the ones that break
in simpler designs:

- **Revocation cannot be raced by re-insertion.** A revoked row stays in the
  table, so the `UNIQUE` digest index keeps rejecting that value.
- **De-trust follows the session that earned it.** `created_by_session` gives
  session revocation a path to the device, which the old model lacked entirely.

`verifyOtp` enrollment also **rolls the credential** when a trusted login is
refreshed: `keepTrustedCredential` (`:1741`) returns the existing credential to
keep the cookie stable, so a device is not re-prompted mid-session, while
expiration still applies.

## Consequences

**Positive**

- A copied `deviceId` no longer buys anything; the acceptance criterion for S-1
  is a test, not a claim (`device-trust-lifecycle.postgres.spec.ts`,
  "a copied deviceId without the credential still requires OTP").
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

See `docs/reports/OTP-AUTHENTICATION-SECURITY-REMEDIATION-REPORT.md` for the
matrix and the exact command results. The runtime behaviour asserted above is
covered by `apps/api/src/__tests__/integration/device-trust-lifecycle.postgres.
spec.ts` (28 cases against a real PostgreSQL container) and
`apps/api/src/__tests__/unit/common/device-trust-cookie.spec.ts` (44 cases on the
transport layer). Both were written for this change; the container suite needs
Docker and is evidenced through hosted CI, not locally.
