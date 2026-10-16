# P13 Next Step — Alert Receiver Onboarding Package

**Purpose:** everything the designated receiver owner needs to implement and verify the P13 operational-alert integration contract — **without enabling any production delivery**.
**Baseline:** branch `develop`, HEAD `c01267cfd9be8cac72edb9333f7c7f036647fc1a`. Created 2026-10-16.
**Authoritative checklist:** `P13-PHASE-4.1.11-RECEIVER-VERIFICATION-CHECKLIST.md` (§3, 14 items). This package's test matrix maps 1:1 to those items.

## 0. Current status — read first

- **Receiver verification is currently 0/14.** Every checklist item is UNVERIFIED. No production receiver implementation exists in this repository or has been made available.
- **No production receiver URL or secret may be invented**, guessed, or pre-provisioned in any document or environment template.
- **No production endpoint may be probed or contacted** — not to "check availability", not for connectivity tests, not with test payloads.
- **Production alert delivery remains DISABLED** (fail-closed: no webhook URL is configured; even if one were, delivery is refused without a ≥32-character secret). It stays disabled until: the receiver is implemented, **all 14 items pass**, end-to-end evidence is retained, and the receiver owner provides explicit attributable sign-off.
- All receiver testing in this package uses **disposable test endpoints only** (e.g., an ephemeral local HTTP server under the receiver team's control — the same pattern the sender's integration tests use).

## 1. Integration contract (sender → receiver), protocol v2

The sender is the SCS API's operations alert service. When an operational condition fires (worker poll failures, overdue returns, worker-count anomalies, stale heartbeats, refund/commission integrity, tenant isolation, outbox durability, alert-delivery failure), the sender POSTs a JSON payload to the configured webhook URL with the following authentication:

### 1.1 Signature

- Algorithm: **HMAC-SHA256**.
- Canonical signed input: the exact UTF-8 bytes of the string `${timestamp}.${rawBody}` — the Unix-seconds timestamp string, a literal dot `.`, then the **exact raw request body bytes as sent** (receiver must verify against the raw bytes captured **before** JSON parsing, not a re-serialized object).
- Signature header: `X-SCS-Alert-Signature: sha256=<lowercase-hex>`.
- Timestamp header: `X-SCS-Alert-Timestamp: <unix-seconds>` (UTC).
- Shared secret: the value of the sender's `P13_OPS_ALERT_WEBHOOK_SECRET` (provisioned out-of-band when delivery is authorized — never embedded in code, docs, tickets, or logs).

### 1.2 Freshness (replay window)

- The documented default freshness window is **300 seconds (5 minutes)**, configurable on the sender via `P13_ALERT_FRESHNESS_WINDOW_SECONDS`.
- Receivers must reject deliveries whose timestamp age exceeds the agreed window (401/403), and must use the same agreed window when testing.

### 1.3 Verification requirements on the receiver

1. Recompute the HMAC over `${timestamp}.${rawBody}` using the shared secret and compare against the header value using a **constant-time comparison** (`crypto.timingSafeEqual` in Node, `hmac.compare_digest` in Python, or equivalent). Never use `==`/string equality.
2. Check timestamp freshness **before or together with** the signature comparison.
3. Reject (401/403) on: invalid signature, wrong secret, tampered body, stale timestamp, missing headers.
4. Never log the secret; never include the secret in error messages or evidence artifacts.

### 1.4 Payload and deduplication

- The payload is JSON containing a **unique alert ID (UUID)** plus condition metadata (condition key, severity, title, structured detail, resource references). The authoritative payload schema is the sender implementation (`apps/api/src/modules/operations/ops-alert.service.ts` and its delivery path); the receiver's dedup contract keys on that alert ID.
- **Deduplication requirement:** the receiver must maintain a **persistent, atomic** record of processed alert IDs (survives receiver restarts; a unique constraint or equivalent — not an in-memory set).
- **Concurrent duplicate safety:** two requests with the same alert ID arriving simultaneously must result in exactly one processing (unique constraint / insert-if-absent semantics), and both should be answered 200 idempotently.

### 1.5 Expected behavior matrix

| Scenario | Expected receiver behavior |
|---|---|
| Valid delivery (correct signature + fresh timestamp + new alert ID) | **200** (or 2xx), process once |
| Invalid signature (wrong secret) | **401/403**, do not process |
| Tampered body (any byte changed) | **401/403**, do not process |
| Stale timestamp (age > window) | **401/403**, do not process |
| Duplicate alert ID (already processed) | **200** idempotent, **no reprocessing** (no duplicate side effects) |
| Concurrent duplicates (same ID at once) | **200** for both, exactly one processing |
| Receiver internal error (5xx) | Return 5xx; the sender will treat it as retryable — do not partially commit state |
| Malformed JSON with valid signature | Receiver's choice (4xx), but the decision and behavior must be documented and tested — the signature covers malformed bytes just the same |

### 1.6 Sender retry behavior (what the receiver should expect)

- The sender marks delivery attempts with a timeout (5 s default) and treats failed deliveries as FAILED alerts, generating a meta-alert for operator awareness. Retryable receiver failures (5xx / timeout) are re-delivered **with the same alert ID**, which is precisely why the receiver's dedup-by-alert-ID must be persistent and atomic.
- The sender also deduplicates its own re-notifications within a repeat window (15 min default) — a receiver may legitimately see the same alert ID again after that window following a retryable failure.
- Note for testing: a receiver that returns HTTP 500 will cause the sender to also emit a delivery-failure meta-alert — expect **two** distinct alert IDs for one failed attempt (the original + the meta-alert), each separately dedupable.

## 2. Secret storage and rotation expectations (no actual secret appears here)

1. The shared secret is generated once (≥32 characters, cryptographically random), exchanged out-of-band, and stored in the receiver's secret store (vault / secret manager / restricted-access config) — **never** in source control, issue trackers, chat, or this package.
2. The same secret is configured on the sender only at the moment delivery is authorized (and only together with a URL, since the sender fails closed without a ≥32-char secret).
3. Rotation: agree on a rotation procedure before go-live — generate a new secret, update receiver and sender in a coordinated window (sender fails closed, log-only, if the secret is removed without a replacement), and re-run the acceptance tests (items 6–10) after rotation.
4. Evidence artifacts must contain signatures and bodies but **never** the secret; redact `Authorization`-like values if any test tooling echoes headers.

## 3. Test matrix — maps 1:1 to the 14 checklist items

Run all tests against disposable endpoints. Retain the evidence listed; evidence must be attributable (date, executor, environment) and must not contain the secret.

| Checklist item | Test to perform | Evidence to retain |
|---|---|---|
| **1. HMAC-SHA256 of exact UTF-8 `${timestamp}.${rawBody}`** | Receive a signed delivery; independently recompute the HMAC from captured raw bytes + timestamp + secret; assert match. Repeat with one body byte changed; assert mismatch | Verification script + run output |
| **2. Constant-time comparison** | Code reference or test demonstrating `timingSafeEqual`/equivalent in the verify path (not string equality) | Code link + test run |
| **3. Timestamp freshness enforcement** | Deliver with a timestamp older than the window (e.g., 600 s); assert 401/403. Deliver within window; assert accepted | Run output |
| **4. Persistent atomic dedup by alert ID** | Process an alert ID; restart the receiver; re-deliver the same ID; assert no reprocessing (persistence proof). Show the dedup store's uniqueness mechanism | Schema/constraint + run output incl. restart |
| **5. Concurrent duplicate safety** | Fire two simultaneous same-ID requests; assert exactly one processing (e.g., single side-effect row) and 200 for both | Run output |
| **6. Valid delivery accepted** | Correct signature + fresh timestamp + new ID → 200 | Captured request/response |
| **7. Tampered body rejected** | Modify one body byte → 401/403 | Captured response |
| **8. Invalid signature rejected** | Sign with a wrong secret → 401/403 | Captured response |
| **9. Stale timestamp rejected** | Aged timestamp → 401/403 | Captured response |
| **10. Duplicate + concurrent duplicate handling** | Same ID twice sequentially → 200, no reprocessing; then concurrently → 200, one processing | Run output |
| **11. Receiver error behavior** | Return 5xx for a delivery; confirm the sender treats it as retryable (alert FAILED + retry observed) | Sender-side alert row + receiver log |
| **12. Sender retry with same alert ID** | Observe a retryable failure re-delivered with the identical alert ID; receiver dedups it | Receiver log showing ID stability |
| **13. End-to-end evidence with real signed payloads** | A complete run of items 6–10 against the disposable receiver using the actual sender signing path | Retained request/response logs, redacted of secrets |
| **14. Receiver-owner sign-off** | Owner reviews items 1–13 and signs the contract | Signed attestation: name, role, date, contract version (v2), scope |

## 4. Receiver-owner sign-off template (item 14)

| Field | Value |
|---|---|
| Receiver owner name | |
| Role / team | |
| Receiver implementation (repo/system) | |
| Contract version verified | v2 (HMAC-SHA256 over `${timestamp}.${rawBody}`; headers `X-SCS-Alert-Signature`, `X-SCS-Alert-Timestamp`; 300 s default freshness) |
| Checklist items verified | ☐ 1–3 (signature/freshness) ☐ 4–5 (dedup) ☐ 6–10 (accept/reject) ☐ 11–12 (error/retry) ☐ 13 (end-to-end) |
| Evidence location | |
| Conditions (if any) | |
| Date | |

## 5. After sign-off (explicitly out of scope here)

Configuring a real webhook URL/secret on any deployment is a **separately authorized change**, done in fail-safe order (secret provisioned before URL; the sender's config layer enforces the ≥32-char requirement regardless). Until that authorization, the sender continues log-only operation, which is the documented, correct fail-closed behavior — alert visibility in the interim comes from the ops status endpoint and alert tables, not from external delivery.

## 6. Attestation

This package contains no URL, no secret, no credentials, and no receiver configuration. It activated nothing and contacted nothing. Receiver verification remains 0/14 as of HEAD `c01267c` until the receiver owner completes the matrix in §3 and signs §4.
