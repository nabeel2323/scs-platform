/**
 * Shipping domain types used across the shipping module.
 *
 * These are pure TypeScript types — no Drizzle schema imports.
 * They define the contracts between the provider abstraction layer
 * and the rest of the application.
 *
 * M7.2.3-A: Enriched with carrier-specific fields for external integrations.
 */

// ── Provider Types ──────────────────────────────────────────────────────────

export type ShippingProviderType = 'MANUAL' | 'CARRIER';

export type ShippingMethodType = 'STANDARD' | 'EXPRESS' | 'SAME_DAY' | 'SCHEDULED';

/** Carrier creation lifecycle status. */
export type CarrierCreateStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'RECOVERY_REQUIRED';

/**
 * Carrier cancellation lifecycle status (M7.3-B.3).
 *
 * Modeled independently from {@link CarrierCreateStatus}: carrier creation and
 * carrier cancellation are separate operation lifecycles and use separate
 * state fields. Canonical values match the M7.3-B.3.0 architecture lock and
 * all fit within VARCHAR(24). This is the state VOCABULARY only — the state
 * machine execution is implemented in later B.3 phases, not here.
 */
export type CarrierCancelStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'UNKNOWN'
  | 'NOT_REQUIRED'
  | 'RECONCILIATION_REQUIRED'
  | 'RETRY';

export interface ShippingAddress {
  street: string;
  city: string;
  postalCode?: string;
  region?: string;
  country: string;
  phone?: string;
  recipientName?: string;
}

export interface PackageDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

/**
 * CreateShipmentRequest — enriched for external carrier requirements.
 *
 * Fields marked optional are not yet available from the catalog/order model.
 * They will be populated when a later milestone provides authoritative
 * package/weight data.  Do NOT fabricate values for these fields.
 */
export interface CreateShipmentRequest {
  shipmentId: string;
  orderId: string;
  storeId: string;
  deliveryAddress: ShippingAddress;
  senderAddress?: ShippingAddress;
  shippingMethodType?: ShippingMethodType;
  /** Carrier-specific service code (e.g., 'EXPRESS', 'STANDARD'). */
  serviceType?: string;
  /** Package weight in grams (null if unknown — do not fabricate). */
  weightGrams?: number;
  /** Package dimensions in centimetres (null if unknown). */
  dimensionsCm?: PackageDimensions;
  /** Number of packages (defaults to 1 if not specified). */
  packageCount?: number;
  /** Cash-on-delivery amount in minor units (null if not COD). */
  codAmountMinor?: number;
  /** Currency code (ISO 4217). */
  currency?: string;
  /** Declared value for insurance/customs in minor units. */
  declaredValueMinor?: number;
  /** Deterministic idempotency key (derived from shipmentId). */
  idempotencyKey?: string;
  /**
   * Consignee (buyer) email address — resolved by CarrierEmailResolver.
   * Required by most external carriers for shipment notifications.
   * M7.2.3-B.1: Exposed to providers via the carrier-neutral request.
   */
  consigneeEmail?: string;
  metadata?: Record<string, unknown>;
}

/**
 * CreateShipmentResult — enriched with carrier response data.
 */
export interface CreateShipmentResult {
  providerKey: string;
  /** External carrier's shipment reference (e.g., Aramex AWB). */
  carrierShipmentId?: string;
  /** Carrier tracking number. */
  trackingId?: string;
  /** Initial carrier status after creation. */
  carrierStatus?: string;
  /** Carrier-estimated delivery date (ISO 8601). */
  estimatedDeliveryDate?: string;
  /** Base64-encoded label data (if carrier returns inline label). */
  labelData?: string;
  /** Label format identifier (e.g., 'PDF', 'ZPL', 'PNG'). */
  labelFormat?: string;
  /** Carrier-quoted rate in minor units. */
  rateQuoteMinor?: number;
  /** Carrier-quoted currency. */
  rateCurrency?: string;
  labelUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CarrierStatusMapping {
  /** Normalised internal shipment status. */
  internalStatus: string;
  /** Raw carrier status string. */
  carrierStatus: string;
  /** Human-readable description. */
  description?: string;
}

/**
 * TrackingEvent — typed result for carrier tracking queries.
 */
export interface TrackingEvent {
  timestamp: string;
  status: string;
  carrierStatus?: string;
  location?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * TrackingInfo — typed result for getTrackingInfo().
 */
export interface TrackingInfo {
  trackingId: string;
  carrierShipmentId?: string;
  status: string;
  estimatedDelivery?: string;
  events: TrackingEvent[];
  metadata?: Record<string, unknown>;
}

/**
 * UnsupportedOperationResult — returned when a provider does not support
 * an operation, instead of silently succeeding with a no-op.
 */
export interface UnsupportedOperationResult {
  supported: false;
  reason: string;
}

/**
 * CancelShipmentResult — typed result for cancelShipment().
 */
export type CancelShipmentResult =
  | { supported: true; cancelled: true; carrierStatus?: string }
  | { supported: true; cancelled: false; reason: string }
  | UnsupportedOperationResult;

/**
 * LabelResult — typed result for generateLabel().
 */
export type GenerateLabelResult =
  | { supported: true; labelData: string; labelFormat: string; storageKey?: string }
  | UnsupportedOperationResult;

// ── Provider Capabilities ───────────────────────────────────────────────────

export interface ProviderCapabilities {
  canCreateShipment: boolean;
  canCancel: boolean;
  canCancelPickup: boolean;
  canGenerateLabel: boolean;
  canTrack: boolean;
  canValidateAddress: boolean;
  canReceiveWebhooks: boolean;
}

// ── Cancel Pickup (Provider Abstraction) ────────────────────────────────────

/**
 * CancelPickupRequest — input for the provider-level cancelPickup operation.
 *
 * The minimum information required by the carrier to cancel a scheduled pickup.
 * The carrierPickupId must be a real carrier-assigned identifier (never fabricated).
 */
export interface CancelPickupRequest {
  /** The carrier-assigned pickup identifier (e.g. Aramex PickupGUID). */
  carrierPickupId: string;
  /** Store ID — used for credential resolution / tenant isolation. */
  storeId: string;
  /** Shipment ID — used for idempotency key derivation and logging. */
  shipmentId: string;
  /** Optional comments forwarded to the carrier. */
  comments?: string;
}

/**
 * CancelPickupResult — typed result for the provider-level cancelPickup operation.
 *
 * Three shapes:
 *   1. supported + cancelled     — carrier confirmed cancellation
 *   2. supported + not cancelled — carrier responded with a business error
 *   3. unsupported               — provider does not implement pickup cancellation
 */
export type CancelPickupResult =
  | { supported: true; cancelled: true; carrierStatus?: string }
  | { supported: true; cancelled: false; reason: string; carrierCode?: string }
  | UnsupportedOperationResult;

// ── Carrier Create Status Helpers ───────────────────────────────────────────

/** All valid carrier create statuses. */
export const CARRIER_CREATE_STATUSES: readonly CarrierCreateStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'SUCCESS',
  'FAILED',
  'RECOVERY_REQUIRED',
] as const;

/**
 * Validate that a string is a valid CarrierCreateStatus.
 * Throws if the value is not in the allowed set.
 */
export function assertCarrierCreateStatus(value: string): asserts value is CarrierCreateStatus {
  if (!CARRIER_CREATE_STATUSES.includes(value as CarrierCreateStatus)) {
    throw new Error(
      `Invalid carrier create status: '${value}'. Allowed: ${CARRIER_CREATE_STATUSES.join(', ')}`,
    );
  }
}

/**
 * Generate a deterministic idempotency key from a shipment ID.
 * The same shipment always produces the same key.
 */
export function generateIdempotencyKey(shipmentId: string): string {
  return `carrier-create:${shipmentId}`;
}

// ── Carrier Cancel Status Helpers (M7.3-B.3.1) ──────────────────────────────

/** All valid carrier cancel statuses (canonical vocabulary, no transitions yet). */
export const CARRIER_CANCEL_STATUSES: readonly CarrierCancelStatus[] = [
  'PENDING',
  'IN_PROGRESS',
  'SUCCEEDED',
  'FAILED',
  'UNKNOWN',
  'NOT_REQUIRED',
  'RECONCILIATION_REQUIRED',
  'RETRY',
] as const;

/**
 * Carrier-cancellation recovery tokens written to `shipments.recovery_status`
 * (VARCHAR(24)) when a cancellation needs reconciliation or produces an
 * ambiguous result. Namespaced with a `CANCEL_`/`DELIVERED_AFTER_` prefix so
 * they never collide with the create-flow recovery values. Every token is
 * <= 24 characters. `NOT_SUPPORTED` is deliberately excluded — the B.3.0 lock
 * rejects that token; unsupported cancellation is represented by the
 * `NOT_REQUIRED` carrier_cancel_status instead.
 */
export const CARRIER_CANCEL_RECOVERY_TOKENS = [
  'CANCEL_UNKNOWN',
  'CANCEL_TIMEOUT',
  'CANCEL_FAILED',
  'CANCEL_RECONCILE',
  'DELIVERED_AFTER_CANCEL',
] as const;

export type CarrierCancelRecoveryToken = (typeof CARRIER_CANCEL_RECOVERY_TOKENS)[number];

/**
 * Validate that a string is a valid CarrierCancelStatus.
 * Throws if the value is not in the allowed set.
 */
export function assertCarrierCancelStatus(value: string): asserts value is CarrierCancelStatus {
  if (!CARRIER_CANCEL_STATUSES.includes(value as CarrierCancelStatus)) {
    throw new Error(
      `Invalid carrier cancel status: '${value}'. Allowed: ${CARRIER_CANCEL_STATUSES.join(', ')}`,
    );
  }
}

/**
 * Generate a deterministic carrier-cancel idempotency key from a shipment ID.
 * The same shipment always produces the same key (no random UUIDs), so a
 * cancellation request is idempotent per shipment. Mirrors {@link
 * generateIdempotencyKey} for the create flow.
 */
export function generateCarrierCancelIdempotencyKey(shipmentId: string): string {
  return `carrier-cancel:${shipmentId}`;
}
