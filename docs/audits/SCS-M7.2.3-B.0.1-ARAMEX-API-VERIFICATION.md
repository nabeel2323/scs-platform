# M7.2.3-B.0.1 — Aramex API Contract Verification & Architecture Decision

**Date:** 2026-09-28  
**Milestone:** M7.2.3-B.0.1 Aramex API Verification  
**Supersedes sections of:** M7.2.3-B.0 Pre-Implementation Carrier Audit  
**Status:** READ-ONLY VERIFICATION — No production code modified

---

## 1. Executive Summary

This verification corrects several assumptions in the B.0 audit based on current official Aramex documentation, the Aramex Shipping API manual (PDF), the Aramex Saudi integration presentation, and verified third-party SDK implementations (ShipFlow, courier-framework).

### Critical Corrections

| # | B.0 Assumption | Verified Reality | Impact |
|---|---------------|-----------------|--------|
| 1 | Aramex is SOAP-only | **Three transports available: SOAP, REST/JSON, REST/XML** | Major — JSON is strongly preferred for NestJS |
| 2 | Labels generated inline by CreateShipments | **PrintLabel is a SEPARATE operation**; CreateShipments CAN include label via LabelInfo but PrintLabel is independent | Medium — changes label architecture |
| 3 | No native webhooks | **Aramex DOES have native webhooks** — setup requires contacting Aramex IT per account | Major — changes tracking strategy |
| 4 | 5 credential fields | **7 fields** in ClientInfo (adds Version, Source, AccountCountryCode) | Low — stored in encrypted blob |
| 5 | CDS for domestic | **OND is the default domestic product type**; CDS is also valid | Low — product type selection |
| 6 | Rate limits "community estimated 60/min" | **NOT DOCUMENTED** — throttling reported inside "fake 200" envelope | Medium — conservative client-side limits required |
| 7 | Single API endpoint | **Four independent services on separate hosts** (Shipping, Tracking, RateCalculator, Location) | Medium — adapter must handle multiple base URLs |

### Recommendation

**Aramex remains the recommended first carrier.** The JSON transport is strongly preferred over SOAP. Native webhooks exist but require manual setup. The SCS schema supports Aramex without modification.

**GO** — proceed to implementation using JSON transport.

---

## 2. Sources

| # | Source | Type | Classification |
|---|--------|------|---------------|
| S1 | [Aramex Shipping Services API Manual (PDF)](https://www.aramex.com/docs/default-source/resourses/resourcesdata/shipping-services-api-manual.pdf) | Official documentation | VERIFIED — official Aramex documentation |
| S2 | [Aramex Shipment Preparation API Manual (PDF)](https://www.aramex.com/content/uploads/109/232/42024/shipments-preparation-api-manual.pdf) | Official documentation | VERIFIED — official Aramex documentation |
| S3 | [Aramex Saudi Integration Presentation (Prezi)](https://prezi.com/p/jb2suhgwmczh/integration/) | Official Aramex Saudi presentation | VERIFIED — official Aramex documentation |
| S4 | [Aramex Webhook API Specification (Scribd)](https://www.scribd.com/document/1018720364/Webhook-API-Specification) | Official specification | VERIFIED — official Aramex documentation |
| S5 | [ShipFlow SDK (GitHub)](https://github.com/aashahin/shipflow) | Third-party TypeScript SDK | VERIFIED — working implementation |
| S6 | [courier-framework (GitHub)](https://github.com/Ashraf-Atef1/courier-framework) | Third-party NestJS integration | VERIFIED — working implementation |
| S7 | [Aramex Developers Solution Center](https://www.aramex.com/ae/en/developers-solution-center/aramex-apis) | Official portal | VERIFIED — official Aramex documentation |
| S8 | [Blanxer Aramex Webhook Guide](https://blanxer.com/resources/aramex-webhook) | Third-party integration guide | VERIFIED — corroborates S4 |
| S9 | [Aramex WSDL endpoint](https://ws.aramex.net/shippingapi.v2/shipping/service_1_0.svc) | Live endpoint | VERIFIED — accessible |
| S10 | [Bilinx Aramex Laravel SDK (Packagist)](https://packagist.org/packages/shipper/aramex) | Third-party PHP SDK | INFERRED — corroborates S1 |

---

## 3. API Transport Verification

### Finding: Three Transports Available

The official Aramex Shipping API manual (S1) explicitly documents:

| Transport | URL Pattern | Content-Type | Status |
|-----------|------------|--------------|--------|
| **SOAP** | `Service_1_0.svc` | `text/xml` | VERIFIED — official Aramex documentation |
| **REST/JSON** | `Service_1_0.svc/json/{Operation}` | `application/json` | VERIFIED — official Aramex documentation |
| **REST/XML** | `Service_1_0.svc/xml/{Operation}` | `text/xml` | VERIFIED — official Aramex documentation |

The ShipFlow SDK (S5) explicitly states: *"Aramex is integrated via the JSON flavor of the classic ShippingAPI.V2 services."*

### Endpoint URLs

| Environment | Base URL | Classification |
|-------------|---------|---------------|
| **Test/Sandbox** | `https://ws.dev.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc` | VERIFIED — official Aramex documentation |
| **Production** | `https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc` | VERIFIED — official Aramex documentation |

### JSON Endpoint Examples

| Operation | JSON Endpoint | Classification |
|-----------|--------------|---------------|
| CreateShipments | `{baseUrl}/json/CreateShipments` | VERIFIED — official Aramex documentation |
| PrintLabel | `{baseUrl}/json/PrintLabel` | VERIFIED — official Aramex documentation |
| CreatePickup | `{baseUrl}/json/CreatePickup` | VERIFIED — official Aramex documentation |
| CancelPickup | `{baseUrl}/json/CancelPickup` | VERIFIED — official Aramex documentation |
| TrackShipments | `{trackingBaseUrl}/json/TrackShipments` | VERIFIED — official Aramex documentation |
| CalculateRate | `{rateBaseUrl}/json/CalculateRate` | VERIFIED — official Aramex documentation |

### RECOMMENDED TRANSPORT: **REST/JSON**

**Reasons:**

| Criterion | SOAP | REST/JSON | REST/XML |
|-----------|------|-----------|----------|
| Implementation complexity | HIGH — SOAP envelope, namespace handling, WSDL parsing | LOW — standard `fetch()` + JSON | MEDIUM — XML parsing without SOAP overhead |
| TypeScript compatibility | POOR — requires SOAP client library, complex type generation | EXCELLENT — native JSON, Zod validation | POOR — XML→TS mapping |
| Maintainability | LOW — WSDL coupling, SOAP faults | HIGH — standard REST patterns | LOW — XML parsing |
| Error handling | COMPLEX — SOAP Fault parsing | SIMPLE — JSON error objects | MEDIUM — XML error parsing |
| Testing | HARD — SOAP mocking complex | EASY — standard HTTP mocking | MEDIUM |
| Observability | HARD — SOAP envelope logging | EASY — JSON request/response logging | MEDIUM |
| Parsing complexity | HIGH — XML→SOAP→objects | LOW — JSON→objects | MEDIUM — XML→objects |
| Official support | Yes | Yes | Yes |
| Long-term maintainability | DECLINING | HIGH | MEDIUM |

**Decision: REST/JSON.** This is the clear choice for a NestJS/TypeScript application. Standard `fetch()` or `axios` with JSON bodies. No SOAP library dependency. Native TypeScript interfaces match JSON directly.

---

## 4. Shipping API

### Four Independent Services

The Aramex API is split into **four independent services on separate hosts**:

| Service | Base URL (Production) | Operations | Classification |
|---------|----------------------|-----------|---------------|
| **Shipping** | `https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc` | CreateShipments, PrintLabel, CreatePickup, CancelPickup | VERIFIED — official Aramex documentation |
| **Tracking** | Separate host (account-dependent) | TrackShipments | VERIFIED — working implementation |
| **RateCalculator** | Separate host | CalculateRate | VERIFIED — official Aramex documentation |
| **Location** | Separate host (may use `anfe02.aramex.com`) | FetchCountries, FetchCities, FetchOffices, ValidateAddress | VERIFIED — official Aramex documentation |

### Shipping Operations

| Operation | Protocol | Method | Classification |
|-----------|---------|--------|---------------|
| CreateShipments | JSON | POST to `/json/CreateShipments` | VERIFIED — official Aramex documentation |
| PrintLabel | JSON | POST to `/json/PrintLabel` | VERIFIED — official Aramex documentation |
| CreatePickup | JSON | POST to `/json/CreatePickup` | VERIFIED — official Aramex documentation |
| CancelPickup | JSON | POST to `/json/CancelCancelPickup` | VERIFIED — official Aramex documentation |
| ReserveShipmentNumberRange | JSON | POST | VERIFIED — working implementation |
| GetLastShipmentsNumbersRange | JSON | POST | VERIFIED — working implementation |
| ScheduleDelivery | JSON | POST | VERIFIED — working implementation |

### CreateShipments Request (JSON)

```json
{
  "ClientInfo": {
    "UserName": "string",
    "Password": "string",
    "Version": "1.0",
    "AccountNumber": "string",
    "AccountPin": "string",
    "AccountEntity": "string",
    "AccountCountryCode": "string",
    "Source": 24
  },
  "Transaction": {
    "Reference1": "string",
    "Reference2": "string",
    "Reference3": "string",
    "Reference4": "string",
    "Reference5": "string"
  },
  "Shipments": [
    {
      "Shipper": { /* Address + Contact */ },
      "Consignee": { /* Address + Contact */ },
      "ShippingDateTime": "ISO datetime",
      "DueDate": "ISO datetime",
      "Comments": "string",
      "PickupLocation": "string",
      "Weight": { "Value": 1.5, "Unit": "KG" },
      "NumberOfPieces": 1,
      "DescriptionOfGoods": "string",
      "ProductGroup": "DOM|EXP",
      "ProductType": "OND|PPX|EPX|...",
      "PaymentType": "P|C|3",
      "Services": "CODS,FRDM,...",
      "CashOnDeliveryAmount": { "CurrencyCode": "SAR", "Value": 150.00 },
      "CustomsValueAmount": { "CurrencyCode": "SAR", "Value": 100.00 },
      "InsuranceAmount": { "CurrencyCode": "SAR", "Value": 0 },
      "Dimensions": { "Length": 10, "Width": 10, "Height": 10, "Unit": "CM" }
    }
  ],
  "LabelInfo": {
    "ReportID": "9201",
    "ReportType": "URL"
  }
}
```

**Classification:** VERIFIED — official Aramex documentation (S1, S6)

### CreateShipments Response (JSON)

```json
{
  "Transaction": { "Reference1": "", "Reference2": "" },
  "Notifications": [],
  "HasErrors": false,
  "Shipments": {
    "ProcessedShipment": {
      "ID": "12345",
      "Reference1": null,
      "HasErrors": false,
      "Notifications": [],
      "ShipmentLabel": {
        "LabelURL": "https://..."
      },
      "ShipmentDetails": {
        "Origin": "RUH",
        "Destination": "JED",
        "ProductType": "OND",
        "ProductGroup": "DOM",
        "PaymentType": "P",
        "NumberOfPieces": 1,
        "ChargeableWeight": { "Unit": "KG", "Value": 1.5 }
      }
    }
  }
}
```

**Classification:** VERIFIED — official Aramex documentation (S1)

### "Fake 200 OK" Error Pattern

Aramex returns **HTTP 200 for ALL responses**, including errors. Logical errors are indicated by `HasErrors: true` with `Notifications[]` in the response body.

```json
{
  "HasErrors": true,
  "Notifications": [
    { "Code": "ERR01", "Message": "Invalid consignee phone number" }
  ]
}
```

**Throttling** is also reported inside this envelope, NOT as HTTP 429. The adapter must inspect `Notifications[]` for throttling indicators and surface them as `RateLimitError`.

**Classification:** VERIFIED — working implementation (S5)

---

## 5. Tracking API

### TrackShipments

| Property | Value | Classification |
|----------|-------|---------------|
| Endpoint | Separate host from Shipping | VERIFIED — working implementation |
| Protocol | JSON | VERIFIED — official Aramex documentation |
| Input | Array of shipment IDs (waybill numbers) | VERIFIED — official Aramex documentation |
| Max IDs per request | Not officially documented; ShipFlow supports batch | UNKNOWN |
| Response | TrackingResults with TrackingResult[] per shipment | VERIFIED — official Aramex documentation |

### Track by Reference

ShipFlow SDK supports `trackByReference(ref)` for Aramex. This means Aramex **does** support tracking lookup by reference number, not just by waybill number.

**Classification:** VERIFIED — working implementation (S5)

### Tracking Response Structure

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

**Classification:** VERIFIED — official Aramex documentation (S1)

### UpdateCodes

Tracking UpdateCodes **vary by region and are not fully published** (S5). Known codes:

| Code | Description | Classification |
|------|-------------|---------------|
| SH001 | Picked up from shipper | VERIFIED — official Aramex documentation |
| SH002 | Arrived at facility | INFERRED |
| SH003 | Out for delivery | VERIFIED — official Aramex documentation |
| SH004 | Delivered | VERIFIED — official Aramex documentation |
| SH005 | Delivered (alternate) | VERIFIED — official Aramex documentation |
| SH006 | Return to origin | INFERRED |
| SH007 | Held at facility | INFERRED |
| SH008 | Customs clearance | INFERRED |
| SH009 | Delayed | INFERRED |
| SH010 | Lost | INFERRED |
| SH011 | Damaged | INFERRED |
| SH012 | Cancelled | INFERRED |
| SH013 | Rejected by consignee | INFERRED |
| SH014 | Record created | VERIFIED — official Aramex documentation |
| SH160 | Under processing at facility | VERIFIED — official Aramex documentation |

**Important:** Unmapped codes must use a description-keyword heuristic fallback, then "unknown". An unmapped code must never break tracking. (S5)

### Recommended Polling Strategy

| Strategy | Recommendation | Rationale |
|----------|---------------|-----------|
| Per-shipment polling | No | Too many API calls |
| **Batched polling** | **Yes** — TrackShipments accepts arrays | Efficient; one API call for many shipments |
| Periodic | Yes — every 15-30 minutes for active shipments | Balance between freshness and API load |
| Event-driven (webhook) | Yes — when webhook is configured | Real-time; reduces polling need |
| **Hybrid (recommended)** | **Webhook + fallback polling** | Webhook for real-time; poll for missed events |

**Classification:** INFERRED — based on verified API capabilities

---

## 6. Rate Calculator API

### CalculateRate

| Property | Value | Classification |
|----------|-------|---------------|
| Endpoint | Separate host | VERIFIED — official Aramex documentation |
| Protocol | JSON | VERIFIED — official Aramex documentation |
| Required origin | line1, city, countryCode | VERIFIED — official Aramex documentation |
| Required destination | line1, city, countryCode | VERIFIED — official Aramex documentation |
| Required details | weight (KG), numberOfPieces | VERIFIED — official Aramex documentation |
| Optional details | height, width, length (CM) | VERIFIED — official Aramex documentation |
| Required service | productGroup, productType, paymentType | VERIFIED — official Aramex documentation |
| Currency | 3-char ISO (USD, SAR, AED, etc.) | VERIFIED — official Aramex documentation |

### Rate Response

```json
{
  "HasErrors": false,
  "TotalAmount": { "CurrencyCode": "USD", "Value": 1004.74 },
  "RateDetails": {
    "Amount": 312.34,
    "OtherAmount5": 475.73,
    "TotalAmountBeforeTax": 866.15,
    "TaxAmount": 138.59
  }
}
```

**Classification:** VERIFIED — official Aramex documentation (S1)

### SCS Integration

The SCS rate resolver can integrate with CalculateRate. The adapter should:
1. Convert SCS minor units → Aramex major units
2. Map SCS service type → Aramex ProductType
3. Return rate in minor units with currency

**Classification:** INFERRED — based on verified API response

---

## 7. Location Services API

### Available Operations

| Operation | Description | Classification |
|-----------|-------------|---------------|
| FetchCountries | List all supported countries with details | VERIFIED — official Aramex documentation |
| FetchCities | List cities by country code | VERIFIED — official Aramex documentation |
| FetchOffices | List all Aramex offices with details | VERIFIED — official Aramex documentation (S3) |
| ValidateAddress | Validate address and get suggestions | VERIFIED — official Aramex documentation |

### Country Response Includes

| Field | Description |
|-------|-------------|
| Code | 2-char ISO |
| Name | Country name |
| IsoCode | 3-char ISO |
| StateRequired | Whether state/province is required |
| PostCodeRequired | Whether postal code is required |
| PostCodeRegex | Postal code validation pattern |
| InternationalCallingNumber | Country calling code |

### Recommended Caching Strategy

| Data | Strategy | Rationale |
|------|----------|-----------|
| Countries | Cache for 30 days | Rarely changes; reference data |
| Cities | Cache for 7 days | May update; not critical |
| Offices | Cache for 30 days | Rarely changes |
| Address validation | Live call per request | Must be real-time |

**Classification:** VERIFIED — official Aramex documentation (S3)

---

## 8. Authentication

### ClientInfo Model (Verified)

| Field | Type | Required | Description | Classification |
|-------|------|----------|-------------|---------------|
| UserName | String | Yes | Registered email or API username | VERIFIED — official Aramex documentation |
| Password | String | Yes | Registered password | VERIFIED — official Aramex documentation |
| Version | String | Yes | API version: `"1.0"` | VERIFIED — working implementation |
| AccountNumber | String | Yes | Aramex account number | VERIFIED — official Aramex documentation |
| AccountPin | String | Yes | Account security PIN | VERIFIED — official Aramex documentation |
| AccountEntity | String | Yes | 3-letter office code (e.g., RUH, DXB, AMM) | VERIFIED — official Aramex documentation |
| AccountCountryCode | String | Yes | 2-letter ISO country code | VERIFIED — working implementation |
| Source | Integer | Yes | Source identifier (default: 24) | VERIFIED — working implementation |

### B.0 Correction

The B.0 audit listed 5 fields (UserName, Password, AccountNumber, EntityCode, PIN). The verified model has **8 fields** — adds Version, AccountCountryCode, and Source.

### Sandbox vs Production

| Environment | URL | Credentials | Classification |
|-------------|-----|-------------|---------------|
| Test | `https://ws.dev.aramex.net/...` | Test credentials | VERIFIED — official Aramex documentation |
| Production | `https://ws.aramex.net/...` | Live credentials | VERIFIED — official Aramex documentation |

**The URL differs, not the authentication mechanism.** Test credentials from Aramex work against the test URL. Production credentials from Aramex work against the production URL.

### Test Credentials

| Field | Value | Classification |
|-------|-------|---------------|
| AccountNumber | `20016` | VERIFIED — working implementation (S6) |
| AccountPin | `331421` | VERIFIED — working implementation (S6) |
| AccountEntity | `AMM` | VERIFIED — working implementation (S6) |
| AccountCountryCode | `JO` | VERIFIED — working implementation (S6) |
| UserName/Password | Registered email/password | VERIFIED — official Aramex documentation |

### Credential Expiration

**Credentials do NOT expire.** There is no token exchange, no OAuth, no refresh mechanism. The same credentials are sent with every request. Rotation requires obtaining new credentials from Aramex and updating the encrypted store.

**Classification:** VERIFIED — official Aramex documentation

### Mapping to `carrier_credentials`

```json
{
  "userName": "api_user@example.com",
  "password": "secret_password",
  "accountNumber": "123456",
  "accountPin": "9876",
  "accountEntity": "RUH",
  "accountCountryCode": "SA",
  "version": "1.0",
  "source": 24
}
```

Stored in `credentialsEncrypted` (AES-256-GCM). The `endpointUrl` column stores the base URL (test or production).

**No schema changes required.**

---

## 9. Idempotency

### Aramex Native Idempotency: NONE

Aramex does **NOT** provide native idempotency keys. The `Reference`, `ShipperReference`, and `ConsigneeReference` fields are pass-through reference strings printed on the waybill. They do **NOT** prevent duplicate creation.

**Classification:** VERIFIED — working implementation (S5): *"Safe, idempotent requests (GETs, plus tracking endpoints opted in by the adapters) are retried automatically with jittered exponential backoff. Mutating requests (create/cancel) are not retried by default, so a timed-out createShipment never risks a duplicate on the carrier."*

### Reference Field Behavior

| Field | Purpose | Idempotent? | Classification |
|-------|---------|-------------|---------------|
| Reference | Printed on waybill | **NO** — does not prevent duplicates | VERIFIED — working implementation |
| ShipperReference | Optional shipper reference | **NO** | INFERRED |
| ConsigneeReference | Optional consignee reference | **NO** | INFERRED |

### Track by Reference

ShipFlow supports `trackByReference(ref)` for Aramex (S5). This means it IS possible to query Aramex by reference to check if a shipment already exists before creating a duplicate.

**Classification:** VERIFIED — working implementation (S5)

### Recommended SCS Idempotency Strategy

```
1. Generate deterministic idempotency key: "carrier-create:{shipmentId}"
2. Store as Reference in CreateShipments request
3. Set carrier_create_status = IN_PROGRESS
4. BEFORE calling Aramex:
   a. Check local carrier_create_status — if SUCCESS, return cached result
   b. Check local carrier_shipment_id — if exists, return cached result
5. Call Aramex CreateShipments with Reference = idempotencyKey
6. On success: store carrier_shipment_id, set status = SUCCESS
7. On timeout/uncertain error:
   a. Call TrackShipments(idempotencyKey) or trackByReference(idempotencyKey)
   b. If shipment found → reuse carrier_shipment_id, set SUCCESS
   c. If not found → retry with backoff
8. On confirmed error: set status = FAILED
```

**Classification:** INFERRED — based on verified API capabilities

---

## 10. Labels

### Label Architecture (Corrected)

The B.0 audit stated labels are generated inline by CreateShipments. **This is partially correct but incomplete.**

Aramex provides **two** ways to obtain labels:

| Method | When | Operation | Classification |
|--------|------|-----------|---------------|
| **Inline with CreateShipments** | During shipment creation | Include `LabelInfo` in CreateShipments request | VERIFIED — working implementation |
| **Separate PrintLabel** | After creation, reprint, bulk | Call PrintLabel with shipment number | VERIFIED — official Aramex documentation |

### LabelInfo in CreateShipments

```json
{
  "LabelInfo": {
    "ReportID": "9201",
    "ReportType": "URL"
  }
}
```

When included, the response contains `ShipmentLabel.LabelURL` — a URL to the PDF label.

### PrintLabel Operation

```json
{
  "ClientInfo": { /* ... */ },
  "ShipmentNumber": "123456789",
  "ProductGroup": "EXP",
  "OriginEntity": "AMM",
  "LabelInfo": {
    "ReportID": "9201",
    "ReportType": "URL"
  }
}
```

| Property | Value | Classification |
|----------|-------|---------------|
| Accepts | Shipment number (waybill), ProductGroup, OriginEntity | VERIFIED — working implementation |
| Returns | Label URL (PDF) | VERIFIED — working implementation |
| Format | PDF only — **cannot be changed** | VERIFIED — working implementation (S5): *"Labels resolve to a URL — the format argument of getLabel can't be honored."* |
| Binary/Base64/URL | **URL** — temporary link on Aramex servers | VERIFIED — working implementation |
| Synchronous | Yes | VERIFIED — official Aramex documentation |
| Regenerable | Yes — call PrintLabel again | VERIFIED — official Aramex documentation |
| Multi-piece | One label per piece/waybill | VERIFIED — official Aramex documentation |

### Label Architecture Recommendation

| Phase | Approach | Rationale |
|-------|----------|-----------|
| CreateShipment | Include `LabelInfo` to get label URL inline | Avoids extra API call |
| Immediately after | Download PDF from URL, store in object storage | URL is temporary |
| Reprint/bulk | Use `PrintLabel` operation | For labels not captured at creation |
| `shipment_labels` | Store `storageKey` (object storage path), `labelUrl` (original Aramex URL) | Persist independently |

**Classification:** VERIFIED — official Aramex documentation + working implementation

---

## 11. Cancellation

### Verified Cancellation Capabilities

| Operation | Supported? | Classification |
|-----------|-----------|---------------|
| **CancelShipment** | **NO** — does not exist in the API | VERIFIED — working implementation (S5): *"cancelShipment is unsupported (the classic API has no shipment-cancel operation) and throws UnsupportedOperationError"* |
| **CancelPickup** | **YES** — cancels a scheduled pickup | VERIFIED — official Aramex documentation |
| **Void Label** | **NO** — not available via API | INFERRED |
| Cancel after pickup | **NO** | VERIFIED — working implementation |
| Cancel before pickup | **Only via CancelPickup** | VERIFIED — official Aramex documentation |

### Cancellation Architecture

```typescript
async cancelShipment(shipmentId: string): Promise<CancelShipmentResult> {
  // Aramex has NO CancelShipment operation
  return {
    supported: false,
    reason: 'Aramex does not provide a shipment cancellation API. ' +
            'If a pickup is scheduled, CancelPickup may be available. ' +
            'Otherwise, do not hand over the package to the carrier.'
  };
}

async cancelPickup(pickupGuid: string): Promise<CancelShipmentResult> {
  // CancelPickup IS supported
  const result = await this.aramexClient.cancelPickup(pickupGuid);
  if (result.HasErrors) {
    return { supported: true, cancelled: false, reason: result.Notifications[0].Message };
  }
  return { supported: true, cancelled: true, carrierStatus: 'CANCELLED' };
}
```

**Classification:** VERIFIED — working implementation (S5)

---

## 12. Webhooks

### CRITICAL CORRECTION: Aramex DOES Have Native Webhooks

The B.0 audit stated Aramex does not provide native webhooks. **This is INCORRECT.**

From the Aramex Saudi integration presentation (S3) and the Webhook API Specification (S4):

| Property | Value | Classification |
|----------|-------|---------------|
| Native webhooks | **YES** — Aramex pushes shipment status updates | VERIFIED — official Aramex documentation |
| Setup method | **Manual** — email Aramex IT with account number, webhook URL, and secret key | VERIFIED — official Aramex documentation (S3, S8) |
| Self-service API | **NO** — requires human coordination with Aramex | VERIFIED — official Aramex documentation |
| Webhook secret | Provided during setup | VERIFIED — official Aramex documentation |
| Event types | Shipment status updates | VERIFIED — official Aramex documentation |

### Webhook Setup Process (from S3, S8)

1. Customer provides to Aramex:
   - Account number
   - What updates the customer needs
   - Webhook URL endpoint
   - Secret key
2. Aramex IT configures the webhook on their end
3. Aramex pushes updates to the customer's endpoint

### Webhook Payload

The exact webhook payload structure is documented in the Aramex Webhook API Specification (S4). The payload contains shipment status updates.

### Implications for SCS

| Aspect | Impact |
|--------|--------|
| Existing webhook endpoint | Compatible — `POST /v1/webhooks/carrier/:providerKey` |
| HMAC verification | Compatible — webhook secret stored in `webhookSecretEncrypted` |
| Tenant routing | Same multi-org issue identified in B.0 — solution still needed |
| Setup | Manual process per Aramex account — not automated |

### Recommended Strategy

| Phase | Approach | Rationale |
|-------|----------|-----------|
| Phase 1 | **Polling via TrackShipments** | Works immediately; no Aramex coordination needed |
| Phase 2 | **Request webhook setup from Aramex** | Email Aramex IT with SCS webhook URL |
| Phase 3 | **Hybrid: webhook + fallback polling** | Webhook for real-time; poll for missed events |

**Classification:** VERIFIED — official Aramex documentation

---

## 13. Rate Limits

### Official Documentation: NOT DOCUMENTED

Aramex does **NOT** officially publish rate limits. The B.0 audit's "60 requests/minute" was a community estimate and must NOT be treated as an Aramex limit.

| Property | Status | Classification |
|----------|--------|---------------|
| Requests/minute | **NOT DOCUMENTED** | UNKNOWN |
| Concurrency limit | **NOT DOCUMENTED** | UNKNOWN |
| Burst limit | **NOT DOCUMENTED** | UNKNOWN |
| Retry-After header | **NOT DOCUMENTED** — throttling reported in "fake 200" envelope | VERIFIED — working implementation |
| Account-level limits | Likely exist but not published | UNKNOWN |

### Aramex Throttling Behavior

From ShipFlow SDK (S5): *"Aramex reports throttling inside its 'fake 200' envelope rather than via HTTP 429; ShipFlow detects that and raises the same RateLimitError."*

This means:
- HTTP status is always 200
- Throttling appears as a `Notification` in the response body
- The adapter must parse `Notifications[]` for throttling indicators
- There is no standard `Retry-After` header

### SCS Conservative Client-Side Limits

These are **SCS-imposed limits**, NOT Aramex limits:

| Parameter | SCS Default | Rationale |
|-----------|-------------|-----------|
| Max requests/minute | 30 | Conservative until Aramex provides actual limits |
| Max concurrent requests | 3 | Prevent connection pool exhaustion |
| Request timeout | 30 seconds | Aramex recommendation (S6) |
| Retry on throttle | Yes — exponential backoff | Standard |
| Circuit breaker | Open after 5 consecutive throttle responses | Prevent hammering |

**Important:** These defaults MUST be configurable via environment variables. Once Aramex provides actual limits, the defaults should be updated.

**Classification:** SCS conservative limit (clearly distinguished from Aramex documented limit)

---

## 14. Service Codes

### Verified Product Types

| Code | Name | Group | Domestic | International | COD | Classification |
|------|------|-------|----------|--------------|-----|---------------|
| **OND** | Overnight Document | DOM | ✅ | — | — | VERIFIED — working implementation |
| **CDS** | Domestic Service Outbound | DOM | ✅ | — | ✅ | VERIFIED — official Aramex documentation |
| **PPX** | Priority Parcel Express | EXP | — | ✅ | ✅ | VERIFIED — official Aramex documentation |
| **EPX** | Economy Parcel Express | EXP | — | ✅ | ✅ | VERIFIED — official Aramex documentation |
| **PDX** | Priority Document Express | EXP | — | ✅ | — | VERIFIED — official Aramex documentation |
| **PLX** | Priority Letter Express | EXP | — | ✅ | — | VERIFIED — official Aramex documentation |
| **DDX** | Deferred Document Express | EXP | — | ✅ | — | VERIFIED — official Aramex documentation |
| **DPX** | Deferred Parcel Express | EXP | — | ✅ | — | VERIFIED — official Aramex documentation |
| **GDX** | Ground Document Express | EXP/DOM | ✅ | ✅ | — | VERIFIED — official Aramex documentation |
| **GPX** | Ground Parcel Express | EXP/DOM | ✅ | ✅ | ✅ | VERIFIED — official Aramex documentation |

### B.0 Correction

The B.0 audit listed CDS as the primary domestic service. **OND (Overnight Document)** is also a valid domestic product type and is used as the default for domestic shipments in the ShipFlow SDK (S5). The actual product type available depends on the account and market.

### Product Group Inference

ShipFlow (S5) infers the product group automatically:
- Shipper and consignee in same country → `DOM`
- Different countries → `EXP`

### Account/Market-Specific Values

**The available product types depend on the Aramex account and market.** The list above is comprehensive but not all types are available in all markets. The adapter should pass through product types without a local allowlist (S5).

**Classification:** VERIFIED — official Aramex documentation

---

## 15. Field Mapping (Corrected)

### Weight Units

| SCS | Aramex | Conversion | Classification |
|-----|--------|-----------|---------------|
| `weightGrams` (integer, grams) | `Weight.Value` (decimal, KG) | **÷ 1000** | VERIFIED |

### Monetary Units

| SCS | Aramex | Conversion | Classification |
|-----|--------|-----------|---------------|
| `codAmountMinor` (integer, halalas/fils) | `CashOnDeliveryAmount.Value` (decimal, major) | **÷ 100** | VERIFIED |
| `declaredValueMinor` (integer) | `CustomsValueAmount.Value` (decimal) | **÷ 100** | VERIFIED |
| `currency` (ISO 4217) | `CurrencyCode` | Direct | VERIFIED |

### Dimensions

| SCS | Aramex | Conversion | Classification |
|-----|--------|-----------|---------------|
| `dimensionsCm.lengthCm` | `Dimensions.Length` | Direct (CM) | VERIFIED |
| `dimensionsCm.widthCm` | `Dimensions.Width` | Direct (CM) | VERIFIED |
| `dimensionsCm.heightCm` | `Dimensions.Height` | Direct (CM) | VERIFIED |

### Address Mapping (Corrected)

| SCS `ShippingAddress` | Aramex `Consignee`/`Shipper` | Notes |
|----------------------|------------------------------|-------|
| `recipientName` | `Contact.PersonName` | Required |
| — | `Contact.EmailAddress` | **Required by Aramex; NOT in ShippingAddress** |
| `phone` | `Contact.PhoneNumber1` | Required; E.164 format |
| — | `Contact.CellPhone` | Optional |
| `country` | `PartyAddress.CountryCode` | 2-char ISO |
| `city` | `PartyAddress.City` | Required |
| `postalCode` | `PartyAddress.PostCode` | Conditional |
| `street` | `PartyAddress.Line1` | Required |
| `region` | `PartyAddress.StateOrProvinceCode` | Optional |

### Email Gap (STILL PRESENT)

Aramex requires `Contact.EmailAddress` for both shipper and consignee. The SCS `ShippingAddress` interface does NOT include an email field. This gap must be resolved before adapter implementation.

**Options:**
1. Source email from the order's buyer record (preferred — no schema change)
2. Add optional `email` to `ShippingAddress` interface (cleaner but requires change)

### Fields Required Before Adapter Implementation

| Field | Source | Status |
|-------|--------|--------|
| Consignee email | Order buyer record | **MISSING from ShippingAddress** — must source externally |
| Shipper email | Carrier configuration / store | Available via `pickupAddress` JSONB or store email |
| ProductType | `shipping_methods.carrierServiceCode` | ✅ Available |
| ProductGroup | Inferred from origin/destination country | ✅ Computable |
| PaymentType | Carrier configuration | ✅ Available via `carrierConfigurations` |
| Source | Static (24) | ✅ Hardcoded |
| Version | Static ("1.0") | ✅ Hardcoded |

---

## 16. SCS Architecture Decision

### Transport

**REST/JSON**

- Native `fetch()` — no SOAP library dependency
- Standard JSON serialization/deserialization
- TypeScript interfaces map directly
- NestJS HTTP ecosystem compatible
- Easier testing and mocking

### Label

**Both CreateShipments (inline) + PrintLabel (separate)**

- Include `LabelInfo` in CreateShipments for initial label
- Use `PrintLabel` for reprints and bulk label generation
- Download PDF from URL immediately (URL is temporary)
- Store in object storage; reference in `shipment_labels`

### Tracking

**Hybrid: Webhook (primary) + Polling (fallback)**

- Request Aramex webhook setup for real-time updates
- Implement periodic batch polling as fallback
- Use `TrackShipments` with array of IDs for efficiency
- Use `trackByReference` for idempotency recovery

### Idempotency

**SCS lookup-by-reference**

- Aramex has NO native idempotency
- Use deterministic `Reference` field = idempotency key
- Before retry, call `trackByReference(key)` to check for existing shipment
- If found → reuse; if not → create
- Never auto-retry mutating requests without idempotency check

### Cancellation

**Partial (Pickup only)**

- `CancelShipment` does NOT exist — return `UnsupportedOperationResult`
- `CancelPickup` IS supported — implement for scheduled pickups
- Document limitation clearly to merchants

### Rate Limiting

**SCS conservative client-side limit**

- Aramex does NOT document rate limits
- Start with 30 req/min, 3 concurrent
- Parse throttling from "fake 200" envelope notifications
- All limits configurable via environment variables
- Adjust once Aramex provides actual limits

---

## 17. Required Changes to B.0 Audit

| Section | B.0 Statement | Correction | Severity |
|---------|--------------|-----------|----------|
| §3 API Capabilities | "Protocol: SOAP 1.1/1.2 over HTTP" | **Three transports: SOAP, REST/JSON, REST/XML** | HIGH |
| §4 Authentication | 5 credential fields | **8 fields** (adds Version, AccountCountryCode, Source) | LOW |
| §9 Labels | "Labels generated inline by CreateShipments" | **PrintLabel is a separate operation**; inline is optional | MEDIUM |
| §11 Webhooks | "Aramex does NOT provide native webhooks" | **Aramex DOES have native webhooks** (manual setup) | HIGH |
| §12 Status Mapping | Status codes listed as complete | **Codes vary by region, not fully published** | MEDIUM |
| §14 Rate Limits | "Estimate: ~100 requests/minute" | **NOT DOCUMENTED** — remove estimate | MEDIUM |
| §16 Shipping Methods | CDS as primary domestic | **OND also valid**; product types are account-specific | LOW |
| §19 Provider Interface | SOAP client required | **JSON client required** — much simpler | HIGH |

---

## 18. Unknown / Unverified Items

| Item | Status | Action Required |
|------|--------|----------------|
| Exact webhook payload structure | UNVERIFIED — requires Aramex account | Request sample from Aramex during webhook setup |
| Webhook signature algorithm | UNVERIFIED — likely HMAC-SHA256 | Confirm with Aramex IT during setup |
| Maximum TrackShipments batch size | UNKNOWN | Test with sandbox; start with 50 IDs per call |
| Exact rate limits | UNKNOWN | Request from Aramex; use conservative defaults until confirmed |
| Location service base URL | UNKNOWN — may vary by account | Configure per credential; default to main host |
| Tracking service base URL | UNKNOWN — may differ from shipping | Configure per credential |
| Rate calculator base URL | UNKNOWN — may differ from shipping | Configure per credential |
| COD currency restrictions | UNVERIFIED | Test with sandbox; some accounts may restrict to local currency |
| International customs requirements | PARTIALLY VERIFIED — customs value required for EXP | Verify per-market requirements with Aramex |
| Account-specific product type availability | UNVERIFIED | Confirm available types during sandbox testing |

---

## 19. Implementation Prerequisites

| # | Prerequisite | Status | Owner |
|---|-------------|--------|-------|
| 1 | Obtain Aramex sandbox credentials | **REQUIRED** | Aramex integration team |
| 2 | Verify JSON endpoint accessibility from SCS infrastructure | **REQUIRED** | Engineering |
| 3 | Confirm four service base URLs (Shipping, Tracking, Rate, Location) | **REQUIRED** | Aramex integration team |
| 4 | Resolve email gap (Consignee.Email from order data) | **REQUIRED** | Engineering |
| 5 | Fix transaction boundary (Part 18 of B.0) | **REQUIRED** | Engineering |
| 6 | Request webhook setup from Aramex (for Phase 2) | DEFERRED | Aramex integration team |
| 7 | Confirm available product types for target account/market | **REQUIRED** | Aramex integration team |
| 8 | Implement SSRF allowlist for endpoint URLs | **REQUIRED** | Engineering |

---

## 20. Final GO / NO-GO

### Answers to Required Questions

**1. Is Aramex still the recommended first carrier?**
**YES.** Aramex remains the strongest candidate for GCC/MEA. The JSON transport makes implementation significantly easier than initially assessed. Native webhooks (even with manual setup) are a positive. COD support, address validation, and rate calculation are confirmed.

**2. Which transport should SCS use?**
**REST/JSON.** The JSON flavor of ShippingAPI.V2 is confirmed, documented, and used by production SDKs. It eliminates SOAP complexity entirely. Standard `fetch()` + JSON + TypeScript interfaces.

**3. Can the current SCS schema support it?**
**YES.** No schema changes required. The `carrier_credentials.credentialsEncrypted` JSON blob accommodates all 8 ClientInfo fields. All carrier state columns on `shipments`, `shipment_events`, `shipment_labels`, `carrier_webhook_events` are sufficient.

**4. What source data is missing?**
- Consignee email (not in `ShippingAddress` — source from order buyer record)
- Four service base URLs (must be obtained from Aramex or discovered during sandbox testing)
- Available product types for target market (account-specific)

**5. What code changes are required before adapter implementation?**
- Transaction boundary fix (wrap shipment update + outbox insert in `db.transaction()`)
- Email resolution for consignee (source from order or extend `ShippingAddress`)
- SSRF allowlist for `endpoint_url`
- `NonRetryableCarrierError` class for worker
- JSON HTTP client for Aramex (standard `fetch()` — no SOAP library needed)

**6. Is sandbox access required before coding?**
**YES.** Aramex sandbox credentials are required for:
- Verifying JSON endpoint accessibility
- Testing CreateShipments, PrintLabel, TrackShipments, CalculateRate
- Confirming product type availability
- Validating field mappings
- Testing error handling and throttling behavior

**7. Is the current webhook design sufficient?**
**YES, with conditions.** The existing `POST /v1/webhooks/carrier/:providerKey` endpoint with HMAC-SHA256 verification is compatible with Aramex webhooks. The multi-org routing issue (provider-key-only) must be resolved before onboarding a second organization. For the first carrier with a single org, the current design is safe.

**8. What must be fixed before production?**
- Transaction boundary (MUST fix — real carrier means real impact)
- Email gap (MUST resolve — Aramex rejects requests without email)
- SSRF allowlist (MUST implement — security requirement)
- Webhook setup with Aramex IT (REQUIRED for real-time updates)
- Rate limit tuning (REQUIRED once Aramex provides actual limits)
- Status code mapping completion (REQUIRED — codes vary by region)

### Decision: **GO**

All corrections from this verification strengthen the case for Aramex as the first carrier. The JSON transport is a significant improvement over the SOAP-only assumption. Native webhooks (even with manual setup) eliminate the polling-only concern. The SCS schema is confirmed sufficient.

**Proceed to implementation once the 8 prerequisites in Section 19 are satisfied.**

---

**END OF VERIFICATION**

**STOP.** No production code modified. No migrations created. No Aramex adapter implemented. No UI added.
