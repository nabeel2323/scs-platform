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
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// Spec lives at apps/api/src/__tests__/unit/release-pipeline/.
const apiRoot = path.resolve(__dirname, '..', '..', '..', '..'); // → apps/api
const repoRoot = path.resolve(apiRoot, '..', '..'); // → repository root
const validator = path.resolve(apiRoot, 'scripts', 'validate-workflow-structure.mjs');

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

function runValidator(): ValidatorPayload {
  // The validator exits 0 when every check passes and prints the payload as JSON.
  const stdout = execFileSync('node', [validator, '--json', repoRoot], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
  return JSON.parse(stdout) as ValidatorPayload;
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
});
