import { ForbiddenException } from '@nestjs/common';

export interface CarrierTenantActorContext {
  actorKind: string;
  activeOrgId: string | null;
}

/**
 * Internal carrier reads must run as an explicitly trusted actor bound to the
 * exact organization being accessed. A missing context is handled by the
 * caller opening a dedicated worker transaction for that organization.
 *
 * Platform-system work is permitted only when it names the exact organization;
 * unscoped system, bootstrap, audit, anonymous and authentication contexts are
 * not credential/configuration principals.
 */
export function assertCarrierTenantActorContext(
  active: CarrierTenantActorContext | null,
  orgId: string,
  resource: string,
): void {
  if (!active) return;

  const trustedActor =
    active.actorKind === 'user' ||
    active.actorKind === 'worker' ||
    active.actorKind === 'system';

  if (!trustedActor || active.activeOrgId !== orgId) {
    throw new ForbiddenException(
      `${resource} requires a trusted actor context bound to the requested organization`,
    );
  }
}
