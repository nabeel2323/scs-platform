/**
 * JWT signing helper for integration tests.
 * Uses the same HMAC-SHA256 algorithm as the app's JwtService.
 */
import * as crypto from 'node:crypto';

const JWT_ACCESS_SECRET =
  process.env['JWT_ACCESS_SECRET'] || 'dev-access-secret-change-me-in-production-32chars!';

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function signJwt(payload: {
  sub: string;
  role: string;
  activeOrg: string | null;
  perms?: string[];
  sid?: string;
}): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    perms: payload.perms || [],
    sid: payload.sid || 'test-session',
    jti: `jti-${now}`,
    iat: now,
    exp: now + 3600,
  };

  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(fullPayload)));
  const data = `${h}.${p}`;
  const sig = b64url(crypto.createHmac('sha256', JWT_ACCESS_SECRET).update(data).digest());
  return `${data}.${sig}`;
}
