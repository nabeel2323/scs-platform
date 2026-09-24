/**
 * Admin API client — verification queue, merchant management.
 */
import { authFetch } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

export type AdminRecord = { id: string; [key: string]: unknown };
export type AdminTableQuery = Record<string, string | number | undefined>;
export interface AdminProduct extends AdminRecord {
  title: string;
  slug: string;
  storeId: string;
  status: string;
  isAvailable: boolean;
  images: unknown;
  imageCount: number;
  store: (AdminRecord & { displayName: string; slug: string }) | null;
  media: (AdminRecord & { mediaType: string; url: string })[];
  variants: (AdminRecord & { images: unknown })[];
}

export async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(`${API_URL}/v1/${path}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.detail || body.message || `Request failed (${response.status})`;
    throw new Error(Array.isArray(message) ? message.join('; ') : message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export function fetchAdminTable<T = AdminRecord>(endpoint: string, query: AdminTableQuery, signal?: AbortSignal): Promise<PaginatedResult<T>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  return adminRequest(`admin/${endpoint}?${params}`, { signal });
}

export function fetchAdminProduct(id: string, signal?: AbortSignal): Promise<AdminProduct> {
  return adminRequest(`products/${encodeURIComponent(id)}`, { signal });
}

export function moderateAdminProduct(id: string, decision: 'APPROVED' | 'REJECTED' | 'ARCHIVED') {
  return adminRequest(`admin/products/${encodeURIComponent(id)}/moderate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
  });
}

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
  autoActivatedProductCount?: number;
  submittedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Enriched fields from join with stores/organizations
  storeName?: string | null;
  storeSlug?: string | null;
  orgName?: string | null;
  orgType?: string | null;
  /** Owning organization (attached by GET /v1/verification/:id). */
  org?: { id: string; name: string; isActive: boolean } | null;
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
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Failed to review verification: ${res.status}`);
  }
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

/**
 * Request a presigned download URL for a verification document (GAP-10).
 * Backed by POST /v1/documents/:id/presign, which now accepts
 * `merchant:verification:review` so reviewers can download submissions.
 */
export async function presignDocumentDownload(id: string): Promise<string> {
  const res = await authFetch(`${API_URL}/v1/documents/${id}/presign`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to presign document download: ${res.status}`);
  const body = (await res.json()) as { downloadUrl: string };
  return body.downloadUrl;
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
  fromStatus: string | null;
  toStatus: string;
  changedBy: string | null;
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

/**
 * PHASE 17: platform-wide per-offer revenue analytics response.
 * Mirrors AdminService.getOfferRevenueKpis return shape.
 */
export interface OfferRevenueRow {
  offerId: string;
  storeId: string;
  storeName: string | null;
  productId: string;
  productTitle: string | null;
  variantId: string | null;
  offerStatus: string;
  currency: string;
  ordersCount: number;
  unitsSold: number;
  revenueMinor: number;
}

export interface OfferRevenueKpiResponse {
  from: string;
  to: string;
  filters: { storeId: string | null; status: string | null; limit: number };
  totals: {
    offersTouched: number;
    byCurrency: Array<{ currency: string; revenueMinor: number; unitsSold: number }>;
  };
  offers: OfferRevenueRow[];
}

export async function fetchOfferRevenueKpis(params: {
  from?: string; to?: string; storeId?: string; status?: string; limit?: number;
} = {}): Promise<OfferRevenueKpiResponse> {
  const sp = new URLSearchParams();
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  if (params.storeId) sp.set('storeId', params.storeId);
  if (params.status) sp.set('status', params.status);
  if (params.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/admin/offers/kpis${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch offer KPIs: ${res.status}`);
  return res.json();
}

/**
 * PHASE 19: platform-wide offer sales trend bucketed by day/week. Mirrors
 * AdminService.getOfferTrend so the admin governance page can render a
 * time-series chart plus a top-N store leaderboard inside one request.
 */
export interface OfferTrendBucket {
  bucket: string;
  ordersCount: number;
  unitsSold: number;
  revenueMinor: number;
}

export interface OfferTrendTopStore {
  storeId: string;
  storeName: string | null;
  ordersCount: number;
  unitsSold: number;
  revenueMinor: number;
}

export interface OfferTrendResponse {
  granularity: 'day' | 'week';
  from: string;
  to: string;
  filters: {
    storeId: string | null;
    offerId: string | null;
    status: string | null;
    topStores: number;
  };
  buckets: OfferTrendBucket[];
  topStores: OfferTrendTopStore[];
}

export async function fetchAdminOfferTrend(params: {
  from?: string; to?: string; days?: number;
  storeId?: string; offerId?: string; status?: string;
  granularity?: 'day' | 'week'; topStores?: number;
} = {}): Promise<OfferTrendResponse> {
  const sp = new URLSearchParams();
  if (params.from) sp.set('from', params.from);
  if (params.to) sp.set('to', params.to);
  if (params.days != null) sp.set('days', String(params.days));
  if (params.storeId) sp.set('storeId', params.storeId);
  if (params.offerId) sp.set('offerId', params.offerId);
  if (params.status) sp.set('status', params.status);
  sp.set('granularity', params.granularity === 'week' ? 'week' : 'day');
  if (params.topStores != null) sp.set('topStores', String(params.topStores));
  const res = await authFetch(`${API_URL}/v1/admin/offers/trend?${sp.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch offer trend: ${res.status}`);
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

export interface AdminOrg {
  id: string;
  name: string;
  type: string;
  legalName: string | null;
  taxId: string | null;
  country: string;
  verificationStatus: string;
  isActive: boolean;
  inviteCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrgDetail extends AdminOrg {
  stores: { id: string; orgId: string; slug: string; displayName: string; description: string | null; currency: string; locale: string; verificationStatus: string; address: Record<string, unknown>; createdAt: string }[];
  warehouses: { id: string; storeId: string; name: string; address: Record<string, unknown>; managerName: string | null; managerPhone: string | null; status: string; createdAt: string }[];
  documents: { id: string; orgId: string; storeId: string | null; docType: string; fileName: string; mimeType: string | null; fileSize: number; verificationStatus: string; createdAt: string }[];
  members: { id: string; orgId: string; userId: string; roleId: string; status: string; createdAt: string; user: { id: string; fullName: string; phone: string; email: string | null }; role: { id: string; name: string; key: string } }[];
}

export async function fetchAdminOrganizationDetail(orgId: string): Promise<AdminOrgDetail> {
  const res = await authFetch(`${API_URL}/v1/admin/organizations/${orgId}`);
  if (!res.ok) throw new Error(`Failed to fetch organization detail: ${res.status}`);
  return res.json();
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

export async function fetchAdminOrganizations(): Promise<AdminOrg[]> {
  const res = await authFetch(`${API_URL}/v1/admin/organizations`);
  if (!res.ok) throw new Error(`Failed to fetch organizations: ${res.status}`);
  return res.json();
}

export async function deactivateAdminOrganization(id: string, isActive: boolean): Promise<{ success: boolean }> {
  const res = await authFetch(`${API_URL}/v1/admin/organizations/${id}/deactivate`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) throw new Error(`Failed to deactivate organization: ${res.status}`);
  return res.json();
}

// ── Organization update requests (G5) ────────────────────

export interface AdminOrgUpdateRequest {
  id: string;
  orgId: string;
  orgName: string | null;
  requestedBy: string;
  payload: { name?: string; legalName?: string; taxId?: string };
  status: string; // PENDING | APPROVED | REJECTED
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export async function fetchAdminOrgUpdateRequests(status?: string): Promise<AdminOrgUpdateRequest[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await authFetch(`${API_URL}/v1/admin/org-update-requests${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch update requests: ${res.status}`);
  return res.json();
}

export async function reviewOrgUpdateRequest(
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  notes?: string,
): Promise<AdminOrgUpdateRequest> {
  const res = await authFetch(`${API_URL}/v1/admin/org-update-requests/${id}/review`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.message ?? `Failed to review update request: ${res.status}`);
  }
  return res.json();
}

export async function removeUserRole(
  userId: string,
  orgId: string,
): Promise<{ orgId: string; userId: string; removed: boolean }> {
  const res = await authFetch(`${API_URL}/v1/admin/users/${userId}/roles/${orgId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to remove role: ${res.status}`);
  return res.json();
}

// ── Audit Logs ───────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  actorId: string | null;
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
    parentId?: string | null;
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

// ── Brands ─────────────────────────────────────────────────────

export interface AdminBrand {
  id: string;
  name: string;
  nameAr: string | null;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAdminBrands(includeInactive = false): Promise<AdminBrand[]> {
  const qs = includeInactive ? '?includeInactive=true' : '';
  const res = await authFetch(`${API_URL}/v1/brands${qs}`);
  if (!res.ok) throw new Error(`Failed to fetch brands: ${res.status}`);
  return res.json();
}

export async function createAdminBrand(data: { name: string; nameAr?: string; logoUrl?: string; description?: string }): Promise<AdminBrand> {
  const res = await authFetch(`${API_URL}/v1/brands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create brand: ${res.status}`);
  return res.json();
}

export async function updateAdminBrand(id: string, data: Partial<AdminBrand>): Promise<AdminBrand> {
  const res = await authFetch(`${API_URL}/v1/brands/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update brand: ${res.status}`);
  return res.json();
}

export async function deactivateAdminBrand(id: string): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/brands/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to deactivate brand: ${res.status}`);
}

// ── Catalog Taxonomy — Attributes ─────────────────────────────

export type AttributeScope = 'PRODUCT' | 'VARIANT' | 'OFFER';
export type AttributeType =
  | 'TEXT' | 'LONG_TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE' | 'DATETIME'
  | 'SELECT' | 'MULTI_SELECT' | 'COLOR' | 'URL' | 'FILE' | 'MEASUREMENT' | 'CURRENCY';

export interface AttributeOption {
  id: string;
  attributeId: string;
  value: string;
  valueAr: string | null;
  label: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface AttributeDefinition {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  type: AttributeType;
  unit: string | null;
  scope: AttributeScope;
  status: 'ACTIVE' | 'DEPRECATED';
  validation: Record<string, unknown>;
  metadata: Record<string, unknown>;
  options?: AttributeOption[];
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttributeGroup {
  id: string;
  name: string;
  nameAr: string | null;
  kind: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAttributes(params?: {
  scope?: string; type?: string; includeDeprecated?: boolean;
}): Promise<AttributeDefinition[]> {
  const sp = new URLSearchParams();
  if (params?.scope) sp.set('scope', params.scope);
  if (params?.type) sp.set('type', params.type);
  if (params?.includeDeprecated) sp.set('includeDeprecated', 'true');
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/attributes${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch attributes: ${res.status}`);
  return res.json();
}

export async function fetchAttribute(id: string): Promise<AttributeDefinition> {
  const res = await authFetch(`${API_URL}/v1/attributes/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch attribute: ${res.status}`);
  return res.json();
}

export async function createAttribute(data: {
  code: string; name: string; nameAr?: string; description?: string;
  type?: AttributeType; unit?: string; scope?: AttributeScope;
  validation?: Record<string, unknown>;
  options?: Array<{ value: string; valueAr?: string; label?: string; sortOrder?: number }>;
}): Promise<AttributeDefinition> {
  const res = await authFetch(`${API_URL}/v1/admin/attributes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Failed to create attribute: ${res.status}`);
  }
  return res.json();
}

export async function updateAttribute(id: string, data: {
  name?: string; nameAr?: string; description?: string;
  unit?: string; status?: 'ACTIVE' | 'DEPRECATED';
  validation?: Record<string, unknown>;
}): Promise<AttributeDefinition> {
  const res = await authFetch(`${API_URL}/v1/admin/attributes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update attribute: ${res.status}`);
  return res.json();
}

export async function deleteAttribute(id: string): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/admin/attributes/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to deactivate attribute: ${res.status}`);
}

export async function addAttributeOption(id: string, data: {
  value: string; valueAr?: string; label?: string; sortOrder?: number;
}): Promise<AttributeOption> {
  const res = await authFetch(`${API_URL}/v1/admin/attributes/${id}/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to add option: ${res.status}`);
  return res.json();
}

// ── Catalog Taxonomy — Attribute Groups ───────────────────────

export async function fetchAttributeGroups(): Promise<AttributeGroup[]> {
  const res = await authFetch(`${API_URL}/v1/attribute-groups`);
  if (!res.ok) throw new Error(`Failed to fetch attribute groups: ${res.status}`);
  return res.json();
}

export async function createAttributeGroup(data: {
  name: string; nameAr?: string; kind?: string;
}): Promise<AttributeGroup> {
  const res = await authFetch(`${API_URL}/v1/admin/attribute-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create attribute group: ${res.status}`);
  return res.json();
}

// ── Catalog Taxonomy — Product Types ──────────────────────────

export interface ProductType {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  categoryId: string | null;
  version: number;
  status: 'DRAFT' | 'PUBLISHED' | 'DEPRECATED';
  variantDimensions: string[];
  metadata: Record<string, unknown>;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchProductTypes(params?: {
  categoryId?: string; status?: string;
}): Promise<ProductType[]> {
  const sp = new URLSearchParams();
  if (params?.categoryId) sp.set('categoryId', params.categoryId);
  if (params?.status) sp.set('status', params.status);
  const qs = sp.toString();
  const res = await authFetch(`${API_URL}/v1/product-types${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(`Failed to fetch product types: ${res.status}`);
  return res.json();
}

export async function fetchProductType(id: string): Promise<ProductType> {
  const res = await authFetch(`${API_URL}/v1/product-types/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch product type: ${res.status}`);
  return res.json();
}

export async function createProductType(data: {
  code: string; name: string; nameAr?: string; description?: string;
  categoryId?: string | null;
}): Promise<ProductType> {
  const res = await authFetch(`${API_URL}/v1/admin/product-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Failed to create product type: ${res.status}`);
  }
  return res.json();
}

export async function publishProductType(id: string): Promise<ProductType> {
  const res = await authFetch(`${API_URL}/v1/admin/product-types/${id}/publish`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to publish product type: ${res.status}`);
  return res.json();
}

export interface ProductTypeSchema extends ProductType {
  groups: AttributeGroup[];
  attributes: Array<{
    attributeDefinitionId: string;
    displayOrder: number;
    isRequired: boolean;
    isFilterable: boolean;
    isSearchable: boolean;
    isComparable: boolean;
    visibleInListing: boolean;
    visibleInDetail: boolean;
    conditionalRules: Record<string, unknown> | null;
    validationOverride: Record<string, unknown> | null;
    definition: AttributeDefinition | null;
    options: AttributeOption[];
  }>;
}

export async function fetchProductTypeSchema(id: string): Promise<ProductTypeSchema> {
  const res = await authFetch(`${API_URL}/v1/product-types/${id}/schema`);
  if (!res.ok) throw new Error(`Failed to fetch product type schema: ${res.status}`);
  return res.json();
}

export async function setProductTypeAttributes(id: string, attributes: Array<{
  attributeDefinitionId: string;
  displayOrder?: number;
  isRequired?: boolean;
  isFilterable?: boolean;
  isSearchable?: boolean;
  isComparable?: boolean;
  visibleInListing?: boolean;
  visibleInDetail?: boolean;
  conditionalRules?: Record<string, unknown> | null;
  validationOverride?: Record<string, unknown> | null;
}>): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/admin/product-types/${id}/attributes`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributes }),
  });
  if (!res.ok) throw new Error(`Failed to set attributes: ${res.status}`);
}

export async function setVariantDimensions(id: string, attributeIds: string[]): Promise<void> {
  const res = await authFetch(`${API_URL}/v1/admin/product-types/${id}/variant-dimensions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attributeIds }),
  });
  if (!res.ok) throw new Error(`Failed to set variant dimensions: ${res.status}`);
}

export async function createNewVersion(id: string): Promise<ProductType> {
  const res = await authFetch(`${API_URL}/v1/admin/product-types/${id}/versions`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to create new version: ${res.status}`);
  return res.json();
}
