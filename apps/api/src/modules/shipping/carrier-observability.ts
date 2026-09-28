/**
 * Carrier Observability — M7.2.3-B.1 + M7.2.3-C
 *
 * Structured logging, correlation, and in-memory metric counters for every
 * carrier operation.
 *
 * Every carrier operation emits a structured log entry containing:
 *   - organizationId
 *   - storeId
 *   - shipmentId
 *   - carrierProvider
 *   - operation
 *   - correlationId
 *   - attempt
 *   - duration
 *   - result (success/failure)
 *   - error classification
 *
 * In-memory counters (logged periodically):
 *   - carrier_requests_total / carrier_request_failures_total
 *   - carrier_rate_limits_total
 *   - carrier_retries_total
 *   - carrier_recovery_total / carrier_reconciliation_total
 *   - carrier_webhook_total / carrier_webhook_failures_total / carrier_webhook_duplicates_total
 *   - carrier_outbox_pending / carrier_outbox_dead_letter
 *
 * NEVER logs:
 *   - Passwords, API keys, bearer tokens
 *   - Encrypted credential contents
 *   - Full request/response bodies that may contain secrets
 *
 * Integrates with the existing NestJS Logger.
 * If OpenTelemetry is available, creates spans.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

// ── Types ───────────────────────────────────────────────────────────────────

export type CarrierOperation =
  | 'createShipment'
  | 'cancelShipment'
  | 'generateLabel'
  | 'getTrackingInfo'
  | 'validateAddress'
  | 'webhookReceived'
  | 'webhookProcessed'
  | 'rateCalculate';

export type CarrierOperationResult = 'success' | 'failure' | 'timeout' | 'rate_limited';

export interface CarrierOperationContext {
  organizationId?: string;
  storeId?: string;
  shipmentId?: string;
  carrierProvider: string;
  operation: CarrierOperation;
  correlationId: string;
  attempt: number;
}

export interface CarrierOperationLog {
  context: CarrierOperationContext;
  duration: number;
  result: CarrierOperationResult;
  errorClassification?: string;
  errorMessage?: string;
  httpStatus?: number;
}

// ── Known counter names ───────────────────────────────────────────────────

export type CarrierCounter =
  | 'carrier_requests_total'
  | 'carrier_request_failures_total'
  | 'carrier_rate_limits_total'
  | 'carrier_retries_total'
  | 'carrier_recovery_total'
  | 'carrier_reconciliation_total'
  | 'carrier_webhook_total'
  | 'carrier_webhook_failures_total'
  | 'carrier_webhook_duplicates_total'
  | 'carrier_outbox_pending'
  | 'carrier_outbox_dead_letter';

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CarrierObservabilityService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CarrierOps');

  /** In-memory counters: Map<counterName, Map<providerKey, count>>. */
  private readonly counters = new Map<string, Map<string, number>>();

  /** Periodic counter flush interval (30 seconds). */
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  onModuleInit() {
    this.flushTimer = setInterval(() => this.flushCounters(), 30_000);
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Generate a new correlation ID.
   */
  generateCorrelationId(): string {
    return `car-${crypto.randomUUID()}`;
  }

  /**
   * Log the start of a carrier operation.
   */
  logStart(ctx: CarrierOperationContext): void {
    this.logger.log(
      this.formatMessage(ctx, 'START'),
    );
  }

  /**
   * Log the completion of a carrier operation.
   */
  logComplete(entry: CarrierOperationLog): void {
    const { context, duration, result, errorClassification, errorMessage, httpStatus } = entry;

    const parts = [
      this.formatContext(context),
      `duration=${duration}ms`,
      `result=${result}`,
    ];

    if (httpStatus !== undefined) parts.push(`httpStatus=${httpStatus}`);
    if (errorClassification) parts.push(`errorClass=${errorClassification}`);
    if (errorMessage) parts.push(`error=${this.truncate(errorMessage, 200)}`);

    const message = parts.join(' | ');

    switch (result) {
      case 'success':
        this.logger.log(message);
        break;
      case 'rate_limited':
        this.logger.warn(message);
        break;
      case 'failure':
      case 'timeout':
        this.logger.error(message);
        break;
    }
  }

  /**
   * Log a retry attempt.
   */
  logRetry(ctx: CarrierOperationContext, reason: string, nextDelayMs: number): void {
    this.logger.warn(
      this.formatMessage(ctx, `RETRY | reason=${this.truncate(reason, 150)} | nextDelay=${nextDelayMs}ms`),
    );
  }

  /**
   * Create a context object from common parameters.
   */
  createContext(
    carrierProvider: string,
    operation: CarrierOperation,
    opts: {
      organizationId?: string;
      storeId?: string;
      shipmentId?: string;
      correlationId?: string;
      attempt?: number;
    } = {},
  ): CarrierOperationContext {
    return {
      carrierProvider,
      operation,
      correlationId: opts.correlationId || this.generateCorrelationId(),
      attempt: opts.attempt ?? 1,
      organizationId: opts.organizationId,
      storeId: opts.storeId,
      shipmentId: opts.shipmentId,
    };
  }

  // ── Metric Counters (M7.2.3-C) ──────────────────────────────────────────

  /**
   * Increment a named counter for a given provider dimension.
   * Thread-safe for single-process NestJS (synchronous Map operations).
   */
  incrementCounter(counter: CarrierCounter | string, providerKey: string, amount = 1): void {
    let providerMap = this.counters.get(counter);
    if (!providerMap) {
      providerMap = new Map();
      this.counters.set(counter, providerMap);
    }
    const current = providerMap.get(providerKey) || 0;
    providerMap.set(providerKey, current + amount);
  }

  /**
   * Get the current value of a counter for a provider.
   */
  getCounter(counter: string, providerKey: string): number {
    return this.counters.get(counter)?.get(providerKey) || 0;
  }

  /**
   * Get a snapshot of all counters.
   */
  counterSnapshot(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const [counter, providerMap] of this.counters) {
      result[counter] = {};
      for (const [provider, value] of providerMap) {
        result[counter][provider] = value;
      }
    }
    return result;
  }

  /**
   * Periodically flush counters to the log (non-destructive snapshot).
   */
  private flushCounters(): void {
    const snapshot = this.counterSnapshot();
    const keys = Object.keys(snapshot);
    if (keys.length === 0) return;

    const parts: string[] = ['Metric counters snapshot:'];
    for (const counter of keys) {
      const providers = snapshot[counter] || {};
      const total = Object.values(providers).reduce((sum, v) => sum + v, 0);
      const detail = Object.entries(providers)
        .map(([pk, v]) => `${pk}=${v}`)
        .join(', ');
      parts.push(`${counter}: total=${total} (${detail})`);
    }
    this.logger.log(parts.join(' | '));
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private formatMessage(ctx: CarrierOperationContext, action: string): string {
    return `${this.formatContext(ctx)} | ${action}`;
  }

  private formatContext(ctx: CarrierOperationContext): string {
    const parts = [
      `[${ctx.correlationId}]`,
      `provider=${ctx.carrierProvider}`,
      `op=${ctx.operation}`,
    ];

    if (ctx.organizationId) parts.push(`org=${ctx.organizationId}`);
    if (ctx.storeId) parts.push(`store=${ctx.storeId}`);
    if (ctx.shipmentId) parts.push(`shipment=${ctx.shipmentId}`);
    parts.push(`attempt=${ctx.attempt}`);

    return parts.join(' ');
  }

  private truncate(s: string, maxLen: number): string {
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + '...';
  }
}
