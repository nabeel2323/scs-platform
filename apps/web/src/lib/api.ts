/**
 * Web API client — merchant store management.
 */
import { authFetch } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

// ── Types ────────────────────────────────────────────────────

export interface Organization {
  id: string;
  type: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  country: string;
  verificationStatus: string;
  inviteCode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  locale: string;
  status: string;
  /** Current role in the active org, resolved server-side (mirrors @scs/contracts). */
  role: string;
  activeOrgId: string | null;
  organizations: (Organization & { membershipStatus: string })[];
  createdAt: string;
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
  /**
   * PHASE 23: buyer-facing privacy toggle consumed by
   * `listOffersForProductRanked`. Default false — server column is NOT NULL so
   * the field is always present on any read after migration 0030.
   */
  hidePopularityBadge: boolean;
  address: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Warehouse {
  id: string;
  storeId: string;
  name: string;
  address: Record<string, unknown>;
  managerName: string | null;
  managerPhone: string | null;
  status: string;
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
  verificationStatus: string;
  createdAt: string;
}

// ── Profile & Organizations ──────────────────────────────────

export async function fetchProfile(): Promise<UserProfile> {
  const res = await authFetch(`${API_URL}/v1/me`);
  if (!res.ok) throw new Error(`Failed to fetch profile: ${res.status}`);
  return res.json();
}

export async function updateProfile(data: {
  fullName?: string;
  email?: string;
  locale?: string;
}): Promise<UserProfile> {
  const res = await authFetch(`${API_URL}/v1/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update profile: ${res.status}`);
  return res.json();
}

export async function createOrganization(data: {
  name: string;
  type: string;
  country: string;
  legalName?: string;
  taxId?: string;
}): Promise<Organization> {
  const res = await authFetch(`${API_URL}/v1/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create organization: ${res.status}`);
  return res.json();
}

export async function joinOrganization(code: string): Promise<Organization> {
  const res = await authFetch(`${API_URL}/v1/organizations/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || err.message || `Failed to join organization: ${res.status}`);
  }
  return res.json();
}

export async function fetchMyOrganizations(): Promise<(Organization & { membershipStatus: string })[]> {
  const res = await authFetch(`${API_URL}/v1/me/organizations`);
  if (!res.ok) throw new Error(`Failed to fetch organizations: ${res.status}`);
  return res.json();
}

export interface OrgMember {
  userId: string;
  fullName: string;
  phone: string;
  roleKey: string;
  status: string;
  joinedAt: string;
}

export async function fetchOrganization(id: string): Promise<Organization> {
  const res = await authFetch(`${API_URL}/v1/organizations/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch organization: ${res.status}`);
  return res.json();
}

export async function updateOrganization(
  id: string,
  data: { name?: string; legalName?: string; taxId?: string },
): Promise<Organization> {
  const res = await authFetch(`${API_URL}/v1/organizations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update organization: ${res.status}`);
  return res.json();
}

export async function fetchOrgMembers(orgId: string): Promise<OrgMember[]> {
  const res = await authFetch(`${API_URL}/v1/organizations/${orgId}/members`);
  if (!res.ok) throw new Error(`Failed to fetch members: ${res.status}`);
  return res.json();
}

export async function addOrgMember(orgId: string, userId: string, roleId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/organizations/${orgId}/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, roleId }),
  });
  if (!res.ok) throw new Error(`Failed to add member: ${res.status}`);
  return res.json();
}

export async function removeOrgMember(orgId: string, userId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/organizations/${orgId}/members/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to remove member: ${res.status}`);
  return res.json();
}

export interface UserLookupResult {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
}

export async function lookupOrgMember(orgId: string, query: string): Promise<UserLookupResult[]> {
  const res = await authFetch(`${API_URL}/v1/organizations/${orgId}/member-lookup?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Failed to lookup user: ${res.status}`);
  return res.json();
}

export interface RoleInfo {
  id: string;
  key: string;
  name: string;
}

export async function fetchRoles(): Promise<RoleInfo[]> {
  const res = await authFetch(`${API_URL}/v1/roles`);
  if (!res.ok) throw new Error(`Failed to fetch roles: ${res.status}`);
  return res.json();
}

// ── Stores ───────────────────────────────────────────────────

export async function createStore(input: {
  orgId: string;
  displayName: string;
  description?: string;
  currency?: string;
  locale?: string;
  timezone?: string;
  address?: Record<string, unknown>;
}): Promise<Store> {
  const res = await authFetch(`${API_URL}/v1/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create store: ${res.status}`);
  return res.json();
}

export async function fetchMyStores(): Promise<Store[]> {
  const res = await authFetch(`${API_URL}/v1/stores`);
  if (!res.ok) throw new Error(`Failed to fetch stores: ${res.status}`);
  return res.json();
}

export async function fetchStore(id: string): Promise<Store> {
  const res = await authFetch(`${API_URL}/v1/stores/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch store: ${res.status}`);
  return res.json();
}

export async function updateStore(id: string, input: Record<string, unknown>): Promise<Store> {
  const res = await authFetch(`${API_URL}/v1/stores/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to update store: ${res.status}`);
  return res.json();
}

// ── Warehouses ───────────────────────────────────────────────

export async function createWarehouse(storeId: string, input: {
  name: string;
  address?: Record<string, unknown>;
  managerName?: string;
  managerPhone?: string;
}): Promise<Warehouse> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/warehouses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create warehouse: ${res.status}`);
  return res.json();
}

// ── Documents ────────────────────────────────────────────────

export async function fetchOrgDocuments(orgId: string): Promise<BusinessDocument[]> {
  const res = await authFetch(`${API_URL}/v1/documents/org/${orgId}`);
  if (!res.ok) throw new Error(`Failed to fetch documents: ${res.status}`);
  return res.json();
}

/** Request a presigned download URL for a verification document (merchant-accessible). */
export async function presignDocumentDownload(id: string): Promise<string> {
  const res = await authFetch(`${API_URL}/v1/documents/${id}/merchant-presign`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to presign document download: ${res.status}`);
  const body = (await res.json()) as { downloadUrl: string };
  return body.downloadUrl;
}

// ── Verification history (merchant-facing) ───────────────────

export interface VerificationRequestInfo {
  id: string;
  storeId: string;
  orgId: string;
  status: string; // SUBMITTED | UNDER_REVIEW | APPROVED | REJECTED | REVISION
  decisionNotes: string | null;
  rejectionReasons: string[];
  submittedAt: string;
  reviewedAt: string | null;
}

/** Verification requests for the org's stores, newest first (org members only). */
export async function fetchOrgVerifications(orgId: string): Promise<VerificationRequestInfo[]> {
  const res = await authFetch(`${API_URL}/v1/verification/org/${orgId}`);
  if (!res.ok) throw new Error(`Failed to fetch verification history: ${res.status}`);
  return res.json();
}

export interface OrgUpdateRequest {
  id: string;
  orgId: string;
  requestedBy: string;
  payload: { name?: string; legalName?: string; taxId?: string };
  status: string; // PENDING | APPROVED | REJECTED
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/** Submit proposed changes to org details for admin approval (used when VERIFIED). */
export async function submitOrgUpdateRequest(
  orgId: string,
  data: { name?: string; legalName?: string; taxId?: string },
): Promise<OrgUpdateRequest> {
  const res = await authFetch(`${API_URL}/v1/organizations/${orgId}/update-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message ?? `Failed to submit update request: ${res.status}`);
  }
  return res.json();
}

/** Update requests for an org, newest first (org members only). */
export async function fetchOrgUpdateRequests(orgId: string): Promise<OrgUpdateRequest[]> {
  const res = await authFetch(`${API_URL}/v1/organizations/${orgId}/update-requests`);
  if (!res.ok) throw new Error(`Failed to fetch update requests: ${res.status}`);
  return res.json();
}

export async function presignDocumentUpload(input: {
  fileName: string;
  mimeType: string;
}): Promise<{ uploadUrl: string; storageKey: string }> {
  const res = await authFetch(`${API_URL}/v1/documents/presign-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to presign document upload: ${res.status}`);
  return res.json();
}

export async function registerDocument(input: {
  orgId: string;
  storeId?: string;
  docType: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  storageKey?: string;
}): Promise<BusinessDocument> {
  const res = await authFetch(`${API_URL}/v1/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to register document: ${res.status}`);
  return res.json();
}

// ── Verification ─────────────────────────────────────────────

export async function submitVerification(storeId: string): Promise<unknown> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/verify`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to submit verification: ${res.status}`);
  return res.json();
}

// ── Warehouses (fetch & update) ──────────────────────────────

export async function fetchWarehouses(storeId: string): Promise<Warehouse[]> {
  const res = await authFetch(`${API_URL}/v1/stores/${storeId}/warehouses`);
  if (!res.ok) throw new Error(`Failed to fetch warehouses: ${res.status}`);
  return res.json();
}

export async function updateWarehouse(
  id: string,
  data: { name?: string; address?: Record<string, string>; managerName?: string; managerPhone?: string },
): Promise<Warehouse> {
  const res = await authFetch(`${API_URL}/v1/warehouses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update warehouse: ${res.status}`);
  return res.json();
}

// ── Catalog Requests (PHASE COS-12) ──────────────────────────

export interface CatalogRequest {
  id: string;
  storeId: string;
  requestedBy: string | null;
  type: 'CATEGORY' | 'BRAND' | 'ATTRIBUTE' | 'OPTION';
  payload: Record<string, unknown>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchMerchantRequests(storeId: string): Promise<CatalogRequest[]> {
  const res = await authFetch(`${API_URL}/v1/merchant/requests?storeId=${encodeURIComponent(storeId)}`);
  if (!res.ok) throw new Error(`Failed to fetch catalog requests: ${res.status}`);
  return res.json();
}

export async function createCatalogRequest(data: {
  storeId: string;
  requestedBy?: string;
  type: 'CATEGORY' | 'BRAND' | 'ATTRIBUTE' | 'OPTION';
  payload: Record<string, unknown>;
}): Promise<CatalogRequest> {
  const res = await authFetch(`${API_URL}/v1/merchant/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create catalog request: ${res.status}`);
  return res.json();
}
