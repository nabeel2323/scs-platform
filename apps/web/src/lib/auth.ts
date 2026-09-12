/**
 * Auth session handling — JWT pair with refresh rotation.
 *
 * Used by the web app to manage authentication state.
 * Session is persisted to localStorage so it survives page refreshes.
 * Refresh token rotation handled transparently.
 *
 * Includes a lightweight event emitter so React components
 * (via AuthProvider / useAuth) can subscribe to auth changes.
 */

import { getDeviceId } from './device-id';
import type {
  AuthSession,
  AuthTokens,
  RefreshResponse,
  SwitchOrgResponse,
  DeviceCheckResponse,
  LoginPasswordResponse,
  SessionInfo,
  UserProfile,
} from '@scs/contracts';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const SESSION_KEY = 'scs_web_session';
const USER_KEY = 'scs_web_user';

// Session envelope + auth wire types are shared from @scs/contracts (ADM-B3) so
// web, admin and mobile stop redefining them. Re-exported to keep this module's
// public surface stable for existing importers of `AuthSession`.
export type { AuthSession };

export interface AuthUser {
  id: string;
  phone: string;
  fullName: string;
  activeOrgId?: string;
  role?: string;
  perms?: string[];
}

// ── Rate-limit (429) error ───────────────────────────────────

/**
 * Error carrying rate-limit context from a 429 so login UIs can show remaining
 * attempts and the lockout countdown (Quick win 5). Reads the standard
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

// ── In-memory session store (SSR-safe) ───────────────────────
let currentSession: AuthSession | null = null;
let currentUser: AuthUser | null = null;

// Single-flight guard for token refresh (WEB-B4). Concurrent 401s must share
// ONE rotation; parallel rotations trip the server's refresh-reuse detection
// and revoke the entire session chain, logging the user out.
let refreshPromise: Promise<AuthSession> | null = null;

// ── localStorage persistence (SSR-safe) ─────────────────────

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
      currentUser = JSON.parse(userRaw) as AuthUser;
    }
    // Notify listeners if we restored a session
    if (currentSession && currentUser) {
      notifyAuthChange();
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

function persistUser(user: AuthUser | null): void {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_KEY);
  }
}

// Restore on first import
restoreSession();

// ── Auth state change listeners (used by AuthProvider) ──────
type AuthListener = (user: AuthUser | null) => void;
const listeners = new Set<AuthListener>();

export function onAuthChange(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyAuthChange() {
  for (const fn of listeners) fn(currentUser);
}

export function getSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  return currentSession;
}

export function getUser(): AuthUser | null {
  return currentUser;
}

export function isAuthenticated(): boolean {
  const session = getSession();
  return session !== null && session.expiresAt > Date.now();
}

/** Whether the current user has merchant-level access (owner or staff). */
export function hasMerchantAccess(): boolean {
  const user = getUser();
  return user?.role === 'MERCHANT_OWNER' || user?.role === 'MERCHANT_STAFF';
}

/** Whether the current user has admin-level access. */
export function hasAdminAccess(): boolean {
  const user = getUser();
  return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
}

/** Set the current user (called after profile fetch). */
export function setCurrentUser(user: AuthUser | null) {
  currentUser = user;
  persistUser(user);
  notifyAuthChange();
}

// ── Auth flows ───────────────────────────────────────────────

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
        platform: 'web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    }),
  });
  if (!res.ok) throw new Error(`OTP verify failed: ${res.status}`);
  const data = (await res.json()) as AuthTokens;

  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 min
  };
  currentSession = session;
  persistSession(session);

  // Fetch user profile using the new access token
  try {
    const profileRes = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (profileRes.ok) {
      // /v1/me is the UserProfile contract; the server now resolves `role` for
      // the caller's active org, so the web hydrates it directly from the
      // profile (no client-side JWT decoding) — matching the admin projection.
      const profile = (await profileRes.json()) as UserProfile;
      currentUser = {
        id: profile.id,
        phone: profile.phone,
        fullName: profile.fullName,
        activeOrgId: profile.activeOrgId ?? undefined,
        role: profile.role ?? undefined,
        perms: profile.perms ?? undefined,
      };
      persistUser(currentUser);
      notifyAuthChange();
    }
  } catch {
    // Profile fetch is best-effort; session is still valid
  }

  return session;
}

export function refreshSession(): Promise<AuthSession> {
  // Coalesce concurrent refreshes into a single in-flight rotation (WEB-B4).
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

  // If a logout (or a newer refresh) superseded this call while it awaited the
  // network, drop the result rather than resurrecting a cleared session.
  if (!currentSession || currentSession.refreshToken !== refreshTokenUsed) {
    throw new Error('Refresh superseded');
  }

  const session: AuthSession = {
    accessToken: data.accessToken,
    // Rotation returns the next refresh token as `newRefreshToken` (the old
    // `?? data.refreshToken` fallback read a field the API never returns).
    refreshToken: data.newRefreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  currentSession = session;
  persistSession(session);
  return session;
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
    // Ignore logout errors — clear local state regardless
  }
  currentSession = null;
  currentUser = null;
  refreshPromise = null;
  persistSession(null);
  persistUser(null);
  notifyAuthChange();
}

export async function switchOrg(orgId: string): Promise<AuthSession> {
  if (!currentSession) throw new Error('No active session');

  const res = await fetch(`${API_URL}/v1/auth/switch-org`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
    },
    body: JSON.stringify({ orgId }),
  });
  if (!res.ok) throw new Error(`Switch org failed: ${res.status}`);
  const data = (await res.json()) as SwitchOrgResponse;

  const session: AuthSession = {
    ...currentSession,
    accessToken: data.accessToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  currentSession = session;
  persistSession(session);
  return session;
}

// ── Dual Authentication (Password Login) ────────────────────

/**
 * Check if device can auto-login for a given email.
 * Pre-flight check before showing login form.
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
 * Login with email and password.
 * Returns session if device is trusted, or requires OTP if device changed.
 */
export async function loginPassword(
  email: string,
  password: string,
  deviceId: string,
): Promise<AuthSession | { requiresOtp: true; otpPhone: string }> {
  const res = await fetch(`${API_URL}/v1/auth/login/password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify({
      email,
      password,
      deviceId,
      deviceInfo: {
        platform: 'web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many login attempts.');
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || error.message || 'Login failed');
  }

  const data = (await res.json()) as LoginPasswordResponse;

  // If OTP required, return that info
  if (data.requiresOtp) {
    return { requiresOtp: true, otpPhone: data.otpPhone ?? '' };
  }

  // Otherwise, create session
  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  currentSession = session;
  persistSession(session);

  // Fetch user profile
  try {
    const profileRes = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    if (profileRes.ok) {
      const profile = (await profileRes.json()) as UserProfile;
      currentUser = {
        id: profile.id,
        phone: profile.phone,
        fullName: profile.fullName,
        activeOrgId: profile.activeOrgId ?? undefined,
        role: profile.role ?? undefined,
        perms: profile.perms ?? undefined,
      };
      persistUser(currentUser);
      notifyAuthChange();
    }
  } catch {
    // Profile fetch is best-effort
  }

  return session;
}

/**
 * Set up email and password credentials.
 * User must be authenticated via OTP first.
 */
export async function setupCredentials(email: string, password: string): Promise<void> {
  if (!currentSession) throw new Error('No active session');

  const deviceId = typeof window !== 'undefined' ? localStorage.getItem('scs_device_id') || '' : '';

  const res = await fetch(`${API_URL}/v1/me/credentials/setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Credential setup failed');
  }
}

/**
 * Change password for authenticated user.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!currentSession) throw new Error('No active session');

  const deviceId = typeof window !== 'undefined' ? localStorage.getItem('scs_device_id') || '' : '';

  const res = await fetch(`${API_URL}/v1/me/credentials/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
      'X-Device-Id': deviceId,
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || 'Password change failed');
  }
}

/**
 * Get user's active sessions.
 */
export async function getSessions(): Promise<SessionInfo[]> {
  if (!currentSession) throw new Error('No active session');

  const res = await fetch(`${API_URL}/v1/me/sessions`, {
    headers: { Authorization: `Bearer ${currentSession.accessToken}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return (await res.json()) as SessionInfo[];
}

/**
 * Revoke sessions by device ID.
 */
export async function revokeSessionsByDevice(deviceId: string): Promise<void> {
  if (!currentSession) throw new Error('No active session');

  const res = await fetch(`${API_URL}/v1/me/sessions/revoke-by-device/${deviceId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${currentSession.accessToken}` },
  });

  if (!res.ok) throw new Error(`Failed to revoke sessions: ${res.status}`);
}

// ── Authenticated fetch helper ───────────────────────────────

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!currentSession) {
    // Return a synthetic 401 so callers handle it via res.ok instead of try/catch
    return new Response(JSON.stringify({ detail: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/problem+json' },
    });
  }

  // Auto-refresh if token expires within 60s
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

  // Handle 401 — attempt one refresh then retry
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
