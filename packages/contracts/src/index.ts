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

// ── Catalog: Categories ──────────────────────────────────────

export const CreateCategorySchema = z.object({
  name: z.string().min(1).max(200),
  nameAr: z.string().max(200).optional(),
  slug: z.string().max(120).optional(),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  storeId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional(),
  sortOrder: z.number().int().optional(),
});

export const CategorySchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid().nullable(),
  parentId: z.string().uuid().nullable(),
  path: z.string(),
  slug: z.string(),
  name: z.string(),
  nameAr: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  productCount: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Catalog: Brands ──────────────────────────────────────────

export const CreateBrandSchema = z.object({
  name: z.string().min(1).max(200),
  nameAr: z.string().max(200).optional(),
  slug: z.string().max(120).optional(),
  logoUrl: z.string().url().optional(),
  description: z.string().max(2000).optional(),
});

export const BrandSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  nameAr: z.string().nullable(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Catalog: Products ────────────────────────────────────────

export const ProductStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'REJECTED']);
export const ProductConditionSchema = z.enum(['NEW', 'USED', 'REFURBISHED']);

export const CreateProductSchema = z.object({
  storeId: z.string().uuid(),
  title: z.string().min(1).max(300),
  titleAr: z.string().max(300).optional(),
  slug: z.string().max(200).optional(),
  description: z.string().max(10000).optional(),
  descriptionAr: z.string().max(10000).optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  condition: ProductConditionSchema.default('NEW'),
  moq: z.number().int().min(1).default(1),
  images: z.array(z.string().url()).optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const UpdateProductSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  titleAr: z.string().max(300).optional(),
  description: z.string().max(10000).optional(),
  descriptionAr: z.string().max(10000).optional(),
  status: ProductStatusSchema.optional(),
  condition: ProductConditionSchema.optional(),
  isAvailable: z.boolean().optional(),
  moq: z.number().int().min(1).optional(),
  images: z.array(z.string().url()).optional(),
  attributes: z.record(z.unknown()).optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
});

export const ProductSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  categoryId: z.string().uuid().nullable(),
  brandId: z.string().uuid().nullable(),
  slug: z.string(),
  title: z.string(),
  titleAr: z.string().nullable(),
  description: z.string().nullable(),
  descriptionAr: z.string().nullable(),
  status: z.string(),
  condition: z.string(),
  isAvailable: z.boolean(),
  moq: z.number(),
  images: z.array(z.unknown()),
  attributes: z.record(z.unknown()),
  publishedAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Catalog: Variants ────────────────────────────────────────

export const CreateVariantSchema = z.object({
  sku: z.string().min(1).max(100),
  barcode: z.string().max(60).optional(),
  title: z.string().max(300).optional(),
  titleAr: z.string().max(300).optional(),
  unit: z.string().max(30).default('PCS'),
  weightGrams: z.number().int().optional(),
  dimensionsMm: z.record(z.unknown()).optional(),
  attributes: z.record(z.unknown()).optional(),
  images: z.array(z.string().url()).optional(),
});

export const VariantSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  sku: z.string(),
  barcode: z.string().nullable(),
  title: z.string().nullable(),
  titleAr: z.string().nullable(),
  unit: z.string(),
  weightGrams: z.number().nullable(),
  dimensionsMm: z.record(z.unknown()).nullable(),
  attributes: z.record(z.unknown()),
  images: z.array(z.unknown()),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Inventory ────────────────────────────────────────────────

export const AdjustStockSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().int(),
  reason: z.string().max(500).optional(),
});

export const ReserveStockSchema = z.object({
  inventoryItemId: z.string().uuid(),
  quantity: z.number().int().min(1),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
});

export const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  variantId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  qtyOnHand: z.number(),
  qtyReserved: z.number(),
  reorderPoint: z.number(),
  maxStock: z.number().nullable(),
  lowStockAlert: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ── Pricing ──────────────────────────────────────────────────

export const CreatePriceListSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(1).max(200),
  currency: z.string().length(3).default('SAR'),
  channel: z.enum(['B2B', 'B2C']).default('B2B'),
  audience: z.enum(['PUBLIC', 'SEGMENT', 'CONTRACT']).default('PUBLIC'),
  segmentId: z.string().uuid().optional(),
  priority: z.number().int().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
});

export const PriceListSchema = z.object({
  id: z.string().uuid(),
  storeId: z.string().uuid(),
  name: z.string(),
  currency: z.string(),
  channel: z.string(),
  audience: z.string(),
  isActive: z.boolean(),
  priority: z.number(),
  validFrom: z.string().datetime().nullable(),
  validUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateTierSchema = z.object({
  variantId: z.string().uuid(),
  minQty: z.number().int().min(1).default(1),
  maxQty: z.number().int().min(1).optional(),
  unitPriceMinor: z.number().int().min(0),
});

export const PriceTierSchema = z.object({
  id: z.string().uuid(),
  priceListId: z.string().uuid(),
  variantId: z.string().uuid(),
  minQty: z.number(),
  maxQty: z.number().nullable(),
  unitPriceMinor: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ResolvedPriceSchema = z.object({
  unitPriceMinor: z.number(),
  tierId: z.string().uuid(),
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

export type CreateCategory = z.infer<typeof CreateCategorySchema>;
export type Category = z.infer<typeof CategorySchema>;
export type CreateBrand = z.infer<typeof CreateBrandSchema>;
export type Brand = z.infer<typeof BrandSchema>;
export type ProductStatus = z.infer<typeof ProductStatusSchema>;
export type ProductCondition = z.infer<typeof ProductConditionSchema>;
export type CreateProduct = z.infer<typeof CreateProductSchema>;
export type UpdateProduct = z.infer<typeof UpdateProductSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type CreateVariant = z.infer<typeof CreateVariantSchema>;
export type Variant = z.infer<typeof VariantSchema>;
export type AdjustStock = z.infer<typeof AdjustStockSchema>;
export type ReserveStock = z.infer<typeof ReserveStockSchema>;
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type CreatePriceList = z.infer<typeof CreatePriceListSchema>;
export type PriceList = z.infer<typeof PriceListSchema>;
export type CreateTier = z.infer<typeof CreateTierSchema>;
export type PriceTier = z.infer<typeof PriceTierSchema>;
export type ResolvedPrice = z.infer<typeof ResolvedPriceSchema>;
