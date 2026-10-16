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
  DeviceInfoSchema,
  OtpRequestSchema,
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
  SessionInfoSchema,
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
  SessionInfo: register('SessionInfo', SessionInfoSchema),
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
        summary: 'Request OTP for phone number',
        requestBody: requestBody(Ref.OtpRequest),
        responses: {
          '200': { description: 'OTP sent successfully' },
          '429': problemResponse('Too many requests'),
        },
      },
    },
    '/v1/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP and issue JWT pair',
        requestBody: requestBody(Ref.OtpVerify),
        responses: {
          '200': jsonResponse('JWT tokens issued', Ref.AuthTokens),
          '401': problemResponse('Invalid OTP'),
        },
      },
    },
    '/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token (rotation)',
        requestBody: requestBody(Ref.RefreshToken),
        responses: {
          '200': jsonResponse('New JWT pair issued (rotation)', Ref.RefreshResponse),
          '401': problemResponse('Invalid or reused refresh token'),
        },
      },
    },
    '/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout — revoke current session',
        requestBody: requestBody(Ref.RefreshToken),
        responses: {
          '200': { description: 'Session revoked' },
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
        requestBody: requestBody(Ref.LoginPassword),
        responses: {
          '200': jsonResponse(
            'JWT pair, or an OTP challenge when the device is untrusted',
            Ref.LoginPasswordResponse,
          ),
          '401': problemResponse('Invalid credentials'),
          '429': problemResponse('Too many login attempts'),
        },
      },
    },
    '/v1/auth/login/device-check': {
      post: {
        tags: ['Auth'],
        summary: 'Pre-flight device-trust check for an email',
        requestBody: requestBody(Ref.DeviceCheck),
        responses: {
          '200': jsonResponse('Device-trust status', Ref.DeviceCheckResponse),
        },
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
