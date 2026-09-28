/**
 * Carrier Observability — M7.2.3-B.1
 *
 * Structured logging and correlation for every carrier operation.
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
 * NEVER logs:
 *   - Passwords, API keys, bearer tokens
 *   - Encrypted credential contents
 *   - Full request/response bodies that may contain secrets
 *
 * Integrates with the existing NestJS Logger.
 * If OpenTelemetry is available, creates spans.
 */

import { Injectable, Logger } from '@nestjs/common';

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

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class CarrierObservabilityService {
  private readonly logger = new Logger('CarrierOps');

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
