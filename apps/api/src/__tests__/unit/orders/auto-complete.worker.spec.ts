import { describe, expect, it, vi } from 'vitest';
import { AutoCompleteWorker } from '../../../modules/orders/auto-complete.worker';

describe('AutoCompleteWorker durable claims', () => {
  it('claims due orders and passes its unique owner into canonical completion', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'order-1' }] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const completeOrder = vi.fn().mockResolvedValue(undefined);
    const worker = new AutoCompleteWorker({ db: { execute } } as any, { completeOrder } as any);
    await (worker as any).poll();
    expect(execute).toHaveBeenCalledTimes(3);
    expect(completeOrder).toHaveBeenCalledWith('order-1', 'system', 'SYSTEM', 'AUTO_COMPLETION', expect.stringMatching(/^auto-complete-/));
  });
  it('releases its own claim even when completion fails', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ rows: [{ id: 'order-2' }] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    const completeOrder = vi.fn().mockRejectedValue(new Error('temporary failure'));
    const worker = new AutoCompleteWorker({ db: { execute } } as any, { completeOrder } as any);
    await (worker as any).poll();
    expect(execute).toHaveBeenCalledTimes(3);
    expect(completeOrder).toHaveBeenCalledTimes(1);
  });
});
