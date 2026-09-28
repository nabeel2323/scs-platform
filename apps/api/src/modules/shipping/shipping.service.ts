import {
  Injectable, Logger, OnModuleInit,
  NotFoundException, ForbiddenException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { eq, and, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { ManualDeliveryProvider } from './providers/manual-delivery.provider';
import { ShippingProvider } from './shipping-provider';
import { CreateShipmentRequest, CreateShipmentResult } from './shipping.types';
import {
  shippingMethods, deliveryZones, deliveryZoneMethods,
} from './shipping.schema';
import {
  resolveShippingCost, matchDeliveryZone,
  ShippingCostResult, DeliveryZoneRow, ZoneMatchInput,
} from './shipping-cost.resolver';
import { CallerContext } from '../../common/tenant-scope';
import { stores } from '../merchant/merchant.schema';

// ── Input / Output types ────────────────────────────────────────────────────

export interface CreateShippingMethodInput {
  storeId: string;
  key: string;
  name: string;
  description?: string;
  fulfillmentMethod: string;
  carrierType?: string;
  type?: string;
  baseFeeMinor: number;
  minOrderMinor?: number;
  freeAboveMinor?: number;
  estimatedDaysMin?: number;
  estimatedDaysMax?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateShippingMethodInput {
  name?: string;
  description?: string;
  baseFeeMinor?: number;
  minOrderMinor?: number | null;
  freeAboveMinor?: number | null;
  estimatedDaysMin?: number | null;
  estimatedDaysMax?: number | null;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateDeliveryZoneInput {
  storeId: string;
  name: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateDeliveryZoneInput {
  name?: string;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ShippingEstimateItem {
  methodId: string;
  key: string | null;
  name: string;
  type: string;
  carrierType: string;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  feeMinor: number;
  currency: string;
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'FREE';
  reason?: string;
}

export interface StoreShippingEstimate {
  storeId: string;
  subtotalMinor: number;
  currency: string;
  deliveryAvailable: boolean;
  methods: ShippingEstimateItem[];
}

/**
 * ShippingService — M7.2.2 full shipping domain service.
 *
 * Provides:
 * - Shipping method CRUD with tenant isolation
 * - Delivery zone CRUD with tenant isolation
 * - Zone ↔ method association management
 * - Shipping cost resolution (per-store, pure)
 * - Delivery zone matching
 * - Buyer-facing shipping estimates
 * - Provider registry (from M7.2.1)
 */
@Injectable()
export class ShippingService implements OnModuleInit {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ShippingProviderRegistry,
    private readonly manualProvider: ManualDeliveryProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.manualProvider, true);
    this.logger.log('ShippingService initialised — manual-driver provider registered.');
  }

  // ── Tenant helpers ──────────────────────────────────────────────────────

  private async assertStoreInOrg(storeId: string, caller: CallerContext): Promise<void> {
    const privileged = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (privileged) return;

    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { orgId: true },
    });
    if (!store) throw new NotFoundException('Store not found');
    if (!store.orgId || store.orgId !== caller.activeOrg) {
      throw new ForbiddenException('Store does not belong to your organization');
    }
  }

  // ── Shipping Method CRUD ────────────────────────────────────────────────

  async listShippingMethods(storeId: string, caller: CallerContext) {
    await this.assertStoreInOrg(storeId, caller);
    return this.db.db.query.shippingMethods.findMany({
      where: eq(shippingMethods.storeId, storeId),
    });
  }

  async getShippingMethod(id: string, caller: CallerContext) {
    const method = await this.db.db.query.shippingMethods.findFirst({
      where: eq(shippingMethods.id, id),
    });
    if (!method) throw new NotFoundException('Shipping method not found');
    await this.assertStoreInOrg(method.storeId, caller);
    return method;
  }

  async createShippingMethod(input: CreateShippingMethodInput, caller: CallerContext) {
    await this.assertStoreInOrg(input.storeId, caller);

    // Validate key format
    const key = input.key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    if (!key) throw new BadRequestException('Key is required and must be alphanumeric');

    // Validate fees
    if (input.baseFeeMinor < 0) throw new BadRequestException('baseFeeMinor must be >= 0');
    if (input.minOrderMinor != null && input.minOrderMinor < 0) {
      throw new BadRequestException('minOrderMinor must be >= 0');
    }
    if (input.freeAboveMinor != null && input.freeAboveMinor < 0) {
      throw new BadRequestException('freeAboveMinor must be >= 0');
    }
    if (input.minOrderMinor != null && input.freeAboveMinor != null
        && input.minOrderMinor > input.freeAboveMinor) {
      throw new BadRequestException('minOrderMinor cannot exceed freeAboveMinor');
    }
    if (input.estimatedDaysMin != null && input.estimatedDaysMax != null
        && input.estimatedDaysMax < input.estimatedDaysMin) {
      throw new BadRequestException('estimatedDaysMax must be >= estimatedDaysMin');
    }

    const now = new Date();
    const id = crypto.randomUUID();

    try {
      const [inserted] = await this.db.db.insert(shippingMethods).values({
        id,
        storeId: input.storeId,
        key,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        fulfillmentMethod: input.fulfillmentMethod,
        carrierType: input.carrierType || 'MERCHANT',
        type: input.type || 'STANDARD',
        baseFeeMinor: input.baseFeeMinor,
        minOrderMinor: input.minOrderMinor ?? null,
        freeAboveMinor: input.freeAboveMinor ?? null,
        estimatedDaysMin: input.estimatedDaysMin ?? null,
        estimatedDaysMax: input.estimatedDaysMax ?? null,
        currency: input.currency || 'SAR',
        metadata: input.metadata || {},
        createdAt: now,
        updatedAt: now,
      }).returning();

      return inserted;
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException(`Shipping method with key '${key}' already exists for this store`);
      }
      throw err;
    }
  }

  async updateShippingMethod(id: string, input: UpdateShippingMethodInput, caller: CallerContext) {
    const existing = await this.getShippingMethod(id, caller); // tenant check

    if (input.baseFeeMinor != null && input.baseFeeMinor < 0) {
      throw new BadRequestException('baseFeeMinor must be >= 0');
    }
    if (input.minOrderMinor != null && input.minOrderMinor < 0) {
      throw new BadRequestException('minOrderMinor must be >= 0');
    }
    if (input.freeAboveMinor != null && input.freeAboveMinor < 0) {
      throw new BadRequestException('freeAboveMinor must be >= 0');
    }
    const newMin = input.minOrderMinor ?? existing.minOrderMinor;
    const newFree = input.freeAboveMinor ?? existing.freeAboveMinor;
    if (newMin != null && newFree != null && newMin > newFree) {
      throw new BadRequestException('minOrderMinor cannot exceed freeAboveMinor');
    }
    const newMinDays = input.estimatedDaysMin ?? existing.estimatedDaysMin;
    const newMaxDays = input.estimatedDaysMax ?? existing.estimatedDaysMax;
    if (newMinDays != null && newMaxDays != null && newMaxDays < newMinDays) {
      throw new BadRequestException('estimatedDaysMax must be >= estimatedDaysMin');
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (input.name !== undefined) updates['name'] = input.name.trim();
    if (input.description !== undefined) updates['description'] = input.description.trim() || null;
    if (input.baseFeeMinor !== undefined) updates['baseFeeMinor'] = input.baseFeeMinor;
    if (input.minOrderMinor !== undefined) updates['minOrderMinor'] = input.minOrderMinor;
    if (input.freeAboveMinor !== undefined) updates['freeAboveMinor'] = input.freeAboveMinor;
    if (input.estimatedDaysMin !== undefined) updates['estimatedDaysMin'] = input.estimatedDaysMin;
    if (input.estimatedDaysMax !== undefined) updates['estimatedDaysMax'] = input.estimatedDaysMax;
    if (input.isActive !== undefined) updates['isActive'] = input.isActive;
    if (input.metadata !== undefined) updates['metadata'] = input.metadata;

    const [updated] = await this.db.db.update(shippingMethods)
      .set(updates)
      .where(eq(shippingMethods.id, id))
      .returning();
    return updated;
  }

  async deactivateShippingMethod(id: string, caller: CallerContext) {
    return this.updateShippingMethod(id, { isActive: false }, caller);
  }

  // ── Delivery Zone CRUD ──────────────────────────────────────────────────

  async listDeliveryZones(storeId: string, caller: CallerContext) {
    await this.assertStoreInOrg(storeId, caller);
    return this.db.db.query.deliveryZones.findMany({
      where: eq(deliveryZones.storeId, storeId),
    });
  }

  async getDeliveryZone(id: string, caller: CallerContext) {
    const zone = await this.db.db.query.deliveryZones.findFirst({
      where: eq(deliveryZones.id, id),
    });
    if (!zone) throw new NotFoundException('Delivery zone not found');
    await this.assertStoreInOrg(zone.storeId, caller);
    return zone;
  }

  async createDeliveryZone(input: CreateDeliveryZoneInput, caller: CallerContext) {
    await this.assertStoreInOrg(input.storeId, caller);

    const id = crypto.randomUUID();
    const now = new Date();
    const [inserted] = await this.db.db.insert(deliveryZones).values({
      id,
      storeId: input.storeId,
      name: input.name.trim(),
      city: input.city?.trim() || null,
      region: input.region?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      country: input.country || 'SA',
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
    }).returning();

    return inserted;
  }

  async updateDeliveryZone(id: string, input: UpdateDeliveryZoneInput, caller: CallerContext) {
    const existing = await this.getDeliveryZone(id, caller);

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (input.name !== undefined) updates['name'] = input.name.trim();
    if (input.city !== undefined) updates['city'] = input.city;
    if (input.region !== undefined) updates['region'] = input.region;
    if (input.postalCode !== undefined) updates['postalCode'] = input.postalCode;
    if (input.country !== undefined) updates['country'] = input.country;
    if (input.isActive !== undefined) updates['isActive'] = input.isActive;
    if (input.metadata !== undefined) updates['metadata'] = input.metadata;

    const [updated] = await this.db.db.update(deliveryZones)
      .set(updates)
      .where(eq(deliveryZones.id, id))
      .returning();
    return updated;
  }

  async deactivateDeliveryZone(id: string, caller: CallerContext) {
    return this.updateDeliveryZone(id, { isActive: false }, caller);
  }

  // ── Zone ↔ Method Association ───────────────────────────────────────────

  async attachMethodToZone(zoneId: string, methodId: string, overrideFeeMinor: number | null, caller: CallerContext) {
    const zone = await this.getDeliveryZone(zoneId, caller);
    const method = await this.getShippingMethod(methodId, caller);

    // Both must belong to same store
    if (zone.storeId !== method.storeId) {
      throw new BadRequestException('Zone and shipping method must belong to the same store');
    }

    try {
      await this.db.db.insert(deliveryZoneMethods).values({
        zoneId,
        shippingMethodId: methodId,
        overrideFeeMinor: overrideFeeMinor ?? null,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('This method is already attached to this zone');
      }
      throw err;
    }

    return { zoneId, shippingMethodId: methodId, overrideFeeMinor };
  }

  async detachMethodFromZone(zoneId: string, methodId: string, caller: CallerContext) {
    await this.getDeliveryZone(zoneId, caller);
    await this.getShippingMethod(methodId, caller);

    await this.db.db.delete(deliveryZoneMethods)
      .where(and(
        eq(deliveryZoneMethods.zoneId, zoneId),
        eq(deliveryZoneMethods.shippingMethodId, methodId),
      ));

    return { success: true };
  }

  async listMethodsForZone(zoneId: string, caller: CallerContext) {
    await this.getDeliveryZone(zoneId, caller);

    const rows = await this.db.db.select().from(deliveryZoneMethods)
      .where(eq(deliveryZoneMethods.zoneId, zoneId));

    const methodIds = rows.map(r => r.shippingMethodId);
    if (methodIds.length === 0) return [];

    return this.db.db.query.shippingMethods.findMany({
      where: inArray(shippingMethods.id, methodIds),
    });
  }

  async listZonesForMethod(methodId: string, caller: CallerContext) {
    await this.getShippingMethod(methodId, caller);

    const rows = await this.db.db.select().from(deliveryZoneMethods)
      .where(eq(deliveryZoneMethods.shippingMethodId, methodId));

    const zoneIds = rows.map(r => r.zoneId);
    if (zoneIds.length === 0) return [];

    return this.db.db.query.deliveryZones.findMany({
      where: inArray(deliveryZones.id, zoneIds),
    });
  }

  // ── Shipping Estimates (buyer-facing) ───────────────────────────────────

  /**
   * Get available shipping methods for a store, given a subtotal and address.
   * Server-authoritative — client never supplies fees.
   */
  async getShippingEstimate(
    storeId: string,
    subtotalMinor: number,
    address: ZoneMatchInput,
  ): Promise<StoreShippingEstimate> {
    const methods = await this.db.db.query.shippingMethods.findMany({
      where: eq(shippingMethods.storeId, storeId),
    });

    const activeMethods = methods.filter(m => m.isActive);

    // Zone matching — check if delivery is available at all
    const storeZones = await this.db.db.query.deliveryZones.findMany({
      where: eq(deliveryZones.storeId, storeId),
    });
    const matchedZone = matchDeliveryZone(storeZones as DeliveryZoneRow[], address);

    // If zones exist but none match, delivery is not available for this address
    const hasZones = storeZones.length > 0;
    const deliveryAvailable = !hasZones || matchedZone !== null;

    // If a zone matched, filter methods to those available in that zone
    let eligibleMethods = activeMethods;
    if (matchedZone) {
      const zoneMethodRows = await this.db.db.select().from(deliveryZoneMethods)
        .where(eq(deliveryZoneMethods.zoneId, matchedZone.id));
      const zoneMethodIds = new Set(zoneMethodRows.map(r => r.shippingMethodId));
      // If zone has method associations, only those methods are eligible
      if (zoneMethodIds.size > 0) {
        eligibleMethods = activeMethods.filter(m => zoneMethodIds.has(m.id));
      }
    }

    const estimateItems: ShippingEstimateItem[] = eligibleMethods.map(m => {
      const cost = resolveShippingCost({
        subtotalMinor,
        baseFeeMinor: m.baseFeeMinor,
        minOrderMinor: m.minOrderMinor,
        freeAboveMinor: m.freeAboveMinor,
      });
      return {
        methodId: m.id,
        key: m.key,
        name: m.name,
        type: m.type,
        carrierType: m.carrierType,
        estimatedDaysMin: m.estimatedDaysMin,
        estimatedDaysMax: m.estimatedDaysMax,
        feeMinor: cost.feeMinor,
        currency: m.currency,
        status: cost.status,
        reason: cost.reason,
      };
    });

    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.id, storeId),
      columns: { currency: true },
    });

    return {
      storeId,
      subtotalMinor,
      currency: store?.currency || 'SAR',
      deliveryAvailable,
      methods: estimateItems,
    };
  }

  /**
   * Resolve the authoritative shipping fee for a specific method and store.
   * Called during checkout — never trusts client-supplied fees.
   */
  async resolveAuthoritativeFee(
    storeId: string,
    shippingMethodId: string,
    subtotalMinor: number,
  ): Promise<{ feeMinor: number; currency: string; methodId: string }> {
    const method = await this.db.db.query.shippingMethods.findFirst({
      where: and(
        eq(shippingMethods.id, shippingMethodId),
        eq(shippingMethods.storeId, storeId),
      ),
    });

    if (!method) throw new BadRequestException('Shipping method not found for this store');
    if (!method.isActive) throw new BadRequestException('Shipping method is not active');

    const cost = resolveShippingCost({
      subtotalMinor,
      baseFeeMinor: method.baseFeeMinor,
      minOrderMinor: method.minOrderMinor,
      freeAboveMinor: method.freeAboveMinor,
    });

    if (cost.status === 'UNAVAILABLE') {
      throw new BadRequestException(cost.reason || 'Shipping method unavailable for this order');
    }

    return { feeMinor: cost.feeMinor, currency: method.currency, methodId: method.id };
  }

  // ── M7.2.2 Remediation: Checkout Validation ─────────────────────────────

  /**
   * Validate a per-store shipping selection at checkout time.
   *
   * Enforces (server-side, authoritative):
   *  1. PICKUP: shippingMethodId must be null/undefined — no delivery needed.
   *  2. Delivery methods: method must exist, be active, belong to the store.
   *  3. Zero-zone policy: if a store has NO zones, delivery is unrestricted.
   *  4. Zone matching: if zones exist, at least one must match the address.
   *  5. Zone-method availability: if the matched zone has method associations,
   *     the selected method must be among them.
   *
   * Returns the resolved method row (for fee computation) or null for PICKUP.
   * Throws BadRequestException with a deterministic message on any violation.
   */
  async validateCheckoutSelection(
    storeId: string,
    fulfillmentMethod: string,
    shippingMethodId: string | undefined,
    deliveryAddress: ZoneMatchInput,
  ): Promise<{ method: typeof shippingMethods.$inferSelect | null; zoneId: string | null }> {
    const fm = fulfillmentMethod.toUpperCase();

    // ── PICKUP: no delivery method allowed ──────────────────────────────
    if (fm === 'PICKUP') {
      if (shippingMethodId) {
        throw new BadRequestException(
          `PICKUP fulfillment must not have a shippingMethodId (store ${storeId})`,
        );
      }
      return { method: null, zoneId: null };
    }

    // ── Delivery methods require a shippingMethodId ─────────────────────
    if (!shippingMethodId) {
      throw new BadRequestException(
        `${fulfillmentMethod} requires a shippingMethodId (store ${storeId})`,
      );
    }

    // ── Resolve the shipping method ─────────────────────────────────────
    const method = await this.db.db.query.shippingMethods.findFirst({
      where: and(
        eq(shippingMethods.id, shippingMethodId),
        eq(shippingMethods.storeId, storeId),
      ),
    });

    if (!method) {
      throw new BadRequestException(
        `Shipping method ${shippingMethodId} not found for store ${storeId}`,
      );
    }
    if (!method.isActive) {
      throw new BadRequestException(
        `Shipping method ${method.name} is not active (store ${storeId})`,
      );
    }

    // ── Delivery address required for delivery methods ──────────────────
    const addrCity = (deliveryAddress.city || '').trim();
    const addrCountry = (deliveryAddress.country || '').trim();
    if (!addrCity && !deliveryAddress.postalCode) {
      throw new BadRequestException(
        `Delivery address required for ${fulfillmentMethod} (store ${storeId})`,
      );
    }

    // ── Zone resolution ─────────────────────────────────────────────────
    // Policy: if a store has ZERO zones, delivery is unrestricted (no zone
    // constraint).  If zones exist, at least one must match the address.
    const storeZones = await this.db.db.query.deliveryZones.findMany({
      where: eq(deliveryZones.storeId, storeId),
    });

    const hasZones = storeZones.length > 0;

    if (hasZones) {
      const matchedZone = matchDeliveryZone(
        storeZones as DeliveryZoneRow[],
        deliveryAddress,
      );

      if (!matchedZone) {
        throw new BadRequestException(
          `No delivery zone matches the provided address for store ${storeId}`,
        );
      }

      // ── Zone-method availability ────────────────────────────────────────
      // If the matched zone has method associations, the selected method
      // must be among them.  If the zone has NO associations, all active
      // methods are eligible (zone only constrains geography).
      const zoneMethodRows = await this.db.db.select().from(deliveryZoneMethods)
        .where(eq(deliveryZoneMethods.zoneId, matchedZone.id));

      if (zoneMethodRows.length > 0) {
        const availableMethodIds = new Set(zoneMethodRows.map(r => r.shippingMethodId));
        if (!availableMethodIds.has(shippingMethodId)) {
          throw new BadRequestException(
            `Shipping method ${method.name} is not available in delivery zone ${matchedZone.name} (store ${storeId})`,
          );
        }
      }

      return { method, zoneId: matchedZone.id };
    }

    // No zones → unrestricted delivery
    return { method, zoneId: null };
  }

  // ── Provider Registry (from M7.2.1) ─────────────────────────────────────

  async createShipment(request: CreateShipmentRequest, providerKey?: string): Promise<CreateShipmentResult> {
    const provider = providerKey
      ? this.registry.getProvider(providerKey)
      : this.registry.getDefaultProvider();
    return provider.createShipment(request);
  }

  getProvider(key: string): ShippingProvider {
    return this.registry.getProvider(key);
  }

  getDefaultProvider(): ShippingProvider {
    return this.registry.getDefaultProvider();
  }

  listProviders(): string[] {
    return this.registry.listProviderKeys();
  }
}
