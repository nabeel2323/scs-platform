# ADR-0003 — Circuit Breaker Deployment Scope

## Status
Accepted — M7.2.4-A

## Context

The `CarrierCircuitBreaker` protects carrier API calls from cascading failures. It tracks per-scope failure counts and opens the circuit when a threshold is exceeded.

### Current Design

```typescript
// Scope key format:
scopeKey = `${providerKey}:${environment}`
// Example: "aramex:production"

// State machine:
CLOSED → (failures ≥ threshold) → OPEN → (timeout expires) → HALF_OPEN → (success) → CLOSED
                                                        → (failure) → OPEN
```

The circuit breaker is:
- **Process-local**: stored in-memory (`Map<string, BreakerEntry>`)
- **Shared across organizations**: all orgs using the same provider in the same process share one circuit
- **NOT shared across application instances**: each NestJS process has its own independent breaker state

## Why Process-Local Is Acceptable Today

### Single-Process Deployment

The current production deployment runs a single NestJS process. All carrier operations flow through one instance, so the in-memory breaker provides complete protection.

### Shared Scope Is Intentional

When the circuit breaker opens for `aramex:production`, it protects **all** organizations using Aramex in that process. This is correct because:

1. **Provider outages affect all tenants**: if Aramex's API is down, no org can create shipments regardless of their individual credentials.
2. **Credential-specific failures differ**: an authentication failure for Org A's API key is a configuration issue, not a provider outage. The error classifier (`classifyCarrierError`) distinguishes terminal errors (bad credentials → don't retry) from retryable errors (timeout → circuit breaker candidate).
3. **Half-open probing benefits everyone**: when the breaker transitions to HALF_OPEN, the next successful call closes the circuit for all orgs.

### What Must Change Before Horizontal Scaling

When deploying multiple NestJS instances behind a load balancer:

| Concern | Current | Required for Multi-Instance |
|---------|---------|---------------------------|
| Circuit state | In-memory per process | Shared (Redis or similar) |
| Failure counts | Local counters | Distributed counters |
| Half-open probe | One process probes | Coordinated probe (one instance) |
| Scope granularity | `providerKey:environment` | May need `providerKey:environment:orgId` for credential-specific failures |

### Options for Multi-Instance

1. **Redis-backed breaker**: Replace `Map<string, BreakerEntry>` with Redis hashes. Adds infrastructure dependency.
2. **PostgreSQL advisory locks**: Use advisory locks for half-open probe coordination. Counters remain eventually consistent per-instance.
3. **Hybrid**: Keep per-instance breakers but increase the failure threshold proportionally to instance count. Simpler but less precise.

**No Redis or distributed state is introduced in M7.2.4-A.** The single-process deployment makes this unnecessary.

## Credential-Specific vs Provider-Wide Failures

The current error classification provides implicit differentiation:

| Error Type | Classification | Circuit Breaker Impact | Retry Behavior |
|------------|---------------|----------------------|----------------|
| Authentication failure (401) | Terminal | No (not retried) | No retry — configuration issue |
| Rate limit (429) | Rate-limited | No (not counted as failure) | Respects Retry-After |
| Timeout (network) | Retryable | Yes (counted) | Exponential backoff |
| Server error (500) | Retryable | Yes (counted) | Exponential backoff |
| Validation error (400) | Terminal | No | No retry — request issue |

Authentication failures for one org's credentials do NOT contribute to the provider-wide circuit breaker because they are classified as `terminal` and never retried. Only transport-level failures (timeouts, 500s) trip the breaker, and these genuinely indicate a provider-wide issue.

## Consequences

- **Positive**: Zero infrastructure overhead for circuit breaking today.
- **Positive**: Simple, well-understood state machine.
- **Positive**: Error classification already separates credential issues from provider outages.
- **Negative**: Multi-instance deployment requires breaker state sharing. Documented as a prerequisite.
- **Negative**: A noisy org generating many bad requests could theoretically contribute failures to the shared breaker. Mitigated by error classification (terminal errors don't count).
