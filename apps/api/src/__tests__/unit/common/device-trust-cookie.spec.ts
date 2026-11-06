import { describe, it, expect } from 'vitest';
import {
  DEVICE_TRUST_COOKIE_NAME,
  DEVICE_TRUST_PROOF_HEADER,
  DEVICE_TRUST_PROOF_VALUE,
  buildClearDeviceTrustCookie,
  buildDeviceTrustCookie,
  deviceTrustProofPresent,
  readCookieValue,
  readPresentedDeviceCredential,
  resolveDeviceTrustCookieConfig,
  applyDeviceTrustCookie,
  type DeviceTrustCookieConfig,
} from '../../../common/auth/device-trust-cookie';

/**
 * Device-trust transport unit tests (finding S-1 remediation).
 *
 * This module is the only place the credential's wire attributes are defined, so
 * every assertion that keeps it out of the wrong hands lives here and is tested
 * here rather than through a Nest application:
 *
 *   * the attribute set (HttpOnly, host-only, SameSite/Secure) decides whether
 *     XSS can read the credential and whether it crosses the network in
 *     cleartext;
 *   * the misconfiguration guards decide whether a typo silently disables
 *     device trust or boots loudly;
 *   * the proof-header rule is the CSRF control, because the deployed topology
 *     needs SameSite=None and a cross-site page can therefore make the browser
 *     attach the cookie;
 *   * the shape check bounds what a browser can hand us before it reaches a
 *     database lookup, and refuses to serialize a value that could inject extra
 *     cookies or headers.
 *
 * The cookie-name/header-name pairing with @scs/contracts is pinned separately by
 * contracts-phase1.openapi.spec.ts; this file owns behavior.
 */

/** A credential exactly as `crypto.randomBytes(32).toString('base64url')` emits it. */
const CREDENTIAL = 'a1B2c3D4e5F6g7H8i9J0kLmNoPqRsTuVwXyZ0123456';
const CFG: DeviceTrustCookieConfig = {
  sameSite: 'none',
  secure: true,
  cookieName: DEVICE_TRUST_COOKIE_NAME,
  proofHeader: DEVICE_TRUST_PROOF_HEADER,
};

const LOCAL: DeviceTrustCookieConfig = { ...CFG, sameSite: 'lax', secure: false };

/** Minimal `CookieBearingRequest` stand-in. */
const reqWith = (cookie?: string, proof?: string) => ({
  headers: {
    ...(cookie === undefined ? {} : { cookie }),
    ...(proof === undefined ? {} : { [DEVICE_TRUST_PROOF_HEADER]: proof }),
  },
});

function responseStub(initial?: string) {
  const headers: Record<string, string | string[]> = {};
  if (initial !== undefined) headers['set-cookie'] = initial;
  return {
    setHeader: (name: string, value: string | string[]) => {
      headers[name.toLowerCase()] = value;
    },
    getHeader: (name: string) => headers[name.toLowerCase()],
    /** Every header name this transport touched, for the "Set-Cookie only" test. */
    written: () => Object.keys(headers),
    get list(): string[] {
      const raw = headers['set-cookie'];
      if (raw === undefined) return [];
      return Array.isArray(raw) ? raw : [String(raw)];
    },
  };
}

describe('resolveDeviceTrustCookieConfig', () => {
  it('defaults local environments to Lax without Secure', () => {
    expect(resolveDeviceTrustCookieConfig({ nodeEnv: 'development' })).toEqual({
      sameSite: 'lax',
      secure: false,
      cookieName: DEVICE_TRUST_COOKIE_NAME,
      proofHeader: DEVICE_TRUST_PROOF_HEADER,
    });
    // Same-site (localhost:3200 → localhost:3000), so Lax transmits it and is
    // the stricter choice; test inherits the local default.
    expect(resolveDeviceTrustCookieConfig({ nodeEnv: 'test' })).toEqual(
      resolveDeviceTrustCookieConfig({ nodeEnv: 'development' }),
    );
  });

  it('defaults deployed environments to None + Secure for the cross-site topology', () => {
    for (const nodeEnv of ['production', 'staging']) {
      expect(resolveDeviceTrustCookieConfig({ nodeEnv })).toMatchObject({
        sameSite: 'none',
        secure: true,
      });
    }
  });

  it('treats a missing NODE_ENV as local', () => {
    expect(resolveDeviceTrustCookieConfig()).toMatchObject({ sameSite: 'lax', secure: false });
  });

  it('accepts explicit values case- and whitespace-insensitively', () => {
    expect(
      resolveDeviceTrustCookieConfig({ nodeEnv: 'production', sameSite: ' STRICT ', secure: 'TRUE' }),
    ).toMatchObject({ sameSite: 'strict', secure: true });
    expect(
      resolveDeviceTrustCookieConfig({ nodeEnv: 'test', sameSite: 'None', secure: '1' }),
    ).toMatchObject({ sameSite: 'none', secure: true });
  });

  it('refuses to boot on an unrecognised SameSite instead of silently disabling trust', () => {
    // A typo would otherwise read as "not configured" and switch the feature off
    // with no signal anywhere.
    expect(() =>
      resolveDeviceTrustCookieConfig({ nodeEnv: 'production', sameSite: 'no_restriction' }),
    ).toThrow(/DEVICE_TRUST_COOKIE_SAME_SITE/);
  });

  it('refuses to boot on an unrecognised Secure value', () => {
    expect(() =>
      resolveDeviceTrustCookieConfig({ nodeEnv: 'production', secure: 'yes_please' }),
    ).toThrow(/DEVICE_TRUST_COOKIE_SECURE/);
  });

  it('rejects SameSite=None without Secure: browsers discard that cookie outright', () => {
    // Local environments are allowed to set None+Secure=true, never None with
    // Secure=false, which would make device trust a silent no-op.
    expect(() =>
      resolveDeviceTrustCookieConfig({ nodeEnv: 'test', sameSite: 'none', secure: 'false' }),
    ).toThrow(/SameSite=None requires Secure/);
  });

  it('rejects Secure=false outside development and test', () => {
    // The credential would cross the network in cleartext. SameSite is pinned to
    // Lax so this exercises the Secure guard rather than the None+insecure one
    // that fires first for a deployed default (checked above).
    expect(() =>
      resolveDeviceTrustCookieConfig({ nodeEnv: 'staging', sameSite: 'lax', secure: 'false' }),
    ).toThrow(/Secure=false is not allowed/);
    expect(() =>
      resolveDeviceTrustCookieConfig({ nodeEnv: 'production', sameSite: 'strict', secure: '0' }),
    ).toThrow(/Secure=false is not allowed/);
  });

  it('names the deployed environment in that refusal', () => {
    // The operator has to see which env they mis-set.
    expect(() =>
      resolveDeviceTrustCookieConfig({ nodeEnv: 'staging', sameSite: 'lax', secure: 'false' }),
    ).toThrow(/NODE_ENV="staging"/);
  });
});

describe('readCookieValue', () => {
  it('reads our cookie from a realistic multi-cookie header', () => {
    const header = `_ga=GA1.2.3; ${DEVICE_TRUST_COOKIE_NAME}=${CREDENTIAL}; other=x`;
    expect(readCookieValue(header, DEVICE_TRUST_COOKIE_NAME)).toBe(CREDENTIAL);
  });

  it('returns undefined when the cookie is absent or the header is missing', () => {
    expect(readCookieValue('other=x', DEVICE_TRUST_COOKIE_NAME)).toBeUndefined();
    expect(readCookieValue(undefined, DEVICE_TRUST_COOKIE_NAME)).toBeUndefined();
    expect(readCookieValue('', DEVICE_TRUST_COOKIE_NAME)).toBeUndefined();
  });

  it('matches the name exactly, not as a suffix', () => {
    expect(readCookieValue(`evil_${DEVICE_TRUST_COOKIE_NAME}=x`, DEVICE_TRUST_COOKIE_NAME)).toBeUndefined();
  });

  it('ignores segments with no separator and quoted values', () => {
    expect(readCookieValue(`${DEVICE_TRUST_COOKIE_NAME}`, DEVICE_TRUST_COOKIE_NAME)).toBeUndefined();
    // A quoted cookie-string value is a different encoding; accepting it would
    // make the parser disagree with the serializer.
    expect(
      readCookieValue(`${DEVICE_TRUST_COOKIE_NAME}="${CREDENTIAL}"`, DEVICE_TRUST_COOKIE_NAME),
    ).toBeUndefined();
  });

  it('tolerates surrounding whitespace', () => {
    expect(
      readCookieValue(`  ${DEVICE_TRUST_COOKIE_NAME}=${CREDENTIAL}  `, DEVICE_TRUST_COOKIE_NAME),
    ).toBe(CREDENTIAL);
  });
});

describe('deviceTrustProofPresent', () => {
  it('accepts the sentinel value regardless of case or padding', () => {
    expect(deviceTrustProofPresent(reqWith(undefined, DEVICE_TRUST_PROOF_VALUE))).toBe(true);
    expect(deviceTrustProofPresent(reqWith(undefined, ' 1 '))).toBe(true);
  });

  it('reads the first value when a header arrives as an array', () => {
    expect(
      deviceTrustProofPresent({ headers: { [DEVICE_TRUST_PROOF_HEADER]: [DEVICE_TRUST_PROOF_VALUE, '0'] } }),
    ).toBe(true);
    expect(deviceTrustProofPresent({ headers: { [DEVICE_TRUST_PROOF_HEADER]: ['0', DEVICE_TRUST_PROOF_VALUE] } })).toBe(false);
  });

  it('is false for any other value, an absent header, or absent headers', () => {
    expect(deviceTrustProofPresent(reqWith(undefined, '0'))).toBe(false);
    expect(deviceTrustProofPresent(reqWith(undefined, 'true'))).toBe(false);
    expect(deviceTrustProofPresent(reqWith(undefined))).toBe(false);
    expect(deviceTrustProofPresent({})).toBe(false);
  });
});

describe('readPresentedDeviceCredential', () => {
  it('returns the credential only when the cookie and the proof header agree', () => {
    expect(readPresentedDeviceCredential(reqWith(`${DEVICE_TRUST_COOKIE_NAME}=${CREDENTIAL}`, '1'))).toBe(
      CREDENTIAL,
    );
  });

  it('drops a credential presented without the same-origin proof (the CSRF control)', () => {
    // SameSite=None is required by the deployed topology, so a third-party page
    // CAN make the browser attach this cookie. The non-safelisted proof header
    // cannot survive a cross-origin preflight against our CORS allowlist, so
    // requiring it makes the bypass fail closed: no proof, no credential, an
    // ordinary OTP challenge.
    expect(readPresentedDeviceCredential(reqWith(`${DEVICE_TRUST_COOKIE_NAME}=${CREDENTIAL}`))).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['shorter than 43 characters', CREDENTIAL.slice(0, 42)],
    ['longer than 43 characters', `${CREDENTIAL}X`],
    ['containing a plus (not base64url)', 'a+'.repeat(21) + 'a'],
    ['containing an equals sign', 'a='.repeat(21) + 'a'],
    ['containing a dot', `${CREDENTIAL.slice(0, 42)}.`],
  ])('discards a value %s rather than sending it to a lookup', (_label, value) => {
    expect(readPresentedDeviceCredential(reqWith(`${DEVICE_TRUST_COOKIE_NAME}=${value}`, '1'))).toBeNull();
  });

  it('is null when no cookie is present at all', () => {
    expect(readPresentedDeviceCredential(reqWith(undefined, '1'))).toBeNull();
  });
});

describe('buildDeviceTrustCookie', () => {
  it('serializes the security attributes that keep the credential out of page script', () => {
    const cookie = buildDeviceTrustCookie(CREDENTIAL, CFG, 3600);
    expect(cookie).toContain(`${DEVICE_TRUST_COOKIE_NAME}=${CREDENTIAL}`);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Max-Age=3600');
  });

  it('is host-only: no Domain attribute a sibling subdomain could receive', () => {
    expect(buildDeviceTrustCookie(CREDENTIAL, CFG, 60)).not.toMatch(/Domain=/i);
  });

  it.each([
    ['lax', 'Lax'],
    ['strict', 'Strict'],
    ['none', 'None'],
  ] as const)('spells SameSite=%s the way browsers document it', (cfgValue, wire) => {
    expect(buildDeviceTrustCookie(CREDENTIAL, { ...CFG, sameSite: cfgValue }, 60)).toContain(
      `SameSite=${wire}`,
    );
  });

  it('omits Max-Age for a session cookie', () => {
    expect(buildDeviceTrustCookie(CREDENTIAL, LOCAL, null)).not.toMatch(/Max-Age=/);
  });

  it.each([
    ['a CR/LF injection attempt', `${CREDENTIAL.slice(0, 40)}\r\nX-Injected: 1`],
    ['an embedded cookie separator', `${CREDENTIAL.slice(0, 40)};other=1`],
    ['a 44-character value', `${CREDENTIAL}X`],
    ['an empty value', ''],
  ])('refuses to serialize %s', (_label, value) => {
    // The attributes are joined into a header value verbatim, so a malformed
    // secret must be rejected rather than escaped.
    expect(() => buildDeviceTrustCookie(value, CFG, 60)).toThrow(TypeError);
  });
});

describe('buildClearDeviceTrustCookie', () => {
  it('expires the cookie with the same attribute shape that installed it', () => {
    const cookie = buildClearDeviceTrustCookie(CFG);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=None');
    expect(cookie).not.toMatch(/Domain=/i);
  });
});

describe('applyDeviceTrustCookie', () => {
  it('installs a minted credential', () => {
    const res = responseStub();
    applyDeviceTrustCookie(res, { credential: CREDENTIAL, maxAgeSeconds: 7200 }, CFG);
    expect(res.list).toHaveLength(1);
    expect(res.list[0]).toContain(`Max-Age=7200`);
  });

  it('uses an absolute Max-Age when the service does not supply one', () => {
    const res = responseStub();
    applyDeviceTrustCookie(res, { credential: CREDENTIAL }, CFG);
    expect(res.list[0]).not.toContain('Max-Age=');
  });

  it('clears a dead credential', () => {
    const res = responseStub();
    applyDeviceTrustCookie(res, { clear: true }, CFG);
    expect(res.list[0]).toContain('Max-Age=0');
  });

  it('prefers installing over clearing when both are instructed', () => {
    const res = responseStub();
    applyDeviceTrustCookie(res, { credential: CREDENTIAL, maxAgeSeconds: 60, clear: true }, CFG);
    expect(res.list).toHaveLength(1);
    expect(res.list[0]).toContain(CREDENTIAL);
  });

  it('does nothing for an empty instruction or no instruction at all', () => {
    // The two shapes that mean "this response says nothing about device trust".
    // `{}` used to be `{ keep: true }`, a variant nothing ever produced.
    for (const trust of [{}, undefined]) {
      const res = responseStub();
      applyDeviceTrustCookie(res, trust, CFG);
      expect(res.list).toHaveLength(0);
    }
  });

  it('appends to a Set-Cookie header another cookie already wrote', () => {
    // Login responses can carry more than one cookie; overwriting would drop it.
    const res = responseStub('other_cookie=1; Path=/');
    applyDeviceTrustCookie(res, { credential: CREDENTIAL, maxAgeSeconds: 60 }, CFG);
    expect(res.list).toHaveLength(2);
    expect(res.list[0]).toBe('other_cookie=1; Path=/');
    expect(res.list[1]).toContain(DEVICE_TRUST_COOKIE_NAME);
  });

  it('writes to Set-Cookie and nothing else', () => {
    // The transport rule finding S-1 established: the secret exists only inside
    // the Set-Cookie header, never in a body a script or a log could read.
    const res = responseStub();
    applyDeviceTrustCookie(res, { credential: CREDENTIAL, maxAgeSeconds: 60 }, CFG);
    expect(res.written()).toEqual(['set-cookie']);
  });
});
