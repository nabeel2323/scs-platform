/**
 * Unit tests — CatalogValidationService shared validation logic.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CatalogValidationService } from '../../../modules/catalog/catalog.validation-service';

describe('CatalogValidationService', () => {
  let svc: CatalogValidationService;

  beforeEach(() => { svc = new CatalogValidationService(); });

  describe('validateSlug', () => {
    it('accepts valid slugs', () => {
      expect(svc.validateSlug('laptops').valid).toBe(true);
      expect(svc.validateSlug('business-laptops').valid).toBe(true);
      expect(svc.validateSlug('gaming-pc-2024').valid).toBe(true);
      expect(svc.validateSlug('a').valid).toBe(true);
    });

    it('rejects empty slugs', () => {
      expect(svc.validateSlug('').valid).toBe(false);
    });

    it('rejects slugs with uppercase', () => {
      expect(svc.validateSlug('Laptops').valid).toBe(false);
    });

    it('rejects slugs with spaces', () => {
      expect(svc.validateSlug('business laptops').valid).toBe(false);
    });

    it('rejects slugs with leading/trailing hyphens', () => {
      expect(svc.validateSlug('-laptops').valid).toBe(false);
      expect(svc.validateSlug('laptops-').valid).toBe(false);
    });

    it('rejects slugs over 200 chars', () => {
      expect(svc.validateSlug('a'.repeat(201)).valid).toBe(false);
    });
  });

  describe('validateCode', () => {
    it('accepts valid codes', () => {
      expect(svc.validateCode('ram-capacity').valid).toBe(true);
      expect(svc.validateCode('screen_size').valid).toBe(false); // underscores not allowed
      expect(svc.validateCode('brand').valid).toBe(true);
    });

    it('rejects empty codes', () => {
      expect(svc.validateCode('').valid).toBe(false);
    });

    it('rejects codes over 80 chars', () => {
      expect(svc.validateCode('a'.repeat(81)).valid).toBe(false);
    });
  });

  describe('validateGtin', () => {
    it('accepts valid GTINs', () => {
      expect(svc.validateGtin('12345678').valid).toBe(true);
      expect(svc.validateGtin('1234567890123').valid).toBe(true);
    });

    it('accepts empty GTIN (optional)', () => {
      expect(svc.validateGtin('').valid).toBe(true);
    });

    it('rejects non-digit GTINs', () => {
      expect(svc.validateGtin('1234567a').valid).toBe(false);
    });

    it('rejects too-short GTINs', () => {
      expect(svc.validateGtin('123').valid).toBe(false);
    });
  });

  describe('validateEan', () => {
    it('accepts valid EANs (8, 13, 14 digits)', () => {
      expect(svc.validateEan('12345678').valid).toBe(true);
      expect(svc.validateEan('1234567890123').valid).toBe(true);
      expect(svc.validateEan('12345678901234').valid).toBe(true);
    });

    it('rejects invalid EAN lengths', () => {
      expect(svc.validateEan('12345').valid).toBe(false);
      expect(svc.validateEan('123456789').valid).toBe(false);
    });

    it('accepts empty EAN (optional)', () => {
      expect(svc.validateEan('').valid).toBe(true);
    });
  });

  describe('validateAttributeValue', () => {
    it('validates INTEGER type', () => {
      expect(svc.validateAttributeValue('INTEGER', { number: 16 }).valid).toBe(true);
      expect(svc.validateAttributeValue('INTEGER', { text: '32' }).valid).toBe(true);
      expect(svc.validateAttributeValue('INTEGER', { text: 'abc' }).valid).toBe(false);
      expect(svc.validateAttributeValue('INTEGER', {}).valid).toBe(false);
    });

    it('validates DECIMAL type', () => {
      expect(svc.validateAttributeValue('DECIMAL', { number: 3.14 }).valid).toBe(true);
      expect(svc.validateAttributeValue('DECIMAL', { text: '2.5' }).valid).toBe(true);
      expect(svc.validateAttributeValue('DECIMAL', { text: 'abc' }).valid).toBe(false);
    });

    it('validates BOOLEAN type', () => {
      expect(svc.validateAttributeValue('BOOLEAN', { boolean: true }).valid).toBe(true);
      expect(svc.validateAttributeValue('BOOLEAN', { text: 'true' }).valid).toBe(true);
      expect(svc.validateAttributeValue('BOOLEAN', { text: 'yes' }).valid).toBe(true);
      expect(svc.validateAttributeValue('BOOLEAN', { text: 'maybe' }).valid).toBe(false);
    });

    it('validates SELECT type', () => {
      expect(svc.validateAttributeValue('SELECT', { option: 'Intel' }, ['Intel', 'AMD']).valid).toBe(true);
      expect(svc.validateAttributeValue('SELECT', { option: 'ARM' }, ['Intel', 'AMD']).valid).toBe(false);
    });

    it('validates URL type', () => {
      expect(svc.validateAttributeValue('URL', { text: 'https://example.com' }).valid).toBe(true);
      expect(svc.validateAttributeValue('URL', { text: 'not-a-url' }).valid).toBe(false);
    });

    it('validates COLOR type', () => {
      expect(svc.validateAttributeValue('COLOR', { text: '#ff0000' }).valid).toBe(true);
      expect(svc.validateAttributeValue('COLOR', { text: '#fff' }).valid).toBe(true);
      expect(svc.validateAttributeValue('COLOR', { text: 'red' }).valid).toBe(false);
    });

    it('validates TEXT type', () => {
      expect(svc.validateAttributeValue('TEXT', { text: 'hello' }).valid).toBe(true);
      expect(svc.validateAttributeValue('TEXT', {}).valid).toBe(false);
    });

    it('validates DATE type', () => {
      expect(svc.validateAttributeValue('DATE', { text: '2024-01-15' }).valid).toBe(true);
      expect(svc.validateAttributeValue('DATE', { text: 'not-a-date' }).valid).toBe(false);
    });
  });

  describe('findMissingRequiredAttributes', () => {
    it('returns missing required attributes', () => {
      const required = [
        { code: 'ram', required: true },
        { code: 'cpu', required: true },
        { code: 'color', required: false },
      ];
      const provided = new Set(['ram']);
      expect(svc.findMissingRequiredAttributes(provided, required)).toEqual(['cpu']);
    });

    it('returns empty when all required are present', () => {
      const required = [{ code: 'ram', required: true }];
      const provided = new Set(['ram', 'cpu']);
      expect(svc.findMissingRequiredAttributes(provided, required)).toEqual([]);
    });
  });

  describe('sanitizeForExcel', () => {
    it('prefixes dangerous formula characters', () => {
      expect(CatalogValidationService.sanitizeForExcel('=SUM(A1)')).toBe("'=SUM(A1)");
      expect(CatalogValidationService.sanitizeForExcel('+cmd')).toBe("'+cmd");
      expect(CatalogValidationService.sanitizeForExcel('-1')).toBe("'-1");
      expect(CatalogValidationService.sanitizeForExcel('@evil')).toBe("'@evil");
    });

    it('leaves safe values unchanged', () => {
      expect(CatalogValidationService.sanitizeForExcel('hello')).toBe('hello');
      expect(CatalogValidationService.sanitizeForExcel('123')).toBe('123');
    });
  });
});
