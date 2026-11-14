/**
 * S1.37 audit — Phase 1 API-contract drift guard (finding F-09).
 *
 * The Phase 1 implementation shipped six new auth endpoints that were never
 * added to the OpenAPI document or the generated clients, so web/mobile and any
 * external consumer would have been coding against a contract that silently
 * omits the whole email-identity surface. A spec that only asserts "the
 * generated client compiles" cannot catch that class of gap.
 *
 * This guard therefore reconciles three artefacts that must never disagree:
 *   1. the route table the API actually exposes (read out of auth.controller.ts),
 *   2. the published OpenAPI document (packages/contracts/openapi/openapi.json),
 *   3. the generated TypeScript client (packages/contracts/generated/api.d.ts).
 *
 * It also pins the security requirement that both linking bodies declare the OTP
 * proving control of the identifier (S1.37-F-04 email, S1.37-F-05 phone), so a
 * future contract edit cannot quietly drop the proof from the public API.
 *
 * It reads the artefacts from disk rather than importing @scs/contracts, because
 * @scs/api does not depend on that package — importing it here would make the
 * suite pass for the wrong reason if the workspace linkage ever changed.
 *
 * Unit-only: no database, no network, no provider.
 *
 * Artifact availability: `packages/contracts/openapi/openapi.json` and
 * `packages/contracts/generated/` are git-ignored build outputs, produced by
 * `pnpm contracts:generate` and `contracts:generate:ts`. The CI job that owns this guard
 * (`.github/workflows/ci.yml` → “Contract Spec & Codegen”) generates both before invoking
 * this spec, so it gates there. On a bare checkout with no generated artifacts the suite
 * collects nothing rather than crashing the unit run; the skip is visible in the reporter
 * and the authoritative execution is the contract job, not this one.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const OPENAPI_FILE = path.join(REPO_ROOT, 'packages/contracts/openapi/openapi.json');
const TS_CLIENT_FILE = path.join(REPO_ROOT, 'packages/contracts/generated/api.d.ts');
const AUTH_CONTROLLER_FILE = path.join(
  REPO_ROOT,
  'apps/api/src/modules/identity/auth.controller.ts',
);

const API_PREFIX = '/v1';
const AUTH_PREFIX = `${API_PREFIX}/auth`;

/** Phase 1 endpoints, in the order the controller declares them. */
const PHASE_1_ROUTES = [
  'otp/email/request',
  'otp/email/verify',
  'account/link-email',
  'account/link-phone',
  'account/unlink-email',
  'account/unlink-phone',
] as const;

/** Endpoints that answer 404 while `auth.email_otp.enabled` is off. */
const FLAG_GATED_ROUTES = PHASE_1_ROUTES;

/** Authenticated account-management endpoints (JwtAuthGuard). */
const BEARER_ROUTES = [
  'account/link-email',
  'account/link-phone',
  'account/unlink-email',
  'account/unlink-phone',
] as const;

interface Operation {
  summary?: string;
  security?: Array<Record<string, unknown>>;
  requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
  responses: Record<string, unknown>;
}

/** A response object as emitted by the generator, with its header map. */
interface ResponseLike {
  headers?: Record<string, unknown>;
}

/** Operations that participate in device trust also declare cookie/header params. */
interface TrustAwareOperation extends Operation {
  parameters?: Array<{ name: string; in: string }>;
}

interface OpenApiDoc {
  paths: Record<string, Partial<Record<string, Operation>>>;
  components: {
    schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }>;
  };
  securitySchemes?: unknown;
}

function readDoc(): OpenApiDoc {
  return JSON.parse(fs.readFileSync(OPENAPI_FILE, 'utf-8')) as OpenApiDoc;
}

/** Reads a named component schema, failing loudly when the document dropped it. */
function schemaOf(doc: OpenApiDoc, name: string) {
  const schema = doc.components.schemas[name];
  if (!schema) throw new Error(`openapi.json declares no component schema named ${name}`);
  return schema;
}

/** Collects `@Post('...')` / `@Get('...')` literals straight from the controller source. */
function readControllerRoutes(): Array<{ method: 'post' | 'get'; path: string }> {
  const source = fs.readFileSync(AUTH_CONTROLLER_FILE, 'utf-8');
  const found: Array<{ method: 'post' | 'get'; path: string }> = [];
  const re = /@(Post|Get)\(\s*'([^']*)'\s*\)/g;
  for (const match of source.matchAll(re)) {
    const verb = match[1]?.toLowerCase();
    const route = match[2];
    if ((verb !== 'post' && verb !== 'get') || !route) continue;
    found.push({ method: verb, path: route });
  }
  return found;
}

function operation(doc: OpenApiDoc, route: string, method = 'post'): Operation | undefined {
  return doc.paths[`${AUTH_PREFIX}/${route}`]?.[method];
}

const ARTIFACTS_PRESENT = fs.existsSync(OPENAPI_FILE) && fs.existsSync(TS_CLIENT_FILE);

if (!ARTIFACTS_PRESENT) {
  console.warn(
    '[contracts-phase1] skipped: openapi.json / generated api.d.ts are git-ignored build ' +
      'outputs. Run `pnpm contracts:generate` and `pnpm --filter @scs/contracts generate:ts` ' +
      'to execute this guard locally. The authoritative gate is the CI ' +
      '"Contract Spec & Codegen" job, which generates both before invoking this spec.',
  );
}

const suite = ARTIFACTS_PRESENT ? describe : describe.skip;

suite('Phase 1 API contract drift (S1.37-F-09)', () => {
  const controllerRoutes = readControllerRoutes();
  let doc: OpenApiDoc;
  let client: string;

  beforeAll(() => {
    doc = readDoc();
    client = fs.readFileSync(TS_CLIENT_FILE, 'utf-8');
  });

  // ── 1. The controller cannot expose a route the contract omits ──────

  it.each(controllerRoutes.map((r) => [r.method, r.path] as const))(
    'published contract covers the %s /v1/auth/%s route the controller declares',
    (method, route) => {
      const op = doc.paths[`${AUTH_PREFIX}/${route}`]?.[method];
      expect(
        op,
        `openapi.json is missing ${method.toUpperCase()} ${AUTH_PREFIX}/${route}`,
      ).toBeDefined();
      expect(op!.responses).toBeDefined();
    },
  );

  it('controller route table is exactly the documented auth surface', () => {
    const fromController = controllerRoutes
      .map((r) => `${r.method} ${AUTH_PREFIX}/${r.path}`)
      .sort();
    const documented = Object.entries(doc.paths)
      .filter(([p]) => p.startsWith(`${AUTH_PREFIX}/`))
      .flatMap(([p, item]) =>
        Object.keys(item)
          .filter((m) => m === 'post' || m === 'get')
          .map((m) => `${m} ${p}`),
      )
      .sort();
    expect(documented).toEqual(fromController);
    expect(fromController).toHaveLength(13);
  });

  // ── 2. Phase 1 endpoints are present and describe their behaviour ───

  it.each(PHASE_1_ROUTES)('Phase 1 endpoint %s exists as a POST operation', (route) => {
    expect(operation(doc, route)).toBeDefined();
  });

  it.each(PHASE_1_ROUTES)('Phase 1 endpoint %s documents its kill-switch 404', (route) => {
    const op = operation(doc, route)!;
    expect(Object.keys(op.responses)).toContain('404');
  });

  it.each(BEARER_ROUTES)('account endpoint %s requires bearer authentication', (route) => {
    const op = operation(doc, route)!;
    expect(op.security).toEqual([{ bearerAuth: [] }]);
  });

  it('public OTP endpoints declare no bearer requirement', () => {
    for (const route of ['otp/email/request', 'otp/email/verify']) {
      const op = operation(doc, route)!;
      expect(op.security).toBeUndefined();
    }
  });

  it('email OTP request documents the throttling response', () => {
    expect(Object.keys(operation(doc, 'otp/email/request')!.responses)).toContain('429');
    expect(Object.keys(operation(doc, 'otp/email/verify')!.responses)).toContain('429');
  });

  it('email OTP verify documents the invalid-challenge response', () => {
    expect(Object.keys(operation(doc, 'otp/email/verify')!.responses)).toContain('401');
  });

  it('linking endpoints document the conflict response', () => {
    for (const route of ['account/link-email', 'account/link-phone']) {
      expect(Object.keys(operation(doc, route)!.responses), route).toContain('409');
    }
  });

  it('unlinking endpoints document the last-identifier response', () => {
    for (const route of ['account/unlink-email', 'account/unlink-phone']) {
      expect(Object.keys(operation(doc, route)!.responses), route).toContain('400');
    }
  });

  // ── 3. Request schemas must carry the proof-of-control field ────────

  it('AccountLinkEmail requires both the address and its OTP', () => {
    const schema = schemaOf(doc, 'AccountLinkEmail');
    expect(schema.required).toEqual(expect.arrayContaining(['email', 'otp']));
    expect(schema.properties).toHaveProperty('email');
    expect(schema.properties).toHaveProperty('otp');
  });

  it('AccountLinkPhone requires both the number and its OTP (S1.37-F-05)', () => {
    const schema = schemaOf(doc, 'AccountLinkPhone');
    expect(schema.required).toEqual(expect.arrayContaining(['phone', 'otp']));
    expect(schema.properties).toHaveProperty('phone');
    expect(schema.properties).toHaveProperty('otp');
  });

  it('both linking operations advertise the OTP-proof 401', () => {
    for (const route of ['account/link-email', 'account/link-phone']) {
      const responses = operation(doc, route)!.responses;
      expect(Object.keys(responses), route).toContain('401');
      const desc = JSON.stringify(responses['401']);
      expect(desc, `${route} 401 does not mention the OTP proof`).toMatch(/OTP/i);
    }
  });

  it('EmailOtpVerify requires the address and its OTP', () => {
    const schema = schemaOf(doc, 'EmailOtpVerify');
    expect(schema.required).toEqual(expect.arrayContaining(['email', 'otp']));
  });

  it('every $ref the auth paths use resolves to a defined schema', () => {
    const refs: string[] = [];
    for (const [p, item] of Object.entries(doc.paths)) {
      if (!p.startsWith(`${AUTH_PREFIX}/`)) continue;
      for (const [method, op] of Object.entries(item)) {
        if (method !== 'post' && method !== 'get') continue;
        const raw = JSON.stringify(op);
        for (const m of raw.matchAll(/"\$ref"\s*:\s*"([^"]+)"/g)) {
          if (m[1]) refs.push(m[1]);
        }
      }
    }
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of new Set(refs)) {
      expect(ref, `unresolvable $ref ${ref}`).toMatch(/^#\/components\/schemas\//);
      const name = ref.split('/').pop() ?? '';
      expect(
        doc.components.schemas[name],
        `openapi.json has no schema named ${name}`,
      ).toBeDefined();
    }
  });

  // ── 4. The generated client must not lag the document ──────────────

  describe('generated TypeScript client', () => {
    it.each([
      ...controllerRoutes.map((r) => `${AUTH_PREFIX}/${r.path}`),
      '/v1/me',
      '/v1/me/sessions',
      // S-1 remediation: the trusted-device lifecycle is only usable if the
      // generated clients can see it. A route that exists in the API but not in
      // the contract is exactly the Phase 1 defect this guard was written for.
      '/v1/me/trusted-devices',
      '/v1/me/trusted-devices/{credentialId}',
      '/v1/me/sessions/revoke-by-device/{deviceId}',
    ])('client declares the %s path', (routePath) => {
      expect(client, `generated api.d.ts is missing ${routePath}`).toContain(`"${routePath}"`);
    });

    it('client declares the device-trust and OTP delivery schemas', () => {
      for (const name of ['TrustedDevice', 'OtpRequestResponse', 'DeviceCheckResponse']) {
        expect(client, `generated api.d.ts has no ${name} component`).toContain(`${name}:`);
      }
    });

    it('client declares the Phase 1 request schemas', () => {
      for (const name of [
        'EmailOtpRequest',
        'EmailOtpVerify',
        'EmailOtpRequestResponse',
        'AccountLinkEmail',
        'AccountLinkPhone',
        'AccountLinkResponse',
      ]) {
        expect(client, `generated api.d.ts has no ${name} component`).toContain(`${name}:`);
      }
    });

    it('client links AccountLinkEmail to the email and otp properties', () => {
      const block = client.slice(client.indexOf('AccountLinkEmail:'));
      const slice = block.slice(0, 900);
      expect(slice).toContain('email');
      expect(slice).toContain('otp');
    });
  });

  // ── 5. Gating parity: a gated route must be a documented route ─────

  it('every flag-gated route is present in the contract (no undocumented gated surface)', () => {
    for (const route of FLAG_GATED_ROUTES) {
      const inController = controllerRoutes.some((r) => r.path === route && r.method === 'post');
      expect(inController, `${route} is not declared by AuthController`).toBe(true);
      expect(operation(doc, route), `${route} is not in openapi.json`).toBeDefined();
    }
  });

  // ── 6. S-1: device trust is a cookie, never a body field ───────────

  describe('device-trust transport (S-1)', () => {
    /** Auth routes whose answer depends on, or which change, device trust. */
    const TRUST_BEARING_ROUTES = [
      'login/password',
      'otp/verify',
      'otp/email/verify',
      'refresh',
      'logout',
    ] as const;

    const DEVICE_TRUST_COOKIE = 'scs_device_trust';
    const DEVICE_TRUST_PROOF_HEADER = 'x-device-trust';

    it.each(TRUST_BEARING_ROUTES)(
      '%s documents the cookie and the same-origin proof header it is gated on',
      (route) => {
        const params = (operation(doc, route) as unknown as TrustAwareOperation).parameters ?? [];
        const names = params.map((p) => `${p.in}:${p.name}`);
        expect(names, `${route} omits the ${DEVICE_TRUST_COOKIE} cookie parameter`).toContain(
          `cookie:${DEVICE_TRUST_COOKIE}`,
        );
        expect(names, `${route} omits the ${DEVICE_TRUST_PROOF_HEADER} proof parameter`).toContain(
          `header:${DEVICE_TRUST_PROOF_HEADER}`,
        );
      },
    );

    it.each(TRUST_BEARING_ROUTES)(
      '%s advertises Set-Cookie, so the credential is documented as transport',
      (route) => {
        const responses = operation(doc, route)!.responses as Record<string, ResponseLike>;
        const ok = responses['200'];
        expect(ok?.headers?.['Set-Cookie'], `${route} 200 has no Set-Cookie header`).toBeDefined();
      },
    );

    it('no auth response body carries a device credential', () => {
      // The whole point of S-1 is that the secret lives in an HttpOnly cookie.
      // A `credential`/`deviceTrust` body property would put it back within
      // reach of page script, so the contract must not describe one.
      const docJson = JSON.stringify(
        Object.fromEntries(
          Object.entries(doc.paths).filter(([p]) => p.startsWith(`${AUTH_PREFIX}/`)),
        ),
      );
      const bodySchemas = Object.entries(doc.components.schemas)
        .filter(([name]) => /^(LoginPasswordResponse|AuthTokens|RefreshResponse|OtpRequestResponse|DeviceCheckResponse|TrustedDevice)$/.test(name))
        .flatMap(([, schema]) => Object.keys(schema.properties ?? {}));

      for (const forbidden of ['credential', 'deviceTrust', 'credentialHash', 'deviceTrustCookie']) {
        expect(
          bodySchemas,
          `a response schema exposes ${forbidden} — device trust must be cookie-only`,
        ).not.toContain(forbidden);
      }
      expect(docJson).toContain(DEVICE_TRUST_COOKIE);
    });

    it('TrustedDevice exposes lifecycle only, never the digest', () => {
      const schema = schemaOf(doc, 'TrustedDevice');
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual(
        ['createdAt', 'deviceLabel', 'expiresAt', 'hardExpiresAt', 'id', 'lastUsedAt'].sort(),
      );
    });
  });

  // ── 7. S-2: the unauthenticated pre-flight discloses nothing ───────

  describe('device-check non-disclosure (S-2)', () => {
    it('DeviceCheckResponse has exactly one constant property', () => {
      const schema = schemaOf(doc, 'DeviceCheckResponse');
      expect(Object.keys(schema.properties ?? {})).toEqual(['checked']);
      expect(schema.required).toEqual(['checked']);
      expect(JSON.stringify(schema.properties?.['checked'])).toMatch(/true/);
    });

    it('device-check documents a throttling response', () => {
      const op = operation(doc, 'login/device-check')!;
      expect(Object.keys(op.responses)).toContain('429');
    });

    it('no auth schema leaks account-existence signals through device-check', () => {
      const op = operation(doc, 'login/device-check')!;
      const raw = JSON.stringify(op.responses['200']);
      for (const leak of ['hasPassword', 'canAutoLogin', 'requiresOtp']) {
        expect(raw, `device-check response still describes ${leak}`).not.toContain(leak);
      }
    });
  });
});
