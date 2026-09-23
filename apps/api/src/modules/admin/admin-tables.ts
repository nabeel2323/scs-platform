import { BadRequestException } from '@nestjs/common';
import { eq, getTableColumns, inArray, sql, SQL } from 'drizzle-orm';
import { alias, AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { DatabaseService } from '../../common/database/database.service';
import { isUuid, isUuidPrefix } from '../../common/utils/uuid';
import { products, categories, brands } from '../catalog/catalog.schema';
import { productImageCount } from '../catalog/product-images';
import { users, organizations, organizationMembers, roles } from '../identity/identity.schema';
import { stores, verificationRequests } from '../merchant/merchant.schema';
import { orders } from '../orders/orders.schema';
import { disputes } from '../reviews/support.schema';
import { auditLogs } from '../audit/audit.schema';
import { AdminListInput, parseAdminListQuery, parseBoolean, parseFilterDate, parseNonnegativeInteger } from './dto/admin-list-query.dto';

type Field = AnyPgColumn | SQL;
type Filter = { field?: Field; kind: 'text' | 'uuid' | 'boolean' | 'contains' | 'min' | 'max' | 'custom' };
interface TableConfig {
  table: PgTable;
  fields: Record<string, Field>;
  joins?: SQL;
  search: string[];
  sorts: string[];
  dates: string[];
  filters: Record<string, Filter>;
  base?: SQL;
  defaultSort?: string;
  defaultDirection?: 'asc' | 'desc';
}
export type AdminTable = 'products' | 'users' | 'merchants' | 'orders' | 'verifications' | 'disputes' | 'audit' | 'categories' | 'brands';

export const safeUserFields = {
  id: users.id, phone: users.phone, email: users.email, fullName: users.fullName,
  locale: users.locale, status: users.status, passwordSetAt: users.passwordSetAt,
  emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt, updatedAt: users.updatedAt,
};
const parentCategory = alias(categories, 'parent_category');
const raisedUser = alias(users, 'raised_user');
const againstUser = alias(users, 'against_user');
const f = (kind: Filter['kind'], field?: Field): Filter => ({ kind, field });
const storeJoin = sql`left join ${stores} on ${products.storeId} = ${stores.id}
  left join ${organizations} on ${stores.orgId} = ${organizations.id}`;
const storeFields = { storeName: stores.displayName, storeSlug: stores.slug, orgName: organizations.name };

export const adminTables: Record<AdminTable, TableConfig> = {
  products: {
    table: products, fields: { ...getTableColumns(products), ...storeFields, imageCount: productImageCount }, joins: storeJoin,
    base: sql`${products.deletedAt} is null`,
    search: ['id', 'title', 'titleAr', 'slug', 'storeName', 'storeSlug', 'orgName'],
    sorts: ['title', 'slug', 'storeName', 'status', 'condition', 'moq', 'imageCount', 'isAvailable'],
    dates: ['createdAt', 'updatedAt', 'publishedAt'],
    filters: { status: f('text'), storeId: f('uuid'), categoryId: f('uuid'), condition: f('text'),
      isAvailable: f('boolean'), hasImages: f('custom'), moqMin: f('min', products.moq), moqMax: f('max', products.moq) },
  },
  users: {
    table: users, fields: safeUserFields,
    search: ['id', 'fullName', 'email', 'phone'], sorts: ['fullName', 'email', 'phone', 'status', 'locale'],
    dates: ['createdAt', 'updatedAt', 'emailVerifiedAt'],
    filters: { status: f('text'), locale: f('text'), orgId: f('custom'), roleId: f('custom'), emailVerified: f('custom') },
  },
  merchants: {
    table: stores, fields: { ...getTableColumns(stores), orgName: organizations.name, orgType: organizations.type,
      verificationRequestId: sql`(select id from verification_requests where store_id = ${stores.id} order by submitted_at desc, id asc limit 1)`,
      storeCount: sql`1`,
      orderCount: sql`(select count(*)::integer from ${orders} where ${orders.storeId} = ${stores.id})`,
      totalVolumeMinor: sql`coalesce((select sum(total_minor) from ${orders} where ${orders.storeId} = ${stores.id}), 0)` },
    joins: sql`left join ${organizations} on ${stores.orgId} = ${organizations.id}`,
    search: ['id', 'displayName', 'slug', 'orgName'], sorts: ['displayName', 'slug', 'orgName', 'status', 'verificationStatus', 'currency', 'orderCount', 'totalVolumeMinor'],
    dates: ['createdAt', 'updatedAt'], filters: { status: f('text'), verificationStatus: f('text'), orgId: f('uuid'), currency: f('text') },
  },
  orders: {
    table: orders, fields: { ...getTableColumns(orders), storeName: stores.displayName, storeSlug: stores.slug, buyerName: users.fullName },
    joins: sql`left join ${stores} on ${orders.storeId} = ${stores.id} left join ${users} on ${orders.buyerId} = ${users.id}`,
    search: ['id', 'storeName', 'storeSlug', 'buyerName', 'status'],
    sorts: ['status', 'storeName', 'buyerName', 'totalMinor', 'currency', 'fulfillmentMethod'], dates: ['createdAt', 'updatedAt'],
    filters: { status: f('text'), storeId: f('uuid'), buyerId: f('uuid'), fulfillmentMethod: f('text'), currency: f('text'),
      totalMin: f('min', orders.totalMinor), totalMax: f('max', orders.totalMinor) },
  },
  verifications: {
    table: verificationRequests, fields: { ...getTableColumns(verificationRequests), ...storeFields, orgType: organizations.type },
    joins: sql`left join ${stores} on ${verificationRequests.storeId} = ${stores.id}
      left join ${organizations} on ${verificationRequests.orgId} = ${organizations.id}`,
    search: ['id', 'storeName', 'storeSlug', 'orgName'], sorts: ['storeName', 'orgName', 'status', 'autoVerified'],
    dates: ['submittedAt', 'reviewedAt', 'resolvedAt'], defaultSort: 'submittedAt',
    filters: { status: f('text'), storeId: f('uuid'), orgId: f('uuid'), reviewedBy: f('uuid'), autoVerified: f('boolean') },
  },
  disputes: {
    table: disputes, fields: { ...getTableColumns(disputes), raisedByName: raisedUser.fullName, againstName: againstUser.fullName },
    joins: sql`left join ${users} as ${sql.identifier('raised_user')} on ${disputes.raisedBy} = ${raisedUser.id}
      left join ${users} as ${sql.identifier('against_user')} on ${disputes.againstId} = ${againstUser.id}`,
    search: ['id', 'orderId', 'reason', 'resolution', 'raisedByName', 'againstName'],
    sorts: ['status', 'orderId', 'raisedByName', 'againstName'], dates: ['createdAt', 'updatedAt', 'resolvedAt'],
    filters: { status: f('text'), orderId: f('uuid'), raisedBy: f('uuid'), againstId: f('uuid'), resolvedBy: f('uuid') },
  },
  audit: {
    table: auditLogs, fields: getTableColumns(auditLogs), search: ['action', 'resource', 'resourceId', 'actorId', 'actorType'],
    sorts: ['action', 'resource', 'resourceId', 'actorId', 'actorType'], dates: ['createdAt'],
    filters: { action: f('contains'), resource: f('contains'), resourceId: f('uuid'), actorId: f('uuid'), actorType: f('text') },
  },
  categories: {
    table: categories, fields: { ...getTableColumns(categories), parentName: parentCategory.name, storeName: stores.displayName },
    joins: sql`left join ${categories} as ${sql.identifier('parent_category')} on ${categories.parentId} = ${parentCategory.id}
      left join ${stores} on ${categories.storeId} = ${stores.id}`,
    search: ['id', 'name', 'nameAr', 'slug', 'path', 'parentName'],
    sorts: ['name', 'slug', 'parentName', 'sortOrder', 'productCount', 'isActive'], dates: ['createdAt', 'updatedAt'],
    defaultSort: 'sortOrder', defaultDirection: 'asc',
    filters: { isActive: f('boolean'), scope: f('custom'), storeId: f('uuid'), parentId: f('uuid'), rootsOnly: f('custom'), excludeTreeId: f('custom') },
  },
  brands: {
    table: brands, fields: getTableColumns(brands),
    search: ['id', 'name', 'nameAr', 'slug'],
    sorts: ['name', 'slug', 'isActive'], dates: ['createdAt', 'updatedAt'],
    defaultSort: 'name', defaultDirection: 'asc',
    filters: { isActive: f('boolean') },
  },
};

export function uuidPredicate(field: Field, value: string): SQL {
  if (isUuid(value)) return sql`${field} = ${value}`;
  if (isUuidPrefix(value)) return sql`${field}::text ilike ${value + '%'}`;
  throw new BadRequestException('ID filter must be a full UUID or a hex prefix');
}
export function literalContains(field: Field, value: string): SQL {
  const term = '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
  return sql`${field}::text ilike ${term}`;
}

export function buildAdminList(name: AdminTable, input: AdminListInput) {
  const config = adminTables[name];
  const query = parseAdminListQuery(input, Object.keys(config.filters), ['id', ...config.sorts, ...config.dates], config.dates,
    config.defaultSort, config.defaultDirection);
  const conditions: SQL[] = config.base ? [config.base] : [];
  const filters = query.filters;
  if (query.search) conditions.push(sql`(${sql.join(config.search.map(key => literalContains(config.fields[key]!, query.search!)), sql` or `)})`);
  for (const [key, value] of Object.entries(filters)) {
    const definition = config.filters[key]!;
    const field = definition.field ?? config.fields[key]!;
    switch (definition.kind) {
      case 'uuid': conditions.push(uuidPredicate(field, value)); break;
      case 'boolean': conditions.push(sql`${field} = ${parseBoolean(value)}`); break;
      case 'text': conditions.push(sql`${field} = ${value}`); break;
      case 'contains': conditions.push(literalContains(field, value)); break;
      case 'min': conditions.push(sql`${field} >= ${parseNonnegativeInteger(value)}`); break;
      case 'max': conditions.push(sql`${field} <= ${parseNonnegativeInteger(value)}`); break;
    }
  }
  for (const prefix of ['moq', 'total']) {
    const min = filters[prefix + 'Min'], max = filters[prefix + 'Max'];
    if (min && max && Number(min) > Number(max)) throw new BadRequestException('Minimum cannot exceed maximum');
  }
  if (filters['currency'] && !/^[A-Z]{3}$/.test(filters['currency'])) throw new BadRequestException('Currency must be a three-letter uppercase code');
  if (name === 'orders' && (filters['totalMin'] || filters['totalMax'] || query.sortBy === 'totalMinor') && !filters['currency']) {
    throw new BadRequestException('Select a currency before filtering or sorting order amounts');
  }
  if (filters['hasImages']) conditions.push(parseBoolean(filters['hasImages']) ? sql`${productImageCount} > 0` : sql`${productImageCount} = 0`);
  if (name === 'users') {
    if (filters['emailVerified']) conditions.push(parseBoolean(filters['emailVerified']) ? sql`${users.emailVerifiedAt} is not null` : sql`${users.emailVerifiedAt} is null`);
    const membership = [sql`${organizationMembers.userId} = ${users.id}`];
    if (filters['orgId']) membership.push(uuidPredicate(organizationMembers.orgId, filters['orgId']));
    if (filters['roleId']) membership.push(uuidPredicate(organizationMembers.roleId, filters['roleId']));
    if (membership.length > 1) conditions.push(sql`exists (select 1 from ${organizationMembers} where ${sql.join(membership, sql` and `)})`);
  }
  if (name === 'categories') {
    if (filters['scope']) {
      if (!['all', 'global', 'store'].includes(filters['scope'])) throw new BadRequestException('Invalid category scope');
      if (filters['scope'] !== 'all') conditions.push(filters['scope'] === 'global' ? sql`${categories.storeId} is null` : sql`${categories.storeId} is not null`);
    }
    if (filters['rootsOnly']) conditions.push(parseBoolean(filters['rootsOnly']) ? sql`${categories.parentId} is null` : sql`${categories.parentId} is not null`);
    if (filters['excludeTreeId']) {
      if (!isUuid(filters['excludeTreeId'])) throw new BadRequestException('excludeTreeId must be a UUID');
      conditions.push(sql`${categories.id} not in (with recursive descendants as (
        select id from categories where id = ${filters['excludeTreeId']}::uuid
        union select c.id from categories c join descendants d on c.parent_id = d.id
      ) select id from descendants)`);
    }
  }
  const from = query.from ? parseFilterDate(query.from) : undefined;
  const to = query.to ? parseFilterDate(query.to) : undefined;
  if (from && to && from > to) throw new BadRequestException('From date cannot exceed to date');
  const dateField = config.fields[query.dateField]!;
  if (from) conditions.push(sql`${dateField} >= ${from.toISOString()}`);
  if (to) {
    if (query.to!.length === 10) conditions.push(sql`${dateField} < ${new Date(to.getTime() + 86400000).toISOString()}`);
    else conditions.push(sql`${dateField} <= ${to.toISOString()}`);
  }
  const where = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
  const source = sql`from ${config.table} ${config.joins ?? sql``} ${where}`;
  const selection = sql.join(Object.entries(config.fields).map(([key, field]) => sql`${field} as ${sql.identifier(key)}`), sql`, `);
  const direction = query.sortDir === 'asc' ? sql`asc` : sql`desc`;
  const secondary = name === 'categories' && query.sortBy === 'sortOrder' ? sql`${categories.name} asc, ` : sql``;
  return {
    query,
    rows: sql`select ${selection} ${source} order by ${config.fields[query.sortBy]!} ${direction} nulls last,
      ${secondary}${config.fields['id']!} asc limit ${query.limit} offset ${query.offset}`,
    count: sql`select count(*)::integer as total ${source}`,
  };
}

export async function listAdminTable(db: DatabaseService['db'], name: AdminTable, input: AdminListInput) {
  const built = buildAdminList(name, input);
  return db.transaction(async tx => {
    const rows = await tx.execute(built.rows);
    const count = await tx.execute<{ total: number }>(built.count);
    const data = rows.rows.map(row => {
      const result: Record<string, unknown> = { ...row };
      for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'string' && (key.endsWith('Minor') || ['imageCount', 'productCount', 'moq', 'sortOrder', 'storeCount', 'orderCount'].includes(key))) result[key] = Number(value);
      }
      return result;
    });
    if (name === 'users' && data.length) {
      const memberships = await tx.select({ userId: organizationMembers.userId, orgId: organizationMembers.orgId,
        orgName: organizations.name, orgType: organizations.type, roleId: roles.id, roleKey: roles.key,
        roleName: roles.name, status: organizationMembers.status, createdAt: organizationMembers.createdAt,
      }).from(organizationMembers).leftJoin(organizations, eq(organizationMembers.orgId, organizations.id))
        .leftJoin(roles, eq(organizationMembers.roleId, roles.id))
        .where(inArray(organizationMembers.userId, data.map(row => String(row['id']))));
      const byUser = new Map<string, typeof memberships>();
      for (const membership of memberships) {
        const list = byUser.get(membership.userId) ?? [];
        list.push(membership); byUser.set(membership.userId, list);
      }
      for (const row of data) row['organizations'] = byUser.get(String(row['id'])) ?? [];
    }
    return { data, total: Number(count.rows[0]?.total ?? 0), limit: built.query.limit, offset: built.query.offset };
  }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
}
