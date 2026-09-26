import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsInt, Min, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DatabaseService } from '../../common/database/database.service';
import { PromotionsService } from '../promotions/promotions.service';
import { carts, cartItems } from './cart.schema';
import { products, productVariants } from '../catalog/catalog.schema';
import { merchantOffers } from '../catalog/catalog.offer.schema';
import { stores } from '../merchant/merchant.schema';
import { resolveOfferPrices } from '../pricing/price-resolution';
import { eq, and, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Cart service — multi-supplier cart with price snapshots.
 *
 * One active cart per user. Items grouped by store_id for supplier grouping.
 * Price is SNAPSHOT at add time (not live from price list).
 */
@Injectable()
export class CartService {
  constructor(
    private readonly db: DatabaseService,
    private readonly promotions: PromotionsService,
  ) {}

  // ── Cart ─────────────────────────────────────────────────────

  async getOrCreateCart(userId: string) {
    const existing = await this.db.db.query.carts.findFirst({
      where: and(eq(carts.userId, userId), eq(carts.status, 'ACTIVE')),
    });
    if (existing) return existing;

    const id = crypto.randomUUID();
    await this.db.db.insert(carts).values({
      id,
      userId,
      status: 'ACTIVE',
      totalMinor: 0,
    });

    return this.getCart(id);
  }

  async getCart(cartId: string) {
    const cart = await this.db.db.query.carts.findFirst({
      where: eq(carts.id, cartId),
    });
    if (!cart) throw new NotFoundException('Cart not found');
    return cart;
  }

  async getActiveCartWithItems(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.listCartItems(cart['id']);
    return { ...cart, items };
  }

  // ── Cart Items ───────────────────────────────────────────────

  async addItem(userId: string, input: AddCartItemInput) {
    if (!Number.isInteger(input.quantity) || input.quantity < 1) {
      throw new BadRequestException('Quantity must be a positive integer');
    }

    // The client must send a variant id — cart_items.variant_id is a FK to
    // product_variants, so a product id (or any non-variant) is rejected here
    // rather than failing deep in the insert.
    const variant = await this.db.db.query.productVariants.findFirst({
      where: eq(productVariants.id, input.variantId),
    });
    if (!variant) throw new NotFoundException('Product variant not found');
    if (!variant['isActive']) throw new BadRequestException('This item is no longer available');

    // Derive the authoritative store from the variant's product. The client's
    // storeId is never trusted, so a buyer cannot pair a variant with an
    // unrelated store's price list.
    const product = await this.db.db.query.products.findFirst({
      where: eq(products.id, variant['productId']),
    });
    if (!product) throw new NotFoundException('Product not found');
    let storeId: string | null = product['storeId'];

    // PHASE 13: If the buyer picked a specific merchant offer, validate it and
    // route the line through that offer's store/price-list instead of the
    // product-owner's default.
    let selectedOfferId: string | null = null;
    if (input.offerId) {
      const offer = await this.db.db.query.merchantOffers.findFirst({
        where: eq(merchantOffers.id, input.offerId),
      });
      if (!offer) throw new NotFoundException('Offer not found');
      if (offer.status !== 'ACTIVE') {
        throw new BadRequestException('This offer is no longer active');
      }
      // Match scope: variant-scoped offers pin to the exact variant, product-
      // scoped offers (variant_id IS NULL) can back any variant of that product.
      const matchesVariant = offer.variantId != null && offer.variantId === variant['id'];
      const matchesProduct = offer.variantId == null && offer.productId === variant['productId'];
      if (!matchesVariant && !matchesProduct) {
        throw new BadRequestException('The selected offer does not apply to this item');
      }
      storeId = offer.storeId;
      selectedOfferId = offer.id;
    }

    // Canonical products without an owning store require an explicit offer
    // selection so the cart can resolve pricing through the offer's store.
    if (!storeId) {
      throw new BadRequestException('This product requires a seller selection');
    }

    const cart = await this.getOrCreateCart(userId);
    // PHASE 13: lines are keyed by (variantId, offerId) so switching sellers
    // creates a new line rather than overwriting an existing seller's line.
    const existingConditions = [
      eq(cartItems.cartId, cart['id']),
      eq(cartItems.variantId, variant['id']),
      selectedOfferId
        ? eq(cartItems.offerId, selectedOfferId)
        : undefined,
    ].filter(Boolean) as ReturnType<typeof eq>[];
    const existing = await this.db.db.query.cartItems.findFirst({
      where: and(...existingConditions),
    });
    const finalQty = existing ? existing['quantity'] + input.quantity : input.quantity;

    // Resolve the unit price server-side from the store's active price lists
    // (highest-priority list, best tier whose minQty <= finalQty). The price is
    // SNAPSHOT here and is NEVER taken from the client — a client-supplied
    // price would be a tampering vector. A5-1: the same shared resolver backs the
    // product detail page, so what a buyer is shown is what they are charged.
    const pricing = await resolveOfferPrices(
      this.db.db,
      storeId,
      [variant['id']],
      finalQty,
      // Snapshotting needs the unit price only; the tier ladder is for display.
      { ladder: false },
    );
    const tier = pricing.get(variant['id']);

    if (!tier) {
      throw new BadRequestException(
        'No price is available for this item at the requested quantity',
      );
    }
    const priceMinor = tier.unitPriceMinor;
    const lineTotalMinor = finalQty * priceMinor;
    // Prefer the buyer's chosen offer; the resolver otherwise picks the store's
    // best-matching offer (legacy behaviour preserved when none is provided).
    const offerId = selectedOfferId ?? tier.offerId ?? null; // PHASE 10/13

    if (existing) {
      // Re-snapshot the price: the applicable tier can change with quantity.
      await this.db.db
        .update(cartItems)
        .set({
          quantity: finalQty,
          priceMinor,
          tierMinQty: tier.minQty,
          offerId,
          lineTotalMinor,
          updatedAt: new Date(),
        })
        .where(eq(cartItems.id, existing['id']));
    } else {
      await this.db.db.insert(cartItems).values({
        id: crypto.randomUUID(),
        cartId: cart['id'],
        storeId,
        variantId: variant['id'],
        quantity: finalQty,
        priceMinor,
        tierMinQty: tier.minQty,
        offerId,
        lineTotalMinor,
      });
    }

    // Recalculate cart total
    await this.recalculateTotal(cart['id']);
    return this.getActiveCartWithItems(userId);
  }

  /**
   * Batch add — used by reorder to add multiple lines in one call.
   * A5-4 residual: the old path called addItem once per line, re-reading
   * and re-snapshotting the whole cart each time. This batches the reads
   * and does a single recalculateTotal at the end.
   */
  async addItems(userId: string, items: AddCartItemInput[]) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('items must be a non-empty array');
    }
    const cart = await this.getOrCreateCart(userId);
    const skipped: { variantId: string; reason: string }[] = [];
    const added: string[] = [];

    for (const input of items) {
      if (!Number.isInteger(input.quantity) || input.quantity < 1) {
        skipped.push({ variantId: input.variantId, reason: 'Invalid quantity' });
        continue;
      }
      try {
        const variant = await this.db.db.query.productVariants.findFirst({
          where: eq(productVariants.id, input.variantId),
        });
        if (!variant || !variant['isActive']) {
          skipped.push({ variantId: input.variantId, reason: 'No longer available' });
          continue;
        }
        const product = await this.db.db.query.products.findFirst({
          where: eq(products.id, variant['productId']),
        });
        if (!product) {
          skipped.push({ variantId: input.variantId, reason: 'Product not found' });
          continue;
        }
        let storeId: string | null = product['storeId'];
        // PHASE 13: honour per-line explicit offer selection.
        let selectedOfferId: string | null = null;
        if (input.offerId) {
          const offer = await this.db.db.query.merchantOffers.findFirst({
            where: eq(merchantOffers.id, input.offerId),
          });
          if (!offer || offer.status !== 'ACTIVE') {
            skipped.push({ variantId: input.variantId, reason: 'Selected offer is not active' });
            continue;
          }
          const matchesVariant = offer.variantId != null && offer.variantId === variant['id'];
          const matchesProduct = offer.variantId == null && offer.productId === variant['productId'];
          if (!matchesVariant && !matchesProduct) {
            skipped.push({ variantId: input.variantId, reason: 'Selected offer does not apply to this item' });
            continue;
          }
          storeId = offer.storeId;
          selectedOfferId = offer.id;
        }
        // Canonical products without an owning store require offer selection.
        if (!storeId) {
          skipped.push({ variantId: input.variantId, reason: 'Product requires a seller selection' });
          continue;
        }
        const existingConditions = [
          eq(cartItems.cartId, cart['id']),
          eq(cartItems.variantId, variant['id']),
          selectedOfferId ? eq(cartItems.offerId, selectedOfferId) : undefined,
        ].filter(Boolean) as ReturnType<typeof eq>[];
        const existing = await this.db.db.query.cartItems.findFirst({
          where: and(...existingConditions),
        });
        const finalQty = existing ? existing['quantity'] + input.quantity : input.quantity;
        const pricing = await resolveOfferPrices(
          this.db.db,
          storeId,
          [variant['id']],
          finalQty,
          { ladder: false },
        );
        const tier = pricing.get(variant['id']);
        if (!tier) {
          skipped.push({ variantId: input.variantId, reason: 'No price at this quantity' });
          continue;
        }
        const priceMinor = tier.unitPriceMinor;
        const lineTotalMinor = finalQty * priceMinor;
        const offerId = selectedOfferId ?? tier.offerId ?? null; // PHASE 10/13
        if (existing) {
          await this.db.db
            .update(cartItems)
            .set({ quantity: finalQty, priceMinor, tierMinQty: tier.minQty, offerId, lineTotalMinor, updatedAt: new Date() })
            .where(eq(cartItems.id, existing['id']));
        } else {
          await this.db.db.insert(cartItems).values({
            id: crypto.randomUUID(),
            cartId: cart['id'],
            storeId,
            variantId: variant['id'],
            quantity: finalQty,
            priceMinor,
            tierMinQty: tier.minQty,
            offerId,
            lineTotalMinor,
          });
        }
        added.push(variant['id']);
      } catch {
        skipped.push({ variantId: input.variantId, reason: 'Internal error' });
      }
    }

    await this.recalculateTotal(cart['id']);
    const cartWithItems = await this.getActiveCartWithItems(userId);
    return { ...cartWithItems, added, skipped };
  }

  async updateItemQuantity(userId: string, itemId: string, quantity: number) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.getCartItem(itemId);

    if (item['cartId'] !== cart['id']) {
      throw new BadRequestException('Item does not belong to your cart');
    }

    if (quantity <= 0) {
      return this.removeItem(userId, itemId);
    }

    // ADVERSARIAL FIX: re-resolve the price tier when quantity changes. Without
    // this, a buyer who added 5 units at tier-1 price ($10) and then increased
    // to 50 units would still pay $10/unit even though tier-2 ($8) applies.
    // Conversely, decreasing from 50 to 5 must move back to the higher tier.
    const variantId = item['variantId'] as string;
    const storeId = item['storeId'] as string;
    const pricing = await resolveOfferPrices(
      this.db.db,
      storeId,
      [variantId],
      quantity,
      { ladder: false },
    );
    const tier = pricing.get(variantId);
    if (!tier) {
      throw new BadRequestException('No price available for this item at the new quantity');
    }
    const newLineTotal = quantity * tier.unitPriceMinor;
    const offerId = tier.offerId ?? (item['offerId'] as string | null) ?? null;

    await this.db.db
      .update(cartItems)
      .set({ quantity, priceMinor: tier.unitPriceMinor, tierMinQty: tier.minQty, offerId, lineTotalMinor: newLineTotal, updatedAt: new Date() })
      .where(eq(cartItems.id, itemId));

    await this.recalculateTotal(cart['id']);
    return this.getActiveCartWithItems(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreateCart(userId);
    const item = await this.getCartItem(itemId);

    if (item['cartId'] !== cart['id']) {
      throw new BadRequestException('Item does not belong to your cart');
    }

    await this.db.db.delete(cartItems).where(eq(cartItems.id, itemId));
    await this.recalculateTotal(cart['id']);
    return this.getActiveCartWithItems(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.db.db.delete(cartItems).where(eq(cartItems.cartId, cart['id']));
    await this.db.db
      .update(carts)
      .set({ totalMinor: 0, promoCode: null, promotionId: null, updatedAt: new Date() })
      .where(eq(carts.id, cart['id']));
    return { success: true };
  }

  async applyPromoCode(userId: string, promoCode: string, promotionId?: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.listCartItems(cart['id']);

    // Validate the code against the stores currently in the cart. A promotion is
    // store-scoped, so it is only valid if it matches an active promotion for one
    // of the suppliers the buyer actually has items from. Resolving here also
    // captures the concrete promotionId, so checkout applies a stable reference
    // rather than re-deriving it from the raw code. An empty cart cannot be
    // validated yet, so the code is stored optimistically.
    let resolvedId: string | null = promotionId || null;
    if (items.length > 0) {
      const storeIds = Array.from(new Set(items.map((i) => i['storeId'] as string)));
      let matched: any = null;
      for (const storeId of storeIds) {
        matched = await this.promotions.resolveApplicable(storeId, {
          promotionId: resolvedId,
          code: promoCode,
          userId,
        });
        if (matched) {
          resolvedId = matched['id'];
          break;
        }
      }
      if (!matched) {
        throw new BadRequestException('Invalid or expired promo code for the items in your cart');
      }
    }

    await this.db.db
      .update(carts)
      .set({ promoCode, promotionId: resolvedId, updatedAt: new Date() })
      .where(eq(carts.id, cart['id']));
    return this.getActiveCartWithItems(userId);
  }

  // ── Helpers ──────────────────────────────────────────────────

  async getCartItem(itemId: string) {
    const item = await this.db.db.query.cartItems.findFirst({
      where: eq(cartItems.id, itemId),
    });
    if (!item) throw new NotFoundException('Cart item not found');
    return item;
  }

  async listCartItems(cartId: string) {
    // A5-3: project readable labels onto the raw rows. `cart_items` stores no
    // title/sku/store snapshot, so without this join the cart and checkout UIs
    // rendered "Item" for every line and a UUID stub for every supplier.
    // LEFT joins keep lines visible even if a variant/product/store is gone.
    const rows = await this.db.db
      .select({
        item: cartItems,
        variantTitle: productVariants.title,
        productTitle: products.title,
        sku: productVariants.sku,
        storeName: stores.displayName,
        storeSlug: stores.slug,
        storeCurrency: stores.currency,
        // PHASE 14: expose per-line offer metadata so the cart UI can label
        // which seller's offer backs each row (lead time, MOQ, status).
        offerLeadTimeDays: merchantOffers.leadTimeDays,
        offerMoq: merchantOffers.moq,
        offerStatus: merchantOffers.status,
      })
      .from(cartItems)
      .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(stores, eq(cartItems.storeId, stores.id))
      .leftJoin(merchantOffers, eq(cartItems.offerId, merchantOffers.id))
      // Scope to this cart: without the WHERE the join would return every cart
      // line on the platform.
      .where(eq(cartItems.cartId, cartId))
      .orderBy(cartItems.createdAt);

    return rows.map(
      ({ item, variantTitle, productTitle, sku, storeName, storeSlug, storeCurrency, offerLeadTimeDays, offerMoq, offerStatus }) => ({
        ...item,
        title: variantTitle || productTitle || undefined,
        sku: sku || undefined,
        storeName: storeName || undefined,
        storeSlug: storeSlug || undefined,
        currency: storeCurrency || undefined,
        // PHASE 14: only populated when the line is backed by a merchant offer.
        offer: item.offerId
          ? {
              id: item.offerId,
              leadTimeDays: offerLeadTimeDays,
              moq: offerMoq,
              status: offerStatus,
            }
          : null,
      }),
    );
  }

  private async recalculateTotal(cartId: string) {
    const items = await this.listCartItems(cartId);
    const total = items.reduce((sum, item) => sum + item['lineTotalMinor'], 0);
    await this.db.db
      .update(carts)
      .set({ totalMinor: total, updatedAt: new Date() })
      .where(eq(carts.id, cartId));
  }

  /**
   * PHASE 11: Validate cart offers and re-price stale items.
   * Returns a report indicating which items are still valid and which
   * have been re-priced or are no longer purchasable.
   */
  async validateCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await this.listCartItems(cart['id']);

    const offerIds = items.map(i => i['offerId']).filter(Boolean) as string[];
    let activeSet: Set<string> | null = null;
    if (offerIds.length > 0) {
      const validOffers = await this.db.db.query.merchantOffers.findMany({
        where: and(inArray(merchantOffers.id, offerIds), eq(merchantOffers.status, 'ACTIVE')),
        columns: { id: true },
      });
      activeSet = new Set(validOffers.map(o => o.id));
    }

    const report: {
      valid: string[];
      repriced: Array<{ itemId: string; oldPriceMinor: number; newPriceMinor: number }>;
      stale: Array<{ itemId: string; reason: string }>;
    } = { valid: [], repriced: [], stale: [] };

    for (const item of items) {
      const oid = item['offerId'] as string | null;
      if (!oid) {
        // Legacy item (no offer) — still valid if product/variant are active
        report.valid.push(item['id'] as string);
        continue;
      }
      if (activeSet && !activeSet.has(oid)) {
        // Offer was suspended/withdrawn — try to re-price via fallback
        const variant = await this.db.db.query.productVariants.findFirst({
          where: eq(productVariants.id, item['variantId']),
        });
        if (!variant || !variant['isActive']) {
          report.stale.push({ itemId: item['id'] as string, reason: 'Variant no longer available' });
          continue;
        }
        const product = await this.db.db.query.products.findFirst({
          where: eq(products.id, variant['productId']),
        });
        if (!product) {
          report.stale.push({ itemId: item['id'] as string, reason: 'Product not found' });
          continue;
        }
        // Re-resolve pricing (will use fallback or a different offer)
        if (!product['storeId']) {
          report.stale.push({ itemId: item['id'] as string, reason: 'Product has no seller' });
          continue;
        }
        const pricing = await resolveOfferPrices(
          this.db.db, product['storeId'], [variant['id']], item['quantity'], { ladder: false },
        );
        const tier = pricing.get(variant['id']);
        if (!tier) {
          report.stale.push({ itemId: item['id'] as string, reason: 'No price available' });
          continue;
        }
        // Update the cart line
        const newLineTotal = item['quantity'] * tier.unitPriceMinor;
        await this.db.db.update(cartItems).set({
          priceMinor: tier.unitPriceMinor,
          tierMinQty: tier.minQty,
          offerId: tier.offerId ?? null,
          lineTotalMinor: newLineTotal,
          updatedAt: new Date(),
        }).where(eq(cartItems.id, item['id'] as string));
        report.repriced.push({
          itemId: item['id'] as string,
          oldPriceMinor: item['priceMinor'] as number,
          newPriceMinor: tier.unitPriceMinor,
        });
        continue;
      }
      report.valid.push(item['id'] as string);
    }

    if (report.repriced.length > 0) {
      await this.recalculateTotal(cart['id']);
    }

    const freshCart = await this.getActiveCartWithItems(userId);
    return { ...report, cart: freshCart };
  }
}

// ── Input types ──────────────────────────────────────────────────

/**
 * Class DTO (not an interface) so the global ValidationPipe can validate
 * incoming cart-add requests. Interface DTOs erase to Object at runtime and
 * bypass validation entirely — the root cause of the long-standing cart 400s.
 */
export class AddCartItemInput {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Accepted for backward compat; never trusted for pricing — derived from the variant\'s product.',
  })
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'PHASE 13: Explicit merchant offer to buy under.',
  })
  @IsOptional()
  @IsUUID()
  offerId?: string;
}
