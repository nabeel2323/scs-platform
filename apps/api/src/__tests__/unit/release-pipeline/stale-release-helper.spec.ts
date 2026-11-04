/**
 * Stale Release Detection Helper — Executable Tests
 *
 * Runs the REAL helper (apps/api/scripts/detect-stale-release.mjs) in a child Node
 * process and asserts its behaviour, plus keeps it pinned to the authoritative
 * workflow step it mirrors (release.yml, job: database-release).
 *
 * Invariants covered:
 *   1. The automated path (workflow_call from ci.yml) inspects the CALLER workflow on
 *      develop and orders by the per-workflow `runNumber`; a reusable workflow
 *      produces no standalone release.yml runs on that path.
 *   2. The dispatch path (workflow_dispatch of release.yml) orders by the
 *      repository-global `databaseId` and scans both release.yml and ci.yml develop
 *      runs — the F-4 defect was comparing release.yml's small run_number against
 *      ci.yml's large one, which flagged every valid manual dispatch as stale.
 *   3. Ordering is strictly greater-than on the selected field, self-run excluded,
 *      duplicates merged.
 *   4. Policy is allow-complete: a newer queued release never yields an abort, and a
 *      failed query degrades to partial detection rather than failure.
 *   5. The helper and the workflow step agree on which field each path uses.
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

interface DetectResult {
  isStale: boolean;
  policy: string;
  orderField: string;
  comparisonBasis: number;
  sourcesRead: number;
  sourcesFailed: number;
  message: string;
  newerRuns: Array<{ runId: number; runNumber: number }>;
}

/**
 * ci.yml-like runs with LARGE run numbers and LARGE ids, plus release.yml-like runs
 * with a SMALL run_number but a similarly large id — the population that made the
 * pre-fix comparison nonsensical on the dispatch path.
 */
const MIXED_POPULATION = [
  { databaseId: 500, runNumber: 430 },
  { databaseId: 510, runNumber: 431 },
  { databaseId: 490, runNumber: 3 },
];

describe('Stale release detection helper (real script)', () => {
  it('exposes the per-path ordering fields and sources', () => {
    interface Meta {
      caller: string;
      branch: string;
      self: string;
      automatedField: string;
      dispatchField: string;
      pushSources: Array<{ workflowFile: string; branch: string | null }>;
      dispatchSources: Array<{ workflowFile: string; branch: string | null }>;
    }
    const meta = runHelper(
      `({
        caller: m.CALLER_WORKFLOW_FILE,
        branch: m.CALLER_BRANCH,
        self: m.SELF_WORKFLOW_FILE,
        automatedField: m.ORDER_FIELD_AUTOMATED,
        dispatchField: m.ORDER_FIELD_DISPATCH,
        pushSources: m.queuedRunSources('push'),
        dispatchSources: m.queuedRunSources('workflow_dispatch'),
      })`,
    ) as Meta;

    expect(meta.caller).toBe('ci.yml');
    expect(meta.branch).toBe('develop');
    expect(meta.self).toBe('release.yml');
    expect(meta.automatedField).toBe('runNumber');
    expect(meta.dispatchField).toBe('databaseId');

    // Path A: caller only. Path B: own dispatch runs (unfiltered by branch) + caller.
    expect(meta.pushSources).toEqual([{ workflowFile: 'ci.yml', branch: 'develop' }]);
    expect(meta.dispatchSources).toEqual([
      { workflowFile: 'release.yml', branch: null },
      { workflowFile: 'ci.yml', branch: 'develop' },
    ]);
  });

  it('automated path orders by monotonic runNumber and excludes the current run', () => {
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
    expect(out.some((r) => r.databaseId === 102))
      .toBe(false);
  });

  it('dispatch path orders by databaseId, so a small release.yml run_number is irrelevant', () => {
    // Simulated manual dispatch: this run is release.yml #4 (databaseId 480).
    const out = runHelper(`m.findNewerRuns(${JSON.stringify(MIXED_POPULATION)}, 480, 480, 'databaseId')`) as Array<{
      databaseId: number;
    }>;
    expect(out.map((r) => r.databaseId)).toEqual([490, 500, 510]);

    // And the same population must NOT be flagged against a pre-fix run_number basis.
    const viaHelper = runHelper(`m.detectStaleRelease(480, 4, undefined, ${JSON.stringify(MIXED_POPULATION)}, 'workflow_dispatch')`) as DetectResult;
    expect(viaHelper.orderField).toBe('databaseId');
    expect(viaHelper.comparisonBasis).toBe(480);
    // 490/500/510 really are queued runs newer than this dispatch — reported, but never as an abort.
    expect(viaHelper.newerRuns.map((r) => r.runId)).toEqual([490, 500, 510]);
    expect(viaHelper.isStale).toBe(false);
    expect(viaHelper.policy).toBe('allow-complete');

    // The pre-fix behaviour being removed: with runNumber ordering and a basis of 4,
    // the ci.yml runs (430/431) are flagged as "newer" purely because that workflow
    // file's counter is higher, while release.yml's own queued run 490 (runNumber 3)
    // is invisible. The two fields genuinely disagree on this population.
    const asAutomated = runHelper(`m.findNewerRuns(${JSON.stringify(MIXED_POPULATION)}, 4, 480, 'runNumber')`) as Array<{
      databaseId: number;
      runNumber: number;
    }>;
    expect(asAutomated.map((r) => r.databaseId)).toEqual([500, 510]);
    const sameFileBasis = runHelper(`m.findNewerRuns(${JSON.stringify(MIXED_POPULATION)}, 430, 480, 'runNumber')`) as Array<{
      databaseId: number;
    }>;
    expect(sameFileBasis.map((r) => r.databaseId)).toEqual([510]);
  });

  it('reports no newer release for a valid dispatch with nothing queued after it', () => {
    // databaseId 510 is the newest run in the repository → a dispatch of it must be
    // a clean "no newer release", which is exactly what the old code could not say.
    const res = runHelper(`m.detectStaleRelease(510, 4, undefined, [
      { databaseId: 500, runNumber: 430 },
      { databaseId: 490, runNumber: 3 },
      { databaseId: 510, runNumber: 4 },
    ], 'workflow_dispatch')`) as DetectResult;

    expect(res.newerRuns).toEqual([]);
    expect(res.isStale).toBe(false);
    expect(res.orderField).toBe('databaseId');
    expect(res.message).toBe('No newer release queued');
    // Self-exclusion is applied on the dispatch path too, even though the current run
    // can appear in a queued listing.
    expect(res.comparisonBasis).toBe(510);
  });

  it('automated path with nothing newer reports the same way', () => {
    const res = runHelper(`m.detectStaleRelease(102, 9, undefined, [
      { databaseId: 101, runNumber: 8 },
    ], 'push')`) as DetectResult;
    expect(res.newerRuns).toEqual([]);
    expect(res.orderField).toBe('runNumber');
    expect(res.comparisonBasis).toBe(9);
  });

  it('never reports a stale release as an abort (allow-complete policy)', () => {
    const res = runHelper(`m.detectStaleRelease(102, 5, undefined, [
      { databaseId: 103, runNumber: 7 },
    ])`) as DetectResult;

    expect(res.isStale).toBe(false);
    expect(res.policy).toBe('allow-complete');
    expect(res.newerRuns).toEqual([{ runId: 103, runNumber: 7 }]);
  });

  it('merges queued sources and drops duplicate run ids', () => {
    const merged = runHelper(`m.mergeQueuedRuns([
      [{ databaseId: 5, runNumber: 2 }, { databaseId: 6, runNumber: 3 }],
      [{ databaseId: 5, runNumber: 2 }, { databaseId: 7, runNumber: 1 }],
    ])`) as Array<{ databaseId: number }>;
    expect(merged.map((r) => r.databaseId)).toEqual([5, 6, 7]);

    // Merged + deduplicated population is what the comparator runs over.
    const res = runHelper(`m.detectStaleRelease(5, 4, undefined, [
      { databaseId: 5, runNumber: 2 },
      { databaseId: 6, runNumber: 3 },
      { databaseId: 7, runNumber: 1 },
    ], 'workflow_dispatch')`) as DetectResult;
    expect(res.newerRuns.map((r) => r.runId)).toEqual([6, 7]);
  });

  it('stays consistent with the authoritative workflow step', () => {
    const relRaw = readFileInNode(path.resolve(repoRoot, '.github', 'workflows', 'release.yml'));
    const lines = relRaw.split(/\r?\n/);
    const start = lines.findIndex((l) => /if \[ "\$EVENT_NAME" = "workflow_dispatch" \]; then/.test(l));
    const mid = lines.findIndex((l, i) => i > start && start >= 0 && /^ {10}else$/.test(l));
    const end = lines.findIndex((l, i) => i > mid && mid >= 0 && /^ {10}fi$/.test(l));
    expect(start).toBeGreaterThan(-1);
    expect(mid).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(mid);
    const dispatchBranch = lines.slice(start + 1, mid).join('\n');
    const automatedBranch = lines.slice(mid + 1, end).join('\n');

    // Whatever field the helper picks for a path must be the field the step sets for
    // that same path — the mirror is what makes these tests meaningful.
    const automatedField = runHelper('m.ORDER_FIELD_AUTOMATED') as string;
    const dispatchField = runHelper('m.ORDER_FIELD_DISPATCH') as string;
    expect(automatedField).toBe('runNumber');
    expect(dispatchField).toBe('databaseId');
    expect(automatedBranch).toContain(`ORDER_FIELD='${automatedField}'`);
    expect(dispatchBranch).toContain(`ORDER_FIELD='${dispatchField}'`);

    // Both files select the same JSON fields, and neither uses wall-clock ordering.
    expect(relRaw).toMatch(/--json databaseId,runNumber/);
    expect(relRaw).not.toMatch(/select\(\.createdAt/);
    expect(relRaw).toMatch(/Allow current migration to complete/);
  });

  it('gh queries are parameterised from the path-specific sources', () => {
    const source = readFileInNode(helperPath);
    expect(source).toMatch(/--workflow=\$\{workflowFile\}/);
    expect(source).toMatch(/--branch=\$\{branch\}/);
    expect(source).toMatch(/--status=queued/);
    expect(source).toMatch(/--json databaseId,runNumber/);
    expect(source).not.toMatch(/--json[^\n]*createdAt/);
    // A branch-less source (dispatch runs of release.yml) must omit the flag entirely.
    expect(source).toMatch(/branch \? ` --branch=\$\{branch\}` : ''/);
    // Both identifiers have to be fetched, since each path orders on a different one.
    expect(source).toMatch(/const key = field === ORDER_FIELD_DISPATCH \? 'databaseId' : 'runNumber'/);
  });
});
