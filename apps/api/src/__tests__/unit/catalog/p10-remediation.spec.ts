/**
 * P10 Remediation — Unit tests for the web ↔ backend integration fixes.
 *
 * Covers the genuine defects surfaced by the browser E2E and their repair:
 * - R2: buildSuggestedMapping (header normalization + attr passthrough)
 * - R1: uploadImportFile (server-derived storageKey, type/size guards,
 *       XLSX header detection + suggested mapping persistence)
 * - R2: updateImportMapping (required-target guard + UPLOADED→MAPPING)
 * - R1: previewImportJob → structured FILE_NOT_UPLOADED (never an opaque 500)
 * - R3: previewImportJob CSV → reads staged rows and returns REAL counts
 *
 * These run without Docker: db / redis / storage are stubbed, while the real
 * MerchantXlsxParserService and ImportValidationService are exercised.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import ExcelJS from 'exceljs';
import { CatalogService } from '../../../modules/catalog/catalog.service';
import { MerchantXlsxParserService } from '../../../modules/catalog/merchant-xlsx-parser.service';
import { ImportValidationService } from '../../../modules/catalog/import-validation.service';

async function buildXlsx(
  headers: string[],
  dataRows: (string | number | null)[][],
  sheetName = 'Products',
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  for (const row of dataRows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Minimal validation-DB stub (no categories/brands/attrs → warnings only). */
function makeMockValidationDb() {
  const thenable = (rows: any[]) => ({ then: (r: (v: any) => any) => r(rows) });
  return {
    db: {
      select: () => ({
        from: () => ({
          then: (r: any) => r([]),
          where: () => ({ then: (r: any) => r([]) }),
        }),
      }),
    },
  } as any;
}

interface JobOpts {
  id?: string;
  storeId?: string;
  fileName?: string;
  fileType?: string;
  columnMapping?: Record<string, string>;
  storageKey?: string;
  status?: string;
  fileSize?: number;
}

function makeService(opts: {
  job?: JobOpts | null;
  exists?: boolean;
  getObjectBuffer?: Buffer;
  redisBatches?: string[];
} = {}) {
  const job: any = opts.job === null ? null : {
    id: opts.job?.id ?? 'job-1',
    storeId: opts.job?.storeId ?? 'store-1',
    fileName: opts.job?.fileName ?? 'valid.xlsx',
    fileType: opts.job?.fileType ?? 'XLSX',
    columnMapping: opts.job?.columnMapping ?? {},
    storageKey: opts.job?.storageKey ?? 'imports/store-1/job-1/valid.xlsx',
    status: opts.job?.status ?? 'UPLOADED',
    fileSize: opts.job?.fileSize ?? 0,
  };

  const updated: any[] = [];
  const db = {
    db: {
      query: { importJobs: { findFirst: async () => job } },
      update: () => ({
        set: (v: any) => {
          updated.push(v);
          Object.assign(job, v); // emulate the persisted state for re-reads
          return { where: async () => {} };
        },
      }),
    },
  };

  const redis = {
    client: {
      lrange: async () => opts.redisBatches ?? [],
      llen: async () => 0,
      del: async () => {},
      rpush: async () => {},
      expire: async () => {},
    },
  };

  const storage = {
    putObject: vi.fn(async () => ({ bucket: 'scs-uploads', key: job.storageKey })),
    exists: vi.fn(async () => opts.exists ?? false),
    getObject: vi.fn(async () => ({ Body: opts.getObjectBuffer })),
  };

  const parser = new MerchantXlsxParserService();
  const validation = new ImportValidationService(makeMockValidationDb());

  const svc = new CatalogService(
    db as any,
    redis as any,
    {} as any,
    storage as any,
    {} as any,
    {} as any,
    {} as any,
    parser,
    validation,
    {} as any, // governance
  );

  return { svc, storage, job, updated };
}

describe('P10 Remediation — buildSuggestedMapping (R2)', () => {
  it('maps standard fields by normalized header and passes attr: columns through', () => {
    const { svc } = makeService();
    const headers = [
      'name', 'sku', 'priceminor', 'unit', 'category', 'brand', 'moq',
      'attr:ram_gb', 'attr:storage_gb',
    ];
    const m = svc.buildSuggestedMapping(headers);
    expect(m['name']).toBe('name');
    expect(m['sku']).toBe('sku');
    expect(m['priceMinor']).toBe('priceminor');
    expect(m['unit']).toBe('unit');
    expect(m['moq']).toBe('moq');
    // Typed attributes must be preserved with the attr:<code> representation.
    expect(m['attr:ram_gb']).toBe('attr:ram_gb');
    expect(m['attr:storage_gb']).toBe('attr:storage_gb');
  });

  it('matches case- and spacing-insensitively', () => {
    const { svc } = makeService();
    const m = svc.buildSuggestedMapping(['Product Name', 'Price Minor', 'SKU']);
    expect(m['sku']).toBe('SKU');
    expect(m['priceMinor']).toBe('Price Minor');
  });
});

describe('P10 Remediation — uploadImportFile (R1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists bytes to the SERVER-derived storageKey and returns detected headers + mapping', async () => {
    const buffer = await buildXlsx(
      ['name', 'sku', 'priceMinor', 'unit', 'category', 'brand', 'moq'],
      [['Widget', 'WS-1', 1050, 'PCS', 'Electronics', 'Acme', 5]],
    );
    const { svc, storage, job } = makeService({
      job: { fileType: 'XLSX', fileName: 'valid.xlsx', columnMapping: {} },
    });

    const res = await svc.uploadImportFile(job.id, buffer, 'application/octet-stream');

    // putObject must target the persisted job.storageKey — never a client key.
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: job.storageKey, body: buffer }),
    );
    expect(res.detectedHeaders).toEqual(
      expect.arrayContaining(['name', 'sku', 'priceminor', 'unit', 'category', 'brand', 'moq']),
    );
    expect(res.columnMapping['name']).toBeTruthy();
    expect(res.columnMapping['priceMinor']).toBe('priceminor');
  });

  it('does NOT clobber an existing explicit mapping on re-upload', async () => {
    const buffer = await buildXlsx(['name', 'sku', 'priceMinor'], [['A', 'S1', 100]]);
    const explicit = { name: 'name', sku: 'sku', priceMinor: 'priceMinor' };
    const { svc, job } = makeService({ job: { fileType: 'XLSX', columnMapping: explicit } });
    const res = await svc.uploadImportFile(job.id, buffer);
    expect(res.columnMapping).toEqual(explicit);
  });

  it('rejects an empty file with a structured error (never 500)', async () => {
    const { svc, storage, job } = makeService({ job: { fileType: 'XLSX' } });
    await expect(svc.uploadImportFile(job.id, Buffer.alloc(0))).rejects.toThrow('EMPTY_FILE');
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('rejects files larger than 25 MB', async () => {
    const { svc, storage, job } = makeService({ job: { fileType: 'XLSX' } });
    const big = Buffer.alloc(26 * 1024 * 1024, 1);
    await expect(svc.uploadImportFile(job.id, big)).rejects.toThrow('FILE_TOO_LARGE');
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('rejects unsupported file types', async () => {
    const { svc, job } = makeService({ job: { fileName: 'payload.exe' } });
    await expect(svc.uploadImportFile(job.id, Buffer.from('x'))).rejects.toThrow('UNSUPPORTED_FILE_TYPE');
  });

  it('stores a CSV upload without server-side header detection', async () => {
    const { svc, storage, job } = makeService({ job: { fileType: 'CSV', fileName: 'valid.csv' } });
    const res = await svc.uploadImportFile(job.id, Buffer.from('name,sku,priceMinor\nA,S1,100\n'));
    expect(storage.putObject).toHaveBeenCalled();
    expect(res.detectedHeaders).toEqual([]);
    expect(res.fileType).toBe('CSV');
  });
});

describe('P10 Remediation — updateImportMapping (R2)', () => {
  it('rejects a mapping missing required targets', async () => {
    const { svc, job } = makeService({ job: { status: 'UPLOADED' } });
    await expect(svc.updateImportMapping(job.id, { name: 'name' })).rejects.toThrow('name, sku, priceMinor');
  });

  it('persists a valid mapping and advances UPLOADED → MAPPING', async () => {
    const { svc, job, updated } = makeService({ job: { status: 'UPLOADED' } });
    const mapping = { name: 'name', sku: 'sku', priceMinor: 'priceminor' };
    await svc.updateImportMapping(job.id, mapping);
    expect(updated.some((u) => u.status === 'MAPPING')).toBe(true);
    expect(updated.some((u) => u.columnMapping === mapping)).toBe(true);
  });
});

describe('P10 Remediation — previewImportJob (R1 + R3)', () => {
  it('yields a structured FILE_NOT_UPLOADED instead of an opaque 500 for a missing XLSX object', async () => {
    const { svc, job } = makeService({
      job: { fileType: 'XLSX', status: 'MAPPING', columnMapping: { name: 'name', sku: 'sku', priceMinor: 'priceminor' } },
      exists: false,
    });
    await expect(svc.previewImportJob(job.id)).rejects.toThrow('FILE_NOT_UPLOADED');
  });

  it('reads staged CSV rows BEFORE preview and returns real counts', async () => {
    const rows = [
      { name: 'Widget', sku: 'WS-1', priceMinor: '1050', unit: 'PCS' },
      { name: '', sku: 'WS-2', priceMinor: '50' }, // missing name → ERROR
    ];
    const { svc, job } = makeService({
      job: {
        fileType: 'CSV',
        status: 'READY',
        columnMapping: { name: 'name', sku: 'sku', priceMinor: 'priceMinor', unit: 'unit' },
      },
      redisBatches: [JSON.stringify(rows)],
    });

    const preview: any = await svc.previewImportJob(job.id);
    expect(preview.totalRows).toBe(2);
    expect(preview.errorCount).toBe(1); // ERROR severity only
    expect(preview.validRows).toBe(1);
    expect(preview.errors[0]).toMatchObject({ severity: 'ERROR', field: 'name' });
  });
});
