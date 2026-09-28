/**
 * Carrier Endpoints — M7.2.3-B.1
 *
 * Multi-service endpoint model for carriers that expose separate URLs
 * for different operations (shipping, tracking, rating, location).
 *
 * Design:
 *   - Some carriers (e.g. Aramex) have 4 independent services on separate hosts.
 *   - Other carriers may have a single base URL for all operations.
 *   - The model supports both patterns.
 *   - Endpoints are stored as a JSON blob inside the carrier credential's
 *     encrypted credential JSON, NOT as separate database columns.
 *   - The existing `endpointUrl` column on carrier_credentials serves as
 *     the primary/shipping endpoint for backward compatibility.
 *
 * Storage:
 *   The encrypted credential JSON blob may contain an `endpoints` key:
 *   {
 *     "apiKey": "...",
 *     "accountNumber": "...",
 *     "endpoints": {
 *       "shipping": "https://ws.aramex.net/...",
 *       "tracking": "https://ws.aramex.net/...",
 *       "rating":   "https://ws.aramex.net/...",
 *       "location": "https://ws.aramex.net/..."
 *     }
 *   }
 *
 * Resolution:
 *   resolveEndpoint() falls back to the primary endpointUrl if no
 *   service-specific endpoint is configured.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Carrier service types.
 * Each carrier may expose one or more of these as separate endpoints.
 */
export type CarrierServiceType = 'shipping' | 'tracking' | 'rating' | 'location';

/** All known service types. */
export const ALL_CARRIER_SERVICES: readonly CarrierServiceType[] = [
  'shipping',
  'tracking',
  'rating',
  'location',
] as const;

/**
 * Per-service endpoint URLs.
 * All fields are optional — missing services fall back to the primary endpoint.
 */
export interface CarrierEndpoints {
  shipping?: string;
  tracking?: string;
  rating?: string;
  location?: string;
}

/**
 * Parsed credential blob that may include multi-service endpoints.
 * This is the structure stored (encrypted) in carrier_credentials.credentials_encrypted.
 */
export interface CarrierCredentialPayload {
  /** Provider-specific credential fields (API keys, account numbers, etc.) */
  [key: string]: unknown;
  /** Optional multi-service endpoint URLs. */
  endpoints?: CarrierEndpoints;
}

// ── Resolution ──────────────────────────────────────────────────────────────

/**
 * Resolve the endpoint URL for a specific carrier service.
 *
 * Resolution order:
 *   1. Service-specific endpoint from the credential payload's `endpoints` map.
 *   2. The primary `endpointUrl` from the carrier_credentials row.
 *   3. null (no endpoint configured).
 *
 * @param service       The service type to resolve.
 * @param payload       Decrypted credential payload (may contain `endpoints`).
 * @param primaryUrl    The primary endpoint URL from carrier_credentials.endpoint_url.
 */
export function resolveCarrierEndpoint(
  service: CarrierServiceType,
  payload: CarrierCredentialPayload,
  primaryUrl: string | null,
): string | null {
  // 1. Service-specific endpoint
  const serviceUrl = payload.endpoints?.[service];
  if (serviceUrl && typeof serviceUrl === 'string' && serviceUrl.length > 0) {
    return serviceUrl;
  }

  // 2. Primary endpoint URL
  if (primaryUrl && primaryUrl.length > 0) {
    return primaryUrl;
  }

  // 3. No endpoint available
  return null;
}

/**
 * Extract the endpoints map from a decrypted credential payload.
 * Returns an empty object if no endpoints are configured.
 */
export function extractEndpoints(payload: CarrierCredentialPayload): CarrierEndpoints {
  if (!payload.endpoints || typeof payload.endpoints !== 'object') {
    return {};
  }

  const result: CarrierEndpoints = {};
  for (const service of ALL_CARRIER_SERVICES) {
    const url = payload.endpoints[service];
    if (typeof url === 'string' && url.length > 0) {
      result[service] = url;
    }
  }
  return result;
}

/**
 * Validate that all endpoint URLs in a payload are well-formed.
 * Returns an array of validation errors (empty if all valid).
 */
export function validateEndpoints(endpoints: CarrierEndpoints): string[] {
  const errors: string[] = [];

  for (const [service, url] of Object.entries(endpoints)) {
    if (url === undefined || url === null) continue;
    if (typeof url !== 'string') {
      errors.push(`${service}: endpoint must be a string`);
      continue;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        errors.push(`${service}: invalid protocol '${parsed.protocol}'`);
      }
      if (!parsed.hostname) {
        errors.push(`${service}: missing hostname`);
      }
    } catch {
      errors.push(`${service}: invalid URL '${url}'`);
    }
  }

  return errors;
}
