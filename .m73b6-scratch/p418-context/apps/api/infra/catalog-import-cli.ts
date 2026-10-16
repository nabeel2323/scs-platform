/**
 * Catalog Import CLI — validate workbooks and generate templates from the command line.
 *
 * Usage:
 *   tsx infra/catalog-import-cli.ts --validate --file path/to/workbook.xlsx
 *   tsx infra/catalog-import-cli.ts --template --type full --output template.xlsx
 */

import ExcelJS from 'exceljs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    validate: { type: 'boolean', default: false },
    template: { type: 'boolean', default: false },
    file: { type: 'string' },
    type: { type: 'string', default: 'full' },
    output: { type: 'string', default: 'catalog-template.xlsx' },
  },
});

async function main(): Promise<void> {
  if (args.validate) {
    await runValidate();
  } else if (args.template) {
    await runTemplate();
  } else {
    console.log(`
Catalog Import CLI

Commands:
  --validate --file <path>    Validate an XLSX workbook without importing
  --template --type <type>    Generate a blank import template
                              Types: full, products, categories, brands, attributes, product-types
                              Default: full
    --output <path>           Output file path (default: catalog-template.xlsx)
`);
  }
}

async function runValidate(): Promise<void> {
  const filePath = args.file;
  if (!filePath) {
    console.error('Error: --file is required for --validate');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  console.log(`Validating: ${absPath}`);

  const buffer = await readFile(absPath);
  console.log(`File size: ${(buffer.length / 1024).toFixed(1)} KB`);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (err) {
    console.error(`Failed to parse Excel: ${err instanceof Error ? err.message : 'Unknown error'}`);
    process.exit(1);
  }

  console.log(`\nWorksheets found: ${workbook.worksheets.length}`);
  for (const ws of workbook.worksheets) {
    const rowCount = ws.rowCount;
    const colCount = ws.columnCount;
    console.log(`  - "${ws.name}": ${rowCount} rows × ${colCount} columns`);

    if (rowCount >= 1) {
      const headerRow = ws.getRow(1);
      const headers: string[] = [];
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const val = String(cell.value ?? '').trim();
        if (val) headers[colNumber - 1] = val;
      });
      const clean = headers.filter(Boolean);
      if (clean.length > 0) {
        console.log(`    Headers: ${clean.join(', ')}`);
      }
    }
  }

  // Basic validation summary
  const SHEET_ENTITY_MAP: Record<string, string> = {
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

  let totalDataRows = 0;
  let recognizedSheets = 0;
  for (const ws of workbook.worksheets) {
    if (SHEET_ENTITY_MAP[ws.name]) {
      recognizedSheets++;
      totalDataRows += Math.max(0, ws.rowCount - 1);
    }
  }

  console.log(`\nValidation Summary:`);
  console.log(`  Recognized sheets: ${recognizedSheets}`);
  console.log(`  Total data rows: ${totalDataRows}`);
  console.log(`  File size OK: ${buffer.length <= 25 * 1024 * 1024 ? 'YES' : 'NO (exceeds 25 MB limit)'}`);

  if (recognizedSheets === 0) {
    console.log('\n  WARNING: No recognized sheets found.');
    console.log('  Expected sheet names: ' + Object.keys(SHEET_ENTITY_MAP).join(', '));
  }

  console.log('\nValidation complete. Full server-side validation runs on upload.');
}

async function runTemplate(): Promise<void> {
  const type = args.type ?? 'full';
  const output = args.output ?? 'catalog-template.xlsx';

  console.log(`Generating template: type=${type}, output=${output}`);

  // Generate a minimal template without DB connection
  const SHEET_HEADERS: Record<string, string[]> = {
    Categories: ['slug', 'name', 'name_ar', 'description', 'parent_slug', 'sort_order'],
    Brands: ['slug', 'name', 'name_ar', 'description'],
    'Attribute Groups': ['name', 'name_ar', 'kind'],
    Attributes: ['code', 'name', 'name_ar', 'description', 'type', 'scope', 'unit', 'validation'],
    'Attribute Options': ['attribute_code', 'value', 'value_ar', 'label', 'sort_order'],
    'Product Types': ['code', 'name', 'name_ar', 'description', 'category_slug', 'variant_dimensions'],
    'Product Type Attributes': ['product_type_code', 'attribute_code', 'group_name', 'required', 'scope', 'display_order', 'filterable', 'searchable', 'visible_in_listing', 'visible_in_detail'],
    Products: ['slug', 'title', 'title_ar', 'description', 'description_ar', 'brand_slug', 'product_type_code', 'category_slug', 'mpn', 'gtin', 'ean', 'condition', 'status'],
    'Product Attributes': ['product_slug', 'attribute_code', 'value_text', 'value_number', 'value_boolean', 'option_key'],
    Variants: ['product_slug', 'sku', 'title', 'title_ar', 'barcode', 'unit', 'weight_grams'],
    'Variant Attributes': ['variant_sku', 'attribute_code', 'value_text', 'value_number', 'value_boolean', 'option_key'],
    Sources: ['product_slug', 'source_type', 'source_url', 'verified_at'],
  };

  const HEADER_STYLE: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F3340' } },
    alignment: { horizontal: 'left', vertical: 'middle' },
    border: { bottom: { style: 'thin', color: { argb: 'FF38BDF8' } } },
  };

  const sheetOrder = type === 'full'
    ? Object.keys(SHEET_HEADERS)
    : getSheetsForType(type);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SCS Platform (CLI)';
  workbook.created = new Date();

  // README sheet
  const readme = workbook.addWorksheet('README');
  readme.columns = [{ width: 80 }];
  const readmeRows = [
    ['SCS Catalog Import Template'],
    [''],
    ['Instructions:'],
    ['1. Fill in each sheet with your catalog data'],
    ['2. Use lowercase slugs with hyphens (e.g. "business-laptops")'],
    ['3. Attribute codes must be snake_case (e.g. "battery_life")'],
    ['4. Save as .xlsx (not .xls or .xlsm)'],
    ['5. Maximum file size: 25 MB'],
    [''],
    [`Generated: ${new Date().toISOString()}`],
  ];
  for (const row of readmeRows) {
    readme.addRow(row);
  }
  readme.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FF0F3340' } };

  // Entity sheets
  for (const sheetName of sheetOrder) {
    const headers = SHEET_HEADERS[sheetName];
    if (!headers) continue;
    const sheet = workbook.addWorksheet(sheetName);
    const headerRow = sheet.addRow(headers.map(h => h.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())));
    headerRow.eachCell((cell) => {
      Object.assign(cell, { style: { ...HEADER_STYLE } });
    });
    sheet.columns = headers.map(() => ({ width: 22 }));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const absOutput = path.resolve(output);
  await writeFile(absOutput, Buffer.from(buffer));
  console.log(`Template written to: ${absOutput}`);
}

function getSheetsForType(type: string): string[] {
  switch (type) {
    case 'products': return ['Products', 'Product Attributes', 'Variants', 'Variant Attributes', 'Sources'];
    case 'categories': return ['Categories'];
    case 'brands': return ['Brands'];
    case 'attributes': return ['Attribute Groups', 'Attributes', 'Attribute Options'];
    case 'product-types': return ['Product Types', 'Product Type Attributes'];
    default: return Object.keys({
      Categories: 1, Brands: 1, 'Attribute Groups': 1, Attributes: 1,
      'Attribute Options': 1, 'Product Types': 1, 'Product Type Attributes': 1,
      Products: 1, 'Product Attributes': 1, Variants: 1,
      'Variant Attributes': 1, Sources: 1,
    });
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
