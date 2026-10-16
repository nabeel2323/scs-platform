# ADR-0002 — Retry Amplification Protection

## Status
Accepted — M7.2.4-A

## Context

The SCS Platform carrier integration has two retry layers:

1. **HTTP Client** (`CarrierHttpClient`) — low-level HTTP request retry for transient network errors.
2. **Outbox Worker** (`ShippingCarrierWorker`) — application-level retry for carrier operation failures.

If both layers are active simultaneously, a single failed carrier API call could produce:
- HTTP client: N retries (each with exponential backoff)
- For each HTTP attempt that fails, the worker: M retries (each with exponential backoff)
- **Total attempts**: N × M — potentially hundreds of requests to a struggling carrier.

This is **retry amplification** — nested exponential backoff creates a thundering herd.

## Decision

The HTTP client `maxRetries` defaults to **0** (zero) for all carrier operations.

All retry intelligence lives exclusively in the outbox worker layer via `CarrierRetryPolicy`:
- Exponential backoff with ±25% jitter
- Rate-limit aware (respects `Retry-After`)
- Retry budget with dead-letter after exhaustion
- Error classification (terminal vs retryable vs uncertain)

### Evidence

```typescript
// carrier-http-client.ts
maxRetries: config.maxRetries ?? 0, // Default: no retries (caller decides)

// aramex.constants.ts
export const ARAMEX_MAX_RETRIES = 0;
```

Neither `AramexProvider` nor any other carrier provider overrides `maxRetries` to a non-zero value.

### Invariant

**Carrier operations MUST NOT enable HTTP-level retries.**

The outbox worker is the single authority for retry orchestration. It has:
- Visibility into the full operation context (circuit breaker, reconciliation state)
- Ability to classify errors (terminal vs retryable vs uncertain-result)
- Lease tracking and crash recovery
- Dead-letter state for budget exhaustion

The HTTP client only handles idempotent, low-level transport concerns (timeout detection, SSRF protection, response parsing).

## Verification

A regression test proves the default remains zero:

```typescript
// m724a-concurrency.spec.ts
it('CarrierHttpClient defaults maxRetries to 0', () => { ... });
it('AramexProvider does not override maxRetries', () => { ... });
```

## Consequences

- **Positive**: No risk of retry amplification under carrier degradation.
- **Positive**: Single retry policy to reason about, test, and tune.
- **Positive**: Circuit breaker integration works correctly (one layer checks breaker, not N×M times).
- **Negative**: A transient network blip that the HTTP client could have recovered from now requires a full outbox retry cycle (5s poll + backoff). Acceptable because carrier API calls are not latency-sensitive and the outbox retry provides better observability.

## Before Horizontal Scaling

This decision remains valid for multi-instance deployments. The outbox worker's `FOR UPDATE SKIP LOCKED` claiming ensures only one worker processes each event, regardless of how many instances are running.
