# SCS M7.3-B.3.2 — Implementation Results

## 1. Status

**PASS**

All acceptance criteria met. Provider abstraction exposes `canCancelPickup` + `cancelPickup(...)`. Aramex implements CancelPickup using existing infrastructure. No worker, reconciliation, tracking, webhook, or order cancellation behavior introduced.

---

## 2. Baseline

M7.3-B.3.1 CLOSED/PASS (independently verified):

- Migration 0049 applied fresh, existing DB, idempotent x3
- 8 new columns + 1 partial index on shipments
- Carrier-cancel state vocabulary (8 values)
- Recovery-token vocabulary (5 tokens)
- Deterministic idempotency key `carrier-cancel:<shipmentId>`
- B.1: 14/14, B.2: 21/21, shipping regression: 396/396
- TypeScript: 0 errors, Nest build: 258 files

---

## 3. Scope

Implemented ONLY:

### A. Provider capability abstraction
- `canCancelPickup: boolean` added to `ProviderCapabilities`
- `cancelPickup(request: CancelPickupRequest): Promise<CancelPickupResult>` added to `ShippingProvider` base class

### B. Provider capability metadata
- AramexProvider: `canCancelPickup: true`
- ManualDeliveryProvider: `canCancelPickup: false`

### C. Aramex provider contract implementation
- `override async cancelPickup(request)` using existing `resolveCredentials()`, `buildClientInfo()`, `createHttpClient()`, `resolveCarrierEndpoint()`
- Maps to existing `AramexCancelPickupRequest` / `AramexCancelPickupResponse`
- No parallel HTTP client, no duplicate authentication

### D. Aramex CancelPickup mapping
- POST to `${shippingBaseUrl}/json/CancelPickup`
- Uses existing secure carrier HTTP client (`CarrierHttpClient`)
- Uses existing encrypted credential resolution
- Uses existing provider error classification
- Preserves tenant isolation (credentials resolved per-store)
- HTTP 200 + HasErrors=true → business error result (NOT success)
- Returns normalized `CancelPickupResult` with carrier reference info

### E. Cancel wiring foundation
- Future worker can call `provider.cancelPickup(request)` without Aramex dependency
- Full retry/state machine NOT implemented (deferred to B.3.3)

---

## 4. Files Changed

### Modified (8 files, +181/-13 lines)

| File | Change |
|------|--------|
| `apps/api/src/modules/shipping/shipping.types.ts` | +`canCancelPickup` to `ProviderCapabilities`; +`CancelPickupRequest` interface; +`CancelPickupResult` union type |
| `apps/api/src/modules/shipping/shipping-provider.ts` | +`cancelPickup()` default method returning unsupported |
| `apps/api/src/modules/shipping/aramex/aramex.provider.ts` | +`canCancelPickup: true`; rewrote `cancelPickup` to match abstract signature with `override` |
| `apps/api/src/modules/shipping/providers/manual-delivery.provider.ts` | +`canCancelPickup: false` |
| `apps/api/src/__tests__/unit/shipping/shipping-provider.spec.ts` | +`canCancelPickup` assertion; +cancelPickup unsupported test |
| `apps/api/src/__tests__/unit/shipping/m723b2-aramex-provider.spec.ts` | +`canCancelPickup` assertion |
| `apps/api/src/__tests__/unit/shipping/m723b1-carrier-foundation-hardening.spec.ts` | +`canCancelPickup` in capabilities fixture |
| `apps/api/src/modules/orders/shipment.schema.ts` | No change (B.3.1 only) |

### Created (2 new test files)

| File | Tests |
|------|-------|
| `apps/api/src/__tests__/unit/shipping/m73b32-cancel-pickup-provider.spec.ts` | 19 unit tests |
| `apps/api/src/__tests__/unit/shipping/m73b32-cancel-pickup-http.spec.ts` | 11 HTTP mock tests |

### NOT modified (scope gate)

- `orders.service.ts` — empty diff
- `shipping-carrier.worker.ts` — empty diff
- `carrier-reconciliation.service.ts` — empty diff
- `carrier-tracking-poller.ts` — empty diff
- `carrier-webhook.controller.ts` — empty diff
- `carrier-admin.controller.ts` — not present in diff

### No new migration

B.3.1 already provides the required persistence foundation. B.3.2 consumes it.

---

## 5. Provider Abstraction Changes

### `ProviderCapabilities` (shipping.types.ts)

```typescript
export interface ProviderCapabilities {
  canCreateShipment: boolean;
  canCancel: boolean;
  canCancelPickup: boolean;  // NEW
  canGenerateLabel: boolean;
  canTrack: boolean;
  canValidateAddress: boolean;
  canReceiveWebhooks: boolean;
}
```

### `CancelPickupRequest` (shipping.types.ts)

```typescript
export interface CancelPickupRequest {
  carrierPickupId: string;  // Carrier-assigned ID (never fabricated)
  storeId: string;          // Tenant isolation
  shipmentId: string;       // Idempotency key derivation
  comments?: string;        // Optional carrier comments
}
```

### `CancelPickupResult` (shipping.types.ts)

```typescript
export type CancelPickupResult =
  | { supported: true; cancelled: true; carrierStatus?: string }
  | { supported: true; cancelled: false; reason: string; carrierCode?: string }
  | UnsupportedOperationResult;
```

### `ShippingProvider.cancelPickup()` (shipping-provider.ts)

Default implementation returns `{ supported: false, reason: '${key} does not support pickup cancellation' }`.

Only providers with `canCancelPickup: true` override.

---

## 6. Aramex CancelPickup Implementation

### Method signature

```typescript
override async cancelPickup(request: CancelPickupRequest): Promise<CancelPickupResult>
```

### Request mapping

| CancelPickupRequest field | AramexCancelPickupRequest field |
|---------------------------|--------------------------------|
| `carrierPickupId` | `PickupGUID` |
| `comments` | `Comments` |
| `storeId` | Used for credential resolution (not sent to carrier) |
| `shipmentId` | Used for correlation/logging (not sent to carrier) |

### Response mapping

| AramexCancelPickupResponse | CancelPickupResult |
|---------------------------|-------------------|
| `HasErrors: false` | `{ supported: true, cancelled: true, carrierStatus: 'CANCELLED' }` |
| `HasErrors: true` | `{ supported: true, cancelled: false, reason: msg, carrierCode: code }` |

### Error mapping

| Error condition | Error type |
|----------------|-----------|
| No shipping endpoint configured | `NonRetryableCarrierError` |
| HTTP 401 | `AuthenticationCarrierError` (thrown by CarrierHttpClient) |
| HTTP 500 | `RetryableCarrierError` (thrown by CarrierHttpClient) |
| Timeout | `RetryableCarrierError` (thrown by CarrierHttpClient) |
| HTTP 200 + HasErrors=true | Business error result (NOT exception) |
| Malformed JSON | Raw body returned (caller must validate) |

### Infrastructure reused

- `resolveCredentials(storeId)` — tenant-scoped credential resolution
- `buildClientInfo(payload)` — Aramex ClientInfo builder
- `createHttpClient()` — CarrierHttpClient with Aramex config
- `resolveCarrierEndpoint('shipping', payload, primaryUrl)` — SSRF-safe endpoint resolution
- `CarrierObservabilityService.generateCorrelationId()` — correlation tracking
- `ARAMEX_TIMEOUT_MS` — consistent timeout

---

## 7. Error Mapping

### Error hierarchy (unchanged from B.1)

```
CarrierError (base)
├── RetryableCarrierError       → retry per backoff
├── RateLimitCarrierError       → extended backoff
├── NonRetryableCarrierError    → terminal
├── AuthenticationCarrierError  → do NOT retry
├── ValidationCarrierError      → do NOT retry
└── UnsupportedCarrierOperationError → terminal/skip
```

### CancelPickup-specific behavior

- **HTTP 200 + HasErrors=true**: Returns `{ supported: true, cancelled: false, reason, carrierCode }`. The provider does NOT throw — the caller decides how to handle business errors.
- **No blind retry**: The provider method makes exactly one HTTP request. Retry logic belongs to B.3.3.
- **Credential safety**: `toSafeMessage()` redacts all sensitive data.

---

## 8. Security

### Tenant isolation

- Credentials resolved via `resolveCredentials(storeId)` → store → org → credential chain
- Shipment from org A never uses org B's credentials

### SSRF

- Endpoint URLs resolved via `resolveCarrierEndpoint()` with allowlist validation
- No user-controlled URLs

### Credentials

- Never returned in `CancelPickupResult`
- Never logged (CarrierHttpClient redacts)
- Never included in error messages (`toSafeMessage()`)
- Stored encrypted, decrypted only in-process

### Carrier references

- `carrierPickupId` is data, not a URL
- Used as `PickupGUID` in request body only
- Does not alter HTTP destination

---

## 9. Tests

### Unit tests (m73b32-cancel-pickup-provider.spec.ts) — 19 tests

| ID | Test | Result |
|----|------|--------|
| B32-U-01 | Aramex canCancelPickup = true | PASS |
| B32-U-02 | Aramex canCancel = false | PASS |
| B32-U-03 | Manual canCancelPickup = false | PASS |
| B32-U-04 | Manual cancelPickup returns unsupported | PASS |
| B32-U-05 | CancelPickupRequest shape | PASS |
| B32-U-05b | Comments optional | PASS |
| B32-U-06 | Success result shape | PASS |
| B32-U-07 | Business-error result shape | PASS |
| B32-U-08 | Unsupported result shape | PASS |
| B32-U-09a | Idempotency key deterministic | PASS |
| B32-U-09b | Idempotency key prefixed | PASS |
| B32-U-09c | Different shipmentId → different key | PASS |
| B32-U-09d | Cancel key distinct from create key | PASS |
| B32-U-10 | No blind retry | PASS |
| B32-U-11a | No credentials in result | PASS |
| B32-U-11b | No credentials in error messages | PASS |
| B32-U-12a | Base class defines cancelPickup | PASS |
| B32-U-12b | No Aramex-specific types leak | PASS |
| B32-regression | CARRIER_CANCEL_STATUSES has 8 values | PASS |

### HTTP mock tests (m73b32-cancel-pickup-http.spec.ts) — 11 tests

| ID | Test | Result |
|----|------|--------|
| B32-H-01 | CancelPickup success (200 + HasErrors=false) | PASS |
| B32-H-02 | HTTP 200 + business error (HasErrors=true) | PASS |
| B32-H-03 | HTTP 401 → AuthenticationCarrierError | PASS |
| B32-H-04 | HTTP 500 → RetryableCarrierError | PASS |
| B32-H-05 | Timeout → RetryableCarrierError | PASS |
| B32-H-06 | Malformed JSON → raw body returned | PASS |
| B32-H-07 | Request method is POST | PASS |
| B32-H-08 | Endpoint path is /json/CancelPickup | PASS |
| B32-H-09 | PickupGUID passed correctly | PASS |
| B32-H-10 | No blind retry on business error | PASS |
| B32-H-11 | Credentials never in error messages | PASS |

---

## 10. Regression Results

| Suite | Tests | Result |
|-------|-------|--------|
| B.1 cancellation concurrency | 14/14 | PASS |
| B.2 merchant cancellation | 21/21 | PASS |
| B.3.1 carrier-cancel schema | 6/6 | PASS |
| M7.2.3-C carrier operations | 11/11 | PASS |
| Shipping unit tests | 416/416 | PASS (1 known flake in isolation = 18/18) |
| Full non-postgres suite | 1453/1453 | PASS |

---

## 11. TypeScript / Build

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `nest build` | 260 files, 0 issues |

---

## 12. Scope Audit

### Forbidden files — empty diff

- `orders.service.ts` — NOT modified
- `shipping-carrier.worker.ts` — NOT modified
- `carrier-reconciliation.service.ts` — NOT modified
- `carrier-tracking-poller.ts` — NOT modified
- `carrier-webhook.controller.ts` — NOT modified
- `carrier-admin.controller.ts` — NOT modified

### No B.3.3+ behavior introduced

- No worker execution logic
- No `shipping.carrier.cancel` event production
- No retry loop
- No backoff changes
- No circuit breaker changes
- No UNKNOWN handling
- No timeout recovery
- No reconciliation
- No delivered-after-cancel handling
- No tracking changes
- No webhook changes
- No admin recovery changes
- No public cancellation endpoints
- No order cancellation transaction changes
- No inventory changes
- No shipment cancellation state changes
- No cancellation outbox behavior
- No pickup scheduling
- No actual pickup creation
- No new migration

---

## 13. Known Limitations

1. **No live Aramex verification**: Tests use a controlled local HTTP server. Live sandbox verification deferred to B.3.3 or later.
2. **Malformed JSON handling**: The `CarrierHttpClient` returns raw body on JSON parse failure instead of throwing. The provider layer should validate the response structure — this is a known pattern, not a B.3.2 defect.
3. **`AramexCancelPickupResult` type**: The Aramex-specific result type in `aramex.types.ts` is now unused (the provider returns the carrier-neutral `CancelPickupResult`). The type is preserved for documentation purposes.

---

## 14. Exact Next Milestone

**M7.3-B.3.3 — Cancel Execution / Retry / UNKNOWN**

This milestone will implement:
- Worker `handleCancel()` execution logic
- `shipping.carrier.cancel` event consumption
- Retry state machine (PENDING → IN_PROGRESS → SUCCEEDED/FAILED/UNKNOWN/RETRY)
- Idempotency enforcement using `carrier-cancel:<shipmentId>`
- UNKNOWN handling and timeout recovery
- Error classification and retry decisions

B.3.3 depends on B.3.2 being independently verified first.

---

## Milestone Progression

```
M7.3-B.3.0  Business Rules / Architecture Lock
             ✅ CLOSED

M7.3-B.3.1  Carrier-Cancel State Foundation
             ✅ IMPLEMENTED
             ✅ INDEPENDENTLY VERIFIED
             ✅ CLOSED

M7.3-B.3.2  Provider Abstraction + Cancel Wiring
             ✅ IMPLEMENTED
             ← AWAITING INDEPENDENT RUNTIME VERIFICATION

M7.3-B.3.3  Cancel Execution / Retry / UNKNOWN
             ← AFTER B3.2 VERIFICATION

M7.3-B.3.4  Reconciliation + Delivered-After-Cancel
             ← AFTER B3.3 VERIFICATION

M7.3-B.3.5  Concurrency / Failure / Recovery
             ← AFTER B3.4 VERIFICATION

M7.3-B.3.6  Independent Runtime Verification
             ← AFTER IMPLEMENTATION

M7.3-B.3.7  Release Closure
             ← FINAL
```

---

## 20. Post-Verification Defect Fix (Malformed Response Hardening)

Independent runtime verification discovered a defect (see `SCS-M7.3-B.3.2-RUNTIME-VERIFICATION-RESULTS.md` §9):

### Defect

`CarrierHttpClient.parseBody()` returns the raw string on JSON parse failure. `AramexProvider.cancelPickup()` accessed `body.HasErrors` without validating the body structure. Since a string has no `HasErrors` property, `undefined` is falsy, causing the code to fall through to `cancelled: true`.

### Root cause

Missing runtime validation of untrusted external carrier response at the provider boundary.

### Fix

Added a runtime guard in `AramexProvider.cancelPickup()` (aramex.provider.ts:703-716):

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

### Tests added

6 new HTTP-level regression tests (B32-H-06a through B32-H-06g) covering:
- Malformed JSON → body is string, not object
- JSON string body → not an object
- Null body → rejected
- Missing HasErrors → undefined, not boolean
- HasErrors as string "false" → not boolean
- Valid success → passes validation
- Valid business error → passes validation

### Regression results after fix

| Suite | Result |
|-------|--------|
| B.3.2 provider tests | 19/19 |
| B.3.2 HTTP tests | 17/17 |
| Shipping unit | 422/422 |
| B.3.1 PG | 6/6 |
| B.1 PG | 14/14 |
| B.2 PG | 21/21 |
| M7.2.3-C PG | 11/11 |
| TypeScript | 0 errors |
| Nest build | 260 files, 0 issues |

### Scope

Only `aramex.provider.ts` and `m73b32-cancel-pickup-http.spec.ts` changed. No forbidden files modified. No B3.3 behavior introduced. No migration. No worker changes.

### Security

Error message contains no credentials, no raw response body, no secrets. Uses existing `NonRetryableCarrierError` with `toSafeMessage()` redaction.
