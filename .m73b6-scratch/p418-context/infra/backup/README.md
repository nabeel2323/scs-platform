# Database Backup & Restore Runbook

**Scope**: `scs_platform` Postgres 16 database (container `scs-postgres`).
**Policy**: daily logical backup, 14-day retention (dev), 30-day (pilot).

## Daily Backup

Backups run via `pg_dump` custom format inside the container, copied to the host.

| Platform | Script | Schedule |
|----------|--------|----------|
| Windows (dev) | `infra/backup/backup-db.ps1` | Task Scheduler, 03:00 daily |
| Linux (pilot/prod) | `infra/backup/backup-db.sh` | cron: `0 3 * * *` |

Windows scheduling (one-time setup):

```powershell
schtasks /create /tn "SCS-DB-Backup" `
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\TAIF\scs-platform\infra\backup\backup-db.ps1" `
  /sc daily /st 03:00
```

Linux scheduling:

```cron
0 3 * * * /opt/scs/infra/backup/backup-db.sh /var/backups/scs 14 >> /var/log/scs-backup.log 2>&1
```

> **Production note**: copy the `.dump` to off-host storage (S3/MinIO `scs-backups`
> bucket) after creation — the pilot VPS must not hold its own only copy.

## Restore Drill (monthly, and after every schema migration wave)

A backup that has never been restored is not a backup. Run this drill monthly
and record the result in the ops log.

```powershell
# 1. Pick the latest dump
$dump = Get-ChildItem C:\TAIF\backups\scs\*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# 2. Copy into the container
docker cp $dump.FullName scs-postgres:/tmp/restore-test.dump

# 3. Create a throwaway database
docker exec scs-postgres psql -U scs -d postgres -c "DROP DATABASE IF EXISTS restore_test"
docker exec scs-postgres psql -U scs -d postgres -c "CREATE DATABASE restore_test"

# 4. Restore
docker exec scs-postgres pg_restore -U scs -d restore_test --no-owner /tmp/restore-test.dump

# 5. Verify — row counts on critical tables must be > 0 and match expectations
docker exec scs-postgres psql -U scs -d restore_test -t -A -c "SELECT 'users', count(*) FROM users UNION ALL SELECT 'products', count(*) FROM products UNION ALL SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'sessions', count(*) FROM sessions"

# 6. Clean up
docker exec scs-postgres psql -U scs -d postgres -c "DROP DATABASE restore_test"
docker exec scs-postgres rm -f /tmp/restore-test.dump
```

**Pass criteria**: step 4 exits 0; step 5 returns counts matching the live
database (allowing for writes since the backup). Any `pg_restore` errors about
missing extensions are resolved by `CREATE EXTENSION IF NOT EXISTS postgis;`
in the restore target before step 4.

## Emergency Point-in-Time Recovery (future)

Logical dumps are sufficient for the pilot. Before Phase 3 (payments), enable
WAL archiving + `pg_basebackup` for PITR; track as infrastructure debt.
