/**
 * Device-trust cookie transport (audit finding S-1 remediation).
 *
 * WHY THIS MODULE EXISTS
 * Migration 0066 replaced client-asserted device trust with a server-issued
 * credential. The credential is a 256-bit secret returned to the browser ONCE,
 * in a `Set-Cookie` header, and never in a response body — so ordinary XSS
 * cannot read it and a stolen JSON payload cannot carry it. Everything about
 * how that secret crosses the wire lives here, so the security-critical
 * attributes have exactly one definition.
 *
 * CSRF: THE PART THAT CANNOT BE LEFT OUT
 * The staging/production topology is cross-site (frontends on Vercel, API on
 * Render), so `SameSite=Lax` would mean the cookie is NEVER sent on the
 * frontend's cross-site XHR and device trust would silently stop working for
 * everyone. Working cross-site requires `SameSite=None; Secure`, and
 * `SameSite=None` means a malicious third-party page CAN cause the browser to
 * attach the credential. That is why trust is only evaluated when the request
 * ALSO carries the `x-device-trust` proof header:
 *
 *   * the header is not a CORS-safelisted name, so a cross-origin page must
 *     pass a preflight that our `API_CORS_ORIGINS` allowlist rejects;
 *   * the header value is a constant, not a secret — it proves same-origin
 *     intent, it does not carry the credential (HttpOnly keeps JS from reading
 *     it);
 *   * absent proof => absent credential => untrusted device => OTP required.
 *     The CSRF bypass therefore fails closed.
 *
 * The cookie is host-only (no `Domain` attribute) so a sibling subdomain cannot
 * receive it, and it is scoped to the API's path (`/`) rather than a broader
 * registrable-domain scope.
 *
 * MIRRORING: `@scs/contracts` declares the same two names for the clients that
 * have to send the proof header. `@scs/api` does not depend on that package, so
 * the duplication is deliberate; `contracts-phase1.openapi.spec.ts` pins the
 * names as they appear in the published OpenAPI document, which is what catches
 * one side being renamed without the other.
 */

/** Cookie name. Deliberately not env-configurable: drift here breaks trust silently. */
export const DEVICE_TRUST_COOKIE_NAME = 'scs_device_trust';

/**
 * Request header whose presence proves the caller is one of our own origins.
 * A constant sentinel, NOT the credential — see the CSRF note above.
 */
export const DEVICE_TRUST_PROOF_HEADER = 'x-device-trust';

/** The only accepted proof value. */
export const DEVICE_TRUST_PROOF_VALUE = '1';

/**
 * Shape of a minted credential: base64url of 32 random bytes is 43 characters
 * with padding removed. Anything longer or containing other characters is not
 * something this service issued, so it is discarded instead of being sent to
 * the database — which also caps any work an attacker can trigger per request.
 */
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type DeviceTrustSameSite = 'lax' | 'strict' | 'none';

export interface DeviceTrustCookieConfig {
  sameSite: DeviceTrustSameSite;
  secure: boolean;
  /** Cookie name, exposed for tests and for the client contract docs. */
  cookieName: string;
  /** Proof header name, exposed for tests and client contract docs. */
  proofHeader: string;
}

export interface DeviceTrustCookieConfigInput {
  nodeEnv?: string;
  sameSite?: string;
  secure?: string;
}

/** NODE_ENV values that are allowed to run without TLS-only cookies. */
function isLocalEnv(nodeEnv?: string): boolean {
  const env = (nodeEnv ?? 'development').trim().toLowerCase();
  return env === 'development' || env === 'test';
}

/**
 * Resolve and validate the cookie attributes from the environment.
 *
 * Defaults are chosen for the two real topologies, not for theory:
 *   - deployed (staging/production): frontends on Vercel call the API on
 *     Render, which is cross-SITE, so only `None` + `Secure` ever transmits
 *     the credential;
 *   - local development/test: `localhost:3200` calling `localhost:3000` is the
 *     same site (ports do not define a site), so `Lax` works and is the safer
 *     default, and `Secure=false` is permitted only because there is no TLS
 *     termination involved locally.
 *
 * @throws Error on a configuration that would silently break or weaken trust:
 *   - an unrecognised SameSite or Secure value (a typo would turn the feature
 *     off unnoticed, so refuse to boot instead);
 *   - `SameSite=None` without `Secure`: browsers discard such a cookie
 *     outright, which would make device trust a no-op while looking configured;
 *   - `Secure=false` in a deployed environment: the credential would cross the
 *     network in cleartext.
 */
export function resolveDeviceTrustCookieConfig(
  input: DeviceTrustCookieConfigInput = {},
): DeviceTrustCookieConfig {
  const local = isLocalEnv(input.nodeEnv);
  const rawSameSite = (input.sameSite ?? '').trim().toLowerCase();
  const rawSecure = (input.secure ?? '').trim().toLowerCase();

  const allowedSameSite: DeviceTrustSameSite[] = ['lax', 'strict', 'none'];
  let sameSite: DeviceTrustSameSite;
  if (rawSameSite === '') {
    sameSite = local ? 'lax' : 'none';
  } else if ((allowedSameSite as string[]).includes(rawSameSite)) {
    sameSite = rawSameSite as DeviceTrustSameSite;
  } else {
    throw new Error(
      `Invalid DEVICE_TRUST_COOKIE_SAME_SITE "${input.sameSite}". ` +
        `Expected one of: ${allowedSameSite.join(', ')}.`,
    );
  }

  let secure: boolean;
  if (rawSecure === '') {
    secure = !local;
  } else if (rawSecure === 'true' || rawSecure === '1') {
    secure = true;
  } else if (rawSecure === 'false' || rawSecure === '0') {
    secure = false;
  } else {
    throw new Error(
      `Invalid DEVICE_TRUST_COOKIE_SECURE "${input.secure}". Expected true or false.`,
    );
  }

  if (sameSite === 'none' && !secure) {
    throw new Error(
      'Device-trust cookie misconfiguration: SameSite=None requires Secure=true. ' +
        'Browsers discard a None+non-secure cookie, which would disable device trust.',
    );
  }

  if (!local && !secure) {
    throw new Error(
      `Device-trust cookie misconfiguration: Secure=false is not allowed when ` +
        `NODE_ENV="${(input.nodeEnv ?? 'development').trim().toLowerCase()}" ` +
        `(only development and test may run without TLS-only cookies).`,
    );
  }

  return {
    sameSite,
    secure,
    cookieName: DEVICE_TRUST_COOKIE_NAME,
    proofHeader: DEVICE_TRUST_PROOF_HEADER,
  };
}

/** Minimal structural request shape so this stays testable without Express types. */
export interface CookieBearingRequest {
  headers?: Record<string, string | string[] | undefined>;
}

/** Minimal structural response shape (`res.setHeader`/`getHeader` from Express). */
export interface CookieBearingResponse {
  setHeader(name: string, value: string | string[]): void;
  getHeader(name: string): string | number | string[] | undefined;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Extract one cookie's value from a raw `Cookie` header. */
export function readCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    // Only an unquoted value is ours; a quoted cookie-string value is a
    // different encoding and must not be silently accepted.
    if (raw.startsWith('"')) return undefined;
    return raw;
  }
  return undefined;
}

/**
 * Whether the request carries the same-origin proof header.
 * Compared case-insensitively against the single accepted value.
 */
export function deviceTrustProofPresent(req: CookieBearingRequest): boolean {
  const raw = firstHeader(req.headers?.[DEVICE_TRUST_PROOF_HEADER]);
  return typeof raw === 'string' && raw.trim().toLowerCase() === DEVICE_TRUST_PROOF_VALUE;
}

/**
 * The credential the browser is presenting, or null.
 *
 * Returns null when EITHER the cookie is missing/malformed OR the proof header
 * is absent. The second condition is the CSRF control described at the top of
 * this file; the first bounds the input before it reaches a database lookup.
 */
export function readPresentedDeviceCredential(
  req: CookieBearingRequest,
): string | null {
  if (!deviceTrustProofPresent(req)) return null;
  const value = readCookieValue(firstHeader(req.headers?.['cookie']), DEVICE_TRUST_COOKIE_NAME);
  if (!value || !CREDENTIAL_PATTERN.test(value)) return null;
  return value;
}

/**
 * Canonical attribute tokens for the wire.
 *
 * The config values are lowercase because that is how they are compared and
 * logged; the `Set-Cookie` value uses the spelling the RFC examples and every
 * browser implementation use. Cookie attribute values are matched
 * case-insensitively, so this is not a correctness fix — it removes any need to
 * rely on parser leniency for a security attribute, and it makes an inspected
 * header identical to the documented configuration.
 */
const SAME_SITE_ATTRIBUTE: Record<DeviceTrustSameSite, string> = {
  lax: 'Lax',
  strict: 'Strict',
  none: 'None',
};

/**
 * Assemble the attribute list around a value.
 * @param maxAgeSeconds remaining lifetime; null => session cookie (no Max-Age).
 */
function serializeDeviceTrustCookie(
  value: string,
  cfg: DeviceTrustCookieConfig,
  maxAgeSeconds: number | null,
): string {
  const attrs = [
    `${DEVICE_TRUST_COOKIE_NAME}=${value}`,
    // No Domain attribute => host-only cookie; a sibling subdomain cannot
    // receive the credential.
    'Path=/',
    `SameSite=${SAME_SITE_ATTRIBUTE[cfg.sameSite]}`,
    // HttpOnly is not optional and not configurable: the whole point is that
    // page script cannot read the credential, so XSS cannot exfiltrate a
    // device-trust bypass.
    'HttpOnly',
  ];
  if (cfg.secure) attrs.push('Secure');
  if (maxAgeSeconds !== null) attrs.push(`Max-Age=${maxAgeSeconds}`);
  return attrs.join('; ');
}

/**
 * Build the `Set-Cookie` value that installs a credential.
 * @param credential the freshly minted secret; transmitted once, never stored.
 * @param maxAgeSeconds remaining lifetime; null => session cookie.
 */
export function buildDeviceTrustCookie(
  credential: string,
  cfg: DeviceTrustCookieConfig,
  maxAgeSeconds: number | null,
): string {
  if (!CREDENTIAL_PATTERN.test(credential)) {
    // Guard the attribute-join path: a malformed value could carry CR/LF or a
    // `;` and inject extra cookies or response headers.
    throw new TypeError('Refused to set a device-trust cookie from a malformed credential.');
  }
  return serializeDeviceTrustCookie(credential, cfg, maxAgeSeconds);
}

/** Expire-and-delete the cookie (Max-Age=0 with the same attribute set). */
export function buildClearDeviceTrustCookie(cfg: DeviceTrustCookieConfig): string {
  // A placeholder token, not a credential: Max-Age=0 means the browser keeps
  // nothing, and a valid-shaped value keeps the attribute string identical to
  // the one that installed the cookie (some browsers match on name+domain+path
  // only, but identical shape removes any doubt).
  return serializeDeviceTrustCookie('clear', cfg, 0);
}

/**
 * What the service layer hands the transport for the current response.
 *
 * Exactly three things can happen to the cookie: install a credential, expire
 * it, or nothing at all (`undefined`). An earlier `keep?: boolean` variant was
 * removed: nothing ever set it, `applyDeviceTrustCookie` never read it, and the
 * behaviour it described ("leave the cookie alone") is the same observable
 * outcome as no instruction — while the live case actually needs a re-issue, so
 * that the browser's absolute `Max-Age` tracks the server-side slide.
 */
export interface DeviceTrustTransportInstruction {
  /** New or refreshed credential to install. */
  credential?: string;
  /** Lifetime for `credential`; omitted => hard lifetime of the credential. */
  maxAgeSeconds?: number;
  /** Remove a credential the browser was still presenting. */
  clear?: boolean;
}

function appendSetCookie(res: CookieBearingResponse, cookie: string): void {
  const existing = res.getHeader('Set-Cookie');
  if (existing === undefined) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  const list = Array.isArray(existing) ? existing : [String(existing)];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

/**
 * Apply the service's device-trust decision to the HTTP response.
 *
 * The credential NEVER appears in the response body: controllers call this and
 * then strip the field from the object they return (see AuthController), so the
 * secret exists only inside the Set-Cookie header.
 */
export function applyDeviceTrustCookie(
  res: CookieBearingResponse,
  trust: DeviceTrustTransportInstruction | undefined,
  cfg: DeviceTrustCookieConfig,
): void {
  if (!trust) return;
  if (trust.credential) {
    appendSetCookie(
      res,
      buildDeviceTrustCookie(trust.credential, cfg, trust.maxAgeSeconds ?? null),
    );
    return;
  }
  if (trust.clear) {
    appendSetCookie(res, buildClearDeviceTrustCookie(cfg));
  }
}
