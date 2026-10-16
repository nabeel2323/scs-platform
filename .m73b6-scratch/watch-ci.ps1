# Phase 4.1.14 - hosted CI watcher (read-only GitHub REST polling)
Set-Location C:\TAIF\scs-platform
$repo  = 'nabeel2323/scs-platform'
$h     = @{ Accept = 'application/vnd.github+json' }
$runId = 38881220631
$concl = $null
for ($i = 0; $i -lt 50; $i++) {
  try {
    $run = Invoke-RestMethod -Headers $h -Uri "https://api.github.com/repos/$repo/actions/runs/$runId"
    "TICK i=$i status=$($run.status)"
    if ($run.status -eq 'completed') { $concl = $run.conclusion; break }
  } catch { "POLL_ERROR: $($_.Exception.Message)" }
  Start-Sleep -Seconds 60
}
"FINAL_STATUS=$concl"
"RUN_URL=https://github.com/$repo/actions/runs/$runId"
try {
  $jobs = Invoke-RestMethod -Headers $h -Uri "https://api.github.com/repos/$repo/actions/runs/$runId/jobs?per_page=30"
  "JOBS:"
  $jobs.jobs | ForEach-Object { "{0} | {1} | {2} | started={3} completed={4}" -f $_.name, $_.status, $_.conclusion, $_.started_at, $_.completed_at }
} catch { "JOBS_ERROR: $($_.Exception.Message)" }
