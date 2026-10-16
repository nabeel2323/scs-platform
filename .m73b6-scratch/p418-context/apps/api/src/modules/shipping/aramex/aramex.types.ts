/**
 * Aramex Types — M7.2.3-B.2
 *
 * Strongly typed request/response models for the Aramex Shipping API (JSON).
 *
 * Sources:
 *   - B.0.1 Aramex API Verification
 *   - Aramex Shipping API Manual (S1)
 *   - ShipFlow SDK (S5) — working implementation reference
 *
 * All types use PascalCase field names to match the Aramex JSON wire format.
 * Do NOT use `any` for carrier payloads — these types are the contract.
 */

// ── ClientInfo (Authentication) ─────────────────────────────────────────────

/**
 * Aramex ClientInfo — sent in every API request.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexClientInfo {
  UserName: string;
  Password: string;
  Version: string;
  AccountNumber: string;
  AccountPin: string;
  AccountEntity: string;
  AccountCountryCode: string;
  Source: number;
}

/**
 * Decrypted Aramex credential payload.
 * This is the structure stored (encrypted) in carrier_credentials.credentials_encrypted.
 */
export interface AramexCredentialPayload {
  /** Index signature for compatibility with CarrierCredentialPayload. */
  [key: string]: unknown;
  userName: string;
  password: string;
  accountNumber: string;
  accountPin: string;
  accountEntity: string;
  accountCountryCode: string;
  version?: string;   // defaults to '1.0'
  source?: number;    // defaults to 24
  endpoints?: {
    shipping?: string;
    tracking?: string;
    rating?: string;
    location?: string;
  };
}

// ── Transaction ─────────────────────────────────────────────────────────────

/**
 * Aramex Transaction block — reference fields for tracking and idempotency.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexTransaction {
  Reference1?: string;
  Reference2?: string;
  Reference3?: string;
  Reference4?: string;
  Reference5?: string;
}

// ── Address & Contact ───────────────────────────────────────────────────────

/**
 * Aramex address block.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexAddress {
  Line1: string;
  Line2?: string;
  City: string;
  StateOrProvinceCode?: string;
  CountryCode: string;
  PostCode?: string;
}

/**
 * Aramex contact block.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexContact {
  PersonName: string;
  EmailAddress: string;
  PhoneNumber1: string;
  CellPhone?: string;
}

// ── Party (Shipper / Consignee) ─────────────────────────────────────────────

/**
 * Aramex Party block — used for both Shipper and Consignee.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexParty {
  PartyAddress: AramexAddress;
  Contact: AramexContact;
}

// ── Weight, Dimensions, Amount ──────────────────────────────────────────────

/**
 * Aramex weight.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexWeight {
  Value: number;  // decimal, in KG
  Unit: string;   // always 'KG'
}

/**
 * Aramex dimensions.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexDimensions {
  Length: number;
  Width: number;
  Height: number;
  Unit: string;   // always 'CM'
}

/**
 * Aramex monetary amount.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexAmount {
  CurrencyCode: string;  // ISO 4217 (e.g. 'SAR', 'AED', 'USD')
  Value: number;         // decimal, in major units (e.g. 150.00 SAR)
}

// ── Label Info ──────────────────────────────────────────────────────────────

/**
 * Aramex label configuration.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexLabelInfo {
  ReportID: string;   // e.g. '9201'
  ReportType: string; // 'URL' for PDF URL
}

// ── Shipment (CreateShipments request) ──────────────────────────────────────

/**
 * Aramex shipment block for CreateShipments.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexShipment {
  Shipper: AramexParty;
  Consignee: AramexParty;
  ShippingDateTime?: string;   // ISO datetime
  DueDate?: string;            // ISO datetime
  Comments?: string;
  PickupLocation?: string;
  Weight: AramexWeight;
  NumberOfPieces: number;
  DescriptionOfGoods?: string;
  ProductGroup: string;        // 'DOM' | 'EXP'
  ProductType: string;         // 'OND', 'PPX', etc.
  PaymentType: string;         // 'P' | 'C' | '3'
  Services?: string;           // comma-separated: 'CODS,FRDM,...'
  CashOnDeliveryAmount?: AramexAmount;
  CustomsValueAmount?: AramexAmount;
  InsuranceAmount?: AramexAmount;
  Dimensions?: AramexDimensions;
}

// ── CreateShipments Request / Response ──────────────────────────────────────

/**
 * Full CreateShipments request body.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexCreateShipmentsRequest {
  ClientInfo: AramexClientInfo;
  Transaction?: AramexTransaction;
  Shipments: AramexShipment[];
  LabelInfo?: AramexLabelInfo;
}

/**
 * Aramex notification (error or info).
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexNotification {
  Code: string;
  Message: string;
}

/**
 * Processed shipment details in the response.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexProcessedShipment {
  ID: string;
  Reference1?: string | null;
  HasErrors: boolean;
  Notifications: AramexNotification[];
  ShipmentLabel?: {
    LabelURL: string;
  };
  ShipmentDetails?: {
    Origin: string;
    Destination: string;
    ProductType: string;
    ProductGroup: string;
    PaymentType: string;
    NumberOfPieces: number;
    ChargeableWeight?: AramexWeight;
  };
}

/**
 * CreateShipments response body.
 *
 * IMPORTANT: Aramex returns HTTP 200 even for errors.
 * HasErrors + Notifications must be checked.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexCreateShipmentsResponse {
  Transaction?: AramexTransaction;
  Notifications: AramexNotification[];
  HasErrors: boolean;
  Shipments?: {
    ProcessedShipment: AramexProcessedShipment;
  };
}

// ── PrintLabel Request / Response ───────────────────────────────────────────

/**
 * PrintLabel request body.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexPrintLabelRequest {
  ClientInfo: AramexClientInfo;
  ShipmentNumber: string;
  ProductGroup: string;
  OriginEntity: string;
  LabelInfo: AramexLabelInfo;
}

/**
 * PrintLabel response body.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexPrintLabelResponse {
  HasErrors: boolean;
  Notifications: AramexNotification[];
  ShipmentLabel?: {
    LabelURL: string;
  };
}

// ── Tracking Request / Response ─────────────────────────────────────────────

/**
 * TrackShipments request body.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexTrackShipmentsRequest {
  ClientInfo: AramexClientInfo;
  Shipments: string[];  // Array of waybill numbers
}

/**
 * Single tracking result entry.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexTrackingResult {
  WaybillNumber: string;
  UpdateCode: string;
  UpdateDescription: string;
  UpdateDateTime: string;
  UpdateLocation?: string;
  Comments?: string;
  ProblemCode?: string;
  GrossWeight?: string;
  ChargeableWeight?: string;
  WeightUnit?: string;
}

/**
 * TrackShipments response body.
 *
 * The response uses a KeyValue structure where Key = waybill number
 * and Value = array of tracking results.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexTrackShipmentsResponse {
  HasErrors?: boolean;
  Notifications?: AramexNotification[];
  TrackingResults?: {
    KeyValueOfstringArrayOfTrackingResult?: {
      Key: string;
      Value: {
        TrackingResult: AramexTrackingResult[];
      };
    };
  };
  NonExistingWaybills?: {
    string?: string[];
  };
}

// ── CalculateRate Request / Response ────────────────────────────────────────

/**
 * CalculateRate request body.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexCalculateRateRequest {
  ClientInfo: AramexClientInfo;
  Transaction?: AramexTransaction;
  Origin: AramexAddress;
  Destination: AramexAddress;
  Weight: AramexWeight;
  NumberOfPieces?: number;
  Dimensions?: AramexDimensions;
  ProductGroup: string;
  ProductType: string;
  PaymentType: string;
  Currency: string;
}

/**
 * CalculateRate response body.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexCalculateRateResponse {
  HasErrors: boolean;
  Notifications?: AramexNotification[];
  TotalAmount?: AramexAmount;
  RateDetails?: {
    Amount?: number;
    OtherAmount5?: number;
    TotalAmountBeforeTax?: number;
    TaxAmount?: number;
  };
}

// ── Pickup Request / Response ───────────────────────────────────────────────

/**
 * CreatePickup request body.
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export interface AramexCreatePickupRequest {
  ClientInfo: AramexClientInfo;
  Transaction?: AramexTransaction;
  Pickup: {
    PickupAddress: AramexAddress;
    PickupContact: AramexContact;
    PickupLocation?: string;
    PickupDate: string;       // ISO date
    ReadyTime: string;        // ISO datetime
    LastPickupTime?: string;  // ISO datetime
    ClosingTime?: string;     // ISO datetime
    Status?: string;          // 'Ready' | 'Cancelled'
    Reference1?: string;
    Reference2?: string;
    Weight?: AramexWeight;
    NumberOfPieces?: number;
  };
}

/**
 * CreatePickup response body.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexCreatePickupResponse {
  HasErrors: boolean;
  Notifications: AramexNotification[];
  Pickup?: {
    GUID?: string;
    ID?: string;
    Reference?: string;
  };
}

/**
 * CancelPickup request body.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexCancelPickupRequest {
  ClientInfo: AramexClientInfo;
  Transaction?: AramexTransaction;
  PickupGUID: string;
  Comments?: string;
}

/**
 * CancelPickup response body.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexCancelPickupResponse {
  HasErrors: boolean;
  Notifications: AramexNotification[];
}

// ── Location Services ───────────────────────────────────────────────────────

/**
 * FetchCountries response.
 * Classification: VERIFIED — official Aramex documentation (S3).
 */
export interface AramexFetchCountriesResponse {
  HasErrors: boolean;
  Notifications?: AramexNotification[];
  Countries?: AramexCountry[];
}

export interface AramexCountry {
  Code: string;
  Name: string;
  IsoCode?: string;
  StateRequired?: boolean;
  PostCodeRequired?: boolean;
  PostCodeRegex?: string;
  InternationalCallingNumber?: string;
}

/**
 * FetchCities response.
 * Classification: VERIFIED — official Aramex documentation (S3).
 */
export interface AramexFetchCitiesResponse {
  HasErrors: boolean;
  Notifications?: AramexNotification[];
  Cities?: AramexCity[];
}

export interface AramexCity {
  City: string;
  CountryCode: string;
  StateOrProvinceCode?: string;
}

/**
 * FetchOffices response.
 * Classification: VERIFIED — official Aramex documentation (S3).
 */
export interface AramexFetchOfficesResponse {
  HasErrors: boolean;
  Notifications?: AramexNotification[];
  Offices?: AramexOffice[];
}

export interface AramexOffice {
  OfficeID?: string;
  Name?: string;
  Address?: AramexAddress;
  Contact?: AramexContact;
  Type?: string;
}

/**
 * ValidateAddress request.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexValidateAddressRequest {
  ClientInfo: AramexClientInfo;
  Address: AramexAddress;
}

/**
 * ValidateAddress response.
 * Classification: VERIFIED — official Aramex documentation.
 */
export interface AramexValidateAddressResponse {
  HasErrors: boolean;
  Notifications?: AramexNotification[];
  SuggestedAddresses?: AramexAddress[];
}

// ── Webhook Payload ─────────────────────────────────────────────────────────

/**
 * Aramex webhook payload structure.
 *
 * UNVERIFIED — The exact payload structure requires Aramex account setup.
 * This is a best-effort type based on the Aramex Webhook API Specification (S4)
 * and corroborating third-party guides (S8).
 *
 * Mark as UNVERIFIED until confirmed with a real Aramex sandbox webhook.
 */
export interface AramexWebhookPayload {
  /** Shipment waybill number. */
  WaybillNumber?: string;
  /** Tracking update code (e.g. SH001, SH003). */
  UpdateCode?: string;
  /** Tracking update description. */
  UpdateDescription?: string;
  /** ISO datetime of the update. */
  UpdateDateTime?: string;
  /** Location of the update. */
  UpdateLocation?: string;
  /** Additional comments. */
  Comments?: string;
  /** Problem code if applicable. */
  ProblemCode?: string;
  /**
   * DO NOT TRUST these fields from the payload.
   * Tenant resolution must follow the authoritative chain:
   * webhook → credential → carrier shipment → shipment → store → org.
   */
  StoreId?: string;
  OrderId?: string;
  OrganizationId?: string;
}

// ── Rate Calculation Result (SCS internal) ──────────────────────────────────

/**
 * SCS rate result — converted from Aramex major units to minor units.
 */
export interface AramexRateResult {
  amountMinor: number;
  currency: string;
  taxMinor: number;
  totalMinor: number;
  metadata?: Record<string, unknown>;
}

// ── Pickup Result (SCS internal) ────────────────────────────────────────────

/**
 * SCS pickup result.
 */
export interface AramexPickupResult {
  supported: true;
  pickupGuid?: string;
  pickupId?: string;
  reference?: string;
  carrierStatus?: string;
}

/**
 * SCS cancel pickup result.
 */
export interface AramexCancelPickupResult {
  supported: true;
  cancelled: boolean;
  reason?: string;
  carrierStatus?: string;
}
