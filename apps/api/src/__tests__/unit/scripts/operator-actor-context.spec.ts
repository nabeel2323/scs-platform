import { describe, expect, it, vi } from 'vitest';
import { setOperatorActorContext } from '../../../../infra/drizzle/operator-actor-context';

describe('operator database actor context', () => {
  it('sets only the supplied operator principal using transaction-local settings', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };

    await setOperatorActorContext(client as any, 'system', 'seed-cli:unit-test');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("set_config('app.actor_kind', $2, true)"),
      ['seed-cli:unit-test', 'system'],
    );
  });

  it('rejects a blank operator identity before issuing SQL', async () => {
    const client = { query: vi.fn() };

    await expect(setOperatorActorContext(client as any, 'bootstrap', '  ')).rejects.toThrow(
      /actor ID is required/,
    );
    expect(client.query).not.toHaveBeenCalled();
  });
});
