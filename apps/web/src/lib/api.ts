/**
 * Web API client — merchant store management.
 */
import { authFetch } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

// ── Types ────────────────────────────────────────────────────

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
