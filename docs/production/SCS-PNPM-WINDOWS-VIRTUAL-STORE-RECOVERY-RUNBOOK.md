# SCS Platform — Windows pnpm Virtual-Store Recovery Runbook (R6)

**Scope:** infrastructure stabilization for the `scs-platform` pnpm workspace on Windows.
**Constraint:** do NOT change dependency versions, `package.json`, or `pnpm-lock.yaml` to "fix" this. This is a corruption/relink problem, not a dependency-upgrade problem.

---

## 1. Symptom signature

A production build fails with a *missing file inside an already-installed package*, most often:

```text
Error: Cannot find module '...\node_modules\.pnpm\next@<ver>...\node_modules\
       next\dist\compiled\jest-worker\processChild.js'
```

Other observed variants:

- `next\dist\bin\next` missing (admin/web dev or build).
- `busboy`, `es-module-lexer`, or SWC binaries missing.
- `bcrypt` `.node` `EPERM` during install when a running server holds the native file open.

**It is never an application-code defect.** The package directory exists but is incomplete, so a plain `pnpm install` reports *"Already up to date"* and changes nothing (pnpm only checks that the folder exists, not that its files are present).

Root cause on this host: concurrent long-running `node` processes (API/web/admin dev or preview servers) and/or antivirus briefly lock hard-linked files under `node_modules\.pnpm`, so an interrupted relink leaves a package partially materialized.

## 2. Verify corruption before repairing (path check, not assumptions)

```powershell
# Resolve one of the known-missing artifacts and test it directly.
Test-Path "C:\TAIF\scs-platform\node_modules\.pnpm" -PathType Container
# After you know the exact next version dir, Test-Path the specific file. Expect False when corrupted.
```

Do not conclude a repair failed because `pnpm install` said *"Already up to date"* — confirm the specific file with `Test-Path` (a true repair flips `False → True`).

## 3. Safe recovery procedure (verified on this host)

Run these **in order**. This exact sequence restored `processChild.js` and produced green `@scs/web` + `@scs/api` production builds twice during the P10 remediation.

1. **Stop every Node process that could hold locks** (API, web/admin preview, dev servers, background build watchers):

   ```powershell
   Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
   # Confirm the ports are free (3000 api, 3100 web, 3001 admin):
   Get-NetTCPConnection -State Listen -LocalPort 3000,3100,3001 -ErrorAction SilentlyContinue
   ```

2. **Re-materialize from the local store, offline (no version/lockfile change):**

   ```powershell
   Set-Location C:\TAIF\scs-platform
   pnpm install --offline --force
   ```

   - `--force` recomputes `node_modules` and re-links from the global store shards; `--offline` avoids any network/registry drift.
   - A `cpu-features` native-build error (`Unable to detect compiler type`) is an **optional transitive (SSH2)** and does **not** affect api/web/admin/mobile — do not treat it as a blocking failure.

3. **Verify the previously-missing artifact is back:**

   ```powershell
   Test-Path "C:\TAIF\scs-platform\node_modules\.pnpm\*\node_modules\next\dist\compiled\jest-worker\processChild.js"
   ```

4. **Rebuild** (`turbo.cmd` / package-local `.bin` shims may lag until the install fully settles — re-run if a shim is momentarily absent):

   ```powershell
   pnpm --filter @scs/web run build
   pnpm --filter @scs/api run build
   ```

## 4. If `pnpm install --force` aborts with `EPERM` on a native module

When an install aborts on a *specific* native-module directory (e.g. `bcrypt@6.0.0`), it fails **before** `.bin` shims are linked, so every tool (vitest/nest/next) then errors with `MODULE_NOT_FOUND`/`Command not found`. Repeated `--force` retries do not help (pnpm re-creates and re-locks the same dir).

Fallback that has worked in this repo: pre-create the offending package directory with a minimal placeholder, then finish with a **non-force** install so pnpm skips the locked dir and links shims:

```powershell
pnpm install --ignore-scripts
```

> Do not rely on a stubbed native package for anything that asserts its real behavior (crypto/auth hashing). Stub only to unblock tooling, then restore properly once the lock is released.

## 5. Last-resort full re-materialize

If corruption is widespread (many packages, `--offline --force` insufficient) and the network is available:

```powershell
pnpm store prune
Remove-Item -Recurse -Force C:\TAIF\scs-platform\node_modules
pnpm install --no-frozen-lockfile   # no version edits; just relink everything
```

Confirm `Test-Path` on `next\dist\bin\next` and `processChild.js` return `True` before rebuilding.

## 6. Prevention

- Do not run builds/installs while a dev/preview `node` server holds files on the same `node_modules`; stop it first.
- Avoid piping long-running builds through `Select-Object`/`head` in PowerShell — it can send SIGPIPE and kill the build with no error text. Redirect to a log (`*> build.log`) and read the file.

## 7. Honesty note

This instability is **host/environment-specific** (Windows file locking around pnpm's hard-linked virtual store + concurrent Node processes + antivirus scanning). The repository itself is not defective and no repo change permanently eliminates it. `pnpm install --offline --force` after releasing locks is the sanctioned, repeatable recovery that was actually verified in the P10 remediation environment; it does not alter versions or the lockfile.
