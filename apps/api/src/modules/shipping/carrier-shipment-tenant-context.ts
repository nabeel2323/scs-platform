import { eq } from 'drizzle-orm';
import { orders } from '../orders/orders.schema';

export interface CarrierShipmentTenantContext {
  orgId: string;
  storeId: string;
  orderId: string;
}

interface CarrierShipmentLike {
  orderId?: unknown;
  order_id?: unknown;
  storeId?: unknown;
  store_id?: unknown;
}

interface CarrierTenantContextDependencies {
  withWorkerContext: <T>(operation: () => Promise<T>, activeOrgId?: string) => Promise<T>;
  merchant: {
    getStoreTenantContextForSystem(storeId: string): Promise<{ id: string; orgId: string | null } | null>;
  };
  db: {
    db: {
      query: {
        orders: {
          findFirst(args: any): Promise<{ storeId: string } | undefined>;
        };
      };
    };
  };
}

/** Resolve authoritative store ownership, then verify the independent order/store link. */
export async function resolveCarrierShipmentTenantContext(
  shipment: CarrierShipmentLike,
  dependencies: CarrierTenantContextDependencies,
): Promise<CarrierShipmentTenantContext | null> {
  const storeId = shipment.storeId ?? shipment.store_id;
  const orderId = shipment.orderId ?? shipment.order_id;
  if (typeof storeId !== 'string' || !storeId.trim() ||
      typeof orderId !== 'string' || !orderId.trim()) return null;

  const store = await dependencies.withWorkerContext(
    () => dependencies.merchant.getStoreTenantContextForSystem(storeId),
  );
  if (!store || store.id !== storeId || typeof store.orgId !== 'string' || !store.orgId.trim()) {
    return null;
  }

  const order = await dependencies.withWorkerContext(
    () => dependencies.db.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: { storeId: true },
    }),
    store.orgId,
  );
  if (!order || order.storeId !== storeId) return null;

  return { orgId: store.orgId, storeId, orderId };
}
