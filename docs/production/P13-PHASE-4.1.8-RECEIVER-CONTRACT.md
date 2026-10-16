# P13 Phase 4.1.8 — Receiver Compatibility and Replay Protection Contract

**Phase:** 4.1.8 — Local CI Closure and Defense-in-Depth Hardening
**Date:** 2026-10-15
**HEAD:** `ed6c30f` (develop)

---

## 1. Status

**Receiver v2 protocol compatibility: NOT VERIFIED.**

No production webhook receiver implementation exists in this repository. Only disposable test receivers (HTTP servers in integration tests) have been used. The sender-side signing and delivery logic is fully verified, but receiver-side security properties cannot be tested without an actual receiver implementation.

---

## 2. Sender-Side Verified Properties

The following properties are verified by the P13 test suite (30 unit + 18 integration tests):

| Property | Test Evidence |
|----------|---------------|
| HMAC-SHA256 over `<timestamp>.<body>` | Unit tests: canonical input format verified |
| `X-SCS-Alert-Signature: sha256=<hex>` | Integration WS-01: header format verified |
| `X-SCS-Alert-Timestamp: <unix-seconds>` | Integration WS-01: timestamp header present |
| Exact body bytes covered by signature | Integration WS-02: captured body verifies |
| Tampered body fails verification | Integration WS-03: modified body fails |
| Wrong secret fails verification | Integration WS-04: wrong secret fails |
| Timestamp freshness enforced (300s default) | Unit test: 600s-old timestamp rejected |
| Custom freshness window supported | Unit test: 30s/60s windows verified |
| Sender-side deduplication | Integration WS-10: duplicate suppressed |
| Secrets never in payloads | Integration WS-11: no secret/URL in body |
| Defense-in-depth: missing secret → no request | Integration WS-05 (updated): zero outbound |
| Defense-in-depth: short secret → no request | Integration WS-14: zero outbound |
| Defense-in-depth: config mutation → no unsigned | Integration WS-16: mutation blocked |
| Defense-in-depth: signing exception → no unsigned | Unit test p418: fetch never called |

---

## 3. Receiver Integration Contract

This contract specifies the required behavior of any production webhook receiver that processes P13 operational alerts. The receiver is assumed to be an external system (not implemented in this repository).

### 3.1 Protocol Requirements

The receiver MUST:

1. **Read the raw request body bytes exactly once** — before any JSON parsing, transformation, or middleware processing. The signature covers the exact UTF-8 bytes of the request body.

2. **Extract required headers:**
   - `X-SCS-Alert-Signature` — format: `sha256=<64-hex-chars>`
   - `X-SCS-Alert-Timestamp` — format: decimal Unix timestamp (seconds since epoch)

3. **Reject missing or malformed headers:**
   - If either header is absent, return 401 or 400.
   - If the signature does not start with `sha256=`, reject.
   - If the timestamp is not a valid positive integer, reject.

4. **Enforce timestamp freshness:**
   - Compute `age = |now - timestamp|`.
   - Reject if `age > freshness_window` (default: 300 seconds / 5 minutes).
   - The freshness window must be synchronized with the sender's configuration.

5. **Recompute the HMAC-SHA256 signature:**
   - Canonical input: `<timestamp>.<raw-body>` (dot separator, no additional encoding).
   - HMAC key: the shared secret (same secret configured on the sender).
   - Algorithm: HMAC-SHA256.

6. **Compare using constant-time comparison:**
   - Use `timingSafeEqual` (Node.js), `hmac.compare_digest` (Python), `subtle.ConstantTimeCompare` (Go), or equivalent.
   - Do NOT use `==` or `String.equals()` for signature comparison.

7. **Reject if signature does not match.**

8. **Atomically deduplicate alert IDs:**
   - Extract the `id` field (UUID) from the JSON body.
   - Atomically check-and-insert the `id` into a deduplication store.
   - If the `id` already exists, return 200 (idempotent acceptance) without reprocessing.
   - If the `id` is new, process the alert and record the deduplication entry.

9. **Handle concurrent duplicates safely:**
   - Two concurrent requests with the same alert `id` must not both process.
   - Use database-level atomicity (e.g., `INSERT ... ON CONFLICT DO NOTHING` in PostgreSQL).

### 3.2 Deduplication Storage Requirements

| Property | Requirement |
|----------|-------------|
| Key | Alert `id` (UUID from payload) |
| Value | Processing status + received timestamp |
| Retention | Minimum: `freshness_window + safety_margin` (recommended: 24 hours) |
| Atomicity | Check-and-insert must be atomic |
| Concurrent safety | Two concurrent requests with same `id` → only one processes |

### 3.3 Replay Protection Summary

| Control | Location | What it prevents |
|---------|----------|------------------|
| Timestamp freshness | Receiver | Replay after freshness window expires |
| Signature verification | Receiver | Tampered or forged payloads |
| Alert ID deduplication | Receiver | Replay within freshness window |
| Sender-side delivery dedup | Sender | Duplicate outbound for same condition |

**Critical:** Timestamp freshness alone does NOT prevent replay within the freshness window. The receiver MUST implement deduplication.

---

## 4. Verification Checklist for Receiver Owner

Use this checklist when the external receiver implementation is available:

- [ ] Receiver reads raw body bytes before any parsing
- [ ] Receiver extracts both `X-SCS-Alert-Signature` and `X-SCS-Alert-Timestamp`
- [ ] Receiver rejects missing/malformed headers
- [ ] Receiver enforces timestamp freshness (configurable window)
- [ ] Receiver recomputes HMAC-SHA256 over `<timestamp>.<raw-body>`
- [ ] Receiver uses constant-time comparison for signature verification
- [ ] Receiver atomically deduplicates by alert `id`
- [ ] Concurrent duplicate processing is safe (only one processes)
- [ ] Deduplication records have justified retention policy
- [ ] End-to-end test: valid signed request → 200 OK
- [ ] End-to-end test: tampered body → 401/403
- [ ] End-to-end test: stale timestamp → 401/403
- [ ] End-to-end test: duplicate alert `id` → 200 (idempotent)
- [ ] End-to-end test: concurrent duplicates → exactly one processed

---

## 5. Integration Gate

**External delivery remains DISABLED until:**
1. A production receiver implementation is available
2. The receiver passes all checklist items above
3. End-to-end testing confirms v2 protocol compatibility
4. The receiver owner signs off on the integration contract

**No changes to this repository enable external delivery.** The worker is disabled by default (`P13_WORKER_ENABLED=false`), pilot mode is legacy, and the alert webhook URL/secret are not configured in any deployment template.

---

## 6. Test Receiver Reference

The integration test suite (`p415-webhook-delivery.postgres.spec.ts`) uses a disposable HTTP receiver that:
- Captures raw body bytes
- Extracts signature and timestamp headers
- Independently verifies the HMAC-SHA256 signature
- Returns 200/202/500 as needed for test scenarios

This test receiver is NOT a production receiver. It demonstrates the verification protocol but does not implement deduplication or persistent storage.
