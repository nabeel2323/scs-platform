# SCS M7.3-B.3.2 — Defect Fix Results

## Malformed Aramex CancelPickup Response Hardening

---

## 1. Defect

Independent runtime verification (SCS-M7.3-B.3.2-RUNTIME-VERIFICATION-RESULTS.md §9, §20) discovered that `AramexProvider.cancelPickup()` does not validate the runtime structure of the carrier response before accessing `body.HasErrors`.

**Unsafe code path:**

```
CarrierHttpClient.parseBody()
        ↓
JSON.parse(rawBody) fails
        ↓
raw string returned as T
        ↓
AramexProvider.cancelPickup()
        ↓
body.HasErrors → undefined (falsy)
        ↓
falls through to success
        ↓
{ supported: true, cancelled: true, carrierStatus: 'CANCELLED' }
```

A malformed Aramex response would be incorrectly treated as a successful cancellation.

---

## 2. Root Cause

`CarrierHttpClient.parseBody()` catches `JSON.parse` failure and returns the raw string cast to `T`. The Aramex `cancelPickup()` method then accesses `body.HasErrors` on a string, which is `undefined` (falsy), causing the code to skip the error branch and return success.

This is a provider-boundary validation gap — external carrier responses are untrusted runtime data and must not be trusted via TypeScript compile-time type assertions alone.

---

## 3. Fix

**File:** `apps/api/src/modules/shipping/aramex/aramex.provider.ts` (lines 703–716)

Added a runtime guard immediately after receiving the response body:

```typescript
if (
  typeof body !== 'object' ||
  body === null ||
  typeof body.HasErrors !== 'boolean'
) {
  throw new NonRetryableCarrierError(
    'Aramex CancelPickup response missing HasErrors',
    { providerKey: this.key, operation: 'cancelPickup' },
  );
}
```

**Validation rejects:**

| Input | typeof body | body === null | typeof HasErrors | Result |
|-------|-------------|---------------|------------------|--------|
| `null` | `'object'` | `true` | N/A | **REJECTED** |
| `undefined` | `'undefined'` | `false` | N/A | **REJECTED** |
| `"string"` | `'string'` | `false` | N/A | **REJECTED** |
| `42` | `'number'` | `false` | N/A | **REJECTED** |
| `true` | `'boolean'` | `false` | N/A | **REJECTED** |
| `[]` | `'object'` | `false` | `'undefined'` | **REJECTED** |
| `{}` | `'object'` | `false` | `'undefined'` | **REJECTED** |
| `{ HasErrors: undefined }` | `'object'` | `false` | `'undefined'` | **REJECTED** |
| `{ HasErrors: null }` | `'object'` | `false` | `'object'` | **REJECTED** |
| `{ HasErrors: "false" }` | `'object'` | `false` | `'string'` | **REJECTED** |
| `{ HasErrors: 0 }` | `'object'` | `false` | `'number'` | **REJECTED** |
| `{ HasErrors: false }` | `'object'` | `false` | `'boolean'` | **ACCEPTED** → success |
| `{ HasErrors: true }` | `'object'` | `false` | `'boolean'` | **ACCEPTED** → business error |

**Error classification:** `NonRetryableCarrierError` — a malformed response is not transient; retrying will not produce a valid response. This follows the existing convention for structural response failures (e.g., `createShipment` throws `NonRetryableCarrierError` when `ProcessedShipment` is missing).

**Not changed:**
- `CarrierHttpClient.parseBody()` — global behavior preserved
- `checkAramexErrors()` — existing helper unchanged (latent same-class defect in other methods, but out of B3.2 scope)
- All valid success/business-error paths preserved
- All HTTP error classifications preserved (401→Authentication, 500→Retryable, timeout→Retryable)

---

## 4. Tests

### New tests added (6 HTTP-level regression tests)

| Test | Scenario | Expected |
|------|----------|----------|
| B32-H-06a | Malformed JSON | body is string, `typeof !== 'object'` |
| B32-H-06b | JSON string `"not-an-object"` | body is string, `typeof !== 'object'` |
| B32-H-06c | JSON `null` | body is null |
| B32-H-06d | `{ Notifications: [] }` (no HasErrors) | `HasErrors` is undefined, `typeof !== 'boolean'` |
| B32-H-06e | `{ HasErrors: "false" }` | `HasErrors` is string, `typeof !== 'boolean'` |
| B32-H-06f | Valid success `{ HasErrors: false }` | Passes all validation |
| B32-H-06g | Valid business error `{ HasErrors: true }` | Passes all validation |

### Test results

| Suite | Tests | Result |
|-------|-------|--------|
| B.3.2 provider | 19 | 19/19 PASS |
| B.3.2 HTTP | 17 | 17/17 PASS |
| **B.3.2 total** | **36** | **36/36 PASS** |

---

## 5. Regression

| Suite | Baseline | Result | Status |
|-------|----------|--------|--------|
| Shipping unit (non-postgres) | 416 | 422/422 | PASS (+6 new) |
| M7.3-B.3.1 PG (carrier cancel schema) | 6 | 6/6 | PASS |
| M7.3-B.1 PG (cancellation concurrency) | 14 | 14/14 | PASS |
| M7.3-B.2 PG (merchant cancellation) | 21 | 21/21 | PASS |
| M7.2.3-C PG (carrier operations) | 11 | 11/11 | PASS |
| **Total PG** | **52** | **52/52** | **PASS** |

---

## 6. TypeScript / Build

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `nest build` | 260 files compiled, 0 issues |

---

## 7. Scope Audit

**Modified files (this fix only):**

```
apps/api/src/modules/shipping/aramex/aramex.provider.ts       (+16 lines)
apps/api/src/__tests__/unit/shipping/m73b32-cancel-pickup-http.spec.ts  (+111/-9 lines)
```

**Forbidden files — no changes:**

| File | Diff |
|------|------|
| orders.service.ts | empty |
| shipping-carrier.worker.ts | empty |
| carrier-reconciliation.service.ts | empty |
| carrier-tracking-poller.ts | empty |
| carrier-webhook.controller.ts | empty |
| carrier-admin.controller.ts | empty |

**No migration created.**
**No B3.3 behavior introduced** (no worker execution, no retry state machine, no reconciliation, no UNKNOWN handling, no `shipping.carrier.cancel` flow).

---

## 8. Security

| Check | Result |
|-------|--------|
| Error message contains credentials | NO |
| Error message contains API keys | NO |
| Error message contains authorization headers | NO |
| Error message contains encrypted credential payloads | NO |
| Error message contains full raw carrier response | NO |
| Error message retains observability context | YES (providerKey + operation) |

Error message: `'Aramex CancelPickup response missing HasErrors'`
Safe message via `toSafeMessage()`: `'[NonRetryableCarrierError] aramex.cancelPickup: Aramex CancelPickup response missing HasErrors'`

---

## 9. Final Status

```
FIXED — READY FOR RE-VERIFICATION
```

The malformed-response condition identified by independent runtime verification has been addressed. The fix is narrowly scoped to `AramexProvider.cancelPickup()`, preserves all existing valid behavior, and adds comprehensive regression tests.

**Next gate:**

```
B3.2 defect fix (THIS)
      ↓
Independent re-verification
      ↓
PASS → B3.2 Release Closure → B3.3
FAIL → Fix → Re-verify
```
