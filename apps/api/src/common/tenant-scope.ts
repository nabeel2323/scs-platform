import { ForbiddenException } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseService } from './database/database.service';
import { stores, warehouses } from '../modules/merchant/merchant.schema';
import { products, productVariants } from '../modules/catalog/catalog.schema';
import { inventoryItems } from '../modules/inventory/inventory.schema';

/**
 * Caller context projected from the JWT (sub/role/activeOrg). Object-level
 * checks run only when a context is supplied; trusted internal calls that do
 * not forward one (services, outbox handlers, tests) bypass tenant scoping
 * by design — every HTTP entry point that touches a tenant-owned object MUST
 * forward the authenticated user.
 */
export interface CallerContext {
  sub: string;
  role?: string | null;
  activeOrg?: string | null;
}

/** Platform staff manage any tenant's objects. */
const BYPASS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'];

/**
 * Object-level tenant scoping (audit A3-1). Functional permission keys answer
 * "what kind of action is allowed"; these helpers answer "does this object
 * belong to the caller's organization" — cross-tenant access resolves to 403.
 *
 * Unlike the legacy OrgScopeGuard, every check here is fail-closed: a missing
 * resource or unresolved owner denies access instead of allowing it.
 */
export function isTenantPrivileged(caller: CallerContext): boolean {
  return BYPASS_ROLES.includes(caller.role || '');
}

async function storeOrgId(db: DatabaseService, storeId: string): Promise<string | null> {
  const store = await db.db.query.stores.findFirst({
    where: eq(stores.id, storeId),
    columns: { orgId: true },
  });
  return store?.orgId ?? null;
}

/** Throws unless the store belongs to the caller's active organization. */
export async function assertStoreInOrg(
  db: DatabaseService,
  caller: CallerContext,
  storeId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  const orgId = await storeOrgId(db, storeId);
  if (!orgId || orgId !== caller.activeOrg) {
    throw new ForbiddenException('You do not have access to this store');
  }
}

/** variant → product → store → org */
export async function assertVariantInOrg(
  db: DatabaseService,
  caller: CallerContext,
  variantId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  const variant = await db.db.query.productVariants.findFirst({
    where: eq(productVariants.id, variantId),
    columns: { productId: true },
  });
  if (!variant) throw new ForbiddenException('You do not have access to this variant');
  const product = await db.db.query.products.findFirst({
    where: eq(products.id, variant.productId),
    columns: { storeId: true },
  });
  if (!product) throw new ForbiddenException('You do not have access to this variant');
  if (!product.storeId) throw new ForbiddenException('You do not have access to this variant');
  await assertStoreInOrg(db, caller, product.storeId);
}

/** product → store → org (canonical products with no storeId are denied). */
export async function assertProductInOrg(
  db: DatabaseService,
  caller: CallerContext,
  productId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  const product = await db.db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { storeId: true },
  });
  if (!product) throw new ForbiddenException('You do not have access to this product');
  if (!product.storeId) throw new ForbiddenException('You do not have access to this product');
  await assertStoreInOrg(db, caller, product.storeId);
}

/** warehouse → store → org */
export async function assertWarehouseInOrg(
  db: DatabaseService,
  caller: CallerContext,
  warehouseId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  const warehouse = await db.db.query.warehouses.findFirst({
    where: eq(warehouses.id, warehouseId),
    columns: { storeId: true },
  });
  if (!warehouse) throw new ForbiddenException('You do not have access to this warehouse');
  await assertStoreInOrg(db, caller, warehouse.storeId);
}

/** inventory item → warehouse → store → org */
export async function assertInventoryItemInOrg(
  db: DatabaseService,
  caller: CallerContext,
  itemId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  const item = await db.db.query.inventoryItems.findFirst({
    where: eq(inventoryItems.id, itemId),
    columns: { warehouseId: true },
  });
  if (!item) throw new ForbiddenException('You do not have access to this inventory item');
  await assertWarehouseInOrg(db, caller, item.warehouseId);
}

/**
 * Sub-order access: the buyer owns it, the caller's org owns the fulfilling
 * store, or the caller is platform staff.
 */
export async function assertOrderAccessible(
  db: DatabaseService,
  caller: CallerContext,
  order: { buyerId?: string | null; storeId?: string | null },
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  if (order.buyerId && order.buyerId === caller.sub) return;
  if (order.storeId) {
    const orgId = await storeOrgId(db, order.storeId);
    if (orgId && orgId === caller.activeOrg) return;
  }
  throw new ForbiddenException('You do not have access to this order');
}

/**
 * Master-order access: the buyer owns it, the caller's org owns one of the
 * sub-order stores, or the caller is platform staff.
 */
export async function assertMasterOrderAccessible(
  db: DatabaseService,
  caller: CallerContext,
  master: { buyerId?: string | null },
  subOrderStoreIds: string[],
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  if (master.buyerId && master.buyerId === caller.sub) return;
  if (subOrderStoreIds.length > 0) {
    const rows = await db.db.query.stores.findMany({
      where: inArray(stores.id, subOrderStoreIds),
      columns: { orgId: true },
    });
    if (rows.some((r) => r.orgId === caller.activeOrg)) return;
  }
  throw new ForbiddenException('You do not have access to this order');
}
