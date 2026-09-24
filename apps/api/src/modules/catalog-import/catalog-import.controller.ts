import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ParseUUIDPipe,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CatalogImportService } from './catalog-import.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RequirePermission, RequireRole, CurrentUser, JwtPayload } from '../../common/guards/current-user.decorator';

/**
 * Admin Catalog Import Center.
 *
 * All endpoints are gated by `catalog:imports:manage` permission and
 * ADMIN / SUPER_ADMIN role.  The pipeline is:
 *   upload → (auto-validate) → preview → execute → report
 */

@Controller('admin/catalog-imports')
@UseGuards(JwtAuthGuard, PermissionsGuard, RolesGuard)
export class CatalogImportController {
  private readonly logger = new Logger(CatalogImportController.name);

  constructor(private readonly importService: CatalogImportService) {}

  /**
   * POST /admin/catalog-imports/upload
   * Upload an XLSX workbook and auto-validate it.
   */
  @Post('upload')
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    fileFilter: (_req, file, cb) => {
      const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        || file.originalname.endsWith('.xlsx');
      if (ok) cb(null, true);
      else cb(new BadRequestException('Only .xlsx files are accepted'), false);
    },
  }))
  async upload(
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number; mimetype: string },
    @CurrentUser() user: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('File is required');
    this.logger.log(`Catalog import upload by ${user.sub}: ${file.originalname}`);
    return this.importService.upload(
      { buffer: file.buffer, originalName: file.originalname, size: file.size },
      user.sub,
    );
  }

  /**
   * GET /admin/catalog-imports
   * List import history.
   */
  @Get()
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  async list(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    return this.importService.listImports({
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      status,
    });
  }

  /**
   * GET /admin/catalog-imports/:id
   * Get import job detail.
   */
  @Get(':id')
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  async detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.importService.getImportDetail(id);
  }

  /**
   * GET /admin/catalog-imports/:id/preview
   * Get validation preview (plan summary + errors).
   */
  @Get(':id/preview')
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  async preview(@Param('id', ParseUUIDPipe) id: string) {
    return this.importService.getPreview(id);
  }

  /**
   * POST /admin/catalog-imports/:id/execute
   * Confirm and execute the validated import.
   */
  @Post(':id/execute')
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  async execute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.importService.execute(id, user.sub);
  }

  /**
   * GET /admin/catalog-imports/:id/errors
   * Get row-level validation/import errors.
   */
  @Get(':id/errors')
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  async errors(@Param('id', ParseUUIDPipe) id: string) {
    return this.importService.getErrors(id);
  }

  /**
   * GET /admin/catalog-imports/:id/report
   * Download error report as XLSX.
   */
  @Get(':id/report')
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  async report(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const buffer = await this.importService.downloadReport(id);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="import-report-${id}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  /**
   * GET /admin/catalog-imports/template/:type
   * Download a blank import template (full, products, categories, etc.).
   */
  @Get('template/:type')
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  async template(@Param('type') type: string, @Res() res: Response) {
    const validTypes = ['full', 'products', 'categories', 'brands', 'attributes', 'product-types'];
    if (!validTypes.includes(type)) {
      throw new BadRequestException(`Invalid template type "${type}". Allowed: ${validTypes.join(', ')}`);
    }
    const buffer = await this.importService.downloadTemplate(type);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="catalog-template-${type}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  /**
   * POST /admin/catalog-imports/export
   * Export the current catalog to XLSX.
   */
  @Post('export')
  @RequirePermission('catalog:imports:manage')
  @RequireRole('ADMIN', 'SUPER_ADMIN')
  async export(@Res() res: Response) {
    const buffer = await this.importService.exportCatalog();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="catalog-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }
}
