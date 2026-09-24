import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

/**
 * Excel workbook parser for catalog imports.
 *
 * Reads an XLSX buffer into a structured representation of sheets, headers,
 * and rows.  Validates file structure, enforces size limits, and handles
 * malformed cells safely.  Never executes formulas or macros.
 */

/** Maximum file size: 25 MB. */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Maximum rows per sheet. */
const MAX_ROWS_PER_SHEET = 50_000;

/** Maximum cell value length. */
const MAX_CELL_LENGTH = 10_000;

/** Recognized sheet names and their entity types. */
export const SHEET_ENTITY_MAP: Record<string, string> = {
  'Categories': 'categories',
  'Brands': 'brands',
  'Attribute Groups': 'attribute_groups',
  'Attributes': 'attributes',
  'Attribute Options': 'attribute_options',
  'Product Types': 'product_types',
  'Product Type Attributes': 'product_type_attributes',
  'Products': 'products',
  'Product Attributes': 'product_attributes',
  'Variants': 'variants',
  'Variant Attributes': 'variant_attributes',
  'Sources': 'sources',
};

export interface ParsedSheet {
  name: string;
  entityType: string;
  headers: string[];
  rows: Record<string, string | null>[];
  rowCount: number;
}

export interface ParsedWorkbook {
  sheets: Map<string, ParsedSheet>;
  hasReadme: boolean;
  sheetNames: string[];
}

@Injectable()
export class ExcelParserService {
  private readonly logger = new Logger(ExcelParserService.name);

  /**
   * Parse an XLSX buffer into structured sheets.
   */
  async parse(buffer: Buffer, fileName: string): Promise<ParsedWorkbook> {
    // File size validation
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      );
    }
    if (buffer.length === 0) {
      throw new BadRequestException('File is empty.');
    }

    // Extension validation
    const ext = fileName.toLowerCase().split('.').pop();
    if (ext !== 'xlsx' && ext !== 'xlsm') {
      throw new BadRequestException(`Unsupported file type ".${ext}". Only .xlsx files are accepted.`);
    }
    // Reject macro-enabled workbooks
    if (ext === 'xlsm') {
      throw new BadRequestException('Macro-enabled workbooks (.xlsm) are not allowed for security reasons.');
    }

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (err) {
      throw new BadRequestException(
        `Failed to parse Excel file: ${err instanceof Error ? err.message : 'Unknown error'}. Ensure the file is a valid .xlsx workbook.`,
      );
    }

    const result: ParsedWorkbook = {
      sheets: new Map(),
      hasReadme: false,
      sheetNames: [],
    };

    for (const worksheet of workbook.worksheets) {
      const name = worksheet.name;
      result.sheetNames.push(name);

      // README sheet is informational only
      if (name.toLowerCase() === 'readme' || name.toLowerCase() === 'instructions') {
        result.hasReadme = true;
        continue;
      }

      const entityType = SHEET_ENTITY_MAP[name];
      if (!entityType) {
        this.logger.warn(`Skipping unrecognized worksheet: "${name}"`);
        continue;
      }

      const parsed = this.parseSheet(worksheet, name, entityType);
      if (parsed) {
        result.sheets.set(entityType, parsed);
      }
    }

    if (result.sheets.size === 0) {
      throw new BadRequestException(
        'No recognized worksheets found. Expected sheets: ' + Object.keys(SHEET_ENTITY_MAP).join(', '),
      );
    }

    return result;
  }

  private parseSheet(
    worksheet: ExcelJS.Worksheet,
    name: string,
    entityType: string,
  ): ParsedSheet | null {
    if (worksheet.rowCount < 2) {
      // Header only or empty — skip with warning
      this.logger.warn(`Worksheet "${name}" has no data rows`);
      return null;
    }

    // Extract headers from row 1
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    const headerSet = new Set<string>();

    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const val = String(cell.value ?? '').trim();
      if (val) {
        // Duplicate header check
        if (headerSet.has(val.toLowerCase())) {
          throw new BadRequestException(
            `Duplicate header "${val}" in sheet "${name}" at column ${colNumber}`,
          );
        }
        headerSet.add(val.toLowerCase());
        headers[colNumber - 1] = val.toLowerCase().replace(/\s+/g, '_');
      }
    });

    // Filter out undefined gaps
    const cleanHeaders = headers.filter(Boolean);
    if (cleanHeaders.length === 0) {
      throw new BadRequestException(`No headers found in sheet "${name}"`);
    }

    // Extract data rows
    const rows: Record<string, string | null>[] = [];
    const maxRow = Math.min(worksheet.rowCount, MAX_ROWS_PER_SHEET + 1);

    if (worksheet.rowCount > MAX_ROWS_PER_SHEET + 1) {
      throw new BadRequestException(
        `Sheet "${name}" has ${worksheet.rowCount - 1} rows. Maximum is ${MAX_ROWS_PER_SHEET}.`,
      );
    }

    for (let r = 2; r <= maxRow; r++) {
      const row = worksheet.getRow(r);
      // Skip completely empty rows
      let allEmpty = true;
      row.eachCell({ includeEmpty: true }, (cell) => {
        if (cell.value !== null && cell.value !== undefined && String(cell.value).trim() !== '') {
          allEmpty = false;
        }
      });
      if (allEmpty) continue;

      const rowData: Record<string, string | null> = {};
      let hasData = false;

      for (let c = 0; c < cleanHeaders.length; c++) {
        const cell = row.getCell(c + 1);
        const raw = cell.value;
        const val = this.cellToString(raw);

        if (val !== null && val.length > MAX_CELL_LENGTH) {
          throw new BadRequestException(
            `Cell value too long in sheet "${name}", row ${r}, column "${cleanHeaders[c]}"`,
          );
        }

        rowData[cleanHeaders[c]!] = val;
        if (val !== null) hasData = true;
      }

      if (hasData) {
        rowData['__row_number'] = String(r);
        rows.push(rowData);
      }
    }

    return {
      name,
      entityType,
      headers: cleanHeaders,
      rows,
      rowCount: rows.length,
    };
  }

  /**
   * Convert an ExcelJS cell value to a string.
   * Handles formulas (returns raw text, never evaluates), dates, rich text, etc.
   */
  private cellToString(value: unknown): string | null {
    if (value === null || value === undefined) return null;

    // Formula: extract the cached result, never evaluate
    if (typeof value === 'object' && value !== null && 'formula' in value) {
      const fv = value as { result?: unknown };
      if (fv.result !== undefined && fv.result !== null) {
        return String(fv.result);
      }
      return null;
    }

    // Date
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]!;
    }

    // Rich text
    if (typeof value === 'object' && value !== null && 'richText' in value) {
      const rt = value as { richText?: Array<{ text?: string }> };
      return (rt.richText ?? []).map(r => r.text ?? '').join('');
    }

    // Hyperlink
    if (typeof value === 'object' && value !== null && 'text' in value && 'hyperlink' in value) {
      return String((value as { text: string }).text);
    }

    const str = String(value).trim();
    return str === '' ? null : str;
  }
}
