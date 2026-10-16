import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import {
  categories,
  brands,
} from './catalog.schema';
import {
  attributeDefinitions,
} from './catalog.taxonomy.schema';
import { eq, isNull } from 'drizzle-orm';

/**
 * P10 — Shared import validation service.
 *
 * Provides read-only row validation that returns structured ImportError
 * objects instead of throwing. Used by both the preview endpoint and the
 * processing pipeline.
 *
 * NEVER creates, updates, or deletes any domain records.
 * NEVER uses SELECT ... FOR UPDATE.
 * NEVER opens write transactions.
 */

/** Structured validation error/warning. */
export interface ImportError {
  rowNumber: number;
  field: string;
  errorCode: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  suggestedFix: string | null;
}

/** Result of validating a batch of rows. */
export interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorCount: number;
  warningCount: number;
  errors: ImportError[];
  sampleRows: Record<string, string | null>[];
}

/** Attribute definition cache entry for validation. */
interface AttrDefEntry {
  code: string;
  type: string;
  scope: string;
}

@Injectable()
export class ImportValidationService {
  private readonly logger = new Logger(ImportValidationService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Validate a batch of import rows against catalog business rules.
   *
   * This is entirely read-only — no catalog records are created or modified.
   * Reference checks use ordinary SELECT queries.
   */
  async validateRows(
    storeId: string,
    mapping: Record<string, string>,
    rows: Record<string, string | null>[],
    startRowOffset: number,
  ): Promise<ValidationResult> {
    const errors: ImportError[] = [];
    let validRows = 0;
    let warningCount = 0;
    const sampleRows: Record<string, string | null>[] = [];

    // Pre-load reference data for the store (read-only)
    const [storeCategories, storeBrands, attrDefs] = await Promise.all([
      this.db.db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.storeId, storeId)),
      this.db.db
        .select({ id: brands.id, name: brands.name })
        .from(brands),
      this.db.db
        .select({
          id: attributeDefinitions.id,
          code: attributeDefinitions.code,
          type: attributeDefinitions.type,
          scope: attributeDefinitions.scope,
        })
        .from(attributeDefinitions)
        .where(isNull(attributeDefinitions.deletedAt)),
    ]);

    const categoryNames = new Set(storeCategories.map(c => c.name.toLowerCase()));
    const brandNames = new Set(storeBrands.map(b => b.name.toLowerCase()));
    const attrDefByCode = new Map(attrDefs.map((d: AttrDefEntry) => [d.code, d]));

    // Track SKUs within the file for duplicate detection
    const seenSkus = new Map<string, number>(); // sku → first row number

    const get = (row: Record<string, string | null>, key: string): string => {
      const header = mapping[key];
      if (!header) return '';
      return (row[header] ?? '').trim();
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNum = startRowOffset + i + 1; // 1-based, accounting for header
      const rowErrors: ImportError[] = [];
      const rowWarnings: ImportError[] = [];

      // ── Required fields ────────────────────────────────────────
      const name = get(row, 'name');
      if (!name) {
        rowErrors.push({
          rowNumber: rowNum,
          field: 'name',
          errorCode: 'MISSING_REQUIRED_FIELD',
          severity: 'ERROR',
          message: 'Product name is required',
          suggestedFix: 'Enter a product name in the mapped name column',
        });
      }

      const sku = get(row, 'sku');
      if (!sku) {
        rowErrors.push({
          rowNumber: rowNum,
          field: 'sku',
          errorCode: 'MISSING_REQUIRED_FIELD',
          severity: 'ERROR',
          message: 'SKU is required',
          suggestedFix: 'Enter a unique SKU in the mapped sku column',
        });
      }

      // ── Duplicate SKU within file ──────────────────────────────
      if (sku) {
        const skuLower = sku.toLowerCase();
        if (seenSkus.has(skuLower)) {
          rowWarnings.push({
            rowNumber: rowNum,
            field: 'sku',
            errorCode: 'DUPLICATE_SKU',
            severity: 'WARNING',
            message: `SKU "${sku}" also appears in row ${seenSkus.get(skuLower)}. Duplicate SKUs update the same product.`,
            suggestedFix: 'Use unique SKUs for distinct products, or remove the duplicate row',
          });
        } else {
          seenSkus.set(skuLower, rowNum);
        }
      }

      // ── Price validation ───────────────────────────────────────
      const priceRaw = get(row, 'priceMinor');
      if (!priceRaw) {
        rowErrors.push({
          rowNumber: rowNum,
          field: 'priceMinor',
          errorCode: 'MISSING_REQUIRED_FIELD',
          severity: 'ERROR',
          message: 'Price is required',
          suggestedFix: 'Enter a price in minor units (e.g. 1050 for 10.50)',
        });
      } else {
        const priceMinor = parseInt(priceRaw, 10);
        if (isNaN(priceMinor) || priceMinor < 0) {
          rowErrors.push({
            rowNumber: rowNum,
            field: 'priceMinor',
            errorCode: 'INVALID_PRICE_FORMAT',
            severity: 'ERROR',
            message: `Invalid price "${priceRaw}" — expected a non-negative integer in minor units`,
            suggestedFix: 'Enter the price in minor units (e.g. 1050 for 10.50, 2500 for 25.00)',
          });
        }
      }

      // ── MOQ validation ─────────────────────────────────────────
      const moqRaw = get(row, 'moq');
      if (moqRaw) {
        const moq = parseInt(moqRaw, 10);
        if (isNaN(moq) || moq < 1) {
          rowErrors.push({
            rowNumber: rowNum,
            field: 'moq',
            errorCode: 'INVALID_MOQ_FORMAT',
            severity: 'ERROR',
            message: `Invalid MOQ "${moqRaw}" — expected a positive integer`,
            suggestedFix: 'Enter a minimum order quantity of 1 or greater',
          });
        }
      }

      // ── Stock validation ───────────────────────────────────────
      const stockRaw = get(row, 'stock');
      if (stockRaw) {
        const stockQty = parseInt(stockRaw, 10);
        if (isNaN(stockQty) || stockQty < 0) {
          rowWarnings.push({
            rowNumber: rowNum,
            field: 'stock',
            errorCode: 'INVALID_STOCK_FORMAT',
            severity: 'WARNING',
            message: `Invalid stock "${stockRaw}" — expected a non-negative integer`,
            suggestedFix: 'Enter initial stock as a non-negative whole number',
          });
        }
      }

      // ── Unit validation ────────────────────────────────────────
      const unit = get(row, 'unit');
      if (!unit) {
        rowWarnings.push({
          rowNumber: rowNum,
          field: 'unit',
          errorCode: 'MISSING_REQUIRED_FIELD',
          severity: 'WARNING',
          message: 'Unit not specified — will default to PCS',
          suggestedFix: 'Specify a unit (PCS, kg, L, etc.) for clarity',
        });
      }

      // ── Category reference check ───────────────────────────────
      const categoryName = get(row, 'category');
      if (categoryName && !categoryNames.has(categoryName.toLowerCase())) {
        rowWarnings.push({
          rowNumber: rowNum,
          field: 'category',
          errorCode: 'REFERENCE_NOT_FOUND',
          severity: 'WARNING',
          message: `Category "${categoryName}" not found in catalog — it will be created during import`,
          suggestedFix: 'Verify the category name spelling, or let the import create it automatically',
        });
      }

      // ── Brand reference check ──────────────────────────────────
      const brandName = get(row, 'brand');
      if (brandName && !brandNames.has(brandName.toLowerCase())) {
        rowWarnings.push({
          rowNumber: rowNum,
          field: 'brand',
          errorCode: 'REFERENCE_NOT_FOUND',
          severity: 'WARNING',
          message: `Brand "${brandName}" not found in catalog — it will be created during import`,
          suggestedFix: 'Verify the brand name spelling, or let the import create it automatically',
        });
      }

      // ── Typed attribute validation ─────────────────────────────
      for (const [logicalKey, headerName] of Object.entries(mapping)) {
        if (!logicalKey.startsWith('attr:')) continue;
        const code = logicalKey.substring(5).trim();
        if (!code) continue;

        const rawValue = headerName ? (row[headerName] ?? '').trim() : '';
        if (!rawValue) continue;

        const def = attrDefByCode.get(code);
        if (!def) {
          rowErrors.push({
            rowNumber: rowNum,
            field: `attr:${code}`,
            errorCode: 'UNKNOWN_ATTRIBUTE_CODE',
            severity: 'ERROR',
            message: `Attribute "${code}" not found in attribute definitions`,
            suggestedFix: 'Check attribute codes in the admin catalog settings',
          });
          continue;
        }

        // Validate value against attribute type
        const typeError = this.validateTypedValue(rawValue, def.type, `attr:${code}`, rowNum);
        if (typeError) {
          rowErrors.push(typeError);
        }
      }

      // ── Collect row results ────────────────────────────────────
      const rowAllErrors = [...rowErrors, ...rowWarnings];
      errors.push(...rowAllErrors);
      warningCount += rowWarnings.length;

      const hasBlockingErrors = rowErrors.length > 0;
      if (!hasBlockingErrors) {
        validRows++;
        if (sampleRows.length < 5) {
          sampleRows.push(row);
        }
      }
    }

    return {
      totalRows: rows.length,
      validRows,
      errorCount: errors.filter(e => e.severity === 'ERROR').length,
      warningCount,
      errors,
      sampleRows,
    };
  }

  /**
   * Validate a typed attribute value against its declared type.
   * Returns an ImportError if invalid, null if valid.
   */
  private validateTypedValue(
    raw: string,
    type: string,
    field: string,
    rowNum: number,
  ): ImportError | null {
    switch (type) {
      case 'TEXT':
      case 'LONG_TEXT':
      case 'URL':
      case 'COLOR':
      case 'FILE':
      case 'DATE':
      case 'DATETIME':
      case 'SELECT':
        return null; // any non-empty string is valid

      case 'INTEGER':
      case 'MEASUREMENT': {
        const n = parseInt(raw, 10);
        if (isNaN(n)) {
          return {
            rowNumber: rowNum,
            field,
            errorCode: 'INVALID_ATTRIBUTE_VALUE',
            severity: 'ERROR',
            message: `Invalid INTEGER value "${raw}" for ${field}`,
            suggestedFix: 'Enter a whole number (e.g. 42, -7, 100)',
          };
        }
        return null;
      }

      case 'DECIMAL':
      case 'CURRENCY': {
        const n = parseFloat(raw);
        if (isNaN(n)) {
          return {
            rowNumber: rowNum,
            field,
            errorCode: 'INVALID_ATTRIBUTE_VALUE',
            severity: 'ERROR',
            message: `Invalid DECIMAL value "${raw}" for ${field}`,
            suggestedFix: 'Enter a decimal number (e.g. 3.14, -0.5, 100.00)',
          };
        }
        return null;
      }

      case 'BOOLEAN': {
        const lower = raw.toLowerCase();
        if (!['true', '1', 'yes', 'false', '0', 'no'].includes(lower)) {
          return {
            rowNumber: rowNum,
            field,
            errorCode: 'INVALID_ATTRIBUTE_VALUE',
            severity: 'ERROR',
            message: `Invalid BOOLEAN value "${raw}" for ${field}`,
            suggestedFix: 'Enter true/false, yes/no, or 1/0',
          };
        }
        return null;
      }

      case 'MULTI_SELECT':
        return null; // comma-separated values are always valid

      default:
        return null;
    }
  }
}
