import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { OutboxDispatcher } from '../../common/outbox/outbox-dispatcher.service';
import { inventoryItems, stockMovements } from './inventory.schema';
import { stores, warehouses } from '../merchant/merchant.schema';
import {
  CallerContext,
  assertInventoryItemInOrg,
  assertVariantInOrg,
  assertWarehouseInOrg,
  isTenantPrivileged,
} from '../../common/tenant-scope';
import { eq, and, lte, desc, inArray, count } from 'drizzle-orm';
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
  constructor(
    private readonly db: DatabaseService,
    private readonly outbox: OutboxDispatcher,
  ) {}

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

  async listByStore(storeId: string, paging?: { limit: number; offset: number }) {
    const whs = await this.db.db.query.warehouses.findMany({
      where: eq(warehouses.storeId, storeId),
      columns: { id: true },
    });
    if (whs.length === 0) return { data: [], total: 0 };
    const whIds = whs.map(w => w.id);
    const [data, totalRows] = await Promise.all([
      this.db.db.query.inventoryItems.findMany({
        where: inArray(inventoryItems.warehouseId, whIds),
        limit: paging?.limit ?? 50,
        offset: paging?.offset ?? 0,
      }),
      this.db.db.select({ count: count() }).from(inventoryItems).where(inArray(inventoryItems.warehouseId, whIds)),
    ]);
    return { data, total: totalRows[0]?.count ?? 0 };
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

    // Emit low-stock alert if stock dropped below reorder point
    if (item['lowStockAlert'] && newQty <= item['reorderPoint']) {
      await this.outbox.publish('inventory.low_stock', input.inventoryItemId, {
        inventoryItemId: input.inventoryItemId,
        variantId: item['variantId'],
        warehouseId: item['warehouseId'],
        qtyOnHand: newQty,
        reorderPoint: item['reorderPoint'],
      });
    }

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

  // ── Warehouse Transfer ───────────────────────────────────────

  /**
   * Transfer stock from one warehouse to another.
   * Decrements source inventory and increments (or creates) destination inventory.
   * Records ADJUST movements on both sides for audit trail.
   */
  async transferStock(input: TransferStockInput, caller?: CallerContext) {
    if (input.quantity <= 0) throw new BadRequestException('Transfer quantity must be positive');
    if (input.fromWarehouseId === input.toWarehouseId) throw new BadRequestException('Source and destination warehouses must differ');

    if (caller) {
      await assertWarehouseInOrg(this.db, caller, input.fromWarehouseId);
      await assertWarehouseInOrg(this.db, caller, input.toWarehouseId);
      await assertInventoryItemInOrg(this.db, caller, input.inventoryItemId);
    }

    const item = await this.getItem(input.inventoryItemId);
    if (item['warehouseId'] !== input.fromWarehouseId) {
      throw new BadRequestException('Inventory item does not belong to source warehouse');
    }

    const sourceQty = item['qtyOnHand'] - input.quantity;
    if (sourceQty < 0) throw new BadRequestException('Insufficient stock for transfer');

    // Decrement source
    await this.db.db
      .update(inventoryItems)
      .set({ qtyOnHand: sourceQty, updatedAt: new Date() })
      .where(eq(inventoryItems.id, input.inventoryItemId));

    await this.db.db.insert(stockMovements).values({
      id: crypto.randomUUID(),
      inventoryItemId: input.inventoryItemId,
      movementType: 'ADJUST',
      quantity: -input.quantity,
      reason: input.reason || `Transfer to warehouse ${input.toWarehouseId}`,
      performedBy: input.userId || null,
    });

    // Find or create destination inventory item for the same variant
    const destItem = await this.db.db.query.inventoryItems.findFirst({
      where: and(
        eq(inventoryItems.variantId, item['variantId']),
        eq(inventoryItems.warehouseId, input.toWarehouseId),
      ),
    });

    let destId: string;
    if (destItem) {
      destId = destItem.id;
      await this.db.db
        .update(inventoryItems)
        .set({ qtyOnHand: destItem['qtyOnHand'] + input.quantity, updatedAt: new Date() })
        .where(eq(inventoryItems.id, destId));
    } else {
      destId = crypto.randomUUID();
      await this.db.db.insert(inventoryItems).values({
        id: destId,
        variantId: item['variantId'],
        warehouseId: input.toWarehouseId,
        qtyOnHand: input.quantity,
        qtyReserved: 0,
        reorderPoint: 0,
      });
    }

    await this.db.db.insert(stockMovements).values({
      id: crypto.randomUUID(),
      inventoryItemId: destId,
      movementType: 'ADJUST',
      quantity: input.quantity,
      reason: input.reason || `Transfer from warehouse ${input.fromWarehouseId}`,
      performedBy: input.userId || null,
    });

    // Emit outbox event for notifications / audit
    await this.outbox.publish('inventory.transferred', input.inventoryItemId, {
      inventoryItemId: input.inventoryItemId,
      variantId: item['variantId'],
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      quantity: input.quantity,
    });

    return { sourceNewQty: sourceQty, destId, destNewQty: destItem ? destItem['qtyOnHand'] + input.quantity : input.quantity };
  }

  // ── Movement Export ───────────────────────────────────────────

  /**
   * Export all stock movements for a store as CSV.
   * Fetches across all warehouses owned by the store.
   */
  async exportMovementsCsv(storeId: string) {
    const whs = await this.db.db.query.warehouses.findMany({
      where: eq(warehouses.storeId, storeId),
    });
    if (whs.length === 0) return 'Movement Type,SKU,Product,Warehouse,Quantity,Reason,Date\n';

    const whIds = whs.map(w => w.id);
    const items = await this.db.db.query.inventoryItems.findMany({
      where: inArray(inventoryItems.warehouseId, whIds),
    });
    if (items.length === 0) return 'Movement Type,SKU,Product,Warehouse,Quantity,Reason,Date\n';

    const itemIds = items.map(i => i.id);
    const movements = await this.db.db.query.stockMovements.findMany({
      where: inArray(stockMovements.inventoryItemId, itemIds),
      orderBy: [desc(stockMovements.createdAt)],
      limit: 5000,
    });

    const itemById = new Map(items.map(i => [i.id, i]));
    const whById = new Map(whs.map(w => [w.id, w]));

    // Batch-fetch variant + product info
    const variantIds = [...new Set(items.map(i => i['variantId']))];
    const variantRows = await this.db.db.query.productVariants.findMany({
      where: inArray(productVariants.id, variantIds),
    });
    const variantById = new Map(variantRows.map(v => [v.id, v]));
    const productIds = [...new Set(variantRows.map(v => v['productId']))];
    const productRows = productIds.length > 0
      ? await this.db.db.query.products.findMany({ where: inArray(products.id, productIds) })
      : [];
    const productById = new Map(productRows.map(p => [p.id, p]));

    const escape = (s: string) => s.includes(',') ? `"${s}"` : s;
    const lines = ['Movement Type,SKU,Product,Warehouse,Quantity,Reason,Date'];
    for (const m of movements) {
      const item = itemById.get(m['inventoryItemId']);
      const variant = item ? variantById.get(item['variantId']) : undefined;
      const product = variant ? productById.get(variant['productId']) : undefined;
      const wh = item ? whById.get(item['warehouseId']) : undefined;
      lines.push([
        m['movementType'],
        escape(variant?.sku ?? ''),
        escape(product?.title ?? ''),
        escape(wh?.name ?? ''),
        String(m['quantity']),
        escape(m['reason'] ?? ''),
        m['createdAt'] instanceof Date ? m['createdAt'].toISOString() : String(m['createdAt']),
      ].join(','));
    }
    return lines.join('\n');
  }

  // ── Low-Stock Check & Notification ───────────────────────────

  /**
   * Check all inventory items for a store and emit low-stock outbox events
   * for items that have dropped below their reorder point with alerts enabled.
   * Returns the list of items that triggered alerts.
   */
  async checkAndNotifyLowStock(storeId: string) {
    const whs = await this.db.db.query.warehouses.findMany({
      where: eq(warehouses.storeId, storeId),
      columns: { id: true },
    });
    if (whs.length === 0) return [];

    const items = await this.db.db.query.inventoryItems.findMany({
      where: inArray(inventoryItems.warehouseId, whs.map(w => w.id)),
    });

    const lowItems = items.filter(i => i['lowStockAlert'] && i['qtyOnHand'] - i['qtyReserved'] <= i['reorderPoint']);

    for (const item of lowItems) {
      await this.outbox.publish('inventory.low_stock', item.id, {
        inventoryItemId: item.id,
        variantId: item['variantId'],
        warehouseId: item['warehouseId'],
        qtyOnHand: item['qtyOnHand'],
        qtyReserved: item['qtyReserved'],
        reorderPoint: item['reorderPoint'],
      });
    }

    return lowItems;
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

export interface TransferStockInput {
  inventoryItemId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  reason?: string;
  userId?: string;
}
