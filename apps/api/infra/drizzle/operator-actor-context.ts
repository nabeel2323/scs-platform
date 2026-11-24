import type { PoolClient } from 'pg';

export type OperatorActorKind = 'system' | 'bootstrap' | 'audit';

/**
 * Set an application operator principal on an already-open transaction.
 * The third set_config argument is true so all values are cleared at transaction
 * end and cannot leak when the PostgreSQL connection is returned to its pool.
 */
export async function setOperatorActorContext(
  client: Pick<PoolClient, 'query'>,
  actorKind: OperatorActorKind,
  actorId: string,
): Promise<void> {
  const normalizedActorId = actorId.trim();
  if (!normalizedActorId) throw new Error('Operator actor ID is required');

  await client.query(
    `SELECT
      set_config('app.actor_id', $1, true),
      set_config('app.actor_role', '', true),
      set_config('app.active_org_id', '', true),
      set_config('app.actor_kind', $2, true),
      set_config('app.worker_id', '', true),
      set_config('app.auth_operation', '', true)`,
    [normalizedActorId, actorKind],
  );
}
