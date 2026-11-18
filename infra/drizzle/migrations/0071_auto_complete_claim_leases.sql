-- G-011: durable ownership and crash recovery for auto-completed orders.
-- Claims are leased for five minutes; the worker fences its status transition
-- against both the current owner and an unexpired lease.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS auto_complete_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_complete_claimed_by VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_orders_auto_complete_claimable
  ON orders (auto_complete_at, auto_complete_claimed_at, id)
  WHERE status = 'DELIVERED'
    AND buyer_confirmed_at IS NULL
    AND auto_complete_at IS NOT NULL;
