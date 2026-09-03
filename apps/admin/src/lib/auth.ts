/**
 * Admin auth session handling — JWT pair with refresh rotation.
 *
 * Mirrors the web auth module but targets the admin app's session context.
 * Admin users authenticate via the same OTP flow but with SUPER_ADMIN / ADMIN roles.
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

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

let currentSession: AuthSession | null = null;
let currentUser: AdminUser | null = null;

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
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
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
}

export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!currentSession) throw new Error('Not authenticated');

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
