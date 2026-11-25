#!/bin/sh
# P12 Migration verification runner — applies 0001..0058 to scs_p12_verify
# Skips 0013_analytics.sql and 0018_analytics_retention.sql (require pg_partman)
set -e
. "$(dirname "$0")/assert-verification-target.sh"
assert_verification_target scs_p12_verify scs
DB=scs_p12_verify
USR=scs
DIR=/tmp/p12verify-migrations

apply_transactionally() {
  source_file="$1"
  temp_sql=$(mktemp)
  {
    printf '%s\n' 'BEGIN;' 'SELECT pg_advisory_xact_lock(5456723, 1);'
    cat "$source_file"
    printf '%s\n' 'COMMIT;'
  } > "$temp_sql"
  output=$(psql -X -U "$USR" -d "$DB" -v ON_ERROR_STOP=1 -q -f "$temp_sql" 2>&1)
  result=$?
  rm -f "$temp_sql"
  if [ "$result" -ne 0 ]; then
    printf '%s\n' "$output" >&2
    return "$result"
  fi
  return 0
}

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
  if output=$(apply_transactionally "$f" 2>&1); then
    APPLIED=$((APPLIED + 1))
  else
    echo "FAIL: $name"
    printf '%s\n' "$output" | tail -10
    FAILED=$((FAILED + 1))
  fi
done
echo "APPLIED=$APPLIED FAILED=$FAILED"

echo ""
echo "=== IDEMPOTENT RERUN: applying 0058 again ==="
if output=$(apply_transactionally "$DIR/0058_payment_financial_architecture.sql" 2>&1); then
  echo "RERUN_0058=OK"
else
  echo "RERUN_0058=FAIL"
  printf '%s\n' "$output" | tail -10
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
