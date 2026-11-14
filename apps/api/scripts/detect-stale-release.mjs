#!/usr/bin/env node
/**
 * Stale Release Detection Helper
 *
 * Mirrors the authoritative "Check for stale release (pre-mutation safety)" step in
 * .github/workflows/release.yml (job: database-release) so the ordering / allow-complete
 * policy can be unit-tested without a GitHub Actions runner. If the workflow step and
 * this helper diverge, `stale-release-helper.spec.ts` fails.
 *
 * THE TWO EXECUTION PATHS ARE NOT INTERCHANGEABLE (audit finding F-4):
 *
 *   Path A — `workflow_call` from ci.yml. release.yml is a REUSABLE workflow, so it runs
 *     as a job inside the caller's workflow run and produces no standalone release.yml
 *     runs. `github.run_id` / `github.run_number` / `github.event_name` inside the called
 *     workflow therefore describe the CALLER. The comparable population is ci.yml's runs
 *     on develop, ordered by `runNumber` (monotonic per workflow file) against the
 *     caller's own run number.
 *
 *   Path B — `workflow_dispatch` of release.yml. This run IS a release.yml run, so its
 *     run_number belongs to release.yml's own per-file counter. Comparing that number to
 *     ci.yml run numbers (hundreds) reported "newer release queued" on every single
 *     dispatch. Ordering therefore uses `databaseId`, the run id, which is monotonic
 *     across the whole repository and so is comparable between the two workflow files.
 *     Both sources are scanned: queued release.yml dispatch runs (any ref — validate
 *     accepts a develop-reachable SHA regardless of the ref the dispatch was started
 *     from) and queued ci.yml develop runs.
 *
 * POLICY = allow-complete: detecting a newer queued release never aborts the current
 * release, because interrupting an in-flight migration can leave the schema
 * half-migrated. Detection is also informational about its own failures: an unreadable
 * queued-run list degrades to a warning, never to an abort.
 *
 * Usage: node detect-stale-release.mjs <current-run-id> <current-run-number> [gh-token] [event-name]
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
/** This file — a real workflow run only when the release was started by workflow_dispatch. */
export const SELF_WORKFLOW_FILE = 'release.yml';

/** Per-workflow-file monotonic counter: valid within ci.yml only (Path A). */
export const ORDER_FIELD_AUTOMATED = 'runNumber';
/** Repository-global monotonic run id: the only cross-workflow comparator (Path B). */
export const ORDER_FIELD_DISPATCH = 'databaseId';

const MANUAL_EVENT = 'workflow_dispatch';

/**
 * Ordering field for an execution path. Anything that is not a manual dispatch is the
 * automated path — inside a called workflow `github.event_name` is the caller's event
 * ('push'), never the literal 'workflow_call'.
 * @param {string} eventName
 */
export function orderFieldForEvent(eventName) {
  return eventName === MANUAL_EVENT ? ORDER_FIELD_DISPATCH : ORDER_FIELD_AUTOMATED;
}

/**
 * The run's own value on the ordering field for this path.
 * @param {string} eventName
 * @param {number|string} currentRunId - github.run_id
 * @param {number|string} currentRunNumber - github.run_number
 */
export function comparisonBasisForEvent(eventName, currentRunId, currentRunNumber) {
  return eventName === MANUAL_EVENT ? Number(currentRunId) : Number(currentRunNumber);
}

/**
 * Which (workflow file, branch) populations can hold a newer staging release on this path.
 * A `null` branch means "do not filter by branch".
 * @param {string} eventName
 */
export function queuedRunSources(eventName) {
  if (eventName === MANUAL_EVENT) {
    return [
      { workflowFile: SELF_WORKFLOW_FILE, branch: null },
      { workflowFile: CALLER_WORKFLOW_FILE, branch: CALLER_BRANCH },
    ];
  }
  return [{ workflowFile: CALLER_WORKFLOW_FILE, branch: CALLER_BRANCH }];
}

/**
 * Deduplicated union of several queued-run lists, keyed by the repository-global run id.
 * @param {Array<Array<{databaseId: number, runNumber: number}>>} lists
 */
export function mergeQueuedRuns(lists) {
  const byId = new Map();
  for (const list of Array.isArray(lists) ? lists : []) {
    for (const run of Array.isArray(list) ? list : []) {
      if (run && Number.isFinite(Number(run.databaseId)) && !byId.has(Number(run.databaseId))) {
        byId.set(Number(run.databaseId), run);
      }
    }
  }
  return [...byId.values()];
}

/**
 * Pure ordering logic: newer = strictly greater than the basis on `field`, excluding
 * the current run. Equal values are never "newer".
 *
 * @param {Array<{databaseId: number, runNumber: number}>} queuedRuns
 * @param {number} currentBasis - this run's value on `field`
 * @param {number|null} [currentRunId] - github.run_id, always excluded as "self"
 * @param {string} [field] - ORDER_FIELD_AUTOMATED | ORDER_FIELD_DISPATCH
 */
export function findNewerRuns(queuedRuns, currentBasis, currentRunId = null, field = ORDER_FIELD_AUTOMATED) {
  const basis = Number(currentBasis);
  if (!Number.isFinite(basis)) return [];
  const key = field === ORDER_FIELD_DISPATCH ? 'databaseId' : 'runNumber';
  return (Array.isArray(queuedRuns) ? queuedRuns : [])
    .filter((run) => run && Number.isFinite(Number(run[key])))
    .filter((run) => currentRunId == null || Number(run.databaseId) !== Number(currentRunId))
    .filter((run) => Number(run[key]) > basis)
    .sort((a, b) => Number(a[key]) - Number(b[key]));
}

/**
 * Get all queued runs for one (workflow file, branch) source.
 * @param {string} workflowFile
 * @param {string|undefined} ghToken
 * @param {string|null} [branch] - null / undefined means no branch filter
 */
export function getQueuedRuns(workflowFile = CALLER_WORKFLOW_FILE, ghToken, branch = CALLER_BRANCH) {
  const safeName = /^[A-Za-z0-9._/-]+$/.test(String(workflowFile));
  const safeBranch = branch === null || branch === undefined || /^[A-Za-z0-9._/-]+$/.test(String(branch));
  if (!safeName || !safeBranch) return [];
  const branchArg = branch ? ` --branch=${branch}` : '';
  try {
    const output = execSync(
      `gh run list --workflow=${workflowFile}${branchArg} --status=queued --json databaseId,runNumber --limit 10`,
      {
        encoding: 'utf8',
        env: { ...process.env, GH_TOKEN: ghToken },
      },
    );
    return JSON.parse(output);
  } catch (error) {
    // Detection is informational: an unreadable run list must not block a release.
    console.error(`Failed to query queued runs: ${error.message}`);
    return null;
  }
}

/**
 * Detect whether a newer release is queued, using the identifiers that are comparable
 * for the execution path actually in play.
 *
 * @param {number} currentRunId - the run's databaseId (caller's on Path A, own on Path B)
 * @param {number} currentRunNumber - the run's run_number for the same run
 * @param {string} [ghToken] - GitHub token used by `gh`
 * @param {Array<{databaseId: number, runNumber: number}>|null} [queuedRuns] - pre-fetched runs (tests)
 * @param {string} [eventName] - github.event_name ('push' | 'workflow_dispatch')
 * @returns {object} Stale detection result
 */
export function detectStaleRelease(currentRunId, currentRunNumber, ghToken, queuedRuns = null, eventName = 'push') {
  const field = orderFieldForEvent(eventName);
  const basis = comparisonBasisForEvent(eventName, currentRunId, currentRunNumber);

  let runs = queuedRuns;
  let sourcesRead = 0;
  let sourcesFailed = 0;
  if (runs === null || runs === undefined) {
    const lists = [];
    for (const source of queuedRunSources(eventName)) {
      const out = getQueuedRuns(source.workflowFile, ghToken, source.branch);
      if (out === null) sourcesFailed++;
      else {
        sourcesRead++;
        lists.push(out);
      }
    }
    runs = mergeQueuedRuns(lists);
  } else {
    sourcesRead = queuedRunSources(eventName).length;
  }

  const newerRuns = findNewerRuns(runs, basis, currentRunId, field);

  if (newerRuns.length === 0) {
    return {
      isStale: false,
      policy: 'allow-complete',
      orderField: field,
      comparisonBasis: basis,
      sourcesRead,
      sourcesFailed,
      message: sourcesFailed > 0 ? 'No newer release queued (partial detection)' : 'No newer release queued',
      newerRuns: [],
    };
  }

  // POLICY: Allow current migration to complete for consistency. Do NOT abort.
  return {
    isStale: false, // allow-complete: safe to proceed
    policy: 'allow-complete',
    orderField: field,
    comparisonBasis: basis,
    sourcesRead,
    sourcesFailed,
    message: `Newer release(s) queued on ${field} (will run after current completes)`,
    newerRuns: newerRuns.map((r) => ({ runId: r.databaseId, runNumber: r.runNumber })),
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const [currentRunId, currentRunNumber, ghToken, eventName = 'push'] = process.argv.slice(2);

  if (!currentRunId || !currentRunNumber) {
    console.error('Usage: node detect-stale-release.mjs <run-id> <run-number> [gh-token] [event-name]');
    process.exit(2);
  }

  const result = detectStaleRelease(
    parseInt(currentRunId, 10),
    parseInt(currentRunNumber, 10),
    ghToken,
    null,
    eventName,
  );

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
