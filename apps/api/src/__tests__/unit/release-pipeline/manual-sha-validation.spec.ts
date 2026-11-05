/**
 * Manual SHA Validation — unit tests for the shipped helper
 *
 * The blocking security requirement behind `workflow_dispatch` manual releases is:
 * never deploy a commit that has not been verified. `apps/api/scripts/validate-release-sha.mjs`
 * implements that guard as an ordered chain — format → exists → reachable from develop
 * → successful CI run for that exact head SHA — and short-circuits on the first failure.
 *
 * These tests call the REAL exported functions (no re-implemented regexes, no literal
 * self-assertions) against a throwaway git repository built in a temp directory, with a
 * file-path remote and a stubbed `gh` on PATH.
 *
 * Why the sandbox matters (CI run #419): this spec used to create a branch and commit a
 * dummy file inside the real working copy. That failed on the runner — a GitHub-hosted
 * runner has no ambient git author identity, so `git commit` aborted the suite — and while
 * it did succeed locally it mutated HEAD and the worktree underneath every other spec
 * running in parallel. A unit test must not depend on the machine's git config and must
 * not touch shared repository state.
 *
 * @see apps/api/scripts/validate-release-sha.mjs
 * @see .github/workflows/release.yml (manual_dispatch validation gate)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// This spec lives at apps/api/src/__tests__/unit/release-pipeline/ — four levels down
// from the package root, where apps/api/scripts/validate-release-sha.mjs lives.
const apiRoot = path.resolve(__dirname, '..', '..', '..', '..');
const scriptPath = path.resolve(apiRoot, 'scripts', 'validate-release-sha.mjs');

const ZERO_SHA = '0000000000000000000000000000000000000000';

// Loaded dynamically: the helper is an ES module and this package compiles to CommonJS.
let validator: any;

let sandbox: string;
let work: string;
let shaOnDevelop: string;
let shaSideBranch: string;

/** Run git inside the sandbox with an explicit repo-local identity. */
function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: work,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function commitFile(file: string, message: string): string {
  fs.writeFileSync(path.join(work, file), `${message}\n`);
  git('add', file);
  // -c only for this invocation: never writes global or even persistent config beyond
  // what beforeAll already set, so the test cannot be broken by a missing identity.
  git('-c', 'user.name=SCS CI Sandbox', '-c', 'user.email=ci-sandbox@example.com', 'commit', '-q', '-m', message);
  return git('rev-parse', 'HEAD');
}

/**
 * Build a sandbox repo that models the real release precondition:
 *   develop (pushed to origin)  → commits the release helper must accept
 *   side branch (local only)    → a commit that exists but was never on develop
 */
function createSandboxRepo(): { shaOnDevelop: string; shaSideBranch: string } {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'scs-release-sha-'));
  work = path.join(sandbox, 'work');
  fs.mkdirSync(work, { recursive: true });

  execFileSync('git', ['init', '-q', '--initial-branch=develop'], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
  git('config', 'user.name', 'SCS CI Sandbox');
  git('config', 'user.email', 'ci-sandbox@example.com');

  const shaDevelop = commitFile('README.md', 'chore: seed develop');

  // Bare remote over the filesystem — no network, and no GitHub to talk to.
  execFileSync('git', ['clone', '-q', '--bare', work, path.join(sandbox, 'remote.git')], {
    cwd: sandbox,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  git('remote', 'add', 'origin', '../remote.git');
  git('push', '-q', 'origin', 'develop');

  const shaTip = commitFile('release-note.md', 'feat: releasable change on develop');
  git('push', '-q', 'origin', 'develop');

  // A commit that exists locally but is not reachable from origin/develop.
  git('checkout', '-q', '-b', 'side/not-releasable', shaDevelop);
  const shaSide = commitFile('draft.txt', 'wip: never landed on develop');

  return { shaOnDevelop: shaTip, shaSideBranch: shaSide };
}

/**
 * Put a `gh` stub first on PATH that answers `gh run list` with the given JSON, so the
 * CI-run step is exercised deterministically without network, auth, or a real run.
 */
async function withGhRuns<T>(runs: unknown[], fn: () => T): Promise<T> {
  const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scs-gh-stub-'));
  const isWin = process.platform === 'win32';
  fs.writeFileSync(path.join(shimDir, 'payload.json'), JSON.stringify(runs));
  fs.writeFileSync(
    path.join(shimDir, isWin ? 'gh.cmd' : 'gh'),
    isWin ? '@echo off\r\ntype "%~dp0payload.json"\r\n' : '#!/bin/sh\ncat "$(dirname "$0")/payload.json"\n',
  );
  if (!isWin) fs.chmodSync(path.join(shimDir, 'gh'), 0o755);

  const previousPath = process.env['PATH'];
  process.env['PATH'] = `${shimDir}${path.delimiter}${previousPath ?? ''}`;
  try {
    return fn();
  } finally {
    process.env['PATH'] = previousPath;
    fs.rmSync(shimDir, { recursive: true, force: true });
  }
}

beforeAll(async () => {
  // Belt-and-braces against an interactive `gh` prompt on a runner where gh is installed
  // but has no GitHub remote for the sandbox repo. The helper must fail closed, not wait.
  process.env['GH_PROMPT_DISABLED'] = '1';
  validator = await import(pathToFileURL(scriptPath).href);
  const sandboxShas = createSandboxRepo();
  shaOnDevelop = sandboxShas.shaOnDevelop;
  shaSideBranch = sandboxShas.shaSideBranch;
}, 120_000);

afterAll(() => {
  if (sandbox) fs.rmSync(sandbox, { recursive: true, force: true });
});

describe('validateSHAFormat', () => {
  it('rejects empty and non-string input', () => {
    expect(validator.validateSHAFormat('')).toEqual({ valid: false, error: 'SHA is empty or not a string' });
    expect(validator.validateSHAFormat(undefined).valid).toBe(false);
    expect(validator.validateSHAFormat(1234).valid).toBe(false);
  });

  it.each([
    ['too short', 'abc123'],
    ['non-hex character', `g${ZERO_SHA.slice(1)}`],
    ['uppercase hex', 'B11638B22150C44E6287B89EF580374F83A8180E'],
    ['embedded whitespace', `${ZERO_SHA.slice(0, 38)}  `],
  ])('rejects %s: %s', (_label, sha) => {
    const result = validator.validateSHAFormat(sha);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid SHA format');
  });

  it('accepts a canonical 40-character lowercase sha', () => {
    expect(validator.validateSHAFormat(shaOnDevelop)).toEqual({ valid: true });
  });
});

describe('validateSHAExists', () => {
  it('accepts any object the repository has, including an unreleased side branch', () => {
    expect(validator.validateSHAExists(shaOnDevelop, work).valid).toBe(true);
    expect(validator.validateSHAExists(shaSideBranch, work).valid).toBe(true);
  });

  it('rejects a well-formed sha the repository does not have', () => {
    const result = validator.validateSHAExists(ZERO_SHA, work);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('SHA does not exist');
  });
});

describe('validateSHAReachable', () => {
  it('accepts a commit reachable from origin/develop', () => {
    expect(validator.validateSHAReachable(shaOnDevelop, work)).toEqual({ valid: true });
  });

  it('rejects a commit that exists but never landed on develop', () => {
    // This is the exact bypass the manual-release gate exists to stop: a valid, existing
    // SHA that no CI pipeline ever validated on develop.
    const result = validator.validateSHAReachable(shaSideBranch, work);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('SHA not reachable from develop');
  });
});

describe('validateCIRunExists', () => {
  it('accepts a successful CI run whose headSha is exactly the requested sha', async () => {
    const result = await withGhRuns(
      [
        { databaseId: 101, headSha: shaSideBranch, headBranch: 'develop', conclusion: 'success' },
        { databaseId: 202, headSha: shaOnDevelop, headBranch: 'develop', conclusion: 'success' },
      ],
      () => validator.validateCIRunExists(shaOnDevelop, work),
    );
    expect(result.valid).toBe(true);
    expect(result.run).toMatchObject({ databaseId: 202, headSha: shaOnDevelop });
  });

  it('rejects when the only run for the sha did not succeed', async () => {
    const result = await withGhRuns(
      [{ databaseId: 303, headSha: shaOnDevelop, headBranch: 'develop', conclusion: 'failure' }],
      () => validator.validateCIRunExists(shaOnDevelop, work),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No successful CI run found');
  });

  it('rejects a run that succeeded on a different commit', async () => {
    const result = await withGhRuns(
      [{ databaseId: 404, headSha: shaSideBranch, headBranch: 'develop', conclusion: 'success' }],
      () => validator.validateCIRunExists(shaOnDevelop, work),
    );
    expect(result.valid).toBe(false);
  });

  it('fails closed rather than throwing when gh cannot answer', () => {
    // repoRoot is a temp dir with no GitHub remote: the query must degrade to invalid,
    // never an uncaught error that leaves the workflow step ambiguous.
    const result = validator.validateCIRunExists(shaOnDevelop, sandbox, 'does-not-exist.yml');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Failed to query CI runs|No successful CI run found/);
  });
});

describe('validateReleaseSHA (ordered gate)', () => {
  it('passes every step for a develop commit with a matching successful CI run', async () => {
    const result = await withGhRuns(
      [{ databaseId: 505, headSha: shaOnDevelop, headBranch: 'develop', conclusion: 'success' }],
      () => validator.validateReleaseSHA(shaOnDevelop, work),
    );
    expect(result.valid).toBe(true);
    expect(result.validations.map((v: { step: string }) => v.step)).toEqual([
      'format',
      'exists',
      'reachable',
      'ci-run',
    ]);
    expect(result.validations.every((v: { valid: boolean }) => v.valid)).toBe(true);
    expect(result.ciRun.databaseId).toBe(505);
  });

  it('short-circuits on a malformed sha without touching the repository', () => {
    const result = validator.validateReleaseSHA('not-a-sha', work);
    expect(result.valid).toBe(false);
    expect(result.validations).toEqual([{ step: 'format', valid: false, error: expect.stringContaining('Invalid SHA format') }]);
  });

  it('stops at exists for a sha the repository does not have', () => {
    const result = validator.validateReleaseSHA(ZERO_SHA, work);
    expect(result.valid).toBe(false);
    expect(result.validations.map((v: { step: string }) => v.step)).toEqual(['format', 'exists']);
  });

  it('stops at reachable for an unreleased side-branch commit', () => {
    const result = validator.validateReleaseSHA(shaSideBranch, work);
    expect(result.valid).toBe(false);
    expect(result.validations.map((v: { step: string }) => v.step)).toEqual(['format', 'exists', 'reachable']);
    expect(result.validations[2]).toMatchObject({ step: 'reachable', valid: false });
  });
});

describe('test isolation', () => {
  it('does not create branches or commits in the real repository', () => {
    // Guards the CI #419 regression: the previous version of this spec committed into
    // the working copy (git checkout -b + git commit), which both failed on the runner
    // and perturbed every other spec reading the worktree concurrently.
    const realRepo = apiRoot;
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: realRepo, encoding: 'utf8' }).trim();
    const porcelain = execFileSync('git', ['status', '--porcelain', '--', 'test-dummy.txt'], {
      cwd: realRepo,
      encoding: 'utf8',
    }).trim();
    const branches = execFileSync('git', ['branch', '--list', 'test/manual-sha-validation-*'], {
      cwd: realRepo,
      encoding: 'utf8',
    }).trim();

    expect(head).toHaveLength(40);
    expect(porcelain).toBe('');
    expect(branches).toBe('');
    expect(fs.existsSync(path.join(realRepo, 'test-dummy.txt'))).toBe(false);
  });
});
