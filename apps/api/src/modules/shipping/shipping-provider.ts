import {
  ShippingProviderType,
  CreateShipmentRequest,
  CreateShipmentResult,
  CarrierStatusMapping,
  ProviderCapabilities,
  ShippingAddress,
  CancelShipmentResult,
  CancelPickupRequest,
  CancelPickupResult,
  GenerateLabelResult,
  TrackingInfo,
} from './shipping.types';

/**
 * ShippingProvider — the contract every shipping provider must implement.
 *
 * The provider abstraction allows the platform to work with different
 * fulfillment methods (manual driver delivery, Aramex, SMSA, etc.)
 * through a single interface.  Only ManualDeliveryProvider is registered
 * in M7.2.1; external carriers will be added in later M7.2 phases.
 *
 * M7.2.3-A: Unsupported operations now return explicit typed results
 * instead of silently succeeding with no-ops.  ManualDeliveryProvider
 * continues to work unchanged for all supported operations.
 */
export abstract class ShippingProvider {
  /** Provider type: MANUAL or CARRIER */
  abstract readonly type: ShippingProviderType;

  /** Unique key identifying this provider (e.g. 'manual-driver', 'aramex') */
  abstract readonly key: string;

  /** Human-readable provider name */
  abstract readonly name: string;

  /** What this provider can do */
  abstract readonly capabilities: ProviderCapabilities;

  /**
   * Create a shipment with this provider.
   *
   * For MANUAL providers this is a no-op that returns the provider key.
   * For CARRIER providers this would call the external API.
   */
  abstract createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult>;

  /**
   * Cancel a previously created shipment.
   *
   * M7.2.3-A: Providers that do not support cancellation MUST return
   * `{ supported: false, reason: '...' }` rather than silently doing nothing.
   */
  async cancelShipment(_shipmentId: string): Promise<CancelShipmentResult> {
    return { supported: false, reason: `${this.key} does not support shipment cancellation` };
  }

  /**
   * Cancel a previously scheduled carrier pickup.
   *
   * M7.3-B.3.2: Providers that do not support pickup cancellation MUST return
   * `{ supported: false, reason: '...' }` rather than silently doing nothing.
   * Only providers whose capabilities include canCancelPickup should override.
   */
  async cancelPickup(_request: CancelPickupRequest): Promise<CancelPickupResult> {
    return { supported: false, reason: `${this.key} does not support pickup cancellation` };
  }

  /**
   * Generate a shipping label.
   *
   * M7.2.3-A: Providers that do not support label generation MUST return
   * `{ supported: false, reason: '...' }` rather than returning null.
   */
  async generateLabel(_shipmentId: string): Promise<GenerateLabelResult> {
    return { supported: false, reason: `${this.key} does not support label generation` };
  }

  /**
   * Get tracking information.
   *
   * M7.2.3-A: Returns a typed TrackingInfo object.  Providers that do not
   * support tracking return null.
   */
  async getTrackingInfo(_trackingId: string): Promise<TrackingInfo | null> {
    return null;
  }

  /**
   * Validate a delivery address.
   * Optional — only providers with address validation implement this.
   */
  async validateAddress(_address: ShippingAddress): Promise<boolean> {
    return true;
  }

  /**
   * Map a carrier-specific status to an internal shipment status.
   *
   * M7.2.3-A: Returns a typed CarrierStatusMapping.  Providers that do not
   * support status mapping return null.
   */
  mapCarrierStatus(_carrierStatus: string): CarrierStatusMapping | null {
    return null;
  }
}
