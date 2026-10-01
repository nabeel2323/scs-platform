import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards, HttpCode,
  Logger, NotFoundException,
} from '@nestjs/common';
import { eq, and, or, isNull, inArray } from 'drizzle-orm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser, JwtPayload, RequirePermission,
} from '../../common/guards/current-user.decorator';
import { isTenantPrivileged } from '../../common/tenant-scope';
import { CarrierCredentialsService, CreateCarrierCredentialInput } from './carrier-credentials.service';
import { CarrierConfigurationsService, CreateCarrierConfigurationInput, UpdateCarrierConfigurationInput } from './carrier-configurations.service';
import { CarrierReconciliationService } from './carrier-reconciliation.service';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../../common/database/database.service';
import { shipments } from '../orders/shipment.schema';
import { stores } from '../merchant/merchant.schema';

/**
 * CarrierAdminController — M7.2.3-A + M7.2.3-C carrier management & recovery.
 *
 * Endpoints:
 *   Carrier Credentials:
 *     GET    /v1/carrier/credentials?orgId=            — list (masked)
 *     GET    /v1/carrier/credentials/:id               — get (masked)
 *     POST   /v1/carrier/credentials                    — create
 *     POST   /v1/carrier/credentials/:id/deactivate     — soft-delete
 *
 *   Carrier Configurations:
 *     GET    /v1/carrier/configurations?orgId=          — list
 *     GET    /v1/carrier/configurations/:id             — get
 *     POST   /v1/carrier/configurations                 — create
 *     PATCH  /v1/carrier/configurations/:id             — update
 *     POST   /v1/carrier/configurations/:id/deactivate  — soft-delete
 *
 *   M7.2.3-C Recovery:
 *     POST   /v1/carrier/shipments/:id/recover          — trigger reconciliation
 *     GET    /v1/carrier/recovery/queue                  — list shipments needing recovery
 *
 * SECURITY:
 *   - Plaintext credentials NEVER appear in responses.
 *   - Only SUPER_ADMIN/ADMIN can manage credentials.
 *   - Merchant owners can manage configurations (with org-scoping).
 *   - Org A cannot access Org B's data.
 *   - Recovery requires admin:shipping:recovery permission.
 *   - Recovery is auditable (creates audit_log entry).
 *   - Recovery does not expose credentials.
 *   - Recovery creates a controlled reconciliation request (not a blind retry).
 */
@Controller('v1/carrier')
@UseGuards(JwtAuthGuard)
export class CarrierAdminController {
  private readonly logger = new Logger(CarrierAdminController.name);

  constructor(
    private readonly credentials: CarrierCredentialsService,
    private readonly configurations: CarrierConfigurationsService,
    private readonly reconciliation: CarrierReconciliationService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {}

  // ── Credentials ───────────────────────────────────────────────────────

  @Get('credentials')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:read')
  async listCredentials(
    @CurrentUser() user: JwtPayload,
    @Query('orgId') orgId: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    const items = await this.credentials.listForOrg(orgId, caller);
    return { credentials: items };
  }

  @Get('credentials/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:read')
  async getCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.credentials.getById(id, caller);
  }

  @Post('credentials')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  async createCredential(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateCarrierCredentialInput,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.credentials.create(body, caller);
  }

  @Post('credentials/:id/deactivate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  @HttpCode(200)
  async deactivateCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.credentials.deactivate(id, caller);
  }

  // ── Configurations ────────────────────────────────────────────────────

  @Get('configurations')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:read')
  async listConfigurations(
    @CurrentUser() user: JwtPayload,
    @Query('orgId') orgId: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    const items = await this.configurations.listForOrg(orgId, caller);
    return { configurations: items };
  }

  @Get('configurations/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:read')
  async getConfiguration(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.configurations.getById(id, caller);
  }

  @Post('configurations')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  async createConfiguration(
    @CurrentUser() user: JwtPayload,
    @Body() body: CreateCarrierConfigurationInput,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.configurations.create(body, caller);
  }

  @Patch('configurations/:id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  async updateConfiguration(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateCarrierConfigurationInput,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.configurations.update(id, body, caller);
  }

  @Post('configurations/:id/deactivate')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:carrier:write')
  @HttpCode(200)
  async deactivateConfiguration(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    return this.configurations.deactivate(id, caller);
  }

  // ── M7.2.3-C Recovery Endpoints ────────────────────────────────────────

  /**
   * POST /v1/carrier/shipments/:id/recover
   *
   * Trigger reconciliation for a single shipment.
   * This does NOT blindly retry — it runs the reconciliation engine which
   * determines the correct action (recover, retry-safe, defer).
   *
   * RBAC: admin:shipping:recovery
   * M7.2.4-A Org-scoped: shipment → store → org chain verified against caller's activeOrg.
   *   Cross-tenant requests return 404 (not 403) to avoid revealing existence.
   *   SUPER_ADMIN bypasses via isTenantPrivileged().
   * Auditable: creates audit_log entry.
   */
  @Post('shipments/:id/recover')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:shipping:recovery')
  @HttpCode(200)
  async recoverShipment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    // Fetch the shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, id),
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }

    // M7.2.4-A Phase 6: Tenant isolation — verify shipment's store belongs to caller's org.
    // Resolve: shipment → store → organization. Compare against caller's activeOrg.
    // Cross-tenant → 404 (not 403) to avoid revealing another org's shipment exists.
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
    if (!isTenantPrivileged(caller)) {
      const store = await this.db.db.query.stores.findFirst({
        where: eq(stores.id, shipment.storeId),
        columns: { orgId: true },
      });
      if (!store || store.orgId !== user.activeOrg) {
        throw new NotFoundException(`Shipment ${id} not found`);
      }
    }

    // Verify the shipment is in a recoverable state (create or cancel)
    const recoverableCreateStatuses = ['PENDING', 'IN_PROGRESS', 'FAILED', 'RECOVERY_REQUIRED'];
    const recoverableCancelStatuses = ['UNKNOWN', 'RECONCILIATION_REQUIRED'];
    const isCreateRecoverable = recoverableCreateStatuses.includes(shipment.carrierCreateStatus || '');
    const isCancelRecoverable = recoverableCancelStatuses.includes(shipment.carrierCancelStatus || '');
    if (!isCreateRecoverable && !isCancelRecoverable) {
      throw new NotFoundException(`Shipment ${id} not found`);
    }

    // Schedule immediate reconciliation by setting nextReconciliationAt to now
    await this.db.db
      .update(shipments)
      .set({
        recoveryStatus: 'ADMIN_TRIGGERED',
        nextReconciliationAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, id));

    // M7.2.4-A Phase 8: Re-fetch the shipment after the update so reconciliation
    // sees the authoritative current state (not a stale snapshot).
    const freshShipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, id),
    });

    // Run reconciliation with fresh state (routes to create or cancel path)
    const result = await this.reconciliation.reconcileShipment(freshShipment!);

    // Audit trail
    await this.audit.record({
      actorType: AuditService.actorTypeForRole(user.role),
      actorId: user.sub,
      action: 'carrier.shipment.recover',
      resource: 'shipments',
      resourceId: id,
      orgId: user.activeOrg || undefined,
      metadata: {
        outcome: result.outcome,
        detail: result.detail,
        previousCreateStatus: shipment.carrierCreateStatus,
        previousCancelStatus: shipment.carrierCancelStatus,
        previousRecoveryStatus: shipment.recoveryStatus,
      },
    });

    this.logger.log(
      `Admin recovery triggered for shipment ${id} by ${user.sub}: ${result.outcome}`,
    );

    return {
      shipmentId: id,
      outcome: result.outcome,
      detail: result.detail,
    };
  }

  /**
   * GET /v1/carrier/recovery/queue
   *
   * List shipments needing recovery (RECOVERY_REQUIRED or stuck PENDING/IN_PROGRESS).
   *
   * RBAC: admin:shipping:recovery
   * M7.2.4-A Phase 7: Tenant isolated — org admins see only their org's shipments.
   *   SUPER_ADMIN sees all (via isTenantPrivileged bypass).
   */
  @Get('recovery/queue')
  @UseGuards(PermissionsGuard)
  @RequirePermission('admin:shipping:recovery')
  async getRecoveryQueue(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limit?: string,
  ) {
    const maxItems = Math.min(parseInt(limit || '50', 10) || 50, 200);
    const caller = { sub: user.sub, role: user.role, activeOrg: user.activeOrg };

    // M7.2.4-A Phase 7: For non-privileged callers, scope to their org's stores.
    // Resolve the caller's store IDs and filter shipments by those stores.
    let orgStoreIds: string[] | null = null;
    if (!isTenantPrivileged(caller) && user.activeOrg) {
      const storeRows = await this.db.db.query.stores.findMany({
        where: eq(stores.orgId, user.activeOrg),
        columns: { id: true },
      });
      orgStoreIds = storeRows.map(s => s.id);
      // If the org has no stores, return empty queue
      if (orgStoreIds.length === 0) {
        return { queue: [], count: 0, limit: maxItems };
      }
    }

    // Build the base query — includes both create and cancel recovery states
    const baseWhere = and(
      or(
        // Create recovery states
        or(
          eq(shipments.carrierCreateStatus, 'RECOVERY_REQUIRED' as any),
          and(
            or(
              eq(shipments.carrierCreateStatus, 'PENDING' as any),
              eq(shipments.carrierCreateStatus, 'IN_PROGRESS' as any),
              eq(shipments.carrierCreateStatus, 'FAILED' as any),
            ),
          ),
        ),
        // B.3.3.3: Cancel recovery states
        eq(shipments.carrierCancelStatus, 'UNKNOWN' as any),
        eq(shipments.carrierCancelStatus, 'RECONCILIATION_REQUIRED' as any),
      ),
      // M7.2.4-A: tenant scope filter
      orgStoreIds ? inArray(shipments.storeId, orgStoreIds) : undefined,
    );

    const queue = await this.db.db
      .select({
        id: shipments.id,
        orderId: shipments.orderId,
        storeId: shipments.storeId,
        carrierCreateStatus: shipments.carrierCreateStatus,
        carrierCreateError: shipments.carrierCreateError,
        carrierCreateErrorClass: shipments.carrierCreateErrorClass,
        carrierCreateRetries: shipments.carrierCreateRetries,
        // B.3.3.3: Cancel state fields
        carrierCancelStatus: shipments.carrierCancelStatus,
        carrierCancelError: shipments.carrierCancelError,
        carrierCancelErrorClass: shipments.carrierCancelErrorClass,
        carrierCancelRetries: shipments.carrierCancelRetries,
        recoveryStatus: shipments.recoveryStatus,
        nextReconciliationAt: shipments.nextReconciliationAt,
        shippingProviderKey: shipments.shippingProviderKey,
        carrierShipmentId: shipments.carrierShipmentId,
        createdAt: shipments.createdAt,
        updatedAt: shipments.updatedAt,
      })
      .from(shipments)
      .where(baseWhere)
      .orderBy(shipments.createdAt)
      .limit(maxItems);

    return {
      queue,
      count: queue.length,
      limit: maxItems,
    };
  }
}
