# SCS-M7.3-B.3.3.2.2 — PRE-IMPLEMENTATION ARCHITECTURE AUDIT

**Retry-After Header Parsing**

| Field | Value |
|---|---|
| Milestone | M7.3-B.3.3.2.2 |
| Task type | Pre-implementation architecture audit — READ-ONLY |
| Date | 2026-10-01 |
| Branch | develop |
| HEAD | 2814107 |
| Predecessor | M7.3-B.3.3.2.1 — CLOSED / PASS |
| Business Lock | SCS-M7.3-B.3.3.2-BUSINESS-RULES-ARCHITECTURE-LOCK.md (LOCKED) |
| Verdict | **GO WITH CONDITIONS** |

---

## 1. Executive Summary

B.3.3.2.2 closes a single gap: the carrier HTTP client creates `RateLimitCarrierError` on HTTP 429 **without reading the `Retry-After` response header**. The `retryAfterSeconds` field on the error class exists but is always `undefined` because the HTTP client discards the header.

The retry policy (`CarrierRetryPolicy.calculateDelay()`) already consumes `retryAfterSeconds` when set — it uses the value (capped at `maxDelayMs`) instead of exponential backoff. No retry policy change is needed.

The fix is confined to **one production file**: `carrier-http-client.ts`. The method `classifyHttpStatus()` must receive the response headers, parse `Retry-After` as integer seconds, and pass the value to `RateLimitCarrierError`.

**Verdict: GO WITH CONDITIONS** — implementation can proceed after explicitly locking the malformed-input decisions identified in §17.

---

## 2. Current Retry Architecture

```
Carrier HTTP request (native fetch())
        ↓
CarrierHttpClient.request()
        ↓
response.status >= 400 → classifyHttpStatus(status, req, rawBody)
        ↓
429 → new RateLimitCarrierError('Rate limit exceeded (HTTP 429)', opts)
        ↓                              ↑ retryAfterSeconds NOT SET
        ↓
throw classified error
        ↓
handleCancel() catch → classifyCarrierError(err) → decision='backoff'
        ↓
throw err (re-throw for retryable/backoff)
        ↓
processEvent() catch → handleFailure(eventId, event, err)
        ↓
retryPolicy.classify(err, attempts)
        ↓
calculateDelay(): err instanceof RateLimitCarrierError && err.retryAfterSeconds
        ↓
retryAfterSeconds is undefined → falls through to 2× exponential backoff
        ↓
outbox PENDING + nextAttemptAt
```

**The gap is at the HTTP client level.** The retry policy is already wired correctly — it just never receives the value.

---

## 3. HTTP Client Analysis

**File:** `carrier-http-client.ts` (417 lines)

### 3.1 HTTP Library

Uses **Node.js native `fetch()`** (line 293). NOT axios. No additional HTTP library.

### 3.2 Response Representation

`CarrierHttpResponse<T>` (lines 72–85) includes `headers: Record<string, string>`. Headers are collected from the native `fetch()` `Headers` object at lines 184–187:

```typescript
const responseHeaders: Record<string, string> = {};
response.headers.forEach((value, key) => {
  responseHeaders[key] = value;
});
```

**However**, this collection only occurs for **successful** responses (status < 400). For error responses (status >= 400), the code enters the `classifyHttpStatus()` branch at line 171–182 and throws before header collection.

### 3.3 How 429 Is Currently Detected

`classifyHttpStatus()` (lines 345–400) receives only three parameters:

```typescript
private classifyHttpStatus(
  status: number,
  req: CarrierHttpRequest,
  rawBody: string,
): CarrierError
```

At line 380–385:

```typescript
if (status === 429) {
  return new RateLimitCarrierError(
    'Rate limit exceeded (HTTP 429)',
    opts,
  );
}
```

**The response headers are NOT passed to `classifyHttpStatus()`.** The `response` object is available in the calling scope (line 162) but not forwarded.

### 3.4 Information Currently Discarded

| Data | Available? | Used? |
|---|---|---|
| `response.headers` | YES (native fetch Headers) | NO — not passed to error classification |
| `Retry-After` header | YES (if carrier sends it) | NO — never read |
| `response.status` | YES | YES — passed to classifyHttpStatus |
| `rawBody` | YES | YES — passed to classifyHttpStatus |

### 3.5 Header Normalization

Native `fetch()` `Headers` object normalizes header names to **lowercase**. `response.headers.get('retry-after')` works regardless of the original casing (`Retry-After`, `retry-after`, `RETRY-AFTER`).

### 3.6 Multiple Retry-After Headers

If the carrier sends multiple `Retry-After` headers, the `Headers` API combines them with `", "` (comma-space). The resulting string (e.g., `"30, 60"`) would fail `parseInt()` cleanly and fall through to the malformed-input fallback.

### 3.7 Redirects

`fetch()` is called with `redirect: 'error'` (line 298). Redirects are NOT followed — they throw an `AbortError`. No redirect-related header handling concern.

### 3.8 Response Metadata Availability

The `response` object (native `fetch()` `Response`) is fully available at line 162 when `classifyHttpStatus()` is called at line 172. The `response.headers` property provides `Headers.get(name)` for any header.

---

## 4. RateLimitCarrierError Analysis

**File:** `carrier-errors.ts` lines 92–115

### Constructor Signature

```typescript
constructor(
  message: string,
  opts: {
    providerKey: string;
    operation: string;
    carrierCode?: string;
    retryAfterSeconds?: number;
  },
)
```

### Field Properties

| Property | Type | Optional? | Default |
|---|---|---|---|
| `retryAfterSeconds` | `number` | YES | `undefined` |
| `readonly` | YES | — | — |
| Persisted in DB? | NO | — | Transient (error object only) |
| Trusted by retry policy? | YES | — | `calculateDelay()` reads it directly |

### Serialization

`toSafeMessage()` (lines 109–114):

```typescript
override toSafeMessage(): string {
  const base = super.toSafeMessage();
  return this.retryAfterSeconds
    ? `${base} — retry after ${this.retryAfterSeconds}s`
    : base;
}
```

The `retryAfterSeconds` value is included in the safe message only when truthy. This is used for logging and outbox `lastError` persistence. **No raw header value is persisted — only the parsed integer.**

### Contract

```
Retry-After HTTP header (from carrier response)
        ↓
parseInt(value, 10) → integer seconds
        ↓
RateLimitCarrierError.retryAfterSeconds
        ↓
CarrierRetryPolicy.calculateDelay()
        ↓
Math.min(retryAfterSeconds * 1000, maxDelayMs)
        ↓
nextAttemptAt = Date.now() + delayMs
```

---

## 5. Retry Policy Analysis

**File:** `carrier-retry-policy.ts` lines 136–163

### How retryAfterSeconds Is Consumed

```typescript
// Rate-limit: respect Retry-After
if (err instanceof RateLimitCarrierError && err.retryAfterSeconds) {
  return Math.min(err.retryAfterSeconds * 1000, max);
}

// Rate-limit without Retry-After: 2x normal backoff
const multiplier = err instanceof RateLimitCarrierError ? 2 : 1;
```

### Behavior Matrix

| `retryAfterSeconds` value | Condition check | Behavior |
|---|---|---|
| `undefined` | falsy → skip | 2× exponential backoff |
| `0` | falsy → skip | 2× exponential backoff |
| `-1` | truthy → enter branch | `Math.min(-1000, max)` = **-1000ms** ← PROBLEM |
| `NaN` | truthy → enter branch | `Math.min(NaN, max)` = **NaN** ← PROBLEM |
| `Infinity` | truthy → enter branch | `Math.min(Infinity, max)` = **max** (safe) |
| `1.5` | truthy → enter branch | `Math.min(1500, max)` = 1500ms (acceptable) |
| `30` | truthy → enter branch | `Math.min(30000, max)` = 30s ✓ |
| `7200` | truthy → enter branch | `Math.min(7200000, 3600000)` = **3600000ms (capped)** ✓ |
| `999999999999` | truthy → enter branch | `Math.min(huge, max)` = **max (capped)** ✓ |

### Findings

1. **Maximum cap**: Already handled by `Math.min(..., max)` at line 147. `max` defaults to `DEFAULT_MAX_DELAY_MS = 3_600_000` (1 hour). **No change needed.**

2. **Negative values**: The retry policy does NOT guard against negative `retryAfterSeconds`. A negative value would produce a negative delay, causing `new Date(Date.now() + negative)` to set `nextAttemptAt` in the past. The claim query would pick it up immediately. **The HTTP client MUST validate before setting.**

3. **NaN**: Similar to negative — would produce `NaN` delay, causing `new Date(NaN)` = Invalid Date. **The HTTP client MUST validate before setting.**

4. **Zero**: Falls through to 2× backoff (acceptable — `Retry-After: 0` is unusual and the 2× backoff is a safe default).

5. **Jitter interaction**: When `retryAfterSeconds` is set, jitter is NOT applied (line 147 returns directly). This is correct — the carrier's explicit directive should be honored without randomization.

6. **Retry policy changes needed**: **NONE.** The existing implementation correctly handles all cases that the HTTP client will produce after validation. The HTTP client is the validation boundary.

---

## 6. Retry-After Propagation Path

### Full Trace

```
HTTP 429 + Retry-After: 120
        ↓
native fetch() response
        ↓
response.headers.get('retry-after') → "120"
        ↓
parseRetryAfterSeconds("120") → 120  [NEW FUNCTION]
        ↓
new RateLimitCarrierError('Rate limit exceeded (HTTP 429)', {
  providerKey, operation, retryAfterSeconds: 120
})
        ↓
throw classified  (line 181)
        ↓
handleCancel() catch (line 629)
        ↓
classifyCarrierError(err) → { decision: 'backoff', safeMessage: '...' }
        ↓
classification.decision === 'backoff' → NOT timeout, NOT terminal
        ↓
Falls to retryable branch (lines 682-698):
  carrierCancelStatus = PENDING
  carrierCancelRetries++
  carrierCancelErrorClass = 'backoff'
  throw err  ← RateLimitCarrierError with retryAfterSeconds PRESERVED
        ↓
processEvent() catch (line 235)
        ↓
handleFailure(eventId, event, err)  ← err still has retryAfterSeconds
        ↓
retryPolicy.classify(err, attempts)
        ↓
calculateDelay(err, attempt):
  err instanceof RateLimitCarrierError → YES
  err.retryAfterSeconds → 120 (truthy)
  return Math.min(120 * 1000, 3_600_000) = 120_000ms
        ↓
nextAttemptAt = new Date(Date.now() + 120_000)
        ↓
outbox: PENDING + nextAttemptAt set
```

### Boundaries Where retryAfterSeconds Could Be Lost

| Boundary | Risk | Mitigation |
|---|---|---|
| HTTP client → error object | **CURRENT GAP** — header not read | B.3.3.2.2 fixes this |
| Error throw → handleCancel catch | NONE — same object reference | No mitigation needed |
| handleCancel re-throw → processEvent catch | NONE — same object reference | No mitigation needed |
| processEvent → handleFailure | NONE — same object passed as `err` | No mitigation needed |
| handleFailure → retryPolicy.classify | NONE — `instanceof` check preserves type | No mitigation needed |
| classify → calculateDelay | NONE — `err.retryAfterSeconds` accessed directly | No mitigation needed |

**Conclusion:** There is exactly ONE boundary where the value is lost: the HTTP client's `classifyHttpStatus()` method. All other boundaries preserve the error object by reference.

---

## 7. Format Handling

### Supported Format: Integer Seconds

```
Retry-After: 30     → 30 seconds
Retry-After: 120    → 120 seconds
Retry-After: 3600   → 3600 seconds
```

### Explicitly Deferred: HTTP-date

```
Retry-After: Wed, 21 Oct 2015 07:28:00 GMT
```

**NOT supported. NOT to be implemented in B.3.3.2.2.**

The existing business lock BD-05 states: "Retry-After overrides exponential backoff; capped at maxDelay." The lock document §6.2 explicitly states: "Integer seconds: REQUIRED. HTTP-date: NOT REQUIRED — explicitly deferred."

**Recommendation:** The release closure document for B.3.3.2.1 already confirms this deferral. No re-lock is needed — the existing lock is clear.

---

## 8. Malformed-Input Policy

### Input Matrix

| Input | `response.headers.get('retry-after')` | `parseInt(value, 10)` | Recommended behavior |
|---|---|---|---|
| `Retry-After: 30` | `"30"` | `30` | **Use it** ✓ |
| *(missing)* | `null` | N/A | **Fallback to 2× backoff** ✓ |
| `Retry-After:` | `""` | `NaN` | **Fallback** (NaN is invalid) |
| `Retry-After: abc` | `"abc"` | `NaN` | **Fallback** |
| `Retry-After: -1` | `"-1"` | `-1` | **Fallback** (negative is invalid) |
| `Retry-After: 1.5` | `"1.5"` | `1` | **Use parsed integer** (parseInt truncates) OR **Fallback** |
| `Retry-After: NaN` | `"NaN"` | `NaN` | **Fallback** |
| `Retry-After: Infinity` | `"Infinity"` | `NaN` | **Fallback** |
| `Retry-After: 999999999999999999999` | `"999999999999999999999"` | `999999999999999999999` (exceeds MAX_SAFE_INTEGER) | **Fallback** (exceeds safe integer) |
| `Retry-After: "30"` | `'"30"'` | `NaN` | **Fallback** (quotes are not valid) |
| `Retry-After: " 30 "` | `" 30 "` | `30` | **Use it** (parseInt trims whitespace) |
| `Retry-After: 30abc` | `"30abc"` | `30` | **Use parsed integer** (parseInt stops at non-digit) OR **Fallback** |
| `Retry-After: 30, 60` | `"30, 60"` | `30` | **Use first value** OR **Fallback** (duplicate headers) |

### Recommended Policy

The parser function should implement a **strict validation** approach:

```typescript
function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const trimmed = value.trim();
  // Must be a pure integer string (optional leading sign, digits only)
  if (!/^-?\d+$/.test(trimmed)) return undefined;
  const parsed = parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed <= 0) return undefined;  // zero and negative are invalid
  if (parsed > 86400) return undefined;  // >24h is unreasonable → fallback
  return parsed;
}
```

**Rationale for strict regex:**
- `parseInt("30abc")` returns `30` — but `"30abc"` is not a valid Retry-After value. Strict parsing rejects it.
- `parseInt("1.5")` returns `1` — but `"1.5"` is not an integer. Strict parsing rejects it.
- `parseInt(" 30 ")` returns `30` — whitespace trimming is acceptable per HTTP spec.
- `parseInt("30, 60")` returns `30` — but duplicate headers indicate a protocol issue. Strict parsing rejects it.

**Rationale for upper bound (86400 = 24h):**
- Values exceeding `CARRIER_RETRY_MAX_DELAY_MS` (1h) are already capped by the retry policy.
- However, values like `999999999999` should not reach the retry policy at all.
- 86400 seconds (24h) is a generous upper bound. The retry policy will further cap at 1h.
- This provides defense-in-depth: the HTTP client rejects unreasonable values, and the retry policy caps reasonable ones.

### Needs Re-lock?

The existing lock BD-05 says "Retry-After overrides exponential backoff; capped at maxDelay." The lock §6.3 says:
1. "Malformed Retry-After MUST NOT crash the worker" ✓ (fallback to 2× backoff)
2. "Retry-After MUST NOT exceed CARRIER_RETRY_MAX_DELAY_MS" ✓ (retry policy caps)
3. "Missing Retry-After MUST fall through to normal retry policy" ✓ (undefined → 2× backoff)

**The existing lock is sufficient.** The strict-vs-lenient parsing decision is an implementation detail within the locked safety rules. No re-lock is required.

---

## 9. Maximum-Delay Behavior

### Current Cap Authority

`CarrierRetryPolicy.calculateDelay()` line 147:

```typescript
return Math.min(err.retryAfterSeconds * 1000, max);
```

Where `max` defaults to `DEFAULT_MAX_DELAY_MS = 3_600_000` (1 hour).

### Where Capping Should Occur

**Single authority: `CarrierRetryPolicy.calculateDelay()`.**

The HTTP client should NOT duplicate the cap. It should parse the raw integer and pass it through. The retry policy already caps at `maxDelayMs`.

**Example:**
```
Retry-After: 7200  (2 hours)
        ↓
HTTP client parses: retryAfterSeconds = 7200
        ↓
Retry policy: Math.min(7200 * 1000, 3_600_000) = 3_600_000ms (1h cap)
```

### Recommendation

Do NOT add capping in the HTTP client. The retry policy is the single authority for delay caps. The HTTP client's only validation is rejecting clearly malformed values (negative, NaN, >86400).

---

## 10. Zero-Second Retry

### Current Behavior

`Retry-After: 0` → `parseRetryAfterSeconds("0")` → `parsed <= 0` → `undefined` → fallback to 2× exponential backoff.

### Retry Policy Handling of Zero

If `retryAfterSeconds = 0` were set:
- `err.retryAfterSeconds` is `0` (falsy) → condition at line 146 is false → falls through to 2× backoff.

**Both paths produce the same result: 2× exponential backoff.**

### Is `nextAttemptAt ≈ now` Acceptable?

If `Retry-After: 0` were honored literally, `nextAttemptAt = Date.now() + 0 = now`. The claim query would pick it up on the next poll cycle. This is technically acceptable but provides no backoff at all.

### Recommendation

Treat `Retry-After: 0` as invalid → fallback to 2× backoff. This is the safer default and consistent with the strict parser (`parsed <= 0 → undefined`). No arbitrary minimum delay is introduced.

---

## 11. Security Analysis

### Header Injection

The `Retry-After` header value is read via `response.headers.get('retry-after')` which returns a string. The parser converts it to an integer or `undefined`. **No raw string value is ever persisted, logged, or used in SQL.** Only the validated integer reaches `RateLimitCarrierError.retryAfterSeconds`.

**Risk: NONE.** The parsed integer cannot inject anything.

### Prototype Pollution

The parser is a pure function operating on a string. No object key assignment from user input. **Risk: NONE.**

### Unsafe Numeric Conversion

| Conversion | Risk | Mitigation |
|---|---|---|
| `parseInt("abc", 10)` → `NaN` | NaN propagation | Regex guard rejects non-numeric strings |
| `parseInt("-1", 10)` → `-1` | Negative delay | `parsed <= 0` check rejects |
| `parseInt("999999999999999999999", 10)` | Exceeds MAX_SAFE_INTEGER | Regex + `Number.isFinite()` + upper bound check |
| `parseInt("Infinity", 10)` → `NaN` | NaN propagation | Regex rejects non-digit characters |

### Integer Overflow

JavaScript `parseInt()` on very large digit strings returns a number that may exceed `Number.MAX_SAFE_INTEGER`. The strict regex `/^-?\d+$/` accepts any digit string, but the `parsed > 86400` upper bound check rejects anything unreasonable. Values within 1–86400 are always safe integers.

### Malicious Strings

All malicious strings (`"{{constructor}}"`, `"__proto__"`, `"0; DROP TABLE"`) fail the regex `/^-?\d+$/` and return `undefined`. **Risk: NONE.**

### Duplicate Headers

Native `fetch()` combines duplicate headers with `", "`. The combined string (e.g., `"30, 60"`) fails the strict regex and returns `undefined`. **Safe fallback.**

### Credential Safety

The `Retry-After` header never contains credentials. The parser does not read any other headers. No Authorization, Cookie, or credential headers are accessed or persisted.

---

## 12. Multi-Carrier Impact

### Generic vs. Provider-Specific

The `Retry-After` header is an **HTTP-standard header** (RFC 7231). Any carrier may return it on HTTP 429. The parsing is implemented in the **generic HTTP client** (`carrier-http-client.ts`), not in any provider-specific code.

### Provider Impact

| Provider | Uses CarrierHttpClient? | Impact |
|---|---|---|
| Aramex | YES (for HTTP operations) | Benefits from generic Retry-After parsing |
| Manual Delivery | NO (no HTTP calls) | No impact — no HTTP 429 possible |

### Aramex-Specific Note

Aramex reports throttling inside its response body ("fake 200" envelope), NOT as HTTP 429. The Aramex provider's `checkAramexThrottle()` (line 895–906) creates `RateLimitCarrierError` without `retryAfterSeconds` from the body content. This is unaffected by B.3.3.2.2 — the HTTP-client-level parsing only applies to actual HTTP 429 responses.

### Regression Check

No provider-specific logic is added. The change is in `classifyHttpStatus()` which is called for ALL providers uniformly. Manual delivery provider is unaffected (no HTTP calls).

---

## 13. Test Architecture

### Minimum Required Tests

#### Unit Tests (carrier-http-client.ts)

| # | Test | Validates |
|---|---|---|
| 1 | 429 without Retry-After → `retryAfterSeconds` undefined | Missing header fallback |
| 2 | 429 with `Retry-After: 30` → `retryAfterSeconds = 30` | Valid integer parsing |
| 3 | 429 with `Retry-After: 120` → `retryAfterSeconds = 120` | Larger valid value |
| 4 | 429 with `Retry-After: 3600` → `retryAfterSeconds = 3600` | Max reasonable value |
| 5 | 429 with `Retry-After: 7200` → `retryAfterSeconds = 7200` | Above cap (HTTP client passes raw; retry policy caps) |
| 6 | 429 with `Retry-After: abc` → `retryAfterSeconds` undefined | Malformed fallback |
| 7 | 429 with `Retry-After:` (empty) → `retryAfterSeconds` undefined | Empty fallback |
| 8 | 429 with `Retry-After: -1` → `retryAfterSeconds` undefined | Negative fallback |
| 9 | 429 with `Retry-After: 1.5` → `retryAfterSeconds` undefined | Fractional fallback |
| 10 | 429 with `Retry-After: 0` → `retryAfterSeconds` undefined | Zero fallback |
| 11 | 429 with `Retry-After: 999999999999` → `retryAfterSeconds` undefined | Overflow fallback |
| 12 | 429 with `Retry-After: "30"` → `retryAfterSeconds` undefined | Quoted value fallback |
| 13 | 429 with `Retry-After: 30abc` → `retryAfterSeconds` undefined | Suffix garbage fallback |
| 14 | 429 with `retry-after: 60` (lowercase) → `retryAfterSeconds = 60` | Case insensitivity |
| 15 | Existing 500/502/503/504 behavior unchanged | No regression |
| 16 | No credential leakage in error messages | Security |

#### PostgreSQL Tests

| # | Test | Validates |
|---|---|---|
| 1 | Valid Retry-After → `nextAttemptAt` reflects carrier value | End-to-end propagation |
| 2 | Retry-After above max → `nextAttemptAt` capped at 1h | Cap enforcement |
| 3 | Missing Retry-After → `nextAttemptAt` uses 2× backoff | Fallback scheduling |
| 4 | Malformed Retry-After → `nextAttemptAt` uses 2× backoff | Malformed fallback |

#### Concurrency

Verify Retry-After does not bypass `FOR UPDATE SKIP LOCKED` or create duplicate retry scheduling. The existing PG-09 concurrency test (100 workers) already validates the claiming mechanism. Retry-After only affects `nextAttemptAt` timing, not claiming.

---

## 14. Migration Analysis

**No migration required.**

`retryAfterSeconds` is transient retry metadata. It exists only in the error object during processing. It is NOT persisted as a shipment database field. The retry policy consumes it to compute `nextAttemptAt`, which IS persisted (on the outbox event), but that column already exists.

---

## 15. Scheduler Analysis

B.3.3.2.2 continues using the existing scheduler:

| Component | Reused? |
|---|---|
| `handleFailure()` | YES — unchanged |
| `CarrierRetryPolicy.classify()` | YES — unchanged |
| `outbox.nextAttemptAt` | YES — unchanged |

**NOT introduced:**

- No `setTimeout`
- No separate Retry-After queue
- No carrier-specific scheduler
- No timer loop
- No shipment-level retry scheduler

---

## 16. Observability

### Current State

No Retry-After-specific logging exists. The existing `handleFailure()` logs `classification.safeMessage` which includes the retry decision.

### Recommended Approach

Minimal change. The `RateLimitCarrierError.toSafeMessage()` already includes `retry after Xs` when `retryAfterSeconds` is set. This flows through to `handleFailure()` → `lastError` on the outbox row. No additional logging code is needed.

If logging is added during implementation:
- Log normalized numeric seconds only: `Retry-After: ${seconds}s`
- Do NOT log raw header content
- Do NOT log credentials
- Use existing `this.logger` patterns

---

## 17. Business Decisions Requiring Lock

| Decision | Existing Lock | Recommendation | Needs Re-lock? |
|---|---|---|---|
| Integer seconds | BD-05: "Retry-After overrides exponential backoff" | Support integer seconds | **NO** — already locked |
| HTTP-date | Lock §6.2: "NOT REQUIRED — explicitly deferred" | Deferred | **NO** — already locked |
| Missing header | Lock §6.3: "Missing → fall through to normal retry policy" | Fallback to 2× backoff | **NO** — already locked |
| Malformed header | Lock §6.3: "Malformed MUST NOT crash" | Fallback to 2× backoff | **NO** — already locked |
| Negative | Not explicitly locked | Fallback (invalid) | **NO** — covered by "malformed" rule |
| Fractional | Not explicitly locked | Fallback (not an integer) | **NO** — covered by "integer seconds" requirement |
| Zero | Not explicitly locked | Fallback (not a positive integer) | **NO** — implementation detail |
| Maximum cap | BD-05: "capped at maxDelay" | Retry policy caps (single authority) | **NO** — already locked |
| Jitter interaction | Not explicitly locked | No jitter on Retry-After (carrier directive) | **NO** — existing behavior |
| Duplicate headers | Not explicitly locked | Fallback (combined string is not valid integer) | **NO** — covered by "malformed" rule |

**All decisions are covered by the existing lock.** No re-lock is required.

---

## 18. Expected Production Files

### Files to Change

| File | Change | Scope |
|---|---|---|
| `carrier-http-client.ts` | Add `parseRetryAfterSeconds()` helper; modify `classifyHttpStatus()` to accept headers; pass `retryAfterSeconds` to `RateLimitCarrierError` | ~20–30 lines added |

### Files NOT Changed

| File | Reason |
|---|---|
| `carrier-errors.ts` | `RateLimitCarrierError` already supports `retryAfterSeconds` — no change needed |
| `carrier-retry-policy.ts` | Already consumes `retryAfterSeconds` correctly — no change needed |
| `carrier-circuit-breaker.ts` | Unrelated to Retry-After |
| `shipping-carrier.worker.ts` | Error propagation preserves the error object — no change needed |
| `aramex.provider.ts` | Aramex throttling is body-based, not HTTP 429 — no change needed |
| Migration files | No schema change |
| Schema files | No schema change |

---

## 19. Scope Boundary

### MUST Implement

- `Retry-After` integer-seconds parsing in `carrier-http-client.ts`
- Propagation into `RateLimitCarrierError.retryAfterSeconds`
- Valid 429 handling with header
- Missing header fallback (undefined → 2× backoff)
- Malformed header fallback (undefined → 2× backoff)
- Security validation (NaN, negative, overflow, injection)
- Unit tests (minimum 16)
- PostgreSQL tests (minimum 4)

### MUST NOT Implement

- HTTP-date `Retry-After` parsing
- UNKNOWN state
- Timeout reconciliation
- DNS reconciliation
- Carrier state lookup
- Cancellation reconciliation
- Tracking changes
- Webhook changes
- Delivered-after-cancel
- Admin recovery
- New retry scheduler
- New migration
- Changes to retry budget (max attempts)
- Changes to circuit breaker architecture
- Changes to `carrier-errors.ts` (unless constructor contract needs adjustment — audit says NO)
- Changes to `carrier-retry-policy.ts` (audit says NO)

---

## 20. Risks

| ID | Severity | Risk | Mitigation |
|---|---|---|---|
| R-1 | LOW | Carrier sends malformed Retry-After that passes parseInt but is semantically wrong | Strict regex validation rejects non-pure-integer strings |
| R-2 | LOW | Carrier sends extremely large but valid Retry-After (e.g., 86400) | HTTP client upper bound (86400) + retry policy cap (3600s) provide defense-in-depth |
| R-3 | LOW | Aramex "fake 200" throttling does not benefit from Retry-After | Aramex throttling is body-based, not HTTP 429. This is correct behavior — Aramex does not send Retry-After in its envelope |
| R-4 | NONE | Retry policy changes needed | Audit confirms retry policy already handles all cases correctly |
| R-5 | NONE | Migration needed | No schema change — Retry-After is transient metadata |

---

## 21. Implementation Sequence

```
B.3.3.2.2 Architecture Audit ← CURRENT (this document)
        ↓
Business / Architecture Lock (confirm existing lock covers all decisions)
        ↓
Implementation (carrier-http-client.ts only)
        ↓
Unit Tests (16+ tests for parseRetryAfterSeconds + classifyHttpStatus)
        ↓
Real PostgreSQL Tests (4+ tests for nextAttemptAt verification)
        ↓
Concurrency Tests (verify Retry-After does not bypass FOR UPDATE SKIP LOCKED)
        ↓
Independent Runtime Verification
        ↓
Release Closure
```

---

## 22. Final Verdict

### GO WITH CONDITIONS

**Conditions:**

1. The malformed-input policy (§8) must be explicitly confirmed during the business/lock phase: strict regex validation, positive integers only, upper bound 86400, all invalid inputs fall back to 2× backoff.

2. The zero-second behavior (§10) must be confirmed: `Retry-After: 0` → fallback to 2× backoff.

**These conditions are implementation details within the existing lock's safety rules. They do not require re-locking — they require explicit documentation in the implementation report.**

**Summary:**

- Architecture is clear: the existing abstractions are sufficient
- Only one production file needs modification: `carrier-http-client.ts`
- The retry policy and error class already support the full contract
- No migration, no new scheduler, no provider-specific changes
- All security concerns are addressed by strict input validation
- The existing business lock covers all required decisions

---

*End of pre-implementation architecture audit.*

*Verdict: GO WITH CONDITIONS*

*No production code was modified in this task.*
