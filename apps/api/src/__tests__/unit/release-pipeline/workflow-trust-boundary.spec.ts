/**
 * Release Trust Boundary — Executable Tests
 *
 * Verifies, against the REAL workflow files, that a pull request can never reach the
 * staging release path and that staging secrets only resolve for a push to develop on
 * this repository. These assertions read the actual ci.yml / release.yml text and the
 * structural validator's parsed view — they are not re-assertions of local constants.
 *
 * Two enforcement layers are checked:
 *   1. CI caller `if` (primary): push + refs/heads/develop + this repository only.
 *   2. Release `determine_sha` (defense in depth): the automated branch rejects any
 *      non-push event, a non-develop ref, and a foreign repository; the manual branch
 *      requires the SHA to be reachable from develop with a matching successful develop
 *      CI run. Neither branch assumes github.event_name == 'workflow_call'.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// Spec lives at apps/api/src/__tests__/unit/release-pipeline/.
const apiRoot = path.resolve(__dirname, '..', '..', '..', '..'); // → apps/api
const repoRoot = path.resolve(apiRoot, '..', '..'); // → repository root
const ciPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
const relPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');

const ciRaw = fs.readFileSync(ciPath, 'utf8');
const relRaw = fs.readFileSync(relPath, 'utf8');

interface ValidatorResult {
  name: string;
  ok: boolean;
  detail?: string;
}
interface ValidatorPayload {
  ok: boolean;
  results: ValidatorResult[];
}
const payload = JSON.parse(
  execFileSync('node', [path.resolve(apiRoot, 'scripts', 'validate-workflow-structure.mjs'), '--json', repoRoot], {
    encoding: 'utf8',
    cwd: repoRoot,
  }),
) as ValidatorPayload;
const check = (name: string) => payload.results.find((r) => r.name === name);

describe('Release trust boundary (real workflow files)', () => {
  describe('CI caller (primary gate): PRs can never trigger', () => {
    it('restricts the caller to a push event', () => {
      expect(check('caller-if-push')?.ok).toBe(true);
      expect(ciRaw).toMatch(/github\.event_name == 'push'/);
    });

    it('restricts the caller to the develop ref', () => {
      expect(check('caller-if-develop')?.ok).toBe(true);
      expect(ciRaw).toMatch(/refs\/heads\/develop/);
    });

    it('pins the caller to this repository identity', () => {
      expect(check('caller-if-repository')?.ok).toBe(true);
      expect(ciRaw).toMatch(/github\.repository == 'nabeel2323\/scs-platform'/);
    });
  });

  describe('Release event discrimination (defense in depth)', () => {
    it('branches on workflow_dispatch vs the caller event, not a workflow_call event', () => {
      // A called reusable workflow sees the CALLER's event; 'workflow_call' is never the
      // value of github.event_name inside release.yml.
      expect(relRaw).toMatch(/\[ "\$EVENT" = "workflow_dispatch" \]/);
      expect(relRaw).toMatch(/\[ "\$EVENT" != "push" \]/);
      expect(relRaw).not.toMatch(/github\.event_name == ['"]workflow_call['"]/);
      expect(check('release-no-workflow_call-event-assumption')?.ok).toBe(true);
    });

    it('automated path rejects non-develop refs and foreign repositories', () => {
      expect(relRaw).toMatch(/THIS_REF" != "refs\/heads\/develop/);
      expect(relRaw).toMatch(/REPOSITORY" != "nabeel2323\/scs-platform/);
    });

    it('validate job runs for both invocation modes (no invalid job-level event `if`)', () => {
      expect(check('release-validate-no-invalid-job-if')?.ok).toBe(true);
    });
  });

  describe('Manual dispatch path binds SHA to a passing develop CI run', () => {
    it('requires the SHA be reachable from develop', () => {
      expect(relRaw).toMatch(/git merge-base --is-ancestor "\$RELEASE_SHA" origin\/develop/);
      expect(relRaw).toMatch(/git fetch --force --no-tags origin '\+develop:refs\/remotes\/origin\/develop'/);
    });

    it('requires an exact successful develop CI run for the SHA', () => {
      expect(relRaw).toMatch(/--workflow=ci\.yml/);
      expect(relRaw).toMatch(/--branch=develop/);
      expect(relRaw).toMatch(/\.conclusion == "success" and \.headBranch == "develop"/);
    });
  });

  describe('Staging secret exposure boundary', () => {
    it('resolves staging secrets from environment: staging, never a caller secrets schema', () => {
      expect(check('workflow_call-no-secret-schema')?.ok).toBe(true);
      expect(check('caller-secrets-inherit')?.ok).toBe(true);
    });

    it('has no workflow_run trigger that could inherit PR-context secrets', () => {
      expect(check('release-no-workflow_run')?.ok).toBe(true);
      expect(relRaw).not.toMatch(/workflow_run:/);
    });
  });
});
