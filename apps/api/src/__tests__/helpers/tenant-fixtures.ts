import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

export interface TenantFixtureUser {
  id?: string;
  fullName: string;
}

export interface TwoTenantIdentityFixtureOptions {
  /** Short, human-readable prefix used in organization/store names and slugs. */
  prefix: string;
  country?: string;
  currency?: string;
  storeStatus?: string;
  verificationStatus?: string;
  users: {
    buyerA: TenantFixtureUser;
    buyerB: TenantFixtureUser;
    ownerA: TenantFixtureUser;
    ownerB: TenantFixtureUser;
    additional?: Record<string, TenantFixtureUser>;
  };
  organizationNames?: { a?: string; b?: string };
  storeNames?: { a?: string; b?: string };
}

export interface TwoTenantIdentityFixture {
  orgA: string;
  orgB: string;
  storeA: string;
  storeB: string;
  users: {
    buyerA: string;
    buyerB: string;
    ownerA: string;
    ownerB: string;
    [key: string]: string;
  };
}

/**
 * Creates the minimum two-tenant identity graph used by PostgreSQL integration
 * tests: two organizations, two buyers, two merchant owners, two active stores,
 * and one ACTIVE OWNER store_members row per store.
 *
 * All writes are scoped to the caller's disposable test database and committed
 * atomically. This helper must never be pointed at the shared Supabase project.
 */
export async function seedTwoTenantIdentityFixture(
  pool: Pool,
  options: TwoTenantIdentityFixtureOptions,
): Promise<TwoTenantIdentityFixture> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
  const country = options.country ?? 'SY';
  const currency = options.currency ?? 'SAR';
  const storeStatus = options.storeStatus ?? 'ACTIVE';
  const verificationStatus = options.verificationStatus ?? 'VERIFIED';
  const orgA = randomUUID();
  const orgB = randomUUID();
  const storeA = randomUUID();
  const storeB = randomUUID();
  const users: Record<string, string> = {};

  const userEntries: Array<[string, TenantFixtureUser]> = [
    ['buyerA', options.users.buyerA],
    ['buyerB', options.users.buyerB],
    ['ownerA', options.users.ownerA],
    ['ownerB', options.users.ownerB],
    ...Object.entries(options.users.additional ?? {}),
  ];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO organizations (id, type, name, country)
       VALUES ($1, 'WHOLESALER', $2, $5), ($3, 'WHOLESALER', $4, $5)`,
      [
        orgA,
        options.organizationNames?.a ?? `${options.prefix} Org A`,
        orgB,
        options.organizationNames?.b ?? `${options.prefix} Org B`,
        country,
      ],
    );

    const userValues: unknown[] = [];
    const userRows = userEntries.map(([key, user], index) => {
      const id = user.id ?? randomUUID();
      users[key] = id;
      const phoneSuffix = `${suffix.slice(0, 4)}${String(index).padStart(3, '0')}`;
      userValues.push(id, user.fullName, `+1555${phoneSuffix}`);
      const offset = index * 3;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
    });
    await client.query(
      `INSERT INTO users (id, full_name, phone) VALUES ${userRows.join(', ')}`,
      userValues,
    );

    const slugPrefix = options.prefix.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await client.query(
      `INSERT INTO stores
         (id, org_id, slug, display_name, currency, status, verification_status)
       VALUES
         ($1, $2, $3, $4, $9, $10, $11),
         ($5, $6, $7, $8, $9, $10, $11)`,
      [
        storeA,
        orgA,
        `${slugPrefix}-a-${suffix}`,
        options.storeNames?.a ?? `${options.prefix} Store A`,
        storeB,
        orgB,
        `${slugPrefix}-b-${suffix}`,
        options.storeNames?.b ?? `${options.prefix} Store B`,
        currency,
        storeStatus,
        verificationStatus,
      ],
    );

    await client.query(
      `INSERT INTO store_members (id, store_id, user_id, role, status)
       VALUES ($1, $2, $3, 'OWNER', 'ACTIVE'), ($4, $5, $6, 'OWNER', 'ACTIVE')`,
      [randomUUID(), storeA, users.ownerA, randomUUID(), storeB, users.ownerB],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return { orgA, orgB, storeA, storeB, users };
}
