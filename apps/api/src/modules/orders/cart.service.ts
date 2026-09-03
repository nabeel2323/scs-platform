import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { carts, cartItems } from './cart.schema';
import { eq, and, desc } from 'drizzle-orm';
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
    const cart = await this.getOrCreateCart(userId);

    // Check if item already exists in cart (upsert)
    const existing = await this.db.db.query.cartItems.findFirst({
      where: and(
        eq(cartItems.cartId, cart['id']),
        eq(cartItems.variantId, input.variantId),
      ),
    });

    if (existing) {
      // Update quantity and recalculate
      const newQty = existing['quantity'] + input.quantity;
      const newLineTotal = newQty * existing['priceMinor'];

      await this.db.db
        .update(cartItems)
        .set({
          quantity: newQty,
          lineTotalMinor: newLineTotal,
          updatedAt: new Date(),
        })
        .where(eq(cartItems.id, existing['id']));
    } else {
      const itemId = crypto.randomUUID();
      await this.db.db.insert(cartItems).values({
        id: itemId,
        cartId: cart['id'],
        storeId: input.storeId,
        variantId: input.variantId,
        quantity: input.quantity,
        priceMinor: input.priceMinor,
        tierMinQty: input.tierMinQty || 1,
        lineTotalMinor: input.quantity * input.priceMinor,
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

  async applyPromoCode(userId: string, promoCode: string, promotionId: string) {
    const cart = await this.getOrCreateCart(userId);
    await this.db.db
      .update(carts)
      .set({ promoCode, promotionId, updatedAt: new Date() })
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
  storeId: string;
  variantId: string;
  quantity: number;
  priceMinor: number;
  tierMinQty?: number;
}
