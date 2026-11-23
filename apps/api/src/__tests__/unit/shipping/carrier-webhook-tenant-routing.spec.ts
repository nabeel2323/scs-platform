import { describe, expect, it, vi } from 'vitest';
import { CarrierWebhookController } from '../../../modules/shipping/carrier-webhook.controller';

function createHarness(activeCredentials: any[]) {
  const db = {
    db: {
      query: {
        carrierCredentials: {
          findMany: vi.fn().mockResolvedValue(activeCredentials),
          findFirst: vi.fn().mockResolvedValue(activeCredentials[0] ?? null),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    },
  };
  const security = {
    validateBodySize: vi.fn().mockReturnValue({ valid: true }),
    verifySignature: vi.fn().mockReturnValue({
      valid: false,
      reason: 'signature mismatch',
    }),
  };
  const credentials = {
    decryptWebhookSecret: vi.fn().mockResolvedValue('test-webhook-secret'),
  };
  const observability = { incrementCounter: vi.fn() };
  const webhookRouting = { resolveShipmentForCredential: vi.fn() };
  const controller = new CarrierWebhookController(
    db as any,
    security as any,
    credentials as any,
    observability as any,
    webhookRouting as any,
  );
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnValue({ accepted: false }),
  };
  const request = {
    rawBody: JSON.stringify({ tracking_number: 'TRACK-001' }),
    headers: {
      'x-carrier-signature': 'sha256=invalid',
      'x-carrier-timestamp': String(Math.floor(Date.now() / 1000)),
    },
  };
  return { controller, db, security, credentials, webhookRouting, response, request };
}

describe('CarrierWebhookController tenant credential routing', () => {
  it('rejects the legacy provider-only route when multiple active tenant credentials exist', async () => {
    const harness = createHarness([
      { id: 'credential-org-a', orgId: 'org-a' },
      { id: 'credential-org-b', orgId: 'org-b' },
    ]);

    await (harness.controller as any).processWebhook(
      'aramex',
      null,
      harness.request,
      harness.response,
    );

    expect(harness.db.db.query.carrierCredentials.findMany).toHaveBeenCalledOnce();
    expect(harness.db.db.query.carrierCredentials.findFirst).not.toHaveBeenCalled();
    expect(harness.response.status).toHaveBeenCalledWith(401);
    expect(harness.response.json).toHaveBeenCalledWith({
      error: 'A tenant-specific webhook token is required for this provider',
    });
    expect(harness.credentials.decryptWebhookSecret).not.toHaveBeenCalled();
    expect(harness.db.db.insert).not.toHaveBeenCalled();
    expect(harness.webhookRouting.resolveShipmentForCredential).not.toHaveBeenCalled();
  });

  it('keeps the legacy route available when exactly one active credential exists', async () => {
    const harness = createHarness([{ id: 'credential-org-a', orgId: 'org-a' }]);

    await (harness.controller as any).processWebhook(
      'aramex',
      null,
      harness.request,
      harness.response,
    );

    expect(harness.db.db.query.carrierCredentials.findMany).toHaveBeenCalledOnce();
    expect(harness.credentials.decryptWebhookSecret).toHaveBeenCalledWith('credential-org-a');
    expect(harness.response.status).toHaveBeenCalledWith(403);
  });

  it('uses exact provider-and-token lookup for the tenant-specific route', async () => {
    const harness = createHarness([{ id: 'credential-org-a', orgId: 'org-a' }]);

    await (harness.controller as any).processWebhook(
      'aramex',
      'tenant-token-a',
      harness.request,
      harness.response,
    );

    expect(harness.db.db.query.carrierCredentials.findFirst).toHaveBeenCalledOnce();
    expect(harness.db.db.query.carrierCredentials.findMany).not.toHaveBeenCalled();
    expect(harness.credentials.decryptWebhookSecret).toHaveBeenCalledWith('credential-org-a');
    expect(harness.response.status).toHaveBeenCalledWith(403);
  });
});
