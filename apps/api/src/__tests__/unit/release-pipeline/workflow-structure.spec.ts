/**
 * Workflow Structure — Executable Structural Tests
 *
 * These tests run the repository's own workflow validator (apps/api/scripts/
 * validate-workflow-structure.mjs) against the REAL ci.yml and release.yml on disk and
 * assert every structural invariant holds. They are deliberately NOT hard-coded
 * re-assertions of expected constants: if a workflow file drifts — a step-level reusable
 * invocation, an event_name == 'workflow_call' assumption, a caller-passed secrets
 * schema, a main-only job listed in `needs`, or a missing staging environment — the
 * validator fails and this test fails.
 *
 * @see apps/api/scripts/validate-workflow-structure.mjs
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// Spec lives at apps/api/src/__tests__/unit/release-pipeline/.
const apiRoot = path.resolve(__dirname, '..', '..', '..', '..'); // → apps/api
const repoRoot = path.resolve(apiRoot, '..', '..'); // → repository root
const validator = path.resolve(apiRoot, 'scripts', 'validate-workflow-structure.mjs');
const ciPath = path.resolve(repoRoot, '.github', 'workflows', 'ci.yml');
const relPath = path.resolve(repoRoot, '.github', 'workflows', 'release.yml');

interface ValidatorResult {
  name: string;
  ok: boolean;
  detail?: string;
}
interface ValidatorPayload {
  ok: boolean;
  results: ValidatorResult[];
  repoRoot?: string;
}

function runValidatorAt(root: string): ValidatorPayload {
  // The validator exits 1 (not throws) when a check fails, so read stdout either way.
  let stdout = '';
  try {
    stdout = execFileSync('node', [validator, '--json', root], { encoding: 'utf8', cwd: root });
  } catch (err) {
    stdout = (err as { stdout?: string }).stdout ?? '';
  }
  return JSON.parse(stdout) as ValidatorPayload;
}

function runValidator(): ValidatorPayload {
  return runValidatorAt(repoRoot);
}

const eolOf = (text: string): string => (text.includes('\r\n') ? '\r\n' : '\n');

interface WorkflowFiles {
  ci: string;
  release: string;
}

/**
 * Copies both workflows into a throwaway tree, lets the caller rewrite them, and
 * runs the REAL validator against that tree. Used for negative controls: a check
 * that can never fail proves nothing.
 */
function inSandbox(mutate: (original: WorkflowFiles) => WorkflowFiles): ValidatorPayload {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'scs-wf-sandbox-'));
  try {
    const wfDir = path.join(sandbox, '.github', 'workflows');
    fs.mkdirSync(wfDir, { recursive: true });
    const mutated = mutate({
      ci: fs.readFileSync(ciPath, 'utf8'),
      release: fs.readFileSync(relPath, 'utf8'),
    });
    fs.writeFileSync(path.join(wfDir, 'ci.yml'), mutated.ci, 'utf8');
    fs.writeFileSync(path.join(wfDir, 'release.yml'), mutated.release, 'utf8');
    return runValidatorAt(sandbox);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

const check = (payload: ValidatorPayload, name: string): ValidatorResult | undefined =>
  payload.results.find((r) => r.name === name);

const payload = runValidator();
const byName = new Map(payload.results.map((r) => [r.name, r]));

describe('Workflow structure (real ci.yml + release.yml)', () => {
  it('every structural check passes', () => {
    const failed = payload.results.filter((r) => !r.ok);
    expect(failed.map((f) => `${f.name}: ${f.detail ?? ''}`)).toEqual([]);
    expect(payload.ok).toBe(true);
  });

  it('invokes release.yml as a JOB-level reusable workflow (no step-level uses)', () => {
    expect(byName.get('caller-job-level-uses')?.ok).toBe(true);
    expect(byName.get('no-step-level-reusable-invocation')?.ok).toBe(true);
    // A reusable-workflow caller may not declare steps / runs-on / environment.
    expect(byName.get('caller-no-steps')?.ok).toBe(true);
    expect(byName.get('caller-no-runs-on')?.ok).toBe(true);
    expect(byName.get('caller-no-environment')?.ok).toBe(true);
  });

  it('requires all mandatory develop CI gates and excludes develop-skipped jobs', () => {
    expect(byName.get('caller-needs-all-mandatory-gates')?.ok).toBe(true);
    expect(byName.get('caller-needs-excludes-develop-skipped')?.ok).toBe(true);
    expect(byName.get('caller-needs-are-real-jobs')?.ok).toBe(true);
  });

  it('forwards secrets with `inherit` and declares no caller secrets schema', () => {
    expect(byName.get('caller-secrets-inherit')?.ok).toBe(true);
    expect(byName.get('workflow_call-no-secret-schema')?.ok).toBe(true);
  });

  it('staging secret jobs resolve them via environment: staging', () => {
    for (const job of ['validate', 'database-release', 'deploy', 'health-check']) {
      expect(byName.get(`release-job-env-${job}`)?.ok, `job ${job} must declare environment: staging`).toBe(true);
    }
  });

  it('binds environment-scoped vars at job level and resolves every env interpolation', () => {
    // `${{ vars.* }}` must never be read at workflow scope, and every job that
    // consumes such a variable must bind it in its own `env:` block.
    expect(byName.get('no-workflow-scope-vars')?.ok).toBe(true);
    expect(byName.get('has-job-scoped-vars-binding')?.ok).toBe(true);
    for (const job of ['validate', 'deploy']) {
      expect(byName.get(`var-RENDER_SERVICE_ID-job-scope-${job}`)?.ok, `${job} must bind vars`).toBe(true);
      expect(byName.get(`var-RENDER_SERVICE_ID-bound-in-${job}`)?.ok, `${job} must declare RENDER_SERVICE_ID`).toBe(true);
    }
    // Guards against `${{ env.X }}` silently evaluating to an empty string.
    expect(byName.get('all-env-interpolations-resolvable')?.ok).toBe(true);
    // A missing variable must fail before any database mutation.
    expect(byName.get('validate-guards-render-service-id')?.ok).toBe(true);
    expect(byName.get('validate-guard-precedes-database-release')?.ok).toBe(true);
  });

  it('detects stale releases against the caller workflow and keeps allow-complete', () => {
    expect(byName.get('stale-detection-targets-caller')?.ok).toBe(true);
    expect(byName.get('stale-detection-excludes-release-target')?.ok).toBe(true);
    expect(byName.get('stale-detection-uses-run-number')?.ok).toBe(true);
    expect(byName.get('stale-detection-allows-complete')?.ok).toBe(true);
  });

  it('database-operation step binds DATABASE_URL to the staging secret and sets NODE_ENV=staging', () => {
    expect(byName.get('db-step-has-database-url')?.ok).toBe(true);
    expect(byName.get('db-step-database-url-maps-staging-secret')?.ok).toBe(true);
    expect(byName.get('db-step-has-node-env-staging')?.ok).toBe(true);
    expect(byName.get('db-step-has-ssl-cert-env')?.ok).toBe(true);
  });

  it('database-operation step runs migrate, seed, and ledger verification in order', () => {
    expect(byName.get('db-step-runs-migrate')?.ok).toBe(true);
    expect(byName.get('db-step-runs-seed')?.ok).toBe(true);
    expect(byName.get('db-step-runs-ledger')?.ok).toBe(true);
    expect(byName.get('db-step-order-migrate-seed-ledger')?.ok).toBe(true);
  });

  // Negative control for B-1 (activation blocker from PR #106 final review):
  // The database-operation step must export DATABASE_URL mapped to secrets.STAGING_DATABASE_URL.
  // If this mapping is missing, migrate-pg.ts, seed-pg.ts, and verify-migration-ledger.mjs
  // all fail with "DATABASE_URL must be set" before any database mutation.
  it('negative control: removing DATABASE_URL from the database step makes the validator fail', () => {
    const bad = inSandbox(({ ci, release }) => {
      const e = eolOf(release);
      // Remove the DATABASE_URL line from the database-operation step env.
      const lines = release.split(e);
      const filtered = lines.filter((l) => !l.trim().startsWith('DATABASE_URL:'));
      return { ci, release: filtered.join(e) };
    });
    expect(bad.ok).toBe(false);
    expect(check(bad, 'db-step-has-database-url')?.ok).toBe(false);
    expect(check(bad, 'db-step-database-url-maps-staging-secret')?.ok).toBe(false);
  });

  it('negative control: mapping DATABASE_URL to the wrong secret makes the validator fail', () => {
    const bad = inSandbox(({ ci, release }) => {
      // Replace only the DATABASE_URL line (not STAGING_DATABASE_URL) in the database-operation step.
      const lines = release.split('\n');
      const modified = lines.map((line) => {
        if (line.trim() === 'DATABASE_URL: ${{ secrets.STAGING_DATABASE_URL }}') {
          return line.replace('secrets.STAGING_DATABASE_URL', 'secrets.WRONG_SECRET');
        }
        return line;
      });
      return { ci, release: modified.join('\n') };
    });
    expect(bad.ok).toBe(false);
    expect(check(bad, 'db-step-database-url-maps-staging-secret')?.ok).toBe(false);
  });

  it('grants the called workflow only scopes the caller also allows', () => {
    for (const name of [
      'caller-workflow-permissions-declared',
      'caller-permissions-cover-called-workflow',
      'caller-permissions-read-only',
      'called-workflow-no-unneeded-write-scope',
    ]) {
      expect(check(payload, name)?.ok, `${name} must pass`).toBe(true);
    }
  });

  // Negative control: the checks above must be capable of failing. GitHub Actions
  // rejected the caller definition in CI run #417 (commit 44aa9a0) with
  // `Invalid workflow file: ci.yml — Unexpected value 'secrets'`, which was a job that
  // mixed `runs-on` + `steps` + `secrets` with a step-level reusable-workflow `uses:`.
  // Re-introducing that shape in a throwaway copy must light the guards up.
  it('negative control: the CI #417 caller defect makes the validator fail', () => {
    const callerUsesLine = '    uses: ./.github/workflows/release.yml';
    expect(fs.readFileSync(ciPath, 'utf8').split(eolOf(fs.readFileSync(ciPath, 'utf8')))).toContain(callerUsesLine);

    const bad = inSandbox(({ ci, release }) => {
      const e = eolOf(ci);
      const invalidCaller = [
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: ./.github/workflows/release.yml',
        '        with:',
        '          commit_sha: ${{ github.sha }}',
      ].join(e);
      return { ci: ci.replace(callerUsesLine, invalidCaller), release };
    });

    expect(bad.ok).toBe(false);
    for (const name of [
      'caller-job-level-uses',
      'caller-no-steps',
      'caller-no-runs-on',
      'no-step-level-reusable-invocation',
    ]) {
      expect(check(bad, name)?.ok, `${name} must fail for the #417 shape`).toBe(false);
    }
  });

  // Negative control for CI run #418 (PR event, zero jobs):
  //   Error calling workflow '…/release.yml'. The workflow is requesting
  //   'actions: read, deployments: write', but is only allowed
  //   'actions: none, deployments: none'.
  // A called reusable workflow only ever gets the intersection of its own and the
  // caller's WORKFLOW-level permissions, so each of these regressions must fail.
  it('negative control: the CI #418 permission-intersection defect makes the validator fail', () => {
    const ciRaw = fs.readFileSync(ciPath, 'utf8');
    const e = eolOf(ciRaw);
    expect(ciRaw.split(e)).toContain('  actions: read');

    // (a) the caller stops granting a scope the callee needs.
    const narrowed = inSandbox(({ ci, release }) => ({ ci: ci.replace('  actions: read', '  actions: none'), release }));
    expect(narrowed.ok).toBe(false);
    expect(check(narrowed, 'caller-permissions-cover-called-workflow')?.ok).toBe(false);
    expect(check(narrowed, 'caller-permissions-cover-called-workflow')?.detail).toMatch(
      /actions: release\.yml needs read, ci\.yml grants none/,
    );

    // (b) the caller drops its permissions block entirely — the exact #418 shape.
    const ungranted = inSandbox(({ ci, release }) => {
      const lines = ci.split(e);
      const start = lines.findIndex((l) => l === 'permissions:');
      expect(start).toBeGreaterThan(-1);
      const end = lines.findIndex((l, i) => i > start && l.trim() !== '' && !l.startsWith(' ') && !l.startsWith('#'));
      expect(end).toBeGreaterThan(start);
      return { ci: [...lines.slice(0, start), ...lines.slice(end)].join(e), release };
    });
    expect(ungranted.ok).toBe(false);
    expect(check(ungranted, 'caller-workflow-permissions-declared')?.ok).toBe(false);
    expect(check(ungranted, 'caller-permissions-cover-called-workflow')?.ok).toBe(false);

    // (c) the callee asks for a write scope (deployments: write, the other half of #418).
    const wantsWrite = inSandbox(({ ci, release }) => ({
      ci,
      release: release.replace('  actions: read', ['  actions: read', '  deployments: write'].join(eolOf(release))),
    }));
    expect(wantsWrite.ok).toBe(false);
    expect(check(wantsWrite, 'called-workflow-no-unneeded-write-scope')?.ok).toBe(false);
    expect(check(wantsWrite, 'caller-permissions-cover-called-workflow')?.ok).toBe(false);
  });
});
