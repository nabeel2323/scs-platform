-- 0047_delivery_completion.sql — M7.3-A
--
-- Adds the minimum schema needed for delivery completion and auto-completion:
--   1. buyer_confirmed_at  — records when (and whether) the buyer confirmed delivery
--   2. auto_complete_at    — when the system should auto-transition DELIVERED → COMPLETED
--   3. Index for the auto-completion scheduler (status + auto_complete_at)
--   4. Backfill master_orders.status from current sub-order states
--
-- Idempotent: uses IF NOT EXISTS / IF EXISTS everywhere.
-- Safe on fresh DB: columns may not exist yet — handled gracefully.
-- Safe on existing DB: columns are nullable, no destructive changes.

-- 1. Buyer confirmation timestamp
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_confirmed_at timestamptz;

-- 2. Auto-completion schedule timestamp
ALTER TABLE orders ADD COLUMN IF NOT EXISTS auto_complete_at timestamptz;

-- 3. Index for the auto-completion scheduler:
--    Finds DELIVERED orders where auto_complete_at <= NOW()
CREATE INDEX IF NOT EXISTS idx_orders_auto_complete
  ON orders (status, auto_complete_at)
  WHERE status = 'DELIVERED' AND auto_complete_at IS NOT NULL;

-- 4. Backfill master_orders.status based on current sub-order aggregation.
--    This is a one-time best-effort snapshot; going forward, the application
--    keeps master status in sync via recalculateMasterOrderStatus().
--
--    Aggregation policy (deterministic):
--      ALL COMPLETED                              → COMPLETED
--      ALL CANCELLED/REJECTED                     → CANCELLED
--      ALL DELIVERED or COMPLETED                 → DELIVERED
--      ANY DISPUTED                               → DISPUTED
--      ANY OUT_FOR_DELIVERY/ASSIGNED/PICKED_UP    → OUT_FOR_DELIVERY
--      ANY PREPARING/READY                        → PREPARING
--      ANY ACCEPTED/PARTIALLY_ACCEPTED            → ACCEPTED
--      ANY SUBMITTED/PENDING_CONFIRMATION         → SUBMITTED
--      otherwise                                  → status unchanged
UPDATE master_orders mo
SET status = aggregated.derived_status,
    updated_at = NOW()
FROM (
  SELECT
    o.master_order_id,
    CASE
      WHEN bool_and(o.status = 'COMPLETED')
        THEN 'COMPLETED'
      WHEN bool_and(o.status IN ('CANCELLED', 'REJECTED'))
        THEN 'CANCELLED'
      WHEN bool_and(o.status IN ('DELIVERED', 'COMPLETED'))
        THEN 'DELIVERED'
      WHEN bool_or(o.status = 'DISPUTED')
        THEN 'DISPUTED'
      WHEN bool_or(o.status IN ('OUT_FOR_DELIVERY', 'ASSIGNED', 'PICKED_UP'))
        THEN 'OUT_FOR_DELIVERY'
      WHEN bool_or(o.status IN ('PREPARING', 'READY'))
        THEN 'PREPARING'
      WHEN bool_or(o.status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED'))
        THEN 'ACCEPTED'
      WHEN bool_or(o.status IN ('SUBMITTED', 'PENDING_CONFIRMATION'))
        THEN 'SUBMITTED'
      ELSE NULL
    END AS derived_status
  FROM orders o
  GROUP BY o.master_order_id
) aggregated
WHERE mo.id = aggregated.master_order_id
  AND aggregated.derived_status IS NOT NULL
  AND mo.status IS DISTINCT FROM aggregated.derived_status;
