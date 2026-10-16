# SCS Catalog & Product Management — Phase 10 / P13 (Returns, Refunds & Disputes)
# Linux CI Build Verification — AC-P13-030 Closure

**Technical verdict:** `PASS WITH CONDITIONS`
**AC-P13-030 status:** `PASS` (web/admin production packaging now verified green in a clean Linux environment)
**Task type:** Verification only. No commit, push, deploy, or production-data change performed.

---

## 1. Exact source revision and patch identity

| Item | Value |
| --- | --- |
| Branch | `develop` |
| HEAD | `8d60e36` — "feat(returns): add returns oversight page and integrate returns module" |
| Prior reported baseline | `762d950` (`HEAD~1`) |
| `origin/develop` | `8d60e36` (HEAD equals remote tip) |
| Working tree (tracked) | **clean** — 0 modified |
| Working tree (untracked) | **0** untracked source; `docs/production/*.md` are gitignored working artifacts |
| Patch applied to CI | **None required.** All P13 changes are committed at `8d60e36`. |
| CI source export | `git archive -o p13ci_src.tar HEAD` → `tar -xf` → `p13ci_src` (no `node_modules`, no `.npmrc`) |
| Dependency lockfile | `pnpm-lock.yaml` (committed); install used `--frozen-lockfile` |
| `packageManager` | `pnpm@9.15.9` |
| `engines` | `node >= 20.0.0`, `pnpm >= 9.0.0` |

P13 surface verified present in the exported tree and compiled during the build:
returns module + schema, `p13-*` specs, migration `0059`, RBAC `seed-pg` `admin:returns:read`/`admin:returns:write` corrections, and the web/admin returns pages.

> Note: because the uncommitted P13 work from the prior session is now committed at `8d60e36`, the Rule-7 "uncommitted changes cannot transfer" blocker does **not** apply. The isolated runner builds the exact current committed tree.

## 2. Environment and tool versions

GitHub Actions cannot be triggered for this task (no push permitted), so the documented `ci.yml` **build job** was reproduced faithfully in an isolated Linux container.

| Item | Reproduced value | `ci.yml` reference |
| --- | --- | --- |
| Base image | `node:22-slim` (Debian bookworm, glibc) | `ubuntu-latest`, `NODE_VERSION: '22'` |
| Build toolchain | `apt-get install python3 make g++ ca-certificates` (provides node-gyp that ubuntu-latest preinstalls) | hosted runner default |
| Node.js in container | `v22.23.3` | Node 22 |
| Package manager | `pnpm 9.15.9` (via corepack) | `PNPM_VERSION: '9.15.9'` |
| Install policy | `pnpm install --frozen-lockfile` | same |
| Build command | `pnpm build` (`turbo run build`) | same |
| Type-check command | `pnpm typecheck` (`turbo run typecheck`) | lint job runs `pnpm typecheck` |

The full `node:22` image proved unusable on this host (pull wedged at extraction); `node:22-slim` + explicit toolchain was used as an equivalent. This is a runtime-base substitution only — it does **not** weaken build settings, suppress errors, or alter source.

## 3. Commands and exit codes

| # | Command | Result | Exit |
| --- | --- | --- | --- |
| 1 | `docker build -f Dockerfile.ci -t p13ci:head8d60e36 p13ci_src` (installs toolchain + `pnpm install --frozen-lockfile`) | Image built (2.22 GB) | `IMG_BUILD_EXIT=0` |
| 2 | `docker run --rm p13ci:head8d60e36 bash -lc 'pnpm typecheck'` | **Tasks: 9 successful, 9 total** (0 cached), 1m02.9s | `TYPECHECK_EXIT=0` |
| 3 | `docker run --rm p13ci:head8d60e36 bash -lc 'pnpm build'` | **Tasks: 6 successful, 6 total** (0 cached), 2m37.7s | `BUILD_EXIT=0` |

Per-package build results (step 3):

| Package | Command | Outcome |
| --- | --- | --- |
| `@scs/event-types`, `@scs/contracts`, `@scs/env` | `tsc` | success |
| `@scs/api` | `nest build` | `TSC Found 0 issues` → `Successfully compiled: 336 files with swc (601.9ms)` |
| `@scs/web` | `next build` | `Compiled successfully` → 42/42 static pages |
| `@scs/admin` | `next build` | `Compiled successfully` → 33/33 static pages |

P13 return routes present in the production manifests:
- `@scs/web`: `/returns`, `/returns/[id]`, `/merchant/returns`, `/merchant/returns/[id]`
- `@scs/admin`: `/returns`

## 4. Dependency installation result

`pnpm install --frozen-lockfile` completed with **exit 0** inside the image. Native module `cpu-features` compiled via node-gyp using the installed toolchain (`@nestjs/core` postinstall and lifecycle scripts ran clean).

Transient network events during install (self-recovered, no manual intervention):
```
WARN  GET .../@turbo/linux-64/-/linux-64-2.10.12.tgz error (ECONNRESET). Will retry in 10 seconds. 2 retries left.
WARN  GET .../@swc/core-linux-x64-musl/-/core-linux-x64-musl-1.16.1.tgz error (ECONNRESET). Will retry in 10 seconds. 2 retries left.
```
pnpm's built-in retry succeeded; the final install resolved 1208 packages and exited 0. No store seeding, no `--force`, no lockfile edits. `@swc/core-linux-x64-musl` is an optional musl (Alpine) variant; the glibc Debian base uses the `-gnu` binary.

## 5. Failures, warnings, and root-cause evidence

**No build failures.** Non-fatal warnings observed (all cosmetic / pre-existing, none blocking):
- `webpack.cache.PackFileCacheStrategy ... No serializer registered for Warning` — Next.js internal cache-serialization notice.
- `Compiled with warnings` (`@scs/admin`) and React `react-hooks/exhaustive-deps` warnings (`@scs/web`) — lint-level, not errors.

**Prior AC-P13-030 root cause (Windows, CONDITIONAL) — now explained and closed:**
- On Windows the identical committed tree failed at `next build` with `MODULE_NOT_FOUND` for `next/dist/compiled/jest-worker/processChild.js` because the content-addressable pnpm virtual-store copy of `next@14.2.35` was trimmed (missing `dist/compiled/*` and `dist/bin`).
- That was classified **CI/environment (host) integrity**, not a source-code or lockfile defect. This Linux run — same commit, same frozen lockfile, clean store — builds web **and** admin successfully, confirming the diagnosis: the code is sound; only the Windows store was corrupt.

## 6. Regression evidence (distinguished from this task)

- The full regression **3098/3098 (0 fail / 0 skip)** and focused P13 **162/162** are **prior-task Windows evidence** at this baseline. They are **not** re-run here and are **not** misrepresented as a Linux CI result.
- This task made **no source or dependency-configuration change** (the build consumed the committed tree via `--frozen-lockfile`). Per §4 of the task rules, the prior regression evidence therefore remains valid, and only the build/typecheck packaging was newly verified on Linux.
- A full Linux suite run was out of scope for this build-verification task and was not performed.

## 7. Changes made and tests rerun

- **No changes to source, lockfile, or build configuration.** No code weakened, no errors suppressed, no manual `node_modules` edits.
- Only isolated CI artifacts created under `C:\TAIF\.m73b6-scratch\` (`Dockerfile.ci`, `p13ci_*.ps1`, logs) and this gitignored report.
- Commands rerun: dependency install (frozen), `pnpm typecheck`, `pnpm build` — all green.

## 8. Authorization boundary confirmation

- **No commit created. No push. No deployment. No production-data change.**
- **No business approval marked as approved.** The six P13 business decisions and the deployment-target decision remain `PENDING` (see `P13-BUSINESS-SIGNOFF-REGISTER.md`).
- A successful Linux build does **not** release or close P13.

## 9. Conditions attached to the verdict

1. **Environment:** verification ran in a faithful Linux reproduction of the `ci.yml` build job (`node:22-slim` + build toolchain, `pnpm 9.15.9`, `--frozen-lockfile`, `pnpm typecheck` + `pnpm build`), not on GitHub's hosted `ubuntu-latest` runner (which cannot be triggered without a push). Commands, Node/pnpm versions, and lockfile policy match the pipeline exactly.
2. **Regression:** the complete test-suite evidence (3098/3098, 162/162) remains prior Windows results at this baseline; no Linux re-run of the full suite was performed in this build-only task.
3. **Docs:** `docs/production` reports are gitignored working artifacts.

---

**Conclusion:** `AC-P13-030` (Linux CI build verification) is **PASS** — the API, web, and admin production builds plus full type-check are green in a clean Linux environment against the exact committed P13 tree with the frozen lockfile. The overall technical verdict for this task is `PASS WITH CONDITIONS` per §9. P13 remains **not released** pending the six business approvals and the deployment-target decision, and an explicit release authorization.
