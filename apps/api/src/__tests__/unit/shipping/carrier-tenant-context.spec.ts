import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { assertCarrierTenantActorContext } from '../../../modules/shipping/carrier-tenant-context';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

describe('carrier tenant actor context', () => {
  it('allows a fresh operation to establish its own worker transaction', () => {
    expect(() => assertCarrierTenantActorContext(null, ORG_A, 'carrier credential access')).not.toThrow();
  });

  it.each(['user', 'worker', 'system'])('allows %s actors bound to the exact organization', (actorKind) => {
    expect(() => assertCarrierTenantActorContext(
      { actorKind, activeOrgId: ORG_A },
      ORG_A,
      'carrier credential access',
    )).not.toThrow();
  });

  it.each(['user', 'worker', 'system'])('rejects %s actors bound to a different organization', (actorKind) => {
    expect(() => assertCarrierTenantActorContext(
      { actorKind, activeOrgId: ORG_B },
      ORG_A,
      'carrier credential access',
    )).toThrow(ForbiddenException);
  });

  it.each(['user', 'worker', 'system'])('rejects unscoped %s actors for tenant access', (actorKind) => {
    expect(() => assertCarrierTenantActorContext(
      { actorKind, activeOrgId: null },
      ORG_A,
      'carrier credential access',
    )).toThrow(ForbiddenException);
  });

  it.each(['anonymous', 'authentication', 'bootstrap', 'audit'])('rejects %s actors', (actorKind) => {
    expect(() => assertCarrierTenantActorContext(
      { actorKind, activeOrgId: ORG_A },
      ORG_A,
      'carrier credential access',
    )).toThrow(ForbiddenException);
  });
});
