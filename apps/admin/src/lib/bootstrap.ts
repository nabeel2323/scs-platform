/**
 * Bootstrap API client — unauthenticated initial Super Admin setup (ADR-0004).
 *
 * These endpoints are deliberately NOT authenticated (there is no session yet).
 * They use plain `fetch` (not `authFetch`, which requires a session). The
 * bootstrap authorization token is treated as a secret: it is never logged and
 * never stored by this client.
 */

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

export interface BootstrapStatus {
  initialized: boolean;
  bootstrapAvailable: boolean;
  setupRequired: boolean;
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

/** Provision the initial Super Admin with a single-use bootstrap authorization. */
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
