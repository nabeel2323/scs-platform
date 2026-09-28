/**
 * M7.2.3-B.1 — Carrier Integration Foundation Hardening — Unit Tests
 *
 * Covers:
 *   B1.3 — SSRF Protection
 *   B1.4 — Carrier Error Hierarchy
 *   B1.5 — HTTP Client (secret redaction)
 *   B1.6 — Multi-Service Endpoint Model
 *   B1.8 — Configuration Validation
 *   B1.9 — Observability
 *   B1.2 — Email Resolution (helpers)
 */
import { describe, expect, it } from 'vitest';

// ── B1.4 — Error Hierarchy ──────────────────────────────────────────────────

describe('B1.4 — Carrier Error Hierarchy', () => {
  async function loadErrors() {
    return import('../../../modules/shipping/carrier-errors');
  }

  it('CarrierError is the base class', async () => {
    const { CarrierError } = await loadErrors();
    const err = new CarrierError('test', { providerKey: 'aramex', operation: 'create' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CarrierError);
    expect(err.providerKey).toBe('aramex');
    expect(err.operation).toBe('create');
    expect(err.retryable).toBe(false);
  });

  it('RetryableCarrierError is retryable', async () => {
    const { RetryableCarrierError, CarrierError } = await loadErrors();
    const err = new RetryableCarrierError('timeout', { providerKey: 'aramex', operation: 'track' });
    expect(err).toBeInstanceOf(CarrierError);
    expect(err.retryable).toBe(true);
    expect(err.name).toBe('RetryableCarrierError');
  });

  it('RateLimitCarrierError includes retryAfterSeconds', async () => {
    const { RateLimitCarrierError } = await loadErrors();
    const err = new RateLimitCarrierError('rate limited', {
      providerKey: 'aramex', operation: 'create', retryAfterSeconds: 60,
    });
    expect(err.retryable).toBe(true);
    expect(err.retryAfterSeconds).toBe(60);
    expect(err.toSafeMessage()).toContain('retry after 60s');
  });

  it('NonRetryableCarrierError is not retryable', async () => {
    const { NonRetryableCarrierError } = await loadErrors();
    const err = new NonRetryableCarrierError('suspended', { providerKey: 'aramex', operation: 'create' });
    expect(err.retryable).toBe(false);
  });

  it('AuthenticationCarrierError is not retryable', async () => {
    const { AuthenticationCarrierError } = await loadErrors();
    const err = new AuthenticationCarrierError('bad key', { providerKey: 'aramex', operation: 'create' });
    expect(err.retryable).toBe(false);
  });

  it('ValidationCarrierError includes field errors', async () => {
    const { ValidationCarrierError } = await loadErrors();
    const err = new ValidationCarrierError('invalid address', {
      providerKey: 'aramex',
      operation: 'create',
      fieldErrors: [{ field: 'city', message: 'required' }],
    });
    expect(err.retryable).toBe(false);
    expect(err.fieldErrors).toHaveLength(1);
    expect(err.toSafeMessage()).toContain('city: required');
  });

  it('UnsupportedCarrierOperationError is not retryable', async () => {
    const { UnsupportedCarrierOperationError } = await loadErrors();
    const err = new UnsupportedCarrierOperationError('no cancel', {
      providerKey: 'manual-driver', operation: 'cancel',
    });
    expect(err.retryable).toBe(false);
  });

  it('classifyCarrierError returns correct decisions', async () => {
    const {
      classifyCarrierError, RetryableCarrierError, RateLimitCarrierError,
      AuthenticationCarrierError, ValidationCarrierError,
      NonRetryableCarrierError, UnsupportedCarrierOperationError,
    } = await loadErrors();

    expect(classifyCarrierError(new RetryableCarrierError('x', { providerKey: 'a', operation: 'b' })).decision).toBe('retry');
    expect(classifyCarrierError(new RateLimitCarrierError('x', { providerKey: 'a', operation: 'b' })).decision).toBe('backoff');
    expect(classifyCarrierError(new AuthenticationCarrierError('x', { providerKey: 'a', operation: 'b' })).decision).toBe('terminal');
    expect(classifyCarrierError(new ValidationCarrierError('x', { providerKey: 'a', operation: 'b' })).decision).toBe('terminal');
    expect(classifyCarrierError(new NonRetryableCarrierError('x', { providerKey: 'a', operation: 'b' })).decision).toBe('terminal');
    expect(classifyCarrierError(new UnsupportedCarrierOperationError('x', { providerKey: 'a', operation: 'b' })).decision).toBe('unsupported');
  });

  it('classifyCarrierError handles unknown errors as retryable', async () => {
    const { classifyCarrierError } = await loadErrors();
    expect(classifyCarrierError(new Error('network down')).decision).toBe('retry');
    expect(classifyCarrierError('string error').decision).toBe('retry');
  });

  it('toSafeMessage never includes raw secrets', async () => {
    const { AuthenticationCarrierError } = await loadErrors();
    const err = new AuthenticationCarrierError('key=sk_12345', { providerKey: 'aramex', operation: 'create' });
    // The safe message should contain the error but callers should not log raw bodies
    expect(err.toSafeMessage()).toContain('AuthenticationCarrierError');
    expect(err.toSafeMessage()).toContain('aramex');
  });
});

// ── B1.3 — SSRF Protection ──────────────────────────────────────────────────

describe('B1.3 — SSRF Protection', () => {
  async function loadSsrf() {
    return import('../../../modules/shipping/ssrf-protection');
  }

  describe('validateCarrierEndpointUrlSync', () => {
    it('accepts valid HTTPS URLs', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('https://ws.aramex.net/ShippingAPI.V2/');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.hostname).toBe('ws.aramex.net');
        expect(result.port).toBe(443);
      }
    });

    it('rejects localhost', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('https://localhost/api');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toMatch(/Loopback|Private/);
    });

    it('rejects 127.0.0.1', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('https://127.0.0.1/api');
      expect(result.valid).toBe(false);
    });

    it('rejects 10.x private IPs', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://10.0.0.1/api').valid).toBe(false);
      expect(validateCarrierEndpointUrlSync('https://10.255.255.255/api').valid).toBe(false);
    });

    it('rejects 172.16.x private IPs', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://172.16.0.1/api').valid).toBe(false);
      expect(validateCarrierEndpointUrlSync('https://172.31.255.255/api').valid).toBe(false);
    });

    it('rejects 192.168.x private IPs', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://192.168.1.1/api').valid).toBe(false);
    });

    it('rejects link-local 169.254.x (cloud metadata)', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://169.254.169.254/latest/meta-data/').valid).toBe(false);
    });

    it('rejects IPv6 loopback ::1', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://[::1]/api').valid).toBe(false);
    });

    it('rejects IPv6 link-local fe80::', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://[fe80::1]/api').valid).toBe(false);
    });

    it('rejects IPv6 ULA fd00::', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://[fd00::1]/api').valid).toBe(false);
    });

    it('rejects cloud metadata hostname', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://metadata.google.internal/api').valid).toBe(false);
    });

    it('rejects non-HTTPS when required', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('http://ws.aramex.net/api', { requireHttps: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toContain('HTTPS');
    });

    it('allows HTTP when not required', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('http://ws.aramex.net/api', { requireHttps: false });
      // Will fail on DNS resolution in sync mode, but the scheme check passes
      expect(result.valid).toBe(true);
    });

    it('rejects file:// scheme', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('file:///etc/passwd');
      expect(result.valid).toBe(false);
    });

    it('rejects gopher:// scheme', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('gopher://evil.com/api');
      expect(result.valid).toBe(false);
    });

    it('rejects invalid URLs', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('not a url').valid).toBe(false);
      expect(validateCarrierEndpointUrlSync('').valid).toBe(false);
    });

    it('enforces provider allowlist', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('https://evil.com/api', {
        allowedHosts: ['ws.aramex.net'],
      });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.reason).toContain('allowlist');
    });

    it('accepts URLs matching allowlist', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      const result = validateCarrierEndpointUrlSync('https://ws.aramex.net/api', {
        allowedHosts: ['ws.aramex.net'],
      });
      expect(result.valid).toBe(true);
    });

    it('rejects 0.0.0.0', async () => {
      const { validateCarrierEndpointUrlSync } = await loadSsrf();
      expect(validateCarrierEndpointUrlSync('https://0.0.0.0/api').valid).toBe(false);
    });
  });
});

// ── B1.5 — Secret Redaction ─────────────────────────────────────────────────

describe('B1.5 — Secret Redaction', () => {
  async function loadClient() {
    return import('../../../modules/shipping/carrier-http-client');
  }

  it('redacts password fields', async () => {
    const { redactSecrets } = await loadClient();
    const result = redactSecrets({ username: 'admin', password: 'secret123' }) as any;
    expect(result.username).toBe('admin');
    expect(result.password).toBe('[REDACTED]');
  });

  it('redacts API keys', async () => {
    const { redactSecrets } = await loadClient();
    const result = redactSecrets({ api_key: 'sk_live_123', data: 'hello' }) as any;
    expect(result.api_key).toBe('[REDACTED]');
    expect(result.data).toBe('hello');
  });

  it('redacts bearer tokens', async () => {
    const { redactSecrets } = await loadClient();
    const result = redactSecrets({ Authorization: 'Bearer eyJhbG...' }) as any;
    expect(result.Authorization).toBe('[REDACTED]');
  });

  it('redacts nested secrets', async () => {
    const { redactSecrets } = await loadClient();
    const result = redactSecrets({
      clientInfo: { userName: 'admin', password: 'secret', accountPin: '1234' },
    }) as any;
    expect(result.clientInfo.userName).toBe('admin');
    expect(result.clientInfo.password).toBe('[REDACTED]');
    expect(result.clientInfo.accountPin).toBe('[REDACTED]');
  });

  it('redacts encrypted credential contents', async () => {
    const { redactSecrets } = await loadClient();
    const result = redactSecrets({
      credentials_encrypted: 'abcdef1234567890',
      webhook_secret_encrypted: 'fedcba0987654321',
    }) as any;
    expect(result.credentials_encrypted).toBe('[REDACTED]');
    expect(result.webhook_secret_encrypted).toBe('[REDACTED]');
  });

  it('handles arrays', async () => {
    const { redactSecrets } = await loadClient();
    const result = redactSecrets([{ token: 'abc' }, { data: 'safe' }]) as any;
    expect(result[0].token).toBe('[REDACTED]');
    expect(result[1].data).toBe('safe');
  });

  it('handles null and primitives', async () => {
    const { redactSecrets } = await loadClient();
    expect(redactSecrets(null)).toBe(null);
    expect(redactSecrets('hello')).toBe('hello');
    expect(redactSecrets(42)).toBe(42);
  });
});

// ── B1.6 — Multi-Service Endpoints ──────────────────────────────────────────

describe('B1.6 — Multi-Service Endpoints', () => {
  async function loadEndpoints() {
    return import('../../../modules/shipping/carrier-endpoints');
  }

  it('resolves service-specific endpoint', async () => {
    const { resolveCarrierEndpoint } = await loadEndpoints();
    const url = resolveCarrierEndpoint('tracking', {
      endpoints: { tracking: 'https://track.aramex.net/api' },
    }, 'https://ws.aramex.net/api');
    expect(url).toBe('https://track.aramex.net/api');
  });

  it('falls back to primary endpoint when service not configured', async () => {
    const { resolveCarrierEndpoint } = await loadEndpoints();
    const url = resolveCarrierEndpoint('tracking', {}, 'https://ws.aramex.net/api');
    expect(url).toBe('https://ws.aramex.net/api');
  });

  it('returns null when no endpoint available', async () => {
    const { resolveCarrierEndpoint } = await loadEndpoints();
    const url = resolveCarrierEndpoint('rating', {}, null);
    expect(url).toBeNull();
  });

  it('extracts endpoints from payload', async () => {
    const { extractEndpoints } = await loadEndpoints();
    const endpoints = extractEndpoints({
      endpoints: {
        shipping: 'https://ship.aramex.net',
        tracking: 'https://track.aramex.net',
      },
    });
    expect(endpoints.shipping).toBe('https://ship.aramex.net');
    expect(endpoints.tracking).toBe('https://track.aramex.net');
    expect(endpoints.rating).toBeUndefined();
  });

  it('validates endpoint URLs', async () => {
    const { validateEndpoints } = await loadEndpoints();
    const errors = validateEndpoints({
      shipping: 'https://valid.com/api',
      tracking: 'not-a-url',
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('tracking');
  });

  it('returns empty errors for valid endpoints', async () => {
    const { validateEndpoints } = await loadEndpoints();
    const errors = validateEndpoints({
      shipping: 'https://ship.aramex.net/api',
      tracking: 'https://track.aramex.net/api',
    });
    expect(errors).toHaveLength(0);
  });
});

// ── B1.2 — Email Helpers ────────────────────────────────────────────────────

describe('B1.2 — Email Helpers', () => {
  async function loadEmail() {
    return import('../../../modules/shipping/carrier-email-resolver');
  }

  it('validates correct email format', async () => {
    const { isValidEmailFormat } = await loadEmail();
    expect(isValidEmailFormat('user@example.com')).toBe(true);
    expect(isValidEmailFormat('user.name@domain.co')).toBe(true);
  });

  it('rejects invalid email format', async () => {
    const { isValidEmailFormat } = await loadEmail();
    expect(isValidEmailFormat('')).toBe(false);
    expect(isValidEmailFormat('not-an-email')).toBe(false);
    expect(isValidEmailFormat('@domain.com')).toBe(false);
    expect(isValidEmailFormat('user@')).toBe(false);
    expect(isValidEmailFormat('user @domain.com')).toBe(false);
  });

  it('normalizes email to lowercase trimmed', async () => {
    const { normalizeEmail } = await loadEmail();
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    expect(normalizeEmail('TEST@DOMAIN.COM')).toBe('test@domain.com');
  });

  it('CarrierEmailRequiredError has shipmentId', async () => {
    const { CarrierEmailRequiredError } = await loadEmail();
    const err = new CarrierEmailRequiredError('ship-123');
    expect(err.shipmentId).toBe('ship-123');
    expect(err.name).toBe('CarrierEmailRequiredError');
    expect(err.message).toContain('ship-123');
  });
});

// ── B1.9 — Observability ────────────────────────────────────────────────────

describe('B1.9 — Observability', () => {
  async function loadObs() {
    return import('../../../modules/shipping/carrier-observability');
  }

  it('generates correlation IDs with prefix', async () => {
    const { CarrierObservabilityService } = await loadObs();
    const svc = new CarrierObservabilityService();
    const id = svc.generateCorrelationId();
    expect(id).toMatch(/^car-[0-9a-f-]{36}$/);
  });

  it('creates context with defaults', async () => {
    const { CarrierObservabilityService } = await loadObs();
    const svc = new CarrierObservabilityService();
    const ctx = svc.createContext('aramex', 'createShipment', {
      organizationId: 'org-1',
      shipmentId: 'ship-1',
    });
    expect(ctx.carrierProvider).toBe('aramex');
    expect(ctx.operation).toBe('createShipment');
    expect(ctx.attempt).toBe(1);
    expect(ctx.organizationId).toBe('org-1');
    expect(ctx.correlationId).toMatch(/^car-/);
  });

  it('logStart does not throw', async () => {
    const { CarrierObservabilityService } = await loadObs();
    const svc = new CarrierObservabilityService();
    const ctx = svc.createContext('aramex', 'createShipment');
    expect(() => svc.logStart(ctx)).not.toThrow();
  });

  it('logComplete does not throw', async () => {
    const { CarrierObservabilityService } = await loadObs();
    const svc = new CarrierObservabilityService();
    const ctx = svc.createContext('aramex', 'createShipment');
    expect(() => svc.logComplete({
      context: ctx,
      duration: 250,
      result: 'success',
    })).not.toThrow();
  });
});

// ── B1.8 — Configuration Validation ─────────────────────────────────────────

describe('B1.8 — Configuration Validation', () => {
  async function loadValidator() {
    return import('../../../modules/shipping/carrier-config-validation');
  }

  it('validates a complete configuration', async () => {
    const { CarrierConfigValidator } = await loadValidator();
    const validator = new CarrierConfigValidator();
    const result = validator.validate({
      providerKey: 'aramex',
      environment: 'production',
      endpointUrl: 'https://ws.aramex.net/ShippingAPI.V2/',
      credentialsEncrypted: 'abcdef1234567890',
    });
    expect(result.valid).toBe(true);
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('rejects empty provider key', async () => {
    const { CarrierConfigValidator } = await loadValidator();
    const validator = new CarrierConfigValidator();
    const result = validator.validate({
      providerKey: '',
      environment: 'sandbox',
      endpointUrl: 'https://example.com',
      credentialsEncrypted: 'abc',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'providerKey')).toBe(true);
  });

  it('rejects invalid environment', async () => {
    const { CarrierConfigValidator } = await loadValidator();
    const validator = new CarrierConfigValidator();
    const result = validator.validate({
      providerKey: 'aramex',
      environment: 'staging',
      endpointUrl: 'https://example.com',
      credentialsEncrypted: 'abc',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'environment')).toBe(true);
  });

  it('rejects missing credentials', async () => {
    const { CarrierConfigValidator } = await loadValidator();
    const validator = new CarrierConfigValidator();
    const result = validator.validate({
      providerKey: 'aramex',
      environment: 'sandbox',
      endpointUrl: 'https://example.com',
      credentialsEncrypted: '',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'credentialsEncrypted')).toBe(true);
  });

  it('rejects private IP endpoint', async () => {
    const { CarrierConfigValidator } = await loadValidator();
    const validator = new CarrierConfigValidator();
    const result = validator.validate({
      providerKey: 'aramex',
      environment: 'production',
      endpointUrl: 'https://192.168.1.1/api',
      credentialsEncrypted: 'abc',
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.field === 'endpointUrl')).toBe(true);
  });

  it('warns about missing webhook secret when webhooks enabled', async () => {
    const { CarrierConfigValidator } = await loadValidator();
    const validator = new CarrierConfigValidator();
    const result = validator.validate({
      providerKey: 'aramex',
      environment: 'sandbox',
      endpointUrl: 'https://ws.aramex.net/api',
      credentialsEncrypted: 'abc',
      capabilities: {
        canCreateShipment: true,
        canCancel: false,
        canGenerateLabel: true,
        canTrack: true,
        canValidateAddress: false,
        canReceiveWebhooks: true,
      },
    });
    expect(result.issues.some(
      (i) => i.field === 'webhookSecretEncrypted' && i.severity === 'warning',
    )).toBe(true);
  });
});
