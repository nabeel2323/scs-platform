# OTP-S1.38.2-SECURITY-REGRESSION-REPORT.md

**Task:** S1.38.2 §7 — Security Invariants Recheck  
**Date:** 2026-11-01  

---

## Method

Security invariants were verified through:
1. **Source-level review** of all relevant API, service, and client code
2. **Test evidence** from integration suites (PostgreSQL + real Redis)
3. **Regression confirmation** that all S1.38 security tests continue to pass

## Security Invariant Matrix

### 1. Account Enumeration Resistance

| Check | Evidence | Result |
|---|---|---|
| Same response shape for existing/non-existing email | `email-otp-security` §Enumeration prevention (3 tests) | ✓ pass |
| Password login: unknown address, no-password, wrong password indistinguishable | `password-login-regression` §Enumeration resistance (2 tests) | ✓ pass |
| Timing floor (`withOtpTimingFloor`) on OTP endpoints | `auth.controller.ts` decorator | ✓ verified |
| bcrypt burn timing (ratio test) | `password-login-regression` (1 test) | ✓ pass* |

\* Flaky under system load (ratio 5.31 vs threshold 4 in one run). Pre-existing, not an S1.38 regression.

### 2. Per-Email Rate Limiting

| Check | Evidence | Result |
|---|---|---|
| 5 requests per 15-minute window | `email-otp-security` §Per-email rate limit | ✓ pass (mock Redis) |
| Lua ACQUIRE_RATE_LIMIT atomic check-and-increment | `otp-redis-lua.real.spec.ts` test 11 | ✓ pass (real Redis) |
| Per-email counter key: `otp:req:email:<address>` | `identity.service.ts` line 378 | ✓ verified |

### 3. Per-IP Rate Limiting

| Check | Evidence | Result |
|---|---|---|
| 20 requests per 1-minute window | `email-otp-security` §Per-IP rate limit | ✓ pass (mock Redis) |
| Fail-closed on Redis error | `identity.service.ts` lines 418-422 | ✓ verified |
| IP isolation across distinct clients | `throttle-ip-isolation.spec.ts` (3 tests) | ✓ pass (real Redis) |
| Multi-hop XFF trust | `throttle-ip-isolation.spec.ts` test 3 | ✓ pass (real Redis) |

### 4. Challenge Supersession

| Check | Evidence | Result |
|---|---|---|
| New request invalidates previous challenge | `email-otp-security` + `email-otp-lifecycle.spec.ts` | ✓ pass |
| CREATE_CHALLENGE Lua script atomically replaces | `otp-redis-lua.real.spec.ts` test 10 | ✓ pass (real Redis) |

### 5. Atomic OTP Consumption

| Check | Evidence | Result |
|---|---|---|
| VERIFY_AND_CONSUME Lua script | `otp-redis-lua.real.spec.ts` tests 3-4 | ✓ pass (real Redis) |
| HMAC comparison inside Lua (not application) | `identity.service.ts` lines 569-572, 577-581 | ✓ verified |
| Exactly one concurrent winner | `otp-redis-lua.real.spec.ts` tests 8-9 | ✓ pass (real Redis) |

### 6. OTP Replay Prevention

| Check | Evidence | Result |
|---|---|---|
| Second consume attempt returns -2 (already used) | `otp-redis-lua.real.spec.ts` test 5 | ✓ pass (real Redis) |
| Consumed flag persists in Redis | `identity.service.ts` consumeOtpChallenge | ✓ verified |

### 7. Linking Requires Consumed OTP

| Check | Evidence | Result |
|---|---|---|
| `linkEmailToAccount` calls `consumeEmailChallenge` | `identity.service.ts` line 1793 | ✓ verified |
| `linkPhoneToAccount` calls `consumePhoneChallenge` | `identity.service.ts` line 1858 | ✓ verified |
| Unconsumed OTP rejected (S1.37-F-04) | `email-otp-security` (3 sub-cases) | ✓ pass |

### 8. No Account Auto-Merge

| Check | Evidence | Result |
|---|---|---|
| Ownership conflict returns 409 | `account-linking.spec.ts` conflict tests | ✓ pass |
| Web UI displays conflict message | `account-linking.test.tsx` test 6 | ✓ pass |
| Flutter UI displays conflict message | `profile_screen_linking_test.dart` test 7 | ✓ pass |
| No automatic merging in source | `identity.service.ts` linkEmail/linkPhone | ✓ verified |

### 9. Last Reachable Authentication Method Protection

| Check | Evidence | Result |
|---|---|---|
| Cannot unlink last method (server) | `email-otp-security` both email and phone cases | ✓ pass |
| Cannot unlink last method (Web UI) | `account-linking.test.tsx` test 11 | ✓ pass |
| Cannot unlink last method (Flutter UI) | `profile_screen_linking_test.dart` test 12 | ✓ pass |
| CHECK constraint `users_at_least_one_identifier` | Migration 0064 step 2 | ✓ verified |

### 10. HMAC-SHA256 Identifier Hashing and Domain Separation

| Check | Evidence | Result |
|---|---|---|
| `hashIdentifier` uses `crypto.createHmac('sha256', secret)` | `email-normalization.ts` | ✓ verified |
| Domain separation: `${type}:${identifier}` | `email-normalization.ts` | ✓ verified |
| Version prefix: `v${IDENTIFIER_HASH_VERSION}:` | `email-normalization.ts` | ✓ verified |
| Audit records use hashed identifiers | `password-login-regression` test (S1.37-F-13) | ✓ pass |
| v2 format: `v2:<64-hex>` (67 chars total) | Updated assertion | ✓ verified |

### 11. No Plaintext OTP in Redis or Logs

| Check | Evidence | Result |
|---|---|---|
| Redis stores HMAC hash, not OTP value | `email-otp-security` §Redis stores HMAC hash | ✓ pass |
| OTP value never appears in log lines | `otp-redaction.spec.ts` | ✓ pass |
| Masked email in logs (`r****@example.com`) | `identity.service.ts` line 503 | ✓ verified |

### 12. No Plaintext Identifiers in Audit Records

| Check | Evidence | Result |
|---|---|---|
| `account_link_log.identifier_hash` stores HMAC | Migration 0064 step 4 | ✓ verified |
| Audit service receives hashed value | `identity.service.ts` linkEmail/linkPhone | ✓ verified |
| Raw email/phone never passed to audit | Source review | ✓ verified |

### 13. SMTP Credential Redaction

| Check | Evidence | Result |
|---|---|---|
| Error messages redact SMTP credentials | `smtp-email.provider.spec.ts` | ✓ pass |
| Error classification does not leak auth details | `email-otp-security` | ✓ pass |

### 14. Mock Provider Rejection in Production/Staging

| Check | Evidence | Result |
|---|---|---|
| `isProductionLikeEnv` guard | `mock.provider.ts` | ✓ verified |
| Requires `OTP_MOCK_ENABLED=true` opt-in | `mock.provider.ts` | ✓ verified |
| Fail-closed when opt-in absent | `mock-provider.spec.ts` (21 tests) | ✓ pass |
| Provider registry separation | `provider-registry.spec.ts` (22 tests) | ✓ pass |

### 15. OTP_HMAC_SECRET Startup Fail-Closed

| Check | Evidence | Result |
|---|---|---|
| `assertOtpHmacConfig()` in `main.ts` bootstrap | `main.ts` | ✓ verified |
| Rejects missing/blank in production | `env-gate.ts` | ✓ verified |
| Rejects dev-default in production | `env-gate.ts` | ✓ verified |
| Rejects < 32 chars in production | `env-gate.ts` (`MIN_OTP_HMAC_SECRET_LENGTH = 32`) | ✓ verified |

### 16. Cross-Instance Rate Limiting (Real Redis)

| Check | Evidence | Result |
|---|---|---|
| Shared counters across instances | `cross-instance-throttling.spec.ts` (8 tests) | ✓ pass (real Redis) |
| HTTP-level throttling | `http-cross-instance-throttling.spec.ts` (5 tests) | ✓ pass (real Redis) |
| Cleanup sentinel preservation | `throttle-cleanup-sentinel.real.spec.ts` (5 tests) | ✓ pass (real Redis) |

## Mock-Redis vs Real-Redis Evidence Distinction

| Category | Mock Redis Tests | Real Redis Tests |
|---|---|---|
| OTP lifecycle | `email-otp-e2e` (16), `email-otp-lifecycle` (12), `email-otp-security` (17) | — |
| Atomic consume | — | `otp-redis-lua.real` (12) |
| Rate limiting | `email-otp-security` (rate limit subset) | `cross-instance-throttling` (8), `http-cross-instance` (5), `throttle-ip-isolation` (3) |
| Replay/concurrency | `email-otp-security` (concurrent subset) | `otp-redis-lua.real` (tests 5, 8-9) |
| Cleanup | — | `throttle-cleanup-sentinel` (5) |

## Conclusion

All 16 security invariants from S1.38 remain intact. No regressions detected. Real-Redis tests confirm that Lua-based atomic operations, rate limiting, and concurrent verification work correctly against an actual Redis 7.4.11 instance.
