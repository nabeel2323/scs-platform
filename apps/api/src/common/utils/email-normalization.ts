/**
 * Email normalization, masking, and hashing utility.
 *
 * Provides consistent email handling across registration, login, OTP request,
 * verification, account linking, and database lookup.
 *
 * Security:
 * - Never logs full email addresses in error messages.
 * - Hashing uses SHA-256 for audit log storage (no raw identifiers persisted).
 * - Normalization is applied before any DB comparison to prevent case-variant
 *   duplicates from bypassing uniqueness checks.
 */

import { BadRequestException } from '@nestjs/common';
import crypto from 'node:crypto';

/**
 * RFC 5321 basic email format check.
 *
 * This is intentionally a structural check (local@domain with valid characters),
 * not a full RFC 5322 parse. The class-validator `@IsEmail()` decorator on DTOs
 * provides the same check at the API boundary; this function is the defence-in-depth
 * layer for service-to-service and internal callers.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize an email address for consistent storage and comparison.
 *
 * - Trims leading/trailing whitespace.
 * - Lowercases the entire address (RFC 5321 §2.4: local-part is technically
 *   case-sensitive, but in practice every major provider treats it as
 *   case-insensitive, and normalizing eliminates a class of duplicate-account bugs).
 * - Rejects addresses that fail basic structural validation.
 *
 * @param raw - Raw email input from user or system.
 * @returns Normalized (lowercased, trimmed) email.
 * @throws BadRequestException if the email is empty or structurally invalid.
 */
export function normalizeEmail(raw: string): string {
  if (!raw || typeof raw !== 'string') {
    throw new BadRequestException('Email address is required');
  }

  const normalized = raw.trim().toLowerCase();

  if (!EMAIL_RE.test(normalized)) {
    throw new BadRequestException('Invalid email address format');
  }

  return normalized;
}

/**
 * Mask an email address for safe logging (PII redaction).
 *
 * Shows the first character of the local part, the domain in full,
 * and replaces the rest with asterisks.
 *
 * Examples:
 * - `alice@example.com` → `a****@example.com`
 * - `ab@domain.org`     → `a*@domain.org`
 * - `a@example.com`     → `*@example.com`
 *
 * @param email - Normalized email address.
 * @returns Masked email safe for log output.
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***';

  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';

  if (local.length <= 1) {
    return `*@${domain}`;
  }

  const visible = local[0];
  const masked = '*'.repeat(Math.min(local.length - 1, 4));
  return `${visible}${masked}@${domain}`;
}

/**
 * Compute a SHA-256 hash of a normalized email for audit log storage.
 *
 * The hash is a one-way commitment: it allows correlation of audit entries
 * to the same email without storing the raw PII in the audit table.
 *
 * @param email - Normalized email address (must be pre-normalized).
 * @returns Hex-encoded SHA-256 hash (64 characters).
 */
export function hashEmail(email: string): string {
  return crypto
    .createHash('sha256')
    .update(email)
    .digest('hex');
}
