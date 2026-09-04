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
  // Enriched fields from join with stores/organizations
  storeName?: string | null;
  storeSlug?: string | null;
  orgName?: string | null;
  orgType?: string | null;
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

// ── Admin Orders ─────────────────────────────────────────────

export interface AdminOrder {
  id: string;
  buyerId: string;
  storeId: string;
  masterOrderId: string | null;
  status: string;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: string;
  fulfillmentMethod: string;
  deliveryAddress: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderItem {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPriceMinor: number;
  totalPriceMinor: number;
  metadata: Record<string, unknown>;
}

export interface OrderStatusEntry {
  id: string;
  orderId: string;
  status: string;
  actorId: string;
  actorType: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrder {
  items: AdminOrderItem[];
  history: OrderStatusEntry[];
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchAdminOrders(params?: {
  status?: string;
  storeId?: string;
  buyerId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResult<AdminOrder>> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.storeId) sp.set('storeId', params.storeId);
  if (params?.buyerId) sp.set('buyerId', params.buyerId);
  if (params?.from) sp.set('from', params.from);
  if (params?.to) sp.set('to', params.to);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/admin/orders${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch admin orders: ${res.status}`);
  return res.json();
}

export async function fetchAdminOrderDetail(id: string): Promise<AdminOrderDetail> {
  const res = await authFetch(`${API_URL}/v1/admin/orders/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch order detail: ${res.status}`);
  return res.json();
}

// ── Admin Merchants ──────────────────────────────────────────

export interface AdminMerchant {
  id: string;
  orgId: string;
  slug: string;
  displayName: string;
  description: string | null;
  logoUrl: string | null;
  status: string;
  verificationStatus: string;
  currency: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAdminMerchants(params?: {
  status?: string;
  verificationStatus?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResult<AdminMerchant>> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.verificationStatus) sp.set('verificationStatus', params.verificationStatus);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/admin/merchants${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch admin merchants: ${res.status}`);
  return res.json();
}

// ── KPIs ─────────────────────────────────────────────────────

export interface ActivationFunnel {
  registered: number;
  verified: number;
  catalogReady: number;
  firstOrder: number;
  repeatThree: number;
}

export interface KpiResponse {
  period: { from: string; to: string };
  users: { total: number };
  merchants: { verified: number; pending: number };
  orders: {
    total: number;
    completed: number;
    cancelled: number;
    completionRate: number;
    cancellationRate: number;
  };
  revenue: { totalMinor: number };
  conversion: {
    firstOrderRate: number;
    repeatOrderRate: number;
  };
  activationFunnel: ActivationFunnel;
}

export async function fetchKpis(from?: string, to?: string): Promise<KpiResponse> {
  const sp = new URLSearchParams();
  if (from) sp.set('from', from);
  if (to) sp.set('to', to);
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/admin/kpis${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch KPIs: ${res.status}`);
  return res.json();
}

// ── User Management ───────────────────────────────────────────

export interface AdminUser {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  locale: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserOrgMembership {
  orgId: string;
  orgName: string;
  orgType: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  membershipStatus: string;
  joinedAt: string;
}

export interface AdminUserDetail extends AdminUser {
  organizations: UserOrgMembership[];
}

export interface RoleInfo {
  id: string;
  key: string;
  name: string;
  permissions: string[];
}

export async function fetchAdminUsers(params?: {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResult<AdminUser>> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set('status', params.status);
  if (params?.search) sp.set('search', params.search);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/admin/users${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  return res.json();
}

export async function fetchAdminUserDetail(id: string): Promise<AdminUserDetail> {
  const res = await authFetch(`${API_URL}/v1/admin/users/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch user detail: ${res.status}`);
  return res.json();
}

export async function updateUserStatus(
  id: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE',
): Promise<{ id: string; status: string }> {
  const res = await authFetch(`${API_URL}/v1/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error(`Failed to update user: ${res.status}`);
  return res.json();
}

export async function assignUserRole(
  userId: string,
  orgId: string,
  roleId: string,
): Promise<{ orgId: string; userId: string; roleId: string; action: string }> {
  const res = await authFetch(`${API_URL}/v1/admin/users/${userId}/assign-role`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgId, roleId }),
  });
  if (!res.ok) throw new Error(`Failed to assign role: ${res.status}`);
  return res.json();
}

export async function fetchRoles(): Promise<RoleInfo[]> {
  const res = await authFetch(`${API_URL}/v1/admin/roles`);
  if (!res.ok) throw new Error(`Failed to fetch roles: ${res.status}`);
  return res.json();
}

// ── Audit Logs ───────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  actorId: string;
  actorType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function fetchAuditLogs(params?: {
  action?: string;
  resource?: string;
  actorId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResult<AuditLog>> {
  const sp = new URLSearchParams();
  if (params?.action) sp.set('action', params.action);
  if (params?.resource) sp.set('resource', params.resource);
  if (params?.actorId) sp.set('actorId', params.actorId);
  if (params?.from) sp.set('from', params.from);
  if (params?.to) sp.set('to', params.to);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/admin/audit-logs${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch audit logs: ${res.status}`);
  return res.json();
}

// ── Category Management ──────────────────────────────────────

export interface AdminCategory {
  id: string;
  name: string;
  nameAr: string | null;
  slug: string;
  path: string;
  parentId: string | null;
  isActive: boolean;
  productCount?: number;
  createdAt: string;
}

export async function fetchAdminCategories(): Promise<AdminCategory[]> {
  const res = await authFetch(`${API_URL}/v1/categories`);
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
  return res.json();
}

export async function createAdminCategory(data: {
  name: string;
  nameAr?: string;
  parentId?: string;
}): Promise<AdminCategory> {
  const res = await authFetch(`${API_URL}/v1/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create category: ${res.status}`);
  return res.json();
}

export async function updateAdminCategory(
  id: string,
  data: {
    name?: string;
    nameAr?: string;
    parentId?: string;
    isActive?: boolean;
  },
): Promise<AdminCategory> {
  const res = await authFetch(`${API_URL}/v1/categories/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update category: ${res.status}`);
  return res.json();
}

export async function deleteAdminCategory(id: string): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/categories/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete category: ${res.status}`);
}
