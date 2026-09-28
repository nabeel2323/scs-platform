/**
 * Aramex Constants — M7.2.3-B.2
 *
 * Provider-wide constants for the Aramex carrier adapter.
 *
 * Sources:
 *   - B.0.1 Aramex API Verification (verified against official docs)
 *   - Aramex Shipping API Manual (S1)
 *   - ShipFlow SDK (S5) — working implementation reference
 */

// ── Provider Identity ───────────────────────────────────────────────────────

/** Aramex provider key used in carrier_credentials and shipping_methods. */
export const ARAMEX_PROVIDER_KEY = 'aramex';

/** Human-readable provider name. */
export const ARAMEX_PROVIDER_NAME = 'Aramex';

// ── SSRF Allowlist ──────────────────────────────────────────────────────────

/**
 * Known Aramex hostnames.
 * Production: ws.aramex.net
 * Sandbox:    ws.dev.aramex.net
 *
 * These are registered with the SSRF allowlist so that endpoint URL
 * validation accepts them.
 */
export const ARAMEX_ALLOWED_HOSTS: readonly string[] = [
  'ws.aramex.net',
  'ws.dev.aramex.net',
] as const;

// ── ClientInfo Defaults ─────────────────────────────────────────────────────

/** Aramex API version — sent in every ClientInfo block. */
export const ARAMEX_DEFAULT_VERSION = '1.0';

/** Aramex source identifier — static value from verified implementations. */
export const ARAMEX_DEFAULT_SOURCE = 24;

// ── Product Types ───────────────────────────────────────────────────────────

/**
 * Known Aramex product types (from B.0.1 §14).
 *
 * This list is comprehensive but NOT exhaustive — account-specific
 * product types may exist. The adapter passes through any product type
 * without a local allowlist.
 *
 * Classification: VERIFIED — official Aramex documentation.
 */
export const ARAMEX_KNOWN_PRODUCT_TYPES: readonly string[] = [
  'OND', // Overnight Document (DOM)
  'CDS', // Domestic Service Outbound (DOM)
  'PPX', // Priority Parcel Express (EXP)
  'EPX', // Economy Parcel Express (EXP)
  'PDX', // Priority Document Express (EXP)
  'PLX', // Priority Letter Express (EXP)
  'DDX', // Deferred Document Express (EXP)
  'DPX', // Deferred Parcel Express (EXP)
  'GDX', // Ground Document Express (EXP/DOM)
  'GPX', // Ground Parcel Express (EXP/DOM)
] as const;

/** Product types that are domestic-only. */
export const ARAMEX_DOMESTIC_PRODUCT_TYPES: readonly string[] = [
  'OND',
  'CDS',
] as const;

// ── Payment Types ───────────────────────────────────────────────────────────

/** Aramex payment type codes. */
export const ARAMEX_PAYMENT_TYPES = {
  /** Prepaid — shipper pays. */
  PREPAID: 'P',
  /** Cash on delivery — consignee pays. */
  COD: 'C',
  /** Third party pays. */
  THIRD_PARTY: '3',
} as const;

// ── Label Configuration ─────────────────────────────────────────────────────

/**
 * Default label configuration for Aramex.
 * ReportID 9201 = standard shipping label.
 * ReportType URL = Aramex returns a temporary URL to the PDF.
 *
 * Classification: VERIFIED — official Aramex documentation (S1).
 */
export const ARAMEX_DEFAULT_LABEL_INFO = {
  ReportID: '9201',
  ReportType: 'URL',
} as const;

// ── COD Services ────────────────────────────────────────────────────────────

/**
 * Aramex service codes for COD shipments.
 * CODS = Cash on Delivery (standard).
 *
 * Classification: VERIFIED — official Aramex documentation.
 */
export const ARAMEX_COD_SERVICES = 'CODS' as const;

// ── Throttling Detection ────────────────────────────────────────────────────

/**
 * Notification codes/messages that indicate Aramex is throttling.
 * Aramex reports throttling inside its "fake 200" envelope, NOT as HTTP 429.
 *
 * Classification: VERIFIED — working implementation (S5).
 */
export const ARAMEX_THROTTLE_INDICATORS: readonly string[] = [
  'throttle',
  'rate limit',
  'rate_limit',
  'too many requests',
  'too_many_requests',
  'request limit',
  'quota exceeded',
] as const;

// ── Weight / Dimension Units ────────────────────────────────────────────────

/** Aramex weight unit — always kilograms. */
export const ARAMEX_WEIGHT_UNIT = 'KG' as const;

/** Aramex dimension unit — always centimetres. */
export const ARAMEX_DIMENSION_UNIT = 'CM' as const;

// ── HTTP Configuration ──────────────────────────────────────────────────────

/** Default request timeout for Aramex API calls (30 seconds). */
export const ARAMEX_TIMEOUT_MS = 30_000;

/** Maximum retries for transient errors (conservative — no blind retry on mutating ops). */
export const ARAMEX_MAX_RETRIES = 0;
