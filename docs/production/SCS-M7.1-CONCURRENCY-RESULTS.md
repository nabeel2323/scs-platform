# SCS Platform — M7.1 Concurrency Test Results

**Date:** 2026-09-27  
**Milestone:** M7.1 — Order Lifecycle & Fulfillment  
**Test File:** `apps/api/src/__tests__/integration/m71-security-concurrency.postgres.spec.ts`  

---

## Results Summary

| # | Test | Result |
|---|---|---|
| 1 | Double prepare | PASS ✅ |
| 2 | Double ready | PASS ✅ |
| 3 | Double pickup | PASS ✅ |
| 4 | Double deliver | PASS ✅ |
| 5 | Concurrent driver assignment | PASS ✅ |
| | **Total** | **5/5 PASS** |

---

## Test Details

### Double Prepare

Two simultaneous `POST /v1/orders/:id/prepare` calls on the same ACCEPTED order.

- **Expected:** One succeeds (→ PREPARING), one fails with ConflictException
- **Mechanism:** Atomic `UPDATE orders SET status='PREPARING' WHERE id=$1 AND status='ACCEPTED' RETURNING id` — second update finds no matching row
- **Result:** PASS ✅ — exactly one succeeds, one rejected

### Double Ready

Two simultaneous `POST /v1/orders/:id/ready` calls on the same PREPARING order.

- **Expected:** One succeeds (→ READY), one fails with ConflictException
- **Mechanism:** Same optimistic locking pattern on `WHERE status='PREPARING'`
- **Result:** PASS ✅ — exactly one succeeds, one rejected

### Double Pickup

Two simultaneous `POST /v1/orders/:id/pickup` calls on the same ASSIGNED order.

- **Expected:** One succeeds (→ PICKED_UP), one fails with ConflictException
- **Mechanism:** Optimistic lock on `WHERE status='ASSIGNED'`
- **Result:** PASS ✅ — exactly one succeeds, one rejected

### Double Deliver

Two simultaneous `POST /v1/orders/:id/deliver` calls on the same OUT_FOR_DELIVERY order.

- **Expected:** One succeeds (→ DELIVERED), one fails with ConflictException
- **Mechanism:** Optimistic lock on `WHERE status='OUT_FOR_DELIVERY'` plus stock settlement idempotency
- **Result:** PASS ✅ — exactly one succeeds, one rejected, stock settled exactly once

### Concurrent Driver Assignment

Two simultaneous `POST /v1/orders/:id/assign-driver` calls with different driver IDs.

- **Expected:** One succeeds, one fails with ConflictException; shipment has exactly one driver
- **Mechanism:** Optimistic lock on order status `WHERE status='READY'` prevents double-assignment
- **Result:** PASS ✅ — exactly one assignment succeeds, shipment has one driver

---

## Implementation Strategy

All fulfillment transitions use the same optimistic locking pattern established in M6:

```sql
UPDATE orders
SET status = $newStatus, updated_at = NOW()
WHERE id = $orderId AND status = $currentStatus
RETURNING id
```

If the `RETURNING` result is empty, the order was already transitioned by a concurrent request, and a `ConflictException` is thrown. This ensures:

1. No duplicate state transitions
2. No duplicate shipment events
3. No duplicate stock movements
4. No inconsistent assignment

---

## Conclusion

All 5 concurrency tests pass. The optimistic locking strategy prevents race conditions across all fulfillment commands. Stock settlement occurs exactly once even under concurrent delivery attempts.
