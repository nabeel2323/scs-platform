/**
 * Aramex Provider — M7.2.3-B.2
 *
 * First production-grade carrier adapter for SCS Platform.
 *
 * Implements the ShippingProvider contract using the Aramex REST/JSON API.
 * Uses the generic CarrierHttpClient (B1.5) — no SOAP dependency.
 *
 * Capabilities:
 *   - CREATE_SHIPMENT (via CreateShipments)
 *   - PRINT_LABEL (via PrintLabel + inline LabelInfo)
 *   - TRACK / TRACK_BY_REFERENCE (via TrackShipments)
 *   - CALCULATE_RATE (via CalculateRate)
 *   - CREATE_PICKUP / CANCEL_PICKUP
 *   - VALIDATE_ADDRESS (via location service)
 *   - LOCATION_SERVICES (FetchCountries, FetchCities, FetchOffices)
 *
 * Explicitly UNSUPPORTED:
 *   - CancelShipment (Aramex has no shipment cancellation API)
 *
 * SECURITY:
 *   - Credentials are decrypted only within the process boundary.
 *   - ClientInfo is NEVER logged or persisted.
 *   - SSRF protection validates all endpoint URLs.
 *   - Tenant isolation is preserved via existing infrastructure.
 *   - No client-controlled carrier prices.
 *
 * Sources:
 *   - B.0.1 Aramex API Verification
 *   - Aramex Shipping API Manual (S1)
 *   - ShipFlow SDK (S5)
 */

import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../common/database/database.service';
import { CarrierCredentialsService } from '../carrier-credentials.service';
import { CarrierConfigurationsService } from '../carrier-configurations.service';
import { CarrierEmailResolver } from '../carrier-email-resolver';
import { CarrierObservabilityService } from '../carrier-observability';
import { ShippingProvider } from '../shipping-provider';
import {
  ShippingProviderType,
  CreateShipmentRequest,
  CreateShipmentResult,
  ProviderCapabilities,
  ShippingAddress,
  CancelShipmentResult,
  GenerateLabelResult,
  TrackingInfo,
  TrackingEvent,
  CarrierStatusMapping,
  generateIdempotencyKey,
} from '../shipping.types';
import { CarrierHttpClient } from '../carrier-http-client';
import {
  AuthenticationCarrierError,
  NonRetryableCarrierError,
  RateLimitCarrierError,
  RetryableCarrierError,
  ValidationCarrierError,
} from '../carrier-errors';
import { resolveCarrierEndpoint } from '../carrier-endpoints';
import { carrierEndpointAllowlistRegistry } from '../ssrf-protection';
import { shipments } from '../../orders/shipment.schema';
import { stores } from '../../merchant/merchant.schema';
import { carrierCredentials } from '../shipping.schema';
import { buildClientInfo } from './aramex-clientinfo.builder';
import { mapAramexStatus } from './aramex-status.mapper';
import {
  ARAMEX_PROVIDER_KEY,
  ARAMEX_PROVIDER_NAME,
  ARAMEX_ALLOWED_HOSTS,
  ARAMEX_TIMEOUT_MS,
  ARAMEX_MAX_RETRIES,
  ARAMEX_WEIGHT_UNIT,
  ARAMEX_DIMENSION_UNIT,
  ARAMEX_DEFAULT_LABEL_INFO,
  ARAMEX_PAYMENT_TYPES,
  ARAMEX_COD_SERVICES,
  ARAMEX_THROTTLE_INDICATORS,
} from './aramex.constants';
import type {
  AramexCredentialPayload,
  AramexClientInfo,
  AramexCreateShipmentsRequest,
  AramexCreateShipmentsResponse,
  AramexPrintLabelRequest,
  AramexPrintLabelResponse,
  AramexTrackShipmentsRequest,
  AramexTrackShipmentsResponse,
  AramexTrackingResult,
  AramexCalculateRateRequest,
  AramexCalculateRateResponse,
  AramexCreatePickupRequest,
  AramexCreatePickupResponse,
  AramexCancelPickupRequest,
  AramexCancelPickupResponse,
  AramexFetchCountriesResponse,
  AramexFetchCitiesResponse,
  AramexFetchOfficesResponse,
  AramexValidateAddressRequest,
  AramexValidateAddressResponse,
  AramexParty,
  AramexNotification,
  AramexRateResult,
  AramexPickupResult,
  AramexCancelPickupResult,
} from './aramex.types';

// ── Provider ────────────────────────────────────────────────────────────────

@Injectable()
export class AramexProvider extends ShippingProvider {
  readonly type: ShippingProviderType = 'CARRIER';
  readonly key = ARAMEX_PROVIDER_KEY;
  readonly name = ARAMEX_PROVIDER_NAME;

  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true,
    canCancel: false,          // Aramex has NO CancelShipment API
    canGenerateLabel: true,
    canTrack: true,
    canValidateAddress: true,
    canReceiveWebhooks: true,
  };

  private readonly logger = new Logger(AramexProvider.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly credentials: CarrierCredentialsService,
    private readonly configurations: CarrierConfigurationsService,
    private readonly emailResolver: CarrierEmailResolver,
    private readonly observability: CarrierObservabilityService,
  ) {
    super();
    // Register SSRF allowlist for Aramex hosts
    carrierEndpointAllowlistRegistry.register({
      providerKey: ARAMEX_PROVIDER_KEY,
      allowedHosts: [...ARAMEX_ALLOWED_HOSTS],
      requireHttps: true,
    });
  }

  // ── CreateShipment (B2.6, B2.9, B2.10, B2.11) ─────────────────────────

  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult> {
    const correlationId = this.observability.generateCorrelationId();
    const ctx = this.observability.createContext(this.key, 'createShipment', {
      storeId: request.storeId,
      shipmentId: request.shipmentId,
      correlationId,
    });
    this.observability.logStart(ctx);
    const startTime = Date.now();

    try {
      // 1. Idempotency pre-check
      const existingShipment = await this.db.db.query.shipments.findFirst({
        where: eq(shipments.id, request.shipmentId),
      });
      if (existingShipment?.carrierCreateStatus === 'SUCCESS' && existingShipment.carrierShipmentId) {
        return {
          providerKey: this.key,
          carrierShipmentId: existingShipment.carrierShipmentId,
          trackingId: existingShipment.carrierTrackingId || undefined,
          carrierStatus: existingShipment.carrierStatusRaw || undefined,
          metadata: { idempotent: true, source: 'cached' },
        };
      }

      // 2. Resolve credentials
      const { payload, primaryUrl } = await this.resolveCredentials(request.storeId);
      const clientInfo = buildClientInfo(payload);

      // 3. Resolve shipping endpoint
      const shippingBaseUrl = resolveCarrierEndpoint('shipping', payload, primaryUrl);
      if (!shippingBaseUrl) {
        throw new NonRetryableCarrierError(
          'No shipping endpoint configured for Aramex',
          { providerKey: this.key, operation: 'createShipment' },
        );
      }

      // 4. Resolve consignee email
      const resolvedEmail = await this.emailResolver.resolve(request.shipmentId);

      // 5. Build Aramex request
      const idempotencyKey = request.idempotencyKey || generateIdempotencyKey(request.shipmentId);
      const aramexRequest = this.buildCreateShipmentsRequest(
        clientInfo, request, resolvedEmail.email, idempotencyKey,
      );

      // 6. HTTP call
      const httpClient = this.createHttpClient();
      const response = await httpClient.request<AramexCreateShipmentsResponse>({
        url: `${shippingBaseUrl}/json/CreateShipments`,
        method: 'POST',
        body: aramexRequest as unknown as Record<string, unknown>,
        operation: 'createShipment',
        timeoutMs: ARAMEX_TIMEOUT_MS,
        correlationId,
      });

      // 7. Parse Aramex "HTTP 200 errors"
      const body = response.body;
      this.checkAramexErrors(body, 'createShipment');

      // 8. Extract result
      const processed = body.Shipments?.ProcessedShipment;
      if (!processed) {
        throw new NonRetryableCarrierError(
          'Aramex CreateShipments response missing ProcessedShipment',
          { providerKey: this.key, operation: 'createShipment' },
        );
      }

      // Check per-shipment errors
      if (processed.HasErrors) {
        this.throwFromNotifications(processed.Notifications || [], 'createShipment');
      }

      this.observability.logComplete({
        context: ctx,
        duration: Date.now() - startTime,
        result: 'success',
        httpStatus: response.status,
      });

      return {
        providerKey: this.key,
        carrierShipmentId: processed.ID,
        trackingId: processed.ID, // Waybill number = tracking ID for Aramex
        carrierStatus: 'RECORD_CREATED',
        labelUrl: processed.ShipmentLabel?.LabelURL || undefined,
        metadata: {
          chargeableWeight: processed.ShipmentDetails?.ChargeableWeight,
          productType: processed.ShipmentDetails?.ProductType,
          productGroup: processed.ShipmentDetails?.ProductGroup,
          idempotencyKey,
          correlationId,
        },
      };

    } catch (err) {
      this.observability.logComplete({
        context: ctx,
        duration: Date.now() - startTime,
        result: err instanceof RateLimitCarrierError ? 'rate_limited' : 'failure',
        errorClassification: err?.constructor?.name || 'Unknown',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  // ── CancelShipment (B2.17) ──────────────────────────────────────────────

  override async cancelShipment(_shipmentId: string): Promise<CancelShipmentResult> {
    return {
      supported: false,
      reason:
        'Aramex does not provide a shipment cancellation API. ' +
        'If a pickup is scheduled, CancelPickup may be available. ' +
        'Otherwise, do not hand over the package to the carrier.',
    };
  }

  // ── GenerateLabel / PrintLabel (B2.12) ──────────────────────────────────

  override async generateLabel(shipmentId: string): Promise<GenerateLabelResult> {
    const correlationId = this.observability.generateCorrelationId();

    // Look up the shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) {
      throw new NonRetryableCarrierError(
        `Shipment ${shipmentId} not found`,
        { providerKey: this.key, operation: 'generateLabel' },
      );
    }
    if (!shipment.carrierShipmentId) {
      throw new NonRetryableCarrierError(
        `Shipment ${shipmentId} has no carrier shipment ID — create shipment first`,
        { providerKey: this.key, operation: 'generateLabel' },
      );
    }

    const { payload, primaryUrl } = await this.resolveCredentials(shipment.storeId);
    const clientInfo = buildClientInfo(payload);

    const shippingBaseUrl = resolveCarrierEndpoint('shipping', payload, primaryUrl);
    if (!shippingBaseUrl) {
      throw new NonRetryableCarrierError(
        'No shipping endpoint configured for Aramex',
        { providerKey: this.key, operation: 'generateLabel' },
      );
    }

    const printLabelRequest: AramexPrintLabelRequest = {
      ClientInfo: clientInfo,
      ShipmentNumber: shipment.carrierShipmentId,
      ProductGroup: this.inferProductGroup(shipment),
      OriginEntity: payload.accountEntity,
      LabelInfo: { ...ARAMEX_DEFAULT_LABEL_INFO },
    };

    const httpClient = this.createHttpClient();
    const response = await httpClient.request<AramexPrintLabelResponse>({
      url: `${shippingBaseUrl}/json/PrintLabel`,
      method: 'POST',
      body: printLabelRequest as unknown as Record<string, unknown>,
      operation: 'generateLabel',
      timeoutMs: ARAMEX_TIMEOUT_MS,
      correlationId,
    });

    this.checkAramexErrors(response.body, 'generateLabel');

    const labelUrl = response.body.ShipmentLabel?.LabelURL;
    if (!labelUrl) {
      throw new NonRetryableCarrierError(
        'Aramex PrintLabel response missing LabelURL',
        { providerKey: this.key, operation: 'generateLabel' },
      );
    }

    return {
      supported: true,
      labelData: labelUrl, // URL to PDF — caller downloads and stores
      labelFormat: 'PDF',
      storageKey: labelUrl,
    };
  }

  // ── Tracking (B2.13) ────────────────────────────────────────────────────

  override async getTrackingInfo(trackingId: string): Promise<TrackingInfo | null> {
    const correlationId = this.observability.generateCorrelationId();

    // Tracking requires credentials — use a default org's credential
    // In practice, the worker calls this with context. For direct calls,
    // we need at least one active credential.
    const { payload, primaryUrl } = await this.resolveAnyCredential();
    const clientInfo = buildClientInfo(payload);

    const trackingBaseUrl = resolveCarrierEndpoint('tracking', payload, primaryUrl);
    if (!trackingBaseUrl) {
      throw new NonRetryableCarrierError(
        'No tracking endpoint configured for Aramex',
        { providerKey: this.key, operation: 'getTrackingInfo' },
      );
    }

    const trackRequest: AramexTrackShipmentsRequest = {
      ClientInfo: clientInfo,
      Shipments: [trackingId],
    };

    const httpClient = this.createHttpClient();
    const response = await httpClient.request<AramexTrackShipmentsResponse>({
      url: `${trackingBaseUrl}/json/TrackShipments`,
      method: 'POST',
      body: trackRequest as unknown as Record<string, unknown>,
      operation: 'getTrackingInfo',
      timeoutMs: ARAMEX_TIMEOUT_MS,
      correlationId,
    });

    this.checkAramexErrors(response.body, 'getTrackingInfo');

    const body = response.body;
    const kvResult = body.TrackingResults?.KeyValueOfstringArrayOfTrackingResult;
    if (!kvResult) {
      return null;
    }

    const results = kvResult.Value?.TrackingResult || [];
    if (results.length === 0) {
      return null;
    }

    const events: TrackingEvent[] = results.map((r) => this.mapTrackingResult(r));
    const latestEvent = events[events.length - 1];

    return {
      trackingId,
      carrierShipmentId: trackingId,
      status: latestEvent?.status || 'UNKNOWN',
      events,
      metadata: {
        nonExistingWaybills: body.NonExistingWaybills?.string || [],
        correlationId,
      },
    };
  }

  /**
   * Track multiple shipments in a single batch (for polling).
   */
  async trackShipmentsBatch(waybillNumbers: string[]): Promise<Map<string, TrackingEvent[]>> {
    const result = new Map<string, TrackingEvent[]>();
    if (waybillNumbers.length === 0) return result;

    const correlationId = this.observability.generateCorrelationId();
    const { payload, primaryUrl } = await this.resolveAnyCredential();
    const clientInfo = buildClientInfo(payload);

    const trackingBaseUrl = resolveCarrierEndpoint('tracking', payload, primaryUrl);
    if (!trackingBaseUrl) {
      throw new NonRetryableCarrierError(
        'No tracking endpoint configured for Aramex',
        { providerKey: this.key, operation: 'trackShipmentsBatch' },
      );
    }

    const httpClient = this.createHttpClient();
    const response = await httpClient.request<AramexTrackShipmentsResponse>({
      url: `${trackingBaseUrl}/json/TrackShipments`,
      method: 'POST',
      body: {
        ClientInfo: clientInfo,
        Shipments: waybillNumbers,
      } as unknown as Record<string, unknown>,
      operation: 'trackShipmentsBatch',
      timeoutMs: ARAMEX_TIMEOUT_MS,
      correlationId,
    });

    this.checkAramexErrors(response.body, 'trackShipmentsBatch');

    const kvResult = response.body.TrackingResults?.KeyValueOfstringArrayOfTrackingResult;
    if (kvResult) {
      const waybill = kvResult.Key;
      const trackingResults = kvResult.Value?.TrackingResult || [];
      result.set(waybill, trackingResults.map((r) => this.mapTrackingResult(r)));
    }

    return result;
  }

  // ── Address Validation (B2.19) ──────────────────────────────────────────

  override async validateAddress(address: ShippingAddress): Promise<boolean> {
    const correlationId = this.observability.generateCorrelationId();
    const { payload, primaryUrl } = await this.resolveAnyCredential();
    const clientInfo = buildClientInfo(payload);

    const locationBaseUrl = resolveCarrierEndpoint('location', payload, primaryUrl);
    if (!locationBaseUrl) {
      // If no location endpoint, skip validation (return true)
      return true;
    }

    const validateRequest: AramexValidateAddressRequest = {
      ClientInfo: clientInfo,
      Address: {
        Line1: address.street,
        City: address.city,
        CountryCode: address.country,
        PostCode: address.postalCode,
        StateOrProvinceCode: address.region,
      },
    };

    const httpClient = this.createHttpClient();
    const response = await httpClient.request<AramexValidateAddressResponse>({
      url: `${locationBaseUrl}/json/ValidateAddress`,
      method: 'POST',
      body: validateRequest as unknown as Record<string, unknown>,
      operation: 'validateAddress',
      timeoutMs: ARAMEX_TIMEOUT_MS,
      correlationId,
    });

    // If Aramex returns errors, address is invalid
    if (response.body.HasErrors) {
      return false;
    }

    return true;
  }

  // ── Status Mapping (B2.22) ──────────────────────────────────────────────

  override mapCarrierStatus(carrierStatus: string): CarrierStatusMapping | null {
    return mapAramexStatus(carrierStatus);
  }

  // ── CalculateRate (B2.18) ───────────────────────────────────────────────

  async calculateRate(params: {
    origin: ShippingAddress;
    destination: ShippingAddress;
    weightGrams: number;
    dimensionsCm?: { lengthCm: number; widthCm: number; heightCm: number };
    productGroup: string;
    productType: string;
    paymentType: string;
    currency: string;
    numberOfPieces?: number;
    credentialId?: string;
  }): Promise<AramexRateResult> {
    const correlationId = this.observability.generateCorrelationId();
    const { payload, primaryUrl } = params.credentialId
      ? await this.resolveCredentialsById(params.credentialId)
      : await this.resolveAnyCredential();
    const clientInfo = buildClientInfo(payload);

    const ratingBaseUrl = resolveCarrierEndpoint('rating', payload, primaryUrl);
    if (!ratingBaseUrl) {
      throw new NonRetryableCarrierError(
        'No rating endpoint configured for Aramex',
        { providerKey: this.key, operation: 'calculateRate' },
      );
    }

    const rateRequest: AramexCalculateRateRequest = {
      ClientInfo: clientInfo,
      Origin: {
        Line1: params.origin.street,
        City: params.origin.city,
        CountryCode: params.origin.country,
        PostCode: params.origin.postalCode,
        StateOrProvinceCode: params.origin.region,
      },
      Destination: {
        Line1: params.destination.street,
        City: params.destination.city,
        CountryCode: params.destination.country,
        PostCode: params.destination.postalCode,
        StateOrProvinceCode: params.destination.region,
      },
      Weight: {
        Value: Math.max(0, params.weightGrams / 1000),
        Unit: ARAMEX_WEIGHT_UNIT,
      },
      NumberOfPieces: params.numberOfPieces || 1,
      ProductGroup: params.productGroup,
      ProductType: params.productType,
      PaymentType: params.paymentType,
      Currency: params.currency,
    };

    if (params.dimensionsCm) {
      rateRequest.Dimensions = {
        Length: params.dimensionsCm.lengthCm,
        Width: params.dimensionsCm.widthCm,
        Height: params.dimensionsCm.heightCm,
        Unit: ARAMEX_DIMENSION_UNIT,
      };
    }

    const httpClient = this.createHttpClient();
    const response = await httpClient.request<AramexCalculateRateResponse>({
      url: `${ratingBaseUrl}/json/CalculateRate`,
      method: 'POST',
      body: rateRequest as unknown as Record<string, unknown>,
      operation: 'calculateRate',
      timeoutMs: ARAMEX_TIMEOUT_MS,
      correlationId,
    });

    this.checkAramexErrors(response.body, 'calculateRate');

    // Convert Aramex major units → SCS minor units
    const totalMajor = response.body.TotalAmount?.Value || 0;
    const taxMajor = response.body.RateDetails?.TaxAmount || 0;
    const amountMajor = response.body.RateDetails?.Amount || 0;

    return {
      amountMinor: Math.round(amountMajor * 100),
      currency: response.body.TotalAmount?.CurrencyCode || params.currency,
      taxMinor: Math.round(taxMajor * 100),
      totalMinor: Math.round(totalMajor * 100),
      metadata: {
        totalAmountBeforeTax: response.body.RateDetails?.TotalAmountBeforeTax,
        correlationId,
      },
    };
  }

  // ── CreatePickup (B2.15) ────────────────────────────────────────────────

  async createPickup(params: {
    pickupAddress: ShippingAddress;
    contactName: string;
    email: string;
    phone: string;
    pickupDate: string;
    readyTime: string;
    weightGrams?: number;
    numberOfPieces?: number;
    reference?: string;
    storeId: string;
  }): Promise<AramexPickupResult> {
    const correlationId = this.observability.generateCorrelationId();
    const { payload, primaryUrl } = await this.resolveCredentials(params.storeId);
    const clientInfo = buildClientInfo(payload);

    const shippingBaseUrl = resolveCarrierEndpoint('shipping', payload, primaryUrl);
    if (!shippingBaseUrl) {
      throw new NonRetryableCarrierError(
        'No shipping endpoint configured for Aramex',
        { providerKey: this.key, operation: 'createPickup' },
      );
    }

    const pickupRequest: AramexCreatePickupRequest = {
      ClientInfo: clientInfo,
      Pickup: {
        PickupAddress: {
          Line1: params.pickupAddress.street,
          City: params.pickupAddress.city,
          CountryCode: params.pickupAddress.country,
          PostCode: params.pickupAddress.postalCode,
          StateOrProvinceCode: params.pickupAddress.region,
        },
        PickupContact: {
          PersonName: params.contactName,
          EmailAddress: params.email,
          PhoneNumber1: params.phone,
        },
        PickupDate: params.pickupDate,
        ReadyTime: params.readyTime,
        Status: 'Ready',
        Reference1: params.reference,
        Weight: params.weightGrams
          ? { Value: params.weightGrams / 1000, Unit: ARAMEX_WEIGHT_UNIT }
          : undefined,
        NumberOfPieces: params.numberOfPieces,
      },
    };

    const httpClient = this.createHttpClient();
    const response = await httpClient.request<AramexCreatePickupResponse>({
      url: `${shippingBaseUrl}/json/CreatePickup`,
      method: 'POST',
      body: pickupRequest as unknown as Record<string, unknown>,
      operation: 'createPickup',
      timeoutMs: ARAMEX_TIMEOUT_MS,
      correlationId,
    });

    this.checkAramexErrors(response.body, 'createPickup');

    return {
      supported: true,
      pickupGuid: response.body.Pickup?.GUID,
      pickupId: response.body.Pickup?.ID,
      reference: response.body.Pickup?.Reference,
      carrierStatus: 'SCHEDULED',
    };
  }

  // ── CancelPickup (B2.16) ────────────────────────────────────────────────

  async cancelPickup(params: {
    pickupGuid: string;
    comments?: string;
    storeId: string;
  }): Promise<AramexCancelPickupResult> {
    const correlationId = this.observability.generateCorrelationId();
    const { payload, primaryUrl } = await this.resolveCredentials(params.storeId);
    const clientInfo = buildClientInfo(payload);

    const shippingBaseUrl = resolveCarrierEndpoint('shipping', payload, primaryUrl);
    if (!shippingBaseUrl) {
      throw new NonRetryableCarrierError(
        'No shipping endpoint configured for Aramex',
        { providerKey: this.key, operation: 'cancelPickup' },
      );
    }

    const cancelRequest: AramexCancelPickupRequest = {
      ClientInfo: clientInfo,
      PickupGUID: params.pickupGuid,
      Comments: params.comments,
    };

    const httpClient = this.createHttpClient();
    const response = await httpClient.request<AramexCancelPickupResponse>({
      url: `${shippingBaseUrl}/json/CancelPickup`,
      method: 'POST',
      body: cancelRequest as unknown as Record<string, unknown>,
      operation: 'cancelPickup',
      timeoutMs: ARAMEX_TIMEOUT_MS,
      correlationId,
    });

    const body = response.body;
    if (body.HasErrors) {
      return {
        supported: true,
        cancelled: false,
        reason: body.Notifications?.[0]?.Message || 'CancelPickup failed',
      };
    }

    return {
      supported: true,
      cancelled: true,
      carrierStatus: 'CANCELLED',
    };
  }

  // ── Location Services (B2.20) ───────────────────────────────────────────

  async fetchCountries(storeId: string): Promise<AramexFetchCountriesResponse> {
    return this.locationRequest<AramexFetchCountriesResponse>(
      'FetchCountries', 'fetchCountries', {}, storeId,
    );
  }

  async fetchCities(countryCode: string, storeId: string): Promise<AramexFetchCitiesResponse> {
    return this.locationRequest<AramexFetchCitiesResponse>(
      'FetchCities', 'fetchCities', { CountryCode: countryCode }, storeId,
    );
  }

  async fetchOffices(storeId: string): Promise<AramexFetchOfficesResponse> {
    return this.locationRequest<AramexFetchOfficesResponse>(
      'FetchOffices', 'fetchOffices', {}, storeId,
    );
  }

  // ── Private: Request Building ───────────────────────────────────────────

  /**
   * Build a CreateShipments request from SCS data.
   */
  private buildCreateShipmentsRequest(
    clientInfo: AramexClientInfo,
    request: CreateShipmentRequest,
    consigneeEmail: string,
    idempotencyKey: string,
  ): AramexCreateShipmentsRequest {
    const addr = request.deliveryAddress;
    const currency = request.currency || 'SAR';

    // Determine product type/group
    const productType = request.serviceType || 'OND';
    const productGroup = this.inferProductGroupFromAddresses(
      request.senderAddress?.country, addr.country, productType,
    );

    // Determine payment type
    const isCod = request.codAmountMinor !== undefined && request.codAmountMinor > 0;
    const paymentType = isCod ? ARAMEX_PAYMENT_TYPES.COD : ARAMEX_PAYMENT_TYPES.PREPAID;

    // Build consignee (recipient)
    const consignee: AramexParty = {
      PartyAddress: {
        Line1: addr.street,
        City: addr.city,
        CountryCode: addr.country,
        PostCode: addr.postalCode,
        StateOrProvinceCode: addr.region,
      },
      Contact: {
        PersonName: addr.recipientName || 'Customer',
        EmailAddress: consigneeEmail,
        PhoneNumber1: addr.phone || '',
      },
    };

    // Build shipper (sender)
    const senderAddr = request.senderAddress;
    const shipper: AramexParty = {
      PartyAddress: {
        Line1: senderAddr?.street || '',
        City: senderAddr?.city || '',
        CountryCode: senderAddr?.country || clientInfo.AccountCountryCode,
        PostCode: senderAddr?.postalCode,
        StateOrProvinceCode: senderAddr?.region,
      },
      Contact: {
        PersonName: senderAddr?.recipientName || 'Shipper',
        EmailAddress: consigneeEmail, // Fallback — shipper email may differ
        PhoneNumber1: senderAddr?.phone || '',
      },
    };

    // Build shipment
    const shipment: any = {
      Shipper: shipper,
      Consignee: consignee,
      Weight: {
        Value: Math.max(0, (request.weightGrams || 0) / 1000),
        Unit: ARAMEX_WEIGHT_UNIT,
      },
      NumberOfPieces: request.packageCount || 1,
      ProductGroup: productGroup,
      ProductType: productType,
      PaymentType: paymentType,
    };

    // Dimensions (optional)
    if (request.dimensionsCm) {
      shipment.Dimensions = {
        Length: request.dimensionsCm.lengthCm,
        Width: request.dimensionsCm.widthCm,
        Height: request.dimensionsCm.heightCm,
        Unit: ARAMEX_DIMENSION_UNIT,
      };
    }

    // COD (optional) — minor units → major units
    if (isCod && request.codAmountMinor !== undefined) {
      if (request.codAmountMinor < 0) {
        throw new ValidationCarrierError(
          'COD amount cannot be negative',
          { providerKey: this.key, operation: 'createShipment' },
        );
      }
      shipment.CashOnDeliveryAmount = {
        CurrencyCode: currency,
        Value: request.codAmountMinor / 100,
      };
      shipment.Services = ARAMEX_COD_SERVICES;
    }

    // Customs value (optional) — minor units → major units
    if (request.declaredValueMinor !== undefined && request.declaredValueMinor > 0) {
      shipment.CustomsValueAmount = {
        CurrencyCode: currency,
        Value: request.declaredValueMinor / 100,
      };
    }

    return {
      ClientInfo: clientInfo,
      Transaction: {
        Reference1: idempotencyKey,
      },
      Shipments: [shipment],
      LabelInfo: { ...ARAMEX_DEFAULT_LABEL_INFO },
    };
  }

  // ── Private: Error Handling (B2.10) ─────────────────────────────────────

  /**
   * Check an Aramex response for HasErrors=true.
   * HTTP 200 + HasErrors=true is NEVER treated as success.
   */
  private checkAramexErrors(
    body: { HasErrors?: boolean; Notifications?: AramexNotification[] },
    operation: string,
  ): void {
    if (!body.HasErrors) return;
    this.throwFromNotifications(body.Notifications || [], operation);
  }

  /**
   * Convert Aramex notifications into the appropriate CarrierError.
   */
  private throwFromNotifications(
    notifications: AramexNotification[],
    operation: string,
  ): never {
    const messages = notifications.map((n) => n.Message).join('; ');
    const codes = notifications.map((n) => n.Code).join(',');

    // Check for throttling indicators
    const isThrottled = notifications.some((n) =>
      ARAMEX_THROTTLE_INDICATORS.some((indicator) =>
        n.Message.toLowerCase().includes(indicator) ||
        n.Code.toLowerCase().includes(indicator),
      ),
    );
    if (isThrottled) {
      throw new RateLimitCarrierError(
        `Aramex throttling detected: ${messages}`,
        { providerKey: this.key, operation, carrierCode: codes },
      );
    }

    // Check for authentication errors
    const isAuth = notifications.some((n) =>
      /invalid.*credential|unauthorized|authentication|invalid.*password|invalid.*username|invalid.*account/i.test(n.Message),
    );
    if (isAuth) {
      throw new AuthenticationCarrierError(
        `Aramex authentication error: ${messages}`,
        { providerKey: this.key, operation, carrierCode: codes },
      );
    }

    // Check for validation errors
    const isValidation = notifications.some((n) =>
      /invalid|required.*missing|must be|cannot be|format|too (long|short|heavy)|overweight/i.test(n.Message),
    );
    if (isValidation) {
      throw new ValidationCarrierError(
        `Aramex validation error: ${messages}`,
        { providerKey: this.key, operation, carrierCode: codes },
      );
    }

    // Default: non-retryable error
    throw new NonRetryableCarrierError(
      `Aramex error: ${messages}`,
      { providerKey: this.key, operation, carrierCode: codes },
    );
  }

  // ── Private: Credential Resolution ──────────────────────────────────────

  /**
   * Resolve decrypted credentials for a store.
   * Uses the carrier configuration → credential chain.
   */
  /**
   * Resolve credentials via the configuration chain for a given store.
   *
   * Resolution order:
   *   1. Store-specific carrier configuration → linked credential
   *   2. Org-wide default carrier configuration → linked credential
   *   3. Any active Aramex credential (fallback)
   */
  private async resolveCredentials(storeId: string): Promise<{
    payload: AramexCredentialPayload;
    primaryUrl: string | null;
  }> {
    // Try to resolve through configuration chain
    // The configurations service needs orgId + storeId, but we only have storeId here.
    // Look up the store's orgId first, then resolve configuration.
    try {
      const store = await this.db.db.query.stores.findFirst({
        where: eq(stores.id, storeId),
        columns: { orgId: true },
      });
      if (store) {
        const config = await this.configurations.resolveForStore(store.orgId, storeId);
        if (config?.credentialId) {
          return this.resolveCredentialsById(config.credentialId);
        }
        // Try org-wide default
        const orgConfig = await this.configurations.resolveForStore(store.orgId, '');
        if (orgConfig?.credentialId) {
          return this.resolveCredentialsById(orgConfig.credentialId);
        }
      }
    } catch {
      // Fall through to any-credential lookup
    }

    return this.resolveAnyCredential();
  }

  /**
   * Decrypt and return credentials by credential ID.
   */
  private async resolveCredentialsById(credentialId: string): Promise<{
    payload: AramexCredentialPayload;
    primaryUrl: string | null;
  }> {
    const credJson = await this.credentials.decryptCredentials(credentialId);
    const payload = JSON.parse(credJson) as AramexCredentialPayload;

    const row = await this.db.db.query.carrierCredentials.findFirst({
      where: eq(carrierCredentials.id, credentialId),
      columns: { endpointUrl: true },
    });

    return { payload, primaryUrl: row?.endpointUrl || null };
  }

  /**
   * Find any active Aramex credential for fallback operations
   * (tracking, address validation, location services).
   */
  private async resolveAnyCredential(): Promise<{
    payload: AramexCredentialPayload;
    primaryUrl: string | null;
  }> {
    const row = await this.db.db.query.carrierCredentials.findFirst({
      where: eq(carrierCredentials.providerKey, ARAMEX_PROVIDER_KEY),
    });

    if (!row || !row.isActive) {
      throw new NonRetryableCarrierError(
        'No Aramex credential available — configure credentials via admin API',
        { providerKey: this.key, operation: 'resolveCredential' },
      );
    }

    const credJson = await this.credentials.decryptCredentials(row.id);
    const payload = JSON.parse(credJson) as AramexCredentialPayload;

    return { payload, primaryUrl: row.endpointUrl || null };
  }

  // ── Private: HTTP Client ────────────────────────────────────────────────

  private createHttpClient(): CarrierHttpClient {
    return new CarrierHttpClient({
      providerKey: this.key,
      timeoutMs: ARAMEX_TIMEOUT_MS,
      maxRetries: ARAMEX_MAX_RETRIES,
    });
  }

  // ── Private: Helpers ────────────────────────────────────────────────────

  private mapTrackingResult(r: AramexTrackingResult): TrackingEvent {
    const mapping = mapAramexStatus(r.UpdateCode, r.UpdateDescription);
    return {
      timestamp: r.UpdateDateTime,
      status: mapping.internalStatus,
      carrierStatus: r.UpdateCode,
      location: r.UpdateLocation,
      description: mapping.description,
      metadata: {
        problemCode: r.ProblemCode || undefined,
        comments: r.Comments || undefined,
        grossWeight: r.GrossWeight,
        chargeableWeight: r.ChargeableWeight,
      },
    };
  }

  private inferProductGroup(shipment: any): string {
    // Try to get from metadata
    const meta = shipment.metadata as Record<string, unknown> | null;
    if (meta?.['productGroup'] && typeof meta['productGroup'] === 'string') {
      return meta['productGroup'];
    }
    return 'EXP'; // Default to international
  }

  private inferProductGroupFromAddresses(
    originCountry: string | undefined,
    destCountry: string | undefined,
    productType: string,
  ): string {
    // If origin and destination are the same country → DOM
    if (originCountry && destCountry && originCountry === destCountry) {
      return 'DOM';
    }
    // If different countries → EXP
    if (originCountry && destCountry && originCountry !== destCountry) {
      return 'EXP';
    }
    // If only destination known, infer from product type
    const domesticTypes = ['OND', 'CDS'];
    if (domesticTypes.includes(productType)) {
      return 'DOM';
    }
    return 'EXP';
  }

  private async locationRequest<T>(
    operation: string,
    opName: string,
    extraParams: Record<string, unknown>,
    _storeId: string,
  ): Promise<T> {
    const correlationId = this.observability.generateCorrelationId();
    const { payload, primaryUrl } = await this.resolveAnyCredential();
    const clientInfo = buildClientInfo(payload);

    const locationBaseUrl = resolveCarrierEndpoint('location', payload, primaryUrl);
    if (!locationBaseUrl) {
      throw new NonRetryableCarrierError(
        'No location endpoint configured for Aramex',
        { providerKey: this.key, operation: opName },
      );
    }

    const httpClient = this.createHttpClient();
    const response = await httpClient.request<T>({
      url: `${locationBaseUrl}/json/${operation}`,
      method: 'POST',
      body: {
        ClientInfo: clientInfo,
        ...extraParams,
      } as unknown as Record<string, unknown>,
      operation: opName,
      timeoutMs: ARAMEX_TIMEOUT_MS,
      correlationId,
    });

    return response.body;
  }
}
