/**
 * Stale Release Detection Helper — Executable Tests
 *
 * Runs the REAL helper (apps/api/scripts/detect-stale-release.mjs) in a child Node
 * process and asserts its behaviour, plus keeps it pinned to the authoritative
 * workflow step it mirrors (release.yml, job: database-release).
 *
 * Invariants covered:
 *   1. The helper inspects the CALLER workflow (ci.yml on develop) — a reusable
 *      workflow produces no standalone release.yml runs.
 *   2. Ordering is strictly by monotonic runNumber, self-run excluded.
 *   3. Policy is allow-complete: a newer queued release never yields an abort.
 *
 * @see .github/workflows/release.yml
 * @see apps/api/scripts/detect-stale-release.mjs
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

// Spec lives at apps/api/src/__tests__/unit/release-pipeline/.
const apiRoot = path.resolve(__dirname, '..', '..', '..', '..'); // → apps/api
const repoRoot = path.resolve(apiRoot, '..', '..'); // → repository root
const helperPath = path.resolve(apiRoot, 'scripts', 'detect-stale-release.mjs');

function toFileUrl(absolute: string): string {
  const posix = absolute.replace(/\\/g, '/');
  return posix.startsWith('/') ? `file://${posix}` : `file:///${posix}`;
}

/** fs APIs accept forward slashes on every platform, including Windows. */
function toFsPath(absolute: string): string {
  return absolute.replace(/\\/g, '/');
}

/** Read a file from a real Node child process (keeps the spec shell-agnostic). */
function readFileInNode(absolute: string): string {
  return execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      `const fs = await import('node:fs');\nprocess.stdout.write(fs.readFileSync(${JSON.stringify(toFsPath(absolute))}, 'utf8'));`,
    ],
    { encoding: 'utf8', cwd: repoRoot },
  );
}

/** Execute the helper's exported functions in a real Node ESM child process. */
function runHelper(expression: string): unknown {
  const code = [
    `const m = await import(${JSON.stringify(toFileUrl(helperPath))});`,
    `const ctx = { helper: m, repoRoot: ${JSON.stringify(repoRoot)} };`,
    `const result = ${expression};`,
    'process.stdout.write(JSON.stringify(result));',
  ].join('\n');
  const stdout = execFileSync('node', ['--input-type=module', '-e', code], {
    encoding: 'utf8',
    cwd: repoRoot,
  });
  return JSON.parse(stdout) as unknown;
}

describe('Stale release detection helper (real script)', () => {
  it('targets the caller workflow (ci.yml on develop), not release.yml', () => {
    const meta = runHelper('({ workflowFile: m.CALLER_WORKFLOW_FILE, branch: m.CALLER_BRANCH })') as {
      workflowFile: string;
      branch: string;
    };
    expect(meta.workflowFile).toBe('ci.yml');
    expect(meta.branch).toBe('develop');

    // The gh query itself must use those values and must not select createdAt.
    const source = readFileInNode(helperPath);
    expect(source).toMatch(/--workflow=\$\{workflowFile\}/);
    expect(source).toMatch(/--branch=\$\{branch\}/);
    expect(source).toMatch(/--status=queued/);
    expect(source).toMatch(/--json databaseId,runNumber/);
    expect(source).not.toMatch(/--json[^\n]*createdAt/);
  });

  it('orders strictly by monotonic runNumber and excludes the current run', () => {
    const out = runHelper(`m.findNewerRuns([
      { databaseId: 101, runNumber: 9 },
      { databaseId: 103, runNumber: 7 },
      { databaseId: 102, runNumber: 5 },
      { databaseId: 104, runNumber: 5 },
    ], 5, 102)`) as Array<{ databaseId: number; runNumber: number }>;

    expect(out.map((r) => r.databaseId)).toEqual([103, 101]);
    expect(out.map((r) => r.runNumber)).toEqual([7, 9]);
    // Equal run numbers are not "newer"; the self run is always excluded.
    expect(out.some((r) => r.runNumber <= 5)).toBe(false);
    expect(out.some((r) => r.databaseId === 102)).toBe(false);
  });

  it('never reports a stale release as an abort (allow-complete policy)', () => {
    const res = runHelper(`m.detectStaleRelease(102, 5, undefined, [
      { databaseId: 103, runNumber: 7 },
    ])`) as { isStale: boolean; policy: string; newerRuns: Array<{ runId: number; runNumber: number }> };

    expect(res.isStale).toBe(false);
    expect(res.policy).toBe('allow-complete');
    expect(res.newerRuns).toEqual([{ runId: 103, runNumber: 7 }]);
  });

  it('stays consistent with the authoritative workflow step', () => {
    const helperMeta = runHelper('({ wf: m.CALLER_WORKFLOW_FILE })') as { wf: string };
    const relRaw = readFileInNode(path.resolve(repoRoot, '.github', 'workflows', 'release.yml'));

    expect(relRaw).toMatch(new RegExp(`--workflow=${helperMeta.wf.replace('.', '\\.')}`));
    expect(relRaw).toMatch(/Allow current migration to complete/);
  });
});
