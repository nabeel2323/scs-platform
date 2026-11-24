import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { eq, and, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { assertActiveOrgMembership, type CallerContext } from '../../common/tenant-scope';
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
    return this.withCallerContext(caller, async () => {
      await this.assertOrgAccess(orgId, caller);
      return this.db.db.query.carrierConfigurations.findMany({
        where: eq(carrierConfigurations.orgId, orgId),
      });
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
    return this.withInternalContext(orgId, 'carrier-configurations:resolve', async () => {
      const store = await this.db.db.query.stores.findFirst({
        where: and(eq(stores.id, storeId), eq(stores.orgId, orgId)),
        columns: { id: true },
      });
      if (!store) return null;
      const storeConfig = await this.db.db.query.carrierConfigurations.findFirst({
        where: and(
          eq(carrierConfigurations.orgId, orgId),
          eq(carrierConfigurations.storeId, storeId),
          eq(carrierConfigurations.isActive, true),
        ),
      });
      if (storeConfig) return (await this.hasActiveOrgCredential(storeConfig.credentialId, orgId)) ? storeConfig : null;
      const orgDefault = await this.db.db.query.carrierConfigurations.findFirst({
        where: and(
          eq(carrierConfigurations.orgId, orgId),
          isNull(carrierConfigurations.storeId),
          eq(carrierConfigurations.isActive, true),
        ),
      });
      if (!orgDefault) return null;
      return (await this.hasActiveOrgCredential(orgDefault.credentialId, orgId)) ? orgDefault : null;
    });
  }

  /**
   * Get a single configuration by ID.
   */
  async getById(id: string, caller: CallerContext) {
    return this.withCallerContext(caller, async () => {
      const row = await this.db.db.query.carrierConfigurations.findFirst({
        where: eq(carrierConfigurations.id, id),
      });
      if (!row) throw new NotFoundException('Carrier configuration not found');
      await this.assertOrgAccess(row.orgId, caller);
      return row;
    });
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
    return this.withCallerContext(caller, async () => {
      await this.assertOrgAccess(input.orgId, caller);
      this.assertWritePermission(caller);
      const credential = await this.db.db.query.carrierCredentials.findFirst({
        where: eq(carrierCredentials.id, input.credentialId),
        columns: { id: true, orgId: true, isActive: true },
      });
      if (!credential) throw new NotFoundException('Carrier credential not found');
      if (credential.orgId !== input.orgId) throw new ForbiddenException('Credential does not belong to your organization');
      if (!credential.isActive) throw new BadRequestException('Carrier credential is not active');
      if (input.storeId) {
        const store = await this.db.db.query.stores.findFirst({
          where: and(eq(stores.id, input.storeId), eq(stores.orgId, input.orgId)),
          columns: { orgId: true },
        });
        if (!store) throw new NotFoundException('Store not found');
      }
      const id = crypto.randomUUID();
      const now = new Date();
      try {
        const [inserted] = await this.db.db.insert(carrierConfigurations).values({
          id, orgId: input.orgId, credentialId: input.credentialId,
          storeId: input.storeId ?? null, providerKey: input.providerKey,
          defaultServiceCode: input.defaultServiceCode ?? null,
          defaultPackageType: input.defaultPackageType ?? null,
          pickupAddress: input.pickupAddress ?? null, isActive: true,
          createdAt: now, updatedAt: now,
        }).returning();
        if (!inserted) throw new Error('Carrier configuration insert returned no rows');
        this.logger.log(
          `Carrier configuration created: ${inserted.providerKey} (store: ${inserted.storeId || 'org-wide'}) for org ${inserted.orgId}`,
        );
        return inserted;
      } catch (err: any) {
        if (err?.code === '23505') throw new BadRequestException('An active configuration already exists for this provider/store combination');
        throw err;
      }
    });
  }

  /**
   * Update a carrier configuration.
   */
  async update(id: string, input: UpdateCarrierConfigurationInput, caller: CallerContext) {
    return this.withCallerContext(caller, async () => {
      const existing = await this.getById(id, caller);
      this.assertWritePermission(caller);
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (input.defaultServiceCode !== undefined) updates['defaultServiceCode'] = input.defaultServiceCode;
      if (input.defaultPackageType !== undefined) updates['defaultPackageType'] = input.defaultPackageType;
      if (input.pickupAddress !== undefined) updates['pickupAddress'] = input.pickupAddress;
      if (input.isActive !== undefined) updates['isActive'] = input.isActive;
      const rows = await this.db.db.update(carrierConfigurations).set(updates)
        .where(and(eq(carrierConfigurations.id, id), eq(carrierConfigurations.orgId, existing.orgId)))
        .returning();
      const updated = rows[0];
      if (!updated) throw new NotFoundException('Carrier configuration update returned no rows');
      return updated;
    });
  }

  /**
   * Deactivate a configuration (soft-delete).
   */
  async deactivate(id: string, caller: CallerContext) {
    return this.update(id, { isActive: false }, caller);
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private withCallerContext<T>(caller: CallerContext, operation: () => Promise<T>): Promise<T> {
    if (typeof caller.role !== 'string' || caller.role.trim().length === 0) {
      throw new ForbiddenException('Authenticated caller role is required for carrier database access');
    }
    return this.db.withActorContext(
      {
        actorKind: 'user',
        actorId: caller.sub,
        actorRole: caller.role,
        activeOrgId: caller.activeOrg ?? null,
      },
      operation,
    );
  }

  private withInternalContext<T>(orgId: string, workerId: string, operation: () => Promise<T>): Promise<T> {
    const active = this.db.currentActorContext;
    if (active) {
      if ((active.actorKind === 'user' || active.actorKind === 'worker') &&
          active.activeOrgId !== null && active.activeOrgId !== orgId) {
        throw new Error('Carrier configuration access crossed the active organization context');
      }
      return operation();
    }
    return this.db.withActorContext({ actorKind: 'worker', workerId, activeOrgId: orgId }, operation);
  }

  private async hasActiveOrgCredential(credentialId: string, orgId: string): Promise<boolean> {
    const credential = await this.db.db.query.carrierCredentials.findFirst({
      where: and(
        eq(carrierCredentials.id, credentialId),
        eq(carrierCredentials.orgId, orgId),
        eq(carrierCredentials.isActive, true),
      ),
      columns: { id: true },
    });
    return !!credential;
  }

  private async assertOrgAccess(orgId: string, caller: CallerContext): Promise<void> {
    await assertActiveOrgMembership(this.db, caller, orgId);
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
