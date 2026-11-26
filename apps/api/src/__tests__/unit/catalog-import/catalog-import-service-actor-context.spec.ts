import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogImportService } from '../../../modules/catalog-import/catalog-import.service';

describe('CatalogImportService actor validation', () => {
  it.each([
    { label: 'missing caller', caller: undefined },
    { label: 'missing subject', caller: { role: 'ADMIN' } },
    { label: 'blank subject', caller: { sub: ' ', role: 'ADMIN' } },
    { label: 'missing role', caller: { sub: 'admin-user' } },
    { label: 'blank role', caller: { sub: 'admin-user', role: ' ' } },
  ])('rejects $label before uploading the workbook', async ({ caller }) => {
    const withActorContext = vi.fn();
    const putObject = vi.fn();
    const service = new CatalogImportService(
      { withActorContext } as any,
      { putObject } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.upload(
        {
          buffer: Buffer.from('workbook'),
          originalName: 'catalog.xlsx',
          size: 8,
        },
        caller as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(putObject).not.toHaveBeenCalled();
    expect(withActorContext).not.toHaveBeenCalled();
  });
});
