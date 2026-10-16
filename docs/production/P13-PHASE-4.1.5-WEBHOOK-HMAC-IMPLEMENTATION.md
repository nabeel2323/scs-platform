# P13 Phase 4.1.5 — Webhook HMAC Implementation

**Date:** 2026-10-15  
**Status:** Implemented and tested

## Signature Protocol

1. Serialize the JSON payload to a UTF-8 string exactly once
2. Compute HMAC-SHA256 over the raw UTF-8 bytes of the serialized body
3. Send the hex digest in the `X-SCS-Alert-Signature` header as `sha256=<hex>`
4. The receiver recomputes the HMAC with the shared secret and compares using constant-time comparison

**Canonical signed input:** The exact request body bytes (JSON string encoded as UTF-8).  
**Replay protection:** NOT provided. No timestamp or nonce is included. Receivers should implement their own deduplication if needed.

## Configuration Changes

### p13-ops.config.ts
- Added `alertWebhookSecret: string | null` to `P13OpsConfig` interface
- Parse `P13_OPS_ALERT_WEBHOOK_SECRET` env var (trimmed, empty = null)
- **Fail-closed validation:** When `alertWebhookUrl` is set but `alertWebhookSecret` is missing or < 32 characters, both are nulled — delivery falls back to log-only
- Minimum secret length: 32 characters (boundary tested at 31 and 32)

### ops-alert.service.ts
- Import `createHmac` from `node:crypto`
- In `deliver()`: serialize body once, compute HMAC if secret is configured, add `x-scs-alert-signature` header
- Body bytes sent = body bytes signed (single serialization)
- Existing timeout, dedup, recursion guard, and failure-state behavior preserved

### ops-alert-signing.ts (new utility module)
- `computeSignature(body, secret)` — returns `sha256=<hex>`
- `verifySignature(body, signature, secret)` — constant-time comparison via `timingSafeEqual`
- `SIGNATURE_HEADER = 'x-scs-alert-signature'`
- `SIGNATURE_PREFIX = 'sha256='`
- No NestJS dependencies — importable by external receivers and test harnesses

## Security Properties

| Property | Status |
|----------|--------|
| Cryptographic algorithm | HMAC-SHA256 (Node.js built-in) |
| Constant-time comparison | Yes (timingSafeEqual) |
| Modified body fails verification | Yes |
| Wrong secret fails verification | Yes |
| Missing signature fails verification | Yes |
| Secret in logs | Never |
| Secret in API responses | Never |
| Secret in config serialization when nulled | Never |
| Full webhook URL in logs | Never |
| Full webhook URL in payload | Never |
| Financial amounts in payload | Never |
| Personal information in payload | Never |

## Fail-Closed Behavior

| Scenario | Behavior |
|----------|----------|
| No webhook URL configured | Log-only (SUPPRESSED), no delivery attempted |
| Webhook URL + no secret | Both nulled, falls back to log-only |
| Webhook URL + secret < 32 chars | Both nulled, falls back to log-only |
| Webhook URL + secret >= 32 chars | Normal signed delivery |
| Signing throws exception | Delivery fails, alert marked FAILED (no unsigned delivery) |

## Files Modified

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `apps/api/src/modules/operations/p13-ops.config.ts` | +16 | Secret parsing, fail-closed validation |
| `apps/api/src/modules/operations/ops-alert.service.ts` | +18/-4 | HMAC signing in deliver() |
| `apps/api/src/modules/operations/ops-alert-signing.ts` | +65 (new) | Signing/verification utilities |

## Verification Commands

```bash
# Typecheck
pnpm typecheck  # 9/9 tasks pass

# Unit tests (signing + config)
pnpm --filter @scs/api exec vitest run src/__tests__/unit/operations/p415-webhook-signing.spec.ts
# 19/19 pass

# Integration tests (delivery with signing)
pnpm --filter @scs/api exec vitest run src/__tests__/integration/p415-webhook-delivery.postgres.spec.ts
# 13/13 pass

# Existing deployment invariants
pnpm --filter @scs/api exec vitest run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
# 36/36 pass
```
