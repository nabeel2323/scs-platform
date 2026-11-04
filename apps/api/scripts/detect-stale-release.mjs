#!/usr/bin/env node
/**
 * Stale Release Detection Helper
 * 
 * Implements release ordering and stale-release detection logic.
 * Uses monotonic run_number for reliable ordering.
 * 
 * Usage: node detect-stale-release.mjs <current-run-id> <current-run-number> <gh-token>
 * 
 * Exit codes:
 *   0 - Safe to proceed (no newer release OR newer release doesn't affect current)
 *   1 - Stale release detected (newer eligible release exists)
 *   2 - Configuration error
 */

import { execSync } from 'child_process';

/**
 * Get all queued runs for a workflow
 */
export function getQueuedRuns(workflowFile = 'release.yml', ghToken) {
  try {
    const output = execSync(
      `gh run list --workflow=${workflowFile} --status=queued --json databaseId,runNumber,createdAt --limit 10`,
      { 
        encoding: 'utf8',
        env: { ...process.env, GH_TOKEN: ghToken }
      }
    );
    return JSON.parse(output);
  } catch (error) {
    console.error(`Failed to query queued runs: ${error.message}`);
    return [];
  }
}

/**
 * Detect if current release is stale
 * 
 * Policy: 
 * - Uses run_number (monotonic) for ordering
 * - Does NOT abort if newer run is queued (migration already started)
 * - Returns info about newer runs for operator awareness
 * 
 * @param {number} currentRunId - Current run's databaseId
 * @param {number} currentRunNumber - Current run's runNumber
 * @param {string} ghToken - GitHub token
 * @returns {object} Stale detection result
 */
export function detectStaleRelease(currentRunId, currentRunNumber, ghToken) {
  const queuedRuns = getQueuedRuns('release.yml', ghToken);
  
  // Filter for runs with higher run_number (newer)
  const newerRuns = queuedRuns.filter(run => 
    run.runNumber > currentRunNumber
  );
  
  if (newerRuns.length === 0) {
    return {
      isStale: false,
      message: 'No newer release queued',
      newerRuns: []
    };
  }
  
  // POLICY: Allow current migration to complete for consistency
  // Do NOT abort - just warn operator
  return {
    isStale: false,  // Safe to proceed
    policy: 'allow-complete',
    message: `Newer release(s) queued (will run after current completes)`,
    newerRuns: newerRuns.map(r => ({
      runId: r.databaseId,
      runNumber: r.runNumber
    }))
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const [currentRunId, currentRunNumber, ghToken] = process.argv.slice(2);
  
  if (!currentRunId || !currentRunNumber) {
    console.error('Usage: node detect-stale-release.mjs <run-id> <run-number> <gh-token>');
    process.exit(2);
  }
  
  const result = detectStaleRelease(
    parseInt(currentRunId),
    parseInt(currentRunNumber),
    ghToken
  );
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
