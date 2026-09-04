/**
 * Admin auth session handling — JWT pair with refresh rotation.
 *
 * Mirrors the web auth module but targets the admin app's session context.
 * Admin users authenticate via the same OTP flow but with SUPER_ADMIN / ADMIN roles.
 *
 * Session is persisted to localStorage so it survives page refreshes.
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';
const SESSION_KEY = 'scs_admin_session';
const USER_KEY = 'scs_admin_user';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface AdminUser {
  id: string;
  phone: string;
  fullName: string;
  role: string; // SUPER_ADMIN | ADMIN | MODERATOR
}

// ── Restore persisted session on module load ─────────────────

let currentSession: AuthSession | null = null;
let currentUser: AdminUser | null = null;

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

  currentSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  persistSession(currentSession);

  // Decode JWT to populate user info (sub, role claims)
  try {
    const payload = JSON.parse(atob(data.accessToken.split('.')[1]!));
    currentUser = {
      id: payload.sub,
      phone,
      fullName: payload.fullName || 'Admin',
      role: payload.role || 'ADMIN',
    };
    persistUser(currentUser);
  } catch { /* JWT decode failed — user will be populated on next profile fetch */ }

  return currentSession;
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

  currentSession = {
    accessToken: data.accessToken,
    refreshToken: data.newRefreshToken ?? data.refreshToken,
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
  } catch { /* ignore */ }
  currentSession = null;
  currentUser = null;
  persistSession(null);
  persistUser(null);
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
