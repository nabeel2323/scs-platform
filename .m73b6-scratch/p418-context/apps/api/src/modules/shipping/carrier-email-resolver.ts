/**
 * Carrier Email Resolver — M7.2.3-B.1
 *
 * Resolves the consignee (buyer) email address for carrier shipment requests.
 *
 * Resolution precedence:
 *   1. Explicit email in shipment metadata (if set during checkout)
 *   2. Buyer's user record email
 *   3. Order metadata email (if stored there)
 *   4. Throw CarrierEmailRequiredError if no email can be resolved
 *
 * SECURITY:
 *   - Only resolves email for the buyer associated with the order.
 *   - Never exposes another tenant's customer data.
 *   - Does NOT log the resolved email (PII protection).
 *   - Normalizes email to lowercase trimmed form.
 *
 * This service does NOT modify ShippingAddress.
 * The resolved email is exposed via CreateShipmentRequest.metadata
 * or a dedicated field added to the request type.
 */

import { Injectable, Logger } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DatabaseService } from '../../common/database/database.service';
import { shipments } from '../orders/shipment.schema';
import { orders } from '../orders/orders.schema';
import { users } from '../identity/identity.schema';
import { stores } from '../merchant/merchant.schema';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedCarrierEmail {
  /** The resolved email address (normalized, lowercase, trimmed). */
  email: string;
  /** Where the email was sourced from. */
  source: 'shipment_metadata' | 'buyer_user_record' | 'order_metadata';
}

export class CarrierEmailRequiredError extends Error {
  readonly shipmentId: string;

  constructor(shipmentId: string) {
    super(
      `No email address available for shipment ${shipmentId}. ` +
      'Carrier integration requires a consignee email. ' +
      'Ensure the buyer has an email on their user record.',
    );
    this.name = 'CarrierEmailRequiredError';
    this.shipmentId = shipmentId;
    Object.setPrototypeOf(this, CarrierEmailRequiredError.prototype);
  }
}

// ── Email validation ────────────────────────────────────────────────────────

/**
 * Basic email format validation (RFC 5322 simplified).
 * Does not verify deliverability — only format.
 */
export function isValidEmailFormat(email: string): boolean {
  // Simplified but robust email regex
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Normalize an email address: lowercase, trim whitespace.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ── Resolver ────────────────────────────────────────────────────────────────

@Injectable()
export class CarrierEmailResolver {
  private readonly logger = new Logger(CarrierEmailResolver.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Resolve the consignee email for a shipment.
   *
   * Resolution order:
   *   1. Shipment metadata.email
   *   2. Buyer's user record email
   *   3. Order metadata.email
   *
   * @param shipmentId  The SCS shipment ID.
   * @param callerOrgId The caller's organization ID (for tenant isolation).
   *                    Platform staff (null) bypass this check.
   *
   * @throws CarrierEmailRequiredError if no email can be resolved.
   */
  async resolve(
    shipmentId: string,
    callerOrgId?: string | null,
  ): Promise<ResolvedCarrierEmail> {
    // 1. Load the shipment with its order
    const shipment = await this.db.db.query.shipments.findFirst({
      where: eq(shipments.id, shipmentId),
    });

    if (!shipment) {
      throw new CarrierEmailRequiredError(shipmentId);
    }

    // Tenant isolation: verify the shipment's store belongs to the caller's org
    if (callerOrgId) {
      const store = await this.db.db.query.stores.findFirst({
        where: eq(stores.id, shipment.storeId),
        columns: { orgId: true },
      });
      if (!store || store.orgId !== callerOrgId) {
        // Do NOT reveal whether the shipment exists
        throw new CarrierEmailRequiredError(shipmentId);
      }
    }

    // 2. Try shipment metadata
    const shipmentMeta = shipment.metadata as Record<string, unknown> | null;
    const shipmentEmail = shipmentMeta ? shipmentMeta['email'] : undefined;
    if (typeof shipmentEmail === 'string' && shipmentEmail.length > 0) {
      const normalized = normalizeEmail(shipmentEmail);
      if (isValidEmailFormat(normalized)) {
        return { email: normalized, source: 'shipment_metadata' };
      }
    }

    // 3. Load the order to get buyerId
    const order = await this.db.db.query.orders.findFirst({
      where: eq(orders.id, shipment.orderId),
    });

    if (!order) {
      throw new CarrierEmailRequiredError(shipmentId);
    }

    // 4. Try order metadata
    const orderMeta = order.metadata as Record<string, unknown> | null;
    const orderEmail = orderMeta ? orderMeta['email'] : undefined;
    if (typeof orderEmail === 'string' && orderEmail.length > 0) {
      const normalized = normalizeEmail(orderEmail);
      if (isValidEmailFormat(normalized)) {
        return { email: normalized, source: 'order_metadata' };
      }
    }

    // 5. Try buyer's user record
    const buyer = await this.db.db.query.users.findFirst({
      where: eq(users.id, order.buyerId),
      columns: { email: true },
    });

    if (buyer?.email) {
      const normalized = normalizeEmail(buyer.email);
      if (isValidEmailFormat(normalized)) {
        return { email: normalized, source: 'buyer_user_record' };
      }
    }

    // 6. No email found
    this.logger.warn(
      `No email resolved for shipment ${shipmentId} — ` +
      'carrier integration will not have consignee email.',
    );
    throw new CarrierEmailRequiredError(shipmentId);
  }

  /**
   * Try to resolve email without throwing.
   * Returns null if no email is available.
   */
  async tryResolve(
    shipmentId: string,
    callerOrgId?: string | null,
  ): Promise<ResolvedCarrierEmail | null> {
    try {
      return await this.resolve(shipmentId, callerOrgId);
    } catch {
      return null;
    }
  }
}
