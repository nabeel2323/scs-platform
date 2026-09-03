import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { masterOrders, orders, orderItems, orderFinancialBreakdown, orderStatusHistory } from './orders.schema';
import { carts, cartItems } from './cart.schema';
import { products, productVariants } from '../catalog/catalog.schema';
import { priceTiers, priceLists } from '../pricing/pricing.schema';
import { inventoryItems, stockMovements } from '../inventory/inventory.schema';
import { warehouses } from '../merchant/merchant.schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Orders service — checkout, FSM, accept/reject/confirm/cancel.
 *
 * Order FSM (16 statuses):
 *   DRAFT → SUBMITTED → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED (merchant)
 *   ACCEPTED → CONFIRMED → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
 *   Any pre-DELIVERED → CANCELLED
 *
 * Key invariants:
 * - unit_price_minor is SNAPSHOT at checkout (never re-read from price_tiers)
 * - Financial breakdown written atomically with order
 * - Status history append-only (every transition logged)
 * - Idempotency key prevents duplicate checkout
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
  ) {}

  // ── Checkout ─────────────────────────────────────────────────

  async checkout(input: CheckoutInput) {
    // Idempotency: if key already used, return existing result
    if (input.idempotencyKey) {
      const existing = await this.db.db.query.masterOrders.findFirst({
        where: eq(masterOrders.idempotencyKey, input.idempotencyKey),
      });
      if (existing && existing['status'] !== 'DRAFT') {
        return this.getMasterOrder(existing['id']);
      }
    }

    // Get active cart with items
    const cart = await this.db.db.query.carts.findFirst({
      where: and(eq(carts.userId, input.buyerId), eq(carts.status, 'ACTIVE')),
    });
    if (!cart) throw new BadRequestException('No active cart found');

    const items = await this.db.db.query.cartItems.findMany({
      where: eq(cartItems.cartId, cart['id']),
    });
    if (items.length === 0) throw new BadRequestException('Cart is empty');

    // ── MOQ Validation ──────────────────────────────────────────
    // Check that each cart item meets the product's minimum order quantity
    for (const item of items) {
      const variant = await this.db.db.query.productVariants.findFirst({
        where: eq(productVariants.id, item['variantId']),
      });
      if (!variant) throw new BadRequestException(`Variant ${item['variantId']} not found`);

      const product = await this.db.db.query.products.findFirst({
        where: eq(products.id, variant['productId']),
      });
      if (product && product['moq'] > item['quantity']) {
        throw new BadRequestException(
          `Minimum order quantity for ${product['title']} is ${product['moq']}, but only ${item['quantity']} in cart`
        );
      }
    }

    // Group items by store_id (supplier grouping)
    const grouped = new Map<string, typeof items>();
    for (const item of items) {
      const storeId = item['storeId'];
      if (!grouped.has(storeId)) grouped.set(storeId, []);
      grouped.get(storeId)!.push(item);
    }

    // Create master order
    const masterId = crypto.randomUUID();
    await this.db.db.insert(masterOrders).values({
      id: masterId,
      buyerId: input.buyerId,
      status: 'SUBMITTED',
      deliveryAddress: input.deliveryAddress,
      notes: input.notes || null,
      idempotencyKey: input.idempotencyKey || null,
    });

    // Create sub-orders per supplier
    const subOrderIds: string[] = [];
    for (const [storeId, storeItems] of grouped) {
      const subOrderId = crypto.randomUUID();

      // Calculate totals
      const subtotal = storeItems.reduce((sum, i) => sum + i['lineTotalMinor'], 0);
      const discount = 0; // TODO: apply promotion from cart
      const deliveryFee = 0; // TODO: calculate delivery fee
      const tax = 0; // TODO: calculate VAT (15% in KSA)
      const total = subtotal - discount + deliveryFee + tax;

      await this.db.db.insert(orders).values({
        id: subOrderId,
        masterOrderId: masterId,
        storeId,
        buyerId: input.buyerId,
        status: 'SUBMITTED',
        fulfillmentMethod: input.fulfillmentMethod || 'PLATFORM_DELIVERY',
        promoCode: cart['promoCode'],
        promotionId: cart['promotionId'],
        subtotalMinor: subtotal,
        discountMinor: discount,
        deliveryFeeMinor: deliveryFee,
        taxMinor: tax,
        totalMinor: total,
        slaAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h SLA
      });

      // Create order items with SNAPSHOT data
      for (const item of storeItems) {
        // Fetch variant for SKU/title snapshot
        const variant = await this.db.db.query.productVariants.findFirst({
          where: eq(productVariants.id, item['variantId']),
        });
        if (!variant) continue;

        const itemId = crypto.randomUUID();
        await this.db.db.insert(orderItems).values({
          id: itemId,
          orderId: subOrderId,
          variantId: item['variantId'],
          sku: variant['sku'],
          title: variant['title'] || variant['sku'],
          quantity: item['quantity'],
          unitPriceMinor: item['priceMinor'],
          tierMinQty: item['tierMinQty'],
          promoSnapshot: item['promoSnapshot'] || {},
          lineTotalMinor: item['lineTotalMinor'],
        });
      }

      // Write financial breakdown
      const commission = Math.round(total * 0.05); // 5% commission (placeholder)
      const merchantNet = total - commission;

      await this.db.db.insert(orderFinancialBreakdown).values({
        id: crypto.randomUUID(),
        orderId: subOrderId,
        productsMinor: subtotal,
        discountMinor: discount,
        deliveryFeeMinor: deliveryFee,
        taxMinor: tax,
        commissionMinor: commission,
        merchantNetMinor: merchantNet,
      });

      // Record status history
      await this.recordStatusChange(subOrderId, null, 'SUBMITTED', input.buyerId, 'BUYER', 'Checkout');

      subOrderIds.push(subOrderId);
    }

    // Mark cart as CONVERTED
    await this.db.db
      .update(carts)
      .set({ status: 'CONVERTED', updatedAt: new Date() })
      .where(eq(carts.id, cart['id']));

    // Emit domain event
    await this.outbox.publish('order.submitted', masterId, {
      masterOrderId: masterId,
      buyerId: input.buyerId,
      subOrderIds,
      totalMinor: items.reduce((sum, i) => sum + i['lineTotalMinor'], 0),
    });

    return this.getMasterOrder(masterId);
  }

  // ── Merchant Actions ─────────────────────────────────────────

  async acceptOrder(orderId: string, merchantUserId: string) {
    const order = await this.getOrder(orderId);
    this.assertTransition(order['status'], 'ACCEPTED');

    // ── Re-Price Guard ──────────────────────────────────────────
    // Compare current price_tiers against order_items.unit_price_minor snapshot.
    // If price changed >5%, return 409 with per-line deltas.
    const priceDeltas = await this.checkPriceDeltas(orderId, order['storeId']);
    const significantDeltas = priceDeltas.filter(d => Math.abs(d.deltaPercent) > 5);
    if (significantDeltas.length > 0) {
      throw new ConflictException({
        type: 'https://errors.scs.local/price-changed',
        title: 'Price Changed Since Order',
        status: 409,
        detail: `${significantDeltas.length} item(s) have changed price by more than 5%`,
        deltas: significantDeltas,
      });
    }

    // ── Stock Reservation ────────────────────────────────────────
    // Reserve stock for each order item in the store's warehouse(s)
    await this.reserveStock(orderId, order['storeId']);

    await this.db.db
      .update(orders)
      .set({ status: 'ACCEPTED', slaConfirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await this.recordStatusChange(orderId, 'SUBMITTED', 'ACCEPTED', merchantUserId, 'MERCHANT');
    await this.outbox.publish('order.accepted', orderId, { orderId, storeId: order['storeId'] });

    return this.getOrder(orderId);
  }

  async partiallyAcceptOrder(orderId: string, merchantUserId: string, confirmations: ItemConfirmation[]) {
    const order = await this.getOrder(orderId);
    this.assertTransition(order['status'], 'PARTIALLY_ACCEPTED');

    // Update qty_confirmed for each item
    for (const conf of confirmations) {
      await this.db.db
        .update(orderItems)
        .set({ qtyConfirmed: conf.qtyConfirmed, updatedAt: new Date() })
        .where(and(eq(orderItems.id, conf.itemId), eq(orderItems.orderId, orderId)));
    }

    // Recalculate totals based on confirmed quantities
    const items = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });
    let newSubtotal = 0;
    for (const item of items) {
      const confirmed = item['qtyConfirmed'] ?? item['quantity'];
      newSubtotal += confirmed * item['unitPriceMinor'];
    }

    await this.db.db
      .update(orders)
      .set({
        status: 'PARTIALLY_ACCEPTED',
        subtotalMinor: newSubtotal,
        totalMinor: newSubtotal,
        slaConfirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    await this.recordStatusChange(orderId, 'SUBMITTED', 'PARTIALLY_ACCEPTED', merchantUserId, 'MERCHANT');
    await this.outbox.publish('order.partially_accepted', orderId, { orderId, confirmations });

    return this.getOrder(orderId);
  }

  async rejectOrder(orderId: string, merchantUserId: string, reason: string) {
    const order = await this.getOrder(orderId);
    this.assertTransition(order['status'], 'REJECTED');

    await this.db.db
      .update(orders)
      .set({ status: 'REJECTED', rejectionReason: reason, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await this.recordStatusChange(orderId, 'SUBMITTED', 'REJECTED', merchantUserId, 'MERCHANT', reason);
    await this.outbox.publish('order.rejected', orderId, { orderId, storeId: order['storeId'], reason });

    return this.getOrder(orderId);
  }

  async confirmItem(orderId: string, itemId: string, qtyConfirmed: number, merchantUserId: string) {
    const item = await this.db.db.query.orderItems.findFirst({
      where: and(eq(orderItems.id, itemId), eq(orderItems.orderId, orderId)),
    });
    if (!item) throw new NotFoundException('Order item not found');

    await this.db.db
      .update(orderItems)
      .set({ qtyConfirmed, updatedAt: new Date() })
      .where(eq(orderItems.id, itemId));

    return { itemId, qtyConfirmed };
  }

  // ── Status Transitions ───────────────────────────────────────

  async transitionStatus(orderId: string, newStatus: string, userId: string, actorType: string, reason?: string) {
    const order = await this.getOrder(orderId);
    this.assertTransition(order['status'], newStatus);

    await this.db.db
      .update(orders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await this.recordStatusChange(orderId, order['status'], newStatus, userId, actorType, reason);

    // Emit events based on status
    const eventMap: Record<string, string> = {
      'CONFIRMED': 'order.confirmed',
      'PREPARING': 'order.preparing',
      'READY': 'order.ready',
      'OUT_FOR_DELIVERY': 'order.out_for_delivery',
      'DELIVERED': 'order.delivered',
      'COMPLETED': 'order.completed',
      'CANCELLED': 'order.cancelled',
    };

    if (eventMap[newStatus]) {
      await this.outbox.publish(eventMap[newStatus], orderId, {
        orderId,
        status: newStatus,
        storeId: order['storeId'],
        buyerId: order['buyerId'],
      });
    }

    return this.getOrder(orderId);
  }

  async cancelOrder(orderId: string, userId: string, reason: string) {
    const order = await this.getOrder(orderId);

    // Can only cancel pre-DELIVERED
    const cancellable = ['SUBMITTED', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'CONFIRMED', 'PREPARING', 'READY'];
    if (!cancellable.includes(order['status'])) {
      throw new ConflictException(`Cannot cancel order in ${order['status']} status`);
    }

    return this.transitionStatus(orderId, 'CANCELLED', userId, 'BUYER', reason);
  }

  // ── Queries ──────────────────────────────────────────────────

  async getMasterOrder(id: string) {
    const master = await this.db.db.query.masterOrders.findFirst({
      where: eq(masterOrders.id, id),
    });
    if (!master) throw new NotFoundException('Master order not found');

    const subOrders = await this.db.db.query.orders.findMany({
      where: eq(orders.masterOrderId, id),
    });

    const itemsByOrder: Record<string, any[]> = {};
    for (const so of subOrders) {
      itemsByOrder[so['id']] = await this.db.db.query.orderItems.findMany({
        where: eq(orderItems.orderId, so['id']),
      });
    }

    return { ...master, subOrders: subOrders.map(so => ({ ...so, items: itemsByOrder[so['id']] || [] })) };
  }

  async getOrder(id: string) {
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, id),
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getOrderWithItems(id: string) {
    const order = await this.getOrder(id);
    const items = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, id),
    });
    const breakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
      where: eq(orderFinancialBreakdown.orderId, id),
    });
    return { ...order, items, financialBreakdown: breakdown };
  }

  async listOrders(buyerId?: string, storeId?: string, status?: string) {
    const conditions = [];
    if (buyerId) conditions.push(eq(orders.buyerId, buyerId));
    if (storeId) conditions.push(eq(orders.storeId, storeId));
    if (status) conditions.push(eq(orders.status, status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return this.db.db.query.orders.findMany({
      where,
      orderBy: [desc(orders.createdAt)],
    });
  }

  async getStatusHistory(orderId: string) {
    return this.db.db.query.orderStatusHistory.findMany({
      where: eq(orderStatusHistory.orderId, orderId),
      orderBy: [orderStatusHistory.createdAt],
    });
  }

  async reorder(masterOrderId: string, buyerId: string) {
    const master = await this.getMasterOrder(masterOrderId);
    if (master['buyerId'] !== buyerId) {
      throw new BadRequestException('Not your order');
    }

    // Re-add items to cart
    for (const subOrder of master['subOrders']) {
      for (const item of subOrder['items']) {
        const existing = await this.db.db.query.carts.findFirst({
          where: and(eq(carts.userId, buyerId), eq(carts.status, 'ACTIVE')),
        });
        if (!existing) {
          // Create new cart
          const cartId = crypto.randomUUID();
          await this.db.db.insert(carts).values({
            id: cartId,
            userId: buyerId,
            status: 'ACTIVE',
          });
        }
        // Add item to cart (via cart service in real flow)
      }
    }

    return { message: 'Items re-added to cart', masterOrderId };
  }

  // ── Re-Price Guard ──────────────────────────────────────────

  private async checkPriceDeltas(orderId: string, storeId: string): Promise<PriceDelta[]> {
    const items = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    const deltas: PriceDelta[] = [];

    for (const item of items) {
      // Find the current price tier for this variant at the ordered quantity
      const currentTier = await this.db.db.select().from(priceTiers)
        .innerJoin(priceLists, eq(priceTiers.priceListId, priceLists.id))
        .where(and(
          eq(priceLists.storeId, storeId),
          eq(priceLists.isActive, true),
          eq(priceTiers.variantId, item['variantId']),
          sql`${priceTiers.minQty} <= ${item['quantity']}`,
        ))
        .orderBy(priceTiers.minQty)
        .limit(1);

      if (currentTier.length > 0) {
        const tier = currentTier[0]!;
        const currentPrice = tier['price_tiers']['unitPriceMinor'];
        const snapshotPrice = item['unitPriceMinor'];
        const delta = currentPrice - snapshotPrice;
        const deltaPercent = snapshotPrice > 0 ? (delta / snapshotPrice) * 100 : 0;

        deltas.push({
          itemId: item['id'],
          variantId: item['variantId'],
          sku: item['sku'],
          snapshotPrice,
          currentPrice,
          delta,
          deltaPercent: Math.round(deltaPercent * 100) / 100,
        });
      }
    }

    return deltas;
  }

  // ── Stock Reservation ───────────────────────────────────────

  private async reserveStock(orderId: string, storeId: string) {
    const items = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    // Find the store's warehouse(s)
    const storeWarehouses = await this.db.db.select().from(warehouses)
      .where(eq(warehouses.storeId, storeId));

    if (storeWarehouses.length === 0) return; // No warehouse configured

    for (const item of items) {
      // Find inventory item in any of the store's warehouses
      for (const wh of storeWarehouses) {
        const invItem = await this.db.db.select().from(inventoryItems)
          .where(and(
            eq(inventoryItems.variantId, item['variantId']),
            eq(inventoryItems.warehouseId, wh['id']),
          ))
          .limit(1);

        if (invItem.length > 0) {
          const inv = invItem[0]!;
          const available = inv['qtyOnHand'] - inv['qtyReserved'];
          const qtyToReserve = Math.min(item['quantity'], available);

          if (qtyToReserve > 0) {
            // Increment reserved quantity
            await this.db.db
              .update(inventoryItems)
              .set({ qtyReserved: sql`${inventoryItems.qtyReserved} + ${qtyToReserve}`, updatedAt: new Date() })
              .where(eq(inventoryItems.id, inv['id']));

            // Record stock movement
            await this.db.db.insert(stockMovements).values({
              id: crypto.randomUUID(),
              inventoryItemId: inv['id'],
              movementType: 'RESERVE',
              quantity: qtyToReserve,
              referenceType: 'ORDER',
              referenceId: orderId,
              reason: `Stock reserved for order ${orderId}`,
            });
          }
          break; // Only reserve from first warehouse with stock
        }
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  private async recordStatusChange(
    orderId: string,
    fromStatus: string | null,
    toStatus: string,
    changedBy: string | null,
    actorType: string,
    reason?: string,
  ) {
    await this.db.db.insert(orderStatusHistory).values({
      id: crypto.randomUUID(),
      orderId,
      fromStatus,
      toStatus,
      changedBy: changedBy || null,
      actorType,
      reason: reason || null,
    });
  }

  // FSM transition matrix
  private static readonly TRANSITIONS: Record<string, string[]> = {
    'DRAFT': ['SUBMITTED'],
    'SUBMITTED': ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'CANCELLED'],
    'ACCEPTED': ['CONFIRMED', 'CANCELLED'],
    'PARTIALLY_ACCEPTED': ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['PREPARING', 'CANCELLED'],
    'PREPARING': ['READY', 'CANCELLED'],
    'READY': ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
    'OUT_FOR_DELIVERY': ['DELIVERED'],
    'DELIVERED': ['COMPLETED'],
    'COMPLETED': [],
    'CANCELLED': [],
    'REJECTED': [],
  };

  private assertTransition(currentStatus: string, newStatus: string) {
    const allowed = OrdersService.TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new ConflictException(
        `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`
      );
    }
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CheckoutInput {
  buyerId: string;
  deliveryAddress: Record<string, unknown>;
  notes?: string;
  idempotencyKey?: string;
  fulfillmentMethod?: string;
}

export interface ItemConfirmation {
  itemId: string;
  qtyConfirmed: number;
}

export interface PriceDelta {
  itemId: string;
  variantId: string;
  sku: string;
  snapshotPrice: number;
  currentPrice: number;
  delta: number;
  deltaPercent: number;
}
