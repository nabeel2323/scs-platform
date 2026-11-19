import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShippingCarrierWorker } from '../../modules/shipping/shipping-carrier.worker';
import { carrierEndpointAllowlistRegistry } from '../../modules/shipping/ssrf-protection';

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const PDF = Buffer.from('%PDF-1.7\nsynthetic label\n%%EOF');

function makeWorker(options: {
  existingLabel?: unknown;
  validation?: { valid: true; hostname: string; port: number } | { valid: false; reason: string };
} = {}) {
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const findShipment = vi.fn().mockResolvedValue({
    id: 'shipment-1',
    storeId: 'store-1',
    carrierShipmentId: 'waybill-1',
    shippingProviderKey: 'aramex',
  });
  const findLabel = vi.fn().mockResolvedValue(options.existingLabel ?? null);
  const provider = {
    capabilities: { canGenerateLabel: true },
    generateLabel: vi.fn().mockResolvedValue({
      supported: true,
      labelData: 'https://ws.dev.aramex.net/labels/temporary.pdf',
      labelFormat: 'PDF',
    }),
  };
  const storage = { putObject: vi.fn().mockResolvedValue({ bucket: 'scs-uploads', key: 'label-key' }) };
  const worker = Object.create(ShippingCarrierWorker.prototype) as any;
  worker.db = {
    db: {
      query: {
        shipments: { findFirst: findShipment },
        shipmentLabels: { findFirst: findLabel },
      },
      insert: () => ({ values: insertValues }),
    },
  };
  worker.registry = { findProvider: vi.fn().mockReturnValue(provider) };
  worker.storage = storage;
  worker.logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const validationSpy = vi.spyOn(carrierEndpointAllowlistRegistry, 'validateForProvider')
    .mockResolvedValue(options.validation ?? {
      valid: true,
      hostname: 'ws.dev.aramex.net',
      port: 443,
    });
  return { worker, provider, storage, insertValues, findShipment, findLabel, validationSpy };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('ShippingCarrierWorker label persistence (G-010)', () => {
  it('downloads a validated PDF, stores it idempotently, and persists label metadata', async () => {
    const { worker, provider, storage, insertValues, validationSpy } = makeWorker();
    const fetchMock = vi.fn().mockResolvedValue(new Response(PDF, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await worker.handleLabel({ id: EVENT_ID, aggregateId: 'shipment-1' });

    expect(validationSpy).toHaveBeenCalledWith(
      'https://ws.dev.aramex.net/labels/temporary.pdf',
      'aramex',
      true,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(storage.putObject).toHaveBeenCalledWith(expect.objectContaining({
      bucket: 'scs-uploads',
      key: `shipping-labels/shipment-1/${EVENT_ID}.pdf`,
      contentType: 'application/pdf',
      body: PDF,
    }));
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({
      id: EVENT_ID,
      shipmentId: 'shipment-1',
      labelNumber: 'waybill-1',
      storageKey: `shipping-labels/shipment-1/${EVENT_ID}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
      providerKey: 'aramex',
      labelType: 'SHIPPING',
    }));
    expect(provider.generateLabel).toHaveBeenCalledWith('shipment-1');
  });

  it('fails closed when the provider label URL does not pass SSRF validation', async () => {
    const { worker, storage } = makeWorker({ validation: { valid: false, reason: 'host not allowed' } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(worker.handleLabel({ id: EVENT_ID, aggregateId: 'shipment-1' }))
      .rejects.toThrow('SSRF validation');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('does not redownload or insert a label after the same outbox event already persisted', async () => {
    const { worker, provider, storage, insertValues } = makeWorker({ existingLabel: { id: EVENT_ID } });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await worker.handleLabel({ id: EVENT_ID, aggregateId: 'shipment-1' });

    expect(provider.generateLabel).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('rejects non-PDF payloads without persisting an object', async () => {
    const { worker, storage } = makeWorker();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not a pdf', {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })));

    await expect(worker.handleLabel({ id: EVENT_ID, aggregateId: 'shipment-1' }))
      .rejects.toThrow('PDF signature');
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('classifies HTTP 5xx responses as retryable without persisting a label', async () => {
    const { worker, storage, insertValues } = makeWorker();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('temporary outage', {
      status: 503,
    })));

    await expect(worker.handleLabel({ id: EVENT_ID, aggregateId: 'shipment-1' }))
      .rejects.toMatchObject({ retryable: true, operation: 'downloadLabel' });
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('classifies HTTP 4xx responses as terminal without persisting a label', async () => {
    const { worker, storage, insertValues } = makeWorker();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not found', {
      status: 404,
    })));

    await expect(worker.handleLabel({ id: EVENT_ID, aggregateId: 'shipment-1' }))
      .rejects.toMatchObject({ retryable: false, operation: 'downloadLabel' });
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it('classifies download timeouts as retryable and aborts the request', async () => {
    vi.useFakeTimers();
    const { worker, storage, insertValues } = makeWorker();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = worker.handleLabel({ id: EVENT_ID, aggregateId: 'shipment-1' });
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(pending).rejects.toMatchObject({
      retryable: true,
      operation: 'downloadLabel',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(storage.putObject).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });
});


describe('ShippingCarrierWorker label persistence failures', () => {
  it('classifies object-storage failures as retryable and does not insert metadata', async () => {
    const { worker, storage, insertValues } = makeWorker();
    storage.putObject.mockRejectedValue(new Error('synthetic S3 failure'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(PDF, {
      status: 200,
      headers: { 'content-type': 'application/pdf' },
    })));

    await expect(worker.handleLabel({ id: EVENT_ID, aggregateId: 'shipment-1' }))
      .rejects.toMatchObject({ retryable: true, operation: 'persistLabel' });
    expect(insertValues).not.toHaveBeenCalled();
  });
});
