/**
 * Auth session handling — JWT pair with refresh rotation.
 *
 * Used by both web and admin apps to manage authentication state.
 * Tokens stored in memory (not localStorage) for security;
 * refresh token rotation handled transparently.
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

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
    body: JSON.stringify({ phone, otp }),
  });
  if (!res.ok) throw new Error(`OTP verify failed: ${res.status}`);
  const data = await res.json();

  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 min
  };
  currentSession = session;
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
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  currentSession = session;
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
  return session;
}

// ── Authenticated fetch helper ───────────────────────────────

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!currentSession) throw new Error('Not authenticated');

  // Auto-refresh if token expires within 60s
  if (currentSession.expiresAt - Date.now() < 60_000) {
    await refreshSession();
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
    await refreshSession();
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
