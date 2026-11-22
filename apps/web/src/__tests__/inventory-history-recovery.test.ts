import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchInventoryMovements } = vi.hoisted(() => ({
  fetchInventoryMovements: vi.fn(),
}));

vi.mock('../lib/buyer-api', () => ({
  fetchInventoryMovements: (...args: unknown[]) => fetchInventoryMovements(...args),
}));

import { readInventoryHistory } from '../lib/inventory-history';

describe('inventory history read recovery', () => {
  beforeEach(() => fetchInventoryMovements.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('returns movements after a successful read', async () => {
    const movements = [{ id: 'movement-1', quantityDelta: 4 }];
    fetchInventoryMovements.mockResolvedValueOnce(movements);

    await expect(readInventoryHistory('inventory-1')).resolves.toEqual({
      movements,
      error: '',
    });
  });

  it('returns an explicit error instead of an empty-history success after failure', async () => {
    fetchInventoryMovements.mockRejectedValueOnce(new Error('Movement history unavailable'));

    await expect(readInventoryHistory('inventory-1')).resolves.toEqual({
      movements: [],
      error: 'Movement history unavailable',
    });
  });
});
