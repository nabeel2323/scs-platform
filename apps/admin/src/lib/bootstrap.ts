/**
 * Bootstrap API client — unauthenticated initial Super Admin setup (ADR-0004).
 *
 * These endpoints are deliberately NOT authenticated (there is no session yet).
 * They use plain `fetch` (not `authFetch`, which requires a session).
 *
 * UI-driven bootstrap flow:
 *   1. GET    status        — readiness + masked owner email hint
 *   2. POST   owner-otp/request — send OTP to the configured owner only
 *   3. POST   owner-otp/verify  — verify OTP, receive a short-lived authorization
 *   4. POST   super-admin   — consume the authorization and create the Super Admin
 *
 * The bootstrap authorization returned by owner-otp/verify is treated as a
 * secret: it is returned to the caller to hold in frontend memory only and is
 * NEVER persisted by this client (no localStorage, sessionStorage, URL, or
 * logging).
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

export interface BootstrapStatus {
  initialized: boolean;
  bootstrapAvailable: boolean;
  setupRequired: boolean;
  ownerVerificationRequired: boolean;
  ownerEmailConfigured: boolean;
  ownerEmailHint: string | null;
}

export interface OwnerOtpRequestResult {
  success: boolean;
  deliveryStatus: string;
  possiblyDelivered: boolean | null;
  emailHint: string;
}

export interface OwnerOtpVerifyResult {
  /** Short-lived, single-use bootstrap authorization — frontend memory only. */
  authorization: string;
  expiresInSeconds: number;
}

export class BootstrapError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BootstrapError';
  }
}

async function bootstrapRequest(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${API_URL}/v1/system/bootstrap/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  return res;
}

/** Authoritative initialization status (API-owned). */
export async function fetchBootstrapStatus(): Promise<BootstrapStatus> {
  const res = await bootstrapRequest('status');
  if (!res.ok) {
    throw new BootstrapError(res.status, `Bootstrap status check failed (${res.status})`);
  }
  return (await res.json()) as BootstrapStatus;
}

/** Request a bootstrap OTP addressed only to the configured platform owner. */
export async function requestOwnerOtp(
  email: string,
): Promise<OwnerOtpRequestResult> {
  const res = await bootstrapRequest('owner-otp/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message =
      body['detail'] || body['message'] || `Owner verification request failed (${res.status})`;
    throw new BootstrapError(res.status, String(message), body);
  }
  return (await res.json()) as OwnerOtpRequestResult;
}

/** Verify a bootstrap OTP and receive a short-lived single-use authorization.
 *
 * The returned authorization is a secret: the caller must hold it in memory
 * only and must not persist it anywhere. */
export async function verifyOwnerOtp(
  email: string,
  otp: string,
): Promise<OwnerOtpVerifyResult> {
  const res = await bootstrapRequest('owner-otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message =
      body['detail'] || body['message'] || `Owner verification failed (${res.status})`;
    throw new BootstrapError(res.status, String(message), body);
  }
  return (await res.json()) as OwnerOtpVerifyResult;
}

/** Provision the initial Super Admin by consuming a single-use authorization. */
export async function createSuperAdmin(dto: {
  authorizationToken: string;
  fullName: string;
  email: string;
  password: string;
}): Promise<{ status: 'initialized'; loginUrl: string }> {
  const res = await bootstrapRequest('super-admin', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message =
      body['detail'] || body['message'] || `Setup failed (${res.status})`;
    throw new BootstrapError(res.status, String(message), body);
  }
  return (await res.json()) as { status: 'initialized'; loginUrl: string };
}
