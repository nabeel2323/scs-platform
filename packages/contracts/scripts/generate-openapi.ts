/**
 * Generate OpenAPI 3.1 spec from zod schemas.
 *
 * Usage: pnpm --filter @scs/contracts generate
 *
 * Output: packages/contracts/openapi/openapi.json
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as fs from 'fs';
import * as path from 'path';
import {
  OtpRequestSchema,
  OtpVerifySchema,
  AuthTokensSchema,
  RefreshTokenSchema,
  SwitchOrgSchema,
  ProblemDetailSchema,
} from '../src/index';

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
  paths: {
    '/v1/auth/otp/request': {
      post: {
        tags: ['Auth'],
        summary: 'Request OTP for phone number',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: zodToJsonSchema(OtpRequestSchema),
            },
          },
        },
        responses: {
          '200': { description: 'OTP sent successfully' },
          '429': {
            description: 'Too many requests',
            content: {
              'application/problem+json': {
                schema: zodToJsonSchema(ProblemDetailSchema),
              },
            },
          },
        },
      },
    },
    '/v1/auth/otp/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify OTP and issue JWT pair',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: zodToJsonSchema(OtpVerifySchema),
            },
          },
        },
        responses: {
          '200': {
            description: 'JWT tokens issued',
            content: {
              'application/json': {
                schema: zodToJsonSchema(AuthTokensSchema),
              },
            },
          },
          '401': {
            description: 'Invalid OTP',
            content: {
              'application/problem+json': {
                schema: zodToJsonSchema(ProblemDetailSchema),
              },
            },
          },
        },
      },
    },
    '/v1/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: zodToJsonSchema(RefreshTokenSchema),
            },
          },
        },
        responses: {
          '200': {
            description: 'New JWT pair issued (rotation)',
            content: {
              'application/json': {
                schema: zodToJsonSchema(AuthTokensSchema),
              },
            },
          },
        },
      },
    },
    '/v1/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout — revoke current session',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: zodToJsonSchema(RefreshTokenSchema),
            },
          },
        },
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
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: zodToJsonSchema(SwitchOrgSchema),
            },
          },
        },
        responses: {
          '200': {
            description: 'New access token with updated org',
          },
        },
        security: [{ bearerAuth: [] }],
      },
    },
  },
  components: {
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

fs.writeFileSync(
  path.join(outputDir, 'openapi.json'),
  JSON.stringify(openapi, null, 2),
);

console.log('✅ OpenAPI 3.1 spec generated: packages/contracts/openapi/openapi.json');
