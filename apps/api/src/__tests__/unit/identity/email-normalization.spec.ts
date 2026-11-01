/**
 * Email normalization utility tests.
 *
 * Covers:
 * - normalizeEmail: lowercase, trim, structural validation
 * - maskEmail: PII redaction for logging
 * - hashEmail: SHA-256 one-way commitment for audit storage
 */

import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { normalizeEmail, maskEmail, hashEmail } from '../../../common/utils/email-normalization';

describe('normalizeEmail', () => {
  it('lowercases and trims a valid email', () => {
    expect(normalizeEmail('  Alice@Example.COM  ')).toBe('alice@example.com');
  });

  it('accepts a minimal valid email', () => {
    expect(normalizeEmail('a@b.c')).toBe('a@b.c');
  });

  it('handles already-normalized input', () => {
    expect(normalizeEmail('user@domain.com')).toBe('user@domain.com');
  });

  it('preserves dots in local part', () => {
    expect(normalizeEmail('first.last@example.com')).toBe('first.last@example.com');
  });

  it('preserves plus addressing', () => {
    expect(normalizeEmail('user+tag@example.com')).toBe('user+tag@example.com');
  });

  it('rejects empty string', () => {
    expect(() => normalizeEmail('')).toThrow(BadRequestException);
  });

  it('rejects null/undefined', () => {
    expect(() => normalizeEmail(null as any)).toThrow(BadRequestException);
    expect(() => normalizeEmail(undefined as any)).toThrow(BadRequestException);
  });

  it('rejects non-string input', () => {
    expect(() => normalizeEmail(123 as any)).toThrow(BadRequestException);
  });

  it('rejects email without @', () => {
    expect(() => normalizeEmail('userexample.com')).toThrow(BadRequestException);
  });

  it('rejects email without domain', () => {
    expect(() => normalizeEmail('user@')).toThrow(BadRequestException);
  });

  it('rejects email without local part', () => {
    expect(() => normalizeEmail('@example.com')).toThrow(BadRequestException);
  });

  it('rejects email with spaces', () => {
    expect(() => normalizeEmail('user @example.com')).toThrow(BadRequestException);
  });

  it('rejects email without TLD', () => {
    expect(() => normalizeEmail('user@domain')).toThrow(BadRequestException);
  });
});

describe('maskEmail', () => {
  it('masks a typical email showing first char and domain', () => {
    expect(maskEmail('alice@example.com')).toBe('a****@example.com');
  });

  it('masks a two-char local part showing only first char', () => {
    expect(maskEmail('ab@domain.org')).toBe('a*@domain.org');
  });

  it('masks a single-char local part', () => {
    expect(maskEmail('a@example.com')).toBe('*@example.com');
  });

  it('caps masking at 4 asterisks for long local parts', () => {
    expect(maskEmail('longusername@example.com')).toBe('l****@example.com');
  });

  it('returns *** for empty string', () => {
    expect(maskEmail('')).toBe('***');
  });

  it('returns *** for string without @', () => {
    expect(maskEmail('no-at-sign')).toBe('***');
  });

  it('returns *** for null/undefined', () => {
    expect(maskEmail(null as any)).toBe('***');
    expect(maskEmail(undefined as any)).toBe('***');
  });
});

describe('hashEmail', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = hashEmail('test@example.com');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash for the same input (deterministic)', () => {
    expect(hashEmail('user@domain.com')).toBe(hashEmail('user@domain.com'));
  });

  it('produces different hashes for different emails', () => {
    expect(hashEmail('alice@example.com')).not.toBe(hashEmail('bob@example.com'));
  });

  it('is case-sensitive (caller must pre-normalize)', () => {
    // hashEmail does NOT normalize — that is the caller's responsibility.
    // Different cases produce different hashes, which is why normalizeEmail
    // must be applied first.
    expect(hashEmail('User@Example.com')).not.toBe(hashEmail('user@example.com'));
  });

  it('is a one-way function (cannot recover email from hash)', () => {
    const hash = hashEmail('secret@example.com');
    // The hash is 64 hex chars — no way to reverse to the original email
    expect(hash).not.toContain('secret');
    expect(hash).not.toContain('example.com');
  });
});
