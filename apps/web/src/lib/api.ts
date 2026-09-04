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

export async function fetchMyOrganizations(): Promise<(Organization & { membershipStatus: string })[]> {
  const res = await authFetch(`${API_URL}/v1/me/organizations`);
  if (!res.ok) throw new Error(`Failed to fetch organizations: ${res.status}`);
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

export async function registerDocument(input: {
  orgId: string;
  storeId?: string;
  docType: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
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
