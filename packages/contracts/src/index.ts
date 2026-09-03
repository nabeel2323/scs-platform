/**
 * @scs/contracts — Shared API contracts
 *
 * Zod schemas that generate OpenAPI 3.1 specs.
 * These are the single source of truth for the API surface.
 * Generated clients (TS, Dart) consume these specs.
 */

import { z } from 'zod';

// ── Auth ─────────────────────────────────────────────────────

export const OtpRequestSchema = z.object({
  phone: z.string().min(8).max(20),
});

export const OtpVerifySchema = z.object({
  phone: z.string().min(8).max(20),
  otp: z.string().length(6),
});

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const SwitchOrgSchema = z.object({
  orgId: z.string().uuid(),
});

// ── Common ───────────────────────────────────────────────────

export const ProblemDetailSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string(),
  instance: z.string(),
});

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

// ── Re-exports ───────────────────────────────────────────────

export type OtpRequest = z.infer<typeof OtpRequestSchema>;
export type OtpVerify = z.infer<typeof OtpVerifySchema>;
export type AuthTokens = z.infer<typeof AuthTokensSchema>;
export type RefreshToken = z.infer<typeof RefreshTokenSchema>;
export type SwitchOrg = z.infer<typeof SwitchOrgSchema>;
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;
