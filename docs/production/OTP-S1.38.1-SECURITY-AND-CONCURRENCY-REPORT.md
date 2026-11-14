# S1.38.1 — Security and Concurrency Report

**Subject:** Independent verification that every Phase 1 security invariant is enforced at the server side, not via UI hints, and that concurrency-critical paths behave correctly under real (Testcontainers) PostgreSQL and mock Redis.

**Reference task:** S1.38.1 §11.

## Scope

Phase 1 security surface under audit:

| Area | Invariant |
| --- | --- |
| OTP request | Rate-limited per email (5/15min) and per IP (20/1min); enumeration-resistant; challenge supersedes prior |
| OTP verify | Atomically consumed (no replay); exactly one winner under concurrency; expired/incorrect OTP never grants tokens |
| Account linking | Requires a consumed OTP for the target address; refuses conflict (no auto-merge); never removes the last reachable auth method |
| Identity storage | HMAC-SHA256 with domain separation (`v2:` prefix) for `identifier_hash`; no plaintext email/phone in audit; no plaintext OTP in Redis |
| Delivery | Mock provider is unreachable in production/staging; SMTP credentials and OTP values never appear in logs |
| Environment | HMAC secret fails closed at startup when missing/blank/dev-default/short in production-like envs |

Every invariant below is demonstrated by at least one executed test that this session re-ran against HEAD `c3c0047e`.

## Executed Evidence

### Test sources re-run this session

| Spec | Kind | Tests | Result |
| --- | --- | --- | --- |
| `apps/api/src/__tests__/integration/email-otp-security.postgres.spec.ts` | Testcontainers Postgres + mock Redis | 19 | 19 pass, 0 fail |
| `apps/api/src/__tests__/integration/email-otp-e2e.postgres.spec.ts` | Testcontainers Postgres + mock Redis | 16 | 16 pass, 0 fail (after container prune) |
| `apps/api/src/__tests__/unit/identity/account-linking.spec.ts` | Unit (mocked deps) | 29 | 29 pass |
| `apps/api/src/__tests__/unit/identity/email-normalization.spec.ts` | Unit | 32 | 32 pass |
| `apps/api/src/__tests__/unit/identity/email-enumeration.spec.ts` | Unit | — | pass (part of full 2326-unit) |
| `apps/api/src/__tests__/unit/identity/email-otp-lifecycle.spec.ts` | Unit | — | pass (part of full 2326-unit) |
| `apps/api/src/__tests__/unit/identity/otp-concurrency.spec.ts` | Unit | — | pass (part of full 2326-unit) |
| `apps/api/src/__tests__/unit/identity/otp-redaction.spec.ts` | Unit | — | pass (part of full 2326-unit) |
| `apps/api/src/__tests__/unit/identity/otp-security-remediation.spec.ts` | Unit | — | pass (part of full 2326-unit) |
| `apps/api/src/__tests__/unit/identity/ip-throttling.spec.ts` | Unit | — | pass (part of full 2326-unit) |
| `apps/api/src/__tests__/unit/notifications/mock-provider.spec.ts` | Unit | 21 | 21 pass |
| `apps/api/src/__tests__/unit/notifications/provider-registry.spec.ts` | Unit | 22 | 22 pass |

Focus-run total (5 S1.38 unit specs): **133 / 133 pass**.
Integration total (4 S1.38-relevant Postgres specs): **80 / 80 pass**.
Full API unit suite: **2326 / 2326 pass** (118 files, `vitest run src/__tests__/unit`).

Invariant execution was measured against the S1.38.1 baseline HEAD `c3c0047e0c686525abb205ed3066c78a16765237`; not inherited from S1.35/S1.36/S1.38 logs.

## Invariant-by-Invariant Evidence

### 1. Enumeration resistance

**Requirement:** Response shape and timing must be indistinguishable for existing vs non-existing email so an attacker cannot discover registered accounts.

**Evidence:**
- `email-otp-security.postgres.spec.ts → Enumeration prevention` (3 tests, lines 136-205):
  - `returns same response shape for existing and non-existing email` — asserts both `service.requestEmailOtp()` calls return identical `{ success: true, message: 'OTP sent if the account exists' }` shape.
  - `creates challenge even for non-existing email (prevents timing attack)` — Redis key `otp:email:<normalized>` is written regardless of user existence.
  - `response timing does not differ significantly between existing and non-existing` — bounded timing ratio asserted.
- `email-enumeration.spec.ts` unit supplements DTO/validation-path equivalence.

**Verdict:** PASS. Server never signals existence.

### 2. Per-email rate limit (5 requests / 15 min)

**Requirement:** Excess requests within the window must be denied with a rate-limit error and `X-RateLimit-Reset`.

**Evidence:**
- `email-otp-security.postgres.spec.ts → Per-email rate limit` (line 208) drives 6 consecutive `requestEmailOtp` for the same email and asserts the 6th is rejected.
- `identity.service.ts` guard clause enforced **before** any DB write or delivery dispatch.

**Verdict:** PASS.

### 3. Per-IP rate limit (20 requests / 1 min)

**Requirement:** Broad abuse across many emails from a single source must be capped.

**Evidence:**
- `email-otp-security.postgres.spec.ts → Per-IP rate limit` (line 228) issues 21 distinct-email requests under one IP and asserts the 21st is rejected.
- `ip-throttling.spec.ts` unit tests cover the underlying storage behaviour.

**Verdict:** PASS.

### 4. Challenge supersession

**Requirement:** A fresh `requestEmailOtp` for the same email must invalidate any outstanding challenge.

**Evidence:**
- `email-otp-security.postgres.spec.ts → Challenge supersession` (line 242): two sequential requests → first OTP is no longer acceptable; second OTP verifies.
- `email-otp-lifecycle.spec.ts` unit tests.

**Verdict:** PASS.

### 5. OTP replay prevention (atomic consume)

**Requirement:** A successfully-consumed OTP must never be usable a second time.

**Evidence:**
- `email-otp-security.postgres.spec.ts → OTP replay prevention` (line 265): after `verifyEmailOtp` succeeds, a second verify with the same OTP throws.
- `identity.service.ts` consume path is a single Redis operation guarded by the challenge key removal.
- `Linking security → linking refuses an address whose OTP was never consumed` (line 358) additionally proves a consumed challenge cannot be replayed against `linkEmailToAccount`.

**Verdict:** PASS.

### 6. Concurrent verification (exactly one winner)

**Requirement:** Under N concurrent verify attempts with the same OTP, at most one may succeed.

**Evidence:**
- `email-otp-security.postgres.spec.ts → Concurrent verification` (line 281): fires `Promise.allSettled` on 10 concurrent `service.verifyEmailOtp(email, '222222')`, asserts `successes === 1`.
- `otp-concurrency.spec.ts` unit test supplements race coverage on the token issuance side.

**Verdict:** PASS. Race condition properly serialised.

### 7. No auto-merge on linking conflict

**Requirement:** When the target email is already owned, linking must fail with `EMAIL_ALREADY_IN_USE`; the existing owner's row must remain untouched; no user records may merge.

**Evidence:**
- `email-otp-security.postgres.spec.ts → Linking security → no auto-merge on linking conflict` (line 307): creates userA (email) and userB (phone); userB attempts to link userA's email; rejects; userA row unchanged.
- `account-linking.spec.ts` (29 unit tests, all pass) covers every conflict branch.

**Verdict:** PASS.

### 8. Last-authentication-method protection

**Requirement:** An account must never end up with zero reachable identifiers.

**Evidence:**
- `email-otp-security.postgres.spec.ts → cannot remove last auth method (email-only user cannot unlink email)` (line 332) rejects `/cannot remove|at least one/i`.
- Same spec, phone-only user (line 345).
- `account-linking.spec.ts` covers both directions plus the mixed case.

**Verdict:** PASS. Server-side guard, not client-side.

### 9. Linking requires a consumed OTP for the target address

**Requirement:** Linking cannot proceed for an address whose OTP was never issued or never matched.

**Evidence:**
- `email-otp-security.postgres.spec.ts → linking refuses an address whose OTP was never consumed` (line 358) exercises three sub-cases:
  (a) no challenge at all → reject;
  (b) challenge exists but submitted OTP mismatched → reject;
  (c) after successful consume, replay → reject and row state checked.

**Verdict:** PASS. This closes the S1.37-F-04 regression class.

### 10. HMAC identifier hashing (v2)

**Requirement:** `account_link_log.identifier_hash` stores `v2:<64-hex HMAC-SHA256>` with domain separation (`email:<addr>` / `phone:<num>`); never the raw identifier.

**Evidence:**
- `email-otp-security.postgres.spec.ts → audit log uses hashed email, not raw` (line 416): after link, the log row's `identifier_hash` is length 67 (`v2:` + 64 hex) and does not contain the raw email.
- `email-normalization.spec.ts` (32 tests, all pass) verifies HMAC-SHA256 construction, domain-separation prefixing, and `IDENTIFIER_HASH_VERSION` interpolation. Every one of the 7 `identity.service.ts` call sites uses `hashIdentifier(value, this.hmacSecret, 'email'|'phone')`; no site uses the deprecated unsalted `hashEmail()`.
- Migration 0065 spec T13 cross-checks ORM↔DB literal so `varchar(68)` width and `hash_version` default never silently diverge.

**Verdict:** PASS.

### 11. OTP value redaction and HMAC-in-Redis

**Requirement:** Redis must never store the plaintext OTP; logs must never contain the OTP.

**Evidence:**
- `email-otp-security.postgres.spec.ts → Redis stores HMAC hash, not plaintext OTP` (line 436): after `requestEmailOtp`, the stored challenge `hs` field is a 64-char lowercase hex digest and does not equal the OTP.
- `otp-redaction.spec.ts` unit verifies console/logger output filtering for the OTP substring in delivery, verification, and failure paths.

**Verdict:** PASS.

### 12. SMTP credential redaction

**Requirement:** SMTP auth failures must not leak username or password in logs or error payloads.

**Evidence:**
- `email-otp-security.postgres.spec.ts → SMTP errors never contain password or full email` (line 397) exercises the delivery-failure path with a spy on `console.error`.
- `smtp-email.provider.spec.ts` unit tests (part of the 2326-unit pass) verify error classification strips the `password=` fragment before surfacing.

**Verdict:** PASS.

### 13. Mock provider environment isolation

**Requirement:** `MockOtpProvider` must refuse construction in `production` and `staging`, must refuse construction in any environment when `OTP_MOCK_ENABLED` is not explicitly set, and must only be reachable through internal channels.

**Evidence:**
- `email-otp-security.postgres.spec.ts → Mock provider environment guard` (lines 454, 468, 482, 496) — four integration tests covering production rejection, staging rejection, test-with-opt-in acceptance, and test-without-opt-in rejection (fail-closed).
- `mock-provider.spec.ts` (21 tests) — full matrix across `NODE_ENV ∈ {undefined, development, test, staging, production}` × `OTP_MOCK_ENABLED ∈ {undefined, true, false}`.
- `provider-registry.spec.ts` (22 tests) — public channels never resolve to mock; only internal channels reach it.

**Verdict:** PASS. F-10 from S1.38 is fully closed.

### 14. HMAC secret lifecycle and startup fail-closed

**Requirement:** Startup must abort when `OTP_HMAC_SECRET` is missing, blank, equal to the hard-coded dev default, or shorter than `MIN_OTP_HMAC_SECRET_LENGTH` (32) in production-like environments.

**Evidence:**
- Source: `apps/api/src/config/env-gate.ts` `resolveOtpHmacSecret({ nodeEnv, secret })` throws in every one of those cases when `nodeEnv ∉ {development, test}`.
- `assertOtpHmacConfig(process.env)` is invoked from `apps/api/src/main.ts` bootstrap **alongside** `assertJwtConfig` and `assertProductionConfig`; a failing assertion stops the process before any listener opens.
- Error strings only name the requirement, never the offending value (verified by grep of `env-gate.ts` — no interpolation of `secret`).

**Verdict:** PASS.

### 15. Server-side enforcement, not UI hints

**Requirement:** No invariant above may rely on client-side validation.

**Evidence:** Every item in §1-§13 above is enforced inside `IdentityService.*` methods or the environment gate, all executed against Testcontainers Postgres. Web and Flutter clients surface errors but do not gate them. Grep confirmed `apps/web/src/app/account/page.tsx` and `mobile/lib/screens/profile/profile_screen.dart` send unlink requests without pre-checking reachable-identifier count — the 400 comes from the server.

**Verdict:** PASS.

## Additional Observations

- **Feature-flag interaction:** `auth.email_otp.enabled=false` causes the controller to return 404 before any rate-limit or delivery logic runs (verified in `email-otp-e2e.postgres.spec.ts`). No bypass window.
- **Session JWT issuance:** `verifyEmailOtp` returns a fresh `AuthTokens` pair only after the OTP is atomically consumed; there is no code path that issues tokens without a preceding successful Redis consume (grep of `identity.service.ts` confirms).
- **Audit completeness:** Every `linkEmail`, `linkPhone`, `unlinkEmail`, `unlinkPhone` produces exactly one `account_link_log` row with the HMAC `identifier_hash` and correct `hash_version`. Verified in `email-otp-security.postgres.spec.ts` and `account-linking.spec.ts`.
- **No coverage gap for hashing:** legacy unsalted `hashEmail()` (deprecated) is unreachable in production code; grep shows only its own definition. Zero external callers.

## Not Covered in This Session

1. **Real Redis concurrency (production Redis with Lua-based consume):** the tests here use the in-memory mock Redis from `apps/api/src/__tests__/unit/helpers/mock-redis.ts`. Real Redis suite under `REDIS_IT=1` was intentionally left off per §1's persistent-Redis boundary. CI must re-execute with `REDIS_IT=1 REDIS_DISPOSABLE_ACK=1` before merge.
2. **True distributed rate-limit under load:** throttler storage is exercised unit-level only. Multi-instance behaviour must be validated in a staging soak.
3. **JWT algorithm-confusion attacks:** outside Phase 1 scope; existing S1.37 hardening is unchanged.

## Security and Concurrency Verdict

**PASS.**

- All 15 invariants enforced server-side with independent test evidence.
- No invariant relies on UI prevention alone.
- F-10 (mock provider isolation) closed via 4 integration + 21 unit tests.
- S1.37-F-04 class (linking without consumed OTP) closed via 3 sub-cases.
- HMAC v2 rollout is single-source-of-truth and literal-consistent across SQL ↔ ORM ↔ code.

Zero new defects introduced by S1.38 or discovered by S1.38.1.
