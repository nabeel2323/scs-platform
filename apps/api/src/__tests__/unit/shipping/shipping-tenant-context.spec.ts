import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { assertActiveOrgMembership } from '../../../common/tenant-scope';
import { CarrierCredentialsService } from '../../../modules/shipping/carrier-credentials.service';
import { CarrierConfigurationsService } from '../../../modules/shipping/carrier-configurations.service';
import { ShippingService } from '../../../modules/shipping/shipping.service';
import { ShippingCarrierWorker } from '../../../modules/shipping/shipping-carrier.worker';
import { AramexProvider } from '../../../modules/shipping/aramex/aramex.provider';
import { NonRetryableCarrierError } from '../../../modules/shipping/carrier-errors';

const caller = {
  sub: 'merchant-a',
  role: 'MERCHANT_OWNER',
  activeOrg: 'org-a',
};

describe('Shipping and carrier tenant context', () => {
  it('requires a current ACTIVE organization membership', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const db = { db: { query: { organizationMembers: { findFirst } } } };

    await expect(
      assertActiveOrgMembership(db as any, caller, 'org-a'),
    ).rejects.toBeInstanceOf(ForbiddenException);

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

    await expect(
      service.listShippingMethods('store-a', caller),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(methodFindMany).not.toHaveBeenCalled();
  });

  it('denies carrier credential listing when organization membership is inactive', async () => {
    const organizationFindFirst = vi.fn().mockResolvedValue(null);
    const credentialFindMany = vi.fn();
    const service = Object.create(CarrierCredentialsService.prototype) as any;
    service.db = {
      db: {
        query: {
          organizationMembers: { findFirst: organizationFindFirst },
          carrierCredentials: { findMany: credentialFindMany },
        },
      },
    };

    await expect(
      service.listForOrg('org-a', caller),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(credentialFindMany).not.toHaveBeenCalled();
  });

  it('does not resolve carrier configuration for a store outside the supplied organization', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue(null);
    const configFindFirst = vi.fn();
    const service = Object.create(CarrierConfigurationsService.prototype) as any;
    service.db = {
      db: {
        query: {
          stores: { findFirst: storeFindFirst },
          carrierConfigurations: { findFirst: configFindFirst },
        },
      },
    };

    await expect(
      service.resolveForStore('org-a', 'store-b'),
    ).resolves.toBeNull();
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
      db: {
        query: {
          stores: { findFirst: storeFindFirst },
          carrierConfigurations: { findFirst: configFindFirst },
          carrierCredentials: { findFirst: credentialFindFirst },
        },
      },
    };

    await expect(
      service.resolveForStore('org-a', 'store-a'),
    ).resolves.toBeNull();
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
      db: { query: { carrierCredentials: { findFirst: credentialFindFirst } } },
    };
    service.crypto = { decrypt: vi.fn() };

    await expect(
      service.decryptWebhookSecret('credential-a'),
    ).resolves.toBeNull();
    expect(service.crypto.decrypt).not.toHaveBeenCalled();
  });

  it('fails closed instead of falling back to another organization credential', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
    const resolveForStore = vi.fn().mockResolvedValue(null);
    const provider = Object.create(AramexProvider.prototype) as any;
    provider.db = {
      db: { query: { stores: { findFirst: storeFindFirst } } },
    };
    provider.configurations = { resolveForStore };
    provider.credentials = { decryptCredentials: vi.fn() };

    await expect(
      provider.resolveCredentials('store-a'),
    ).rejects.toBeInstanceOf(NonRetryableCarrierError);

    expect(resolveForStore).toHaveBeenCalledWith('org-a', 'store-a');
    expect(provider.credentials.decryptCredentials).not.toHaveBeenCalled();
  });

  it('rejects an Aramex credential whose organization does not match the store', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
    const configFindFirst = vi.fn().mockResolvedValue({ credentialId: 'credential-b' });
    const credentialFindFirst = vi.fn().mockResolvedValue(null);
    const provider = Object.create(AramexProvider.prototype) as any;
    provider.db = {
      db: {
        query: {
          stores: { findFirst: storeFindFirst },
          carrierCredentials: { findFirst: credentialFindFirst },
        },
      },
    };
    provider.configurations = { resolveForStore: configFindFirst };
    provider.credentials = { decryptCredentials: vi.fn() };

    await expect(
      provider.resolveCredentials('store-a'),
    ).rejects.toBeInstanceOf(NonRetryableCarrierError);

    expect(credentialFindFirst).toHaveBeenCalled();
    expect(provider.credentials.decryptCredentials).not.toHaveBeenCalled();
  });

  it('requires store context for Aramex tracking', async () => {
    const provider = Object.create(AramexProvider.prototype) as any;

    await expect(
      provider.getTrackingInfo('AWB-123'),
    ).rejects.toBeInstanceOf(NonRetryableCarrierError);
  });

  it('rejects outbox events whose store metadata does not match their shipment', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
    const worker = Object.create(ShippingCarrierWorker.prototype) as any;
    worker.db = { db: { query: { stores: { findFirst: storeFindFirst } } } };

    await expect(
      worker.assertOutboxTenantMatchesShipment(
        { storeId: 'store-b', organizationId: 'org-a' },
        { id: 'shipment-a', storeId: 'store-a', shippingProviderKey: 'aramex' },
      ),
    ).rejects.toBeInstanceOf(NonRetryableCarrierError);

    expect(storeFindFirst).not.toHaveBeenCalled();
  });

  it('rejects outbox events whose organization metadata does not match the shipment store', async () => {
    const storeFindFirst = vi.fn().mockResolvedValue({ orgId: 'org-a' });
    const worker = Object.create(ShippingCarrierWorker.prototype) as any;
    worker.db = { db: { query: { stores: { findFirst: storeFindFirst } } } };

    await expect(
      worker.assertOutboxTenantMatchesShipment(
        { storeId: 'store-a', organizationId: 'org-b' },
        { id: 'shipment-a', storeId: 'store-a', shippingProviderKey: 'aramex' },
      ),
    ).rejects.toBeInstanceOf(NonRetryableCarrierError);

    expect(storeFindFirst).toHaveBeenCalled();
  });
});
