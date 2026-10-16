# p4116-watch-ci.ps1 - poll GitHub Actions for the run triggered by commit c01267c
$sha = 'c01267cfd9be8cac72edb9333f7c7f036647fc1a'
$h = @{ 'User-Agent' = 'p4116-watch' }
$base = 'https://api.github.com/repos/nabeel2323/scs-platform/actions'

$run = $null
for ($i = 0; $i -lt 30; $i++) {
  try {
    $runs = Invoke-RestMethod -Uri "$base/runs?head_sha=$sha&per_page=5" -Headers $h -TimeoutSec 30
    if ($runs.total_count -gt 0) { $run = $runs.workflow_runs[0]; break }
  } catch { Write-Output ("RUNLIST_ERR " + $_.Exception.Message) }
  Start-Sleep -Seconds 10
}
if (-not $run) { Write-Output 'RUN_NOT_FOUND'; exit 2 }
Write-Output ("RUN_ID=" + $run.id)
Write-Output ("RUN_URL=" + $run.html_url)
Write-Output ("META name=" + $run.name + " event=" + $run.event + " branch=" + $run.head_branch + " attempt=" + $run.run_attempt)

for ($i = 0; $i -lt 90; $i++) {
  try {
    $r = Invoke-RestMethod -Uri "$base/runs/$($run.id)" -Headers $h -TimeoutSec 30
    Write-Output ("POLL status=" + $r.status + " conclusion=" + $r.conclusion)
    if ($r.status -eq 'completed') { break }
  } catch { Write-Output ("POLL_ERR " + $_.Exception.Message) }
  Start-Sleep -Seconds 20
}

$j = Invoke-RestMethod -Uri "$base/runs/$($run.id)/jobs?per_page=30" -Headers $h -TimeoutSec 30
foreach ($job in $j.jobs) {
  Write-Output ("JOB " + $job.name + " | " + $job.status + " | " + $job.conclusion + " | " + $job.started_at + " -> " + $job.completed_at)
  foreach ($s in $job.steps) {
    Write-Output ("  STEP " + $s.number + " " + $s.name + " | " + $s.status + " | " + $s.conclusion)
  }
}
Write-Output 'WATCH_DONE'
