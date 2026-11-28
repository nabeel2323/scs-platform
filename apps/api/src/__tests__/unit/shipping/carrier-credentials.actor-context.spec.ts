import { describe, expect, it, vi } from 'vitest';
import { CarrierCredentialsService } from '../../../modules/shipping/carrier-credentials.service';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const CREDENTIAL_ID = '00000000-0000-4000-8000-000000000002';

function makeHarness(activeActor: any = null) {
  const findFirst = vi.fn().mockResolvedValue({
    id: CREDENTIAL_ID,
    orgId: ORG_ID,
    isActive: true,
    credentialsEncrypted: 'ciphertext',
    webhookSecretEncrypted: 'webhook-ciphertext',
  });
  const withActorContext = vi.fn(async (_context: unknown, operation: () => Promise<unknown>) => operation());
  const db = {
    currentActorContext: activeActor,
    withActorContext,
    db: { query: { carrierCredentials: { findFirst } } },
  };
  const crypto = { decrypt: vi.fn((value: string) => `plain:${value}`) };
  return { service: new CarrierCredentialsService(db as any, crypto as any), db, findFirst, withActorContext, crypto };
}

describe('CarrierCredentialsService internal actor context', () => {
  it('creates an org-bound worker context when called without an active actor', async () => {
    const h = makeHarness();

    await expect(h.service.decryptCredentials(CREDENTIAL_ID, ORG_ID)).resolves.toBe('plain:ciphertext');
    expect(h.withActorContext).toHaveBeenCalledWith(
      { actorKind: 'worker', workerId: 'carrier-credential-decrypt', activeOrgId: ORG_ID },
      expect.any(Function),
    );
  });

  it('reuses a worker context only when the organization matches exactly', async () => {
    const h = makeHarness({ actorKind: 'worker', workerId: 'carrier-webhook:cred', activeOrgId: ORG_ID });

    await expect(h.service.decryptWebhookSecret(CREDENTIAL_ID, ORG_ID)).resolves.toBe('plain:webhook-ciphertext');
    expect(h.withActorContext).not.toHaveBeenCalled();
  });

  it.each([
    ['null-org user', { actorKind: 'user', actorId: 'user-1', actorRole: 'ADMIN', activeOrgId: null }],
    ['mismatched worker', { actorKind: 'worker', workerId: 'worker-1', activeOrgId: 'other-org' }],
    ['system actor', { actorKind: 'system', actorId: 'system-1', actorRole: null, activeOrgId: ORG_ID }],
    ['anonymous actor', { actorKind: 'anonymous', actorId: null, actorRole: null, activeOrgId: null }],
    ['authentication actor', { actorKind: 'authentication', actorId: null, actorRole: null, activeOrgId: null }],
  ])('rejects %s for internal credential access', async (_label, actor) => {
    const h = makeHarness(actor);

    await expect(h.service.decryptCredentials(CREDENTIAL_ID, ORG_ID))
      .rejects.toThrow('worker context bound to the requested organization');
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.crypto.decrypt).not.toHaveBeenCalled();
  });
});
