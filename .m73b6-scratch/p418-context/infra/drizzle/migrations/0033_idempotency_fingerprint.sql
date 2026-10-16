-- 0033: Idempotency request fingerprint
-- Phase 1.1 hardening: stores a server-computed hash of the logical checkout
-- request (cart items + fulfillment + delivery) so that reuse of the same
-- idempotency_key with a DIFFERENT logical operation is rejected (409)
-- rather than silently returning the first order.
--
-- Backward compatible: nullable column, no NOT NULL constraint, existing rows
-- remain NULL (legacy orders are returned as-is on key match).

ALTER TABLE master_orders
  ADD COLUMN IF NOT EXISTS request_fingerprint VARCHAR(64);
