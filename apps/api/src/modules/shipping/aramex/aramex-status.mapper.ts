/**
 * Aramex Status Mapper — M7.2.3-B.2
 *
 * Maps Aramex tracking update codes to SCS internal shipment statuses.
 *
 * Three-tier fallback:
 *   1. Known code map (explicit mapping)
 *   2. Description keyword fallback (heuristic)
 *   3. UNKNOWN (preserve raw code + description)
 *
 * IMPORTANT:
 *   - Unknown status codes MUST NOT break processing.
 *   - Raw codes and descriptions are always preserved.
 *   - Aramex tracking codes vary by region and are not fully published.
 *
 * Classification: VERIFIED — official Aramex documentation (S1, S5).
 */

import type { CarrierStatusMapping } from '../shipping.types';

// ── Known Code Map ──────────────────────────────────────────────────────────

/**
 * Explicit mapping from Aramex update codes to SCS internal statuses.
 *
 * Classification: VERIFIED — official Aramex documentation.
 */
const KNOWN_STATUS_MAP: ReadonlyMap<string, { internalStatus: string; description: string }> = new Map([
  ['SH001', { internalStatus: 'PICKED_UP', description: 'Picked up from shipper' }],
  ['SH002', { internalStatus: 'IN_TRANSIT', description: 'Arrived at facility' }],
  ['SH003', { internalStatus: 'OUT_FOR_DELIVERY', description: 'Out for delivery' }],
  ['SH004', { internalStatus: 'DELIVERED', description: 'Delivered' }],
  ['SH005', { internalStatus: 'DELIVERED', description: 'Delivered (alternate)' }],
  ['SH006', { internalStatus: 'RETURN_TO_ORIGIN', description: 'Return to origin' }],
  ['SH007', { internalStatus: 'HELD_AT_FACILITY', description: 'Held at facility' }],
  ['SH008', { internalStatus: 'CUSTOMS_CLEARANCE', description: 'Customs clearance' }],
  ['SH009', { internalStatus: 'DELAYED', description: 'Delayed' }],
  ['SH010', { internalStatus: 'LOST', description: 'Lost' }],
  ['SH011', { internalStatus: 'DAMAGED', description: 'Damaged' }],
  ['SH012', { internalStatus: 'CANCELLED', description: 'Cancelled' }],
  ['SH013', { internalStatus: 'REJECTED', description: 'Rejected by consignee' }],
  ['SH014', { internalStatus: 'RECORD_CREATED', description: 'Record created' }],
  ['SH160', { internalStatus: 'PROCESSING_AT_FACILITY', description: 'Under processing at facility' }],
]);

// ── Description Keyword Fallback ────────────────────────────────────────────

/**
 * Keyword → status mapping for heuristic fallback.
 * If the Aramex description contains one of these keywords (case-insensitive),
 * the corresponding internal status is used.
 */
const DESCRIPTION_KEYWORDS: ReadonlyArray<{ keyword: string; internalStatus: string }> = [
  { keyword: 'delivered', internalStatus: 'DELIVERED' },
  { keyword: 'picked up', internalStatus: 'PICKED_UP' },
  { keyword: 'out for delivery', internalStatus: 'OUT_FOR_DELIVERY' },
  { keyword: 'in transit', internalStatus: 'IN_TRANSIT' },
  { keyword: 'arrived', internalStatus: 'IN_TRANSIT' },
  { keyword: 'customs', internalStatus: 'CUSTOMS_CLEARANCE' },
  { keyword: 'returned', internalStatus: 'RETURN_TO_ORIGIN' },
  { keyword: 'held', internalStatus: 'HELD_AT_FACILITY' },
  { keyword: 'delayed', internalStatus: 'DELAYED' },
  { keyword: 'lost', internalStatus: 'LOST' },
  { keyword: 'damaged', internalStatus: 'DAMAGED' },
  { keyword: 'cancel', internalStatus: 'CANCELLED' },
  { keyword: 'rejected', internalStatus: 'REJECTED' },
  { keyword: 'created', internalStatus: 'RECORD_CREATED' },
  { keyword: 'processing', internalStatus: 'PROCESSING_AT_FACILITY' },
];

// ── Mapper ──────────────────────────────────────────────────────────────────

/**
 * Map an Aramex tracking update code to an SCS CarrierStatusMapping.
 *
 * @param carrierStatus  The raw Aramex UpdateCode (e.g. 'SH001').
 * @param description    Optional UpdateDescription for fallback mapping.
 * @returns CarrierStatusMapping with internalStatus, carrierStatus, description.
 *          Never returns null — unknown codes map to UNKNOWN.
 */
export function mapAramexStatus(
  carrierStatus: string,
  description?: string,
): CarrierStatusMapping {
  // Tier 1: Known code map
  const known = KNOWN_STATUS_MAP.get(carrierStatus);
  if (known) {
    return {
      internalStatus: known.internalStatus,
      carrierStatus,
      description: description || known.description,
    };
  }

  // Tier 2: Description keyword fallback
  if (description) {
    const lowerDesc = description.toLowerCase();
    for (const { keyword, internalStatus } of DESCRIPTION_KEYWORDS) {
      if (lowerDesc.includes(keyword)) {
        return {
          internalStatus,
          carrierStatus,
          description,
        };
      }
    }
  }

  // Tier 3: UNKNOWN — preserve raw code and description
  return {
    internalStatus: 'UNKNOWN',
    carrierStatus,
    description: description || `Unknown Aramex status: ${carrierStatus}`,
  };
}

/**
 * Check whether an Aramex status code is in the known map.
 */
export function isKnownAramexStatus(code: string): boolean {
  return KNOWN_STATUS_MAP.has(code);
}
