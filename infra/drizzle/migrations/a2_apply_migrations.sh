#!/bin/bash
set -e
PSQL="psql -U postgres -d m73a_verify"

# Create migration log table
$PSQL -c "CREATE TABLE IF NOT EXISTS _migration_log (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW());" 2>/dev/null

# Exclusion list (pg_partman dependent)
EXCLUDE="0013_analytics.sql 0018_analytics_retention.sql"

MIGRATION_DIR="/migrations"
APPLIED=0
SKIPPED=0
FAILED=0

for f in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
  BASENAME=$(basename "$f")
  
  # Check exclusion
  SKIP=false
  for ex in $EXCLUDE; do
    if [ "$BASENAME" = "$ex" ]; then SKIP=true; break; fi
  done
  if $SKIP; then
    echo "SKIP (pg_partman): $BASENAME"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi
  
  # Check if already applied
  EXISTS=$($PSQL -t -A -c "SELECT COUNT(*) FROM _migration_log WHERE name = '$BASENAME';" 2>/dev/null)
  if [ "$EXISTS" = "1" ]; then
    echo "ALREADY APPLIED: $BASENAME"
    continue
  fi
  
  # Apply
  echo -n "APPLYING: $BASENAME ... "
  if $PSQL -f "$f" > /dev/null 2>&1; then
    $PSQL -c "INSERT INTO _migration_log (name) VALUES ('$BASENAME') ON CONFLICT DO NOTHING;" > /dev/null 2>&1
    echo "OK"
    APPLIED=$((APPLIED + 1))
  else
    echo "FAILED"
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "Applied: $APPLIED | Skipped: $SKIPPED | Failed: $FAILED | Total logged: $($PSQL -t -A -c 'SELECT COUNT(*) FROM _migration_log;' 2>/dev/null)"
