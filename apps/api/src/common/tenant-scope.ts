import { ForbiddenException } from '@nestjs/common';
import { eq, and, inArray, isNull } from 'drizzle-orm';
import { DatabaseService } from './database/database.service';
import { recordOpsCounter } from '../modules/operations/ops-counters';
import { stores, warehouses, storeMembers } from '../modules/merchant/merchant.schema';
import { organizationMembers, organizations } from '../modules/identity/identity.schema';
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
const BYPASS_ROLES = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SYSTEM'];

/**
 * P13 Phase 4 §8 — organization scope for financial records (settlement
 * adjustments, commission reversals, reconciliation runs).
 *
 * Those services scope their queries "when an orgId is supplied", which is
 * correct for trusted internal callers but a fail-open at an HTTP boundary: a
 * token with no `activeOrg` claim would silently widen the query to every
 * organization, so a guessed UUID would read — or approve — a foreign record.
 *
 * This helper closes that hole at the edge, without changing the services:
 *   - platform staff (BYPASS_ROLES) may act across organizations, which is the
 *     behaviour p311-tenant-isolation TISO-07 pins as intentional;
 *   - every other role MUST be pinned to an organization, or the request is
 *     denied and counted so the P13 monitor can alert on it (alert 8).
 *
 * Denials here are unauthorized-financial-operation events, not errors: the
 * counter is an alert input and the caller's own audit row is written by the
 * generic audit middleware.
 */
export function financialOrgScope(caller: CallerContext): string | null {
  if (isTenantPrivileged(caller)) return caller.activeOrg ?? null;
  if (!caller.activeOrg) {
    recordOpsCounter('financial_isolation_denials_total', 1, 'missing_active_org');
    throw new ForbiddenException('An active organization is required to access financial records');
  }
  return caller.activeOrg;
}

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

/**
 * activeOrg is a JWT routing claim and can outlive membership revocation.
 * Require a current ACTIVE membership for non-platform organization access.
 */
export async function assertActiveOrgMembership(
  db: DatabaseService,
  caller: CallerContext,
  orgId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;
  if (!orgId || caller.activeOrg !== orgId) {
    throw new ForbiddenException('You do not have access to this organization');
  }

  const membershipQuery = db.db.query?.organizationMembers;
  const organizationQuery = db.db.query?.organizations;
  const [membership, organization] = await Promise.all([
    membershipQuery?.findFirst
      ? membershipQuery.findFirst({
          where: and(
            eq(organizationMembers.orgId, orgId),
            eq(organizationMembers.userId, caller.sub),
            eq(organizationMembers.status, 'ACTIVE'),
          ),
          columns: { id: true },
        })
      : db.db
          .select({ id: organizationMembers.id })
          .from(organizationMembers)
          .where(
            and(
              eq(organizationMembers.orgId, orgId),
              eq(organizationMembers.userId, caller.sub),
              eq(organizationMembers.status, 'ACTIVE'),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
    organizationQuery?.findFirst
      ? organizationQuery.findFirst({
          where: and(eq(organizations.id, orgId), eq(organizations.isActive, true)),
          columns: { id: true },
        })
      : db.db
          .select({ id: organizations.id })
          .from(organizations)
          .where(and(eq(organizations.id, orgId), eq(organizations.isActive, true)))
          .limit(1)
          .then((rows) => rows[0]),
  ]);

  if (!membership || !organization) {
    throw new ForbiddenException('You are not an active member of this organization');
  }
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
  await assertActiveOrgMembership(db, caller, orgId);
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
    if (orgId && orgId === caller.activeOrg) {
      await assertActiveOrgMembership(db, caller, orgId);
      return;
    }
  }
  throw new ForbiddenException('You do not have access to this order');
}

/**
 * warehouse → store → active organization + active store membership.
 * Inventory HTTP/service paths must use this instead of organization-only scope.
 */
export async function assertWarehouseMember(
  db: DatabaseService,
  caller: CallerContext,
  warehouseId: string,
): Promise<string> {
  if (isTenantPrivileged(caller)) {
    const privilegedWarehouse = await db.db.query.warehouses.findFirst({
      where: eq(warehouses.id, warehouseId),
      columns: { storeId: true },
    });
    if (!privilegedWarehouse)
      throw new ForbiddenException('You do not have access to this warehouse');
    return privilegedWarehouse.storeId;
  }

  const warehouse = await db.db.query.warehouses.findFirst({
    where: eq(warehouses.id, warehouseId),
    columns: { storeId: true },
  });
  if (!warehouse) throw new ForbiddenException('You do not have access to this warehouse');

  await assertStoreInOrg(db, caller, warehouse.storeId);
  await assertStoreMember(db, caller, warehouse.storeId);
  return warehouse.storeId;
}

/** variant → product → store → active organization + active store membership. */
export async function assertVariantStoreMember(
  db: DatabaseService,
  caller: CallerContext,
  variantId: string,
): Promise<string> {
  if (isTenantPrivileged(caller)) {
    const privilegedVariant = await db.db.query.productVariants.findFirst({
      where: eq(productVariants.id, variantId),
      columns: { productId: true },
    });
    if (!privilegedVariant) throw new ForbiddenException('You do not have access to this variant');
    const privilegedProduct = await db.db.query.products.findFirst({
      where: eq(products.id, privilegedVariant.productId),
      columns: { storeId: true },
    });
    if (!privilegedProduct?.storeId)
      throw new ForbiddenException('You do not have access to this variant');
    return privilegedProduct.storeId;
  }

  const variant = await db.db.query.productVariants.findFirst({
    where: eq(productVariants.id, variantId),
    columns: { productId: true },
  });
  if (!variant) throw new ForbiddenException('You do not have access to this variant');

  const product = await db.db.query.products.findFirst({
    where: eq(products.id, variant.productId),
    columns: { storeId: true },
  });
  if (!product?.storeId) throw new ForbiddenException('You do not have access to this variant');

  await assertStoreInOrg(db, caller, product.storeId);
  await assertStoreMember(db, caller, product.storeId);
  return product.storeId;
}

/** inventory item → warehouse → store → active organization + active membership. */
export async function assertInventoryItemMember(
  db: DatabaseService,
  caller: CallerContext,
  itemId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;

  const item = await db.db.query.inventoryItems.findFirst({
    where: eq(inventoryItems.id, itemId),
    columns: { warehouseId: true, variantId: true },
  });
  if (!item) throw new ForbiddenException('You do not have access to this inventory item');

  const warehouseStoreId = await assertWarehouseMember(db, caller, item.warehouseId);
  const variantStoreId = await assertVariantStoreMember(db, caller, item.variantId);
  if (warehouseStoreId !== variantStoreId) {
    throw new ForbiddenException('You do not have access to this inventory item');
  }
}

/**
 * Store-level membership check (migration 0054).
 *
 * Verifies that the caller is an ACTIVE member of the specified store.
 * Privileged roles (SUPER_ADMIN, ADMIN, MODERATOR) bypass this check.
 *
 * This helper is ADDITIVE to the existing org-level checks — it does NOT
 * replace assertStoreInOrg / assertProductInOrg.  Product Studio endpoints
 * call BOTH: first the org-level check, then this store-level check.
 *
 * @throws ForbiddenException if the caller is not an ACTIVE store member
 */
export async function assertStoreMember(
  db: DatabaseService,
  caller: CallerContext,
  storeId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;

  const membership = await db.db.query.storeMembers.findFirst({
    where: and(
      eq(storeMembers.storeId, storeId),
      eq(storeMembers.userId, caller.sub),
      eq(storeMembers.status, 'ACTIVE'),
    ),
    columns: { id: true },
  });

  if (!membership) {
    throw new ForbiddenException('You are not authorized for this store');
  }
}

/**
 * Read visibility for catalog surfaces:
 * - ACTIVE products are buyer-visible.
 * - Non-ACTIVE products are visible only to an active member of the owning
 *   store (or a platform-privileged caller).
 * A missing/foreign store membership is a normal public-read path, not an
 * authorization error; callers must then constrain queries to ACTIVE.
 */
export async function canManageStoreCatalog(
  db: DatabaseService,
  caller: CallerContext,
  storeId: string,
): Promise<boolean> {
  if (isTenantPrivileged(caller)) return true;
  if (!caller.activeOrg) return false;
  const orgId = await storeOrgId(db, storeId);
  if (!orgId || orgId !== caller.activeOrg) return false;
  try {
    await assertActiveOrgMembership(db, caller, orgId);
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
  const membership = await db.db.query.storeMembers.findFirst({
    where: and(
      eq(storeMembers.storeId, storeId),
      eq(storeMembers.userId, caller.sub),
      eq(storeMembers.status, 'ACTIVE'),
    ),
    columns: { id: true },
  });
  return !!membership;
}

/**
 * Product detail/variant/media read boundary. Public callers may read ACTIVE
 * products; drafts, rejected, archived and other non-ACTIVE states are
 * restricted to active members of the owning store and platform staff.
 */
export async function assertProductReadable(
  db: DatabaseService,
  caller: CallerContext,
  productId: string,
): Promise<void> {
  const product = await db.db.query.products.findFirst({
    where: and(eq(products.id, productId), isNull(products.deletedAt)),
    columns: { storeId: true, status: true },
  });
  if (!product) throw new ForbiddenException('You do not have access to this product');
  if (product.status === 'ACTIVE' || isTenantPrivileged(caller)) return;
  await assertProductEditableByMerchant(db, caller, productId);
}

/** product → store → active organization + membership visibility for studio data. */
export async function canManageProductCatalog(
  db: DatabaseService,
  caller: CallerContext,
  productId: string,
): Promise<boolean> {
  const product = await db.db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { storeId: true },
  });
  if (!product?.storeId) return false;
  return canManageStoreCatalog(db, caller, product.storeId);
}

/**
 * Product Studio convenience helper — combines existing org-level check
 * with store-level membership authorization.
 *
 * Flow:
 *   1. Load product → get storeId
 *   2. Verify store belongs to caller's org (existing assertProductInOrg)
 *   3. Verify caller is ACTIVE member of that store (assertStoreMember)
 *
 * Privileged roles bypass both checks via isTenantPrivileged.
 */
export async function assertProductEditableByMerchant(
  db: DatabaseService,
  caller: CallerContext,
  productId: string,
): Promise<void> {
  if (isTenantPrivileged(caller)) return;

  // Load product to get storeId
  const product = await db.db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { storeId: true },
  });
  if (!product) throw new ForbiddenException('You do not have access to this product');
  if (!product.storeId) throw new ForbiddenException('You do not have access to this product');

  // Org-level check (preserved)
  await assertStoreInOrg(db, caller, product.storeId);

  // Store-level membership check (new)
  await assertStoreMember(db, caller, product.storeId);
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
    if (rows.some((r) => r.orgId === caller.activeOrg)) {
      await assertActiveOrgMembership(db, caller, caller.activeOrg!);
      return;
    }
  }
  throw new ForbiddenException('You do not have access to this order');
}
