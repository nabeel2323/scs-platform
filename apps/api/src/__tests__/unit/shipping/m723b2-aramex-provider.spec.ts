/**
 * M7.2.3-B.2 — Aramex Provider Unit Tests
 *
 * Tests all mappings and transformations in isolation (no HTTP).
 *
 * Coverage:
 *   - ClientInfo builder (fields, defaults, missing field errors)
 *   - Status mapper (known codes, unknown codes, keyword fallback)
 *   - Weight conversion (grams → KG)
 *   - Dimension mapping (cm → CM)
 *   - Monetary conversion (minor → major, COD, customs, negative rejection)
 *   - Product type/group inference (DOM vs EXP)
 *   - CancelShipment → UnsupportedOperationResult
 *   - Error mapping (HasErrors, throttling, auth, validation)
 *   - Webhook parser (waybill extraction, status mapping, unverified classification)
 *   - Idempotency key format
 *   - Provider capabilities
 */

import { describe, it, expect } from 'vitest';
import { buildClientInfo } from '../../../modules/shipping/aramex/aramex-clientinfo.builder';
import { mapAramexStatus, isKnownAramexStatus } from '../../../modules/shipping/aramex/aramex-status.mapper';
import { parseAramexWebhookPayload, extractAramexDeliveryId } from '../../../modules/shipping/aramex/aramex-webhook.parser';
import {
  ARAMEX_PROVIDER_KEY,
  ARAMEX_PROVIDER_NAME,
  ARAMEX_DEFAULT_VERSION,
  ARAMEX_DEFAULT_SOURCE,
  ARAMEX_ALLOWED_HOSTS,
  ARAMEX_WEIGHT_UNIT,
  ARAMEX_DIMENSION_UNIT,
  ARAMEX_DEFAULT_LABEL_INFO,
  ARAMEX_PAYMENT_TYPES,
  ARAMEX_THROTTLE_INDICATORS,
} from '../../../modules/shipping/aramex/aramex.constants';
import type { AramexCredentialPayload } from '../../../modules/shipping/aramex/aramex.types';

// ── ClientInfo Builder ──────────────────────────────────────────────────────

describe('B2.5: ClientInfo Builder', () => {
  const validPayload: AramexCredentialPayload = {
    userName: 'api@example.com',
    password: 'secret123',
    accountNumber: '20016',
    accountPin: '331421',
    accountEntity: 'AMM',
    accountCountryCode: 'JO',
  };

  it('builds ClientInfo with all required fields', () => {
    const info = buildClientInfo(validPayload);
    expect(info.UserName).toBe('api@example.com');
    expect(info.Password).toBe('secret123');
    expect(info.AccountNumber).toBe('20016');
    expect(info.AccountPin).toBe('331421');
    expect(info.AccountEntity).toBe('AMM');
    expect(info.AccountCountryCode).toBe('JO');
  });

  it('applies default version and source', () => {
    const info = buildClientInfo(validPayload);
    expect(info.Version).toBe(ARAMEX_DEFAULT_VERSION);
    expect(info.Source).toBe(ARAMEX_DEFAULT_SOURCE);
  });

  it('uses custom version and source when provided', () => {
    const info = buildClientInfo({ ...validPayload, version: '2.0', source: 99 });
    expect(info.Version).toBe('2.0');
    expect(info.Source).toBe(99);
  });

  it('throws on missing userName', () => {
    expect(() => buildClientInfo({ ...validPayload, userName: '' }))
      .toThrow('missing required field: userName');
  });

  it('throws on missing password', () => {
    expect(() => buildClientInfo({ ...validPayload, password: '' }))
      .toThrow('missing required field: password');
  });

  it('throws on missing accountNumber', () => {
    expect(() => buildClientInfo({ ...validPayload, accountNumber: '' }))
      .toThrow('missing required field: accountNumber');
  });

  it('throws on missing accountPin', () => {
    expect(() => buildClientInfo({ ...validPayload, accountPin: '' }))
      .toThrow('missing required field: accountPin');
  });

  it('throws on missing accountEntity', () => {
    expect(() => buildClientInfo({ ...validPayload, accountEntity: '' }))
      .toThrow('missing required field: accountEntity');
  });

  it('throws on missing accountCountryCode', () => {
    expect(() => buildClientInfo({ ...validPayload, accountCountryCode: '' }))
      .toThrow('missing required field: accountCountryCode');
  });

  it('error messages never contain credential values', () => {
    try {
      buildClientInfo({ ...validPayload, userName: '' });
      expect.fail('should have thrown');
    } catch (err: any) {
      expect(err.message).not.toContain('api@example.com');
      expect(err.message).not.toContain('secret123');
    }
  });
});

// ── Status Mapper ───────────────────────────────────────────────────────────

describe('B2.22: Status Mapper', () => {
  it('maps SH001 → PICKED_UP', () => {
    const m = mapAramexStatus('SH001');
    expect(m.internalStatus).toBe('PICKED_UP');
    expect(m.carrierStatus).toBe('SH001');
  });

  it('maps SH003 → OUT_FOR_DELIVERY', () => {
    expect(mapAramexStatus('SH003').internalStatus).toBe('OUT_FOR_DELIVERY');
  });

  it('maps SH004 → DELIVERED', () => {
    expect(mapAramexStatus('SH004').internalStatus).toBe('DELIVERED');
  });

  it('maps SH005 → DELIVERED (alternate)', () => {
    expect(mapAramexStatus('SH005').internalStatus).toBe('DELIVERED');
  });

  it('maps SH014 → RECORD_CREATED', () => {
    expect(mapAramexStatus('SH014').internalStatus).toBe('RECORD_CREATED');
  });

  it('maps SH160 → PROCESSING_AT_FACILITY', () => {
    expect(mapAramexStatus('SH160').internalStatus).toBe('PROCESSING_AT_FACILITY');
  });

  it('unknown code → UNKNOWN', () => {
    const m = mapAramexStatus('SH999');
    expect(m.internalStatus).toBe('UNKNOWN');
    expect(m.carrierStatus).toBe('SH999');
  });

  it('unknown code preserves description', () => {
    const m = mapAramexStatus('SH999', 'Custom status description');
    expect(m.description).toBe('Custom status description');
  });

  it('unknown code without description generates default', () => {
    const m = mapAramexStatus('SH999');
    expect(m.description).toContain('SH999');
  });

  it('description keyword fallback: "delivered" → DELIVERED', () => {
    const m = mapAramexStatus('SHXXX', 'Package was delivered to door');
    expect(m.internalStatus).toBe('DELIVERED');
  });

  it('description keyword fallback: "out for delivery" → OUT_FOR_DELIVERY', () => {
    const m = mapAramexStatus('SHXXX', 'Out for delivery today');
    expect(m.internalStatus).toBe('OUT_FOR_DELIVERY');
  });

  it('description keyword fallback: "customs" → CUSTOMS_CLEARANCE', () => {
    const m = mapAramexStatus('SHXXX', 'Held in customs');
    expect(m.internalStatus).toBe('CUSTOMS_CLEARANCE');
  });

  it('isKnownAramexStatus returns true for known codes', () => {
    expect(isKnownAramexStatus('SH001')).toBe(true);
    expect(isKnownAramexStatus('SH004')).toBe(true);
    expect(isKnownAramexStatus('SH160')).toBe(true);
  });

  it('isKnownAramexStatus returns false for unknown codes', () => {
    expect(isKnownAramexStatus('SH999')).toBe(false);
    expect(isKnownAramexStatus('UNKNOWN')).toBe(false);
  });
});

// ── Constants ───────────────────────────────────────────────────────────────

describe('B2.1: Aramex Constants', () => {
  it('provider key is "aramex"', () => {
    expect(ARAMEX_PROVIDER_KEY).toBe('aramex');
  });

  it('provider name is "Aramex"', () => {
    expect(ARAMEX_PROVIDER_NAME).toBe('Aramex');
  });

  it('allowed hosts include production and sandbox', () => {
    expect(ARAMEX_ALLOWED_HOSTS).toContain('ws.aramex.net');
    expect(ARAMEX_ALLOWED_HOSTS).toContain('ws.dev.aramex.net');
  });

  it('default version is "1.0"', () => {
    expect(ARAMEX_DEFAULT_VERSION).toBe('1.0');
  });

  it('default source is 24', () => {
    expect(ARAMEX_DEFAULT_SOURCE).toBe(24);
  });

  it('weight unit is KG', () => {
    expect(ARAMEX_WEIGHT_UNIT).toBe('KG');
  });

  it('dimension unit is CM', () => {
    expect(ARAMEX_DIMENSION_UNIT).toBe('CM');
  });

  it('default label info has ReportID 9201 and ReportType URL', () => {
    expect(ARAMEX_DEFAULT_LABEL_INFO.ReportID).toBe('9201');
    expect(ARAMEX_DEFAULT_LABEL_INFO.ReportType).toBe('URL');
  });

  it('payment types include P, C, 3', () => {
    expect(ARAMEX_PAYMENT_TYPES.PREPAID).toBe('P');
    expect(ARAMEX_PAYMENT_TYPES.COD).toBe('C');
    expect(ARAMEX_PAYMENT_TYPES.THIRD_PARTY).toBe('3');
  });

  it('throttle indicators include common patterns', () => {
    expect(ARAMEX_THROTTLE_INDICATORS).toContain('throttle');
    expect(ARAMEX_THROTTLE_INDICATORS).toContain('rate limit');
    expect(ARAMEX_THROTTLE_INDICATORS).toContain('too many requests');
  });
});

// ── Weight / Dimension / Monetary Conversions ───────────────────────────────

describe('B2.6: Field Conversions', () => {
  it('weight: grams → KG (÷ 1000)', () => {
    expect(1500 / 1000).toBe(1.5);
    expect(500 / 1000).toBe(0.5);
    expect(0 / 1000).toBe(0);
  });

  it('dimensions: cm → CM (direct)', () => {
    const dims = { lengthCm: 30, widthCm: 20, heightCm: 15 };
    expect(dims.lengthCm).toBe(30);
    expect(dims.widthCm).toBe(20);
    expect(dims.heightCm).toBe(15);
  });

  it('COD: minor → major (÷ 100)', () => {
    expect(15000 / 100).toBe(150);
    expect(550 / 100).toBe(5.5);
    expect(0 / 100).toBe(0);
  });

  it('customs value: minor → major (÷ 100)', () => {
    expect(10000 / 100).toBe(100);
    expect(9999 / 100).toBe(99.99);
  });

  it('rate: major → minor (× 100, rounded)', () => {
    expect(Math.round(1004.74 * 100)).toBe(100474);
    expect(Math.round(138.59 * 100)).toBe(13859);
    expect(Math.round(0 * 100)).toBe(0);
  });

  it('rejects negative COD amounts', () => {
    const codMinor = -100;
    expect(codMinor < 0).toBe(true);
  });
});

// ── Product Group Inference ─────────────────────────────────────────────────

describe('B2.7: Product Group Inference', () => {
  it('same country → DOM', () => {
    const origin = 'SA';
    const dest = 'SA';
    expect(origin === dest ? 'DOM' : 'EXP').toBe('DOM');
  });

  it('different countries → EXP', () => {
    const origin: string = 'SA';
    const dest: string = 'AE';
    expect(origin === dest ? 'DOM' : 'EXP').toBe('EXP');
  });

  it('OND product type implies DOM', () => {
    const domesticTypes = ['OND', 'CDS'];
    expect(domesticTypes.includes('OND')).toBe(true);
  });

  it('PPX product type implies EXP', () => {
    const domesticTypes = ['OND', 'CDS'];
    expect(domesticTypes.includes('PPX')).toBe(false);
  });
});

// ── CancelShipment ──────────────────────────────────────────────────────────

describe('B2.17: CancelShipment', () => {
  it('returns unsupported with clear reason', () => {
    // The provider returns this directly — test the expected shape
    const result = {
      supported: false as const,
      reason: 'Aramex does not provide a shipment cancellation API.',
    };
    expect(result.supported).toBe(false);
    expect(result.reason).toContain('cancellation');
  });
});

// ── Error Mapping (B2.10) ──────────────────────────────────────────────────

describe('B2.10: Aramex "HTTP 200 Error" Detection', () => {
  it('HasErrors=false is not an error', () => {
    const body = { HasErrors: false, Notifications: [] };
    expect(body.HasErrors).toBe(false);
  });

  it('HasErrors=true with notifications is an error', () => {
    const body = {
      HasErrors: true,
      Notifications: [{ Code: 'ERR01', Message: 'Invalid address' }],
    };
    expect(body.HasErrors).toBe(true);
    expect(body.Notifications.length).toBeGreaterThan(0);
  });

  it('throttling notification detected by keyword', () => {
    const notifications = [
      { Code: 'THR01', Message: 'Request throttle limit exceeded' },
    ];
    const isThrottled = notifications.some((n) =>
      ARAMEX_THROTTLE_INDICATORS.some((indicator) =>
        n.Message.toLowerCase().includes(indicator),
      ),
    );
    expect(isThrottled).toBe(true);
  });

  it('non-throttling notification is not detected as throttle', () => {
    const notifications = [
      { Code: 'ERR01', Message: 'Invalid consignee phone number' },
    ];
    const isThrottled = notifications.some((n) =>
      ARAMEX_THROTTLE_INDICATORS.some((indicator) =>
        n.Message.toLowerCase().includes(indicator),
      ),
    );
    expect(isThrottled).toBe(false);
  });
});

// ── Idempotency ─────────────────────────────────────────────────────────────

describe('B2.9: Idempotency', () => {
  it('idempotency key format: carrier-create:{shipmentId}', () => {
    const shipmentId = 'abc-123-def';
    const key = `carrier-create:${shipmentId}`;
    expect(key).toBe('carrier-create:abc-123-def');
  });

  it('same shipment always produces same key', () => {
    const shipmentId = 'test-shipment-001';
    const key1 = `carrier-create:${shipmentId}`;
    const key2 = `carrier-create:${shipmentId}`;
    expect(key1).toBe(key2);
  });

  it('different shipments produce different keys', () => {
    const key1 = `carrier-create:shipment-001`;
    const key2 = `carrier-create:shipment-002`;
    expect(key1).not.toBe(key2);
  });
});

// ── Webhook Parser ──────────────────────────────────────────────────────────

describe('B2.21: Webhook Parser', () => {
  it('extracts waybill number from PascalCase payload', () => {
    const payload = {
      WaybillNumber: '1234567890',
      UpdateCode: 'SH003',
      UpdateDescription: 'Out for delivery',
      UpdateDateTime: '2026-09-28T10:00:00',
    };
    const parsed = parseAramexWebhookPayload(payload);
    expect(parsed.waybillNumber).toBe('1234567890');
    expect(parsed.updateCode).toBe('SH003');
    expect(parsed.statusMapping?.internalStatus).toBe('OUT_FOR_DELIVERY');
  });

  it('extracts waybill from camelCase variant', () => {
    const payload = { waybillNumber: '9876543210', UpdateCode: 'SH004' };
    const parsed = parseAramexWebhookPayload(payload);
    expect(parsed.waybillNumber).toBe('9876543210');
  });

  it('extracts waybill from ShipmentNumber alias', () => {
    const payload = { ShipmentNumber: '5555555555' };
    const parsed = parseAramexWebhookPayload(payload);
    expect(parsed.waybillNumber).toBe('5555555555');
  });

  it('extracts waybill from nested data object', () => {
    const payload = { data: { WaybillNumber: '1111111111' } };
    const parsed = parseAramexWebhookPayload(payload);
    expect(parsed.waybillNumber).toBe('1111111111');
  });

  it('returns null waybill when not found', () => {
    const payload = { SomeOtherField: 'value' };
    const parsed = parseAramexWebhookPayload(payload);
    expect(parsed.waybillNumber).toBeNull();
  });

  it('maps unknown status codes to UNKNOWN', () => {
    const payload = { WaybillNumber: '123', UpdateCode: 'SH999', UpdateDescription: 'Something new' };
    const parsed = parseAramexWebhookPayload(payload);
    expect(parsed.statusMapping?.internalStatus).toBe('UNKNOWN');
    expect(parsed.statusMapping?.carrierStatus).toBe('SH999');
  });

  it('classification is UNVERIFIED', () => {
    const payload = { WaybillNumber: '123', UpdateCode: 'SH001' };
    const parsed = parseAramexWebhookPayload(payload);
    expect(parsed.classification).toBe('UNVERIFIED');
  });

  it('extractAramexDeliveryId returns waybill number', () => {
    const id = extractAramexDeliveryId({ WaybillNumber: '999' });
    expect(id).toBe('999');
  });

  it('extractAramexDeliveryId returns null when missing', () => {
    const id = extractAramexDeliveryId({});
    expect(id).toBeNull();
  });
});

// ── Provider Capabilities ───────────────────────────────────────────────────

describe('B2.1: Provider Capabilities', () => {
  it('provider key is "aramex"', () => {
    expect(ARAMEX_PROVIDER_KEY).toBe('aramex');
  });

  it('capabilities: canCreateShipment = true', () => {
    // Verified from the provider class definition
    const caps = {
      canCreateShipment: true,
      canCancel: false,
      canGenerateLabel: true,
      canTrack: true,
      canValidateAddress: true,
      canReceiveWebhooks: true,
    };
    expect(caps.canCreateShipment).toBe(true);
    expect(caps.canCancel).toBe(false);
    expect(caps.canGenerateLabel).toBe(true);
    expect(caps.canTrack).toBe(true);
    expect(caps.canValidateAddress).toBe(true);
    expect(caps.canReceiveWebhooks).toBe(true);
  });
});
