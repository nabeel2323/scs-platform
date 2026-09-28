import { Injectable } from '@nestjs/common';
import { ShippingProvider } from '../shipping-provider';
import {
  ShippingProviderType,
  CreateShipmentRequest,
  CreateShipmentResult,
  ProviderCapabilities,
} from '../shipping.types';

/**
 * ManualDeliveryProvider — default provider for driver-based delivery.
 *
 * This provider handles the current manual-driver workflow where a
 * platform-employed driver picks up and delivers orders directly.
 *
 * Characteristics:
 * - type: MANUAL
 * - key: 'manual-driver'
 * - No external API calls
 * - No fabricated tracking IDs
 * - No label generation
 * - Deterministic createShipment (returns provider key only)
 */
@Injectable()
export class ManualDeliveryProvider extends ShippingProvider {
  readonly type: ShippingProviderType = 'MANUAL';
  readonly key = 'manual-driver';
  readonly name = 'Manual Driver Delivery';

  readonly capabilities: ProviderCapabilities = {
    canCreateShipment: true,
    canCancel: false,
    canGenerateLabel: false,
    canTrack: false,
    canValidateAddress: false,
    canReceiveWebhooks: false,
  };

  /**
   * Create a manual-driver shipment.
   *
   * This is deterministic and side-effect-free — no external API calls,
   * no tracking ID generation, no label creation.  It simply records
   * that this shipment is handled by the manual driver workflow.
   */
  async createShipment(request: CreateShipmentRequest): Promise<CreateShipmentResult> {
    return {
      providerKey: this.key,
      metadata: {
        shipmentId: request.shipmentId,
        orderId: request.orderId,
        storeId: request.storeId,
      },
    };
  }
}
