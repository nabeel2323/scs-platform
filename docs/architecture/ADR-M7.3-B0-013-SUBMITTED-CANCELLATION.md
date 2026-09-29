# ADR-M7.3-B0-013 — Remove SUBMITTED from Cancellable States

## Status

Accepted — M7.3-B.2 release closure (2026-09-29)

## Context

The M7.3-B.0 Business Rules & Architecture Decision Lock document (§3.1, §3.3, §29) listed `SUBMITTED` as a cancellable order state with the transition:

```text
SUBMITTED → CANCELLED (buyer/merchant/admin)
```

During M7.3-B.2 independent runtime verification, a discrepancy was identified between the B.0 specification and the actual implemented FSM. The `OrdersService.TRANSITIONS` map defines:

```typescript
SUBMITTED: ['PENDING_CONFIRMATION'], // auto-advance only
```

There is no `SUBMITTED → CANCELLED` transition in the FSM. Additionally, the checkout method performs an **atomic auto-advance** inside the checkout transaction:

```typescript
// Auto-advance all sub-orders: SUBMITTED → PENDING_CONFIRMATION
for (const sub of subOrderData) {
  await this.autoAdvanceToPendingConfirmation(sub.id, input.buyerId, sub.storeId);
}
```

This means `SUBMITTED` is a transient internal state that:
1. Is never externally observable via any API endpoint
2. Never persists beyond the checkout transaction
3. Cannot be targeted by any cancellation request
4. Has no UI "cancel button" that could trigger it

The M7.3-B.2 implementation correctly excluded `SUBMITTED` from the cancellable status list in `cancelOrder()`.

## Decision

`SUBMITTED` is **not** a cancellable state. The effective cancellation lifecycle begins at `PENDING_CONFIRMATION`.

The authoritative cancellable states are:

```text
PENDING_CONFIRMATION
ACCEPTED
PARTIALLY_ACCEPTED
PREPARING
READY
PAYMENT_PENDING
```

## Rationale

1. **FSM consistency**: The `TRANSITIONS` map only allows `SUBMITTED → PENDING_CONFIRMATION`. Adding `SUBMITTED → CANCELLED` would require an FSM change with no runtime benefit since the state is unreachable.

2. **Atomic auto-advance**: The checkout transaction creates the order and immediately transitions it to `PENDING_CONFIRMATION` before returning to the caller. There is no window where an external request could observe or target a `SUBMITTED` order.

3. **No practical impact**: No user story, test scenario, or production incident has ever required `SUBMITTED → CANCELLED`. The state is an implementation detail of checkout, not a user-facing lifecycle state.

4. **Documentation alignment**: The B.0 document was aspirational and written after the auto-advance was already implemented. It documented the theoretical state space rather than the practical cancellation surface.

## Consequences

### Positive
- B.0 documentation now matches the actual implemented FSM
- No ambiguity for future implementers about whether SUBMITTED should be cancellable
- The cancellation surface is cleanly defined starting at `PENDING_CONFIRMATION`

### Negative
- None — no runtime behavior change required

### Neutral
- The `SUBMITTED` status value still exists in the database schema as a valid enum value for orders
- The `computeMasterStatus()` aggregation still recognizes `SUBMITTED` (for legacy/hypothetical orders that might have been created before auto-advance was introduced)

## Compatibility

Fully backward-compatible. Existing orders and existing cancellation behavior are unchanged. This is a documentation-only amendment — no production code was modified.

## Verification

- M7.3-B.2 runtime verification: 21/21 PostgreSQL integration tests pass (including `should reject cancel from SUBMITTED` in orders.integration.spec.ts)
- M7.3-B.2 unit tests: 25/25 pass (including status eligibility matrix)
- B.1 regression: 14/14 still pass
- Security regression: 47/47 phase3-security tests pass
- FSM regression: 38/38 phase1-marketplace tests pass (validates SUBMITTED auto-advances to PENDING_CONFIRMATION)

## References

- `SCS-M7.3-B-BUSINESS-RULES-ARCHITECTURE-LOCK.md` §35 (amendment recorded in-place)
- `SCS-M7.3-B.2-RUNTIME-VERIFICATION-RESULTS.md` §8 (discrepancy analysis)
- `SCS-M7.3-B.2-RELEASE-CLOSURE.md` (closure evidence)
- `apps/api/src/modules/orders/orders.service.ts` line 2190 (`TRANSITIONS` map)
- `apps/api/src/modules/orders/orders.service.ts` line 1015 (`cancellable` array in `cancelOrder()`)
