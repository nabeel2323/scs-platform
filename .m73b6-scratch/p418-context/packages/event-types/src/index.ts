/**
 * @scs/event-types — Domain + analytics event schemas
 *
 * Naming: `<module>.<entity>.<action>`
 * All events flow through `outbox_events` with at-least-once delivery.
 * Property schemas are versioned; breaking changes require a new event version.
 */

import { z } from 'zod';

// ── Identity / Merchant ──────────────────────────────────────
export const IdentityUserRegistered = z.object({
  userId: z.string().uuid(),
  phone: z.string(),
  orgId: z.string().uuid().optional(),
  at: z.string().datetime(),
});

export const MerchantStoreCreated = z.object({
  storeId: z.string().uuid(),
  orgId: z.string().uuid(),
  kind: z.enum(['WHOLESALE', 'RETAIL', 'BOTH']),
  at: z.string().datetime(),
});

export const MerchantVerificationApproved = z.object({
  orgId: z.string().uuid(),
  storeId: z.string().uuid().optional(),
  at: z.string().datetime(),
});

// ── Catalog / Inventory / Pricing ────────────────────────────
export const CatalogProductPublished = z.object({
  productId: z.string().uuid(),
  storeId: z.string().uuid(),
  at: z.string().datetime(),
});

export const InventoryStockReserved = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  orderId: z.string().uuid(),
  at: z.string().datetime(),
});

export const InventoryStockReleased = z.object({
  itemId: z.string().uuid(),
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  orderId: z.string().uuid(),
  at: z.string().datetime(),
});

export const PricingPriceListUpdated = z.object({
  priceListId: z.string().uuid(),
  storeId: z.string().uuid(),
  at: z.string().datetime(),
});

// ── Orders ───────────────────────────────────────────────────
export const OrderSubmitted = z.object({
  orderId: z.string().uuid(),
  masterOrderId: z.string().uuid(),
  storeId: z.string().uuid(),
  buyerOrgId: z.string().uuid(),
  valueMinor: z.number().int().positive(),
  currency: z.string().length(3),
  at: z.string().datetime(),
});

export const OrderStatusChanged = z.object({
  orderId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  actorType: z.enum(['BUYER', 'MERCHANT', 'DRIVER', 'ADMIN', 'SYSTEM']),
  at: z.string().datetime(),
});

export const OrderCompleted = z.object({
  orderId: z.string().uuid(),
  storeId: z.string().uuid(),
  at: z.string().datetime(),
});

// ── Analytics events (client track()) ────────────────────────
export const AnalyticsSearchPerformed = z.object({
  query: z.string(),
  filters: z.record(z.unknown()).optional(),
  resultsCount: z.number().int(),
});

export const AnalyticsProductViewed = z.object({
  productId: z.string().uuid(),
  storeId: z.string().uuid(),
  source: z.string().optional(),
});

export const AnalyticsCartItemAdded = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().positive(),
  storeId: z.string().uuid(),
});

export const AnalyticsOrderSubmitted = z.object({
  masterOrderId: z.string().uuid(),
  orderIds: z.array(z.string().uuid()),
  valueMinor: z.number().int().positive(),
});

// ── Type exports ─────────────────────────────────────────────
export type IdentityUserRegistered = z.infer<typeof IdentityUserRegistered>;
export type MerchantStoreCreated = z.infer<typeof MerchantStoreCreated>;
export type MerchantVerificationApproved = z.infer<typeof MerchantVerificationApproved>;
export type CatalogProductPublished = z.infer<typeof CatalogProductPublished>;
export type InventoryStockReserved = z.infer<typeof InventoryStockReserved>;
export type InventoryStockReleased = z.infer<typeof InventoryStockReleased>;
export type PricingPriceListUpdated = z.infer<typeof PricingPriceListUpdated>;
export type OrderSubmitted = z.infer<typeof OrderSubmitted>;
export type OrderStatusChanged = z.infer<typeof OrderStatusChanged>;
export type OrderCompleted = z.infer<typeof OrderCompleted>;
