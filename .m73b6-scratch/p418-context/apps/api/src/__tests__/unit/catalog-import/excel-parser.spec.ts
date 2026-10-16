/**
 * Unit tests — ExcelParserService workbook parsing and file validation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ExcelParserService, SHEET_ENTITY_MAP } from '../../../modules/catalog-import/excel-parser.service';
import ExcelJS from 'exceljs';

async function buildWorkbook(sheets: Record<string, { headers: string[]; rows: string[][] }>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, data] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    ws.addRow(data.headers);
    for (const row of data.rows) ws.addRow(row);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe('ExcelParserService', () => {
  let parser: ExcelParserService;

  beforeEach(() => { parser = new ExcelParserService(); });

  describe('file validation', () => {
    it('rejects empty buffers', async () => {
      await expect(parser.parse(Buffer.alloc(0), 'test.xlsx')).rejects.toThrow('File is empty');
    });

    it('rejects oversized files', async () => {
      const big = Buffer.alloc(26 * 1024 * 1024); // 26 MB
      await expect(parser.parse(big, 'test.xlsx')).rejects.toThrow('File too large');
    });

    it('rejects non-xlsx extensions', async () => {
      await expect(parser.parse(Buffer.alloc(100), 'test.csv')).rejects.toThrow('Unsupported file type');
    });

    it('rejects macro-enabled workbooks', async () => {
      await expect(parser.parse(Buffer.alloc(100), 'test.xlsm')).rejects.toThrow('Macro-enabled');
    });

    it('rejects malformed xlsx content', async () => {
      const garbage = Buffer.from('not a real xlsx file content here');
      await expect(parser.parse(garbage, 'test.xlsx')).rejects.toThrow('Failed to parse');
    });
  });

  describe('sheet parsing', () => {
    it('parses recognized sheets', async () => {
      const buf = await buildWorkbook({
        'Brands': { headers: ['slug', 'name'], rows: [['dell', 'Dell']] },
        'Categories': { headers: ['slug', 'name'], rows: [['laptops', 'Laptops']] },
      });

      const result = await parser.parse(buf, 'test.xlsx');
      expect(result.sheets.size).toBe(2);
      expect(result.sheets.has('brands')).toBe(true);
      expect(result.sheets.has('categories')).toBe(true);
    });

    it('skips unrecognized sheets', async () => {
      const buf = await buildWorkbook({
        'Brands': { headers: ['slug', 'name'], rows: [['dell', 'Dell']] },
        'RandomSheet': { headers: ['a', 'b'], rows: [['1', '2']] },
      });

      const result = await parser.parse(buf, 'test.xlsx');
      expect(result.sheets.size).toBe(1);
      expect(result.sheetNames).toContain('RandomSheet');
    });

    it('detects README sheet', async () => {
      const buf = await buildWorkbook({
        'README': { headers: ['info'], rows: [['instructions']] },
        'Brands': { headers: ['slug', 'name'], rows: [['dell', 'Dell']] },
      });

      const result = await parser.parse(buf, 'test.xlsx');
      expect(result.hasReadme).toBe(true);
    });

    it('rejects workbooks with no recognized sheets', async () => {
      const buf = await buildWorkbook({
        'Random': { headers: ['a'], rows: [['1']] },
      });

      await expect(parser.parse(buf, 'test.xlsx')).rejects.toThrow('No recognized worksheets');
    });

    it('skips empty sheets (header only)', async () => {
      const buf = await buildWorkbook({
        'Brands': { headers: ['slug', 'name'], rows: [] },
        'Categories': { headers: ['slug', 'name'], rows: [['laptops', 'Laptops']] },
      });

      const result = await parser.parse(buf, 'test.xlsx');
      expect(result.sheets.has('categories')).toBe(true);
      // brands sheet has no data rows, so it's skipped
      expect(result.sheets.has('brands')).toBe(false);
    });

    it('rejects duplicate headers', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Brands');
      ws.addRow(['slug', 'name', 'slug']); // duplicate 'slug'
      ws.addRow(['dell', 'Dell', 'extra']);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());

      await expect(parser.parse(buf, 'test.xlsx')).rejects.toThrow('Duplicate header');
    });
  });

  describe('cell value handling', () => {
    it('handles null/empty cells', async () => {
      const buf = await buildWorkbook({
        'Brands': { headers: ['slug', 'name', 'description'], rows: [['dell', 'Dell', null as any]] },
      });

      const result = await parser.parse(buf, 'test.xlsx');
      const sheet = result.sheets.get('brands')!;
      expect(sheet.rows[0]!['description']).toBeNull();
    });

    it('converts numbers to strings', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Brands');
      ws.addRow(['slug', 'name']);
      ws.addRow(['dell', 12345 as any]); // number instead of string
      const buf = Buffer.from(await wb.xlsx.writeBuffer());

      const result = await parser.parse(buf, 'test.xlsx');
      expect(result.sheets.get('brands')!.rows[0]!['name']).toBe('12345');
    });

    it('tracks row numbers', async () => {
      const buf = await buildWorkbook({
        'Brands': { headers: ['slug', 'name'], rows: [['dell', 'Dell'], ['hp', 'HP']] },
      });

      const result = await parser.parse(buf, 'test.xlsx');
      const rows = result.sheets.get('brands')!.rows;
      expect(rows[0]!['__row_number']).toBe('2');
      expect(rows[1]!['__row_number']).toBe('3');
    });
  });

  describe('SHEET_ENTITY_MAP', () => {
    it('maps all expected sheets', () => {
      expect(SHEET_ENTITY_MAP['Categories']).toBe('categories');
      expect(SHEET_ENTITY_MAP['Brands']).toBe('brands');
      expect(SHEET_ENTITY_MAP['Products']).toBe('products');
      expect(SHEET_ENTITY_MAP['Variants']).toBe('variants');
      expect(SHEET_ENTITY_MAP['Attributes']).toBe('attributes');
    });
  });
});
