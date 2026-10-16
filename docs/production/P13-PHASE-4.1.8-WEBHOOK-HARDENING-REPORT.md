# P13 Phase 4.1.8 — Webhook Hardening Report

**Phase:** 4.1.8 — Local CI Closure and Defense-in-Depth Hardening
**Date:** 2026-10-15
**HEAD:** `ed6c30f` (develop)

---

## 1. Weakness Identified

Phase 4.1.7 identified a service-level weakness in `ops-alert.service.ts`:

> If the webhook URL is present and the secret is absent because configuration is mutated after initialization, the delivery path can send an unsigned request.

The config layer (`resolveP13OpsConfig`) guarantees fail-closed at initialization: if URL is set but secret is missing/short, both are nulled. However, the `deliver()` method trusted this guarantee and would send an unsigned request if the config object was mutated after construction.

---

## 2. Remediation Applied

### File: `apps/api/src/modules/operations/ops-alert.service.ts`

**Change 1: Defense-in-depth secret validation before HTTP request**

Before the `fetch()` call, the delivery method now validates the signing secret:

```typescript
const secret = this.config.alertWebhookSecret;
if (!secret || secret.length < 32) {
  failure = 'signing secret missing or too short — unsigned delivery suppressed';
  this.logger.error(`[P13-ALERT] ${input.severity} ${input.conditionKey} — ${failure}`);
  throw new UnsignedDeliverySuppressedError(failure);
}
```

If the secret is absent, empty, or shorter than 32 characters, delivery is suppressed — no HTTP request is made. The alert is marked FAILED with a descriptive error.

**Change 2: Signing exception cannot trigger unsigned fallback**

The signing code is now wrapped in a nested try/catch:

```typescript
try {
  const timestamp = Math.floor(Date.now() / 1000);
  const canonical = `${timestamp}.${body}`;
  const signature = createHmac('sha256', secret)
    .update(canonical, 'utf-8')
    .digest('hex');
  headers['x-scs-alert-signature'] = `sha256=${signature}`;
  headers['x-scs-alert-timestamp'] = String(timestamp);
} catch (signErr) {
  failure = `signing failed — unsigned delivery suppressed: ${errMessage(signErr)}`;
  throw new UnsignedDeliverySuppressedError(failure);
}
```

If `createHmac` or any signing operation throws, the error is caught and converted to `UnsignedDeliverySuppressedError`. The outer catch converts this to a FAILED alert — no unsigned request is sent.

**Change 3: UnsignedDeliverySuppressedError class**

A new exported error class signals that delivery was suppressed due to signing requirements:

```typescript
export class UnsignedDeliverySuppressedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsignedDeliverySuppressedError';
  }
}
```

---

## 3. Properties Preserved

The hardening preserves all existing safe behavior:

| Property | Status |
|----------|--------|
| v2 protocol: HMAC-SHA256 over `<timestamp>.<body>` | PRESERVED |
| `X-SCS-Alert-Signature` and `X-SCS-Alert-Timestamp` headers | PRESERVED |
| Timeout handling (`AbortSignal.timeout`) | PRESERVED |
| Failure accounting (`alert_delivery_failures_total`) | PRESERVED |
| Recursion protection (`deliveringFailureAlert` guard) | PRESERVED |
| Sender-side deduplication (`findByDedupKey`) | PRESERVED |
| Log-only fallback when no URL configured | PRESERVED |
| All safe defaults (worker off, pilot legacy) | PRESERVED |
| Secrets never in payloads or logs | PRESERVED |

---

## 4. Test Coverage

### Updated Integration Test

**WS-05** (updated): Previously expected unsigned delivery when secret is null. Now expects zero outbound requests and FAILED status.

### New Integration Tests

| Test | Scenario | Expected Result |
|------|----------|-----------------|
| WS-14 | URL present + secret too short (16 chars) | FAILED, zero outbound |
| WS-15 | URL present + secret empty string | FAILED, zero outbound |
| WS-16 | Config mutation after init (secret → null) | First: SENT; second: FAILED, zero additional outbound |
| WS-17 | Config mutation (secret shortened to 'too-short') | FAILED, zero outbound |
| WS-18 | Valid signed delivery retains dedup behavior | SENT + deduped, all signed |

### New Unit Test

| Test | Scenario | Expected Result |
|------|----------|-----------------|
| p418-1 | `UnsignedDeliverySuppressedError` class | Exported, correct name |
| p418-2 | `createHmac` throws → fetch never called | FAILED, fetch not called |

### Test Execution Evidence (Windows)

```
$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p415-webhook-signing.spec.ts
 Test Files  1 passed (1)
      Tests  30 passed (30)
   Duration  2.99s

$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p418-signing-exception.spec.ts
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  1.73s

$ pnpm --filter @scs/api exec vitest run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
 Test Files  1 passed (1)
      Tests  36 passed (36)
   Duration  1.41s
```

---

## 5. Eight Required Test Scenarios

| # | Scenario | Test | Status |
|---|----------|------|--------|
| 1 | Valid config → correctly signed request | WS-01 (existing) | PASS |
| 2 | URL present + secret missing → zero outbound | WS-05 (updated) | PASS |
| 3 | URL present + secret empty/short → zero outbound | WS-14, WS-15 | PASS |
| 4 | Config mutation after init → no unsigned delivery | WS-16, WS-17 | PASS |
| 5 | Signing exception → no unsigned delivery | p418-2 | PASS |
| 6 | Missing URL → safe log-only behavior | WS-06 (existing) | PASS |
| 7 | Valid delivery retains failure/dedup behavior | WS-18, WS-08, WS-10 | PASS |
| 8 | Body bytes and timestamp covered by signature | WS-02 (existing) | PASS |

---

## 6. Summary

The webhook delivery service now enforces signing at the point of delivery, not just at configuration initialization. Defense-in-depth ensures that:
- Post-construction config mutation cannot produce unsigned delivery
- Signing exceptions cannot fall through to unsigned requests
- All existing safe behavior (dedup, timeout, recursion guard) is preserved
- The v2 signing protocol is unchanged
