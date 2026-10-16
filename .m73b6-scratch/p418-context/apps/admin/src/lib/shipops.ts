/**
 * M7.3-B.6 Ship-Ops client — shipping, delivery-exception, RTS and carrier
 * recovery surface. These functions wrap the already-verified B.5 backend
 * (per-`:id` shipment operations + carrier admin) and the new B.6 read model
 * (`GET /v1/shipments`, `GET /v1/shipments/:id`) used by the admin console.
 *
 * `adminRequest` prefixes `/v1/`, so paths here are relative to that base.
 */
import { adminRequest, PaginatedResult, AdminOrg } from './api';

// ── Types ────────────────────────────────────────────────────

export interface ShipRow {
  id: string;
  orderId: string;
  storeId: string;
  status: string;
  assignedDriverId: string | null;
  pickedUpAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  carrierTrackingId: string | null;
  carrierShipmentId: string | null;
  shippingProviderKey: string | null;
  carrierStatusMapped: string | null;
  carrierCreateStatus: string | null;
  carrierCreateErrorClass: string | null;
  carrierCreateRetries: number;
  carrierCancelStatus: string | null;
  recoveryStatus: string | null;
  exceptionStatus: string | null;
  exceptionType: string | null;
  exceptionAt: string | null;
  deliveryAttempts: number;
  maxDeliveryAttempts: number;
  storeName: string | null;
  orderStatus: string | null;
}

export interface ShipmentEventRow {
  id: string;
  eventType: string;
  actorType: string;
  actorUserId: string | null;
  locationText: string | null;
  notes: string | null;
  carrierEventCode: string | null;
  sequence: number;
  createdAt: string;
}

export interface ShipmentLabelRow {
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
  store: { id: string; displayName: string; slug: string; orgId: string } | null;
  order: { id: string; status: string; storeId: string; buyerId: string } | null;
  events: ShipmentEventRow[];
  labels: ShipmentLabelRow[];
}

export interface ShipListQuery {
  status?: string;
  exceptionStatus?: string;
  exceptionType?: string;
  carrierCreateStatus?: string;
  recoveryStatus?: string;
  storeId?: string;
  orderId?: string;
  scope?: 'all' | 'exceptions' | 'rts' | 'recovery';
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface CarrierCredential {
  id: string;
  orgId: string;
  providerKey: string;
  label: string | null;
  isActive: boolean;
  maskedSecret?: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface CarrierConfiguration {
  id: string;
  orgId: string;
  providerKey: string;
  credentialId: string;
  storeId: string | null;
  isActive: boolean;
  isDefault: boolean | null;
  settings?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface RecoveryQueueRow {
  id: string;
  orderId: string;
  storeId: string;
  carrierCreateStatus: string | null;
  carrierCreateError: string | null;
  carrierCreateErrorClass: string | null;
  carrierCreateRetries: number;
  carrierCancelStatus: string | null;
  carrierCancelError: string | null;
  carrierCancelErrorClass: string | null;
  carrierCancelRetries: number;
  recoveryStatus: string | null;
  nextReconciliationAt: string | null;
  shippingProviderKey: string | null;
  carrierShipmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Read model ───────────────────────────────────────────────

export function buildShipQuery(q: ShipListQuery): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value !== undefined && value !== '' && value !== null) sp.set(key, String(value));
  }
  return sp.toString();
}

export function listShipments(q: ShipListQuery): Promise<PaginatedResult<ShipRow>> {
  const qs = buildShipQuery(q);
  return adminRequest(`shipments${qs ? `?${qs}` : ''}`);
}

export function getShipmentDetail(id: string): Promise<ShipDetail> {
  return adminRequest(`shipments/${encodeURIComponent(id)}`);
}

// ── Shipment lifecycle operations ────────────────────────────

export function createCarrierShipment(id: string) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/create`, { method: 'POST' });
}

export function cancelShipment(id: string, reason: string) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/cancel`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
  });
}

export function reportShipmentException(id: string, exceptionType: string, notes?: string) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/exception`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exceptionType, notes }),
  });
}

export function retryShipment(id: string) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/retry`, { method: 'POST' });
}

export function requestRTS(id: string, notes?: string) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/rts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
  });
}

export function approveRTS(id: string) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/rts/approve`, { method: 'POST' });
}

export function rejectRTS(id: string, notes: string) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/rts/reject`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
  });
}

export function completeRTS(id: string, notes?: string) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/rts/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes }),
  });
}

// ── M7.3-C: inventory return-to-stock (RTS physical return) ───

export interface ReturnEligibilityLine {
  orderItemId: string;
  variantId: string;
  sku: string;
  title: string;
  orderedQuantity: number;
  inventoryItemId: string;
  warehouseId: string | null;
  reservedQuantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
}

export interface ReturnEligibility {
  shipmentId: string;
  orderId: string;
  storeId: string;
  exceptionStatus: string | null;
  exceptionType: string | null;
  orderStatus: string | null;
  eligible: boolean;
  lines: ReturnEligibilityLine[];
}

export const RETURN_CONDITIONS = ['GOOD', 'DAMAGED', 'DEFECTIVE', 'UNSALEABLE'] as const;

export function getReturnEligibility(id: string): Promise<ReturnEligibility> {
  return adminRequest(`shipments/${encodeURIComponent(id)}/return-eligibility`);
}

export function recordReturn(
  id: string,
  lines: Array<{ orderItemId: string; quantity: number; condition: string }>,
) {
  return adminRequest(`shipments/${encodeURIComponent(id)}/return`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines }),
  });
}

// ── Carrier admin + recovery ─────────────────────────────────

export function listCarrierCredentials(orgId: string): Promise<{ credentials: CarrierCredential[] }> {
  return adminRequest(`carrier/credentials?orgId=${encodeURIComponent(orgId)}`);
}

export function listCarrierConfigurations(orgId: string): Promise<{ configurations: CarrierConfiguration[] }> {
  return adminRequest(`carrier/configurations?orgId=${encodeURIComponent(orgId)}`);
}

export function getRecoveryQueue(limit = 50): Promise<{ queue: RecoveryQueueRow[]; count: number; limit: number }> {
  return adminRequest(`carrier/recovery/queue?limit=${limit}`);
}

export function recoverCarrierShipment(id: string) {
  return adminRequest(`carrier/shipments/${encodeURIComponent(id)}/recover`, { method: 'POST' });
}

export function listAdminOrganizations(): Promise<AdminOrg[]> {
  return adminRequest('admin/organizations');
}

// ── Vocabularies ─────────────────────────────────────────────

/** The 8 canonical delivery exception types surfaced by M7.3-B.4. */
export const EXCEPTION_TYPES = [
  'RECIPIENT_UNAVAILABLE',
  'WRONG_ADDRESS',
  'RECIPIENT_REFUSED',
  'PAYMENT_FAILED',
  'DAMAGED',
  'LOST',
  'DELIVERY_DELAYED',
  'OTHER',
];

/** RTS states (stored in shipment.exception_status) for the RTS queue. */
export const RTS_STATES = ['RTS_PENDING', 'RTS_IN_PROGRESS', 'RTS_COMPLETED'];

/** Shipment fulfillment lifecycle statuses (shipments.status). */
export const SHIPMENT_STATUSES = [
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
];

/** Exception FSM states (shipments.exception_status). */
export const EXCEPTION_STATUSES = [
  'OPEN',
  'RETRY_PENDING',
  'RESOLVED',
  'CLOSED',
  'RTS_PENDING',
  'RTS_IN_PROGRESS',
  'RTS_COMPLETED',
];

/** Carrier create lifecycle states (shipments.carrier_create_status). */
export const CARRIER_CREATE_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'SUCCESS',
  'FAILED',
  'RECOVERY_REQUIRED',
];

/** Map an exception_status to a semantic tone for the status dot. */
export function exceptionTone(
  exceptionStatus: string | null | undefined,
): 'ok' | 'warn' | 'err' | 'info' | 'muted' {
  if (!exceptionStatus) return 'muted';
  if (exceptionStatus === 'RESOLVED' || exceptionStatus === 'CLOSED' || exceptionStatus === 'RTS_COMPLETED') return 'ok';
  if (exceptionStatus.startsWith('RTS_')) return 'info';
  if (exceptionStatus === 'OPEN' || exceptionStatus === 'RETRY_PENDING') return 'err';
  return 'warn';
}

/** Map a carrier create/recovery state to a semantic tone. */
export function carrierTone(
  status: string | null | undefined,
): 'ok' | 'warn' | 'err' | 'info' | 'muted' {
  if (!status) return 'muted';
  if (status === 'SUCCESS') return 'ok';
  if (status === 'FAILED' || status === 'RECOVERY_REQUIRED' || status === 'RECONCILIATION_REQUIRED') return 'err';
  if (status === 'IN_PROGRESS' || status === 'PENDING' || status === 'UNKNOWN') return 'warn';
  return 'info';
}
