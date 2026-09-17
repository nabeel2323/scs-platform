import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { inventoryItems, stockMovements } from './inventory.schema';
import { stores, warehouses } from '../merchant/merchant.schema';
import {
  CallerContext,
  assertInventoryItemInOrg,
  assertVariantInOrg,
  assertWarehouseInOrg,
  isTenantPrivileged,
} from '../../common/tenant-scope';
import { eq, and, lte, desc, inArray } from 'drizzle-orm';
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

  async listByWarehouse(warehouseId: string, caller?: CallerContext) {
    if (caller) await assertWarehouseInOrg(this.db, caller, warehouseId);
    return this.db.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.warehouseId, warehouseId),
    });
  }

  async listByVariant(variantId: string, caller?: CallerContext) {
    if (caller) await assertVariantInOrg(this.db, caller, variantId);
    return this.db.db.query.inventoryItems.findMany({
      where: eq(inventoryItems.variantId, variantId),
    });
  }

  async updateItem(id: string, input: UpdateInventoryInput, caller?: CallerContext) {
    // Existence check first: PATCH on an unknown item must 404 rather than
    // silently update zero rows.
    await this.getItem(id);
    if (caller) await assertInventoryItemInOrg(this.db, caller, id);
    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.reorderPoint !== undefined) updates['reorderPoint'] = input.reorderPoint;
    if (input.maxStock !== undefined) updates['maxStock'] = input.maxStock;
    if (input.lowStockAlert !== undefined) updates['lowStockAlert'] = input.lowStockAlert;

    await this.db.db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, id));
    return this.getItem(id);
  }

  async getLowStockItems(warehouseId?: string, caller?: CallerContext) {
    const conditions = [
      lte(inventoryItems.qtyOnHand, inventoryItems.reorderPoint),
      eq(inventoryItems.lowStockAlert, true),
    ];
    if (warehouseId) {
      if (caller) await assertWarehouseInOrg(this.db, caller, warehouseId);
      conditions.push(eq(inventoryItems.warehouseId, warehouseId));
    } else if (caller && !isTenantPrivileged(caller)) {
      // A3-1: without an explicit warehouse, non-staff callers only see items
      // inside their own organization's warehouses.
      const orgStores = await this.db.db.query.stores.findMany({
        where: eq(stores.orgId, caller.activeOrg || ''),
        columns: { id: true },
      });
      if (orgStores.length === 0) return [];
      const orgWarehouses = await this.db.db.query.warehouses.findMany({
        where: inArray(warehouses.storeId, orgStores.map((s) => s.id)),
        columns: { id: true },
      });
      if (orgWarehouses.length === 0) return [];
      conditions.push(inArray(inventoryItems.warehouseId, orgWarehouses.map((w) => w.id)));
    }

    return this.db.db.query.inventoryItems.findMany({
      where: and(...conditions),
    });
  }

  // ── Stock Adjustments ────────────────────────────────────────

  async adjustStock(input: AdjustStockInput, caller?: CallerContext) {
    const item = await this.getItem(input.inventoryItemId);
    if (caller) await assertInventoryItemInOrg(this.db, caller, input.inventoryItemId);

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

  async reserveStock(input: ReserveStockInput, caller?: CallerContext) {
    const item = await this.getItem(input.inventoryItemId);
    if (caller) await assertInventoryItemInOrg(this.db, caller, input.inventoryItemId);
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

  async releaseStock(input: ReserveStockInput, caller?: CallerContext) {
    const item = await this.getItem(input.inventoryItemId);
    if (caller) await assertInventoryItemInOrg(this.db, caller, input.inventoryItemId);

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

  async listMovements(inventoryItemId: string, limit = 50, caller?: CallerContext) {
    if (caller) await assertInventoryItemInOrg(this.db, caller, inventoryItemId);
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
