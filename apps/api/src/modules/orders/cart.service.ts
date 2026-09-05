import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { carts, cartItems } from './cart.schema';
import { products, productVariants } from '../catalog/catalog.schema';
import { priceLists, priceTiers } from '../pricing/pricing.schema';
import { eq, and, desc, lte } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Cart service — multi-supplier cart with price snapshots.
 *
 * One active cart per user. Items grouped by store_id for supplier grouping.
 * Price is SNAPSHOT at add time (not live from price list).
 */
@Injectable()
export class CartService {
  constructor(private readonly db: DatabaseService) {}

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
      where: and(
        eq(cartItems.cartId, cart['id']),
        eq(cartItems.variantId, variant['id']),
      ),
    });
    const finalQty = existing ? existing['quantity'] + input.quantity : input.quantity;

    // Resolve the unit price server-side from the store's active price lists
    // (highest-priority list, best tier whose minQty <= finalQty). The price is
    // SNAPSHOT here and is NEVER taken from the client — a client-supplied
    // price would be a tampering vector.
    const tierRows = await this.db.db
      .select({ unitPriceMinor: priceTiers.unitPriceMinor, minQty: priceTiers.minQty })
      .from(priceTiers)
      .innerJoin(priceLists, eq(priceTiers.priceListId, priceLists.id))
      .where(and(
        eq(priceLists.storeId, storeId),
        eq(priceLists.isActive, true),
        eq(priceTiers.variantId, variant['id']),
        lte(priceTiers.minQty, finalQty),
      ))
      .orderBy(desc(priceLists.priority), desc(priceTiers.minQty))
      .limit(1);

    const tier = tierRows[0];
    if (!tier) {
      throw new BadRequestException('No price is available for this item at the requested quantity');
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
    await this.db.db
      .update(carts)
      .set({ promoCode, promotionId: promotionId || null, updatedAt: new Date() })
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
    return this.db.db.query.cartItems.findMany({
      where: eq(cartItems.cartId, cartId),
      orderBy: [cartItems.createdAt],
    });
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
