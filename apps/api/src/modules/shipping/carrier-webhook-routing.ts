import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { MerchantService } from '../merchant/index';
import { OrdersService } from '../orders/index';

export type CarrierWebhookShipmentResolution =
  | { status: 'FOUND'; shipment: any }
  | { status: 'NOT_FOUND' }
  | { status: 'AMBIGUOUS' };

/** Tenant-safe router invoked only after the webhook credential is authenticated. */
@Injectable()
export class CarrierWebhookRoutingService {
  constructor(
    private readonly merchant: MerchantService,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
  ) {}

  async resolveShipmentForCredential(
    credential: { orgId: string; providerKey: string },
    providerKey: string,
    externalDeliveryId: string,
  ): Promise<CarrierWebhookShipmentResolution> {
    if (credential.providerKey !== providerKey) {
      throw new Error('Webhook credential provider does not match event provider');
    }
    const storeIds = await this.merchant.listStoreIdsForOrgSystem(credential.orgId);
    if (storeIds.length === 0) return { status: 'NOT_FOUND' };
    const candidates = await this.orders.findShipmentsByCarrierReference(
      providerKey,
      externalDeliveryId,
      storeIds,
    );
    if (candidates.length > 1) return { status: 'AMBIGUOUS' };
    if (candidates.length === 1) return { status: 'FOUND', shipment: candidates[0] };
    return { status: 'NOT_FOUND' };
  }
}
