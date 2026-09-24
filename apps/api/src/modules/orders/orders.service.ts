import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import {
  masterOrders,
  orders,
  orderItems,
  orderFinancialBreakdown,
  orderStatusHistory,
} from './orders.schema';
import { carts, cartItems } from './cart.schema';
import { CartService } from './cart.service';
import { products, productVariants } from '../catalog/catalog.schema';
import { merchantOffers } from '../catalog/catalog.offer.schema';
import { resolveOfferPrices } from '../pricing/price-resolution';
import { inventoryItems, stockMovements } from '../inventory/inventory.schema';
import { outboxEvents } from '../audit/audit.schema';
import { warehouses, stores } from '../merchant/merchant.schema';
import { PromotionsService } from '../promotions/promotions.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { organizationMembers } from '../identity/identity.schema';
import {
  computeOrderFinancials,
  resolveDeliveryFeeMinor,
  DEFAULT_VAT_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_PLATFORM_DELIVERY_FEE_MINOR,
} from './order-pricing';
import { attachBuyerContacts, attachItemCounts, attachOrderIdentity, totalsByCurrency } from './order-identity';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import {
  CallerContext,
  assertOrderAccessible,
  assertMasterOrderAccessible,
  assertStoreInOrg,
  isTenantPrivileged,
} from '../../common/tenant-scope';

/**
 * Orders service — checkout, FSM, accept/reject/confirm/cancel.
 *
 * Order FSM (16 statuses — canonical per Implementation Plan §5):
 *   DRAFT → SUBMITTED → PENDING_CONFIRMATION → ACCEPTED | PARTIALLY_ACCEPTED | REJECTED | CANCELLED
 *   ACCEPTED/PARTIAL → PREPARING → READY → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
 *   Future: PAYMENT_PENDING (P3), ASSIGNED/PICKED_UP (P2), DISPUTED (P1 lite)
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
    private readonly promotions: PromotionsService,
    // Optional so existing unit tests that build the service with the three core
    // deps keep compiling; supplied by the @Global RealtimeModule at runtime.
    @Optional() private readonly realtime?: RealtimeGateway,
    // A4-7: reorder replays an old order through the same validated cart path.
    // Optional only so the existing specs (which construct the service directly)
    // keep compiling — `reorder` refuses loudly rather than silently doing
    // nothing if the provider is ever missing.
    @Optional() private readonly cart?: CartService,
    // Merchant "new order" alerts. Optional so the many specs that construct
    // this service by hand keep compiling; supplied by the @Global
    // NotificationsModule at runtime. Fan-out is skipped entirely when absent.
    @Optional() private readonly notifications?: NotificationsService,
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
          `Minimum order quantity for ${product['title']} is ${product['moq']}, but only ${item['quantity']} in cart`,
        );
      }
    }

    // ── PHASE 11: Offer Re-Validation ────────────────────────────────────
    // Verify every referenced merchant offer is still ACTIVE; a suspended or
    // withdrawn offer means the cart's price snapshot is stale.
    // PHASE 15 upgrade: also build an immutable per-offer snapshot to persist
    // on order_items.offer_snapshot so historical orders survive later edits.
    const offerIds = items.map(i => i['offerId']).filter(Boolean) as string[];
    const offerSnapshotById = new Map<string, {
      id: string;
      storeId: string;
      priceListId: string | null;
      warehouseId: string | null;
      basePriceMinor: number | null;
      compareAtPriceMinor: number | null;
      currency: string;
      moq: number;
      orderIncrement: number | null;
      leadTimeDays: number | null;
      snapshotStatus: string;
      capturedAt: string;
    }>();
    if (offerIds.length > 0) {
      const fullOffers = await this.db.db.query.merchantOffers.findMany({
        where: inArray(merchantOffers.id, offerIds),
      });
      const activeSet = new Set(fullOffers.filter(o => o.status === 'ACTIVE').map(o => o.id));
      for (const item of items) {
        const oid = item['offerId'] as string | null;
        if (oid && !activeSet.has(oid)) {
          throw new BadRequestException(
            'A seller\'s offer for one of your items is no longer active. Please review your cart.',
          );
        }
      }
      // Build the snapshot for every referenced ACTIVE offer. `capturedAt` is
      // taken once per checkout so all lines share a logical commit timestamp.
      const capturedAt = new Date().toISOString();
      for (const o of fullOffers) {
        offerSnapshotById.set(o.id, {
          id: o.id,
          storeId: o.storeId,
          priceListId: o.priceListId ?? null,
          warehouseId: o.warehouseId ?? null,
          basePriceMinor: o.basePriceMinor ?? null,
          compareAtPriceMinor: o.compareAtPriceMinor ?? null,
          currency: o.currency,
          moq: o.moq,
          orderIncrement: o.orderIncrement ?? null,
          leadTimeDays: o.leadTimeDays ?? null,
          snapshotStatus: o.status,
          capturedAt,
        });
      }
    }

    // Group items by store_id (supplier grouping)
    const grouped = new Map<string, typeof items>();
    for (const item of items) {
      const storeId = item['storeId'];
      if (!grouped.has(storeId)) grouped.set(storeId, []);
      grouped.get(storeId)!.push(item);
    }

    // ── Pricing policy (env-overridable; see order-pricing.ts for Phase 1 defaults)
    const vatRate = Number(process.env['VAT_RATE'] ?? DEFAULT_VAT_RATE);
    const commissionRate = Number(process.env['COMMISSION_RATE'] ?? DEFAULT_COMMISSION_RATE);
    const platformDeliveryFee = Number(
      process.env['PLATFORM_DELIVERY_FEE_MINOR'] ?? DEFAULT_PLATFORM_DELIVERY_FEE_MINOR,
    );
    const fulfillmentMethod = input.fulfillmentMethod || 'PLATFORM_DELIVERY';
    const deliveryFee = resolveDeliveryFeeMinor(fulfillmentMethod, platformDeliveryFee);

    // Read store metadata before the transaction (read-only, safe outside).
    const currencyByStore = new Map<string, string>();
    const orgIdByStore = new Map<string, string>();
    const storeRows = await this.db.db.query.stores.findMany({
      where: inArray(stores.id, [...grouped.keys()]),
      columns: { id: true, currency: true, orgId: true },
    });
    for (const store of storeRows) {
      currencyByStore.set(store['id'], store['currency']);
      if (store['orgId']) orgIdByStore.set(store['id'], store['orgId']);
    }

    // Pre-compute per-store promotions outside the transaction (the promotion
    // service manages its own DB connection).
    const promoDataByStore = new Map<string, { promo: any; discount: number }>();
    for (const [storeId, storeItems] of grouped) {
      const subtotal = storeItems.reduce((sum, i) => sum + i['lineTotalMinor'], 0);
      const hasPromo = Boolean(cart['promotionId'] || cart['promoCode']);
      const promo = hasPromo
        ? await this.promotions.resolveApplicable(storeId, {
            promotionId: cart['promotionId'],
            code: cart['promoCode'],
            userId: input.buyerId,
          })
        : null;
      const discount = promo ? this.promotions.calculateDiscount(promo, subtotal) : 0;
      promoDataByStore.set(storeId, { promo, discount });
    }

    // ── CHECKOUT TRANSACTION ──────────────────────────────────────────────
    // All writes (master order, sub-orders, items, financials, status history,
    // cart conversion) are atomic. If any step fails, everything rolls back.
    const masterId = crypto.randomUUID();
    const subOrderIds: string[] = [];
    const subOrderData: { id: string; storeId: string; totalMinor: number; itemCount: number }[] = [];
    let grandTotalMinor = 0;

    await this.db.db.transaction(async (tx) => {
      await tx.insert(masterOrders).values({
        id: masterId,
        buyerId: input.buyerId,
        status: 'SUBMITTED',
        deliveryAddress: input.deliveryAddress,
        notes: input.notes || null,
        idempotencyKey: input.idempotencyKey || null,
      });

      for (const [storeId, storeItems] of grouped) {
        const subOrderId = crypto.randomUUID();
        const subtotal = storeItems.reduce((sum, i) => sum + i['lineTotalMinor'], 0);
        const { promo, discount } = promoDataByStore.get(storeId)!;

        const fin = computeOrderFinancials({
          subtotalMinor: subtotal,
          discountMinor: discount,
          deliveryFeeMinor: deliveryFee,
          vatRate,
          commissionRate,
        });
        grandTotalMinor += fin.totalMinor;

        await tx.insert(orders).values({
          id: subOrderId,
          masterOrderId: masterId,
          storeId,
          buyerId: input.buyerId,
          status: 'SUBMITTED',
          fulfillmentMethod,
          promoCode: promo ? cart['promoCode'] || promo['code'] : null,
          promotionId: promo ? promo['id'] : null,
          subtotalMinor: fin.productsMinor,
          discountMinor: fin.discountMinor,
          deliveryFeeMinor: fin.deliveryFeeMinor,
          taxMinor: fin.taxMinor,
          totalMinor: fin.totalMinor,
          currency: currencyByStore.get(storeId) ?? null,
          slaAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        });

        for (const item of storeItems) {
          const variant = await tx.query.productVariants.findFirst({
            where: eq(productVariants.id, item['variantId']),
          });
          if (!variant) continue;

          const itemOfferId = (item['offerId'] as string | null) ?? null;
          const offerSnapshot = itemOfferId ? offerSnapshotById.get(itemOfferId) ?? null : null;
          await tx.insert(orderItems).values({
            id: crypto.randomUUID(),
            orderId: subOrderId,
            variantId: item['variantId'],
            sku: variant['sku'],
            title: variant['title'] || variant['sku'],
            quantity: item['quantity'],
            unitPriceMinor: item['priceMinor'],
            tierMinQty: item['tierMinQty'],
            offerId: itemOfferId,
            offerSnapshot,
            promoSnapshot: item['promoSnapshot'] || {},
            lineTotalMinor: item['lineTotalMinor'],
          });
        }

        await tx.insert(orderFinancialBreakdown).values({
          id: crypto.randomUUID(),
          orderId: subOrderId,
          productsMinor: fin.productsMinor,
          discountMinor: fin.discountMinor,
          deliveryFeeMinor: fin.deliveryFeeMinor,
          taxMinor: fin.taxMinor,
          commissionMinor: fin.commissionMinor,
          merchantNetMinor: fin.merchantNetMinor,
        });

        // Inline status history write (uses tx, not this.db.db)
        await tx.insert(orderStatusHistory).values({
          id: crypto.randomUUID(),
          orderId: subOrderId,
          fromStatus: null,
          toStatus: 'SUBMITTED',
          changedBy: input.buyerId,
          actorType: 'BUYER',
          reason: 'Checkout',
        });

        subOrderIds.push(subOrderId);
        subOrderData.push({ id: subOrderId, storeId, totalMinor: fin.totalMinor, itemCount: storeItems.length });
      }

      // Mark cart as CONVERTED
      await tx
        .update(carts)
        .set({ status: 'CONVERTED', updatedAt: new Date() })
        .where(eq(carts.id, cart['id']));

      // Write outbox event inside the transaction (transactional outbox pattern)
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'order.submitted',
        aggregateId: masterId,
        payload: {
          masterOrderId: masterId,
          buyerId: input.buyerId,
          subOrderIds,
          totalMinor: grandTotalMinor,
        },
        metadata: {},
        status: 'PENDING',
      });
    });

    // ── Post-transaction side effects (best-effort, never fail a committed checkout) ──

    // Promotion redemption (promotion service manages its own DB connection)
    for (const [storeId, storeItems] of grouped) {
      const { promo, discount } = promoDataByStore.get(storeId)!;
      const sub = subOrderData.find(s => s.storeId === storeId);
      if (promo && discount > 0 && sub) {
        try {
          await this.promotions.redeemPromotion(promo['id'], input.buyerId, sub.id, discount);
        } catch {
          /* best-effort — order is already committed */
        }
      }
    }

    // Auto-advance all sub-orders: SUBMITTED → PENDING_CONFIRMATION
    for (const sub of subOrderData) {
      await this.autoAdvanceToPendingConfirmation(sub.id, input.buyerId, sub.storeId);
    }

    // ── Merchant alerting (best-effort side effects of a committed order) ──
    // Push a realtime "new order" banner into each selling store's room and
    // persist an in-app notification per org member (the gateway also pushes
    // those, refreshing the nav unread badge). The order, financials and outbox
    // event are already committed above, so nothing here may fail the checkout:
    // each call is guarded by the optional deps and swallows its own errors.
    const orderAlertedAt = new Date().toISOString();
    for (const s of subOrderData) {
      try {
        this.realtime?.emitNewOrder?.(s.storeId, {
          masterOrderId: masterId,
          orderId: s.id,
          storeId: s.storeId,
          totalMinor: s.totalMinor,
          itemCount: s.itemCount,
          createdAt: orderAlertedAt,
        });
      } catch {
        /* realtime is best-effort — never fail a placed order */
      }
    }
    await this.notifyStoreMerchants(masterId, subOrderData, orgIdByStore);

    return this.getMasterOrder(masterId);
  }

  /**
   * Auto-advance order from SUBMITTED to PENDING_CONFIRMATION.
   * Notifies the merchant and starts the SLA timer for response.
   */
  private async autoAdvanceToPendingConfirmation(
    orderId: string,
    buyerId: string,
    storeId: string,
  ) {
    await this.db.db
      .update(orders)
      .set({ status: 'PENDING_CONFIRMATION', updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await this.recordStatusChange(
      orderId,
      'SUBMITTED',
      'PENDING_CONFIRMATION',
      buyerId,
      'SYSTEM',
      'Auto-advance: merchant notified, SLA timer started',
    );

    // Publish outbox event — merchant notification + SLA timer
    await this.outbox.publish('order.pending_confirmation', orderId, {
      orderId,
      storeId,
      buyerId,
      slaDeadlineMinutes: 15, // 15-min SLA for merchant to respond
    });
  }

  /**
   * Persist an in-app "new order" notification for every ACTIVE member of each
   * selling org so merchants see it in the notifications bell and the nav unread
   * badge refreshes over the realtime push. Members of one org are fetched once
   * (cached per org) even when a cart spans several of that org's stores.
   * Best-effort and dependency-guarded: a missing NotificationsService (isolated
   * unit specs) or a delivery error must never fail a committed checkout.
   */
  private async notifyStoreMerchants(
    masterOrderId: string,
    subOrders: { id: string; storeId: string; itemCount: number }[],
    orgIdByStore: Map<string, string>,
  ) {
    if (!this.notifications) return;
    try {
      const membersByOrg = new Map<string, string[]>();
      for (const s of subOrders) {
        const orgId = orgIdByStore.get(s.storeId);
        if (!orgId) continue;
        let userIds = membersByOrg.get(orgId);
        if (!userIds) {
          const members = await this.db.db.query.organizationMembers.findMany({
            where: and(
              eq(organizationMembers.orgId, orgId),
              eq(organizationMembers.status, 'ACTIVE'),
            ),
            columns: { userId: true },
          });
          userIds = members.map((m) => m['userId']);
          membersByOrg.set(orgId, userIds);
        }
        for (const userId of userIds) {
          await this.notifications.send(userId, 'order.submitted', {
            orderId: s.id,
            storeId: s.storeId,
            masterOrderId,
            itemCount: s.itemCount,
          });
        }
      }
    } catch (err) {
      console.warn(
        '[Orders] new-order merchant notification fan-out failed (non-fatal):',
        (err as Error)?.message,
      );
    }
  }

  // ── Merchant Actions ─────────────────────────────────────────

  async acceptOrder(orderId: string, merchantUserId: string, caller?: CallerContext) {
    const order = await this.getOrder(orderId);
    if (caller) await assertOrderAccessible(this.db, caller, order);
    // Accept from PENDING_CONFIRMATION (or SUBMITTED for backward compat — auto-advance first)
    let currentStatus = order['status'];
    if (currentStatus === 'SUBMITTED') {
      await this.autoAdvanceToPendingConfirmation(orderId, order['buyerId'], order['storeId']);
      currentStatus = 'PENDING_CONFIRMATION';
    }
    this.assertTransition(currentStatus, 'ACCEPTED');

    // ── Re-Price Guard ──────────────────────────────────────────
    // Compare current price_tiers against order_items.unit_price_minor snapshot.
    // If price changed >5%, return 409 with per-line deltas.
    const priceDeltas = await this.checkPriceDeltas(orderId, order['storeId']);
    const significantDeltas = priceDeltas.filter((d) => Math.abs(d.deltaPercent) > 5);
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

    await this.recordStatusChange(orderId, currentStatus, 'ACCEPTED', merchantUserId, 'MERCHANT');
    await this.outbox.publish('order.accepted', orderId, { orderId, storeId: order['storeId'] });

    return this.getOrder(orderId);
  }

  async partiallyAcceptOrder(
    orderId: string,
    merchantUserId: string,
    confirmations: ItemConfirmation[],
    caller?: CallerContext,
  ) {
    const order = await this.getOrder(orderId);
    if (caller) await assertOrderAccessible(this.db, caller, order);
    let currentStatus = order['status'];
    if (currentStatus === 'SUBMITTED') {
      await this.autoAdvanceToPendingConfirmation(orderId, order['buyerId'], order['storeId']);
      currentStatus = 'PENDING_CONFIRMATION';
    }
    this.assertTransition(currentStatus, 'PARTIALLY_ACCEPTED');

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

    await this.recordStatusChange(
      orderId,
      currentStatus,
      'PARTIALLY_ACCEPTED',
      merchantUserId,
      'MERCHANT',
    );
    await this.outbox.publish('order.partially_accepted', orderId, { orderId, confirmations });

    return this.getOrder(orderId);
  }

  async rejectOrder(orderId: string, merchantUserId: string, reason: string, caller?: CallerContext) {
    const order = await this.getOrder(orderId);
    if (caller) await assertOrderAccessible(this.db, caller, order);
    let currentStatus = order['status'];
    if (currentStatus === 'SUBMITTED') {
      await this.autoAdvanceToPendingConfirmation(orderId, order['buyerId'], order['storeId']);
      currentStatus = 'PENDING_CONFIRMATION';
    }
    this.assertTransition(currentStatus, 'REJECTED');

    // A4-4: REJECTED is written directly rather than through transitionStatus,
    // so the release has to be triggered here too.
    await this.settleStockForStatus(orderId, 'REJECTED', merchantUserId);

    await this.db.db
      .update(orders)
      .set({ status: 'REJECTED', rejectionReason: reason, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await this.recordStatusChange(
      orderId,
      currentStatus,
      'REJECTED',
      merchantUserId,
      'MERCHANT',
      reason,
    );
    await this.outbox.publish('order.rejected', orderId, {
      orderId,
      storeId: order['storeId'],
      reason,
    });

    return this.getOrder(orderId);
  }

  async confirmItem(orderId: string, itemId: string, qtyConfirmed: number, merchantUserId: string, caller?: CallerContext) {
    if (caller) {
      const order = await this.getOrder(orderId);
      await assertOrderAccessible(this.db, caller, order);
    }
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

  async transitionStatus(
    orderId: string,
    newStatus: string,
    userId: string,
    actorType: string,
    reason?: string,
    caller?: CallerContext,
  ) {
    const order = await this.getOrder(orderId);
    if (caller) await assertOrderAccessible(this.db, caller, order);
    this.assertTransition(order['status'], newStatus);

    // A4-4: free or consume the stock this order reserved before recording the
    // new status.
    await this.settleStockForStatus(orderId, newStatus, userId);

    await this.db.db
      .update(orders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    await this.recordStatusChange(orderId, order['status'], newStatus, userId, actorType, reason);

    // Emit events based on status
    const eventMap: Record<string, string> = {
      PENDING_CONFIRMATION: 'order.pending_confirmation',
      ACCEPTED: 'order.accepted',
      PARTIALLY_ACCEPTED: 'order.partially_accepted',
      REJECTED: 'order.rejected',
      PREPARING: 'order.preparing',
      READY: 'order.ready',
      ASSIGNED: 'order.assigned',
      PICKED_UP: 'order.picked_up',
      OUT_FOR_DELIVERY: 'order.out_for_delivery',
      DELIVERED: 'order.delivered',
      COMPLETED: 'order.completed',
      CANCELLED: 'order.cancelled',
      DISPUTED: 'order.disputed',
    };

    if (eventMap[newStatus]) {
      await this.outbox.publish(eventMap[newStatus], orderId, {
        orderId,
        status: newStatus,
        storeId: order['storeId'],
        buyerId: order['buyerId'],
      });
    }

    // Push the transition to connected sockets (WEB-B6 / realtime gap): the
    // buyer's personal room, the merchant's store room, and anyone tracking this
    // order. Fire-and-forget — realtime delivery must never fail the
    // authoritative DB transition + outbox publish above.
    this.realtime?.emitOrderStatusChanged(
      orderId,
      newStatus,
      order['buyerId'] as string | undefined,
      order['storeId'] as string | undefined,
    );

    return this.getOrder(orderId);
  }

  async cancelOrder(orderId: string, userId: string, reason: string, caller?: CallerContext) {
    const order = await this.getOrder(orderId);

    // A3-1: object-level check — buyers cancel their own orders, merchants
    // cancel orders their org fulfills, platform staff bypass.
    if (caller) await assertOrderAccessible(this.db, caller, order);

    // Can only cancel pre-DELIVERED
    const cancellable = [
      'SUBMITTED',
      'PENDING_CONFIRMATION',
      'ACCEPTED',
      'PARTIALLY_ACCEPTED',
      'PREPARING',
      'READY',
      'PAYMENT_PENDING',
    ];
    if (!cancellable.includes(order['status'])) {
      throw new ConflictException(`Cannot cancel order in ${order['status']} status`);
    }

    return this.transitionStatus(orderId, 'CANCELLED', userId, 'BUYER', reason);
  }

  // ── Queries ──────────────────────────────────────────────────

  async getMasterOrder(id: string, caller?: CallerContext) {
    const master = await this.db.db.query.masterOrders.findFirst({
      where: eq(masterOrders.id, id),
    });
    if (!master) throw new NotFoundException('Master order not found');

    const subOrders = await this.db.db.query.orders.findMany({
      where: eq(orders.masterOrderId, id),
    });
    if (caller) {
      await assertMasterOrderAccessible(
        this.db,
        caller,
        { buyerId: master['buyerId'] },
        subOrders.map((so) => so['storeId'] as string),
      );
    }

    const itemsByOrder: Record<string, any[]> = {};
    for (const so of subOrders) {
      itemsByOrder[so['id']] = await this.db.db.query.orderItems.findMany({
        where: eq(orderItems.orderId, so['id']),
      });
    }

    const identified = await attachOrderIdentity(this.db.db, subOrders);
    const totals = totalsByCurrency(identified);
    const currencies = Object.keys(totals);
    const soleCurrency = currencies.length === 1 ? currencies[0] : undefined;

    return {
      ...master,
      // Seller name and currency per sub-order (A2-4/A4-6): a buyer reading a
      // multi-supplier order needs to know who ships each part and in what money.
      subOrders: identified.map((so) => ({ ...so, items: itemsByOrder[so['id']] || [] })),
      // A master order can span suppliers with different currencies, so a single
      // grand total is not an amount anyone could pay. One code when they agree,
      // null when they do not — `totalsByCurrency` is always the honest answer.
      currency: soleCurrency ?? null,
      totalsByCurrency: totals,
    };
  }

  async getOrder(id: string) {
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, id),
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getOrderWithItems(id: string, caller?: CallerContext) {
    const order = await this.getOrder(id);
    if (caller) await assertOrderAccessible(this.db, caller, order);
    const items = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, id),
    });

    // PHASE 12: Enrich items with offer attribution (seller lead-time, MOQ, status)
    // PHASE 15 upgrade: prefer the immutable `offer_snapshot` persisted at
    // checkout; the live `merchant_offers` row is only consulted as a fallback
    // so historical orders remain truthful even after the offer is edited,
    // suspended, or deleted (FK `ON DELETE SET NULL` clears `offer_id` but the
    // snapshot lives on the line forever).
    const itemOfferIds = items.map(i => i['offerId']).filter(Boolean) as string[];
    let offerMap: Map<string, { leadTimeDays: number | null; moq: number; status: string; storeId: string }> | null = null;
    if (itemOfferIds.length > 0) {
      const offers = await this.db.db.query.merchantOffers.findMany({
        where: inArray(merchantOffers.id, itemOfferIds),
        columns: { id: true, leadTimeDays: true, moq: true, status: true, storeId: true },
      });
      offerMap = new Map(offers.map(o => [o.id, { leadTimeDays: o.leadTimeDays, moq: o.moq, status: o.status, storeId: o.storeId }]));
    }
    const enrichedItems = items.map(item => {
      const oid = item['offerId'] as string | null;
      // Snapshot wins: it reflects what the buyer agreed to at checkout time.
      const snap = item['offerSnapshot'] as
        | { leadTimeDays: number | null; moq: number; snapshotStatus: string; storeId: string }
        | null
        | undefined;
      const offer = snap
        ? {
            leadTimeDays: snap.leadTimeDays,
            moq: snap.moq,
            status: snap.snapshotStatus,
            storeId: snap.storeId,
            source: 'snapshot' as const,
          }
        : oid && offerMap
          ? { ...offerMap.get(oid)!, source: 'live' as const }
          : null;
      return { ...item, offer };
    });

    const breakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
      where: eq(orderFinancialBreakdown.orderId, id),
    });
    const identified = (await attachOrderIdentity(this.db.db, [order]))[0]!;
    const enriched = (await attachBuyerContacts(this.db.db, [identified]))[0]!;
    return {
      ...enriched,
      items: enrichedItems,
      financialBreakdown: breakdown,
    };
  }

  async listOrders(buyerId?: string, storeId?: string, status?: string, caller?: CallerContext) {
    // A3-1: merchants may only list orders for stores in their own org, and a
    // scoped caller without a store filter is pinned to their own orders.
    if (storeId && caller) await assertStoreInOrg(this.db, caller, storeId);
    if (caller && !storeId && !isTenantPrivileged(caller)) buyerId = caller.sub;
    const conditions = [];
    if (buyerId) conditions.push(eq(orders.buyerId, buyerId));
    if (storeId) conditions.push(eq(orders.storeId, storeId));
    if (status) conditions.push(eq(orders.status, status));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const rows = await this.db.db.query.orders.findMany({
      where,
      orderBy: [desc(orders.createdAt)],
    });
    // The buyer's list and the merchant's queue both render these rows, and both
    // need the supplier's name and currency to label an amount at all.
    const identified = await attachOrderIdentity(this.db.db, rows);
    // These rows carry no `items`, so the count is what the cards can honestly
    // show instead of `items?.length` (A5-16).
    const counted = await attachItemCounts(this.db.db, identified);
    // Buyer contact resolution moved server-side so the merchant queue stops
    // degrading to "Buyer <id>" when the org-scoped customers directory misses
    // a first-time buyer, a mismatched activeOrg, or a cancelled-only history.
    // One batched users read for the whole page.
    return attachBuyerContacts(this.db.db, counted);
  }

  async getStatusHistory(orderId: string, caller?: CallerContext) {
    if (caller) {
      const order = await this.getOrder(orderId);
      await assertOrderAccessible(this.db, caller, order);
    }
    return this.db.db.query.orderStatusHistory.findMany({
      where: eq(orderStatusHistory.orderId, orderId),
      orderBy: [orderStatusHistory.createdAt],
    });
  }

  /**
   * A4-7: copy a past order back into the buyer's active cart.
   *
   * This used to be a stub: the loop body only ensured a cart row existed, yet
   * the response still said "Items re-added to cart". Lines now go through
   * `CartService.addItem`, which is the single place that verifies the variant is
   * still listed, derives the store from the product, and snapshots the current
   * tier price — a reorder must not quietly re-introduce stale prices.
   *
   * One line being unavailable (delisted variant, withdrawn price list) is
   * reported per line instead of failing the whole reorder, because the cart is
   * already partially written by the time the first error can surface.
   */
  async reorder(orderId: string, buyerId: string) {
    if (!this.cart) {
      throw new InternalServerErrorException('Cart service unavailable — reorder cannot proceed');
    }

    // The route is addressed by master id, but the web and mobile order detail
    // screens both pass the sub-order id they are showing, so accept either.
    let masterId = orderId;
    const asMaster = await this.db.db.query.masterOrders.findFirst({
      where: eq(masterOrders.id, orderId),
    });
    if (!asMaster) {
      masterId = (await this.getOrder(orderId))['masterOrderId'] ?? orderId;
    }

    const master = await this.getMasterOrder(masterId);
    if (master['buyerId'] !== buyerId) {
      throw new BadRequestException('Not your order');
    }

    const added: { title: string; quantity: number }[] = [];
    const skipped: { title: string; reason: string }[] = [];

    // A4-7 residual: use the batch addItems path so reorder does one
    // recalculateTotal instead of one per line.
    const lines: { variantId: string; quantity: number; title: string }[] = [];
    for (const subOrder of master['subOrders']) {
      for (const item of subOrder['items'] || []) {
        const title = item['title'] || item['sku'] || item['variantId'];
        const quantity = item['qtyConfirmed'] ?? item['quantity'];
        lines.push({ variantId: item['variantId'], quantity, title });
      }
    }

    if (lines.length > 0) {
      const batchResult = await this.cart.addItems(
        buyerId,
        lines.map(l => ({ variantId: l.variantId, quantity: l.quantity })),
      );
      for (const line of lines) {
        if (batchResult.added.includes(line.variantId)) {
          added.push({ title: line.title, quantity: line.quantity });
        }
      }
      for (const s of batchResult.skipped) {
        const line = lines.find(l => l.variantId === s.variantId);
        skipped.push({ title: line?.title || s.variantId, reason: s.reason });
      }
    }

    return {
      masterOrderId: masterId,
      added,
      skipped,
      cart: await this.cart.getActiveCartWithItems(buyerId),
    };
  }

  // ── Re-Price Guard ──────────────────────────────────────────

  private async checkPriceDeltas(orderId: string, storeId: string): Promise<PriceDelta[]> {
    const items = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    const deltas: PriceDelta[] = [];

    // Use the same shared resolver that the cart uses (A5-1) so the re-price
    // guard compares apples-to-apples against the checkout snapshot.
    const variantIds = [...new Set(items.map(i => i['variantId']))];
    if (variantIds.length === 0) return deltas;

    // Resolve each item's quantity separately since quantities may differ.
    for (const item of items) {
      const pricing = await resolveOfferPrices(
        this.db.db, storeId, [item['variantId']], item['quantity'], { ladder: false },
      );
      const tier = pricing.get(item['variantId']);
      if (!tier) continue;

      const currentPrice = tier.unitPriceMinor;
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

    return deltas;
  }

  // ── Stock Reservation ───────────────────────────────────────

  /**
   * Reserve stock for an order inside a DB transaction with SELECT … FOR UPDATE
   * so concurrent accept calls on the same inventory row are serialised.
   */
  private async reserveStock(orderId: string, storeId: string) {
    const items = await this.db.db.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    const storeWarehouses = await this.db.db
      .select()
      .from(warehouses)
      .where(eq(warehouses.storeId, storeId));

    if (storeWarehouses.length === 0) return;

    for (const item of items) {
      for (const wh of storeWarehouses) {
        const invItem = await this.db.db
          .select()
          .from(inventoryItems)
          .where(
            and(
              eq(inventoryItems.variantId, item['variantId']),
              eq(inventoryItems.warehouseId, wh['id']),
            ),
          )
          .limit(1);

        if (invItem.length > 0) {
          const inv = invItem[0]!;

          await this.db.db.transaction(async (tx) => {
            const locked = await tx
              .select({ qtyOnHand: inventoryItems.qtyOnHand, qtyReserved: inventoryItems.qtyReserved })
              .from(inventoryItems)
              .where(eq(inventoryItems.id, inv.id))
              .for('update')
              .then((rows) => rows[0]);

            if (!locked) return;

            const available = locked.qtyOnHand - locked.qtyReserved;
            const qtyToReserve = Math.min(item['quantity'], available);

            if (qtyToReserve > 0) {
              await tx
                .update(inventoryItems)
                .set({
                  qtyReserved: sql`${inventoryItems.qtyReserved} + ${qtyToReserve}`,
                  updatedAt: new Date(),
                })
                .where(eq(inventoryItems.id, inv.id));

              await tx.insert(stockMovements).values({
                id: crypto.randomUUID(),
                inventoryItemId: inv.id,
                movementType: 'RESERVE',
                quantity: -qtyToReserve,
                referenceType: 'ORDER',
                referenceId: orderId,
                reason: `Stock reserved for order ${orderId}`,
              });
            }
          });

          break; // Only reserve from first warehouse with stock
        }
      }
    }
  }

  /**
   * A4-4: keep the inventory ledger in step with the order FSM.
   *
   * `reserveStock` takes stock aside when a merchant accepts an order; nothing
   * used to undo it, so a cancelled order reserved stock forever and a delivered
   * order never left on-hand quantities. The source of truth here is the ledger
   * itself (RESERVE rows tagged with this order), because checkout reserves only
   * what was actually available, which can be less than the ordered quantity.
   *
   * Movement semantics per infra/drizzle/migrations/0005_inventory.sql:
   * RESERVE/RELEASE move qty_reserved, SALE moves qty_on_hand, and `quantity`
   * is signed "positive = in, negative = out".
   *
   * Called BEFORE the status write, so a failure leaves the order in its
   * previous status and the caller can retry, rather than an order that moved on
   * with its stock unaccounted for.
   */
  private async settleStockForStatus(orderId: string, toStatus: string, performedBy?: string) {
    const releasesStock = toStatus === 'CANCELLED' || toStatus === 'REJECTED';
    const consumesStock = toStatus === 'DELIVERED';
    if (!releasesStock && !consumesStock) return;

    const movements = await this.db.db.query.stockMovements.findMany({
      where: and(
        eq(stockMovements.referenceType, 'ORDER'),
        eq(stockMovements.referenceId, orderId),
      ),
    });
    if (movements.length === 0) return;

    // Net what is still outstanding per inventory item. Subtracting the settled
    // types makes a replayed transition a no-op instead of a double release, and
    // Math.abs normalises rows written under the older unsigned convention.
    const outstanding = new Map<string, number>();
    for (const movement of movements) {
      const itemId = movement['inventoryItemId'];
      if (!itemId) continue;
      const quantity = Math.abs(movement['quantity'] ?? 0);
      const type = movement['movementType'];
      let delta = 0;
      if (type === 'RESERVE') delta = quantity;
      else if (type === 'RELEASE' || type === 'SALE') delta = -quantity;
      if (delta === 0) continue;
      outstanding.set(itemId, (outstanding.get(itemId) ?? 0) + delta);
    }

    for (const [itemId, quantity] of outstanding) {
      if (quantity <= 0) continue; // Already settled

      // Lock the inventory row before mutating so concurrent settlements
      // cannot double-release or double-consume the same stock.
      await this.db.db.transaction(async (tx) => {
        await tx
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, itemId))
          .for('update');

        if (releasesStock) {
          await tx
            .update(inventoryItems)
            .set({
              qtyReserved: sql`GREATEST(${inventoryItems.qtyReserved} - ${quantity}, 0)`,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.id, itemId));
        } else {
          await tx
            .update(inventoryItems)
            .set({
              qtyOnHand: sql`GREATEST(${inventoryItems.qtyOnHand} - ${quantity}, 0)`,
              qtyReserved: sql`GREATEST(${inventoryItems.qtyReserved} - ${quantity}, 0)`,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.id, itemId));
        }

        await tx.insert(stockMovements).values({
          id: crypto.randomUUID(),
          inventoryItemId: itemId,
          movementType: releasesStock ? 'RELEASE' : 'SALE',
          quantity: releasesStock ? quantity : -quantity,
          referenceType: 'ORDER',
          referenceId: orderId,
          performedBy: performedBy || null,
          reason: releasesStock
            ? `Reservation released for ${toStatus.toLowerCase()} order ${orderId}`
            : `Stock deducted on delivery of order ${orderId}`,
        });
      });
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

  // FSM transition matrix — canonical 16 statuses per Implementation Plan §5
  private static readonly TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['PENDING_CONFIRMATION'], // auto-advance
    PENDING_CONFIRMATION: ['ACCEPTED', 'PARTIALLY_ACCEPTED', 'REJECTED', 'CANCELLED'], // merchant
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PARTIALLY_ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    READY: ['OUT_FOR_DELIVERY', 'ASSIGNED', 'DELIVERED', 'CANCELLED'], // ASSIGNED for P2
    ASSIGNED: ['PICKED_UP'], // P2 driver
    PICKED_UP: ['OUT_FOR_DELIVERY'], // P2 driver
    OUT_FOR_DELIVERY: ['DELIVERED'],
    DELIVERED: ['COMPLETED', 'DISPUTED'], // disputes ≤72h
    COMPLETED: ['DISPUTED'], // disputes ≤72h
    PAYMENT_PENDING: ['PREPARING', 'CANCELLED'], // P3 prepay
    CANCELLED: [],
    REJECTED: [],
    DISPUTED: [],
  };

  // Backward-compatible alias: CONFIRMED → PENDING_CONFIRMATION
  static resolveStatusAlias(status: string): string {
    return status === 'CONFIRMED' ? 'PENDING_CONFIRMATION' : status;
  }

  private assertTransition(currentStatus: string, newStatus: string) {
    const allowed = OrdersService.TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new ConflictException(
        `Invalid transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
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
