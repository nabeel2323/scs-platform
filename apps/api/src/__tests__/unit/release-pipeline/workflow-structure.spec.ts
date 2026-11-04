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

  // Negative control: the checks above must be capable of failing. GitHub Actions
  // rejected the caller definition in CI run #417 (commit 44aa9a0) with
  // `Invalid workflow file: ci.yml — Unexpected value 'secrets'`, which was a job that
  // mixed `runs-on` + `steps` + `secrets` with a step-level reusable-workflow `uses:`.
  // Re-introducing that shape in a throwaway copy must light the guards up.
  it('negative control: the CI #417 caller defect makes the validator fail', () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'scs-wf-guard-'));
    try {
      const wfDir = path.join(sandbox, '.github', 'workflows');
      fs.mkdirSync(wfDir, { recursive: true });
      fs.copyFileSync(relPath, path.join(wfDir, 'release.yml'));

      const ciRaw = fs.readFileSync(ciPath, 'utf8');
      const eol = ciRaw.includes('\r\n') ? '\r\n' : '\n';
      const invalidCaller = [
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: ./.github/workflows/release.yml',
        '        with:',
        '          commit_sha: ${{ github.sha }}',
      ].join(eol);
      const callerUsesLine = '    uses: ./.github/workflows/release.yml';
      expect(ciRaw.split(eol)).toContain(callerUsesLine);
      const mutated = ciRaw.replace(callerUsesLine, invalidCaller);
      expect(mutated).not.toBe(ciRaw);
      fs.writeFileSync(path.join(wfDir, 'ci.yml'), mutated, 'utf8');

      const bad = runValidatorAt(sandbox);
      const failed = new Set(bad.results.filter((r) => !r.ok).map((r) => r.name));
      expect(bad.ok).toBe(false);
      for (const check of [
        'caller-job-level-uses',
        'caller-no-steps',
        'caller-no-runs-on',
        'no-step-level-reusable-invocation',
      ]) {
        expect(failed.has(check), `${check} must fail for the #417 shape`).toBe(true);
      }
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
