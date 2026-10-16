import { Injectable } from '@nestjs/common';

/**
 * Shared catalog validation logic reusable by seed data, Excel import,
 * API endpoints, and admin operations.
 *
 * This is the single authoritative catalog validation model — the same rules
 * apply whether data comes from TypeScript seed files, Excel workbooks, or
 * REST API payloads.
 */

export type AttributeValueType =
  | 'TEXT' | 'LONG_TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN'
  | 'DATE' | 'DATETIME' | 'SELECT' | 'MULTI_SELECT'
  | 'COLOR' | 'URL' | 'FILE' | 'MEASUREMENT' | 'CURRENCY';

export interface AttributeValueValidation {
  valid: boolean;
  error?: string;
  /** Coerced value (e.g. string "16" → number 16 for INTEGER). */
  coerced?: string | number | boolean | null;
}

/** Slug format: lowercase alphanumeric + hyphens, no leading/trailing hyphens. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** GTIN: 8-14 digits. */
const GTIN_RE = /^\d{8,14}$/;

/** EAN: 8, 13, or 14 digits. */
const EAN_RE = /^\d{8}$|^\d{13}$|^\d{14}$/;

/** Attribute code: lowercase alphanumeric + hyphens. */
const CODE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class CatalogValidationService {
  /** Validate a slug format. */
  validateSlug(slug: string): { valid: boolean; error?: string } {
    if (!slug || slug.length === 0) {
      return { valid: false, error: 'Slug is required' };
    }
    if (slug.length > 200) {
      return { valid: false, error: 'Slug must be 200 characters or fewer' };
    }
    if (!SLUG_RE.test(slug)) {
      return { valid: false, error: 'Slug must be lowercase alphanumeric with hyphens (e.g. "business-laptops")' };
    }
    return { valid: true };
  }

  /** Validate an attribute code format. */
  validateCode(code: string): { valid: boolean; error?: string } {
    if (!code || code.length === 0) {
      return { valid: false, error: 'Code is required' };
    }
    if (code.length > 80) {
      return { valid: false, error: 'Code must be 80 characters or fewer' };
    }
    if (!CODE_RE.test(code)) {
      return { valid: false, error: 'Code must be lowercase alphanumeric with hyphens (e.g. "ram-capacity")' };
    }
    return { valid: true };
  }

  /** Validate a GTIN format (8-14 digits). */
  validateGtin(gtin: string): { valid: boolean; error?: string } {
    if (!gtin) return { valid: true }; // optional field
    if (!GTIN_RE.test(gtin)) {
      return { valid: false, error: 'GTIN must be 8-14 digits' };
    }
    return { valid: true };
  }

  /** Validate an EAN format (8, 13, or 14 digits). */
  validateEan(ean: string): { valid: boolean; error?: string } {
    if (!ean) return { valid: true }; // optional field
    if (!EAN_RE.test(ean)) {
      return { valid: false, error: 'EAN must be 8, 13, or 14 digits' };
    }
    return { valid: true };
  }

  /**
   * Validate an attribute value against its type definition.
   *
   * Returns whether the value is valid and optionally a coerced form
   * (e.g. string "16" → number 16 for INTEGER type).
   */
  validateAttributeValue(
    type: AttributeValueType,
    value: { text?: string; number?: number | string; boolean?: boolean | string; option?: string; json?: unknown },
    allowedOptions?: string[],
  ): AttributeValueValidation {
    switch (type) {
      case 'INTEGER': {
        const raw = value.number ?? value.text;
        if (raw === undefined || raw === null || raw === '') {
          return { valid: false, error: 'INTEGER attribute requires a numeric value' };
        }
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (isNaN(num) || !Number.isInteger(num)) {
          return { valid: false, error: `Expected integer, received "${raw}"` };
        }
        return { valid: true, coerced: num };
      }

      case 'DECIMAL':
      case 'MEASUREMENT':
      case 'CURRENCY': {
        const raw = value.number ?? value.text;
        if (raw === undefined || raw === null || raw === '') {
          return { valid: false, error: 'DECIMAL attribute requires a numeric value' };
        }
        const num = typeof raw === 'number' ? raw : Number(raw);
        if (isNaN(num)) {
          return { valid: false, error: `Expected number, received "${raw}"` };
        }
        return { valid: true, coerced: num };
      }

      case 'BOOLEAN': {
        const raw = value.boolean ?? value.text;
        if (raw === undefined || raw === null || raw === '') {
          return { valid: false, error: 'BOOLEAN attribute requires a true/false value' };
        }
        if (typeof raw === 'boolean') {
          return { valid: true, coerced: raw };
        }
        const str = String(raw).toLowerCase().trim();
        if (str === 'true' || str === '1' || str === 'yes') {
          return { valid: true, coerced: true };
        }
        if (str === 'false' || str === '0' || str === 'no') {
          return { valid: true, coerced: false };
        }
        return { valid: false, error: `Expected true/false, received "${raw}"` };
      }

      case 'SELECT': {
        const opt = value.option ?? value.text;
        if (opt === undefined || opt === null || opt === '') {
          return { valid: false, error: 'SELECT attribute requires an option value' };
        }
        if (allowedOptions && !allowedOptions.includes(String(opt))) {
          return {
            valid: false,
            error: `Option "${opt}" is not in allowed values: ${allowedOptions.join(', ')}`,
          };
        }
        return { valid: true, coerced: String(opt) };
      }

      case 'MULTI_SELECT': {
        const opt = value.option ?? value.text;
        if (opt === undefined || opt === null || opt === '') {
          return { valid: false, error: 'MULTI_SELECT attribute requires option value(s)' };
        }
        // Accept comma-separated values
        const values = String(opt).split(',').map(v => v.trim()).filter(Boolean);
        if (allowedOptions) {
          const invalid = values.filter(v => !allowedOptions.includes(v));
          if (invalid.length > 0) {
            return {
              valid: false,
              error: `Invalid options: ${invalid.join(', ')}. Allowed: ${allowedOptions.join(', ')}`,
            };
          }
        }
        return { valid: true, coerced: values.join(',') };
      }

      case 'URL': {
        const raw = value.text;
        if (raw === undefined || raw === null || raw === '') {
          return { valid: false, error: 'URL attribute requires a value' };
        }
        try {
          new URL(String(raw));
          return { valid: true, coerced: String(raw) };
        } catch {
          return { valid: false, error: `Invalid URL: "${raw}"` };
        }
      }

      case 'COLOR': {
        const raw = value.text;
        if (raw === undefined || raw === null || raw === '') {
          return { valid: false, error: 'COLOR attribute requires a hex value' };
        }
        if (!/^#[0-9a-fA-F]{3,8}$/.test(String(raw))) {
          return { valid: false, error: `Invalid color format: "${raw}" (expected #RRGGBB)` };
        }
        return { valid: true, coerced: String(raw) };
      }

      case 'DATE': {
        const raw = value.text;
        if (raw === undefined || raw === null || raw === '') {
          return { valid: false, error: 'DATE attribute requires a value' };
        }
        if (isNaN(Date.parse(String(raw)))) {
          return { valid: false, error: `Invalid date: "${raw}"` };
        }
        return { valid: true, coerced: String(raw) };
      }

      case 'DATETIME': {
        const raw = value.text;
        if (raw === undefined || raw === null || raw === '') {
          return { valid: false, error: 'DATETIME attribute requires a value' };
        }
        if (isNaN(Date.parse(String(raw)))) {
          return { valid: false, error: `Invalid datetime: "${raw}"` };
        }
        return { valid: true, coerced: String(raw) };
      }

      case 'TEXT':
      case 'LONG_TEXT':
      default: {
        const raw = value.text;
        if (raw === undefined || raw === null) {
          return { valid: false, error: 'TEXT attribute requires a value' };
        }
        return { valid: true, coerced: String(raw) };
      }
    }
  }

  /**
   * Check that all required attributes for a product type are present.
   * Returns missing attribute codes.
   */
  findMissingRequiredAttributes(
    providedAttrCodes: Set<string>,
    requiredAttrs: Array<{ code: string; required: boolean }>,
  ): string[] {
    const missing: string[] = [];
    for (const attr of requiredAttrs) {
      if (attr.required && !providedAttrCodes.has(attr.code)) {
        missing.push(attr.code);
      }
    }
    return missing;
  }

  /** Sanitize a value for safe Excel output (prevent formula injection). */
  static sanitizeForExcel(value: string): string {
    if (!value) return value;
    // Prefix dangerous characters that Excel interprets as formula starters
    const dangerous = /^[=+\-@]/;
    if (dangerous.test(value)) {
      return `'${value}`;
    }
    return value;
  }
}
