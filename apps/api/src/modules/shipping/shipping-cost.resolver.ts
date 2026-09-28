/**
 * Shipping cost resolver — pure, side-effect-free calculation.
 *
 * Determines the authoritative shipping fee for a given store, method,
 * subtotal and delivery address.  All amounts are integer minor units.
 *
 * Rules (evaluated in order):
 *   1. If subtotal < minOrderMinor → UNAVAILABLE
 *   2. If freeAboveMinor is set AND subtotal >= freeAboveMinor → fee = 0
 *   3. Otherwise → fee = baseFeeMinor
 */

export interface ShippingCostInput {
  /** Sub-order subtotal in minor units (goods after discount). */
  subtotalMinor: number;
  /** Base fee configured by the merchant. */
  baseFeeMinor: number;
  /** Minimum order subtotal for this method to be available (null = no minimum). */
  minOrderMinor: number | null;
  /** Free shipping threshold (null = never free). */
  freeAboveMinor: number | null;
}

export type ShippingCostStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'FREE';

export interface ShippingCostResult {
  status: ShippingCostStatus;
  feeMinor: number;
  reason?: string;
}

/**
 * Resolve the shipping cost for a single sub-order.
 *
 * Invariants:
 *  - Every output is a non-negative integer (minor units).
 *  - No floating-point arithmetic.
 *  - Pure function — no DB, no env, no side effects.
 */
export function resolveShippingCost(input: ShippingCostInput): ShippingCostResult {
  const { subtotalMinor, baseFeeMinor, minOrderMinor, freeAboveMinor } = input;

  // Rule 1: minimum order not met
  if (minOrderMinor != null && subtotalMinor < minOrderMinor) {
    return {
      status: 'UNAVAILABLE',
      feeMinor: 0,
      reason: `Minimum order subtotal ${minOrderMinor} not met (current: ${subtotalMinor})`,
    };
  }

  // Rule 2: free shipping threshold met
  if (freeAboveMinor != null && subtotalMinor >= freeAboveMinor) {
    return { status: 'FREE', feeMinor: 0 };
  }

  // Rule 3: base fee
  const fee = Math.max(0, Math.round(baseFeeMinor));
  return { status: 'AVAILABLE', feeMinor: fee };
}

// ── Zone Matching ───────────────────────────────────────────────────────────

export interface ZoneMatchInput {
  /** Address city (buyer-supplied). */
  city?: string;
  /** Address postal code (buyer-supplied). */
  postalCode?: string;
  /** Address country (buyer-supplied). */
  country?: string;
}

export interface DeliveryZoneRow {
  id: string;
  storeId: string;
  name: string;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  isActive: boolean;
}

/**
 * Match a buyer address against active delivery zones for a store.
 *
 * Precedence (most specific wins):
 *   1. Exact postal code match
 *   2. City + country match
 *   3. Region + country match
 *   4. Country-only match
 *
 * Returns the best-matching zone or null if no zone matches.
 * Does NOT perform fuzzy matching — all comparisons are exact (case-insensitive).
 */
export function matchDeliveryZone(
  zones: DeliveryZoneRow[],
  address: ZoneMatchInput,
): DeliveryZoneRow | null {
  const activeZones = zones.filter(z => z.isActive);
  if (activeZones.length === 0) return null;

  const addrCity = (address.city || '').trim().toLowerCase();
  const addrPostal = (address.postalCode || '').trim().toLowerCase();
  const addrCountry = (address.country || '').trim().toUpperCase();

  // Priority 1: exact postal code match
  if (addrPostal) {
    const postalMatch = activeZones.find(
      z => z.postalCode && z.postalCode.toLowerCase() === addrPostal,
    );
    if (postalMatch) return postalMatch;
  }

  // Priority 2: city + country match
  if (addrCity && addrCountry) {
    const cityMatch = activeZones.find(
      z => z.city && z.country === addrCountry
        && z.city.toLowerCase() === addrCity,
    );
    if (cityMatch) return cityMatch;
  }

  // Priority 3: region + country match
  if (address.country) {
    const addrRegion = ''; // Region not typically in buyer address yet
    const regionMatch = activeZones.find(
      z => z.region && z.country === addrCountry
        && z.region.toLowerCase() === addrRegion,
    );
    if (regionMatch) return regionMatch;
  }

  // Priority 4: country-only match
  if (addrCountry) {
    const countryMatch = activeZones.find(
      z => !z.city && !z.postalCode && z.country === addrCountry,
    );
    if (countryMatch) return countryMatch;
  }

  return null;
}
