/**
 * Unit tests — Security validation for catalog import.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExcelParserService } from '../../../modules/catalog-import/excel-parser.service';
import { CatalogValidationService } from '../../../modules/catalog/catalog.validation-service';
import ExcelJS from 'exceljs';

describe('Catalog Import Security', () => {
  let parser: ExcelParserService;

  beforeEach(() => { parser = new ExcelParserService(); });

  describe('file type validation', () => {
    it('rejects .xls (legacy format)', async () => {
      await expect(parser.parse(Buffer.alloc(100), 'test.xls')).rejects.toThrow('Unsupported file type');
    });

    it('rejects .csv files', async () => {
      await expect(parser.parse(Buffer.alloc(100), 'test.csv')).rejects.toThrow('Unsupported file type');
    });

    it('rejects .xlsm (macro-enabled)', async () => {
      await expect(parser.parse(Buffer.alloc(100), 'test.xlsm')).rejects.toThrow('Macro-enabled');
    });

    it('rejects files with double extensions', async () => {
      await expect(parser.parse(Buffer.alloc(100), 'test.xlsx.exe')).rejects.toThrow('Unsupported file type');
    });
  });

  describe('file size limits', () => {
    it('rejects files over 25 MB', async () => {
      const big = Buffer.alloc(26 * 1024 * 1024);
      await expect(parser.parse(big, 'test.xlsx')).rejects.toThrow('File too large');
    });

    it('accepts files just under 25 MB (if valid xlsx)', async () => {
      // We can't easily create a 24MB valid xlsx in a unit test,
      // but we verify the check doesn't reject at 24MB boundary
      const almost = Buffer.alloc(24 * 1024 * 1024);
      // This will fail on parse, not on size check
      try {
        await parser.parse(almost, 'test.xlsx');
      } catch (e) {
        expect((e as Error).message).not.toContain('File too large');
      }
    });
  });

  describe('formula injection prevention', () => {
    it('never evaluates formulas — extracts cached result only', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Brands');
      ws.addRow(['slug', 'name']);
      // Simulate a formula cell (the parser should use result, not formula)
      const row = ws.addRow(['test', 'value']);
      const cell = row.getCell(2);
      cell.value = { formula: 'SUM(A1:A10)', result: 'value' } as any;

      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const result = await parser.parse(buf, 'test.xlsx');
      const brandSheet = result.sheets.get('brands')!;
      // The parser should return the cached result, not the formula
      expect(brandSheet.rows[0]!['name']).toBe('value');
    });
  });

  describe('path traversal prevention', () => {
    it('does not interpret path separators in filenames', async () => {
      // The parser only uses the filename for extension checking
      // It should not use the filename in any file system operations
      const maliciousName = '../../../etc/passwd.xlsx';
      const buf = Buffer.alloc(100);
      try {
        await parser.parse(buf, maliciousName);
      } catch (e) {
        // Should fail on parse, not on path traversal
        expect((e as Error).message).not.toContain('ENOENT');
      }
    });
  });

  describe('Excel sanitization', () => {
    it('sanitizes formula-starting values for export', () => {
      const sanitize = CatalogValidationService.sanitizeForExcel;
      expect(sanitize('=HYPERLINK("evil")')).toBe("'=HYPERLINK(\"evil\")");
      expect(sanitize('+cmd')).toBe("'+cmd");
      expect(sanitize('-1+1')).toBe("'-1+1");
      expect(sanitize('@SUM(A1)')).toBe("'@SUM(A1)");
    });

    it('does not modify safe values', () => {
      const sanitize = CatalogValidationService.sanitizeForExcel;
      expect(sanitize('Dell')).toBe('Dell');
      expect(sanitize('12345')).toBe('12345');
      expect(sanitize('laptop-14')).toBe('laptop-14');
    });
  });

  describe('row limits', () => {
    it('rejects sheets with more than 50,000 rows', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Brands');
      ws.addRow(['slug', 'name']);
      // Add 50,002 rows (exceeds limit)
      for (let i = 0; i < 50002; i++) {
        ws.addRow([`brand-${i}`, `Brand ${i}`]);
      }
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      await expect(parser.parse(buf, 'test.xlsx')).rejects.toThrow('Maximum is 50000');
    });
  });

  describe('cell value limits', () => {
    it('rejects cell values over 10,000 characters', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Brands');
      ws.addRow(['slug', 'name']);
      ws.addRow(['test', 'A'.repeat(10001)]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      await expect(parser.parse(buf, 'test.xlsx')).rejects.toThrow('Cell value too long');
    });
  });
});
