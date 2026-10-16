# M7.2.3-B.0 — Pre-Implementation Carrier Architecture Audit

**Date:** 2026-09-28  
**Milestone:** M7.2.3-B.0 First Real Carrier — Pre-Implementation Architecture Audit  
**Base Commit:** `faab6302a9d13e8d93347497078d83da6a758ffa`  
**Branch:** `develop`  
**Prerequisites:** M7.2.3-A PASS, M7.2.3-A.1 PASS, M7.2.3-A.2 PASS  
**Status:** READ-ONLY AUDIT — No production code modified

---

## 1. Executive Summary

This audit performs a read-only architecture and integration analysis for integrating the first real external shipping carrier into the SCS Platform. The carrier foundation (M7.2.3-A) provides:

- Abstract `ShippingProvider` interface with 6 operations
- `ShippingProviderRegistry` for provider registration
- `ShippingCarrierWorker` with outbox pattern, exponential backoff, idempotency
- `carrier_credentials` with AES-256-GCM encryption
- `carrier_configurations` with per-org/per-store scope
- `carrier_webhook_events` with HMAC-SHA256 verification and deduplication
- `shipment_labels` with multi-label, void support
- 42 PostgreSQL concurrency tests passing
- 1264 total tests passing, TypeScript 0 issues, build 221 files

**Recommended first carrier: Aramex**

Aramex is the strongest candidate for the GCC/MEA region based on:
- Dominant presence in Saudi Arabia, UAE, Jordan, and wider MENA
- Well-documented SOAP/XML API (WSDL at `ws.aramex.net`)
- Native COD support (critical for GCC e-commerce)
- Address validation API
- 10 service codes covering domestic and international
- PDF label generation inline with create shipment

**Critical architectural finding:** Aramex uses SOAP/XML, not REST. This requires a SOAP HTTP client wrapper. The existing `ShippingProvider` interface is transport-agnostic and fully compatible.

**Critical webhook finding:** Aramex does NOT provide native webhooks. Status updates require either periodic polling via `TrackShipments` or a third-party webhook relay (e.g., TrackingMore). The existing webhook endpoint is compatible with third-party relay but requires external configuration.

**GO / NO-GO: CONDITIONAL GO** — Proceed to implementation after resolving 4 mandatory pre-implementation decisions documented in Section 28.

---

## 2. Recommended First Carrier

### Evaluation Matrix

| Criterion | Aramex | SMSA | DHL | FedEx |
|-----------|--------|------|-----|-------|
| GCC coverage | ★★★★★ | ★★★★ | ★★★★ | ★★★ |
| COD support | Native | Native | Add-on | Add-on |
| API documentation | SOAP/WSDL (well-documented via SDKs) | Limited public docs | REST (excellent) | REST (excellent) |
| Sandbox availability | Test mode credentials | Limited | Yes | Yes |
| Label generation | PDF inline with create | PDF | PDF/PNG | PDF/ZPL/PNG |
| Address validation | Yes (dedicated API) | Unknown | Yes | Yes |
| Tracking API | Yes (TrackShipments) | Limited | Yes | Yes |
| Webhook/push | Via third-party | Unknown | Native webhooks | Native webhooks |
| Rate quoting | Yes (CalculateRate) | Unknown | Yes | Yes |
| Pickup scheduling | Yes (CreatePickup/CancelPickup) | Unknown | Yes | Yes |
| GCC e-commerce fit | ★★★★★ | ★★★★ | ★★★ | ★★★ |
| SOAP vs REST | SOAP (requires wrapper) | Unknown | REST | REST |

### Decision: Aramex

**Rationale:**
1. Aramex is the dominant carrier in the GCC region (SCS primary market)
2. Native COD support is critical — majority of GCC e-commerce is COD
3. The SOAP API is well-documented through multiple open-source SDKs
4. Address validation reduces failed deliveries
5. Pickup scheduling (CreatePickup/CancelPickup) is a differentiator

**Trade-offs accepted:**
- SOAP/XML requires a client wrapper (not a native REST call)
- No native webhooks — requires polling or third-party relay
- Test/sandbox requires credentials from Aramex account manager (not self-service)

### External Verification Required

The following MUST be verified with Aramex before implementation:

| Item | Who | Status |
|------|-----|--------|
| Sandbox/test credentials | Aramex integration team | NOT TESTED |
| Production credentials | Aramex account manager | NOT TESTED |
| WSDL endpoint availability | Aramex ops | NOT TESTED |
| Rate limits (undocumented) | Aramex integration team | NOT TESTED |
| Webhook relay compatibility | Third-party (TrackingMore) | NOT TESTED |
| Supported countries from SCS origin | Aramex | NOT TESTED |
| COD currency restrictions | Aramex | NOT TESTED |

---

## 3. API Capabilities

### Aramex SOAP API Overview

**Protocol:** SOAP 1.1/1.2 over HTTP  
**WSDL:** `https://ws.aramex.net/ShippingAPI.v2/ShippingAPI.asmx?WSDL`  
**Test WSDL:** `https://ws.aramex.net/ShippingAPI.v2/ShippingAPI.asmx?WSDL` (same endpoint, test credentials route to sandbox)  
**Content-Type:** `text/xml; charset=utf-8`

### Available Operations

| Operation | SCS Mapping | Priority |
|-----------|-------------|----------|
| CreateShipments | `createShipment()` | P0 — Must have |
| CancelPickup | `cancelShipment()` | P0 — Must have |
| TrackShipments | `getTrackingInfo()` | P0 — Must have |
| CalculateRate | Rate quoting (future) | P1 — Should have |
| CreatePickup | Pickup scheduling (future) | P1 — Should have |
| ValidateAddress | `validateAddress()` | P1 — Should have |
| FetchCountries | Address reference data | P2 — Nice to have |
| FetchCities | Address reference data | P2 — Nice to have |

### Operations NOT Provided by Aramex

| Capability | Alternative |
|------------|-------------|
| Native webhooks | Poll TrackShipments or use third-party relay |
| Shipment cancellation (after label) | CancelPickup only; no CancelShipment operation |
| Label reprint | Re-call CreateShipments with same reference |
| Multi-piece shipment | Separate CreateShipments per piece (one waybill per parcel) |

---

## 4. Authentication

### Aramex ClientInfo Authentication

Aramex uses a `ClientInfo` block in every SOAP request body. There is no separate token exchange — credentials are sent with every API call.

**Required credential fields:**

| Field | Description | Format |
|-------|-------------|--------|
| UserName | API username (often email) | string |
| Password | API password | string |
| AccountNumber | Aramex business account number | numeric string |
| EntityCode | Office code (e.g., 'DXB', 'RUH') | 3-char string |
| PIN | Account security PIN | numeric string |

### Token Expiration

**Not applicable.** Aramex does not use tokens. Credentials are embedded in every SOAP request. There is no OAuth flow, no token refresh, no session management.

### Sandbox vs Production

| Environment | WSDL Endpoint | Credentials |
|-------------|--------------|-------------|
| Test/Sandbox | Same WSDL URL | Test credentials (from Aramex) |
| Production | Same WSDL URL | Live credentials (from Aramex) |

The environment is distinguished by the **credentials**, not by a different URL. Test credentials create test shipments; live credentials create real shipments.

### Mapping to `carrier_credentials`

The SCS `carrier_credentials` table stores:

```
credentialsEncrypted → AES-256-GCM encrypted JSON blob containing:
{
  "userName": "...",
  "password": "...",
  "accountNumber": "...",
  "entityCode": "...",
  "pin": "..."
}
```

| SCS Field | Aramex Value |
|-----------|-------------|
| `providerKey` | `'aramex'` |
| `environment` | `'sandbox'` or `'production'` |
| `label` | Human-readable name (e.g., 'Aramex UAE Live') |
| `credentialsEncrypted` | JSON blob with 5 fields above |
| `endpointUrl` | `'https://ws.aramex.net/ShippingAPI.v2/ShippingAPI.asmx'` |
| `webhookSecretEncrypted` | Third-party relay webhook secret (if applicable) |

### Credential Rotation

Since Aramex credentials are static (no token expiry), rotation means:
1. Obtain new credentials from Aramex
2. Update `credentialsEncrypted` with new JSON blob
3. Mark old credential row `isActive = false`
4. New credential row `isActive = true`
5. Partial unique index `uq_carrier_creds_org_provider_env` ensures only one active credential per (org, provider, environment)

**No code changes required for rotation** — the existing schema supports it.

### Security Verification

| Check | Status |
|-------|--------|
| Secrets NOT in `shipping_methods` | ✅ Verified — no credential fields |
| Secrets NOT in `shipments` | ✅ Verified — only `carrierShipmentId`, status fields |
| Secrets NOT in metadata | ✅ Verified — metadata is JSONB for business data |
| Secrets NOT in frontend | ✅ Verified — `carrierCredentials` API never returns plaintext |
| Secrets NOT in logs | ✅ Verified — `CarrierCredentialsService` masks all output |
| Encrypted at rest | ✅ AES-256-GCM with unique IV per encryption |

**Status: PASS**

---

## 5. Create Shipment Mapping

### SCS → Aramex Field Mapping

| SCS Field (`CreateShipmentRequest`) | Aramex Field | Required/Optional | Transformation |
|-------------------------------------|-------------|-------------------|----------------|
| `shipmentId` | `Reference` | Required | Direct: SCS shipment UUID |
| `orderId` | `ShipperReference` | Optional | Direct: SCS order UUID |
| `storeId` | — | Not sent | Used internally to resolve sender address |
| `deliveryAddress.street` | `Consignee.Line1` | Required | Direct mapping |
| `deliveryAddress.city` | `Consignee.City` | Required | Direct mapping |
| `deliveryAddress.postalCode` | `Consignee.ZipCode` | Conditional | Required for some countries; empty OK for UAE |
| `deliveryAddress.region` | — | Not mapped | Aramex has no state/region field in basic API |
| `deliveryAddress.country` | `Consignee.CountryCode` | Required | ISO 3166-1 Alpha-2 (e.g., 'SA', 'AE') |
| `deliveryAddress.phone` | `Consignee.Phone` | Required | E.164 format (e.g., '+966501234567') |
| `deliveryAddress.recipientName` | `Consignee.Name` | Required | Direct mapping |
| `senderAddress.street` | `Shipper.Line1` | Required | From `carrierConfigurations.pickupAddress` if not provided |
| `senderAddress.city` | `Shipper.City` | Required | From pickup address |
| `senderAddress.country` | `Shipper.CountryCode` | Required | From pickup address |
| `senderAddress.phone` | `Shipper.Phone` | Required | From pickup address |
| `senderAddress.recipientName` | `Shipper.Name` | Required | From pickup address |
| `serviceType` | `ProductType` | Required | Map SCS type to Aramex code (PPX, EPX, etc.) |
| `weightGrams` | `Weight` | Required | **÷ 1000** (SCS uses grams, Aramex uses KG) |
| `dimensionsCm.lengthCm` | `Length` | Optional | Direct (CM) |
| `dimensionsCm.widthCm` | `Width` | Optional | Direct (CM) |
| `dimensionsCm.heightCm` | `Height` | Optional | Direct (CM) |
| `packageCount` | `NumberOfPieces` | Required | Default 1 if not specified |
| `codAmountMinor` | `CashOnDeliveryAmount.Value` | Conditional | **÷ 100** (minor → major units); requires CODS service |
| `currency` | `CashOnDeliveryAmount.CurrencyCode` | Conditional | ISO 4217 (e.g., 'SAR', 'AED', 'USD') |
| `declaredValueMinor` | `CustomsValueAmount.Value` | Conditional | **÷ 100** (minor → major); required for international |
| `idempotencyKey` | `Reference` | Optional | Same as `shipmentId` — used as dedup reference |
| `metadata` | — | Not sent | Stored locally only |

### Aramex-Only Fields (not in SCS)

| Aramex Field | Source | Notes |
|-------------|--------|-------|
| `Consignee.Email` | Order/buyer email | Must be retrieved from order data |
| `Consignee.CellPhone` | — | Optional; use same as Phone if available |
| `Shipper.Email` | `carrierConfigurations.pickupAddress` or store email | Sender contact |
| `Shipper.CellPhone` | — | Optional |
| `ShippingDateTime` | Now + buffer | ISO datetime for shipment handover |
| `DueDate` | Now + SLA | Expected delivery deadline |
| `Comments` | — | Optional; e.g., order notes |
| `PickupLocation` | `carrierConfigurations.pickupAddress` | E.g., 'Reception' |
| `PickupGUID` | From CreatePickup | Optional; links to scheduled pickup |
| `DescriptionOfGoods` | Order items | E.g., 'Electronics' or product names |
| `ProductGroup` | Derived from origin/destination | 'DOM' (same country) or 'EXP' (international) |
| `PaymentType` | `carrierConfigurations` | 'P' (prepaid), 'C' (collect), '3' (third party) |
| `Services` | Derived from shipment options | Comma-separated: 'CODS,FRDM,SIGP' etc. |
| `InsuranceAmount` | — | Optional; default 0 |
| `CollectAmount` | — | Optional; default 0 |

### Address Mapping Detail

**SCS `ShippingAddress`:**
```
{ street, city, postalCode?, region?, country, phone?, recipientName? }
```

**Aramex Address (Shipper/Consignee):**
```
{ Name, Email, Phone, CellPhone, CountryCode, City, ZipCode, Line1, Line2, Line3 }
```

| SCS | Aramex | Notes |
|-----|--------|-------|
| `recipientName` | `Name` | Required by Aramex |
| — | `Email` | Required by Aramex; must source from order/buyer |
| `phone` | `Phone` | Required by Aramex; E.164 format |
| — | `CellPhone` | Optional; fallback to Phone |
| `country` | `CountryCode` | 2-char ISO |
| `city` | `City` | Direct |
| `postalCode` | `ZipCode` | Conditional |
| `street` | `Line1` | Direct |
| — | `Line2` | From address metadata if available |
| — | `Line3` | Not typically used |

### Critical Gaps

1. **Email not in `ShippingAddress`:** Aramex requires `Consignee.Email`. SCS `ShippingAddress` does not include email. Must be sourced from the order's buyer record or added to the address snapshot.

2. **Unit conversion:** SCS stores weight in grams (minor units), Aramex expects KG. SCS stores monetary values in minor units, Aramex expects major units (float). Adapter must convert.

3. **Sender address:** If `senderAddress` is not provided in `CreateShipmentRequest`, the adapter must fall back to `carrierConfigurations.pickupAddress` for the org/store.

**Status: PASS WITH CONDITIONS** — Email gap must be resolved before implementation.

---

## 6. Carrier Response Mapping

### Aramex CreateShipment Response → SCS `CreateShipmentResult`

| Aramex Response Field | SCS Field (`CreateShipmentResult`) | Transformation |
|----------------------|-------------------------------------|----------------|
| `Shipments.ProcessedShipment.ID` | `carrierShipmentId` | Direct (Aramex shipment ID, e.g., '12345') |
| `Shipments.ProcessedShipment.ID` | `trackingId` | Same value — Aramex ID is the tracking number (waybill) |
| — | `carrierStatus` | `'RECORD_CREATED'` (initial status) |
| — | `estimatedDeliveryDate` | Not returned by CreateShipment; null |
| `Shipments.ProcessedShipment.ShipmentLabel.LabelURL` | `labelUrl` | Direct (URL to PDF label) |
| — | `labelData` | Not inline; fetch from `labelUrl` if binary needed |
| `'PDF'` | `labelFormat` | Static — Aramex always returns PDF |
| — | `rateQuoteMinor` | Not returned by CreateShipment; use CalculateRate separately |
| — | `rateCurrency` | Not returned |
| `providerKey` | `providerKey` | `'aramex'` |
| `Shipments.ProcessedShipment.ShipmentDetails` | `metadata` | Origin, Destination, ProductType, PaymentType, etc. |

### Aramex Response Error Structure

```json
{
  "HasErrors": true,
  "Notifications": [
    { "Code": "ERR01", "Message": "Invalid consignee phone number" }
  ],
  "Shipments": {
    "ProcessedShipment": {
      "HasErrors": true,
      "Notifications": [{ "Code": "ERR01", "Message": "..." }]
    }
  }
}
```

**Mapping:** If `HasErrors == true`, the adapter throws a carrier error with the notification messages. The worker marks the shipment `carrierCreateStatus = 'FAILED'` with the error in `carrierCreateError`.

### Rate Quote (Separate API Call)

Aramex `CalculateRate` returns:
```json
{
  "TotalAmount": { "CurrencyCode": "USD", "Value": 1004.74 },
  "RateDetails": {
    "Amount": 312.34,
    "OtherAmount5": 475.73,
    "TotalAmountBeforeTax": 866.15,
    "TaxAmount": 138.59
  }
}
```

**Mapping to SCS:** `rateQuoteMinor = TotalAmount.Value × 100` (convert to minor units), `rateCurrency = TotalAmount.CurrencyCode`.

**Status: PASS** — Response mapping is straightforward.

---

## 7. Idempotency

### Aramex Native Idempotency

Aramex does **NOT** provide native idempotency keys. However, Aramex does support:

| Mechanism | Field | Behavior |
|-----------|-------|----------|
| Shipment Reference | `Reference` | Printed on waybill; no dedup guarantee |
| Shipper Reference | `ShipperReference` | Optional; no dedup guarantee |
| Consignee Reference | `ConsigneeReference` | Optional; no dedup guarantee |

**Critical:** Aramex does NOT guarantee that duplicate `Reference` values are rejected. Sending the same CreateShipments request twice MAY create two shipments.

### SCS Idempotency Design

The existing SCS design handles this correctly:

```
generateIdempotencyKey(shipmentId) → "carrier-create:{shipmentId}"
```

**Worker safety flow:**

```
1. Worker picks up shipping.carrier.create event
2. Check shipment.carrierCreateStatus:
   - SUCCESS + carrierShipmentId exists → SKIP (already done)
   - IN_PROGRESS → SKIP (another worker is handling it)
   - FAILED → RETRY (reset to PENDING)
   - NULL/PENDING → proceed
3. Set carrierCreateStatus = IN_PROGRESS
4. Call Aramex CreateShipments with Reference = idempotencyKey
5. On success: set carrierCreateStatus = SUCCESS, carrierShipmentId = Aramex ID
6. On failure: set carrierCreateStatus = FAILED, carrierCreateError = error message
```

**Timeout/crash safety:**

| Scenario | Behavior |
|----------|----------|
| HTTP timeout after Aramex created shipment | `carrierCreateStatus = IN_PROGRESS`; next poll retries; Aramex may create duplicate — mitigated by checking Reference before retry |
| Connection reset | Same as timeout |
| 500/502/503 | Worker retries with backoff; no shipment created at Aramex |
| Worker restart | IN_PROGRESS shipments remain; admin must manually reset to PENDING for retry |

### Recommended Enhancement

Before calling Aramex CreateShipments, the adapter should:

1. Check if `carrierShipmentId` already exists for this shipment → return idempotent result
2. Check if the idempotency key was already used as a `Reference` at Aramex (via TrackShipments lookup) → reuse existing carrier shipment
3. Only if both checks fail → call CreateShipments

**Status: PASS WITH CONDITIONS** — The existing worker guards are sufficient for most cases. The IN_PROGRESS-after-timeout scenario requires either:
- (A) A tracking lookup before retry to check for duplicate creation, or
- (B) An admin manual reset for stuck IN_PROGRESS shipments

Recommendation: Implement option (A) in the Aramex adapter — before creating, call `TrackShipments(idempotencyKey)` to check if a shipment already exists with that reference.

---

## 8. Cancellation

### Aramex Cancellation Capabilities

| Operation | Supported | API |
|-----------|-----------|-----|
| Cancel Pickup | Yes | `CancelPickup` (requires `pickupGUID`) |
| Cancel Shipment (after label) | **No direct API** | No `CancelShipment` operation exists |
| Void Label | Not explicitly | Contact Aramex support; or let waybill expire |

### CancelPickup

```
CancelPickup(pickupGUID: string) → { error: 0 } or { error: 1, errors: [...] }
```

- Can only cancel a pickup that hasn't been collected yet
- Once the driver has collected the shipment, cancellation is not possible via API

### Post-Creation Cancellation

Aramex does NOT provide a programmatic way to cancel a shipment after the label is created. Options:
1. **Do not hand over the package** — the waybill expires unused
2. **Contact Aramex support** — manual cancellation
3. **Reject on delivery** — receiver refuses; shipment returns to sender

### Mapping to SCS `cancelShipment()`

```typescript
async cancelShipment(shipmentId: string): Promise<CancelShipmentResult> {
  // Case 1: Pickup scheduled but not collected
  if (shipment has pickupGUID) {
    result = await aramex.cancelPickup(pickupGUID);
    if (result.error === 0) {
      return { supported: true, cancelled: true, carrierStatus: 'CANCELLED' };
    }
    return { supported: true, cancelled: false, reason: result.errors };
  }

  // Case 2: No pickup or already collected
  return {
    supported: true,
    cancelled: false,
    reason: 'Aramex does not support post-creation shipment cancellation via API. ' +
            'Do not hand over the package, or contact Aramex support.'
  };
}
```

### Timing Restrictions

| Shipment State | Can Cancel? |
|----------------|-------------|
| Label created, not handed to carrier | Not via API — do not hand over |
| Picked up by driver | Only if pickup not yet collected (CancelPickup) |
| In transit | No |
| Out for delivery | No |
| Delivered | No |

**Status: PASS WITH CONDITIONS** — Aramex cancellation is limited. The adapter must clearly communicate this limitation. SCS should track `cancelledAt` and `cancellationReason` for audit trail even when carrier-side cancellation is not possible.

---

## 9. Labels

### Aramex Label Generation

Labels are generated **synchronously** as part of `CreateShipments`. There is no separate label API.

| Property | Value |
|----------|-------|
| Format | PDF |
| Generation | Synchronous (within CreateShipments response) |
| Delivery | URL (`ShipmentLabel.LabelURL`) — temporary link on Aramex servers |
| Content | One waybill per parcel (per piece/package) |
| Expiration | URL is temporary; download and store |
| Multiple labels | One per `NumberOfPieces`; Aramex creates one waybill per piece |
| Reprinting | Call CreateShipments again with same reference, or store downloaded PDF |
| Voiding | Not supported via API; label becomes invalid if shipment is not used |

### Mapping to SCS `GenerateLabelResult`

Since labels are generated during `CreateShipments`, the `generateLabel()` method serves two purposes:
1. **Re-fetch:** Download the label PDF from the stored `labelUrl`
2. **Store:** Save to object storage and create `shipment_labels` record

```typescript
async generateLabel(shipmentId: string): Promise<GenerateLabelResult> {
  // Fetch label URL from shipment record
  const labelUrl = shipment.labelUrl; // stored from CreateShipments response
  if (!labelUrl) {
    return { supported: false, reason: 'No label URL available' };
  }

  // Download PDF from Aramex
  const pdfBuffer = await httpGet(labelUrl);

  // Store in object storage (B2/S3)
  const storageKey = `labels/aramex/${shipmentId}/${Date.now()}.pdf`;
  await objectStorage.put(storageKey, pdfBuffer);

  return {
    supported: true,
    labelData: pdfBuffer.toString('base64'),
    labelFormat: 'PDF',
    storageKey,
  };
}
```

### Integration with `shipment_labels`

| SCS Field | Aramex Value |
|-----------|-------------|
| `shipmentId` | SCS shipment UUID |
| `labelNumber` | Aramex waybill number |
| `storageKey` | Object storage path after download |
| `mimeType` | `'application/pdf'` |
| `sizeBytes` | PDF file size |
| `trackingUrl` | Aramex tracking URL (if available) |
| `isVoid` | `false` (voiding not supported) |
| `providerKey` | `'aramex'` |
| `labelType` | `'SHIPPING'` |

**Status: PASS** — Label handling is straightforward. The main action is to download and persist the PDF from the temporary Aramex URL at creation time.

---

## 10. Tracking

### Aramex TrackShipments API

```
TrackShipments(shipmentIds: string[]) → TrackingResults
```

Accepts an array of shipment IDs (waybill numbers). Returns tracking event history for each.

### Response Structure

```json
{
  "TrackingResults": {
    "KeyValueOfstringArrayOfTrackingResult": {
      "Key": "12345",
      "Value": {
        "TrackingResult": [
          {
            "WaybillNumber": "12345",
            "UpdateCode": "SH014",
            "UpdateDescription": "Record created.",
            "UpdateDateTime": "2026-09-28T10:00:00",
            "UpdateLocation": "Riyadh, Saudi Arabia",
            "Comments": "Shipment created",
            "ProblemCode": "",
            "GrossWeight": "0.5",
            "ChargeableWeight": "0.5",
            "WeightUnit": "KG"
          }
        ]
      }
    }
  },
  "NonExistingWaybills": { "string": [] }
}
```

### Mapping to SCS `TrackingInfo` / `TrackingEvent`

| Aramex Field | SCS Field | Transformation |
|-------------|-----------|----------------|
| `Key` (shipment ID) | `trackingId` | Direct |
| `Key` | `carrierShipmentId` | Same value |
| Latest `UpdateCode` | `status` | Via status mapping (Part 10) |
| — | `estimatedDelivery` | Not provided by TrackShipments |
| `TrackingResult[]` | `events[]` | Mapped below |

| Aramex TrackingResult Field | SCS `TrackingEvent` Field | Transformation |
|----------------------------|---------------------------|----------------|
| `UpdateDateTime` | `timestamp` | ISO 8601 direct |
| `UpdateDescription` | `description` | Direct |
| `UpdateCode` | `carrierStatus` | Raw code (e.g., 'SH005') |
| `UpdateCode` | `status` | Mapped via `mapCarrierStatus()` |
| `UpdateLocation` | `location` | Direct |
| `Comments` | `metadata.comments` | Stored in metadata |
| `ProblemCode` | `metadata.problemCode` | Stored in metadata (non-empty = issue) |

### Integration with `shipmentEvents`

Each tracking event is inserted into `shipment_events`:

| SCS Field | Value |
|-----------|-------|
| `shipmentId` | SCS shipment UUID (resolved from `carrierShipmentId`) |
| `eventType` | Mapped lifecycle event (e.g., 'IN_TRANSIT', 'DELIVERED') |
| `actorType` | `'CARRIER'` |
| `locationText` | `UpdateLocation` |
| `notes` | `Comments` |
| `externalEventId` | `${UpdateCode}:${UpdateDateTime}` (dedup key) |
| `carrierEventCode` | `UpdateCode` (e.g., 'SH005') |
| `metadata` | `{ problemCode, grossWeight, chargeableWeight }` |

**Status: PASS** — Tracking mapping is well-defined.

---

## 11. Webhooks

### Critical Finding: Aramex Does NOT Provide Native Webhooks

Aramex's SOAP API is request/response only. There is no webhook registration endpoint, no push notification mechanism, and no event subscription API.

### Options for Real-Time Status Updates

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **A: Poll TrackShipments** | Worker periodically calls TrackShipments for active shipments | No third-party dependency; uses existing API | Not real-time; API call volume; polling latency |
| **B: Third-party relay (TrackingMore)** | TrackingMore receives carrier updates and forwards as webhooks | Real-time; existing SCS webhook endpoint compatible | Additional cost; dependency on third-party; latency |
| **C: Third-party relay (AfterShip)** | Similar to TrackingMore | Real-time | Additional cost |

### Recommended: Option A (Polling) + Option B (Third-Party Relay) Hybrid

- **Phase 1:** Implement polling via `shipping.carrier.track` outbox events. The existing worker already supports this event type.
- **Phase 2:** When a third-party relay is configured, use the existing webhook endpoint for real-time updates.

### Third-Party Webhook Mapping (if Using TrackingMore or Similar)

If a third-party relay is used, the existing SCS webhook endpoint is compatible:

```
POST /v1/webhooks/carrier/:providerKey
```

**Webhook security (from third-party):**

| Property | Value |
|----------|-------|
| Signature | HMAC-SHA256 |
| Signature header | `x-webhook-signature` (already supported by SCS) |
| Timestamp header | `x-webhook-timestamp` (already supported) |
| Replay protection | ±5 minute window (already implemented) |
| Retry behavior | Exponential backoff (14 attempts, 2^attempt × 30s) |
| Duplicate delivery | Possible — SCS dedup handles via UNIQUE(provider_key, external_delivery_id) |

### Webhook Tenant Routing (Multi-Org Problem)

**Current implementation:** `POST /v1/webhooks/carrier/:providerKey` resolves credentials by `providerKey` only. If two orgs both have Aramex credentials, only the first active credential is found.

**First carrier safety:** For the initial rollout, only ONE org will have Aramex credentials. This is safe.

**Required solution for multi-org (before second org onboarded):**

| Option | URL Pattern | Mechanism |
|--------|------------|-----------|
| **A** | `/v1/webhooks/carrier/:providerKey/:credentialId` | CredentialId in URL; deterministic lookup |
| **B** | `/v1/webhooks/carrier/:webhookToken` | Unique token per credential; O(1) lookup |

**DO NOT** use `orgId` from the webhook body — this would allow cross-tenant attacks.

**Recommendation:** Option B (`webhookToken`) is preferred because:
1. It does not expose internal UUIDs in URLs
2. Token can be rotated without changing credential structure
3. Single-segment path is simpler for third-party webhook registration

### Status: PASS WITH CONDITIONS

- Polling must be implemented before relying on webhook relay
- Multi-org webhook routing must be resolved before onboarding second Aramex org
- Third-party relay compatibility must be verified with actual webhook payloads

---

## 12. Status Mapping

### Complete Aramex → SCS Status Map

| Aramex `UpdateCode` | Aramex `UpdateDescription` | SCS `carrier_status_raw` | SCS `carrier_status_mapped` | Lifecycle Event |
|---------------------|---------------------------|-------------------------|---------------------------|-----------------|
| SH001 | Picked up from shipper | `SH001` | `PICKED_UP` | `PICKED_UP` |
| SH002 | Arrived at facility | `SH002` | `IN_TRANSIT` | `IN_TRANSIT` |
| SH003 | Out for delivery | `SH003` | `OUT_FOR_DELIVERY` | `OUT_FOR_DELIVERY` |
| SH004 | Delivered | `SH004` | `DELIVERED` | `DELIVERED` |
| SH005 | Delivered (alternate) | `SH005` | `DELIVERED` | `DELIVERED` |
| SH006 | Return to origin | `SH006` | `RETURNED` | `RETURNED` |
| SH007 | Held at facility | `SH007` | `EXCEPTION` | `EXCEPTION` |
| SH008 | Customs clearance | `SH008` | `IN_TRANSIT` | `CUSTOMS_CLEARANCE` |
| SH009 | Delayed | `SH009` | `EXCEPTION` | `DELAYED` |
| SH010 | Lost | `SH010` | `LOST` | `LOST` |
| SH011 | Damaged | `SH011` | `DAMAGED` | `DAMAGED` |
| SH012 | Cancelled | `SH012` | `CANCELLED` | `CANCELLED` |
| SH013 | Rejected by consignee | `SH013` | `RETURNED` | `REJECTED` |
| SH014 | Record created | `SH014` | `LABEL_CREATED` | `LABEL_CREATED` |
| SH160 | Under processing | `SH160` | `IN_TRANSIT` | `PROCESSING` |

### Normal Progression

```
LABEL_CREATED (SH014)
  → PICKED_UP (SH001)
    → IN_TRANSIT (SH002/SH160)
      → CUSTOMS_CLEARANCE (SH008)  [international only]
        → IN_TRANSIT (SH002)
          → OUT_FOR_DELIVERY (SH003)
            → DELIVERED (SH004/SH005)
```

### Exception Paths

```
Any state → EXCEPTION (SH007/SH009) → [resolution] → continue or return
Any state → LOST (SH010) → terminal
Any state → DAMAGED (SH011) → terminal
Any state → RETURNED (SH006/SH013) → terminal
Any state → CANCELLED (SH012) → terminal
```

### Unknown Status Handling

**Rule:** Unknown `UpdateCode` values MUST NOT be silently mapped.

```typescript
mapCarrierStatus(carrierStatus: string): CarrierStatusMapping | null {
  const known = ARAMEX_STATUS_MAP[carrierStatus];
  if (known) return known;

  // Unknown status — return observable mapping
  return {
    internalStatus: 'UNKNOWN',
    carrierStatus: carrierStatus,
    description: `Unknown Aramex status: ${carrierStatus}`,
  };
}
```

The `carrier_status_mapped` field is `varchar(24)`. Unknown statuses are stored as `'UNKNOWN'` while the raw code is preserved in `carrier_status_raw` (varchar(80)).

**Status: PASS** — Status mapping is comprehensive. Unknown status handling is observable.

---

## 13. Error Handling

### HTTP Error Classification

| HTTP Code | Retry? | Backoff? | Mark Failed? | Notify Merchant? | Manual Intervention? |
|-----------|--------|----------|-------------|-----------------|---------------------|
| 400 Bad Request | No | No | Yes | Yes | Yes (fix request) |
| 401 Unauthorized | No | No | Yes | Yes (admin) | Yes (check credentials) |
| 403 Forbidden | No | No | Yes | Yes (admin) | Yes (check permissions) |
| 404 Not Found | No | No | Yes | No | No (invalid shipment ID) |
| 409 Conflict | No | No | Yes | Yes | Yes (resolve conflict) |
| 422 Unprocessable | No | No | Yes | Yes | Yes (fix data) |
| 429 Too Many Requests | Yes | Yes (Retry-After) | No | No | No (auto-backoff) |
| 500 Internal Server | Yes | Yes (exponential) | No (after MAX_ATTEMPTS) | No | No (auto-retry) |
| 502 Bad Gateway | Yes | Yes | No | No | No |
| 503 Service Unavailable | Yes | Yes | No | No | No |
| 504 Gateway Timeout | Yes | Yes | No | No | No |
| Timeout (no response) | Yes | Yes | No | No | No |
| DNS/network failure | Yes | Yes | No | No | No |

### Aramex SOAP Fault Handling

Aramex returns errors in the SOAP response body, not as HTTP status codes. The HTTP response is always 200 OK.

```json
{
  "HasErrors": true,
  "Notifications": [
    { "Code": "ERR01", "Message": "Invalid phone number" }
  ]
}
```

**Classification of Aramex error codes:**

| Error Category | Retry? | Action |
|---------------|--------|--------|
| Invalid data (phone, address, weight) | No | Mark FAILED, notify merchant |
| Invalid credentials | No | Mark FAILED, notify admin |
| Account suspended | No | Mark FAILED, notify admin |
| Service unavailable (Aramex internal) | Yes | Worker retry with backoff |
| Duplicate reference | No | Lookup existing shipment |
| Rate limit exceeded | Yes | Backoff per Retry-After |

### Integration with Worker

The existing `ShippingCarrierWorker.handleFailure()` already implements:
- Exponential backoff: [0, 30, 120, 600, 3600] seconds with ±20% jitter
- Maximum 5 attempts
- FAILED status after max attempts
- Error message stored in `outbox_events.last_error`

**Enhancement needed:** The adapter must distinguish between retryable and non-retryable errors. Non-retryable errors should throw a specific `NonRetryableCarrierError` that the worker catches and immediately marks as FAILED without retry.

**Status: PASS** — Error handling is well-covered by the existing worker. Adapter must classify errors correctly.

---

## 14. Rate Limits

### Aramex Rate Limits

Aramex does **NOT** publicly document API rate limits. Based on community reports and SDK documentation:

| Estimate | Source | Confidence |
|----------|--------|------------|
| ~100 requests/minute per account | Community reports | LOW |
| Burst: ~20 requests/second | Inferred | LOW |
| No documented Retry-After header | SDK analysis | MEDIUM |

### DECISION REQUIRED: Conservative Rate Limiting

Until Aramex provides documented limits, the adapter MUST implement conservative rate limiting:

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max requests/minute | 60 | Conservative default |
| Max concurrent requests | 5 | Prevent connection pool exhaustion |
| Retry-After respect | Yes | If Aramex sends it |
| Backoff on 429 | Exponential | Standard |
| Circuit breaker | Open after 10 consecutive 429s | Prevent hammering |

### Integration with `ShippingCarrierWorker`

The worker already:
- Polls every 5 seconds
- Processes max 5 events per poll cycle
- Implements exponential backoff

**Additional requirement:** The Aramex adapter should implement an in-memory rate limiter (token bucket) to prevent exceeding the estimated 60 req/min limit across all concurrent worker operations.

**Status: DECISION REQUIRED** — Rate limit values must be confirmed with Aramex before production deployment. Conservative defaults are safe for sandbox testing.

---

## 15. Address Validation

### Aramex ValidateAddress API

```
ValidateAddress({
  line1: string,     // optional but recommended
  line2: string,     // optional
  line3: string,     // optional
  country_code: string, // required (2-char ISO)
  postal_code: string,  // optional
  city: string,         // required
}) → {
  HasErrors: boolean,
  SuggestedAddresses: Address[]
}
```

### Mapping to SCS `validateAddress()`

```typescript
async validateAddress(address: ShippingAddress): Promise<boolean> {
  const result = await aramex.validateAddress({
    line1: address.street,
    country_code: address.country,
    postal_code: address.postalCode || '',
    city: address.city,
  });

  return !result.HasErrors;
}
```

### SCS Integration Strategy

| Approach | Recommendation |
|----------|---------------|
| Validate before shipment creation | Yes — call ValidateAddress in the create flow before CreateShipments |
| Normalize address | No — Aramex returns suggestions, not normalized addresses |
| Reject invalid address | Yes — if `HasErrors == true`, return error to merchant |
| Allow carrier-side validation | Yes — Aramex validates during CreateShipments too |

**Avoid duplicate validation:** If the merchant has already validated the address through SCS, do not validate again at Aramex. Cache validation results per address hash.

### Additional Address APIs

| API | Use Case |
|-----|----------|
| FetchCountries | Populate country list with Aramex-supported countries |
| FetchCities | City autocomplete for address forms |

These are reference data APIs — call once and cache in the database.

**Status: PASS** — Aramex provides address validation. SCS `validateAddress()` maps directly.

---

## 16. Shipping Method Model

### Aramex Service Codes → SCS `shipping_methods`

| Aramex Code | Service Name | SCS `type` | SCS `carrierServiceCode` | Domestic/International |
|-------------|-------------|-----------|-------------------------|----------------------|
| CDS | Domestic Service Outbound | STANDARD | `CDS` | Domestic |
| RTC | Domestic Service Inbound | STANDARD | `RTC` | Domestic |
| EPX | International Service Outbound | EXPRESS | `EPX` | International |
| PDX | Priority Document Express | EXPRESS | `PDX` | Both |
| PPX | Priority Parcel Express | EXPRESS | `PPX` | Both |
| PLX | Priority Letter Express | EXPRESS | `PLX` | Both |
| DDX | Deferred Document Express | STANDARD | `DDX` | Both |
| DPX | Deferred Parcel Express | STANDARD | `DPX` | Both |
| GDX | Ground Document Express | STANDARD | `GDX` | Both |
| GPX | Ground Parcel Express | STANDARD | `GPX` | Both |

### `shipping_methods` Record Example

```
{
  id: uuid,
  storeId: uuid,
  name: 'Aramex Priority Parcel',
  fulfillmentMethod: 'CARRIER',       // NOT PLATFORM_DELIVERY, MERCHANT_DELIVERY, or PICKUP
  carrierType: 'ARAMEX',
  type: 'EXPRESS',
  shippingProviderKey: 'aramex',       // links to provider registry
  carrierServiceCode: 'PPX',           // Aramex-specific code
  baseFeeMinor: 2500,                  // 25.00 SAR
  currency: 'SAR',
  estimatedDaysMin: 1,
  estimatedDaysMax: 3,
  isActive: true
}
```

### Separation of Concerns

| Field | Purpose | Must NOT Contain |
|-------|---------|-----------------|
| `fulfillmentMethod` | How the order is fulfilled | Carrier service codes |
| `shippingProviderKey` | Which provider handles this | Fulfillment method types |
| `carrierServiceCode` | Carrier-specific service identifier | SCS method types |
| `type` | SCS delivery speed category | Carrier codes |

**Rule:** `PLATFORM_DELIVERY`, `MERCHANT_DELIVERY`, `PICKUP` are `fulfillmentMethod` values. They are orthogonal to carrier service types (`PPX`, `EPX`, etc.).

**Status: PASS** — The existing schema correctly separates these concerns.

---

## 17. Credential Architecture

### Aramex Credentials in `carrier_credentials`

The `credentialsEncrypted` field stores a JSON blob:

```json
{
  "userName": "api_user@example.com",
  "password": "secret_password",
  "accountNumber": "123456",
  "entityCode": "DXB",
  "pin": "9876"
}
```

### Schema Sufficiency Analysis

| SCS Column | Aramex Need | Status |
|-----------|-------------|--------|
| `orgId` | Org ownership | ✅ Sufficient |
| `providerKey` | `'aramex'` | ✅ Sufficient |
| `environment` | `'sandbox'` / `'production'` | ✅ Sufficient |
| `label` | Human-readable name | ✅ Sufficient |
| `credentialsEncrypted` | 5-field JSON blob | ✅ Sufficient — arbitrary JSON |
| `endpointUrl` | WSDL URL | ✅ Sufficient |
| `webhookSecretEncrypted` | Third-party relay secret | ✅ Sufficient |
| `isActive` | Active/inactive toggle | ✅ Sufficient |
| `createdBy` | Audit trail | ✅ Sufficient |

### Additional Fields NOT Needed

| Potential Field | Needed for Aramex? | Reason |
|----------------|-------------------|--------|
| `accountCountry` | No | Entity code implies country; ship-from address is in `carrierConfigurations.pickupAddress` |
| `weightUnit` | No | Always KG_CM for Aramex; adapter hardcodes conversion |
| `testMode` | No | `environment` field handles this |

### Credential Rotation

| Step | Action |
|------|--------|
| 1 | Admin creates new `carrier_credentials` row with new credentials |
| 2 | New row `isActive = true`, old row `isActive = false` |
| 3 | Partial unique index ensures one active per (org, provider, env) |
| 4 | Worker picks up new credential on next API call |

**No schema changes required.**

**Status: PASS** — The existing `carrier_credentials` schema fully supports Aramex without modification.

---

## 18. Transaction Boundary

### A.2 Finding (Revisited)

The `createCarrierShipment` flow performs two separate database operations:

```
1. UPDATE shipments SET carrier_create_status = 'PENDING'
   --- crash window ---
2. INSERT INTO outbox_events (shipping.carrier.create)
```

These are NOT wrapped in a database transaction.

### Failure Scenario

```
UPDATE shipments SET carrier_create_status = 'PENDING'
    ↓
process crash (OOM, SIGKILL, deploy)
    ↓
no outbox event inserted
    ↓
worker never picks up this shipment
    ↓
carrier shipment never created
```

### Risk Assessment for First Real Carrier

**This is no longer just a theoretical risk.** With a real carrier:
- The crash window results in a real shipment not being created at Aramex
- The merchant expects a label and tracking number
- No automatic recovery exists (no reconciliation worker)

### Options

| Option | Description | Effort | Risk |
|--------|-------------|--------|------|
| **A: Fix now** | Wrap UPDATE + INSERT in `db.transaction()` | Medium (requires DatabaseService refactor) | Low |
| **B: Reconciliation worker** | Background job scans for PENDING shipments without outbox events | Medium | Low — but adds complexity |
| **C: Accept risk** | Document and accept; rely on idempotent retry | Low | Medium — merchant UX impact |

### Recommendation: **Option A — Fix Before First Carrier**

**Rationale:**
1. With a real carrier, the impact is no longer theoretical — a missed creation means a real merchant cannot ship
2. Drizzle ORM supports `db.transaction(async (tx) => { ... })` — the refactor is contained
3. The `DatabaseService` abstraction needs a `transaction()` method exposed — this is a small addition
4. The transaction ensures atomicity: either both the shipment status and outbox event are written, or neither is

**Implementation sketch (not implementing now — audit only):**

```typescript
await this.db.transaction(async (tx) => {
  await tx.update(shipments).set({ carrierCreateStatus: 'PENDING', ... });
  await tx.insert(outboxEvents).values({ eventType: 'shipping.carrier.create', ... });
});
```

**Status: DECISION REQUIRED** — Must be resolved before Aramex adapter implementation.

---

## 19. Provider Interface Gap Analysis

### Current `ShippingProvider` Interface

| Method | Aramex Support | Gap |
|--------|---------------|-----|
| `createShipment(request)` | Yes — `CreateShipments` SOAP call | None |
| `cancelShipment(shipmentId)` | Partial — `CancelPickup` only | Must handle "cannot cancel" gracefully |
| `generateLabel(shipmentId)` | Yes — download from `LabelURL` | Must implement PDF download + storage |
| `getTrackingInfo(trackingId)` | Yes — `TrackShipments` | None |
| `validateAddress(address)` | Yes — `ValidateAddress` | None |
| `mapCarrierStatus(status)` | Yes — static mapping table | None |

### Required Additions to Interface

| Missing Capability | Needed For | Priority |
|-------------------|-----------|----------|
| `getRateQuote(origin, destination, details)` | CalculateRate API | P1 — Should have for checkout |
| `schedulePickup(details)` | CreatePickup API | P1 — Should have |
| `cancelPickup(pickupGuid)` | CancelPickup API | P1 — paired with schedulePickup |
| `fetchCountries()` | FetchCountries API | P2 — Nice to have |
| `fetchCities(countryCode)` | FetchCities API | P2 — Nice to have |

### `ProviderCapabilities` Assessment

Current capabilities interface:

```typescript
interface ProviderCapabilities {
  canCreateShipment: boolean;     // Aramex: true
  canCancel: boolean;             // Aramex: true (partial — CancelPickup only)
  canGenerateLabel: boolean;      // Aramex: true
  canTrack: boolean;              // Aramex: true
  canValidateAddress: boolean;    // Aramex: true
  canReceiveWebhooks: boolean;    // Aramex: false (no native webhooks)
}
```

**Gap:** `canReceiveWebhooks: false` for Aramex. The system must handle this by using polling (`shipping.carrier.track` events) instead of webhooks.

### SOAP Client Requirement

The existing interface is transport-agnostic. The Aramex adapter needs:

| Component | Purpose |
|-----------|---------|
| `AramexSoapClient` | HTTP client for SOAP XML requests |
| WSDL parser or static XML templates | Generate SOAP request bodies |
| Response parser | Parse SOAP XML → TypeScript objects |
| `ClientInfo` builder | Inject credentials into every request |

**This is new infrastructure** — no SOAP client exists in the current codebase.

**Status: PASS WITH CONDITIONS** — The core interface is sufficient. Additional methods (`getRateQuote`, `schedulePickup`) should be added before or during adapter implementation. SOAP client infrastructure must be built.

---

## 20. Security

### Credential Storage

| Check | Status | Detail |
|-------|--------|--------|
| Encrypted at rest | ✅ PASS | AES-256-GCM, unique IV per encryption |
| Master key from env | ✅ PASS | `CREDENTIAL_ENCRYPTION_KEY` env var |
| No plaintext in API responses | ✅ PASS | `CarrierCredentialsService` returns masked view |
| No plaintext in logs | ✅ PASS | Logger never outputs credential values |
| No plaintext in errors | ✅ PASS | Error messages use generic descriptions |
| No secrets in frontend | ✅ PASS | API endpoints require ADMIN role |
| No secrets in metadata | ✅ PASS | `credentialsEncrypted` is separate from `metadata` JSONB |

### Credential Access

| Role | Can Create | Can List (masked) | Can Read Plaintext |
|------|-----------|-------------------|-------------------|
| SUPER_ADMIN | Yes | Yes | No (masked) |
| ADMIN | Yes | Yes | No (masked) |
| MODERATOR | No | Yes | No |
| MERCHANT_OWNER | No | Yes | No |
| MERCHANT_STAFF | No | Yes | No |
| BUYER | No | Yes | No |
| DRIVER | No | Yes | No |

### API Authentication

| Endpoint | Auth Method | Status |
|----------|------------|--------|
| CreateShipment (internal) | JWT + RBAC | ✅ PASS |
| Webhook (inbound) | HMAC-SHA256 | ✅ PASS |
| Credential management | JWT + ADMIN role | ✅ PASS |

### Webhook Authentication

| Property | Implementation | Status |
|----------|---------------|--------|
| HMAC algorithm | SHA-256 | ✅ PASS |
| Constant-time compare | `crypto.timingSafeEqual` | ✅ PASS |
| Timestamp validation | ±5 minute window | ✅ PASS |
| Body size limit | 256 KB | ✅ PASS |
| Rate limiting | 30 req/60s per IP | ✅ PASS |
| Dedup | UNIQUE constraint | ✅ PASS |

### SSRF Risk: `endpoint_url`

The `carrier_credentials.endpoint_url` field allows configurable endpoint URLs.

**Risk:** If an attacker can set `endpoint_url` to an internal network address (e.g., `http://169.254.169.254/latest/meta-data/`), the SOAP client would make requests to internal infrastructure.

**Mitigation required:**

| Control | Implementation |
|---------|---------------|
| Allowlist | `endpoint_url` must match `^https://ws\.aramex\.net/` for Aramex credentials |
| Validation | Reject any `endpoint_url` that resolves to private IP ranges (10.x, 172.16-31.x, 192.168.x, 169.254.x) |
| Admin only | Only ADMIN/SUPER_ADMIN can set `endpoint_url` (already enforced by RBAC) |
| Schema check | Add CHECK constraint or application-level validation |

**Status: PASS WITH CONDITIONS** — SSRF allowlist must be implemented before the Aramex adapter makes HTTP calls to `endpoint_url`.

### PII / Address Data

| Data Type | Sensitivity | Logging | Storage |
|-----------|------------|---------|---------|
| Customer name | Medium | Never log full name | Encrypted in shipment |
| Phone number | High | Never log | In `deliveryAddress` JSONB |
| Email | High | Never log | In order/buyer record |
| Full address | High | Never log full address | In `deliveryAddress` JSONB |
| API credentials | Critical | Never log | `credentialsEncrypted` |
| Webhook secret | Critical | Never log | `webhookSecretEncrypted` |

**Tenant isolation:** Webhook tenant resolution follows `carrierShipmentId → shipment → store → org` chain. The payload's `storeId`/`orgId` are NEVER trusted. ✅ PASS

**Status: PASS WITH CONDITIONS** — SSRF allowlist required. PII handling is acceptable.

---

## 21. Observability

### Required Logging

| Event | Log Level | Fields |
|-------|-----------|--------|
| Shipment create request | INFO | provider, shipmentId, idempotencyKey, serviceCode |
| Shipment create success | INFO | provider, shipmentId, carrierShipmentId, latency |
| Shipment create failure | ERROR | provider, shipmentId, errorClass, errorCode, attempt |
| Tracking poll | DEBUG | provider, trackingId, eventCount |
| Webhook received | INFO | provider, externalDeliveryId, eventType, signatureValid |
| Webhook duplicate | DEBUG | provider, externalDeliveryId |
| Webhook signature failure | WARN | provider, reason (no secrets) |
| Rate limit hit | WARN | provider, retryAfter |
| Credential decrypt | DEBUG | credentialId (no plaintext) |
| Label download | INFO | provider, shipmentId, labelFormat, sizeBytes |

### Must NEVER Log

| Data | Reason |
|------|--------|
| API username/password/PIN | Credential secret |
| Webhook secret | Signing secret |
| Authorization headers | May contain credentials |
| Full customer PII | Privacy |
| Full address (in logs) | Minimize exposure |
| `credentialsEncrypted` value | Encrypted blob — no need to log |
| `webhookSecretEncrypted` value | Encrypted blob |

### Required Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `carrier_create_total` | Counter | provider, result (success/failure), error_class |
| `carrier_create_duration_seconds` | Histogram | provider, service_code |
| `carrier_create_retries_total` | Counter | provider, attempt_number |
| `carrier_rate_limit_total` | Counter | provider |
| `carrier_webhook_total` | Counter | provider, event_type, result |
| `carrier_webhook_signature_failures` | Counter | provider |
| `carrier_label_total` | Counter | provider, result |
| `carrier_tracking_poll_total` | Counter | provider, result |
| `carrier_tracking_events` | Counter | provider, status_code |

### Health Checks

| Check | Endpoint | Purpose |
|-------|----------|---------|
| Worker alive | `/health/shipping-worker` | Worker polling is active |
| Aramex connectivity | `/health/carriers/aramex` | SOAP endpoint reachable |
| Credential validity | `/health/carriers/aramex/credentials` | Active credential exists |

**Status: PASS** — Observability requirements are clear and implementable.

---

## 22. Sandbox Test Plan

### Test Matrix

| # | Test Case | Input | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Create successful shipment | Valid shipper/consignee, PPX service | `carrierCreateStatus = SUCCESS`, `carrierShipmentId` populated, label URL returned |
| 2 | Duplicate create (same idempotency key) | Same request as #1 | Idempotent response — no duplicate at Aramex |
| 3 | HTTP timeout | Simulate SOAP timeout | `carrierCreateStatus` remains IN_PROGRESS; worker retries |
| 4 | Aramex 500 error | Simulate server error | Worker retries with backoff; after 5 attempts → FAILED |
| 5 | Aramex 429 rate limit | Rapid requests | Adapter respects backoff; worker does not aggressively retry |
| 6 | Invalid consignee phone | Missing phone | `carrierCreateStatus = FAILED`; error message mentions phone |
| 7 | Invalid address (bad country code) | Country = 'XX' | Aramex returns error; FAILED with descriptive message |
| 8 | Cancel pickup | Scheduled pickup, not collected | `CancelPickup` succeeds; `cancelledAt` populated |
| 9 | Cancel after collection | Shipment in transit | Returns `{ supported: true, cancelled: false, reason: '...' }` |
| 10 | Label download | Shipment with label URL | PDF downloaded, stored in object storage, `shipment_labels` record created |
| 11 | Tracking poll — single | Valid shipment ID | `TrackingInfo` with events array |
| 12 | Tracking poll — multiple | Array of shipment IDs | Results for each; `NonExistingWaybills` handled |
| 13 | Webhook — valid event | HMAC-signed payload | 200 OK; `carrierWebhookEvents` record created |
| 14 | Webhook — duplicate | Same payload as #13 | 200 OK with `duplicate: true`; no reprocessing |
| 15 | Webhook — out-of-order | 'delivered' before 'picked_up' | Both recorded; state machine handles ordering |
| 16 | Webhook — invalid signature | Tampered signature | 403 Forbidden |
| 17 | Webhook — stale timestamp | Timestamp > 5 min old | 403 Forbidden |
| 18 | Webhook — rate limit | 31+ requests in 60s | 429 Too Many Requests |
| 19 | Unknown carrier status | UpdateCode = 'SH999' | `carrier_status_mapped = 'UNKNOWN'`; observable in logs |
| 20 | Carrier exception (lost) | UpdateCode = 'SH010' | `carrier_status_mapped = 'LOST'`; merchant notified |
| 21 | Delivery | UpdateCode = 'SH005' | `carrier_status_mapped = 'DELIVERED'`; `deliveredAt` set |
| 22 | Return to sender | UpdateCode = 'SH006' | `carrier_status_mapped = 'RETURNED'` |
| 23 | COD shipment | CODS service, amount = 100.00 SAR | `CashOnDeliveryAmount` populated correctly |
| 24 | International shipment | EXP product group, customs value | `CustomsValueAmount` populated; ProductGroup = 'EXP' |
| 25 | Multi-piece shipment | `packageCount = 3` | `NumberOfPieces = 3`; one waybill per piece |
| 26 | Weight conversion | `weightGrams = 2500` | Aramex receives `Weight = 2.5` (KG) |
| 27 | Address validation | Valid UAE address | `validateAddress()` returns true |
| 28 | Address validation — invalid | Non-existent city | `validateAddress()` returns false |

### Test Environment

| Component | Value |
|-----------|-------|
| Aramex sandbox | Test credentials from Aramex |
| PostgreSQL | testcontainers (postgis/postgis:16-3.4) |
| Object storage | In-memory mock (B2 not needed for sandbox) |
| SOAP mock | Optional — use real Aramex sandbox for integration tests |

**Status: PASS** — Test matrix covers all critical paths.

---

## 23. Required Schema Changes

### Analysis: No Schema Changes Required for First Carrier

| Component | Status | Notes |
|-----------|--------|-------|
| `shipments` | ✅ Sufficient | All carrier state columns exist (0043) |
| `shipment_events` | ✅ Sufficient | `externalEventId`, `carrierEventCode` exist |
| `shipping_methods` | ✅ Sufficient | `shippingProviderKey`, `carrierServiceCode` exist |
| `carrier_credentials` | ✅ Sufficient | Supports arbitrary JSON in `credentialsEncrypted` |
| `carrier_configurations` | ✅ Sufficient | `pickupAddress`, `defaultServiceCode` exist |
| `carrier_webhook_events` | ✅ Sufficient | Dedup, signature validation columns exist |
| `shipment_labels` | ✅ Sufficient | Multi-label, void, provider key exist |

### Optional Future Enhancements (NOT Required for First Carrier)

| Enhancement | Purpose | Priority |
|-------------|---------|----------|
| `webhook_token` column on `carrier_credentials` | Option B webhook routing | P1 (before multi-org) |
| `carrier_rate_quotes` table | Cache rate calculations | P2 |
| `carrier_pickups` table | Track scheduled pickups | P1 (if using CreatePickup) |

**Status: PASS** — No migration required before Aramex adapter implementation.

---

## 24. Required API Changes

### New Endpoints Needed

| Endpoint | Purpose | Priority |
|----------|---------|----------|
| `POST /v1/shipments/:id/carrier-rate` | Get rate quote before creating | P1 |
| `POST /v1/shipments/:id/schedule-pickup` | Schedule carrier pickup | P1 |
| `POST /v1/shipments/:id/cancel-pickup` | Cancel scheduled pickup | P1 |
| `GET /v1/shipments/:id/tracking` | Get tracking info (poll on demand) | P1 |
| `POST /v1/addresses/validate` | Validate address via carrier | P2 |

### Existing Endpoints to Modify

| Endpoint | Change | Risk |
|----------|--------|------|
| `POST /v1/shipments` | Add `senderAddress.email` to address snapshot | Low |
| `GET /v1/shipments/:id` | Include tracking summary in response | Low |

### Existing Internal APIs (No Change Required)

| Component | Status |
|-----------|--------|
| `ShippingProvider` abstract class | ✅ Sufficient for core operations |
| `ShippingProviderRegistry` | ✅ Supports registering 'aramex' provider |
| `ShippingCarrierWorker` | ✅ Supports all 4 event types |
| `CarrierCredentialsService` | ✅ Supports Aramex credential blob |
| `CarrierConfigurationsService` | ✅ Supports store-level config |

**Status: PASS** — Core API infrastructure is ready. New endpoints are additive.

---

## 25. Required UI Changes

### Not Implementing UI in This Audit

The following UI components will be needed for the Aramex integration:

| Component | Purpose | Priority |
|-----------|---------|----------|
| Carrier credential form (Aramex) | Admin enters 5 Aramex fields | P0 |
| Shipping method carrier binding | Select Aramex service code per method | P0 |
| Shipment tracking view | Show tracking events to merchant/buyer | P1 |
| Label download/print | Download PDF label from shipment detail | P1 |
| Rate quote display | Show Aramex rates at checkout | P1 |
| Address validation feedback | Show validation errors in address form | P2 |
| Pickup scheduling UI | Schedule/cancel Aramex pickup | P2 |

**Status: NOT TESTED** — UI is out of scope for this audit.

---

## 26. Implementation Sequence

### Phase 1: Infrastructure (Prerequisites)

| Step | Task | Depends On |
|------|------|-----------|
| 1.1 | Fix transaction boundary (Part 18) — wrap shipment update + outbox insert in `db.transaction()` | None |
| 1.2 | Implement SOAP HTTP client (`AramexSoapClient`) | None |
| 1.3 | Implement SSRF allowlist for `endpoint_url` | None |
| 1.4 | Add `NonRetryableCarrierError` class for worker | None |
| 1.5 | Add email to `ShippingAddress` or resolve from order data | None |

### Phase 2: Core Adapter

| Step | Task | Depends On |
|------|------|-----------|
| 2.1 | Implement `AramexProvider extends ShippingProvider` | 1.2 |
| 2.2 | Implement `createShipment()` with full field mapping | 1.5 |
| 2.3 | Implement `mapCarrierStatus()` with complete status table | None |
| 2.4 | Implement `getTrackingInfo()` via TrackShipments | 2.1 |
| 2.5 | Implement `generateLabel()` — download + store PDF | 2.2 |
| 2.6 | Implement `cancelShipment()` — CancelPickup + graceful fallback | 2.1 |
| 2.7 | Implement `validateAddress()` | 2.1 |
| 2.8 | Register `AramexProvider` in `ShippingProviderRegistry` | 2.1 |

### Phase 3: Webhook / Polling

| Step | Task | Depends On |
|------|------|-----------|
| 3.1 | Implement `shipping.carrier.track` handler in worker | 2.4 |
| 3.2 | Configure polling interval for active shipments | 3.1 |
| 3.3 | (Optional) Integrate third-party webhook relay | 1.3 |

### Phase 4: Testing

| Step | Task | Depends On |
|------|------|-----------|
| 4.1 | Sandbox integration tests (28 test cases from Part 22) | 2.x |
| 4.2 | PostgreSQL integration tests for adapter | 2.x |
| 4.3 | Load testing for rate limit validation | 4.1 |

### Phase 5: Production Readiness

| Step | Task | Depends On |
|------|------|-----------|
| 5.1 | Obtain production Aramex credentials | 4.1 |
| 5.2 | Configure production `carrier_credentials` | 5.1 |
| 5.3 | Set up monitoring/alerting (metrics from Part 21) | 4.1 |
| 5.4 | Run production smoke test (single shipment) | 5.2 |

---

## 27. Risks

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|-----------|------------|
| R1 | SOAP API complexity — XML parsing, namespace handling | MEDIUM | HIGH | Use well-tested SOAP client library; thorough sandbox testing |
| R2 | Aramex sandbox not available or limited | MEDIUM | MEDIUM | Obtain sandbox credentials early; verify before implementation |
| R3 | No native webhooks — status updates delayed | MEDIUM | HIGH | Implement polling; add third-party relay when available |
| R4 | Rate limits undocumented | LOW | MEDIUM | Conservative defaults (60 req/min); confirm with Aramex |
| R5 | Transaction boundary crash (Part 18) | MEDIUM | LOW | Fix before first carrier (recommended) |
| R6 | Email not in ShippingAddress | LOW | HIGH | Resolve from order/buyer data in adapter |
| R7 | Unit conversion errors (grams→KG, minor→major) | MEDIUM | MEDIUM | Explicit conversion functions with tests |
| R8 | SSRF via endpoint_url | HIGH | LOW | Allowlist implementation before adapter goes live |
| R9 | Multi-org webhook routing | LOW | LOW (first carrier) | Fix before second org onboards |
| R10 | Aramex credential rotation downtime | LOW | LOW | Document rotation procedure; test in sandbox first |
| R11 | Label URL expiration | LOW | MEDIUM | Download and persist labels at creation time |
| R12 | CancelPickup limitations | MEDIUM | HIGH | Clear documentation to merchants; graceful fallback |

---

## 28. GO / NO-GO Decision

### Prerequisites for GO

| # | Prerequisite | Status | Owner |
|---|-------------|--------|-------|
| 1 | Transaction boundary fix (Part 18) | **DECISION REQUIRED** | Engineering |
| 2 | Aramex sandbox credentials obtained | **NOT TESTED** | Aramex integration team |
| 3 | SOAP client infrastructure built | **NOT TESTED** | Engineering |
| 4 | SSRF allowlist for endpoint_url | **NOT TESTED** | Engineering |
| 5 | Email resolution for Aramex Consignee.Email | **DECISION REQUIRED** | Engineering |
| 6 | Rate limit values confirmed with Aramex | **DECISION REQUIRED** | Aramex integration team |

### Decision: **CONDITIONAL GO**

**Conditions:**
1. ✅ M7.2.3-A carrier foundation is PASS — all infrastructure ready
2. ✅ Schema supports Aramex without modification
3. ✅ Provider interface is sufficient for core operations
4. ✅ Security model (encryption, HMAC, RBAC) is sound
5. ⚠️ Transaction boundary must be fixed or formally accepted with reconciliation plan
6. ⚠️ Aramex sandbox credentials must be obtained before implementation begins
7. ⚠️ SOAP client must be built and tested
8. ⚠️ Email gap must be resolved (source from order data or extend ShippingAddress)

**GO verdict:** Proceed to implementation planning once all 6 prerequisites are satisfied.

**NO-GO triggers (stop and reassess if):**
- Aramex cannot provide sandbox credentials within 2 weeks
- Aramex rate limits are too restrictive for production traffic
- SOAP API does not support required operations (verified via sandbox)
- Transaction boundary fix is blocked by architectural constraints

---

## Appendix A: Aramex Service Code Quick Reference

| Code | Name | Group | Use Case |
|------|------|-------|----------|
| CDS | Domestic Outbound | DOM | Within same country (sender origin) |
| RTC | Domestic Inbound | DOM | Within same country (return) |
| EPX | International Outbound | EXP | Cross-border express |
| PDX | Priority Document Express | EXP | Documents, international |
| PPX | Priority Parcel Express | EXP | Parcels, international (default) |
| PLX | Priority Letter Express | EXP | Letters, international |
| DDX | Deferred Document Express | EXP | Documents, slower/cheaper |
| DPX | Deferred Parcel Express | EXP | Parcels, slower/cheaper |
| GDX | Ground Document Express | DOM/EXP | Documents, ground transport |
| GPX | Ground Parcel Express | DOM/EXP | Parcels, ground transport (default domestic) |

## Appendix B: Aramex Tracking Code Quick Reference

| Code | Description | Mapped Status |
|------|-------------|---------------|
| SH001 | Picked up from shipper | PICKED_UP |
| SH002 | Arrived at facility | IN_TRANSIT |
| SH003 | Out for delivery | OUT_FOR_DELIVERY |
| SH004 | Delivered | DELIVERED |
| SH005 | Delivered (alternate code) | DELIVERED |
| SH006 | Return to origin | RETURNED |
| SH007 | Held at facility | EXCEPTION |
| SH008 | Customs clearance | IN_TRANSIT |
| SH009 | Delayed | EXCEPTION |
| SH010 | Lost | LOST |
| SH011 | Damaged | DAMAGED |
| SH012 | Cancelled | CANCELLED |
| SH013 | Rejected by consignee | RETURNED |
| SH014 | Record created | LABEL_CREATED |
| SH160 | Under processing at facility | IN_TRANSIT |

## Appendix C: Aramex Problem Codes

| Code | Meaning | Action |
|------|---------|--------|
| (empty) | No problem | Normal processing |
| V01 | Volume discrepancy | Log warning; continue tracking |
| W01 | Weight discrepancy | Log warning; continue tracking |
| A01 | Address issue | Notify merchant; may delay delivery |
| C01 | Customs hold | Notify merchant; customs clearance in progress |

---

**END OF AUDIT**

**STOP.** No production code modified. No migrations created. No carrier adapters implemented. No UI added. Awaiting review and prerequisite resolution before proceeding to implementation.
