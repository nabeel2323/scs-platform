import {
  Controller, Get, Post, Param, Body, Query, UseGuards, HttpCode,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { eq, and, desc, asc, or, inArray, sql, ilike } from 'drizzle-orm';
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
import { orders } from '../orders/orders.schema';
import {
  generateIdempotencyKey, CancelShipmentResult, TrackingInfo,
} from './shipping.types';
import { CallerContext } from '../../common/tenant-scope';
import { OrdersService } from '../orders/orders.service';

/** Query parameters accepted by the shipment list read model. */
interface ShipmentListQuery {
  status?: string;
  exceptionStatus?: string;
  exceptionType?: string;
  carrierCreateStatus?: string;
  recoveryStatus?: string;
  storeId?: string;
  orderId?: string;
  scope?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  limit?: string;
  offset?: string;
}

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
@Controller('shipments')
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

  // ── M7.3-B.6 read models: shipments list + detail ───────────────────────
  // These were the one genuine blocking gap for the Ship-Ops consoles: the
  // B.5-verified backend exposed per-`:id` operations but no way to enumerate
  // shipments into a queue (shipments list, exception queue, RTS queue).
  // Additive read-only surface; reuses the existing tenant helpers.

  /** Shipment statuses that represent an in-flight Return-to-Sender cycle. */
  private static readonly RTS_STATES = ['RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED'];

  /** Sortable columns for the list endpoint (whitelisted to avoid injection). */
  private static readonly SORTABLE: Record<string, any> = {
    createdAt: shipments.createdAt,
    updatedAt: shipments.updatedAt,
    status: shipments.status,
    exceptionStatus: shipments.exceptionStatus,
    exceptionType: shipments.exceptionType,
    exceptionAt: shipments.exceptionAt,
    carrierCreateStatus: shipments.carrierCreateStatus,
    deliveryAttempts: shipments.deliveryAttempts,
  };

  // ── GET /v1/shipments ─────────────────────────────────────────
  // Tenant-scoped shipment list. Platform staff (ADMIN/SUPER_ADMIN/MODERATOR)
  // see all; merchant callers are scoped to their active org's stores.

  @Get()
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:read')
  async listShipments(
    @CurrentUser() user: JwtPayload,
    @Query() q: ShipmentListQuery,
  ) {
    const caller = this.toCallerContext(user);
    const conditions: any[] = [];

    // Tenant scope: privileged roles bypass; everyone else is store-scoped.
    if (!this.isPrivilegedRole(caller.role)) {
      if (!caller.activeOrg) {
        return { data: [], total: 0, limit: 0, offset: 0 };
      }
      const storeRows = await this.db.db.query.stores.findMany({
        where: eq(stores.orgId, caller.activeOrg),
        columns: { id: true },
      });
      if (storeRows.length === 0) {
        return { data: [], total: 0, limit: 0, offset: 0 };
      }
      conditions.push(inArray(shipments.storeId, storeRows.map((s) => s.id)));
    }

    // Exact-match status filters.
    if (q.status) conditions.push(eq(shipments.status, q.status));
    if (q.exceptionStatus) conditions.push(eq(shipments.exceptionStatus, q.exceptionStatus));
    if (q.exceptionType) conditions.push(eq(shipments.exceptionType, q.exceptionType));
    if (q.carrierCreateStatus) conditions.push(eq(shipments.carrierCreateStatus, q.carrierCreateStatus));
    if (q.recoveryStatus) conditions.push(eq(shipments.recoveryStatus, q.recoveryStatus));
    if (q.storeId) conditions.push(eq(shipments.storeId, q.storeId));
    if (q.orderId) conditions.push(eq(shipments.orderId, q.orderId));

    // Queue scopes.
    if (q.scope === 'rts') {
      conditions.push(inArray(shipments.exceptionStatus, ShipmentOperationsController.RTS_STATES));
    } else if (q.scope === 'exceptions') {
      // Active (unresolved, non-RTS) delivery exceptions.
      conditions.push(
        sql`${shipments.exceptionStatus} is not null`,
        sql`${shipments.exceptionStatus} not in ('CLOSED', 'RESOLVED', 'RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED')`,
      );
    } else if (q.scope === 'recovery') {
      conditions.push(
        or(
          inArray(shipments.carrierCreateStatus, ['PENDING', 'IN_PROGRESS', 'FAILED', 'RECOVERY_REQUIRED']),
          inArray(shipments.carrierCancelStatus, ['UNKNOWN', 'RECONCILIATION_REQUIRED']),
        ) as any,
      );
    }

    // Free-text search over identity + carrier references + store name.
    // NOTE: shipments.id is a UUID; PostgreSQL has no ILIKE (~~*) for uuid, so
    // the id is cast to text before the pattern match. Other columns are text.
    if (q.search) {
      const term = `%${q.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        or(
          sql`${shipments.id}::text ilike ${term}`,
          ilike(shipments.carrierTrackingId, term),
          ilike(shipments.carrierShipmentId, term),
          ilike(stores.displayName, term),
        ) as any,
      );
    }

    const sortField = ShipmentOperationsController.SORTABLE[q.sortBy || 'updatedAt'] || shipments.updatedAt;
    const sortFn = q.sortDir === 'asc' ? asc : desc;
    const limit = Math.min(parseInt(q.limit || '25', 10) || 25, 100);
    const offset = Math.max(parseInt(q.offset || '0', 10) || 0, 0);

    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await this.db.db
      .select({
        id: shipments.id,
        orderId: shipments.orderId,
        storeId: shipments.storeId,
        status: shipments.status,
        assignedDriverId: shipments.assignedDriverId,
        pickedUpAt: shipments.pickedUpAt,
        outForDeliveryAt: shipments.outForDeliveryAt,
        deliveredAt: shipments.deliveredAt,
        cancelledAt: shipments.cancelledAt,
        createdAt: shipments.createdAt,
        updatedAt: shipments.updatedAt,
        carrierTrackingId: shipments.carrierTrackingId,
        carrierShipmentId: shipments.carrierShipmentId,
        shippingProviderKey: shipments.shippingProviderKey,
        carrierStatusMapped: shipments.carrierStatusMapped,
        carrierCreateStatus: shipments.carrierCreateStatus,
        carrierCreateErrorClass: shipments.carrierCreateErrorClass,
        carrierCreateRetries: shipments.carrierCreateRetries,
        carrierCancelStatus: shipments.carrierCancelStatus,
        recoveryStatus: shipments.recoveryStatus,
        exceptionStatus: shipments.exceptionStatus,
        exceptionType: shipments.exceptionType,
        exceptionAt: shipments.exceptionAt,
        deliveryAttempts: shipments.deliveryAttempts,
        maxDeliveryAttempts: shipments.maxDeliveryAttempts,
        storeName: stores.displayName,
        orderStatus: orders.status,
      })
      .from(shipments)
      .leftJoin(stores, eq(shipments.storeId, stores.id))
      .leftJoin(orders, eq(shipments.orderId, orders.id))
      .where(where)
      .orderBy(sortFn(sortField), desc(shipments.id))
      .limit(limit)
      .offset(offset);

    const countRows = await this.db.db
      .select({ total: sql<number>`count(*)::integer` })
      .from(shipments)
      .leftJoin(stores, eq(shipments.storeId, stores.id))
      .where(where);

    const total = Number(countRows[0]?.total ?? 0);
    return { data: rows, total, limit, offset };
  }

  // ── GET /v1/shipments/:id ──────────────────────────────────────
  // Shipment detail: header + carrier/exception/RTS state + events timeline
  // + labels. Tenant-checked via the shared assertShipmentAccessible helper.

  @Get(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:read')
  async getShipmentDetail(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.toCallerContext(user);

    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, id),
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    await this.assertShipmentAccessible(shipment, caller);

    const [store, order, events, labels] = await Promise.all([
      this.db.db.query.stores.findFirst({ where: eq(stores.id, shipment.storeId) }),
      this.db.db.query.orders.findFirst({ where: eq(orders.id, shipment.orderId) }),
      this.db.db.query.shipmentEvents.findMany({
        where: eq(shipmentEvents.shipmentId, id),
        orderBy: [asc(shipmentEvents.sequence)],
      }),
      this.db.db.query.shipmentLabels.findMany({
        where: eq(shipmentLabels.shipmentId, id),
      }),
    ]);

    return {
      shipment,
      store: store ? { id: store.id, displayName: store.displayName, slug: store.slug, orgId: store.orgId } : null,
      order: order ? { id: order.id, status: order.status, storeId: order.storeId, buyerId: order['buyerId'] } : null,
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        actorType: e.actorType,
        actorUserId: e.actorUserId,
        locationText: e.locationText,
        notes: e.notes,
        carrierEventCode: e.carrierEventCode,
        sequence: e.sequence,
        createdAt: e.createdAt,
      })),
      labels: labels.map((l) => ({
        id: l.id,
        labelNumber: l.labelNumber,
        storageKey: l.storageKey,
        mimeType: l.mimeType,
        trackingUrl: l.trackingUrl,
        isVoid: l.isVoid,
        labelType: l.labelType,
        createdAt: l.createdAt,
      })),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private isPrivilegedRole(role: string | null | undefined): boolean {
    return ['SUPER_ADMIN', 'ADMIN', 'MODERATOR'].includes(role || '');
  }


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

  // ── GET /v1/shipments/:id/return-eligibility ──────────────────────────────
  // M7.3-C: read model backing the "Record Return" form — per-line reserved /
  // returned / remaining quantities plus the server-resolved warehouse origin.
  // Guarded by the dedicated return permission (not just read) because it
  // exposes internal inventoryItemId/warehouseId. Buyers/drivers never reach it.

  @Get(':id/return-eligibility')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:return')
  async getReturnEligibility(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const caller = this.toCallerContext(user);
    return this.ordersService.getReturnEligibility(id, caller);
  }

  // ── POST /v1/shipments/:id/return ─────────────────────────────────────────
  // M7.3-C: record the physical RTS return (pre-SALE return-to-stock).

  @Post(':id/return')
  @UseGuards(PermissionsGuard)
  @RequirePermission('fulfillment:shipments:return')
  @HttpCode(200)
  async recordReturn(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: any,
  ) {
    const caller = this.toCallerContext(user);
    const lines = this.validateReturnBody(body);
    return this.ordersService.recordReturn(id, lines, caller);
  }

  /**
   * Validate the /return request body. Only line intent is trusted
   * (orderItemId + quantity + condition). Any attempt to supply a
   * server-controlled inventory/warehouse/price field is rejected (400) rather
   * than trusted — the server resolves origin from the original RESERVE.
   */
  private validateReturnBody(
    body: any,
  ): Array<{ orderItemId: string; quantity: number; condition: string }> {
    if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
      throw new BadRequestException('Request must include a non-empty lines[] array');
    }
    const allowed = new Set(['orderItemId', 'quantity', 'condition']);
    const forbidden = new Set([
      'warehouseId', 'inventoryItemId', 'qtyOnHand', 'qtyReserved', 'qtyAvailable',
      'price', 'unitPriceMinor', 'storeId', 'orderId', 'referenceId', 'movementType',
      'idempotencyKey', 'fingerprint',
    ]);
    const out: Array<{ orderItemId: string; quantity: number; condition: string }> = [];
    for (const raw of body.lines) {
      if (!raw || typeof raw !== 'object') {
        throw new BadRequestException('Each return line must be an object');
      }
      for (const key of Object.keys(raw)) {
        if (forbidden.has(key)) {
          throw new BadRequestException(`Field '${key}' is server-controlled and must not be supplied`);
        }
        if (!allowed.has(key)) {
          throw new BadRequestException(`Unexpected field '${key}' in return line`);
        }
      }
      out.push({
        orderItemId: raw.orderItemId,
        quantity: raw.quantity,
        condition: raw.condition,
      });
    }
    return out;
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
