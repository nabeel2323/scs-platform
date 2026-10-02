import {
  Controller, Get, Post, Param, Body, Query, UseGuards, HttpCode,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  CurrentUser, JwtPayload, RequirePermission,
} from '../../common/guards/current-user.decorator';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { shipments, shipmentEvents } from '../orders/shipment.schema';
import { shipmentLabels } from './shipping.schema';
import { outboxEvents } from '../audit/audit.schema';
import { stores } from '../merchant/merchant.schema';
import {
  generateIdempotencyKey, CancelShipmentResult, TrackingInfo,
} from './shipping.types';
import { CallerContext } from '../../common/tenant-scope';
import { OrdersService } from '../orders/orders.service';

/**
 * ShipmentOperationsController — M7.2.3-A shipment lifecycle API.
 *
 * Endpoints:
 *   POST /v1/shipments/:id/create    — queue carrier creation (async via outbox)
 *   POST /v1/shipments/:id/cancel    — cancel a shipment
 *   GET  /v1/shipments/:id/tracking  — get tracking information
 *   GET  /v1/shipments/:id/labels    — list labels for a shipment
 *
 * IMPORTANT:
 *   - These endpoints prepare/queue carrier work but do NOT perform
 *     external HTTP calls synchronously.
 *   - Carrier creation goes through the outbox → ShippingCarrierWorker.
 */
@Controller('v1/shipments')
@UseGuards(JwtAuthGuard)
export class ShipmentOperationsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ShippingProviderRegistry,
    private readonly ordersService: OrdersService,
  ) {}

  // ── POST /v1/shipments/:id/create ──────────────────────────────────────

  @Post(':id/create')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:write')
  @HttpCode(202)
  async createCarrierShipment(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.toCallerContext(user);

    // 1. Find the shipment
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, id),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    // 2. Tenant check
    await this.assertShipmentAccessible(shipment, caller);

    // 3. Guard: already created
    if (shipment.carrierCreateStatus === 'SUCCESS' && shipment.carrierShipmentId) {
      return {
        shipmentId: id,
        status: 'ALREADY_CREATED',
        carrierShipmentId: shipment.carrierShipmentId,
        carrierCreateStatus: shipment.carrierCreateStatus,
      };
    }

    // 4. Guard: already in progress
    if (shipment.carrierCreateStatus === 'IN_PROGRESS') {
      return {
        shipmentId: id,
        status: 'IN_PROGRESS',
        carrierCreateStatus: shipment.carrierCreateStatus,
      };
    }

    // 5. Set to PENDING and write outbox event — ATOMIC transaction (B1.1)
    //    Either both the shipment state change AND the outbox event are committed,
    //    or neither is. This prevents orphan PENDING shipments without outbox events.
    const idempotencyKey = generateIdempotencyKey(id);

    await this.db.db.transaction(async (tx) => {
      await tx.update(shipments)
        .set({
          carrierCreateStatus: 'PENDING' as any,
          idempotencyKey,
          carrierCreateRetries: 0,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, id));

      await tx.insert(outboxEvents).values({
        id: crypto.randomUUID(),
        eventType: 'shipping.carrier.create',
        aggregateId: id,
        payload: { shipmentId: id, idempotencyKey },
        metadata: { providerKey: shipment.shippingProviderKey || 'manual-driver' },
        status: 'PENDING',
      });
    });

    return {
      shipmentId: id,
      status: 'QUEUED',
      carrierCreateStatus: 'PENDING',
      idempotencyKey,
    };
  }

  // ── POST /v1/shipments/:id/cancel ──────────────────────────────────────

  @Post(':id/cancel')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:write')
  @HttpCode(200)
  async cancelShipment(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { reason?: string },
  ) {
    const caller = this.toCallerContext(user);

    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, id),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    await this.assertShipmentAccessible(shipment, caller);

    // Already cancelled?
    if (shipment.cancelledAt) {
      return {
        shipmentId: id,
        cancelled: true,
        alreadyCancelled: true,
        cancelledAt: shipment.cancelledAt,
        reason: shipment.cancellationReason,
      };
    }

    const reason = body?.reason || 'Cancelled by user';

    // Try carrier cancellation if applicable
    const providerKey = shipment.shippingProviderKey || 'manual-driver';
    const provider = this.registry.findProvider(providerKey);

    let carrierResult: CancelShipmentResult | null = null;
    if (provider && provider.type === 'CARRIER' && shipment.carrierShipmentId) {
      carrierResult = await provider.cancelShipment(shipment.carrierShipmentId);
    }

    // Update shipment
    await this.db.db.update(shipments)
      .set({
        cancelledAt: new Date(),
        cancellationReason: reason,
        status: 'CANCELLED',
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, id));

    // Append audit event
    await this.db.db.insert(shipmentEvents).values({
      id: crypto.randomUUID(),
      shipmentId: id,
      eventType: 'CANCELLED',
      actorUserId: caller.sub,
      actorType: 'MERCHANT',
      notes: reason,
    });

    return {
      shipmentId: id,
      cancelled: true,
      reason,
      carrierResult: carrierResult || { supported: false, reason: 'Manual provider' },
    };
  }

  // ── GET /v1/shipments/:id/tracking ─────────────────────────────────────

  @Get(':id/tracking')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:read')
  async getTracking(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.toCallerContext(user);

    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, id),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    await this.assertShipmentAccessible(shipment, caller);

    // Get tracking from provider if available
    const providerKey = shipment.shippingProviderKey || 'manual-driver';
    const provider = this.registry.findProvider(providerKey);

    let trackingInfo: TrackingInfo | null = null;
    if (provider && shipment.carrierTrackingId) {
      trackingInfo = await provider.getTrackingInfo(shipment.carrierTrackingId);
    }

    // Get local shipment events as tracking timeline
    const events = await this.db.db.query.shipmentEvents.findMany({
      where: eq(shipmentEvents.shipmentId, id),
    });

    return {
      shipmentId: id,
      status: shipment.status,
      carrierShipmentId: shipment.carrierShipmentId,
      carrierTrackingId: shipment.carrierTrackingId,
      carrierStatusRaw: shipment.carrierStatusRaw,
      carrierStatusMapped: shipment.carrierStatusMapped,
      lastCarrierSyncAt: shipment.lastCarrierSyncAt,
      providerTracking: trackingInfo,
      localEvents: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actorType: e.actorType,
        locationText: e.locationText,
        notes: e.notes,
        externalEventId: e.externalEventId,
        carrierEventCode: e.carrierEventCode,
        createdAt: e.createdAt,
      })),
    };
  }

  // ── GET /v1/shipments/:id/labels ───────────────────────────────────────

  @Get(':id/labels')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:labels:read')
  async getLabels(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.toCallerContext(user);

    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, id),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    await this.assertShipmentAccessible(shipment, caller);

    const labels = await this.db.db.query.shipmentLabels.findMany({
      where: eq(shipmentLabels.shipmentId, id),
    });

    return {
      shipmentId: id,
      labels: labels.map((l) => ({
        id: l.id,
        labelNumber: l.labelNumber,
        storageKey: l.storageKey,
        mimeType: l.mimeType,
        sizeBytes: l.sizeBytes,
        trackingUrl: l.trackingUrl,
        isVoid: l.isVoid,
        providerKey: l.providerKey,
        labelType: l.labelType,
        createdAt: l.createdAt,
      })),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private toCallerContext(user: JwtPayload): CallerContext {
    return { sub: user.sub, role: user.role, activeOrg: user.activeOrg };
  }

  private isAdminRole(role: string | null | undefined): boolean {
    return ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(role || '');
  }

  // ── POST /v1/shipments/:id/exception ─────────────────────────────────────
  // M7.3-B.4: Report a delivery exception.

  @Post(':id/exception')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:write')
  @HttpCode(200)
  async reportException(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { exceptionType: string; notes?: string },
  ) {
    if (!body?.exceptionType) {
      throw new BadRequestException('exceptionType is required');
    }
    const caller = this.toCallerContext(user);
    return this.ordersService.reportShipmentException(
      id,
      body.exceptionType,
      body.notes,
      caller,
    );
  }

  // ── POST /v1/shipments/:id/retry ─────────────────────────────────────────
  // M7.3-B.4: Authorize a delivery retry.

  @Post(':id/retry')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:write')
  @HttpCode(200)
  async authorizeRetry(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.toCallerContext(user);
    return this.ordersService.authorizeShipmentRetry(id, caller);
  }

  // ── POST /v1/shipments/:id/rts ───────────────────────────────────────────
  // M7.3-B.5: Request Return to Sender.

  @Post(':id/rts')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:write')
  @HttpCode(201)
  async requestRTS(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { notes?: string },
  ) {
    const caller = this.toCallerContext(user);

    // LOST special flow: ADMIN can request+approve atomically
    if (body?.notes && this.isAdminRole(caller.role)) {
      const shipment = await this.db.db.query.shipments.findFirst({
        where: eq(shipments.id, id),
      });
      if (shipment && (shipment as any)['exceptionType'] === 'LOST') {
        return this.ordersService.requestAndApproveLostRTS(
          id, body.notes, caller,
        );
      }
    }

    return this.ordersService.requestRTS(id, body?.notes, caller);
  }

  // ── POST /v1/shipments/:id/rts/approve ────────────────────────────────────
  // M7.3-B.5: Approve RTS.

  @Post(':id/rts/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:write')
  @HttpCode(200)
  async approveRTS(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.toCallerContext(user);
    return this.ordersService.approveRTS(id, caller);
  }

  // ── POST /v1/shipments/:id/rts/reject ─────────────────────────────────────
  // M7.3-B.5: Reject RTS.

  @Post(':id/rts/reject')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:write')
  @HttpCode(200)
  async rejectRTS(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { notes: string },
  ) {
    if (!body?.notes?.trim()) {
      throw new BadRequestException('Rejection notes are mandatory');
    }
    const caller = this.toCallerContext(user);
    return this.ordersService.rejectRTS(id, body.notes, caller);
  }

  // ── POST /v1/shipments/:id/rts/complete ───────────────────────────────────
  // M7.3-B.5: Complete RTS (physical return confirmed).

  @Post(':id/rts/complete')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:write')
  @HttpCode(200)
  async completeRTS(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { notes?: string },
  ) {
    const caller = this.toCallerContext(user);
    return this.ordersService.completeRTS(id, body?.notes, caller);
  }

  /**
   * Assert the caller can access a shipment.
   * Platform staff bypass; merchant users must match the store's org.
   */
  private async assertShipmentAccessible(
    shipment: any,
    caller: CallerContext,
  ): Promise<void> {
    const privileged = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(caller.role || '');
    if (privileged) return;

    const store = await this.db.db.query.stores.findFirst({
      where: eq(stores.id, shipment.storeId),
      columns: { orgId: true },
    });
    if (!store) throw new NotFoundException('Store not found for shipment');
    if (store.orgId !== caller.activeOrg) {
      throw new BadRequestException('Shipment does not belong to your organization');
    }
  }
}
