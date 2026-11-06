import { pgTable, uuid, varchar, char, boolean, timestamp, text, inet, jsonb, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
  phone: varchar('phone', { length: 20 }).unique(), // nullable since 0064 — email-only accounts allowed
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
  inviteCode: varchar('invite_code', { length: 12 }).unique(), // shareable code to join this org (migration 0016)
  isActive: boolean('is_active').notNull().default(true), // soft-delete: admins can deactivate merchants
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

// ── Drizzle relational query definitions ─────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  orgMemberships: many(organizationMembers),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  members: many(organizationMembers),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  user: one(users, { fields: [organizationMembers.userId], references: [users.id] }),
  role: one(roles, { fields: [organizationMembers.roleId], references: [roles.id] }),
  organization: one(organizations, { fields: [organizationMembers.orgId], references: [organizations.id] }),
}));

/**
 * Organization update requests — merchants submit proposed changes to legal
 * business details; admins review and approve/reject them. On approval the
 * payload is applied to the organizations row. (migration 0022)
 */
export const organizationUpdateRequests = pgTable('organization_update_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  // Proposed field changes: { name?, legalName?, taxId? }
  payload: jsonb('payload').notNull().default({}),
  status: varchar('status', { length: 12 }).notNull().default('PENDING'), // PENDING | APPROVED | REJECTED
  decisionNotes: text('decision_notes'),
  decidedBy: uuid('decided_by').references(() => users.id),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
 * Server-issued device trust credential (migration 0066, audit finding S-1).
 *
 * Trust is anchored on a 256-bit secret the SERVER generates and only the
 * server validates. The client never supplies a trust-bearing identifier:
 * the old path (localStorage UUID -> X-Device-Id -> sessions.device_id) is
 * removed, because a value the client chooses can be copied between browsers
 * and permanently bypasses the second factor.
 *
 * Rows store ONLY the SHA-256 hex digest of the secret (a database breach
 * therefore yields nothing replayable) plus its owner, its expiry horizon and
 * its revocation state. `credentialHash` is unique, which makes cross-user
 * reuse structurally impossible rather than merely checked in code.
 *
 * Existing `sessions.device_id` values are deliberately NOT backfilled into
 * this table: promoting client-chosen strings would carry the exact weakness
 * being removed into the new model. The consequence is that every browser is
 * untrusted until it completes OTP once and enrols — which is why real OTP
 * delivery is a prerequisite for applying migration 0066 to staging.
 */
export const deviceCredentials = pgTable('device_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // sha-256 hex of the server-issued credential. Never the credential itself.
  credentialHash: char('credential_hash', { length: 64 }).notNull().unique(),
  // Non-secret display label only; never used in a security decision.
  deviceLabel: varchar('device_label', { length: 160 }),
  /**
   * The session whose successful authentication enrolled this device.
   * SET NULL (not cascade) so credential rows survive session pruning and
   * stay auditable, while explicit revocation of that session still
   * de-trusts the device via revoke-by-session.
   */
  createdBySession: uuid('created_by_session').references(() => sessions.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Sliding horizon, refreshed on each validated use. Capped by hardExpiresAt. */
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  /** Absolute ceiling fixed at issue time; sliding never extends past it. */
  hardExpiresAt: timestamp('hard_expires_at', { withTimezone: true }).notNull(),
  /** NULL = live. Revoked rows are retained so the digest keeps being rejected. */
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  // LOGOUT | SESSION_REVOKED | MANUAL | ROTATION_REUSE | EXPIRED
  revokedReason: varchar('revoked_reason', { length: 32 }),
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

/**
 * Account link/unlink audit log (migration 0064_email_identity, 0065_hmac_identifier_hash).
 * Records every identifier link and unlink operation for security audit.
 * identifierHash is a versioned HMAC-SHA256 digest of the normalized identifier
 * (v2: keyed with domain separation) — never stores raw phone/email values.
 * Legacy v1 rows use unsalted SHA-256 (pre-migration 0065).
 */
export const accountLinkLog = pgTable('account_link_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 16 }).notNull(), // LINK | UNLINK
  identifierType: varchar('identifier_type', { length: 8 }).notNull(), // PHONE | EMAIL
  identifierHash: varchar('identifier_hash', { length: 68 }).notNull(),
  hashVersion: integer('hash_version').notNull().default(2),
  performedBy: uuid('performed_by'), // NULL for self-service
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
