# P13 Phase 4.1.6 — Webhook Replay Protection

**Date:** 2026-10-15  
**Status:** Implemented and tested  
**Protocol version:** v2 (backward incompatible with v1)

## Protocol Specification

### Headers
- `X-SCS-Alert-Signature`: `sha256=<hex-digest>` — HMAC-SHA256 hex digest
- `X-SCS-Alert-Timestamp`: `<unix-seconds>` — UTC Unix timestamp as decimal string

### Canonical Signed Input
```
<timestamp>.<body>
```
Where:
- `<timestamp>` is the decimal string representation of the UTC Unix timestamp (seconds)
- `.` is a literal dot separator
- `<body>` is the exact UTF-8 request body bytes

### Signing Algorithm
1. Generate current UTC Unix timestamp (seconds since epoch)
2. Serialize JSON payload to UTF-8 string exactly once
3. Build canonical input: `${timestamp}.${body}`
4. Compute HMAC-SHA256 over canonical input bytes using shared secret
5. Set `X-SCS-Alert-Signature: sha256=<hex>`
6. Set `X-SCS-Alert-Timestamp: <timestamp>`

### Receiver Verification
1. Extract `X-SCS-Alert-Timestamp` and `X-SCS-Alert-Signature` headers
2. Parse timestamp as integer; reject if not a valid positive number
3. Check freshness: `|now - timestamp| <= freshness_window` (default 300s)
4. Build canonical input: `${timestamp}.${body}`
5. Compute HMAC-SHA256 with shared secret
6. Compare computed signature with received signature using constant-time comparison
7. Deduplicate by alert `id` or `dedupKey` to prevent replay

### Configuration
- `P13_ALERT_FRESHNESS_WINDOW_SECONDS` — receiver freshness window (default: 300 = 5 minutes)
- Configurable per deployment

## Receiver Compatibility

**v1 receivers (Phase 4.1.5) will reject v2 signed payloads** because the canonical input includes the timestamp prefix. Operators MUST update receivers before enabling webhook delivery.

### Migration Path
1. Update receiver to parse `X-SCS-Alert-Timestamp` header
2. Update receiver to verify signature over `${timestamp}.${body}` instead of just `${body}`
3. Add freshness window check (reject timestamps older than 5 minutes)
4. Add deduplication by alert `id` or `dedupKey`
5. Confirm compatibility before setting `P13_OPS_ALERT_WEBHOOK_URL`

### No Legacy Fallback
There is no fallback to v1 signing. External delivery remains disabled (log-only) until receiver compatibility is confirmed. This is by design — no insecure legacy path exists.

## Implementation Files

| File | Change |
|------|--------|
| `ops-alert-signing.ts` | Added `TIMESTAMP_HEADER`, `DEFAULT_FRESHNESS_WINDOW_SECONDS`, `buildCanonicalInput()`. Updated `computeSignature()` and `verifySignature()` to include timestamp. |
| `ops-alert.service.ts` | Added timestamp generation and `x-scs-alert-timestamp` header in deliver(). Signs canonical `${timestamp}.${body}`. |
| `p13-ops.config.ts` | Added `alertFreshnessWindowSeconds` field, `P13_ALERT_FRESHNESS_WINDOW_SECONDS` env parsing, default 300. |

## Test Coverage

### Unit Tests (30 tests)
- Valid signature with fresh timestamp
- Modified body fails verification
- Incorrect secret fails verification
- Missing/malformed/zero/negative timestamp fails
- Timestamp outside freshness window fails
- Custom freshness window respected
- Tampered timestamp fails
- Unicode payloads
- Edge cases (empty body, boundary timestamps)

### Integration Tests (13 tests)
- End-to-end delivery with timestamp + signature
- Receiver independently verifies HMAC over canonical input
- Body tampering detected
- Wrong secret detected
- All severities signed identically
- Dead sink, 500 error, dedup, recursion guard
- No secret/URL in payloads

## Security Properties

| Property | Status |
|----------|--------|
| Replay protection (freshness window) | Yes — configurable, default 5 minutes |
| Constant-time comparison | Yes — timingSafeEqual |
| Timestamp tampering detected | Yes — signed in canonical input |
| Body tampering detected | Yes — signed in canonical input |
| Wrong secret detected | Yes |
| Missing timestamp detected | Yes |
| Deduplication required | Yes — receiver must implement by alert id/dedupKey |
| No legacy unsigned fallback | Yes — fail-closed only |
