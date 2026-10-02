import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { shipments, shipmentEvents } from './shipment.schema';
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
import { ShippingService } from '../shipping/shipping.service';
import { ZoneMatchInput } from '../shipping/shipping-cost.resolver';
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
import crypto, { createHash } from 'node:crypto';
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
    // M7.2.2: Per-store shipping resolution. Optional so existing specs that
    // construct the service by hand keep compiling. When absent, checkout
    // falls back to the legacy global fulfillment-method / delivery-fee path.
    @Optional() private readonly shipping?: ShippingService,
  ) {}

  // ── Checkout ─────────────────────────────────────────────────

  async checkout(input: CheckoutInput) {
    // PHASE 1.1: Early return for matching idempotency key (before expensive
    // cart/offer work).
    // - Legacy orders (no fingerprint): return immediately on key match.
    // - DRAFT orders: fall through (may be incomplete, allow re-checkout).
    // - Non-legacy non-DRAFT + no active cart: return existing (retry path).
    // - Non-legacy non-DRAFT + active cart: fall through to compute fingerprint
    //   and compare, so same-key-different-cart → 409 Conflict.
    if (input.idempotencyKey) {
      const existingByKey = await this.db.db.query.masterOrders.findFirst({
        where: eq(masterOrders.idempotencyKey, input.idempotencyKey),
      });
      if (existingByKey && existingByKey['status'] !== 'DRAFT') {
        const storedFp = existingByKey['requestFingerprint'] as string | null;
        if (!storedFp) return this.getMasterOrder(existingByKey['id']);
        // Non-legacy: check if an active cart exists for fingerprint comparison.
        // No active cart → the cart was already converted → this is a retry.
        const activeCart = await this.db.db.query.carts.findFirst({
          where: and(eq(carts.userId, input.buyerId), eq(carts.status, 'ACTIVE')),
        });
        if (!activeCart) return this.getMasterOrder(existingByKey['id']);
        // Active cart exists → fall through to load items, compute fingerprint, compare.
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

    // ── PHASE 11: Offer Re-Validation ────────────────────────────────────
    // Verify every referenced merchant offer is still ACTIVE; a suspended or
    // withdrawn offer means the cart's price snapshot is stale.
    // PHASE 15 upgrade: also build an immutable per-offer snapshot to persist
    // on order_items.offer_snapshot so historical orders survive later edits.
    // TRANSACTION FOUNDATION: Offer loading moved before MOQ validation so
    // MOQ is checked against offer.moq (offer layer) instead of product.moq.
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

    // ── MOQ Validation ──────────────────────────────────────────
    // Check that each cart item meets the minimum order quantity.
    // TRANSACTION FOUNDATION: Use offer.moq when available (offer layer is
    // source of truth). Fall back to product.moq for legacy items without offerId.
    for (const item of items) {
      const variant = await this.db.db.query.productVariants.findFirst({
        where: eq(productVariants.id, item['variantId']),
      });
      if (!variant) throw new BadRequestException(`Variant ${item['variantId']} not found`);

      const product = await this.db.db.query.products.findFirst({
        where: eq(products.id, variant['productId']),
      });

      // Determine authoritative MOQ: offer.moq wins, product.moq is legacy fallback
      const offerId = item['offerId'] as string | null;
      const offerSnapshot = offerId ? offerSnapshotById.get(offerId) : null;
      const authoritativeMoq = offerSnapshot?.moq ?? product?.['moq'] ?? 1;

      if (authoritativeMoq > item['quantity']) {
        const productName = product?.['title'] || 'this item';
        throw new BadRequestException(
          `Minimum order quantity for ${productName} is ${authoritativeMoq}, but only ${item['quantity']} in cart`,
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

    // ── Pricing policy (env-overridable; see order-pricing.ts for Phase 1 defaults)
    const vatRate = Number(process.env['VAT_RATE'] ?? DEFAULT_VAT_RATE);
    const commissionRate = Number(process.env['COMMISSION_RATE'] ?? DEFAULT_COMMISSION_RATE);
    const platformDeliveryFee = Number(
      process.env['PLATFORM_DELIVERY_FEE_MINOR'] ?? DEFAULT_PLATFORM_DELIVERY_FEE_MINOR,
    );

    // ── M7.2.2: Per-store shipping resolution ──────────────────────────
    // Build a normalised selection per store.  If the caller supplied explicit
    // shippingSelections they are validated; otherwise the legacy global
    // fulfillmentMethod is fanned out to every store (backward-compat path).
    const storeIdsInCart = [...grouped.keys()];
    const selectionsByStore = new Map<string, { fulfillmentMethod: string; shippingMethodId?: string }>();
    const resolvedFeeByStore = new Map<string, number>();

    if (input.shippingSelections && input.shippingSelections.length > 0) {
      // Validate: exactly one selection per store in the cart
      const selStoreIds = input.shippingSelections.map(s => s.storeId);
      const uniqueSelStores = new Set(selStoreIds);
      if (selStoreIds.length !== uniqueSelStores.size) {
        throw new BadRequestException('Duplicate shipping selections for the same store');
      }
      for (const sel of input.shippingSelections) {
        if (!grouped.has(sel.storeId)) {
          throw new BadRequestException(`Selection references store ${sel.storeId} not in cart`);
        }
      }
      for (const cartStoreId of storeIdsInCart) {
        if (!uniqueSelStores.has(cartStoreId)) {
          throw new BadRequestException(`Missing shipping selection for store ${cartStoreId}`);
        }
      }
      for (const sel of input.shippingSelections) {
        selectionsByStore.set(sel.storeId, {
          fulfillmentMethod: sel.fulfillmentMethod,
          shippingMethodId: sel.shippingMethodId,
        });
      }
    } else {
      // Legacy path: fan out global fulfillmentMethod to all stores
      const legacyMethod = input.fulfillmentMethod || 'PLATFORM_DELIVERY';
      for (const storeId of storeIdsInCart) {
        selectionsByStore.set(storeId, { fulfillmentMethod: legacyMethod });
      }
    }

    // ── M7.2.2 Remediation: Validate each store's shipping selection ─────
    // For delivery methods: zone enforcement, method availability, fulfillment
    // compatibility.  For PICKUP: no shipping method allowed.
    // Server-authoritative — never relies on UI to prevent invalid selections.
    if (this.shipping) {
      for (const [storeId, selection] of selectionsByStore) {
        await this.shipping.validateCheckoutSelection(
          storeId,
          selection.fulfillmentMethod,
          selection.shippingMethodId,
          input.deliveryAddress as ZoneMatchInput,
        );
      }
    }

    // Resolve authoritative fees per store (server-authoritative — never trust client fees)
    for (const [storeId, selection] of selectionsByStore) {
      const storeItems = grouped.get(storeId)!;
      const storeSubtotal = storeItems.reduce((sum, i) => sum + i['lineTotalMinor'], 0);

      if (selection.fulfillmentMethod === 'PICKUP') {
        // PICKUP: no shipping fee
        resolvedFeeByStore.set(storeId, 0);
      } else if (selection.shippingMethodId && this.shipping) {
        // M7.2.2: resolve fee from shipping_methods table via ShippingService
        try {
          const result = await this.shipping.resolveAuthoritativeFee(
            storeId, selection.shippingMethodId, storeSubtotal,
          );
          resolvedFeeByStore.set(storeId, result.feeMinor);
        } catch (err: any) {
          if (err instanceof BadRequestException) throw err; // re-throw validation errors as-is
          throw new BadRequestException(
            `Shipping resolution failed for store ${storeId}: ${err.message}`,
          );
        }
      } else {
        // Legacy: use the flat platform delivery fee convention
        resolvedFeeByStore.set(
          storeId,
          resolveDeliveryFeeMinor(selection.fulfillmentMethod, platformDeliveryFee),
        );
      }
    }

    // Primary fulfillment method for fingerprint (legacy compat — use first selection)
    const fulfillmentMethod = input.fulfillmentMethod || 'PLATFORM_DELIVERY';

    // ── PHASE 1.1: Idempotency Fingerprint ─────────────────────────────
    // Compute a server-side fingerprint of the logical checkout request from
    // authoritative data (cart items, per-store shipping selections, delivery address).
    // If the same idempotency key was used for a DIFFERENT request, reject
    // with 409 Conflict instead of silently returning the first order.
    const requestFingerprint = input.idempotencyKey
      ? this.computeCheckoutFingerprint(items, input.deliveryAddress, selectionsByStore)
      : null;
    if (input.idempotencyKey) {
      const existingByKey = await this.db.db.query.masterOrders.findFirst({
        where: eq(masterOrders.idempotencyKey, input.idempotencyKey),
      });
      if (existingByKey && existingByKey['status'] !== 'DRAFT') {
        const storedFp = existingByKey['requestFingerprint'] as string | null;
        if (storedFp && storedFp !== requestFingerprint) {
          throw new ConflictException({
            type: 'https://errors.scs.local/idempotency-conflict',
            title: 'Idempotency Key Conflict',
            status: 409,
            detail: 'This idempotency key was already used for a different checkout operation',
          });
        }
        if (!storedFp) return this.getMasterOrder(existingByKey['id']); // Legacy
        return this.getMasterOrder(existingByKey['id']); // Fingerprint matches
      }
    }

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
    // TRANSACTION FOUNDATION: Idempotency race protection — if two concurrent
    // requests arrive with the same key, the unique constraint on idempotency_key
    // prevents duplicate inserts. We catch the violation and return the existing order.
    const masterId = crypto.randomUUID();
    const subOrderIds: string[] = [];
    const subOrderData: { id: string; storeId: string; totalMinor: number; itemCount: number }[] = [];
    let grandTotalMinor = 0;

    try {
    await this.db.db.transaction(async (tx) => {
      await tx.insert(masterOrders).values({
        id: masterId,
        buyerId: input.buyerId,
        status: 'SUBMITTED',
        deliveryAddress: input.deliveryAddress,
        notes: input.notes || null,
        idempotencyKey: input.idempotencyKey || null,
        requestFingerprint: requestFingerprint || null,
      });

      for (const [storeId, storeItems] of grouped) {
        const subOrderId = crypto.randomUUID();
        const subtotal = storeItems.reduce((sum, i) => sum + i['lineTotalMinor'], 0);
        const { promo, discount } = promoDataByStore.get(storeId)!;
        const storeSelection = selectionsByStore.get(storeId)!;
        const storeDeliveryFee = resolvedFeeByStore.get(storeId) ?? 0;

        const fin = computeOrderFinancials({
          subtotalMinor: subtotal,
          discountMinor: discount,
          deliveryFeeMinor: storeDeliveryFee,
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
          fulfillmentMethod: storeSelection.fulfillmentMethod,
          promoCode: promo ? cart['promoCode'] || promo['code'] : null,
          promotionId: promo ? promo['id'] : null,
          subtotalMinor: fin.productsMinor,
          discountMinor: fin.discountMinor,
          deliveryFeeMinor: fin.deliveryFeeMinor,
          taxMinor: fin.taxMinor,
          totalMinor: fin.totalMinor,
          currency: currencyByStore.get(storeId) ?? null,
          slaAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          metadata: storeSelection.shippingMethodId
            ? { shippingMethodId: storeSelection.shippingMethodId }
            : {},
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
    } catch (err: any) {
      // TRANSACTION FOUNDATION: Handle idempotency race condition.
      // If two concurrent requests arrive with the same idempotency key, the
      // unique constraint on master_orders.idempotency_key prevents duplicate
      // inserts. PostgreSQL raises error code 23505 (unique_violation). We catch
      // it and return the existing order instead of failing.
      // PHASE 1.1: Also compare fingerprints — if the concurrent request had a
      // different logical intent, throw 409 instead of silently returning.
      if (input.idempotencyKey && err?.code === '23505') {
        const existing = await this.db.db.query.masterOrders.findFirst({
          where: eq(masterOrders.idempotencyKey, input.idempotencyKey),
        });
        if (existing && existing['status'] !== 'DRAFT') {
          const storedFp = existing['requestFingerprint'] as string | null;
          if (storedFp && requestFingerprint && storedFp !== requestFingerprint) {
            throw new ConflictException({
              type: 'https://errors.scs.local/idempotency-conflict',
              title: 'Idempotency Key Conflict',
              status: 409,
              detail: 'This idempotency key was already used for a different checkout operation',
            });
          }
          return this.getMasterOrder(existing['id']);
        }
      }
      throw err; // Re-throw if not an idempotency conflict
    }

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
    // Guard: isolated test mocks may not wire the full relational query surface.
    if (!this.db.db.query?.organizationMembers) return;
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
    // P2 concurrency fix: use optimistic locking via atomic UPDATE WHERE to
    // serialise concurrent accepts.  Only one caller can flip the status from
    // PENDING_CONFIRMATION to ACCEPTED; the other sees rowCount=0 and throws.
    const order = await this.getOrder(orderId);
    if (caller) await assertOrderAccessible(this.db, caller, order);

    let currentStatus = order['status'];
    if (currentStatus === 'SUBMITTED') {
      await this.autoAdvanceToPendingConfirmation(orderId, order['buyerId'], order['storeId']);
      currentStatus = 'PENDING_CONFIRMATION';
    }
    this.assertTransition(currentStatus, 'ACCEPTED');

    // ── Re-Price Guard ──────────────────────────────────────────
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

    // ── Optimistic lock: flip status atomically ──────────────────
    const flipResult = await this.db.db
      .update(orders)
      .set({ status: 'ACCEPTED', slaConfirmedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, currentStatus)))
      .returning({ id: orders.id });

    if (flipResult.length === 0) {
      throw new ConflictException('Order status already changed — concurrent accept rejected');
    }

    // ── Stock Reservation ────────────────────────────────────────
    await this.reserveStock(orderId, order['storeId']);

    await this.recordStatusChange(orderId, currentStatus, 'ACCEPTED', merchantUserId, 'MERCHANT');

    // ── Shipment Creation ─────────────────────────────────────────
    await this.createShipment(orderId, order['storeId'], merchantUserId);

    await this.outbox.publish('order.accepted', orderId, { orderId, storeId: order['storeId'] });

    // M7.3-A: Recalculate master order status after acceptance
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

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

    // ADVERSARIAL FIX: recalculate tax and delivery through the same financial
    // engine used at checkout. The old code set totalMinor = newSubtotal,
    // violating the invariant total = subtotal - discount + tax + delivery.
    const vatRate = Number(process.env['VAT_RATE'] ?? DEFAULT_VAT_RATE);
    const fin = computeOrderFinancials({
      subtotalMinor: newSubtotal,
      discountMinor: Number(order['discountMinor'] ?? 0),
      deliveryFeeMinor: Number(order['deliveryFeeMinor'] ?? 0),
      vatRate,
      commissionRate: Number(process.env['COMMISSION_RATE'] ?? DEFAULT_COMMISSION_RATE),
    });

    await this.db.db
      .update(orders)
      .set({
        status: 'PARTIALLY_ACCEPTED',
        subtotalMinor: fin.productsMinor,
        discountMinor: fin.discountMinor,
        taxMinor: fin.taxMinor,
        totalMinor: fin.totalMinor,
        slaConfirmedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    // Keep the financial breakdown in sync with the new totals
    const existingBreakdown = await this.db.db.query.orderFinancialBreakdown.findFirst({
      where: eq(orderFinancialBreakdown.orderId, orderId),
    });
    if (existingBreakdown) {
      await this.db.db
        .update(orderFinancialBreakdown)
        .set({
          productsMinor: fin.productsMinor,
          discountMinor: fin.discountMinor,
          taxMinor: fin.taxMinor,
          commissionMinor: fin.commissionMinor,
          merchantNetMinor: fin.merchantNetMinor,
          updatedAt: new Date(),
        })
        .where(eq(orderFinancialBreakdown.orderId, orderId));
    }

    await this.recordStatusChange(
      orderId,
      currentStatus,
      'PARTIALLY_ACCEPTED',
      merchantUserId,
      'MERCHANT',
    );
    await this.outbox.publish('order.partially_accepted', orderId, { orderId, confirmations });

    // M7.3-A: Recalculate master order status after partial acceptance
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

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

    // ADVERSARIAL FIX: stock settlement and status write must be atomic.
    // settleStockForStatus runs first (it manages its own transactions per
    // inventory item), then the status write + history are in a single
    // transaction so a failure cannot leave stock released without the
    // order status reflecting the rejection.
    await this.settleStockForStatus(orderId, 'REJECTED', merchantUserId);

    await this.db.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ status: 'REJECTED', rejectionReason: reason, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: currentStatus,
        toStatus: 'REJECTED',
        changedBy: merchantUserId,
        actorType: 'MERCHANT',
        reason,
      });
    });
    await this.outbox.publish('order.rejected', orderId, {
      orderId,
      storeId: order['storeId'],
      reason,
    });

    // M7.3-A: Recalculate master order status after rejection
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

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

  // ── M7.3-B.2: Cancellation Reason Validation ────────────────

  private static readonly CANCELLATION_REASONS = new Set([
    'CUSTOMER_REQUEST', 'DUPLICATE_ORDER', 'MERCHANT_UNABLE_TO_FULFILL',
    'OUT_OF_STOCK', 'PRICE_ERROR', 'ADDRESS_PROBLEM', 'PAYMENT_PROBLEM',
    'CARRIER_PROBLEM', 'SYSTEM_ERROR', 'ADMINISTRATIVE', 'OTHER',
  ]);

  // ── M7.3-B.4: Delivery Exception Constants ──────────────────

  private static readonly EXCEPTION_TYPES = new Set([
    'RECIPIENT_UNAVAILABLE', 'RECIPIENT_REFUSED', 'WRONG_ADDRESS',
    'DAMAGED', 'LOST', 'CARRIER_EXCEPTION', 'DRIVER_EXCEPTION', 'OTHER',
  ]);

  private static readonly EXCEPTION_NOTE_REQUIRED = new Set([
    'OTHER', 'DAMAGED', 'LOST',
  ]);

  /**
   * M7.3-B.5: Exception types that make a shipment RTS-eligible.
   */
  private static readonly RTS_ELIGIBLE_EXCEPTION_TYPES = new Set([
    'RECIPIENT_REFUSED',
  ]);

  /**
   * M7.3-B.5: Exception types where merchant cannot approve RTS.
   */
  private static readonly RTS_ADMIN_ONLY_EXCEPTION_TYPES = new Set([
    'LOST', 'DAMAGED',
  ]);

  /**
   * M7.3-B.5: All RTS states (for delivery/retry blocking).
   */
  private static readonly RTS_ACTIVE_STATES = ['RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED'];

  /**
   * M7.3-B.5: All exception states that cancellation should close.
   */
  private static readonly CANCELLABLE_EXCEPTION_STATES = [
    'OPEN', 'RETRY_PENDING', 'RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED',
  ];

  private static readonly EXCEPTION_TRANSITIONS: Record<string, string[]> = {
    'OPEN': ['RETRY_PENDING', 'RESOLVED', 'CLOSED', 'RTS_PENDING'],
    'RETRY_PENDING': ['OPEN', 'CLOSED'],
    'RESOLVED': [],
    'CLOSED': [],
    'RTS_PENDING': ['RTS_IN_PROGRESS', 'OPEN'],
    'RTS_IN_PROGRESS': ['RTS_COMPLETED'],
    'RTS_COMPLETED': ['CLOSED'],
  };

  // ── M7.3-B.2: Actor Resolution ──────────────────────────────

  private resolveActorType(caller?: CallerContext): string {
    if (!caller?.role) return 'SYSTEM';
    const role = caller.role;
    if (['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(role)) return 'ADMIN';
    if (role === 'BUYER') return 'BUYER';
    if (['MERCHANT_OWNER', 'MERCHANT_MANAGER'].includes(role)) return 'MERCHANT';
    if (role === 'DRIVER') return 'DRIVER';
    return 'SYSTEM';
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
    // M7.3-B.2: Block CANCELLED via generic status endpoint — must use /cancel
    if (newStatus === 'CANCELLED') {
      throw new BadRequestException(
        'Cancellation must use the dedicated POST /v1/orders/:id/cancel endpoint',
      );
    }

    const order = await this.getOrder(orderId);
    if (caller) await assertOrderAccessible(this.db, caller, order);
    const expectedStatus = order['status'] as string;
    this.assertTransition(expectedStatus, newStatus);

    // M7.3-B.1 (F-01 + F-02): All state-changing operations are now atomic.
    // 1. Optimistic lock: UPDATE WHERE status = expected (F-01)
    // 2. Inventory settlement INSIDE the same transaction (F-02)
    // 3. Status history INSIDE the same transaction
    // 4. Outbox event INSIDE the same transaction (transactional outbox)
    // If the optimistic lock fails (concurrent transition), the entire
    // transaction rolls back — zero side effects.
    await this.db.db.transaction(async (tx) => {
      const flipResult = await tx
        .update(orders)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, expectedStatus)))
        .returning({ id: orders.id });

      if (flipResult.length === 0) {
        throw new ConflictException(
          'Order status already changed — concurrent transition rejected',
        );
      }

      // Inventory settlement inside the same transaction (F-02 fix)
      await this.settleStockForStatus(orderId, newStatus, userId, tx);

      await tx.insert(orderStatusHistory).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: expectedStatus,
        toStatus: newStatus,
        changedBy: userId,
        actorType,
        reason: reason || null,
      });

      // Outbox event inside the same transaction (transactional outbox)
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
        await this.outbox.publish(
          eventMap[newStatus],
          orderId,
          { orderId, status: newStatus, storeId: order['storeId'], buyerId: order['buyerId'] },
          {},
          null,
          tx,
        );
      }
    });

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

    // M7.3-A: Recalculate master order status after any transition
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

    return this.getOrder(orderId);
  }

  async cancelOrder(
    orderId: string,
    userId: string,
    reason: string,
    caller?: CallerContext,
    notes?: string,
  ) {
    // M7.3-B.2: Validate cancellation reason against B.0 locked set
    if (!OrdersService.CANCELLATION_REASONS.has(reason)) {
      throw new BadRequestException(
        `Invalid cancellation reason: ${reason}. Allowed: ${[...OrdersService.CANCELLATION_REASONS].join(', ')}`,
      );
    }
    // OTHER requires explanatory notes
    if (reason === 'OTHER' && !notes?.trim()) {
      throw new BadRequestException(
        'Cancellation reason OTHER requires explanatory notes',
      );
    }

    const order = await this.getOrder(orderId);

    // A3-1: object-level check — buyers cancel their own orders, merchants
    // cancel orders their org fulfills, platform staff bypass.
    if (caller) await assertOrderAccessible(this.db, caller, order);

    // Can only cancel pre-DELIVERED (SUBMITTED is auto-advance, not user-cancellable)
    // M7.3-B.5: OUT_FOR_DELIVERY added — cancellation must win over active RTS.
    const cancellable = [
      'PENDING_CONFIRMATION',
      'ACCEPTED',
      'PARTIALLY_ACCEPTED',
      'PREPARING',
      'READY',
      'PAYMENT_PENDING',
      'OUT_FOR_DELIVERY',
    ];
    if (!cancellable.includes(order['status'])) {
      throw new ConflictException(`Cannot cancel order in ${order['status']} status`);
    }

    // M7.3-B.2: Resolve actor type from caller context (not hardcoded BUYER)
    const actorType = this.resolveActorType(caller);
    const expectedStatus = order['status'] as string;

    // M7.3-B.2: Dedicated atomic transaction — NOT delegating to transitionStatus()
    // Includes: optimistic lock, inventory settlement, shipment sync,
    // shipment event, order history, cancellation metadata, outbox events.
    await this.db.db.transaction(async (tx) => {
      // 1. Optimistic lock: UPDATE WHERE status = expected
      const flipResult = await tx
        .update(orders)
        .set({
          status: 'CANCELLED',
          cancellationReason: reason,
          cancellationActorType: actorType,
          cancellationActorId: userId,
          cancelledAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(orders.id, orderId), eq(orders.status, expectedStatus)))
        .returning({ id: orders.id });

      if (flipResult.length === 0) {
        throw new ConflictException(
          'Order status already changed — concurrent transition rejected',
        );
      }

      // 2. Inventory settlement inside the same transaction
      await this.settleStockForStatus(orderId, 'CANCELLED', userId, tx);

      // 3. Shipment synchronization: cancel associated shipment if it exists
      // Use direct select (not tx.query.shipments) so it works with any
      // drizzle instance — some test harnesses don't register shipments in schema.
      const shipmentRows = await tx
        .select({ id: shipments.id, status: shipments.status })
        .from(shipments)
        .where(eq(shipments.orderId, orderId))
        .orderBy(shipments.createdAt)
        .limit(1);
      const shipment = shipmentRows[0] ?? null;

      if (shipment) {
        const shipmentId = shipment['id'] as string;
        // Only cancel shipments not already in a terminal state
        const shipmentStatus = shipment['status'] as string;
        const cancellableShipmentStatuses = ['PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP'];
        if (cancellableShipmentStatuses.includes(shipmentStatus)) {
          await tx
            .update(shipments)
            .set({
              status: 'CANCELLED',
              cancelledAt: new Date(),
              cancellationReason: reason,
              // M7.3-B.3.3.1: initial carrier-cancel status so the worker
              // can consume the event asynchronously.
              carrierCancelStatus: 'PENDING',
              carrierCancelIdempotencyKey: `carrier-cancel:${shipmentId}`,
              updatedAt: new Date(),
            })
            .where(eq(shipments.id, shipmentId));

          // 4. Shipment event: insert CANCELLED event
          await tx.insert(shipmentEvents).values({
            id: crypto.randomUUID(),
            shipmentId,
            eventType: 'CANCELLED',
            actorUserId: userId,
            actorType,
            notes: reason,
          });
        }

        // 4b. Carrier cancellation outbox event (M7.3-B.3.3.1).
        // Created atomically inside the cancellation transaction so the
        // worker can asynchronously call the external carrier's CancelPickup.
        // The worker checks provider capability and carrierPickupId.
        await this.outbox.publish(
          'shipping.carrier.cancel',
          shipmentId,
          { shipmentId },
          { storeId: order['storeId'] },
          null,
          tx,
        );

        // 4c. M7.3-B.4 + M7.3-B.5: Close any open/retry-pending/RTS exception
        // inside the SAME cancellation transaction. Cancellation is authoritative —
        // no cancelled shipment may remain retryable or in RTS.
        const exceptionFlip = await tx
          .update(shipments)
          .set({
            exceptionStatus: 'CLOSED',
            exceptionResolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(shipments.id, shipmentId),
            inArray(shipments.exceptionStatus, OrdersService.CANCELLABLE_EXCEPTION_STATES),
          ))
          .returning({ id: shipments.id, exceptionStatus: shipments.exceptionStatus });

        if (exceptionFlip.length > 0) {
          const prevExc = (exceptionFlip[0] as any).exceptionStatus as string;
          const rtsCancelled = OrdersService.RTS_ACTIVE_STATES.includes(prevExc);
          await tx.insert(shipmentEvents).values({
            id: crypto.randomUUID(),
            shipmentId,
            eventType: 'DELIVERY_EXCEPTION_CLOSED',
            actorUserId: userId,
            actorType,
            notes: rtsCancelled
              ? `Closed: order cancelled (RTS cancelled, was ${prevExc})`
              : 'Closed: order cancelled',
            metadata: { reason, previousExceptionStatus: prevExc },
          });
        }
      }

      // 5. Order status history with correct actorType
      await tx.insert(orderStatusHistory).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: expectedStatus,
        toStatus: 'CANCELLED',
        changedBy: userId,
        actorType,
        reason: notes ? `${reason}: ${notes}` : reason,
      });

      // 6. Outbox: order.cancelled event
      await this.outbox.publish(
        'order.cancelled',
        orderId,
        {
          orderId,
          status: 'CANCELLED',
          storeId: order['storeId'],
          buyerId: order['buyerId'],
          actorType,
          reason,
          source: 'cancelOrder',
        },
        {},
        null,
        tx,
      );

      // 7. Outbox: shipment.cancelled event (if shipment exists)
      if (shipment) {
        await this.outbox.publish(
          'shipment.cancelled',
          shipment['id'] as string,
          {
            shipmentId: shipment['id'],
            orderId,
            status: 'CANCELLED',
            reason,
            actorType,
            source: 'cancelOrder',
          },
          {},
          null,
          tx,
        );
      }
    });

    // Post-commit: realtime emit
    this.realtime?.emitOrderStatusChanged(
      orderId,
      'CANCELLED',
      order['buyerId'] as string | undefined,
      order['storeId'] as string | undefined,
    );

    // Recalculate master order status after cancellation
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

    return this.getOrder(orderId);
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

  // ── M7.1 Fulfillment ─────────────────────────────────────────

  /**
   * Create a shipment record when an order is accepted.
   * One shipment per merchant sub-order (not per master order).
   *
   * M7.2.2: Snapshots delivery address from master order and shipping method
   * from sub-order metadata so historical shipments are self-contained.
   */
  private async createShipment(orderId: string, storeId: string, actorUserId: string) {
    const shipmentId = crypto.randomUUID();

    // Look up the sub-order and its master order for snapshot data
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, orderId),
    });
    let deliveryAddress: Record<string, unknown> | null = null;
    let shippingMethodId: string | null = null;
    if (order) {
      const master = await this.db.db.query.masterOrders.findFirst({
        where: eq(masterOrders.id, order['masterOrderId']),
      });
      deliveryAddress = (master?.['deliveryAddress'] as Record<string, unknown>) || null;
      const meta = (order['metadata'] as Record<string, unknown>) || {};
      shippingMethodId = (meta['shippingMethodId'] as string) || null;
    }

    await this.db.db.insert(shipments).values({
      id: shipmentId,
      orderId,
      storeId,
      status: 'PREPARING',
      deliveryAddress: deliveryAddress || undefined,
      shippingMethodId: shippingMethodId || undefined,
    });
    await this.db.db.insert(shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId,
      eventType: 'PREPARING',
      actorUserId,
      actorType: 'MERCHANT',
      notes: 'Shipment created on order acceptance',
    });
    return shipmentId;
  }

  /**
   * Merchant marks order as being prepared.
   * ACCEPTED → PREPARING (shipment already in PREPARING from accept).
   */
  async prepareOrder(orderId: string, userId: string, caller?: CallerContext) {
    return this.fulfillmentTransition(orderId, 'PREPARING', userId, 'MERCHANT', caller);
  }

  /**
   * Merchant marks order as ready for pickup/assignment.
   * PREPARING → READY
   */
  async readyOrder(orderId: string, userId: string, caller?: CallerContext) {
    return this.fulfillmentTransition(orderId, 'READY', userId, 'MERCHANT', caller);
  }

  /**
   * Merchant assigns a driver to the order.
   * READY → ASSIGNED. Atomically updates shipment with driver assignment.
   */
  async assignDriver(orderId: string, driverId: string, userId: string, caller?: CallerContext) {
    const order = await this.getOrder(orderId);
    if (caller) await assertOrderAccessible(this.db, caller, order);
    this.assertTransition(order['status'], 'ASSIGNED');

    const shipment = await this.getShipmentByOrderId(orderId);
    if (!shipment) throw new NotFoundException('Shipment not found for order');
    if (shipment['status'] !== 'PREPARING' && shipment['status'] !== 'READY') {
      throw new ConflictException(`Shipment cannot be assigned in status ${shipment['status']}`);
    }

    // Atomic optimistic lock on order status
    const flipResult = await this.db.db
      .update(orders)
      .set({ status: 'ASSIGNED', updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, order['status'])))
      .returning({ id: orders.id });

    if (flipResult.length === 0) {
      throw new ConflictException('Order status already changed — concurrent assignment rejected');
    }

    // Update shipment with driver assignment
    await this.db.db
      .update(shipments)
      .set({
        status: 'ASSIGNED',
        assignedDriverId: driverId,
        assignedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment['id']));

    // Shipment event
    await this.db.db.insert(shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId: shipment['id'],
      eventType: 'ASSIGNED',
      actorUserId: userId,
      actorType: 'MERCHANT',
      notes: `Driver ${driverId} assigned`,
    });

    // Order status history
    await this.recordStatusChange(orderId, order['status'], 'ASSIGNED', userId, 'MERCHANT');
    await this.outbox.publish('order.fulfillment.assigned', orderId, {
      orderId, storeId: order['storeId'], driverId,
    });

    // M7.3-A: Recalculate master order status after driver assignment
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

    // Realtime notification
    this.realtime?.server?.to(`order:${orderId}`).emit('order:updated', { orderId, status: 'ASSIGNED' });

    return this.getOrder(orderId);
  }

  /**
   * Driver confirms pickup.
   * ASSIGNED → PICKED_UP
   */
  async pickupOrder(orderId: string, userId: string, caller?: CallerContext) {
    return this.driverFulfillmentTransition(orderId, 'PICKED_UP', userId, caller);
  }

  /**
   * Driver marks as out for delivery.
   * PICKED_UP → OUT_FOR_DELIVERY
   */
  async outForDeliveryOrder(orderId: string, userId: string, caller?: CallerContext) {
    return this.driverFulfillmentTransition(orderId, 'OUT_FOR_DELIVERY', userId, caller);
  }

  /**
   * Driver confirms delivery.
   * OUT_FOR_DELIVERY → DELIVERED
   */
  async deliverOrder(orderId: string, userId: string, caller?: CallerContext) {
    const order = await this.getOrder(orderId);
    if (caller) {
      await assertOrderAccessible(this.db, caller, order);
      const DRIVER_ROLES = ['DRIVER', 'ADMIN', 'SUPER_ADMIN'];
      if (caller.role && !DRIVER_ROLES.includes(caller.role)) {
        throw new ForbiddenException(`Role ${caller.role} cannot perform driver fulfillment actions`);
      }
    }
    this.assertTransition(order['status'], 'DELIVERED');

    const shipment = await this.getShipmentByOrderId(orderId);
    if (!shipment) throw new NotFoundException('Shipment not found for order');

    // Verify driver ownership
    await this.assertDriverOwnership(shipment, userId);

    // M7.3-B.4: Atomic delivery transaction — order flip, attempt counting,
    // exception resolution, stock settlement, shipment update, events, outbox.
    const shipmentId = shipment['id'] as string;

    // M7.3-B.5: Block delivery when RTS is active.
    const excStatus = (shipment as any)['exceptionStatus'] as string | null;
    if (excStatus && excStatus !== 'OPEN' && excStatus !== 'RESOLVED') {
      throw new ConflictException(
        `Delivery blocked: RTS active (status: ${excStatus})`,
      );
    }

    const hasOpenException = excStatus === 'OPEN';

    await this.db.db.transaction(async (tx) => {
      // 1. Atomic optimistic lock on order status
      const flipResult = await tx
        .update(orders)
        .set({ status: 'DELIVERED', updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, order['status'])))
        .returning({ id: orders.id });

      if (flipResult.length === 0) {
        throw new ConflictException('Order status already changed — concurrent delivery rejected');
      }

      // 2. Settle stock (SALE movement) inside the same transaction
      await this.settleStockForStatus(orderId, 'DELIVERED', userId, tx);

      // 3. Update shipment: DELIVERED + increment delivery_attempts (M7.3-B.4)
      const shipmentUpdate: Record<string, any> = {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        deliveryAttempts: sql`${shipments.deliveryAttempts} + 1`,
        updatedAt: new Date(),
      };

      // M7.3-B.4: Auto-resolve open exception on successful delivery
      if (hasOpenException) {
        shipmentUpdate['exceptionStatus'] = 'RESOLVED';
        shipmentUpdate['exceptionResolvedAt'] = new Date();
      }

      await tx.update(shipments).set(shipmentUpdate).where(eq(shipments.id, shipmentId));

      // 4. Shipment event: DELIVERED
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'DELIVERED',
        actorUserId: userId,
        actorType: 'DRIVER',
      });

      // 5. M7.3-B.4: Exception resolution event (if applicable)
      if (hasOpenException) {
        await tx.insert(shipmentEvents).values({
          id: crypto.randomUUID(),
          shipmentId,
          eventType: 'DELIVERY_EXCEPTION_RESOLVED',
          actorUserId: userId,
          actorType: 'DRIVER',
          notes: 'Auto-resolved: delivery confirmed by driver',
          metadata: { resolvedBy: 'delivery', exceptionType: (shipment as any)['exceptionType'] },
        });

        await tx.insert(outboxEvents).values({
          id: crypto.randomUUID(),
          eventType: 'shipment.delivery_exception_resolved',
          aggregateId: shipmentId,
          payload: { shipmentId, orderId, resolution: 'delivery' },
          metadata: { storeId: order['storeId'] },
          status: 'PENDING',
        });
      }

      // 6. Order status history
      await tx.insert(orderStatusHistory).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: order['status'] as string,
        toStatus: 'DELIVERED',
        changedBy: userId,
        actorType: 'DRIVER',
      });

      // 7. Outbox: order delivered
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'order.fulfillment.delivered',
        aggregateId: orderId,
        payload: { orderId, storeId: order['storeId'] },
        metadata: {},
        status: 'PENDING',
      });
    });

    this.realtime?.server?.to(`order:${orderId}`).emit('order:updated', { orderId, status: 'DELIVERED' });

    // M7.3-A: Schedule auto-completion after the configured window
    const windowHours = parseInt(process.env['ORDER_AUTO_COMPLETE_HOURS'] || '72', 10);
    const autoCompleteAt = new Date(Date.now() + windowHours * 60 * 60 * 1000);
    await this.db.db
      .update(orders)
      .set({ autoCompleteAt, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    // M7.3-A: Recalculate master order status after delivery
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

    return this.getOrder(orderId);
  }

  // ── M7.3-B.4: Delivery Exception Lifecycle ──────────────────────

  /**
   * Report a delivery exception on a shipment.
   *
   * POST /v1/shipments/:id/exception
   *
   * Authorization:
   *   DRIVER  — assigned shipments only
   *   MERCHANT — own-store shipments
   *   ADMIN   — any shipment
   *
   * Idempotency:
   *   Same exception type already OPEN → 200 (return existing)
   *   Different exception type OPEN → 409
   *
   * Concurrency:
   *   Atomic optimistic claim: UPDATE WHERE exception_status IS NULL
   *   If order has already transitioned past OUT_FOR_DELIVERY, exception is rejected.
   */
  async reportShipmentException(
    shipmentId: string,
    exceptionType: string,
    notes: string | undefined,
    caller: CallerContext,
  ) {
    // 1. Validate exception type
    if (!OrdersService.EXCEPTION_TYPES.has(exceptionType)) {
      throw new BadRequestException(
        `Invalid exception type: ${exceptionType}. Allowed: ${[...OrdersService.EXCEPTION_TYPES].join(', ')}`,
      );
    }

    // 2. Notes required for certain types
    if (OrdersService.EXCEPTION_NOTE_REQUIRED.has(exceptionType) && !notes?.trim()) {
      throw new BadRequestException(
        `Exception type ${exceptionType} requires explanatory notes`,
      );
    }

    // 3. Load shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 4. Authorization
    await this.assertShipmentAccessibleForException(shipment, caller);

    // 5. Load order — must be OUT_FOR_DELIVERY
    const order = await this.getOrder(shipment.orderId);
    if ((order['status'] as string) !== 'OUT_FOR_DELIVERY') {
      throw new ConflictException(
        `Cannot report exception: order is ${order['status']}, expected OUT_FOR_DELIVERY`,
      );
    }

    // 6. Shipment must not be in terminal state
    const shipmentStatus = shipment.status as string;
    if (['DELIVERED', 'COMPLETED', 'CANCELLED'].includes(shipmentStatus)) {
      throw new ConflictException(
        `Cannot report exception: shipment is ${shipmentStatus}`,
      );
    }

    // 7. Idempotency — same type already OPEN → return existing
    if ((shipment as any)['exceptionStatus'] === 'OPEN' &&
        (shipment as any)['exceptionType'] === exceptionType) {
      return {
        shipmentId,
        exceptionStatus: 'OPEN',
        exceptionType,
        exceptionNotes: (shipment as any)['exceptionNotes'],
        exceptionAt: (shipment as any)['exceptionAt'],
        deliveryAttempts: (shipment as any)['deliveryAttempts'],
        idempotent: true,
      };
    }

    // 8. Different exception already OPEN → 409
    if ((shipment as any)['exceptionStatus'] === 'OPEN') {
      throw new ConflictException(
        `Shipment already has open exception: ${(shipment as any)['exceptionType']}`,
      );
    }

    // 9. Atomic transaction: claim exception slot
    const actorType = this.resolveActorType(caller);
    const now = new Date();

    await this.db.db.transaction(async (tx) => {
      // Re-verify order status inside transaction (BD-B4-007 / CR-04)
      const orderCheck = await tx.query.orders.findFirst({
        where: eq(orders.id, shipment.orderId),
        columns: { status: true },
      });
      if (!orderCheck || (orderCheck as any)['status'] !== 'OUT_FOR_DELIVERY') {
        throw new ConflictException(
          'Order status changed before exception could be recorded',
        );
      }

      // Optimistic lock: claim NULL → OPEN
      const flipResult = await tx
        .update(shipments)
        .set({
          exceptionStatus: 'OPEN',
          exceptionType,
          exceptionNotes: notes || null,
          exceptionAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(shipments.id, shipmentId),
          sql`${shipments.exceptionStatus} IS NULL`,
        ))
        .returning({ id: shipments.id });

      if (flipResult.length === 0) {
        throw new ConflictException(
          'Exception slot already claimed — concurrent report rejected',
        );
      }

      // Shipment event
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'DELIVERY_EXCEPTION',
        actorUserId: caller.sub,
        actorType,
        notes: notes || exceptionType,
        metadata: { exceptionType },
      });

      // Outbox event
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'shipment.delivery_exception',
        aggregateId: shipmentId,
        payload: { shipmentId, orderId: shipment.orderId, exceptionType, notes },
        metadata: { storeId: shipment.storeId },
        status: 'PENDING',
      });
    });

    return {
      shipmentId,
      exceptionStatus: 'OPEN',
      exceptionType,
      exceptionNotes: notes || null,
      exceptionAt: now.toISOString(),
      deliveryAttempts: (shipment as any)['deliveryAttempts'],
      idempotent: false,
    };
  }

  /**
   * Authorize a delivery retry.
   *
   * POST /v1/shipments/:id/retry
   *
   * Authorization: MERCHANT, ADMIN only (DRIVER cannot authorize retry).
   *
   * Preconditions:
   *   exception_status = OPEN
   *   delivery_attempts < max_delivery_attempts
   *   shipment not CANCELLED
   *   order not CANCELLED or terminal
   *
   * Transition: OPEN → RETRY_PENDING (optimistic lock)
   */
  async authorizeShipmentRetry(
    shipmentId: string,
    caller: CallerContext,
  ) {
    // 1. Authorization: merchant or admin only
    const allowedRoles = [
      'MERCHANT_OWNER', 'MERCHANT_STAFF', 'MERCHANT_MANAGER',
      'ADMIN', 'SUPER_ADMIN', 'MODERATOR',
    ];
    const privileged = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (!privileged && !allowedRoles.includes(caller.role || '')) {
      throw new ForbiddenException(`Role ${caller.role} cannot authorize delivery retry`);
    }

    // 2. Load shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 3. Tenant check
    await this.assertShipmentAccessibleForException(shipment, caller);

    // 4. Exception must be OPEN
    if ((shipment as any)['exceptionStatus'] !== 'OPEN') {
      throw new ConflictException(
        `Cannot retry: exception status is ${(shipment as any)['exceptionStatus'] || 'none'}, expected OPEN`,
      );
    }

    // 5. Max attempts check
    const attempts = (shipment as any)['deliveryAttempts'] as number;
    const maxAttempts = (shipment as any)['maxDeliveryAttempts'] as number;
    if (attempts >= maxAttempts) {
      throw new ConflictException(
        `Maximum delivery attempts reached (${attempts}/${maxAttempts})`,
      );
    }

    // 6. Shipment must not be CANCELLED
    if ((shipment.status as string) === 'CANCELLED') {
      throw new ConflictException('Cannot retry: shipment is CANCELLED');
    }

    // 7. Order must not be CANCELLED or terminal
    const order = await this.getOrder(shipment.orderId);
    const orderStatus = order['status'] as string;
    if (['CANCELLED', 'DELIVERED', 'COMPLETED', 'DISPUTED'].includes(orderStatus)) {
      throw new ConflictException(
        `Cannot retry: order is ${orderStatus}`,
      );
    }

    // 8. Idempotency: already RETRY_PENDING → 409
    // (handled by optimistic lock below)

    // 9. Atomic transition: OPEN → RETRY_PENDING
    const actorType = this.resolveActorType(caller);
    const now = new Date();

    await this.db.db.transaction(async (tx) => {
      const flipResult = await tx
        .update(shipments)
        .set({
          exceptionStatus: 'RETRY_PENDING',
          updatedAt: now,
        })
        .where(and(
          eq(shipments.id, shipmentId),
          eq(shipments.exceptionStatus, 'OPEN'),
        ))
        .returning({ id: shipments.id });

      if (flipResult.length === 0) {
        throw new ConflictException(
          'Exception status already changed — concurrent retry rejected',
        );
      }

      // Shipment event
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'DELIVERY_RETRY_REQUESTED',
        actorUserId: caller.sub,
        actorType,
        notes: `Retry authorized (attempt ${attempts + 1}/${maxAttempts})`,
        metadata: { attemptNumber: attempts + 1, maxAttempts },
      });

      // Outbox event
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'shipment.delivery_retry_requested',
        aggregateId: shipmentId,
        payload: {
          shipmentId,
          orderId: shipment.orderId,
          attemptNumber: attempts + 1,
          maxAttempts,
        },
        metadata: { storeId: shipment.storeId },
        status: 'PENDING',
      });
    });

    return {
      shipmentId,
      exceptionStatus: 'RETRY_PENDING',
      deliveryAttempts: attempts,
      maxDeliveryAttempts: maxAttempts,
    };
  }

  // ── M7.3-B.5: RTS lifecycle methods ─────────────────────────────────────

  /**
   * Request RTS (Return to Sender).
   * POST /v1/shipments/:id/rts
   *
   * Transition: OPEN → RTS_PENDING
   *
   * Authorization: MERCHANT (own store), ADMIN.
   * LOST exception: ADMIN only.
   *
   * Idempotency:
   *   Already RTS_PENDING with same context → 200 (return existing)
   *   Different RTS context → 409
   */
  async requestRTS(
    shipmentId: string,
    notes: string | undefined,
    caller: CallerContext,
  ) {
    // 1. Authorization: merchant or admin only (no driver, no buyer)
    const allowedRoles = [
      'MERCHANT_OWNER', 'MERCHANT_STAFF', 'MERCHANT_MANAGER',
      'ADMIN', 'SUPER_ADMIN', 'MODERATOR',
    ];
    const privileged = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (!privileged && !allowedRoles.includes(caller.role || '')) {
      throw new ForbiddenException(`Role ${caller.role} cannot request RTS`);
    }

    // 2. Load shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 3. Tenant check
    await this.assertShipmentAccessibleForException(shipment, caller);

    // 4. Shipment must not be CANCELLED
    if ((shipment.status as string) === 'CANCELLED') {
      throw new ConflictException('Cannot request RTS: shipment is CANCELLED');
    }

    // 5. Load order — must be OUT_FOR_DELIVERY
    const order = await this.getOrder(shipment.orderId);
    const orderStatus = order['status'] as string;
    if (orderStatus === 'CANCELLED' || ['DELIVERED', 'COMPLETED', 'DISPUTED'].includes(orderStatus)) {
      throw new ConflictException(
        `Cannot request RTS: order is ${orderStatus}`,
      );
    }

    const exceptionType = (shipment as any)['exceptionType'] as string;
    const exceptionStatus = (shipment as any)['exceptionStatus'] as string | null;

    // 6. Idempotency: already RTS_PENDING → return existing
    if (exceptionStatus === 'RTS_PENDING') {
      return {
        shipmentId,
        exceptionStatus: 'RTS_PENDING',
        exceptionType,
        idempotent: true,
      };
    }

    // 7. If already in further RTS state → 409
    if (exceptionStatus && OrdersService.RTS_ACTIVE_STATES.includes(exceptionStatus)) {
      throw new ConflictException(
        `Cannot request RTS: shipment is already in ${exceptionStatus}`,
      );
    }

    // 8. Exception must be OPEN
    if (exceptionStatus !== 'OPEN') {
      throw new ConflictException(
        `Cannot request RTS: exception status is ${exceptionStatus || 'none'}, expected OPEN`,
      );
    }

    // 9. RTS eligibility check
    const attempts = (shipment as any)['deliveryAttempts'] as number;
    const maxAttempts = (shipment as any)['maxDeliveryAttempts'] as number;
    const isRefused = exceptionType === 'RECIPIENT_REFUSED';
    const isMaxAttempts = attempts >= maxAttempts;
    const isLost = exceptionType === 'LOST';

    if (!isRefused && !isMaxAttempts && !isLost) {
      throw new ConflictException(
        `RTS not eligible: exception type ${exceptionType} with ${attempts}/${maxAttempts} attempts`,
      );
    }

    // 10. LOST: ADMIN only
    if (isLost && !privileged) {
      throw new ForbiddenException('LOST exception RTS requires ADMIN authority');
    }

    // 11. Atomic transition: OPEN → RTS_PENDING
    const actorType = this.resolveActorType(caller);
    const now = new Date();

    await this.db.db.transaction(async (tx) => {
      // Re-verify order status inside transaction (BD-B4-007 / CR-04)
      const orderCheck = await tx.query.orders.findFirst({
        where: eq(orders.id, shipment.orderId),
        columns: { status: true },
      });
      if (!orderCheck || ['CANCELLED', 'DELIVERED', 'COMPLETED', 'DISPUTED'].includes((orderCheck as any)['status'])) {
        throw new ConflictException(
          'Order status changed before RTS could be recorded',
        );
      }

      // Optimistic lock: OPEN → RTS_PENDING
      const flipResult = await tx
        .update(shipments)
        .set({
          exceptionStatus: 'RTS_PENDING',
          updatedAt: now,
        })
        .where(and(
          eq(shipments.id, shipmentId),
          eq(shipments.exceptionStatus, 'OPEN'),
        ))
        .returning({ id: shipments.id });

      if (flipResult.length === 0) {
        throw new ConflictException(
          'Exception status already changed — concurrent RTS request rejected',
        );
      }

      // Shipment event
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'RTS_REQUESTED',
        actorUserId: caller.sub,
        actorType,
        notes: notes || `RTS requested for ${exceptionType}`,
        metadata: { exceptionType, requestedBy: actorType },
      });

      // Outbox event
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'shipment.rts_requested',
        aggregateId: shipmentId,
        payload: { shipmentId, orderId: shipment.orderId, exceptionType, notes },
        metadata: { storeId: shipment.storeId },
        status: 'PENDING',
      });
    });

    return {
      shipmentId,
      exceptionStatus: 'RTS_PENDING',
      exceptionType,
      requestedBy: actorType,
      requestedAt: now.toISOString(),
      idempotent: false,
    };
  }

  /**
   * Approve RTS.
   * POST /v1/shipments/:id/rts/approve
   *
   * Transition: RTS_PENDING → RTS_IN_PROGRESS
   *
   * Authorization: ADMIN (any), MERCHANT (own store, non-LOST/DAMAGED).
   *
   * LOST special flow: ADMIN can request + approve atomically.
   */
  async approveRTS(
    shipmentId: string,
    caller: CallerContext,
  ) {
    // 1. Authorization
    const allowedRoles = [
      'MERCHANT_OWNER', 'MERCHANT_STAFF', 'MERCHANT_MANAGER',
      'ADMIN', 'SUPER_ADMIN', 'MODERATOR',
    ];
    const privileged = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (!privileged && !allowedRoles.includes(caller.role || '')) {
      throw new ForbiddenException(`Role ${caller.role} cannot approve RTS`);
    }

    // 2. Load shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 3. Tenant check
    await this.assertShipmentAccessibleForException(shipment, caller);

    const exceptionStatus = (shipment as any)['exceptionStatus'] as string | null;
    const exceptionType = (shipment as any)['exceptionType'] as string;

    // 4. Idempotency: already RTS_IN_PROGRESS → return existing
    if (exceptionStatus === 'RTS_IN_PROGRESS') {
      return {
        shipmentId,
        exceptionStatus: 'RTS_IN_PROGRESS',
        exceptionType,
        idempotent: true,
      };
    }

    // 5. Must be RTS_PENDING
    if (exceptionStatus !== 'RTS_PENDING') {
      throw new ConflictException(
        `Cannot approve RTS: exception status is ${exceptionStatus || 'none'}, expected RTS_PENDING`,
      );
    }

    // 6. LOST/DAMAGED: ADMIN only
    if (OrdersService.RTS_ADMIN_ONLY_EXCEPTION_TYPES.has(exceptionType) && !privileged) {
      throw new ForbiddenException(
        `${exceptionType} exception RTS approval requires ADMIN authority`,
      );
    }

    // 7. Atomic transition: RTS_PENDING → RTS_IN_PROGRESS
    const actorType = this.resolveActorType(caller);
    const now = new Date();

    await this.db.db.transaction(async (tx) => {
      const flipResult = await tx
        .update(shipments)
        .set({
          exceptionStatus: 'RTS_IN_PROGRESS',
          updatedAt: now,
        })
        .where(and(
          eq(shipments.id, shipmentId),
          eq(shipments.exceptionStatus, 'RTS_PENDING'),
        ))
        .returning({ id: shipments.id });

      if (flipResult.length === 0) {
        throw new ConflictException(
          'RTS status already changed — concurrent approval rejected',
        );
      }

      // Shipment event
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'RTS_APPROVED',
        actorUserId: caller.sub,
        actorType,
        notes: `RTS approved for ${exceptionType}`,
        metadata: { exceptionType, approvedBy: actorType },
      });

      // Outbox event
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'shipment.rts_approved',
        aggregateId: shipmentId,
        payload: { shipmentId, orderId: shipment.orderId, exceptionType },
        metadata: { storeId: shipment.storeId },
        status: 'PENDING',
      });
    });

    return {
      shipmentId,
      exceptionStatus: 'RTS_IN_PROGRESS',
      exceptionType,
      approvedBy: actorType,
      approvedAt: now.toISOString(),
      idempotent: false,
    };
  }

  /**
   * Reject RTS.
   * POST /v1/shipments/:id/rts/reject
   *
   * Transition: RTS_PENDING → OPEN
   *
   * Authorization: MERCHANT (own store), ADMIN.
   * Notes are mandatory.
   * No outbox event for rejection.
   */
  async rejectRTS(
    shipmentId: string,
    notes: string,
    caller: CallerContext,
  ) {
    // 1. Authorization
    const allowedRoles = [
      'MERCHANT_OWNER', 'MERCHANT_STAFF', 'MERCHANT_MANAGER',
      'ADMIN', 'SUPER_ADMIN', 'MODERATOR',
    ];
    const privileged = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (!privileged && !allowedRoles.includes(caller.role || '')) {
      throw new ForbiddenException(`Role ${caller.role} cannot reject RTS`);
    }

    // 2. Notes are mandatory
    if (!notes?.trim()) {
      throw new BadRequestException('Rejection notes are mandatory');
    }

    // 3. Load shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 4. Tenant check
    await this.assertShipmentAccessibleForException(shipment, caller);

    const exceptionStatus = (shipment as any)['exceptionStatus'] as string | null;
    const exceptionType = (shipment as any)['exceptionType'] as string;

    // 5. Must be RTS_PENDING
    if (exceptionStatus !== 'RTS_PENDING') {
      throw new ConflictException(
        `Cannot reject RTS: exception status is ${exceptionStatus || 'none'}, expected RTS_PENDING`,
      );
    }

    // 6. Atomic transition: RTS_PENDING → OPEN
    const actorType = this.resolveActorType(caller);
    const now = new Date();

    await this.db.db.transaction(async (tx) => {
      const flipResult = await tx
        .update(shipments)
        .set({
          exceptionStatus: 'OPEN',
          updatedAt: now,
        })
        .where(and(
          eq(shipments.id, shipmentId),
          eq(shipments.exceptionStatus, 'RTS_PENDING'),
        ))
        .returning({ id: shipments.id });

      if (flipResult.length === 0) {
        throw new ConflictException(
          'RTS status already changed — concurrent rejection rejected',
        );
      }

      // Shipment event (no outbox event for rejection per spec)
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'RTS_REJECTED',
        actorUserId: caller.sub,
        actorType,
        notes,
        metadata: { exceptionType, rejectedBy: actorType, reason: notes },
      });
    });

    return {
      shipmentId,
      exceptionStatus: 'OPEN',
      exceptionType,
      rejectedBy: actorType,
      rejectedAt: now.toISOString(),
    };
  }

  /**
   * Complete RTS (physical return confirmed).
   * POST /v1/shipments/:id/rts/complete
   *
   * Transition: RTS_IN_PROGRESS → RTS_COMPLETED
   *
   * Authorization: MERCHANT (own store), ADMIN.
   * NO inventory movement.
   *
   * Idempotency:
   *   Already RTS_COMPLETED → 200 (return existing)
   */
  async completeRTS(
    shipmentId: string,
    notes: string | undefined,
    caller: CallerContext,
  ) {
    // 1. Authorization
    const allowedRoles = [
      'MERCHANT_OWNER', 'MERCHANT_STAFF', 'MERCHANT_MANAGER',
      'ADMIN', 'SUPER_ADMIN', 'MODERATOR',
    ];
    const privileged = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (!privileged && !allowedRoles.includes(caller.role || '')) {
      throw new ForbiddenException(`Role ${caller.role} cannot complete RTS`);
    }

    // 2. Load shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 3. Tenant check
    await this.assertShipmentAccessibleForException(shipment, caller);

    const exceptionStatus = (shipment as any)['exceptionStatus'] as string | null;
    const exceptionType = (shipment as any)['exceptionType'] as string;

    // 4. Idempotency: already RTS_COMPLETED → return existing
    if (exceptionStatus === 'RTS_COMPLETED') {
      return {
        shipmentId,
        exceptionStatus: 'RTS_COMPLETED',
        exceptionType,
        idempotent: true,
      };
    }

    // 5. Must be RTS_IN_PROGRESS
    if (exceptionStatus !== 'RTS_IN_PROGRESS') {
      throw new ConflictException(
        `Cannot complete RTS: exception status is ${exceptionStatus || 'none'}, expected RTS_IN_PROGRESS`,
      );
    }

    // 6. Atomic transition: RTS_IN_PROGRESS → RTS_COMPLETED
    const actorType = this.resolveActorType(caller);
    const now = new Date();

    await this.db.db.transaction(async (tx) => {
      const flipResult = await tx
        .update(shipments)
        .set({
          exceptionStatus: 'RTS_COMPLETED',
          exceptionResolvedAt: now,
          updatedAt: now,
        })
        .where(and(
          eq(shipments.id, shipmentId),
          eq(shipments.exceptionStatus, 'RTS_IN_PROGRESS'),
        ))
        .returning({ id: shipments.id });

      if (flipResult.length === 0) {
        throw new ConflictException(
          'RTS status already changed — concurrent completion rejected',
        );
      }

      // Shipment event
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'RTS_COMPLETED',
        actorUserId: caller.sub,
        actorType,
        notes: notes || 'Physical return confirmed',
        metadata: { exceptionType, completedBy: actorType },
      });

      // Outbox event
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'shipment.rts_completed',
        aggregateId: shipmentId,
        payload: { shipmentId, orderId: shipment.orderId, exceptionType, notes },
        metadata: { storeId: shipment.storeId },
        status: 'PENDING',
      });
    });

    return {
      shipmentId,
      exceptionStatus: 'RTS_COMPLETED',
      exceptionType,
      completedBy: actorType,
      completedAt: now.toISOString(),
      idempotent: false,
    };
  }

  /**
   * Admin LOST RTS direct flow.
   * Admin requests + immediately approves atomically.
   * Result: OPEN → RTS_PENDING → RTS_IN_PROGRESS in one TX.
   */
  async requestAndApproveLostRTS(
    shipmentId: string,
    investigationNotes: string,
    caller: CallerContext,
  ) {
    // 1. Must be ADMIN
    const privileged = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (!privileged) {
      throw new ForbiddenException('LOST RTS direct flow requires ADMIN authority');
    }

    // 2. Investigation notes mandatory
    if (!investigationNotes?.trim()) {
      throw new BadRequestException('Investigation notes are mandatory for LOST RTS');
    }

    // 3. Load shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 4. Tenant check
    await this.assertShipmentAccessibleForException(shipment, caller);

    // 5. Shipment must not be CANCELLED
    if ((shipment.status as string) === 'CANCELLED') {
      throw new ConflictException('Cannot request LOST RTS: shipment is CANCELLED');
    }

    // 6. Exception must be OPEN with LOST type
    const exceptionStatus = (shipment as any)['exceptionStatus'] as string | null;
    const exceptionType = (shipment as any)['exceptionType'] as string;

    if (exceptionType !== 'LOST') {
      throw new ConflictException(
        `LOST RTS direct flow requires LOST exception, got ${exceptionType}`,
      );
    }

    if (exceptionStatus !== 'OPEN') {
      throw new ConflictException(
        `Cannot request LOST RTS: exception status is ${exceptionStatus || 'none'}, expected OPEN`,
      );
    }

    // 7. Load order
    const order = await this.getOrder(shipment.orderId);
    const orderStatus = order['status'] as string;
    if (orderStatus === 'CANCELLED' || ['DELIVERED', 'COMPLETED', 'DISPUTED'].includes(orderStatus)) {
      throw new ConflictException(
        `Cannot request LOST RTS: order is ${orderStatus}`,
      );
    }

    // 8. Atomic: OPEN → RTS_PENDING → RTS_IN_PROGRESS
    const actorType = this.resolveActorType(caller);
    const now = new Date();

    await this.db.db.transaction(async (tx) => {
      // Re-verify order inside TX
      const orderCheck = await tx.query.orders.findFirst({
        where: eq(orders.id, shipment.orderId),
        columns: { status: true },
      });
      if (!orderCheck || ['CANCELLED', 'DELIVERED', 'COMPLETED', 'DISPUTED'].includes((orderCheck as any)['status'])) {
        throw new ConflictException(
          'Order status changed before LOST RTS could be recorded',
        );
      }

      // OPEN → RTS_PENDING
      const pendingFlip = await tx
        .update(shipments)
        .set({ exceptionStatus: 'RTS_PENDING', updatedAt: now })
        .where(and(
          eq(shipments.id, shipmentId),
          eq(shipments.exceptionStatus, 'OPEN'),
        ))
        .returning({ id: shipments.id });

      if (pendingFlip.length === 0) {
        throw new ConflictException(
          'Exception status already changed — concurrent LOST RTS rejected',
        );
      }

      // RTS_PENDING → RTS_IN_PROGRESS
      const approvedFlip = await tx
        .update(shipments)
        .set({ exceptionStatus: 'RTS_IN_PROGRESS', updatedAt: now })
        .where(and(
          eq(shipments.id, shipmentId),
          eq(shipments.exceptionStatus, 'RTS_PENDING'),
        ))
        .returning({ id: shipments.id });

      if (approvedFlip.length === 0) {
        throw new ConflictException(
          'RTS status changed during LOST flow — concurrent operation rejected',
        );
      }

      // Shipment events: RTS_REQUESTED + RTS_APPROVED
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'RTS_REQUESTED',
        actorUserId: caller.sub,
        actorType,
        notes: investigationNotes,
        metadata: { exceptionType: 'LOST', requestedBy: actorType, investigationNotes },
      });

      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'RTS_APPROVED',
        actorUserId: caller.sub,
        actorType,
        notes: `LOST RTS auto-approved by admin: ${investigationNotes}`,
        metadata: { exceptionType: 'LOST', approvedBy: actorType, autoApproved: true },
      });

      // Outbox events: shipment.rts_requested + shipment.rts_approved
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'shipment.rts_requested',
        aggregateId: shipmentId,
        payload: { shipmentId, orderId: shipment.orderId, exceptionType: 'LOST', investigationNotes },
        metadata: { storeId: shipment.storeId },
        status: 'PENDING',
      });

      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'shipment.rts_approved',
        aggregateId: shipmentId,
        payload: { shipmentId, orderId: shipment.orderId, exceptionType: 'LOST', autoApproved: true },
        metadata: { storeId: shipment.storeId },
        status: 'PENDING',
      });
    });

    return {
      shipmentId,
      exceptionStatus: 'RTS_IN_PROGRESS',
      exceptionType: 'LOST',
      requestedBy: actorType,
      approvedBy: actorType,
      investigationNotes,
      requestedAt: now.toISOString(),
      approvedAt: now.toISOString(),
    };
  }

  /**
   * Verify the caller can access a shipment for exception operations.
   * Driver: must be assigned. Merchant: must match store org. Admin: bypass.
   */
  private async assertShipmentAccessibleForException(
    shipment: any,
    caller: CallerContext,
  ): Promise<void> {
    const privileged = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (privileged) return;

    // Driver check: must be assigned to this shipment
    if (caller.role === 'DRIVER') {
      if (shipment.assignedDriverId !== caller.sub) {
        throw new ForbiddenException('Driver is not assigned to this shipment');
      }
      return;
    }

    // Merchant check: store must belong to caller's org
    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.id, shipment.storeId),
      columns: { orgId: true },
    });
    if (!store) throw new NotFoundException('Store not found for shipment');
    if (store.orgId !== caller.activeOrg) {
      throw new ForbiddenException('Shipment does not belong to your organization');
    }
  }

  /**
   * Get tracking information for a buyer's order.
   * Returns sub-order statuses with shipment events for multi-merchant tracking.
   */
  async getTracking(masterOrderId: string, buyerId: string) {
    const masterOrder = await this.db.db.query.masterOrders.findFirst({
      where: eq(masterOrders.id, masterOrderId),
    });
    if (!masterOrder) throw new NotFoundException('Master order not found');
    if (masterOrder['buyerId'] !== buyerId) {
      throw new BadRequestException('Cannot access tracking for another buyer\'s order');
    }

    const subOrders = await this.db.db.query.orders.findMany({
      where: eq(orders.masterOrderId, masterOrderId),
    });

    const result = [];
    for (const so of subOrders) {
      const shipment = await this.getShipmentByOrderId(so['id']);
      const events = shipment
        ? await this.db.db.query.shipmentEvents.findMany({
            where: eq(shipmentEvents.shipmentId, shipment['id']),
            orderBy: [shipmentEvents.sequence],
          })
        : [];

      result.push({
        orderId: so['id'],
        storeId: so['storeId'],
        status: so['status'],
        shipment: shipment ? {
          id: shipment['id'],
          status: shipment['status'],
          assignedDriverId: shipment['assignedDriverId'],
          assignedAt: shipment['assignedAt'],
          pickedUpAt: shipment['pickedUpAt'],
          outForDeliveryAt: shipment['outForDeliveryAt'],
          deliveredAt: shipment['deliveredAt'],
        } : null,
        events: events.map((e) => ({
          eventType: e['eventType'],
          actorType: e['actorType'],
          createdAt: e['createdAt'],
          notes: e['notes'],
        })),
      });
    }

    return {
      masterOrderId,
      masterStatus: masterOrder['status'],
      shipments: result,
    };
  }

  /**
   * Get shipment by order ID.
   */
  async getShipmentByOrderId(orderId: string) {
    return this.db.db.query.shipments.findFirst({
      where: eq(shipments.orderId, orderId),
    });
  }

  /**
   * List shipments for a driver (assigned to them).
   */
  async listDriverShipments(driverId: string, status?: string) {
    const conditions = [eq(shipments.assignedDriverId, driverId)];
    if (status) {
      conditions.push(eq(shipments.status, status));
    }
    return this.db.db.query.shipments.findMany({
      where: and(...conditions),
      orderBy: [shipments.updatedAt],
    });
  }

  /**
   * Generic fulfillment transition for merchant actions (prepare, ready).
   * Uses optimistic locking to prevent concurrent transitions.
   */
  private async fulfillmentTransition(
    orderId: string,
    newStatus: string,
    userId: string,
    actorType: string,
    caller?: CallerContext,
  ) {
    const order = await this.getOrder(orderId);
    if (caller) {
      await assertOrderAccessible(this.db, caller, order);
      // M7.1: only merchant roles (or platform admins) may drive fulfillment transitions.
      const MERCHANT_ROLES = ['MERCHANT_OWNER', 'MERCHANT_STAFF', 'ADMIN', 'SUPER_ADMIN'];
      if (caller.role && !MERCHANT_ROLES.includes(caller.role)) {
        throw new ForbiddenException(`Role ${caller.role} cannot perform merchant fulfillment actions`);
      }
    }
    this.assertTransition(order['status'], newStatus);

    const shipment = await this.getShipmentByOrderId(orderId);
    if (!shipment) throw new NotFoundException('Shipment not found for order');

    // Atomic optimistic lock on order status
    const flipResult = await this.db.db
      .update(orders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, order['status'])))
      .returning({ id: orders.id });

    if (flipResult.length === 0) {
      throw new ConflictException(`Order status already changed — concurrent ${newStatus} rejected`);
    }

    // Update shipment status
    const shipmentUpdate: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };
    if (newStatus === 'PICKED_UP') shipmentUpdate['pickedUpAt'] = new Date();
    if (newStatus === 'OUT_FOR_DELIVERY') shipmentUpdate['outForDeliveryAt'] = new Date();
    if (newStatus === 'DELIVERED') shipmentUpdate['deliveredAt'] = new Date();
    if (newStatus === 'COMPLETED') shipmentUpdate['completedAt'] = new Date();

    await this.db.db
      .update(shipments)
      .set(shipmentUpdate)
      .where(eq(shipments.id, shipment['id']));

    // Shipment event
    await this.db.db.insert(shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId: shipment['id'],
      eventType: newStatus,
      actorUserId: userId,
      actorType,
    });

    // Order status history
    await this.recordStatusChange(orderId, order['status'], newStatus, userId, actorType);

    // Outbox event
    const eventKey = `order.fulfillment.${newStatus.toLowerCase()}`;
    await this.outbox.publish(eventKey, orderId, {
      orderId, storeId: order['storeId'],
    });

    // Realtime
    this.realtime?.server?.to(`order:${orderId}`).emit('order:updated', {
      orderId, status: newStatus,
    });

    // M7.3-A: Recalculate master order status after fulfillment transition
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

    return this.getOrder(orderId);
  }

  /**
   * Driver-specific fulfillment transition.
   * Verifies the driver is assigned to this shipment.
   */
  private async driverFulfillmentTransition(
    orderId: string,
    newStatus: string,
    userId: string,
    caller?: CallerContext,
  ) {
    const order = await this.getOrder(orderId);
    if (caller) {
      await assertOrderAccessible(this.db, caller, order);
      // M7.1: only driver role (or platform admins) may perform driver actions.
      const DRIVER_ROLES = ['DRIVER', 'ADMIN', 'SUPER_ADMIN'];
      if (caller.role && !DRIVER_ROLES.includes(caller.role)) {
        throw new ForbiddenException(`Role ${caller.role} cannot perform driver fulfillment actions`);
      }
    }
    this.assertTransition(order['status'], newStatus);

    const shipment = await this.getShipmentByOrderId(orderId);
    if (!shipment) throw new NotFoundException('Shipment not found for order');

    // Verify driver is assigned to this shipment
    await this.assertDriverOwnership(shipment, userId);

    // Atomic optimistic lock
    const flipResult = await this.db.db
      .update(orders)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, order['status'])))
      .returning({ id: orders.id });

    if (flipResult.length === 0) {
      throw new ConflictException(`Order status already changed — concurrent ${newStatus} rejected`);
    }

    // Update shipment
    const shipmentUpdate: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date(),
    };
    if (newStatus === 'PICKED_UP') shipmentUpdate['pickedUpAt'] = new Date();
    if (newStatus === 'OUT_FOR_DELIVERY') shipmentUpdate['outForDeliveryAt'] = new Date();
    if (newStatus === 'DELIVERED') shipmentUpdate['deliveredAt'] = new Date();

    await this.db.db
      .update(shipments)
      .set(shipmentUpdate)
      .where(eq(shipments.id, shipment['id']));

    // Shipment event
    await this.db.db.insert(shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId: shipment['id'],
      eventType: newStatus,
      actorUserId: userId,
      actorType: 'DRIVER',
    });

    // Order status history
    await this.recordStatusChange(orderId, order['status'], newStatus, userId, 'DRIVER');

    // Outbox
    const eventKey = `order.fulfillment.${newStatus.toLowerCase()}`;
    await this.outbox.publish(eventKey, orderId, {
      orderId, storeId: order['storeId'],
    });

    // Realtime
    this.realtime?.server?.to(`order:${orderId}`).emit('order:updated', {
      orderId, status: newStatus,
    });

    // M7.3-A: Recalculate master order status after driver fulfillment transition
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

    return this.getOrder(orderId);
  }

  /**
   * Verify the driver is assigned to this shipment.
   */
  private async assertDriverOwnership(shipment: Record<string, unknown>, userId: string) {
    if (shipment['assignedDriverId'] !== userId) {
      throw new BadRequestException('Driver is not assigned to this shipment');
    }
  }

  // ── Stock Reservation ───────────────────────────────────────

  /**
   * Reserve stock for ALL order items inside a SINGLE DB transaction with
   * SELECT ... FOR UPDATE so concurrent accept calls are serialised.
   *
   * TRANSACTION FOUNDATION: All items are reserved atomically — if any item
   * cannot be fully reserved, the entire reservation rolls back. This prevents
   * partial reservations where item A succeeds but item B fails, leaving
   * orphan stock reservations.
   */
  private async reserveStock(orderId: string, storeId: string, outerTx?: any) {
    const runner = outerTx || this.db.db;
    const items = await runner.query.orderItems.findMany({
      where: eq(orderItems.orderId, orderId),
    });

    const storeWarehouses = await runner
      .select()
      .from(warehouses)
      .where(eq(warehouses.storeId, storeId));

    if (storeWarehouses.length === 0) return;

    // TRANSACTION FOUNDATION: Single transaction wraps ALL item reservations.
    // If any item fails, all roll back — no partial reservations.
    // When outerTx is provided, reuse it; otherwise create a new transaction.
    const run = async (tx: any) => {
      for (const item of items) {
        let reserved = false;

        for (const wh of storeWarehouses) {
          // Lock the inventory row upfront with SELECT ... FOR UPDATE
          const locked = await tx
            .select({
              id: inventoryItems.id,
              qtyOnHand: inventoryItems.qtyOnHand,
              qtyReserved: inventoryItems.qtyReserved,
            })
            .from(inventoryItems)
            .where(
              and(
                eq(inventoryItems.variantId, item['variantId']),
                eq(inventoryItems.warehouseId, wh['id']),
              ),
            )
            .for('update')
            .then((rows: any[]) => rows[0]);

          if (!locked) continue;

          const available = locked.qtyOnHand - locked.qtyReserved;
          const qtyToReserve = Math.min(item['quantity'], available);

          if (qtyToReserve > 0) {
            await tx
              .update(inventoryItems)
              .set({
                qtyReserved: sql`${inventoryItems.qtyReserved} + ${qtyToReserve}`,
                updatedAt: new Date(),
              })
              .where(eq(inventoryItems.id, locked.id));

            await tx.insert(stockMovements).values({
              id: crypto.randomUUID(),
              inventoryItemId: locked.id,
              movementType: 'RESERVE',
              quantity: -qtyToReserve,
              referenceType: 'ORDER',
              referenceId: orderId,
              reason: `Stock reserved for order ${orderId}`,
            });

            reserved = true;
            break; // Only reserve from first warehouse with stock
          }
        }

        // If we couldn't reserve this item at all, that's acceptable — the
        // merchant can partially fulfill. But the transaction stays atomic:
        // either all reservations commit or none do.
      }
    };

    if (outerTx) {
      await run(outerTx);
    } else {
      await this.db.db.transaction(run);
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
  // M7.3-B.1 (F-02): Accept an optional transaction client so inventory
  // settlement runs inside the caller's transaction. When txClient is provided,
  // all queries and mutations use it directly — no nested transactions.
  // When called without txClient (from rejectOrder, deliverOrder), it falls
  // back to the previous per-item transactional behavior.
  private async settleStockForStatus(
    orderId: string,
    toStatus: string,
    performedBy?: string,
    txClient?: any,
  ) {
    const releasesStock = toStatus === 'CANCELLED' || toStatus === 'REJECTED';
    const consumesStock = toStatus === 'DELIVERED';
    if (!releasesStock && !consumesStock) return;

    const db = txClient || this.db.db;

    const movements = await db.query.stockMovements.findMany({
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

    if (txClient) {
      // F-02 fix: When inside a caller's transaction, do all inventory work
      // in that same transaction — no nested transactions. The SELECT FOR UPDATE
      // locks still serialize concurrent settlements on the same inventory rows.
      for (const [itemId, quantity] of outstanding) {
        if (quantity <= 0) continue;

        await txClient
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, itemId))
          .for('update');

        if (releasesStock) {
          await txClient
            .update(inventoryItems)
            .set({
              qtyReserved: sql`GREATEST(${inventoryItems.qtyReserved} - ${quantity}, 0)`,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.id, itemId));
        } else {
          await txClient
            .update(inventoryItems)
            .set({
              qtyOnHand: sql`GREATEST(${inventoryItems.qtyOnHand} - ${quantity}, 0)`,
              qtyReserved: sql`GREATEST(${inventoryItems.qtyReserved} - ${quantity}, 0)`,
              updatedAt: new Date(),
            })
            .where(eq(inventoryItems.id, itemId));
        }

        await txClient.insert(stockMovements).values({
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
      }
    } else {
      // Legacy path: no tx client — each item gets its own transaction.
      // Used by rejectOrder() and deliverOrder() which have their own patterns.
      for (const [itemId, quantity] of outstanding) {
        if (quantity <= 0) continue;

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
  }

  // ── Idempotency Fingerprint ──────────────────────────────────

  /**
   * PHASE 1.1 + M7.2.2: Compute a server-side fingerprint of the logical
   * checkout request.
   *
   * The fingerprint represents the "logical checkout intent" — what the buyer
   * is actually purchasing. It is computed from authoritative server-side data
   * (cart items, per-store shipping selections, delivery address) and never
   * trusts client-supplied prices, totals, or hashes.
   *
   * M7.2.2: Per-store selections are normalised by storeId (sorted) so that
   * equivalent selections in different array order produce the same fingerprint.
   *
   * Used to detect idempotency key reuse with a different logical operation:
   *   - Same key + same fingerprint → return existing order (idempotent)
   *   - Same key + different fingerprint → 409 Conflict
   */
  private computeCheckoutFingerprint(
    items: Array<{ variantId: string; quantity: number; offerId: string | null }>,
    deliveryAddress: Record<string, unknown>,
    selectionsByStore: Map<string, { fulfillmentMethod: string; shippingMethodId?: string }>,
  ): string {
    const sorted = [...items].sort((a, b) => {
      const aKey = `${a.variantId}|${a.offerId || ''}`;
      const bKey = `${b.variantId}|${b.offerId || ''}`;
      return aKey.localeCompare(bKey);
    });
    const lines = sorted.map(i => `${i.variantId}:${i.quantity}:${i.offerId || ''}`).join(',');
    const addr = JSON.stringify(deliveryAddress, Object.keys(deliveryAddress).sort());

    // M7.2.2: deterministic per-store shipping segment (sorted by storeId)
    const shippingSegment = [...selectionsByStore.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([storeId, sel]) => `${storeId}:${sel.fulfillmentMethod}:${sel.shippingMethodId || ''}`)
      .join(';');

    return createHash('sha256')
      .update(`${lines}|${shippingSegment}|${addr}`)
      .digest('hex')
      .slice(0, 64);
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

  // ── M7.3-A: Master Order Status Aggregation ─────────────────

  /**
   * Deterministic master-order status aggregation.
   *
   * Given the current statuses of all sub-orders, computes what the master
   * order's aggregated status should be. This is a pure function with no
   * side effects — safe to call repeatedly.
   *
   * Policy (evaluated top-to-bottom, first match wins):
   *   ALL COMPLETED                                → COMPLETED
   *   ALL CANCELLED/REJECTED                       → CANCELLED
   *   ALL DELIVERED or COMPLETED                   → DELIVERED
   *   ANY DISPUTED                                 → DISPUTED
   *   ANY OUT_FOR_DELIVERY/ASSIGNED/PICKED_UP      → OUT_FOR_DELIVERY
   *   ANY PREPARING/READY                          → PREPARING
   *   ANY ACCEPTED/PARTIALLY_ACCEPTED              → ACCEPTED
   *   ANY SUBMITTED/PENDING_CONFIRMATION           → SUBMITTED
   */
  static computeMasterStatus(subOrderStatuses: string[]): string {
    if (subOrderStatuses.length === 0) return 'SUBMITTED';

    const all = (pred: (s: string) => boolean) => subOrderStatuses.every(pred);
    const any = (pred: (s: string) => boolean) => subOrderStatuses.some(pred);

    if (all(s => s === 'COMPLETED')) return 'COMPLETED';
    if (all(s => s === 'CANCELLED' || s === 'REJECTED')) return 'CANCELLED';
    if (all(s => s === 'DELIVERED' || s === 'COMPLETED')) return 'DELIVERED';
    if (any(s => s === 'DISPUTED')) return 'DISPUTED';
    if (any(s => ['OUT_FOR_DELIVERY', 'ASSIGNED', 'PICKED_UP'].includes(s))) return 'OUT_FOR_DELIVERY';
    if (any(s => ['PREPARING', 'READY'].includes(s))) return 'PREPARING';
    if (any(s => ['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(s))) return 'ACCEPTED';
    if (any(s => ['SUBMITTED', 'PENDING_CONFIRMATION'].includes(s))) return 'SUBMITTED';

    return 'SUBMITTED';
  }

  /**
   * Authoritative master-order status recalculation.
   *
   * Idempotent: repeated calls with no sub-order change are a no-op.
   * Concurrency-safe: SELECT ... FOR UPDATE on the master row prevents
   * lost updates when multiple sub-orders transition concurrently.
   */
  async recalculateMasterOrderStatus(masterOrderId: string): Promise<string> {
    return this.db.db.transaction(async (tx) => {
      // Lock the master order row
      const master = await tx.query.masterOrders.findFirst({
        where: eq(masterOrders.id, masterOrderId),
      });
      if (!master) return 'SUBMITTED';

      // Lock the row explicitly (Drizzle query may not FOR UPDATE)
      await tx.execute(
        sql`SELECT id FROM master_orders WHERE id = ${masterOrderId} FOR UPDATE`
      );

      // Load sub-orders
      const subOrders = await tx.query.orders.findMany({
        where: eq(orders.masterOrderId, masterOrderId),
      });

      const newStatus = OrdersService.computeMasterStatus(
        subOrders.map(so => so['status'] as string),
      );

      // Only update if changed
      if (newStatus !== master['status']) {
        await tx
          .update(masterOrders)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(masterOrders.id, masterOrderId));

        // Publish outbox event for the master status change
        await this.outbox.publish('order.master.status_changed', masterOrderId, {
          masterOrderId,
          previousStatus: master['status'],
          newStatus,
          buyerId: master['buyerId'],
        });
      }

      return newStatus;
    });
  }

  // ── M7.3-A: Delivery Completion ──────────────────────────────

  /**
   * Buyer confirms delivery received.
   * POST /orders/:id/confirm-delivery
   *
   * Idempotent: if already confirmed, returns success without side effects.
   * Only the order's buyer (or platform admin) may confirm.
   */
  async confirmDelivery(orderId: string, userId: string, caller?: CallerContext) {
    const order = await this.getOrder(orderId);
    if (caller) {
      await assertOrderAccessible(this.db, caller, order);
      // Only the buyer can confirm delivery (not merchant, not driver)
      if (order['buyerId'] !== caller.sub && !isTenantPrivileged(caller)) {
        throw new ForbiddenException('Only the buyer can confirm delivery');
      }
    }

    if (order['status'] === 'COMPLETED') {
      // Already completed — idempotent return
      return this.getOrderWithItems(orderId, caller);
    }

    if (order['status'] !== 'DELIVERED') {
      throw new ConflictException(
        `Order is ${order['status']}, not DELIVERED — cannot confirm delivery`,
      );
    }

    // Atomically record buyer confirmation (optimistic lock)
    const flipResult = await this.db.db
      .update(orders)
      .set({ buyerConfirmedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(orders.id, orderId),
          eq(orders.status, 'DELIVERED'),
          sql`${orders.buyerConfirmedAt} IS NULL`,
        ),
      )
      .returning({ id: orders.id });

    if (flipResult.length === 0) {
      // Race: another confirmation already happened — idempotent
      const current = await this.getOrder(orderId);
      if (current['status'] === 'COMPLETED') {
        return this.getOrderWithItems(orderId, caller);
      }
      throw new ConflictException('Delivery confirmation already processed');
    }

    return this.completeOrder(orderId, userId, 'BUYER', 'BUYER_CONFIRMATION');
  }

  /**
   * Canonical DELIVERED → COMPLETED transition.
   *
   * Shared by buyer confirmation, auto-completion worker, and any future
   * completion trigger. No inventory movement (stock was already consumed
   * at DELIVERED). Updates shipment completedAt, records history, publishes
   * outbox event, and recalculates master order.
   */
  async completeOrder(
    orderId: string,
    userId: string,
    actorType: string,
    source: string,
  ) {
    const order = await this.getOrder(orderId);
    this.assertTransition(order['status'], 'COMPLETED');

    // Normalize actor userId — system-level callers (e.g. auto-complete worker)
    // pass 'system' which is not a valid UUID; store null instead.
    const actorUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
      ? userId : null;

    // Atomic optimistic lock on order status
    const flipResult = await this.db.db
      .update(orders)
      .set({ status: 'COMPLETED', updatedAt: new Date() })
      .where(and(eq(orders.id, orderId), eq(orders.status, order['status'])))
      .returning({ id: orders.id });

    if (flipResult.length === 0) {
      throw new ConflictException('Order status already changed — concurrent completion rejected');
    }

    // NO inventory movement — stock was consumed at DELIVERED

    // Update shipment completedAt (shipment stays in DELIVERED status)
    const shipment = await this.getShipmentByOrderId(orderId);
    if (shipment) {
      await this.db.db
        .update(shipments)
        .set({ completedAt: new Date(), updatedAt: new Date() })
        .where(eq(shipments.id, shipment['id']));

      // Shipment event (only if not already COMPLETED)
      if (shipment['status'] !== 'COMPLETED') {
        await this.db.db.insert(shipmentEvents).values({
          id: crypto.randomUUID(),
          shipmentId: shipment['id'],
          eventType: 'COMPLETED',
          actorUserId: actorUserId,
          actorType,
          notes: `Order completed via ${source}`,
        });
      }
    }

    // Order status history
    await this.recordStatusChange(orderId, order['status'], 'COMPLETED', actorUserId, actorType);

    // Outbox event
    await this.outbox.publish('order.completed', orderId, {
      orderId,
      storeId: order['storeId'],
      source,
    });

    // Realtime
    this.realtime?.server?.to(`order:${orderId}`).emit('order:updated', {
      orderId,
      status: 'COMPLETED',
    });

    // Recalculate master order
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

    return this.getOrder(orderId);
  }

  /**
   * Carrier → Order delivery bridge.
   *
   * Called by the carrier tracking poller or webhook handler when a carrier
   * reports DELIVERED. Reuses the same delivery logic as the driver API
   * (inventory SALE, shipment update, order transition, master recalc).
   *
   * Idempotent: if the order is already DELIVERED or beyond, this is a no-op.
   * Concurrency-safe: the internal deliverOrder call uses optimistic locking.
   */
  async processCarrierDelivery(
    orderId: string,
    carrierShipmentId: string | null,
    source: string,
  ): Promise<boolean> {
    const order = await this.getOrder(orderId);

    // Already delivered or beyond — idempotent no-op
    if (['DELIVERED', 'COMPLETED', 'DISPUTED'].includes(order['status'] as string)) {
      return false;
    }

    // Verify the order can transition to DELIVERED from current state
    const allowed = OrdersService.TRANSITIONS[order['status'] as string] || [];
    if (!allowed.includes('DELIVERED')) {
      return false;
    }

    // Find the shipment for this order
    const shipment = await this.getShipmentByOrderId(orderId);
    if (!shipment) return false;

    // M7.3-B.4: Atomic carrier delivery transaction — order flip, exception
    // resolution, stock settlement, shipment update, events, outbox.
    const shipmentId = shipment['id'] as string;

    // M7.3-B.5: Block carrier delivery when RTS is active.
    const carrierExcStatus = (shipment as any)['exceptionStatus'] as string | null;
    if (carrierExcStatus && carrierExcStatus !== 'OPEN' && carrierExcStatus !== 'RESOLVED') {
      return false; // Carrier delivery blocked by RTS — idempotent no-op
    }

    const hasOpenException = carrierExcStatus === 'OPEN';

    await this.db.db.transaction(async (tx) => {
      // 1. Atomic optimistic lock on order status
      const flipResult = await tx
        .update(orders)
        .set({ status: 'DELIVERED', updatedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, order['status'])))
        .returning({ id: orders.id });

      if (flipResult.length === 0) return; // Lost the race — idempotent no-op

      // 2. Settle stock (SALE movement) inside the same transaction
      await this.settleStockForStatus(orderId, 'DELIVERED', undefined, tx);

      // 3. Update shipment: DELIVERED + resolve open exception if present
      const shipmentUpdate: Record<string, any> = {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        updatedAt: new Date(),
      };

      // M7.3-B.4 BD-B4-007: Carrier delivery wins when order is non-terminal.
      // Auto-resolve the open exception.
      if (hasOpenException) {
        shipmentUpdate['exceptionStatus'] = 'RESOLVED';
        shipmentUpdate['exceptionResolvedAt'] = new Date();
      }

      await tx.update(shipments).set(shipmentUpdate).where(eq(shipments.id, shipmentId));

      // 4. Shipment event: DELIVERED
      await tx.insert(shipmentEvents).values({
        id: crypto.randomUUID(),
        shipmentId,
        eventType: 'DELIVERED',
        actorType: 'CARRIER',
        notes: `Carrier delivery via ${source}`,
      });

      // 5. M7.3-B.4: Exception resolution event (if applicable)
      if (hasOpenException) {
        await tx.insert(shipmentEvents).values({
          id: crypto.randomUUID(),
          shipmentId,
          eventType: 'DELIVERY_EXCEPTION_RESOLVED',
          actorType: 'CARRIER',
          notes: 'Auto-resolved: carrier delivery confirmed',
          metadata: { resolvedBy: 'carrier', exceptionType: (shipment as any)['exceptionType'], source },
        });

        await tx.insert(outboxEvents).values({
          id: crypto.randomUUID(),
          eventType: 'shipment.delivery_exception_resolved',
          aggregateId: shipmentId,
          payload: { shipmentId, orderId, resolution: 'carrier_delivery', source },
          metadata: { storeId: order['storeId'] },
          status: 'PENDING',
        });
      }

      // 6. Order status history
      await tx.insert(orderStatusHistory).values({
        id: crypto.randomUUID(),
        orderId,
        fromStatus: order['status'] as string,
        toStatus: 'DELIVERED',
        changedBy: null,
        actorType: 'CARRIER',
      });

      // 7. Outbox: order delivered
      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'order.fulfillment.delivered',
        aggregateId: orderId,
        payload: { orderId, storeId: order['storeId'], source },
        metadata: {},
        status: 'PENDING',
      });
    });

    // Realtime
    this.realtime?.server?.to(`order:${orderId}`).emit('order:updated', {
      orderId,
      status: 'DELIVERED',
    });

    // Set auto-complete schedule
    const windowHours = parseInt(process.env['ORDER_AUTO_COMPLETE_HOURS'] || '72', 10);
    const autoCompleteAt = new Date(Date.now() + windowHours * 60 * 60 * 1000);
    await this.db.db
      .update(orders)
      .set({ autoCompleteAt, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    // Recalculate master order
    await this.recalculateMasterOrderStatus(order['masterOrderId'] as string);

    return true;
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface CheckoutInput {
  buyerId: string;
  deliveryAddress: Record<string, unknown>;
  notes?: string;
  idempotencyKey?: string;
  /** @deprecated Transitional — use shippingSelections for per-store control. */
  fulfillmentMethod?: string;
  /** M7.2.2: Per-store shipping selections (preferred over global fulfillmentMethod). */
  shippingSelections?: ShippingSelection[];
}

/**
 * M7.2.2: Per-store shipping selection provided by the buyer at checkout.
 * Each merchant group in the cart must have exactly one selection.
 */
export interface ShippingSelection {
  storeId: string;
  fulfillmentMethod: string;
  shippingMethodId?: string;
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
