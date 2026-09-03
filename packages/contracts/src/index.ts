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

// ── Merchant: Stores ─────────────────────────────────────────

export const AddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postal: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const CreateStoreSchema = z.object({
  orgId: z.string().uuid(),
  displayName: z.string().min(2).max(200),
  slug: z.string().min(2).max(120).optional(),
  description: z.string().max(5000).optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  currency: z.string().length(3).default('SAR'),
  timezone: z.string().default('Asia/Riyadh'),
  locale: z.string().max(10).default('ar'),
  address: AddressSchema.optional(),
});

export const UpdateStoreSchema = z.object({
  displayName: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().optional(),
  locale: z.string().max(10).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
  address: AddressSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const StoreSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  coverUrl: z.string().nullable(),
  currency: z.string(),
  timezone: z.string(),
  locale: z.string(),
  status: z.string(),
  verificationStatus: z.string(),
  address: z.record(z.unknown()),
  metadata: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Merchant: Warehouses ─────────────────────────────────────

export const CreateWarehouseSchema = z.object({
  name: z.string().min(2).max(160),
  address: AddressSchema.optional(),
  managerName: z.string().max(160).optional(),
  managerPhone: z.string().max(20).optional(),
});

export const WarehouseSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string(),
  address: z.record(z.unknown()),
  managerName: z.string().nullable(),
  managerPhone: z.string().nullable(),
  status: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Merchant: Documents ──────────────────────────────────────

export const DocTypeSchema = z.enum([
  'COMMERCIAL_REG',
  'TAX_CERT',
  'BANK_LETTER',
  'NATIONAL_ID',
  'OTHER',
]);

export const UploadDocumentSchema = z.object({
  orgId: z.string().uuid(),
  storeId: z.string().uuid().optional(),
  docType: DocTypeSchema,
  fileName: z.string().min(1).max(260),
  mimeType: z.string().max(100).default('application/pdf'),
  fileSize: z.number().int().min(0).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const BusinessDocumentSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  storeId: z.string().uuid().nullable(),
  docType: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  storageKey: z.string(),
  storageUrl: z.string().nullable(),
  verificationStatus: z.string(),
  uploadedBy: z.string().uuid(),
  reviewedBy: z.string().uuid().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  rejectionReason: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export const PresignedUrlSchema = z.object({
  downloadUrl: z.string(),
});

// ── Merchant: Verification ───────────────────────────────────

export const VerificationReviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'REVISION']),
  notes: z.string().max(2000).optional(),
  rejectionReasons: z.array(z.string()).optional(),
});

export const VerificationRequestSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  orgId: z.string().uuid(),
  status: z.string(),
  submittedBy: z.string().uuid(),
  reviewedBy: z.string().uuid().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  decisionNotes: z.string().nullable(),
  rejectionReasons: z.array(z.string()).nullable(),
  autoVerified: z.boolean(),
  submittedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Re-exports ───────────────────────────────────────────────

export type OtpRequest = z.infer<typeof OtpRequestSchema>;
export type OtpVerify = z.infer<typeof OtpVerifySchema>;
export type AuthTokens = z.infer<typeof AuthTokensSchema>;
export type RefreshToken = z.infer<typeof RefreshTokenSchema>;
export type SwitchOrg = z.infer<typeof SwitchOrgSchema>;
export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

export type Address = z.infer<typeof AddressSchema>;
export type CreateStore = z.infer<typeof CreateStoreSchema>;
export type UpdateStore = z.infer<typeof UpdateStoreSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type CreateWarehouse = z.infer<typeof CreateWarehouseSchema>;
export type Warehouse = z.infer<typeof WarehouseSchema>;
export type DocType = z.infer<typeof DocTypeSchema>;
export type UploadDocument = z.infer<typeof UploadDocumentSchema>;
export type BusinessDocument = z.infer<typeof BusinessDocumentSchema>;
export type PresignedUrl = z.infer<typeof PresignedUrlSchema>;
export type VerificationReview = z.infer<typeof VerificationReviewSchema>;
export type VerificationRequest = z.infer<typeof VerificationRequestSchema>;
