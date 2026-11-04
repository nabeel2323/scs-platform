#!/usr/bin/env node
/**
 * GitHub Actions Workflow Structure Validator
 *
 * Parses the real CI and Release workflow YAML files with js-yaml and asserts the
 * reusable-workflow wiring is correct. This is an EXECUTABLE check against the actual
 * files — not a re-assertion of hard-coded constants — so it fails if the workflows
 * drift (e.g. a step-level reusable-workflow invocation, a `workflow_call` event-name
 * assumption, a skipped main-only job listed in `needs`, or a missing environment).
 *
 * Usage:  node apps/api/scripts/validate-workflow-structure.mjs [repoRoot]
 *
 * Exit codes: 0 = all checks pass, 1 = one or more checks failed, 2 = loader/config error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** Walk up from a base dir to locate the repository root (has .github/workflows). */
export function findRepoRoot(startDir) {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 10 && dir; i++) {
    if (fs.existsSync(path.join(dir, '.github', 'workflows', 'ci.yml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Locate js-yaml without adding it as a direct dependency (pnpm store or hoisted). */
function loadJsYaml(repoRoot) {
  const require = createRequire(import.meta.url);
  // 1) Direct (hoisted) resolution.
  const candidates = [];
  let dir = repoRoot;
  for (let i = 0; i < 6 && dir; i++) {
    candidates.push(path.join(dir, 'node_modules', 'js-yaml'));
    const pnpmStore = path.join(dir, 'node_modules', '.pnpm');
    if (fs.existsSync(pnpmStore)) {
      for (const entry of fs.readdirSync(pnpmStore)) {
        if (entry.startsWith('js-yaml@')) {
          candidates.push(path.join(pnpmStore, entry, 'node_modules', 'js-yaml'));
        }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return require(c);
    } catch {
      /* keep trying */
    }
  }
  // Last resort: normal require resolution.
  try {
    return require('js-yaml');
  } catch {
    return null;
  }
}

const MANDATORY_DEVELOP_GATES = [
  'lint',
  'test-unit',
  'test-integration',
  'migration-gate',
  'test-contract',
  'build',
  'mobile',
  'container-build',
];

// Jobs that are skipped on develop (guarded by `if: github.ref == 'refs/heads/main'`).
// Listing any of these in the release caller's `needs` would cascade-skip the release.
const DEVELOP_SKIPPED_JOBS = ['k6-smoke'];

/**
 * Run all structural checks. Returns { ok, results: [{ name, ok, detail }] }.
 */
export function validateWorkflowStructure(repoRootIn) {
  const repoRoot = repoRootIn || findRepoRoot(process.cwd()) || findRepoRoot(path.dirname(createRequire(import.meta.url).module?.path || process.cwd()));
  const results = [];
  const push = (name, ok, detail = '') => results.push({ name, ok, detail });

  const yaml = loadJsYaml(repoRoot || process.cwd());
  if (!yaml) {
    return { ok: false, results: [{ name: 'js-yaml-loader', ok: false, detail: 'js-yaml not resolvable' }], repoRoot };
  }

  const ciPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
  const relPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');

  let ci, rel, ciRaw, relRaw;
  try {
    ciRaw = fs.readFileSync(ciPath, 'utf8');
    relRaw = fs.readFileSync(relPath, 'utf8');
    ci = yaml.load(ciRaw);
    rel = yaml.load(relRaw);
    push('yaml-parses', true, 'both workflows parse');
  } catch (e) {
    push('yaml-parses', false, e.message.split('\n')[0]);
    return { ok: false, results, repoRoot };
  }

  // 2) Release declares workflow_call + workflow_dispatch, no workflow_run.
  const onKeys = Object.keys(rel.on || {});
  push('release-has-workflow_call', onKeys.includes('workflow_call'), `on keys: ${onKeys.join(', ')}`);
  push('release-has-workflow_dispatch', onKeys.includes('workflow_dispatch'), '');
  push('release-no-workflow_run', !onKeys.includes('workflow_run'), '');

  // 3) workflow_call requires the three audit inputs.
  const callInputs = rel.on?.workflow_call?.inputs || {};
  for (const inp of ['commit_sha', 'ci_run_id', 'ci_run_url']) {
    push(`workflow_call-input-${inp}`, callInputs[inp]?.required === true, '');
  }

  // 4) workflow_call does NOT declare secrets (staging secrets resolve from environment).
  push(
    'workflow_call-no-secret-schema',
    !('secrets' in (rel.on?.workflow_call || {})),
    'staging secrets must resolve via environment: staging, not caller-passed schema',
  );

  // 5) Forbidden: treating the called workflow's event as the literal 'workflow_call'.
  const forbidden = /github\.event_name\s*==\s*['"]workflow_call['"]/.test(relRaw);
  push('release-no-workflow_call-event-assumption', !forbidden, '');

  // 6) CI caller uses job-level `uses:` pointing at the release workflow.
  const caller = ci.jobs?.['trigger-staging-release'] || {};
  push('caller-job-level-uses', caller.uses === './.github/workflows/release.yml', `uses=${JSON.stringify(caller.uses)}`);

  // 7) Caller has no steps/runs-on/environment (invalid for reusable-workflow callers).
  push('caller-no-steps', !('steps' in caller), '');
  push('caller-no-runs-on', !('runs-on' in caller), '');
  push('caller-no-environment', !('environment' in caller), 'environment belongs to the called workflow');

  // 8) No step-level reusable-workflow invocation anywhere in ci.yml.
  const stepLevel = /^\s*-\s+uses:\s*\.\/\.github\/workflows\//m.test(ciRaw);
  push('no-step-level-reusable-invocation', !stepLevel, '');

  // 9) Caller needs include every mandatory develop gate.
  const needs = Array.isArray(caller.needs) ? caller.needs : [];
  const missing = MANDATORY_DEVELOP_GATES.filter((g) => !needs.includes(g));
  push('caller-needs-all-mandatory-gates', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : '');

  // 10) Caller needs EXCLUDE develop-skipped jobs (k6-smoke would cascade-skip release).
  const badNeeds = DEVELOP_SKIPPED_JOBS.filter((g) => needs.includes(g));
  push('caller-needs-excludes-develop-skipped', badNeeds.length === 0, badNeeds.length ? `bad: ${badNeeds.join(', ')}` : '');

  // 11) All needs reference jobs that actually exist in ci.yml.
  const ciJobs = Object.keys(ci.jobs || {});
  const dangling = needs.filter((n) => !ciJobs.includes(n));
  push('caller-needs-are-real-jobs', dangling.length === 0, dangling.length ? `dangling: ${dangling.join(', ')}` : '');

  // 12) Secrets forwarded with inherit.
  push('caller-secrets-inherit', caller.secrets === 'inherit', `secrets=${JSON.stringify(caller.secrets)}`);

  // 13) Caller guarded to push + develop + this repo.
  const guard = (caller.if || '').replace(/\s+/g, ' ');
  push('caller-if-push', /github\.event_name == 'push'/.test(guard), guard);
  push('caller-if-develop', /refs\/heads\/develop/.test(guard), '');
  push('caller-if-repository', /github\.repository ==/.test(guard), '');

  // 14) Caller passes exact SHA + audit metadata via `with`.
  const withKeys = Object.keys(caller.with || {});
  for (const k of ['commit_sha', 'ci_run_id', 'ci_run_url']) {
    push(`caller-with-${k}`, withKeys.includes(k), '');
  }

  // 15) Release staging jobs that touch secrets declare environment: staging.
  const stagingSecretJobs = ['validate', 'database-release', 'deploy', 'health-check'];
  for (const j of stagingSecretJobs) {
    push(`release-job-env-${j}`, rel.jobs?.[j]?.environment === 'staging', `environment=${JSON.stringify(rel.jobs?.[j]?.environment)}`);
  }

  // 16) Release validate job does not test for the non-existent 'workflow_call' event in an if.
  push('release-validate-no-invalid-job-if', !('if' in (rel.jobs?.validate || {})), 'validate should run for both invocation modes');

  const ok = results.every((r) => r.ok);
  return { ok, results, repoRoot };
}

// CLI entry
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && (invokedPath.endsWith('validate-workflow-structure.mjs'))) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const repoRootArg = args.find((a) => !a.startsWith('--'));
  try {
    const payload = validateWorkflowStructure(repoRootArg);
    if (asJson) {
      // Machine-readable for the vitest structural spec.
      console.log(JSON.stringify(payload));
      process.exit(payload.ok ? 0 : 1);
    }
    const { ok, results, repoRoot } = payload;
    console.log(`Workflow structure validation (${repoRoot}):`);
    let pass = 0;
    for (const r of results) {
      console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
      if (r.ok) pass++;
    }
    console.log(`\n${pass}/${results.length} checks passed`);
    process.exit(ok ? 0 : 1);
  } catch (e) {
    console.error('Validator error:', e.message);
    process.exit(2);
  }
}
