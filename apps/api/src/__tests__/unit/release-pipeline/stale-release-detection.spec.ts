/**
 * Stale Release Detection — Executable Tests
 *
 * The authoritative stale-release logic is embedded in release.yml (the
 * "Check for stale release (pre-mutation safety)" step in the database-release job).
 * These tests read that REAL step from the workflow file and assert its invariants:
 *   1. Runs are ordered by monotonic `runNumber` (not wall-clock `createdAt`).
 *   2. A newer queued release is detected via `select(.runNumber > $current)`.
 *   3. Policy is "allow-complete": the step must NOT abort (no `exit 1`) when a newer
 *      run is queued, because an in-flight migration must finish for consistency.
 *   4. The check runs BEFORE any database mutation (pre-mutation safety ordering).
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

  it('queries only queued runs for the release workflow', () => {
    expect(staleStep).toMatch(/--workflow=release\.yml/);
    expect(staleStep).toMatch(/--status=queued/);
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
