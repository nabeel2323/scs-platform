# P13 Phase 4.1.12 — fresh migration verification on disposable CI postgres
# Runs the repo's CI migration runner against a genuinely fresh database.
$ErrorActionPreference = 'Continue'
Set-Location C:\TAIF\scs-platform

$env:DATABASE_URL = 'postgresql://scs:scs_test@localhost:5434/scs_p4112_fresh'

Write-Output "=== RUN 1: fresh apply (expect 63 applied) ==="
pnpm --filter @scs/api run db:migrate:ci 2>&1 | Tee-Object -Variable r1 | Select-Object -Last 6
Write-Output "RUN1_EXIT: $LASTEXITCODE"

Write-Output "=== RUN 2: idempotency (expect all 63 already applied) ==="
pnpm --filter @scs/api run db:migrate:ci 2>&1 | Tee-Object -Variable r2 | Select-Object -Last 4
Write-Output "RUN2_EXIT: $LASTEXITCODE"

Remove-Item Env:DATABASE_URL
Write-Output "=== DONE ==="
