import { and, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { stores } from '../merchant/merchant.schema';
import { shipments } from '../orders/shipment.schema';

export type CarrierWebhookShipmentResolution =
  { status: 'FOUND'; shipment: any } | { status: 'NOT_FOUND' } | { status: 'AMBIGUOUS' };

/**
 * Resolve an external carrier shipment reference only inside the organization
 * bound to the credential that authenticated the webhook. Provider IDs are
 * not globally unique across carrier accounts or tenants.
 */
export async function resolveShipmentForCredential(
  db: DatabaseService,
  credential: { orgId: string; providerKey: string },
  providerKey: string,
  externalDeliveryId: string,
): Promise<CarrierWebhookShipmentResolution> {
  if (credential.providerKey !== providerKey) {
    throw new Error('Webhook credential provider does not match event provider');
  }

  const orgStores = await db.db.query.stores.findMany({
    where: eq(stores.orgId, credential.orgId),
    columns: { id: true },
  });
  const storeIds = orgStores.map((store) => store.id);
  if (storeIds.length === 0) return { status: 'NOT_FOUND' };

  const candidates = await db.db.query.shipments.findMany({
    where: and(
      eq(shipments.carrierShipmentId, externalDeliveryId),
      eq(shipments.shippingProviderKey, providerKey),
      inArray(shipments.storeId, storeIds),
    ),
    limit: 2,
  });

  if (candidates.length > 1) return { status: 'AMBIGUOUS' };
  if (candidates.length === 1) return { status: 'FOUND', shipment: candidates[0] };
  return { status: 'NOT_FOUND' };
}
