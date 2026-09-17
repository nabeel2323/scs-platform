import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { PromotionsService } from '../promotions/promotions.service';
import { carts, cartItems } from './cart.schema';
import { products, productVariants } from '../catalog/catalog.schema';
import { stores } from '../merchant/merchant.schema';
import { resolveVariantPrices } from '../pricing/price-resolution';
import { eq, and } from 'drizzle-orm';
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
    const storeId = product['storeId'];

    const cart = await this.getOrCreateCart(userId);
    const existing = await this.db.db.query.cartItems.findFirst({
      where: and(eq(cartItems.cartId, cart['id']), eq(cartItems.variantId, variant['id'])),
    });
    const finalQty = existing ? existing['quantity'] + input.quantity : input.quantity;

    // Resolve the unit price server-side from the store's active price lists
    // (highest-priority list, best tier whose minQty <= finalQty). The price is
    // SNAPSHOT here and is NEVER taken from the client — a client-supplied
    // price would be a tampering vector. A5-1: the same shared resolver backs the
    // product detail page, so what a buyer is shown is what they are charged.
    const pricing = await resolveVariantPrices(
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

    if (existing) {
      // Re-snapshot the price: the applicable tier can change with quantity.
      await this.db.db
        .update(cartItems)
        .set({
          quantity: finalQty,
          priceMinor,
          tierMinQty: tier.minQty,
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
        const storeId = product['storeId'];
        const existing = await this.db.db.query.cartItems.findFirst({
          where: and(eq(cartItems.cartId, cart['id']), eq(cartItems.variantId, variant['id'])),
        });
        const finalQty = existing ? existing['quantity'] + input.quantity : input.quantity;
        const pricing = await resolveVariantPrices(
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
        if (existing) {
          await this.db.db
            .update(cartItems)
            .set({ quantity: finalQty, priceMinor, tierMinQty: tier.minQty, lineTotalMinor, updatedAt: new Date() })
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

    const newLineTotal = quantity * item['priceMinor'];
    await this.db.db
      .update(cartItems)
      .set({ quantity, lineTotalMinor: newLineTotal, updatedAt: new Date() })
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
      })
      .from(cartItems)
      .leftJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .leftJoin(products, eq(productVariants.productId, products.id))
      .leftJoin(stores, eq(cartItems.storeId, stores.id))
      // Scope to this cart: without the WHERE the join would return every cart
      // line on the platform.
      .where(eq(cartItems.cartId, cartId))
      .orderBy(cartItems.createdAt);

    return rows.map(
      ({ item, variantTitle, productTitle, sku, storeName, storeSlug, storeCurrency }) => ({
        ...item,
        title: variantTitle || productTitle || undefined,
        sku: sku || undefined,
        storeName: storeName || undefined,
        storeSlug: storeSlug || undefined,
        currency: storeCurrency || undefined,
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
}

// ── Input types ──────────────────────────────────────────────────

export interface AddCartItemInput {
  variantId: string;
  quantity: number;
  /**
   * Optional and never trusted for pricing — the authoritative store is
   * derived from the variant's product. Accepted for backward compatibility.
   */
  storeId?: string;
}
