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

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const SESSION_KEY = 'scs_web_session';
const USER_KEY = 'scs_web_user';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AuthUser {
  id: string;
  phone: string;
  fullName: string;
  activeOrgId?: string;
  role?: string;
}

// ── In-memory session store (SSR-safe) ───────────────────────
let currentSession: AuthSession | null = null;
let currentUser: AuthUser | null = null;

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
  if (!res.ok) throw new Error(`OTP request failed: ${res.status}`);
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
  const data = await res.json();

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
      const profile = await profileRes.json();
      currentUser = {
        id: profile.id,
        phone: profile.phone,
        fullName: profile.fullName,
        activeOrgId: profile.activeOrgId ?? undefined,
        role: profile.role,
      };
      persistUser(currentUser);
      notifyAuthChange();
    }
  } catch {
    // Profile fetch is best-effort; session is still valid
  }

  return session;
}

export async function refreshSession(): Promise<AuthSession> {
  if (!currentSession) throw new Error('No session to refresh');

  const res = await fetch(`${API_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
    },
    body: JSON.stringify({ refreshToken: currentSession.refreshToken }),
  });
  if (!res.ok) {
    currentSession = null;
    currentUser = null;
    throw new Error(`Refresh failed: ${res.status}`);
  }
  const data = await res.json();

  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.newRefreshToken ?? data.refreshToken,
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
  const data = await res.json();

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
export async function checkDeviceLogin(email: string, deviceId: string): Promise<{
  canAutoLogin: boolean;
  requiresOtp: boolean;
  hasPassword: boolean;
}> {
  const res = await fetch(`${API_URL}/v1/auth/login/device-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, deviceId }),
  });
  if (!res.ok) throw new Error(`Device check failed: ${res.status}`);
  return res.json();
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
    const error = await res.json();
    throw new Error(error.message || 'Login failed');
  }

  const data = await res.json();

  // If OTP required, return that info
  if (data.requiresOtp) {
    return { requiresOtp: true, otpPhone: data.otpPhone };
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
      const profile = await profileRes.json();
      currentUser = {
        id: profile.id,
        phone: profile.phone,
        fullName: profile.fullName,
        activeOrgId: profile.activeOrgId ?? undefined,
        role: profile.role,
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
export async function getSessions(): Promise<Array<{
  id: string;
  device: string;
  deviceId: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
  isRevoked: boolean;
}>> {
  if (!currentSession) throw new Error('No active session');

  const res = await fetch(`${API_URL}/v1/me/sessions`, {
    headers: { Authorization: `Bearer ${currentSession.accessToken}` },
  });

  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  return res.json();
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
