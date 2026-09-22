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
import { productVariants } from '../catalog/catalog.schema';
import { products } from '../catalog/catalog.schema';
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

  // ── Store-level queries ──────────────────────────────────────

  async listByStore(storeId: string) {
    const whs = await this.db.db.query.warehouses.findMany({
      where: eq(warehouses.storeId, storeId),
      columns: { id: true },
    });
    if (whs.length === 0) return [];
    return this.db.db.query.inventoryItems.findMany({
      where: inArray(inventoryItems.warehouseId, whs.map(w => w.id)),
    });
  }

  /**
   * Create an inventory item (variant ↔ warehouse link) with optional initial stock.
   * If the item already exists, returns the existing row unchanged.
   */
  async createItem(input: CreateInventoryItemInput, caller?: CallerContext) {
    if (caller) {
      await assertWarehouseInOrg(this.db, caller, input.warehouseId);
      await assertVariantInOrg(this.db, caller, input.variantId);
    }
    const existing = await this.db.db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.variantId, input.variantId),
        eq(inventoryItems.warehouseId, input.warehouseId),
      ),
    });
    if (existing) return existing;

    const id = crypto.randomUUID();
    const initialQty = input.initialQty ?? 0;
    await this.db.db.insert(inventoryItems).values({
      id,
      variantId: input.variantId,
      warehouseId: input.warehouseId,
      qtyOnHand: initialQty,
      qtyReserved: 0,
      reorderPoint: 0,
    });

    // Record an IMPORT movement when initial stock is provided
    if (initialQty > 0) {
      await this.db.db.insert(stockMovements).values({
        id: crypto.randomUUID(),
        inventoryItemId: id,
        movementType: 'IMPORT',
        quantity: initialQty,
        reason: input.reason || 'Initial stock',
        performedBy: input.userId || null,
      });
    }

    return this.getItem(id);
  }

  async bulkAdjustStock(items: Array<{ inventoryItemId: string; quantity: number; reason?: string }>, userId?: string, caller?: CallerContext) {
    const results: Array<{ inventoryItemId: string; newQty: number }> = [];
    for (const item of items) {
      if (caller) await assertInventoryItemInOrg(this.db, caller, item.inventoryItemId);
      const inv = await this.getItem(item.inventoryItemId);
      const newQty = inv['qtyOnHand'] + item.quantity;
      if (newQty < 0) throw new BadRequestException(`Insufficient stock for ${item.inventoryItemId}`);

      await this.db.db
        .update(inventoryItems)
        .set({ qtyOnHand: newQty, updatedAt: new Date() })
        .where(eq(inventoryItems.id, item.inventoryItemId));

      await this.db.db.insert(stockMovements).values({
        id: crypto.randomUUID(),
        inventoryItemId: item.inventoryItemId,
        movementType: 'ADJUST',
        quantity: item.quantity,
        reason: item.reason || null,
        performedBy: userId || null,
      });

      results.push({ inventoryItemId: item.inventoryItemId, newQty });
    }
    return results;
  }

  async exportInventoryCsv(storeId: string) {
    const whs = await this.db.db.query.warehouses.findMany({
      where: eq(warehouses.storeId, storeId),
    });
    if (whs.length === 0) return 'Warehouse,SKU,Product,On Hand,Reserved,Available,Reorder Point\n';

    const items = await this.db.db.query.inventoryItems.findMany({
      where: inArray(inventoryItems.warehouseId, whs.map(w => w.id)),
    });

    const whById = new Map(whs.map(w => [w.id, w]));

    // Batch-fetch variant + product info
    const variantIds = [...new Set(items.map(i => i['variantId']))];
    const variantRows = variantIds.length > 0
      ? await this.db.db.query.productVariants.findMany({
          where: inArray(productVariants.id, variantIds),
        })
      : [];
    const variantById = new Map(variantRows.map(v => [v.id, v]));

    const productIds = [...new Set(variantRows.map(v => v['productId']))];
    const productRows = productIds.length > 0
      ? await this.db.db.query.products.findMany({
          where: inArray(products.id, productIds),
        })
      : [];
    const productById = new Map(productRows.map(p => [p.id, p]));

    const escape = (s: string) => s.includes(',') ? `"${s}"` : s;
    const lines = ['Warehouse,SKU,Product,On Hand,Reserved,Available,Reorder Point'];
    for (const item of items) {
      const wh = whById.get(item['warehouseId']);
      const variant = variantById.get(item['variantId']);
      const product = variant ? productById.get(variant['productId']) : undefined;
      lines.push([
        escape(wh?.name ?? ''),
        escape(variant?.sku ?? ''),
        escape(product?.title ?? ''),
        String(item['qtyOnHand']),
        String(item['qtyReserved']),
        String(item['qtyOnHand'] - item['qtyReserved']),
        String(item['reorderPoint']),
      ].join(','));
    }
    return lines.join('\n');
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

export interface CreateInventoryItemInput {
  variantId: string;
  warehouseId: string;
  initialQty?: number;
  reason?: string;
  userId?: string;
}

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
