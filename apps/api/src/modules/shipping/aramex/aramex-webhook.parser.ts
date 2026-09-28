/**
 * Aramex Webhook Parser — M7.2.3-B.2
 *
 * Parses Aramex-specific webhook payloads and maps them to SCS events.
 *
 * SECURITY:
 *   - NEVER trusts organization/store IDs from the webhook payload.
 *   - Tenant resolution follows the authoritative chain:
 *     webhook → credential → carrier shipment → shipment → store → org.
 *   - The existing CarrierWebhookController handles HMAC verification,
 *     timestamp validation, replay protection, deduplication, and rate limiting.
 *
 * STATUS:
 *   The exact Aramex webhook payload structure is UNVERIFIED — it requires
 *   an Aramex account setup to receive a real webhook sample.
 *   This parser is based on the Aramex Webhook API Specification (S4)
 *   and corroborating third-party guides (S8).
 *
 *   Until confirmed with a real sandbox webhook, webhook parsing is
 *   classified as UNVERIFIED — MOCK/CONTRACT.
 */

import { mapAramexStatus } from './aramex-status.mapper';
import type { AramexWebhookPayload } from './aramex.types';
import type { CarrierStatusMapping } from '../shipping.types';

// ── Parsed Webhook Event ────────────────────────────────────────────────────

/**
 * Structured result from parsing an Aramex webhook payload.
 */
export interface AramexParsedWebhookEvent {
  /** Aramex waybill number (used for tenant resolution). */
  waybillNumber: string | null;
  /** Raw Aramex update code (e.g. SH001, SH003). */
  updateCode: string | null;
  /** Mapped SCS status. */
  statusMapping: CarrierStatusMapping | null;
  /** ISO datetime of the update. */
  updateDateTime: string | null;
  /** Location of the update. */
  updateLocation: string | null;
  /** Additional comments from Aramex. */
  comments: string | null;
  /** Problem code if applicable. */
  problemCode: string | null;
  /** Classification of this webhook event. */
  classification: 'VERIFIED' | 'UNVERIFIED';
}

// ── Parser ──────────────────────────────────────────────────────────────────

/**
 * Parse an Aramex webhook payload into a structured event.
 *
 * @param payload  The raw JSON payload (already verified by HMAC).
 * @returns Parsed event with status mapping.
 */
export function parseAramexWebhookPayload(
  payload: Record<string, unknown>,
): AramexParsedWebhookEvent {
  const aramexPayload = payload as unknown as AramexWebhookPayload;

  // Extract waybill number — try multiple field names
  const waybillNumber = extractWaybillNumber(payload);

  // Extract update code
  const updateCode = typeof aramexPayload.UpdateCode === 'string'
    ? aramexPayload.UpdateCode
    : null;

  // Extract update description
  const updateDescription = typeof aramexPayload.UpdateDescription === 'string'
    ? aramexPayload.UpdateDescription
    : undefined;

  // Map status
  const statusMapping = updateCode
    ? mapAramexStatus(updateCode, updateDescription)
    : null;

  return {
    waybillNumber,
    updateCode,
    statusMapping,
    updateDateTime: typeof aramexPayload.UpdateDateTime === 'string'
      ? aramexPayload.UpdateDateTime
      : null,
    updateLocation: typeof aramexPayload.UpdateLocation === 'string'
      ? aramexPayload.UpdateLocation
      : null,
    comments: typeof aramexPayload.Comments === 'string'
      ? aramexPayload.Comments
      : null,
    problemCode: typeof aramexPayload.ProblemCode === 'string' && aramexPayload.ProblemCode
      ? aramexPayload.ProblemCode
      : null,
    // UNVERIFIED until confirmed with real Aramex sandbox webhook
    classification: 'UNVERIFIED',
  };
}

/**
 * Extract the waybill number from an Aramex webhook payload.
 * Tries multiple field names to be resilient to payload variations.
 */
function extractWaybillNumber(payload: Record<string, unknown>): string | null {
  // Direct PascalCase (Aramex native)
  if (typeof payload['WaybillNumber'] === 'string' && payload['WaybillNumber'].length > 0) {
    return payload['WaybillNumber'] as string;
  }

  // camelCase variant
  if (typeof payload['waybillNumber'] === 'string' && payload['waybillNumber'].length > 0) {
    return payload['waybillNumber'] as string;
  }

  // Common aliases
  const aliases = [
    'ShipmentNumber', 'TrackingNumber', 'AWB',
    'shipment_number', 'tracking_number', 'awb',
  ];
  for (const key of aliases) {
    if (typeof payload[key] === 'string' && (payload[key] as string).length > 0) {
      return payload[key] as string;
    }
  }

  // Nested in data object
  const data = payload['data'] as Record<string, unknown> | undefined;
  if (data && typeof data === 'object') {
    for (const key of ['WaybillNumber', 'waybillNumber', 'ShipmentNumber', 'TrackingNumber']) {
      if (typeof data[key] === 'string' && (data[key] as string).length > 0) {
        return data[key] as string;
      }
    }
  }

  return null;
}

/**
 * Generate a deterministic external delivery ID from an Aramex webhook payload.
 * Used by the CarrierWebhookController for deduplication.
 */
export function extractAramexDeliveryId(payload: Record<string, unknown>): string | null {
  return extractWaybillNumber(payload);
}
