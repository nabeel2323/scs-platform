# JWT Refresh Security Remediation Report

## 1. Executive Summary

A comprehensive security audit of the SCS platform's JWT token refresh mechanism identified **two critical (P0)** and **three high (P1)** vulnerabilities in the Flutter mobile client, plus two P2 hardening items. The web and admin clients were already correctly implemented.

### Original Vulnerabilities

| ID | Severity | Issue |
|----|----------|-------|
| P0-1 | CRITICAL | Mobile read wrong refresh response field (`refreshToken` instead of `newRefreshToken`) — every refresh crashed with TypeError, logging users out after 15 minutes |
| P0-2 | CRITICAL | No single-flight guard — concurrent 401s triggered parallel refresh rotations, tripping the server's reuse detection and revoking the entire session chain |
| P1-3 | HIGH | No supersession guard — stale refresh responses could resurrect cleared sessions after logout |
| P1-4 | HIGH | No token expiry tracking — `expiresAt` was never stored, preventing proactive refresh |
| P1-5 | HIGH | No 60-second pre-expiry refresh — every request after 15 minutes hit a 401 first |

### Remediation Status: **ALL P0 AND P1 ITEMS RESOLVED**

---

## 2. Root Causes

1. **Wrong response field**: The original `api_client.dart` read `res.data['refreshToken']` but the backend contract (`RefreshResponseSchema` in `@scs/contracts`) returns `{ accessToken, newRefreshToken }`. The field `refreshToken` does not exist in the response.

2. **Missing single-flight**: The Dio `onError` interceptor fired independently for each concurrent 401. With N parallel requests getting 401 simultaneously, N refresh calls were made with the same token. The backend's reuse detection (`revokeChain`) revoked ALL sessions for the user.

3. **Missing supersession**: No check that the session was still current after the refresh network call completed. A logout mid-flight would be overwritten by the refresh response.

4. **Missing expiry tracking**: `AuthStorage` stored only `accessToken` and `refreshToken` — no `expiresAt`. Without expiry knowledge, proactive refresh was impossible.

5. **Missing proactive refresh**: No pre-request expiry check. Every request with an expired token triggered a 401 → refresh → retry cycle, adding latency.

---

## 3. Files Changed

### Mobile Core (primary fixes)

| File | Change |
|------|--------|
| `mobile/packages/mobile-core/lib/src/api_client.dart` | Complete rewrite: fixed `newRefreshToken` field, added single-flight `Completer` guard, supersession check, robust response validation, 60s pre-expiry proactive refresh, auth endpoint bypass, retry guard, transient vs auth failure distinction |
| `mobile/packages/mobile-core/lib/src/auth_storage.dart` | Added `expiresAt` persistence (ms-epoch), `getExpiresAt()`, `clearTokens()` updated to clear expiry, `tokenLifetime` constant (15 min matching backend JWT) |

### Mobile App (caller updates)

| File | Change |
|------|--------|
| `mobile/lib/screens/auth/login_screen.dart` | Added `expiresAt` to `saveTokens()` call, added `mobile_core` import |
| `mobile/lib/screens/organizations/org_detail_screen.dart` | Added `expiresAt` to `saveTokens()` call, added `mobile_core` import |
| `mobile/lib/screens/organizations/organizations_screen.dart` | Added `expiresAt` to `saveTokens()` call, added `mobile_core` import |

### Tests

| File | Change |
|------|--------|
| `mobile/test/jwt_refresh_test.dart` | 17 new tests covering all scenarios A–J plus storage and adversarial cases |

### Files NOT Modified (verified correct)

- `apps/api/src/modules/identity/identity.service.ts` — backend rotation logic correct
- `apps/web/src/lib/auth.ts` — already reads `newRefreshToken`, has single-flight + supersession
- `apps/admin/src/lib/auth.ts` — already reads `newRefreshToken`, has single-flight + supersession
- `packages/contracts/src/index.ts` — `RefreshResponseSchema` already defines `newRefreshToken`

---

## 4. Refresh State Machine

```
VALID (expiresAt - now >= 60s)
  │
  ├─ Request → attach token → send → 200 → done
  │
  └─ Approaching expiry (expiresAt - now < 60s)
       │
       ▼
  NEAR_EXPIRY
       │
       ├─ onRequest: proactive refresh via single-flight guard
       │    ├─ Success → store new tokens → REFRESHED → send request with new token
       │    ├─ Auth failure → clear credentials → UNAUTHENTICATED
       │    └─ Transient failure → keep credentials → send request with old token
       │
       └─ Request sent with old token → server 401
            │
            ▼
       REFRESHING (reactive path)
            │
            ├─ Single-flight: if refresh already running, piggyback
            ├─ Retry guard: mark request as retried (no infinite loops)
            │
            ├─ Success → supersession check → store new tokens → RETRY
            │    ├─ Retry 200 → done
            │    └─ Retry 401 → propagate error (no second refresh)
            │
            ├─ Auth failure (4xx) → clear credentials → UNAUTHENTICATED
            └─ Transient failure → keep credentials → propagate error
```

---

## 5. Concurrency Model

**Single-flight via `Completer<bool?>`:**

```
Request A → 401 ─┐
Request B → 401 ─┼→ _doRefresh()
Request C → 401 ─┘
                  │
     A: creates Completer, sets _refreshCompleter, starts HTTP call
     B: sees _refreshCompleter != null → awaits same Future
     C: sees _refreshCompleter != null → awaits same Future
                  │
     HTTP call completes → completer.complete(true)
     _refreshCompleter = null (in finally block)
                  │
     A, B, C all receive true → all retry with new token
```

**Cleanup guarantee:** The `finally` block in `_doRefresh()` always sets `_refreshCompleter = null`, even if an exception escapes. This prevents deadlocks where all future requests would piggyback on a completed completer.

---

## 6. Logout Race Protection

**Supersession guard in `_doRefresh()`:**

1. Before the refresh HTTP call: `refreshTokenUsed = await authStorage.getRefreshToken()`
2. After the response arrives: `currentRefresh = await authStorage.getRefreshToken()`
3. If `currentRefresh != refreshTokenUsed` → the session was superseded (logout cleared it, or a newer login replaced it) → discard the refresh result

This ensures that `logout()` → `clearTokens()` cannot be overwritten by a stale refresh response arriving after the logout completed.

---

## 7. Token Storage

| Key | Storage | Purpose |
|-----|---------|---------|
| `scs_access_token` | FlutterSecureStorage | Short-lived JWT (15 min) |
| `scs_refresh_token` | FlutterSecureStorage | Long-lived rotation token (30 days) |
| `scs_expires_at` | FlutterSecureStorage | ms-epoch when access token expires |
| `scs_active_org_id` | FlutterSecureStorage | Active organization ID |

**Atomic writes:** All token fields are written concurrently via `Future.wait()` so a crash mid-write cannot leave a mix of old and new values.

**Backward compatibility:** `getExpiresAt()` returns `null` for installations that predate the `expiresAt` field. The proactive refresh treats `null` as "unknown expiry" and falls back to the reactive 401 path.

**Clear on logout:** `clearTokens()` deletes all four keys.

---

## 8. Error Semantics

| Failure Type | Example | Behavior |
|-------------|---------|----------|
| **Authentication failure** | 401 from `/v1/auth/refresh`, revoked token, reuse detected | Clear all credentials. User must re-authenticate. |
| **Transient network failure** | Timeout, connection refused, offline | Keep existing credentials. Propagate the original error. Do NOT destroy valid tokens due to network issues. |
| **Missing response fields** | `newRefreshToken` absent/null/wrong type | Fail safely. No partial credential update. Treat as auth failure. |
| **Superseded session** | Logout or newer login during refresh | Discard the stale result. Do not resurrect cleared sessions. |

This matches the web/admin behavior: network errors during refresh do not log the user out.

---

## 9. Cross-Client Parity

| Capability | Web | Admin | Mobile (after) |
|------------|-----|-------|----------------|
| Correct refresh field (`newRefreshToken`) | ✅ | ✅ | ✅ |
| Rotation (old revoked, new issued) | ✅ | ✅ | ✅ |
| Single-flight guard | ✅ `refreshPromise` | ✅ `refreshPromise` | ✅ `Completer<bool?>` |
| Supersession guard | ✅ `refreshToken !== refreshTokenUsed` | ✅ same | ✅ `currentRefresh != refreshTokenUsed` |
| Expiry tracking | ✅ `expiresAt` in session | ✅ same | ✅ `expiresAt` in secure storage |
| 60s pre-refresh | ✅ `authFetch` | ✅ `authFetch` | ✅ `onRequest` interceptor |
| 401 retry | ✅ once | ✅ once | ✅ once (retry guard flag) |
| Retry limit | ✅ (single retry) | ✅ same | ✅ `_scs_auth_retried` extra |
| Logout during refresh | ✅ supersession | ✅ same | ✅ supersession |
| Refresh failure → clear | ✅ auth failure only | ✅ same | ✅ auth failure only |
| Token redaction | ✅ no logging | ✅ no logging | ✅ no logging |

---

## 10. Tests

### Test Commands

```
cd mobile
dart analyze lib test    → No issues found!
flutter test             → 101/101 passing (84 existing + 17 new)
```

### New Test Cases (jwt_refresh_test.dart)

| Test | Scenario | Assertion |
|------|----------|-----------|
| A | Single 401 → refresh → retry | Success, 1 refresh call, 2 main calls |
| B | 3 concurrent 401s | Exactly 1 refresh, 6 main calls (3+3) |
| C | Concurrent 401 + pre-expiry | Exactly 1 refresh (shared single-flight) |
| D | Refresh returns 401 | Credentials cleared |
| E | Refresh network timeout | Credentials NOT cleared (transient) |
| F | Logout during refresh | Credentials remain cleared, no saveTokens |
| G | Superseded refresh (newer login) | Stale result discarded |
| H | Missing `newRefreshToken` field | Safe failure, no partial credentials |
| I | `newRefreshToken = null` | Safe failure, no invalid token stored |
| J | Retry returns 401 again | No infinite loop (1 refresh, 2 main calls) |
| Adversarial | 10 simultaneous 401s | 1 refresh, 10 retries, 20 main calls |
| Auth bypass | Auth endpoints | Never trigger auto-refresh |
| No session | No refresh token | No refresh call, credentials cleared |
| Storage ×4 | expiresAt persistence | Save/read/clear/tokenLifetime constant |

---

## 11. Security Findings Remaining

### P2 — Admin Logout Notification (NOT REQUIRED)

Inspected `apps/admin/src/` for React components subscribing to auth state via `onAuthChange`, `useAuth`, or `AuthProvider`. **Zero matches found.** The admin app does not have an auth state subscription mechanism, so the missing notification in `logout()` is not a bug — there are no listeners to notify.

### P2 — Token Logging Audit (PASS)

Searched the entire mobile codebase for:
- `print(.*refreshToken)`, `debugPrint(.*refreshToken)` — 0 matches
- `print(.*accessToken)`, `debugPrint(.*accessToken)` — 0 matches
- `print(.*Authorization)`, `debugPrint(.*Authorization)` — 0 matches
- `LogInterceptor`, `PrettyDioLogger` — 0 matches

The only token-related `debugPrint` calls are for FCM push notification tokens (not JWT). **No token logging exists.**

### Human UI Verification

**NOT TESTED** — The remediation was verified entirely through automated tests and static analysis. Running the mobile app against a live backend to manually verify refresh behavior was not performed.

---

## 12. Acceptance Criteria

### P0
- [x] Mobile reads `newRefreshToken`
- [x] Refresh response parsing is validated (type-checked, null-safe)
- [x] Single-flight refresh implemented (Completer-based)
- [x] Concurrent refresh test proves exactly one refresh request (Test B: 3×401→1 refresh, Adversarial: 10×401→1 refresh)
- [x] Retry behavior works (Test A)

### P1
- [x] Refresh supersession protection implemented (Test F, G)
- [x] Logout-during-refresh test passes (Test F)
- [x] expiresAt is stored (AuthStorage + all 3 callers updated)
- [x] expiresAt is cleared on logout (clearTokens includes `_expiresAtKey`)
- [x] 60-second proactive refresh implemented (onRequest interceptor)
- [x] Pre-expiry refresh shares the same single-flight mechanism (Test C)
- [x] No infinite refresh loop (Test J: retry guard flag)

### P2
- [x] Admin logout notification inspected — NOT REQUIRED (no subscribers)
- [x] Token logging audit complete — PASS (zero JWT token logging)
- [x] Cross-client parity documented (Section 9)
- [x] Security documentation created (this file)

### Quality
- [x] No fake auth behavior
- [x] No hardcoded credentials
- [x] No token logging
- [x] No unsafe infinite retry
- [x] No stale refresh resurrection
- [x] Analyzer passes (0 issues)
- [x] Tests pass (101/101)
- [x] Existing auth behavior remains functional
