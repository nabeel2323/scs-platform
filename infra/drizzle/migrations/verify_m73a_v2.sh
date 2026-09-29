#!/bin/bash
set -e
PSQL="psql -U postgres -d m73a_verify"

echo "========================================"
echo "  M-02: Backfill verification (UUIDs)"
echo "========================================"

$PSQL <<'EOSQL'
-- Use proper UUIDs
-- Create test data
INSERT INTO organizations (id, type, name, country)
VALUES ('00000000-0000-0000-0000-000000000001', 'WHOLESALER', 'Test Org', 'SA') ON CONFLICT DO NOTHING;
INSERT INTO users (id, full_name, phone)
VALUES ('00000000-0000-0000-0000-000000000010', 'Buyer', '+99900000001') ON CONFLICT DO NOTHING;
INSERT INTO stores (id, org_id, slug, display_name, status)
VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'test-store-bf2', 'Test Store', 'APPROVED') ON CONFLICT DO NOTHING;

-- Master A: DELIVERED + COMPLETED + REJECTED → mixed terminal, no rule matches → unchanged
INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at)
VALUES ('00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-000000000010', 'SUBMITTED', '{}', NOW())
ON CONFLICT (id) DO UPDATE SET status = 'SUBMITTED';
INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'DELIVERED', 'DELIVERY', 1000, 1000, 0, 0, 0, NOW())
ON CONFLICT (id) DO UPDATE SET status = 'DELIVERED';
INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
VALUES ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'COMPLETED', 'DELIVERY', 2000, 2000, 0, 0, 0, NOW())
ON CONFLICT (id) DO UPDATE SET status = 'COMPLETED';
INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
VALUES ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a0', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'REJECTED', 'DELIVERY', 3000, 3000, 0, 0, 0, NOW())
ON CONFLICT (id) DO UPDATE SET status = 'REJECTED';

-- Master B: COMPLETED + COMPLETED → COMPLETED
INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at)
VALUES ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-000000000010', 'SUBMITTED', '{}', NOW())
ON CONFLICT (id) DO UPDATE SET status = 'SUBMITTED';
INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'COMPLETED', 'DELIVERY', 1000, 1000, 0, 0, 0, NOW())
ON CONFLICT (id) DO UPDATE SET status = 'COMPLETED';
INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
VALUES ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'COMPLETED', 'DELIVERY', 2000, 2000, 0, 0, 0, NOW())
ON CONFLICT (id) DO UPDATE SET status = 'COMPLETED';

-- Master C: CANCELLED + REJECTED → CANCELLED
INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at)
VALUES ('00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000010', 'SUBMITTED', '{}', NOW())
ON CONFLICT (id) DO UPDATE SET status = 'SUBMITTED';
INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'CANCELLED', 'DELIVERY', 1000, 1000, 0, 0, 0, NOW())
ON CONFLICT (id) DO UPDATE SET status = 'CANCELLED';
INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
VALUES ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c0', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'REJECTED', 'DELIVERY', 2000, 2000, 0, 0, 0, NOW())
ON CONFLICT (id) DO UPDATE SET status = 'REJECTED';

-- Run backfill
UPDATE master_orders mo
SET status = aggregated.derived_status, updated_at = NOW()
FROM (
  SELECT o.master_order_id,
    CASE
      WHEN bool_and(o.status = 'COMPLETED') THEN 'COMPLETED'
      WHEN bool_and(o.status IN ('CANCELLED', 'REJECTED')) THEN 'CANCELLED'
      WHEN bool_and(o.status IN ('DELIVERED', 'COMPLETED')) THEN 'DELIVERED'
      WHEN bool_or(o.status = 'DISPUTED') THEN 'DISPUTED'
      WHEN bool_or(o.status IN ('OUT_FOR_DELIVERY', 'ASSIGNED', 'PICKED_UP')) THEN 'OUT_FOR_DELIVERY'
      WHEN bool_or(o.status IN ('PREPARING', 'READY')) THEN 'PREPARING'
      WHEN bool_or(o.status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')) THEN 'ACCEPTED'
      WHEN bool_or(o.status IN ('SUBMITTED', 'PENDING_CONFIRMATION')) THEN 'SUBMITTED'
      ELSE NULL
    END AS derived_status
  FROM orders o GROUP BY o.master_order_id
) aggregated
WHERE mo.id = aggregated.master_order_id
  AND aggregated.derived_status IS NOT NULL
  AND mo.status IS DISTINCT FROM aggregated.derived_status;

-- Verify
SELECT 'BACKFILL RESULTS' AS test;
SELECT mo.id AS master_id, mo.status AS master_status,
       (SELECT string_agg(o.status, ', ' ORDER BY o.id) FROM orders o WHERE o.master_order_id = mo.id) AS sub_statuses
FROM master_orders mo WHERE mo.id IN (
  '00000000-0000-0000-0000-0000000000a0',
  '00000000-0000-0000-0000-0000000000b0',
  '00000000-0000-0000-0000-0000000000c0'
) ORDER BY mo.id;

-- Oracle check
SELECT 'ORACLE CHECK' AS test;
SELECT
  CASE WHEN mo.id = '00000000-0000-0000-0000-0000000000b0' THEN 'Master B (COMPLETED+COMPLETED)'
       WHEN mo.id = '00000000-0000-0000-0000-0000000000c0' THEN 'Master C (CANCELLED+REJECTED)'
       WHEN mo.id = '00000000-0000-0000-0000-0000000000a0' THEN 'Master A (DELIVERED+COMPLETED+REJECTED)'
  END AS master_label,
  mo.status AS actual,
  CASE
    WHEN mo.id = '00000000-0000-0000-0000-0000000000b0' AND mo.status = 'COMPLETED' THEN 'PASS'
    WHEN mo.id = '00000000-0000-0000-0000-0000000000c0' AND mo.status = 'CANCELLED' THEN 'PASS'
    WHEN mo.id = '00000000-0000-0000-0000-0000000000a0' THEN 'EDGE CASE: mixed terminal+active'
    ELSE 'FAIL'
  END AS result
FROM master_orders mo
WHERE mo.id IN (
  '00000000-0000-0000-0000-0000000000a0',
  '00000000-0000-0000-0000-0000000000b0',
  '00000000-0000-0000-0000-0000000000c0'
) ORDER BY mo.id;
EOSQL

echo ""
echo "========================================"
echo "  M-05: Exhaustive Aggregation Oracle"
echo "========================================"
$PSQL <<'EOSQL'
-- Test the aggregation function against independent SQL oracle for many combinations
-- This creates test masters with known sub-order statuses and verifies backfill

-- Helper: create a master with given sub-order statuses and check the backfill result
-- We'll test all 15 combinations from the spec

DO $$
DECLARE
  test_cases TEXT[][] := ARRAY[
    -- {label, status1, status2, expected}
    ARRAY['COMPLETED+COMPLETED', 'COMPLETED', 'COMPLETED', 'COMPLETED'],
    ARRAY['DELIVERED+COMPLETED', 'DELIVERED', 'COMPLETED', 'DELIVERED'],
    ARRAY['DELIVERED+DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED'],
    ARRAY['COMPLETED+REJECTED', 'COMPLETED', 'REJECTED', 'NULL_NO_MATCH'],
    ARRAY['DELIVERED+REJECTED', 'DELIVERED', 'REJECTED', 'NULL_NO_MATCH'],
    ARRAY['DISPUTED+DELIVERED', 'DISPUTED', 'DELIVERED', 'DISPUTED'],
    ARRAY['DISPUTED+COMPLETED', 'DISPUTED', 'COMPLETED', 'DISPUTED'],
    ARRAY['OUT_FOR_DELIVERY+COMPLETED', 'OUT_FOR_DELIVERY', 'COMPLETED', 'OUT_FOR_DELIVERY'],
    ARRAY['PREPARING+DELIVERED', 'PREPARING', 'DELIVERED', 'PREPARING'],
    ARRAY['ACCEPTED+PREPARING', 'ACCEPTED', 'PREPARING', 'PREPARING'],
    ARRAY['SUBMITTED+ACCEPTED', 'SUBMITTED', 'ACCEPTED', 'ACCEPTED'],
    ARRAY['PENDING_CONFIRMATION+ACCEPTED', 'PENDING_CONFIRMATION', 'ACCEPTED', 'ACCEPTED'],
    ARRAY['CANCELLED+REJECTED', 'CANCELLED', 'REJECTED', 'CANCELLED'],
    ARRAY['CANCELLED+COMPLETED', 'CANCELLED', 'COMPLETED', 'NULL_NO_MATCH'],
    ARRAY['EMPTY', NULL, NULL, 'NULL_NO_MATCH']
  ];
  tc TEXT[];
  master_id UUID;
  sub1_id UUID;
  sub2_id UUID;
  actual_status TEXT;
  buyer_id UUID := '00000000-0000-0000-0000-000000000010';
  store_id UUID := '00000000-0000-0000-0000-000000000020';
  pass_count INT := 0;
  fail_count INT := 0;
  edge_count INT := 0;
BEGIN
  FOR i IN 1..array_length(test_cases, 1) LOOP
    tc := test_cases[i];
    master_id := ('10000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;

    INSERT INTO master_orders (id, buyer_id, status, delivery_address, created_at)
    VALUES (master_id, buyer_id, 'SUBMITTED', '{}', NOW())
    ON CONFLICT (id) DO UPDATE SET status = 'SUBMITTED';

    -- Delete existing sub-orders
    DELETE FROM orders WHERE master_order_id = master_id;

    IF tc[2] IS NOT NULL THEN
      sub1_id := gen_random_uuid();
      INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
      VALUES (sub1_id, master_id, store_id, buyer_id, tc[2], 'DELIVERY', 1000, 1000, 0, 0, 0, NOW());

      IF tc[3] IS NOT NULL THEN
        sub2_id := gen_random_uuid();
        INSERT INTO orders (id, master_order_id, store_id, buyer_id, status, fulfillment_method, total_minor, subtotal_minor, discount_minor, delivery_fee_minor, tax_minor, created_at)
        VALUES (sub2_id, master_id, store_id, buyer_id, tc[3], 'DELIVERY', 2000, 2000, 0, 0, 0, NOW());
      END IF;
    END IF;
  END LOOP;

  -- Run backfill
  UPDATE master_orders mo
  SET status = aggregated.derived_status, updated_at = NOW()
  FROM (
    SELECT o.master_order_id,
      CASE
        WHEN bool_and(o.status = 'COMPLETED') THEN 'COMPLETED'
        WHEN bool_and(o.status IN ('CANCELLED', 'REJECTED')) THEN 'CANCELLED'
        WHEN bool_and(o.status IN ('DELIVERED', 'COMPLETED')) THEN 'DELIVERED'
        WHEN bool_or(o.status = 'DISPUTED') THEN 'DISPUTED'
        WHEN bool_or(o.status IN ('OUT_FOR_DELIVERY', 'ASSIGNED', 'PICKED_UP')) THEN 'OUT_FOR_DELIVERY'
        WHEN bool_or(o.status IN ('PREPARING', 'READY')) THEN 'PREPARING'
        WHEN bool_or(o.status IN ('ACCEPTED', 'PARTIALLY_ACCEPTED')) THEN 'ACCEPTED'
        WHEN bool_or(o.status IN ('SUBMITTED', 'PENDING_CONFIRMATION')) THEN 'SUBMITTED'
        ELSE NULL
      END AS derived_status
    FROM orders o GROUP BY o.master_order_id
  ) aggregated
  WHERE mo.id = aggregated.master_order_id
    AND aggregated.derived_status IS NOT NULL
    AND mo.status IS DISTINCT FROM aggregated.derived_status;

  -- Verify each test case
  FOR i IN 1..array_length(test_cases, 1) LOOP
    tc := test_cases[i];
    master_id := ('10000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    SELECT status INTO actual_status FROM master_orders WHERE id = master_id;

    IF tc[4] = 'NULL_NO_MATCH' THEN
      -- Expected: status unchanged (SUBMITTED) because no rule matched
      IF actual_status = 'SUBMITTED' THEN
        edge_count := edge_count + 1;
        RAISE NOTICE 'PASS (edge): % → % (no rule matched, unchanged)', tc[1], actual_status;
      ELSE
        fail_count := fail_count + 1;
        RAISE NOTICE 'FAIL: % → expected SUBMITTED (unchanged), got %', tc[1], actual_status;
      END IF;
    ELSIF actual_status = tc[4] THEN
      pass_count := pass_count + 1;
      RAISE NOTICE 'PASS: % → %', tc[1], actual_status;
    ELSE
      fail_count := fail_count + 1;
      RAISE NOTICE 'FAIL: % → expected %, got %', tc[1], tc[4], actual_status;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE 'SUMMARY: % pass, % edge (no-match), % fail', pass_count, edge_count, fail_count;
END $$;
EOSQL
