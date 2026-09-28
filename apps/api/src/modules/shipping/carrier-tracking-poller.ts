/**
 * Carrier Tracking Poller — M7.2.3-C
 *
 * Generic tracking polling worker that:
 *   - Polls shipments with active tracking needs
 *   - Calls provider.getTrackingInfo() per shipment
 *   - Deduplicates tracking events by externalEventId or fingerprint
 *   - Prevents backward state transitions (DELIVERED cannot go to OUT_FOR_DELIVERY)
 *   - Persists raw carrier events even when they don't advance state
 *   - Stops polling terminal states (DELIVERED, CANCELLED, COMPLETED)
 *
 * This is the "recovery path" complement to webhooks (the "fast path").
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, isNull, lte, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { shipments, shipmentEvents } from '../orders/shipment.schema';
import { CarrierObservabilityService } from './carrier-observability';
import { CarrierCircuitBreaker } from './carrier-circuit-breaker';
import { randomUUID } from 'node:crypto';

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

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ShippingProviderRegistry,
    private readonly observability: CarrierObservabilityService,
    private readonly circuitBreaker: CarrierCircuitBreaker,
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
   */
  private async poll() {
    if (this.running) return;
    this.running = true;

    try {
      // Find shipments with active tracking needs
      const due = await this.db.db
        .select()
        .from(shipments)
        .where(
          and(
            eq(shipments.carrierCreateStatus, 'SUCCESS'),
            // Has a tracking ID
            // Drizzle doesn't support isNotNull cleanly here, use a workaround
          ),
        )
        .orderBy(shipments.lastCarrierSyncAt)
        .limit(CarrierTrackingPoller.BATCH_SIZE);

      // Filter to those with tracking IDs and non-terminal status
      const candidates = due.filter(
        s => s.carrierTrackingId &&
          !TERMINAL_STATUSES.has(s.carrierStatusMapped || s.status || ''),
      );

      this.logger.log(`Tracking poll: ${candidates.length} shipments to check.`);

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
   */
  private async processTrackingEvent(
    shipment: any,
    providerKey: string,
    event: { timestamp: string; status: string; carrierStatus?: string; location?: string; description?: string },
  ): Promise<void> {
    // Dedup: check if this event already exists
    const externalId = event.carrierStatus || null;
    const fingerprint = trackingEventFingerprint(
      providerKey,
      shipment.id,
      externalId,
      event.timestamp,
      event.description || null,
    );

    // Check for existing event by fingerprint
    const existing = await this.db.db.query.shipmentEvents.findFirst({
      where: eq(shipmentEvents.externalEventId, fingerprint),
    });

    if (existing) {
      // Duplicate — skip
      return;
    }

    // Order guard: don't insert events that would move state backward
    if (!canTransition(shipment.carrierStatusMapped, event.status)) {
      this.logger.log(
        `Tracking event ${event.status} would move shipment ${shipment.id} backward ` +
        `(current: ${shipment.carrierStatusMapped}) — persisting as metadata only.`,
      );
      // Still persist the raw event but don't advance status
    }

    // Persist the tracking event
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
  }
}
