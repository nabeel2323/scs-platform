# SCS Platform — M7.1 Security Test Results

**Date:** 2026-09-27  
**Milestone:** M7.1 — Order Lifecycle & Fulfillment  
**Test File:** `apps/api/src/__tests__/integration/m71-security-concurrency.postgres.spec.ts`  

---

## Results Summary

| # | Tests | Result |
|---|---|---|
| 1–10 | Security (SEC-M71-01 through SEC-M71-10) | 10/10 PASS ✅ |
| 11–15 | Concurrency | 5/5 PASS ✅ |
| | **Total** | **15/15 PASS** |

---

## Security Tests

| ID | Scenario | Expected | Result |
|---|---|---|---|
| SEC-M71-01 | Merchant A cannot modify Merchant B shipment | 403/400 Forbidden | PASS ✅ |
| SEC-M71-02 | Merchant cannot pickup shipment | ForbiddenException | PASS ✅ |
| SEC-M71-03 | Merchant cannot deliver shipment | ForbiddenException | PASS ✅ |
| SEC-M71-04 | Driver cannot access unassigned shipment | NotFoundException / driver ownership check | PASS ✅ |
| SEC-M71-05 | Driver cannot pickup another driver's shipment | Driver ownership assertion fails | PASS ✅ |
| SEC-M71-06 | Driver cannot deliver another driver's shipment | Driver ownership assertion fails | PASS ✅ |
| SEC-M71-07 | Buyer cannot modify shipment | ForbiddenException (role check) | PASS ✅ |
| SEC-M71-08 | Buyer can only view own order tracking | buyerId check on getTracking | PASS ✅ |
| SEC-M71-09 | Cross-organization shipment access blocked | assertOrderAccessible fails | PASS ✅ |
| SEC-M71-10 | Direct shipment ID manipulation blocked | No direct shipment endpoints exist | PASS ✅ |

---

## Implementation Details

### Role-Based Guards

- **Merchant actions** (prepare, ready, assign-driver): guarded by `MERCHANT_ROLES = ['MERCHANT_OWNER', 'MERCHANT_STAFF', 'ADMIN', 'SUPER_ADMIN']`
- **Driver actions** (pickup, out-for-delivery, deliver): guarded by `DRIVER_ROLES = ['DRIVER', 'ADMIN', 'SUPER_ADMIN']`
- Both guards throw `ForbiddenException` when caller role is present but not in the allowed set

### Tenant Isolation

- `assertOrderAccessible()` verifies the caller's activeOrg matches the order's store org
- Cross-merchant access rejected before any state mutation occurs
- Driver ownership verified via `assertDriverOwnership()` — checks `shipment.assignedDriverId === userId`

### No Direct Shipment Manipulation

- No PATCH/PUT endpoints exist on shipment resources directly
- All shipment state changes flow through order-scoped fulfillment commands
- Shipment IDs are internal; clients interact via order IDs only

---

## Conclusion

All 10 security tests pass. Merchant/driver/buyer role separation is enforced at the service layer. Tenant isolation prevents cross-organization access. No direct shipment manipulation vectors exist.
