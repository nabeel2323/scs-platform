/**
 * Admin auth session handling — JWT pair with refresh rotation.
 *
 * Mirrors the web auth module but targets the admin app's session context.
 * Admin users authenticate via the same OTP flow but with SUPER_ADMIN / ADMIN roles.
 *
 * Session is persisted to localStorage so it survives page refreshes.
 */

import { getDeviceId } from './device-id';
import type {
  AuthSession,
  AuthTokens,
  RefreshResponse,
  DeviceCheckResponse,
  LoginPasswordResponse,
  SessionInfo,
  UserProfile,
} from '@scs/contracts';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const SESSION_KEY = 'scs_admin_session';
const USER_KEY = 'scs_admin_user';

// Session envelope + auth wire types are shared from @scs/contracts (ADM-B3) so
// web, admin and mobile stop redefining them. Re-exported to keep this module's
// public surface stable for existing importers of `AuthSession`.
export type { AuthSession };

export interface AdminUser {
  id: string;
  phone: string;
  fullName: string;
  role: string; // SUPER_ADMIN | ADMIN | MODERATOR
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

export async function requestOtp(phone: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_URL}/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many OTP attempts.');
    throw new Error(`OTP request failed: ${res.status}`);
  }
  return res.json();
}

export async function verifyOtp(phone: string, otp: string): Promise<AuthSession> {
  const res = await fetch(`${API_URL}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone,
      otp,
      deviceId: getDeviceId(),
      deviceInfo: {
        platform: 'admin-web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    }),
  });
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
  const res = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
    },
    body: JSON.stringify({ refreshToken: refreshTokenUsed }),
  });
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
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentSession.accessToken}`,
      },
      body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
    });
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
 * Pre-flight device-trust check for a given email.
 */
export async function checkDeviceLogin(
  email: string,
  deviceId: string,
): Promise<DeviceCheckResponse> {
  const res = await fetch(`${API_URL}/v1/auth/login/device-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, deviceId }),
  });
  if (!res.ok) throw new Error(`Device check failed: ${res.status}`);
  return (await res.json()) as DeviceCheckResponse;
}

/**
 * Login with email and password. Returns a session when the device is trusted,
 * or { requiresOtp, otpPhone } when the device is new and OTP is required.
 */
export async function loginPassword(
  email: string,
  password: string,
  deviceId: string,
): Promise<AuthSession | { requiresOtp: true; otpPhone: string }> {
  const res = await fetch(`${API_URL}/v1/auth/login/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId },
    body: JSON.stringify({
      email,
      password,
      deviceId,
      deviceInfo: {
        platform: 'admin-web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many login attempts.');
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || error.message || `Login failed: ${res.status}`);
  }

  const data = (await res.json()) as LoginPasswordResponse;
  if (data.requiresOtp) {
    return { requiresOtp: true, otpPhone: data.otpPhone ?? '' };
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
