#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/assert-verification-target.sh"
assert_verification_target m73a_verify postgres

PSQL=(psql -X -U postgres -d m73a_verify -v ON_ERROR_STOP=1)
MIGRATION_DIR="${MIGRATION_DIR:-/migrations}"
if [ ! -d "$MIGRATION_DIR" ]; then
  echo "Migration directory not found: $MIGRATION_DIR" >&2
  exit 1
fi

# Serialize ledger creation and every migration transaction with the same lock
# used by the application migration runners. Never record a partially applied file.
"${PSQL[@]}" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(5456723, 1);
CREATE TABLE IF NOT EXISTS _migration_log (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMIT;
SQL

stale_excluded=$("${PSQL[@]}" -tA -c "SELECT name FROM _migration_log WHERE name IN ('0013_analytics.sql', '0018_analytics_retention.sql') ORDER BY name")
if [ -n "$stale_excluded" ]; then
  echo "Refusing to continue: skipped pg_partman migrations are already in the ledger:" >&2
  printf '%s\\n' "$stale_excluded" >&2
  echo "The disposable database may contain partial migration state; recreate it explicitly." >&2
  exit 1
fi

APPLIED=0
SKIPPED=0
ALREADY=0
FAILED=0
shopt -s nullglob
files=("$MIGRATION_DIR"/*.sql)
if [ "${#files[@]}" -eq 0 ]; then
  echo "No SQL migration files found in $MIGRATION_DIR" >&2
  exit 1
fi

for file in "${files[@]}"; do
  BASENAME="$(basename "$file")"
  case "$BASENAME" in
    0013_analytics.sql|0018_analytics_retention.sql)
      echo "SKIP (pg_partman not installed in verification image): $BASENAME"
      SKIPPED=$((SKIPPED + 1))
      continue
      ;;
  esac

  temp_sql="$(mktemp)"
  {
    printf '%s\n' 'BEGIN;' 'SELECT pg_advisory_xact_lock(5456723, 1);'
    printf "SELECT EXISTS (SELECT 1 FROM _migration_log WHERE name = '%s') AS migration_already_applied \\gset\n" "$BASENAME"
    printf '%s\n' '\if :migration_already_applied' '\echo SCS_MIGRATION_ALREADY_APPLIED' 'COMMIT;' '\else'
    cat "$file"
    printf "INSERT INTO _migration_log (name) VALUES ('%s');\n" "$BASENAME"
    printf '%s\n' 'COMMIT;' '\endif'
  } > "$temp_sql"

  echo -n "APPLYING: $BASENAME ... "
  if output=$("${PSQL[@]}" -f "$temp_sql" 2>&1); then
    if [[ "$output" == *SCS_MIGRATION_ALREADY_APPLIED* ]]; then
      echo "ALREADY APPLIED"
      ALREADY=$((ALREADY + 1))
    else
      echo "OK"
      APPLIED=$((APPLIED + 1))
    fi
  else
    echo "FAILED"
    printf '%s\n' "$output" | tail -20 >&2
    FAILED=$((FAILED + 1))
  fi
  rm -f "$temp_sql"
done

TOTAL_LOGGED=$("${PSQL[@]}" -tA -c 'SELECT COUNT(*) FROM _migration_log')
echo
echo "Applied: $APPLIED | Already applied: $ALREADY | Skipped: $SKIPPED | Failed: $FAILED | Total logged: $TOTAL_LOGGED"
if [ "$FAILED" -gt 0 ]; then exit 1; fi
