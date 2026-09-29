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

      const claimed = await this.db.db.execute(sql`
        UPDATE shipments
        SET last_carrier_sync_at = NOW(), updated_at = NOW()
        WHERE id IN (
          SELECT id FROM shipments
          WHERE carrier_create_status = 'SUCCESS'
            AND carrier_tracking_id IS NOT NULL
            AND (carrier_status_mapped IS NULL
                 OR carrier_status_mapped NOT IN ('DELIVERED', 'CANCELLED', 'COMPLETED'))
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
      if (latestStatus && canTransition(shipment.carrierStatusMapped, latestStatus)) {
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
