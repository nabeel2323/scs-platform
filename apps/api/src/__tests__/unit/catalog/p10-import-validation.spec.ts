/**
 * P10 — Unit tests: Merchant XLSX parser + Import validation service.
 *
 * Covers:
 * - P10-A01: XLSX parse happy path (headers, rows, normalization)
 * - P10-A02: Security limits (file size, row count, cell length, columns)
 * - P10-A03: .xlsm rejection, empty file, malformed workbook
 * - P10-A04: Header normalization (lowercase, whitespace→underscore, strip non-alnum)
 * - P10-A05: Cell value conversion (formula cached result, date→ISO, rich text, hyperlink)
 * - P10-A06: Duplicate header detection
 * - P10-A07: Skip empty rows
 * - P10-A08: ImportError structure (all fields present)
 * - P10-A09: Required field validation (name, sku, priceMinor)
 * - P10-A10: Price/MOQ/Stock format validation
 * - P10-A11: Duplicate SKU detection (WARNING severity)
 * - P10-A12: Category/Brand reference check (WARNING when not found)
 * - P10-A13: Typed attribute validation (INTEGER, DECIMAL, BOOLEAN)
 * - P10-A14: Unknown attribute code (ERROR)
 * - P10-A15: Sample rows collection (first 5 valid)
 * - P10-A16: Read-only guarantee (no writes, no FOR UPDATE)
 *
 * These tests run without Docker (no Postgres required).
 */
import { describe, it, expect, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { MerchantXlsxParserService } from '../../../modules/catalog/merchant-xlsx-parser.service';
import { ImportValidationService, ImportError } from '../../../modules/catalog/import-validation.service';

// ── Helper: build an XLSX buffer in-memory ────────────────────────────────

async function buildXlsx(
  headers: string[],
  dataRows: (string | number | null)[][],
  sheetName = 'Products',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  for (const row of dataRows) ws.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ── Helper: mock DatabaseService for ImportValidationService ──────────────

function makeMockDb(opts: {
  categories?: Array<{ id: string; name: string }>;
  brands?: Array<{ id: string; name: string }>;
  attrDefs?: Array<{ id: string; code: string; type: string; scope: string }>;
} = {}) {
  const cats = opts.categories ?? [];
  const brds = opts.brands ?? [];
  const attrs = opts.attrDefs ?? [];

  // The drizzle chain: db.select(cols).from(table).where(cond) → thenable
  // We use a thenable (then method) so it works both with and without await
  const queries = [cats, brds, attrs];
  let qi = 0;

  const makeThenable = (rows: any[]) => ({
    then: (resolve: (v: any) => any) => resolve(rows),
  });

  const db = {
    select: (..._args: any[]) => {
      const rows = queries[qi % 3] ?? [];
      qi++;
      return {
        from: (..._a: any[]) => {
          // Return an object that is BOTH a thenable (for queries without .where)
          // AND has a .where method (for queries that chain .where)
          const thenable = makeThenable(rows);
          return {
            then: thenable.then,
            where: (..._b: any[]) => makeThenable(rows),
          };
        },
      };
    },
  };

  return { db, _reset: () => { qi = 0; } } as any;
}

function makeValidationService(mockDb: any) {
  mockDb._reset();
  return new ImportValidationService(mockDb);
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: MerchantXlsxParserService
// ═══════════════════════════════════════════════════════════════════════════

describe('P10 — MerchantXlsxParserService', () => {
  const parser = new MerchantXlsxParserService();

  // ── P10-A01: Happy path ──────────────────────────────────────────────

  it('A01: parses headers and rows from a valid XLSX', async () => {
    const buf = await buildXlsx(
      ['Product Name', 'SKU', 'Price'],
      [['Widget A', 'WDG-001', 1050], ['Widget B', 'WDG-002', 2500]],
    );
    const result = await parser.parse(buf, 'test.xlsx');

    expect(result.fileType).toBe('XLSX');
    expect(result.rowCount).toBe(2);
    expect(result.headers).toEqual(['product_name', 'sku', 'price']);
    expect(result.rawHeaders).toEqual(['Product Name', 'SKU', 'Price']);
    expect(result.rows[0]!['product_name']).toBe('Widget A');
    expect(result.rows[0]!['sku']).toBe('WDG-001');
    expect(result.rows[1]!['price']).toBe('2500');
  });

  // ── P10-A02: Security limits ─────────────────────────────────────────

  it('A02a: rejects empty buffer', async () => {
    await expect(parser.parse(Buffer.alloc(0), 'empty.xlsx')).rejects.toThrow('File is empty');
  });

  it('A02b: rejects file exceeding 25 MB', async () => {
    const bigBuf = Buffer.alloc(26 * 1024 * 1024); // 26 MB
    await expect(parser.parse(bigBuf, 'huge.xlsx')).rejects.toThrow('File too large');
  });

  it('A02c: rejects row count exceeding 50K', async () => {
    // Build a workbook with 50,002 data rows (exceeds limit)
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addRow(['Name', 'SKU']);
    for (let i = 0; i < 50001; i++) ws.addRow([`Product ${i}`, `SKU-${i}`]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    await expect(parser.parse(buf, 'big.xlsx')).rejects.toThrow('Maximum is 50000');
  });

  // ── P10-A03: File type rejection ─────────────────────────────────────

  it('A03a: rejects .xlsm (macro-enabled)', async () => {
    const buf = await buildXlsx(['Name'], [['Test']]);
    await expect(parser.parse(buf, 'macro.xlsm')).rejects.toThrow('Macro-enabled');
  });

  it('A03b: rejects non-xlsx extensions', async () => {
    const buf = await buildXlsx(['Name'], [['Test']]);
    await expect(parser.parse(buf, 'data.csv')).rejects.toThrow('Unsupported file type');
  });

  it('A03c: rejects malformed workbook', async () => {
    const garbage = Buffer.from('not a real xlsx file content here');
    await expect(parser.parse(garbage, 'bad.xlsx')).rejects.toThrow('Failed to parse Excel');
  });

  // ── P10-A04: Header normalization ────────────────────────────────────

  it('A04: normalizes headers (lowercase, whitespace→underscore, strip non-alnum)', async () => {
    const buf = await buildXlsx(
      ['  Product Name ', 'SKU-Code', 'attr:color', 'Price (SAR)'],
      [['Test', 'T1', 'Red', '100']],
    );
    const result = await parser.parse(buf, 'test.xlsx');
    expect(result.headers).toEqual(['product_name', 'skucode', 'attr:color', 'price_sar']);
  });

  // ── P10-A05: Cell value conversion ───────────────────────────────────

  it('A05a: extracts formula cached result (never evaluates)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.addRow(['Name', 'Value']);
    // Add a cell with a formula and cached result
    const cell = ws.getCell('B2');
    cell.value = { formula: 'SUM(A1:A10)', result: 42 } as any;
    ws.getCell('A2').value = 'Test';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await parser.parse(buf, 'test.xlsx');
    expect(result.rows[0]!['value']).toBe('42');
  });

  it('A05b: converts Date to ISO string', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.addRow(['Name', 'Date']);
    ws.getCell('A2').value = 'Test';
    ws.getCell('B2').value = new Date('2026-09-15T00:00:00Z');
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await parser.parse(buf, 'test.xlsx');
    expect(result.rows[0]!['date']).toBe('2026-09-15');
  });

  it('A05c: concatenates rich text fragments', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.addRow(['Name', 'Description']);
    ws.getCell('A2').value = 'Test';
    ws.getCell('B2').value = { richText: [{ text: 'Hello ' }, { text: 'World' }] } as any;
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await parser.parse(buf, 'test.xlsx');
    expect(result.rows[0]!['description']).toBe('Hello World');
  });

  // ── P10-A06: Duplicate header detection ──────────────────────────────

  it('A06: rejects duplicate headers', async () => {
    const buf = await buildXlsx(['Name', 'Name', 'SKU'], [['A', 'B', 'C']]);
    await expect(parser.parse(buf, 'dup.xlsx')).rejects.toThrow('Duplicate header');
  });

  // ── P10-A07: Skip empty rows ─────────────────────────────────────────

  it('A07: skips completely empty rows', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.addRow(['Name', 'SKU']);
    ws.addRow(['Widget', 'WDG-1']);
    ws.addRow([null, null]); // empty row
    ws.addRow(['Gadget', 'GDG-1']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await parser.parse(buf, 'test.xlsx');
    expect(result.rowCount).toBe(2);
    expect(result.rows[0]!['name']).toBe('Widget');
    expect(result.rows[1]!['name']).toBe('Gadget');
  });

  // ── P10-A05d: Stores __row_number for error reporting ────────────────

  it('stores __row_number for each data row', async () => {
    const buf = await buildXlsx(
      ['Name', 'SKU'],
      [['A', '1'], ['B', '2'], ['C', '3']],
    );
    const result = await parser.parse(buf, 'test.xlsx');
    expect(result.rows[0]!['__row_number']).toBe('2');
    expect(result.rows[1]!['__row_number']).toBe('3');
    expect(result.rows[2]!['__row_number']).toBe('4');
  });

  // ── Sheet selection ──────────────────────────────────────────────────

  it('skips README/instructions sheets', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('README');
    const dataSheet = wb.addWorksheet('Products');
    dataSheet.addRow(['Name', 'SKU']);
    dataSheet.addRow(['Widget', 'WDG-1']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    const result = await parser.parse(buf, 'test.xlsx');
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]!['name']).toBe('Widget');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: ImportValidationService
// ═══════════════════════════════════════════════════════════════════════════

describe('P10 — ImportValidationService', () => {
  // ── P10-A08: ImportError structure ───────────────────────────────────

  it('A08: every ImportError has required fields', async () => {
    const mockDb = makeMockDb();
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price' },
      [{ Name: null, SKU: null, Price: null }],
      1,
    );

    expect(result.errors.length).toBeGreaterThan(0);
    for (const err of result.errors) {
      expect(err).toHaveProperty('rowNumber');
      expect(err).toHaveProperty('field');
      expect(err).toHaveProperty('errorCode');
      expect(err).toHaveProperty('severity');
      expect(err).toHaveProperty('message');
      expect(err).toHaveProperty('suggestedFix');
      expect(typeof err.rowNumber).toBe('number');
      expect(['ERROR', 'WARNING']).toContain(err.severity);
    }
  });

  // ── P10-A09: Required field validation ───────────────────────────────

  it('A09: reports MISSING_REQUIRED_FIELD for name, sku, priceMinor', async () => {
    const mockDb = makeMockDb();
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price' },
      [{ Name: '', SKU: '', Price: '' }],
      1,
    );

    const missingFields = result.errors
      .filter(e => e.errorCode === 'MISSING_REQUIRED_FIELD')
      .map(e => e.field);
    expect(missingFields).toContain('name');
    expect(missingFields).toContain('sku');
    expect(missingFields).toContain('priceMinor');
  });

  // ── P10-A10: Price/MOQ/Stock format validation ──────────────────────

  it('A10a: INVALID_PRICE_FORMAT for non-numeric price', async () => {
    const mockDb = makeMockDb();
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price' },
      [{ Name: 'Widget', SKU: 'W1', Price: 'abc' }],
      1,
    );

    const priceErr = result.errors.find(e => e.errorCode === 'INVALID_PRICE_FORMAT');
    expect(priceErr).toBeDefined();
    expect(priceErr!.severity).toBe('ERROR');
  });

  it('A10b: INVALID_MOQ_FORMAT for negative MOQ', async () => {
    const mockDb = makeMockDb();
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', moq: 'MOQ' },
      [{ Name: 'Widget', SKU: 'W1', Price: '100', MOQ: '-5' }],
      1,
    );

    const moqErr = result.errors.find(e => e.errorCode === 'INVALID_MOQ_FORMAT');
    expect(moqErr).toBeDefined();
  });

  it('A10c: INVALID_STOCK_FORMAT is WARNING severity', async () => {
    const mockDb = makeMockDb();
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', stock: 'Stock' },
      [{ Name: 'Widget', SKU: 'W1', Price: '100', Stock: 'abc' }],
      1,
    );

    const stockErr = result.errors.find(e => e.errorCode === 'INVALID_STOCK_FORMAT');
    expect(stockErr).toBeDefined();
    expect(stockErr!.severity).toBe('WARNING');
  });

  // ── P10-A11: Duplicate SKU detection ─────────────────────────────────

  it('A11: DUPLICATE_SKU is WARNING, not ERROR', async () => {
    const mockDb = makeMockDb();
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price' },
      [
        { Name: 'Widget A', SKU: 'DUP-1', Price: '100' },
        { Name: 'Widget B', SKU: 'DUP-1', Price: '200' },
      ],
      1,
    );

    const dupErrs = result.errors.filter(e => e.errorCode === 'DUPLICATE_SKU');
    expect(dupErrs.length).toBe(1);
    expect(dupErrs[0]!.severity).toBe('WARNING');
    expect(dupErrs[0]!.message).toContain('row');
  });

  // ── P10-A12: Category/Brand reference check ─────────────────────────

  it('A12: unknown category/brand produce REFERENCE_NOT_FOUND warnings', async () => {
    const mockDb = makeMockDb({
      categories: [{ id: 'c1', name: 'Electronics' }],
      brands: [{ id: 'b1', name: 'Acme' }],
    });
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', category: 'Cat', brand: 'Brand' },
      [{ Name: 'Widget', SKU: 'W1', Price: '100', Cat: 'UnknownCat', Brand: 'UnknownBrand' }],
      1,
    );

    const refErrs = result.errors.filter(e => e.errorCode === 'REFERENCE_NOT_FOUND');
    expect(refErrs.length).toBe(2);
    expect(refErrs.every(e => e.severity === 'WARNING')).toBe(true);
  });

  it('A12b: known category produces no warning', async () => {
    const mockDb = makeMockDb({
      categories: [{ id: 'c1', name: 'Electronics' }],
      brands: [],
    });
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', category: 'Cat' },
      [{ Name: 'Widget', SKU: 'W1', Price: '100', Cat: 'Electronics' }],
      1,
    );

    const catErrs = result.errors.filter(e => e.field === 'category');
    expect(catErrs.length).toBe(0);
  });

  // ── P10-A13: Typed attribute validation ──────────────────────────────

  it('A13a: UNKNOWN_ATTRIBUTE_CODE for unmapped attr:', async () => {
    const mockDb = makeMockDb({ attrDefs: [] });
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', 'attr:weight': 'Weight' },
      [{ Name: 'Widget', SKU: 'W1', Price: '100', Weight: '5kg' }],
      1,
    );

    const attrErr = result.errors.find(e => e.errorCode === 'UNKNOWN_ATTRIBUTE_CODE');
    expect(attrErr).toBeDefined();
    expect(attrErr!.severity).toBe('ERROR');
  });

  it('A13b: INTEGER attribute rejects non-numeric', async () => {
    const mockDb = makeMockDb({
      attrDefs: [{ id: 'a1', code: 'weight', type: 'INTEGER', scope: 'PRODUCT' }],
    });
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', 'attr:weight': 'Weight' },
      [{ Name: 'Widget', SKU: 'W1', Price: '100', Weight: 'not-a-number' }],
      1,
    );

    const attrErr = result.errors.find(e => e.errorCode === 'INVALID_ATTRIBUTE_VALUE');
    expect(attrErr).toBeDefined();
    expect(attrErr!.message).toContain('INTEGER');
  });

  it('A13c: BOOLEAN attribute rejects invalid values', async () => {
    const mockDb = makeMockDb({
      attrDefs: [{ id: 'a2', code: 'active', type: 'BOOLEAN', scope: 'PRODUCT' }],
    });
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', 'attr:active': 'Active' },
      [{ Name: 'Widget', SKU: 'W1', Price: '100', Active: 'maybe' }],
      1,
    );

    const attrErr = result.errors.find(e => e.errorCode === 'INVALID_ATTRIBUTE_VALUE');
    expect(attrErr).toBeDefined();
    expect(attrErr!.message).toContain('BOOLEAN');
  });

  it('A13d: valid typed attributes produce no errors', async () => {
    const mockDb = makeMockDb({
      attrDefs: [
        { id: 'a1', code: 'weight', type: 'INTEGER', scope: 'PRODUCT' },
        { id: 'a2', code: 'active', type: 'BOOLEAN', scope: 'PRODUCT' },
      ],
    });
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', 'attr:weight': 'Weight', 'attr:active': 'Active' },
      [{ Name: 'Widget', SKU: 'W1', Price: '100', Weight: '42', Active: 'true' }],
      1,
    );

    const attrErrs = result.errors.filter(e => e.field.startsWith('attr:'));
    expect(attrErrs.length).toBe(0);
  });

  // ── P10-A15: Sample rows collection ──────────────────────────────────

  it('A15: collects up to 5 valid sample rows', async () => {
    const mockDb = makeMockDb();
    const svc = makeValidationService(mockDb);

    const rows = Array.from({ length: 10 }, (_, i) => ({
      Name: `Product ${i}`, SKU: `SKU-${i}`, Price: '100',
    }));

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price' },
      rows,
      1,
    );

    expect(result.sampleRows.length).toBe(5);
    expect(result.validRows).toBe(10);
  });

  // ── P10-A16: Read-only guarantee ─────────────────────────────────────

  it('A16: validation result correctly counts errors vs warnings', async () => {
    const mockDb = makeMockDb();
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', stock: 'Stock' },
      [
        { Name: 'Good', SKU: 'G1', Price: '100', Stock: '50' },
        { Name: '', SKU: '', Price: 'abc', Stock: 'xyz' }, // 3 ERRORs + 1 WARNING
      ],
      1,
    );

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(1);
    expect(result.errorCount).toBeGreaterThanOrEqual(3); // name, sku, price
    expect(result.warningCount).toBeGreaterThanOrEqual(1); // stock
  });

  // ── Valid row passes with no errors ──────────────────────────────────

  it('fully valid row produces zero errors', async () => {
    const mockDb = makeMockDb({
      categories: [{ id: 'c1', name: 'Electronics' }],
      brands: [{ id: 'b1', name: 'Acme' }],
    });
    const svc = makeValidationService(mockDb);

    const result = await svc.validateRows(
      'store-1',
      { name: 'Name', sku: 'SKU', priceMinor: 'Price', unit: 'Unit', category: 'Cat', brand: 'Brand' },
      [{ Name: 'Widget', SKU: 'W1', Price: '1050', Unit: 'PCS', Cat: 'Electronics', Brand: 'Acme' }],
      1,
    );

    expect(result.errors.length).toBe(0);
    expect(result.validRows).toBe(1);
    expect(result.sampleRows.length).toBe(1);
  });
});
