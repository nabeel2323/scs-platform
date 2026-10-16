#!/bin/sh
# P12 Migration verification runner — applies 0001..0058 to scs_p12_verify
# Skips 0013_analytics.sql and 0018_analytics_retention.sql (require pg_partman)
set -e
DB=scs_p12_verify
USR=scs
DIR=/tmp/p12verify-migrations

echo "=== FRESH DATABASE: applying 0001 -> 0058 ==="
FAILED=0
APPLIED=0
for f in $(ls "$DIR"/*.sql | sort); do
  name=$(basename "$f")
  case "$name" in
    0013_analytics.sql|0018_analytics_retention.sql)
      echo "SKIP: $name (pg_partman)"
      continue
      ;;
  esac
  if psql -U "$USR" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null 2>&1; then
    APPLIED=$((APPLIED + 1))
  else
    echo "FAIL: $name"
    psql -U "$USR" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | tail -5
    FAILED=$((FAILED + 1))
  fi
done
echo "APPLIED=$APPLIED FAILED=$FAILED"

echo ""
echo "=== IDEMPOTENT RERUN: applying 0058 again ==="
if psql -U "$USR" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$DIR/0058_payment_financial_architecture.sql" >/dev/null 2>&1; then
  echo "RERUN_0058=OK"
else
  echo "RERUN_0058=FAIL"
  psql -U "$USR" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$DIR/0058_payment_financial_architecture.sql" 2>&1 | tail -10
fi

echo ""
echo "=== TABLE EXISTENCE ==="
psql -U "$USR" -d "$DB" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('payment_records','payment_events','refunds','settlement_records') ORDER BY tablename;"

echo ""
echo "=== ORDER COLUMNS (payment_method, payment_status) ==="
psql -U "$USR" -d "$DB" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='orders' AND column_name IN ('payment_method','payment_status') ORDER BY column_name;"

echo ""
echo "=== INDEXES ==="
psql -U "$USR" -d "$DB" -tAc "SELECT indexname FROM pg_indexes WHERE tablename IN ('payment_records','payment_events','refunds','settlement_records') ORDER BY indexname;"

echo ""
echo "=== CHECK CONSTRAINTS ==="
psql -U "$USR" -d "$DB" -tAc "SELECT conname FROM pg_constraint WHERE conname LIKE 'chk_%' AND conrelid IN ('payment_records'::regclass,'refunds'::regclass,'settlement_records'::regclass) ORDER BY conname;"

echo ""
echo "=== FOREIGN KEYS ==="
psql -U "$USR" -d "$DB" -tAc "SELECT conname FROM pg_constraint WHERE contype='f' AND conrelid IN ('payment_records'::regclass,'payment_events'::regclass,'refunds'::regclass,'settlement_records'::regclass) ORDER BY conname;"

echo "=== DONE ==="
