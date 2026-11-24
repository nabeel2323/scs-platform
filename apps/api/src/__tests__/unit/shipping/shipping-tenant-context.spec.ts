import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { assertActiveOrgMembership } from '../../../common/tenant-scope';
import { IdentityService } from '../../../modules/identity/index';
import { MerchantService } from '../../../modules/merchant/index';
import { CarrierCredentialsService } from '../../../modules/shipping/carrier-credentials.service';
import { CarrierConfigurationsService } from '../../../modules/shipping/carrier-configurations.service';
import { ShippingService } from '../../../modules/shipping/shipping.service';
import { ShippingCarrierWorker } from '../../../modules/shipping/shipping-carrier.worker';
import { AramexProvider } from '../../../modules/shipping/aramex/aramex.provider';
import { NonRetryableCarrierError } from '../../../modules/shipping/carrier-errors';

const runActorContext = vi.fn(async (_context: any, operation: () => Promise<unknown>) => operation());

const caller = {
  sub: 'merchant-a',
  role: 'MERCHANT_OWNER',
  activeOrg: 'org-a',
};

describe('Shipping and carrier tenant context', () => {
  it('requires a current ACTIVE organization membership', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { db: { query: { organizationMembers: { findFirst } } } };

    await expect(assertActiveOrgMembership(db as any, caller, 'org-a')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const compiled = new PgDialect().sqlToQuery(findFirst.mock.calls[0]?.[0].where);
    expect(compiled.params).toContain('ACTIVE');
    expect(compiled.params).toContain('merchant-a');
  });

  it('denies shipping method reads when organization membership is inactive', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
    const organizationFindFirst = vi.fn().mockResolvedValue(null);
    const methodFindMany = vi.fn();
    const service = Object.create(ShippingService.prototype) as any;
    service.db = {
      db: {
        query: {
          stores: { findFirst: storeFindFirst },
          organizationMembers: { findFirst: organizationFindFirst },
          shippingMethods: { findMany: methodFindMany },
        },
      },
    };

    await expect(service.listShippingMethods('store-a', caller)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(methodFindMany).not.toHaveBeenCalled();
  });

  it('denies carrier credential listing when organization membership is inactive', async () => {
    const organizationFindFirst = vi.fn().mockResolvedValue(null);
    const credentialFindMany = vi.fn();
    const service = Object.create(CarrierCredentialsService.prototype) as any;
    service.db = {
      currentActorContext: null,
      withActorContext: runActorContext,
      db: {
        query: {
          organizationMembers: { findFirst: organizationFindFirst },
          carrierCredentials: { findMany: credentialFindMany },
        },
      },
    };

    await expect(service.listForOrg('org-a', caller)).rejects.toBeInstanceOf(ForbiddenException);
    expect(credentialFindMany).not.toHaveBeenCalled();
  });

  it('binds carrier credential CRUD to the verified caller actor', async () => {
    const organizationFindFirst = vi.fn().mockResolvedValue({
      userId: caller.sub,
      orgId: caller.activeOrg,
      status: 'ACTIVE',
    });
    const credentialFindMany = vi.fn().mockResolvedValue([]);
    const scoped = vi.fn(async (_context: any, operation: () => Promise<unknown>) => operation());
    const service = Object.create(CarrierCredentialsService.prototype) as any;
    service.db = {
      currentActorContext: null,
      withActorContext: scoped,
      db: {
        query: {
          organizationMembers: { findFirst: organizationFindFirst },
          carrierCredentials: { findMany: credentialFindMany },
        },
      },
    };

    await expect(service.listForOrg('org-a', caller)).resolves.toEqual([]);
    expect(scoped).toHaveBeenCalledWith(
      {
        actorKind: 'user',
        actorId: 'merchant-a',
        actorRole: 'MERCHANT_OWNER',
        activeOrgId: 'org-a',
      },
      expect.any(Function),
    );
    expect(credentialFindMany).toHaveBeenCalledOnce();
  });

  it('does not resolve carrier configuration for a store outside the supplied organization', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue(null);
    const configFindFirst = vi.fn();
    const service = Object.create(CarrierConfigurationsService.prototype) as any;
    service.db = {
      currentActorContext: null,
      withActorContext: runActorContext,
      db: {
        query: {
          stores: { findFirst: storeFindFirst },
          carrierConfigurations: { findFirst: configFindFirst },
        },
      },
    };

    await expect(service.resolveForStore('org-a', 'store-b')).resolves.toBeNull();
    expect(configFindFirst).not.toHaveBeenCalled();
  });

  it('rejects a carrier configuration linked to another organization credential', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue({ id: 'store-a' });
    const configFindFirst = vi.fn().mockResolvedValue({
      credentialId: 'credential-b',
      storeId: 'store-a',
      orgId: 'org-a',
    });
    const credentialFindFirst = vi.fn().mockResolvedValue(null);
    const service = Object.create(CarrierConfigurationsService.prototype) as any;
    service.db = {
      currentActorContext: null,
      withActorContext: runActorContext,
      db: {
        query: {
          stores: { findFirst: storeFindFirst },
          carrierConfigurations: { findFirst: configFindFirst },
          carrierCredentials: { findFirst: credentialFindFirst },
        },
      },
    };

    await expect(service.resolveForStore('org-a', 'store-a')).resolves.toBeNull();
    expect(credentialFindFirst).toHaveBeenCalled();
  });

  it('does not return a webhook secret for a deactivated credential', async () => {
    const credentialFindFirst = vi.fn().mockResolvedValue({
      id: 'credential-a',
      isActive: false,
      webhookSecretEncrypted: 'ciphertext',
    });
    const service = Object.create(CarrierCredentialsService.prototype) as any;
    service.db = {
      currentActorContext: null,
      withActorContext: runActorContext,
      db: { query: { carrierCredentials: { findFirst: credentialFindFirst } } },
    };
    service.crypto = { decrypt: vi.fn() };

    await expect(service.decryptWebhookSecret('credential-a', 'org-a')).resolves.toBeNull();
    expect(service.crypto.decrypt).not.toHaveBeenCalled();
  });

  it('fails closed instead of falling back to another organization credential', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
    const resolveForStore = vi.fn().mockResolvedValue(null);
    const provider = Object.create(AramexProvider.prototype) as any;
    provider.db = {
      currentActorContext: null,
      withActorContext: runActorContext,
      db: { query: { stores: { findFirst: storeFindFirst } } },
    };
    provider.configurations = { resolveForStore };
    provider.credentials = { decryptCredentials: vi.fn() };

    await expect(provider.resolveCredentials('store-a')).rejects.toBeInstanceOf(
      NonRetryableCarrierError,
    );

    expect(resolveForStore).toHaveBeenCalledWith('org-a', 'store-a');
    expect(provider.credentials.decryptCredentials).not.toHaveBeenCalled();
  });

  it('resolves the PLATFORM organization through the Identity module contract', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'platform-org' });
    const service = Object.create(IdentityService.prototype) as any;
    service.db = { db: { query: { organizations: { findFirst } } } };

    await expect(service.getPlatformOrganizationId()).resolves.toBe('platform-org');
    expect(new PgDialect().sqlToQuery(findFirst.mock.calls[0]?.[0].where).params).toContain(
      'PLATFORM',
    );
  });

  it('keeps Aramex platform credentials constrained to the Identity-owned organization', async () => {
    const credentialFindFirst = vi.fn().mockResolvedValue({ id: 'platform-credential' });
    const resolved = { payload: { userName: 'synthetic' }, primaryUrl: null };
    const provider = Object.create(AramexProvider.prototype) as any;
    provider.identity = { getPlatformOrganizationId: vi.fn().mockResolvedValue('platform-org') };
    provider.db = { currentActorContext: null, withActorContext: runActorContext, db: { query: { carrierCredentials: { findFirst: credentialFindFirst } } } };
    provider.resolveCredentialsById = vi.fn().mockResolvedValue(resolved);

    await expect(provider.resolvePlatformCredential()).resolves.toEqual(resolved);
    expect(provider.identity.getPlatformOrganizationId).toHaveBeenCalledOnce();

    const params = new PgDialect().sqlToQuery(credentialFindFirst.mock.calls[0]?.[0].where).params;
    expect(params).toContain('platform-org');
    expect(params).toContain('aramex');
    expect(params).toContain(true);
    expect(provider.resolveCredentialsById).toHaveBeenCalledWith(
      'platform-credential',
      'platform-org',
    );
  });

  it('resolves system store ownership through Merchant module contracts', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 'store-a', orgId: 'org-a' });
    const findMany = vi.fn().mockResolvedValue([{ id: 'store-a' }, { id: 'store-b' }]);
    const service = Object.create(MerchantService.prototype) as any;
    service.db = { db: { query: { stores: { findFirst, findMany } } } };

    await expect(service.getStoreTenantContextForSystem('store-a')).resolves.toEqual({
      id: 'store-a',
      orgId: 'org-a',
    });
    await expect(service.listStoreIdsForOrgSystem('org-a')).resolves.toEqual([
      'store-a',
      'store-b',
    ]);

    expect(findFirst).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledOnce();
    expect(new PgDialect().sqlToQuery(findFirst.mock.calls[0]?.[0].where).params).toContain(
      'store-a',
    );
    expect(new PgDialect().sqlToQuery(findMany.mock.calls[0]?.[0].where).params).toContain(
      'org-a',
    );
  });

  it('rejects an Aramex credential whose organization does not match the store', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
    const configFindFirst = vi.fn().mockResolvedValue({ credentialId: 'credential-b' });
    const credentialFindFirst = vi.fn().mockResolvedValue(null);
    const provider = Object.create(AramexProvider.prototype) as any;
    provider.db = {
      currentActorContext: null,
      withActorContext: runActorContext,
      db: {
        query: {
          stores: { findFirst: storeFindFirst },
          carrierCredentials: { findFirst: credentialFindFirst },
        },
      },
    };
    provider.configurations = { resolveForStore: configFindFirst };
    provider.credentials = { decryptCredentials: vi.fn() };

    await expect(provider.resolveCredentials('store-a')).rejects.toBeInstanceOf(
      NonRetryableCarrierError,
    );

    expect(credentialFindFirst).toHaveBeenCalled();
    expect(provider.credentials.decryptCredentials).not.toHaveBeenCalled();
  });

  it('requires store context for Aramex tracking', async () => {
    const provider = Object.create(AramexProvider.prototype) as any;

    await expect(provider.getTrackingInfo('AWB-123')).rejects.toBeInstanceOf(
      NonRetryableCarrierError,
    );
  });

  it('rejects outbox events whose store metadata does not match their shipment', async () => {
    const storeTenantContext = vi.fn().mockResolvedValue({ id: 'store-a', orgId: 'org-a' });
    const worker = Object.create(ShippingCarrierWorker.prototype) as any;
    worker.merchant = { getStoreTenantContextForSystem: storeTenantContext };

    await expect(
      worker.assertOutboxTenantMatchesShipment(
        { storeId: 'store-b', organizationId: 'org-a' },
        { id: 'shipment-a', storeId: 'store-a', shippingProviderKey: 'aramex' },
      ),
    ).rejects.toBeInstanceOf(NonRetryableCarrierError);

    expect(storeTenantContext).not.toHaveBeenCalled();
  });

  it('rejects outbox events whose organization metadata does not match the shipment store', async () => {
    const storeTenantContext = vi.fn().mockResolvedValue({ id: 'store-a', orgId: 'org-a' });
    const worker = Object.create(ShippingCarrierWorker.prototype) as any;
    worker.merchant = { getStoreTenantContextForSystem: storeTenantContext };

    await expect(
      worker.assertOutboxTenantMatchesShipment(
        { storeId: 'store-a', organizationId: 'org-b' },
        { id: 'shipment-a', storeId: 'store-a', shippingProviderKey: 'aramex' },
      ),
    ).rejects.toBeInstanceOf(NonRetryableCarrierError);

    expect(storeTenantContext).toHaveBeenCalledWith('store-a');
  });
});
