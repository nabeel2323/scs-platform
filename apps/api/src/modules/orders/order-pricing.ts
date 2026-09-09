/**
 * Order pricing — pure, side-effect-free financial calculations for checkout.
 *
 * These functions are intentionally free of NestJS/Drizzle dependencies so they
 * can be unit-tested in isolation and reused by any caller that needs to price
 * an order (checkout, order preview, Phase 3 settlement).
 *
 * Money is handled in integer MINOR units (halalas) throughout — never floats —
 * matching the platform-wide money convention (bigint minor units + char(3) ccy).
 *
 * Phase 1 policy (per Gap & Roadmap Report §5, API-B4):
 *  - VAT: 15% (KSA), applied to the taxable base = (goods − discount) + delivery fee.
 *  - Delivery fee: flat, configurable, charged only for PLATFORM_DELIVERY.
 *  - Commission: 5% placeholder on net goods (merchant revenue basis), refined by
 *    the Phase 3 commission engine. VAT and delivery are NOT commissionable.
 */

/** Default KSA VAT rate (15%). Override with env `VAT_RATE`. */
export const DEFAULT_VAT_RATE = 0.15;

/** Default platform take-rate placeholder (5%). Override with env `COMMISSION_RATE`. */
export const DEFAULT_COMMISSION_RATE = 0.05;

/**
 * Default flat platform-delivery fee in minor units (0 = free until a delivery
 * pricing model lands in Phase 2). Override with env `PLATFORM_DELIVERY_FEE_MINOR`.
 */
export const DEFAULT_PLATFORM_DELIVERY_FEE_MINOR = 0;

/** Fulfillment methods recognised at checkout. */
export type FulfillmentMethod = 'PLATFORM_DELIVERY' | 'MERCHANT_DELIVERY' | 'PICKUP';

/**
 * Resolve the delivery fee for a fulfillment method.
 *
 * - `PLATFORM_DELIVERY`: the configurable flat platform fee.
 * - `MERCHANT_DELIVERY`: 0 — the merchant arranges delivery and folds any cost
 *   into their own pricing (no platform fee field exists in Phase 1).
 * - `PICKUP`: 0 — the buyer collects, nothing is delivered.
 *
 * Unknown/absent methods default to platform delivery (the checkout default).
 */
export function resolveDeliveryFeeMinor(
  fulfillmentMethod: string | undefined | null,
  platformFeeMinor: number,
): number {
  const method = (fulfillmentMethod || 'PLATFORM_DELIVERY').toUpperCase();
  if (method === 'PICKUP' || method === 'MERCHANT_DELIVERY') return 0;
  return Math.max(0, Math.round(platformFeeMinor));
}

export interface OrderFinancialInput {
  /** Sum of order line totals (goods), in minor units. */
  subtotalMinor: number;
  /** Promotion discount to apply, in minor units (clamped to the subtotal). */
  discountMinor: number;
  /** Resolved delivery fee, in minor units. */
  deliveryFeeMinor: number;
  /** VAT rate as a fraction (e.g. 0.15). */
  vatRate: number;
  /** Platform commission rate as a fraction (e.g. 0.05). */
  commissionRate: number;
}

export interface OrderFinancialResult {
  productsMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  taxMinor: number;
  totalMinor: number;
  commissionMinor: number;
  merchantNetMinor: number;
}

/**
 * Compute the full financial breakdown for one (sub-)order.
 *
 * Invariants:
 *  - discount is clamped to `[0, subtotal]` so a total can never go negative;
 *  - VAT is charged on the discounted taxable base including the delivery fee;
 *  - commission is taken on net goods only (not on VAT or delivery);
 *  - every output is a non-negative integer (minor units).
 */
export function computeOrderFinancials(input: OrderFinancialInput): OrderFinancialResult {
  const productsMinor = Math.max(0, Math.round(input.subtotalMinor));
  const discountMinor = Math.min(Math.max(0, Math.round(input.discountMinor)), productsMinor);
  const netGoods = productsMinor - discountMinor;
  const deliveryFeeMinor = Math.max(0, Math.round(input.deliveryFeeMinor));

  const taxable = netGoods + deliveryFeeMinor;
  const vatRate = Number.isFinite(input.vatRate) ? Math.max(0, input.vatRate) : 0;
  const taxMinor = Math.round(taxable * vatRate);
  const totalMinor = taxable + taxMinor;

  const commissionRate = Number.isFinite(input.commissionRate)
    ? Math.max(0, input.commissionRate)
    : 0;
  const commissionMinor = Math.round(netGoods * commissionRate);
  const merchantNetMinor = netGoods - commissionMinor;

  return {
    productsMinor,
    discountMinor,
    deliveryFeeMinor,
    taxMinor,
    totalMinor,
    commissionMinor,
    merchantNetMinor,
  };
}
