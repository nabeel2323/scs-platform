/**
 * P13 Phase 4.1.6 — Webhook HMAC-SHA256 signing + replay protection unit tests.
 *
 * Exercises the pure signing/verification utilities (v2 protocol with timestamp)
 * and the configuration fail-closed logic. No PostgreSQL, no Docker, no network.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  computeSignature,
  verifySignature,
  buildCanonicalInput,
  SIGNATURE_HEADER,
  SIGNATURE_PREFIX,
  TIMESTAMP_HEADER,
  DEFAULT_FRESHNESS_WINDOW_SECONDS,
} from '../../../modules/operations/ops-alert-signing';
import { resolveP13OpsConfig } from '../../../modules/operations/p13-ops.config';

const TEST_SECRET = 'a'.repeat(48); // 48 chars, well above the 32-char minimum.
const SHORT_SECRET = 'short-secret-only-16ch'; // 22 chars — below 32.

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe('P13 Phase 4.1.6 — HMAC-SHA256 signing utilities (v2 with timestamp)', () => {
  const body = JSON.stringify({
    id: 'alert-123',
    conditionKey: 'p13.test',
    severity: 'CRITICAL',
    title: 'Test alert',
    detail: { probe: true },
    source: 'scs-api',
  });
  const ts = nowSeconds();

  it('produces a signature in the documented sha256=<hex> format', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it('signs the canonical input <timestamp>.<body>', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    const canonical = buildCanonicalInput(ts, body);
    const expected = `sha256=${createHmac('sha256', TEST_SECRET).update(canonical, 'utf-8').digest('hex')}`;
    expect(sig).toBe(expected);
  });

  it('verifySignature accepts a valid signature with fresh timestamp', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    expect(verifySignature(body, sig, ts, TEST_SECRET)).toBe(true);
  });

  it('a modified body fails verification', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    const tampered = body.replace('"CRITICAL"', '"INFO"');
    expect(verifySignature(tampered, sig, ts, TEST_SECRET)).toBe(false);
  });

  it('an incorrect secret fails verification', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    expect(verifySignature(body, sig, ts, 'wrong-secret-' + 'x'.repeat(40))).toBe(false);
  });

  it('a missing signature fails verification', () => {
    expect(verifySignature(body, '', ts, TEST_SECRET)).toBe(false);
  });

  it('a signature without the sha256= prefix fails verification', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    const bareHex = sig.replace(SIGNATURE_PREFIX, '');
    expect(verifySignature(body, bareHex, ts, TEST_SECRET)).toBe(false);
  });

  it('a missing timestamp fails verification', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    expect(verifySignature(body, sig, '', TEST_SECRET)).toBe(false);
  });

  it('a malformed timestamp fails verification', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    expect(verifySignature(body, sig, 'not-a-number', TEST_SECRET)).toBe(false);
  });

  it('a zero timestamp fails verification', () => {
    const sig = computeSignature(0, body, TEST_SECRET);
    expect(verifySignature(body, sig, 0, TEST_SECRET)).toBe(false);
  });

  it('a negative timestamp fails verification', () => {
    const sig = computeSignature(-100, body, TEST_SECRET);
    expect(verifySignature(body, sig, -100, TEST_SECRET)).toBe(false);
  });

  it('a timestamp outside the freshness window fails verification', () => {
    const oldTs = nowSeconds() - 600; // 10 minutes ago (default window is 5 min)
    const sig = computeSignature(oldTs, body, TEST_SECRET);
    expect(verifySignature(body, sig, oldTs, TEST_SECRET)).toBe(false);
  });

  it('a timestamp at the edge of the freshness window passes', () => {
    const edgeTs = nowSeconds() - DEFAULT_FRESHNESS_WINDOW_SECONDS + 1;
    const sig = computeSignature(edgeTs, body, TEST_SECRET);
    expect(verifySignature(body, sig, edgeTs, TEST_SECRET)).toBe(true);
  });

  it('a custom freshness window is respected', () => {
    const oldTs = nowSeconds() - 50; // 50 seconds ago
    const sig = computeSignature(oldTs, body, TEST_SECRET);
    // Default 300s window: passes.
    expect(verifySignature(body, sig, oldTs, TEST_SECRET)).toBe(true);
    // Custom 30s window: fails.
    expect(verifySignature(body, sig, oldTs, TEST_SECRET, 30)).toBe(false);
    // Custom 60s window: passes.
    expect(verifySignature(body, sig, oldTs, TEST_SECRET, 60)).toBe(true);
  });

  it('an empty body is still signed (edge case)', () => {
    const sig = computeSignature(ts, '', TEST_SECRET);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature('', sig, ts, TEST_SECRET)).toBe(true);
  });

  it('Unicode payloads are signed as UTF-8', () => {
    const unicode = JSON.stringify({ title: 'تنبيه حرج', detail: { org: 'منظمة' } });
    const sig = computeSignature(ts, unicode, TEST_SECRET);
    expect(verifySignature(unicode, sig, ts, TEST_SECRET)).toBe(true);
    expect(verifySignature(unicode + '\u0000', sig, ts, TEST_SECRET)).toBe(false);
  });

  it('a tampered timestamp fails verification even with valid signature', () => {
    const sig = computeSignature(ts, body, TEST_SECRET);
    // Use a different (but fresh) timestamp.
    expect(verifySignature(body, sig, ts + 1, TEST_SECRET)).toBe(false);
  });

  it('constants are documented', () => {
    expect(SIGNATURE_HEADER).toBe('x-scs-alert-signature');
    expect(TIMESTAMP_HEADER).toBe('x-scs-alert-timestamp');
    expect(SIGNATURE_PREFIX).toBe('sha256=');
    expect(DEFAULT_FRESHNESS_WINDOW_SECONDS).toBe(300);
  });
});

describe('P13 Phase 4.1.6 — configuration fail-closed for webhook secret', () => {
  const keys = ['P13_OPS_ALERT_WEBHOOK_URL', 'P13_OPS_ALERT_WEBHOOK_SECRET', 'P13_ALERT_FRESHNESS_WINDOW_SECONDS'];
  afterEach(() => {
    for (const k of keys) delete process.env[k];
  });

  it('with no webhook URL, the secret is null and the URL is null (safe defaults)', () => {
    const cfg = resolveP13OpsConfig({});
    expect(cfg.alertWebhookUrl).toBeNull();
    expect(cfg.alertWebhookSecret).toBeNull();
    expect(cfg.alertFreshnessWindowSeconds).toBe(300);
  });

  it('with a webhook URL but no secret, both are nulled (fail closed)', () => {
    const cfg = resolveP13OpsConfig({
      P13_OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.test/alerts',
    });
    expect(cfg.alertWebhookUrl).toBeNull();
    expect(cfg.alertWebhookSecret).toBeNull();
  });

  it('with a webhook URL and a too-short secret, both are nulled (fail closed)', () => {
    const cfg = resolveP13OpsConfig({
      P13_OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.test/alerts',
      P13_OPS_ALERT_WEBHOOK_SECRET: SHORT_SECRET,
    });
    expect(cfg.alertWebhookUrl).toBeNull();
    expect(cfg.alertWebhookSecret).toBeNull();
  });

  it('with a webhook URL and a sufficiently long secret, both are preserved', () => {
    const cfg = resolveP13OpsConfig({
      P13_OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.test/alerts',
      P13_OPS_ALERT_WEBHOOK_SECRET: TEST_SECRET,
    });
    expect(cfg.alertWebhookUrl).toBe('https://hooks.example.test/alerts');
    expect(cfg.alertWebhookSecret).toBe(TEST_SECRET);
  });

  it('with a webhook URL and exactly 32-char secret, both are preserved (boundary)', () => {
    const cfg = resolveP13OpsConfig({
      P13_OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.test/alerts',
      P13_OPS_ALERT_WEBHOOK_SECRET: 'a'.repeat(32),
    });
    expect(cfg.alertWebhookUrl).toBe('https://hooks.example.test/alerts');
    expect(cfg.alertWebhookSecret).toBe('a'.repeat(32));
  });

  it('with a webhook URL and 31-char secret, both are nulled (boundary fail closed)', () => {
    const cfg = resolveP13OpsConfig({
      P13_OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.test/alerts',
      P13_OPS_ALERT_WEBHOOK_SECRET: 'a'.repeat(31),
    });
    expect(cfg.alertWebhookUrl).toBeNull();
    expect(cfg.alertWebhookSecret).toBeNull();
  });

  it('an empty-string secret is treated as missing', () => {
    const cfg = resolveP13OpsConfig({
      P13_OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.test/alerts',
      P13_OPS_ALERT_WEBHOOK_SECRET: '   ',
    });
    expect(cfg.alertWebhookUrl).toBeNull();
    expect(cfg.alertWebhookSecret).toBeNull();
  });

  it('the secret never appears in the config when fail-closed nulls it', () => {
    const cfg = resolveP13OpsConfig({
      P13_OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.test/alerts',
      P13_OPS_ALERT_WEBHOOK_SECRET: SHORT_SECRET,
    });
    const serialized = JSON.stringify(cfg);
    expect(serialized).not.toContain(SHORT_SECRET);
  });

  it('overrides can supply the secret directly (bypassing env)', () => {
    const cfg = resolveP13OpsConfig(
      { P13_OPS_ALERT_WEBHOOK_URL: 'https://hooks.example.test/alerts' },
      { alertWebhookSecret: TEST_SECRET },
    );
    expect(cfg.alertWebhookUrl).toBe('https://hooks.example.test/alerts');
    expect(cfg.alertWebhookSecret).toBe(TEST_SECRET);
  });

  it('secret without URL is preserved but delivery stays log-only (URL null)', () => {
    const cfg = resolveP13OpsConfig({
      P13_OPS_ALERT_WEBHOOK_SECRET: TEST_SECRET,
    });
    expect(cfg.alertWebhookUrl).toBeNull();
    expect(cfg.alertWebhookSecret).toBe(TEST_SECRET);
  });

  it('freshness window is configurable via env', () => {
    const cfg = resolveP13OpsConfig({
      P13_ALERT_FRESHNESS_WINDOW_SECONDS: '60',
    });
    expect(cfg.alertFreshnessWindowSeconds).toBe(60);
  });

  it('invalid freshness window falls back to default', () => {
    const cfg = resolveP13OpsConfig({
      P13_ALERT_FRESHNESS_WINDOW_SECONDS: 'not-a-number',
    });
    expect(cfg.alertFreshnessWindowSeconds).toBe(300);
  });
});
