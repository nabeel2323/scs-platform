/**
 * SSRF Protection — M7.2.3-B.1
 *
 * Reusable URL validation for carrier endpoint configuration.
 * Prevents carrier workers from connecting to arbitrary internal/private addresses.
 *
 * Protection layers:
 *   1. Scheme validation (HTTPS required in production)
 *   2. Hostname format validation
 *   3. IP address resolution + private range blocking
 *   4. Provider-specific host allowlist
 *
 * Threats mitigated:
 *   - localhost / 127.0.0.0/8
 *   - ::1 (IPv6 loopback)
 *   - RFC1918 private IPv4 (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 *   - Link-local (169.254.0.0/16, fe80::/10)
 *   - Cloud metadata (169.254.169.254)
 *   - Internal DNS names resolving to private ranges
 *   - Unexpected schemes (file://, gopher://, etc.)
 *   - Non-HTTPS endpoints where HTTPS is required
 *
 * This module does NOT hard-code carrier-specific hosts.
 * Provider-specific allowlists are configured at registration time.
 */

import * as dns from 'node:dns';
import * as net from 'node:net';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SsrfValidationResult {
  valid: true;
  hostname: string;
  port: number;
  resolvedIp?: string;
}

export interface SsrfValidationFailure {
  valid: false;
  reason: string;
}

export type SsrfCheckResult = SsrfValidationResult | SsrfValidationFailure;

export interface CarrierEndpointAllowlist {
  /** Provider key (e.g. 'aramex'). */
  providerKey: string;
  /** Allowed hostnames (exact match, lowercase). */
  allowedHosts: string[];
  /** Whether HTTPS is required (default: true). */
  requireHttps?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** Allowed URL schemes. */
const ALLOWED_SCHEMES = new Set(['https:', 'http:']);

/** Default DNS resolution timeout (ms). */
const DNS_TIMEOUT_MS = 5_000;

// ── Private IP ranges ───────────────────────────────────────────────────────

interface IpRange {
  /** Network address as a 32-bit integer. */
  network: number;
  /** Mask as a 32-bit integer. */
  mask: number;
}

/**
 * Pre-computed private/reserved IPv4 ranges.
 * Each entry is { network, mask } where the check is:
 *   (ip & mask) === network
 */
const PRIVATE_IPV4_RANGES: IpRange[] = [
  // 0.0.0.0/8 — "This" network
  { network: 0x00000000, mask: 0xFF000000 },
  // 10.0.0.0/8 — RFC1918
  { network: 0x0A000000, mask: 0xFF000000 },
  // 100.64.0.0/10 — Carrier-grade NAT
  { network: 0x64400000, mask: 0xFFC00000 },
  // 127.0.0.0/8 — Loopback
  { network: 0x7F000000, mask: 0xFF000000 },
  // 169.254.0.0/16 — Link-local (includes cloud metadata 169.254.169.254)
  { network: 0xA9FE0000, mask: 0xFFFF0000 },
  // 172.16.0.0/12 — RFC1918
  { network: 0xAC100000, mask: 0xFFF00000 },
  // 192.0.0.0/24 — IETF Protocol Assignments
  { network: 0xC0000000, mask: 0xFFFFFF00 },
  // 192.0.2.0/24 — TEST-NET-1
  { network: 0xC0000200, mask: 0xFFFFFF00 },
  // 192.88.99.0/24 — 6to4 Relay Anycast
  { network: 0xC0586300, mask: 0xFFFFFF00 },
  // 192.168.0.0/16 — RFC1918
  { network: 0xC0A80000, mask: 0xFFFF0000 },
  // 198.18.0.0/15 — Network interconnect benchmark
  { network: 0xC6120000, mask: 0xFFFE0000 },
  // 198.51.100.0/24 — TEST-NET-2
  { network: 0xC6336400, mask: 0xFFFFFF00 },
  // 203.0.113.0/24 — TEST-NET-3
  { network: 0xCB007100, mask: 0xFFFFFF00 },
  // 224.0.0.0/4 — Multicast
  { network: 0xE0000000, mask: 0xF0000000 },
  // 240.0.0.0/4 — Reserved
  { network: 0xF0000000, mask: 0xF0000000 },
  // 255.255.255.255/32 — Broadcast
  { network: 0xFFFFFFFF, mask: 0xFFFFFFFF },
];

/**
 * Known cloud metadata hostnames.
 */
const METADATA_HOSTNAMES = new Set([
  'metadata.google.internal',
  'metadata.goog',
]);

/**
 * Hostnames that always resolve to loopback/private addresses.
 * Blocked regardless of DNS resolution.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

// ── IPv4 helpers ────────────────────────────────────────────────────────────

/**
 * Convert an IPv4 address string to a 32-bit unsigned integer.
 */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255 || String(n) !== part) return null;
    result = (result << 8) | n;
  }
  // Convert to unsigned 32-bit
  return result >>> 0;
}

/**
 * Check if an IPv4 address is in any private/reserved range.
 */
function isPrivateIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;

  return PRIVATE_IPV4_RANGES.some(
    (range) => ((ipInt & range.mask) >>> 0) === (range.network >>> 0),
  );
}

/**
 * Check if an IPv6 address is loopback, link-local, or unique-local.
 */
function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::1 — loopback
  if (lower === '::1' || lower === '0000:0000:0000:0000:0000:0000:0000:0001') {
    return true;
  }

  // :: — unspecified
  if (lower === '::' || lower === '0000:0000:0000:0000:0000:0000:0000:0000') {
    return true;
  }

  // fe80::/10 — link-local
  if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
      lower.startsWith('fea') || lower.startsWith('feb')) {
    return true;
  }

  // fc00::/7 — unique local address (ULA)
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }

  // ff00::/8 — multicast
  if (lower.startsWith('ff')) {
    return true;
  }

  // IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
  if (lower.startsWith('::ffff:')) {
    const mappedIpv4 = lower.slice(7);
    if (net.isIPv4(mappedIpv4)) {
      return isPrivateIpv4(mappedIpv4);
    }
  }

  return false;
}

/**
 * Check if an IP address (v4 or v6) is private/reserved.
 */
function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateIpv6(ip);
  return false; // Not a valid IP — will be caught elsewhere
}

// ── Hostname validation ─────────────────────────────────────────────────────

/**
 * Validate hostname format (RFC 1123).
 */
function isValidHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253) return false;

  // Must not start or end with a hyphen or dot
  if (hostname.startsWith('.') || hostname.startsWith('-') ||
      hostname.endsWith('.') || hostname.endsWith('-')) {
    return false;
  }

  const labels = hostname.split('.');
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return false;
    // Each label: alphanumeric + hyphens, must not start/end with hyphen
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label) && label.length > 1) {
      return false;
    }
    if (label.length === 1 && !/^[a-zA-Z0-9]$/.test(label)) return false;
  }

  return true;
}

// ── DNS resolution ──────────────────────────────────────────────────────────

/**
 * Resolve a hostname to an IP address with timeout.
 */
function resolveHostname(hostname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`DNS resolution timeout for '${hostname}'`));
    }, DNS_TIMEOUT_MS);

    dns.lookup(hostname, { family: 0 }, (err, address) => {
      clearTimeout(timer);
      if (err) {
        reject(new Error(`DNS resolution failed for '${hostname}': ${err.message}`));
        return;
      }
      resolve(address);
    });
  });
}

// ── Main validation ─────────────────────────────────────────────────────────

/**
 * Validate a carrier endpoint URL for SSRF safety.
 *
 * @param url            The URL to validate.
 * @param requireHttps   Whether HTTPS is required (default: true).
 * @param allowedHosts   Optional list of allowed hostnames for this provider.
 *                       If provided, the URL hostname must match one of them.
 */
export async function validateCarrierEndpointUrl(
  url: string,
  opts: {
    requireHttps?: boolean;
    allowedHosts?: string[];
  } = {},
): Promise<SsrfCheckResult> {
  const requireHttps = opts.requireHttps ?? true;

  // 1. Parse the URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: `Invalid URL: '${url}'` };
  }

  // 2. Scheme check
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      valid: false,
      reason: `Disallowed URL scheme '${parsed.protocol}'. Only https and http are permitted.`,
    };
  }

  if (requireHttps && parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason: `HTTPS required but URL uses '${parsed.protocol}'.`,
    };
  }

  // 3. Extract hostname
  const hostname = parsed.hostname.toLowerCase();

  if (!hostname) {
    return { valid: false, reason: 'URL has no hostname.' };
  }

  // 4. Check for known cloud metadata hostnames
  if (METADATA_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: `Cloud metadata hostname is not allowed: '${hostname}'.`,
    };
  }

  // 4b. Check for loopback hostnames
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: `Loopback hostname is not allowed: '${hostname}'.`,
    };
  }

  // 5. If the hostname is an IP address, check directly
  if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
    if (isPrivateIp(hostname)) {
      return {
        valid: false,
        reason: `Private/reserved IP address is not allowed: '${hostname}'.`,
      };
    }
  } else {
    // 6. Validate hostname format
    if (!isValidHostname(hostname)) {
      return {
        valid: false,
        reason: `Invalid hostname format: '${hostname}'.`,
      };
    }

    // 7. Resolve DNS and check the resulting IP
    try {
      const resolvedIp = await resolveHostname(hostname);
      if (isPrivateIp(resolvedIp)) {
        return {
          valid: false,
          reason: `Hostname '${hostname}' resolves to private IP '${resolvedIp}'.`,
        };
      }
    } catch (err: any) {
      return {
        valid: false,
        reason: `Cannot resolve hostname '${hostname}': ${err.message}`,
      };
    }
  }

  // 8. Provider-specific allowlist check
  if (opts.allowedHosts && opts.allowedHosts.length > 0) {
    const normalizedAllowed = opts.allowedHosts.map((h) => h.toLowerCase());
    if (!normalizedAllowed.includes(hostname)) {
      return {
        valid: false,
        reason: `Hostname '${hostname}' is not in the provider's allowlist [${normalizedAllowed.join(', ')}].`,
      };
    }
  }

  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : (parsed.protocol === 'https:' ? 443 : 80);

  return { valid: true, hostname, port };
}

/**
 * Synchronous URL validation without DNS resolution.
 *
 * Use this for configuration-time checks where async is not available.
 * Does NOT protect against DNS rebinding — use the async version for
 * request-time validation.
 */
export function validateCarrierEndpointUrlSync(
  url: string,
  opts: {
    requireHttps?: boolean;
    allowedHosts?: string[];
  } = {},
): SsrfCheckResult {
  const requireHttps = opts.requireHttps ?? true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: `Invalid URL: '${url}'` };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      valid: false,
      reason: `Disallowed URL scheme '${parsed.protocol}'.`,
    };
  }

  if (requireHttps && parsed.protocol !== 'https:') {
    return {
      valid: false,
      reason: `HTTPS required but URL uses '${parsed.protocol}'.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { valid: false, reason: 'URL has no hostname.' };
  }

  if (METADATA_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: `Cloud metadata hostname is not allowed: '${hostname}'.`,
    };
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: `Loopback hostname is not allowed: '${hostname}'.`,
    };
  }

  // Direct IP check only (no DNS resolution)
  if (net.isIPv4(hostname) || net.isIPv6(hostname)) {
    if (isPrivateIp(hostname)) {
      return {
        valid: false,
        reason: `Private/reserved IP address is not allowed: '${hostname}'.`,
      };
    }
  } else if (!isValidHostname(hostname)) {
    return {
      valid: false,
      reason: `Invalid hostname format: '${hostname}'.`,
    };
  }

  // Allowlist check
  if (opts.allowedHosts && opts.allowedHosts.length > 0) {
    const normalizedAllowed = opts.allowedHosts.map((h) => h.toLowerCase());
    if (!normalizedAllowed.includes(hostname)) {
      return {
        valid: false,
        reason: `Hostname '${hostname}' is not in the provider's allowlist.`,
      };
    }
  }

  const port = parsed.port
    ? parseInt(parsed.port, 10)
    : (parsed.protocol === 'https:' ? 443 : 80);

  return { valid: true, hostname, port };
}

// ── Allowlist registry ──────────────────────────────────────────────────────

/**
 * In-memory registry of provider-specific host allowlists.
 * Populated at application startup from carrier configuration.
 */
class CarrierEndpointAllowlistRegistry {
  private readonly allowlists = new Map<string, CarrierEndpointAllowlist>();

  /**
   * Register an allowlist for a provider.
   */
  register(config: CarrierEndpointAllowlist): void {
    this.allowlists.set(config.providerKey, config);
  }

  /**
   * Get the allowlist for a provider (if registered).
   */
  get(providerKey: string): CarrierEndpointAllowlist | undefined {
    return this.allowlists.get(providerKey);
  }

  /**
   * Validate a URL against a provider's allowlist.
   * If no allowlist is registered, falls back to generic SSRF checks.
   */
  async validateForProvider(
    url: string,
    providerKey: string,
    requireHttps = true,
  ): Promise<SsrfCheckResult> {
    const allowlist = this.allowlists.get(providerKey);
    return validateCarrierEndpointUrl(url, {
      requireHttps,
      allowedHosts: allowlist?.allowedHosts,
    });
  }

  /**
   * Clear all registered allowlists (for testing).
   */
  clear(): void {
    this.allowlists.clear();
  }
}

/** Singleton registry instance. */
export const carrierEndpointAllowlistRegistry = new CarrierEndpointAllowlistRegistry();
