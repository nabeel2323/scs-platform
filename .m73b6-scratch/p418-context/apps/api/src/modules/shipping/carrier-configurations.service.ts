import {
  Injectable, Logger,
  NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { CallerContext, isTenantPrivileged } from '../../common/tenant-scope';
import { carrierConfigurations, carrierCredentials } from './shipping.schema';
import { stores } from '../merchant/merchant.schema';

// ── Input types ─────────────────────────────────────────────────────────────

export interface CreateCarrierConfigurationInput {
  orgId: string;
  credentialId: string;
  storeId?: string;
  providerKey: string;
  defaultServiceCode?: string;
  defaultPackageType?: string;
  pickupAddress?: Record<string, unknown>;
}

export interface UpdateCarrierConfigurationInput {
  defaultServiceCode?: string | null;
  defaultPackageType?: string | null;
  pickupAddress?: Record<string, unknown> | null;
  isActive?: boolean;
}

/**
 * CarrierConfigurationsService — org/store-level carrier configuration.
 *
 * Semantics:
 *   - storeId = NULL → org-wide default.
 *   - storeId = X    → store-specific override.
 *   - Credentials remain organization-owned.
 *   - A store configuration MUST NOT reference another org's credential.
 *
 * Validation:
 *   - credential.org_id === configuration.org_id
 *   - store.org_id === configuration.org_id (when storeId is supplied)
 */
@Injectable()
export class CarrierConfigurationsService {
  private readonly logger = new Logger(CarrierConfigurationsService.name);

  constructor(private readonly db: DatabaseService) {}

  // ── Queries ─────────────────────────────────────────────────────────────

  /**
   * List configurations for an organization.
   * Includes both org-wide defaults and store-specific overrides.
   */
  async listForOrg(orgId: string, caller: CallerContext) {
    this.assertOrgAccess(orgId, caller);

    return this.db.db.query.carrierConfigurations.findMany({
      where: eq(carrierConfigurations.orgId, orgId),
    });
  }

  /**
   * Resolve the effective configuration for a store.
   *
   * Resolution order:
   *   1. Store-specific override (if active)
   *   2. Org-wide default (if active)
   *   3. null (no configuration)
   */
  async resolveForStore(orgId: string, storeId: string): Promise<any | null> {
    // Try store-specific first
    const storeConfig = await this.db.db.query.carrierConfigurations.findFirst({
      where: and(
        eq(carrierConfigurations.orgId, orgId),
        eq(carrierConfigurations.storeId, storeId),
        eq(carrierConfigurations.isActive, true),
      ),
    });
    if (storeConfig) return storeConfig;

    // Fall back to org-wide default
    const orgDefault = await this.db.db.query.carrierConfigurations.findFirst({
      where: and(
        eq(carrierConfigurations.orgId, orgId),
        isNull(carrierConfigurations.storeId),
        eq(carrierConfigurations.isActive, true),
      ),
    });
    return orgDefault ?? null;
  }

  /**
   * Get a single configuration by ID.
   */
  async getById(id: string, caller: CallerContext) {
    const row = await this.db.db.query.carrierConfigurations.findFirst({
      where: eq(carrierConfigurations.id, id),
    });
    if (!row) throw new NotFoundException('Carrier configuration not found');

    this.assertOrgAccess(row.orgId, caller);
    return row;
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  /**
   * Create a carrier configuration.
   *
   * Validates:
   *   - credential belongs to the same org
   *   - store (if supplied) belongs to the same org
   *   - only one active config per org/provider/store combination
   */
  async create(input: CreateCarrierConfigurationInput, caller: CallerContext) {
    // Must be admin or merchant owner with write access
    this.assertOrgAccess(input.orgId, caller);
    this.assertWritePermission(caller);

    // Validate credential belongs to the same org
    const credential = await this.db.db.query.carrierCredentials.findFirst({
      where: eq(carrierCredentials.id, input.credentialId),
      columns: { id: true, orgId: true, isActive: true },
    });
    if (!credential) throw new NotFoundException('Carrier credential not found');
    if (credential.orgId !== input.orgId) {
      throw new ForbiddenException('Credential does not belong to your organization');
    }
    if (!credential.isActive) {
      throw new BadRequestException('Carrier credential is not active');
    }

    // Validate store belongs to the same org (if supplied)
    if (input.storeId) {
      const store = await this.db.db.query.stores.findFirst({
        where: eq(stores.id, input.storeId),
        columns: { orgId: true },
      });
      if (!store) throw new NotFoundException('Store not found');
      if (store.orgId !== input.orgId) {
        throw new ForbiddenException('Store does not belong to your organization');
      }
    }

    const id = crypto.randomUUID();
    const now = new Date();

    try {
      const [inserted] = await this.db.db.insert(carrierConfigurations).values({
        id,
        orgId: input.orgId,
        credentialId: input.credentialId,
        storeId: input.storeId ?? null,
        providerKey: input.providerKey,
        defaultServiceCode: input.defaultServiceCode ?? null,
        defaultPackageType: input.defaultPackageType ?? null,
        pickupAddress: input.pickupAddress ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }).returning();

      if (!inserted) throw new Error('Carrier configuration insert returned no rows');

      this.logger.log(
        `Carrier configuration created: ${inserted.providerKey} ` +
        `(store: ${inserted.storeId || 'org-wide'}) for org ${inserted.orgId}`,
      );

      return inserted;
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new BadRequestException(
          'An active configuration already exists for this provider/store combination',
        );
      }
      throw err;
    }
  }

  /**
   * Update a carrier configuration.
   */
  async update(id: string, input: UpdateCarrierConfigurationInput, caller: CallerContext) {
    const existing = await this.getById(id, caller);
    this.assertWritePermission(caller);

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (input.defaultServiceCode !== undefined) updates['defaultServiceCode'] = input.defaultServiceCode;
    if (input.defaultPackageType !== undefined) updates['defaultPackageType'] = input.defaultPackageType;
    if (input.pickupAddress !== undefined) updates['pickupAddress'] = input.pickupAddress;
    if (input.isActive !== undefined) updates['isActive'] = input.isActive;

    const rows = await this.db.db.update(carrierConfigurations)
      .set(updates)
      .where(eq(carrierConfigurations.id, id))
      .returning();

    const updated = rows[0];
    if (!updated) throw new NotFoundException('Carrier configuration update returned no rows');

    return updated;
  }

  /**
   * Deactivate a configuration (soft-delete).
   */
  async deactivate(id: string, caller: CallerContext) {
    return this.update(id, { isActive: false }, caller);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private assertOrgAccess(orgId: string, caller: CallerContext): void {
    if (isTenantPrivileged(caller)) return;
    if (caller.activeOrg !== orgId) {
      throw new ForbiddenException('You do not have access to this organization\'s carrier configurations');
    }
  }

  /**
   * Carrier configuration writes require at least MERCHANT_OWNER role
   * or platform admin.
   */
  private assertWritePermission(caller: CallerContext): void {
    const allowedRoles = ['SUPER_ADMIN', 'ADMIN', 'MERCHANT_OWNER'];
    if (!allowedRoles.includes(caller.role || '')) {
      throw new ForbiddenException('Insufficient permissions to manage carrier configurations');
    }
  }
}
