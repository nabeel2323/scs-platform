import {
  Controller, Post, Param, Req, Res, HttpCode,
  HttpStatus, Logger, UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { WebhookSecurityService } from './webhook-security.service';
import { CarrierCredentialsService } from './carrier-credentials.service';
import { carrierWebhookEvents, carrierCredentials } from './shipping.schema';
import { shipments } from '../orders/shipment.schema';

/**
 * CarrierWebhookController — inbound carrier webhook endpoint.
 *
 * Routes:
 *   POST /v1/webhooks/carrier/:providerKey                — legacy (single-org safe)
 *   POST /v1/webhooks/carrier/:providerKey/:webhookToken  — multi-org safe (B1.7)
 *
 * SECURITY MODEL:
 *   - This endpoint does NOT use JWT authentication.
 *   - Instead, it uses HMAC-SHA256 signature verification.
 *   - The webhook secret is stored encrypted and decrypted only for verification.
 *   - Tenant resolution follows: webhook → carrier shipment ref → SCS shipment → store → org.
 *   - The webhook payload's storeId/orgId/orderId are NEVER trusted.
 *
 * MULTI-ORG ROUTING (B1.7):
 *   - The :webhookToken route uniquely identifies a credential row (and thus an org).
 *   - Different organizations using the same provider get different tokens.
 *   - Cross-tenant webhook delivery is impossible because the token routes to
 *     exactly one credential configuration.
 *   - The legacy :providerKey-only route remains for backward compatibility
 *     but is only safe when a single org uses each provider.
 *
 * DEDUPLICATION:
 *   - Atomic insert into carrier_webhook_events with UNIQUE(provider_key, external_delivery_id).
 *   - Duplicate deliveries return 200 OK (idempotent) without reprocessing.
 *
 * RESPONSE BEHAVIOUR:
 *   - 401: missing or malformed signature header.
 *   - 403: signature mismatch or stale timestamp.
 *   - 413: request body too large.
 *   - 429: rate limit exceeded.
 *   - 200: valid event (including duplicates).
 *   - 500: unexpected internal error.
 *
 * RATE LIMITING:
 *   - Endpoint-specific throttling via @nestjs/throttler named 'webhook' throttler.
 *   - Default: 30 requests per 60 seconds per IP.
 *   - Configurable via WEBHOOK_THROTTLE_TTL_MS and WEBHOOK_THROTTLE_LIMIT env vars.
 *   - Rate limiting fires BEFORE HMAC verification to prevent brute-force attacks.
 */
@Controller('v1/webhooks/carrier')
export class CarrierWebhookController {
  private readonly logger = new Logger(CarrierWebhookController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly security: WebhookSecurityService,
    private readonly credentials: CarrierCredentialsService,
  ) {}

  @Post(':providerKey')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ webhook: {} }) // Uses module-level env-configurable values (WEBHOOK_THROTTLE_TTL_MS / WEBHOOK_THROTTLE_LIMIT)
  async handleWebhook(
    @Param('providerKey') providerKey: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.processWebhook(providerKey, null, req, res);
  }

  /**
   * M7.2.3-B.1: Token-based webhook route for multi-org safety.
   *
   * The webhookToken uniquely identifies a credential row (and thus an org),
   * preventing cross-tenant webhook delivery when multiple orgs use the same provider.
   */
  @Post(':providerKey/:webhookToken')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ webhook: {} })
  async handleWebhookWithToken(
    @Param('providerKey') providerKey: string,
    @Param('webhookToken') webhookToken: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.processWebhook(providerKey, webhookToken, req, res);
  }

  /**
   * Shared webhook processing logic.
   */
  private async processWebhook(
    providerKey: string,
    webhookToken: string | null,
    req: Request,
    res: Response,
  ) {
    // 1. Validate body size
    const rawBody = (req as any).rawBody as string | undefined;
    if (!rawBody) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Missing raw request body',
      });
    }

    const sizeCheck = this.security.validateBodySize(rawBody);
    if (!sizeCheck.valid) {
      return res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        error: sizeCheck.reason,
      });
    }

    // 2. Extract signature headers
    const signature = req.headers['x-carrier-signature'] as string
      || req.headers['x-webhook-signature'] as string;
    const timestamp = req.headers['x-carrier-timestamp'] as string
      || req.headers['x-webhook-timestamp'] as string;

    if (!signature) {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'Missing webhook signature header',
      });
    }

    // 3. Find the active credential for this provider
    //    If webhookToken is provided (B1.7), use it for exact tenant routing.
    //    Otherwise fall back to provider-key-only lookup (legacy single-org).
    const credential = webhookToken
      ? await this.db.db.query.carrierCredentials.findFirst({
          where: and(
            eq(carrierCredentials.providerKey, providerKey),
            eq(carrierCredentials.webhookToken, webhookToken),
            eq(carrierCredentials.isActive, true),
          ),
        })
      : await this.db.db.query.carrierCredentials.findFirst({
          where: and(
            eq(carrierCredentials.providerKey, providerKey),
            eq(carrierCredentials.isActive, true),
          ),
        });

    if (!credential) {
      this.logger.warn(`Webhook received for unknown provider: ${providerKey}`);
      return res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'Unknown carrier provider',
      });
    }

    // 4. Decrypt webhook secret
    const webhookSecret = await this.credentials.decryptWebhookSecret(credential.id);
    if (!webhookSecret) {
      this.logger.warn(`No webhook secret configured for provider: ${providerKey}`);
      return res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'No webhook secret configured for this provider',
      });
    }

    // 5. Verify signature
    const verification = this.security.verifySignature(rawBody, signature, webhookSecret, timestamp);
    if (!verification.valid) {
      this.logger.warn(
        `Webhook signature verification failed for ${providerKey}: ${verification.reason}`,
      );
      return res.status(HttpStatus.FORBIDDEN).json({
        error: verification.reason,
      });
    }

    // 6. Parse payload
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Invalid JSON payload',
      });
    }

    // 7. Extract external delivery ID (provider-independent)
    const externalDeliveryId = this.extractExternalDeliveryId(payload);
    if (!externalDeliveryId) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Could not extract external delivery ID from payload',
      });
    }

    // 8. Deduplication — atomic insert
    const webhookEventId = crypto.randomUUID();
    try {
      await this.db.db.insert(carrierWebhookEvents).values({
        id: webhookEventId,
        providerKey,
        eventType: (payload['event_type'] as string) || (payload['event'] as string) || 'unknown',
        externalDeliveryId,
        shipmentId: null, // resolved below
        payload,
        processed: false,
        signatureValid: true,
        rawBody,
      });
    } catch (err: any) {
      if (err?.code === '23505') {
        // Duplicate — return idempotent 200
        this.logger.log(`Duplicate webhook from ${providerKey}: ${externalDeliveryId}`);
        return res.status(HttpStatus.OK).json({
          received: true,
          duplicate: true,
        });
      }
      throw err;
    }

    // 9. Resolve tenant: carrier shipment reference → SCS shipment → store → org
    //    NEVER trust storeId/orgId from the webhook payload.
    const shipment = await this.db.db.query.shipments.findFirst({
      where: and(
        eq(shipments.carrierShipmentId, externalDeliveryId),
      ),
    });

    if (shipment) {
      // Link the webhook event to the shipment
      await this.db.db.update(carrierWebhookEvents)
        .set({ shipmentId: shipment.id })
        .where(eq(carrierWebhookEvents.id, webhookEventId));

      this.logger.log(
        `Webhook from ${providerKey} linked to shipment ${shipment.id} ` +
        `(store: ${shipment.storeId})`,
      );
    } else {
      this.logger.warn(
        `Webhook from ${providerKey}: no shipment found for carrier ID ${externalDeliveryId}`,
      );
    }

    // 10. Mark as processed
    await this.db.db.update(carrierWebhookEvents)
      .set({ processed: true, processedAt: new Date() })
      .where(eq(carrierWebhookEvents.id, webhookEventId));

    return res.status(HttpStatus.OK).json({
      received: true,
      duplicate: false,
    });
  }

  /**
   * Extract the external delivery ID from a webhook payload.
   * Provider-independent — looks for common field names.
   */
  private extractExternalDeliveryId(payload: Record<string, unknown>): string | null {
    const candidates = [
      'shipment_id', 'tracking_number', 'awb', 'carrier_shipment_id',
      'delivery_id', 'consignment_id', 'external_delivery_id',
    ];

    for (const key of candidates) {
      const value = payload[key];
      if (typeof value === 'string' && value.length > 0) return value;
    }

    // Check nested data/shipment objects
    const data = payload['data'] as Record<string, unknown> | undefined;
    if (data && typeof data === 'object') {
      for (const key of candidates) {
        const value = data[key];
        if (typeof value === 'string' && value.length > 0) return value;
      }
    }

    return null;
  }
}
