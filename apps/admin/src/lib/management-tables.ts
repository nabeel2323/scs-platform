export type ManagementEntity = 'products' | 'users' | 'merchants' | 'orders' | 'verification' | 'disputes' | 'audit' | 'categories' | 'brands' | 'offers';
export type FilterDefinition = { key: string; label: string; options?: string[]; type?: 'number' | 'date' };
export interface ManagementConfig {
  title: string;
  endpoint: string;
  permission: string;
  columns: string[];
  sorts: string[];
  dates: string[];
  filters: FilterDefinition[];
  defaultSort?: string;
  defaultDirection?: string;
}
export const fieldLabel = (key: string) => ({ moq: 'MOQ', moqMin: 'Minimum MOQ', moqMax: 'Maximum MOQ',
  totalMin: 'Minimum total (minor units)', totalMax: 'Maximum total (minor units)', totalMinor: 'Total',
  isAvailable: 'Available', isActive: 'Active', imageCount: 'Images', fullName: 'Name', storeName: 'Store',
  orgName: 'Organization', autoVerified: 'Auto-verified', reviewedBy: 'Reviewer ID',
} as Record<string, string>)[key] || key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()).replace(/ Id$/, ' ID');
const text = (...keys: string[]): FilterDefinition[] => keys.map(key => ({ key, label: fieldLabel(key) }));
const select = (key: string, options: string[]): FilterDefinition => ({ key, label: fieldLabel(key), options });
const boolean = (key: string) => select(key, ['true', 'false']);
const number = (key: string): FilterDefinition => ({ key, label: fieldLabel(key), type: 'number' });
const dates = ['createdAt', 'updatedAt'];
const productSorts = ['title', 'slug', 'storeName', 'condition', 'moq', 'imageCount', 'status', 'isAvailable'];
const merchantSorts = ['displayName', 'slug', 'orgName', 'status', 'verificationStatus', 'currency'];
const userSorts = ['fullName', 'email', 'phone', 'status', 'locale'];
const orderSorts = ['status', 'storeName', 'buyerName', 'totalMinor', 'currency', 'fulfillmentMethod'];
const auditSorts = ['action', 'resource', 'resourceId', 'actorId', 'actorType'];
const categorySorts = ['name', 'slug', 'parentName', 'sortOrder', 'productCount', 'isActive'];
const brandSorts = ['name', 'slug', 'isActive'];
export const managementTables: Record<ManagementEntity, ManagementConfig> = {
  products: {
    title: 'Product Moderation', endpoint: 'products', permission: 'admin:merchants:read',
    columns: [...productSorts, 'publishedAt', ...dates], sorts: productSorts, dates: [...dates, 'publishedAt'],
    filters: [select('status', ['DRAFT', 'ACTIVE', 'REJECTED']), ...text('storeId', 'categoryId'),
      select('condition', ['NEW', 'USED', 'REFURBISHED']), boolean('isAvailable'), boolean('hasImages'), number('moqMin'), number('moqMax')],
  },
  users: {
    title: 'User Management', endpoint: 'users', permission: 'admin:users:read', columns: [...userSorts, 'emailVerifiedAt', ...dates],
    sorts: userSorts, dates: [...dates, 'emailVerifiedAt'],
    filters: [select('status', ['ACTIVE', 'SUSPENDED', 'INACTIVE']), ...text('locale', 'orgId', 'roleId'), boolean('emailVerified')],
  },
  merchants: {
    title: 'Merchant Management', endpoint: 'merchants', permission: 'admin:merchants:read', columns: [...merchantSorts, ...dates],
    sorts: merchantSorts, dates,
    filters: [select('status', ['DRAFT', 'ACTIVE', 'SUSPENDED', 'INACTIVE']),
      select('verificationStatus', ['PENDING', 'REVIEW', 'VERIFIED', 'REJECTED']), ...text('orgId', 'currency')],
  },
  orders: {
    title: 'Order Monitor', endpoint: 'orders', permission: 'admin:orders:read', columns: ['id', ...orderSorts, ...dates], sorts: orderSorts, dates,
    filters: [select('status', ['SUBMITTED', 'PENDING_CONFIRMATION', 'ACCEPTED', 'PARTIALLY_ACCEPTED', 'PREPARING', 'READY', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DISPUTED']),
      ...text('storeId', 'buyerId', 'fulfillmentMethod', 'currency'), number('totalMin'), number('totalMax')],
  },
  verification: {
    title: 'Verification Queue', endpoint: 'verification-queue', permission: 'merchant:verification:review',
    columns: ['storeName', 'orgName', 'status', 'autoVerified', 'submittedAt', 'reviewedAt', 'resolvedAt'],
    sorts: ['storeName', 'orgName', 'status', 'autoVerified'], dates: ['submittedAt', 'reviewedAt', 'resolvedAt'], defaultSort: 'submittedAt',
    filters: [select('status', ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'REVISION']), ...text('storeId', 'orgId', 'reviewedBy'), boolean('autoVerified')],
  },
  disputes: {
    title: 'Dispute Resolution', endpoint: 'disputes', permission: 'support:disputes:resolve',
    columns: ['id', 'orderId', 'raisedByName', 'againstName', 'status', 'reason', ...dates, 'resolvedAt'],
    sorts: ['orderId', 'raisedByName', 'againstName', 'status'], dates: [...dates, 'resolvedAt'],
    filters: [select('status', ['OPEN', 'EVIDENCE', 'RESPONSE', 'REVIEW', 'RESOLVED', 'CLOSED']), ...text('orderId', 'raisedBy', 'againstId', 'resolvedBy')],
  },
  audit: {
    title: 'Audit Log', endpoint: 'audit-logs', permission: 'admin:audit:read', columns: ['createdAt', ...auditSorts], sorts: auditSorts, dates: ['createdAt'],
    filters: text('action', 'resource', 'resourceId', 'actorId', 'actorType'),
  },
  categories: {
    title: 'Category Management', endpoint: 'categories', permission: 'catalog:categories:write',
    columns: ['name', 'nameAr', 'slug', 'path', 'parentName', 'storeName', 'sortOrder', 'productCount', 'isActive', ...dates], sorts: categorySorts, dates,
    defaultSort: 'sortOrder', defaultDirection: 'asc',
    filters: [boolean('isActive'), select('scope', ['all', 'global', 'store']), ...text('storeId', 'parentId'), boolean('rootsOnly')],
  },
  brands: {
    title: 'Brand Management', endpoint: 'brands', permission: 'catalog:brands:manage',
    columns: ['name', 'nameAr', 'slug', 'logoUrl', 'isActive', ...dates], sorts: brandSorts, dates,
    defaultSort: 'name', defaultDirection: 'asc',
    filters: [boolean('isActive')],
  },
  offers: {
    title: 'Offer Governance', endpoint: 'offers', permission: 'catalog:offers:govern',
    columns: ['storeName', 'productTitle', 'variantSku', 'status', 'basePriceMinor', 'moq', 'leadTimeDays', 'isAvailable', 'activatedAt', ...dates],
    sorts: ['status', 'storeName', 'basePriceMinor', 'moq', 'leadTimeDays', 'isAvailable'],
    dates: ['createdAt', 'updatedAt', 'activatedAt', 'reviewedAt'],
    defaultSort: 'createdAt', defaultDirection: 'desc',
    filters: [select('status', ['DRAFT', 'PROPOSED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'WITHDRAWN']),
      ...text('storeId', 'productId', 'currency'), boolean('isAvailable')],
  },
};
