import type { OpsAlertInput } from './ops-alert.service';
import { P13_LEASE_KEY } from './p13-ops.config';
import type { LeaseRecord } from './worker-lease.service';

/**
 * Evaluate the expected number of live P13 workers.
 *
 * A zero expected count disables this check and resolves any previous count
 * anomaly for known lease keys. A positive count remains enforceable even when
 * the current API process does not itself host the worker.
 */
export function collectWorkerCountAnomalies(
  leaseRows: readonly LeaseRecord[],
  expectedWorkerCount: number,
): { findings: OpsAlertInput[]; clears: string[] } {
  const findings: OpsAlertInput[] = [];
  const clears: string[] = [];

  const byKey = new Map<string, number>();
  const now = Date.now();

  for (const lease of leaseRows) {
    const live = !!lease.holderId && !!lease.expiresAt && lease.expiresAt.getTime() > now;
    byKey.set(lease.leaseKey, (byKey.get(lease.leaseKey) ?? 0) + (live ? 1 : 0));
  }

  // A missing lease row is a zero-worker condition when at least one worker
  // is explicitly expected. When no worker is expected, resolve stale alerts.
  if (expectedWorkerCount <= 0) {
    for (const leaseKey of byKey.keys()) {
      clears.push(`p13.worker.count_anomaly:${leaseKey}`);
    }
    clears.push(`p13.worker.count_anomaly:${P13_LEASE_KEY}`);
    return { findings, clears };
  }

  if (!byKey.has(P13_LEASE_KEY)) byKey.set(P13_LEASE_KEY, 0);

  for (const [leaseKey, live] of byKey) {
    if (live === expectedWorkerCount) {
      clears.push(`p13.worker.count_anomaly:${leaseKey}`);
      continue;
    }

    findings.push({
      conditionKey: 'p13.worker.count_anomaly',
      severity: 'CRITICAL',
      title: `Worker job ${leaseKey} has ${live} live holder(s), expected ${expectedWorkerCount}`,
      detail: { leaseKey, liveHolders: live, expected: expectedWorkerCount },
      resourceType: 'worker_lease',
      dedupKey: `p13.worker.count_anomaly:${leaseKey}`,
    });
  }

  return { findings, clears };
}
