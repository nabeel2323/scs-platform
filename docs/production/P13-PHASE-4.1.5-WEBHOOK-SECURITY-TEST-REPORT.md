# P13 Phase 4.1.5 — Webhook Security Test Report

**Date:** 2026-10-15  
**Test files:** 2 new spec files, 32 tests total (19 unit + 13 integration)

## Unit Tests: p415-webhook-signing.spec.ts

**Location:** `apps/api/src/__tests__/unit/operations/p415-webhook-signing.spec.ts`  
**Result:** 19/19 PASS  
**Duration:** 1.75s

### HMAC-SHA256 Signing Utilities (10 tests)

| ID | Test | Result |
|----|------|--------|
| 1 | Produces signature in sha256=\<hex\> format | PASS |
| 2 | Matches independently computed HMAC-SHA256 | PASS |
| 3 | verifySignature accepts valid signature | PASS |
| 4 | Modified body fails verification | PASS |
| 5 | Incorrect secret fails verification | PASS |
| 6 | Missing signature fails verification | PASS |
| 7 | Signature without sha256= prefix fails | PASS |
| 8 | Empty body is still signed (edge case) | PASS |
| 9 | Unicode payloads signed as UTF-8 | PASS |
| 10 | SIGNATURE_HEADER and SIGNATURE_PREFIX are documented constants | PASS |

### Configuration Fail-Closed (9 tests)

| ID | Test | Result |
|----|------|--------|
| 1 | No webhook URL → both null (safe defaults) | PASS |
| 2 | Webhook URL + no secret → both nulled (fail closed) | PASS |
| 3 | Webhook URL + too-short secret → both nulled | PASS |
| 4 | Webhook URL + long secret → both preserved | PASS |
| 5 | Exactly 32-char secret → preserved (boundary) | PASS |
| 6 | 31-char secret → nulled (boundary fail closed) | PASS |
| 7 | Empty-string secret → treated as missing | PASS |
| 8 | Secret never appears in config serialization | PASS |
| 9 | Overrides can supply secret directly | PASS |

## Integration Tests: p415-webhook-delivery.postgres.spec.ts

**Location:** `apps/api/src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts`  
**Result:** 13/13 PASS  
**Duration:** 35.5s (includes testcontainers startup)

### Delivery with HMAC-SHA256 (13 tests)

| ID | Test | Result |
|----|------|--------|
| WS-01 | Delivered alert carries valid HMAC-SHA256 signature | PASS |
| WS-02 | Signature covers exact body bytes sent | PASS |
| WS-03 | Modified body fails receiver-side verification | PASS |
| WS-04 | Wrong secret fails receiver-side verification | PASS |
| WS-05 | No secret configured → no signature header sent | PASS |
| WS-06 | No webhook URL → SUPPRESSED (log-only) | PASS |
| WS-07 | CRITICAL alerts signed identically to other severities | PASS |
| WS-08 | Dead sink → FAILED with delivery-failure meta-alert | PASS |
| WS-09 | Receiver returning 500 → FAILED | PASS |
| WS-10 | Deduplication prevents duplicate deliveries | PASS |
| WS-11 | Payload contains no secret, URL, or financial amounts | PASS |
| WS-12 | Delivery-failure recursion guard prevents infinite loops | PASS |
| WS-13 | Content-type is application/json on signed deliveries | PASS |

## Coverage of Required Scenarios

| Requirement | Test | Status |
|-------------|------|--------|
| Valid signature generated for exact body | WS-01, WS-02 | Covered |
| Receiver independently verifies HMAC | WS-01 | Covered |
| Modified body fails verification | WS-03 | Covered |
| Wrong secret fails verification | WS-04 | Covered |
| Missing signature fails verification | Unit #6, #7 | Covered |
| Missing secret with webhook URL rejected | Config #2, #3 | Covered |
| No webhook URL preserves documented behavior | WS-06 | Covered |
| CRITICAL alerts signed like other severities | WS-07 | Covered |
| Deduplication prevents duplicate deliveries | WS-10 | Covered |
| Receiver HTTP errors handled correctly | WS-09 | Covered |
| Timeout/unreachable receiver behavior | WS-08 | Covered |
| Signature failure → no unsigned delivery | Fail-closed config | Covered |
| No secret/URL in payloads or logs | WS-11, Config #8 | Covered |
| Alert recursion protection intact | WS-12 | Covered |
| Delivery-failure alerts remain correct | WS-08 | Covered |

## Existing Tests Not Weakened

- `p41-deployment-invariants.spec.ts`: 36/36 PASS (unchanged)
- `p4-operational-readiness.postgres.spec.ts`: Existing AL-17/AL-18 tests still pass (they set config directly, no secret → unsigned delivery, which is the correct behavior when the service-level config is mutated post-construction)
- No existing tests were removed, skipped, or had timeouts increased
