import { describe, expect, it, vi } from 'vitest';
import { runCartMutation } from '../lib/cart-actions';

describe('runCartMutation', () => {
  it('refreshes the cart after a successful mutation and clears pending state', async () => {
    const setPendingAction = vi.fn();
    const setError = vi.fn();
    const action = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(
      runCartMutation('remove:item-a', action, refresh, setPendingAction, setError),
    ).resolves.toBe(true);

    expect(action).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
    expect(setPendingAction.mock.calls).toEqual([['remove:item-a'], [null]]);
    expect(setError).toHaveBeenCalledWith('');
  });

  it('surfaces mutation failures and always releases the pending state', async () => {
    const setPendingAction = vi.fn();
    const setError = vi.fn();
    const action = vi.fn().mockRejectedValue(new Error('Inventory changed; refresh the cart'));
    const refresh = vi.fn();

    await expect(
      runCartMutation('quantity:item-a', action, refresh, setPendingAction, setError),
    ).resolves.toBe(false);

    expect(setError).toHaveBeenCalledWith('Inventory changed; refresh the cart');
    expect(refresh).not.toHaveBeenCalled();
    expect(setPendingAction.mock.calls).toEqual([['quantity:item-a'], [null]]);
  });
});
