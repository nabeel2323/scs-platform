/**
 * @scs/env — Zod-validated environment schemas
 *
 * Each app validates its environment at boot and fails fast.
 * 12-factor: every config value comes from the environment.
 */

import { z } from 'zod';

// ── Shared database + redis ──────────────────────────────────
export const DatabaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MIN: z.coerce.number().default(2),
  DATABASE_POOL_MAX: z.coerce.number().default(20),
});

export const RedisEnvSchema = z.object({
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
});

// ── API environment ──────────────────────────────────────────
export const ApiEnvSchema = DatabaseEnvSchema.merge(RedisEnvSchema).extend({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  API_CORS_ORIGINS: z.string().default('http://localhost:3100,http://localhost:3200'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // S3 / MinIO
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string(),
  S3_SECRET_KEY: z.string(),
  S3_MEDIA_BUCKET: z.string().default('scs-media'),
  S3_UPLOADS_BUCKET: z.string().default('scs-uploads'),

  // Feature flags
  FLAGS_PREPAY_ENABLED: z.coerce.boolean().default(false),
  FLAGS_B2C_ENABLED: z.coerce.boolean().default(false),
  FLAGS_ADS_ENABLED: z.coerce.boolean().default(false),
});

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

// ── Web environment ──────────────────────────────────────────
export const WebEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_WS_URL: z.string().url().default('ws://localhost:3000'),
  NEXT_PUBLIC_CDN_URL: z.string().url().optional(),
});

export type WebEnv = z.infer<typeof WebEnvSchema>;

// ── Admin environment ────────────────────────────────────────
export const AdminEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_WS_URL: z.string().url().default('ws://localhost:3000'),
});

export type AdminEnv = z.infer<typeof AdminEnvSchema>;

// ── Validation helper ────────────────────────────────────────
export function validateEnv<T extends z.ZodType>(schema: T, env: Record<string, unknown>): T['_output'] {
  const result = schema.safeParse(env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    throw new Error('Invalid environment configuration');
  }
  return result.data;
}
