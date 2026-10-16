# SCS Platform — M6.1 Web/Mobile Parity Results

**Date:** 2026-09-27  
**Method:** Code inspection + API verification + automated tests  

---

| Capability | Web | Mobile | API | Result |
|---|---|---|---|---|
| Search offers | PASS | PASS | PASS | PASS |
| Offer count | PASS | PASS | PASS | PASS |
| Lowest offer price | PASS | PASS | PASS | PASS |
| Currency | PASS | PASS | PASS | PASS |
| Variant selection | PASS | PASS | PASS | PASS |
| Offer selection | PASS | PASS | PASS | PASS |
| Add to cart | PASS | PASS | PASS | PASS |
| Success feedback | PASS | PASS | PASS | PASS |
| Cart merchant | PASS | PASS | PASS | PASS |
| Cart SKU | PASS | PASS | PASS | PASS |
| Cart price | PASS | PASS | PASS | PASS |
| MOQ | PASS | PASS | PASS | PASS |
| Checkout | PASS | PASS | PASS | PASS |
| Multi-merchant checkout | PASS | PASS | PASS | PASS |
| Order merchant | PASS | PASS | PASS | PASS |
| Order SKU | PASS | PASS | PASS | PASS |
| Order snapshot | PASS | PASS | PASS | PASS |

---

## Notes

- **Web** verified via browser UAT (7/7 buyer flows PASS) + code inspection (merchant pages API-connected)
- **Mobile** verified via code inspection + `dart analyze` (0 issues) + `flutter test` (104/104 pass)
- **API** verified via M6 regression suite (41/41 PASS) + security regression (12/12 PASS)
- Both clients call the same REST endpoints; no feature divergence detected for M6 scope
- Mobile merchant dashboard has KPI strip + low-stock rail; web merchant has more detailed analytics/trend charts (deferred from M5, not M6 scope)
- OTP authentication is shared across all clients (Redis-backed, 90s TTL)
