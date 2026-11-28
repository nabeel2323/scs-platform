import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CarrierConfigurationsService } from '../../../modules/shipping/carrier-configurations.service';

const ORG_ID = '00000000-0000-4000-8000-000000000001';
const STORE_ID = '00000000-0000-4000-8000-000000000002';
const CREDENTIAL_ID = '00000000-0000-4000-8000-000000000003';
const CALLER = {
  sub: '00000000-0000-4000-8000-000000000004',
  role: 'SUPER_ADMIN',
  activeOrg: null,
};

function makeDatabase() {
  const credentialFind = vi.fn();
  const storeFind = vi.fn();
  const configurationFind = vi.fn();
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const db = {
    currentActorContext: null as any,
    withActorContext: vi.fn(async (_context: unknown, operation: () => Promise<unknown>) => operation()),
    db: {
      query: {
        carrierCredentials: { findFirst: credentialFind },
        stores: { findFirst: storeFind },
        carrierConfigurations: { findFirst: configurationFind },
      },
      insert,
    },
  };

  return { db, credentialFind, storeFind, configurationFind, insert, insertValues, insertReturning };
}

describe('CarrierConfigurationsService provider binding', () => {
  it('rejects a credential whose provider differs from the requested configuration provider', async () => {
    const mocks = makeDatabase();
    mocks.credentialFind.mockResolvedValue({
      id: CREDENTIAL_ID,
      orgId: ORG_ID,
      providerKey: 'fedex',
      isActive: true,
    });
    const service = new CarrierConfigurationsService(mocks.db as any);

    await expect(service.create({
      orgId: ORG_ID,
      credentialId: CREDENTIAL_ID,
      providerKey: 'aramex',
    }, CALLER)).rejects.toThrow(BadRequestException);

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.storeFind).not.toHaveBeenCalled();
  });

  it('returns no configuration when the provider-specific credential is not active for that provider', async () => {
    const mocks = makeDatabase();
    mocks.storeFind.mockResolvedValue({ id: STORE_ID, orgId: ORG_ID });
    mocks.configurationFind.mockResolvedValue({
      id: 'config-1',
      orgId: ORG_ID,
      storeId: STORE_ID,
      credentialId: CREDENTIAL_ID,
      providerKey: 'aramex',
      isActive: true,
    });
    mocks.credentialFind.mockResolvedValue(null);
    const service = new CarrierConfigurationsService(mocks.db as any);

    await expect(service.resolveForStore(ORG_ID, STORE_ID, 'aramex')).resolves.toBeNull();

    expect(mocks.db.withActorContext).toHaveBeenCalledOnce();
    expect(mocks.storeFind).toHaveBeenCalledOnce();
    expect(mocks.configurationFind).toHaveBeenCalledOnce();
    expect(mocks.credentialFind).toHaveBeenCalledOnce();
  });

  it('resolves the provider-matching active configuration and credential', async () => {
    const mocks = makeDatabase();
    const config = {
      id: 'config-1',
      orgId: ORG_ID,
      storeId: STORE_ID,
      credentialId: CREDENTIAL_ID,
      providerKey: 'aramex',
      isActive: true,
    };
    mocks.storeFind.mockResolvedValue({ id: STORE_ID, orgId: ORG_ID });
    mocks.configurationFind.mockResolvedValue(config);
    mocks.credentialFind.mockResolvedValue({ id: CREDENTIAL_ID, orgId: ORG_ID, providerKey: 'aramex', isActive: true });
    const service = new CarrierConfigurationsService(mocks.db as any);

    await expect(service.resolveForStore(ORG_ID, STORE_ID, 'aramex')).resolves.toEqual(config);
  });

  it('rejects a null-org user context instead of reusing it for tenant configuration access', async () => {
    const mocks = makeDatabase();
    mocks.db.currentActorContext = {
      actorKind: 'user', actorId: 'user-1', actorRole: 'ADMIN', activeOrgId: null,
    };
    const service = new CarrierConfigurationsService(mocks.db as any);

    await expect(service.resolveForStore(ORG_ID, STORE_ID, 'aramex'))
      .rejects.toThrow('worker context bound to the requested organization');
    expect(mocks.storeFind).not.toHaveBeenCalled();
    expect(mocks.db.withActorContext).not.toHaveBeenCalled();
  });

  it('rejects a worker context bound to a different organization', async () => {
    const mocks = makeDatabase();
    mocks.db.currentActorContext = {
      actorKind: 'worker', workerId: 'worker-1', activeOrgId: 'other-org',
    };
    const service = new CarrierConfigurationsService(mocks.db as any);

    await expect(service.resolveForStore(ORG_ID, STORE_ID, 'aramex'))
      .rejects.toThrow('worker context bound to the requested organization');
    expect(mocks.storeFind).not.toHaveBeenCalled();
  });

  it('rejects non-worker actor kinds even when they carry the requested organization', async () => {
    const mocks = makeDatabase();
    mocks.db.currentActorContext = {
      actorKind: 'system', actorId: 'system-1', actorRole: null, activeOrgId: ORG_ID,
    };
    const service = new CarrierConfigurationsService(mocks.db as any);

    await expect(service.resolveForStore(ORG_ID, STORE_ID, 'aramex'))
      .rejects.toThrow('worker context bound to the requested organization');
    expect(mocks.storeFind).not.toHaveBeenCalled();
  });

  it('reuses an existing worker context only when its organization matches exactly', async () => {
    const mocks = makeDatabase();
    mocks.db.currentActorContext = {
      actorKind: 'worker', workerId: 'worker-1', activeOrgId: ORG_ID,
    };
    mocks.storeFind.mockResolvedValue({ id: STORE_ID, orgId: ORG_ID });
    mocks.configurationFind.mockResolvedValue(null);
    const service = new CarrierConfigurationsService(mocks.db as any);

    await expect(service.resolveForStore(ORG_ID, STORE_ID, 'aramex')).resolves.toBeNull();
    expect(mocks.db.withActorContext).not.toHaveBeenCalled();
    expect(mocks.storeFind).toHaveBeenCalledOnce();
  });

});
