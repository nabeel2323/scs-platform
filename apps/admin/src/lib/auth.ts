/**
 * Admin auth session handling — JWT pair with refresh rotation.
 *
 * Mirrors the web auth module but targets the admin app's session context.
 * Admin users authenticate via the same OTP flow but with SUPER_ADMIN / ADMIN roles.
 *
 * Session is persisted to localStorage so it survives page refreshes.
 */

import { getDeviceId } from './device-id';
import { DEVICE_TRUST_PROOF_HEADER, DEVICE_TRUST_PROOF_VALUE } from '@scs/contracts';
import type {
  AuthSession,
  AuthTokens,
  RefreshResponse,
  DeviceCheckResponse,
  LoginPasswordResponse,
  OtpRequestResponse,
  SessionInfo,
  UserProfile,
} from '@scs/contracts';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const SESSION_KEY = 'scs_admin_session';
const USER_KEY = 'scs_admin_user';

// ── Device-trust transport (S-1) ─────────────────────────────

/**
 * Request init for the four calls where device trust matters: OTP verify,
 * password login, refresh and logout.
 *
 * Two things are needed for the server-issued credential to reach the API, and
 * the admin console previously did neither:
 *
 *  - `credentials: 'include'` — without it the browser neither attaches a
 *    cookie to a cross-origin request nor accepts a `Set-Cookie` in the reply.
 *    The API already sends `Access-Control-Allow-Credentials: true`, so this is
 *    the client half of that.
 *  - the `x-device-trust` proof header — with `SameSite=None` (the only
 *    attribute that works with the frontend and API on different sites) a
 *    third-party page can make the browser attach the cookie, so the server
 *    ignores it unless this header is present too. It is a constant, not a
 *    secret.
 *
 * Omitting both is safe but useless: the device simply counts as untrusted and
 * an OTP is required. That is the fail-closed direction.
 */
function trustRequest(body: unknown, extraHeaders?: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      [DEVICE_TRUST_PROOF_HEADER]: DEVICE_TRUST_PROOF_VALUE,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

// Session envelope + auth wire types are shared from @scs/contracts (ADM-B3) so
// web, admin and mobile stop redefining them. Re-exported to keep this module's
// public surface stable for existing importers of `AuthSession`.
export type { AuthSession };

export interface AdminUser {
  id: string;
  phone: string;
  fullName: string;
  role: string; // SUPER_ADMIN | ADMIN | MODERATOR
  perms?: string[];
}

// ── Rate-limit (429) error ───────────────────────────────────

/**
 * Error carrying rate-limit context from a 429 so the admin login UI can show
 * remaining attempts and the lockout countdown (Quick win 5). Reads the standard
 * `X-RateLimit-Remaining` / `Retry-After` headers, falling back to the RFC 7807
 * body extensions (`remainingAttempts` / `retryAfterSeconds`).
 */
export class LoginRateLimitError extends Error {
  readonly remainingAttempts: number;
  readonly retryAfterSeconds: number;
  constructor(message: string, remainingAttempts: number, retryAfterSeconds: number) {
    super(message);
    this.name = 'LoginRateLimitError';
    this.remainingAttempts = remainingAttempts;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Build a LoginRateLimitError from a 429 response (headers first, body fallback). */
async function toRateLimitError(res: Response, fallback: string): Promise<LoginRateLimitError> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const headerRemaining = res.headers.get('X-RateLimit-Remaining');
  const headerRetry = res.headers.get('Retry-After');
  const remaining = Number(headerRemaining ?? body['remainingAttempts'] ?? 0);
  const retryAfter = Number(headerRetry ?? body['retryAfterSeconds'] ?? 0);
  const message = String(body['detail'] || body['message'] || fallback);
  return new LoginRateLimitError(
    message,
    Number.isFinite(remaining) ? remaining : 0,
    Number.isFinite(retryAfter) ? retryAfter : 0,
  );
}

// ── Restore persisted session on module load ─────────────────

let currentSession: AuthSession | null = null;
let currentUser: AdminUser | null = null;

// Single-flight guard for token refresh (mirrors web WEB-B4). Concurrent 401s
// must share ONE rotation; parallel rotations trip the server's refresh-reuse
// detection and revoke the entire session chain.
let refreshPromise: Promise<AuthSession> | null = null;

function restoreSession(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AuthSession;
      if (parsed.expiresAt > Date.now()) {
        currentSession = parsed;
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    const userRaw = localStorage.getItem(USER_KEY);
    if (userRaw) {
      currentUser = JSON.parse(userRaw) as AdminUser;
    }
  } catch {
    // Corrupted data — clear it
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

function persistSession(session: AuthSession | null): void {
  if (typeof window === 'undefined') return;
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function persistUser(user: AdminUser | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

// Restore on first import
restoreSession();

/**
 * Hydrate the persisted AdminUser from GET /v1/me using a freshly issued access
 * token. The server resolves the authoritative `role` for the caller's active
 * org (UserProfile contract), so the admin no longer decodes the access-token
 * JWT client-side — that was fragile (relied on token internals) and duplicated
 * claim logic the server already owns. Best-effort: a failed fetch simply leaves
 * the user to be populated on the next authenticated profile read.
 */
async function hydrateUser(accessToken: string, fallbackPhone: string): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const profile = (await res.json()) as UserProfile;
    currentUser = {
      id: profile.id,
      phone: profile.phone || fallbackPhone,
      fullName: profile.fullName || 'Admin',
      role: profile.role || 'ADMIN',
      perms: profile.perms ?? undefined,
    };
    persistUser(currentUser);
  } catch {
    /* best-effort — populated on next profile fetch */
  }
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  return currentSession;
}

export function getUser(): AdminUser | null {
  return currentUser;
}

export function isAuthenticated(): boolean {
  const session = getSession();
  return session !== null && session.expiresAt > Date.now();
}

/**
 * Request an OTP on the admin console's SMS channel.
 *
 * Returns the WHOLE delivery outcome, not a bare `{success}`: HTTP 200 on this
 * route means the request was processed, not that a code reached the phone. The
 * audit found the admin UI discarding this and advancing to code entry after a
 * provider failure (finding S-1/§4), so the caller is expected to run the
 * result through `classifyOtpDelivery` and say what actually happened.
 */
export async function requestOtp(phone: string): Promise<OtpRequestResponse> {
  const res = await fetch(`${API_URL}/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many OTP attempts.');
    throw new Error(`OTP request failed: ${res.status}`);
  }
  return (await res.json()) as OtpRequestResponse;
}

export async function verifyOtp(phone: string, otp: string): Promise<AuthSession> {
  // A verified OTP enrols this browser: the credential arrives in Set-Cookie,
  // which is only honoured when the request is made with credentials included.
  const res = await fetch(
    `${API_URL}/v1/auth/otp/verify`,
    trustRequest({
      phone,
      otp,
      deviceId: getDeviceId(),
      deviceInfo: {
        platform: 'admin-web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    }),
  );
  if (!res.ok) throw new Error(`OTP verify failed: ${res.status}`);
  const data = (await res.json()) as AuthTokens;

  currentSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  persistSession(currentSession);

  // Hydrate the admin user from GET /v1/me (server-resolved role) instead of
  // decoding the access-token JWT client-side.
  await hydrateUser(data.accessToken, phone);

  return currentSession;
}

export function refreshSession(): Promise<AuthSession> {
  // Coalesce concurrent refreshes into a single in-flight rotation.
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function performRefresh(): Promise<AuthSession> {
  if (!currentSession) throw new Error('No session to refresh');

  const refreshTokenUsed = currentSession.refreshToken;
  // Rotation is where device trust would silently decay: the access token is
  // short-lived, so a refresh happens constantly on a used device. Presenting
  // (and getting back) the credential here is what keeps the sliding horizon in
  // step with the session and stops the next login from asking for an OTP.
  const res = await fetch(
    `${API_URL}/v1/auth/refresh`,
    trustRequest(
      { refreshToken: refreshTokenUsed },
      { Authorization: `Bearer ${currentSession.accessToken}` },
    ),
  );
  if (!res.ok) {
    currentSession = null;
    currentUser = null;
    throw new Error(`Refresh failed: ${res.status}`);
  }
  const data = (await res.json()) as RefreshResponse;

  // Drop the result if a logout/newer refresh superseded this call mid-flight.
  if (!currentSession || currentSession.refreshToken !== refreshTokenUsed) {
    throw new Error('Refresh superseded');
  }

  currentSession = {
    accessToken: data.accessToken,
    // Rotation returns the next refresh token as `newRefreshToken` (the old
    // `?? data.refreshToken` fallback read a field the API never returns).
    refreshToken: data.newRefreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  persistSession(currentSession);
  return currentSession;
}

export async function logout(): Promise<void> {
  if (!currentSession) return;
  try {
    // The reply carries a clearing Set-Cookie: logout revokes this device's
    // credential server-side, so the browser must drop it in the same breath
    // (otherwise a shared profile would stay "trusted" after signing out).
    await fetch(
      `${API_URL}/v1/auth/logout`,
      trustRequest(
        { refreshToken: currentSession.refreshToken },
        { Authorization: `Bearer ${currentSession.accessToken}` },
      ),
    );
  } catch {
    /* ignore */
  }
  currentSession = null;
  currentUser = null;
  refreshPromise = null;
  persistSession(null);
  persistUser(null);
}

// ── Dual Authentication (Password Login) ────────────────────

/**
 * POST /v1/auth/login/device-check — kept only because the route is published.
 *
 * The answer is a CONSTANT (`{checked: true}`) and carries no information: the
 * caller has proved nothing, so it is told nothing about whether the address
 * exists, has a password, or has ever been trusted (finding S-2). That is why
 * the login page no longer calls this on mount and why nothing here branches on
 * the result. Device trust is decided server-side, from the HttpOnly credential,
 * when the password is actually checked.
 */
export async function checkDeviceLogin(email: string): Promise<DeviceCheckResponse> {
  const res = await fetch(`${API_URL}/v1/auth/login/device-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`Device check failed: ${res.status}`);
  return (await res.json()) as DeviceCheckResponse;
}

/**
 * Login with email and password. Returns a session when the device is trusted,
 * or { requiresOtp, otpPhone } when it is not.
 *
 * `deviceId` remains in the body and in `X-Device-Id` as session provenance.
 * It is NOT what produces `requiresOtp` any more: that is the server-issued
 * cookie plus the proof header, so copying a trusted browser's device id — the
 * exact weakness in finding S-1 — changes nothing.
 */
export async function loginPassword(
  email: string,
  password: string,
  deviceId: string,
): Promise<
  AuthSession | { requiresOtp: true; otpPhone: string; otpDelivery?: 'accepted' | 'uncertain' }
> {
  const res = await fetch(
    `${API_URL}/v1/auth/login/password`,
    trustRequest(
      {
        email,
        password,
        deviceId,
        deviceInfo: {
          platform: 'admin-web',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        },
      },
      { 'X-Device-Id': deviceId },
    ),
  );

  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many login attempts.');
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || error.message || `Login failed: ${res.status}`);
  }

  const data = (await res.json()) as LoginPasswordResponse;
  if (data.requiresOtp) {
    return { requiresOtp: true, otpPhone: data.otpPhone ?? '', otpDelivery: data.otpDelivery };
  }

  currentSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  persistSession(currentSession);

  // Hydrate the admin user from GET /v1/me (server-resolved role) — mirrors
  // verifyOtp; no client-side JWT decoding.
  await hydrateUser(data.accessToken, email);

  return currentSession;
}

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!currentSession) {
    return new Response(JSON.stringify({ detail: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }

  if (currentSession.expiresAt - Date.now() < 60_000) {
    try {
      await refreshSession();
    } catch {
      return new Response(JSON.stringify({ detail: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${currentSession.accessToken}`,
    },
  });

  if (res.status === 401) {
    try {
      await refreshSession();
    } catch {
      return res;
    }
    return fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${currentSession!.accessToken}`,
      },
    });
  }

  return res;
}

// ── Credential Self-Service (ADM-B1) ──────────────────────────
// Ported from the web app so platform staff can manage their own password and
// review/revoke active sessions without leaving the admin console.

/**
 * Set up email + password credentials for an admin who authenticated via OTP
 * and does not yet have a password. Fails if a password is already set.
 */
export async function setupCredentials(email: string, password: string): Promise<void> {
  if (!currentSession) throw new Error('No active session');
  const res = await fetch(`${API_URL}/v1/me/credentials/setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
      'X-Device-Id': getDeviceId(),
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || error.message || 'Credential setup failed');
  }
}

/**
 * Change the password for the authenticated admin.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!currentSession) throw new Error('No active session');
  const res = await fetch(`${API_URL}/v1/me/credentials/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
      'X-Device-Id': getDeviceId(),
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || error.message || 'Password change failed');
  }
}

// Shared session shape from @scs/contracts (ADM-B3); the `AdminSessionInfo`
// alias is kept so existing admin importers are unaffected.
export type AdminSessionInfo = SessionInfo;

/**
 * List the authenticated admin's active sessions. The server marks `isCurrent`
 * from the caller's `sid` JWT claim (WEB-B3).
 */
export async function getSessions(): Promise<AdminSessionInfo[]> {
  if (!currentSession) throw new Error('No active session');
  const res = await fetch(`${API_URL}/v1/me/sessions`, {
    headers: { Authorization: `Bearer ${currentSession.accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return (await res.json()) as AdminSessionInfo[];
}

/**
 * Revoke all sessions for a specific device.
 */
export async function revokeSessionsByDevice(deviceId: string): Promise<void> {
  if (!currentSession) throw new Error('No active session');
  const res = await fetch(`${API_URL}/v1/me/sessions/revoke-by-device/${deviceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${currentSession.accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to revoke sessions: ${res.status}`);
}
