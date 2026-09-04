import { pgTable, uuid, varchar, char, boolean, timestamp, text, inet } from 'drizzle-orm/pg-core';

/**
 * Identity & access schema (migration 0001_identity)
 *
 * Phone-first identity with multi-org support.
 * - Users may belong to multiple Organizations via organization_members
 * - Roles are named permission sets
 * - Permission keys are module:resource:action
 * - Sessions track refresh-token chain with rotation + reuse detection
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  phone: varchar('phone', { length: 20 }).notNull().unique(),
  email: varchar('email', { length: 254 }).unique(),
  fullName: varchar('full_name', { length: 160 }).notNull(),
  locale: varchar('locale', { length: 10 }).notNull().default('en'),
  status: varchar('status', { length: 12 }).notNull().default('ACTIVE'),
  // Dual authentication fields (migration 0010)
  passwordHash: varchar('password_hash', { length: 255 }),
  passwordSetAt: timestamp('password_set_at', { withTimezone: true }),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  type: varchar('type', { length: 12 }).notNull(), // WHOLESALER, RETAILER, LOGISTICS, PLATFORM
  name: varchar('name', { length: 160 }).notNull(),
  legalName: varchar('legal_name', { length: 200 }),
  taxId: varchar('tax_id', { length: 64 }),
  country: char('country', { length: 2 }).notNull(), // ISO 3166-1 alpha-2
  verificationStatus: varchar('verification_status', { length: 12 }).notNull().default('PENDING'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey(),
  key: varchar('key', { length: 40 }).notNull().unique(), // OWNER, ADMIN, MANAGER, STAFF, DRIVER, PLATFORM_ADMIN
  name: varchar('name', { length: 80 }).notNull(),
});

export const permissions = pgTable('permissions', {
  id: uuid('id').primaryKey(),
  key: varchar('key', { length: 64 }).notNull().unique(), // module:resource:action
});

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: uuid('permission_id')
    .notNull()
    .references(() => permissions.id, { onDelete: 'cascade' }),
});

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id')
    .notNull()
    .references(() => roles.id),
  status: varchar('status', { length: 12 }).notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: char('token_hash', { length: 64 }).notNull().unique(), // sha-256 of refresh token
  device: varchar('device', { length: 160 }),
  deviceId: varchar('device_id', { length: 128 }), // Device identifier for trust logic (migration 0010)
  ip: inet('ip'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedBy: uuid('replaced_by').references((): any => sessions.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Credential audit log — tracks password/email changes for security auditing
 * Added in migration 0010_dual_auth
 */
export const credentialAuditLog = pgTable('credential_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 32 }).notNull(), // PASSWORD_SET, PASSWORD_CHANGE, EMAIL_CHANGE, CREDENTIAL_SETUP
  deviceId: varchar('device_id', { length: 128 }),
  ipAddress: inet('ip_address'),
  userAgent: varchar('user_agent', { length: 256 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
