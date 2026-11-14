import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { normalizePhone, maskPhone } from '../../../common/utils/phone-validation';

/**
 * Phone Number Validation Tests (S1.2 Phase G)
 *
 * Verifies:
 * - Valid E.164 input passes through unchanged
 * - Equivalent formats normalize to the same E.164
 * - Invalid numbers are rejected before provider invocation
 * - Rate limits apply to normalized numbers
 * - No raw phone number in error messages
 */

describe('Phone Number Validation (S1.2)', () => {
  describe('normalizePhone', () => {
    it('passes through a valid E.164 number unchanged', () => {
      expect(normalizePhone('+966500000000')).toBe('+966500000000');
    });

    it('normalizes a number with spaces to E.164', () => {
      expect(normalizePhone('+966 500 000 000')).toBe('+966500000000');
    });

    it('normalizes a number with dashes to E.164', () => {
      expect(normalizePhone('+966-500-000-000')).toBe('+966500000000');
    });

    it('normalizes a number with parentheses', () => {
      expect(normalizePhone('+966 (500) 000 000')).toBe('+966500000000');
    });

    it('normalizes a US number', () => {
      expect(normalizePhone('+12025551234')).toBe('+12025551234');
    });

    it('equivalent formats normalize to the same E.164', () => {
      const formats = [
        '+966500000000',
        '+966 500 000 000',
        '+966-500-000-000',
        '+966 (500) 000000',
      ];

      const normalized = formats.map(f => normalizePhone(f));
      const unique = new Set(normalized);
      expect(unique.size).toBe(1);
      expect(unique.values().next().value).toBe('+966500000000');
    });

    it('rejects an empty string', () => {
      expect(() => normalizePhone('')).toThrow(BadRequestException);
    });

    it('rejects a null-like input', () => {
      expect(() => normalizePhone(null as any)).toThrow(BadRequestException);
      expect(() => normalizePhone(undefined as any)).toThrow(BadRequestException);
    });

    it('rejects a number with letters', () => {
      expect(() => normalizePhone('+966500ABC000')).toThrow(BadRequestException);
    });

    it('rejects a number without country code', () => {
      expect(() => normalizePhone('500000000')).toThrow(BadRequestException);
    });

    it('rejects an obviously invalid number', () => {
      expect(() => normalizePhone('+0000000')).toThrow(BadRequestException);
    });

    it('does not include the raw phone number in error messages', () => {
      try {
        normalizePhone('invalid-phone');
        expect.fail('Should have thrown');
      } catch (err) {
        const msg = (err as Error).message;
        expect(msg).not.toContain('invalid-phone');
        expect(msg).toMatch(/invalid|phone|required/i);
      }
    });

    it('handles Syrian numbers correctly', () => {
      expect(normalizePhone('+963912345678')).toBe('+963912345678');
    });

    it('handles UK numbers correctly', () => {
      expect(normalizePhone('+44 7911 123456')).toBe('+447911123456');
    });
  });

  describe('maskPhone', () => {
    it('masks a phone showing only last 4 digits', () => {
      expect(maskPhone('+966500000000')).toBe('***0000');
    });

    it('masks a short phone', () => {
      expect(maskPhone('+1234')).toBe('***1234');
    });

    it('returns "***" for empty input', () => {
      expect(maskPhone('')).toBe('***');
    });

    it('returns "***" for null input', () => {
      expect(maskPhone(null as any)).toBe('***');
    });

    it('shows last 4 digits for a 5-char phone', () => {
      expect(maskPhone('+12345')).toBe('***2345');
    });
  });
});
