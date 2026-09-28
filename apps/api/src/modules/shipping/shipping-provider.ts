import {
  ShippingProviderType,
  CreateShipmentRequest,
  CreateShipmentResult,
  CarrierStatusMapping,
  ProviderCapabilities,
  ShippingAddress,
} from './shipping.types';

/**
 * ShippingProvider — the contract every shipping provider must implement.
 *
 * The provider abstraction allows the platform to work with different
 * fulfillment methods (manual driver delivery, Aramex, SMSA, etc.)
 * through a single interface.  Only ManualDeliveryProvider is registered
 * in M7.2.1; external carriers will be added in later phases.
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
   * Optional — not all providers support cancellation.
   */
  async cancelShipment(_shipmentId: string): Promise<void> {
    // Default: no-op.  Override in providers that support cancellation.
  }

  /**
   * Generate a shipping label.
   * Optional — only providers with label support implement this.
   */
  async generateLabel(_shipmentId: string): Promise<string | null> {
    return null;
  }

  /**
   * Get tracking information.
   * Optional — only providers with tracking support implement this.
   */
  async getTrackingInfo(_trackingId: string): Promise<Record<string, unknown> | null> {
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
   * Optional — only carrier providers implement this.
   */
  mapCarrierStatus(_carrierStatus: string): CarrierStatusMapping | null {
    return null;
  }
}
