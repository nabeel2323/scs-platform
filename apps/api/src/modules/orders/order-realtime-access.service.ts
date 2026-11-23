import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { masterOrders, orders } from './orders.schema';
import { shipments } from './shipment.schema';

export type RealtimeOrderRoomAccess =
  | { kind: 'order'; buyerId: string; storeId: string }
  | { kind: 'masterOrder'; buyerId: string };

/**
 * Narrow read-only contract for Realtime room authorization.
 * Order and shipment table ownership stays inside the Orders module.
 */
@Injectable()
export class OrderRealtimeAccessService {
  constructor(private readonly db: DatabaseService) {}

  async getRoomAccess(orderOrMasterOrderId: string): Promise<RealtimeOrderRoomAccess | null> {
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, orderOrMasterOrderId),
      columns: { buyerId: true, storeId: true },
    });
    if (order) {
      return {
        kind: 'order',
        buyerId: order.buyerId,
        storeId: order.storeId,
      };
    }

    const masterOrder = await this.db.db.query.masterOrders.findFirst({
      where: eq(masterOrders.id, orderOrMasterOrderId),
      columns: { buyerId: true },
    });
    if (!masterOrder) return null;

    return { kind: 'masterOrder', buyerId: masterOrder.buyerId };
  }

  async isDriverAssignedToOrder(orderId: string, driverId: string): Promise<boolean> {
    const assignment = await this.db.db.query.shipments.findFirst({
      where: and(eq(shipments.orderId, orderId), eq(shipments.assignedDriverId, driverId)),
      columns: { id: true },
    });
    return Boolean(assignment);
  }
}
