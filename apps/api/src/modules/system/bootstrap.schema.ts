/**
 * Bootstrap authorization schema (migration 0067_bootstrap_authorization).
 *
 * Holds short-lived, single-use out-of-band bootstrap authorizations used to
 * provision the platform's initial Super Admin. The plaintext token is never
 * stored -- only its SHA-256 digest.
 */

import { pgTable, uuid, char, timestamp, boolean, varchar } from 'drizzle-orm/pg-core';

export const bootstrapAuthorizations = pgTable('bootstrap_authorizations', {
  id: uuid('id').primaryKey(),
  tokenDigest: char('token_digest', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  consumed: boolean('consumed').notNull().default(false),
  purpose: varchar('purpose', { length: 40 }).notNull().default('super_admin_bootstrap'),
  createdBy: varchar('created_by', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** Stamped when the authorization was issued after successful owner OTP
   * verification. NULL for break-glass / CLI-issued authorizations. Copied to
   * the new user's email_verified_at on consumption. */
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
});
