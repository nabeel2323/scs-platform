/**
 * Shipping domain types used across the shipping module.
 *
 * These are pure TypeScript types — no Drizzle schema imports.
 * They define the contracts between the provider abstraction layer
 * and the rest of the application.
 */

// ── Provider Types ──────────────────────────────────────────────────────────

export type ShippingProviderType = 'MANUAL' | 'CARRIER';

export type ShippingMethodType = 'STANDARD' | 'EXPRESS' | 'SAME_DAY' | 'SCHEDULED';

export interface ShippingAddress {
  street: string;
  city: string;
  postalCode?: string;
  region?: string;
  country: string;
  phone?: string;
  recipientName?: string;
}

export interface CreateShipmentRequest {
  shipmentId: string;
  orderId: string;
  storeId: string;
  deliveryAddress: ShippingAddress;
  shippingMethodType?: ShippingMethodType;
  metadata?: Record<string, unknown>;
}

export interface CreateShipmentResult {
  providerKey: string;
  trackingId?: string;
  labelUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface CarrierStatusMapping {
  /** Normalised internal shipment status */
  internalStatus: string;
  /** Raw carrier status string */
  carrierStatus: string;
  /** Human-readable description */
  description?: string;
}

// ── Provider Capabilities ───────────────────────────────────────────────────

export interface ProviderCapabilities {
  canCreateShipment: boolean;
  canCancel: boolean;
  canGenerateLabel: boolean;
  canTrack: boolean;
  canValidateAddress: boolean;
  canReceiveWebhooks: boolean;
}
