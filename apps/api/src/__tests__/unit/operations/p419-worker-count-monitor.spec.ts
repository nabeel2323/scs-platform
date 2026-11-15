import { describe, expect, it } from 'vitest';
import { collectWorkerCountAnomalies } from '../../../modules/operations/worker-count-monitor';
import { P13_LEASE_KEY, resolveP13OpsConfig } from '../../../modules/operations/p13-ops.config';
import type { LeaseRecord } from '../../../modules/operations/worker-lease.service';

function lease(
  overrides: Partial<LeaseRecord> = {},
): LeaseRecord {
  return {
    leaseKey: P13_LEASE_KEY,
    holderId: null,
    holderHost: null,
    holderPid: null,
    epoch: 0,
    acquiredAt: null,
    heartbeatAt: null,
    expiresAt: null,
    pollFailures: 0,
    lastErrorCode: null,
    lastJobAt: null,
    lastJobSummary: null,
    ...overrides,
  };
}

describe('P13 worker-count monitoring', () => {
  it('expects zero workers by default when the opt-in worker is disabled', () => {
    const config = resolveP13OpsConfig({} as NodeJS.ProcessEnv);

    expect(config.workerEnabled).toBe(false);
    expect(config.expectedWorkerCount).toBe(0);
  });

  it('expects one worker by default when the worker is enabled', () => {
    const config = resolveP13OpsConfig({
      P13_WORKER_ENABLED: 'true',
    } as NodeJS.ProcessEnv);

    expect(config.workerEnabled).toBe(true);
    expect(config.expectedWorkerCount).toBe(1);
  });

  it('preserves an explicit expected count for a worker hosted by another instance', () => {
    const config = resolveP13OpsConfig({
      P13_WORKER_ENABLED: 'false',
      P13_WORKER_EXPECTED_COUNT: '1',
    } as NodeJS.ProcessEnv);

    expect(config.workerEnabled).toBe(false);
    expect(config.expectedWorkerCount).toBe(1);
  });

  it('does not report a zero-worker anomaly when no worker is expected and clears the old alert', () => {
    const result = collectWorkerCountAnomalies([], 0);

    expect(result.findings).toEqual([]);
    expect(result.clears).toContain(`p13.worker.count_anomaly:${P13_LEASE_KEY}`);
  });

  it('reports a critical anomaly when one worker is expected but no lease exists', () => {
    const result = collectWorkerCountAnomalies([], 1);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      conditionKey: 'p13.worker.count_anomaly',
      severity: 'CRITICAL',
      dedupKey: `p13.worker.count_anomaly:${P13_LEASE_KEY}`,
      detail: { leaseKey: P13_LEASE_KEY, liveHolders: 0, expected: 1 },
    });
    expect(result.clears).toEqual([]);
  });

  it('clears the count anomaly when the expected live lease exists', () => {
    const result = collectWorkerCountAnomalies(
      [lease({ holderId: 'worker-1', expiresAt: new Date(Date.now() + 60_000) })],
      1,
    );

    expect(result.findings).toEqual([]);
    expect(result.clears).toContain(`p13.worker.count_anomaly:${P13_LEASE_KEY}`);
  });

  it('reports a mismatch when the explicit expected count is greater than live holders', () => {
    const result = collectWorkerCountAnomalies(
      [lease({ holderId: 'worker-1', expiresAt: new Date(Date.now() + 60_000) })],
      2,
    );

    expect(result.findings[0]?.detail).toEqual({
      leaseKey: P13_LEASE_KEY,
      liveHolders: 1,
      expected: 2,
    });
  });
});
