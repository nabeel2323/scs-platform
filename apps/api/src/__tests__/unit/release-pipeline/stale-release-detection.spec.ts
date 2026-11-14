/**
 * Stale Release Detection — Executable Tests
 *
 * The authoritative stale-release logic is embedded in release.yml (the
 * "Check for stale release (pre-mutation safety)" step in the database-release job).
 * These tests read that REAL step from the workflow file and assert its invariants:
 *   1. Each execution path orders runs on an identifier that is comparable for that
 *      path: `runNumber` (per workflow file) on the automated path, `databaseId`
 *      (repository-global) on the manual-dispatch path. Audit finding F-4 was exactly
 *      the absence of this split.
 *   2. The automated path inspects the CALLER workflow (ci.yml on develop); a reusable
 *      workflow invoked by `workflow_call` produces no standalone release.yml runs.
 *   3. The dispatch path additionally inspects release.yml's own queued runs, because on
 *      that path release.yml really does own the run.
 *   4. A single generic comparator consumes the per-path field/basis pair — no
 *      hard-coded cross-workflow numeric comparison is left anywhere.
 *   5. Policy is "allow-complete": the step must NOT abort (no `exit 1`) when a newer
 *      run is queued, nor when a queued-run query fails.
 *   6. The check runs BEFORE any database mutation (pre-mutation safety ordering).
 *
 * @see .github/workflows/release.yml (job: database-release)
 * @see apps/api/scripts/detect-stale-release.mjs (mirrored logic, executed by the helper spec)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Spec lives at apps/api/src/__tests__/unit/release-pipeline/.
const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const relPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');
const relRaw = fs.readFileSync(relPath, 'utf8');

/** Extract a single step's YAML block (from its `- name:` up to the next `- name:`). */
function extractStep(raw: string, stepName: string): string {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes('- name:') && l.includes(stepName));
  if (start === -1) throw new Error(`Workflow step not found: ${stepName}`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*-\s+name:/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

const staleStep = extractStep(relRaw, 'Check for stale release');

/**
 * The two branch bodies of the path-selection `if`, sliced on the step's own
 * indentation (block-scalar content is indented 10 spaces in this file, so a
 * top-level `else`/`fi` is exactly 10 spaces and a nested one is deeper).
 */
function pathBranches(step: string): { dispatch: string; automated: string } {
  const lines = step.split(/\r?\n/);
  const start = lines.findIndex((l) => /if \[ "\$EVENT_NAME" = "workflow_dispatch" \]; then/.test(l));
  const mid = lines.findIndex((l, i) => i > start && start >= 0 && /^ {10}else$/.test(l));
  const end = lines.findIndex((l, i) => i > mid && mid >= 0 && /^ {10}fi$/.test(l));
  if (start === -1 || mid === -1 || end === -1) throw new Error('stale-release step has no dispatch/automated branch split');
  return {
    dispatch: lines.slice(start + 1, mid).join('\n'),
    automated: lines.slice(mid + 1, end).join('\n'),
  };
}

const branches = pathBranches(staleStep);

describe('Stale release detection (real workflow step)', () => {
  it('handles the two execution paths separately', () => {
    expect(staleStep).toMatch(/EVENT_NAME="\$\{\{ github\.event_name \}\}/);
    expect(staleStep).toMatch(/if \[ "\$EVENT_NAME" = "workflow_dispatch" \]; then/);
    // Both identifiers must still be read: each is the basis for one path.
    expect(staleStep).toMatch(/CURRENT_RUN_ID="\$\{\{ github\.run_id \}\}/);
    expect(staleStep).toMatch(/CURRENT_RUN_NUMBER="\$\{\{ github\.run_number \}\}/);
  });

  it('automated path orders ci.yml runs by per-workflow runNumber', () => {
    expect(branches.automated).toMatch(/ORDER_FIELD='runNumber'/);
    expect(branches.automated).toMatch(/COMPARISON_BASIS="\$CURRENT_RUN_NUMBER"/);
    // github.event_name inside a called workflow is the caller's event, never
    // 'workflow_call', so the fall-through branch is the automated path.
    expect(branches.automated).not.toMatch(/workflow_call/);
  });

  it('dispatch path orders by the repository-global databaseId', () => {
    expect(branches.dispatch).toMatch(/ORDER_FIELD='databaseId'/);
    expect(branches.dispatch).toMatch(/COMPARISON_BASIS="\$CURRENT_RUN_ID"/);
  });

  it('never compares a run_number from one workflow file against another file', () => {
    // The F-4 defect: ci.yml runNumbers (~400) against release.yml's own run_number
    // (~3) marked every valid dispatch as stale.
    expect(staleStep).not.toMatch(/select\(\.runNumber\s*>\s*\$current\)/);
    expect(staleStep).not.toMatch(/--argjson current "\$CURRENT_RUN_NUMBER"/);
    // One generic comparator, driven by the per-path pair.
    expect(staleStep).toMatch(/--arg field "\$ORDER_FIELD"/);
    expect(staleStep).toMatch(/--argjson basis "\$COMPARISON_BASIS"/);
    expect(staleStep).toMatch(/select\(\.\[\s*\$field\s*\]\s*>\s*\$basis\)/);
  });

  it('automated path inspects only the CALLER workflow (ci.yml on develop)', () => {
    expect(branches.automated).toMatch(/'ci\.yml:develop'/);
    // Regression guard: release.yml has no standalone runs when invoked by
    // workflow_call, so querying it there would silently no-op the check.
    expect(branches.automated).not.toMatch(/release\.yml/);
  });

  it('dispatch path inspects its own queued runs AND queued develop CI runs', () => {
    expect(branches.dispatch).toMatch(/'release\.yml:'/);
    expect(branches.dispatch).toMatch(/'ci\.yml:develop'/);
  });

  it('queries both sources queued-only and selects the comparable fields', () => {
    expect(staleStep).toMatch(/--workflow="\$WF"/);
    expect(staleStep).toMatch(/--branch="\$BRANCH_FILTER"/);
    expect(staleStep).toMatch(/--status=queued/);
    expect(staleStep).toMatch(/--json databaseId,runNumber/);
    // createdAt is wall-clock and must never be an ordering key.
    expect(staleStep).not.toMatch(/--json[^\n]*createdAt/);
    expect(staleStep).not.toMatch(/select\(\.createdAt/);
    expect(staleStep).not.toMatch(/createdAt/);
  });

  it('excludes the current run and deduplicates the merged queued set', () => {
    expect(staleStep).toMatch(/--argjson self "\$CURRENT_RUN_ID"/);
    expect(staleStep).toMatch(/select\(\.databaseId != \$self\)/);
    expect(staleStep).toMatch(/unique_by\(\.databaseId\)/);
  });

  it('degrades to a warning when a queued-run query fails (informational check)', () => {
    // A transient API failure must not fail the release before mutation: the
    // outcome of a successful detection is "proceed anyway".
    expect(staleStep).toMatch(/\|\| OUT=''/);
    expect(staleStep).toMatch(/QUERY_FAILURES=\$\(\(QUERY_FAILURES \+ 1\)\)/);
    expect(staleStep).toMatch(/Could not read queued/);
  });

  it('does NOT abort when a newer release is queued (allow-complete policy)', () => {
    // Pre-mutation safety must finish the current migration for consistency, so the
    // newer-queued branch warns but never exits non-zero.
    expect(staleStep).not.toMatch(/exit 1/);
    expect(staleStep).toMatch(/Allow current migration to complete/);
    expect(staleStep).toMatch(/No abort/);
    expect(staleStep).toMatch(/never aborts a release/);
  });

  it('describes the concurrency model that actually applies after the R-1 fix', () => {
    // The develop CI group no longer cancels in progress, and the release group
    // queues instead of replacing an older pending run. The wording must not claim
    // FIFO or unlimited queueing.
    expect(staleStep).toMatch(/one running \+ one pending/);
    expect(staleStep).toMatch(/NOT FIFO/);
    expect(staleStep).toMatch(/older PENDING run is replaced/);
    expect(staleStep).toMatch(/queue: max/);
    expect(staleStep).not.toMatch(/FIFO\)/);
  });

  it('runs BEFORE the database-mutation step in the database-release job', () => {
    const staleIdx = relRaw.indexOf('Check for stale release');
    const migrateIdx = relRaw.indexOf('Execute database operations with SSL certificate');
    expect(staleIdx).toBeGreaterThan(-1);
    expect(migrateIdx).toBeGreaterThan(-1);
    expect(staleIdx).toBeLessThan(migrateIdx);
  });

  it('negative control: the assertions can actually fail (harness is bound to the real text)', () => {
    // (a) Losing the path split must break the branch reader rather than silently
    // returning empty regions for the path-specific assertions.
    const withoutBranch = staleStep
      .split(/\r?\n/)
      .filter((l) => !/^ {10}(else|fi)$/.test(l))
      .join('\n');
    expect(() => pathBranches(withoutBranch)).toThrow();

    // (b) Reverting to a renamed step must break the extractor, not assert on `undefined`.
    expect(() => extractStep(relRaw, 'No Such Workflow Step')).toThrow();

    // (c) Re-introducing the F-4 mixed comparison must be caught by the guard regex.
    const reintroduced = staleStep.replace(
      /select\(\.\[\s*\$field\s*\]\s*>\s*\$basis\)/,
      'select(.runNumber > $current)',
    );
    expect(reintroduced).toMatch(/select\(\.runNumber\s*>\s*\$current\)/);
    expect(reintroduced).not.toMatch(/select\(\.\[\s*\$field\s*\]\s*>\s*\$basis\)/);
  });
});
