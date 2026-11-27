import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentProofCleanupWorker } from '../../../modules/payments/payment-proof-cleanup.worker';

const originalEnabled = process.env['PAYMENT_PROOF_CLEANUP_WORKER_ENABLED'];
const originalInterval = process.env['PAYMENT_PROOF_CLEANUP_INTERVAL_MS'];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalEnabled === undefined) delete process.env['PAYMENT_PROOF_CLEANUP_WORKER_ENABLED'];
  else process.env['PAYMENT_PROOF_CLEANUP_WORKER_ENABLED'] = originalEnabled;
  if (originalInterval === undefined) delete process.env['PAYMENT_PROOF_CLEANUP_INTERVAL_MS'];
  else process.env['PAYMENT_PROOF_CLEANUP_INTERVAL_MS'] = originalInterval;
});

describe('PaymentProofCleanupWorker', () => {
  it('is disabled by default and never schedules cleanup', () => {
    delete process.env['PAYMENT_PROOF_CLEANUP_WORKER_ENABLED'];
    const payments = { cleanupStaleProofUploads: vi.fn() };
    const worker = new PaymentProofCleanupWorker(payments as any);

    worker.onModuleInit();

    expect(payments.cleanupStaleProofUploads).not.toHaveBeenCalled();
    expect((worker as any).timer).toBeNull();
    worker.onModuleDestroy();
  });

  it('schedules polling only when explicitly enabled', async () => {
    vi.useFakeTimers();
    process.env['PAYMENT_PROOF_CLEANUP_WORKER_ENABLED'] = 'true';
    process.env['PAYMENT_PROOF_CLEANUP_INTERVAL_MS'] = '30000';
    const payments = {
      cleanupStaleProofUploads: vi.fn().mockResolvedValue({
        claimed: 1, committed: 0, cleaned: 1, retried: 0, failed: 0,
      }),
    };
    const worker = new PaymentProofCleanupWorker(payments as any);

    worker.onModuleInit();
    expect(payments.cleanupStaleProofUploads).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(payments.cleanupStaleProofUploads).toHaveBeenCalledOnce();
    worker.onModuleDestroy();
  });

  it('prevents overlapping cleanup cycles', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const payments = { cleanupStaleProofUploads: vi.fn(() => pending) };
    const worker = new PaymentProofCleanupWorker(payments as any);

    const first = (worker as any).poll();
    const second = (worker as any).poll();
    expect(payments.cleanupStaleProofUploads).toHaveBeenCalledOnce();
    release();
    await Promise.all([first, second]);
  });
});
