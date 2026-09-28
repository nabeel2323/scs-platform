import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { eq, and, or, isNull, lt, lte } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { ShippingProviderRegistry } from './shipping-registry';
import { CarrierCredentialsService } from './carrier-credentials.service';
import { CarrierConfigurationsService } from './carrier-configurations.service';
import { outboxEvents } from '../audit/audit.schema';
import { shipments } from '../orders/shipment.schema';
import { generateIdempotencyKey, CarrierCreateStatus, CreateShipmentRequest } from './shipping.types';
import { classifyCarrierError } from './carrier-errors';
import { CarrierObservabilityService } from './carrier-observability';
import { CarrierEmailResolver } from './carrier-email-resolver';

/**
 * ShippingCarrierWorker — dedicated worker for shipping.carrier.* outbox events.
 *
 * DESIGN PRINCIPLES:
 *   - Does NOT modify the generic OutboxDispatcher.
 *   - Consumes ONLY shipping.carrier.* events.
 *   - Never performs carrier HTTP calls inside DB transactions.
 *   - Uses row-level locking to prevent concurrent processing.
 *   - Implements exponential backoff with jitter for retries.
 *   - No real carrier adapters exist yet — safe no-op path for tests.
 *   - Designed so a real provider can be plugged in later.
 *
 * Supported event types:
 *   - shipping.carrier.create  — create shipment with external carrier
 *   - shipping.carrier.cancel  — cancel external carrier shipment
 *   - shipping.carrier.label   — generate shipping label
 *   - shipping.carrier.track   — poll tracking updates
 *
 * SAFETY:
 *   - Two concurrent requests for the same shipment MUST NOT result in
 *     two carrier creation attempts.
 *   - The worker checks carrier_create_status, carrier_shipment_id, and
 *     current processing state before attempting creation.
 */
@Injectable()
export class ShippingCarrierWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShippingCarrierWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  /** Polling interval: 5 seconds (less aggressive than generic outbox). */
  private static readonly POLL_INTERVAL_MS = 5_000;

  /** Maximum processing attempts before marking FAILED. */
  private static readonly MAX_ATTEMPTS = 5;

  /**
   * Backoff schedule in seconds.
   * Attempt 1: immediate
   * Attempt 2: ~30 seconds
   * Attempt 3: ~2 minutes
   * Attempt 4: ~10 minutes
   * Attempt 5: ~1 hour
   */
  private static readonly BACKOFF_SECONDS = [0, 30, 120, 600, 3600];

  /** Carrier event types this worker consumes. */
  private static readonly CARRIER_EVENT_PREFIX = 'shipping.carrier.';

  constructor(
    private readonly db: DatabaseService,
    private readonly registry: ShippingProviderRegistry,
    private readonly credentials: CarrierCredentialsService,
    private readonly configurations: CarrierConfigurationsService,
    private readonly observability: CarrierObservabilityService,
    private readonly emailResolver: CarrierEmailResolver,
  ) {}

  onModuleInit() {
    // Start polling after a delay to let the app bootstrap
    setTimeout(() => this.startPolling(), 8000);
    this.logger.log('ShippingCarrierWorker registered — polling every 5s for carrier events.');
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  /**
   * Calculate the next_attempt_at for a given attempt number.
   * Includes ±20% jitter to prevent thundering herd.
   */
  static calculateNextAttempt(attemptNumber: number): Date | null {
    if (attemptNumber >= ShippingCarrierWorker.MAX_ATTEMPTS) return null;

    const baseSeconds = ShippingCarrierWorker.BACKOFF_SECONDS[attemptNumber] ?? 3600;
    // ±20% jitter
    const jitter = baseSeconds * 0.2 * (Math.random() * 2 - 1);
    const delayMs = (baseSeconds + jitter) * 1000;

    return new Date(Date.now() + delayMs);
  }

  /**
   * Schedule a retry by updating the outbox event's next_attempt_at.
   */
  static calculateBackoffDate(attemptNumber: number): Date {
    const nextAttempt = ShippingCarrierWorker.calculateNextAttempt(attemptNumber);
    return nextAttempt ?? new Date(Date.now() + 3600_000); // fallback: 1 hour
  }

  // ── Polling ─────────────────────────────────────────────────────────────

  private startPolling() {
    this.timer = setInterval(() => this.poll(), ShippingCarrierWorker.POLL_INTERVAL_MS);
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Poll for pending carrier events.
   *
   * Eligible events are PENDING and either:
   *   - next_attempt_at IS NULL (first attempt), or
   *   - next_attempt_at <= NOW() (retry is due)
   */
  private async poll() {
    if (this.running) return;
    this.running = true;

    try {
      const now = new Date();

      // Fetch carrier events that are ready for processing
      const pending = await this.db.db
        .select()
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.status, 'PENDING'),
            // Only carrier events
            // We filter by event type prefix in the loop since Drizzle
            // doesn't support LIKE on all dialects cleanly
            or(
              isNull(outboxEvents.nextAttemptAt),
              lte(outboxEvents.nextAttemptAt, now),
            ),
          ),
        )
        .orderBy(outboxEvents.createdAt)
        .limit(5);

      // Filter to carrier events only
      const carrierEvents = pending.filter(
        (e) => e.eventType.startsWith(ShippingCarrierWorker.CARRIER_EVENT_PREFIX),
      );

      for (const event of carrierEvents) {
        await this.processEvent(event);
      }
    } catch (err: any) {
      this.logger.error(`Poll error: ${err?.message}`);
    } finally {
      this.running = false;
    }
  }

  // ── Event processing ────────────────────────────────────────────────────

  private async processEvent(event: any): Promise<void> {
    const eventId = event.id as string;
    const eventType = event.eventType as string;

    try {
      // Claim the event with optimistic locking (UPDATE WHERE status = PENDING)
      const claimed = await this.db.db
        .update(outboxEvents)
        .set({ status: 'PROCESSING' })
        .where(
          and(
            eq(outboxEvents.id, eventId),
            eq(outboxEvents.status, 'PENDING'),
          ),
        )
        .returning();

      if (!claimed.length) {
        // Another worker already claimed it
        return;
      }

      this.logger.log(`Processing carrier event: ${eventType} (aggregate: ${event.aggregateId})`);

      switch (eventType) {
        case 'shipping.carrier.create':
          await this.handleCreate(event);
          break;
        case 'shipping.carrier.cancel':
          await this.handleCancel(event);
          break;
        case 'shipping.carrier.label':
          await this.handleLabel(event);
          break;
        case 'shipping.carrier.track':
          await this.handleTrack(event);
          break;
        default:
          this.logger.warn(`Unknown carrier event type: ${eventType}`);
      }

      // Mark as dispatched
      await this.db.db
        .update(outboxEvents)
        .set({ status: 'DISPATCHED', dispatchedAt: new Date() })
        .where(eq(outboxEvents.id, eventId));

    } catch (err: any) {
      await this.handleFailure(eventId, event, err);
    }
  }

  // ── Event handlers ──────────────────────────────────────────────────────

  /**
   * Handle shipping.carrier.create.
   *
   * SAFETY:
   *   - Checks carrier_create_status before attempting.
   *   - Uses the shipment's idempotency key.
   *   - No real carrier HTTP calls yet (no adapters implemented).
   *   - Marks the shipment as FAILED with a descriptive message.
   */
  private async handleCreate(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    if (!shipmentId) throw new Error('shipping.carrier.create requires aggregateId (shipmentId)');

    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });
    if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

    // Guard: already created or in progress
    if (shipment.carrierCreateStatus === 'SUCCESS' && shipment.carrierShipmentId) {
      this.logger.log(`Shipment ${shipmentId} already has carrier shipment ID — skipping.`);
      return;
    }
    if (shipment.carrierCreateStatus === 'IN_PROGRESS') {
      this.logger.log(`Shipment ${shipmentId} creation already in progress — skipping.`);
      return;
    }

    // Mark as IN_PROGRESS
    await this.db.db
      .update(shipments)
      .set({
        carrierCreateStatus: 'IN_PROGRESS' as any,
        carrierCreateAttemptedAt: new Date(),
        idempotencyKey: shipment.idempotencyKey || generateIdempotencyKey(shipmentId),
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipmentId));

    // Resolve provider
    const providerKey = shipment.shippingProviderKey || 'manual-driver';
    const provider = this.registry.findProvider(providerKey);

    if (!provider) {
      throw new Error(`Provider '${providerKey}' not found in registry`);
    }

    // If it's a manual provider, no carrier creation needed
    if (provider.type === 'MANUAL') {
      await this.db.db
        .update(shipments)
        .set({
          carrierCreateStatus: 'SUCCESS' as any,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId));

      this.logger.log(`Shipment ${shipmentId} — manual provider, no carrier creation needed.`);
      return;
    }

    // CARRIER provider — invoke the real adapter.
    // Build a CreateShipmentRequest from the shipment data.
    const deliveryAddr = shipment.deliveryAddress as Record<string, unknown> | null;

    // Resolve consignee email (may throw CarrierEmailRequiredError)
    let consigneeEmail: string | undefined;
    try {
      const resolved = await this.emailResolver.tryResolve(shipmentId);
      if (resolved) consigneeEmail = resolved.email;
    } catch {
      // Email resolution failure is not fatal — some carriers may not require it
    }

    const createRequest: CreateShipmentRequest = {
      shipmentId,
      orderId: shipment.orderId,
      storeId: shipment.storeId,
      deliveryAddress: {
        street: (deliveryAddr?.['street'] as string) || '',
        city: (deliveryAddr?.['city'] as string) || '',
        country: (deliveryAddr?.['country'] as string) || '',
        postalCode: deliveryAddr?.['postalCode'] as string | undefined,
        region: deliveryAddr?.['region'] as string | undefined,
        phone: deliveryAddr?.['phone'] as string | undefined,
        recipientName: deliveryAddr?.['recipientName'] as string | undefined,
      },
      serviceType: undefined, // resolved by provider from configuration
      weightGrams: typeof deliveryAddr?.['weightGrams'] === 'number'
        ? deliveryAddr['weightGrams'] as number : undefined,
      currency: (deliveryAddr?.['currency'] as string) || undefined,
      codAmountMinor: typeof deliveryAddr?.['codAmountMinor'] === 'number'
        ? deliveryAddr['codAmountMinor'] as number : undefined,
      declaredValueMinor: typeof deliveryAddr?.['declaredValueMinor'] === 'number'
        ? deliveryAddr['declaredValueMinor'] as number : undefined,
      idempotencyKey: shipment.idempotencyKey || generateIdempotencyKey(shipmentId),
      consigneeEmail,
      metadata: shipment.metadata as Record<string, unknown>,
    };

    try {
      const result = await provider.createShipment(createRequest);

      // Success — update shipment with carrier result
      await this.db.db
        .update(shipments)
        .set({
          carrierCreateStatus: 'SUCCESS' as any,
          carrierShipmentId: result.carrierShipmentId || null,
          carrierTrackingId: result.trackingId || null,
          carrierStatusRaw: result.carrierStatus || null,
          carrierStatusMapped: result.carrierStatus || null,
          lastCarrierSyncAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId));

      this.logger.log(
        `Shipment ${shipmentId} — carrier creation SUCCESS ` +
        `(carrier ID: ${result.carrierShipmentId || 'none'})`,
      );

    } catch (err: any) {
      // Classify the error to determine retry behaviour
      const classification = classifyCarrierError(err);
      const isFinal = (shipment.carrierCreateRetries || 0) + 1 >= ShippingCarrierWorker.MAX_ATTEMPTS;

      const newStatus: CarrierCreateStatus = (classification.decision === 'retry' && !isFinal)
        ? 'PENDING'
        : 'FAILED';

      await this.db.db
        .update(shipments)
        .set({
          carrierCreateStatus: newStatus as any,
          carrierCreateError: classification.safeMessage,
          carrierCreateRetries: (shipment.carrierCreateRetries || 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId));

      this.logger.error(
        `Shipment ${shipmentId} — carrier creation failed: ${classification.safeMessage}`,
      );

      // Re-throw so the event handler marks the outbox event appropriately
      throw err;
    }
  }

  /**
   * Handle shipping.carrier.cancel.
   * Placeholder — no real carrier adapter exists yet.
   */
  private async handleCancel(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    this.logger.log(`Carrier cancel requested for shipment ${shipmentId} — no adapter yet.`);
  }

  /**
   * Handle shipping.carrier.label.
   * Placeholder — no real carrier adapter exists yet.
   */
  private async handleLabel(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    this.logger.log(`Carrier label requested for shipment ${shipmentId} — no adapter yet.`);
  }

  /**
   * Handle shipping.carrier.track.
   * Placeholder — no real carrier adapter exists yet.
   */
  private async handleTrack(event: any): Promise<void> {
    const shipmentId = event.aggregateId;
    this.logger.log(`Carrier tracking poll for shipment ${shipmentId} — no adapter yet.`);
  }

  // ── Failure handling ────────────────────────────────────────────────────

  /**
   * Handle a processing failure with exponential backoff.
   */
  private async handleFailure(eventId: string, event: any, err: any): Promise<void> {
    const attempts = (event.attempts || 0) + 1;
    const isFinal = attempts >= ShippingCarrierWorker.MAX_ATTEMPTS;

    const nextAttemptAt = isFinal
      ? null
      : ShippingCarrierWorker.calculateBackoffDate(attempts);

    await this.db.db
      .update(outboxEvents)
      .set({
        status: isFinal ? 'FAILED' : 'PENDING',
        attempts,
        lastError: err?.message || 'Unknown error',
        nextAttemptAt,
      })
      .where(eq(outboxEvents.id, eventId));

    this.logger.error(
      `Carrier event ${event.eventType} failed (attempt ${attempts}/${ShippingCarrierWorker.MAX_ATTEMPTS}): ${err?.message}`,
    );
  }
}
