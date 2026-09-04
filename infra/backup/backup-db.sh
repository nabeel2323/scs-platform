#!/usr/bin/env bash
# ============================================================
# Daily backup of the Smart Commerce Postgres database (Linux).
# Dumps inside the container (custom format), copies to host,
# enforces retention.
#
# Usage:   ./backup-db.sh [BACKUP_DIR] [RETENTION_DAYS]
# Cron:    0 3 * * * /opt/scs/infra/backup/backup-db.sh /var/backups/scs 14 >> /var/log/scs-backup.log 2>&1
# ============================================================
set -euo pipefail

BACKUP_DIR="${1:-/var/backups/scs}"
RETENTION_DAYS="${2:-14}"
CONTAINER="${CONTAINER:-scs-postgres}"
DB_USER="${DB_USER:-scs}"
DB_NAME="${DB_NAME:-scs_platform}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DUMP_NAME="${DB_NAME}_${TIMESTAMP}.dump"
CONTAINER_PATH="/tmp/${DUMP_NAME}"
HOST_PATH="${BACKUP_DIR}/${DUMP_NAME}"

echo "[backup] Target: ${HOST_PATH}"
mkdir -p "${BACKUP_DIR}"

# 1. Verify container is running
if ! docker ps --filter "name=${CONTAINER}" --filter "status=running" --format '{{.Names}}' | grep -qx "${CONTAINER}"; then
  echo "[backup] ERROR: container '${CONTAINER}' is not running" >&2
  exit 1
fi

# 2. Dump inside the container (custom format, compressed)
echo "[backup] Running pg_dump inside ${CONTAINER} ..."
docker exec "${CONTAINER}" pg_dump -U "${DB_USER}" -Fc -f "${CONTAINER_PATH}" "${DB_NAME}"

# 3. Copy to host + clean up container-side file
docker cp "${CONTAINER}:${CONTAINER_PATH}" "${HOST_PATH}"
docker exec "${CONTAINER}" rm -f "${CONTAINER_PATH}"

# 4. Verify size
SIZE="$(stat -c%s "${HOST_PATH}")"
if [ "${SIZE}" -lt 1024 ]; then
  echo "[backup] ERROR: dump suspiciously small (${SIZE} bytes)" >&2
  exit 1
fi
echo "[backup] Dump OK: $((SIZE / 1024 / 1024)) MB"

# 5. Retention sweep
find "${BACKUP_DIR}" -name '*.dump' -mtime "+${RETENTION_DAYS}" -delete
echo "[backup] Complete."
