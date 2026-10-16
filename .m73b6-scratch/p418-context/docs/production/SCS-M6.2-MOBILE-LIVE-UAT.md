# SCS Platform — M6.2 Mobile Live-API Validation

**Date:** 2026-09-27  
**Predecessor:** M6.1 (code inspection + dart analyze + flutter test)  

---

## Execution Status

```
MOBILE LIVE-UAT: NOT EXECUTED — ENVIRONMENT LIMITATION
```

### Reason

No physical Android/iOS device or running emulator was available during this hardening pass. The development environment has Docker containers for PostgreSQL, Redis, MinIO, and Mailhog, but no Android SDK emulator or connected mobile device.

### What Was Verified (M6.1, carried forward)

| Check | Method | Result |
|---|---|---|
| `dart analyze lib` | CLI | 0 issues |
| `flutter test` | CLI | 104/104 PASS |
| Search screen (531 lines) | Code inspection | PASS |
| Product detail screen (938 lines) | Code inspection | PASS |
| Offer selection (distinct offerId) | Code inspection | PASS |
| Add to cart (offerId + variantId) | Code inspection | PASS |
| Multi-merchant cart (separate lines) | Code inspection | PASS |
| MOQ floor (QuantityStepper) | Code inspection | PASS |
| Checkout (idempotency key) | Code inspection | PASS |
| Order detail (448 lines, timeline) | Code inspection | PASS |
| Merchant dashboard (KPI + low-stock) | Code inspection | PASS |
| Merchant offers (407 + 793 + 769 lines) | Code inspection | PASS |
| Merchant inventory (494 lines) | Code inspection | PASS |

### What Would Be Tested (Live-Device Protocol)

If a device/emulator becomes available, the following should be tested against the running API (localhost:3000 or staging URL):

#### Buyer Flow

1. Login (email/password + device trust)
2. Search for products
3. Product detail with variant selection
4. Offer selection (multiple merchants, distinct offerId)
5. Add to cart (correct offerId + variantId)
6. Multi-merchant cart (separate lines per merchant)
7. MOQ enforcement (quantity stepper respects minimum)
8. Checkout (idempotency key, master order creation)
9. Order detail (timeline, snapshot, currency)

#### Merchant Flow

1. Login (merchant credentials)
2. Merchant dashboard (KPI cards, low-stock alerts)
3. Offers management (list, create, edit, suspend/withdraw)
4. Inventory management (list, adjust)
5. Order list (pending, accepted, delivered)
6. Accept/reject order (stock reservation)

#### Capture Points

- API failures (non-200 responses)
- Authentication failures (token refresh, device trust)
- Rendering failures (layout errors, missing data)
- Navigation failures (route errors, back stack issues)
- Loading issues (infinite spinners, missing skeletons)
- Error-state issues (error screens not shown)
- Currency display issues (SAR formatting, mixed currencies)
- offerId/variantId mismatches (wrong offer in cart/order)

### Recommendation

Schedule live-device UAT as part of M7 production readiness, when a staging environment and test device are available. The code-level verification (104/104 tests, 0 analyzer issues) provides strong confidence, but live-API validation is the only way to catch runtime integration issues.

---

## Summary

| Domain | Status |
|---|---|
| `dart analyze` | PASS (0 issues) |
| `flutter test` | PASS (104/104) |
| Code inspection | PASS (all buyer + merchant flows) |
| Live-device UAT | NOT EXECUTED — ENVIRONMENT LIMITATION |
