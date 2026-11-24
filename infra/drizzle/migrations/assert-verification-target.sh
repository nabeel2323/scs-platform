#!/bin/sh
# Safety gate for manually invoked disposable migration-verification databases.
assert_verification_target() {
  expected_database="$1"
  expected_user="$2"

  if [ "${SCS_ENVIRONMENT:-}" != "test" ]; then
    echo "Refusing verification DB access: SCS_ENVIRONMENT must be test." >&2
    exit 1
  fi
  if [ "${SCS_MIGRATION_VERIFY_CONFIRM:-}" != "$expected_database" ]; then
    echo "Refusing verification DB access: set SCS_MIGRATION_VERIFY_CONFIRM=$expected_database." >&2
    exit 1
  fi
  case "${PGHOST:-}" in
    ""|localhost|127.0.0.1|::1) ;;
    *)
      echo "Refusing verification DB access: PGHOST must be local." >&2
      exit 1
      ;;
  esac
  if [ -n "${PGSERVICE:-}" ]; then
    echo "Refusing verification DB access: PGSERVICE must not redirect the connection." >&2
    exit 1
  fi

  actual_database=$(psql -X -U "$expected_user" -d "$expected_database" -v ON_ERROR_STOP=1 -tA -c 'SELECT current_database()' 2>/dev/null) || {
    echo "Refusing verification DB access: target database is unavailable." >&2
    exit 1
  }
  actual_user=$(psql -X -U "$expected_user" -d "$expected_database" -v ON_ERROR_STOP=1 -tA -c 'SELECT current_user' 2>/dev/null) || {
    echo "Refusing verification DB access: database identity could not be verified." >&2
    exit 1
  }
  if [ "$actual_database" != "$expected_database" ] || [ "$actual_user" != "$expected_user" ]; then
    echo "Refusing verification DB access: connected to $actual_database as $actual_user." >&2
    exit 1
  fi
  echo "[verification DB safety] confirmed local $actual_database as $actual_user."
}
