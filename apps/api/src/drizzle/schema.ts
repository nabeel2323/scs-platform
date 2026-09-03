/**
 * Drizzle schema barrel file — re-exports all module schemas.
 *
 * This is the single entry point for Drizzle ORM to discover
 * all tables across the modular monolith.
 */

export * from '../modules/identity/identity.schema';
export * from '../modules/audit/audit.schema';
export * from '../modules/merchant/merchant.schema';
export * from '../modules/catalog/catalog.schema';
export * from '../modules/catalog/search.schema';
export * from '../modules/inventory/inventory.schema';
export * from '../modules/pricing/pricing.schema';
export * from '../modules/promotions/promotions.schema';
export * from '../modules/orders/cart.schema';
export * from '../modules/orders/orders.schema';
export * from '../modules/reviews/reviews.schema';
export * from '../modules/reviews/support.schema';
export * from '../modules/notifications/notifications.schema';
