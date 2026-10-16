# P13 PHASE 4.1.15 - UPDATED CHANGE MANIFEST

Date: 2026-10-16
Phase: 4.1.15 - Container-build workflow repair and hosted-CI re-verification (pre-push preflight)
Baseline: develop @ 13f26340a1ea6ee40a310a239c2cb42d248c258a (origin/develop in sync)

## 1. Composition of the Follow-Up Release Candidate

| Item | Count | Detail |
|---|---|---|
| Modified tracked files | 1 | .github/workflows/ci.yml (+10 / -1, two hunks) |
| Deleted / renamed / added tracked files | 0 | none |
| Staged right now | 0 | index intentionally empty; staging requires separate authorization |

## 2. Complete Diff (verbatim, `git diff -U3 -- .github/workflows/ci.yml`)

```diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index d2a0e59..ca8159a 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -325,6 +325,15 @@ jobs:
     steps:
       - uses: actions/checkout@v4

+      - uses: pnpm/action-setup@v4
+        with:
+          version: ${{ env.PNPM_VERSION }}
+
+      - uses: actions/setup-node@v4
+        with:
+          node-version: ${{ env.NODE_VERSION }}
+          cache: pnpm
+
       - name: Set up Docker Buildx
         uses: docker/setup-buildx-action@v3

@@ -342,7 +351,7 @@ jobs:
       - name: Run deployment invariants spec
         run: |
           pnpm install --frozen-lockfile
-          pnpm --filter @scs/api test -- --run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts
+          pnpm --filter @scs/api run test -- --run src/__tests__/unit/deployment/p41-deployment-invariants.spec.ts

       - name: Start disposable services
         run: |
```

## 3. Pre-Commit Checks Performed (all against the unstaged working-tree diff)

| Check | Command | Result |
|---|---|---|
| Modified-file list | git status --porcelain (non-??) | exactly 1 file, as above |
| Whitespace/conflict check | git diff --check | EXIT 0, no findings (the new lines are whitespace-clean) |
| Secret scan | git diff piped through pattern match (password/secret/token/api_key/PRIVATE KEY/AKIA/ghp_/sk-) | 0 hits |
| Broad-staging guard | process audit | no git add -A / git add . used anywhere in this phase |
| Scratch/probe exclusion | git status filtered | .m73b6-scratch\ and all probes remain untracked and excluded |
| Index state | git diff --cached --name-only | 0 staged |

## 4. Explicitly Excluded From the Candidate

- .m73b6-scratch\ contents: assert-ci.cjs, p4115-smoke.ps1, ci-yaml-parse.json, ci-yaml-parse.err,
  ci-yaml-dlx.err, and all pre-existing scratch files - never staged.
- The 5 probe artifacts and the 3 Phase 4.1.14 reports - preserved untracked, never staged.
- The 5 Phase 4.1.15 reports (including this one) - required to remain uncommitted until separate
  authorization per spec section 7.

## 5. Instructions Prepared for the Next (Authorized) Phase

1. Stage exactly one path: `git add .github/workflows/ci.yml` (no broad adds).
2. Suggested commit message (adjustable at authorization time):
   `fix(ci): install pnpm and Node before container-build invariants step`
   Body: root causes (missing toolchain setup; pnpm arg forwarding without `run`), evidence
   (run #386 job 116911122701 exit 127), local verification (36/36 invariants, build + smoke
   green), and the no-weakening statement.
3. Push `origin develop` (normal push only; stop and report on rejection).
4. Hosted verification gate (all seven required, build alone insufficient):
   (1) API image build, (2) deployment-invariants test, (3) disposable service startup,
   (4) health/readiness checks, (5) P13 configuration echo proving safe defaults,
   (6) non-root execution assertion, (7) cleanup.
5. Even a fully green hosted run does not authorize deployment, production webhook activation,
   worker enablement, pilot activation, or business-policy approval - those remain separate gates.

## 6. Status Summary

| Gate | Status |
|---|---|
| Diff and file scope reconciled | PASS |
| Pre-commit checks clean | PASS |
| Excluded artifacts preserved | PASS |
| Changes left unstaged | PASS (by design) |
