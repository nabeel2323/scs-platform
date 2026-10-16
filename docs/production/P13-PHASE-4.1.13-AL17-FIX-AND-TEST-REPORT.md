# P13 Phase 4.1.13 — AL-17 Fix and Test Report

**Phase:** 4.1.13 | **Date:** 2026-10-16 | **Branch:** develop | **HEAD:** ed6c30f

---

## 1. Root Cause (traced from source, not assumed)

The old AL-17 ("delivery is confirmed end-to-end against a real sink") started an HTTP listener and set **only** `alerts.config.alertWebhookUrl` — never `alertWebhookSecret`. The delivery path in `ops-alert.service.ts` then hit the Phase 4.1.8 defense-in-depth gate (L255–263): `secret` null or < 32 chars → `UnsignedDeliverySuppressedError` → no network request → alert row `FAILED` → `expect(result.status).toBe('SENT')` failed. The Phase 4.1.12 observation ("expected SENT, got FAILED") was exactly this fail-closed gate working as designed against a misconfigured test — **the test did not need only a URL; it needs URL + a ≥ 32-char secret, and a receiver that checks the signed protocol**.

Two fail-closed layers exist, and the fix exercises both:

| Layer | Where | Behavior |
|-------|-------|----------|
| Config init | `p13-ops.config.ts` L155–161 (`resolveP13OpsConfig`) | URL configured without a valid secret → URL and secret nulled → `SUPPRESSED` / log-only |
| Pre-send defense-in-depth | `ops-alert.service.ts` L255–281 | Config mutated after construction, or signing throws → `UnsignedDeliverySuppressedError` → `FAILED`, **no unsigned request ever sent** |

## 2. Design of the Fix (smallest change consistent with existing architecture)

All changes are inside `p4-operational-readiness.postgres.spec.ts`; no production source file was touched.

1. **Sender configuration via the real env path, before config init.** Each sink test sets `process.env['P13_OPS_ALERT_WEBHOOK_URL']` and `process.env['P13_OPS_ALERT_WEBHOOK_SECRET']` and only then constructs a **dedicated** `new OpsAlertService(database)` — its constructor resolves `P13OpsConfig` from `process.env`, so the config-layer fail-closed gate is exercised with a passing configuration. The shared `alerts` instance (URL/secret null) is untouched, preserving fail-closed behavior for AL-18/19/20/21. Env vars are deleted in `finally` (`clearSinkEnv()`).
2. **Disposable CI-local verifying receiver** (`startAlertSink(secret)`): binds `127.0.0.1` only, on an OS-assigned ephemeral port (`listen(0, '127.0.0.1')` — deterministic startup, no cross-test port contention), closes via `closeIdleConnections()` + `close()` in every test's `finally`. Per request it:
   - reads the raw bytes and verifies UTF-8 round-trip fidelity (the signed bytes must be the exact wire bytes — no re-serialization tolerated; 400 otherwise);
   - requires both `x-scs-alert-signature` and `x-scs-alert-timestamp` (401 otherwise);
   - verifies HMAC-SHA256 over the canonical input `${timestamp}.${rawBody}` and the 300 s timestamp freshness via the shared `verifySignature()` from `ops-alert-signing.ts` (the module designed for exactly this receiver-side use) — 401 otherwise;
   - records protocol-valid deliveries (id, dedupKey, conditionKey, severity, full payload, signature, timestamp, byte length) and returns 202; rejections are recorded with reasons.
   The secret never appears in any log line, rejection record, or payload.
3. **Explicit test-only secret**: `P4_TEST_SINK_SECRET = 'p4-integration-sink-secret-0123456789abcdef!!'` (45 chars), declared in the spec with a comment labelling it CI/test-only. It is a fixture value of the same class as the pre-existing `ci-test-secret-at-least-16-chars!!` — not a credential, never used outside this spec's localhost receiver.

## 3. The Eight Mandated Demonstrations → Where They Are Proven

| # | Requirement | Proof |
|---|-------------|-------|
| 1 | Correctly configured sender delivers the expected alert | AL-17: `result.status === 'SENT'`, row `SENT`/`delivered_at`/`webhook`/`attempt_count=1`, sink holds exactly 1 delivery |
| 2 | Receiver validates signature and timestamp | AL-17 sink calls `verifySignature(rawBody, sig, ts, secret)` (HMAC + freshness) over exact bytes; `rejections` empty |
| 3 | Expected alert ID and payload received | AL-17: `delivery.id === result.id`, payload matches conditionKey/severity/title/detail/source |
| 4 | Success state recorded only after successful response | AL-17: sink answers 202 inside the handler; `raise()` resolves `SENT` only on `response.ok`; `attempt_count === 1`; AL-17c provides the contrast (401 → no state change) |
| 5 | Missing/invalid secrets suppress outbound delivery | AL-17a: short secret → config layer nulls URL → `SUPPRESSED`, `hasSink false`, log-only, sink untouched. AL-17b: post-init secret removal → `FAILED` with "unsigned delivery suppressed", sink untouched |
| 6 | Signing errors never produce unsigned outbound requests | AL-17b: zero deliveries AND zero rejections after the tampered-config raise **and** its delivery-failure meta-alert |
| 7 | Invalid signatures and tampered payloads rejected | AL-17c: wrong-secret signature → 401; valid signature over original bytes with tampered wire payload → 401; correct secret with stale timestamp → 401; then a genuine raise still delivers |
| 8 | Cleanup runs even when assertions fail | Every sink test wraps body in `try { … } finally { clearSinkEnv(); await sink.close(); }`; suite `beforeEach` additionally wipes `ops_alerts` |

No existing assertion was removed, skipped, softened, or bypassed: the old AL-17 assertions (`SENT`, `notified`, row status/`delivered_at`/`delivery_channel`, one request with matching conditionKey) are all preserved and extended. `continue-on-error` was not added anywhere. AL-18/19/20/21 are byte-identical to before; AL-19 (no-sink SUPPRESSED) still proves the no-receiver fail-closed behavior.

## 4. Evidence (fresh, this session)

- Filtered run — `pnpm exec vitest run src/__tests__/integration/p4-operational-readiness.postgres.spec.ts -t "AL-17"`: **4 passed \| 58 skipped (62), exit 0**. Service logs confirm each path: `Alert delivered: p4.sink.probe (p4.sink.probe:ops_probe) [signed]`; `no alert sink configured` (AL-17a); `signing secret missing or too short — unsigned delivery suppressed` for the probe and its meta-alert (AL-17b); `Alert delivered: p4.sink.genuine … [signed]` (AL-17c).
- Full suite — same file without the filter: **62 passed (62), exit 0** (was 59 passing + AL-17 failed in Phase 4.1.12; now 59 + AL-17 + 3 new tests).
- The 58 "skipped" in the filtered run are vitest's name-filter exclusion of unrelated tests in the same file, not conditional skips.

## 5. Status

**PASS** — AL-17 resolved through a real signed round trip; all eight demonstrations encoded as executable assertions; fail-closed behavior preserved and additionally proven by three new negative tests.
