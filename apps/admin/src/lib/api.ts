/**
 * Admin API client — verification queue, merchant management.
 */
import { authFetch } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

// ── Types ────────────────────────────────────────────────────

export interface VerificationRequest {
  id: string;
  storeId: string;
  orgId: string;
  status: string;
  submittedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decisionNotes: string | null;
  rejectionReasons: string[] | null;
  autoVerified: boolean;
  submittedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  orgId: string;
  slug: string;
  displayName: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  currency: string;
  timezone: string;
  locale: string;
  status: string;
  verificationStatus: string;
  address: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessDocument {
  id: string;
  orgId: string;
  storeId: string | null;
  docType: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  storageUrl: string | null;
  verificationStatus: string;
  uploadedBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

// ── Verification Queue ───────────────────────────────────────

export async function fetchVerificationQueue(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<VerificationRequest[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  const url = `${API_URL}/v1/verification/queue${qs ? `?${qs}` : ''}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch verification queue: ${res.status}`);
  return res.json();
}

export async function fetchVerificationRequest(id: string): Promise<VerificationRequest> {
  const res = await authFetch(`${API_URL}/v1/verification/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch verification request: ${res.status}`);
  return res.json();
}

export async function reviewVerification(
  id: string,
  decision: 'APPROVED' | 'REJECTED' | 'REVISION',
  notes?: string,
  rejectionReasons?: string[],
): Promise<VerificationRequest> {
  const res = await authFetch(`${API_URL}/v1/verification/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, notes, rejectionReasons }),
  });
  if (!res.ok) throw new Error(`Failed to review verification: ${res.status}`);
  return res.json();
}

// ── Stores ───────────────────────────────────────────────────

export async function fetchStores(params?: {
  status?: string;
  verificationStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<Store[]> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.verificationStatus) searchParams.set('verificationStatus', params.verificationStatus);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const qs = searchParams.toString();
  const url = `${API_URL}/v1/stores${qs ? `?${qs}` : ''}`;
  const res = await authFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch stores: ${res.status}`);
  return res.json();
}

export async function fetchStore(id: string): Promise<Store> {
  const res = await authFetch(`${API_URL}/v1/stores/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch store: ${res.status}`);
  return res.json();
}

// ── Documents ────────────────────────────────────────────────

export async function fetchStoreDocuments(storeId: string): Promise<BusinessDocument[]> {
  const res = await authFetch(`${API_URL}/v1/documents/store/${storeId}`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`);
  return res.json();
}

export async function fetchOrgDocuments(orgId: string): Promise<BusinessDocument[]> {
  const res = await authFetch(`${API_URL}/v1/documents/org/${orgId}`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`);
  return res.json();
}
