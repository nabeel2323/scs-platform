/**
 * M7.3-B.6 Merchant Ship-Ops client — delivery operations surface for the
 * merchant web console. Wraps the tenant-scoped shipment read model
 * (`GET /v1/shipments`, `GET /v1/shipments/:id`) and the per-`:id` lifecycle
 * operations the merchant is entitled to (create/cancel/label/tracking/
 * exception/RTS). Recovery and carrier admin are platform-only and excluded.
 *
 * Merchant callers are scoped server-side to their active org's stores; no
 * org id is passed from the client.
 */
import { authFetch } from './auth';
import { ApiError } from './buyer-api';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000';

export interface ShipRow {
  id: string;
  orderId: string;
  storeId: string;
  status: string;
  carrierTrackingId: string | null;
  carrierShipmentId: string | null;
  shippingProviderKey: string | null;
  carrierStatusMapped: string | null;
  carrierCreateStatus: string | null;
  carrierCancelStatus: string | null;
  recoveryStatus: string | null;
  exceptionStatus: string | null;
  exceptionType: string | null;
  exceptionAt: string | null;
  deliveryAttempts: number;
  maxDeliveryAttempts: number;
  cancelledAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  storeName: string | null;
  orderStatus: string | null;
}

export interface ShipEvent {
  id: string;
  eventType: string;
  actorType: string;
  locationText: string | null;
  notes: string | null;
  sequence: number;
  createdAt: string;
}

export interface ShipLabel {
  id: string;
  labelNumber: string | null;
  storageKey: string | null;
  mimeType: string | null;
  trackingUrl: string | null;
  isVoid: boolean | null;
  labelType: string | null;
  createdAt: string;
}

export interface ShipDetail {
  shipment: ShipRow & Record<string, unknown>;
  store: { id: string; displayName: string; orgId: string } | null;
  order: { id: string; status: string } | null;
  events: ShipEvent[];
  labels: ShipLabel[];
}

export interface ShipListQuery {
  scope?: 'all' | 'exceptions' | 'rts';
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(`${API_URL}/v1/${path}`, init);
  if (!res.ok) throw await ApiError.from(res, `Request failed (${res.status})`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

function toQs(q: ShipListQuery): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') sp.set(k, String(v));
  return sp.toString();
}

export function listShipments(q: ShipListQuery): Promise<{ data: ShipRow[]; total: number; limit: number; offset: number }> {
  const qs = toQs(q);
  return req(`shipments${qs ? `?${qs}` : ''}`);
}

export function getShipmentDetail(id: string): Promise<ShipDetail> {
  return req(`shipments/${encodeURIComponent(id)}`);
}

const jsonInit = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const createCarrierShipment = (id: string) => req(`shipments/${encodeURIComponent(id)}/create`, jsonInit('POST'));
export const cancelShipment = (id: string, reason: string) => req(`shipments/${encodeURIComponent(id)}/cancel`, jsonInit('POST', { reason }));
export const reportException = (id: string, exceptionType: string, notes?: string) => req(`shipments/${encodeURIComponent(id)}/exception`, jsonInit('POST', { exceptionType, notes }));
export const retryShipment = (id: string) => req(`shipments/${encodeURIComponent(id)}/retry`, jsonInit('POST'));
export const requestRTS = (id: string, notes?: string) => req(`shipments/${encodeURIComponent(id)}/rts`, jsonInit('POST', { notes }));
export const completeRTS = (id: string, notes?: string) => req(`shipments/${encodeURIComponent(id)}/rts/complete`, jsonInit('POST', { notes }));

/** The 8 canonical delivery exception types. */
export const EXCEPTION_TYPES = [
  'RECIPIENT_UNAVAILABLE', 'WRONG_ADDRESS', 'RECIPIENT_REFUSED', 'PAYMENT_FAILED',
  'DAMAGED', 'LOST', 'DELIVERY_DELAYED', 'OTHER',
] as const;

const RTS_EXCEPTION_STATUSES = ['RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED'];

/** Human label for a delivery-exception state, optionally naming the type. */
export function exceptionLabel(status: string, type?: string | null): string {
  const base = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  if (type && status !== 'RTS_COMPLETED') return `${base} · ${type.replace(/_/g, ' ')}`;
  return base;
}

/** True when the exception is in a return-to-sender stage. */
export function isRtsStatus(status?: string | null): boolean {
  return !!status && RTS_EXCEPTION_STATUSES.includes(status);
}
