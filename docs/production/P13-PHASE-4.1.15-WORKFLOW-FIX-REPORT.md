# P13 PHASE 4.1.15 - WORKFLOW FIX REPORT

Date: 2026-10-16
Phase: 4.1.15 - Container-build workflow repair and hosted-CI re-verification (pre-push preflight)
File changed: .github/workflows/ci.yml (only)

## 1. Root Cause 1 (as reported in 4.1.14, re-confirmed from committed bytes)

The container-build job (ci.yml L320-403 at HEAD 13f2634) is the only pnpm-consuming job in the
workflow without toolchain setup. Its steps are: checkout -> Set up Docker Buildx -> Build API
image -> Run deployment invariants spec (runs `pnpm install --frozen-lockfile` and
`pnpm --filter @scs/api test -- --run ...`) -> disposable services -> API container -> health ->
P13 config -> non-root -> cleanup. `pnpm` does not exist on the ubuntu-latest runner PATH, so the
first pnpm invocation died with shell exit 127 (command not found) - matching the hosted annotation
on run #386, job 116911122701.

Comparison basis: all 7 other pnpm-consuming jobs (lint, boundary-lint, test-unit,
test-integration, migration-gate, test-contract, build) carry the identical setup pair - always
`pnpm/action-setup@v4` FIRST (with `version: ${{ env.PNPM_VERSION }}`), then
`actions/setup-node@v4` (with `node-version: ${{ env.NODE_VERSION }}`, `cache: pnpm`) - because
setup-node's `cache: pnpm` needs pnpm on PATH to resolve the store. Order is therefore pnpm first,
Node second, before any host-runner pnpm command. mobile (flutter only) and k6-smoke (k6 action
only) legitimately consume no pnpm.

## 2. Root Cause 2 (new discovery, found by local verification of the exact hosted command)

The invariants command as committed cannot run under pnpm 9.15.9 even with pnpm installed:

```
$ pnpm --filter @scs/api test -- --run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
 ERROR  Unknown option: 'run'
For help, run: pnpm help test
SPEC_EXIT=1
```

pnpm's own parser rejects `--run` (it is evaluated as a pnpm option, not forwarded). This is a
pnpm argument-parsing behavior, platform-independent, so the hosted Linux runner would fail with
exit 1 at the same step even after the toolchain fix. The repository's own proven pattern is the
explicit-`run` form, already hosted-green in run #386 (Migration Full Apply job):
`pnpm --filter @scs/api run db:migrate:ci -- --dry-run`.

Corrected form verified locally: `pnpm --filter @scs/api run test -- --run <spec>` -> EXIT 0,
36/36 tests passed. The fix runs the identical spec file; nothing about the tests changes.

## 3. Change 1 - Toolchain setup (inserted after checkout, before Buildx)

```yaml
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
```

Byte-equivalent in structure to the 7 working jobs (same action versions, same env indirection,
same cache configuration). Placed at step indexes 1 and 2; the first host-runner pnpm command is
at step index 5, so setup precedes all pnpm commands in the job.

## 4. Change 2 - Command repair (same step, same spec)

```yaml
-          pnpm --filter @scs/api test -- --run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
+          pnpm --filter @scs/api run test -- --run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
```

## 5. Safety Gates Preserved (verified post-edit)

| Gate | Verdict |
|---|---|
| p41-deployment-invariants.spec.ts unchanged (36/36 PASS via corrected command) | PASS |
| No continue-on-error / error suppression / [skip ci] added (container-build continue-on-error count = 0) | PASS |
| Test expectations untouched | PASS |
| Dockerfile, package manifests, lockfile, application source untouched | PASS |
| Smoke checks (disposable services, health, P13 echo, non-root, cleanup) untouched | PASS |
| Migrations / financial business logic untouched | PASS |
| P13_WORKER_ENABLED=false preserved in workflow | PASS |
| P13_PILOT_MODE=legacy preserved in workflow | PASS |
| Pilot allowlist / production webhook activation untouched (no such change exists) | PASS |

## 6. Scope

- Functional change confined to .github/workflows/ci.yml: +10 / -1 (two hunks).
- Root Cause 2 was discovered inside the same file during local verification; no second file was
  touched, so no scope expansion occurred and no stop-and-document was required.

## 7. Status Summary

| Gate | Status |
|---|---|
| Root cause 1 confirmed (missing toolchain setup) | PASS |
| Root cause 2 confirmed (pnpm arg forwarding without `run` keyword) | PASS |
| Minimal workflow-only fix applied, correctly ordered | PASS |
| Safety gates preserved | PASS |
| Hosted re-verification | NOT RUN (next gate; requires push authorization) |
