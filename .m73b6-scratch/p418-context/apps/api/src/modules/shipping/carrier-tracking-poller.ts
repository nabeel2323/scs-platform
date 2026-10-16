/**
 * Carrier Tracking Poller — M7.2.3-C + M7.2.4-A hardened
 *
 * Generic tracking polling worker that:
 *   - Polls shipments with active tracking needs
 *   - Calls provider.getTrackingInfo() per shipment
 *   - Deduplicates tracking events via UNIQUE constraint on externalEventId
 *     (PG 23505 treated as idempotent dedup — no TOCTOU race)
 *   - Prevents backward state transitions (DELIVERED cannot go to OUT_FOR_DELIVERY)
 *   - Persists raw carrier events even when they don't advance state
 *   - Stops polling terminal states (DELIVERED, CANCELLED, COMPLETED)
 *   - Multi-instance safe: atomic claim via lastCarrierSyncAt timestamp throttle
 *   - SQL-level filtering: only eligible shipments are loaded from DB
 *
 * M7.2.4-A changes:
 *   - Atomic claim: UPDATE ... WHERE lastCarrierSyncAt IS NULL OR stale
 *     prevents two instances from polling the same shipment concurrently.
 *   - SQL filtering: WHERE clause includes carrierTrackingId IS NOT NULL
 *     and non-terminal status — no JS-side filtering.
 *   - Dedup: INSERT + catch PG 23505 instead of SELECT → INSERT (TOCTOU fix).
 *
 * This is the "recovery path" complement to webhooks (the "fast path").
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { eq, and, sql, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { shipments, shipmentEvents } from '../orders/shipment.schema';
import { CarrierObservabilityService } from './carrier-observability';
import { CarrierCircuitBreaker } from './carrier-circuit-breaker';
import { randomUUID } from 'node:crypto';
import { OrdersService } from '../orders/orders.service';

// ── Status Progression ──────────────────────────────────────────────────────

/**
 * Ordered carrier status lifecycle.
 * A shipment can only move FORWARD — never backward.
 */
export const CARRIER_STATUS_ORDER: readonly string[] = [
  'CREATED',
  'RECORD_CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'PROCESSING_AT_FACILITY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

/** Terminal states — no further polling needed. */
const TERMINAL_STATUSES = new Set(['DELIVERED', 'CANCELLED', 'COMPLETED']);

/**
 * M7.3-B.3.4 (C6 / BD-3.4-05): carrier cancel statuses for which an incoming
 * carrier DELIVERED is an anomaly rather than a normal progression.
 *
 * CASE A — 'SUCCEEDED' / 'NOT_REQUIRED' are already excluded from polling by the
 *          B.3.3.3 C5 guard, so they never reach this check.
 * CASE B — these three statuses mean SCS has begun/finished a cancellation whose
 *          carrier-side outcome is cancelled-or-unknown; a carrier DELIVERED while
 *          the shipment is in one of these states is DELIVERED_AFTER_CANCEL.
 */
export const DELIVERED_AFTER_CANCEL_STATUSES: readonly string[] = [
  'UNKNOWN',
  'RECONCILIATION_REQUIRED',
  'FAILED',
] as const;

/**
 * M7.3-B.3.4 (§3): cancel statuses for which normal tracking behavior is preserved.
 * A shipment with no cancellation in flight must still advance tracking state,
 * invoke the existing delivery bridge, and keep existing inventory settlement behavior.
 */
export const NORMAL_TRACKING_CANCEL_STATUSES: readonly (string | null)[] = [
  null,
  'PENDING',
  'IN_PROGRESS',
] as const;

/**
 * Decide whether a carrier DELIVERED must be treated as a delivered-after-cancel
 * exception instead of a normal delivery progression.
 *
 * Type predicate: a true result also proves the status is non-null.
 */
export function isDeliveredAfterCancel(
  carrierCancelStatus: string | null,
): carrierCancelStatus is string {
  return DELIVERED_AFTER_CANCEL_STATUSES.includes(carrierCancelStatus ?? '');
}

/**
 * Check if a status transition is valid (forward-only).
 */
export function canTransition(currentStatus: string | null, incomingStatus: string): boolean {
  if (!currentStatus) return true; // first event
  if (TERMINAL_STATUSES.has(currentStatus)) return false; // already terminal

  const currentIdx = CARRIER_STATUS_ORDER.indexOf(currentStatus);
  const incomingIdx = CARRIER_STATUS_ORDER.indexOf(incomingStatus);

  // Unknown statuses are allowed (pass-through) — don't block carrier-specific codes
  if (currentIdx === -1 || incomingIdx === -1) return true;

  return incomingIdx > currentIdx;
}

/**
 * Generate a deterministic fingerprint for dedup when no externalEventId exists.
 */
export function trackingEventFingerprint(
  providerKey: string,
  shipmentId: string,
  eventCode: string | null,
  timestamp: string,
  description: string | null,
): string {
  const parts = [providerKey, shipmentId, eventCode || '', timestamp, description || ''];
  // Simple hash — not cryptographic, just for dedup
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return `fp-${Math.abs(hash).toString(36)}`;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CarrierTrackingPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CarrierTrackingPoller.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Polling interval: 10 minutes (configurable via CARRIER_TRACKING_POLL_INTERVAL_MS). */
  private readonly pollIntervalMs: number;

  /** Maximum shipments to poll per cycle. */
  private static readonly BATCH_SIZE = 20;

  /** Minimum interval between tracking polls for the same shipment (ms). */
  private static readonly MIN_POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ShippingProviderRegistry,
    private readonly observability: CarrierObservabilityService,
    private readonly circuitBreaker: CarrierCircuitBreaker,
    // M7.3-A: Carrier → Order delivery bridge
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {
    this.pollIntervalMs = parseInt(
      process.env['CARRIER_TRACKING_POLL_INTERVAL_MS'] || '600000',
      10,
    );
  }

  onModuleInit() {
    // Start after a delay to let the app bootstrap
    setTimeout(() => this.startPolling(), 15_000);
    this.logger.log('CarrierTrackingPoller registered.');
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  private startPolling() {
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Poll shipments that need tracking updates.
   *
   * M7.2.4-A: Atomic claim + SQL-level filtering.
   * Uses lastCarrierSyncAt as a natural throttle — setting it to NOW() on claim
   * prevents other instances from selecting the same shipment until the interval
   * elapses. This is a lightweight claim without holding a transaction open.
   */
  private async poll() {
    if (this.running) return;
    this.running = true;

    try {
      // M7.2.4-A: Atomic claim via UPDATE ... RETURNING.
      // Only claims shipments that are eligible:
      //   - carrierCreateStatus = SUCCESS
      //   - carrierTrackingId IS NOT NULL
      //   - non-terminal carrier status
      //   - lastCarrierSyncAt is NULL or older than MIN_POLL_INTERVAL_MS
      // The UPDATE sets lastCarrierSyncAt = NOW(), which acts as a claim marker
      // and prevents other instances from selecting the same row.
      const cutoff = new Date(Date.now() - CarrierTrackingPoller.MIN_POLL_INTERVAL_MS);

      // B.3.3.3 (C5): Exclude shipments with confirmed carrier cancellation
      // from normal tracking progression. Only SUCCEEDED and NOT_REQUIRED are
      // excluded — UNKNOWN/RECONCILIATION_REQUIRED shipments continue to be
      // polled (full cancel-aware tracking deferred to B.3.3.4).
      const claimed = await this.db.db.execute(sql`
        UPDATE shipments
        SET last_carrier_sync_at = NOW(), updated_at = NOW()
        WHERE id IN (
          SELECT id FROM shipments
          WHERE carrier_create_status = 'SUCCESS'
            AND carrier_tracking_id IS NOT NULL
            AND (carrier_status_mapped IS NULL
                 OR carrier_status_mapped NOT IN ('DELIVERED', 'CANCELLED', 'COMPLETED'))
            AND (carrier_cancel_status IS NULL
                 OR carrier_cancel_status NOT IN ('SUCCEEDED', 'NOT_REQUIRED'))
            AND (last_carrier_sync_at IS NULL OR last_carrier_sync_at <= ${cutoff})
          ORDER BY last_carrier_sync_at NULLS FIRST
          LIMIT ${CarrierTrackingPoller.BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `);

      const candidates = claimed.rows ?? [];
      this.logger.log(`Tracking poll: ${candidates.length} shipments claimed.`);

      for (const shipment of candidates) {
        await this.pollShipment(shipment);
      }
    } catch (err: any) {
      this.logger.error(`Tracking poll error: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Poll a single shipment for tracking updates.
   */
  private async pollShipment(shipment: any): Promise<void> {
    const providerKey = shipment.shippingProviderKey || 'aramex';
    const provider = this.registry.findProvider(providerKey);
    if (!provider) return;

    // Check circuit breaker
    const cbScope = CarrierCircuitBreaker.scopeKey(providerKey);
    if (!this.circuitBreaker.canRequest(cbScope)) return;

    try {
      const trackingInfo = await provider.getTrackingInfo(shipment.carrierTrackingId);
      this.circuitBreaker.recordSuccess(cbScope);

      // ── M7.3-B.3.4 (C6 / BD-3.4-04 / BD-3.4-05): DELIVERED_AFTER_CANCEL ──
      // A carrier DELIVERED on a shipment whose cancellation is UNKNOWN,
      // RECONCILIATION_REQUIRED or FAILED is an operational anomaly, not a
      // delivery. SCS cancellation stays authoritative: we record an exception
      // event and a recovery token only — we never advance carrier_status_mapped,
      // never invoke the order delivery bridge, never mutate shipment.status and
      // never settle inventory. Shipments already SUCCEEDED/NOT_REQUIRED are
      // excluded upstream by the C5 guard and never reach this branch.
      //
      // Detected straight off the carrier-reported status and BEFORE the
      // no-events short-circuit, so an anomaly can never be missed because the
      // provider returned a status without a detailed event list. Raw carrier
      // events are still persisted below (existing behavior — they never advance
      // state). The shipment row comes from raw SQL (`UPDATE ... RETURNING *`),
      // so its keys are snake_case here.
      const cancelStatus = (shipment.carrier_cancel_status ?? null) as string | null;
      let deliveredAfterCancel = false;
      if (trackingInfo?.status === 'DELIVERED' && isDeliveredAfterCancel(cancelStatus)) {
        deliveredAfterCancel = true;
        await this.handleDeliveredAfterCancel(shipment, providerKey, cancelStatus);
      }

      if (!trackingInfo || !trackingInfo.events.length) {
        // No new events
        await this.db.db
          .update(shipments)
          .set({ lastCarrierSyncAt: new Date(), updatedAt: new Date() })
          .where(eq(shipments.id, shipment.id));
        return;
      }

      // Process each tracking event
      for (const event of trackingInfo.events) {
        await this.processTrackingEvent(shipment, providerKey, event);
      }

      // Update shipment status if advanced
      const latestStatus = trackingInfo.status;

      if (
        !deliveredAfterCancel &&
        latestStatus &&
        canTransition(shipment.carrierStatusMapped, latestStatus)
      ) {
        await this.db.db
          .update(shipments)
          .set({
            carrierStatusRaw: latestStatus,
            carrierStatusMapped: latestStatus,
            lastCarrierSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(shipments.id, shipment.id));

        // M7.3-A: Bridge carrier DELIVERED → order DELIVERED
        if (latestStatus === 'DELIVERED' && shipment.order_id) {
          try {
            await this.ordersService.processCarrierDelivery(
              shipment.order_id,
              shipment.carrier_shipment_id,
              'tracking_poll',
            );
          } catch (bridgeErr: any) {
            this.logger.warn(
              `Carrier delivery bridge failed for order ${shipment.order_id}: ${bridgeErr?.message}`,
            );
          }
        }
      } else {
        await this.db.db
          .update(shipments)
          .set({ lastCarrierSyncAt: new Date(), updatedAt: new Date() })
          .where(eq(shipments.id, shipment.id));
      }

    } catch (err: any) {
      this.circuitBreaker.recordFailure(cbScope);
      this.logger.error(
        `Tracking poll failed for shipment ${shipment.id}: ${err?.message}`,
      );
    }
  }

  /**
   * M7.3-B.3.4 (C6): record a delivered-after-cancel exception.
   *
   * Operational visibility ONLY — no order mutation, no shipment.status mutation,
   * no delivery bridge invocation, no carrier_status_mapped advance, no inventory
   * SALE. SCS cancellation remains authoritative.
   *
   * Idempotent under repeated carrier DELIVERED polls:
   *   - the exception event carries a deterministic `external_event_id`, so the
   *     UNIQUE index `uq_shipment_events_external_id` (migration 0046) turns a
   *     re-insert into a PG 23505 no-op — the same mechanism tracking dedup
   *     already relies on. No new index or schema is introduced.
   *   - the recovery token is written with `IS DISTINCT FROM`, so a repeat poll
   *     affects zero rows and cannot re-stamp a token an operator has cleared.
   */
  private async handleDeliveredAfterCancel(
    shipment: any,
    providerKey: string,
    cancelStatus: string,
  ): Promise<void> {
    const shipmentId = shipment.id as string;
    // Deterministic per shipment + anomaly: stable across polls => idempotent dedup.
    const exceptionId = `dac-${shipmentId}`;

    this.logger.warn(
      `Shipment ${shipmentId} — carrier reports DELIVERED after SCS cancellation ` +
      `(carrier_cancel_status=${cancelStatus}). Recording DELIVERED_AFTER_CANCEL exception; ` +
      `order state, shipment status and inventory are NOT modified.`,
    );

    // 1. Append the exception event (admin-visible audit record).
    try {
      await this.db.db.insert(shipmentEvents).values({
        id: randomUUID(),
        shipmentId,
        eventType: 'CARRIER_TRACKING',
        actorType: 'CARRIER',
        notes: 'Carrier reports DELIVERED after SCS cancellation',
        metadata: {
          carrierStatus: 'DELIVERED',
          providerKey,
          source: 'tracking_poll',
          carrierCancelStatus: cancelStatus,
          exception: 'DELIVERED_AFTER_CANCEL',
        },
        externalEventId: exceptionId,
        carrierEventCode: 'DELIVERED_AFTER_CANCEL',
      });
    } catch (err: any) {
      if (err?.code !== '23505') throw err;
      this.logger.debug(
        `Delivered-after-cancel exception already recorded for shipment ${shipmentId}`,
      );
    }

    // 2. Raise the recovery token so the shipment surfaces in the admin
    //    recovery queue. last_carrier_sync_at was already stamped by the atomic
    //    claim in poll(), so the poll throttle remains intact.
    await this.db.db
      .update(shipments)
      .set({
        recoveryStatus: 'DELIVERED_AFTER_CANCEL' as any,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, shipmentId),
          sql`${shipments.recoveryStatus} IS DISTINCT FROM 'DELIVERED_AFTER_CANCEL'`,
        ),
      );

    // 3. Intentionally NOT performed:
    //      - ordersService.processCarrierDelivery()
    //      - carrier_status_mapped / carrier_status_raw advance
    //      - shipment.status mutation
    //      - order status mutation / inventory SALE settlement
  }

  /**
   * Process a single tracking event with dedup and ordering protection.
   *
   * M7.2.4-A: Dedup via UNIQUE constraint (PG 23505 = idempotent duplicate).
   * No more TOCTOU SELECT → INSERT race.
   */
  private async processTrackingEvent(
    shipment: any,
    providerKey: string,
    event: { timestamp: string; status: string; carrierStatus?: string; location?: string; description?: string },
  ): Promise<void> {
    const externalId = event.carrierStatus || null;
    const fingerprint = trackingEventFingerprint(
      providerKey,
      shipment.id,
      externalId,
      event.timestamp,
      event.description || null,
    );

    // Order guard: don't insert events that would move state backward
    if (!canTransition(shipment.carrierStatusMapped, event.status)) {
      this.logger.log(
        `Tracking event ${event.status} would move shipment ${shipment.id} backward ` +
        `(current: ${shipment.carrierStatusMapped}) — persisting as metadata only.`,
      );
      // Still persist the raw event but don't advance status
    }

    // M7.2.4-A: Attempt INSERT; treat PG 23505 as idempotent dedup.
    // The UNIQUE index uq_shipment_events_external_id is the final authority.
    try {
      await this.db.db.insert(shipmentEvents).values({
        id: randomUUID(),
        shipmentId: shipment.id,
        eventType: 'CARRIER_TRACKING',
        actorType: 'CARRIER',
        locationText: event.location?.slice(0, 300) || null,
        notes: event.description || null,
        metadata: {
          carrierStatus: event.status,
          timestamp: event.timestamp,
          providerKey,
          source: 'tracking_poll',
        },
        externalEventId: fingerprint,
        carrierEventCode: externalId?.slice(0, 40) || null,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        // Duplicate — idempotent dedup. Another worker or a previous cycle
        // already inserted this event. Safe to ignore.
        this.logger.debug(
          `Tracking event dedup: fingerprint ${fingerprint} already exists for shipment ${shipment.id}`,
        );
        return;
      }
      throw err;
    }
  }
}
