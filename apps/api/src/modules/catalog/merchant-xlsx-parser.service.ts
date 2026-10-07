import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

/**
 * P10 — Merchant XLSX parser.
 *
 * Reads a single worksheet from a merchant-uploaded XLSX workbook, extracts
 * headers and rows for flexible column mapping. Reuses security constants
 * from the admin Excel parser but does NOT use SHEET_ENTITY_MAP or
 * multi-sheet entity routing.
 *
 * Security guarantees:
 * - Never evaluates formulas (extracts cached result only)
 * - Never executes macros (.xlsm rejected)
 * - Never resolves external references
 * - Enforces file size, row, column, and cell length limits
 */

/** Maximum file size: 25 MB (shared with admin parser). */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/** Maximum data rows per worksheet. */
const MAX_ROWS_PER_SHEET = 50_000;

/** Maximum cell value length in characters. */
const MAX_CELL_LENGTH = 10_000;

/** Maximum columns per worksheet. */
const MAX_COLUMNS = 100;

/** Maximum worksheets to parse (merchant import is single-sheet). */
const MAX_WORKSHEETS = 1;

export interface MerchantParsedXlsx {
  /** Normalized lowercase, underscore-separated headers. */
  headers: string[];
  /** Raw (pre-normalization) header labels as they appear in the file. */
  rawHeaders: string[];
  /** Data rows keyed by normalized header name. */
  rows: Record<string, string | null>[];
  /** Number of data rows (excluding header). */
  rowCount: number;
  /** Detected file type. */
  fileType: 'XLSX';
}

@Injectable()
export class MerchantXlsxParserService {
  private readonly logger = new Logger(MerchantXlsxParserService.name);

  /**
   * Parse an XLSX buffer from a merchant upload.
   *
   * Reads the first worksheet (or the first non-README sheet), extracts
   * headers from row 1, and returns all data rows.
   */
  async parse(buffer: Buffer, fileName: string): Promise<MerchantParsedXlsx> {
    // ── File-level validation ──────────────────────────────────────
    if (buffer.length === 0) {
      throw new BadRequestException('File is empty.');
    }
    if (buffer.length > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_FILE_SIZE / 1024 / 1024} MB.`,
      );
    }

    const ext = fileName.toLowerCase().split('.').pop();
    if (ext === 'xlsm') {
      throw new BadRequestException('Macro-enabled workbooks (.xlsm) are not allowed for security reasons.');
    }
    if (ext !== 'xlsx') {
      throw new BadRequestException(`Unsupported file type ".${ext}". Only .xlsx files are accepted.`);
    }

    // ── Parse workbook ─────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch (err) {
      throw new BadRequestException(
        `Failed to parse Excel file: ${err instanceof Error ? err.message : 'Unknown error'}. Ensure the file is a valid .xlsx workbook.`,
      );
    }

    // ── Select the first usable worksheet ──────────────────────────
    let worksheet: ExcelJS.Worksheet | undefined;
    let sheetsSeen = 0;

    for (const ws of workbook.worksheets) {
      const lower = ws.name.toLowerCase();
      if (lower === 'readme' || lower === 'instructions') continue;
      sheetsSeen++;
      if (sheetsSeen > MAX_WORKSHEETS) {
        this.logger.warn(`Workbook has more than ${MAX_WORKSHEETS} data sheet(s); using the first.`);
        break;
      }
      worksheet = ws;
    }

    if (!worksheet) {
      throw new BadRequestException('No data worksheet found in the workbook.');
    }

    if (worksheet.rowCount < 2) {
      throw new BadRequestException('Worksheet must have a header row and at least one data row.');
    }

    // ── Extract headers ────────────────────────────────────────────
    const headerRow = worksheet.getRow(1);
    const rawHeaders: string[] = [];
    const normalizedHeaders: string[] = [];
    const headerSet = new Set<string>();

    let colCount = 0;
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      colCount++;
      if (colCount > MAX_COLUMNS) return; // silently ignore excess columns
      const raw = String(cell.value ?? '').trim();
      if (!raw) return;

      if (headerSet.has(raw.toLowerCase())) {
        throw new BadRequestException(`Duplicate header "${raw}" at column ${colNumber}`);
      }
      headerSet.add(raw.toLowerCase());

      rawHeaders.push(raw);
      normalizedHeaders.push(this.normalizeHeader(raw));
    });

    if (normalizedHeaders.length === 0) {
      throw new BadRequestException('No headers found in the first row.');
    }

    if (colCount > MAX_COLUMNS) {
      this.logger.warn(`Worksheet has ${colCount} columns; only the first ${MAX_COLUMNS} are processed.`);
    }

    // ── Extract data rows ──────────────────────────────────────────
    const maxRow = Math.min(worksheet.rowCount, MAX_ROWS_PER_SHEET + 1);

    if (worksheet.rowCount > MAX_ROWS_PER_SHEET + 1) {
      throw new BadRequestException(
        `Worksheet has ${worksheet.rowCount - 1} data rows. Maximum is ${MAX_ROWS_PER_SHEET}.`,
      );
    }

    const rows: Record<string, string | null>[] = [];

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

      for (let c = 0; c < normalizedHeaders.length; c++) {
        const cell = row.getCell(c + 1);
        const val = this.cellToString(cell.value);

        if (val !== null && val.length > MAX_CELL_LENGTH) {
          throw new BadRequestException(
            `Cell value too long in row ${r}, column "${rawHeaders[c]}" (${val.length} chars, max ${MAX_CELL_LENGTH}).`,
          );
        }

        rowData[normalizedHeaders[c]!] = val;
        if (val !== null) hasData = true;
      }

      if (hasData) {
        // Store original row number for error reporting (1-based, header = row 1)
        rowData['__row_number'] = String(r);
        rows.push(rowData);
      }
    }

    return {
      headers: normalizedHeaders,
      rawHeaders,
      rows,
      rowCount: rows.length,
      fileType: 'XLSX',
    };
  }

  /**
   * Normalize a raw header label into a consistent key:
   * lowercase, trim, collapse whitespace to underscores,
   * strip non-alphanumeric except colon (for attr:<code>).
   */
  private normalizeHeader(raw: string): string {
    return raw
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_:]/g, '');
  }

  /**
   * Convert an ExcelJS cell value to a string.
   * - Formulas: extract cached result, NEVER evaluate
   * - Dates: ISO date string
   * - Rich text: concatenate fragments
   * - Hyperlinks: extract display text
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
