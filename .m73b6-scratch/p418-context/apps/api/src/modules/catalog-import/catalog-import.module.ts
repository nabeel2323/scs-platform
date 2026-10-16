import { Module } from '@nestjs/common';
import { CatalogImportController } from './catalog-import.controller';
import { CatalogImportService } from './catalog-import.service';
import { ExcelParserService } from './excel-parser.service';
import { ExcelValidatorService } from './excel-validator.service';
import { ExcelResolverService } from './excel-resolver.service';
import { ExcelPlannerService } from './excel-planner.service';
import { ExcelExecutorService } from './excel-executor.service';
import { TemplateGeneratorService } from './template-generator.service';
import { CatalogModule } from '../catalog/catalog.module';
import { AuditModule } from '../audit/audit.module';
import { StorageModule } from '../../common/storage/storage.module';
import { CatalogValidationService } from '../catalog/catalog.validation-service';

/**
 * Catalog Import module — admin-driven Excel imports for the canonical catalog.
 *
 * Pipeline: parse → validate → resolve → plan → preview → execute → report
 *
 * Imports CatalogModule for CatalogValidationService (shared validation logic)
 * and AuditModule for audit trail recording.
 */
@Module({
  imports: [CatalogModule, AuditModule, StorageModule],
  controllers: [CatalogImportController],
  providers: [
    CatalogImportService,
    ExcelParserService,
    ExcelValidatorService,
    ExcelResolverService,
    ExcelPlannerService,
    ExcelExecutorService,
    TemplateGeneratorService,
    CatalogValidationService,
  ],
})
export class CatalogImportModule {}
