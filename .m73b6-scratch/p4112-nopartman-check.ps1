# P13 Phase 4.1.12 — missing-extension failure behavior
# Runs the CI migration runner against a throwaway DB in the dev postgres image
# (postgis/postgis:16-3.4 — NO pg_partman). Expect explicit failure at 0013.
$ErrorActionPreference = 'Continue'
Set-Location C:\TAIF\scs-platform

docker exec scs-postgres psql -U scs -d scs_platform -c "DROP DATABASE IF EXISTS scs_p4112_nopartman;" 2>&1 | Out-Null
docker exec scs-postgres psql -U scs -d scs_platform -c "CREATE DATABASE scs_p4112_nopartman;" 2>&1 | Out-Null

$env:DATABASE_URL = 'postgresql://scs:scs@localhost:15432/scs_p4112_nopartman'
Write-Output "=== RUN against image WITHOUT pg_partman (expect explicit failure at 0013) ==="
pnpm --filter @scs/api run db:migrate:ci 2>&1 | Select-Object -Last 6
Write-Output "RUN_NOPARTMAN_EXIT: $LASTEXITCODE"
Remove-Item Env:DATABASE_URL

docker exec scs-postgres psql -U scs -d scs_platform -c "DROP DATABASE IF EXISTS scs_p4112_nopartman;" | Out-Null
Write-Output "=== throwaway DB dropped ==="
