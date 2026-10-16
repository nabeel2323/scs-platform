# p4115-smoke.ps1 - local rehearsal of ci.yml container-build smoke steps
# Mirrors the workflow steps exactly, except the image tag is scs-api:ci-test-local
# (the workflow builds scs-api:ci-test from the same Dockerfile).
$ErrorActionPreference = 'Continue'
$fail = 0
function Step($n) { Write-Output "=== $n ===" }

Step "pre-clean (idempotent)"
docker rm -f ci-api ci-postgres ci-redis 2>$null | Out-Null
docker network rm ci-smoke-net 2>$null | Out-Null

Step "image identity"
docker image inspect scs-api:ci-test-local --format 'user=[{{.Config.User}}] healthcheck={{if .Config.Healthcheck}}present{{else}}none{{end}}'

Step "start disposable services"
docker network create ci-smoke-net
docker run -d --name ci-postgres --network ci-smoke-net -e POSTGRES_PASSWORD=scs -e POSTGRES_USER=scs -e POSTGRES_DB=scs_platform postgres:16-alpine
docker run -d --name ci-redis --network ci-smoke-net redis:7-alpine
Start-Sleep -Seconds 10

Step "start api container with safe defaults"
docker run -d --name ci-api --network ci-smoke-net `
  -e NODE_ENV=production `
  -e DATABASE_URL=postgresql://scs:scs@ci-postgres:5432/scs_platform `
  -e REDIS_URL=redis://ci-redis:6379 `
  -e JWT_ACCESS_SECRET='ci-test-secret-at-least-16-chars!!' `
  -e S3_ENDPOINT=http://minio:9000 `
  -e S3_ACCESS_KEY=ci-test-key `
  -e S3_SECRET_KEY=ci-test-secret `
  -e API_CORS_ORIGINS=https://shop.example.com `
  -e P13_WORKER_ENABLED=false `
  -e P13_PILOT_MODE=legacy `
  scs-api:ci-test-local
Start-Sleep -Seconds 15

Step "container status"
docker ps --filter name=ci-api --format '{{.Names}} {{.Status}}'

Step "verify health: liveness"
docker exec ci-api curl -fsS http://localhost:3000/v1/healthz
if ($LASTEXITCODE -ne 0) { $fail++ }
Write-Output ""
Step "verify health: readiness"
docker exec ci-api curl -fsS http://localhost:3000/v1/readyz
if ($LASTEXITCODE -ne 0) { $fail++ }
Write-Output ""

Step "verify P13 configuration"
docker exec ci-api sh -c 'echo "P13_WORKER_ENABLED=$P13_WORKER_ENABLED"'
docker exec ci-api sh -c 'echo "P13_PILOT_MODE=$P13_PILOT_MODE"'

Step "verify non-root user"
$u = docker exec ci-api whoami
Write-Output "Container running as: $u"
if ($u -eq 'root') { Write-Output 'ERROR: Container running as root'; $fail++ } else { Write-Output 'OK: Container running as non-root user' }

Step "api logs tail"
docker logs --tail 5 ci-api

Step "cleanup"
docker rm -f ci-api ci-postgres ci-redis 2>$null | Out-Null
docker network rm ci-smoke-net 2>$null | Out-Null

Write-Output "SMOKE_FAIL_COUNT=$fail"
exit $fail
