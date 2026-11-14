/**
 * Generate OpenAPI 3.1 spec from zod schemas.
 *
 * Usage: pnpm --filter @scs/contracts generate
 *
 * Output: packages/contracts/openapi/openapi.json
 *
 * Every request/response body is registered ONCE under `components.schemas` and
 * referenced via `$ref`, so the generated TS (openapi-typescript) and Dart
 * (openapi-generator) clients expose named shared types instead of inlining
 * anonymous shapes. That named-type surface is the codegen half of ADM-B3
 * ("Extract @scs/contracts; OpenAPI to TS + Dart") and is what stops the four
 * client surfaces from drifting: they all derive from this one spec.
 *
 * The auth + profile paths below are the wire contract shared by web, admin and
 * mobile. Schemas are imported from ../src (the single source of truth) so the
 * spec can never disagree with the runtime validators.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEVICE_TRUST_COOKIE_NAME,
  DEVICE_TRUST_PROOF_HEADER,
  DeviceInfoSchema,
  OtpRequestSchema,
  OtpRequestResponseSchema,
  OtpVerifySchema,
  AuthTokensSchema,
  RefreshTokenSchema,
  RefreshResponseSchema,
  SwitchOrgSchema,
  SwitchOrgResponseSchema,
  LoginPasswordSchema,
  LoginPasswordResponseSchema,
  DeviceCheckSchema,
  DeviceCheckResponseSchema,
  EmailOtpRequestSchema,
  EmailOtpVerifySchema,
  EmailOtpRequestResponseSchema,
  AccountLinkEmailSchema,
  AccountLinkPhoneSchema,
  AccountLinkResponseSchema,
  SessionInfoSchema,
  TrustedDeviceSchema,
  UserProfileSchema,
  ProblemDetailSchema,
} from '../src/index';

// ── components.schemas registry ──────────────────────────────
// Register each zod schema once under a stable PascalCase name (the type name
// the generated clients will expose); `register()` returns the `$ref` pointer
// used by request/response bodies. `$refStrategy: 'none'` inlines nested zod
// refs so every component schema is self-contained.
const schemas: Record<string, unknown> = {};

function register(name: string, schema: z.ZodType): { $ref: string } {
  schemas[name] = zodToJsonSchema(schema, { $refStrategy: 'none' });
  return { $ref: `#/components/schemas/${name}` };
}

const Ref = {
  DeviceInfo: register('DeviceInfo', DeviceInfoSchema),
  OtpRequest: register('OtpRequest', OtpRequestSchema),
  OtpRequestResponse: register('OtpRequestResponse', OtpRequestResponseSchema),
  OtpVerify: register('OtpVerify', OtpVerifySchema),
  AuthTokens: register('AuthTokens', AuthTokensSchema),
  RefreshToken: register('RefreshToken', RefreshTokenSchema),
  RefreshResponse: register('RefreshResponse', RefreshResponseSchema),
  SwitchOrg: register('SwitchOrg', SwitchOrgSchema),
  SwitchOrgResponse: register('SwitchOrgResponse', SwitchOrgResponseSchema),
  LoginPassword: register('LoginPassword', LoginPasswordSchema),
  LoginPasswordResponse: register('LoginPasswordResponse', LoginPasswordResponseSchema),
  DeviceCheck: register('DeviceCheck', DeviceCheckSchema),
  DeviceCheckResponse: register('DeviceCheckResponse', DeviceCheckResponseSchema),
  EmailOtpRequest: register('EmailOtpRequest', EmailOtpRequestSchema),
  EmailOtpVerify: register('EmailOtpVerify', EmailOtpVerifySchema),
  EmailOtpRequestResponse: register('EmailOtpRequestResponse', EmailOtpRequestResponseSchema),
  AccountLinkEmail: register('AccountLinkEmail', AccountLinkEmailSchema),
  AccountLinkPhone: register('AccountLinkPhone', AccountLinkPhoneSchema),
  AccountLinkResponse: register('AccountLinkResponse', AccountLinkResponseSchema),
  SessionInfo: register('SessionInfo', SessionInfoSchema),
  TrustedDevice: register('TrustedDevice', TrustedDeviceSchema),
  UserProfile: register('UserProfile', UserProfileSchema),
  ProblemDetail: register('ProblemDetail', ProblemDetailSchema),
};

// ── Small spec helpers ───────────────────────────────────────
/** A required JSON request body referencing a component schema. */
const requestBody = (ref: { $ref: string }) => ({
  required: true,
  content: { 'application/json': { schema: ref } },
});

/** A JSON response referencing a component schema. */
const jsonResponse = (description: string, ref: unknown) => ({
  description,
  content: { 'application/json': { schema: ref } },
});

/** An RFC 7807 problem+json error response referencing ProblemDetail. */
const problemResponse = (description: string) => ({
  description,
  content: { 'application/problem+json': { schema: Ref.ProblemDetail } },
});

/**
 * Device-trust transport documentation (S-1 remediation).
 *
 * The credential is a cookie the SERVER issues, so it is documented as a
 * response header plus an incoming cookie parameter rather than as a body
 * field anywhere. `required: false` everywhere: the credential is optional in
 * transit (its absence is simply "untrusted device"), and declaring it required
 * would misdescribe a request that works perfectly well without it.
 *
 * The names come from `@scs/contracts` itself, so the document, the generated
 * clients and the API module that sets the cookie cannot drift apart silently.
 */
const deviceTrustCookieParam = {
  name: DEVICE_TRUST_COOKIE_NAME,
  in: 'cookie',
  required: false,
  description:
    'Server-issued device-trust credential installed by a previous Set-Cookie. ' +
    'HttpOnly, so page script cannot read it. Evaluated ONLY when the ' +
    `"${DEVICE_TRUST_PROOF_HEADER}" header is also present.`,
  schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
};

const deviceTrustProofParam = {
  name: DEVICE_TRUST_PROOF_HEADER,
  in: 'header',
  required: false,
  description:
    'Same-origin proof, constant value "1". CSRF control: the cookie is sent ' +
    'cross-site (SameSite=None is the only attribute that works with separately ' +
    'hosted frontends), so trust additionally requires a header a third-party ' +
    'page cannot set without passing a CORS preflight the origin allowlist rejects. ' +
    'Requests must be issued with credentials: "include".',
  schema: { type: 'string', enum: ['1'] },
};

const deviceTrustSetCookieHeader = {
  description:
    'Installs (or, with Max-Age=0, removes) the device-trust credential. ' +
    'The secret appears HERE and nowhere else — never in a response body.',
  schema: { type: 'string' },
};

/** Attach the Set-Cookie documentation to an already-built response object. */
const withSetCookie = <T extends object>(response: T) => ({
  ...response,
  headers: { ...(response as { headers?: Record<string, unknown> }).headers, 'Set-Cookie': deviceTrustSetCookieHeader },
});

const openapi = {
  openapi: '3.1.0',
  info: {
    title: 'Smart Commerce & Supply Platform API',
    version: '1.0.0',
    description: 'B2B-first marketplace API — Modular Monolith',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local development' },
    { url: 'https://api.scsp.dev', description: 'Production' },
  ],
  tags: [{ name: 'Auth' }, { name: 'Profile' }],
  paths: {
    '/v1/auth/otp/request': {
      post: {
        tags: ['Auth'],
        summary: 'Request an OTP for a phone number',
        description:
          'HTTP 200 does NOT mean a code was delivered. Clients MUST read '
          + '`success`: when it is false no code was sent (or delivery could not '
          + 'be confirmed), and the UI must say so instead of advancing to the '
          + 'code-entry step. See OtpRequestResponse for the outcome vocabulary.',
        requestBody: requestBody(Ref.OtpRequest),
        responses: {
          '200': jsonResponse('Delivery outcome; success=false means no code was sent', Ref.OtpRequestResponse),
          '429': problemResponse('Too many requests'),
        },
      },
    },
    '/v1/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP and issue JWT pair',
        description:
          'A verified OTP is proof of control of the number, so this response '
          + 'enrols the browser: the server mints an opaque device-trust '
          + 'credential and installs it in an HttpOnly Set-Cookie. The credential '
          + 'never appears in the response body.',
        parameters: [deviceTrustCookieParam, deviceTrustProofParam],
        requestBody: requestBody(Ref.OtpVerify),
        responses: {
          '200': withSetCookie(jsonResponse('JWT tokens issued', Ref.AuthTokens)),
          '401': problemResponse('Invalid OTP'),
        },
      },
    },
    '/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token (rotation)',
        description:
          'Rotation preserves an existing device trust: the presented credential '
          + 'is validated, its sliding expiry advanced, and re-issued. When the '
          + 'server detects refresh-token reuse it revokes the whole session chain '
          + 'AND every device credential for the account, so the clear is written '
          + 'in the same response.',
        parameters: [deviceTrustCookieParam, deviceTrustProofParam],
        requestBody: requestBody(Ref.RefreshToken),
        responses: {
          '200': withSetCookie(jsonResponse('New JWT pair issued (rotation)', Ref.RefreshResponse)),
          '401': problemResponse('Invalid or reused refresh token'),
        },
      },
    },
    '/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout — revoke current session and this device\'s trust',
        description:
          'Logout also revokes the presented device credential and clears the '
          + 'cookie, so "signed out" and "trusted device" can never be true at '
          + 'the same time. The cost is deliberate: the next sign-in on this '
          + 'browser answers one OTP.',
        parameters: [deviceTrustCookieParam, deviceTrustProofParam],
        requestBody: requestBody(Ref.RefreshToken),
        responses: {
          '200': withSetCookie({ description: 'Session revoked' }),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/auth/switch-org': {
      post: {
        tags: ['Auth'],
        summary: 'Switch active organization',
        requestBody: requestBody(Ref.SwitchOrg),
        responses: {
          '200': jsonResponse('New access token with updated org', Ref.SwitchOrgResponse),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/auth/login/password': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email + password (device-trust aware)',
        description:
          'Whether an OTP challenge follows the correct password is decided by the '
          + 'server-issued device-trust cookie plus the same-origin proof header — '
          + 'never by the client-supplied `deviceId`, which is stored as provenance '
          + 'only. Copying another browser\'s `deviceId` therefore cannot bypass the '
          + 'second factor. Responses that change the trust state carry Set-Cookie.',
        parameters: [deviceTrustCookieParam, deviceTrustProofParam],
        requestBody: requestBody(Ref.LoginPassword),
        responses: {
          '200': withSetCookie(jsonResponse(
            'JWT pair, or an OTP challenge when the device is untrusted',
            Ref.LoginPasswordResponse,
          )),
          '401': problemResponse('Invalid credentials'),
          '429': problemResponse('Too many login attempts'),
        },
      },
    },
    '/v1/auth/login/device-check': {
      post: {
        tags: ['Auth'],
        summary: 'Pre-flight check (non-disclosing)',
        description:
          'S-2 remediation. This route is reachable by an unauthenticated caller, '
          + 'so it answers a CONSTANT body: no account existence, no password '
          + 'presence, no trusted-device status. `deviceId` is accepted and ignored '
          + 'for compatibility with already-deployed clients. Clients must not '
          + 'branch on the response; they call the login endpoints and react to '
          + 'what comes back. Throttled per identifier and per IP.',
        requestBody: requestBody(Ref.DeviceCheck),
        responses: {
          '200': jsonResponse('Constant acknowledgement — carries no information', Ref.DeviceCheckResponse),
          '400': problemResponse('Malformed request body'),
          '429': problemResponse('Device-check limit exceeded'),
        },
      },
    },
    '/v1/auth/otp/email/request': {
      post: {
        tags: ['Auth'],
        summary: 'Request an email OTP (login, registration, or identifier linking)',
        description: 'Enumeration-safe and 404 when the auth.email_otp.enabled feature flag is off. '
          + 'Response shape and timing do not disclose whether the address exists. '
          + 'A 200 with `success: false` means no code reached the address: the UI '
          + 'must not present this as a delivered OTP.',
        requestBody: requestBody(Ref.EmailOtpRequest),
        responses: {
          '200': jsonResponse('Delivery outcome (same shape for known and unknown addresses)', Ref.EmailOtpRequestResponse),
          '404': problemResponse('Feature flag disabled'),
          '429': problemResponse('Per-email or per-IP rate limit exceeded'),
        },
      },
    },
    '/v1/auth/otp/email/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify an email OTP and issue a JWT pair',
        description: 'Atomically consumes the challenge; replay yields 401. Creates an '
          + 'email-only account when no user holds the address yet. A verified OTP '
          + 'enrols the browser: the device-trust credential is minted server-side '
          + 'and installed via Set-Cookie, never in the body.',
        parameters: [deviceTrustCookieParam, deviceTrustProofParam],
        requestBody: requestBody(Ref.EmailOtpVerify),
        responses: {
          '200': withSetCookie(jsonResponse('JWT tokens issued', Ref.AuthTokens)),
          '401': problemResponse('Expired, already used, or invalid OTP'),
          '404': problemResponse('Feature flag disabled'),
          '429': problemResponse('Too many invalid OTP attempts'),
        },
      },
    },
    '/v1/auth/account/link-email': {
      post: {
        tags: ['Auth'],
        summary: 'Attach an email identifier to the caller account',
        description: 'Requires a consumed email OTP proving control of the address, plus the '
          + 'auth.email_otp.enabled feature flag.',
        requestBody: requestBody(Ref.AccountLinkEmail),
        responses: {
          '200': jsonResponse('Identifier attached', Ref.AccountLinkResponse),
          '401': problemResponse('Missing access token or OTP proof'),
          '404': problemResponse('Feature flag disabled'),
          '409': problemResponse('EMAIL_ALREADY_IN_USE or a concurrent link'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/auth/account/link-phone': {
      post: {
        tags: ['Auth'],
        summary: 'Attach a phone identifier to the caller account',
        description: 'Requires a consumed phone OTP proving control of the number, plus the '
          + 'auth.email_otp.enabled feature flag.',
        requestBody: requestBody(Ref.AccountLinkPhone),
        responses: {
          '200': jsonResponse('Identifier attached', Ref.AccountLinkResponse),
          '401': problemResponse('Missing access token or OTP proof'),
          '404': problemResponse('Feature flag disabled'),
          '409': problemResponse('PHONE_ALREADY_IN_USE or a concurrent link'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/auth/account/unlink-email': {
      post: {
        tags: ['Auth'],
        summary: 'Detach the email identifier from the caller account',
        description: 'Rejected when no usable identifier would remain.',
        responses: {
          '200': jsonResponse('Identifier detached', Ref.AccountLinkResponse),
          '400': problemResponse('Would remove the last usable identifier'),
          '401': problemResponse('Missing access token'),
          '404': problemResponse('Feature flag disabled'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/auth/account/unlink-phone': {
      post: {
        tags: ['Auth'],
        summary: 'Detach the phone identifier from the caller account',
        description: 'Rejected when no usable identifier would remain.',
        responses: {
          '200': jsonResponse('Identifier detached', Ref.AccountLinkResponse),
          '400': problemResponse('Would remove the last usable identifier'),
          '401': problemResponse('Missing access token'),
          '404': problemResponse('Feature flag disabled'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/me': {
      get: {
        tags: ['Profile'],
        summary: 'Get the authenticated user profile',
        responses: {
          '200': jsonResponse('Profile with active org + memberships', Ref.UserProfile),
          '401': problemResponse('Missing or invalid access token'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/me/sessions': {
      get: {
        tags: ['Profile'],
        summary: "List the caller's active sessions",
        responses: {
          '200': jsonResponse('Active sessions (isCurrent marks the caller session)', {
            type: 'array',
            items: Ref.SessionInfo,
          }),
          '401': problemResponse('Missing or invalid access token'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/me/sessions/revoke-by-device/{deviceId}': {
      delete: {
        tags: ['Profile'],
        summary: 'Revoke a device\'s sessions and its device trust',
        description:
          'S-1 requirement 10: revoking a device now also revokes the device '
          + 'credentials enrolled by those sessions, so the browser cannot keep '
          + 'logging in without a second factor after being removed from the '
          + 'session list. `deTrustedCount` reports how many credentials were '
          + 'revoked alongside the sessions.',
        parameters: [
          { name: 'deviceId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': jsonResponse('Sessions and credentials revoked', {
            type: 'object',
            required: ['success', 'revokedCount', 'deTrustedCount'],
            properties: {
              success: { type: 'boolean' },
              revokedCount: { type: 'integer' },
              deTrustedCount: { type: 'integer' },
            },
          }),
          '401': problemResponse('Missing or invalid access token'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/me/trusted-devices': {
      get: {
        tags: ['Profile'],
        summary: "List the caller's trusted devices",
        description:
          'Non-secret lifecycle view of the device-trust credentials enrolled on '
          + 'this account (S-1). The credential digest is never exposed: a user '
          + 'can see WHICH browsers are trusted and revoke them, but the list '
          + 'cannot be used to reconstruct or forge a credential.',
        responses: {
          '200': jsonResponse('Active (non-revoked) trusted devices', {
            type: 'array',
            items: Ref.TrustedDevice,
          }),
          '401': problemResponse('Missing or invalid access token'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    '/v1/me/trusted-devices/{credentialId}': {
      delete: {
        tags: ['Profile'],
        summary: 'Revoke one trusted device',
        description:
          'Revocation is scoped to the caller (`WHERE id = $1 AND user_id = $2`), '
          + 'so another account\'s credential id yields `revokedCount: 0` rather '
          + 'than a revocation. A revoked credential stops establishing trust on '
          + 'the very next request; the browser itself is not notified and will '
          + 'answer an OTP at its next password login.',
        parameters: [
          {
            name: 'credentialId',
            in: 'path',
            required: true,
            description: 'Opaque row id from GET /v1/me/trusted-devices — NOT the credential.',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': jsonResponse('Revocation result (revokedCount 0 when not owned or already revoked)', {
            type: 'object',
            required: ['success', 'revokedCount'],
            properties: {
              success: { type: 'boolean' },
              revokedCount: { type: 'integer' },
            },
          }),
          '401': problemResponse('Missing or invalid access token'),
        },
        security: [{ bearerAuth: [] }],
      },
    },
  },
  components: {
    schemas,
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
};

const outputDir = path.join(__dirname, '..', 'openapi');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(path.join(outputDir, 'openapi.json'), JSON.stringify(openapi, null, 2));

const pathCount = Object.keys(openapi.paths).length;
const schemaCount = Object.keys(schemas).length;
console.log(
  `✅ OpenAPI 3.1 spec generated: packages/contracts/openapi/openapi.json ` +
    `(${pathCount} paths, ${schemaCount} component schemas)`,
);
