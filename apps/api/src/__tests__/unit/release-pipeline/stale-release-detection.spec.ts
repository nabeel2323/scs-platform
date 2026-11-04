/**
 * Stale Release Detection — Executable Tests
 *
 * The authoritative stale-release logic is embedded in release.yml (the
 * "Check for stale release (pre-mutation safety)" step in the database-release job).
 * These tests read that REAL step from the workflow file and assert its invariants:
 *   1. Runs are ordered by monotonic `runNumber` (not wall-clock `createdAt`).
 *   2. A newer queued release is detected via `select(.runNumber > $current)`.
 *   3. Because release.yml is a REUSABLE workflow invoked by ci.yml, it never produces
 *      its own workflow runs — detection must inspect queued runs of the CALLER
 *      workflow (ci.yml on develop), and must exclude the current run.
 *   4. Policy is "allow-complete": the step must NOT abort (no `exit 1`) when a newer
 *      run is queued, because an in-flight migration must finish for consistency.
 *   5. The check runs BEFORE any database mutation (pre-mutation safety ordering).
 *
 * @see .github/workflows/release.yml (job: database-release)
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

describe('Stale release detection (real workflow step)', () => {
  it('orders runs by monotonic runNumber, not a fetched createdAt field', () => {
    expect(staleStep).toMatch(/--json databaseId,runNumber/);
    expect(staleStep).toMatch(/select\(\.runNumber > \$current\)/);
    // createdAt must never be selected as a field or used as an ordering key.
    expect(staleStep).not.toMatch(/--json[^\n]*createdAt/);
    expect(staleStep).not.toMatch(/select\(\.createdAt/);
  });

  it('inspects queued runs of the CALLER workflow (ci.yml on develop)', () => {
    // release.yml is called as a reusable workflow: it runs as a job inside the
    // ci.yml run, so github.run_id/run_number below are ci.yml identifiers and the
    // only queued runs that can represent a newer release belong to ci.yml.
    expect(staleStep).toMatch(/--workflow=ci\.yml/);
    expect(staleStep).toMatch(/--branch=develop/);
    expect(staleStep).toMatch(/--status=queued/);
    // Regression guard: querying release.yml would always return an empty set and
    // silently turn the check into a no-op.
    expect(staleStep).not.toMatch(/--workflow=release\.yml/);
  });

  it('excludes the current run before comparing run numbers', () => {
    expect(staleStep).toMatch(/CURRENT_RUN_ID="\$\{\{ github\.run_id \}\}/);
    expect(staleStep).toMatch(/CURRENT_RUN_NUMBER="\$\{\{ github\.run_number \}\}/);
    expect(staleStep).toMatch(/--argjson self "\$CURRENT_RUN_ID"/);
    expect(staleStep).toMatch(/select\(\.databaseId != \$self\)/);
    expect(staleStep).toMatch(/select\(\.runNumber > \$current\)/);
  });

  it('never aborts on a gh API error either (check is informational)', () => {
    // A transient API failure must not fail the release before mutation: the
    // outcome of a successful detection is "proceed anyway".
    expect(staleStep).toMatch(/\|\| QUEUED_RUNS=''/);
    expect(staleStep).toMatch(/Could not read queued ci\.yml runs/);
  });

  it('does NOT abort when a newer release is queued (allow-complete policy)', () => {
    // Pre-mutation safety must finish the current migration for consistency, so the
    // newer-queued branch warns but never exits non-zero.
    expect(staleStep).not.toMatch(/exit 1/);
    expect(staleStep).toMatch(/Allow current migration to complete/);
    expect(staleStep).toMatch(/No abort/);
  });

  it('documents the GitHub one-running + one-pending (non-FIFO) concurrency model', () => {
    expect(staleStep).toMatch(/one-running \+ one-pending/);
    expect(staleStep).toMatch(/NOT FIFO/);
  });

  it('runs BEFORE the database-mutation step in the database-release job', () => {
    const staleIdx = relRaw.indexOf('Check for stale release');
    const migrateIdx = relRaw.indexOf('Execute database operations with SSL certificate');
    expect(staleIdx).toBeGreaterThan(-1);
    expect(migrateIdx).toBeGreaterThan(-1);
    expect(staleIdx).toBeLessThan(migrateIdx);
  });
});
