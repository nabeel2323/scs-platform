#!/usr/bin/env node
/**
 * Stale Release Detection Helper
 *
 * Mirrors the authoritative "Check for stale release (pre-mutation safety)" step in
 * .github/workflows/release.yml (job: database-release) so the ordering / allow-complete
 * policy can be unit-tested without a GitHub Actions runner.
 *
 * IMPORTANT: release.yml is a REUSABLE workflow invoked by ci.yml, so it runs as a job
 * inside the caller's workflow run and produces no standalone release.yml runs. The runs
 * that can represent a newer release therefore belong to the CALLER workflow file
 * (ci.yml) on the develop branch — which is also where `github.run_id` /
 * `github.run_number` inside the called workflow point.
 *
 * Ordering uses monotonic `run_number`, never wall-clock `createdAt`.
 *
 * POLICY = allow-complete: detecting a newer queued release never aborts the current
 * release, because interrupting an in-flight migration can leave the schema half-migrated.
 *
 * Usage: node detect-stale-release.mjs <current-run-id> <current-run-number> [gh-token]
 *
 * Exit codes:
 *   0 - Detection completed (this helper never signals an abort)
 *   2 - Configuration error
 */

import { execSync } from 'child_process';

/** Caller workflow whose queued runs are inspected for newer releases. */
export const CALLER_WORKFLOW_FILE = 'ci.yml';
/** Branch the caller workflow runs on for staging releases. */
export const CALLER_BRANCH = 'develop';

/**
 * Pure ordering logic: newer = strictly greater run_number, excluding the current run.
 * @param {Array<{databaseId: number, runNumber: number}>} queuedRuns
 * @param {number} currentRunNumber
 * @param {number|null} [currentRunId]
 */
export function findNewerRuns(queuedRuns, currentRunNumber, currentRunId = null) {
  const runNumber = Number(currentRunNumber);
  if (!Number.isFinite(runNumber)) return [];
  return (Array.isArray(queuedRuns) ? queuedRuns : [])
    .filter((run) => run && Number.isFinite(Number(run.runNumber)))
    .filter((run) => currentRunId == null || Number(run.databaseId) !== Number(currentRunId))
    .filter((run) => Number(run.runNumber) > runNumber)
    .sort((a, b) => Number(a.runNumber) - Number(b.runNumber));
}

/**
 * Get all queued runs for a workflow (default: the caller, ci.yml, on develop).
 */
export function getQueuedRuns(workflowFile = CALLER_WORKFLOW_FILE, ghToken, branch = CALLER_BRANCH) {
  try {
    const output = execSync(
      `gh run list --workflow=${workflowFile} --branch=${branch} --status=queued --json databaseId,runNumber --limit 10`,
      {
        encoding: 'utf8',
        env: { ...process.env, GH_TOKEN: ghToken },
      },
    );
    return JSON.parse(output);
  } catch (error) {
    // Detection is informational: an unreadable run list must not block a release.
    console.error(`Failed to query queued runs: ${error.message}`);
    return [];
  }
}

/**
 * Detect whether a newer release is queued for the caller workflow.
 *
 * @param {number} currentRunId - Current (caller) run's databaseId
 * @param {number} currentRunNumber - Current (caller) run's runNumber
 * @param {string} [ghToken] - GitHub token used by `gh`
 * @param {Array<{databaseId: number, runNumber: number}>} [queuedRuns] - pre-fetched runs (tests)
 * @returns {object} Stale detection result
 */
export function detectStaleRelease(currentRunId, currentRunNumber, ghToken, queuedRuns = null) {
  const runs = queuedRuns ?? getQueuedRuns(CALLER_WORKFLOW_FILE, ghToken, CALLER_BRANCH);
  const newerRuns = findNewerRuns(runs, currentRunNumber, currentRunId);

  if (newerRuns.length === 0) {
    return {
      isStale: false,
      policy: 'allow-complete',
      message: 'No newer release queued',
      newerRuns: [],
    };
  }

  // POLICY: Allow current migration to complete for consistency. Do NOT abort.
  return {
    isStale: false, // allow-complete: safe to proceed
    policy: 'allow-complete',
    message: 'Newer release(s) queued (will run after current completes)',
    newerRuns: newerRuns.map((r) => ({ runId: r.databaseId, runNumber: r.runNumber })),
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const [currentRunId, currentRunNumber, ghToken] = process.argv.slice(2);

  if (!currentRunId || !currentRunNumber) {
    console.error('Usage: node detect-stale-release.mjs <run-id> <run-number> [gh-token]');
    process.exit(2);
  }

  const result = detectStaleRelease(parseInt(currentRunId, 10), parseInt(currentRunNumber, 10), ghToken);

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
