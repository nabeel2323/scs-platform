import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { inventoryItems, stockMovements } from './inventory.schema';
import { eq, and, lte, desc } from 'drizzle-orm';
import crypto from 'node:crypto';

/**
 * Inventory service — stock tracking, reservations, movements.
 *
 * Reservation policy: stock reserved at merchant acceptance, not at cart.
 * All changes go through the stock_movements ledger.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly db: DatabaseService) {}

  // ── Inventory Items ──────────────────────────────────────────

  async getOrCreateItem(variantId: string, warehouseId: string) {
    const existing = await this.db.db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.variantId, variantId),
        eq(inventoryItems.warehouseId, warehouseId),
      ),
    });
    if (existing) return existing;

    const id = crypto.randomUUID();
    await this.db.db.insert(inventoryItems).values({
      id,
      variantId,
      warehouseId,
      qtyOnHand: 0,
      qtyReserved: 0,
      reorderPoint: 0,
    });

    return this.getItem(id);
  }

  async getItem(id: string) {
    const item = await this.db.db.query.inventoryItems.findFirst({
      where: eq(inventoryItems.id, id),
    });
    if (!item) throw new NotFoundException('Inventory item not found');
    return item;
  }

  async listByWarehouse(warehouseId: string) {
    return this.db.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.warehouseId, warehouseId),
    });
  }

  async listByVariant(variantId: string) {
    return this.db.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.variantId, variantId),
    });
  }

  async updateItem(id: string, input: UpdateInventoryInput) {
    const item = await this.getItem(id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.reorderPoint !== undefined) updates['reorderPoint'] = input.reorderPoint;
    if (input.maxStock !== undefined) updates['maxStock'] = input.maxStock;
    if (input.lowStockAlert !== undefined) updates['lowStockAlert'] = input.lowStockAlert;

    await this.db.db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, id));
    return this.getItem(id);
  }

  async getLowStockItems(warehouseId?: string) {
    const conditions = [
      lte(inventoryItems.qtyOnHand, inventoryItems.reorderPoint),
      eq(inventoryItems.lowStockAlert, true),
    ];
    if (warehouseId) conditions.push(eq(inventoryItems.warehouseId, warehouseId));

    return this.db.db.query.inventoryItems.findMany({
      where: and(...conditions),
    });
  }

  // ── Stock Adjustments ────────────────────────────────────────

  async adjustStock(input: AdjustStockInput) {
    const item = await this.getItem(input.inventoryItemId);

    // Update quantity
    const newQty = item['qtyOnHand'] + input.quantity;
    if (newQty < 0) throw new BadRequestException('Insufficient stock for adjustment');

    await this.db.db
      .update(inventoryItems)
      .set({ qtyOnHand: newQty, updatedAt: new Date() })
      .where(eq(inventoryItems.id, input.inventoryItemId));

    // Record movement
    const movementId = crypto.randomUUID();
    await this.db.db.insert(stockMovements).values({
      id: movementId,
      inventoryItemId: input.inventoryItemId,
      movementType: 'ADJUST',
      quantity: input.quantity,
      reason: input.reason || null,
      performedBy: input.userId || null,
    });

    return { movementId, newQty };
  }

  // ── Reservations ─────────────────────────────────────────────

  async reserveStock(input: ReserveStockInput) {
    const item = await this.getItem(input.inventoryItemId);
    const available = item['qtyOnHand'] - item['qtyReserved'];

    if (available < input.quantity) {
      throw new BadRequestException(`Insufficient available stock: ${available} < ${input.quantity}`);
    }

    await this.db.db
      .update(inventoryItems)
      .set({ qtyReserved: item['qtyReserved'] + input.quantity, updatedAt: new Date() })
      .where(eq(inventoryItems.id, input.inventoryItemId));

    const movementId = crypto.randomUUID();
    await this.db.db.insert(stockMovements).values({
      id: movementId,
      inventoryItemId: input.inventoryItemId,
      movementType: 'RESERVE',
      quantity: -input.quantity,
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      performedBy: input.userId || null,
    });

    return { movementId };
  }

  async releaseStock(input: ReserveStockInput) {
    const item = await this.getItem(input.inventoryItemId);

    const newReserved = Math.max(0, item['qtyReserved'] - input.quantity);
    await this.db.db
      .update(inventoryItems)
      .set({ qtyReserved: newReserved, updatedAt: new Date() })
      .where(eq(inventoryItems.id, input.inventoryItemId));

    const movementId = crypto.randomUUID();
    await this.db.db.insert(stockMovements).values({
      id: movementId,
      inventoryItemId: input.inventoryItemId,
      movementType: 'RELEASE',
      quantity: input.quantity,
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      performedBy: input.userId || null,
    });

    return { movementId };
  }

  // ── Stock Movements ──────────────────────────────────────────

  async listMovements(inventoryItemId: string, limit = 50) {
    return this.db.db.query.stockMovements.findMany({
      where: eq(stockMovements.inventoryItemId, inventoryItemId),
      orderBy: [desc(stockMovements.createdAt)],
      limit,
    });
  }
}

// ── Input types ──────────────────────────────────────────────────

export interface UpdateInventoryInput {
  reorderPoint?: number;
  maxStock?: number;
  lowStockAlert?: boolean;
}

export interface AdjustStockInput {
  inventoryItemId: string;
  quantity: number;  // positive = add, negative = remove
  reason?: string;
  userId?: string;
}

export interface ReserveStockInput {
  inventoryItemId: string;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  userId?: string;
}
