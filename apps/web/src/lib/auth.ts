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
import { DEVICE_TRUST_PROOF_HEADER, DEVICE_TRUST_PROOF_VALUE } from '@scs/contracts';
import type {
  AuthSession,
  AuthTokens,
  RefreshResponse,
  SwitchOrgResponse,
  DeviceCheckResponse,
  LoginPasswordResponse,
  SessionInfo,
  UserProfile,
  EmailOtpRequestResponse,
  OtpRequestResponse,
  AccountLinkResponse,
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
  /**
   * Nullable from S1.35 onward. Migration 0064 drops the NOT NULL constraint on
   * `users.phone` and `UserProfileSchema` therefore became `z.string().nullable()`,
   * so an email-first account legitimately has no phone. Callers must not render or
   * forward this as if it were always present.
   */
  phone: string | null;
  /** Nullable — email-only accounts may have no phone; phone-only accounts may have no email. */
  email: string | null;
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

// ── Device-trust transport (S-1) ─────────────────────────────

/**
 * Request init for the calls where device trust matters: OTP verify (phone and
 * email), password login, refresh and logout.
 *
 * `credentials: 'include'` is what lets the browser attach and accept the
 * server-issued HttpOnly credential across origins, and the `x-device-trust`
 * proof header is what makes the server believe the request came from our own
 * page rather than from a third-party one that could also cause the cookie to
 * be attached (SameSite=None is unavoidable with the frontend and API on
 * different sites). Both are documented in `@scs/contracts`.
 *
 * Sending neither is the fail-closed case: the device simply counts as
 * untrusted and an OTP is required, so this is a correctness fix for the login
 * flow, not a security exemption.
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

/**
 * Whether a role key denotes merchant-side membership (owner or staff).
 * Consumed by components that gate UI from `useAuth().user` instead of the
 * imperative helper below, so the render stays reactive (and hydration-safe).
 */
export function isMerchantRole(role?: string | null): boolean {
  return role === 'MERCHANT_OWNER' || role === 'MERCHANT_STAFF';
}

/** Whether the current user has merchant-level access (owner or staff). */
export function hasMerchantAccess(): boolean {
  return isMerchantRole(getUser()?.role);
}

/** Whether the current user has admin-level access. */
export function hasAdminAccess(): boolean {
  const user = getUser();
  return user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
}

/** Check if the current user has a specific permission key (GAP-2/3). */
export function hasPerm(perm: string): boolean {
  const perms = getUser()?.perms ?? [];
  return perms.includes(perm);
}

/** Check if the current user has ALL specified permission keys (GAP-3). */
export function hasAllPerms(perms: string[]): boolean {
  const userPerms = getUser()?.perms ?? [];
  return perms.every((p) => userPerms.includes(p));
}

/** Set the current user (called after profile fetch). */
export function setCurrentUser(user: AuthUser | null) {
  currentUser = user;
  persistUser(user);
  notifyAuthChange();
}

/**
 * Refresh the cached user from GET /v1/me — the server-side source of truth for
 * the role/permissions projected for the caller's *active* organization. Called
 * after every flow that mints a token (OTP verify, password login, switch-org)
 * so client-side gating always matches what PermissionsGuard enforces.
 */
async function hydrateUserFromProfile(accessToken: string): Promise<void> {
  try {
    const profileRes = await fetch(`${API_URL}/v1/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) return;
    const profile = (await profileRes.json()) as UserProfile;
    currentUser = {
      id: profile.id,
      phone: profile.phone,
      email: profile.email,
      fullName: profile.fullName,
      activeOrgId: profile.activeOrgId ?? undefined,
      role: profile.role ?? undefined,
      perms: profile.perms ?? undefined,
    };
    persistUser(currentUser);
    notifyAuthChange();
  } catch {
    // Profile fetch is best-effort; the session stays valid
  }
}

// ── Auth flows ───────────────────────────────────────────────

export async function requestOtp(
  phone: string,
  channel: 'sms' | 'whatsapp' = 'sms',
): Promise<OtpRequestResponse> {
  const res = await fetch(`${API_URL}/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, channel }),
  });
  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many OTP attempts.');
    if (res.status === 400) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Invalid phone number');
    }
    throw new Error(`OTP request failed: ${res.status}`);
  }
  return res.json();
}

export async function verifyOtp(phone: string, otp: string): Promise<AuthSession> {
  // A verified OTP enrols this browser: the response sets the device-trust
  // cookie, which is only stored when the request is made with credentials.
  const res = await fetch(
    `${API_URL}/v1/auth/otp/verify`,
    trustRequest({
      phone,
      otp,
      deviceId: getDeviceId(),
      deviceInfo: {
        platform: 'web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    }),
  );
  if (!res.ok) throw new Error(`OTP verify failed: ${res.status}`);
  const data = (await res.json()) as AuthTokens;

  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000, // 15 min
  };
  currentSession = session;
  persistSession(session);

  // Fetch the projected role/perms for the active org using the new token
  await hydrateUserFromProfile(session.accessToken);

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
  // Rotation carries the device credential so trust survives the 15-minute
  // token cycle: without it a actively-used browser would silently degrade to
  // "untrusted" and be challenged for an OTP at its next login.
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
    // Logout revokes this device's credential server-side and clears the
    // cookie, so a later sign-in on this browser answers one OTP. Signing out
    // while remaining "trusted" was the weakness finding S-1 removed.
    await fetch(
      `${API_URL}/v1/auth/logout`,
      trustRequest(
        { refreshToken: currentSession.refreshToken },
        { Authorization: `Bearer ${currentSession.accessToken}` },
      ),
    );
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
  // The projected role/permissions are per-organization, so refresh the cached
  // user (audit A2-2) — otherwise client-side gating keeps the previous org's
  // role until the next full login.
  await hydrateUserFromProfile(session.accessToken);
  return session;
}

// ── Dual Authentication (Password Login) ────────────────────

/**
 * POST /v1/auth/login/device-check — kept only because the route is published.
 *
 * The response is a CONSTANT and carries no information (finding S-2): an
 * unauthenticated caller is told nothing about whether the address exists, has
 * a password, or has been trusted before. Nothing here branches on it, and the
 * login page no longer probes it on mount. Trust is evaluated server-side,
 * from the credential, when the password is actually verified.
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
 * Login with email and password.
 * Returns a session when the device is trusted, or the OTP challenge when it is
 * not — including how confidently that challenge was delivered.
 *
 * `deviceId` is provenance only (S-1): copying it from a trusted browser grants
 * nothing, because trust comes from the HttpOnly credential plus the proof
 * header.
 */
export async function loginPassword(
  email: string,
  password: string,
  deviceId: string,
): Promise<
  AuthSession | {
    requiresOtp: true;
    /** Empty when the challenge went by email — see `otpEmail`. */
    otpPhone: string;
    /**
     * Masked address the API sent the second factor to. Present only on the
     * email channel, which is the only channel the initial staging release
     * permits. Dropping it left the page rendering a phone prompt for a
     * challenge that lives under an email key and can never be verified there.
     */
    otpEmail?: string;
    otpDelivery?: 'accepted' | 'uncertain';
  }
> {
  const res = await fetch(
    `${API_URL}/v1/auth/login/password`,
    trustRequest(
      {
        email,
        password,
        deviceId,
        deviceInfo: {
          platform: 'web',
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        },
      },
      { 'X-Device-Id': deviceId },
    ),
  );

  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many login attempts.');
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || error.message || 'Login failed');
  }

  const data = (await res.json()) as LoginPasswordResponse;

  // If OTP required, return that info — including which channel carried the
  // challenge and whether delivery was confirmed, so the UI never writes "code
  // sent" when the API did not say so, and never renders a phone prompt for a
  // challenge that was issued against an email address.
  if (data.requiresOtp) {
    return {
      requiresOtp: true,
      otpPhone: data.otpPhone ?? '',
      otpEmail: data.otpEmail,
      otpDelivery: data.otpDelivery,
    };
  }

  // Otherwise, create session
  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  currentSession = session;
  persistSession(session);

  // Fetch the projected role/perms for the active org
  await hydrateUserFromProfile(session.accessToken);

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

// ── Email OTP flows (S1.35 Phase 1, S1.38 Web integration) ──

/**
 * Request an OTP to the given email address.
 * Enumeration-safe: returns the same shape whether or not the email exists.
 */
export async function requestEmailOtp(
  email: string,
): Promise<EmailOtpRequestResponse> {
  const res = await fetch(`${API_URL}/v1/auth/otp/email/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many OTP attempts.');
    if (res.status === 400) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).message || 'Invalid email address');
    }
    throw new Error(`Email OTP request failed: ${res.status}`);
  }
  return (await res.json()) as EmailOtpRequestResponse;
}

/**
 * Verify an email OTP and create/resume a session.
 * On success the server issues a JWT pair and the session is persisted locally.
 */
export async function verifyEmailOtp(
  email: string,
  otp: string,
): Promise<AuthSession> {
  // Like phone OTP verify, this response enrols the browser via Set-Cookie.
  const res = await fetch(
    `${API_URL}/v1/auth/otp/email/verify`,
    trustRequest({
      email,
      otp,
      deviceId: getDeviceId(),
      deviceInfo: {
        platform: 'web',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      },
    }),
  );
  if (!res.ok) {
    if (res.status === 429) throw await toRateLimitError(res, 'Too many verification attempts.');
    throw new Error(`Email OTP verify failed: ${res.status}`);
  }
  const data = (await res.json()) as AuthTokens;

  const session: AuthSession = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
  currentSession = session;
  persistSession(session);
  await hydrateUserFromProfile(session.accessToken);
  return session;
}

// ── Account linking (S1.35 Phase 1, S1.38 Web integration) ──

/** Link a verified email to the authenticated user's account. */
export async function linkEmail(email: string, otp: string): Promise<AccountLinkResponse> {
  if (!currentSession) throw new Error('No active session');
  const res = await fetch(`${API_URL}/v1/auth/account/link-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
    },
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).message || `Link email failed: ${res.status}`);
  }
  return (await res.json()) as AccountLinkResponse;
}

/** Link a verified phone to the authenticated user's account. */
export async function linkPhone(phone: string, otp: string): Promise<AccountLinkResponse> {
  if (!currentSession) throw new Error('No active session');
  const res = await fetch(`${API_URL}/v1/auth/account/link-phone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
    },
    body: JSON.stringify({ phone, otp }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).message || `Link phone failed: ${res.status}`);
  }
  return (await res.json()) as AccountLinkResponse;
}

/** Unlink email from the authenticated user's account. */
export async function unlinkEmail(): Promise<AccountLinkResponse> {
  if (!currentSession) throw new Error('No active session');
  const res = await fetch(`${API_URL}/v1/auth/account/unlink-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).message || `Unlink email failed: ${res.status}`);
  }
  return (await res.json()) as AccountLinkResponse;
}

/** Unlink phone from the authenticated user's account. */
export async function unlinkPhone(): Promise<AccountLinkResponse> {
  if (!currentSession) throw new Error('No active session');
  const res = await fetch(`${API_URL}/v1/auth/account/unlink-phone`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${currentSession.accessToken}`,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).message || `Unlink phone failed: ${res.status}`);
  }
  return (await res.json()) as AccountLinkResponse;
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
