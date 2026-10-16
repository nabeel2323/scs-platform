# P13 Phase 4.1.4 — Alert Readiness Report

| Field | Value |
|-------|-------|
| Phase | 4.1.4 — Priority 4 |
| Date | 2026-10-15 |
| Result | **PASS with CRITICAL FINDING — HMAC signing NOT implemented** |
| Method | Disposable HTTP receiver + source code inspection |

## 1. Test Infrastructure

- Self-contained Node.js HTTP receiver (port 19877)
- Test script: `test_alert_inline.js`
- Receiver logs all incoming requests including headers and body

## 2. Delivery Tests (6/6 PASS)

| # | Test | Result |
|---|------|--------|
| 1 | Successful alert delivery (200 OK) | PASS |
| 2 | CRITICAL severity delivery | PASS |
| 3 | Header analysis (no signing) | PASS |
| 4 | Sensitive data redaction | PASS |
| 5 | Unreachable endpoint failure | PASS |
| 6 | Timeout handling (AbortSignal) | PASS |

## 3. Implementation Analysis

### What IS Implemented
- **Deduplication**: `dedup_key` unique constraint on `ops_alerts` table
- **State machine**: PENDING → SENT/FAILED/SUPPRESSED/RESOLVED
- **Timeout**: `AbortSignal.timeout(alertDeliveryTimeoutMs)` (default 5s)
- **Recursion guard**: `deliveringFailureAlert` flag prevents infinite alert-about-alert loops
- **Meta-alert**: Alert 10 (`ops.alert.delivery_failed`) raised when delivery fails
- **Repeat window**: Re-notification suppressed within 15-minute window
- **Log fallback**: When no webhook URL configured, status=SUPPRESSED + ERROR log

### Payload Structure (buildPayload, lines 306–327)
```json
{
  "id": "uuid",
  "dedupKey": "conditionKey:resource",
  "conditionKey": "p13.worker.poll_failures",
  "severity": "WARN|CRITICAL|INFO",
  "title": "Human-readable title",
  "detail": { "identifiers": "and counts only" },
  "orgId": null,
  "resourceType": "worker_lease",
  "resourceId": "p13-return-expiration",
  "fireCount": 1,
  "source": "scs-api",
  "environment": "production",
  "emittedAt": "2026-10-15T00:00:00.000Z"
}
```

### Sensitive Data Check
- Financial amounts: **ABSENT** (PASS)
- PII (email, phone, password): **ABSENT** (PASS)
- Webhook URL: **ABSENT** from payload (PASS)
- Webhook URL: **ABSENT** from log lines (per code comment, line 21)

## 4. CRITICAL FINDING: HMAC Signing NOT Implemented

### Evidence
Source code at `ops-alert.service.ts` lines 247–252:
```typescript
const response = await fetch(this.config.alertWebhookUrl as string, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: safeJson(this.buildPayload(alertId, dedupKey, input, fireCount)),
  signal: AbortSignal.timeout(this.config.alertDeliveryTimeoutMs),
});
```

The `headers` object contains ONLY `content-type: application/json`. There is:
- No `X-SCS-Alert-Signature` header
- No `Authorization` header
- No HMAC-SHA256 computation
- No `P13_OPS_ALERT_WEBHOOK_SECRET` env var parsed in `p13-ops.config.ts`

### Impact
Webhook consumers **cannot verify** that incoming alerts originate from the SCS API. Any actor who discovers the webhook URL can inject forged alerts.

### Correction of Prior Reports
Phase 4.1.2 and 4.1.3 reports incorrectly stated that HMAC-SHA256 webhook signing was implemented. This was an error. The signing was described in design documents but never coded.

### Remediation Required
To add signing, the `fetch()` call needs:
1. Parse `P13_OPS_ALERT_WEBHOOK_SECRET` in `p13-ops.config.ts`
2. Compute HMAC-SHA256 of the JSON body using the secret
3. Add `X-SCS-Alert-Signature: sha256=<hex>` header

## 5. Verdict

| Check | Status |
|-------|--------|
| Alert delivery works (200 OK) | PASS |
| Deduplication prevents duplicates | PASS |
| Failure handling (unreachable/timeout) | PASS |
| Sensitive data redaction | PASS |
| Recursion guard | PASS |
| HMAC webhook signing | **NOT IMPLEMENTED** |

**PASS with documented gap** — Alert delivery, dedup, and failure handling work correctly. HMAC signing is a known gap requiring implementation before webhook consumers can trust alert origin.
