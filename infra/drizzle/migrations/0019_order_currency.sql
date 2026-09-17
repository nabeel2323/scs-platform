-- 0019_order_currency.sql
-- A2-4: an order must record the currency it was priced in.
-- Module boundary: modules/orders/*
--
-- `orders` (sub-orders) carried amounts in minor units with no currency, while
-- every supplier has one (`stores.currency`, CHAR(3)). Nothing downstream could
-- label the money, so each client defaulted: an AED store's total printed as
-- "… SAR" in the buyer's order list, in the order detail and in the merchant
-- queue. The snapshot follows the rule `order_items.unit_price_minor` already
-- obeys — record what the buyer agreed to at checkout and never re-derive it,
-- because a seller who changes store currency afterwards must not silently
-- restate past invoices.
--
-- Nullable with no DEFAULT on purpose. Rows written before this migration have
-- no way to recover what was charged, and baking DEFAULT 'SAR' into the column
-- would turn the exact assumption this migration removes into data. Reads fall
-- back to the seller's current currency for those rows and report which source
-- was used (`currencyFromSnapshot`, see modules/orders/order-identity.ts).
ALTER TABLE orders ADD COLUMN currency CHAR(3);

COMMENT ON COLUMN orders.currency IS
  'ISO 4217 code the sub-order was priced in, snapshotted from stores.currency at checkout; NULL on rows created before 0019.';
