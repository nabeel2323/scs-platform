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
      // require() treats a bare relative path as a module name, so resolve first.
      if (fs.existsSync(c)) return require(path.resolve(c));
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
  const resolvedRoot =
    repoRootIn ||
    findRepoRoot(process.cwd()) ||
    findRepoRoot(path.dirname(createRequire(import.meta.url).module?.path || process.cwd()));
  const repoRoot = resolvedRoot ? path.resolve(resolvedRoot) : resolvedRoot;
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

  // 14b) GITHUB_TOKEN permission intersection. GitHub grants a CALLED reusable
  // workflow only the scopes that BOTH its own workflow-level `permissions:` and
  // the CALLER's workflow-level `permissions:` allow; job-level permissions never
  // propagate into the callee. CI run #418 died at start-up (zero jobs) because
  // release.yml asked for `actions: read` and ci.yml declared no permissions block:
  // "requesting 'actions: read, deployments: write', but is only allowed
  // 'actions: none, deployments: none'".
  const PERM_RANK = { none: 0, read: 1, write: 2 };
  const rankOf = (v) => (v === undefined ? -1 : PERM_RANK[String(v).toLowerCase()] ?? -1);
  const callerPermBlock = ci.permissions;
  const grantOf = (scope) => {
    // Absent block => repository default, which is not provable from the file and
    // has already been shown to exclude `actions: read`.
    if (callerPermBlock === undefined || callerPermBlock === null) return undefined;
    if (typeof callerPermBlock === 'string') return callerPermBlock;
    return scope in callerPermBlock ? callerPermBlock[scope] : 'none';
  };
  const calledPermBlock = rel.permissions && typeof rel.permissions === 'object' ? rel.permissions : {};
  const calledScopes = Object.entries(calledPermBlock).filter(([, want]) => String(want).toLowerCase() !== 'none');
  const permGaps = calledScopes
    .map(([scope, want]) => ({ scope, want, have: grantOf(scope) }))
    .filter(({ want, have }) => have === undefined || rankOf(have) < rankOf(want))
    .map(({ scope, want, have }) => `${scope}: release.yml needs ${want}, ci.yml grants ${have === undefined ? 'repo default (unprovable)' : have}`);
  push('caller-workflow-permissions-declared', callerPermBlock !== undefined && callerPermBlock !== null, 'ci.yml must declare workflow-level permissions for the reusable call');
  push('caller-permissions-cover-called-workflow', permGaps.length === 0, permGaps.join('; '));
  const callerWriteScopes =
    typeof callerPermBlock === 'object' && callerPermBlock !== null
      ? Object.entries(callerPermBlock).filter(([, lvl]) => String(lvl).toLowerCase() === 'write').map(([s]) => s)
      : typeof callerPermBlock === 'string'
        ? ['* (workflow-level write shorthand)']
        : [];
  push('caller-permissions-read-only', callerWriteScopes.length === 0, callerWriteScopes.join(', '));
  const calledWriteScopes = Object.entries(calledPermBlock)
    .filter(([, lvl]) => String(lvl).toLowerCase() === 'write')
    .map(([s]) => s);
  push('called-workflow-no-unneeded-write-scope', calledWriteScopes.length === 0, `${calledWriteScopes.join(', ')} would have to be granted to every CI job`);

  // 15) Release staging jobs that touch secrets declare environment: staging.
  const stagingSecretJobs = ['validate', 'database-release', 'deploy', 'health-check'];
  for (const j of stagingSecretJobs) {
    push(`release-job-env-${j}`, rel.jobs?.[j]?.environment === 'staging', `environment=${JSON.stringify(rel.jobs?.[j]?.environment)}`);
  }

  // 16) Release validate job does not test for the non-existent 'workflow_call' event in an if.
  push('release-validate-no-invalid-job-if', !('if' in (rel.jobs?.validate || {})), 'validate should run for both invocation modes');

  // 17) Environment-scoped `${{ vars.* }}` must be bound at JOB scope, never workflow scope.
  // GitHub only reliably resolves environment-scoped variables for a job that declares
  // that environment; a workflow-level `vars.*` can silently evaluate to an empty string.
  const varRefs = [];
  collectVarRefs(rel, [], varRefs);
  push(
    'no-workflow-scope-vars',
    !varRefs.some((r) => r.scope === 'workflow'),
    varRefs.map((r) => `${r.scope}:${r.name}@${r.job ?? '-'}`).join(', ') || 'no vars references found',
  );
  push(
    'has-job-scoped-vars-binding',
    varRefs.some((r) => r.scope === 'job'),
    'at least one ${{ vars.* }} must be bound at job scope',
  );
  for (const ref of varRefs.filter((r) => r.scope === 'job')) {
    const job = rel.jobs?.[ref.job] || {};
    push(
      `var-${ref.name}-job-scope-${ref.job}`,
      typeof job.env?.[ref.name] === 'string' && job.env[ref.name].includes(`vars.${ref.name}`),
      `job env=${JSON.stringify(job.env?.[ref.name])}`,
    );
    push(`var-${ref.name}-environment-${ref.job}`, job.environment === 'staging', `environment=${JSON.stringify(job.environment)}`);
  }

  // 18) Any job that consumes an environment variable name must receive it from job env.
  // Usage = shell reference ($NAME / ${NAME}) or `${{ env.NAME }}` interpolation.
  const consumed = collectEnvVarUsage(rel.jobs, [...new Set(varRefs.map((r) => r.name))]);
  for (const { job: jobName, name } of consumed) {
    const job = rel.jobs?.[jobName] || {};
    push(
      `var-${name}-bound-in-${jobName}`,
      job.env != null && name in job.env,
      `job declares env keys: ${Object.keys(job.env || {}).join(', ') || '(none)'}`,
    );
  }

  // 18b) No interpolation may resolve to an empty string because the name is out of scope.
  const unresolvedEnvRefs = collectUnresolvedEnvRefs(rel);
  push('all-env-interpolations-resolvable', unresolvedEnvRefs.length === 0, unresolvedEnvRefs.join('; '));

  // 19) A missing RENDER_SERVICE_ID must fail in the read-only validate job, before mutation.
  const cfgStep = (rel.jobs?.validate?.steps || []).find((s) => /Validate configuration and secrets/.test(s?.name || ''));
  const cfgBody = cfgStep?.run || '';
  push('validate-guards-render-service-id', /-z "\$\{RENDER_SERVICE_ID:-\}"/.test(cfgBody) && /exit 1/.test(cfgBody), '');
  push(
    'validate-guard-precedes-database-release',
    'needs' in (rel.jobs?.['database-release'] || {}) &&
      (Array.isArray(rel.jobs['database-release'].needs)
        ? rel.jobs['database-release'].needs
        : [rel.jobs['database-release'].needs]
      ).includes('validate'),
    'database-release must depend on validate',
  );

  // 20) Stale-release detection inspects the CALLER workflow (reusable calls have no own runs).
  const staleStep = (rel.jobs?.['database-release']?.steps || []).find((s) =>
    /Check for stale release/.test(s?.name || ''),
  );
  const staleBody = staleStep?.run || '';
  push('stale-detection-targets-caller', /--workflow=ci\.yml/.test(staleBody), '');
  push('stale-detection-excludes-release-target', !/--workflow=release\.yml/.test(staleBody), 'release.yml has no standalone runs when reusable');
  push('stale-detection-uses-run-number', /select\(\.runNumber > \$current\)/.test(staleBody), '');
  push('stale-detection-allows-complete', !/exit 1/.test(staleBody) && /Allow current migration to complete/.test(staleBody), '');

  // 21) Database-operation step must bind DATABASE_URL to secrets.STAGING_DATABASE_URL.
  const dbStep = (rel.jobs?.['database-release']?.steps || []).find((s) =>
    /Execute database operations/.test(s?.name || ''),
  );
  const dbEnv = dbStep?.env || {};
  push('db-step-has-database-url', 'DATABASE_URL' in dbEnv, 'database-operation step must export DATABASE_URL');
  push(
    'db-step-database-url-maps-staging-secret',
    dbEnv.DATABASE_URL === '${{ secrets.STAGING_DATABASE_URL }}',
    `DATABASE_URL=${JSON.stringify(dbEnv.DATABASE_URL)} (expected \${{ secrets.STAGING_DATABASE_URL }})`,
  );
  push('db-step-has-node-env-staging', dbEnv.NODE_ENV === 'staging', `NODE_ENV=${JSON.stringify(dbEnv.NODE_ENV)}`);
  push(
    'db-step-has-ssl-cert-env',
    'STAGING_PGSSLROOTCERT_PEM' in dbEnv && dbEnv.STAGING_PGSSLROOTCERT_PEM.includes('secrets.STAGING_PGSSLROOTCERT_PEM'),
    'SSL certificate must be bound from staging secret',
  );

  // 22) Database-operation step must run migrate, seed, ledger verification in order.
  const dbBody = dbStep?.run || '';
  const migrateIdx = dbBody.indexOf('db:migrate');
  const seedIdx = dbBody.indexOf('db:seed');
  const ledgerIdx = dbBody.indexOf('verify-migration-ledger');
  push('db-step-runs-migrate', migrateIdx !== -1, 'database-operation step must invoke db:migrate');
  push('db-step-runs-seed', seedIdx !== -1, 'database-operation step must invoke db:seed');
  push('db-step-runs-ledger', ledgerIdx !== -1, 'database-operation step must invoke verify-migration-ledger.mjs');
  push(
    'db-step-order-migrate-seed-ledger',
    migrateIdx !== -1 && seedIdx !== -1 && ledgerIdx !== -1 && migrateIdx < seedIdx && seedIdx < ledgerIdx,
    'migrate must precede seed, seed must precede ledger verification',
  );

  const ok = results.every((r) => r.ok);
  return { ok, results, repoRoot };
}

/** Collect `${{ vars.NAME }}` references with the scope they appear in. */
function collectVarRefs(node, trail, out) {
  if (typeof node === 'string') {
    for (const m of node.matchAll(/\$\{\{\s*vars\.([A-Za-z0-9_]+)\s*\}\}/g)) {
      const isJobEnv = trail[0] === 'jobs' && trail[2] === 'env';
      const isWorkflowEnv = trail[0] === 'env';
      out.push({ name: m[1], scope: isJobEnv ? 'job' : isWorkflowEnv ? 'workflow' : 'other', job: trail[0] === 'jobs' ? trail[1] : null });
    }
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectVarRefs(item, trail, out);
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) collectVarRefs(value, [...trail, key], out);
  }
}

/**
 * Find jobs that consume one of `names` (via `${{ env.NAME }}`, `$NAME` or `${NAME`),
 * so each consumption can be checked against a job-level binding.
 */
function collectEnvVarUsage(jobs, names) {
  const found = [];
  for (const [jobName, job] of Object.entries(jobs || {})) {
    const body = JSON.stringify(job ?? {});
    for (const name of names) {
      const used =
        new RegExp(`\\$\\{\\{\\s*env\\.${name}\\s*\\}\\}`).test(body) ||
        new RegExp(`\\$\\{${name}[:}]`).test(body) ||
        new RegExp(`\\$${name}\\b`).test(body);
      if (used) found.push({ job: jobName, name });
    }
  }
  return found;
}

/**
 * Every `${{ env.NAME }}` interpolation must resolve from workflow env, job env or
 * the enclosing step env — otherwise GitHub substitutes an empty string.
 */
function collectUnresolvedEnvRefs(doc) {
  const workflowEnv = Object.keys(doc.env || {});
  const unresolved = [];
  for (const [jobName, job] of Object.entries(doc.jobs || {})) {
    const jobEnv = Object.keys(job?.env || {});
    for (const step of job?.steps || []) {
      const stepEnv = Object.keys(step?.env || {});
      const haystack = [step?.name, step?.run, JSON.stringify(step?.with || {}), JSON.stringify(step?.env || {})]
        .filter(Boolean)
        .join('\n');
      for (const m of haystack.matchAll(/\$\{\{\s*env\.([A-Za-z0-9_]+)\s*\}\}/g)) {
        const name = m[1];
        if (!workflowEnv.includes(name) && !jobEnv.includes(name) && !stepEnv.includes(name)) {
          unresolved.push(`${jobName}/${step?.name || '?'} -> env.${name}`);
        }
      }
    }
  }
  return unresolved;
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
