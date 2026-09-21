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
