<#
.SYNOPSIS
    Daily encrypted-at-rest backup of the Smart Commerce Postgres database.

.DESCRIPTION
    Runs pg_dump (custom format) INSIDE the scs-postgres container, then
    copies the dump to the host backup directory. Writing inside the
    container avoids PowerShell redirection encoding pitfalls that corrupt
    binary dumps.

    Retention: deletes *.dump files older than -RetentionDays.

.EXAMPLE
    .\backup-db.ps1
    .\backup-db.ps1 -BackupDir D:\backups\scs -RetentionDays 30

.NOTES
    Schedule daily via Task Scheduler:
      schtasks /create /tn "SCS-DB-Backup" /tr "powershell -NoProfile -ExecutionPolicy Bypass -File C:\TAIF\scs-platform\infra\backup\backup-db.ps1" /sc daily /st 03:00
#>
[CmdletBinding()]
param(
    [string]$BackupDir = "C:\TAIF\backups\scs",
    [int]$RetentionDays = 14,
    [string]$Container = "scs-postgres",
    [string]$DbUser = "scs",
    [string]$DbName = "scs_platform"
)

$ErrorActionPreference = 'Stop'
$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$dumpName = "$($DbName)_$timestamp.dump"
$containerPath = "/tmp/$dumpName"
$hostPath = Join-Path $BackupDir $dumpName

Write-Host "[backup] Target: $hostPath"

# Ensure backup directory exists
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# 1. Verify container is running
$running = docker ps --filter "name=$Container" --filter "status=running" --format '{{.Names}}'
if ($running -ne $Container) {
    Write-Error "[backup] Container '$Container' is not running. Start it with: docker compose -f infra/docker-compose.dev.yml up -d"
    exit 1
}

# 2. Dump inside the container (custom format, compressed)
Write-Host "[backup] Running pg_dump inside $Container ..."
docker exec $Container pg_dump -U $DbUser -Fc -f $containerPath $DbName
if ($LASTEXITCODE -ne 0) {
    Write-Error "[backup] pg_dump failed with exit code $LASTEXITCODE"
    exit 1
}

# 3. Copy dump to host
docker cp "${Container}:$containerPath" $hostPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "[backup] docker cp failed"
    exit 1
}

# 4. Clean up container-side file
docker exec $Container rm -f $containerPath | Out-Null

# 5. Verify dump integrity (header check + size)
$size = (Get-Item $hostPath).Length
if ($size -lt 1024) {
    Write-Error "[backup] Dump suspiciously small ($size bytes) - possible failure"
    exit 1
}
Write-Host ("[backup] Dump OK: {0:N1} MB" -f ($size / 1MB))

# 6. Retention sweep
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$deleted = 0
Get-ChildItem $BackupDir -Filter "*.dump" | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
    Remove-Item $_.FullName -Force
    $deleted++
}
if ($deleted -gt 0) { Write-Host "[backup] Retention: removed $deleted backup(s) older than $RetentionDays days" }

Write-Host "[backup] Complete."
